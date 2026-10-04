"""HR -> IAM provisioning (docs/oxengl_hr_iam_provisioning_blueprint.md).

When an employee is registered, a background task provisions a native OxenGL login for them:

* the HR job title is mapped to a base RBAC role plus an ABAC constraint payload (section 2/3 of
  the blueprint, encoded in ``HR_TITLE_IAM_MATRIX``);
* a cryptographically secure temporary password is generated, hashed with the platform hasher
  (``backend.two_tier_auth.hash_password``, Argon2id) BEFORE any database write, and handed to a
  notifier in memory only;
* the ``res_users`` row is created tenant-scoped (``company_id``), flagged ``must_change_password``
  and linked to ``employees.user_id``;
* every outcome (provisioned / skipped / failed / fallback / privileged) is written to
  ``platform_audit_logs``. The plain-text password is never logged, audited, stored or returned.

The background entry point (``run_employee_user_provisioning``) receives only identifiers and a
plain-data audit context, and always opens its own short-lived session.
"""

from __future__ import annotations

import dataclasses
import logging
import secrets
import string
import uuid
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Callable, Mapping, Optional, Protocol

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend import models
from backend.app.domains.hr.audit import AuditContext, append_audit_from_context, build_audit_context
from backend.app.domains.hr.models import Employee
from backend.app.domains.iam.role_catalog import HR_PROVISIONED_ROLES

logger = logging.getLogger("oxengl.iam.provisioning")

FALLBACK_ROLE = "Employee_Self_Serve"
FALLBACK_CONSTRAINTS: Mapping[str, Any] = MappingProxyType({"hr_portal_only": True})

# 'Super_Admin' in the legacy ``res_users.role`` column is interpreted platform-wide by
# ``is_super_admin_authorized`` (cross-tenant). A tenant CEO must never receive that, so the
# blueprint role is kept verbatim in ``res_users.iam_role`` while the legacy ``role`` column gets the
# tenant-scoped executive equivalent. Every other blueprint role is written to both columns.
LEGACY_ROLE_OVERRIDES: Mapping[str, str] = MappingProxyType({"Super_Admin": "CEO"})
PRIVILEGED_IAM_ROLES = frozenset({"Super_Admin"})

# Blueprint section 3 schema; always present in the payload so consumers get a stable shape.
ABAC_DEFAULTS: Mapping[str, Any] = MappingProxyType({
    "approval_limit": 0,
    "shift_locked": False,
    "ip_restricted": False,
    "requires_mfa": False,
})


@dataclass(frozen=True)
class TitleMapping:
    role: str
    constraints: Mapping[str, Any]


def _m(role: str, **constraints: Any) -> TitleMapping:
    return TitleMapping(role=role, constraints=MappingProxyType(dict(constraints)))


