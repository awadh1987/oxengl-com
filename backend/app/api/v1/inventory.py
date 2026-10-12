"""
OxenGL Inventory Core API Endpoints.
Perpetual Inventory Tracking, Stock Balances, Moving Average Adjustments,
and Landed Cost Allocations with ABAC Security Guardrails.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from backend.database import get_db
from backend.models import PurchaseOrder, ResPartner, ResCompany
from backend.app.services.sequence_service import SequenceService
from backend.app.domains.inventory.models import (
    Material,
    StockBalance,
    LandedCostAllocation,
    LandedCostItem,
)
from backend.app.domains.inventory.services import (
    InventoryValuationService,
    LandedCostService,
)
from backend.app.security.abac import enforce_abac

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory & WMS"])


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class StockAdjustmentRequest(BaseModel):
    warehouse_id: uuid.UUID
    material_id: uuid.UUID
    quantity: float
    transaction_type: str = "ADJUSTMENT"  # ADJUSTMENT, REVALUATION, COUNT_CORRECTION
    unit_cost: Optional[float] = None
    reason: Optional[str] = None


class MaterialCreate(BaseModel):
    code: str
    name: str
    category: str = "RAW_MATERIAL"
    primary_uom: str = "KG"
    secondary_uom: Optional[str] = None
    uom_conversion_ratio: float = 1.0
    standard_cost: float = 0.0


class LandedCostAllocateRequest(BaseModel):
    goods_receipt_id: uuid.UUID
    freight_amount: float = 0.0
    customs_amount: float = 0.0
    handling_amount: float = 0.0
    insurance_amount: float = 0.0
    allocation_method: str = "VALUE"  # VALUE, WEIGHT, QUANTITY
    items: List[dict]  # list of {'material_id': str, 'base_cost': float, 'weight': float, 'qty': float}


# ==============================================================================
# Endpoints
# ==============================================================================

@router.post(
    "/adjust",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(enforce_abac("ADJUST"))],
)
def adjust_inventory_stock(
    payload: StockAdjustmentRequest,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
):
    """
    Adjusts warehouse stock balances. Strictly guarded by ABAC warehouse isolation.
    """
    tenant_uuid = uuid.UUID(x_tenant_id) if x_tenant_id else uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    qty_delta = Decimal(str(payload.quantity))
    unit_cost = Decimal(str(payload.unit_cost)) if payload.unit_cost is not None else None

    balance = db.execute(
        select(StockBalance).where(
            StockBalance.warehouse_id == payload.warehouse_id,
            StockBalance.material_id == payload.material_id,
        )
    ).scalar_one_or_none()

    if not balance:
        effective_cost = unit_cost or Decimal("10.0000")
        balance = StockBalance(
            tenant_id=tenant_uuid,
            warehouse_id=payload.warehouse_id,
            material_id=payload.material_id,
            quantity_on_hand=max(Decimal("0.0000"), qty_delta),
            quantity_reserved=Decimal("0.0000"),
            quantity_available=max(Decimal("0.0000"), qty_delta),
            unit_cost_moving_avg=effective_cost,
            total_valuation=max(Decimal("0.0000"), qty_delta) * effective_cost,
        )
        db.add(balance)
    else:
        balance.quantity_on_hand += qty_delta
        if balance.quantity_on_hand < 0:
            balance.quantity_on_hand = Decimal("0.0000")
        balance.quantity_available = balance.quantity_on_hand - balance.quantity_reserved

        if unit_cost is not None and qty_delta > 0:
            # Recalculate moving average cost
            balance.unit_cost_moving_avg = InventoryValuationService.calculate_moving_average(
                current_qty=balance.quantity_on_hand - qty_delta,
                current_unit_cost=balance.unit_cost_moving_avg,
                incoming_qty=qty_delta,
                incoming_unit_cost=unit_cost,
            )
        balance.total_valuation = balance.quantity_on_hand * balance.unit_cost_moving_avg

    db.commit()
    db.refresh(balance)

    return {
        "status": "SUCCESS",
        "warehouse_id": str(balance.warehouse_id),
        "material_id": str(balance.material_id),
        "quantity_on_hand": float(balance.quantity_on_hand),
        "quantity_available": float(balance.quantity_available),
        "unit_cost_moving_avg": float(balance.unit_cost_moving_avg),
        "total_valuation": float(balance.total_valuation),
    }


@router.get("/balances")
def list_stock_balances(
    warehouse_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
):
    """Lists stock balances filtered by warehouse."""
    stmt = select(StockBalance)
    if warehouse_id:
        stmt = stmt.where(StockBalance.warehouse_id == warehouse_id)

    balances = db.execute(stmt).scalars().all()
    return [
        {
            "id": str(b.id),
            "warehouse_id": str(b.warehouse_id),
            "material_id": str(b.material_id),
            "quantity_on_hand": float(b.quantity_on_hand),
            "quantity_reserved": float(b.quantity_reserved),
            "quantity_available": float(b.quantity_available),
            "unit_cost_moving_avg": float(b.unit_cost_moving_avg),
            "total_valuation": float(b.total_valuation),
        }
        for b in balances
    ]


@router.post("/materials", status_code=status.HTTP_201_CREATED)
def create_material(
    payload: MaterialCreate,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Creates a new catalog material item with Dual-UOM."""
    tenant_uuid = uuid.UUID(x_tenant_id) if x_tenant_id else uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    company_uuid = uuid.UUID(x_company_id) if x_company_id else uuid.UUID("f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c")

    material = Material(
        tenant_id=tenant_uuid,
        company_id=company_uuid,
        code=payload.code,
        name=payload.name,
        category=payload.category,
        primary_uom=payload.primary_uom,
        secondary_uom=payload.secondary_uom,
        uom_conversion_ratio=Decimal(str(payload.uom_conversion_ratio)),
        standard_cost=Decimal(str(payload.standard_cost)),
        current_moving_avg_cost=Decimal(str(payload.standard_cost)),
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


@router.get("/materials")
def list_materials(
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
    x_company_id: Optional[str] = Header(None),
):
    """Lists catalog materials deduplicated at the database level."""
    clean_name = func.trim(Material.name)
    stmt = (
        select(Material)
        .distinct(clean_name)
        .where(Material.is_active.is_(True))
        .order_by(clean_name, Material.created_at.desc())
    )
    if x_tenant_id:
        try:
            stmt = stmt.where(Material.tenant_id == uuid.UUID(x_tenant_id))
        except ValueError:
            pass
    if x_company_id:
        try:
            stmt = stmt.where(Material.company_id == uuid.UUID(x_company_id))
        except ValueError:
            pass

    return db.scalars(stmt).all()


@router.post("/landed-cost/allocate")
def allocate_landed_costs(
    payload: LandedCostAllocateRequest,
    db: Session = Depends(get_db),
    x_tenant_id: Optional[str] = Header(None),
):
    """Allocates landed costs across receipt line items and updates valuations."""
    tenant_uuid = uuid.UUID(x_tenant_id) if x_tenant_id else uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    total_freight = Decimal(str(payload.freight_amount))
    total_customs = Decimal(str(payload.customs_amount))
    total_handling = Decimal(str(payload.handling_amount))
    total_insurance = Decimal(str(payload.insurance_amount))
    total_additional = total_freight + total_customs + total_handling + total_insurance

    # 1. Run apportionment
    apportioned_items = LandedCostService.apportion_landed_costs(
        total_expense=total_additional,
        items_payload=payload.items,
        method=payload.allocation_method,
    )

    # 2. Record Header
    allocation = LandedCostAllocation(
        tenant_id=tenant_uuid,
        goods_receipt_id=payload.goods_receipt_id,
        freight_amount=total_freight,
        customs_amount=total_customs,
        port_handling_amount=total_handling,
        insurance_amount=total_insurance,
        total_landed_cost=total_additional,
        allocation_method=payload.allocation_method,
        is_posted=True,
    )
    db.add(allocation)
    db.flush()

    # 3. Record Items
    for item in apportioned_items:
        cost_item = LandedCostItem(
            allocation_id=allocation.id,
            material_id=uuid.UUID(str(item["material_id"])),
            base_cost=item["base_cost"],
            allocated_expense=item["allocated_expense"],
            final_effective_cost=item["final_effective_cost"],
        )
        db.add(cost_item)

    db.commit()

    return {
        "allocation_id": str(allocation.id),
        "goods_receipt_id": str(payload.goods_receipt_id),
        "total_landed_cost": float(total_additional),
        "allocation_method": payload.allocation_method,
        "items": [
            {
                "material_id": str(i["material_id"]),
                "allocated_expense": float(i["allocated_expense"]),
                "final_effective_cost": float(i["final_effective_cost"]),
            }
            for i in apportioned_items
        ],
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
    Enforces db.add(), db.commit(), db.refresh().
    """
    # 1. Resolve Company / Tenant UUID
    comp_raw = payload.get("company_id") or x_company_id or x_tenant_id
    comp_uuid = None
    if comp_raw:
        try:
            comp_uuid = uuid.UUID(str(comp_raw))
        except Exception:
            pass

    if not comp_uuid:
        first_comp = db.execute(select(ResCompany)).scalars().first()
        comp_uuid = first_comp.id if first_comp else uuid.UUID("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
    else:
        existing_comp = db.execute(select(ResCompany).where(ResCompany.id == comp_uuid)).scalar_one_or_none()
        if not existing_comp:
            first_comp = db.execute(select(ResCompany)).scalars().first()
            if first_comp:
                comp_uuid = first_comp.id

    # 2. Resolve or create Partner / Vendor
    partner_id_raw = payload.get("partner_id")
    partner = None
    if partner_id_raw:
        try:
            partner = db.execute(select(ResPartner).where(ResPartner.id == uuid.UUID(str(partner_id_raw)))).scalar_one_or_none()
        except Exception:
            partner = None

    vendor_name = (payload.get("vendor_name") or payload.get("vendorName") or "").strip()
    if not partner and vendor_name:
        partner = db.execute(select(ResPartner).where(ResPartner.name == vendor_name)).scalars().first()
        if not partner:
            partner = ResPartner(
                id=uuid.uuid4(),
                company_id=comp_uuid,
                name=vendor_name,
                partner_type="raw_materials_supplier",
            )
            db.add(partner)
            db.flush()

    if not partner:
        partner = db.execute(select(ResPartner).where(ResPartner.company_id == comp_uuid)).scalars().first()
        if not partner:
            partner = ResPartner(
                id=uuid.uuid4(),
                company_id=comp_uuid,
                name=vendor_name or "المورد العام / General Vendor",
                partner_type="raw_materials_supplier",
            )
            db.add(partner)
            db.flush()

    # 3. Monetary calculations & amounts
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

    # 4. PO Number & dates
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

    # 5. Strict DB Persistence (db.add, db.commit, db.refresh)
    new_po = PurchaseOrder(
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

    return {
        "status": "CREATED",
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
        "status": "PENDING" if new_po.status in ["draft", "confirmed"] else new_po.status.upper(),
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
    """Lists persisted purchase orders with partner details."""
    query = select(PurchaseOrder).order_by(PurchaseOrder.order_date.desc())
    if x_company_id or x_tenant_id:
        try:
            cid = uuid.UUID(x_company_id or x_tenant_id)
            query = query.where(PurchaseOrder.company_id == cid)
        except Exception:
            pass

    orders = db.execute(query).scalars().all()
    results = []
    for po in orders:
        partner_name = po.partner.name if po.partner else "Vendor"
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
            "status": "PENDING" if po.status in ["draft", "confirmed"] else po.status.upper(),
            "issueDate": po.order_date.strftime("%Y-%m-%d") if po.order_date else "",
            "deliveryDate": po.expected_delivery_date.strftime("%Y-%m-%d") if po.expected_delivery_date else (po.order_date.strftime("%Y-%m-%d") if po.order_date else ""),
            "notes": po.notes,
        })
    return results


# ==============================================================================
# Multi-Warehouse Valuation Endpoints
# ==============================================================================

@router.get("/valuation")
def get_inventory_valuation_metrics(
    warehouse_id: Optional[str] = None,
    valuation_method: str = "FIFO",
    x_company_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Computes real-time multi-warehouse inventory asset valuation.
    Supports FIFO lot layers, Weighted Average (WAC), and Standard Costing.
    """
    try:
        from backend.app.domains.inventory.valuation import InventoryValuationCalculator
    except ImportError:
        from app.domains.inventory.valuation import InventoryValuationCalculator

    cid = uuid.UUID(x_company_id) if x_company_id else None
    report = InventoryValuationCalculator.calculate_valuation(
        db=db,
        warehouse_ref=warehouse_id or "ALL",
        valuation_method=valuation_method,
        company_id=cid,
    )
    return report.model_dump()


@router.post("/valuation/calculate")
def calculate_inventory_valuation_action(
    payload: dict,
    x_company_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Calculates on-demand valuation across single or multi-warehouse assets."""
    try:
        from backend.app.domains.inventory.valuation import InventoryValuationCalculator
    except ImportError:
        from app.domains.inventory.valuation import InventoryValuationCalculator

    cid = uuid.UUID(x_company_id) if x_company_id else None
    wh_ref = payload.get("warehouse_id", "ALL")
    val_method = payload.get("valuation_method", "FIFO")

    report = InventoryValuationCalculator.calculate_valuation(
        db=db,
        warehouse_ref=wh_ref,
        valuation_method=val_method,
        company_id=cid,
    )
    return report.model_dump()

