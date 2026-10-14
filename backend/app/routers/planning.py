"""
OxenGL Planning Department Core Spine API Router (`backend/app/routers/planning.py`).

Provides:
1. Full asynchronous CRUD for `CoreProject` (`core_projects`) with dynamic
   polymorphic `metadata_json` validation per `project_type`.
2. Strict PostgreSQL Row-Level Security (RLS) GUC propagation
   (`app.current_tenant_id` and `app.current_company_id`) via existing database
   dependencies (`get_db`).
3. Command Center Aggregator (`GET /projects/{project_id}/telemetry`) executing
   an optimized SQLAlchemy 2.0 aggregation query combining total budget vs.
   actual GL expenses (`account_move_lines`), committed POs (`purchase_orders`),
   active fleet status (`logistics_trips` / `fleet_trips`), and stock
   reservations (`stock_pickings` / `stock_moves` / `stock_movements`).
4. Hierarchical WBS Tree endpoint (`GET /projects/{project_id}/wbs`) returning
   the project hierarchy and its recursive sub-projects with financial roll-ups.
"""
from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import case, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

sys.modules.setdefault("app.routers.planning", sys.modules[__name__])
sys.modules.setdefault("backend.app.routers.planning", sys.modules[__name__])

try:
    from backend.database import get_db
except ImportError:
    from database import get_db

try:
    from backend.app.models.planning import (
        CoreProject,
        LogisticsTrip,
        ProjectStatus,
        ProjectType,
        SaleOrder,
    )
except ImportError:
    from app.models.planning import (
        CoreProject,
        LogisticsTrip,
        ProjectStatus,
        ProjectType,
        SaleOrder,
    )

try:
    from backend.models import (
        AccountMoveLine,
        FleetTrip,
        PurchaseOrder,
        ResCompany,
        ResPartner,
        StockMove,
        StockMovement,
        StockPicking,
    )
except ImportError:
    from models import (
        AccountMoveLine,
        FleetTrip,
        PurchaseOrder,
        ResCompany,
        ResPartner,
        StockMove,
        StockMovement,
        StockPicking,
    )

try:
    from backend.app.schemas.planning import (
        ActiveFleetTelemetry,
        BudgetVsActualTelemetry,
        CoreProjectCreate,
        CoreProjectRead,
        CoreProjectUpdate,
        CoreProjectWBSNode,
        CoreProjectWBSResponse,
        ESGAndIoTTelemetry,
        PartnerBrief,
        ProjectTelemetryResponse,
        StockReservationTelemetry,
        validate_metadata_for_project_type,
    )
except ImportError:
    from app.schemas.planning import (
        ActiveFleetTelemetry,
        BudgetVsActualTelemetry,
        CoreProjectCreate,
        CoreProjectRead,
        CoreProjectUpdate,
        CoreProjectWBSNode,
        CoreProjectWBSResponse,
        ESGAndIoTTelemetry,
        PartnerBrief,
        ProjectTelemetryResponse,
        StockReservationTelemetry,
        validate_metadata_for_project_type,
    )

router = APIRouter(tags=["Planning Core Spine"])

ACTIVE_FLEET_STATUSES = (
    "assigned",
    "in_transit",
    "en_route_pickup",
    "at_pickup",
    "loaded",
    "en_route_delivery",
    "at_delivery",
)
COMPLETED_FLEET_STATUSES = ("delivered", "completed")
ACTIVE_PICKING_STATES = ("draft", "confirmed", "assigned", "waiting", "reserved")
COMPLETED_PICKING_STATES = ("done", "completed")

PROJECT_TYPE_PREFIX_MAP: Dict[str, str] = {
    ProjectType.LOGISTICS.value: "LOG",
    ProjectType.SUPPLY_CHAIN.value: "SCM",
    ProjectType.HUMANITARIAN_SUPPLY.value: "WFP",
    ProjectType.EPC.value: "EPC",
    ProjectType.OIL_GAS.value: "OAG",
    ProjectType.COMMERCIAL_AGRIBUSINESS.value: "AGR",
}


# ==============================================================================
# Tenant Context & Strict PostgreSQL GUC Session Propagation
# ==============================================================================

async def _apply_tenant_rls_guc(db: Session, tenant_uuid: uuid.UUID) -> None:
    """
    Propagates `app.current_tenant_id` and `app.current_company_id` into both
    the SQLAlchemy session info dictionary and the active PostgreSQL transaction
    GUC scope so all downstream queries and foreign-key checks honor RLS.
    """
    tid_str = str(tenant_uuid)
    db.info["tenant_id"] = tid_str
    await db.execute(
        text(
            "SELECT set_config('app.current_tenant_id', :tid, true), "
            "set_config('app.current_company_id', :tid, true)"
        ),
        {"tid": tid_str},
    )


