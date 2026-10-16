"""OxenGL Asynchronous Verification and Notification Service.

Handles multi-factor registration verification (Email/SMS OTP),
TTL-managed caching in Redis, and asynchronous external dispatch.
"""
from __future__ import annotations

import hmac
import json
import logging
import os
import secrets
from datetime import timedelta
from typing import Any, Dict, Literal, Optional, Protocol

try:
    from backend.app.core.redis import redis_client
except ImportError:
    from app.core.redis import redis_client

logger = logging.getLogger("oxengl.notification_service")


def _mask_identifier(identifier: str) -> str:
    return f"***{str(identifier)[-3:]}" if identifier else "***"


class NotificationDeliveryError(RuntimeError):
    """A credential notification could not be delivered safely."""


class TemporaryCredentialDeliveryProvider(Protocol):
    """Configured channel adapter; implementations must never log delivered credentials."""

    async def send_credentials(
        self,
        destination: str,
        temporary_password: str,
        *,
        full_name: str,
        workspace_name: str,
    ) -> bool: ...


_temporary_credential_delivery_providers: dict[str, TemporaryCredentialDeliveryProvider] = {}


def register_temporary_credential_provider(
    channel: Literal["email", "sms"], provider: TemporaryCredentialDeliveryProvider
) -> None:
    """Register the deployment's provider-specific adapter for temporary credentials."""
    _temporary_credential_delivery_providers[channel] = provider


async def dispatch_temporary_credentials(
    channel: Literal["email", "sms"],
    destination: str,
    temporary_password: str,
    *,
    full_name: str,
    workspace_name: str,
    tenant_id: Any = None,
    db: Any = None,
) -> None:
    """Deliver a temporary password through a registered or tenant-resolved adapter."""
    from backend.app.services.communication_service import CommunicationError, send_message

    provider = _temporary_credential_delivery_providers.get(channel)
    if provider is not None:
        try:
            delivered = await provider.send_credentials(
                destination,
                temporary_password,
                full_name=full_name,
                workspace_name=workspace_name,
            )
            if delivered is not True:
                raise RuntimeError("Provider did not confirm delivery.")
            return
        except Exception:
            raise NotificationDeliveryError(f"{channel.upper()} credential delivery failed.") from None

    body = (
        f"OxenGL account credentials for {full_name}: temporary password {temporary_password}. "
        "Sign in and change this password immediately."
    )
    try:
        db_session = db if hasattr(db, "scalar") else None
        await send_message(channel, destination, body, tenant_id=tenant_id, db=db_session)
    except CommunicationError as exc:
        if str(exc).startswith("No active "):
            raise NotificationDeliveryError(
                f"No {channel.upper()} credential delivery provider is configured."
            ) from None
        raise NotificationDeliveryError(f"{channel.upper()} credential delivery failed.") from None
    except Exception:
        raise NotificationDeliveryError(
            f"No {channel.upper()} credential delivery provider is configured or could be resolved."
        ) from None


import time as _time


