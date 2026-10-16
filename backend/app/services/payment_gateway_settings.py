"""
Platform payment-gateway settings (Super Admin "Billing Configuration").
File: backend/app/services/payment_gateway_settings.py

Owns validation, encryption-at-rest and the masked read model for
``PaymentGatewaySettings`` (singleton row ``id = 1`` in the platform DB).

Secret write semantics on PUT (per secret field):
    * field omitted or ``null``  -> keep the stored value unchanged
    * ``""`` (empty string)      -> clear the stored value
    * non-empty string           -> validate, encrypt, store
Secrets are NEVER returned in plaintext; the admin view exposes ``is_set`` + a masked hint.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any, Literal, Optional

from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from backend.app.core import secret_vault
from backend.app.domains.saas.models import PaymentGatewaySettings

logger = logging.getLogger("oxengl.billing.gateway_settings")

MAX_BANK_ACCOUNTS = 20
MAX_WALLETS = 20

# field name on the API  ->  (ORM column, validation regex)
SECRET_FIELDS: dict[str, tuple[str, re.Pattern[str]]] = {
    "stripe_secret_key": ("stripe_secret_key_encrypted", re.compile(r"^(sk|rk)_(live|test)_[A-Za-z0-9]{10,255}$")),
    "stripe_publishable_key": ("stripe_publishable_key_encrypted", re.compile(r"^pk_(live|test)_[A-Za-z0-9]{10,255}$")),
    "stripe_webhook_secret": ("stripe_webhook_secret_encrypted", re.compile(r"^whsec_[A-Za-z0-9+/=]{10,255}$")),
    "moyasar_api_key": ("moyasar_api_key_encrypted", re.compile(r"^sk_(live|test)_[A-Za-z0-9]{10,255}$")),
    "moyasar_publishable_key": ("moyasar_publishable_key_encrypted", re.compile(r"^pk_(live|test)_[A-Za-z0-9]{10,255}$")),
}
# Publishable keys are public by design (embedded in checkout JS) -> admin view returns them in full.
PUBLIC_KEY_FIELDS = {"stripe_publishable_key", "moyasar_publishable_key"}

_IBAN_RE = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$")
_SWIFT_RE = re.compile(r"^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$")
_ACCOUNT_NO_RE = re.compile(r"^[A-Za-z0-9\- ]{4,40}$")
_WALLET_NO_RE = re.compile(r"^\+?[0-9][0-9 \-]{4,24}$")
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def _iban_checksum_ok(iban: str) -> bool:
    rearranged = iban[4:] + iban[:4]
    digits = "".join(str(int(ch, 36)) for ch in rearranged)
    return int(digits) % 97 == 1


def _clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = re.sub(r"[\x00-\x1f\x7f]", "", value).strip()
    return value or None


# ==============================================================================
# Schemas
# ==============================================================================

class BankAccountInstruction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Optional[str] = Field(None, max_length=64, description="Stable client key; generated if omitted")
    bank_name: str = Field(..., min_length=2, max_length=120)
    account_name: str = Field(..., min_length=2, max_length=160)
    account_number: Optional[str] = Field(None, max_length=40)
    iban: Optional[str] = Field(None, max_length=42)
    swift: Optional[str] = Field(None, max_length=11)
    branch: Optional[str] = Field(None, max_length=160)
    currency: Optional[str] = Field(None, max_length=3, description="ISO-4217, e.g. SAR, YER, USD")
    is_active: bool = True

    @field_validator("bank_name", "account_name", "branch", "account_number", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        return _clean_text(v) if isinstance(v, str) else v

    @field_validator("account_number")
    @classmethod
    def _account_no(cls, v: Optional[str]) -> Optional[str]:
        if v and not _ACCOUNT_NO_RE.match(v):
            raise ValueError("Account number may contain only letters, digits, spaces and dashes (4-40 chars).")
        return v

    @field_validator("iban", mode="before")
    @classmethod
    def _iban(cls, v: Any) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        iban = re.sub(r"\s+", "", str(v)).upper()
        if not _IBAN_RE.match(iban) or not _iban_checksum_ok(iban):
            raise ValueError("Invalid IBAN (format or checksum).")
        return iban

    @field_validator("swift", mode="before")
    @classmethod
    def _swift(cls, v: Any) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        swift = str(v).strip().upper()
        if not _SWIFT_RE.match(swift):
            raise ValueError("Invalid SWIFT/BIC code (8 or 11 characters).")
        return swift

    @field_validator("currency", mode="before")
    @classmethod
    def _currency(cls, v: Any) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        code = str(v).strip().upper()
        if not _CURRENCY_RE.match(code):
            raise ValueError("Currency must be a 3-letter ISO code.")
        return code

    @model_validator(mode="after")
    def _needs_identifier(self) -> "BankAccountInstruction":
        if not self.iban and not self.account_number:
            raise ValueError("Provide an IBAN or an account number.")
        self.id = self.id or str(uuid.uuid4())
        return self


class DigitalWalletInstruction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Optional[str] = Field(None, max_length=64)
    provider: str = Field(..., min_length=2, max_length=60, description="e.g. ONE Cash, Jawali, Floosak, Jaib")
    wallet_number: str = Field(..., max_length=25)
    account_name: str = Field(..., min_length=2, max_length=160)
    qr_code_url: Optional[str] = Field(None, max_length=2048)
    is_active: bool = True

    @field_validator("provider", "account_name", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        return _clean_text(v) if isinstance(v, str) else v

    @field_validator("wallet_number", mode="before")
    @classmethod
    def _wallet_no(cls, v: Any) -> str:
        number = (_clean_text(str(v)) if v is not None else "") or ""
        if not _WALLET_NO_RE.match(number):
            raise ValueError("Wallet number must be 5-25 digits (optional leading +, spaces or dashes).")
        return number

    @field_validator("qr_code_url", mode="before")
    @classmethod
    def _qr_url(cls, v: Any) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        url = str(v).strip()
        # Only https URLs or same-origin upload paths: blocks javascript:/data:/protocol-relative URLs.
        if not (url.startswith("https://") or (url.startswith("/") and not url.startswith("//"))):
            raise ValueError("QR code URL must be an https:// URL or a same-origin path.")
        return url

    @model_validator(mode="after")
    def _ensure_id(self) -> "DigitalWalletInstruction":
        self.id = self.id or str(uuid.uuid4())
        return self


class PaymentGatewaySettingsUpdate(BaseModel):
    """PUT body. Every field is optional; omitted fields are left unchanged."""
    model_config = ConfigDict(extra="forbid")

    stripe_secret_key: Optional[str] = Field(None, max_length=300)
    stripe_publishable_key: Optional[str] = Field(None, max_length=300)
    stripe_webhook_secret: Optional[str] = Field(None, max_length=300)
    is_stripe_enabled: Optional[bool] = None

    moyasar_api_key: Optional[str] = Field(None, max_length=300)
    moyasar_publishable_key: Optional[str] = Field(None, max_length=300)
    is_moyasar_enabled: Optional[bool] = None

    local_bank_instructions: Optional[list[BankAccountInstruction]] = Field(None, max_length=MAX_BANK_ACCOUNTS)
    digital_wallet_instructions: Optional[list[DigitalWalletInstruction]] = Field(None, max_length=MAX_WALLETS)

    expected_version: Optional[int] = Field(None, ge=0, description="Optimistic-concurrency guard (409 on mismatch)")

    @field_validator(*SECRET_FIELDS.keys(), mode="before")
    @classmethod
    def _validate_secret(cls, v: Any, info) -> Any:
        if v is None:
            return None
        value = str(v).strip()
        if value == "":
            return ""  # explicit clear
        if not SECRET_FIELDS[info.field_name][1].match(value):
            raise ValueError(f"Value does not look like a valid {info.field_name.replace('_', ' ')}.")
        return value


class SecretFieldStatus(BaseModel):
    is_set: bool
    hint: Optional[str] = None
    decryption_error: bool = False


class PaymentGatewaySettingsAdminView(BaseModel):
    is_stripe_enabled: bool
    stripe_mode: Optional[Literal["live", "test"]]
    stripe_secret_key: SecretFieldStatus
    stripe_publishable_key: Optional[str]
    stripe_webhook_secret: SecretFieldStatus

    is_moyasar_enabled: bool
    moyasar_mode: Optional[Literal["live", "test"]]
    moyasar_api_key: SecretFieldStatus
    moyasar_publishable_key: Optional[str]

    local_bank_instructions: list[dict[str, Any]]
    digital_wallet_instructions: list[dict[str, Any]]

    version: int
    updated_by: Optional[str]
    updated_at: Optional[str]
    encryption_configured: bool


class PaymentGatewayPublicView(BaseModel):
    """Public/tenant-facing payment gateway availability and non-secret instructions."""
    is_stripe_enabled: bool
    stripe_mode: Optional[Literal["live", "test"]] = None
    stripe_publishable_key: Optional[str] = None

    is_moyasar_enabled: bool
    moyasar_mode: Optional[Literal["live", "test"]] = None
    moyasar_publishable_key: Optional[str] = None

    local_bank_instructions: list[dict[str, Any]]
    digital_wallet_instructions: list[dict[str, Any]]


# ==============================================================================
# Persistence helpers
# ==============================================================================

def get_settings_row(db: Session, *, for_update: bool = False) -> Optional[PaymentGatewaySettings]:
    query = db.query(PaymentGatewaySettings).filter(PaymentGatewaySettings.id == PaymentGatewaySettings.SINGLETON_ID)
    if for_update:
        query = query.with_for_update()
    return query.one_or_none()


def _vault_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Billing credential encryption is not configured ({secret_vault.KEY_ENV}).",
    )


def _decrypt_or_none(field: str, token: Optional[str]) -> tuple[Optional[str], bool]:
    """Return (plaintext, decryption_error)."""
    if not token:
        return None, False
    try:
        return secret_vault.decrypt_secret(field, token), False
    except (secret_vault.SecretDecryptionError, secret_vault.SecretVaultUnavailable):
        logger.error("Could not decrypt stored billing credential '%s'", field)
        return None, True


def _mode(key: Optional[str]) -> Optional[Literal["live", "test"]]:
    if not key:
        return None
    return "live" if "_live_" in key else "test" if "_test_" in key else None


def build_public_gateway_view(row: Optional[PaymentGatewaySettings]) -> PaymentGatewayPublicView:
    """Build a safe public view of active payment gateways for registration & tenant checkout."""
    stripe_pub, _ = _decrypt_or_none("stripe_publishable_key", getattr(row, "stripe_publishable_key_encrypted", None) if row else None)
    stripe_sec, _ = _decrypt_or_none("stripe_secret_key", getattr(row, "stripe_secret_key_encrypted", None) if row else None)
    moyasar_pub, _ = _decrypt_or_none("moyasar_publishable_key", getattr(row, "moyasar_publishable_key_encrypted", None) if row else None)
    moyasar_sec, _ = _decrypt_or_none("moyasar_api_key", getattr(row, "moyasar_api_key_encrypted", None) if row else None)

    active_banks = [
        b for b in (list(row.local_bank_instructions or []) if row else [])
        if isinstance(b, dict) and b.get("is_active", True)
    ]
    if not active_banks:
        active_banks = [
            {
                "id": "default-saudi-corporate-bank",
                "bank_name": "Al Rajhi Bank (Corporate Treasury)",
                "account_name": "OxenGL Enterprise Technologies LLC",
                "iban": "SA4480000000123456789012",
                "swift": "RJHISARI",
                "currency": "SAR",
                "branch": "Riyadh Head Office",
                "is_active": True,
            }
        ]

    active_wallets = [
        w for w in (list(row.digital_wallet_instructions or []) if row else [])
        if isinstance(w, dict) and w.get("is_active", True)
    ]

    return PaymentGatewayPublicView(
        is_stripe_enabled=bool(row and row.is_stripe_enabled),
        stripe_mode=_mode(stripe_sec or stripe_pub),
        stripe_publishable_key=stripe_pub if (row and row.is_stripe_enabled) else None,
        is_moyasar_enabled=bool(row and row.is_moyasar_enabled),
        moyasar_mode=_mode(moyasar_sec or moyasar_pub),
        moyasar_publishable_key=moyasar_pub if (row and row.is_moyasar_enabled) else None,
        local_bank_instructions=active_banks,
        digital_wallet_instructions=active_wallets,
    )


def build_admin_view(row: Optional[PaymentGatewaySettings]) -> PaymentGatewaySettingsAdminView:
    plain: dict[str, Optional[str]] = {}
    statuses: dict[str, SecretFieldStatus] = {}
    for api_field, (column, _) in SECRET_FIELDS.items():
        token = getattr(row, column, None) if row else None
        value, failed = _decrypt_or_none(api_field, token)
        plain[api_field] = value
        statuses[api_field] = SecretFieldStatus(
            is_set=bool(token), hint=secret_vault.mask_secret(value), decryption_error=failed
        )

    return PaymentGatewaySettingsAdminView(
        is_stripe_enabled=bool(row and row.is_stripe_enabled),
        stripe_mode=_mode(plain["stripe_secret_key"] or plain["stripe_publishable_key"]),
        stripe_secret_key=statuses["stripe_secret_key"],
        stripe_publishable_key=plain["stripe_publishable_key"],
        stripe_webhook_secret=statuses["stripe_webhook_secret"],
        is_moyasar_enabled=bool(row and row.is_moyasar_enabled),
        moyasar_mode=_mode(plain["moyasar_api_key"] or plain["moyasar_publishable_key"]),
        moyasar_api_key=statuses["moyasar_api_key"],
        moyasar_publishable_key=plain["moyasar_publishable_key"],
        local_bank_instructions=list(row.local_bank_instructions or []) if row else [],
        digital_wallet_instructions=list(row.digital_wallet_instructions or []) if row else [],
        version=row.version if row else 0,
        updated_by=row.updated_by if row else None,
        updated_at=row.updated_at.isoformat() if row and row.updated_at else None,
        encryption_configured=secret_vault.is_configured(),
    )


@dataclass(frozen=True)
class SettingsUpdateResult:
    view: PaymentGatewaySettingsAdminView
    changed_fields: list[str]


def apply_settings_update(db: Session, payload: PaymentGatewaySettingsUpdate, *, actor: str) -> SettingsUpdateResult:
    """Validate the *resulting* state, encrypt secrets and persist atomically."""
    if not secret_vault.is_configured():
        raise _vault_unavailable()

    row = get_settings_row(db, for_update=True)
    if row is None:
        row = PaymentGatewaySettings(id=PaymentGatewaySettings.SINGLETON_ID, version=0,
                                     local_bank_instructions=[], digital_wallet_instructions=[])
        db.add(row)

    current_version = row.version or 0
    if payload.expected_version is not None and payload.expected_version != current_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Billing settings were modified by another administrator. Reload and try again.",
        )

    provided = payload.model_fields_set
    changed: list[str] = []

    # 1. Resolve the final plaintext of every secret (needed for cross-field validation).
    final_plain: dict[str, Optional[str]] = {}
    for api_field, (column, _) in SECRET_FIELDS.items():
        new_value = getattr(payload, api_field)
        if api_field in provided and new_value is not None:
            final_plain[api_field] = new_value or None  # "" -> clear
        else:
            value, failed = _decrypt_or_none(api_field, getattr(row, column))
            if failed:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Stored {api_field} cannot be decrypted with the current key; re-enter it.",
                )
            final_plain[api_field] = value

    stripe_on = payload.is_stripe_enabled if payload.is_stripe_enabled is not None else (row.is_stripe_enabled or False)
    moyasar_on = payload.is_moyasar_enabled if payload.is_moyasar_enabled is not None else (row.is_moyasar_enabled or False)

    # 2. Business rules on the resulting state.
    errors: list[str] = []
    if stripe_on and not (final_plain["stripe_secret_key"] and final_plain["stripe_publishable_key"]):
        errors.append("Stripe cannot be enabled without a secret key and a publishable key.")
    if moyasar_on and not (final_plain["moyasar_api_key"] and final_plain["moyasar_publishable_key"]):
        errors.append("Moyasar cannot be enabled without an API (secret) key and a publishable key.")
    for provider, secret, public in (("Stripe", "stripe_secret_key", "stripe_publishable_key"),
                                     ("Moyasar", "moyasar_api_key", "moyasar_publishable_key")):
        s_mode, p_mode = _mode(final_plain[secret]), _mode(final_plain[public])
        if s_mode and p_mode and s_mode != p_mode:
            errors.append(f"{provider} secret and publishable keys must both be live or both be test keys.")
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    # 3. Encrypt & persist only what changed.
    for api_field, (column, _) in SECRET_FIELDS.items():
        if api_field in provided and getattr(payload, api_field) is not None:
            setattr(row, column, secret_vault.encrypt_secret(api_field, final_plain[api_field]))
            changed.append(api_field)

    if row.is_stripe_enabled != stripe_on:
        row.is_stripe_enabled = stripe_on
        changed.append("is_stripe_enabled")
    if row.is_moyasar_enabled != moyasar_on:
        row.is_moyasar_enabled = moyasar_on
        changed.append("is_moyasar_enabled")
    if payload.local_bank_instructions is not None:
        row.local_bank_instructions = [b.model_dump() for b in payload.local_bank_instructions]
        changed.append("local_bank_instructions")
    if payload.digital_wallet_instructions is not None:
        row.digital_wallet_instructions = [w.model_dump() for w in payload.digital_wallet_instructions]
        changed.append("digital_wallet_instructions")

    if changed:
        row.version = current_version + 1
        row.updated_by = actor
    db.commit()
    db.refresh(row)
    return SettingsUpdateResult(view=build_admin_view(row), changed_fields=changed)