# Blueprint section 2, verbatim. Keys are the blueprint titles.
HR_TITLE_IAM_MATRIX: Mapping[str, TitleMapping] = MappingProxyType({
    "Chief Executive Officer (CEO)": _m("Super_Admin", unrestricted_access=True, requires_mfa=True),
    "Chief Operating Officer (COO)": _m("Operations_Admin", fleet_override_auth=True),
    "Chief Financial Officer (CFO)": _m("Finance_Admin", master_ledger_auth=True, requires_mfa=True),
    "Chief Technology Officer (CTO)": _m("System_Admin", restrict_pii_view=True, api_key_auth=True),
    "General Manager": _m("General_Manager", geo_fence="KSA"),
    "Operations Manager": _m("Ops_Manager", approval_limit=100000, standard_hours=True),
    "Finance Manager": _m("Finance_Manager", approval_limit=500000, ip_restricted=True),
    "HR & Admin Manager": _m("HR_Manager", requires_mfa=True, unmasked_pii=True),
    "Fleet & Logistics Manager": _m("Fleet_Manager", approval_limit=50000),
    "Procurement Manager": _m("Procurement_Manager", approval_limit=100000, sod_block_self_approval=True),
    "Warehouse Supervisor": _m("Warehouse_Manager", max_stock_variance_percent=5, branch_locked=True),
    "Dispatch Supervisor": _m("Dispatch_Manager", shift_locked=True),
    "Senior Financial Accountant": _m("Finance_Editor", standard_hours=True),
    "Logistics Operations Specialist": _m("Ops_Editor", read_only_billing=True),
    "HR Generalist / Mandoob": _m("HR_Editor", ip_restricted=True),
    "Procurement Officer": _m("Procurement_Editor", approval_limit=0),
    "IT Support Specialist": _m("IT_Support", restrict_pii_view=True, restrict_financials=True),
    "Administrative Assistant": _m("Admin_Viewer", standard_hours=True),
    "Data Entry Clerk": _m("Data_Entry", standard_hours=True, ip_restricted=True),
    "Fleet Dispatcher": _m("Dispatch_Operator", shift_locked=True),
    "Heavy Vehicle Driver": _m("Field_Operator", device_fingerprint_required=True),
    "Light Vehicle Driver": _m("Field_Operator", device_fingerprint_required=True),
    "Warehouse Operator": _m("WMS_Operator", mac_address_locked=True, shift_locked=True),
    "Forklift Operator": _m("WMS_Operator", device_locked=True, read_only_valuation=True),
    "Maintenance Technician / Mechanic": _m("Maintenance_Operator", branch_locked=True),
    "Security Guard": _m("Security_Operator", location_coordinates_locked=True),
    "Office Boy / Tea Boy": _m("Employee_Self_Serve", hr_portal_only=True),
    "Cleaner / Janitor": _m("Employee_Self_Serve", hr_portal_only=True),
})

# The HR directory spells the Mandoob title out in full; the blueprint abbreviates it.
HR_TITLE_ALIASES: Mapping[str, str] = MappingProxyType({
    "HR Generalist / Government Relations Officer (Mandoob)": "HR Generalist / Mandoob",
})


@dataclass(frozen=True)
class ResolvedTitle:
    role: str
    constraints: Mapping[str, Any]
    matched: bool  # False => least-privilege fallback


def resolve_title(job_title: Optional[str]) -> ResolvedTitle:
    """Map an HR job title to its IAM role/constraints; unknown titles get least privilege."""
    title = " ".join((job_title or "").split())
    title = HR_TITLE_ALIASES.get(title, title)
    mapping = HR_TITLE_IAM_MATRIX.get(title)
    if mapping is None:
        return ResolvedTitle(FALLBACK_ROLE, FALLBACK_CONSTRAINTS, matched=False)
    return ResolvedTitle(mapping.role, mapping.constraints, matched=True)


def build_abac_context(job_title: Optional[str]) -> dict[str, Any]:
    """ABAC JSON payload for ``res_users.abac_context`` (blueprint section 3 + matrix flags)."""
    resolved = resolve_title(job_title)
    payload: dict[str, Any] = dict(ABAC_DEFAULTS)
    payload.update(resolved.constraints)
    payload["approval_limit"] = int(payload["approval_limit"])
    return payload


# ------------------------------------------------------------------------------
# Credentials
# ------------------------------------------------------------------------------

_PASSWORD_LENGTH = 20
_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_LOWER = "abcdefghijkmnopqrstuvwxyz"
_DIGITS = "23456789"
_SYMBOLS = "!@#$%^&*-_=+"


