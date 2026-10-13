"""
Tenant Model Definition with Features Override Support.
Compatible with MasterTenant control plane and Tenant models.
"""
from typing import Optional, Dict, Any
from sqlalchemy import Column, String, Boolean, DateTime, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from backend.database import Base
from backend.models import MasterTenant, Tenant
try:
    from backend.app.services.email_service import resolve_tenant_branding
except ImportError:
    try:
        from app.services.email_service import resolve_tenant_branding
    except ImportError:
        resolve_tenant_branding = None


# Re-export for standard access
__all__ = ["Tenant", "MasterTenant", "resolve_tenant_branding"]