async def get_planning_tenant_db(
    request: Request,
    tenant_id: Optional[str] = Query(
        default=None,
        description="Optional tenant/company UUID query parameter.",
    ),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-ID"),
    x_company_id: Optional[str] = Header(default=None, alias="X-Company-ID"),
    db: Session = Depends(get_db),
) -> Tuple[Session, uuid.UUID]:
    """
    Resolves the authoritative tenant UUID from the request/session context and
    enforces strict `app.current_tenant_id` GUC propagation on the database session.
    """
    jwt_tenant_claim: Optional[Any] = None
    raw_token = request.cookies.get("access_token") or request.cookies.get("oxengl_session")
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not raw_token and auth_header and auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1].strip()
    if raw_token:
        try:
            from backend.app.dependencies import decode_jwt_token
            claims = decode_jwt_token(raw_token)
            if claims:
                jwt_tenant_claim = claims.get("tenant_id") or claims.get("company_id")
        except Exception:
            pass

    candidates: List[Any] = [
        db.info.get("tenant_id"),
        getattr(request.state, "tenant_company_id", None),
        getattr(request.state, "tenant_id", None),
        getattr(request.state, "company_id", None),
        getattr(getattr(request.state, "current_user", None), "company_id", None),
        jwt_tenant_claim,
        x_tenant_id,
        x_company_id,
        tenant_id,
        request.headers.get("x-tenant-id"),
        request.headers.get("x-company-id"),
        request.cookies.get("oxengl_tenant_id"),
        request.cookies.get("tenant_id"),
    ]

    resolved_uuid: Optional[uuid.UUID] = None
    for raw in candidates:
        if not raw:
            continue
        if isinstance(raw, uuid.UUID):
            resolved_uuid = raw
            break
        raw_str = str(raw).strip()
        if not raw_str:
            continue
        try:
            resolved_uuid = uuid.UUID(raw_str)
            break
        except (ValueError, TypeError):
            # Attempt slug resolution if a tenant slug was passed
            try:
                slug_res = await db.execute(
                    select(ResCompany.id).where(ResCompany.slug == raw_str).limit(1)
                )
                comp_id = slug_res.scalar_one_or_none()
                if comp_id:
                    resolved_uuid = comp_id
                    break
            except Exception:
                pass

    if resolved_uuid is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing or invalid tenant context. Provide a valid JWT or X-Tenant-ID header.",
        )

    await _apply_tenant_rls_guc(db, resolved_uuid)
    return db, resolved_uuid


# ==============================================================================
# Helper Utilities
# ==============================================================================

def _serialize_project_read(project: CoreProject, sub_project_count: Optional[int] = None) -> CoreProjectRead:
    """Converts a `CoreProject` ORM entity with eager-loaded relationships into `CoreProjectRead`."""
    loaded_subs = project.__dict__.get("sub_projects")
    computed_sub_count = (
        sub_project_count
        if sub_project_count is not None
        else (len(loaded_subs) if isinstance(loaded_subs, list) else 0)
    )
    client_obj = project.__dict__.get("client")
    beneficiary_obj = project.__dict__.get("beneficiary")

    return CoreProjectRead(
        id=project.id,
        tenant_id=project.tenant_id,
        company_id=project.company_id or project.tenant_id,
        parent_project_id=project.parent_project_id,
        project_code=project.project_code,
        name=project.name,
        project_type=ProjectType(project.project_type),
        client_id=project.client_id,
        beneficiary_id=project.beneficiary_id,
        status=ProjectStatus(project.status),
        financial_envelope=Decimal(str(project.financial_envelope or 0)),
        metadata_json=dict(project.metadata_json or {}),
        telemetry_data=dict(project.telemetry_data or {}),
        esg_metrics=dict(project.esg_metrics or {}),
        created_at=project.created_at,
        updated_at=project.updated_at,
        client=PartnerBrief.model_validate(client_obj) if client_obj else None,
        beneficiary=PartnerBrief.model_validate(beneficiary_obj) if beneficiary_obj else None,
        sub_project_count=computed_sub_count,
    )


async def _generate_project_code(
    db: Session,
    tenant_uuid: uuid.UUID,
    project_type: ProjectType,
) -> str:
    """Generates a deterministic, collision-safe sequential project code per tenant."""
    year = datetime.now(timezone.utc).year
    type_code = PROJECT_TYPE_PREFIX_MAP.get(project_type.value, "GEN")
    prefix = f"PRJ-{type_code}-{year}-"

    count_res = await db.execute(
        select(func.count(CoreProject.id)).where(
            CoreProject.tenant_id == tenant_uuid,
            CoreProject.project_code.like(f"{prefix}%"),
        )
    )
    existing_count = int(count_res.scalar() or 0)

    for offset in range(1, 1000):
        candidate = f"{prefix}{existing_count + offset:03d}"
        exists_res = await db.execute(
            select(CoreProject.id).where(
                CoreProject.tenant_id == tenant_uuid,
                CoreProject.project_code == candidate,
            )
        )
        if exists_res.scalar_one_or_none() is None:
            return candidate

    return f"{prefix}{uuid.uuid4().hex[:6].upper()}"


async def _verify_no_wbs_cycle(
    db: Session,
    tenant_uuid: uuid.UUID,
    project_id: uuid.UUID,
    new_parent_id: uuid.UUID,
) -> None:
    """Verifies that assigning `new_parent_id` does not introduce a circular WBS hierarchy."""
    if project_id == new_parent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A project cannot be assigned as its own parent_project_id.",
        )

    visited: Set[uuid.UUID] = {project_id}
    current_id: Optional[uuid.UUID] = new_parent_id

    while current_id is not None:
        if current_id in visited:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Circular WBS hierarchy detected: parent_project_id cannot reference a descendant project.",
            )
        visited.add(current_id)
        parent_res = await db.execute(
            select(CoreProject.id, CoreProject.parent_project_id).where(
                CoreProject.id == current_id,
                CoreProject.tenant_id == tenant_uuid,
            )
        )
        row = parent_res.first()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent project {new_parent_id} not found in current tenant.",
            )
        current_id = row[1]


# ==============================================================================
# 1. Project CRUD Endpoints (`/api/v1/planning/projects`)
# ==============================================================================

