"""
Tenant-Scoped User Management API Router.
Filename: backend/app/api/v1/users.py

Provides authoritative endpoints for Tenant Admins to list, invite,
manage roles, and delete users strictly isolated within their tenant workspace.
"""

import logging
import secrets
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ResCompany, ResUser, TenantUser, User
from backend.api.dependencies import (
    TenantContext,
    get_tenant_context,
    require_role,
    ADMIN,
    OWNER,
    SUPER_ADMIN,
)
from backend.two_tier_auth import hash_password

logger = logging.getLogger("oxengl.api.users")

router = APIRouter(prefix="/api/v1/users", tags=["Tenant User Management"])


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    tenant_id: str

    class Config:
        from_attributes = True


class InviteUserRequest(BaseModel):
    email: str = Field(..., description="Corporate email address of invitee")
    role: str = Field("Guest", description="Assigned role: Owner, Admin, Accountant, Data_Entry, or Guest")
    full_name: Optional[str] = Field(None, description="Full name of user")


class InviteUserResponse(BaseModel):
    status: str
    user_id: str
    email: str
    full_name: str
    role: str
    temporary_password: str
    message: str


class UpdateRoleRequest(BaseModel):
    role: str = Field(..., description="Target role: Owner, Admin, Accountant, Data_Entry, or Guest")


VALID_ROLES = ["Owner", "Admin", "Accountant", "Data_Entry", "Guest"]


# 1. GET /api/v1/users
@router.get("", response_model=List[UserResponse])
@router.get("/", response_model=List[UserResponse])
def get_tenant_users(
    context: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(require_role(["Owner", "Admin"])),
    db: Session = Depends(get_db),
):
    """
    Fetch all users within the caller's tenant workspace.
    Strictly isolated: filtered by caller's company_id and accessible branch scopes via TenantContext.
    Cross-tenant user access is strictly forbidden.
    """
    accessible_cids = context.get_accessible_company_ids(db)
    if not accessible_cids:
        accessible_cids = [context.company_id]

    query = db.query(ResUser)

    if context.is_super_admin:
        # If super admin provided an explicit target company, restrict to that company
        if context.company_id and str(context.company_id) != str(getattr(context.user, "company_id", "")):
            query = query.filter(ResUser.company_id == context.company_id)
        else:
            query = query.filter(ResUser.company_id.in_(accessible_cids))
    else:
        # If requester is an OWNER or ADMIN, fetch all users where company_id matches requester's company_id
        query = query.filter(ResUser.company_id.in_(accessible_cids))

    users = query.order_by(ResUser.created_at.desc()).all()

    return [
        UserResponse(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name or u.email.split("@")[0],
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            tenant_id=str(u.company_id),
        )
        for u in users
    ]


