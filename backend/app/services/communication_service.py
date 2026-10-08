"""Tenant-aware transactional email and SMS provider resolution and delivery."""
from __future__ import annotations

import asyncio
import email.utils
import json
import logging
import re
import smtplib
import socket
import ssl
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any, Mapping

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.services import backup_destination_service as backup_credentials
from backend.app.services.backup_service import redact_secrets
from backend.models import CommunicationSetting, RecoveryChannelSetting

logger = logging.getLogger("oxengl.communications")

PROVIDER_CHANNELS = {
    "smtp": "email",
    "sendgrid": "email",
    "twilio": "sms",
    "unifonic": "sms",
    "taqnyat": "sms",
    "custom_http": "sms",
}
CONFIG_KEYS = {
    "smtp": frozenset({"host", "port", "security", "username"}),
    "sendgrid": frozenset({"region"}),
    "twilio": frozenset({"account_sid", "region"}),
    "unifonic": frozenset({"region"}),
    "taqnyat": frozenset({"region"}),
    "custom_http": frozenset({"url", "method", "payload_template"}),
}
CREDENTIAL_FIELDS = {
    "smtp": frozenset({"password"}),
    "sendgrid": frozenset({"api_key"}),
    "twilio": frozenset({"auth_token"}),
    "unifonic": frozenset({"app_sid"}),
    "taqnyat": frozenset({"api_token"}),
    "custom_http": frozenset({"headers"}),
}
MAX_CREDENTIAL_LEN = 8192
MAX_PAYLOAD_TEMPLATE_LEN = 4096
FORBIDDEN_HEADERS = frozenset({"host", "content-length", "transfer-encoding", "connection"})
_HEADER_NAME_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")


class CommunicationError(RuntimeError):
    """A safe, non-secret-bearing error suitable for an API or delivery caller."""


class CommunicationCredentialCipher(backup_credentials.CredentialCipher):
    """Backup master-key compatibility with cryptographic domain separation for comms."""

    _AAD_PREFIX = b"oxengl-communication-setting-credentials/v1|"


_cipher = CommunicationCredentialCipher()


MASKED_CREDENTIAL_VALUES = frozenset({"********", "••••••••", "Stored credential; leave blank to keep unchanged"})


def _clean_text(value: Any, field: str, maximum: int = 255) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text")
    clean = value.strip()
    if not clean or len(clean) > maximum or "\x00" in clean:
        raise ValueError(f"{field} is invalid")
    return clean


def _validate_custom_http_config(config: Mapping[str, Any], *, tenant_scoped: bool) -> dict[str, Any]:
    from urllib.parse import urlsplit

    url = _clean_text(config.get("url"), "url", 2048)
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        raise ValueError("url must be an https URL without embedded credentials")
    try:
        backup_credentials.validate_destination_host(
            parts.hostname.lower().rstrip("."), allow_internal=not tenant_scoped
        )
    except backup_credentials.DestinationValidationError as exc:
        raise ValueError(str(exc)) from None
    method = str(config.get("method", "POST")).strip().upper()
    if method not in {"POST", "GET"}:
        raise ValueError("method must be POST or GET")
    template = config.get("payload_template")
    if template is None or (isinstance(template, str) and not template.strip()):
        template = '{"to": "{phone}", "message": "{message}"}'
    template = _clean_text(template, "payload_template", MAX_PAYLOAD_TEMPLATE_LEN)
    try:
        parsed = json.loads(template)
    except ValueError:
        raise ValueError("payload_template must be valid JSON") from None
    if not isinstance(parsed, dict):
        raise ValueError("payload_template must be a JSON object")
    if "{phone}" not in template or "{message}" not in template:
        raise ValueError("payload_template must contain the {phone} and {message} placeholders")
    return {"url": url, "method": method, "payload_template": template}


