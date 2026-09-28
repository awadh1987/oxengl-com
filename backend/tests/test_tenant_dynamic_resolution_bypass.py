"""
Unit and integration tests for Platform-wide Dynamic Tenant Resolution,
Super Admin Isolation Bypass, and NULL Company Fallback.
"""

import uuid
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException, Request

from backend.database import SessionLocal
import backend.models as models
from backend.app.main import get_active_company_id as main_get_active_company_id
from backend.api.dependencies import get_tenant_context, TenantContext, get_active_company_id as api_get_active_company_id
from backend.app.dependencies import get_active_company_id as app_get_active_company_id
from backend.app.core.auth import is_super_admin_authorized


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def sample_companies(db_session):
    # Ensure two distinct test companies exist
    c1 = db_session.query(models.ResCompany).filter(models.ResCompany.name == "Test Tenant Alpha").first()
    if not c1:
        c1 = models.ResCompany(
            id=uuid.uuid4(),
            name="Test Tenant Alpha",
            slug=f"alpha_{uuid.uuid4().hex[:6]}",
            currency="SAR",
            is_active=True,
        )
        db_session.add(c1)

    c2 = db_session.query(models.ResCompany).filter(models.ResCompany.name == "Test Tenant Beta").first()
    if not c2:
        c2 = models.ResCompany(
            id=uuid.uuid4(),
            name="Test Tenant Beta",
            slug=f"beta_{uuid.uuid4().hex[:6]}",
            currency="SAR",
            is_active=True,
        )
        db_session.add(c2)

    db_session.commit()
    db_session.refresh(c1)
    db_session.refresh(c2)
    return c1, c2


def test_super_admin_bypass_main_get_active_company_id(db_session, sample_companies):
    comp_alpha, comp_beta = sample_companies

    # Super admin assigned to comp_alpha
    super_admin = models.ResUser(
        id=uuid.uuid4(),
        email=f"superadmin-{uuid.uuid4().hex[:6]}@oxengl.com",
        role="Super_Admin",
        is_superuser=True,
        is_active=True,
        company_id=comp_alpha.id,
    )
    db_session.add(super_admin)
    db_session.commit()
    db_session.refresh(super_admin)

    # Mock Request targeting comp_beta
    request = MagicMock(spec=Request)
    request.headers = {"x-company-id": str(comp_beta.id)}
    request.query_params = {}
    request.state = MagicMock()
    request.state.company_id = None
    request.state.tenant_company_id = None
    request.url = MagicMock()
    request.url.path = "/api/v1/stock/levels"
    request.method = "GET"

    # Call get_active_company_id with header targeting comp_beta
    resolved_cid = main_get_active_company_id(
        request=request,
        x_company_id=str(comp_beta.id),
        database=db_session,
        current_user=super_admin,
    )

    # Super Admin must bypass isolation and get comp_beta.id
    assert resolved_cid == comp_beta.id
    assert request.state.company_id == comp_beta.id
    assert request.state.tenant_company_id == comp_beta.id
    assert request.state.tenant_id == str(comp_beta.id)


def test_super_admin_bypass_app_dependencies_get_active_company_id(db_session, sample_companies):
    comp_alpha, comp_beta = sample_companies

    super_admin = models.ResUser(
        id=uuid.uuid4(),
        email=f"superadmin-{uuid.uuid4().hex[:6]}@oxengl.com",
        role="Super_Admin",
        is_superuser=True,
        is_active=True,
        company_id=comp_alpha.id,
    )
    db_session.add(super_admin)
    db_session.commit()
    db_session.refresh(super_admin)

    request = MagicMock(spec=Request)
    request.headers = {"x-company-id": str(comp_beta.id)}
    request.query_params = {}
    request.state = MagicMock()
    request.state.company_id = None
    request.state.tenant_company_id = None

    resolved_cid = app_get_active_company_id(
        request=request,
        x_company_id=str(comp_beta.id),
        db=db_session,
        current_user=super_admin,
    )

    assert resolved_cid == comp_beta.id
    assert request.state.company_id == comp_beta.id


def test_get_tenant_context_super_admin_bypass(db_session, sample_companies):
    comp_alpha, comp_beta = sample_companies

    super_admin = models.ResUser(
        id=uuid.uuid4(),
        email=f"superadmin-{uuid.uuid4().hex[:6]}@oxengl.com",
        role="Super_Admin",
        is_superuser=True,
        is_active=True,
        company_id=comp_alpha.id,
    )
    db_session.add(super_admin)
    db_session.commit()
    db_session.refresh(super_admin)

    request = MagicMock(spec=Request)
    request.headers = {"x-company-id": str(comp_beta.id)}
    request.query_params = {}
    request.state = MagicMock()
    request.state.company_id = None
    request.state.tenant_company_id = None

    context = get_tenant_context(
        request=request,
        x_company_id=str(comp_beta.id),
        x_tenant_id=None,
        db=db_session,
        current_user=super_admin,
    )

    assert context.company_id == comp_beta.id
    assert context.is_super_admin is True
    # Verify check_access passes for comp_beta even though user.company_id is comp_alpha
    context.check_access(comp_beta.id)
    assert request.state.company_id == comp_beta.id


def test_null_company_id_auto_assignment_and_fallback(db_session, sample_companies):
    comp_alpha, comp_beta = sample_companies

    # User with NULL company_id
    orphan_user = models.ResUser(
        id=uuid.uuid4(),
        email=f"orphan-{uuid.uuid4().hex[:6]}@oxengl.com",
        role="Accountant",
        is_superuser=False,
        is_active=True,
        company_id=None,
    )
    db_session.add(orphan_user)
    db_session.commit()
    db_session.refresh(orphan_user)
    assert orphan_user.company_id is None

    request = MagicMock(spec=Request)
    request.headers = {"x-company-id": str(comp_beta.id)}
    request.query_params = {}
    request.state = MagicMock()
    request.state.company_id = None
    request.state.tenant_company_id = None
    request.url = MagicMock()
    request.url.path = "/api/v1/bills"
    request.method = "GET"

    # User authenticates against comp_beta
    resolved_cid = main_get_active_company_id(
        request=request,
        x_company_id=str(comp_beta.id),
        database=db_session,
        current_user=orphan_user,
    )

    assert resolved_cid == comp_beta.id
    # Database record must now be persistently assigned to comp_beta!
    db_session.refresh(orphan_user)
    assert orphan_user.company_id == comp_beta.id


def test_standard_user_cross_tenant_access_blocked(db_session, sample_companies):
    comp_alpha, comp_beta = sample_companies

    # Standard user assigned strictly to comp_alpha
    std_user = models.ResUser(
        id=uuid.uuid4(),
        email=f"user-{uuid.uuid4().hex[:6]}@oxengl.com",
        role="Data_Entry",
        is_superuser=False,
        is_active=True,
        company_id=comp_alpha.id,
    )
    db_session.add(std_user)
    db_session.commit()
    db_session.refresh(std_user)

    request = MagicMock(spec=Request)
    request.headers = {"x-company-id": str(comp_beta.id)}
    request.query_params = {}
    request.state = MagicMock()
    request.state.company_id = None
    request.url = MagicMock()
    request.url.path = "/api/v1/inventory/items"
    request.method = "GET"

    # Non-admin user attempting cross-tenant access to comp_beta MUST be rejected with 403
    with pytest.raises(HTTPException) as exc_info:
        main_get_active_company_id(
            request=request,
            x_company_id=str(comp_beta.id),
            database=db_session,
            current_user=std_user,
        )
    assert exc_info.value.status_code == 403
