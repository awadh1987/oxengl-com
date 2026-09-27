"""
Enterprise Organizational Management (Hierarchical Profiles) API Router.
Phase 7 - Step 2 Implementation.

Provides:
1. Hierarchical Company & Branch (Plant) CRUD with cycle detection.
2. Cost Center CRUD with branch-level isolation.
3. Purchasing Organization CRUD with hierarchical nesting.
4. Recursive Organizational Chart & Tree View endpoint for visualization.
5. Strict RBAC & TenantContext validation enforcing cross-branch and cross-tenant isolation.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.api.dependencies import (
    ADMIN,
    READ_ONLY,
    SUPER_ADMIN,
    TenantContext,
    get_tenant_context,
    normalize_role,
    require_admin,
    require_write_access,
)
from backend.database import get_db
from backend.models import CostCenter, PurchasingOrganization, ResCompany, ResUser

logger = logging.getLogger("oxengl.organization")

router = APIRouter(prefix="/organization", tags=["Organization & Enterprise Hierarchy"])


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Legal company or branch/plant name")
    slug: Optional[str] = Field(None, max_length=64, description="Unique slug identifier (generated if omitted)")
    parent_id: Optional[uuid.UUID] = Field(None, description="Parent company UUID. If set, this represents a Branch/Plant")
    currency: str = Field("SAR", min_length=3, max_length=3, description="ISO Currency code")
    tax_id: Optional[str] = Field(None, max_length=64, description="VAT or Tax Registration Number")
    commercial_registration: Optional[str] = Field(None, max_length=64, description="CR Number")
    is_active: bool = Field(True, description="Active status flag")

    model_config = ConfigDict(from_attributes=True)


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    parent_id: Optional[uuid.UUID] = None
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    tax_id: Optional[str] = Field(None, max_length=64)
    commercial_registration: Optional[str] = Field(None, max_length=64)
    is_active: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class CompanyResponse(BaseModel):
    id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    name: str
    slug: str
    currency: str
    tax_id: Optional[str] = None
    commercial_registration: Optional[str] = None
    is_active: bool
    org_type: str = "branch"  # "company_code" for root, "branch" for children
    child_count: int = 0
    cost_center_count: int = 0
    purchasing_org_count: int = 0
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CostCenterCreate(BaseModel):
    company_id: uuid.UUID = Field(..., description="Target branch/company UUID")
    code: str = Field(..., min_length=1, max_length=32, description="Unique code within company (e.g., CC-RYD-01)")
    name: str = Field(..., min_length=1, max_length=128, description="Cost center name")
    description: Optional[str] = Field(None, description="Detailed allocation description")
    parent_id: Optional[uuid.UUID] = Field(None, description="Parent cost center UUID for sub-allocation")
    is_active: bool = Field(True, description="Active status flag")

    model_config = ConfigDict(from_attributes=True)


class CostCenterUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=32)
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    description: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class CostCenterResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PurchasingOrgCreate(BaseModel):
    company_id: uuid.UUID = Field(..., description="Target branch/company UUID")
    code: str = Field(..., min_length=1, max_length=32, description="Unique code within company (e.g., PORG-01)")
    name: str = Field(..., min_length=1, max_length=255, description="Purchasing organization name")
    description: Optional[str] = Field(None, description="Procurement scope description")
    currency: str = Field("SAR", min_length=3, max_length=3, description="Operational currency")
    parent_id: Optional[uuid.UUID] = Field(None, description="Parent purchasing organization UUID")
    is_active: bool = Field(True, description="Active status flag")

    model_config = ConfigDict(from_attributes=True)


class PurchasingOrgUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=32)
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    parent_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class PurchasingOrgResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    code: str
    name: str
    description: Optional[str] = None
    currency: str
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OrgHierarchyNode(BaseModel):
    id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    name: str
    slug: str
    code: Optional[str] = None
    currency: str = "SAR"
    org_type: str = "branch"  # "company_code" (root legal entity) or "branch" (plant)
    is_active: bool = True
    cost_centers: List[CostCenterResponse] = []
    purchasing_organizations: List[PurchasingOrgResponse] = []
    branches: List[OrgHierarchyNode] = []

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# Helpers
# ==============================================================================

def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", value).strip().lower()
    return re.sub(r"[-\s]+", "-", cleaned)[:55]


def _detect_cycle(company_id: uuid.UUID, new_parent_id: uuid.UUID, db: Session) -> bool:
    """Returns True if assigning new_parent_id to company_id creates a circular loop."""
    if str(company_id) == str(new_parent_id):
        return True
    curr_id = new_parent_id
    visited = {company_id}
    while curr_id:
        if curr_id in visited:
            return True
        visited.add(curr_id)
        parent = db.query(ResCompany.parent_id).filter(ResCompany.id == curr_id).first()
        curr_id = parent[0] if parent else None
    return False


def _build_hierarchy_node(comp: ResCompany, db: Session) -> OrgHierarchyNode:
    """Recursively constructs an OrgHierarchyNode with all child branches, cost centers, and purchasing orgs."""
    cost_centers = [
        CostCenterResponse.model_validate(cc)
        for cc in db.query(CostCenter).filter(CostCenter.company_id == comp.id).all()
    ]
    purchasing_orgs = [
        PurchasingOrgResponse.model_validate(po)
        for po in db.query(PurchasingOrganization).filter(PurchasingOrganization.company_id == comp.id).all()
    ]
    child_companies = db.query(ResCompany).filter(ResCompany.parent_id == comp.id).all()
    branch_nodes = [_build_hierarchy_node(child, db) for child in child_companies]

    org_type = "company_code" if comp.parent_id is None else "branch"

    return OrgHierarchyNode(
        id=comp.id,
        parent_id=comp.parent_id,
        name=comp.name,
        slug=comp.slug,
        currency=comp.currency or "SAR",
        org_type=org_type,
        is_active=comp.is_active,
        cost_centers=cost_centers,
        purchasing_organizations=purchasing_orgs,
        branches=branch_nodes,
    )


# ==============================================================================
# 1. Hierarchy Tree Endpoints
# ==============================================================================

@router.get("/tree", response_model=List[OrgHierarchyNode], summary="Get full organizational chart tree")
@router.get("/chart", response_model=List[OrgHierarchyNode], summary="Alias for organizational chart tree")
def get_organization_tree(
    root_id: Optional[uuid.UUID] = Query(None, description="Optional root branch/company UUID to view subtree"),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> List[OrgHierarchyNode]:
    """
    Returns the hierarchical enterprise organizational chart:
    Company Code -> Branches / Plants -> Cost Centers & Purchasing Organizations.
    Enforces that callers can only view trees rooted within their authorized tenant/branch scope.
    """
    if root_id:
        # Validate caller has authority to view this specific root
        root_comp = context.validate_company_access(root_id, db)
        return [_build_hierarchy_node(root_comp, db)]

    if context.is_super_admin:
        # Super admin gets top-level company codes
        roots = db.query(ResCompany).filter(ResCompany.parent_id.is_(None)).all()
        return [_build_hierarchy_node(r, db) for r in roots]

    # For tenant users: find the top-level ancestor of caller's company that caller has access to
    curr = db.query(ResCompany).filter(ResCompany.id == context.company_id).first()
    if not curr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned company not found.")

    user_role = normalize_role(context.role)
    if user_role in (ADMIN, "company_admin", "ceo", "coo"):
        # Climb to the highest root company of this tenant
        visited = set()
        while curr.parent_id and curr.id not in visited:
            visited.add(curr.id)
            parent = db.query(ResCompany).filter(ResCompany.id == curr.parent_id).first()
            if not parent:
                break
            curr = parent
        return [_build_hierarchy_node(curr, db)]
    else:
        # Restricted branch user: only returns their specific branch node
        return [_build_hierarchy_node(curr, db)]


# ==============================================================================
# 2. Company / Branch CRUD Endpoints
# ==============================================================================

@router.get("/companies", response_model=List[CompanyResponse], summary="List accessible companies and branches")
def list_companies(
    parent_id: Optional[uuid.UUID] = Query(None, description="Filter by parent company/branch UUID"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    search: Optional[str] = Query(None, description="Search by name or slug"),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> List[CompanyResponse]:
    """Lists all companies and branches accessible to the authenticated user within their RBAC scope."""
    accessible_ids = context.get_accessible_company_ids(db)
    query = db.query(ResCompany).filter(ResCompany.id.in_(accessible_ids))

    if parent_id is not None:
        query = query.filter(ResCompany.parent_id == parent_id)
    if is_active is not None:
        query = query.filter(ResCompany.is_active == is_active)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(ResCompany.name.ilike(pattern), ResCompany.slug.ilike(pattern)))

    companies = query.order_by(ResCompany.name.asc()).all()
    results: List[CompanyResponse] = []
    for c in companies:
        child_count = db.query(func.count(ResCompany.id)).filter(ResCompany.parent_id == c.id).scalar() or 0
        cc_count = db.query(func.count(CostCenter.id)).filter(CostCenter.company_id == c.id).scalar() or 0
        po_count = db.query(func.count(PurchasingOrganization.id)).filter(PurchasingOrganization.company_id == c.id).scalar() or 0
        org_type = "company_code" if c.parent_id is None else "branch"
        results.append(
            CompanyResponse(
                id=c.id,
                parent_id=c.parent_id,
                name=c.name,
                slug=c.slug,
                currency=c.currency or "SAR",
                tax_id=c.tax_id,
                commercial_registration=c.commercial_registration,
                is_active=c.is_active,
                org_type=org_type,
                child_count=child_count,
                cost_center_count=cc_count,
                purchasing_org_count=po_count,
                created_at=c.created_at,
            )
        )
    return results


@router.get("/companies/{company_id}", response_model=CompanyResponse, summary="Get company or branch details")
def get_company(
    company_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> CompanyResponse:
    """Retrieves single company or branch by UUID with strict RBAC boundary validation."""
    c = context.validate_company_access(company_id, db)
    child_count = db.query(func.count(ResCompany.id)).filter(ResCompany.parent_id == c.id).scalar() or 0
    cc_count = db.query(func.count(CostCenter.id)).filter(CostCenter.company_id == c.id).scalar() or 0
    po_count = db.query(func.count(PurchasingOrganization.id)).filter(PurchasingOrganization.company_id == c.id).scalar() or 0
    org_type = "company_code" if c.parent_id is None else "branch"
    return CompanyResponse(
        id=c.id,
        parent_id=c.parent_id,
        name=c.name,
        slug=c.slug,
        currency=c.currency or "SAR",
        tax_id=c.tax_id,
        commercial_registration=c.commercial_registration,
        is_active=c.is_active,
        org_type=org_type,
        child_count=child_count,
        cost_center_count=cc_count,
        purchasing_org_count=po_count,
        created_at=c.created_at,
    )


@router.post(
    "/companies",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Company Code or Branch",
    dependencies=[Security(require_write_access), Depends(require_admin)],
)
def create_company(
    payload: CompanyCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> CompanyResponse:
    """
    Creates a new Company Code or child Branch/Plant.
    If parent_id is specified, the caller must have administrative authority over that parent.
    If parent_id is omitted (creating a root Company Code), only Super_Admin is authorized.
    """
    if payload.parent_id:
        context.validate_company_access(payload.parent_id, db)
    else:
        if not context.is_super_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Super_Admin can create top-level root Company Codes. Specify 'parent_id' to add a branch.",
            )

    # Check unique name
    existing_name = db.query(ResCompany).filter(ResCompany.name == payload.name).first()
    if existing_name:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A company or branch named '{payload.name}' already exists.",
        )

    # Resolve slug
    slug = payload.slug or _slugify(payload.name)
    existing_slug = db.query(ResCompany).filter(ResCompany.slug == slug).first()
    if existing_slug:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    comp_id = uuid.uuid4()
    company = ResCompany(
        id=comp_id,
        parent_id=payload.parent_id,
        name=payload.name,
        slug=slug,
        domain_slug=slug,
        currency=payload.currency.upper(),
        tax_id=payload.tax_id,
        commercial_registration=payload.commercial_registration,
        is_active=payload.is_active,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    org_type = "company_code" if company.parent_id is None else "branch"
    return CompanyResponse(
        id=company.id,
        parent_id=company.parent_id,
        name=company.name,
        slug=company.slug,
        currency=company.currency,
        tax_id=company.tax_id,
        commercial_registration=company.commercial_registration,
        is_active=company.is_active,
        org_type=org_type,
        child_count=0,
        cost_center_count=0,
        purchasing_org_count=0,
        created_at=company.created_at,
    )


@router.put(
    "/companies/{company_id}",
    response_model=CompanyResponse,
    summary="Update company or branch details",
    dependencies=[Security(require_write_access), Depends(require_admin)],
)
def update_company(
    company_id: uuid.UUID,
    payload: CompanyUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> CompanyResponse:
    """Updates an existing company or branch. Enforces cycle prevention on parent_id modifications."""
    company = context.validate_company_access(company_id, db)

    if payload.parent_id is not None and payload.parent_id != company.parent_id:
        context.validate_company_access(payload.parent_id, db)
        if _detect_cycle(company.id, payload.parent_id, db):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Circular parent-child relationship detected. A branch cannot be its own ancestor.",
            )
        company.parent_id = payload.parent_id

    if payload.name is not None and payload.name != company.name:
        existing = db.query(ResCompany).filter(ResCompany.name == payload.name, ResCompany.id != company.id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Company name '{payload.name}' is already in use.",
            )
        company.name = payload.name

    if payload.currency is not None:
        company.currency = payload.currency.upper()
    if payload.tax_id is not None:
        company.tax_id = payload.tax_id
    if payload.commercial_registration is not None:
        company.commercial_registration = payload.commercial_registration
    if payload.is_active is not None:
        company.is_active = payload.is_active

    db.commit()
    db.refresh(company)

    child_count = db.query(func.count(ResCompany.id)).filter(ResCompany.parent_id == company.id).scalar() or 0
    cc_count = db.query(func.count(CostCenter.id)).filter(CostCenter.company_id == company.id).scalar() or 0
    po_count = db.query(func.count(PurchasingOrganization.id)).filter(PurchasingOrganization.company_id == company.id).scalar() or 0
    org_type = "company_code" if company.parent_id is None else "branch"

    return CompanyResponse(
        id=company.id,
        parent_id=company.parent_id,
        name=company.name,
        slug=company.slug,
        currency=company.currency,
        tax_id=company.tax_id,
        commercial_registration=company.commercial_registration,
        is_active=company.is_active,
        org_type=org_type,
        child_count=child_count,
        cost_center_count=cc_count,
        purchasing_org_count=po_count,
        created_at=company.created_at,
    )


@router.delete(
    "/companies/{company_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete or de-provision a branch",
    dependencies=[Security(require_write_access), Depends(require_admin)],
)
def delete_company(
    company_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> dict:
    """
    De-provisions a branch.
    Guards prevent accidental deletion of a root company or any branch that has child branches.
    """
    company = context.validate_company_access(company_id, db)

    # Check for child branches
    child_count = db.query(func.count(ResCompany.id)).filter(ResCompany.parent_id == company.id).scalar() or 0
    if child_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete branch '{company.name}': {child_count} child branch(es) exist. Re-assign or remove them first.",
        )

    # Prevent non-superadmin from deleting root company code
    if company.parent_id is None and not context.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete top-level root Company Code. Only branches can be de-provisioned.",
        )

    branch_name = company.name
    branch_slug = company.slug
    db.delete(company)
    db.commit()

    return {
        "success": True,
        "message": f"Branch '{branch_name}' ({branch_slug}) successfully removed.",
        "id": str(company_id),
    }


# ==============================================================================
# 3. Cost Center Endpoints
# ==============================================================================

@router.get("/cost-centers", response_model=List[CostCenterResponse], summary="List accessible cost centers")
def list_cost_centers(
    company_id: Optional[uuid.UUID] = Query(None, description="Filter by specific company/branch UUID"),
    parent_id: Optional[uuid.UUID] = Query(None, description="Filter by parent cost center"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    search: Optional[str] = Query(None, description="Search by code or name"),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> List[CostCenterResponse]:
    """Lists cost centers belonging to accessible companies/branches with strict RBAC boundary."""
    accessible_ids = context.get_accessible_company_ids(db)

    if company_id is not None:
        context.validate_company_access(company_id, db)
        query = db.query(CostCenter).filter(CostCenter.company_id == company_id)
    else:
        query = db.query(CostCenter).filter(CostCenter.company_id.in_(accessible_ids))

    if parent_id is not None:
        query = query.filter(CostCenter.parent_id == parent_id)
    if is_active is not None:
        query = query.filter(CostCenter.is_active == is_active)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(CostCenter.code.ilike(pattern), CostCenter.name.ilike(pattern)))

    items = query.order_by(CostCenter.code.asc()).all()
    return [CostCenterResponse.model_validate(item) for item in items]


@router.get("/cost-centers/{cost_center_id}", response_model=CostCenterResponse, summary="Get cost center details")
def get_cost_center(
    cost_center_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> CostCenterResponse:
    """Retrieves single cost center by UUID with cross-branch RBAC isolation enforcement."""
    cc = context.validate_cost_center_access(cost_center_id, db)
    return CostCenterResponse.model_validate(cc)


@router.post(
    "/cost-centers",
    response_model=CostCenterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new cost center",
    dependencies=[Security(require_write_access)],
)
def create_cost_center(
    payload: CostCenterCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> CostCenterResponse:
    """Creates a cost center under a specific branch/company. Enforces unique (company_id, code)."""
    context.validate_company_access(payload.company_id, db)

    # Check unique code within company
    existing = db.query(CostCenter).filter(
        CostCenter.company_id == payload.company_id,
        CostCenter.code == payload.code.strip(),
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cost center code '{payload.code}' already exists within this branch/company.",
        )

    cc = CostCenter(
        id=uuid.uuid4(),
        company_id=payload.company_id,
        parent_id=payload.parent_id,
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        description=payload.description,
        is_active=payload.is_active,
    )
    db.add(cc)
    db.commit()
    db.refresh(cc)
    return CostCenterResponse.model_validate(cc)


@router.put(
    "/cost-centers/{cost_center_id}",
    response_model=CostCenterResponse,
    summary="Update cost center details",
    dependencies=[Security(require_write_access)],
)
def update_cost_center(
    cost_center_id: uuid.UUID,
    payload: CostCenterUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> CostCenterResponse:
    """Updates an existing cost center with cross-branch RBAC protection."""
    cc = context.validate_cost_center_access(cost_center_id, db)

    if payload.code is not None and payload.code.strip().upper() != cc.code:
        new_code = payload.code.strip().upper()
        existing = db.query(CostCenter).filter(
            CostCenter.company_id == cc.company_id,
            CostCenter.code == new_code,
            CostCenter.id != cc.id,
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cost center code '{new_code}' already exists in this branch.",
            )
        cc.code = new_code

    if payload.name is not None:
        cc.name = payload.name.strip()
    if payload.description is not None:
        cc.description = payload.description
    if payload.parent_id is not None:
        cc.parent_id = payload.parent_id
    if payload.is_active is not None:
        cc.is_active = payload.is_active

    db.commit()
    db.refresh(cc)
    return CostCenterResponse.model_validate(cc)


@router.delete(
    "/cost-centers/{cost_center_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete or deactivate a cost center",
    dependencies=[Security(require_write_access)],
)
def delete_cost_center(
    cost_center_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> dict:
    """Deletes a cost center with cross-branch RBAC isolation enforcement."""
    cc = context.validate_cost_center_access(cost_center_id, db)
    code = cc.code
    db.delete(cc)
    db.commit()
    return {
        "success": True,
        "message": f"Cost center '{code}' deleted successfully.",
        "id": str(cost_center_id),
    }


# ==============================================================================
# 4. Purchasing Organization Endpoints
# ==============================================================================

@router.get("/purchasing-orgs", response_model=List[PurchasingOrgResponse], summary="List accessible purchasing organizations")
def list_purchasing_organizations(
    company_id: Optional[uuid.UUID] = Query(None, description="Filter by specific company/branch UUID"),
    parent_id: Optional[uuid.UUID] = Query(None, description="Filter by parent purchasing org"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    search: Optional[str] = Query(None, description="Search by code or name"),
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> List[PurchasingOrgResponse]:
    """Lists purchasing organizations belonging to accessible branches/companies."""
    accessible_ids = context.get_accessible_company_ids(db)

    if company_id is not None:
        context.validate_company_access(company_id, db)
        query = db.query(PurchasingOrganization).filter(PurchasingOrganization.company_id == company_id)
    else:
        query = db.query(PurchasingOrganization).filter(PurchasingOrganization.company_id.in_(accessible_ids))

    if parent_id is not None:
        query = query.filter(PurchasingOrganization.parent_id == parent_id)
    if is_active is not None:
        query = query.filter(PurchasingOrganization.is_active == is_active)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                PurchasingOrganization.code.ilike(pattern),
                PurchasingOrganization.name.ilike(pattern),
            )
        )

    items = query.order_by(PurchasingOrganization.code.asc()).all()
    return [PurchasingOrgResponse.model_validate(item) for item in items]


@router.get("/purchasing-orgs/{org_id}", response_model=PurchasingOrgResponse, summary="Get purchasing organization details")
def get_purchasing_organization(
    org_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> PurchasingOrgResponse:
    """Retrieves single purchasing organization with cross-branch RBAC isolation enforcement."""
    org = context.validate_purchasing_org_access(org_id, db)
    return PurchasingOrgResponse.model_validate(org)


@router.post(
    "/purchasing-orgs",
    response_model=PurchasingOrgResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new purchasing organization",
    dependencies=[Security(require_write_access)],
)
def create_purchasing_organization(
    payload: PurchasingOrgCreate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> PurchasingOrgResponse:
    """Creates a purchasing organization under a specific branch/company. Enforces unique (company_id, code)."""
    context.validate_company_access(payload.company_id, db)

    # Check unique code within company
    existing = db.query(PurchasingOrganization).filter(
        PurchasingOrganization.company_id == payload.company_id,
        PurchasingOrganization.code == payload.code.strip().upper(),
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Purchasing organization code '{payload.code}' already exists within this branch.",
        )

    org = PurchasingOrganization(
        id=uuid.uuid4(),
        company_id=payload.company_id,
        parent_id=payload.parent_id,
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        description=payload.description,
        currency=payload.currency.upper(),
        is_active=payload.is_active,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return PurchasingOrgResponse.model_validate(org)


@router.put(
    "/purchasing-orgs/{org_id}",
    response_model=PurchasingOrgResponse,
    summary="Update purchasing organization details",
    dependencies=[Security(require_write_access)],
)
def update_purchasing_organization(
    org_id: uuid.UUID,
    payload: PurchasingOrgUpdate,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> PurchasingOrgResponse:
    """Updates an existing purchasing organization with cross-branch RBAC protection."""
    org = context.validate_purchasing_org_access(org_id, db)

    if payload.code is not None and payload.code.strip().upper() != org.code:
        new_code = payload.code.strip().upper()
        existing = db.query(PurchasingOrganization).filter(
            PurchasingOrganization.company_id == org.company_id,
            PurchasingOrganization.code == new_code,
            PurchasingOrganization.id != org.id,
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Purchasing organization code '{new_code}' already exists in this branch.",
            )
        org.code = new_code

    if payload.name is not None:
        org.name = payload.name.strip()
    if payload.description is not None:
        org.description = payload.description
    if payload.currency is not None:
        org.currency = payload.currency.upper()
    if payload.parent_id is not None:
        org.parent_id = payload.parent_id
    if payload.is_active is not None:
        org.is_active = payload.is_active

    db.commit()
    db.refresh(org)
    return PurchasingOrgResponse.model_validate(org)


@router.delete(
    "/purchasing-orgs/{org_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete or deactivate a purchasing organization",
    dependencies=[Security(require_write_access)],
)
def delete_purchasing_organization(
    org_id: uuid.UUID,
    context: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> dict:
    """Deletes a purchasing organization with cross-branch RBAC isolation enforcement."""
    org = context.validate_purchasing_org_access(org_id, db)
    code = org.code
    db.delete(org)
    db.commit()
    return {
        "success": True,
        "message": f"Purchasing organization '{code}' deleted successfully.",
        "id": str(org_id),
    }
