"""Tenant-scoped synchronization of external user metadata."""

from __future__ import annotations

import binascii
import json
import logging
import os
import uuid
from typing import Any

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from standardwebhooks.webhooks import EmptyWebhookSecretError
from svix.webhooks import Webhook, WebhookVerificationError

from backend.database import get_db
from backend.models import PlatformAuditLog, ResCompany, ResUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks/sync", tags=["User Synchronization"])


def _get_signing_secret(company_id: uuid.UUID) -> str:
    configured_secrets = os.getenv("SYNC_WEBHOOK_SECRETS_JSON")
    if not configured_secrets:
        logger.error("Sync webhook secrets are not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook integration is not configured",
        )

    try:
        secrets_by_company = json.loads(configured_secrets)
    except json.JSONDecodeError:
        logger.error("Sync webhook secret mapping is invalid JSON")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook integration is not configured",
        )

    if not isinstance(secrets_by_company, dict):
        logger.error("Sync webhook secret mapping must be a JSON object")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook integration is not configured",
        )

    secret = secrets_by_company.get(str(company_id))
    if not isinstance(secret, str) or not secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )
    return secret


async def _verified_payload(request: Request, company_id: uuid.UUID) -> dict[str, Any]:
    secret = _get_signing_secret(company_id)
    raw_body = await request.body()
    try:
        verifier = Webhook(secret)
    except (EmptyWebhookSecretError, binascii.Error, ValueError):
        logger.error("Sync webhook secret is invalid for company %s", company_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook integration is not configured",
        )

    try:
        verifier.verify(raw_body, dict(request.headers))
    except (WebhookVerificationError, binascii.Error, ValueError):
        logger.warning("Sync webhook signature verification failed for company %s", company_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload")
    request.state.company_id = str(company_id)
    return payload


def _request_for_verified_company(request: Request, company_id: uuid.UUID) -> Request:
    tenant_headers = {b"x-tenant-id", b"x-company-id", b"x-tenant-slug", b"x-role"}
    scope = dict(request.scope)
    scope["headers"] = [
        (name, value)
        for name, value in request.scope.get("headers", [])
        if name.lower() not in tenant_headers
    ]
    scope["state"] = dict(request.scope.get("state", {}))
    scope["state"]["company_id"] = str(company_id)
    return Request(scope, request.receive)


def _required_sync_reference(data: dict[str, Any]) -> str:
    sync_reference_id = data.get("id")
    if not isinstance(sync_reference_id, str) or not sync_reference_id.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Missing user id")
    sync_reference_id = sync_reference_id.strip()
    if len(sync_reference_id) > 255:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid user id")
    return sync_reference_id


def _email_value(data: dict[str, Any], *, required: bool) -> str | None:
    email = data.get("email")
    if email is None and not required:
        return None
    if not isinstance(email, str) or len(email) > 255:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email")
    try:
        return validate_email(email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email")


def _optional_text(data: dict[str, Any], field: str, max_length: int) -> str | None:
    value = data.get(field)
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {field}",
        )
    return value.strip() or None


def _record_sync_audit(
    db: Session,
    request: Request,
    company_id: uuid.UUID,
    event_type: str,
) -> None:
    forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = (
        forwarded_for.split(",", 1)[0].strip()[:45]
        if forwarded_for
        else request.client.host[:45] if request.client else None
    )
    db.add(
        PlatformAuditLog(
            actor_email="user-sync-webhook",
            action=f"USER_SYNC_{event_type.upper().replace('.', '_')}",
            outcome="SUCCESS",
            endpoint_accessed=request.url.path[:255],
            request_id=request.headers.get("x-request-id", str(uuid.uuid4()))[:64],
            user_agent=request.headers.get("user-agent", "unknown")[:512],
            ip_address=client_ip,
            company_id=company_id,
        )
    )


def _process_user_event(
    db: Session,
    request: Request,
    company_id: uuid.UUID,
    event_type: str,
    data: dict[str, Any],
) -> str:
    company = db.query(ResCompany).filter(ResCompany.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    sync_reference_id = _required_sync_reference(data)
    user = (
        db.query(ResUser)
        .filter(
            ResUser.company_id == company_id,
            ResUser.sync_reference_id == sync_reference_id,
        )
        .first()
    )

    if event_type == "user.deleted":
        if user is not None:
            user.is_active = False
        result = "deactivated" if user is not None else "ignored"
    else:
        email = _email_value(data, required=user is None)
        full_name = _optional_text(data, "full_name", 255)
        phone = _optional_text(data, "phone", 64)
        is_active = data.get("is_active")
        if is_active is not None and type(is_active) is not bool:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid is_active",
            )

        if user is None:
            user = ResUser(
                id=uuid.uuid4(),
                firebase_uid=f"native:{uuid.uuid4()}",
                sync_reference_id=sync_reference_id,
                email=email,
                full_name=full_name or email,
                phone=phone,
                password_hash="",
                company_id=company_id,
                role="Guest",
                is_active=False,
            )
            db.add(user)
            result = "created"
        else:
            if email is not None:
                user.email = email
            if full_name is not None:
                user.full_name = full_name
            if "phone" in data:
                user.phone = phone
            result = "updated"

        if is_active is not None:
            user.is_active = is_active

    request.state.sync_user_id = str(user.id) if user is not None and user.id else None
    request.state.sync_user_role = user.role if user is not None else None
    _record_sync_audit(db, request, company_id, event_type)
    return result


@router.post("/{company_id}", status_code=status.HTTP_200_OK)
async def sync_user(
    company_id: uuid.UUID,
    request: Request,
    payload: dict[str, Any] = Depends(_verified_payload),
) -> dict[str, str]:
    event_type = payload.get("type")
    data = payload.get("data")
    if (
        not isinstance(event_type, str)
        or event_type not in {"user.created", "user.updated", "user.deleted"}
        or not isinstance(data, dict)
    ):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported sync event")

    # Open the tenant-aware session only after the signed endpoint mapping is verified.
    db_generator = get_db(_request_for_verified_company(request, company_id))
    db = next(db_generator)
    try:
        result = _process_user_event(db, request, company_id, event_type, data)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.warning(
                "Sync webhook persistence conflict for company %s, event %s",
                company_id,
                event_type,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User synchronization conflict",
            )
    finally:
        db_generator.close()

    logger.info(
        "Processed sync webhook event %s for company %s: %s",
        event_type,
        company_id,
        result,
    )
    return {"status": "processed", "event": event_type, "result": result}