@router.get(
    "/projects",
    response_model=List[CoreProjectRead],
    status_code=status.HTTP_200_OK,
    summary="List Core Projects",
)
async def list_projects(
    project_type: Optional[ProjectType] = Query(default=None),
    project_status: Optional[ProjectStatus] = Query(default=None, alias="status"),
    parent_project_id: Optional[uuid.UUID] = Query(default=None),
    root_only: bool = Query(
        default=False,
        description="If true, returns only top-level master projects (parent_project_id IS NULL).",
    ),
    search: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    ctx: Tuple[Session, uuid.UUID] = Depends(get_planning_tenant_db),
) -> List[CoreProjectRead]:
    """
    Lists `CoreProject` records for the current tenant using SQLAlchemy 2.0
    `select` and `joinedload` eager loading.
    """
    db, tenant_uuid = ctx

    stmt = (
        select(CoreProject)
        .options(
            joinedload(CoreProject.client),
            joinedload(CoreProject.beneficiary),
            joinedload(CoreProject.sub_projects),
        )
        .where(CoreProject.tenant_id == tenant_uuid)
    )

    if project_type is not None:
        stmt = stmt.where(CoreProject.project_type == project_type.value)
    if project_status is not None:
        stmt = stmt.where(CoreProject.status == project_status.value)
    if root_only:
        stmt = stmt.where(CoreProject.parent_project_id.is_(None))
    elif parent_project_id is not None:
        stmt = stmt.where(CoreProject.parent_project_id == parent_project_id)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                CoreProject.project_code.ilike(pattern),
                CoreProject.name.ilike(pattern),
            )
        )

    stmt = stmt.order_by(CoreProject.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    projects = result.scalars().unique().all()

    return [_serialize_project_read(p) for p in projects]


@router.post(
    "/projects",
    response_model=CoreProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Core Project with Dynamic Polymorphic Metadata Validation",
)
async def create_project(
    payload: CoreProjectCreate,
    ctx: Tuple[Session, uuid.UUID] = Depends(get_planning_tenant_db),
) -> CoreProjectRead:
    """
    Creates a new `CoreProject` anchored to the current tenant.
    Dynamically validates `metadata_json` based on `project_type`.
    """
    db, tenant_uuid = ctx

    # Explicitly validate metadata_json against project_type
    try:
        validated_metadata = validate_metadata_for_project_type(
            payload.project_type, payload.metadata_json
        )
    except (ValidationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid metadata_json for project_type '{payload.project_type.value}': {exc}",
        ) from exc

    # Verify parent project exists within tenant if specified
    if payload.parent_project_id is not None:
        parent_res = await db.execute(
            select(CoreProject.id).where(
                CoreProject.id == payload.parent_project_id,
                CoreProject.tenant_id == tenant_uuid,
            )
        )
        if parent_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent project {payload.parent_project_id} not found in current tenant.",
            )

    project_code = (
        payload.project_code.strip()
        if payload.project_code and payload.project_code.strip()
        else await _generate_project_code(db, tenant_uuid, payload.project_type)
    )

    # Check duplicate project_code within tenant
    dup_res = await db.execute(
        select(CoreProject.id).where(
            CoreProject.tenant_id == tenant_uuid,
            CoreProject.project_code == project_code,
        )
    )
    if dup_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project with project_code '{project_code}' already exists in this tenant.",
        )

    now = datetime.now(timezone.utc)
    project = CoreProject(
        id=uuid.uuid4(),
        tenant_id=tenant_uuid,
        company_id=tenant_uuid,
        parent_project_id=payload.parent_project_id,
        project_code=project_code,
        name=payload.name,
        project_type=payload.project_type.value,
        client_id=payload.client_id,
        beneficiary_id=payload.beneficiary_id,
        status=payload.status.value,
        financial_envelope=payload.financial_envelope,
        metadata_json=validated_metadata,
        telemetry_data=dict(payload.telemetry_data or {}),
        esg_metrics=dict(payload.esg_metrics or {}),
        created_at=now,
        updated_at=now,
    )

    db.add(project)
    try:
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Database integrity error creating project: {exc.orig if hasattr(exc, 'orig') else exc}",
        ) from exc

    await _apply_tenant_rls_guc(db, tenant_uuid)
    reload_res = await db.execute(
        select(CoreProject)
        .options(
            joinedload(CoreProject.client),
            joinedload(CoreProject.beneficiary),
            joinedload(CoreProject.sub_projects),
        )
        .where(CoreProject.id == project.id, CoreProject.tenant_id == tenant_uuid)
    )
    reloaded = reload_res.scalars().unique().one()
    return _serialize_project_read(reloaded)


@router.get(
    "/projects/{project_id}",
    response_model=CoreProjectRead,
    status_code=status.HTTP_200_OK,
    summary="Get Core Project by ID",
)
async def get_project(
    project_id: uuid.UUID,
    ctx: Tuple[Session, uuid.UUID] = Depends(get_planning_tenant_db),
) -> CoreProjectRead:
    """Retrieves a single `CoreProject` with eager-loaded client, beneficiary, and sub-projects."""
    db, tenant_uuid = ctx

    stmt = (
        select(CoreProject)
        .options(
            joinedload(CoreProject.client),
            joinedload(CoreProject.beneficiary),
            joinedload(CoreProject.sub_projects),
        )
        .where(CoreProject.id == project_id, CoreProject.tenant_id == tenant_uuid)
    )
    result = await db.execute(stmt)
    project = result.scalars().unique().one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found.",
        )

    return _serialize_project_read(project)


