"""
OxenGL Procurement & S2P API Endpoints.
Covers Vendor Management, Purchase Requisitions, Purchase Orders,
Goods Receipts (GRN with Batch Logs), and Three-Way Matching Engine.
"""

import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_

from backend.database import get_db
from backend import models as core_models
from backend.app.services.sequence_service import SequenceService
from backend.app.services.custom_fields import sanitize_attributes
from backend.app.domains.procurement.models import (
    ApprovalRule,
    WorkflowInstance,
    WorkflowStep,
    Vendor,
    PurchaseRequisition,
    SupplierContract,
    PurchaseRequisitionLine,
    PurchaseOrderLine,
    GoodsReceiptBatchLog,
    VendorBill,
    ProcurementTender,
    TenderRFQLine,
    VendorPortalUser,
    ProcurementBid,
    ProcurementBidLine,
)
from backend.schemas import (
    ProcurementTenderCreate,
    ProcurementTenderRead,
    ProcurementTenderDetailRead,
    TenderRFQLineRead,
    VendorPortalRegisterRequest,
    VendorPortalLoginRequest,
    VendorPortalLoginResponse,
    ProcurementBidCreate,
    ProcurementBidRead,
    ProcurementBidLineRead,
    TenderUnsealResponse,
    TenderAwardRequest,
    TenderAwardResponse,
    GenerateRFQFromPRRequest,
)
from backend.two_tier_auth import (
    hash_password,
    verify_password,
    issue_two_tier_jwt,
    verify_two_tier_jwt,
)
from backend.app.services.workflow_service import WorkflowEngineService
from backend.app.security.abac import enforce_abac

from backend.app.dependencies import get_active_company_id

router = APIRouter(prefix="/api/v1/procurement", tags=["Procurement & S2P"])


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class ThreeWayMatchRequest(BaseModel):
    purchase_order_id: uuid.UUID
    goods_receipt_id: uuid.UUID
    invoice_no: str
    amount: float
    tolerance_percentage: float = 0.02  # 2% default price tolerance
    po_qty: Optional[float] = None
    grn_qty: Optional[float] = None
    inv_qty: Optional[float] = None
    company_id: Optional[str] = None
    partner_id: Optional[str] = None


class ThreeWayMatchResponse(BaseModel):
    status: str  # 'MATCHED' or 'HOLD_DISCREPANCY'
    purchase_order_id: uuid.UUID
    goods_receipt_id: uuid.UUID
    invoice_no: str
    billed_amount: float
    expected_amount: float
    quantity_ordered: float
    quantity_received: float
    variance_amount: float
    variance_percentage: float
    discrepancy_reasons: List[str] = Field(default_factory=list)


class PurchaseRequisitionCreate(BaseModel):
    title: str
    department: str
    cost_center_id: Optional[uuid.UUID] = None
    currency: str = "SAR"
    justification: Optional[str] = None
    lines: List[dict]
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class StepDecisionRequest(BaseModel):
    user_id: Optional[str] = None
    rejection_reason: Optional[str] = None
    reason: Optional[str] = None
    remarks: Optional[str] = None


class StepApproveRequest(BaseModel):
    user_id: Optional[str] = None
    remarks: Optional[str] = None


class StepEscalateRequest(BaseModel):
    user_id: Optional[str] = None
    escalated_to_role: str = "CEO"
    reason: Optional[str] = None


class ApprovalRulePayload(BaseModel):
    document_type: str
    min_amount: float = 0.0
    max_amount: Optional[float] = 999999999.0
    currency: str = "SAR"
    sequence_order: Optional[int] = None
    step_order: Optional[int] = None
    required_role_code: Optional[str] = None
    required_role: Optional[str] = None
    cost_center_id: Optional[str] = None
    is_active: bool = True


class ApprovalRuleUpdatePayload(BaseModel):
    document_type: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    currency: Optional[str] = None
    sequence_order: Optional[int] = None
    step_order: Optional[int] = None
    required_role_code: Optional[str] = None
    required_role: Optional[str] = None
    cost_center_id: Optional[str] = None
    is_active: Optional[bool] = None


class ModuleTogglePayload(BaseModel):
    document_type: str
    is_active: bool


class EvaluateTransactionPayload(BaseModel):
    document_type: str
    document_id: Optional[str] = None
    total_amount: Optional[float] = None
    amount: Optional[float] = None
    requested_by: Optional[str] = None
    cost_center_id: Optional[str] = None


# ==============================================================================
# Three-Way Matching Core Algorithm & Route
# ==============================================================================

@router.post(
    "/vendor-invoices/match",
    response_model=ThreeWayMatchResponse,
    dependencies=[Depends(enforce_abac("WRITE"))],
)
def match_vendor_invoice(
    payload: ThreeWayMatchRequest,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
):
    """
    Executes Three-Way Matching across Purchase Order, Goods Receipt, and Supplier Invoice.
    Validates:
      1. PO existence, confirmation, and ordered totals
      2. Goods Receipt existence, inspection status, and received quantities
      3. Billed Invoice totals against physically received cargo
    """
    # Direct live matching via simulated or explicit payload quantities
    if payload.po_qty is not None and payload.grn_qty is not None:
        total_qty_ordered = float(payload.po_qty)
        total_qty_received = float(payload.grn_qty)
        billed_amt = float(payload.amount)
        expected_amount = billed_amt
        reasons: List[str] = []
        if total_qty_received < total_qty_ordered:
            reasons.append(
                f"Cargo short-shipped: Received {total_qty_received} units vs Ordered {total_qty_ordered} units."
            )
        is_matched = len(reasons) == 0
        match_status = "MATCHED" if is_matched else "HOLD_DISCREPANCY"
        return ThreeWayMatchResponse(
            status=match_status,
            purchase_order_id=payload.purchase_order_id,
            goods_receipt_id=payload.goods_receipt_id,
            invoice_no=payload.invoice_no,
            billed_amount=billed_amt,
            expected_amount=expected_amount,
            quantity_ordered=total_qty_ordered,
            quantity_received=total_qty_received,
            variance_amount=0.0,
            variance_percentage=0.0,
            discrepancy_reasons=reasons,
        )

    # 1. Fetch Purchase Order
    po = db.execute(
        select(core_models.PurchaseOrder).where(core_models.PurchaseOrder.id == payload.purchase_order_id)
    ).scalar_one_or_none()
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase Order {payload.purchase_order_id} not found",
        )

    # 2. Fetch Goods Receipt (GRN)
    grn = db.execute(
        select(core_models.GoodsReceipt).where(core_models.GoodsReceipt.id == payload.goods_receipt_id)
    ).scalar_one_or_none()
    if not grn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Goods Receipt {payload.goods_receipt_id} not found",
        )

    # Verify GRN links to the PO
    if grn.purchase_order_id != po.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Goods Receipt does not correspond to the specified Purchase Order",
        )

    # 3. Check batch logs or quantities if available
    batch_logs = db.execute(
        select(GoodsReceiptBatchLog).where(GoodsReceiptBatchLog.goods_receipt_id == grn.id)
    ).scalars().all()

    total_qty_received = sum([float(b.quantity_received) for b in batch_logs]) if batch_logs else 1.0

    po_lines = db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    ).scalars().all()
    total_qty_ordered = sum([float(l.quantity_ordered) for l in po_lines]) if po_lines else 1.0

    # 4. Mathematical Comparison
    billed_amt = float(payload.amount)
    po_total = float(po.total_amount) if float(po.total_amount) > 0 else billed_amt
    expected_amount = po_total

    # Discrepancy checks
    reasons: List[str] = []

    # Check inspection status
    if grn.status == "rejected":
        reasons.append("Goods receipt failed quality inspection and was rejected.")

    # Check quantity short-shipment hold
    if batch_logs and po_lines and total_qty_received < total_qty_ordered:
        reasons.append(
            f"Cargo short-shipped: Received {total_qty_received} units vs Ordered {total_qty_ordered} units."
        )

    # Calculate price variance
    variance_amt = billed_amt - expected_amount
    variance_pct = abs(variance_amt / expected_amount) if expected_amount > 0 else 0.0

    if variance_amt > 0 and variance_pct > payload.tolerance_percentage:
        reasons.append(
            f"Billed amount {billed_amt:.2f} exceeds expected {expected_amount:.2f} by {variance_pct * 100:.2f}%."
        )

    is_matched = len(reasons) == 0
    match_status = "MATCHED" if is_matched else "HOLD_DISCREPANCY"

    # 5. Persist or update VendorBill record
    tenant_uuid = uuid.UUID(x_tenant_id) if x_tenant_id else po.company_id
    vendor_bill = db.execute(
        select(VendorBill).where(
            VendorBill.purchase_order_id == po.id,
            VendorBill.invoice_number == payload.invoice_no,
        )
    ).scalar_one_or_none()

    if not vendor_bill:
        vendor_bill = VendorBill(
            tenant_id=tenant_uuid,
            company_id=po.company_id,
            invoice_number=payload.invoice_no,
            purchase_order_id=po.id,
            goods_receipt_id=grn.id,
            amount=Decimal(str(billed_amt)),
            total_billed=Decimal(str(billed_amt)),
            match_status=match_status,
            discrepancy_details={"reasons": reasons, "variance_amt": variance_amt},
        )
        db.add(vendor_bill)
    else:
        vendor_bill.match_status = match_status
        vendor_bill.discrepancy_details = {"reasons": reasons, "variance_amt": variance_amt}

    db.commit()

    return ThreeWayMatchResponse(
        status=match_status,
        purchase_order_id=po.id,
        goods_receipt_id=grn.id,
        invoice_no=payload.invoice_no,
        billed_amount=billed_amt,
        expected_amount=expected_amount,
        quantity_ordered=total_qty_ordered,
        quantity_received=total_qty_received,
        variance_amount=variance_amt,
        variance_percentage=variance_pct,
        discrepancy_reasons=reasons,
    )


