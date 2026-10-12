"""
OxenGL IAM & Authentication API Router.
Exposes endpoints for login, RTR token rotation, session management, and logout.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models
from backend.app.domains.iam.services import (
    check_brute_force_lockout,
    create_access_token,
    create_user_session,
    decode_access_token,
    record_login_attempt,
    revoke_all_user_sessions,
    revoke_session,
    rotate_refresh_token,
)

router = APIRouter(prefix="/api/v1/iam/auth", tags=["Enterprise IAM & Security"])


# ==============================================================================
# Request / Response Schemas
# ==============================================================================

class LoginRequest(BaseModel):
    username: str = Field(..., description="Email or username")
    password: str = Field(..., min_length=6)
    device_name: Optional[str] = None
    mfa_code: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 900  # 15 minutes in seconds
    # True for HR-provisioned accounts until the temporary password has been replaced.
    must_change_password: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class SessionRead(BaseModel):
    id: uuid.UUID
    device_name: Optional[str]
    ip_address: str
    logged_in_at: str
    last_activity_at: str
    is_active: bool


# ==============================================================================
# Helper Dependencies
# ==============================================================================

def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> models.ResUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    user_id = uuid.UUID(payload["sub"])
    user = db.execute(select(models.ResUser).where(models.ResUser.id == user_id)).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


# ==============================================================================
# API Endpoints
# ==============================================================================

@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_correlation_id: Optional[str] = Header(None),
):
    ip_address = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent")

    # 1. Enforce Brute Force Interceptor (5 consecutive failures in 15 mins)
    check_brute_force_lockout(db, payload.username, ip_address)

    # 2. Look up user by email
    user = db.execute(
        select(models.ResUser).where(models.ResUser.email == payload.username.strip().lower())
    ).scalar_one_or_none()

    if not user:
        record_login_attempt(
            db, payload.username, ip_address, success=False,
            failure_reason="USER_NOT_FOUND", user_agent=user_agent,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # 3. Password Verification (Argon2 / Passlib)
    from backend.two_tier_auth import verify_password
    if not verify_password(payload.password, user.password_hash):
        record_login_attempt(
            db, payload.username, ip_address, success=False,
            failure_reason="INVALID_PASSWORD", user_agent=user_agent,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # 4. Check MFA if enabled
    if user.mfa_enabled:
        if not payload.mfa_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA code required for this account",
            )
        # Verify MFA code against secret or backup codes
        # If invalid:
        # record_login_attempt(...)
        # raise HTTPException(...)

    # 5. Success: record login attempt
    record_login_attempt(
        db, payload.username, ip_address, success=True,
        user_agent=user_agent,
    )

    # 6. Create Session and initial 7-day Refresh Token
    session, raw_refresh = create_user_session(
        db, user, ip_address=ip_address, device_name=payload.device_name
    )

    company = db.query(models.ResCompany).filter(models.ResCompany.id == user.company_id).first() if user.company_id else None
    comp_slug = company.slug if company else None

    # 7. Issue 15-minute Access Token
    access_token, _ = create_access_token(
        user_id=user.id,
        company_id=user.company_id,
        role=user.role,
        email=user.email,
        session_id=session.id,
        correlation_id=x_correlation_id,
        domain_slug=comp_slug,
        tenant_slug=comp_slug,
    )

    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "expires_in": 900,
        "must_change_password": bool(getattr(user, "must_change_password", False)),
    }


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    payload: RefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_correlation_id: Optional[str] = Header(None),
):
    """
    Refresh Token Rotation (RTR) endpoint.
    Rotates single-use refresh token. Invalides session tree on reuse attempt.
    """
    ip_address = request.client.host if request.client else "127.0.0.1"
    return rotate_refresh_token(
        db=db,
        raw_refresh_token=payload.refresh_token,
        ip_address=ip_address,
        correlation_id=x_correlation_id,
    )


@router.post("/logout")
def logout(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Invalidate current active session."""
    if authorization and authorization.startswith("Bearer "):
        try:
            payload = decode_access_token(authorization.split(" ")[1])
            session_id_str = payload.get("session_id")
            if session_id_str:
                revoke_session(db, uuid.UUID(session_id_str), reason="LOGOUT")
        except Exception:
            pass
    return {"status": "success", "message": "Successfully logged out"}


@router.post("/logout-all")
def logout_all(
    current_user: models.ResUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Global revocation: invalidate all active sessions and refresh tokens."""
    count = revoke_all_user_sessions(db, current_user.id, reason="LOGOUT_ALL")
    return {"status": "success", "revoked_sessions": count, "message": "All active sessions revoked"}
