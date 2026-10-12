"""
Super-Admin endpoints compatibility layer.
Re-exports router and update_tenant_overrides from backend.app.api.v1.super_admin.
"""
from backend.app.api.v1.super_admin import (
    router,
    TenantOverrideSchema,
    update_tenant_overrides,
    get_current_super_admin,
)

__all__ = [
    "router",
    "TenantOverrideSchema",
    "update_tenant_overrides",
    "get_current_super_admin",
]
