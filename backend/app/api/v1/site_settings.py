"""Platform-wide, admin-editable landing page copy, site logo, brand identity, and footer details.

``site_settings`` is global platform content (not tenant data), so it carries no company_id.
Reads are public; writes require an active platform administrator and are audited.
"""
from __future__ import annotations

import base64
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from backend.app.api.v1.branding import _authenticate_branding_editor, _require_active_platform_admin
from backend.app.domains.hr.audit import append_audit_from_context, build_audit_context
from backend.database import get_db
from backend.models import SiteSetting

logger = logging.getLogger("oxengl.site_settings")

router = APIRouter(prefix="/api/settings", tags=["Site Settings"])

ALLOWED_KEYS = (
    "site_logo",
    "site_name",
    "site_description",
    "site_tagline",
    "landing_headline",
    "landing_subheadline",
    "contact_email",
    "contact_phone",
    "contact_address",
)

DEFAULT_SITE_SETTINGS: Dict[str, str] = {
    "site_name": "OxenGL",
    "site_logo": "/oxengl-wordmark.svg",
    "site_description": "Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.",
    "site_tagline": "Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.",
    "landing_headline": "Sovereign Multi-Tenant ERP Architecture for the Kingdom of Saudi Arabia",
    "landing_subheadline": "Sub-millisecond query isolation, cryptographic ZATCA Phase 2 compliance, and raw quarry logistics orchestration—engineered on bare-metal PostgreSQL 16 and FastAPI.",
    "contact_email": "ops@oxengl.me",
    "contact_phone": "+966 11 000 0000",
    "contact_address": "Riyadh, Saudi Arabia",
}

MAX_VALUE_LENGTH = 10_000_000
MAX_LOGO_BYTES = 5 * 1024 * 1024

LOGO_STORAGE_DIR = Path(__file__).resolve().parents[4] / "backend" / "static" / "logos"

_ALLOWED_LOGO_FORMATS = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
    "image/svg+xml": (".svg", lambda data: b"<svg" in data.lower() or data.strip().startswith(b"<?xml")),
}