def parse_custom_headers(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        raise ValueError("headers must be a JSON object") from None
    if not isinstance(data, dict) or len(data) > 20:
        raise ValueError("headers must be a JSON object with at most 20 entries")
    clean: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str) or not _HEADER_NAME_RE.fullmatch(key) or key.lower() in FORBIDDEN_HEADERS:
            raise ValueError("header name is invalid")
        if not isinstance(value, str) or len(value) > 2048 or re.search(r"[\r\n\x00]", value):
            raise ValueError("header value is invalid")
        clean[key] = value
    return clean


def render_payload_template(template: str, phone: str, message: str) -> dict[str, Any]:
    """Substitute placeholders inside parsed JSON string values, so values can never break the JSON structure."""
    def walk(node: Any) -> Any:
        if isinstance(node, str):
            return node.replace("{phone}", phone).replace("{message}", message)
        if isinstance(node, list):
            return [walk(item) for item in node]
        if isinstance(node, dict):
            return {key: walk(value) for key, value in node.items()}
        return node

    return walk(json.loads(template))


def validate_config(provider: str, raw_config: Mapping[str, Any] | None, *, tenant_scoped: bool) -> dict[str, Any]:
    if provider not in CONFIG_KEYS:
        raise ValueError("unsupported communication provider")
    config = dict(raw_config or {})
    unknown = set(config) - CONFIG_KEYS[provider]
    if unknown:
        raise ValueError("unsupported provider config fields: " + ", ".join(sorted(unknown)))
    clean: dict[str, Any] = {}
    if provider == "smtp":
        host = _clean_text(config.get("host"), "host", 253).lower().rstrip(".")
        try:
            clean["host"] = backup_credentials.validate_destination_host(
                host, allow_internal=not tenant_scoped
            )
        except backup_credentials.DestinationValidationError as exc:
            raise ValueError(str(exc)) from None
        try:
            port = int(config.get("port", 587))
        except (TypeError, ValueError):
            raise ValueError("port must be an integer") from None
        if not 1 <= port <= 65535:
            raise ValueError("port must be between 1 and 65535")
        security = str(config.get("security", "starttls")).strip().lower()
        if security not in {"starttls", "ssl"}:
            raise ValueError("SMTP security must be starttls or ssl")
        if port == 465:
            security = "ssl"
        clean.update(port=port, security=security)
        username = config.get("username")
        if username:
            clean["username"] = _clean_text(username, "username", 255)
    elif provider == "twilio":
        clean["account_sid"] = _clean_text(config.get("account_sid"), "account_sid", 64)
        if not re.fullmatch(r"AC[a-fA-F0-9]{32}", clean["account_sid"]):
            raise ValueError("account_sid is invalid")
        region = str(config.get("region", "us1")).strip().lower()
        if not re.fullmatch(r"[a-z0-9-]{1,32}", region):
            raise ValueError("region is invalid")
        clean["region"] = region
    elif provider == "custom_http":
        clean.update(_validate_custom_http_config(config, tenant_scoped=tenant_scoped))
    elif provider in {"sendgrid", "unifonic", "taqnyat"}:
        region = str(config.get("region", "global")).strip().lower()
        if not re.fullmatch(r"[a-z0-9-]{1,32}", region):
            raise ValueError("region is invalid")
        clean["region"] = region
    return clean


