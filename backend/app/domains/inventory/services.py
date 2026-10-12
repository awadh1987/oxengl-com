"""
OxenGL Inventory Valuation & Landed Cost Services.
Calculates continuous Moving Average Cost (MAC) and apportioned Landed Cost.
"""

import uuid
from decimal import Decimal
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.domains.inventory.models import (
    Material,
    StockBalance,
    LandedCostAllocation,
    LandedCostItem,
)


class InventoryValuationService:
    """Performs perpetual Moving Average Cost (MAC) valuation calculations."""

    @staticmethod
    def calculate_moving_average(
        current_qty: Decimal,
        current_unit_cost: Decimal,
        incoming_qty: Decimal,
        incoming_unit_cost: Decimal,
    ) -> Decimal:
        """
        Calculates new moving average unit cost upon receipt of additional inventory:
        New MAC = ((Current Qty * Current MAC) + (Incoming Qty * Incoming Unit Cost)) / (Current Qty + Incoming Qty)
        """
        total_qty = current_qty + incoming_qty
        if total_qty <= Decimal("0.0000"):
            return current_unit_cost

        total_value = (current_qty * current_unit_cost) + (incoming_qty * incoming_unit_cost)
        new_mac = total_value / total_qty
        return round(new_mac, 4)

    @staticmethod
    def update_stock_balance_on_receipt(
        db: Session,
        tenant_id: uuid.UUID,
        warehouse_id: uuid.UUID,
        material_id: uuid.UUID,
        received_qty: Decimal,
        unit_cost: Decimal,
    ) -> StockBalance:
        """Updates stock balance and recalculates moving average unit cost."""
        balance = db.execute(
            select(StockBalance).where(
                StockBalance.warehouse_id == warehouse_id,
                StockBalance.material_id == material_id,
            )
        ).scalar_one_or_none()

        if not balance:
            balance = StockBalance(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                material_id=material_id,
                quantity_on_hand=received_qty,
                quantity_reserved=Decimal("0.0000"),
                quantity_available=received_qty,
                unit_cost_moving_avg=unit_cost,
                total_valuation=received_qty * unit_cost,
            )
            db.add(balance)
        else:
            new_mac = InventoryValuationService.calculate_moving_average(
                current_qty=balance.quantity_on_hand,
                current_unit_cost=balance.unit_cost_moving_avg,
                incoming_qty=received_qty,
                incoming_unit_cost=unit_cost,
            )
            balance.quantity_on_hand += received_qty
            balance.quantity_available = balance.quantity_on_hand - balance.quantity_reserved
            balance.unit_cost_moving_avg = new_mac
            balance.total_valuation = balance.quantity_on_hand * new_mac

        # Also update material master current MAC
        material = db.execute(select(Material).where(Material.id == material_id)).scalar_one_or_none()
        if material:
            material.current_moving_avg_cost = balance.unit_cost_moving_avg

        db.commit()
        db.refresh(balance)
        return balance


class LandedCostService:
    """Allocates freight, customs, and ancillary charges pro-rata onto inventory receipts."""

    @staticmethod
    def apportion_landed_costs(
        total_expense: Decimal,
        items_payload: List[Dict],  # list of {'material_id': UUID, 'base_cost': Decimal, 'weight': Decimal, 'qty': Decimal}
        method: str = "VALUE",
    ) -> List[Dict]:
        """
        Apportions additional landed cost across receipt lines according to method:
        - VALUE: pro-rata by item base total value
        - WEIGHT: pro-rata by item total weight
        - QUANTITY: pro-rata by item total count
        """
        if not items_payload:
            return []

        if method.upper() == "WEIGHT":
            total_basis = sum([Decimal(str(item.get("weight", 1))) * Decimal(str(item.get("qty", 1))) for item in items_payload])
        elif method.upper() == "QUANTITY":
            total_basis = sum([Decimal(str(item.get("qty", 1))) for item in items_payload])
        else:  # VALUE default
            total_basis = sum([Decimal(str(item.get("base_cost", 0))) * Decimal(str(item.get("qty", 1))) for item in items_payload])

        if total_basis <= Decimal("0.0000"):
            total_basis = Decimal(len(items_payload))

        apportioned = []
        for item in items_payload:
            qty = Decimal(str(item.get("qty", 1)))
            base_cost = Decimal(str(item.get("base_cost", 0)))
            if method.upper() == "WEIGHT":
                item_basis = Decimal(str(item.get("weight", 1))) * qty
            elif method.upper() == "QUANTITY":
                item_basis = qty
            else:
                item_basis = base_cost * qty

            share_ratio = item_basis / total_basis
            allocated_charge = round(total_expense * share_ratio, 4)
            effective_line_cost = (base_cost * qty) + allocated_charge
            effective_unit_cost = round(effective_line_cost / qty, 4) if qty > 0 else base_cost

            apportioned.append({
                "material_id": item["material_id"],
                "base_cost": base_cost,
                "allocated_expense": allocated_charge,
                "final_effective_cost": effective_unit_cost,
                "quantity": qty,
            })

        return apportioned
