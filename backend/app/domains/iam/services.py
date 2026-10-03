"""
OxenGL IAM & Security Domain Services.
Implements:
- 15-minute Access Token & 7-day Refresh Token generation
- Refresh Token Rotation (RTR) with reuse/breach detection and parent session invalidation
- Brute-Force Interceptor (5 consecutive failed attempts in 15 minutes rolling window)
- Global Revocation Engine (logout, logout-all, password-reset, permission changes)
- MFA setup & validation helpers
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import jwt
from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from backend.app.domains.iam.models import (
    LoginAttempt,
    RefreshToken,
    SecurityToken,
    UserSession,
    utcnow,
)
from backend import models

logger = logging.getLogger("oxengl.iam.services")

# Security configuration & timelines
from backend.secret_env import require_secret  # noqa: E402  (strict, no fallbacks)

JWT_SECRET = require_secret("JWT_SECRET")
JWT_ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 15


def hash_token(raw_token: str) -> str:
    """Generate SHA-256 hash for secure storage of refresh and security tokens."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_secure_token(nbytes: int = 64) -> str:
    """Generate cryptographically secure URL-safe random token string."""
    return secrets.token_urlsafe(nbytes)


# ==============================================================================
# Token Lifecycle & JWT Generation
# ==============================================================================

def create_access_token(
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    role: str,
    email: str,
    session_id: Optional[uuid.UUID] = None,
    correlation_id: Optional[str] = None,
    domain_slug: Optional[str] = None,
    tenant_slug: Optional[str] = None,
) -> Tuple[str, datetime]:
    """
    Issue short-lived JWT access token strictly limited to 15 minutes.
    """
    now = utcnow()
    expires_at = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    slug = domain_slug or tenant_slug
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "company_id": str(company_id),
        "tenant_id": str(company_id),
        "role": role,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "token_type": "access",
    }
    if slug:
        payload["domain_slug"] = slug
        payload["tenant_slug"] = slug
    if session_id:
        payload["session_id"] = str(session_id)
    if correlation_id:
        payload["correlation_id"] = correlation_id

    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, expires_at


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("token_type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type: expected access token",
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token signature: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ==============================================================================
# Session & Refresh Token Rotation (RTR) Engine
# ==============================================================================

def create_user_session(
    db: Session,
    user: models.ResUser,
    ip_address: str,
    device_name: Optional[str] = None,
) -> Tuple[UserSession, str]:
    """
    Creates a new user session with an initial 7-day single-use rotating refresh token.
    """
    now = utcnow()
    session = UserSession(
        id=uuid.uuid4(),
        tenant_id=user.company_id,
        user_id=user.id,
        device_name=device_name,
        ip_address=ip_address,
        logged_in_at=now,
        last_activity_at=now,
        is_active=True,
    )
    db.add(session)
    db.flush()

    raw_refresh_token = generate_secure_token()
    token_hash = hash_token(raw_refresh_token)
    expires_at = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    refresh_token = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        session_id=session.id,
        token_hash=token_hash,
        expires_at=expires_at,
        created_at=now,
    )
    db.add(refresh_token)
    db.commit()
    db.refresh(session)

    return session, raw_refresh_token