@router.put(
    "/projects/{project_id}",
    response_model=CoreProjectRead,
    status_code=status.HTTP_200_OK,
    summary="Update a Core Project with Dynamic Polymorphic Metadata Validation",
)
@router.patch(
    "/projects/{project_id}",
    response_model=CoreProjectRead,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def update_project(
    project_id: uuid.UUID,
    payload: CoreProjectUpdate,
    ctx: Tuple[Session, uuid.UUID] = Depends(get_planning_tenant_db),
) -> CoreProjectRead:
    """
    Updates an existing `CoreProject`.
    Dynamically validates `metadata_json` against the effective `project_type`
    (either the incoming `payload.project_type` or the existing project's `project_type`).
    """
    db, tenant_uuid = ctx

    stmt = (
        select(CoreProject)
        .options(
            joinedload(CoreProject.client),
            joinedload(CoreProject.beneficiary),
            joinedload(CoreProject.sub_projects),
        )
        .where(CoreProject.id == project_id, CoreProject.tenant_id == tenant_uuid)
    )
    result = await db.execute(stmt)
    project = result.scalars().unique().one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found.",
        )

    update_fields = payload.model_fields_set
    effective_type = (
        payload.project_type
        if payload.project_type is not None
        else ProjectType(project.project_type)
    )

    # Dynamic validation of metadata_json whenever metadata_json or project_type is updated
    if "metadata_json" in update_fields or "project_type" in update_fields:
        candidate_metadata = (
            payload.metadata_json
            if "metadata_json" in update_fields and payload.metadata_json is not None
            else dict(project.metadata_json or {})
        )
        try:
            validated_metadata = validate_metadata_for_project_type(
                effective_type, candidate_metadata
            )
        except (ValidationError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid metadata_json for project_type '{effective_type.value}': {exc}",
            ) from exc
        project.metadata_json = validated_metadata

    if "parent_project_id" in update_fields:
        if payload.parent_project_id is not None:
            await _verify_no_wbs_cycle(db, tenant_uuid, project.id, payload.parent_project_id)
        project.parent_project_id = payload.parent_project_id

    if "project_code" in update_fields and payload.project_code:
        new_code = payload.project_code.strip()
        if new_code != project.project_code:
            dup_res = await db.execute(
                select(CoreProject.id).where(
                    CoreProject.tenant_id == tenant_uuid,
                    CoreProject.project_code == new_code,
                    CoreProject.id != project.id,
                )
            )
            if dup_res.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Project with project_code '{new_code}' already exists in this tenant.",
                )
            project.project_code = new_code

    if "name" in update_fields:
        project.name = payload.name
    if "project_type" in update_fields and payload.project_type is not None:
        project.project_type = payload.project_type.value
    if "client_id" in update_fields:
        project.client_id = payload.client_id
    if "beneficiary_id" in update_fields:
        project.beneficiary_id = payload.beneficiary_id
    if "status" in update_fields and payload.status is not None:
        project.status = payload.status.value
    if "financial_envelope" in update_fields and payload.financial_envelope is not None:
        project.financial_envelope = payload.financial_envelope
    if "telemetry_data" in update_fields and payload.telemetry_data is not None:
        project.telemetry_data = dict(payload.telemetry_data)
    if "esg_metrics" in update_fields and payload.esg_metrics is not None:
        project.esg_metrics = dict(payload.esg_metrics)

    project.updated_at = datetime.now(timezone.utc)

    try:
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Database integrity error updating project: {exc.orig if hasattr(exc, 'orig') else exc}",
        ) from exc

    await _apply_tenant_rls_guc(db, tenant_uuid)
    reload_res = await db.execute(
        select(CoreProject)
        .options(
            joinedload(CoreProject.client),
            joinedload(CoreProject.beneficiary),
            joinedload(CoreProject.sub_projects),
        )
        .where(CoreProject.id == project.id, CoreProject.tenant_id == tenant_uuid)
    )
    reloaded = reload_res.scalars().unique().one()
    return _serialize_project_read(reloaded)


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a Core Project (Enforces ON DELETE RESTRICT)",
)
async def delete_project(
    project_id: uuid.UUID,
    ctx: Tuple[Session, uuid.UUID] = Depends(get_planning_tenant_db),
) -> Dict[str, Any]:
    """
    Deletes a `CoreProject` if no sub-projects or downstream financial/operational
    records reference it (`ON DELETE RESTRICT`).
    """
    db, tenant_uuid = ctx

    res = await db.execute(
        select(CoreProject).where(
            CoreProject.id == project_id,
            CoreProject.tenant_id == tenant_uuid,
        )
    )
    project = res.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found.",
        )

    try:
        db.delete(project)
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete project because it has dependent sub-projects or anchored transactions (ON DELETE RESTRICT).",
        ) from exc

    return {"status": "deleted", "project_id": str(project_id)}


# ==============================================================================
# 2. Hierarchical WBS Endpoint (`GET /api/v1/planning/projects/{project_id}/wbs`)
# ==============================================================================