def generate_temporary_password(length: int = _PASSWORD_LENGTH) -> str:
    """CSPRNG temporary password containing every character class (ambiguous glyphs excluded)."""
    length = max(length, 14)
    alphabet = _UPPER + _LOWER + _DIGITS + _SYMBOLS
    chars = [secrets.choice(pool) for pool in (_UPPER, _LOWER, _DIGITS, _SYMBOLS)]
    chars += [secrets.choice(alphabet) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _default_hasher(password: str) -> str:
    # Lazy import: two_tier_auth requires JWT secrets at import time.
    from backend.two_tier_auth import hash_password

    return hash_password(password)


def normalize_mobile(raw: Optional[str]) -> Optional[str]:
    """Normalise a mobile number to a compact login identifier (KSA local forms -> +966)."""
    if not raw:
        return None
    compact = "".join(ch for ch in raw.strip() if ch.isdigit() or ch == "+")
    if compact.startswith("00"):
        compact = "+" + compact[2:]
    if not compact.startswith("+"):
        if len(compact) == 10 and compact.startswith("05"):
            compact = "+966" + compact[1:]
        elif len(compact) == 9 and compact.startswith("5"):
            compact = "+966" + compact
        else:
            compact = "+" + compact if len(compact) >= 10 else compact
    digits = compact[1:] if compact.startswith("+") else compact
    return compact if digits.isdigit() and 7 <= len(digits) <= 15 else None


def login_identifier_for(employee: Employee) -> Optional[str]:
    """Personal email preferred, otherwise normalised mobile (stored in the login ``email`` column)."""
    email = (employee.personal_email or "").strip().lower()
    if email:
        return email
    return normalize_mobile(employee.personal_mobile)


# ------------------------------------------------------------------------------
# Notification (stub: no provider is wired for credential delivery yet)
# ------------------------------------------------------------------------------

class CredentialNotifier(Protocol):
    def send_temporary_password(
        self, *, channel: str, destination: str, display_name: str, temporary_password: str
    ) -> bool:
        """Deliver the secret; return True only if actually dispatched. Must never log the secret."""


class StubCredentialNotifier:
    """Placeholder until an email/SMS provider is integrated.

    The existing VerificationService dispatchers are OTP-specific stubs, so they are deliberately not
    reused for passwords. This stub receives the secret in memory, discards it, and logs only a masked
    destination. Returning False makes the audit trail show NOT_DELIVERED; the employee must then use
    the platform password-reset flow.
    """

    def send_temporary_password(
        self, *, channel: str, destination: str, display_name: str, temporary_password: str
    ) -> bool:
        masked = f"***{destination[-3:]}" if destination else ""
        logger.warning(
            "[IAM PROVISIONING] no %s credential-delivery provider configured (destination=%s)",
            channel, masked,
        )
        return False


_notifier: CredentialNotifier = StubCredentialNotifier()


def get_credential_notifier() -> CredentialNotifier:
    return _notifier


def set_credential_notifier(notifier: CredentialNotifier) -> None:
    global _notifier
    _notifier = notifier


# ------------------------------------------------------------------------------
# Provisioning
# ------------------------------------------------------------------------------

@dataclass(frozen=True)
class ProvisioningOutcome:
    status: str  # PROVISIONED | SKIPPED
    reason: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    role: Optional[str] = None
    login_identifier: Optional[str] = field(default=None, repr=False)
    display_name: Optional[str] = field(default=None, repr=False)
    # In-memory only; never persisted, logged, audited or returned over HTTP.
    temporary_password: Optional[str] = field(default=None, repr=False, compare=False)


def _apply_tenant_scope(db: Session, tenant_id: uuid.UUID) -> None:
    """Re-assert the RLS tenant GUCs; they are transaction-local so this runs per transaction."""
    if db.get_bind().dialect.name != "postgresql":
        return
    db.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": str(tenant_id)})
    db.execute(text("SET LOCAL app.current_company_id = :tid"), {"tid": str(tenant_id)})


def _ctx(base: AuditContext, employee_id: uuid.UUID, user_id: Optional[uuid.UUID] = None) -> AuditContext:
    suffix = f"|employee={employee_id}" + (f"|user={user_id}" if user_id else "")
    return dataclasses.replace(base, endpoint=(base.endpoint[: 255 - len(suffix)] + suffix)[:255])


def _skip(
    db: Session, audit: AuditContext, tenant_id: uuid.UUID, employee_id: uuid.UUID, reason: str
) -> ProvisioningOutcome:
    append_audit_from_context(
        db, _ctx(audit, employee_id),
        action=f"IAM_USER_PROVISIONING_SKIPPED:{reason}", outcome="SKIPPED", tenant_id=tenant_id,
    )
    db.commit()
    return ProvisioningOutcome(status="SKIPPED", reason=reason)


def provision_employee_user(
    db: Session,
    employee_id: uuid.UUID,
    tenant_id: uuid.UUID,
    audit: AuditContext,
    *,
    hasher: Optional[Callable[[str], str]] = None,
) -> ProvisioningOutcome:
    """Create and link a login for one employee. Idempotent and tenant-scoped.

    Commits (or rolls back) the supplied session itself. Raises on unexpected errors after which the
    caller must roll back; the caller owns the session lifecycle.
    """
    _apply_tenant_scope(db, tenant_id)

    # Tenant isolation: the employee must belong to the tenant named by the registering request.
    employee = db.execute(
        select(Employee)
        .where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        .with_for_update()
    ).scalar_one_or_none()
    if employee is None:
        return _skip(db, audit, tenant_id, employee_id, "EMPLOYEE_NOT_FOUND")
    if employee.user_id is not None:
        return _skip(db, audit, tenant_id, employee_id, "ALREADY_LINKED")
    if not employee.is_active:
        return _skip(db, audit, tenant_id, employee_id, "EMPLOYEE_INACTIVE")

    identifier = login_identifier_for(employee)
    if not identifier:
        return _skip(db, audit, tenant_id, employee_id, "NO_LOGIN_IDENTIFIER")
    # res_users.email is globally unique; do not disclose which tenant (if any) owns it.
    exists = db.execute(
        select(models.ResUser.id).where(func.lower(models.ResUser.email) == identifier).limit(1)
    ).first()
    if exists:
        return _skip(db, audit, tenant_id, employee_id, "LOGIN_IDENTIFIER_EXISTS")

    resolved = resolve_title(employee.job_title)
    abac_context = build_abac_context(employee.job_title)
    legacy_role = LEGACY_ROLE_OVERRIDES.get(resolved.role, resolved.role)

    # Secret handling: generated, hashed, and only the hash ever reaches the session.
    temporary_password = generate_temporary_password()
    password_hash = (hasher or _default_hasher)(temporary_password)

    user_id = uuid.uuid4()
    display_name = (
        employee.name_en or f"{employee.first_name} {employee.last_name}".strip() or identifier
    )[:255]
    user = models.ResUser(
        id=user_id,
        firebase_uid=f"native:{user_id}",  # legacy NOT NULL/unique column; no external IdP involved
        email=identifier,
        full_name=display_name,
        phone=normalize_mobile(employee.personal_mobile),
        password_hash=password_hash,
        company_id=tenant_id,
        role=legacy_role,
        iam_role=resolved.role,
        abac_context=abac_context,
        must_change_password=True,
        is_active=True,
        is_superuser=False,
        mfa_enabled=False,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        # Lost a race on the unique login identifier: another request provisioned it first.
        db.rollback()
        _apply_tenant_scope(db, tenant_id)
        return _skip(db, audit, tenant_id, employee_id, "LOGIN_IDENTIFIER_EXISTS")

    employee.user_id = user_id
    ctx = _ctx(audit, employee_id, user_id)
    append_audit_from_context(db, ctx, action="IAM_USER_PROVISIONED", outcome="SUCCESS", tenant_id=tenant_id)
    append_audit_from_context(
        db, ctx, action=f"IAM_ROLE_ASSIGNED:{resolved.role}", outcome="SUCCESS", tenant_id=tenant_id
    )
    if not resolved.matched:
        append_audit_from_context(
            db, ctx, action="IAM_PROVISIONING_FALLBACK_ROLE", outcome="SUCCESS", tenant_id=tenant_id
        )
    if resolved.role in PRIVILEGED_IAM_ROLES:
        append_audit_from_context(
            db, ctx, action="IAM_PRIVILEGED_ROLE_PROVISIONED", outcome="SUCCESS", tenant_id=tenant_id
        )
        append_audit_from_context(
            db, ctx,
            action=f"IAM_MFA_REQUIRED:{'true' if abac_context.get('requires_mfa') else 'false'}",
            outcome="SUCCESS", tenant_id=tenant_id,
        )
    db.commit()

    return ProvisioningOutcome(
        status="PROVISIONED",
        user_id=user_id,
        role=resolved.role,
        login_identifier=identifier,
        display_name=display_name,
        temporary_password=temporary_password,
    )


# ------------------------------------------------------------------------------
# Background task
# ------------------------------------------------------------------------------

def open_provisioning_session(tenant_id: uuid.UUID) -> Session:
    """A brand-new short-lived session on the tenant's physical database (never the request's)."""
    from backend.database import tenant_connection_manager

    return tenant_connection_manager.get_session(tenant_id)


def _record_failure(
    db: Optional[Session], audit: AuditContext, tenant_id: uuid.UUID, employee_id: uuid.UUID, exc: Exception
) -> None:
    # Only the exception class is logged/audited: driver errors can echo bound parameters.
    logger.error("[IAM PROVISIONING] failed for employee=%s tenant=%s (%s)", employee_id, tenant_id, type(exc).__name__)
    if db is None:
        return
    try:
        db.rollback()
        _apply_tenant_scope(db, tenant_id)
        append_audit_from_context(
            db, _ctx(audit, employee_id),
            action=f"IAM_USER_PROVISIONING_FAILED:{type(exc).__name__}", outcome="FAILURE", tenant_id=tenant_id,
        )
        db.commit()
    except Exception as audit_exc:  # never let auditing escape the background task
        logger.error("[IAM PROVISIONING] could not write failure audit (%s)", type(audit_exc).__name__)
        try:
            db.rollback()
        except Exception:
            pass


def _deliver(
    db: Session,
    outcome: ProvisioningOutcome,
    audit: AuditContext,
    tenant_id: uuid.UUID,
    employee_id: uuid.UUID,
    notifier: CredentialNotifier,
) -> None:
    result = "FAILURE"
    try:
        identifier = outcome.login_identifier or ""
        delivered = notifier.send_temporary_password(
            channel="email" if "@" in identifier else "sms",
            destination=identifier,
            display_name=outcome.display_name or "",
            temporary_password=outcome.temporary_password or "",
        )
        result = "SUCCESS" if delivered else "NOT_DELIVERED"
    except Exception as exc:
        logger.error("[IAM PROVISIONING] credential delivery failed (%s)", type(exc).__name__)
    try:
        _apply_tenant_scope(db, tenant_id)
        append_audit_from_context(
            db, _ctx(audit, employee_id, outcome.user_id),
            action="IAM_CREDENTIAL_DELIVERY", outcome=result, tenant_id=tenant_id,
        )
        db.commit()
    except Exception as exc:
        logger.error("[IAM PROVISIONING] could not write delivery audit (%s)", type(exc).__name__)
        db.rollback()


def run_employee_user_provisioning(
    employee_id: uuid.UUID,
    tenant_id: uuid.UUID,
    audit: AuditContext,
    *,
    session_factory: Optional[Callable[[uuid.UUID], Session]] = None,
    notifier: Optional[CredentialNotifier] = None,
    hasher: Optional[Callable[[str], str]] = None,
) -> None:
    """BackgroundTasks entry point. Takes IDs + plain audit data only; never raises."""
    db: Optional[Session] = None
    try:
        db = (session_factory or open_provisioning_session)(tenant_id)
        outcome = provision_employee_user(db, employee_id, tenant_id, audit, hasher=hasher)
        if outcome.status == "PROVISIONED":
            _deliver(db, outcome, audit, tenant_id, employee_id, notifier or get_credential_notifier())
    except Exception as exc:
        _record_failure(db, audit, tenant_id, employee_id, exc)
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


def schedule_employee_provisioning(
    background_tasks: Any,
    request: Any,
    *,
    employee_id: uuid.UUID,
    tenant_id: uuid.UUID,
    actor_id: Optional[uuid.UUID],
    actor_identifier: Optional[str],
) -> None:
    """Queue provisioning; call only after the employee commit has succeeded.

    Captures the real client IP now (request-scoped) and passes the task only IDs plus plain audit
    data. Scheduling problems are swallowed so they can never alter the registration response.
    """
    try:
        audit = build_audit_context(request, actor_id=actor_id, actor_identifier=actor_identifier)
        background_tasks.add_task(run_employee_user_provisioning, employee_id, tenant_id, audit)
    except Exception as exc:
        logger.error("[IAM PROVISIONING] could not schedule task (%s)", type(exc).__name__)


__all__ = [
    "HR_TITLE_IAM_MATRIX", "HR_TITLE_ALIASES", "HR_PROVISIONED_ROLES", "build_abac_context",
    "resolve_title", "generate_temporary_password", "provision_employee_user",
    "run_employee_user_provisioning", "schedule_employee_provisioning",
    "CredentialNotifier", "StubCredentialNotifier",
]
