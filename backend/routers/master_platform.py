"""
Master Platform Router & Security Dependencies Bridge.
Location: backend/routers/master_platform.py
"""

from backend.app.api.v1.master_platform import *
from backend.app.core.auth import (
    require_super_admin,
    get_current_active_superuser,
    verify_super_admin_role,
    verify_super_admin,
    is_super_admin_authorized,
)