# 2. POST /api/v1/users/invite
@router.post("/invite", response_model=InviteUserResponse, status_code=status.HTTP_201_CREATED)
def invite_tenant_user(
    payload: InviteUserRequest,
    context: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(require_role(["Owner", "Admin"])),
    db: Session = Depends(get_db),
):
    """
    Invites and creates a new user strictly bound to context.company_id.
    Generates a secure random temporary password and hashes it before storage.
    """
    tenant_id = context.company_id
    email_clean = payload.email.strip().lower()

    if not email_clean or "@" not in email_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email address format.",
        )

    # Check if user already exists
    existing = db.query(ResUser).filter(ResUser.email.ilike(email_clean)).first()
    if existing:
        if existing.company_id == tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with email '{email_clean}' already exists in this workspace.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with email '{email_clean}' is already registered in another workspace.",
            )

    # Normalize role
    normalized_role = next(
        (r for r in VALID_ROLES if r.lower() == payload.role.strip().lower()),
        "Guest",
    )

    # Generate cryptographically secure random temporary password
    temp_password = f"Oxen{secrets.token_urlsafe(8)}!9"
    pw_hash = hash_password(temp_password)

    user_id = uuid.uuid4()
    full_name = payload.full_name or email_clean.split("@")[0].replace(".", " ").title()

    new_user = ResUser(
        id=user_id,
        email=email_clean,
        full_name=full_name,
        password_hash=pw_hash,
        company_id=tenant_id,
        role=normalized_role,
        is_active=True,
        firebase_uid=f"inv_{user_id.hex[:16]}",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Also mirror into tenant_users table for backward compatibility
    try:
        tu_role = "admin" if normalized_role.lower() == "admin" else ("guest_user" if normalized_role.lower() == "guest" else "user")
        t_user = TenantUser(
            id=user_id,
            email=email_clean,
            mobile_number=f"+9665{secrets.randbelow(90000000) + 10000000}",
            first_name=full_name.split()[0],
            last_name=" ".join(full_name.split()[1:]) if len(full_name.split()) > 1 else "User",
            password_hash=pw_hash,
            role=tu_role,
            is_active=True,
        )
        db.merge(t_user)
        db.commit()
    except Exception as mirror_err:
        db.rollback()
        logger.warning(f"Mirroring into tenant_users notice: {mirror_err}")

    logger.info(f"Admin '{current_user.email}' invited user '{email_clean}' ({normalized_role}) into tenant '{tenant_id}'.")

    return InviteUserResponse(
        status="invited",
        user_id=str(new_user.id),
        email=new_user.email,
        full_name=new_user.full_name,
        role=new_user.role,
        temporary_password=temp_password,
        message="User created successfully. Please share the temporary password securely with the user.",
    )


# 3. DELETE /api/v1/users/{user_id}
@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def delete_tenant_user(
    user_id: str,
    context: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(require_role(["Owner", "Admin"])),
    db: Session = Depends(get_db),
):
    """
    Deletes a user from the workspace.
    Enforces strict tenant isolation: Admins and Owners can ONLY delete users from their own tenant.
    """
    tenant_id = context.company_id
    try:
        target_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user UUID format.")

    # Prevent admin from deleting their own account
    if target_uuid == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own active administrator account.",
        )

    target_user = db.query(ResUser).filter(ResUser.id == target_uuid).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Strict tenant isolation check
    accessible_cids = context.get_accessible_company_ids(db)
    if target_user.company_id not in accessible_cids and not context.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant violation: You do not have permission to modify users from another tenant.",
        )

    db.delete(target_user)

    # Clean up mirrored tenant_users entry
    try:
        t_user = db.query(TenantUser).filter(TenantUser.id == target_uuid).first()
        if t_user:
            db.delete(t_user)
    except Exception:
        pass

    db.commit()
    logger.info(f"Admin/Owner '{current_user.email}' deleted user '{target_uuid}' from tenant '{tenant_id}'.")

    return {
        "status": "deleted",
        "user_id": str(target_uuid),
        "message": "User deleted successfully.",
    }


# 4. PUT /api/v1/users/{user_id}/role
@router.put("/{user_id}/role", status_code=status.HTTP_200_OK)
def update_tenant_user_role(
    user_id: str,
    payload: UpdateRoleRequest,
    context: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(require_role(["Owner", "Admin"])),
    db: Session = Depends(get_db),
):
    """
    Updates a user's role.
    Enforces strict tenant isolation: Admins can ONLY modify users within their own tenant.
    """
    tenant_id = context.company_id
    try:
        target_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user UUID format.")

    target_user = db.query(ResUser).filter(ResUser.id == target_uuid).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Strict tenant isolation check
    accessible_cids = context.get_accessible_company_ids(db)
    if target_user.company_id not in accessible_cids and not context.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant violation: You do not have permission to modify users from another tenant.",
        )

    normalized_role = next(
        (r for r in VALID_ROLES if r.lower() == payload.role.strip().lower()),
        None,
    )
    if not normalized_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Allowed roles: {', '.join(VALID_ROLES)}",
        )

    target_user.role = normalized_role

    try:
        t_user = db.query(TenantUser).filter(TenantUser.id == target_uuid).first()
        if t_user:
            t_user.role = normalized_role.lower()
    except Exception:
        pass

    db.commit()
    db.refresh(target_user)
    logger.info(f"Admin '{current_user.email}' updated role for user '{target_uuid}' to '{normalized_role}'.")

    return {
        "status": "updated",
        "user_id": str(target_user.id),
        "role": target_user.role,
        "message": f"User role updated to {target_user.role}.",
    }