def validate_setting(
    *, channel: str, provider: str, sender_identity: str, config: Mapping[str, Any] | None,
    credentials: Mapping[str, Any] | None, tenant_scoped: bool, existing_credentials: Mapping[str, str] | None = None,
    require_credentials: bool = True,
) -> tuple[str, dict[str, Any], dict[str, str]]:
    if PROVIDER_CHANNELS.get(provider) != channel:
        raise ValueError("provider is not supported for this channel")
    sender = _clean_text(sender_identity, "sender_identity")
    if channel == "email":
        _, address = email.utils.parseaddr(sender)
        if not address or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", address):
            raise ValueError("sender_identity must contain a valid email address")
    elif not re.fullmatch(r"[+A-Za-z0-9 ._-]{1,32}", sender):
        raise ValueError("sender_identity is invalid")
    clean_config = validate_config(provider, config, tenant_scoped=tenant_scoped)
    values = {key: value for key, value in (existing_credentials or {}).items() if key in CREDENTIAL_FIELDS[provider]}
    if credentials and not isinstance(credentials, Mapping):
        raise ValueError("credentials must be an object")
    supplied = {
        key: raw for key, raw in dict(credentials or {}).items()
        if not (raw is None or (isinstance(raw, str) and (not raw.strip() or raw.strip() in MASKED_CREDENTIAL_VALUES)))
    }
    unknown = set(supplied) - CREDENTIAL_FIELDS[provider]
    if unknown:
        raise ValueError("unsupported credential fields: " + ", ".join(sorted(unknown)))
    for key, raw in supplied.items():
        if not isinstance(raw, str) or not raw.strip() or len(raw) > MAX_CREDENTIAL_LEN or "\x00" in raw:
            raise ValueError(f"credential field '{key}' is invalid")
        values[key] = raw.strip()
    required = CREDENTIAL_FIELDS[provider]
    if provider == "smtp" and not clean_config.get("username"):
        required = frozenset()
    if provider == "custom_http":
        required = frozenset()
        parse_custom_headers(values.get("headers"))
    missing = required - values.keys()
    if missing and require_credentials:
        raise ValueError("credential field required: " + ", ".join(sorted(missing)))
    return sender, clean_config, values


def serialize_setting(row: CommunicationSetting) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "tenant_id": str(row.tenant_id) if row.tenant_id else None,
        "scope": "tenant" if row.tenant_id else "platform",
        "channel": row.channel,
        "provider": row.provider,
        "sender_identity": row.sender_identity,
        "config": dict(row.config or {}),
        "is_active": bool(row.is_active),
        "has_credential": bool(row.credentials_encrypted),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "created_by": str(row.created_by) if row.created_by else None,
        "last_test_at": row.last_test_at,
        "last_test_status": row.last_test_status,
        "last_test_error": redact_secrets(row.last_test_error or "", max_len=500) or None,
    }


def resolve_setting(db: Session, tenant_id: uuid.UUID | None, channel: str) -> CommunicationSetting:
    if channel not in {"email", "sms"}:
        raise CommunicationError("Unsupported communication channel.")
    if tenant_id is not None:
        tenant_setting = db.scalar(
            select(CommunicationSetting).where(
                CommunicationSetting.tenant_id == tenant_id,
                CommunicationSetting.channel == channel,
                CommunicationSetting.is_active.is_(True),
            )
        )
        if tenant_setting is not None:
            return tenant_setting
    platform_setting = db.scalar(
        select(CommunicationSetting).where(
            CommunicationSetting.tenant_id.is_(None),
            CommunicationSetting.channel == channel,
            CommunicationSetting.is_active.is_(True),
        )
    )
    if platform_setting is None:
        raise CommunicationError(f"No active {channel.upper()} communication provider is configured.")
    return platform_setting


async def _request(method: str, url: str, **kwargs: Any) -> httpx.Response:
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0), follow_redirects=False) as client:
        return await client.request(method, url, **kwargs)


def _sender_email(sender_identity: str) -> tuple[str, str]:
    name, address = email.utils.parseaddr(sender_identity)
    return name, address


