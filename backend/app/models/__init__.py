"""
Models package for OxenGL backend app.
Re-exports all backend models, Planning Core Spine models, and UserRole.
"""
from backend.models import *
from .planning import (
    CoreProject,
    LogisticsTrip,
    ProjectStatus,
    ProjectType,
    SaleOrder,
)
from .user import UserRole

