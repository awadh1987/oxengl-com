"""
Multi-Tenant Public Routing & Workspace Verification Router.
Endpoints for tenant resolution, workspace slug validation, and branding lookup.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ResCompany

logger = logging.getLogger("oxengl.tenants")

router = APIRouter()


class SlugValidateRequest(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100, description="Tenant workspace slug to validate")

    model_config = ConfigDict(extra="ignore")


class SlugValidateResponse(BaseModel):
    valid: bool
    tenant_id: str
    name: str
    slug: str
    target: str
    status: str
    custom_domain: Optional[str] = None
    domain: Optional[str] = None
    branding_context: Dict[str, Any]

    model_config = ConfigDict(extra="ignore")



@router.post("/validate-slug", response_model=SlugValidateResponse, status_code=status.HTTP_200_OK)
async def validate_slug(payload: SlugValidateRequest, db: Session = Depends(get_db)):
    """
    Validate tenant workspace slug prior to login authentication.
    Queries res_companies for matching slug, domain_slug, or custom_domain.
    Returns tenant ID, workspace name, and UI branding metadata.
    """
    raw_slug = (payload.slug or "").strip().lower()
    if not raw_slug or len(raw_slug) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace slug must be at least 2 characters.",
        )

    # Sanitize slug
    clean_slug = re.sub(r"[^a-z0-9_-]", "", raw_slug)
    slug_hyphen = clean_slug.replace("_", "-")
    slug_underscore = clean_slug.replace("-", "_")

    company = db.scalar(
        select(ResCompany).where(
            or_(
                func.lower(ResCompany.slug) == clean_slug,
                func.lower(ResCompany.slug) == slug_hyphen,
                func.lower(ResCompany.slug) == slug_underscore,
                func.lower(ResCompany.domain_slug) == clean_slug,
                func.lower(ResCompany.domain_slug) == slug_hyphen,
                func.lower(ResCompany.domain_slug) == slug_underscore,
                func.lower(ResCompany.custom_domain) == clean_slug,
            )
        )
    )

    if not company or not getattr(company, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested workspace environment is either inactive or unregistered.",
        )

    tenant_id_str = str(company.id)
    logo = getattr(company, "logo_url", None) or getattr(company, "ui_logo_url", None)
    custom_dom = getattr(company, "custom_domain", None)

    return {
        "valid": True,
        "tenant_id": tenant_id_str,
        "name": company.name,
        "slug": company.slug,
        "target": tenant_id_str,
        "status": "VALID",
        "custom_domain": custom_dom,
        "domain": custom_dom,
        "branding_context": {
            "custom_logo": bool(logo),
            "logo_url": logo,
            "primary_color": getattr(company, "primary_color", "#0ea5e9"),
            "theme_mode": getattr(company, "theme_mode", "CUSTOM"),
        },
    }

