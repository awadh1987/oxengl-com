"""
OxenGL API Security & Tenant Isolation Dependencies Bridge.
Filename: backend/app/api/dependencies.py

Re-exports core RBAC dependencies, role checkers, and tenant isolation models
from backend.api.dependencies to support imports within backend.app.api namespace.
"""

from backend.api.dependencies import *
