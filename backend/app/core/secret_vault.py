"""
Symmetric at-rest encryption for platform credentials (payment gateway API keys).
File: backend/app/core/secret_vault.py

Design
------
* Fernet (AES-128-CBC + HMAC-SHA256, authenticated) via ``cryptography``.
* Dedicated master secret ``BILLING_SETTINGS_ENCRYPTION_KEY`` -- deliberately independent of
  ``DATA_RESIDENCY_KEY`` / JWT secrets so a compromise or rotation of one never affects the other.
* Per-field sub-keys derived with HKDF-SHA256 (``info=b"oxengl:billing:<field>"``). A ciphertext
  copied from one column into another (e.g. publishable -> secret) fails authentication.
* Zero-downtime rotation: ``BILLING_SETTINGS_ENCRYPTION_KEY_PREVIOUS`` (comma-separated) is still
  accepted for decryption; ``reencrypt()`` upgrades a token to the current key.
* Loaded lazily (not at import) so the API keeps booting when billing settings are not yet
  configured; callers get ``SecretVaultUnavailable`` and surface HTTP 503.
"""

from __future__ import annotations

import base64
import os
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from backend.secret_env import KNOWN_PUBLIC_SECRETS, MIN_SECRET_LENGTH

KEY_ENV = "BILLING_SETTINGS_ENCRYPTION_KEY"
PREVIOUS_KEYS_ENV = "BILLING_SETTINGS_ENCRYPTION_KEY_PREVIOUS"
_HKDF_SALT = b"oxengl.platform.payment-gateway-settings.v1"


class SecretVaultUnavailable(RuntimeError):
    """Raised when the master key is missing or too weak to use."""


class SecretDecryptionError(RuntimeError):
    """Raised when a stored token cannot be authenticated with any known key."""


def _validated_raw_keys() -> tuple[str, ...]:
    current = (os.getenv(KEY_ENV) or "").strip()
    if not current:
        raise SecretVaultUnavailable(
            f"{KEY_ENV} is not configured. Generate one with `openssl rand -hex 32`."
        )
    previous = [k.strip() for k in (os.getenv(PREVIOUS_KEYS_ENV) or "").split(",") if k.strip()]
    for raw in (current, *previous):
        if raw in KNOWN_PUBLIC_SECRETS or len(raw) < MIN_SECRET_LENGTH:
            raise SecretVaultUnavailable(
                f"{KEY_ENV} (or a previous key) is shorter than {MIN_SECRET_LENGTH} chars or publicly known."
            )
    return (current, *previous)


def _derive_fernet(raw_key: str, field: str) -> Fernet:
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=_HKDF_SALT, info=f"oxengl:billing:{field}".encode())
    return Fernet(base64.urlsafe_b64encode(hkdf.derive(raw_key.encode("utf-8"))))


@lru_cache(maxsize=64)
def _multifernet(field: str, raw_keys: tuple[str, ...]) -> MultiFernet:
    # First key encrypts; all keys are tried for decryption.
    return MultiFernet([_derive_fernet(raw, field) for raw in raw_keys])


def _vault(field: str) -> MultiFernet:
    return _multifernet(field, _validated_raw_keys())


def is_configured() -> bool:
    try:
        _validated_raw_keys()
        return True
    except SecretVaultUnavailable:
        return False


def encrypt_secret(field: str, plaintext: Optional[str]) -> Optional[str]:
    """Encrypt ``plaintext`` bound to ``field``. ``None``/empty -> ``None`` (nothing stored)."""
    if plaintext is None or plaintext == "":
        return None
    return _vault(field).encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_secret(field: str, token: Optional[str]) -> Optional[str]:
    """Decrypt a stored token. Never logs or echoes the token/plaintext on failure."""
    if not token:
        return None
    try:
        return _vault(field).decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise SecretDecryptionError(f"Stored credential '{field}' could not be decrypted with any configured key.") from exc


def reencrypt(field: str, token: Optional[str]) -> Optional[str]:
    """Rotate a token onto the current primary key (no-op for empty values)."""
    if not token:
        return None
    try:
        return _vault(field).rotate(token.encode("ascii")).decode("ascii")
    except (InvalidToken, ValueError) as exc:
        raise SecretDecryptionError(f"Stored credential '{field}' could not be rotated.") from exc


def mask_secret(plaintext: Optional[str], visible: int = 4) -> Optional[str]:
    """Display hint that keeps the vendor prefix (``sk_live_``) and last ``visible`` chars only."""
    if not plaintext:
        return None
    prefix = ""
    for candidate in ("sk_live_", "sk_test_", "pk_live_", "pk_test_", "rk_live_", "rk_test_", "whsec_"):
        if plaintext.startswith(candidate):
            prefix = candidate
            break
    tail = plaintext[-visible:] if len(plaintext) > len(prefix) + visible else ""
    return f"{prefix}{'•' * 8}{tail}"