class VerificationService:
    OTP_TTL = timedelta(minutes=5)
    # SECURITY (Addendum D): an OTP is destroyed after this many wrong guesses (anti brute force).
    MAX_OTP_ATTEMPTS = 5
    PAYLOAD_TTL = timedelta(minutes=15)
    _MEMORY_STORE: dict[str, tuple[Any, float]] = {}

    @classmethod
    def _mem_set(cls, key: str, value: Any, ttl_seconds: int) -> None:
        cls._MEMORY_STORE[key] = (value, _time.time() + ttl_seconds)

    @classmethod
    def _mem_get(cls, key: str) -> Optional[Any]:
        entry = cls._MEMORY_STORE.get(key)
        if not entry:
            return None
        val, expires_at = entry
        if _time.time() > expires_at:
            cls._MEMORY_STORE.pop(key, None)
            return None
        return val

    @classmethod
    def _mem_delete(cls, key: str) -> None:
        cls._MEMORY_STORE.pop(key, None)

    @classmethod
    def _mem_incr(cls, key: str, ttl_seconds: int) -> int:
        current = cls._mem_get(key)
        next_val = (int(current) if current is not None else 0) + 1
        entry = cls._MEMORY_STORE.get(key)
        expires_at = entry[1] if entry and _time.time() <= entry[1] else (_time.time() + ttl_seconds)
        cls._MEMORY_STORE[key] = (next_val, expires_at)
        return next_val

    @classmethod
    async def _safe_call(cls, func, *args, **kwargs):
        """Executes a Redis operation, gracefully refreshing the connection pool if an event loop transition occurred."""
        try:
            return await func(*args, **kwargs)
        except RuntimeError as e:
            err_msg = str(e).lower()
            if "event loop" in err_msg or "attached to a different loop" in err_msg:
                try:
                    await redis_client.connection_pool.disconnect()
                except Exception:
                    pass
                return await func(*args, **kwargs)
            raise

    @classmethod
    async def generate_and_store_otp(
        cls,
        identifier: str,
        ttl_seconds: Optional[int] = None,
        expire_seconds: Optional[int] = None,
    ) -> str:
        """Generates a 6-digit numeric OTP and stores it in Redis (with in-memory fallback) with a 5-minute default TTL."""
        norm_id = identifier.strip().lower()
        otp = f"{secrets.randbelow(900000) + 100000}"  # CSPRNG (was random.randint)
        key = f"otp:{norm_id}"
        ttl = ttl_seconds or expire_seconds or int(cls.OTP_TTL.total_seconds())
        cls._mem_set(key, otp, ttl)
        cls._mem_delete(f"otp_attempts:{norm_id}")
        try:
            await cls._safe_call(redis_client.set, key, otp, ex=ttl)
        except Exception as exc:
            logger.warning("Redis set fallback activated for OTP key (%s)", type(exc).__name__)
        logger.info("Generated secure OTP (recipient=%s)", _mask_identifier(norm_id))
        return otp

    @classmethod
    async def verify_otp(cls, identifier: str, provided_otp: str, consume: bool = True) -> bool:
        """Verifies the supplied OTP against Redis (or fallback store) and invalidates it upon match when consume=True."""
        norm_id = identifier.strip().lower()
        key = f"otp:{norm_id}"
        attempts_key = f"otp_attempts:{norm_id}"
        ttl = int(cls.OTP_TTL.total_seconds())

        stored_otp = None
        redis_available = True
        try:
            stored_otp = await cls._safe_call(redis_client.get, key)
        except Exception:
            redis_available = False

        if not stored_otp and not redis_available:
            stored_otp = cls._mem_get(key)
        elif not stored_otp:
            # If Redis is online and key is absent in Redis, ensure memory mirror is also cleared
            cls._mem_delete(key)
            return False

        if not stored_otp:
            return False

        val = stored_otp.decode("utf-8") if isinstance(stored_otp, bytes) else str(stored_otp)
        if hmac.compare_digest(val.strip().encode(), str(provided_otp).strip().encode()):
            if consume:
                cls._mem_delete(key)
                cls._mem_delete(attempts_key)
                if redis_available:
                    try:
                        await cls._safe_call(redis_client.delete, key)
                        await cls._safe_call(redis_client.delete, attempts_key)
                    except Exception:
                        pass
            return True

        attempts = cls._mem_incr(attempts_key, ttl)
        if redis_available:
            try:
                attempts = await cls._safe_call(redis_client.incr, attempts_key)
                if attempts == 1:
                    await cls._safe_call(redis_client.expire, attempts_key, ttl)
            except Exception:
                pass
        if attempts >= cls.MAX_OTP_ATTEMPTS:
            cls._mem_delete(key)
            cls._mem_delete(attempts_key)
            if redis_available:
                try:
                    await cls._safe_call(redis_client.delete, key)
                    await cls._safe_call(redis_client.delete, attempts_key)
                except Exception:
                    pass
            logger.warning("OTP for recipient %s destroyed after %s failed attempts", _mask_identifier(norm_id), attempts)
        return False

    @classmethod
    async def peek_otp(cls, identifier: str, provided_otp: str) -> bool:
        """Verifies the supplied OTP without consuming it on match (still enforces brute-force attempt limit)."""
        return await cls.verify_otp(identifier, provided_otp, consume=False)

    @classmethod
    async def store_registration_payload(
        cls,
        identifier: str,
        payload_data: Dict[str, Any],
        ttl_seconds: Optional[int] = None,
        expire_seconds: Optional[int] = None,
    ) -> None:
        """Temporarily caches validated registration form data in Redis pending OTP verification."""
        norm_id = identifier.strip().lower()
        key = f"otp_payload:{norm_id}"
        ttl = ttl_seconds or expire_seconds or int(cls.PAYLOAD_TTL.total_seconds())
        serialized = json.dumps(payload_data)
        cls._mem_set(key, serialized, ttl)
        try:
            await cls._safe_call(
                redis_client.set,
                key,
                serialized,
                ex=ttl,
            )
        except Exception as exc:
            logger.warning("Redis payload cache fallback activated (%s)", type(exc).__name__)

    @classmethod
    async def get_registration_payload(cls, identifier: str) -> Optional[Dict[str, Any]]:
        """Retrieves temporarily cached registration data from Redis (or fallback memory store)."""
        norm_id = identifier.strip().lower()
        key = f"otp_payload:{norm_id}"
        stored = None
        redis_available = True
        try:
            stored = await cls._safe_call(redis_client.get, key)
        except Exception:
            redis_available = False
        if not stored and not redis_available:
            stored = cls._mem_get(key)
        if stored:
            val = stored.decode("utf-8") if isinstance(stored, bytes) else str(stored)
            return json.loads(val)
        return None

    @classmethod
    async def delete_registration_payload(cls, identifier: str) -> None:
        """Deletes temporarily cached registration data once successfully provisioned."""
        norm_id = identifier.strip().lower()
        key = f"otp_payload:{norm_id}"
        cls._mem_delete(key)
        try:
            await cls._safe_call(redis_client.delete, key)
        except Exception:
            pass

    @staticmethod
    async def dispatch_email_otp(email: str, otp: str, company_name: str, tenant_id: Any = None) -> None:
        """Send a one-time code through the tenant override or platform email default."""
        from backend.app.services.communication_service import send_message

        body = f"Your OxenGL verification code for {company_name} is {otp}. It expires in 5 minutes."
        await send_message("email", email, body, tenant_id=tenant_id)

    @staticmethod
    async def dispatch_sms_otp(phone: str, otp: str, tenant_id: Any = None) -> None:
        """Send a one-time code through the tenant override or platform SMS default."""
        from backend.app.services.communication_service import send_message

        await send_message("sms", phone, f"Your OxenGL verification code is {otp}. It expires in 5 minutes.", tenant_id=tenant_id)