class SiteSettingUpdate(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    value: str = Field(max_length=MAX_VALUE_LENGTH)

    @field_validator("key")
    @classmethod
    def _known_key(cls, v: str) -> str:
        if v not in ALLOWED_KEYS:
            raise ValueError(f"Unsupported setting key: {v}")
        return v

    @field_validator("value")
    @classmethod
    def _non_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Setting value must not be empty")
        return v


class LogoBase64UploadRequest(BaseModel):
    fileName: Optional[str] = None
    fileBuffer: str = Field(min_length=1, max_length=MAX_VALUE_LENGTH)


@router.get("/public")
def get_public_settings(db: Session = Depends(get_db)) -> Dict[str, str]:
    """Retrieve platform-wide public identity, logo, tagline, and landing settings."""
    rows = db.query(SiteSetting).filter(SiteSetting.key.in_(ALLOWED_KEYS)).all()
    db_data = {row.key: row.value for row in rows}
    merged = {**DEFAULT_SITE_SETTINGS, **db_data}
    if "site_description" in db_data and "site_tagline" not in db_data:
        merged["site_tagline"] = db_data["site_description"]
    elif "site_tagline" in db_data and "site_description" not in db_data:
        merged["site_description"] = db_data["site_tagline"]
    return merged


@router.get("/admin")
def get_admin_settings(
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Admin-authenticated retrieval of site settings with all defaults populated."""
    claims = _authenticate_branding_editor(request, action="view site settings")
    _require_active_platform_admin(claims, db)
    return get_public_settings(db=db)


@router.put("/admin")
def update_admin_settings(
    updates: List[SiteSettingUpdate],
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, object]:
    """Update global platform identity, logo, tagline, headline, and footer copy."""
    claims = _authenticate_branding_editor(request, action="update site settings")
    admin = _require_active_platform_admin(claims, db)

    update_dict = {item.key: item.value for item in updates}
    # Keep site_description and site_tagline synchronized if only one was sent
    if "site_description" in update_dict and "site_tagline" not in update_dict:
        update_dict["site_tagline"] = update_dict["site_description"]
    elif "site_tagline" in update_dict and "site_description" not in update_dict:
        update_dict["site_description"] = update_dict["site_tagline"]

    for key, value in update_dict.items():
        row = db.query(SiteSetting).filter(SiteSetting.key == key).first()
        if row:
            row.value = value
        else:
            db.add(SiteSetting(key=key, value=value))

    context = build_audit_context(request, actor_id=admin.id, actor_identifier=getattr(admin, "email", None))
    append_audit_from_context(db, context, action="SITE_SETTINGS_UPDATED", outcome="SUCCESS", tenant_id=None)
    db.commit()
    return {"status": "success", "updated": list(update_dict.keys())}


def _save_logo_bytes(image_data: bytes, ext: str, original_name: Optional[str] = None) -> str:
    """Save logo bytes to disk and return public access URL."""
    LOGO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"site_logo_{uuid.uuid4().hex[:12]}{ext}"
    target_path = LOGO_STORAGE_DIR / filename
    target_path.write_bytes(image_data)

    # Also replicate to frontend static asset directories if available
    for public_dir in [
        Path(__file__).resolve().parents[4] / "frontend" / "public" / "assets",
        Path("/var/www/oxengl/dist/assets"),
        Path("/var/www/erp/frontend/dist/assets"),
    ]:
        try:
            if public_dir.exists() and public_dir.is_dir():
                (public_dir / filename).write_bytes(image_data)
        except Exception:
            pass

    return f"/api/settings/logo/{filename}"


@router.post("/upload-logo")
async def upload_logo_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> Dict[str, object]:
    """Upload a new platform logo via multipart/form-data and persist it to site_settings."""
    claims = _authenticate_branding_editor(request, action="upload site logo")
    admin = _require_active_platform_admin(claims, db)

    image_data = await file.read(MAX_LOGO_BYTES + 1)
    if not image_data or len(image_data) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Logo must be a non-empty image file no larger than 5 MB.",
        )

    matched_format = None
    for _media_type, (extension, checker) in _ALLOWED_LOGO_FORMATS.items():
        if checker(image_data):
            matched_format = extension
            break

    if not matched_format:
        # Check by filename extension if binary signature is lenient (e.g. clean SVG)
        filename_ext = os.path.splitext(file.filename or "")[1].lower()
        if filename_ext in (".svg", ".png", ".jpg", ".jpeg", ".webp"):
            matched_format = filename_ext
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported image format. Allowed formats: PNG, SVG, JPEG, WEBP.",
            )

    logo_url = _save_logo_bytes(image_data, matched_format, file.filename)

    # Persist directly into site_settings using SiteSetting model
    logo_row = db.query(SiteSetting).filter(SiteSetting.key == "site_logo").first()
    if logo_row:
        logo_row.value = logo_url
    else:
        db.add(SiteSetting(key="site_logo", value=logo_url))

    context = build_audit_context(request, actor_id=admin.id, actor_identifier=getattr(admin, "email", None))
    append_audit_from_context(db, context, action="SITE_LOGO_UPLOADED", outcome="SUCCESS", tenant_id=None)
    db.commit()

    return {"status": "success", "logo_url": logo_url}


@router.post("/logo-base64")
def upload_logo_base64(
    payload: LogoBase64UploadRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, object]:
    """Upload a platform logo via base64 data URL buffer and persist it to site_settings."""
    claims = _authenticate_branding_editor(request, action="upload site logo")
    admin = _require_active_platform_admin(claims, db)

    raw_buffer = payload.fileBuffer
    matched_ext = ".png"

    if raw_buffer.startswith("data:"):
        match = re.match(r"^data:(image\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$", raw_buffer, re.DOTALL)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid data URL format for image buffer.",
            )
        mime, b64_str = match.groups()
        if "svg" in mime:
            matched_ext = ".svg"
        elif "jpeg" in mime or "jpg" in mime:
            matched_ext = ".jpg"
        elif "webp" in mime:
            matched_ext = ".webp"
        elif "png" in mime:
            matched_ext = ".png"
        else:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported MIME type.")
        try:
            data_bytes = base64.b64decode(b64_str)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid base64 encoding: {exc}")
    else:
        # Raw base64 or URL
        try:
            data_bytes = base64.b64decode(raw_buffer)
        except Exception:
            # If plain URL, save directly
            if raw_buffer.startswith("http://") or raw_buffer.startswith("https://") or raw_buffer.startswith("/"):
                logo_row = db.query(SiteSetting).filter(SiteSetting.key == "site_logo").first()
                if logo_row:
                    logo_row.value = raw_buffer
                else:
                    db.add(SiteSetting(key="site_logo", value=raw_buffer))
                db.commit()
                return {"status": "success", "logo_url": raw_buffer}
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unrecognized image buffer format.")

    if len(data_bytes) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Logo exceeds 5MB size limit.")

    logo_url = _save_logo_bytes(data_bytes, matched_ext, payload.fileName)

    logo_row = db.query(SiteSetting).filter(SiteSetting.key == "site_logo").first()
    if logo_row:
        logo_row.value = logo_url
    else:
        db.add(SiteSetting(key="site_logo", value=logo_url))

    context = build_audit_context(request, actor_id=admin.id, actor_identifier=getattr(admin, "email", None))
    append_audit_from_context(db, context, action="SITE_LOGO_UPLOADED", outcome="SUCCESS", tenant_id=None)
    db.commit()

    return {"status": "success", "logo_url": logo_url}


@router.get("/logo/{filename}")
def serve_site_logo(filename: str):
    """Public endpoint to serve uploaded site logo files."""
    clean_name = os.path.basename(filename)
    if not re.match(r"^site_logo_[a-zA-Z0-9_-]+\.(png|jpg|jpeg|svg|webp)$", clean_name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid logo filename.")

    target_path = (LOGO_STORAGE_DIR / clean_name).resolve()
    if not str(target_path).startswith(str(LOGO_STORAGE_DIR.resolve())) or not target_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo file not found.")

    ext = target_path.suffix.lower()
    media_types = {
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(target_path),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
