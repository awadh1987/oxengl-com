from typing import Optional
from pydantic import BaseModel, Field


class TenantStatusToggleRequest(BaseModel):
    is_active: bool = Field(..., description="Target active status for the tenant workspace")
    reason: Optional[str] = Field(None, description="Optional administrative reason for status change")


class TenantOffboardRequest(BaseModel):
    confirmation_name: str = Field(..., description="Exact tenant company name for confirmation")
    purge_users: bool = Field(True, description="Whether to purge tenant-specific users (excluding superadmins)")
