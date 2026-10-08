"""Platform-wide, admin-editable landing page copy and footer contact details.

``site_settings`` is global platform content (not tenant data), so it carries no company_id.
Reads are public; writes require an active platform administrator and are audited.
"""
from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.api.v1.branding import _authenticate_branding_editor, _require_active_platform_admin
from backend.app.domains.hr.audit import append_audit_from_context, build_audit_context
from backend.database import get_db

router = APIRouter(prefix="/api/settings", tags=["Site Settings"])

ALLOWED_KEYS = (
    "landing_headline",
    "landing_subheadline",
    "contact_email",
    "contact_phone",
    "contact_address",
)
MAX_VALUE_LENGTH = 2000


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


@router.get("/public")
def get_public_settings(db: Session = Depends(get_db)) -> Dict[str, str]:
    rows = db.execute(
        text("SELECT key, value FROM site_settings WHERE key = ANY(:keys)"),
        {"keys": list(ALLOWED_KEYS)},
    ).all()
    return {row.key: row.value for row in rows}


@router.put("/admin")
def update_admin_settings(
    updates: List[SiteSettingUpdate],
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, object]:
    claims = _authenticate_branding_editor(request, action="update site settings")
    admin = _require_active_platform_admin(claims, db)

    for item in updates:
        db.execute(
            text(
                """
                INSERT INTO site_settings (key, value, updated_at)
                VALUES (:k, :v, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
                """
            ),
            {"k": item.key, "v": item.value},
        )
    context = build_audit_context(request, actor_id=admin.id, actor_identifier=getattr(admin, "email", None))
    append_audit_from_context(db, context, action="SITE_SETTINGS_UPDATED", outcome="SUCCESS", tenant_id=None)
    db.commit()
    return {"status": "success", "updated": [u.key for u in updates]}
