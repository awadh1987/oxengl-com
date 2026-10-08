---
name: super-admin-tenant-override-guide
description: Guide and implementation steps for adding a super-admin tenant feature override system in OxenGL to bypass plan restrictions.
---

# Super-Admin Tenant Feature Override System

## Overview
This guide outlines the architectural pattern for allowing super-admins to grant specific feature overrides (such as custom domains) to individual tenants without forcing them to upgrade their billing plan.

---

## 1. Database Schema Extension
Add a `features_override` JSONB column to the tenant model to store granular feature flags.

```python
# backend/app/models/tenant.py
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import JSONB

class Tenant(Base):
    __tablename__ = "tenants"
    
    id = Column(String, primary_key=True)
    slug = Column(String, unique=True, index=True)
    grade = Column(String, default="PROFESSIONAL")
    features_override = Column(JSONB, default=dict)  # e.g., {"allow_custom_domain": True}

    2. Backend Validation Logic Update
Target File: backend/app/api/v1/endpoints/tenants.py

Action: Update the custom domain check to evaluate both subscription grade and explicit feature overrides.

Python
# backend/app/api/v1/endpoints/tenants.py
@router.post("/api/v1/tenant/domains")
def register_custom_domain(
    domain: str, 
    db: Session = Depends(get_db), 
    current_tenant = Depends(get_current_tenant)
):
    # Check if grade is Enterprise OR if tenant has a feature override flag
    has_custom_domain_access = (
        current_tenant.grade == "ENTERPRISE" or 
        (current_tenant.features_override and current_tenant.features_override.get("allow_custom_domain", False))
    )
    
    if not has_custom_domain_access:
        raise HTTPException(
            status_code=403, 
            detail="Feature 'allow_custom_domain' is locked for Grade 'PROFESSIONAL'. Upgrade required or contact support."
        )
    
    # Proceed with custom domain registration logic...
    return {"status": "success", "domain": domain}
3. Super-Admin Patch Endpoint
Target File: backend/app/api/v1/endpoints/super_admin.py

Action: Add the administrative route allowing super-admins to modify a tenant's feature overrides.

Python
# backend/app/api/v1/endpoints/super_admin.py
from pydantic import BaseModel
from typing import Optional

class TenantOverrideSchema(BaseModel):
    allow_custom_domain: Optional[bool] = None

@router.patch("/api/v1/super-admin/tenants/{tenant_slug}/overrides")
def update_tenant_overrides(
    tenant_slug: str, 
    override_data: TenantOverrideSchema, 
    db: Session = Depends(get_db), 
    admin = Depends(get_current_super_admin)
):
    tenant = db.query(Tenant).filter(Tenant.slug == tenant_slug).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    current_overrides = tenant.features_override or {}
    update_dict = override_data.dict(exclude_unset=True)
    current_overrides.update(update_dict)
    
    tenant.features_override = current_overrides
    db.commit()
    db.refresh(tenant)
    
    return {"status": "success", "slug": tenant.slug, "features_override": tenant.features_override}
4. Immediate Database Quick Fix (SQL)
To instantly unblock a tenant like myon-contract-cloud from the database directly:

SQL
UPDATE tenants 
SET features_override = jsonb_set(COALESCE(features_override, '{}'::jsonb), '{allow_custom_domain}', 'true'::jsonb)
WHERE slug = 'myon-contract-cloud';

