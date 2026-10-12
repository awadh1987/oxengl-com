"""
OxenGL Cross-Border Customs & Regulatory Manifests API Router (REM-P2-03).
Provides authoritative REST endpoints for customs declarations, status transitions,
and automatic SHA-256 blockchain ledger chaining with strict multi-tenant isolation.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ResUser
from backend.app.services.sequence_service import SequenceService
from backend.app.dependencies import get_active_company_id, get_current_active_user
from backend.app.domains.logistics.customs_models import CustomsManifest

logger = logging.getLogger("oxengl.api.customs")

router = APIRouter(tags=["Cross-Border Customs"])

# Status Transition Matrix
# DRAFT -> SUBMITTED -> INSPECTION -> CLEARED -> REJECTED
VALID_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"SUBMITTED", "PENDING_DOCUMENTATION", "INSPECTION", "UNDER_INSPECTION", "REJECTED", "HELD"},
    "SUBMITTED": {"INSPECTION", "UNDER_INSPECTION", "CLEARED", "REJECTED", "HELD"},
    "PENDING_DOCUMENTATION": {"SUBMITTED", "INSPECTION", "UNDER_INSPECTION", "CLEARED", "REJECTED", "HELD"},
    "INSPECTION": {"CLEARED", "REJECTED", "HELD"},
    "UNDER_INSPECTION": {"CLEARED", "REJECTED", "HELD"},
    "HELD": {"INSPECTION", "UNDER_INSPECTION", "CLEARED", "REJECTED"},
    "REJECTED": {"DRAFT", "SUBMITTED"},
    "CLEARED": set(),  # Terminal state
}


# ==============================================================================
# Pydantic Contracts
# ==============================================================================

class CustomsManifestCreate(BaseModel):
    manifest_number: Optional[str] = None
    declaration_number: Optional[str] = None
    declaration_type: Literal["IMPORT", "EXPORT", "TRANSIT"] = "IMPORT"
    port_of_entry: Optional[str] = None
    border_port_name: Optional[str] = None
    carrier_name: Optional[str] = None
    status: Optional[str] = "DRAFT"
    duty_amount: Decimal = Field(default=Decimal("0.0000"), ge=0)
    vat_amount: Decimal = Field(default=Decimal("0.0000"), ge=0)
    total_customs_amount: Optional[Decimal] = None
    total_value_sar: Optional[float] = None
    hs_codes: list[str] = []
    company_id: Optional[uuid.UUID] = None


class CustomsStatusUpdate(BaseModel):
    status: str
    review_notes: Optional[str] = None


class CustomsManifestRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    manifest_number: str
    declaration_number: Optional[str] = None
    declaration_type: str
    port_of_entry: Optional[str] = None
    border_port_name: str
    carrier_name: Optional[str] = None
    status: str
    clearance_status: str
    zatca_compliance_status: str
    duty_amount: Decimal
    vat_amount: Decimal
    total_customs_amount: Decimal
    total_value_sar: float
    hs_codes: list[str] = []
    payload_hash: Optional[str] = None
    block_hash: str = ""
    previous_hash: str
    block_index: int
    created_at: datetime
    updated_at: datetime
    timestamp: str = ""

    model_config = ConfigDict(from_attributes=True)


def manifest_to_read(m: CustomsManifest) -> CustomsManifestRead:
    """Serializes a CustomsManifest ORM instance into the authoritative API contract."""
    hs_codes_list = [str(c) for c in (m.hs_codes_json or [])] if isinstance(m.hs_codes_json, list) else []
    total_val = float(m.total_customs_amount) if m.total_customs_amount is not None else 0.0
    return CustomsManifestRead(
        id=m.id,
        tenant_id=m.tenant_id,
        company_id=m.company_id or m.tenant_id,
        manifest_number=m.manifest_number,
        declaration_number=m.declaration_number or m.manifest_number,
        declaration_type=m.declaration_type,
        port_of_entry=m.port_of_entry or m.border_port_name,
        border_port_name=m.border_port_name,
        carrier_name=m.carrier_name,
        status=m.status,
        clearance_status=m.clearance_status,
        zatca_compliance_status=m.zatca_compliance_status,
        duty_amount=m.duty_amount,
        vat_amount=m.vat_amount,
        total_customs_amount=m.total_customs_amount,
        total_value_sar=total_val,
        hs_codes=hs_codes_list,
        payload_hash=m.payload_hash,
        block_hash=m.payload_hash or "",
        previous_hash=m.previous_hash,
        block_index=m.block_index,
        created_at=m.created_at,
        updated_at=m.updated_at,
        timestamp=m.created_at.isoformat() if m.created_at else "",
    )


def compute_chain_hash(
    tenant_id: uuid.UUID,
    manifest_number: str,
    total_amount: Decimal,
    declaration_type: str,
    previous_hash: str,
    block_index: int,
) -> str:
    """Computes an immutable SHA-256 hash chaining this block to the previous manifest block."""
    raw = f"{tenant_id}:{manifest_number}:{declaration_type}:{total_amount:.4f}:{previous_hash}:{block_index}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ==============================================================================
# Route Handlers
# ==============================================================================

@router.get("", response_model=List[CustomsManifestRead])
@router.get("/", response_model=List[CustomsManifestRead])
def list_customs_manifests(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = None,
    active_company_id: uuid.UUID = Depends(get_active_company_id),
    current_user: ResUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> List[CustomsManifestRead]:
    """
    Lists cross-border customs manifests strictly isolated to the active tenant workspace.
    Supports search queries over manifest number, port name, and HS codes.
    """
    stmt = select(CustomsManifest).where(CustomsManifest.tenant_id == active_company_id)

    if status_filter and status_filter.upper() != "ALL":
        target = status_filter.upper()
        stmt = stmt.where(
            or_(
                CustomsManifest.status == target,
                CustomsManifest.clearance_status == target,
            )
        )

    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                CustomsManifest.manifest_number.ilike(term),
                CustomsManifest.border_port_name.ilike(term),
                CustomsManifest.port_of_entry.ilike(term),
                CustomsManifest.carrier_name.ilike(term),
            )
        )

    stmt = stmt.order_by(CustomsManifest.block_index.desc(), CustomsManifest.created_at.desc())
    stmt = stmt.offset(offset).limit(limit)

    manifests = db.scalars(stmt).all()
    return [manifest_to_read(m) for m in manifests]


@router.post("", response_model=CustomsManifestRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=CustomsManifestRead, status_code=status.HTTP_201_CREATED)
def create_customs_manifest(
    payload: CustomsManifestCreate,
    active_company_id: uuid.UUID = Depends(get_active_company_id),
    current_user: ResUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> CustomsManifestRead:
    """
    Creates a new customs declaration manifest with automated SHA-256 blockchain hash chaining.
    Links the new block to the tenant's latest recorded ledger state.
    """
    man_raw = (payload.manifest_number or "").strip()
    if not man_raw or "auto" in man_raw.lower() or "توليد" in man_raw or man_raw.startswith("MANIFEST-KSA-"):
        manifest_number = SequenceService.get_next_sequence(db, active_company_id, "customs_manifest")
    else:
        manifest_number = man_raw

    # Check uniqueness
    existing = db.scalar(
        select(CustomsManifest).where(
            CustomsManifest.manifest_number == manifest_number,
            CustomsManifest.tenant_id == active_company_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Customs manifest '{manifest_number}' already exists in this workspace",
        )

    # Determine total valuation
    duty = payload.duty_amount.quantize(Decimal("0.0001"))
    vat = payload.vat_amount.quantize(Decimal("0.0001"))
    if payload.total_customs_amount is not None:
        total_customs = payload.total_customs_amount.quantize(Decimal("0.0001"))
    elif payload.total_value_sar is not None:
        total_customs = Decimal(str(payload.total_value_sar)).quantize(Decimal("0.0001"))
    else:
        total_customs = (duty + vat).quantize(Decimal("0.0001"))

    # Resolve ports and carriers
    port_name = payload.border_port_name or payload.port_of_entry or "King Abdulaziz Port Dammam"
    port_entry = payload.port_of_entry or port_name

    # Determine initial status
    init_status = (payload.status or "DRAFT").upper()
    if init_status in ("CLEARED",):
        clearance_st = "CLEARED"
        zatca_st = "REPORTED"
    elif init_status in ("INSPECTION", "UNDER_INSPECTION"):
        clearance_st = "UNDER_INSPECTION"
        zatca_st = "NOT_SUBMITTED"
    elif init_status in ("REJECTED", "HELD"):
        clearance_st = "HELD"
        zatca_st = "REJECTED"
    else:
        clearance_st = "PENDING_DOCUMENTATION"
        zatca_st = "NOT_SUBMITTED"

    # Cryptographic Hash Chaining
    # 1. Fetch previous manifest block for tenant
    last_block = db.scalar(
        select(CustomsManifest)
        .where(CustomsManifest.tenant_id == active_company_id)
        .order_by(CustomsManifest.block_index.desc())
        .with_for_update()
    )

    if last_block and last_block.payload_hash:
        previous_hash = last_block.payload_hash
        block_index = last_block.block_index + 1
    else:
        previous_hash = "0" * 64
        block_index = 1

    # 2. Compute current block payload hash
    payload_hash = compute_chain_hash(
        tenant_id=active_company_id,
        manifest_number=manifest_number,
        total_amount=total_customs,
        declaration_type=payload.declaration_type,
        previous_hash=previous_hash,
        block_index=block_index,
    )

    now = datetime.now(timezone.utc)
    manifest = CustomsManifest(
        id=uuid.uuid4(),
        tenant_id=active_company_id,
        company_id=active_company_id,
        manifest_number=manifest_number,
        declaration_number=payload.declaration_number or manifest_number,
        declaration_type=payload.declaration_type,
        port_of_entry=port_entry,
        border_port_name=port_name,
        carrier_name=payload.carrier_name,
        status=init_status,
        clearance_status=clearance_st,
        zatca_compliance_status=zatca_st,
        duty_amount=duty,
        vat_amount=vat,
        total_customs_amount=total_customs,
        hs_codes_json=payload.hs_codes or [],
        payload_hash=payload_hash,
        previous_hash=previous_hash,
        block_index=block_index,
        cryptographic_uuid=uuid.uuid4(),
        created_at=now,
        updated_at=now,
    )

    db.add(manifest)
    db.commit()
    db.refresh(manifest)

    logger.info(
        f"Created CustomsManifest {manifest.manifest_number} (Block #{manifest.block_index}) "
        f"for tenant {active_company_id} [Hash: {manifest.payload_hash[:12]}...]"
    )
    return manifest_to_read(manifest)


@router.get("/{manifest_id}", response_model=CustomsManifestRead)
def get_customs_manifest(
    manifest_id: uuid.UUID,
    active_company_id: uuid.UUID = Depends(get_active_company_id),
    current_user: ResUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> CustomsManifestRead:
    """Fetches single customs manifest details with strict verification of tenant ownership."""
    manifest = db.get(CustomsManifest, manifest_id)
    if not manifest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customs manifest not found")

    if manifest.tenant_id != active_company_id:
        logger.warning(
            f"Tenant isolation breach prevented: User {current_user.id} (Tenant {active_company_id}) "
            f"attempted to access manifest {manifest_id} owned by Tenant {manifest.tenant_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Manifest belongs to an isolated tenant workspace",
        )

    return manifest_to_read(manifest)


@router.put("/{manifest_id}/status", response_model=CustomsManifestRead)
def update_customs_manifest_status(
    manifest_id: uuid.UUID,
    payload: CustomsStatusUpdate,
    active_company_id: uuid.UUID = Depends(get_active_company_id),
    current_user: ResUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> CustomsManifestRead:
    """
    Transitions customs manifest status across the regulatory pipeline:
    DRAFT -> SUBMITTED -> INSPECTION -> CLEARED -> REJECTED.
    Enforces status transition invariants and active tenant boundaries.
    """
    manifest = db.get(CustomsManifest, manifest_id)
    if not manifest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customs manifest not found")

    if manifest.tenant_id != active_company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Manifest belongs to an isolated tenant workspace",
        )

    curr_st = (manifest.status or "DRAFT").upper()
    target_st = payload.status.upper().strip()

    # Normalize aliases
    if target_st == "UNDER_INSPECTION":
        target_st = "INSPECTION"
    if target_st == "PENDING_DOCUMENTATION":
        target_st = "SUBMITTED"

    # Terminal state check
    if curr_st == "CLEARED" and target_st != "CLEARED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transition: Manifest is in terminal state '{curr_st}' and cannot be altered",
        )

    # Transition validation
    allowed = VALID_TRANSITIONS.get(curr_st, set())
    if target_st != curr_st and target_st not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid customs status transition from '{curr_st}' to '{target_st}'. Allowed: {sorted(list(allowed))}",
        )

    # Apply transition state
    manifest.status = target_st
    if target_st == "CLEARED":
        manifest.clearance_status = "CLEARED"
        manifest.zatca_compliance_status = "REPORTED"
    elif target_st in ("INSPECTION", "UNDER_INSPECTION"):
        manifest.clearance_status = "UNDER_INSPECTION"
    elif target_st in ("REJECTED", "HELD"):
        manifest.clearance_status = "HELD"
        manifest.zatca_compliance_status = "REJECTED"
    elif target_st in ("SUBMITTED", "PENDING_DOCUMENTATION"):
        manifest.clearance_status = "PENDING_DOCUMENTATION"

    manifest.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(manifest)

    logger.info(f"CustomsManifest {manifest.manifest_number} status updated to {target_st} by {current_user.email}")
    return manifest_to_read(manifest)