@router.get(
    "/projects/{project_id}/wbs",
    response_model=CoreProjectWBSResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Project Work Breakdown Structure (WBS) Hierarchy Tree",
)
async def get_project_wbs(
    project_id: uuid.UUID,
    ctx: Tuple[Session, uuid.UUID] = Depends(get_planning_tenant_db),
) -> CoreProjectWBSResponse:
    """
    Returns the hierarchical Work Breakdown Structure (WBS) tree rooted at
    `project_id`, including all nested `sub_projects` and recursive financial
    envelope roll-ups, loaded via SQLAlchemy 2.0 `select` and `joinedload`.
    """
    db, tenant_uuid = ctx

    # Eager-load all tenant projects with client, beneficiary, and sub_projects in one query
    stmt = (
        select(CoreProject)
        .options(
            joinedload(CoreProject.client),
            joinedload(CoreProject.beneficiary),
            joinedload(CoreProject.sub_projects),
        )
        .where(CoreProject.tenant_id == tenant_uuid)
        .order_by(CoreProject.created_at.asc())
    )
    result = await db.execute(stmt)
    all_projects = result.scalars().unique().all()

    projects_by_id: Dict[uuid.UUID, CoreProject] = {p.id: p for p in all_projects}
    root_project = projects_by_id.get(project_id)
    if root_project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found.",
        )

    children_by_parent: Dict[uuid.UUID, List[CoreProject]] = {}
    for proj in all_projects:
        if proj.parent_project_id is not None:
            children_by_parent.setdefault(proj.parent_project_id, []).append(proj)

    max_depth_tracker = 0
    total_nodes_tracker = 0

    def _build_wbs_node(
        proj: CoreProject,
        level: int,
        path_prefix: List[str],
        visited: Set[uuid.UUID],
    ) -> CoreProjectWBSNode:
        nonlocal max_depth_tracker, total_nodes_tracker
        total_nodes_tracker += 1
        if level > max_depth_tracker:
            max_depth_tracker = level

        current_path = [*path_prefix, proj.project_code]
        direct_env = Decimal(str(proj.financial_envelope or 0))
        rolled_up_env = direct_env
        total_descendants = 0

        child_nodes: List[CoreProjectWBSNode] = []
        for child in children_by_parent.get(proj.id, []):
            if child.id in visited:
                continue
            child_node = _build_wbs_node(
                child,
                level=level + 1,
                path_prefix=current_path,
                visited=visited | {child.id},
            )
            child_nodes.append(child_node)
            rolled_up_env += child_node.rolled_up_financial_envelope
            total_descendants += 1 + child_node.total_descendant_count

        client_obj = proj.__dict__.get("client")
        beneficiary_obj = proj.__dict__.get("beneficiary")

        return CoreProjectWBSNode(
            id=proj.id,
            tenant_id=proj.tenant_id,
            company_id=proj.company_id or proj.tenant_id,
            parent_project_id=proj.parent_project_id,
            project_code=proj.project_code,
            name=proj.name,
            project_type=ProjectType(proj.project_type),
            status=ProjectStatus(proj.status),
            client_id=proj.client_id,
            beneficiary_id=proj.beneficiary_id,
            client=PartnerBrief.model_validate(client_obj) if client_obj else None,
            beneficiary=PartnerBrief.model_validate(beneficiary_obj) if beneficiary_obj else None,
            financial_envelope=direct_env,
            direct_financial_envelope=direct_env,
            rolled_up_financial_envelope=rolled_up_env,
            wbs_level=level,
            wbs_path=current_path,
            sub_project_count=len(child_nodes),
            total_descendant_count=total_descendants,
            metadata_json=dict(proj.metadata_json or {}),
            telemetry_data=dict(proj.telemetry_data or {}),
            esg_metrics=dict(proj.esg_metrics or {}),
            created_at=proj.created_at,
            updated_at=proj.updated_at,
            sub_projects=child_nodes,
        )

    root_node = _build_wbs_node(
        root_project,
        level=0,
        path_prefix=[],
        visited={root_project.id},
    )

    return CoreProjectWBSResponse(
        **root_node.model_dump(),
        total_tree_nodes=total_nodes_tracker,
        max_depth=max_depth_tracker,
    )


# ==============================================================================
# 3. Command Center Aggregator (`GET /api/v1/planning/projects/{project_id}/telemetry`)
# ==============================================================================

