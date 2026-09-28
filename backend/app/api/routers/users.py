"""
Tenant-Scoped User Management API Router Bridge.
Filename: backend/app/api/routers/users.py

Re-exports router and endpoints from backend.app.api.v1.users.
"""

from backend.app.api.v1.users import *
from backend.app.api.v1.users import router
