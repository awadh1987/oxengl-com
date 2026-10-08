"""
Tenant endpoints compatibility layer.
Re-exports router and register_custom_domain from backend.app.api.v1.tenant_control.
"""
from backend.app.api.v1.tenant_control import (
    router,
    register_custom_domain,
)

__all__ = [
    "router",
    "register_custom_domain",
]