@router.get(
    "/projects/{project_id}/telemetry",
    response_model=ProjectTelemetryResponse,
    status_code=status.HTTP_200_OK,
    summary="Command Center Aggregator: Real-Time Budget vs. Actual GL, Active Fleet & Stock Reservations",
)
async def get_project_telemetry(
    project_id: uuid.UUID,
    include_sub_projects: bool = Query(
        default=True,
        description="When true, aggregates telemetry across the project and all its recursive WBS sub-projects.",
    ),
    ctx: Tuple[Session, uuid.UUID] = Depends(get_planning_tenant_db),
) -> ProjectTelemetryResponse:
    """
    Executes an optimized SQLAlchemy 2.0 aggregation query combining:
    1. Total Budget (`core_projects.financial_envelope`) vs. Actual GL Expenses
       (`account_move_lines`), Committed POs (`purchase_orders`), and Sale Orders (`sale_orders`).
    2. Active Fleet & Logistics execution telemetry (`logistics_trips` & `fleet_trips`).
    3. Ring-fenced Stock Reservations & Inventory Movements (`stock_pickings`, `stock_moves`, `stock_movements`).
    4. ESG Scope 1/2/3 carbon footprint and IoT sensor telemetry.
    """
    db, tenant_uuid = ctx

    # 1. Fetch root project and resolve WBS subtree IDs
    root_stmt = (
        select(CoreProject)
        .options(
            joinedload(CoreProject.client),
            joinedload(CoreProject.beneficiary),
            joinedload(CoreProject.sub_projects),
        )
        .where(CoreProject.id == project_id, CoreProject.tenant_id == tenant_uuid)
    )
    root_res = await db.execute(root_stmt)
    root_project = root_res.scalars().unique().one_or_none()
    if root_project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found.",
        )

    scoped_ids: List[uuid.UUID] = [root_project.id]
    if include_sub_projects:
        hierarchy_res = await db.execute(
            select(CoreProject.id, CoreProject.parent_project_id).where(
                CoreProject.tenant_id == tenant_uuid
            )
        )
        children_map: Dict[uuid.UUID, List[uuid.UUID]] = {}
        for pid, parent_id in hierarchy_res.all():
            if parent_id is not None:
                children_map.setdefault(parent_id, []).append(pid)

        queue = list(children_map.get(root_project.id, []))
        visited: Set[uuid.UUID] = {root_project.id}
        while queue:
            curr = queue.pop(0)
            if curr in visited:
                continue
            visited.add(curr)
            scoped_ids.append(curr)
            queue.extend(children_map.get(curr, []))

    # 2. Build scalar subqueries and execute a SINGLE unified SQLAlchemy 2.0 `select(...)`
    #    combining Budget, GL Actuals, Procurement POs, Sale Orders, Logistics/Fleet, and Stock Reservations.
    budget_subq = (
        select(func.coalesce(func.sum(CoreProject.financial_envelope), Decimal("0.0000")))
        .where(CoreProject.id.in_(scoped_ids), CoreProject.tenant_id == tenant_uuid)
        .scalar_subquery()
    )

    gl_debit_subq = (
        select(func.coalesce(func.sum(AccountMoveLine.debit), Decimal("0.0000")))
        .where(AccountMoveLine.project_id.in_(scoped_ids), AccountMoveLine.company_id == tenant_uuid)
        .scalar_subquery()
    )
    gl_credit_subq = (
        select(func.coalesce(func.sum(AccountMoveLine.credit), Decimal("0.0000")))
        .where(AccountMoveLine.project_id.in_(scoped_ids), AccountMoveLine.company_id == tenant_uuid)
        .scalar_subquery()
    )
    gl_count_subq = (
        select(func.count(AccountMoveLine.id))
        .where(AccountMoveLine.project_id.in_(scoped_ids), AccountMoveLine.company_id == tenant_uuid)
        .scalar_subquery()
    )

    po_amount_subq = (
        select(func.coalesce(func.sum(PurchaseOrder.total_amount), Decimal("0.0000")))
        .where(
            PurchaseOrder.project_id.in_(scoped_ids),
            PurchaseOrder.company_id == tenant_uuid,
            PurchaseOrder.status != "cancelled",
        )
        .scalar_subquery()
    )
    po_count_subq = (
        select(func.count(PurchaseOrder.id))
        .where(PurchaseOrder.project_id.in_(scoped_ids), PurchaseOrder.company_id == tenant_uuid)
        .scalar_subquery()
    )

    so_amount_subq = (
        select(func.coalesce(func.sum(SaleOrder.total_amount), Decimal("0.0000")))
        .where(
            SaleOrder.project_id.in_(scoped_ids),
            SaleOrder.tenant_id == tenant_uuid,
            SaleOrder.status != "cancelled",
        )
        .scalar_subquery()
    )
    so_count_subq = (
        select(func.count(SaleOrder.id))
        .where(SaleOrder.project_id.in_(scoped_ids), SaleOrder.tenant_id == tenant_uuid)
        .scalar_subquery()
    )

    # Logistics trips + Fleet trips subqueries
    lt_total_subq = (
        select(func.count(LogisticsTrip.id))
        .where(LogisticsTrip.project_id.in_(scoped_ids), LogisticsTrip.tenant_id == tenant_uuid)
        .scalar_subquery()
    )
    lt_active_subq = (
        select(func.count(LogisticsTrip.id))
        .where(
            LogisticsTrip.project_id.in_(scoped_ids),
            LogisticsTrip.tenant_id == tenant_uuid,
            LogisticsTrip.status.in_(ACTIVE_FLEET_STATUSES),
        )
        .scalar_subquery()
    )
    lt_completed_subq = (
        select(func.count(LogisticsTrip.id))
        .where(
            LogisticsTrip.project_id.in_(scoped_ids),
            LogisticsTrip.tenant_id == tenant_uuid,
            LogisticsTrip.status.in_(COMPLETED_FLEET_STATUSES),
        )
        .scalar_subquery()
    )
    lt_cancelled_subq = (
        select(func.count(LogisticsTrip.id))
        .where(
            LogisticsTrip.project_id.in_(scoped_ids),
            LogisticsTrip.tenant_id == tenant_uuid,
            LogisticsTrip.status == "cancelled",
        )
        .scalar_subquery()
    )
    lt_distance_subq = (
        select(func.coalesce(func.sum(LogisticsTrip.distance_km), Decimal("0.00")))
        .where(LogisticsTrip.project_id.in_(scoped_ids), LogisticsTrip.tenant_id == tenant_uuid)
        .scalar_subquery()
    )
    lt_fuel_subq = (
        select(func.coalesce(func.sum(LogisticsTrip.fuel_consumed_liters), Decimal("0.00")))
        .where(LogisticsTrip.project_id.in_(scoped_ids), LogisticsTrip.tenant_id == tenant_uuid)
        .scalar_subquery()
    )
    lt_cost_subq = (
        select(func.coalesce(func.sum(LogisticsTrip.trip_cost), Decimal("0.0000")))
        .where(LogisticsTrip.project_id.in_(scoped_ids), LogisticsTrip.tenant_id == tenant_uuid)
        .scalar_subquery()
    )
    lt_hours_subq = (
        select(func.coalesce(func.sum(LogisticsTrip.driver_hours), Decimal("0.00")))
        .where(LogisticsTrip.project_id.in_(scoped_ids), LogisticsTrip.tenant_id == tenant_uuid)
        .scalar_subquery()
    )
    lt_weight_subq = (
        select(func.coalesce(func.sum(LogisticsTrip.planned_weight_tons), Decimal("0.0000")))
        .where(LogisticsTrip.project_id.in_(scoped_ids), LogisticsTrip.tenant_id == tenant_uuid)
        .scalar_subquery()
    )

    ft_total_subq = (
        select(func.count(FleetTrip.id))
        .where(FleetTrip.project_id.in_(scoped_ids), FleetTrip.company_id == tenant_uuid)
        .scalar_subquery()
    )
    ft_active_subq = (
        select(func.count(FleetTrip.id))
        .where(
            FleetTrip.project_id.in_(scoped_ids),
            FleetTrip.company_id == tenant_uuid,
            FleetTrip.status.in_(ACTIVE_FLEET_STATUSES),
        )
        .scalar_subquery()
    )
    ft_completed_subq = (
        select(func.count(FleetTrip.id))
        .where(
            FleetTrip.project_id.in_(scoped_ids),
            FleetTrip.company_id == tenant_uuid,
            FleetTrip.status.in_(COMPLETED_FLEET_STATUSES),
        )
        .scalar_subquery()
    )
    ft_cancelled_subq = (
        select(func.count(FleetTrip.id))
        .where(
            FleetTrip.project_id.in_(scoped_ids),
            FleetTrip.company_id == tenant_uuid,
            FleetTrip.status == "cancelled",
        )
        .scalar_subquery()
    )
    ft_weight_subq = (
        select(func.coalesce(func.sum(FleetTrip.planned_weight_tons), Decimal("0.0000")))
        .where(FleetTrip.project_id.in_(scoped_ids), FleetTrip.company_id == tenant_uuid)
        .scalar_subquery()
    )

    # Stock pickings, Stock moves & Stock movements subqueries
    sp_total_subq = (
        select(func.count(StockPicking.id))
        .where(StockPicking.project_id.in_(scoped_ids), StockPicking.company_id == tenant_uuid)
        .scalar_subquery()
    )
    sp_active_subq = (
        select(func.count(StockPicking.id))
        .where(
            StockPicking.project_id.in_(scoped_ids),
            StockPicking.company_id == tenant_uuid,
            StockPicking.state.in_(ACTIVE_PICKING_STATES),
        )
        .scalar_subquery()
    )
    sp_completed_subq = (
        select(func.count(StockPicking.id))
        .where(
            StockPicking.project_id.in_(scoped_ids),
            StockPicking.company_id == tenant_uuid,
            StockPicking.state.in_(COMPLETED_PICKING_STATES),
        )
        .scalar_subquery()
    )
    sp_cancelled_subq = (
        select(func.count(StockPicking.id))
        .where(
            StockPicking.project_id.in_(scoped_ids),
            StockPicking.company_id == tenant_uuid,
            StockPicking.state == "cancelled",
        )
        .scalar_subquery()
    )
    reserved_qty_subq = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            StockMove.quantity_planned > StockMove.quantity_done,
                            StockMove.quantity_planned - StockMove.quantity_done,
                        ),
                        else_=Decimal("0.0000"),
                    )
                ),
                Decimal("0.0000"),
            )
        )
        .select_from(StockMove)
        .join(StockPicking, StockMove.picking_id == StockPicking.id)
        .where(
            StockPicking.project_id.in_(scoped_ids),
            StockPicking.company_id == tenant_uuid,
            StockPicking.state.in_(ACTIVE_PICKING_STATES),
        )
        .scalar_subquery()
    )
    dispatched_qty_subq = (
        select(func.coalesce(func.sum(StockMove.quantity_done), Decimal("0.0000")))
        .select_from(StockMove)
        .join(StockPicking, StockMove.picking_id == StockPicking.id)
        .where(
            StockPicking.project_id.in_(scoped_ids),
            StockPicking.company_id == tenant_uuid,
            StockPicking.state.in_(COMPLETED_PICKING_STATES),
        )
        .scalar_subquery()
    )
    sm_count_subq = (
        select(func.count(StockMovement.id))
        .where(StockMovement.project_id.in_(scoped_ids), StockMovement.company_id == tenant_uuid)
        .scalar_subquery()
    )
    sm_qty_subq = (
        select(func.coalesce(func.sum(StockMovement.quantity), Decimal("0.0000")))
        .where(StockMovement.project_id.in_(scoped_ids), StockMovement.company_id == tenant_uuid)
        .scalar_subquery()
    )
    sm_val_subq = (
        select(
            func.coalesce(
                func.sum(StockMovement.quantity * StockMovement.unit_cost),
                Decimal("0.0000"),
            )
        )
        .where(StockMovement.project_id.in_(scoped_ids), StockMovement.company_id == tenant_uuid)
        .scalar_subquery()
    )

    agg_stmt = select(
        budget_subq.label("total_budget"),
        gl_debit_subq.label("gl_debit"),
        gl_credit_subq.label("gl_credit"),
        gl_count_subq.label("gl_count"),
        po_amount_subq.label("po_amount"),
        po_count_subq.label("po_count"),
        so_amount_subq.label("so_amount"),
        so_count_subq.label("so_count"),
        lt_total_subq.label("lt_total"),
        lt_active_subq.label("lt_active"),
        lt_completed_subq.label("lt_completed"),
        lt_cancelled_subq.label("lt_cancelled"),
        lt_distance_subq.label("lt_distance"),
        lt_fuel_subq.label("lt_fuel"),
        lt_cost_subq.label("lt_cost"),
        lt_hours_subq.label("lt_hours"),
        lt_weight_subq.label("lt_weight"),
        ft_total_subq.label("ft_total"),
        ft_active_subq.label("ft_active"),
        ft_completed_subq.label("ft_completed"),
        ft_cancelled_subq.label("ft_cancelled"),
        ft_weight_subq.label("ft_weight"),
        sp_total_subq.label("sp_total"),
        sp_active_subq.label("sp_active"),
        sp_completed_subq.label("sp_completed"),
        sp_cancelled_subq.label("sp_cancelled"),
        reserved_qty_subq.label("reserved_qty"),
        dispatched_qty_subq.label("dispatched_qty"),
        sm_count_subq.label("sm_count"),
        sm_qty_subq.label("sm_qty"),
        sm_val_subq.label("sm_val"),
    )

    agg_res = await db.execute(agg_stmt)
    row = agg_res.one()

    # Fetch active trip telemetry snapshots for live dashboard map pins
    active_trips_res = await db.execute(
        select(LogisticsTrip)
        .where(
            LogisticsTrip.project_id.in_(scoped_ids),
            LogisticsTrip.tenant_id == tenant_uuid,
            LogisticsTrip.status.in_(ACTIVE_FLEET_STATUSES),
        )
        .order_by(LogisticsTrip.updated_at.desc())
        .limit(25)
    )
    active_trip_rows = active_trips_res.scalars().all()
    active_trip_pings = [
        {
            "trip_id": str(t.id),
            "trip_number": t.trip_number,
            "project_id": str(t.project_id),
            "status": t.status,
            "origin_location": t.origin_location,
            "destination_location": t.destination_location,
            "distance_km": float(t.distance_km or 0),
            "fuel_consumed_liters": float(t.fuel_consumed_liters or 0),
            "telemetry_data": dict(t.telemetry_data or {}),
        }
        for t in active_trip_rows
    ]

    # Compute financial & operational metrics
    direct_budget = Decimal(str(root_project.financial_envelope or 0))
    total_budget = Decimal(str(row.total_budget or 0))
    gl_debit = Decimal(str(row.gl_debit or 0))
    gl_credit = Decimal(str(row.gl_credit or 0))
    actual_gl_expenses = gl_debit
    actual_trip_costs = Decimal(str(row.lt_cost or 0))
    total_actual_expenses = actual_gl_expenses + actual_trip_costs
    committed_po_amount = Decimal(str(row.po_amount or 0))
    total_committed_and_actual = total_actual_expenses + committed_po_amount
    remaining_budget = total_budget - total_actual_expenses
    budget_variance = total_budget - total_committed_and_actual
    utilization_pct = (
        round(float((total_actual_expenses / total_budget) * Decimal("100")), 2)
        if total_budget > Decimal("0")
        else 0.0
    )

    total_trips = int(row.lt_total or 0) + int(row.ft_total or 0)
    active_trips = int(row.lt_active or 0) + int(row.ft_active or 0)
    completed_trips = int(row.lt_completed or 0) + int(row.ft_completed or 0)
    cancelled_trips = int(row.lt_cancelled or 0) + int(row.ft_cancelled or 0)
    total_fuel_liters = Decimal(str(row.lt_fuel or 0))

    total_pickings = int(row.sp_total or 0)
    active_reservations = int(row.sp_active or 0)
    completed_pickings = int(row.sp_completed or 0)
    cancelled_pickings = int(row.sp_cancelled or 0)

    # Diesel CO2 emission factor: ~2.68 kg CO2 per liter of fuel consumed
    estimated_co2_kg = (total_fuel_liters * Decimal("2.68")).quantize(Decimal("0.01"))
    stored_esg = dict(root_project.esg_metrics or {})
    if "co2_kg" in stored_esg and estimated_co2_kg == Decimal("0.00"):
        try:
            estimated_co2_kg = Decimal(str(stored_esg["co2_kg"])).quantize(Decimal("0.01"))
        except Exception:
            pass

    budget_summary = BudgetVsActualTelemetry(
        direct_budget=direct_budget,
        total_budget=total_budget,
        actual_gl_debit=gl_debit,
        actual_gl_credit=gl_credit,
        actual_gl_expenses=actual_gl_expenses,
        actual_trip_costs=actual_trip_costs,
        total_actual_expenses=total_actual_expenses,
        committed_po_amount=committed_po_amount,
        total_committed_and_actual=total_committed_and_actual,
        remaining_budget=remaining_budget,
        budget_variance=budget_variance,
        budget_utilization_pct=utilization_pct,
        is_over_budget=total_actual_expenses > total_budget and total_budget > Decimal("0"),
        journal_entry_count=int(row.gl_count or 0),
        purchase_order_count=int(row.po_count or 0),
        sale_order_count=int(row.so_count or 0),
        sale_order_revenue=Decimal(str(row.so_amount or 0)),
    )

    fleet_summary = ActiveFleetTelemetry(
        total_trips=total_trips,
        active_trips=active_trips,
        completed_trips=completed_trips,
        cancelled_trips=cancelled_trips,
        total_distance_km=Decimal(str(row.lt_distance or 0)),
        total_fuel_consumed_liters=total_fuel_liters,
        total_driver_hours=Decimal(str(row.lt_hours or 0)),
        total_planned_weight_tons=Decimal(str(row.lt_weight or 0)) + Decimal(str(row.ft_weight or 0)),
        status_breakdown={
            "active": active_trips,
            "completed": completed_trips,
            "cancelled": cancelled_trips,
        },
        active_trip_pings=active_trip_pings,
    )

    stock_summary = StockReservationTelemetry(
        total_pickings=total_pickings,
        active_reservations=active_reservations,
        completed_pickings=completed_pickings,
        cancelled_pickings=cancelled_pickings,
        reserved_quantity=Decimal(str(row.reserved_qty or 0)),
        dispatched_quantity=Decimal(str(row.dispatched_qty or 0)),
        stock_movement_count=int(row.sm_count or 0),
        stock_movement_quantity=Decimal(str(row.sm_qty or 0)),
        stock_movement_valuation=Decimal(str(row.sm_val or 0)),
        picking_status_breakdown={
            "active_reservations": active_reservations,
            "completed": completed_pickings,
            "cancelled": cancelled_pickings,
        },
    )

    esg_iot_summary = ESGAndIoTTelemetry(
        telemetry_data=dict(root_project.telemetry_data or {}),
        esg_metrics=stored_esg,
        estimated_scope1_co2_kg=estimated_co2_kg,
    )

    return ProjectTelemetryResponse(
        project_id=root_project.id,
        tenant_id=root_project.tenant_id,
        project_code=root_project.project_code,
        name=root_project.name,
        project_type=ProjectType(root_project.project_type),
        status=ProjectStatus(root_project.status),
        include_sub_projects=include_sub_projects,
        scoped_project_ids=scoped_ids,
        total_budget=total_budget,
        actual_expenses=total_actual_expenses,
        committed_po_amount=committed_po_amount,
        remaining_budget=remaining_budget,
        budget_utilization_pct=utilization_pct,
        active_fleet_trips=active_trips,
        stock_reservations_count=active_reservations,
        budget_vs_actual=budget_summary,
        active_fleet=fleet_summary,
        stock_reservations=stock_summary,
        esg_and_iot=esg_iot_summary,
        generated_at=datetime.now(timezone.utc),
    )


__all__ = ["router", "get_planning_tenant_db"]