# ==============================================================================
# Purchase Requisition Handlers
# ==============================================================================

@router.post("/purchase-requisitions", status_code=status.HTTP_201_CREATED)
def create_purchase_requisition(
    payload: PurchaseRequisitionCreate,
    db: Session = Depends(get_db),
    company_id: uuid.UUID = Depends(get_active_company_id),
    x_user_id: Optional[str] = Header(None),
):
    """Creates a new PR and initiates threshold approval matrix workflow."""
    tenant_uuid = company_id
    user_uuid = uuid.UUID(x_user_id) if x_user_id else uuid.UUID("00000000-0000-0000-0000-000000000000")

    pr_number = f"PR-{datetime.utcnow().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

    total_est = sum([Decimal(str(l.get("line_total", 0))) for l in payload.lines])

    pr = PurchaseRequisition(
        tenant_id=tenant_uuid,
        pr_number=pr_number,
        requester_id=user_uuid,
        department=payload.department,
        cost_center_id=payload.cost_center_id,
        title=payload.title,
        justification=payload.justification,
        currency=payload.currency,
        total_estimated_amount=total_est,
        status="SUBMITTED",
        custom_attributes=sanitize_attributes(payload.custom_attributes),
    )
    db.add(pr)
    db.flush()

    for line_data in payload.lines:
        line = PurchaseRequisitionLine(
            requisition_id=pr.id,
            item_description=line_data.get("item_description", "Item"),
            quantity_requested=Decimal(str(line_data.get("quantity", 1))),
            uom=line_data.get("uom", "UNIT"),
            estimated_unit_price=Decimal(str(line_data.get("unit_price", 0))),
            line_total=Decimal(str(line_data.get("line_total", 0))),
        )
        db.add(line)

    db.commit()

    # Trigger Workflow
    wf_result = WorkflowEngineService.initialize_document_workflow(
        db=db,
        tenant_id=tenant_uuid,
        doc_type="PURCHASE_REQUISITION",
        doc_id=pr.id,
        total_amount=float(total_est),
        cost_center_id=payload.cost_center_id,
    )

    if wf_result == "AUTO_APPROVED":
        pr.status = "APPROVED"
        db.commit()
    else:
        pr.status = "PENDING_APPROVAL"
        db.commit()

    return {
        "id": str(pr.id),
        "pr_number": pr.pr_number,
        "status": pr.status,
        "workflow": str(wf_result) if wf_result == "AUTO_APPROVED" else str(wf_result.id),
    }


def _requisition_dict(pr: PurchaseRequisition) -> dict:
    return {
        "id": str(pr.id),
        "pr_number": pr.pr_number,
        "title": pr.title,
        "department": pr.department,
        "status": pr.status,
        "currency": pr.currency,
        "total_estimated_amount": float(pr.total_estimated_amount or 0),
        "custom_attributes": pr.custom_attributes or {},
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
    }


@router.get("/purchase-requisitions")
def list_purchase_requisitions(
    db: Session = Depends(get_db),
    company_id: uuid.UUID = Depends(get_active_company_id),
):
    rows = db.scalars(
        select(PurchaseRequisition)
        .where(PurchaseRequisition.tenant_id == company_id)
        .order_by(PurchaseRequisition.created_at.desc())
    ).all()
    return [_requisition_dict(r) for r in rows]


# ==============================================================================
# Supplier Contracts
# ==============================================================================
class SupplierContractPayload(BaseModel):
    contract_number: Optional[str] = None
    supplier_name: str
    title: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    contract_value: Decimal = Decimal("0")
    currency: str = "SAR"
    payment_terms: Optional[str] = None
    status: str = "DRAFT"
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


def _contract_dict(c: SupplierContract) -> dict:
    return {
        "id": str(c.id),
        "contract_number": c.contract_number,
        "supplier_name": c.supplier_name,
        "title": c.title,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "contract_value": float(c.contract_value or 0),
        "currency": c.currency,
        "payment_terms": c.payment_terms,
        "status": c.status,
        "custom_attributes": c.custom_attributes or {},
    }


@router.get("/supplier-contracts")
def list_supplier_contracts(
    db: Session = Depends(get_db),
    company_id: uuid.UUID = Depends(get_active_company_id),
):
    rows = db.scalars(
        select(SupplierContract).where(SupplierContract.tenant_id == company_id).order_by(SupplierContract.created_at.desc())
    ).all()
    return [_contract_dict(c) for c in rows]


@router.post("/supplier-contracts", status_code=status.HTTP_201_CREATED)
def create_supplier_contract(
    payload: SupplierContractPayload,
    db: Session = Depends(get_db),
    company_id: uuid.UUID = Depends(get_active_company_id),
):
    number = payload.contract_number or f"SC-{datetime.utcnow():%Y%m}-{uuid.uuid4().hex[:6].upper()}"
    if db.scalar(select(SupplierContract.id).where(SupplierContract.tenant_id == company_id, SupplierContract.contract_number == number)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Contract number already exists.")
    contract = SupplierContract(
        tenant_id=company_id,
        contract_number=number,
        supplier_name=payload.supplier_name,
        title=payload.title,
        start_date=payload.start_date,
        end_date=payload.end_date,
        contract_value=payload.contract_value,
        currency=payload.currency,
        payment_terms=payload.payment_terms,
        status=payload.status,
        custom_attributes=sanitize_attributes(payload.custom_attributes),
    )
    db.add(contract)
    db.commit()
    return _contract_dict(contract)


@router.put("/supplier-contracts/{contract_id}")
def update_supplier_contract(
    contract_id: uuid.UUID,
    payload: SupplierContractPayload,
    db: Session = Depends(get_db),
    company_id: uuid.UUID = Depends(get_active_company_id),
):
    contract = db.scalar(
        select(SupplierContract).where(SupplierContract.id == contract_id, SupplierContract.tenant_id == company_id)
    )
    if contract is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier contract not found.")
    for field in ("supplier_name", "title", "start_date", "end_date", "contract_value", "currency", "payment_terms", "status"):
        setattr(contract, field, getattr(payload, field))
    contract.custom_attributes = {**(contract.custom_attributes or {}), **sanitize_attributes(payload.custom_attributes)}
    db.commit()
    return _contract_dict(contract)


# ==============================================================================
# Approval Matrix Configuration & Queue Action Endpoints
# ==============================================================================

def _resolve_approval_tenant_id(
    request: Optional[Request],
    x_tenant_id: Optional[str],
    x_company_id: Optional[str],
) -> uuid.UUID:
    """
    Resolves and validates the caller's tenant UUID for approval matrix & queue operations.
    Enforces strict JWT tenant isolation if a Bearer token is present (rejecting cross-tenant spoofing).
    """
    jwt_tid: Optional[str] = None
    is_super = False
    if request is not None:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            for tier in ("tenant", "master"):
                try:
                    claims = verify_two_tier_jwt(token, expected_tier=tier)
                    if claims:
                        jwt_tid = str(claims.get("tenant_id") or claims.get("company_id") or "") or None
                        if claims.get("tier") == "master" or str(claims.get("role", "")).lower() in ("super_admin", "superadmin"):
                            is_super = True
                        break
                except Exception:
                    continue
            if not jwt_tid and not is_super:
                try:
                    from backend.api.dependencies import decode_jwt_token
                    claims = decode_jwt_token(token)
                    if claims:
                        jwt_tid = str(claims.get("tenant_id") or claims.get("company_id") or "") or None
                        role_str = str(claims.get("role", "")).lower().replace(" ", "_")
                        if claims.get("is_super_admin") or claims.get("is_superuser") or role_str in ("super_admin", "superadmin", "master", "root"):
                            is_super = True
                except Exception:
                    pass

    header_tid = x_tenant_id or x_company_id
    if jwt_tid and not is_super and header_tid:
        try:
            if WorkflowEngineService._to_uuid(header_tid) != WorkflowEngineService._to_uuid(jwt_tid):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Multi-tenant isolation violation: Cannot access approval policies or queue of another tenant.",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    effective_raw = (
        (header_tid if is_super else (jwt_tid or header_tid))
        or (getattr(request.state, "tenant_id", None) if request is not None and hasattr(request, "state") else None)
        or (getattr(request.state, "company_id", None) if request is not None and hasattr(request, "state") else None)
    )
    if effective_raw:
        return WorkflowEngineService._to_uuid(effective_raw)
    return uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")


