"""
OxenGL ERP - Backup destination management (tenant + platform) and credential storage.
Filename: backend/app/services/backup_destination_service.py

Pure service layer (no FastAPI imports) shared by the REST routers and the backup worker.

Credential storage design
-------------------------
* ``backup_destinations.config`` is NON-secret JSON, restricted to a per-provider key whitelist.
* Secrets (OAuth client secret / refresh token, SSH private key) are supplied write-only in create/update
  payloads and are stored ONLY as ``credentials_encrypted``: AES-256-GCM using the existing backup master key
  (``DefaultKeyProvider``: OXENGL_BACKUP_MASTER_KEY, else the crypto_vault master key file; rotation through
  OXENGL_BACKUP_PREVIOUS_KEYS). Each blob has a random 96-bit nonce, carries the 8-byte key id, and is bound via
  AAD to (destination id, tenant id) so a blob copied onto another row / tenant fails authentication.
* ``credential_ref`` is ``db:<destination id>`` for stored credentials. Environment references
  (OXENGL_BACKUP_CRED_<REF>) remain supported for PLATFORM destinations only and can only be set by a
  platform super admin; tenants can never choose a reference, so they cannot point at platform secrets.
* API responses expose only ``has_credential``; neither the reference nor any secret is ever serialised.
  Run-log error messages are scrubbed with ``redact_secrets`` and truncated to 500 characters.
* ``StoredCredentialProvider`` is the ``CredentialProvider`` handed to ``BackupService`` so the worker resolves
  ``db:`` references (and persists rotated OAuth refresh tokens) in addition to environment references.
"""

from __future__ import annotations

import base64
import ipaddress
import json
import logging
import os
import re
import socket
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.services.backup_service import (
    _CRED_REF_RE,
    _DRIVE_ID_RE,
    _HOST_KEY_RE,
    _HOST_RE,
    _MS_TENANT_RE,
    _USER_RE,
    BackupError,
    BackupKeyProvider,
    CredentialProvider,
    DefaultKeyProvider,
    DestinationConfig,
    DestinationType,
    EnvCredentialProvider,
    PathTraversalError,
    _assert_safe_remote,
    build_destination,
    confine_remote_path,
    redact_secrets,
)
from backend.models import BackupDestination, BackupRunLog, ResCompany

logger = logging.getLogger("oxengl.backup_destinations")

PROVIDER_TO_DESTINATION: dict[str, DestinationType] = {
    "gdrive": DestinationType.GOOGLE_DRIVE,
    "onedrive": DestinationType.ONEDRIVE,
    "sftp": DestinationType.SFTP,
}
PROVIDER_TYPES = tuple(PROVIDER_TO_DESTINATION)

DEFAULT_BASE_PATH = "/oxengl-backups"
STORED_REF_PREFIX = "db:"
MAX_NAME_LEN = 120
MAX_ERROR_LEN = 500
LOG_STATUSES = ("success", "failed", "running")

# Non-secret ``config`` keys per provider. Anything else is rejected (no ca_bundle / timeout / proxy injection).
CONFIG_KEYS: dict[str, frozenset[str]] = {
    "gdrive": frozenset({"base_path", "folder_id"}),
    "onedrive": frozenset({"base_path", "tenant"}),
    "sftp": frozenset({"base_path", "host", "port", "username", "pinned_host_key"}),
}
# Write-only credential fields per provider: (required, optional).
CREDENTIAL_FIELDS: dict[str, tuple[frozenset[str], frozenset[str]]] = {
    "gdrive": (frozenset({"client_id", "client_secret", "refresh_token"}), frozenset()),
    "onedrive": (frozenset({"client_id", "refresh_token"}), frozenset({"client_secret"})),
    "sftp": (frozenset({"private_key"}), frozenset()),
}
_MAX_CREDENTIAL_LEN = {"private_key": 16384}
_DEFAULT_MAX_CREDENTIAL_LEN = 4096

_NAME_RE = re.compile(r"^[\w .,@()#&+/'-]{1,120}$")
_BLOCKED_HOST_SUFFIXES = (".local", ".localdomain", ".internal", ".intranet", ".lan", ".home", ".corp", ".home.arpa")


class DestinationValidationError(ValueError):
    """Invalid destination input. Messages never echo submitted secret values."""


# =============================================================================================
# Validation
# =============================================================================================


