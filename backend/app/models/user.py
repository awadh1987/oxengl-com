"""
User model and RBAC role definitions for OxenGL.
Filename: backend/app/models/user.py
"""
from enum import Enum
from backend.models import ResUser, User, TenantUser

class UserRole(str, Enum):
    SUPERADMIN = "SUPERADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    USER = "USER"
    COO = "COO"
    CEO = "CEO"
    ACCOUNTANT = "ACCOUNTANT"
    DATA_ENTRY = "DATA_ENTRY"
    GUEST = "GUEST"

    # Title-case / Normalized aliases
    Super_Admin = "Super_Admin"
    Owner = "Owner"
    Admin = "Admin"
    User = "User"

__all__ = ["UserRole", "ResUser", "User", "TenantUser"]