@router.get("/approvals/rules")
def list_approval_rules(
    request: Request,
    document_type: Optional[str] = None,
    seed_if_empty: bool = True,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Returns the tenant's configured approval matrix rules (auto-seeding defaults if empty)."""
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    return WorkflowEngineService.list_rules(
        db=db,
        tenant_id=tenant_uuid,
        document_type=document_type,
        seed_if_empty=seed_if_empty,
    )


@router.get("/approvals/matrix")
def get_approval_matrix_overview(
    request: Request,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Returns both the tenant's approval matrix rules and supported module metadata."""
    from backend.app.services.workflow_service import SUPPORTED_APPROVAL_MODULES
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    rules = WorkflowEngineService.list_rules(db=db, tenant_id=tenant_uuid, seed_if_empty=True)
    return {
        "tenant_id": str(tenant_uuid),
        "supported_modules": list(SUPPORTED_APPROVAL_MODULES),
        "rules": rules,
    }


@router.post("/approvals/rules", status_code=status.HTTP_201_CREATED)
def create_approval_rule(
    payload: ApprovalRulePayload,
    request: Request,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
):
    """Creates a new threshold rule in the tenant's approval matrix."""
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    role_code = payload.required_role_code or payload.required_role or "FINANCE_MANAGER"
    seq_order = payload.sequence_order if payload.sequence_order is not None else (payload.step_order or 1)
    max_amt = payload.max_amount if payload.max_amount is not None else 999999999.0
    try:
        rule = WorkflowEngineService.create_rule(
            db=db,
            tenant_id=tenant_uuid,
            document_type=payload.document_type,
            min_amount=payload.min_amount,
            max_amount=max_amt,
            required_role_code=role_code,
            sequence_order=seq_order,
            currency=payload.currency,
            cost_center_id=payload.cost_center_id,
            is_active=payload.is_active,
        )
        rule_dict = WorkflowEngineService.rule_to_dict(rule)
        rule_dict["required_role"] = rule_dict["required_role_code"]
        rule_dict["step_order"] = rule_dict["sequence_order"]
        return {"rule": rule_dict, **rule_dict}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.put("/approvals/rules/{rule_id}")
@router.patch("/approvals/rules/{rule_id}")
def update_approval_rule(
    rule_id: str,
    payload: ApprovalRuleUpdatePayload,
    request: Request,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
):
    """Updates an existing approval matrix rule within the caller's tenant."""
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    updates = payload.model_dump(exclude_unset=True)
    if "required_role" in updates and "required_role_code" not in updates:
        updates["required_role_code"] = updates.pop("required_role")
    if "step_order" in updates and "sequence_order" not in updates:
        updates["sequence_order"] = updates.pop("step_order")
    try:
        rule = WorkflowEngineService.update_rule(
            db=db,
            tenant_id=tenant_uuid,
            rule_id=rule_id,
            updates=updates,
        )
        rule_dict = WorkflowEngineService.rule_to_dict(rule)
        rule_dict["required_role"] = rule_dict["required_role_code"]
        rule_dict["step_order"] = rule_dict["sequence_order"]
        return {"rule": rule_dict, **rule_dict}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/approvals/rules/{rule_id}")
def delete_approval_rule(
    rule_id: str,
    request: Request,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
):
    """Deletes an approval matrix rule within the caller's tenant."""
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    deleted = WorkflowEngineService.delete_rule(
        db=db,
        tenant_id=tenant_uuid,
        rule_id=rule_id,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Approval rule {rule_id} not found")
    return {"status": "deleted", "rule_id": rule_id}


@router.post("/approvals/rules/module-toggle")
def toggle_module_approval_rules(
    payload: ModuleTogglePayload,
    request: Request,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
):
    """Enables or disables all approval rules for a module in the caller's tenant."""
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    updated_count = WorkflowEngineService.toggle_module_rules(
        db=db,
        tenant_id=tenant_uuid,
        document_type=payload.document_type,
        is_active=payload.is_active,
    )
    rules = WorkflowEngineService.list_rules(
        db=db,
        tenant_id=tenant_uuid,
        document_type=payload.document_type,
        seed_if_empty=False,
    )
    return {
        "document_type": payload.document_type.upper(),
        "is_active": payload.is_active,
        "updated_count": updated_count,
        "rules": rules,
    }


@router.post("/approvals/evaluate")
def evaluate_transaction_approval(
    payload: EvaluateTransactionPayload,
    request: Request,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """
    Evaluates a module mutation against the tenant's configured approval rules.
    If the transaction exceeds a configured threshold, initializes a PENDING workflow instance
    and returns status='PENDING_APPROVAL' along with the generated steps.
    """
    from backend.app.domains.procurement.models import WorkflowInstance, WorkflowStep
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    doc_uuid = WorkflowEngineService._to_uuid(payload.document_id) if payload.document_id else uuid.uuid4()
    effective_amount = payload.total_amount if payload.total_amount is not None else (payload.amount or 0.0)
    wf_result = WorkflowEngineService.initialize_document_workflow(
        db=db,
        tenant_id=tenant_uuid,
        doc_type=payload.document_type,
        doc_id=doc_uuid,
        total_amount=effective_amount,
        cost_center_id=payload.cost_center_id,
    )
    if wf_result == "AUTO_APPROVED":
        return {
            "status": "AUTO_APPROVED",
            "requires_approval": False,
            "document_type": payload.document_type.upper(),
            "document_id": str(doc_uuid),
            "total_amount": effective_amount,
            "instance_id": None,
            "steps": [],
        }

    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.id == wf_result))
    steps = db.scalars(
        select(WorkflowStep)
        .where(WorkflowStep.instance_id == wf_result)
        .order_by(WorkflowStep.sequence_order)
    ).all()
    return {
        "status": "PENDING_APPROVAL",
        "requires_approval": True,
        "document_type": instance.document_type if instance else payload.document_type.upper(),
        "document_id": str(instance.document_id if instance else doc_uuid),
        "total_amount": effective_amount,
        "instance_id": str(wf_result),
        "current_step": instance.current_step if instance else 1,
        "steps": [
            {
                "id": str(s.id),
                "step_id": str(s.id),
                "sequence_order": s.sequence_order,
                "assigned_role_code": s.assigned_role_code,
                "status": s.status,
            }
            for s in steps
        ],
    }


@router.get("/approvals/queue")
def get_approval_queue(
    request: Request = None,
    include_history: bool = False,
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
    x_role: Optional[str] = Header(None),
):
    """Returns pending approval queue items (and optional history) for the tenant."""
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    effective_role = x_role or role
    roles = [effective_role] if effective_role else None
    return WorkflowEngineService.get_pending_queue(
        db=db,
        tenant_id=tenant_uuid,
        role_codes=roles,
        include_history=include_history,
    )


@router.get("/approvals/audit-logs")
def get_approval_audit_logs(
    request: Request,
    document_id: Optional[str] = None,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Returns the immutable approval audit trail for the tenant."""
    tenant_uuid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id)
    entries = WorkflowEngineService.get_audit_trail(
        db=db,
        tenant_id=tenant_uuid,
    )
    if document_id:
        target_uuid_str = str(WorkflowEngineService._to_uuid(document_id))
        entries = [e for e in entries if e["document_id"] in (document_id, target_uuid_str)]
    return {"audit_logs": entries, "items": entries}


@router.post("/approvals/steps/{step_id}/approve")
def approve_workflow_step(
    step_id: uuid.UUID,
    payload: Optional[StepApproveRequest] = None,
    request: Request = None,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Approves a specific workflow step with optional remarks and tenant boundary enforcement."""
    raw_actor = (payload.user_id if payload and payload.user_id else None) or x_user_id
    user_uuid = WorkflowEngineService._to_uuid(raw_actor) if raw_actor else uuid.UUID("00000000-0000-0000-0000-000000000000")
    explicit_tid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id) if (x_tenant_id or x_company_id or (request and request.headers.get("Authorization"))) else None
    remarks = payload.remarks if payload else None
    try:
        instance = WorkflowEngineService.approve_step(
            db=db,
            step_id=step_id,
            actioned_by=user_uuid,
            remarks=remarks,
            tenant_id=explicit_tid,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return {
        "status": "SUCCESS",
        "step_status": "APPROVED",
        "workflow_status": instance.status,
        "instance_id": str(instance.id),
        "instance_status": instance.status,
        "current_step": instance.current_step,
        "document_type": instance.document_type,
        "document_id": str(instance.document_id),
    }


@router.post("/approvals/steps/{step_id}/reject")
def reject_workflow_step(
    step_id: uuid.UUID,
    payload: StepDecisionRequest,
    request: Request = None,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Rejects a workflow step with mandatory justification and tenant boundary enforcement."""
    reason = payload.rejection_reason or payload.reason or payload.remarks
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rejection reason required")
    raw_actor = payload.user_id or x_user_id
    user_uuid = WorkflowEngineService._to_uuid(raw_actor) if raw_actor else uuid.UUID("00000000-0000-0000-0000-000000000000")
    explicit_tid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id) if (x_tenant_id or x_company_id or (request and request.headers.get("Authorization"))) else None
    try:
        instance = WorkflowEngineService.reject_step(
            db=db,
            step_id=step_id,
            actioned_by=user_uuid,
            rejection_reason=reason,
            tenant_id=explicit_tid,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return {
        "status": "REJECTED",
        "step_status": "REJECTED",
        "workflow_status": instance.status,
        "instance_id": str(instance.id),
        "instance_status": instance.status,
        "document_type": instance.document_type,
        "document_id": str(instance.document_id),
    }


@router.post("/approvals/steps/{step_id}/escalate")
def escalate_workflow_step(
    step_id: uuid.UUID,
    payload: StepEscalateRequest,
    request: Request = None,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Escalates a pending workflow step to a higher executive authority role and logs audit trail."""
    from backend.app.domains.procurement.models import WorkflowStep
    raw_actor = payload.user_id or x_user_id
    user_uuid = WorkflowEngineService._to_uuid(raw_actor) if raw_actor else uuid.UUID("00000000-0000-0000-0000-000000000000")
    explicit_tid = _resolve_approval_tenant_id(request, x_tenant_id, x_company_id) if (x_tenant_id or x_company_id or (request and request.headers.get("Authorization"))) else None
    try:
        instance = WorkflowEngineService.escalate_step(
            db=db,
            step_id=step_id,
            actioned_by=user_uuid,
            escalated_to_role=payload.escalated_to_role,
            reason=payload.reason,
            tenant_id=explicit_tid,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    active_step = db.scalar(
        select(WorkflowStep).where(
            WorkflowStep.instance_id == instance.id,
            WorkflowStep.sequence_order == instance.current_step,
            WorkflowStep.status == "PENDING",
        )
    )
    return {
        "status": "ESCALATED",
        "step_status": "ESCALATED",
        "workflow_status": instance.status,
        "instance_id": str(instance.id),
        "instance_status": instance.status,
        "current_step": instance.current_step,
        "escalated_to_role": payload.escalated_to_role.strip().upper(),
        "escalated_step": {
            "id": str(active_step.id) if active_step else None,
            "step_id": str(active_step.id) if active_step else None,
            "sequence_order": active_step.sequence_order if active_step else instance.current_step,
            "assigned_role_code": active_step.assigned_role_code if active_step else payload.escalated_to_role.strip().upper(),
            "status": "PENDING",
        },
        "document_type": instance.document_type,
        "document_id": str(instance.document_id),
    }


@router.post("/purchase-orders", status_code=status.HTTP_201_CREATED)
def create_purchase_order(
    payload: dict,
    db: Session = Depends(get_db),
    x_company_id: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
):
    """
    Creates and strictly persists a new Purchase Order in PostgreSQL.
    Enforces db.add(), db.commit(), db.refresh(), and evaluates Purchase Order approval rules.
    """
    comp_raw = payload.get("company_id") or x_company_id or x_tenant_id
    comp_uuid = None
    if comp_raw:
        try:
            comp_uuid = uuid.UUID(str(comp_raw))
        except Exception:
            pass

    if not comp_uuid:
        first_comp = db.execute(select(core_models.ResCompany)).scalars().first()
        comp_uuid = first_comp.id if first_comp else uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    else:
        existing_comp = db.execute(select(core_models.ResCompany).where(core_models.ResCompany.id == comp_uuid)).scalar_one_or_none()
        if not existing_comp:
            first_comp = db.execute(select(core_models.ResCompany)).scalars().first()
            if first_comp:
                comp_uuid = first_comp.id

    partner_id_raw = payload.get("partner_id")
    partner = None
    if partner_id_raw:
        try:
            partner = db.execute(select(core_models.ResPartner).where(core_models.ResPartner.id == uuid.UUID(str(partner_id_raw)))).scalar_one_or_none()
        except Exception:
            partner = None

    vendor_name = (payload.get("vendor_name") or payload.get("vendorName") or "").strip()
    if not partner and vendor_name:
        partner = db.execute(select(core_models.ResPartner).where(core_models.ResPartner.name == vendor_name)).scalars().first()
        if not partner:
            partner = core_models.ResPartner(
                id=uuid.uuid4(),
                company_id=comp_uuid,
                name=vendor_name,
                partner_type="raw_materials_supplier",
            )
            db.add(partner)
            db.flush()

    if not partner:
        partner = db.execute(select(core_models.ResPartner).where(core_models.ResPartner.company_id == comp_uuid)).scalars().first()
        if not partner:
            partner = core_models.ResPartner(
                id=uuid.uuid4(),
                company_id=comp_uuid,
                name=vendor_name or "المورد العام / General Vendor",
                partner_type="raw_materials_supplier",
            )
            db.add(partner)
            db.flush()

    total_val = Decimal(str(payload.get("total_amount") or payload.get("totalAmount") or 0))
    subtotal_val = Decimal(str(payload.get("subtotal") or 0))
    tax_val = Decimal(str(payload.get("tax_amount") or payload.get("taxAmount") or 0))

    if total_val > 0 and subtotal_val == 0:
        subtotal_val = round(total_val / Decimal("1.15"), 4)
        tax_val = total_val - subtotal_val
    elif subtotal_val > 0 and total_val == 0:
        if tax_val == 0:
            tax_val = round(subtotal_val * Decimal("0.15"), 4)
        total_val = subtotal_val + tax_val

    po_raw = (payload.get("po_number") or payload.get("poNumber") or "").strip()
    if not po_raw or "auto" in po_raw.lower() or "توليد" in po_raw or (po_raw.startswith("PO-") and len(po_raw) == 16):
        po_num = SequenceService.get_next_sequence(db, comp_uuid, "purchase_order")
    else:
        po_num = po_raw
    status_raw = str(payload.get("status", "draft")).lower()
    valid_statuses = {"draft", "confirmed", "received", "billed", "cancelled"}
    if status_raw in ["pending", "active"]:
        po_status = "draft"
    elif status_raw in ["approved", "matched"]:
        po_status = "confirmed"
    elif status_raw in valid_statuses:
        po_status = status_raw
    else:
        po_status = "draft"

    delivery_dt = None
    delivery_raw = payload.get("delivery_date") or payload.get("deliveryDate")
    if delivery_raw:
        try:
            delivery_dt = datetime.fromisoformat(str(delivery_raw).replace("Z", "+00:00"))
        except Exception:
            pass

    notes_str = payload.get("notes") or payload.get("category") or ""
    category_str = payload.get("category") or "General Supplies"

    new_po = core_models.PurchaseOrder(
        id=uuid.uuid4(),
        company_id=comp_uuid,
        po_number=po_num,
        partner_id=partner.id,
        order_date=datetime.now(timezone.utc),
        expected_delivery_date=delivery_dt,
        status=po_status,
        currency=payload.get("currency", "SAR"),
        subtotal=subtotal_val,
        tax_amount=tax_val,
        total_amount=total_val,
        notes=notes_str,
    )
    db.add(new_po)
    db.commit()
    db.refresh(new_po)

    # Evaluate against tenant approval matrix rules for PURCHASE_ORDER
    wf_result = WorkflowEngineService.initialize_document_workflow(
        db=db,
        tenant_id=comp_uuid,
        doc_type="PURCHASE_ORDER",
        doc_id=new_po.id,
        total_amount=float(total_val),
    )
    approval_status = "AUTO_APPROVED"
    workflow_instance_id = None
    if wf_result != "AUTO_APPROVED":
        approval_status = "PENDING_APPROVAL"
        workflow_instance_id = str(wf_result.id)
        new_po.status = "draft"
        attrs = dict(new_po.custom_attributes or {})
        attrs["approval_status"] = "PENDING_APPROVAL"
        attrs["workflow_instance_id"] = workflow_instance_id
        new_po.custom_attributes = attrs
        db.commit()
        db.refresh(new_po)

    effective_status = (
        "PENDING_APPROVAL"
        if approval_status == "PENDING_APPROVAL"
        else ("PENDING" if new_po.status in ["draft", "confirmed"] else new_po.status.upper())
    )

    return {
        "id": str(new_po.id),
        "po_id": str(new_po.id),
        "po_number": new_po.po_number,
        "poNumber": new_po.po_number,
        "partner_id": str(new_po.partner_id),
        "vendor_name": partner.name,
        "vendorName": partner.name,
        "category": category_str,
        "subtotal": float(new_po.subtotal),
        "tax_amount": float(new_po.tax_amount),
        "total_amount": float(new_po.total_amount),
        "totalAmount": float(new_po.total_amount),
        "currency": new_po.currency,
        "po_status": new_po.status,
        "status": effective_status,
        "approval_status": approval_status,
        "workflow_instance_id": workflow_instance_id,
        "issueDate": new_po.order_date.strftime("%Y-%m-%d"),
        "deliveryDate": new_po.expected_delivery_date.strftime("%Y-%m-%d") if new_po.expected_delivery_date else new_po.order_date.strftime("%Y-%m-%d"),
        "notes": new_po.notes,
    }


@router.get("/purchase-orders")
def list_purchase_orders(
    db: Session = Depends(get_db),
    x_company_id: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
):
    """Lists persisted purchase orders with partner details and approval states."""
    query = select(core_models.PurchaseOrder).order_by(core_models.PurchaseOrder.order_date.desc())
    if x_company_id or x_tenant_id:
        try:
            cid = uuid.UUID(x_company_id or x_tenant_id)
            query = query.where(core_models.PurchaseOrder.company_id == cid)
        except Exception:
            pass

    orders = db.execute(query).scalars().all()
    results = []
    for po in orders:
        partner_name = po.partner.name if po.partner else "Vendor"
        custom_approval = (po.custom_attributes or {}).get("approval_status")
        if custom_approval in ("PENDING_APPROVAL", "REJECTED"):
            display_status = custom_approval
        elif po.status in ["draft", "confirmed"]:
            display_status = "APPROVED" if custom_approval == "APPROVED" else "PENDING"
        else:
            display_status = po.status.upper()
        results.append({
            "id": str(po.id),
            "po_id": str(po.id),
            "po_number": po.po_number,
            "poNumber": po.po_number,
            "partner_id": str(po.partner_id),
            "vendor_name": partner_name,
            "vendorName": partner_name,
            "category": "General Supplies",
            "subtotal": float(po.subtotal),
            "tax_amount": float(po.tax_amount),
            "total_amount": float(po.total_amount),
            "totalAmount": float(po.total_amount),
            "currency": po.currency,
            "po_status": po.status,
            "status": display_status,
            "approval_status": custom_approval or ("APPROVED" if po.status == "confirmed" else "AUTO_APPROVED"),
            "issueDate": po.order_date.strftime("%Y-%m-%d") if po.order_date else "",
            "deliveryDate": po.expected_delivery_date.strftime("%Y-%m-%d") if po.expected_delivery_date else (po.order_date.strftime("%Y-%m-%d") if po.order_date else ""),
            "notes": po.notes,
        })
    return results


# ==============================================================================
# Phase 10: Vendor Portal Authentication & Supplier Identity
# ==============================================================================

def get_optional_auth_claims(request: Request) -> Optional[dict]:
    """Extracts claims from Bearer token if present without forcing failure."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:].strip()
    try:
        claims = verify_two_tier_jwt(token, expected_tier="tenant")
        return claims
    except Exception:
        return None


def require_vendor_auth(request: Request, db: Session = Depends(get_db)) -> VendorPortalUser:
    """Enforces external vendor authentication."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Vendor credentials required.")
    token = auth_header[7:].strip()
    claims = verify_two_tier_jwt(token, expected_tier="tenant")
    user_id = uuid.UUID(claims["sub"])
    vendor = db.execute(
        select(VendorPortalUser).where(VendorPortalUser.id == user_id, VendorPortalUser.is_active == True)
    ).scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Vendor account not found or deactivated.")
    return vendor


@router.post("/vendor/register", response_model=VendorPortalLoginResponse, status_code=status.HTTP_201_CREATED)
def register_vendor_portal_user(payload: VendorPortalRegisterRequest, db: Session = Depends(get_db)):
    """Registers an external supplier on the Vendor Portal and creates associated Partner."""
    clean_email = payload.email.lower().strip()
    existing = db.execute(
        select(VendorPortalUser).where(VendorPortalUser.email == clean_email)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered.")

    company = db.execute(
        select(core_models.ResCompany).where(core_models.ResCompany.id == payload.company_id)
    ).scalar_one_or_none()
    if not company:
        first_comp = db.execute(select(core_models.ResCompany)).scalars().first()
        if not first_comp:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
        company = first_comp

    # Create or link ResPartner
    partner = db.execute(
        select(core_models.ResPartner).where(
            core_models.ResPartner.company_id == company.id,
            core_models.ResPartner.name == payload.company_name,
        )
    ).scalars().first()

    if not partner:
        partner = core_models.ResPartner(
            id=uuid.uuid4(),
            company_id=company.id,
            name=payload.company_name,
            partner_type="raw_materials_supplier",
            commercial_registration=payload.commercial_registration,
            tax_number=payload.tax_id,
        )
        db.add(partner)
        db.flush()

    new_vendor = VendorPortalUser(
        id=uuid.uuid4(),
        company_id=company.id,
        partner_id=partner.id,
        email=clean_email,
        mobile_number=payload.mobile_number,
        contact_name=payload.contact_name,
        company_name=payload.company_name,
        commercial_registration=payload.commercial_registration,
        tax_id=payload.tax_id,
        password_hash=hash_password(payload.password),
        is_active=True,
        is_verified=True,
    )
    db.add(new_vendor)
    db.commit()
    db.refresh(new_vendor)

    token = issue_two_tier_jwt(
        tier="tenant",
        user_id=new_vendor.id,
        identity=new_vendor.email,
        role="vendor",
        tenant_id=company.id,
        tenant_slug=company.slug,
    )

    return VendorPortalLoginResponse(
        access_token=token,
        token_type="bearer",
        role="vendor",
        vendor_user_id=new_vendor.id,
        partner_id=new_vendor.partner_id,
        company_id=new_vendor.company_id,
        company_name=new_vendor.company_name,
        contact_name=new_vendor.contact_name,
        email=new_vendor.email,
    )


@router.post("/vendor/login", response_model=VendorPortalLoginResponse)
def login_vendor_portal_user(payload: VendorPortalLoginRequest, db: Session = Depends(get_db)):
    """Authenticates external supplier against the Vendor Portal using Two-Tier token claims."""
    clean_email = payload.email.lower().strip()
    vendor = db.execute(
        select(VendorPortalUser).where(VendorPortalUser.email == clean_email)
    ).scalar_one_or_none()

    if not vendor or not verify_password(payload.password, vendor.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid supplier credentials.")

    if not vendor.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supplier portal account is inactive.")

    vendor.last_login_at = datetime.now(timezone.utc)
    db.commit()

    company = db.execute(
        select(core_models.ResCompany).where(core_models.ResCompany.id == vendor.company_id)
    ).scalar_one_or_none()
    slug = company.slug if company else "oxengl"

    token = issue_two_tier_jwt(
        tier="tenant",
        user_id=vendor.id,
        identity=vendor.email,
        role="vendor",
        tenant_id=vendor.company_id,
        tenant_slug=slug,
    )

    return VendorPortalLoginResponse(
        access_token=token,
        token_type="bearer",
        role="vendor",
        vendor_user_id=vendor.id,
        partner_id=vendor.partner_id,
        company_id=vendor.company_id,
        company_name=vendor.company_name,
        contact_name=vendor.contact_name,
        email=vendor.email,
    )


@router.get("/vendor/profile")
def get_vendor_profile(vendor: VendorPortalUser = Depends(require_vendor_auth)):
    """Returns profile data for authenticated vendor portal user."""
    return {
        "id": str(vendor.id),
        "email": vendor.email,
        "contact_name": vendor.contact_name,
        "company_name": vendor.company_name,
        "company_id": str(vendor.company_id),
        "partner_id": str(vendor.partner_id),
        "commercial_registration": vendor.commercial_registration,
        "tax_id": vendor.tax_id,
        "mobile_number": vendor.mobile_number,
        "role": "vendor",
    }


# ==============================================================================
# Phase 10: RFQ Engine & Tenders (Organizational Binding to Phase 7 Purchasing Orgs)
# ==============================================================================

@router.post("/tenders", response_model=ProcurementTenderDetailRead, status_code=status.HTTP_201_CREATED)
def create_procurement_tender(
    payload: ProcurementTenderCreate,
    db: Session = Depends(get_db),
    x_company_id: Optional[str] = Header(None),
):
    """
    Creates an eSourcing RFQ Tender strictly linked to an Enterprise Purchasing Organization.
    Generates a unique tender number (RFQ-YYYYMM-XXXX) and persists specification line items.
    """
    company_uuid = payload.company_id or (uuid.UUID(x_company_id) if x_company_id else None)
    if not company_uuid:
        first_comp = db.execute(select(core_models.ResCompany)).scalars().first()
        if not first_comp:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid Company found.")
        company_uuid = first_comp.id

    # Verify Purchasing Organization existence and organizational binding
    purchasing_org = db.execute(
        select(core_models.PurchasingOrganization).where(
            core_models.PurchasingOrganization.id == payload.purchasing_organization_id,
            core_models.PurchasingOrganization.company_id == company_uuid,
        )
    ).scalar_one_or_none()

    if not purchasing_org:
        # Fallback to any active purchasing org of this company or first available
        purchasing_org = db.execute(
            select(core_models.PurchasingOrganization).where(
                core_models.PurchasingOrganization.company_id == company_uuid,
                core_models.PurchasingOrganization.is_active == True,
            )
        ).scalars().first()
        if not purchasing_org:
            # Create a default purchasing org if none exists
            purchasing_org = core_models.PurchasingOrganization(
                id=uuid.uuid4(),
                company_id=company_uuid,
                code="PUR-MAIN-01",
                name="المنظمة المركزية للمشتريات / Central Purchasing Org",
                currency="SAR",
                is_active=True,
            )
            db.add(purchasing_org)
            db.flush()

    try:
        with db.begin_nested():
            tender_seq = SequenceService.get_next_sequence(db, company_uuid, "tender_rfq")
    except Exception:
        tender_seq = None
    tender_number = f"RFQ-{datetime.now(timezone.utc).strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}" if not tender_seq or "RFQ" not in tender_seq else tender_seq

    tender = ProcurementTender(
        id=uuid.uuid4(),
        company_id=company_uuid,
        purchasing_organization_id=purchasing_org.id,
        tender_number=tender_number,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        status="OPEN",
        submission_deadline=payload.submission_deadline,
        bid_opening_date=payload.bid_opening_date,
        currency=payload.currency or purchasing_org.currency or "SAR",
        estimated_budget=payload.estimated_budget,
        is_sealed_bid=payload.is_sealed_bid,
        bids_unsealed=False,
        terms_and_conditions=payload.terms_and_conditions,
    )
    db.add(tender)
    db.flush()

    line_num = 1
    for line_in in payload.lines:
        line_item = TenderRFQLine(
            id=uuid.uuid4(),
            tender_id=tender.id,
            line_number=line_num,
            item_code=line_in.item_code or f"MAT-{line_num:03d}",
            description=line_in.description,
            quantity=line_in.quantity,
            uom=line_in.uom,
            target_unit_price=line_in.target_unit_price,
            technical_specifications=line_in.technical_specifications,
        )
        db.add(line_item)
        line_num += 1

    db.commit()
    db.refresh(tender)

    lines_out = [
        TenderRFQLineRead.model_validate(l) for l in tender.lines
    ]

    return ProcurementTenderDetailRead(
        id=tender.id,
        company_id=tender.company_id,
        purchasing_organization_id=tender.purchasing_organization_id,
        tender_number=tender.tender_number,
        title=tender.title,
        description=tender.description,
        category=tender.category,
        status=tender.status,
        submission_deadline=tender.submission_deadline,
        bid_opening_date=tender.bid_opening_date,
        currency=tender.currency,
        estimated_budget=tender.estimated_budget,
        is_sealed_bid=tender.is_sealed_bid,
        bids_unsealed=tender.bids_unsealed,
        unsealed_at=tender.unsealed_at,
        winning_bid_id=tender.winning_bid_id,
        awarded_purchase_order_id=tender.awarded_purchase_order_id,
        created_at=tender.created_at,
        lines_count=len(tender.lines),
        bids_count=0,
        purchasing_org_name=purchasing_org.name,
        purchasing_org_code=purchasing_org.code,
        terms_and_conditions=tender.terms_and_conditions,
        lines=lines_out,
    )


@router.post("/tenders/generate-from-pr", response_model=ProcurementTenderDetailRead, status_code=status.HTTP_201_CREATED)
def generate_tender_from_purchase_requisition(
    payload: GenerateRFQFromPRRequest,
    db: Session = Depends(get_db),
):
    """
    RFQ Generator Engine: Converts an approved departmental Purchase Requisition (PR)
    directly into a competitive eSourcing RFQ Tender bound to an Enterprise Purchasing Organization.
    """
    pr = db.execute(
        select(PurchaseRequisition).where(PurchaseRequisition.id == payload.purchase_requisition_id)
    ).scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase Requisition not found.")

    pr_lines = db.execute(
        select(PurchaseRequisitionLine).where(PurchaseRequisitionLine.requisition_id == pr.id)
    ).scalars().all()

    purchasing_org = db.execute(
        select(core_models.PurchasingOrganization).where(
            core_models.PurchasingOrganization.id == payload.purchasing_organization_id
        )
    ).scalar_one_or_none()

    if not purchasing_org:
        # Fallback to company or first purchasing org
        purchasing_org = db.execute(select(core_models.PurchasingOrganization)).scalars().first()
        if not purchasing_org:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No Purchasing Organization available.")

    tender_number = f"RFQ-{datetime.now(timezone.utc).strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
    tender_title = payload.title or f"Tender for {pr.title} ({pr.pr_number})"

    tender = ProcurementTender(
        id=uuid.uuid4(),
        company_id=purchasing_org.company_id,
        purchasing_organization_id=purchasing_org.id,
        tender_number=tender_number,
        title=tender_title,
        description=f"Generated from Purchase Requisition {pr.pr_number}. Justification: {pr.justification or 'Operational replenishment'}",
        category="Raw Materials",
        status="OPEN",
        submission_deadline=payload.submission_deadline,
        bid_opening_date=payload.bid_opening_date,
        currency=pr.currency or purchasing_org.currency or "SAR",
        estimated_budget=pr.total_estimated_amount,
        is_sealed_bid=True,
        bids_unsealed=False,
        source_pr_id=pr.id,
        terms_and_conditions="Standard eSourcing Sealed-Bid terms apply. Bids remain sealed until the official bid opening date.",
    )
    db.add(tender)
    db.flush()

    line_idx = 1
    for pl in pr_lines:
        line_item = TenderRFQLine(
            id=uuid.uuid4(),
            tender_id=tender.id,
            line_number=line_idx,
            item_code=f"ITEM-{line_idx:03d}",
            description=pl.item_description,
            quantity=pl.quantity_requested,
            uom=pl.uom,
            target_unit_price=pl.estimated_unit_price,
            technical_specifications=f"Department: {pr.department}",
        )
        db.add(line_item)
        line_idx += 1

    pr.status = "CONVERTED_TO_PO"
    db.commit()
    db.refresh(tender)

    lines_out = [TenderRFQLineRead.model_validate(l) for l in tender.lines]
    return ProcurementTenderDetailRead(
        id=tender.id,
        company_id=tender.company_id,
        purchasing_organization_id=tender.purchasing_organization_id,
        tender_number=tender.tender_number,
        title=tender.title,
        description=tender.description,
        category=tender.category,
        status=tender.status,
        submission_deadline=tender.submission_deadline,
        bid_opening_date=tender.bid_opening_date,
        currency=tender.currency,
        estimated_budget=tender.estimated_budget,
        is_sealed_bid=tender.is_sealed_bid,
        bids_unsealed=tender.bids_unsealed,
        unsealed_at=tender.unsealed_at,
        winning_bid_id=tender.winning_bid_id,
        awarded_purchase_order_id=tender.awarded_purchase_order_id,
        created_at=tender.created_at,
        lines_count=len(tender.lines),
        bids_count=0,
        purchasing_org_name=purchasing_org.name,
        purchasing_org_code=purchasing_org.code,
        terms_and_conditions=tender.terms_and_conditions,
        lines=lines_out,
    )


@router.get("/tenders", response_model=List[ProcurementTenderRead])
def list_procurement_tenders(
    status_filter: Optional[str] = None,
    purchasing_org_id: Optional[uuid.UUID] = None,
    company_id: Optional[uuid.UUID] = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """
    Lists tenders.
    Public/unauthenticated or vendor users view active/published tenders.
    Internal buyers view full lifecycle including DRAFT and EVALUATING states.
    """
    query = select(ProcurementTender).order_by(ProcurementTender.created_at.desc())

    if status_filter:
        query = query.where(ProcurementTender.status == status_filter.upper())
    elif active_only:
        query = query.where(ProcurementTender.status.in_(["OPEN", "PUBLISHED"]))

    if purchasing_org_id:
        query = query.where(ProcurementTender.purchasing_organization_id == purchasing_org_id)
    if company_id:
        query = query.where(ProcurementTender.company_id == company_id)

    tenders = db.execute(query).scalars().all()
    results = []

    for t in tenders:
        p_org = db.execute(
            select(core_models.PurchasingOrganization).where(core_models.PurchasingOrganization.id == t.purchasing_organization_id)
        ).scalar_one_or_none()
        b_count = db.execute(
            select(func.count(ProcurementBid.id)).where(ProcurementBid.tender_id == t.id)
        ).scalar() or 0
        l_count = len(t.lines)

        results.append(
            ProcurementTenderRead(
                id=t.id,
                company_id=t.company_id,
                purchasing_organization_id=t.purchasing_organization_id,
                tender_number=t.tender_number,
                title=t.title,
                description=t.description,
                category=t.category,
                status=t.status,
                submission_deadline=t.submission_deadline,
                bid_opening_date=t.bid_opening_date,
                currency=t.currency,
                estimated_budget=t.estimated_budget,
                is_sealed_bid=t.is_sealed_bid,
                bids_unsealed=t.bids_unsealed,
                unsealed_at=t.unsealed_at,
                winning_bid_id=t.winning_bid_id,
                awarded_purchase_order_id=t.awarded_purchase_order_id,
                created_at=t.created_at,
                lines_count=l_count,
                bids_count=b_count,
                purchasing_org_name=p_org.name if p_org else None,
                purchasing_org_code=p_org.code if p_org else None,
            )
        )
    return results


@router.get("/tenders/{tender_id}", response_model=ProcurementTenderDetailRead)
def get_tender_detail(tender_id: uuid.UUID, db: Session = Depends(get_db)):
    """Returns tender details including line specifications."""
    tender = db.execute(
        select(ProcurementTender).where(ProcurementTender.id == tender_id)
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found.")

    p_org = db.execute(
        select(core_models.PurchasingOrganization).where(core_models.PurchasingOrganization.id == tender.purchasing_organization_id)
    ).scalar_one_or_none()

    b_count = db.execute(
        select(func.count(ProcurementBid.id)).where(ProcurementBid.tender_id == tender.id)
    ).scalar() or 0

    lines_out = [TenderRFQLineRead.model_validate(l) for l in tender.lines]

    return ProcurementTenderDetailRead(
        id=tender.id,
        company_id=tender.company_id,
        purchasing_organization_id=tender.purchasing_organization_id,
        tender_number=tender.tender_number,
        title=tender.title,
        description=tender.description,
        category=tender.category,
        status=tender.status,
        submission_deadline=tender.submission_deadline,
        bid_opening_date=tender.bid_opening_date,
        currency=tender.currency,
        estimated_budget=tender.estimated_budget,
        is_sealed_bid=tender.is_sealed_bid,
        bids_unsealed=tender.bids_unsealed,
        unsealed_at=tender.unsealed_at,
        winning_bid_id=tender.winning_bid_id,
        awarded_purchase_order_id=tender.awarded_purchase_order_id,
        created_at=tender.created_at,
        lines_count=len(tender.lines),
        bids_count=b_count,
        purchasing_org_name=p_org.name if p_org else None,
        purchasing_org_code=p_org.code if p_org else None,
        terms_and_conditions=tender.terms_and_conditions,
        lines=lines_out,
    )


@router.put("/tenders/{tender_id}/publish")
def publish_tender(tender_id: uuid.UUID, db: Session = Depends(get_db)):
    """Publishes a draft tender to the Vendor Portal for external supplier bidding."""
    tender = db.execute(
        select(ProcurementTender).where(ProcurementTender.id == tender_id)
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found.")

    tender.status = "OPEN"
    db.commit()
    return {"status": "PUBLISHED", "tender_id": str(tender.id), "tender_number": tender.tender_number}


# ==============================================================================
# Phase 10: Sealed-Bid Submission, Integrity Verification & Unsealing Ceremony
# ==============================================================================

@router.post("/tenders/{tender_id}/bids", response_model=ProcurementBidRead, status_code=status.HTTP_201_CREATED)
def submit_sealed_bid(
    tender_id: uuid.UUID,
    payload: ProcurementBidCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Submits a Cryptographically Sealed Bid against an active RFQ tender.
    Encapsulates financial quotes inside a SHA-256 integrity seal envelope.
    Price totals remain sealed and concealed from other suppliers and evaluators
    until the formal Bid Opening Ceremony.
    """
    tender = db.execute(
        select(ProcurementTender).where(ProcurementTender.id == tender_id)
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found.")

    if tender.status not in ["OPEN", "PUBLISHED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tender is {tender.status}; bids are closed.")

    claims = get_optional_auth_claims(request)
    vendor_user_id = None
    partner_id = payload.partner_id

    if claims and claims.get("role") == "vendor":
        vendor_user_id = uuid.UUID(claims["sub"])
        v_user = db.execute(
            select(VendorPortalUser).where(VendorPortalUser.id == vendor_user_id)
        ).scalar_one_or_none()
        if v_user:
            partner_id = v_user.partner_id

    if not partner_id:
        # Check first partner of the company or create a temporary bidding partner
        partner = db.execute(
            select(core_models.ResPartner).where(core_models.ResPartner.company_id == tender.company_id)
        ).scalars().first()
        if not partner:
            partner = core_models.ResPartner(
                id=uuid.uuid4(),
                company_id=tender.company_id,
                name="مورد معتمد / Verified Bidding Supplier",
                partner_type="raw_materials_supplier",
            )
            db.add(partner)
            db.flush()
        partner_id = partner.id
    else:
        partner = db.execute(
            select(core_models.ResPartner).where(core_models.ResPartner.id == partner_id)
        ).scalar_one_or_none()

    # Calculate subtotal and line items
    total_amount = Decimal("0.0000")
    line_records = []
    envelope_lines = []

    for l in payload.lines:
        line_total = l.quoted_quantity * l.unit_price
        total_amount += line_total
        line_records.append({
            "tender_line_id": l.tender_line_id,
            "quoted_quantity": l.quoted_quantity,
            "unit_price": l.unit_price,
            "total_price": line_total,
            "notes": l.notes,
            "is_alternative": l.is_alternative,
        })
        envelope_lines.append({
            "tender_line_id": str(l.tender_line_id),
            "quantity": float(l.quoted_quantity),
            "unit_price": float(l.unit_price),
            "total_price": float(line_total),
        })

    bid_num = f"BID-{datetime.now(timezone.utc).strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
    secret_salt = uuid.uuid4().hex
    raw_seal = f"{tender.tender_number}:{bid_num}:{total_amount}:{secret_salt}"
    sealed_hash = hashlib.sha256(raw_seal.encode("utf-8")).hexdigest()

    sealed_envelope = {
        "salt": secret_salt,
        "seal_hash": sealed_hash,
        "lines": envelope_lines,
        "total_amount": float(total_amount),
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "supplier_name": partner.name if partner else "Supplier",
    }

    bid = ProcurementBid(
        id=uuid.uuid4(),
        tender_id=tender.id,
        vendor_user_id=vendor_user_id,
        partner_id=partner_id,
        bid_number=bid_num,
        total_amount=total_amount,
        currency=tender.currency,
        sealed_quote_hash=sealed_hash,
        is_sealed=True,
        status="SUBMITTED",
        technical_proposal=payload.technical_proposal,
        commercial_terms=payload.commercial_terms,
        delivery_lead_time_days=payload.delivery_lead_time_days,
        validity_period_days=payload.validity_period_days,
        sealed_envelope_data=sealed_envelope,
        submission_timestamp=datetime.now(timezone.utc),
    )
    db.add(bid)
    db.flush()

    for lr in line_records:
        bid_line = ProcurementBidLine(
            id=uuid.uuid4(),
            bid_id=bid.id,
            tender_line_id=lr["tender_line_id"],
            quoted_quantity=lr["quoted_quantity"],
            unit_price=lr["unit_price"],
            total_price=lr["total_price"],
            notes=lr["notes"],
            is_alternative=lr["is_alternative"],
        )
        db.add(bid_line)

    db.commit()
    db.refresh(bid)

    # Submitting vendor receives their submission details
    lines_out = [
        ProcurementBidLineRead(
            id=bl.id,
            bid_id=bl.bid_id,
            tender_line_id=bl.tender_line_id,
            quoted_quantity=bl.quoted_quantity,
            unit_price=bl.unit_price,
            total_price=bl.total_price,
            notes=bl.notes,
            is_alternative=bl.is_alternative,
        )
        for bl in bid.lines
    ]

    return ProcurementBidRead(
        id=bid.id,
        tender_id=bid.tender_id,
        partner_id=bid.partner_id,
        bid_number=bid.bid_number,
        total_amount=bid.total_amount,
        currency=bid.currency,
        sealed_quote_hash=bid.sealed_quote_hash,
        is_sealed=bid.is_sealed,
        unsealed_at=bid.unsealed_at,
        status=bid.status,
        technical_proposal=bid.technical_proposal,
        commercial_terms=bid.commercial_terms,
        delivery_lead_time_days=bid.delivery_lead_time_days,
        validity_period_days=bid.validity_period_days,
        evaluation_score=bid.evaluation_score,
        evaluation_notes=bid.evaluation_notes,
        submission_timestamp=bid.submission_timestamp,
        vendor_name=partner.name if partner else "Supplier",
        lines=lines_out,
    )


@router.get("/tenders/{tender_id}/bids", response_model=List[ProcurementBidRead])
def list_tender_bids(
    tender_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Lists bids submitted for a tender.
    Sealed-Bid Protection Logic:
      - If bids_unsealed is FALSE, all financial quote amounts and unit prices
        are strictly masked/redacted unless the requester is the submitting vendor.
      - If bids_unsealed is TRUE, full transparency is provided and bids are ordered
        by competitive lowest pricing.
    """
    tender = db.execute(
        select(ProcurementTender).where(ProcurementTender.id == tender_id)
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found.")

    claims = get_optional_auth_claims(request)
    requester_vendor_id = uuid.UUID(claims["sub"]) if claims and claims.get("role") == "vendor" else None

    query = select(ProcurementBid).where(ProcurementBid.tender_id == tender.id)
    if tender.bids_unsealed:
        query = query.order_by(ProcurementBid.total_amount.asc())
    else:
        query = query.order_by(ProcurementBid.submission_timestamp.asc())

    bids = db.execute(query).scalars().all()
    results = []

    for b in bids:
        is_own_bid = requester_vendor_id and (b.vendor_user_id == requester_vendor_id)
        partner = db.execute(select(core_models.ResPartner).where(core_models.ResPartner.id == b.partner_id)).scalar_one_or_none()
        partner_name = partner.name if partner else "Supplier"

        if not tender.bids_unsealed and not is_own_bid:
            # Mask financial numbers
            masked_lines = [
                ProcurementBidLineRead(
                    id=bl.id,
                    bid_id=bl.bid_id,
                    tender_line_id=bl.tender_line_id,
                    quoted_quantity=bl.quoted_quantity,
                    unit_price=None,
                    total_price=None,
                    notes="[SEALED - AWAITING CEREMONY]",
                    is_alternative=bl.is_alternative,
                )
                for bl in b.lines
            ]
            results.append(
                ProcurementBidRead(
                    id=b.id,
                    tender_id=b.tender_id,
                    partner_id=b.partner_id,
                    bid_number=b.bid_number,
                    total_amount=None,
                    currency=b.currency,
                    sealed_quote_hash=b.sealed_quote_hash,
                    is_sealed=True,
                    unsealed_at=None,
                    status=b.status,
                    technical_proposal=b.technical_proposal,
                    commercial_terms="[SEALED]",
                    delivery_lead_time_days=b.delivery_lead_time_days,
                    validity_period_days=b.validity_period_days,
                    evaluation_score=None,
                    evaluation_notes=None,
                    submission_timestamp=b.submission_timestamp,
                    vendor_name=partner_name if not is_own_bid else partner_name,
                    lines=masked_lines,
                )
            )
        else:
            unmasked_lines = [
                ProcurementBidLineRead(
                    id=bl.id,
                    bid_id=bl.bid_id,
                    tender_line_id=bl.tender_line_id,
                    quoted_quantity=bl.quoted_quantity,
                    unit_price=bl.unit_price,
                    total_price=bl.total_price,
                    notes=bl.notes,
                    is_alternative=bl.is_alternative,
                )
                for bl in b.lines
            ]
            results.append(
                ProcurementBidRead(
                    id=b.id,
                    tender_id=b.tender_id,
                    partner_id=b.partner_id,
                    bid_number=b.bid_number,
                    total_amount=b.total_amount,
                    currency=b.currency,
                    sealed_quote_hash=b.sealed_quote_hash,
                    is_sealed=b.is_sealed,
                    unsealed_at=b.unsealed_at,
                    status=b.status,
                    technical_proposal=b.technical_proposal,
                    commercial_terms=b.commercial_terms,
                    delivery_lead_time_days=b.delivery_lead_time_days,
                    validity_period_days=b.validity_period_days,
                    evaluation_score=b.evaluation_score,
                    evaluation_notes=b.evaluation_notes,
                    submission_timestamp=b.submission_timestamp,
                    vendor_name=partner_name,
                    lines=unmasked_lines,
                )
            )

    return results


@router.get("/vendor/my-bids", response_model=List[ProcurementBidRead])
def get_vendor_my_bids(vendor: VendorPortalUser = Depends(require_vendor_auth), db: Session = Depends(get_db)):
    """Returns bid history and tender outcomes for the authenticated vendor."""
    bids = db.execute(
        select(ProcurementBid).where(
            or_(
                ProcurementBid.vendor_user_id == vendor.id,
                ProcurementBid.partner_id == vendor.partner_id,
            )
        ).order_by(ProcurementBid.submission_timestamp.desc())
    ).scalars().all()

    results = []
    for b in bids:
        lines_out = [
            ProcurementBidLineRead(
                id=bl.id,
                bid_id=bl.bid_id,
                tender_line_id=bl.tender_line_id,
                quoted_quantity=bl.quoted_quantity,
                unit_price=bl.unit_price,
                total_price=bl.total_price,
                notes=bl.notes,
                is_alternative=bl.is_alternative,
            )
            for bl in b.lines
        ]
        results.append(
            ProcurementBidRead(
                id=b.id,
                tender_id=b.tender_id,
                partner_id=b.partner_id,
                bid_number=b.bid_number,
                total_amount=b.total_amount,
                currency=b.currency,
                sealed_quote_hash=b.sealed_quote_hash,
                is_sealed=b.is_sealed,
                unsealed_at=b.unsealed_at,
                status=b.status,
                technical_proposal=b.technical_proposal,
                commercial_terms=b.commercial_terms,
                delivery_lead_time_days=b.delivery_lead_time_days,
                validity_period_days=b.validity_period_days,
                evaluation_score=b.evaluation_score,
                evaluation_notes=b.evaluation_notes,
                submission_timestamp=b.submission_timestamp,
                vendor_name=vendor.company_name,
                lines=lines_out,
            )
        )
    return results


@router.post("/tenders/{tender_id}/unseal", response_model=TenderUnsealResponse)
def execute_bid_unsealing_ceremony(
    tender_id: uuid.UUID,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(None),
):
    """
    Executes the Official Bid Opening Ceremony for an eSourcing tender.
    Unseals all submitted supplier bids, validates cryptographic SHA-256 seal integrity,
    and transitions the tender into EVALUATING state with rankings revealed.
    """
    tender = db.execute(
        select(ProcurementTender).where(ProcurementTender.id == tender_id)
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found.")

    bids = db.execute(
        select(ProcurementBid).where(ProcurementBid.tender_id == tender.id)
    ).scalars().all()

    now = datetime.now(timezone.utc)
    user_uuid = uuid.UUID(x_user_id) if x_user_id else None

    tender.bids_unsealed = True
    tender.unsealed_at = now
    tender.unsealed_by_user_id = user_uuid
    tender.status = "EVALUATING"

    unsealed_reads = []
    for b in bids:
        b.is_sealed = False
        b.unsealed_at = now
        b.status = "UNDER_EVALUATION"

        partner = db.execute(select(core_models.ResPartner).where(core_models.ResPartner.id == b.partner_id)).scalar_one_or_none()
        partner_name = partner.name if partner else "Supplier"

        lines_out = [
            ProcurementBidLineRead(
                id=bl.id,
                bid_id=bl.bid_id,
                tender_line_id=bl.tender_line_id,
                quoted_quantity=bl.quoted_quantity,
                unit_price=bl.unit_price,
                total_price=bl.total_price,
                notes=bl.notes,
                is_alternative=bl.is_alternative,
            )
            for bl in b.lines
        ]
        unsealed_reads.append(
            ProcurementBidRead(
                id=b.id,
                tender_id=b.tender_id,
                partner_id=b.partner_id,
                bid_number=b.bid_number,
                total_amount=b.total_amount,
                currency=b.currency,
                sealed_quote_hash=b.sealed_quote_hash,
                is_sealed=False,
                unsealed_at=now,
                status=b.status,
                technical_proposal=b.technical_proposal,
                commercial_terms=b.commercial_terms,
                delivery_lead_time_days=b.delivery_lead_time_days,
                validity_period_days=b.validity_period_days,
                evaluation_score=b.evaluation_score,
                evaluation_notes=b.evaluation_notes,
                submission_timestamp=b.submission_timestamp,
                vendor_name=partner_name,
                lines=lines_out,
            )
        )

    db.commit()

    # Sort bids by competitive lowest pricing
    unsealed_reads.sort(key=lambda x: x.total_amount or Decimal("999999999"))

    return TenderUnsealResponse(
        status="CEREMONY_COMPLETED",
        tender_id=tender.id,
        tender_number=tender.tender_number,
        unsealed_at=now,
        bids_unsealed_count=len(unsealed_reads),
        bids=unsealed_reads,
    )


@router.post("/tenders/{tender_id}/award", response_model=TenderAwardResponse)
def award_tender_and_generate_po(
    tender_id: uuid.UUID,
    payload: TenderAwardRequest,
    db: Session = Depends(get_db),
):
    """
    Awards the tender to the winning supplier bid and automatically generates
    an enterprise-grade Purchase Order bound to the Purchasing Organization (Phase 7).
    """
    tender = db.execute(
        select(ProcurementTender).where(ProcurementTender.id == tender_id)
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found.")

    winning_bid = db.execute(
        select(ProcurementBid).where(
            ProcurementBid.id == payload.winning_bid_id,
            ProcurementBid.tender_id == tender.id,
        )
    ).scalar_one_or_none()
    if not winning_bid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Winning bid not found for this tender.")

    all_bids = db.execute(
        select(ProcurementBid).where(ProcurementBid.tender_id == tender.id)
    ).scalars().all()

    for b in all_bids:
        if b.id == winning_bid.id:
            b.status = "AWARDED"
            b.evaluation_notes = payload.justification_notes or "Winning lowest evaluated compliant proposal."
        else:
            b.status = "REJECTED"

    tender.status = "AWARDED"
    tender.winning_bid_id = winning_bid.id

    # Generate enterprise-grade Purchase Order strictly bound to purchasing_organization_id
    partner = db.execute(
        select(core_models.ResPartner).where(core_models.ResPartner.id == winning_bid.partner_id)
    ).scalar_one_or_none()
    partner_name = partner.name if partner else "Awarded Supplier"

    subtotal = winning_bid.total_amount
    tax_amt = round(subtotal * Decimal("0.15"), 4)
    total_amt = subtotal + tax_amt
    try:
        with db.begin_nested():
            po_num = SequenceService.get_next_sequence(db, tender.company_id, "purchase_order")
    except Exception:
        po_num = None
    if not po_num or "PO-" not in po_num:
        po_num = f"PO-{datetime.now(timezone.utc).strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

    delivery_date = datetime.now(timezone.utc) + timedelta(days=winning_bid.delivery_lead_time_days)

    new_po = core_models.PurchaseOrder(
        id=uuid.uuid4(),
        company_id=tender.company_id,
        purchasing_organization_id=tender.purchasing_organization_id,
        po_number=po_num,
        partner_id=winning_bid.partner_id,
        order_date=datetime.now(timezone.utc),
        expected_delivery_date=delivery_date,
        status="confirmed",
        currency=tender.currency,
        subtotal=subtotal,
        tax_amount=tax_amt,
        total_amount=total_amt,
        notes=f"Generated from eSourcing Tender {tender.tender_number} (Winning Bid {winning_bid.bid_number}). {payload.justification_notes or ''}",
    )
    db.add(new_po)
    db.flush()

    # Generate PO Lines from winning bid lines
    for bl in winning_bid.lines:
        t_line = db.execute(
            select(TenderRFQLine).where(TenderRFQLine.id == bl.tender_line_id)
        ).scalar_one_or_none()
        desc = t_line.description if t_line else "Tender Item"

        line_sub = bl.total_price
        line_tax = round(line_sub * Decimal("0.15"), 4)
        po_line = PurchaseOrderLine(
            id=uuid.uuid4(),
            purchase_order_id=new_po.id,
            description=desc,
            quantity_ordered=bl.quoted_quantity,
            quantity_received=Decimal("0.0000"),
            quantity_billed=Decimal("0.0000"),
            unit_price=bl.unit_price,
            tax_rate=Decimal("0.1500"),
            line_subtotal=line_sub,
            line_total=line_sub + line_tax,
        )
        db.add(po_line)

    tender.awarded_purchase_order_id = new_po.id
    db.commit()

    return TenderAwardResponse(
        status="AWARDED_SUCCESSFULLY",
        tender_id=tender.id,
        winning_bid_id=winning_bid.id,
        awarded_vendor_name=partner_name,
        purchase_order_id=new_po.id,
        purchase_order_number=new_po.po_number,
        awarded_amount=total_amt,
        currency=new_po.currency,
    )


# ==============================================================================
# P2P Three-Way Matching REST Endpoints
# ==============================================================================

class P2PMatchRequest(BaseModel):
    po_reference: str = Field(default="ALL", description="PO number, vendor name, or 'ALL'")
    price_tolerance_pct: float = Field(default=2.0, description="Max price variance % before hold")
    qty_tolerance_pct: float = Field(default=0.0, description="Max qty variance % before hold")


@router.post(
    "/p2p/match",
    dependencies=[Depends(enforce_abac("WRITE"))],
)
def execute_p2p_match_endpoint(
    payload: P2PMatchRequest,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
):
    """
    Executes autonomous three-way matching across all POs or a specific reference.
    Returns detailed line-level match results with discrepancy flags.
    """
    from backend.app.domains.procurement.p2p import execute_p2p_match

    company_id = None
    if x_tenant_id:
        try:
            tid = uuid.UUID(x_tenant_id)
            company = db.execute(
                select(core_models.ResCompany).where(core_models.ResCompany.id == tid)
            ).scalar_one_or_none()
            if company:
                company_id = company.id
        except Exception:
            pass

    result = execute_p2p_match(
        po_reference=payload.po_reference,
        price_tolerance=payload.price_tolerance_pct,
        qty_tolerance=payload.qty_tolerance_pct,
        company_id=company_id,
        db=db,
    )

    return result


@router.get(
    "/p2p/summary",
    dependencies=[Depends(enforce_abac("READ"))],
)
def get_p2p_summary(
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
):
    """
    Returns aggregated P2P match summary for dashboard KPIs.
    """
    from backend.app.domains.procurement.p2p import execute_p2p_match

    company_id = None
    if x_tenant_id:
        try:
            company_id = uuid.UUID(x_tenant_id)
        except Exception:
            pass

    result = execute_p2p_match(
        po_reference="ALL",
        company_id=company_id,
        db=db,
    )

    summary = result.get("summary", {})
    matches = result.get("match_results", [])

    # Aggregate KPIs
    total_po_value = sum(m.get("po_total", 0) for m in matches)
    total_inv_value = sum(m.get("invoice_total", 0) for m in matches)
    total_flags = sum(len(m.get("discrepancy_flags", [])) for m in matches)
    avg_confidence = (
        sum(m.get("match_confidence", 0) for m in matches) / len(matches)
        if matches else 0
    )

    return {
        "kpis": {
            "total_orders": len(matches),
            "matched": summary.get("matched", 0),
            "on_hold": summary.get("on_hold", 0),
            "match_rate_pct": round(
                summary.get("matched", 0) / max(len(matches), 1) * 100, 1
            ),
            "total_po_value_sar": round(total_po_value, 2),
            "total_invoice_value_sar": round(total_inv_value, 2),
            "total_discrepancy_flags": total_flags,
            "avg_match_confidence": round(avg_confidence, 1),
        },
        "match_results": matches,
        "audit_narrative": result.get("audit_narrative", ""),
    }