def _smtp_send(setting: CommunicationSetting, destination: str, body: str, credentials: Mapping[str, str]) -> None:
    config = setting.config or {}
    message = EmailMessage()
    message["From"] = setting.sender_identity
    message["To"] = destination
    message["Subject"] = "OxenGL notification"
    message.set_content(body)
    host = config.get("host")
    if not host:
        raise CommunicationError("SMTP host is not configured.")
    try:
        port = int(config.get("port") or 25)
    except (ValueError, TypeError):
        raise CommunicationError("Invalid SMTP port configuration.")

    security = (config.get("security") or "").strip().lower()
    username = config.get("username")
    password = credentials.get("password") if credentials else None
    timeout = 10

    logger.info(
        "Initiating SMTP delivery to %s via %s:%s (security=%s, user=%s, tenant_id=%s)",
        destination, host, port, security, username or "none", setting.tenant_id,
    )

    client = None
    try:
        if port == 465 or security == "ssl":
            ctx = ssl.create_default_context()
            client = smtplib.SMTP_SSL(host, port, timeout=timeout, context=ctx)
            if username:
                if not password:
                    logger.error(
                        "SMTP credentials missing password for user '%s' on %s:%s (tenant_id=%s). Credentials may need re-entry.",
                        username, host, port, setting.tenant_id,
                    )
                    raise CommunicationError(f"SMTP authentication requires a password for user '{username}', but credentials were missing or could not be decrypted.")
                client.login(username, password)
            refused = client.send_message(message)
        else:
            client = smtplib.SMTP(host, port, timeout=timeout)
            client.ehlo()
            if security == "starttls" or client.has_extn("starttls"):
                ctx = ssl.create_default_context()
                client.starttls(context=ctx)
                client.ehlo()
            if username:
                if not password:
                    logger.error(
                        "SMTP credentials missing password for user '%s' on %s:%s (tenant_id=%s). Credentials may need re-entry.",
                        username, host, port, setting.tenant_id,
                    )
                    raise CommunicationError(f"SMTP authentication requires a password for user '{username}', but credentials were missing or could not be decrypted.")
                client.login(username, password)
            refused = client.send_message(message)

        if refused:
            logger.error(
                "SMTP Recipient Refused by server %s:%s for recipient %s (tenant_id=%s): %s",
                host, port, destination, setting.tenant_id, refused,
            )
            raise CommunicationError(f"SMTP server refused recipient '{destination}': {refused}")

        logger.info(
            "SMTP delivery successful to %s via %s:%s (tenant_id=%s)",
            destination, host, port, setting.tenant_id,
        )
    except smtplib.SMTPAuthenticationError as auth_err:
        code = getattr(auth_err, "smtp_code", None)
        raw_msg = getattr(auth_err, "smtp_error", "")
        err_text = raw_msg.decode(errors="replace") if isinstance(raw_msg, bytes) else str(raw_msg)
        logger.error(
            "SMTP Authentication Failure (code=%s user=%s host=%s:%s tenant_id=%s): %s",
            code, username, host, port, setting.tenant_id, err_text,
            exc_info=True,
        )
        raise CommunicationError(f"SMTP authentication failed (code {code}) for user '{username}' on '{host}:{port}': {err_text}") from auth_err
    except (smtplib.SMTPConnectError, ConnectionRefusedError, socket.timeout, TimeoutError, OSError) as conn_err:
        logger.error(
            "SMTP Connection Failure to %s:%s (security=%s tenant_id=%s): %s",
            host, port, security, setting.tenant_id, conn_err,
            exc_info=True,
        )
        raise CommunicationError(f"SMTP connection to '{host}:{port}' failed: {conn_err}") from conn_err
    except (ssl.SSLError, ssl.CertificateError) as ssl_err:
        logger.error(
            "SMTP TLS/SSL Handshake Failure on %s:%s (security=%s tenant_id=%s): %s",
            host, port, security, setting.tenant_id, ssl_err,
            exc_info=True,
        )
        raise CommunicationError(f"SMTP TLS/SSL handshake failed on '{host}:{port}': {ssl_err}") from ssl_err
    except smtplib.SMTPRecipientsRefused as rec_err:
        logger.error(
            "SMTP Recipient Refused for %s on %s:%s (tenant_id=%s): %s",
            destination, host, port, setting.tenant_id, rec_err,
            exc_info=True,
        )
        raise CommunicationError(f"SMTP recipient '{destination}' was refused by {host}: {rec_err}") from rec_err
    except smtplib.SMTPException as smtp_err:
        logger.error(
            "SMTP Protocol Failure on %s:%s (tenant_id=%s): %s",
            host, port, setting.tenant_id, smtp_err,
            exc_info=True,
        )
        raise CommunicationError(f"SMTP protocol error on '{host}:{port}': {smtp_err}") from smtp_err
    finally:
        if client is not None:
            try:
                client.quit()
            except Exception:
                pass


