import uuid
from typing import Generator
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.database import *


def get_isolated_db_session(request: Request) -> Generator[Session, None, None]:
    """
    FastAPI dependency injecting a transaction-scoped multi-tenant database session.
    Enforces PostgreSQL Row Level Security (RLS) isolation by executing:
    SET LOCAL app.current_tenant_id = :tenant_id
    SET LOCAL app.current_company_id = :tenant_id
    SET LOCAL app.is_master_admin = 'true' (for Admin, CEO, and Super_Admin)
    """
    tenant_id = (
        request.headers.get("X-Tenant-ID")
        or request.headers.get("x-tenant-id")
        or request.headers.get("X-Company-ID")
        or request.headers.get("x-company-id")
        or request.path_params.get("tenant_id")
        or request.query_params.get("tenant_id")
        or getattr(request.state, "tenant_id", None)
        or getattr(request.state, "company_id", None)
    )

    user_role = getattr(request.state, "role", None) or request.headers.get("x-role")
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not tenant_id and auth_header and auth_header.startswith("Bearer "):
        try:
            from backend.app.dependencies import decode_jwt_token
            token = auth_header.split(" ", 1)[1].strip()
            claims = decode_jwt_token(token)
            tenant_id = claims.get("tenant_id") or claims.get("company_id")
            if not user_role:
                user_role = claims.get("role")
        except Exception:
            pass

    role_str = str(user_role or "").upper().replace(" ", "_")
    is_admin = role_str in ["SUPER_ADMIN", "SUPERADMIN", "ADMIN", "CEO", "EXECUTIVE"]

    if not tenant_id:
        if is_admin:
            tenant_id = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tenant identity header missing or unverified (X-Tenant-ID required).",
            )

    company_uuid = None
    try:
        company_uuid = uuid.UUID(str(tenant_id))
    except (ValueError, TypeError):
        pass

    is_control_plane = False
    if hasattr(request, "url") and hasattr(request.url, "path"):
        path = request.url.path
        if path.startswith((
            "/api/v1/tenant/control",
            "/api/tenant/control",
            "/api/v1/superadmin",
            "/api/superadmin",
            "/api/v1/platform",
            "/api/platform",
            "/api/v1/admin/platform",
            "/api/admin/platform",
            "/api/companies",
            "/api/v1/companies",
            "/api/v1/tenant/branding",
            "/api/tenant/branding",
            "/api/v1/tenants",
            "/api/tenants",
            "/validate-slug",
            "/api/v1/auth",
            "/api/auth",
            "/api/v1/ssl",
            "/api/ssl",
            "/ssl",
        )):
            is_control_plane = True

    if company_uuid and not is_control_plane:
        db: Session = tenant_connection_manager.get_session(company_uuid)
    else:
        db: Session = SessionLocal()
    try:
        db.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": str(tenant_id)})
        db.execute(text("SET LOCAL app.current_company_id = :tid"), {"tid": str(tenant_id)})
        if is_admin:
            db.execute(text("SET LOCAL app.is_master_admin = 'true'"))
        yield db
    finally:
        try:
            db.execute(text("RESET app.current_tenant_id;"))
            db.execute(text("RESET app.current_company_id;"))
            if is_admin:
                db.execute(text("RESET app.is_master_admin;"))
        except Exception:
            pass
        db.close()
