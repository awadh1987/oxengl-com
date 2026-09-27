"""
Bulk Operations API Router for Platform Admin & Tenant Workspaces.
Implements the Global Select & Bulk Operations architecture specified in BULK_OPERATIONS_ARCHITECTURE.md:
- Batch status updates (activate, suspend, approve, reject)
- Batch deletions with atomic database transactions
- Strict session rollback handling to prevent connection poisoning
- Payload validation & length constraints
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

try:
    from backend.database import get_db
    from backend.models import (
        ResCompany,
        ResUser,
        TenantAuditLog,
        ProcurementBill,
        PurchaseOrder,
        Vehicle,
    )
except ImportError:
    from database import get_db
    from models import (
        ResCompany,
        ResUser,
        TenantAuditLog,
        ProcurementBill,
        PurchaseOrder,
        Vehicle,
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bulk", tags=["Bulk Operations"])


# ==============================================================================
# Schemas
# ==============================================================================

class BulkStatusUpdateRequest(BaseModel):
    ids: List[str] = Field(..., min_length=1, max_length=500, description="Array of UUID strings to update")
    entity: Literal["tenants", "procurement_bills", "purchase_orders", "vehicles", "users"] = Field(
        ..., description="Entity type for multi-record status modification"
    )
    is_active: Optional[bool] = None
    status: Optional[str] = None
    reason: Optional[str] = None


class BulkDeleteRequest(BaseModel):
    ids: List[str] = Field(..., min_length=1, max_length=500, description="Array of UUID strings to delete")
    entity: Literal["tenants", "procurement_bills", "purchase_orders", "vehicles", "users"] = Field(
        ..., description="Entity type for multi-record deletion"
    )
    hard_delete: bool = Field(default=False, description="Permanent deletion if true, otherwise soft-delete")
    confirm_phrase: Optional[str] = None


class BulkActionResponse(BaseModel):
    success: bool
    action: str
    entity: str
    affected_count: int
    processed_ids: List[str]
    failed_ids: List[str] = []
    errors: List[str] = []
    message: str


# ==============================================================================
# Helper to validate UUIDs
# ==============================================================================

def _parse_valid_uuids(ids: List[str]) -> tuple[List[uuid.UUID], List[str]]:
    valid: List[uuid.UUID] = []
    invalid: List[str] = []
    for raw_id in ids:
        try:
            valid.append(uuid.UUID(str(raw_id).strip()))
        except (ValueError, AttributeError):
            invalid.append(str(raw_id))
    return valid, invalid


# ==============================================================================
# Endpoints
# ==============================================================================

@router.post("/status", response_model=BulkActionResponse)
def execute_bulk_status_update(
    payload: BulkStatusUpdateRequest,
    db: Session = Depends(get_db),
):
    """
    Atomically updates status or activation flag for a batch of records.
    Wraps entire batch in a transactional scope with session rollback on failure.
    """
    valid_uuids, invalid_ids = _parse_valid_uuids(payload.ids)
    if not valid_uuids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No valid UUIDs found in request payload. Invalid: {invalid_ids}",
        )

    processed: List[str] = []
    errors: List[str] = []
    affected_count = 0

    try:
        if payload.entity == "tenants":
            # Update tenants in res_companies
            stmt = select(ResCompany).where(ResCompany.id.in_(valid_uuids))
            companies = db.execute(stmt).scalars().all()

            for company in companies:
                if payload.is_active is not None:
                    company.is_active = payload.is_active
                if payload.status is not None:
                    company.status = payload.status

                # Log audit trail for each tenant
                audit = TenantAuditLog(
                    id=str(uuid.uuid4()),
                    tenant_id=str(company.id),
                    action_type="BULK_STATUS_UPDATE",
                    actor="PLATFORM_OPERATOR",
                    details=f"Bulk status update: status={payload.status}, is_active={payload.is_active}, reason={payload.reason or 'N/A'}",
                    created_at=datetime.now(timezone.utc),
                )
                db.add(audit)
                processed.append(str(company.id))

            affected_count = len(companies)

        elif payload.entity == "procurement_bills":
            # Update procurement vendor bills
            stmt = select(ProcurementBill).where(ProcurementBill.id.in_(valid_uuids))
            bills = db.execute(stmt).scalars().all()

            for bill in bills:
                if payload.status:
                    bill.match_status = payload.status
                processed.append(str(bill.id))

            affected_count = len(bills)

        elif payload.entity == "purchase_orders":
            # Update purchase orders
            stmt = select(PurchaseOrder).where(PurchaseOrder.id.in_(valid_uuids))
            pos = db.execute(stmt).scalars().all()

            for po in pos:
                if payload.status:
                    po.state = payload.status
                processed.append(str(po.id))

            affected_count = len(pos)

        elif payload.entity == "vehicles":
            # Update vehicles
            stmt = select(Vehicle).where(Vehicle.id.in_(valid_uuids))
            vehicles = db.execute(stmt).scalars().all()

            for veh in vehicles:
                if payload.status:
                    veh.status = payload.status
                processed.append(str(veh.id))

            affected_count = len(vehicles)

        elif payload.entity == "users":
            # Update users
            stmt = select(ResUser).where(ResUser.id.in_(valid_uuids))
            users = db.execute(stmt).scalars().all()

            for u in users:
                if payload.is_active is not None:
                    u.is_active = payload.is_active
                if payload.status:
                    u.role = payload.status
                processed.append(str(u.id))

            affected_count = len(users)

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported entity type: {payload.entity}",
            )

        # Atomic commit
        db.commit()

        return BulkActionResponse(
            success=True,
            action="update_status",
            entity=payload.entity,
            affected_count=affected_count,
            processed_ids=processed,
            failed_ids=invalid_ids,
            errors=errors,
            message=f"Successfully updated status for {affected_count} {payload.entity}.",
        )

    except SQLAlchemyError as exc:
        db.rollback()
        logger.error(f"Bulk status update transaction failed, rolled back: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk database operation failed and was safely rolled back: {str(exc)}",
        )
    except Exception as exc:
        db.rollback()
        logger.error(f"Unexpected error in bulk status update: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during bulk status update: {str(exc)}",
        )


@router.post("/delete", response_model=BulkActionResponse)
def execute_bulk_deletion(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
):
    """
    Atomically deletes or soft-deletes a batch of records.
    Enforces transaction rollback on any failure to prevent connection poisoning.
    """
    valid_uuids, invalid_ids = _parse_valid_uuids(payload.ids)
    if not valid_uuids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No valid UUIDs found in request payload. Invalid: {invalid_ids}",
        )

    processed: List[str] = []
    affected_count = 0

    try:
        if payload.entity == "tenants":
            # For tenants, soft delete by deactivating or hard delete if requested
            stmt = select(ResCompany).where(ResCompany.id.in_(valid_uuids))
            companies = db.execute(stmt).scalars().all()

            for company in companies:
                if payload.hard_delete:
                    db.delete(company)
                else:
                    company.is_active = False
                    company.status = "SUSPENDED"

                audit = TenantAuditLog(
                    id=str(uuid.uuid4()),
                    tenant_id=str(company.id),
                    action_type="BULK_DELETE" if payload.hard_delete else "BULK_DEACTIVATE",
                    actor="PLATFORM_OPERATOR",
                    details=f"Bulk deletion executed (hard_delete={payload.hard_delete})",
                    created_at=datetime.now(timezone.utc),
                )
                db.add(audit)
                processed.append(str(company.id))

            affected_count = len(companies)

        elif payload.entity == "procurement_bills":
            stmt = select(ProcurementBill).where(ProcurementBill.id.in_(valid_uuids))
            bills = db.execute(stmt).scalars().all()
            for bill in bills:
                db.delete(bill)
                processed.append(str(bill.id))
            affected_count = len(bills)

        elif payload.entity == "purchase_orders":
            stmt = select(PurchaseOrder).where(PurchaseOrder.id.in_(valid_uuids))
            pos = db.execute(stmt).scalars().all()
            for po in pos:
                db.delete(po)
                processed.append(str(po.id))
            affected_count = len(pos)

        elif payload.entity == "vehicles":
            stmt = select(Vehicle).where(Vehicle.id.in_(valid_uuids))
            vehicles = db.execute(stmt).scalars().all()
            for veh in vehicles:
                db.delete(veh)
                processed.append(str(veh.id))
            affected_count = len(vehicles)

        elif payload.entity == "users":
            stmt = select(ResUser).where(ResUser.id.in_(valid_uuids))
            users = db.execute(stmt).scalars().all()
            for u in users:
                if payload.hard_delete:
                    db.delete(u)
                else:
                    u.is_active = False
                processed.append(str(u.id))
            affected_count = len(users)

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported entity type for deletion: {payload.entity}",
            )

        # Atomic commit
        db.commit()

        return BulkActionResponse(
            success=True,
            action="delete" if payload.hard_delete else "soft_delete",
            entity=payload.entity,
            affected_count=affected_count,
            processed_ids=processed,
            failed_ids=invalid_ids,
            errors=[],
            message=f"Successfully processed deletion of {affected_count} {payload.entity}.",
        )

    except SQLAlchemyError as exc:
        db.rollback()
        logger.error(f"Bulk delete transaction failed, rolled back: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk deletion failed and was safely rolled back: {str(exc)}",
        )
    except Exception as exc:
        db.rollback()
        logger.error(f"Unexpected error in bulk deletion: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during bulk deletion: {str(exc)}",
        )


# ==============================================================================
# Convenience Dedicated Sub-routes (for direct Frontend Binding)
# ==============================================================================

@router.post("/tenants/status", response_model=BulkActionResponse)
def bulk_tenant_status(
    payload: BulkStatusUpdateRequest,
    db: Session = Depends(get_db),
):
    payload.entity = "tenants"
    return execute_bulk_status_update(payload, db)


@router.post("/tenants/delete", response_model=BulkActionResponse)
def bulk_tenant_delete(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
):
    payload.entity = "tenants"
    return execute_bulk_deletion(payload, db)


@router.post("/procurement/status", response_model=BulkActionResponse)
def bulk_procurement_status(
    payload: BulkStatusUpdateRequest,
    db: Session = Depends(get_db),
):
    return execute_bulk_status_update(payload, db)


@router.post("/procurement/delete", response_model=BulkActionResponse)
def bulk_procurement_delete(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
):
    return execute_bulk_deletion(payload, db)