async def deliver(setting: CommunicationSetting, destination: str, body: str) -> None:
    if not destination or len(destination) > 320 or "\x00" in destination:
        raise CommunicationError("Recipient is invalid.")
    credentials: dict[str, str] = {}
    if setting.credentials_encrypted:
        try:
            credentials = _cipher.decrypt(setting.id, setting.tenant_id, setting.credentials_encrypted)
        except Exception as dec_err:
            logger.error(
                "Failed to decrypt communication credentials for setting %s (tenant_id=%s provider=%s): %s",
                setting.id, setting.tenant_id, setting.provider, dec_err,
                exc_info=True,
            )
            credentials = {}

    config = setting.config or {}
    try:
        if setting.provider == "smtp":
            if setting.tenant_id is not None:
                config = validate_config("smtp", config, tenant_scoped=True)
            await asyncio.to_thread(_smtp_send, setting, destination, body, credentials)
            return
        if setting.provider == "sendgrid":
            _, sender = _sender_email(setting.sender_identity)
            response = await _request(
                "POST", "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {credentials['api_key']}", "Content-Type": "application/json"},
                json={"personalizations": [{"to": [{"email": destination}]}],
                      "from": {"email": sender}, "subject": "OxenGL notification",
                      "content": [{"type": "text/plain", "value": body}]},
            )
            if response.status_code != 202:
                raise CommunicationError("Email provider did not accept the message.")
            return
        if setting.provider == "twilio":
            account_sid = config["account_sid"]
            response = await _request(
                "POST", f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
                auth=(account_sid, credentials["auth_token"]),
                data={"To": destination, "From": setting.sender_identity, "Body": body},
            )
            if response.status_code != 201:
                raise CommunicationError("SMS provider did not accept the message.")
            return
        if setting.provider == "unifonic":
            response = await _request(
                "POST", "https://el.cloud.unifonic.com/rest/SMS/messages",
                data={"AppSid": credentials["app_sid"], "Recipient": destination,
                      "Body": body, "SenderID": setting.sender_identity},
            )
            if response.status_code not in {200, 201, 202}:
                raise CommunicationError("SMS provider did not accept the message.")
            result = response.json()
            if not isinstance(result, dict) or result.get("success") is False:
                raise CommunicationError("SMS provider did not confirm the message.")
            return
        if setting.provider == "taqnyat":
            response = await _request(
                "POST", "https://api.taqnyat.sa/v1/messages",
                headers={"Authorization": f"Bearer {credentials['api_token']}"},
                json={"recipients": [destination], "body": body, "sender": setting.sender_identity},
            )
            if response.status_code not in {200, 201, 202}:
                raise CommunicationError("SMS provider did not accept the message.")
            result = response.json()
            if not isinstance(result, dict) or result.get("status") in {"failed", "error"}:
                raise CommunicationError("SMS provider did not confirm the message.")
            return
        if setting.provider == "custom_http":
            config = validate_config("custom_http", config, tenant_scoped=setting.tenant_id is not None)
            payload = render_payload_template(config["payload_template"], destination, body)
            headers = parse_custom_headers(credentials.get("headers"))
            if config["method"] == "GET":
                response = await _request("GET", config["url"], headers=headers, params=payload)
            else:
                response = await _request("POST", config["url"], headers=headers, json=payload)
            if not 200 <= response.status_code < 300:
                raise CommunicationError("SMS provider did not accept the message.")
            return
        raise CommunicationError("Unsupported communication provider.")
    except CommunicationError:
        raise
    except Exception as exc:
        logger.error(
            "Communication provider request failed (channel=%s provider=%s error=%s): %s",
            setting.channel, setting.provider, type(exc).__name__, exc,
            exc_info=True,
        )
        raise CommunicationError(f"{setting.channel.upper()} delivery failed through provider '{setting.provider}': {exc}") from None