class NotificationService:
    """Routes OTP messages to the tenant's (or platform's) email and/or SMS provider.

    Delivery failures never propagate to the caller (the HTTP response must stay uniform to avoid
    account enumeration); they are logged without the code and audited in ``platform_audit_logs``.
    """

    CHANNELS = ("auto", "email", "sms")

    @staticmethod
    def select_channels(requested: Optional[str], has_phone: bool) -> list[str]:
        """auto = email plus SMS when a phone exists; sms falls back to email without a phone."""
        choice = (requested or "auto").strip().lower()
        if choice == "email":
            return ["email"]
        if choice == "sms":
            return ["sms"] if has_phone else ["email"]
        return ["email", "sms"] if has_phone else ["email"]

    @staticmethod
    def _audit(context: Any, action: str, outcome: str, tenant_id: Any) -> None:
        if context is None:
            return
        try:
            from backend.app.domains.hr.audit import append_audit_from_context
            from backend.database import PlatformSessionLocal

            if PlatformSessionLocal is None:
                return
            db = PlatformSessionLocal()
            try:
                append_audit_from_context(db, context, action=action, outcome=outcome, tenant_id=tenant_id)
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()
        except Exception as exc:
            logger.error("Could not write OTP delivery audit entry (%s)", type(exc).__name__)

    @staticmethod
    def _enabled_channels(tenant_id: Any) -> dict[str, bool]:
        """Recovery-channel switches; fails open (everything enabled) if the settings cannot be read."""
        import uuid as _uuid

        try:
            from backend.app.services import communication_service
            from backend.database import PlatformSessionLocal
        except Exception:
            return {"email": True, "sms": True}
        if PlatformSessionLocal is None:
            return {"email": True, "sms": True}
        try:
            parsed = tenant_id if isinstance(tenant_id, _uuid.UUID) else (_uuid.UUID(str(tenant_id)) if tenant_id else None)
        except ValueError:
            parsed = None
        db = PlatformSessionLocal()
        try:
            flags = communication_service.resolve_recovery_channels(db, parsed)
            return {"email": flags["email_enabled"], "sms": flags["sms_enabled"]}
        except Exception as exc:
            logger.error("Could not read recovery channel settings (%s)", type(exc).__name__)
            return {"email": True, "sms": True}
        finally:
            db.close()

    @classmethod
    async def send_password_reset_otp(
        cls,
        channels: list[str],
        *,
        email: str,
        phone: Optional[str],
        otp: str,
        company_name: str,
        tenant_id: Any = None,
        audit_context: Any = None,
    ) -> None:
        enabled = cls._enabled_channels(tenant_id)
        for channel in channels:
            if not enabled.get(channel, True):
                logger.warning("Password reset OTP channel %s disabled by recovery settings (tenant=%s)", channel, tenant_id)
                cls._audit(audit_context, f"auth.password_reset.otp_{channel}", "skipped_disabled", tenant_id)
                continue
            try:
                if channel == "sms":
                    if not phone:
                        raise NotificationDeliveryError("No phone number on file.")
                    await VerificationService.dispatch_sms_otp(phone, otp, tenant_id)
                else:
                    await VerificationService.dispatch_email_otp(email, otp, company_name, tenant_id)
            except Exception as exc:
                logger.error(
                    "Password reset OTP delivery failed (channel=%s tenant=%s reason=%s)",
                    channel, tenant_id, str(exc)[:200] if isinstance(exc, (NotificationDeliveryError,)) or type(exc).__name__ == "CommunicationError" else type(exc).__name__,
                )
                cls._audit(audit_context, f"auth.password_reset.otp_{channel}", "failure", tenant_id)
            else:
                cls._audit(audit_context, f"auth.password_reset.otp_{channel}", "success", tenant_id)
