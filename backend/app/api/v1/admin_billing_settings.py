"""
Super Admin -> Billing Configuration API.
File: backend/app/api/v1/admin_billing_settings.py

    GET /api/v1/admin/settings/billing   masked read model (secrets never leave the server)
    PUT /api/v1/admin/settings/billing   partial update; secrets encrypted at rest (Fernet)

SECURITY: every route requires ``require_strict_super_admin`` -- the standard ``require_super_admin``
guard PLUS record-based authority only (no dev-mode fallback, no X-Master-Admin-Key bypass).
Denials are written to the platform audit log. All reads/writes go to
the control-plane DB via ``get_platform_db``; responses are marked ``Cache-Control: no-store``.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.auth import has_record_super_admin_authority, require_super_admin
from backend.app.services.payment_gateway_settings import (
    PaymentGatewaySettingsAdminView,
    PaymentGatewaySettingsUpdate,
    apply_settings_update,
    build_admin_view,
    get_settings_row,
)
from backend.database import get_platform_db

logger = logging.getLogger("oxengl.billing.gateway_settings.api")

MAX_WALLET_QR_BYTES = 1 * 1024 * 1024  # 1 MB

_ALLOWED_QR_FORMATS = {
    "image/png": (".png", lambda d: d.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": (".jpg", lambda d: d.startswith(b"\xff\xd8\xff")),
    "image/webp": (".webp", lambda d: len(d) >= 12 and d[:4] == b"RIFF" and d[8:12] == b"WEBP"),
}

DISALLOWED_EXTENSIONS = {
    ".exe", ".sh", ".php", ".py", ".js", ".html", ".htm", ".bat", ".cmd", ".vbs", ".pl", ".cgi", ".jar", ".msi"
}

# Resolve directory locations: primary served static root and app-local static root
_BACKEND_ROOT = Path(__file__).resolve().parents[4] / "backend"
WALLET_QR_STORAGE_DIR = _BACKEND_ROOT / "static" / "uploads" / "wallets"
APP_WALLET_QR_STORAGE_DIR = _BACKEND_ROOT / "app" / "static" / "uploads" / "wallets"


class WalletQRUploadResponse(BaseModel):
    qr_code_url: str



def _audit(db: Session, request: Request, user: Any, action: str, outcome: str | None = None) -> None:
    try:
        from backend.app.main import get_request_id, record_platform_audit, resolve_client_ip
        record_platform_audit(
            db,
            actor_email=getattr(user, "email", "unknown"),
            action=action,
            endpoint=request.url.path,
            ip_address=resolve_client_ip(request),
            company_id=getattr(user, "company_id", None),
            actor_id=getattr(user, "id", None),
            outcome=outcome,
            request_id=get_request_id(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception as exc:  # noqa: BLE001 - auditing must never block the request
        logger.warning("Could not write billing-settings audit record: %s", exc)


def require_strict_super_admin(
    request: Request,
    current_user: Any = Depends(require_super_admin),
    db: Session = Depends(get_platform_db),
) -> Any:
    """Payment credentials demand record-based Super_Admin authority (no dev/header bypass)."""
    if not has_record_super_admin_authority(current_user):
        _audit(db, request, current_user, "BILLING_SETTINGS_ACCESS_DENIED", outcome="DENIED")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Billing configuration requires a Super_Admin account.",
        )
    return current_user


router = APIRouter(
    prefix="/api/v1/admin/settings",
    tags=["Super Admin Billing Configuration"],
    dependencies=[Depends(require_strict_super_admin)],
)


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


@router.get("/billing", response_model=PaymentGatewaySettingsAdminView)
def get_billing_settings(
    response: Response,
    db: Session = Depends(get_platform_db),
):
    _no_store(response)
    return build_admin_view(get_settings_row(db))


@router.put("/billing", response_model=PaymentGatewaySettingsAdminView)
def update_billing_settings(
    payload: PaymentGatewaySettingsUpdate,
    request: Request,
    response: Response,
    db: Session = Depends(get_platform_db),
    current_user: Any = Depends(require_strict_super_admin),
):
    _no_store(response)
    actor = getattr(current_user, "email", "unknown")
    result = apply_settings_update(db, payload, actor=actor)
    if result.changed_fields:
        # Field NAMES only -- values (even masked) are never logged.
        logger.info("Billing gateway settings updated by %s: %s", actor, sorted(result.changed_fields))
        _audit(db, request, current_user, "BILLING_GATEWAY_SETTINGS_UPDATED")
    return result.view


@router.post("/billing/wallet-qr", response_model=WalletQRUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_wallet_qr(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    db: Session = Depends(get_platform_db),
    current_user: Any = Depends(require_strict_super_admin),
):
    """
    Secure QR code upload endpoint for digital wallet receiving instructions.
    Accepts PNG, JPEG, and WebP images up to 1 MB. Enforces strict magic-byte validation
    and generates an unguessable UUID filename stored in the static uploads directory.
    """
    _no_store(response)

    # 1. Filename sanitization & path traversal prevention
    raw_filename = file.filename or "wallet_qr"
    if ".." in raw_filename or "/" in raw_filename or "\\" in raw_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename contains forbidden path characters.",
        )

    # Disallow executable or dangerous file extensions
    lower_filename = raw_filename.lower()
    for ext in DISALLOWED_EXTENSIONS:
        if lower_filename.endswith(ext):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Executable file extension '{ext}' is forbidden.",
            )

    # 2. Content-Length header quick check if present
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_WALLET_QR_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds maximum limit of 1 MB.",
        )

    # 3. Read up to 1 MB + 1 byte
    data = await file.read(MAX_WALLET_QR_BYTES + 1)
    if not data or len(data) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(data) > MAX_WALLET_QR_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds maximum limit of 1 MB.",
        )

    # 4. MIME sniffing & Magic Bytes validation
    matched_ext = None
    for mime_type, (ext, checker) in _ALLOWED_QR_FORMATS.items():
        if checker(data):
            matched_ext = ext
            break

    if not matched_ext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image format. Allowed formats are PNG, JPEG, and WebP with valid magic bytes.",
        )

    # Content-type header verification if provided
    if file.content_type:
        normalized_ct = file.content_type.lower().split(";")[0].strip()
        allowed_cts = {"image/png", "image/jpeg", "image/jpg", "image/webp", "application/octet-stream"}
        if normalized_ct not in allowed_cts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid Content-Type header '{normalized_ct}'. Expected image/png, image/jpeg, or image/webp.",
            )

    # 5. Generate safe UUID filename
    safe_filename = f"{uuid.uuid4().hex}{matched_ext}"

    # 6. Persist to storage directory (both served backend/static and backend/app/static)
    WALLET_QR_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    target_file = WALLET_QR_STORAGE_DIR / safe_filename
    target_file.write_bytes(data)

    try:
        APP_WALLET_QR_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        (APP_WALLET_QR_STORAGE_DIR / safe_filename).write_bytes(data)
    except Exception as exc:
        logger.warning("Could not sync QR file to app static dir: %s", exc)

    qr_url = f"/static/uploads/wallets/{safe_filename}"
    _audit(db, request, current_user, "WALLET_QR_UPLOADED")
    return WalletQRUploadResponse(qr_code_url=qr_url)

