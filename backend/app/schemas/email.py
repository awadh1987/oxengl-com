from pydantic import BaseModel, HttpUrl, EmailStr
from typing import Optional, List, Dict, Any


class TenantBrandContext(BaseModel):
    name: str
    workspace_domain: str
    logo_url: Optional[str] = None
    signature_name: Optional[str] = None
    signature_title: Optional[str] = None
    support_email: Optional[EmailStr] = None


class UserContext(BaseModel):
    first_name: str
    email: EmailStr
    role: Optional[str] = None
    temp_password: Optional[str] = None


class InstructionStep(BaseModel):
    title: str
    description: str
