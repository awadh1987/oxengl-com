# File: backend/app/domains/planning/logo_upload.py
import os
import uuid
import re
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.database import get_db, SessionLocal
from backend.models import ResCompany, ResUser

router = APIRouter(prefix="/api/v1/tenants", tags=["Tenant Branding"])

MAX_FILE_SIZE = 2 * 1024 * 1024
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

UPLOAD_DIR = os.getenv("OXENGL_LOGO_UPLOAD_DIR", "/var/www/oxengl/media/logos")
try:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
except (PermissionError, OSError):
    UPLOAD_DIR = os.path.expanduser("~/.oxengl/media/logos")
    os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload-logo")
@router.post("/{tenant_id}/upload-logo")
async def upload_tenant_logo(
    request: Request,
    file: UploadFile = File(...),
    tenant_id: str | None = None,
    db: Session = Depends(get_db),
):
    from backend.app.main import get_authenticated_user
    current_user: ResUser = get_authenticated_user(request, db)
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for tenant asset management."
        )

    # 1. Enforce strict size-boundary validation check
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)  # Reset pointer
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size boundary limit breached. Maximum allowed size is 2MB."
        )

    # 2. Enforce strict web format extension checking
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported media format extension. Allowed types: {ALLOWED_EXTENSIONS}"
        )

    # 3. Locate target tenant model strictly scoped to authenticated company
    target_tenant_id = current_user.company_id
    if not target_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user is not bound to a valid tenant company."
        )

    # If tenant_id was explicitly passed, verify cross-tenant isolation
    if tenant_id:
        try:
            param_uuid = uuid.UUID(str(tenant_id))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid tenant_id parameter format."
            )
        if current_user.role != "Super_Admin" and param_uuid != target_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Cannot modify logo or assets of another tenant."
            )
        target_tenant_id = param_uuid

    company = db.scalar(select(ResCompany).where(ResCompany.id == target_tenant_id))
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target enterprise tenant mapping not found."
        )

    unique_filename = f"logo_{target_tenant_id}_{uuid.uuid4().hex}{ext}"
    secure_file_path = os.path.join(UPLOAD_DIR, unique_filename)

    abs_upload_dir = os.path.abspath(UPLOAD_DIR)
    abs_dest_path = os.path.abspath(secure_file_path)
    if not abs_dest_path.startswith(abs_upload_dir + os.sep):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid asset destination path."
        )

    # 4. Atomic write binary stream data array down to disk
    try:
        with open(secure_file_path, "wb") as buffer:
            while content := await file.read(1024 * 64):  # 64kb chunk sizes
                buffer.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File system failure encountered during asset write: {str(e)}"
        )

    # 5. Save relative public routing path to database model registry
    public_web_url = f"/media/logos/{unique_filename}"
    company.logo_url = public_web_url
    company.ui_logo_url = public_web_url
    db.commit()
    db.refresh(company)

    return {
        "status": "SUCCESS",
        "message": "Tenant logo asset uploaded and securely isolated.",
        "logo_url": public_web_url
    }

from backend.app.api.routers.tenants import validate_slug as _validate_slug, SlugValidateRequest


@router.post("/validate-slug", status_code=status.HTTP_200_OK)
async def validate_tenant_slug(payload: SlugValidateRequest, db: Session = Depends(get_db)):
    """
    Zero-Disclosure backend workspace verification gateway.
    Delegates to canonical tenants router handler.
    """
    return await _validate_slug(payload, db)