async def send_message(
    channel: str, destination: str, body: str, *, tenant_id: uuid.UUID | None,
    db: Session | None = None,
) -> None:
    owned_db = db is None
    if db is None:
        from backend.database import PlatformSessionLocal

        if PlatformSessionLocal is None:
            raise CommunicationError("Platform communication database access is not configured.")
        db = PlatformSessionLocal()
    try:
        if tenant_id is not None and not isinstance(tenant_id, uuid.UUID):
            try:
                tenant_id = uuid.UUID(str(tenant_id))
            except (ValueError, TypeError, AttributeError):
                raise CommunicationError("Tenant communication scope is invalid.") from None

        # Automatic fallback: if tenant_id is None for email channel, resolve from user's registered company
        if tenant_id is None and channel == "email" and destination:
            try:
                from backend.models import ResUser
                from sqlalchemy import func
                resolved_cid = db.scalar(
                    select(ResUser.company_id).where(
                        func.lower(ResUser.email) == destination.strip().lower(),
                        ResUser.company_id.isnot(None),
                    ).limit(1)
                )
                if resolved_cid:
                    tenant_id = resolved_cid
                    logger.info("send_message: Resolved tenant_id %s from recipient email %s", tenant_id, destination)
            except Exception:
                db.rollback()

        if channel == "email" and tenant_id is not None:
            tenant_setting = db.scalar(
                select(CommunicationSetting).where(
                    CommunicationSetting.tenant_id == tenant_id,
                    CommunicationSetting.channel == "email",
                    CommunicationSetting.is_active.is_(True),
                )
            )
            if tenant_setting is not None:
                try:
                    await deliver(tenant_setting, destination, body)
                    return
                except CommunicationError as err:
                    platform_setting = db.scalar(
                        select(CommunicationSetting).where(
                            CommunicationSetting.tenant_id.is_(None),
                            CommunicationSetting.channel == "email",
                            CommunicationSetting.is_active.is_(True),
                        )
                    )
                    if platform_setting is None:
                        logger.error(
                            "Tenant email delivery failed and no platform setting exists (tenant_id=%s tenant_setting_id=%s provider=%s): %s",
                            tenant_id,
                            tenant_setting.id,
                            tenant_setting.provider,
                            err,
                            exc_info=True,
                        )
                        raise
                    logger.warning(
                        "Tenant email delivery failed; attempting platform fallback "
                        "(tenant_id=%s tenant_setting_id=%s provider=%s error=%s)",
                        tenant_id,
                        tenant_setting.id,
                        tenant_setting.provider,
                        err,
                    )
                    try:
                        await deliver(platform_setting, destination, body)
                        return
                    except CommunicationError:
                        logger.error(
                            "Tenant and platform email delivery both failed "
                            "(tenant_id=%s tenant_setting_id=%s platform_setting_id=%s)",
                            tenant_id,
                            tenant_setting.id,
                            platform_setting.id,
                            exc_info=True,
                        )
                        raise CommunicationError(
                            "Email delivery failed through both tenant and platform providers."
                        ) from None
            else:
                setting = resolve_setting(db, tenant_id, channel)
        else:
            setting = resolve_setting(db, tenant_id, channel)
        await deliver(setting, destination, body)
    finally:
        if owned_db:
            db.close()


def create_setting(
    db: Session, *, tenant_id: uuid.UUID | None, actor_id: uuid.UUID | None,
    channel: str, provider: str, sender_identity: str, config: Mapping[str, Any] | None,
    credentials: Mapping[str, Any] | None, is_active: bool,
) -> CommunicationSetting:
    sender, clean_config, clean_credentials = validate_setting(
        channel=channel, provider=provider, sender_identity=sender_identity, config=config,
        credentials=credentials, tenant_scoped=tenant_id is not None,
    )
    row = CommunicationSetting(
        id=uuid.uuid4(), tenant_id=tenant_id, channel=channel, provider=provider,
        sender_identity=sender, config=clean_config,
        credentials_encrypted=None,
        is_active=is_active, created_by=actor_id,
    )
    if clean_credentials:
        row.credentials_encrypted = _cipher.encrypt(row.id, row.tenant_id, clean_credentials)
    db.add(row)
    db.flush()
    return row


