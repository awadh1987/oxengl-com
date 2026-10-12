"""OxenGL Platform Governance, CMS & Broadcast Models.
Re-exports authoritative models from backend.models for modular imports.
"""
from backend.models import (
    PlatformMasterSetting,
    PlatformLandingSection,
    SystemBroadcast,
)

# Semantic model alias
PlatformMasterSettings = PlatformMasterSetting

__all__ = [
    "PlatformMasterSetting",
    "PlatformMasterSettings",
    "PlatformLandingSection",
    "SystemBroadcast",
]