def _is_global_ip(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    mapped = getattr(address, "ipv4_mapped", None)
    if mapped is not None:
        address = mapped
    return address.is_global and not address.is_multicast


def validate_destination_host(
    host: str,
    *,
    allow_internal: bool = False,
    resolver: Callable[..., list[Any]] | None = None,
) -> str:
    """Validate an SFTP host. Tenant-supplied hosts (``allow_internal=False``) must be public: IP literals and
    every resolved address must be globally routable (blocks loopback, RFC1918, link-local / cloud metadata,
    CGNAT, reserved ranges), and internal-looking names are refused. Platform super admins may target
    private storage (``allow_internal=True``) but the host syntax is still enforced."""
    value = (host or "").strip().lower().rstrip(".")
    if not value or not _HOST_RE.fullmatch(value):
        raise DestinationValidationError("host is not a valid hostname or IP address")
    literal: ipaddress.IPv4Address | ipaddress.IPv6Address | None
    try:
        literal = ipaddress.ip_address(value)
    except ValueError:
        literal = None
    if allow_internal:
        return value
    if literal is not None:
        if not _is_global_ip(literal):
            raise DestinationValidationError("host must be a publicly routable address")
        return value
    if value == "localhost" or "." not in value or value.endswith(_BLOCKED_HOST_SUFFIXES):
        raise DestinationValidationError("host must be a public fully-qualified domain name")
    lookup = resolver or socket.getaddrinfo
    try:
        infos = lookup(value, None, type=socket.SOCK_STREAM)
    except (OSError, UnicodeError):
        raise DestinationValidationError("host could not be resolved") from None
    addresses = {info[4][0] for info in infos}
    if not addresses:
        raise DestinationValidationError("host could not be resolved")
    for raw in addresses:
        try:
            resolved = ipaddress.ip_address(str(raw).split("%", 1)[0])
        except ValueError:
            raise DestinationValidationError("host resolved to an invalid address") from None
        if not _is_global_ip(resolved):
            raise DestinationValidationError("host resolves to a non-public address")
    return value


def validate_name(name: Any) -> str:
    value = str(name or "").strip()
    if not _NAME_RE.fullmatch(value):
        raise DestinationValidationError(
            "name must be 1-120 characters (letters, digits, spaces and . , @ ( ) # & + / ' -)"
        )
    return value


def validate_base_path(value: Any) -> str:
    raw = str(value if value not in (None, "") else DEFAULT_BASE_PATH).strip()
    if len(raw) > 255 or not raw.startswith("/"):
        raise DestinationValidationError("base_path must be an absolute path of at most 255 characters")
    if any(segment in ("..", ".") for segment in raw.split("/")):
        raise DestinationValidationError("base_path must not contain '.' or '..' segments")
    try:
        normalised = confine_remote_path(raw)
        _assert_safe_remote(normalised)
    except PathTraversalError as err:
        raise DestinationValidationError(f"base_path is invalid: {err}") from None
    return normalised


def validate_config(
    provider_type: str,
    config: Mapping[str, Any] | None,
    *,
    allow_internal_hosts: bool = False,
    resolver: Callable[..., list[Any]] | None = None,
) -> dict[str, Any]:
    """Return the normalised, whitelisted, NON-secret config for ``provider_type`` or raise."""
    if provider_type not in PROVIDER_TO_DESTINATION:
        raise DestinationValidationError("provider_type must be one of: " + ", ".join(PROVIDER_TYPES))
    raw = dict(config or {})
    unknown = sorted(set(raw) - CONFIG_KEYS[provider_type])
    if unknown:
        raise DestinationValidationError("unsupported config keys: " + ", ".join(unknown))

    clean: dict[str, Any] = {"base_path": validate_base_path(raw.get("base_path"))}
    if provider_type == "gdrive":
        folder = str(raw.get("folder_id") or "root").strip()
        if not _DRIVE_ID_RE.fullmatch(folder):
            raise DestinationValidationError("folder_id is not a valid Google Drive folder id")
        clean["folder_id"] = folder
    elif provider_type == "onedrive":
        tenant = str(raw.get("tenant") or "common").strip()
        if not _MS_TENANT_RE.fullmatch(tenant) or ".." in tenant:
            raise DestinationValidationError("tenant is not a valid Microsoft identity tenant")
        clean["tenant"] = tenant
    else:  # sftp
        clean["host"] = validate_destination_host(
            str(raw.get("host") or ""), allow_internal=allow_internal_hosts, resolver=resolver
        )
        try:
            port = int(raw.get("port") or 22)
        except (TypeError, ValueError):
            raise DestinationValidationError("port must be an integer between 1 and 65535") from None
        if not 0 < port < 65536:
            raise DestinationValidationError("port must be an integer between 1 and 65535")
        clean["port"] = port
        username = str(raw.get("username") or "").strip()
        if not _USER_RE.fullmatch(username):
            raise DestinationValidationError("username is not a valid SSH username")
        clean["username"] = username
        pinned = str(raw.get("pinned_host_key") or "").strip()
        if not _HOST_KEY_RE.fullmatch(pinned):
            raise DestinationValidationError(
                "pinned_host_key is required in '<type> <base64>' format (e.g. 'ssh-ed25519 AAAA...'); "
                "host keys are never auto-accepted"
            )
        clean["pinned_host_key"] = pinned
    return clean


def validate_credentials(provider_type: str, credentials: Mapping[str, Any] | None) -> dict[str, str]:
    """Validate a write-only credential payload. Error messages name fields, never values."""
    if provider_type not in CREDENTIAL_FIELDS:
        raise DestinationValidationError("unsupported provider_type")
    required, optional = CREDENTIAL_FIELDS[provider_type]
    if credentials is not None and not isinstance(credentials, Mapping):
        raise DestinationValidationError("credentials must be an object of credential fields")
    raw = dict(credentials or {})
    unknown = sorted(set(raw) - required - optional)
    if unknown:
        raise DestinationValidationError("unsupported credential fields: " + ", ".join(unknown))
    clean: dict[str, str] = {}
    for key in sorted(required | optional):
        value = raw.get(key)
        if value is None or (isinstance(value, str) and not value.strip()):
            if key in required:
                raise DestinationValidationError(f"credential field '{key}' is required")
            continue
        if not isinstance(value, str):
            raise DestinationValidationError(f"credential field '{key}' must be a string")
        value = value.strip()
        if "\x00" in value or len(value) > _MAX_CREDENTIAL_LEN.get(key, _DEFAULT_MAX_CREDENTIAL_LEN):
            raise DestinationValidationError(f"credential field '{key}' is invalid or too long")
        if key == "private_key":
            if "PRIVATE KEY-----" not in value or not value.startswith("-----BEGIN"):
                raise DestinationValidationError("credential field 'private_key' must be an OpenSSH/PEM private key")
            value += "\n"
        clean[key] = value
    return clean


def validate_platform_credential_ref(ref: Any) -> str:
    value = str(ref or "").strip()
    if not _CRED_REF_RE.fullmatch(value) or value.lower().startswith(STORED_REF_PREFIX):
        raise DestinationValidationError("credential_ref must match [A-Za-z0-9][A-Za-z0-9_.:-]{0,127} and not use 'db:'")
    return value


# =============================================================================================
# Encrypted credential storage
# =============================================================================================


class CredentialCipher:
    """AES-256-GCM envelope for destination credentials (see module docstring)."""

    _VERSION = "v1"
    _AAD_PREFIX = b"oxengl-backup-destination-credentials/v1|"

    def __init__(self, key_provider: BackupKeyProvider | None = None) -> None:
        self._key_provider = key_provider

    def _keys(self) -> BackupKeyProvider:
        if self._key_provider is None:
            self._key_provider = DefaultKeyProvider()
        return self._key_provider

    @classmethod
    def _aad(cls, destination_id: uuid.UUID, tenant_id: uuid.UUID | None) -> bytes:
        return cls._AAD_PREFIX + f"{destination_id}|{tenant_id or 'platform'}".encode()

    def encrypt(self, destination_id: uuid.UUID, tenant_id: uuid.UUID | None, values: Mapping[str, str]) -> str:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        key_id, key = self._keys().current()
        nonce = os.urandom(12)
        plaintext = json.dumps(dict(values), separators=(",", ":")).encode()
        sealed = AESGCM(key).encrypt(nonce, plaintext, self._aad(destination_id, tenant_id))
        return f"{self._VERSION}:" + base64.urlsafe_b64encode(key_id + nonce + sealed).decode()

    def decrypt(self, destination_id: uuid.UUID, tenant_id: uuid.UUID | None, blob: str) -> dict[str, str]:
        from cryptography.exceptions import InvalidTag
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        try:
            version, _, body = (blob or "").partition(":")
            if version != self._VERSION:
                raise ValueError("unsupported version")
            raw = base64.urlsafe_b64decode(body.encode())
            key_id, nonce, sealed = raw[:8], raw[8:20], raw[20:]
            key = self._keys().lookup(key_id)
            data = json.loads(AESGCM(key).decrypt(nonce, sealed, self._aad(destination_id, tenant_id)))
        except BackupError:
            raise
        except (InvalidTag, ValueError, TypeError):
            raise BackupError("stored destination credentials could not be decrypted") from None
        if not isinstance(data, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in data.items()):
            raise BackupError("stored destination credentials are malformed")
        return data


_default_cipher: CredentialCipher | None = None


def default_cipher() -> CredentialCipher:
    global _default_cipher
    if _default_cipher is None:
        _default_cipher = CredentialCipher()
    return _default_cipher


def stored_ref(destination_id: uuid.UUID) -> str:
    return f"{STORED_REF_PREFIX}{destination_id}"


class StoredCredentialProvider:
    """``CredentialProvider`` resolving ``db:<id>`` references from ``backup_destinations.credentials_encrypted``
    (decrypted with the AAD-bound cipher) and falling back to ``OXENGL_BACKUP_CRED_<REF>`` environment references.
    Rotated OAuth refresh tokens are re-encrypted and persisted for ``db:`` references."""

    def __init__(
        self,
        session_factory: Callable[[], Session],
        cipher: CredentialCipher | None = None,
        env_provider: CredentialProvider | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._cipher = cipher or default_cipher()
        self._env = env_provider or EnvCredentialProvider()

    @staticmethod
    def _destination_id(ref: str) -> uuid.UUID:
        try:
            return uuid.UUID(ref[len(STORED_REF_PREFIX):])
        except ValueError:
            raise BackupError("invalid credential reference") from None

    def get(self, ref: str) -> Mapping[str, str]:
        if not ref.startswith(STORED_REF_PREFIX):
            return self._env.get(ref)
        destination_id = self._destination_id(ref)
        with self._session_factory() as db:
            row = db.get(BackupDestination, destination_id)
            if row is None or not row.credentials_encrypted:
                raise BackupError("no stored credentials are configured for this destination")
            return self._cipher.decrypt(row.id, row.tenant_id, row.credentials_encrypted)

    def update(self, ref: str, values: Mapping[str, str]) -> None:
        if not ref.startswith(STORED_REF_PREFIX):
            self._env.update(ref, values)
            return
        destination_id = self._destination_id(ref)
        with self._session_factory() as db:
            row = db.get(BackupDestination, destination_id)
            if row is None:
                raise BackupError("cannot persist rotated credentials: destination no longer exists")
            row.credentials_encrypted = self._cipher.encrypt(row.id, row.tenant_id, values)
            db.commit()


# =============================================================================================
# Row -> connector config
# =============================================================================================


def build_destination_config(row: BackupDestination) -> DestinationConfig:
    """Map a stored row onto the backup service's ``DestinationConfig``. Re-validates the stored config
    (tenant hosts are re-checked for SSRF at run time, which also narrows the DNS-rebinding window)."""
    provider = row.provider_type
    cfg = validate_config(provider, row.config or {}, allow_internal_hosts=row.tenant_id is None)
    options: dict[str, str] = {}
    if provider == "gdrive":
        options["folder_id"] = cfg["folder_id"]
    elif provider == "onedrive":
        options["tenant"] = cfg["tenant"]
    return DestinationConfig(
        id=row.id,
        type=PROVIDER_TO_DESTINATION[provider],
        name=row.name,
        base_path=cfg["base_path"],
        host=cfg.get("host"),
        port=cfg.get("port"),
        username=cfg.get("username"),
        pinned_host_key=cfg.get("pinned_host_key"),
        credential_ref=row.credential_ref,
        options=options,
        enabled=bool(row.is_active),
    )


def resolve_credentials_for_check(
    row: BackupDestination, provider: CredentialProvider
) -> Mapping[str, str]:
    """Resolve and sanity-check the credential blob for ``row`` (raises ``BackupError`` with a non-secret message).

    Tenant destinations may ONLY use ``db:`` references (defence in depth against tampered rows)."""
    ref = row.credential_ref
    if not ref:
        raise BackupError("no credentials configured for this destination")
    if row.tenant_id is not None and ref != stored_ref(row.id):
        raise BackupError("tenant destinations may only use their own stored credentials")
    blob = provider.get(ref)
    required, _ = CREDENTIAL_FIELDS[row.provider_type]
    missing = sorted(name for name in required if not blob.get(name))
    if missing:
        raise BackupError("stored credentials are incomplete (missing: " + ", ".join(missing) + ")")
    return blob


# =============================================================================================
# Tenant-scoped / platform-scoped data access (company_id enforced in every query)
# =============================================================================================


def _require_tenant(tenant_id: uuid.UUID | None) -> uuid.UUID:
    if tenant_id is None:
        raise ValueError("tenant scope requires a tenant_id")
    return tenant_id


def get_destination(db: Session, destination_id: uuid.UUID, tenant_id: uuid.UUID | None) -> BackupDestination | None:
    """Fetch one destination inside exactly one scope: a concrete tenant, or platform (``tenant_id`` None).
    A destination belonging to any other scope is indistinguishable from a missing one (callers return 404)."""
    stmt = select(BackupDestination).where(BackupDestination.id == destination_id)
    stmt = stmt.where(BackupDestination.tenant_id.is_(None) if tenant_id is None else BackupDestination.tenant_id == tenant_id)
    return db.execute(stmt).scalar_one_or_none()


def _page_args(page: int, page_size: int) -> tuple[int, int, int]:
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    return page, page_size, (page - 1) * page_size


def last_runs(db: Session, destination_ids: list[uuid.UUID]) -> dict[uuid.UUID, BackupRunLog]:
    """Latest run log per destination (looked up by destination id, which the caller already scoped)."""
    if not destination_ids:
        return {}
    rows = db.execute(
        select(BackupRunLog)
        .where(BackupRunLog.destination_id.in_(destination_ids))
        .order_by(BackupRunLog.started_at.desc())
    ).scalars()
    latest: dict[uuid.UUID, BackupRunLog] = {}
    for log in rows:
        latest.setdefault(log.destination_id, log)
    return latest


def _tenant_names(db: Session, tenant_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not tenant_ids:
        return {}
    return {
        row[0]: row[1]
        for row in db.execute(select(ResCompany.id, ResCompany.name).where(ResCompany.id.in_(tenant_ids))).all()
    }


def serialize_destination(
    row: BackupDestination,
    last_run: BackupRunLog | None = None,
    tenant_name: str | None = None,
) -> dict[str, Any]:
    """Response shape. Contains NO credential material: only ``has_credential``."""
    allowed = CONFIG_KEYS.get(row.provider_type, frozenset())
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "tenant_name": tenant_name,
        "scope": "platform" if row.tenant_id is None else "tenant",
        "provider_type": row.provider_type,
        "name": row.name,
        "config": {k: v for k, v in (row.config or {}).items() if k in allowed},
        "is_active": bool(row.is_active),
        "has_credential": bool(row.credential_ref),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "created_by": row.created_by,
        "last_backup_at": (last_run.completed_at or last_run.started_at) if last_run else None,
        "last_status": last_run.status if last_run else None,
    }


def serialize_log(log: BackupRunLog, tenant_name: str | None = None) -> dict[str, Any]:
    return {
        "id": log.id,
        "destination_id": log.destination_id,
        "destination_name": log.destination_name,
        "provider_type": log.provider_type,
        "tenant_id": log.tenant_id,
        "tenant_name": tenant_name,
        "scope": "platform" if log.tenant_id is None else "tenant",
        "status": log.status,
        "file_size_bytes": log.file_size_bytes,
        "error_message": redact_secrets(log.error_message or "", max_len=MAX_ERROR_LEN) or None,
        "started_at": log.started_at,
        "completed_at": log.completed_at,
    }


def list_destinations(
    db: Session,
    *,
    tenant_id: uuid.UUID | None,
    page: int = 1,
    page_size: int = 50,
    all_scopes: bool = False,
    tenant_filter: uuid.UUID | None = None,
    scope: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Tenant callers: ``tenant_id`` required, ``all_scopes`` False. Super-admin overview: ``all_scopes=True``
    with optional ``tenant_filter`` / ``scope`` ('platform' | 'tenant')."""
    page, page_size, offset = _page_args(page, page_size)
    conditions = []
    if all_scopes:
        if tenant_filter is not None:
            conditions.append(BackupDestination.tenant_id == tenant_filter)
        if scope == "platform":
            conditions.append(BackupDestination.tenant_id.is_(None))
        elif scope == "tenant":
            conditions.append(BackupDestination.tenant_id.is_not(None))
    else:
        conditions.append(BackupDestination.tenant_id == _require_tenant(tenant_id))
    total = db.execute(select(func.count()).select_from(BackupDestination).where(*conditions)).scalar_one()
    rows = list(
        db.execute(
            select(BackupDestination)
            .where(*conditions)
            .order_by(BackupDestination.created_at.desc(), BackupDestination.id)
            .offset(offset)
            .limit(page_size)
        ).scalars()
    )
    last = last_runs(db, [r.id for r in rows])
    names = _tenant_names(db, {r.tenant_id for r in rows if r.tenant_id}) if all_scopes else {}
    return [serialize_destination(r, last.get(r.id), names.get(r.tenant_id)) for r in rows], total


def list_run_logs(
    db: Session,
    *,
    tenant_id: uuid.UUID | None,
    page: int = 1,
    page_size: int = 50,
    all_scopes: bool = False,
    tenant_filter: uuid.UUID | None = None,
    scope: str | None = None,
    status: str | None = None,
    destination_id: uuid.UUID | None = None,
) -> tuple[list[dict[str, Any]], int]:
    page, page_size, offset = _page_args(page, page_size)
    conditions = []
    if all_scopes:
        if tenant_filter is not None:
            conditions.append(BackupRunLog.tenant_id == tenant_filter)
        if scope == "platform":
            conditions.append(BackupRunLog.tenant_id.is_(None))
        elif scope == "tenant":
            conditions.append(BackupRunLog.tenant_id.is_not(None))
    else:
        conditions.append(BackupRunLog.tenant_id == _require_tenant(tenant_id))
    if status:
        if status not in LOG_STATUSES:
            raise DestinationValidationError("status must be one of: " + ", ".join(LOG_STATUSES))
        conditions.append(BackupRunLog.status == status)
    if destination_id is not None:
        conditions.append(BackupRunLog.destination_id == destination_id)
    total = db.execute(select(func.count()).select_from(BackupRunLog).where(*conditions)).scalar_one()
    rows = list(
        db.execute(
            select(BackupRunLog)
            .where(*conditions)
            .order_by(BackupRunLog.started_at.desc(), BackupRunLog.id)
            .offset(offset)
            .limit(page_size)
        ).scalars()
    )
    names = _tenant_names(db, {r.tenant_id for r in rows if r.tenant_id}) if all_scopes else {}
    return [serialize_log(r, names.get(r.tenant_id)) for r in rows], total


@dataclass(frozen=True)
class ChangeSet:
    """Audit-safe description of a mutation (field names only; never values of secrets)."""

    fields: tuple[str, ...]
    credentials_updated: bool = False


def create_destination(
    db: Session,
    *,
    tenant_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    provider_type: str,
    name: str,
    config: Mapping[str, Any] | None,
    credentials: Mapping[str, Any] | None = None,
    platform_credential_ref: str | None = None,
    is_active: bool = True,
    cipher: CredentialCipher | None = None,
    resolver: Callable[..., list[Any]] | None = None,
) -> BackupDestination:
    """Create a destination in exactly the given scope (``tenant_id`` None = platform; the tenant router never
    passes None). Flushes; the caller commits together with its audit rows."""
    is_platform = tenant_id is None
    if platform_credential_ref and not is_platform:
        raise DestinationValidationError("credential references are not available for tenant destinations")
    if platform_credential_ref and credentials:
        raise DestinationValidationError("provide either credentials or credential_ref, not both")
    clean_config = validate_config(provider_type, config, allow_internal_hosts=is_platform, resolver=resolver)
    destination_id = uuid.uuid4()
    row = BackupDestination(
        id=destination_id,
        tenant_id=tenant_id,
        provider_type=provider_type,
        name=validate_name(name),
        config=clean_config,
        is_active=bool(is_active),
        created_by=actor_id,
    )
    if credentials:
        row.credentials_encrypted = (cipher or default_cipher()).encrypt(
            destination_id, tenant_id, validate_credentials(provider_type, credentials)
        )
        row.credential_ref = stored_ref(destination_id)
    elif platform_credential_ref:
        row.credential_ref = validate_platform_credential_ref(platform_credential_ref)
    db.add(row)
    db.flush()
    return row


def update_destination(
    db: Session,
    row: BackupDestination,
    *,
    name: str | None = None,
    config: Mapping[str, Any] | None = None,
    credentials: Mapping[str, Any] | None = None,
    platform_credential_ref: str | None = None,
    is_active: bool | None = None,
    cipher: CredentialCipher | None = None,
    resolver: Callable[..., list[Any]] | None = None,
) -> ChangeSet:
    """Apply a partial update to a row the caller already fetched through ``get_destination`` (scope-checked)."""
    is_platform = row.tenant_id is None
    changed: list[str] = []
    creds_updated = False
    if platform_credential_ref is not None:
        if not is_platform:
            raise DestinationValidationError("credential references are not available for tenant destinations")
        if credentials:
            raise DestinationValidationError("provide either credentials or credential_ref, not both")
        row.credential_ref = validate_platform_credential_ref(platform_credential_ref)
        row.credentials_encrypted = None
        changed.append("credential_ref")
        creds_updated = True
    if name is not None:
        row.name = validate_name(name)
        changed.append("name")
    if config is not None:
        row.config = validate_config(row.provider_type, config, allow_internal_hosts=is_platform, resolver=resolver)
        changed.append("config")
    if is_active is not None:
        row.is_active = bool(is_active)
        changed.append("is_active")
    if credentials:
        row.credentials_encrypted = (cipher or default_cipher()).encrypt(
            row.id, row.tenant_id, validate_credentials(row.provider_type, credentials)
        )
        row.credential_ref = stored_ref(row.id)
        changed.append("credentials")
        creds_updated = True
    row.updated_at = datetime.now(timezone.utc)
    db.flush()
    return ChangeSet(fields=tuple(changed), credentials_updated=creds_updated)


def delete_destination(db: Session, row: BackupDestination) -> None:
    """Hard-delete (run logs keep their snapshot via ON DELETE SET NULL); stored ciphertext goes with the row."""
    # Explicit for backends without FK enforcement (SQLite tests); PostgreSQL would do this via SET NULL.
    for log in db.execute(select(BackupRunLog).where(BackupRunLog.destination_id == row.id)).scalars():
        log.destination_id = None
    db.delete(row)
    db.flush()


def check_destination_connection(row: BackupDestination, provider: CredentialProvider) -> tuple[bool, str]:
    """Connect to the destination using its stored credentials. Returns (ok, non-secret message)."""
    secrets: list[str] = []
    try:
        blob = resolve_credentials_for_check(row, provider)
        secrets = [v for v in blob.values() if isinstance(v, str)]
        config = build_destination_config(row)
        quick = replace(config, options={**config.options, "timeout": "20", "transfer_timeout": "45"})
        with build_destination(quick, provider) as destination:
            destination.test_connection()
        return True, "Connection successful."
    except (BackupError, DestinationValidationError, ValueError) as err:
        return False, redact_secrets(f"{type(err).__name__}: {err}", secrets, max_len=MAX_ERROR_LEN)
    except Exception as err:  # noqa: BLE001 - third-party connector errors: class name only
        return False, type(err).__name__


# =============================================================================================
# Worker helpers: destinations for a policy + run-log rows
# =============================================================================================


@dataclass
class PreparedDestinations:
    """Destinations resolved for one policy. ``configs`` are upload-ready; ``failures`` could not be prepared."""

    configs: list[DestinationConfig]
    meta: dict[uuid.UUID, tuple[str, str]]  # destination id -> (name, provider_type)
    secrets: dict[uuid.UUID, list[str]]  # per-destination secret values, only used for log scrubbing
    failures: list[tuple[uuid.UUID, str]]  # (destination id, sanitised message)


def prepare_destinations(
    db: Session, tenant_id: uuid.UUID | None, provider: CredentialProvider
) -> PreparedDestinations:
    """Load ACTIVE destinations for one policy scope. ``tenant_id`` None -> only ``tenant_id IS NULL`` rows;
    a tenant id -> only rows with exactly that tenant id. Destinations whose config or credentials cannot be
    resolved are reported as failures instead of being uploaded to."""
    stmt = select(BackupDestination).where(BackupDestination.is_active.is_(True))
    stmt = stmt.where(BackupDestination.tenant_id.is_(None) if tenant_id is None else BackupDestination.tenant_id == tenant_id)
    rows = list(db.execute(stmt.order_by(BackupDestination.created_at, BackupDestination.id)).scalars())
    prepared = PreparedDestinations(configs=[], meta={}, secrets={}, failures=[])
    for row in rows:
        # Belt and braces: never let a row from another scope through, whatever the query returned.
        if row.tenant_id != tenant_id:
            continue
        prepared.meta[row.id] = (row.name, row.provider_type)
        try:
            blob = resolve_credentials_for_check(row, provider)
            prepared.secrets[row.id] = [v for v in blob.values() if isinstance(v, str)]
            prepared.configs.append(build_destination_config(row))
        except (BackupError, DestinationValidationError, ValueError) as err:
            message = str(err) if isinstance(err, (BackupError, DestinationValidationError)) else "invalid destination"
            if isinstance(err, BackupError) and "credential" not in message.lower():
                message = "credential could not be resolved: " + message
            prepared.failures.append(
                (row.id, redact_secrets(message, prepared.secrets.get(row.id, ()), max_len=MAX_ERROR_LEN))
            )
        except Exception as err:  # noqa: BLE001
            prepared.failures.append((row.id, f"destination could not be prepared ({type(err).__name__})"))
    return prepared


def build_run_log_rows(
    *,
    tenant_id: uuid.UUID | None,
    prepared: PreparedDestinations,
    uploads: list[Any],
    artifact_size: int | None,
    run_started: datetime | None,
    run_finished: datetime | None,
    run_error: str | None,
) -> list[BackupRunLog]:
    """One ``BackupRunLog`` per destination: upload outcomes, preparation failures, and (when the archive could
    not even be produced) a failure for every destination that was due to receive it."""
    now = datetime.now(timezone.utc)
    started_default = run_started or now
    finished_default = run_finished or now
    rows: list[BackupRunLog] = []
    seen: set[uuid.UUID] = set()

    def _row(dest_id: uuid.UUID, status: str, size: int | None, error: str | None, started, finished) -> BackupRunLog:
        name, provider_type = prepared.meta.get(dest_id, (None, None))
        return BackupRunLog(
            id=uuid.uuid4(),
            destination_id=dest_id,
            tenant_id=tenant_id,
            destination_name=name,
            provider_type=provider_type,
            status=status,
            file_size_bytes=size,
            error_message=(redact_secrets(error, prepared.secrets.get(dest_id, ()), max_len=MAX_ERROR_LEN) if error else None),
            started_at=started,
            completed_at=finished,
        )

    for upload in uploads:
        dest_id = upload.destination_id
        if dest_id not in prepared.meta or dest_id in seen:
            continue  # never log an outcome for a destination outside this policy's scope
        seen.add(dest_id)
        ok = bool(upload.ok)
        rows.append(
            _row(
                dest_id,
                "success" if ok else "failed",
                artifact_size,
                None if ok else (upload.error or "upload failed"),
                getattr(upload, "started_at", None) or started_default,
                getattr(upload, "finished_at", None) or finished_default,
            )
        )
    for dest_id, message in prepared.failures:
        if dest_id in seen:
            continue
        seen.add(dest_id)
        rows.append(_row(dest_id, "failed", None, message, now, now))
    uploaded_or_failed = seen
    for config in prepared.configs:
        if config.id in uploaded_or_failed:
            continue
        seen.add(config.id)
        rows.append(
            _row(
                config.id,
                "failed",
                artifact_size,
                "backup archive was not uploaded: " + (run_error or "no archive was produced"),
                started_default,
                finished_default,
            )
        )
    return rows


def record_run_logs(session_factory: Callable[[], Session], rows: list[BackupRunLog]) -> int:
    """Persist run-log rows in their own short-lived session; never raises (logging must not fail a backup)."""
    if not rows:
        return 0
    try:
        with session_factory() as db:
            try:
                db.add_all(rows)
                db.commit()
                return len(rows)
            except Exception:
                db.rollback()
                raise
    except Exception as err:  # noqa: BLE001
        logger.error("failed to persist %d backup run log rows: %s", len(rows), type(err).__name__)
        return 0