def rotate_refresh_token(
    db: Session,
    raw_refresh_token: str,
    ip_address: str,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute Refresh Token Rotation (RTR).
    If a reused/already-revoked token is detected:
      - Log breach security incident
      - Invalidate entire parent session and all child tokens
      - Return 401 Unauthorized
    If valid:
      - Revoke current token with 'REFRESH_ROTATION'
      - Issue new 7-day refresh token under same session
      - Issue new 15-minute access token
    """
    now = utcnow()
    token_hash = hash_token(raw_refresh_token)

    token_record = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()

    if not token_record:
        logger.warning("Unrecognized refresh token presented from IP %s", ip_address)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    session = db.execute(
        select(UserSession).where(UserSession.id == token_record.session_id)
    ).scalar_one_or_none()

    # BREACH DETECTION: If token was already revoked, token theft has occurred!
    if token_record.revoked_at is not None or (session and not session.is_active):
        logger.critical(
            "SECURITY ALERT: Refresh token reuse detected! User: %s, Session: %s, Token ID: %s. Invaliding entire session tree.",
            token_record.user_id,
            token_record.session_id,
            token_record.id,
        )
        if session:
            session.is_active = False
            # Revoke all tokens in this session tree
            all_tokens = db.execute(
                select(RefreshToken).where(RefreshToken.session_id == session.id)
            ).scalars().all()
            for t in all_tokens:
                if not t.revoked_at:
                    t.revoked_at = now
                    t.revoked_reason = "SECURITY_INCIDENT"

        # Log security event in audit logs if model available
        try:
            sec_event = models.SecurityEvent(
                id=uuid.uuid4(),
                company_id=session.tenant_id if session else uuid.uuid4(),
                user_id=token_record.user_id,
                event_type="TOKEN_REUSE_BREACH",
                severity="CRITICAL",
                description=f"Reused refresh token detected from IP {ip_address}. Revoked entire session tree.",
                ip_address=ip_address,
                timestamp=now,
            )
            db.add(sec_event)
        except Exception as e:
            logger.error("Failed to persist security event: %s", e)

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Security violation: Refresh token reuse detected. Session has been revoked.",
        )

    # Check token expiration
    if token_record.expires_at < now:
        token_record.revoked_at = now
        token_record.revoked_reason = "EXPIRED"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired. Please log in again.",
        )

    # Valid rotation: revoke current token
    token_record.revoked_at = now
    token_record.revoked_reason = "REFRESH_ROTATION"

    # Update session activity
    if session:
        session.last_activity_at = now

    # Issue new refresh token
    new_raw_refresh = generate_secure_token()
    new_hash = hash_token(new_raw_refresh)
    new_expires_at = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    new_token_record = RefreshToken(
        id=uuid.uuid4(),
        user_id=token_record.user_id,
        session_id=token_record.session_id,
        token_hash=new_hash,
        expires_at=new_expires_at,
        created_at=now,
    )
    db.add(new_token_record)

    # Fetch user details for access token payload
    user = db.execute(
        select(models.ResUser).where(models.ResUser.id == token_record.user_id)
    ).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or deleted.",
        )

    company = db.execute(
        select(models.ResCompany).where(models.ResCompany.id == user.company_id)
    ).scalar_one_or_none() if user.company_id else None
    comp_slug = company.slug if company else None

    new_access_token, access_exp = create_access_token(
        user_id=user.id,
        company_id=user.company_id,
        role=user.role,
        email=user.email,
        session_id=session.id if session else None,
        correlation_id=correlation_id,
        domain_slug=comp_slug,
        tenant_slug=comp_slug,
    )

    db.commit()

    return {
        "access_token": new_access_token,
        "refresh_token": new_raw_refresh,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


# ==============================================================================
# Brute-Force Interceptor
# ==============================================================================

def check_brute_force_lockout(db: Session, username: str, ip_address: str) -> None:
    """
    Locks authentication attempts for 15 minutes if 5 consecutive failed attempts
    occurred within the rolling 15-minute window.
    """
    cutoff = utcnow() - timedelta(minutes=LOCKOUT_WINDOW_MINUTES)

    recent_attempts = db.execute(
        select(LoginAttempt)
        .where(
            LoginAttempt.username == username,
            LoginAttempt.attempt_time >= cutoff,
        )
        .order_by(desc(LoginAttempt.attempt_time))
        .limit(MAX_FAILED_ATTEMPTS)
    ).scalars().all()

    if len(recent_attempts) >= MAX_FAILED_ATTEMPTS:
        if all(not att.success for att in recent_attempts):
            logger.warning(
                "Brute force lockout active for user '%s' from IP %s",
                username,
                ip_address,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account temporarily locked due to {MAX_FAILED_ATTEMPTS} failed login attempts. Try again in 15 minutes.",
            )


def record_login_attempt(
    db: Session,
    username: str,
    ip_address: str,
    success: bool,
    failure_reason: Optional[str] = None,
    user_agent: Optional[str] = None,
    device_id: Optional[str] = None,
) -> LoginAttempt:
    """Audit and record each login attempt for threat detection."""
    attempt = LoginAttempt(
        id=uuid.uuid4(),
        username=username,
        ip_address=ip_address,
        device_id=device_id,
        user_agent=user_agent,
        success=success,
        failure_reason=failure_reason,
        attempt_time=utcnow(),
    )
    db.add(attempt)
    db.commit()
    return attempt


# ==============================================================================
# Global Revocation Engine
# ==============================================================================

def revoke_session(
    db: Session,
    session_id: uuid.UUID,
    reason: str = "LOGOUT",
) -> None:
    """
    Invalidates a specific user session and all associated refresh tokens.
    """
    now = utcnow()
    session = db.execute(
        select(UserSession).where(UserSession.id == session_id)
    ).scalar_one_or_none()

    if session:
        session.is_active = False

    tokens = db.execute(
        select(RefreshToken).where(RefreshToken.session_id == session_id)
    ).scalars().all()

    for token in tokens:
        if not token.revoked_at:
            token.revoked_at = now
            token.revoked_reason = reason

    db.commit()


def revoke_all_user_sessions(
    db: Session,
    user_id: uuid.UUID,
    reason: str = "LOGOUT_ALL",
) -> int:
    """
    Revokes all active sessions and refresh tokens for a user.
    Triggered on logout-all, password reset, or privilege alterations.
    """
    now = utcnow()
    sessions = db.execute(
        select(UserSession).where(UserSession.user_id == user_id, UserSession.is_active == True)
    ).scalars().all()

    count = 0
    for session in sessions:
        session.is_active = False
        count += 1

    tokens = db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    ).scalars().all()

    for token in tokens:
        token.revoked_at = now
        token.revoked_reason = reason

    db.commit()
    logger.info("Revoked %d sessions for user %s with reason '%s'", count, user_id, reason)
    return count
