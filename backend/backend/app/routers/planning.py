from __future__ import annotations

from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text, func

# Import database session dependency and models
# (Adjust import paths based on your repository structure)
from backend.database import get_db
from backend.app.domains.planning.models import CoreProject, ProjectStatusEnum

router = APIRouter(tags=["Planning Department Spine"])

# ==========================================
# Pydantic Schemas for Validation & Serialization
# ==========================================

class ProjectCreate(BaseModel):
    code: str = Field(..., description="Unique immutable project code/SKU")
    name: str = Field(..., description="Project display title")
    description: Optional[str] = None
    status: ProjectStatusEnum = Field(default=ProjectStatusEnum.DRAFT)
    metadata_json: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Flexible domain attributes")

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatusEnum] = None
    metadata_json: Optional[Dict[str, Any]] = None

class ProjectResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: Optional[str]
    status: ProjectStatusEnum
    metadata_json: Dict[str, Any]

    class Config:
        from_attributes = True

class ProjectLedgerSummary(BaseModel):
    project_id: UUID
    project_code: str
    project_name: str
    metrics: Dict[str, Any] = Field(..., description="Aggregated transactional counts and totals per domain")


# ==========================================
# 1. Project CRUD & Lifecycle Endpoints
# ==========================================

@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    """Initialize a new immutable core project spine."""
    existing = db.query(CoreProject).filter(CoreProject.code == payload.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Project with code '{payload.code}' already exists."
        )
    
    project = CoreProject(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        status=payload.status,
        metadata_json=payload.metadata_json or {}
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects", response_model=List[ProjectResponse])
def list_projects(
    status_filter: Optional[ProjectStatusEnum] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Retrieve all core projects with optional filtering by lifecycle status."""
    query = db.query(CoreProject)
    if status_filter:
        query = query.filter(CoreProject.status == status_filter)
    return query.offset(skip).limit(limit).all()


@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: UUID, db: Session = Depends(get_db)):
    """Fetch project details by UUID spine identifier."""
    project = db.query(CoreProject).filter(CoreProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project spine not found.")
    return project


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(project_id: UUID, payload: ProjectUpdate, db: Session = Depends(get_db)):
    """Update project attributes or transition lifecycle states."""
    project = db.query(CoreProject).filter(CoreProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project spine not found.")
    
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
        
    db.commit()
    db.refresh(project)
    return project


# ==========================================
# 2. Project-Linked Ledger & Domain Analytics
# ==========================================

@router.get("/projects/{project_id}/ledger-summary", response_model=ProjectLedgerSummary)
def get_project_ledger_summary(project_id: UUID, db: Session = Depends(get_db)):
    """
    Query and aggregate operational metrics across all downstream domains linked to this project spine 
    (Accounting moves, Purchase Orders, Inventory Pickings, Logistics Trips, Maintenance, etc.).
    """
    project = db.query(CoreProject).filter(CoreProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project spine not found.")

    # Helper function to safely count rows linked to this project across domains
    def count_rows(table_name: str) -> int:
        try:
            res = db.execute(
                text(f"SELECT COUNT(*) FROM {table_name} WHERE project_id = :pid"),
                {"pid": str(project_id)}
            ).scalar()
            return res or 0
        except Exception:
            # Fallback if table doesn't have records or schema varies slightly
            return 0

    metrics = {
        "accounting_moves": count_rows("account_moves"),
        "purchase_orders": count_rows("purchase_orders"),
        "stock_pickings": count_rows("stock_pickings"),
        "logistics_trips": count_rows("logistics_trips"),
        "maintenance_work_orders": count_rows("maintenance_work_orders"),
        "execution_tasks": count_rows("execution_tasks"),
        "timesheets_logged": count_rows("attendance_logs")
    }

    return ProjectLedgerSummary(
        project_id=project.id,
        project_code=project.code,
        project_name=project.name,
        metrics=metrics
    )

    from datetime import datetime

# --- Additional Pydantic Schemas ---
class ApprovalActionRequest(BaseModel):
    action: str = Field(..., description="Action: 'request_approval', 'approve', 'reject'")
    approver_role: str = Field(..., description="Role of actor: 'CFO', 'Director', 'Manager'")
    comments: Optional[str] = None

class BudgetMatrixResponse(BaseModel):
    project_id: UUID
    budget_ceiling: float
    total_actual_spent: float
    variance: float
    breakdown: Dict[str, float]


# --- 1. Approval Workflow Endpoint ---
@router.post("/projects/{project_id}/approval", response_model=ProjectResponse)
def handle_project_approval(project_id: UUID, payload: ApprovalActionRequest, db: Session = Depends(get_db)):
    """Manage multi-level sign-off workflows for project activation gateways."""
    project = db.query(CoreProject).filter(CoreProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project spine not found.")
    
    metadata = project.metadata_json or {}
    budget_ceiling = float(metadata.get("estimated_budget", 0.0))
    
    # Check if budget threshold requires CFO approval (> $50,000)
    requires_cfo = budget_ceiling > 50000.0

    if payload.action == "request_approval":
        metadata["approval_status"] = "pending_cfo" if requires_cfo else "pending_manager"
        project.status = "draft"
    elif payload.action == "approve":
        if requires_cfo and payload.approver_role != "CFO":
            raise HTTPException(status_code=403, detail="CFO authorization required for budgets exceeding $50,000.")
        metadata["approval_status"] = "approved"
        metadata["approved_by"] = payload.approver_role
        metadata["approved_at"] = datetime.utcnow().isoformat()
        project.status = "active" # Automatically transition to active upon approval!
    elif payload.action == "reject":
        metadata["approval_status"] = "rejected"
        metadata["rejection_reason"] = payload.comments
        project.status = "suspended"
    else:
        raise HTTPException(status_code=400, detail="Invalid approval action.")

    project.metadata_json = metadata
    db.commit()
    db.refresh(project)

    # Log action to platform_audit_logs
    try:
        db.execute(
            text("""
                INSERT INTO platform_audit_logs (id, event_type, entity_type, entity_id, actor_role, details, created_at)
                VALUES (gen_random_uuid(), :et, 'core_project', :eid, :role, :det, NOW())
            """),
            {
                "et": f"PROJECT_APPROVAL_{payload.action.upper()}",
                "eid": str(project.id),
                "role": payload.approver_role,
                "det": f"Project {project.code} approval status updated to {metadata.get('approval_status')}. Comments: {payload.comments}"
            }
        )
        db.commit()
    except Exception as e:
        print(f"Audit log warning: {e}")

    return project


# --- 2. Budget vs Actual Cost Matrix Endpoint ---
@router.get("/projects/{project_id}/budget-matrix", response_model=BudgetMatrixResponse)
def get_budget_matrix(project_id: UUID, db: Session = Depends(get_db)):
    """Calculate budget ceiling versus aggregated actual costs across POs, vendor bills, and payroll."""
    project = db.query(CoreProject).filter(CoreProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project spine not found.")

    metadata = project.metadata_json or {}
    budget_ceiling = float(metadata.get("estimated_budget", 0.0) or 0.0)

    def sum_table_column(table_name: str, col_name: str) -> float:
        try:
            res = db.execute(
                text(f"SELECT SUM({col_name}) FROM {table_name} WHERE project_id = :pid"),
                {"pid": str(project_id)}
            ).scalar()
            return float(res or 0.0)
        except Exception:
            return 0.0

    po_spent = sum_table_column("purchase_orders", "total_amount") or sum_table_column("purchase_order_lines", "subtotal")
    bills_spent = sum_table_column("vendor_bills", "amount_total") or sum_table_column("supplier_invoices", "amount_total")
    payroll_spent = sum_table_column("payroll_allowances", "amount") or sum_table_column("payroll_runs", "total_payout")

    breakdown = {
        "purchase_orders": po_spent,
        "vendor_bills": bills_spent,
        "payroll_allocations": payroll_spent
    }

    total_actual = sum(breakdown.values())
    variance = budget_ceiling - total_actual

    return BudgetMatrixResponse(
        project_id=project.id,
        budget_ceiling=budget_ceiling,
        total_actual_spent=total_actual,
        variance=variance,
        breakdown=breakdown
    )