def update_setting(db: Session, row: CommunicationSetting, changes: Mapping[str, Any]) -> CommunicationSetting:
    channel = changes.get("channel", row.channel)
    provider = changes.get("provider", row.provider)
    raw_credentials = changes.get("credentials")
    current_credentials: Mapping[str, str] = {}
    decrypt_failed = False
    if row.credentials_encrypted:
        try:
            current_credentials = _cipher.decrypt(row.id, row.tenant_id, row.credentials_encrypted)
        except Exception:
            logger.exception("Failed to decrypt stored communication credentials for setting %s", row.id)
            decrypt_failed = True
    sender, config, clean_credentials = validate_setting(
        channel=channel, provider=provider,
        sender_identity=changes.get("sender_identity", row.sender_identity),
        config=changes.get("config", row.config or {}), credentials=raw_credentials,
        tenant_scoped=row.tenant_id is not None, existing_credentials=current_credentials,
        require_credentials=not decrypt_failed,
    )
    row.channel = channel
    row.provider = provider
    row.sender_identity = sender
    row.config = config
    row.is_active = changes.get("is_active", row.is_active)
    if clean_credentials:
        row.credentials_encrypted = _cipher.encrypt(row.id, row.tenant_id, clean_credentials)
    elif not decrypt_failed:
        row.credentials_encrypted = None
    row.updated_at = datetime.now(timezone.utc)
    row.last_test_status = None
    row.last_test_at = None
    row.last_test_error = None
    db.flush()
    return row


def delete_setting(db: Session, row: CommunicationSetting) -> uuid.UUID:
    setting_id = row.id
    db.delete(row)
    db.flush()
    return setting_id


async def test_setting(db: Session, row: CommunicationSetting, recipient: str) -> tuple[bool, str]:
    now = datetime.now(timezone.utc)
    try:
        await deliver(row, recipient, "OxenGL Communications test message. No action is required.")
        row.last_test_at = now
        row.last_test_status = "success"
        row.last_test_error = None
        db.flush()
        return True, "Provider accepted the test message."
    except CommunicationError as exc:
        row.last_test_at = now
        row.last_test_status = "failed"
        row.last_test_error = redact_secrets(str(exc), max_len=500)
        db.flush()
        return False, "Provider did not accept the test message."


def resolve_recovery_channels(db: Session, tenant_id: uuid.UUID | None) -> dict[str, bool]:
    """Effective recovery-channel switches: tenant row, else platform row, else everything enabled."""
    rows: list[RecoveryChannelSetting] = []
    if tenant_id is not None:
        rows.extend(db.scalars(select(RecoveryChannelSetting).where(RecoveryChannelSetting.tenant_id == tenant_id)))
    if not rows:
        rows.extend(db.scalars(select(RecoveryChannelSetting).where(RecoveryChannelSetting.tenant_id.is_(None))))
    if not rows:
        return {"email_enabled": True, "sms_enabled": True}
    return {"email_enabled": bool(rows[0].email_enabled), "sms_enabled": bool(rows[0].sms_enabled)}


def upsert_recovery_channels(
    db: Session, tenant_id: uuid.UUID | None, *, email_enabled: bool, sms_enabled: bool, updated_by: uuid.UUID | None
) -> dict[str, bool]:
    stmt = select(RecoveryChannelSetting).where(
        RecoveryChannelSetting.tenant_id == tenant_id if tenant_id is not None else RecoveryChannelSetting.tenant_id.is_(None)
    )
    row = db.scalars(stmt).first()
    if row is None:
        row = RecoveryChannelSetting(id=uuid.uuid4(), tenant_id=tenant_id)
        db.add(row)
    row.email_enabled, row.sms_enabled, row.updated_by = email_enabled, sms_enabled, updated_by
    db.flush()
    return {"email_enabled": row.email_enabled, "sms_enabled": row.sms_enabled}
