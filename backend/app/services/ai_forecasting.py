"""
AI Supply Chain Forecasting & Predictive Analytics Service (Phase 9 - Part 3).
Provides:
1. Agricultural harvest yield estimation using historical batch data & seasonal multipliers.
2. Inventory stockout prediction via consumption velocity & days-until-stockout modeling.
3. Fleet maintenance & fuel efficiency anomaly detection.
4. Automated, governed restock proposal generation routed through SafetyBoundaryEngine.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend import models
from backend.schemas import (
    CropYieldPrediction,
    FleetAnomalyAlert,
    RestockProposalRequest,
    RestockProposalResponse,
    StockoutRiskItem,
)
from backend.services.ai_governance import ai_governance_engine

logger = logging.getLogger(__name__)

# Seasonal adjustments for crop yields
SEASONAL_MULTIPLIERS: dict[str, Decimal] = {
    "spring": Decimal("1.25"),
    "summer": Decimal("0.90"),
    "autumn": Decimal("1.05"),
    "winter": Decimal("1.10"),
    "full_year": Decimal("1.00"),
}


class AIForecastingService:
    """Enterprise forecasting engine for agricultural, inventory, and fleet operations."""

    def predict_harvest_yield(
        self,
        company_id: uuid.UUID,
        crop_cycle_id: uuid.UUID | None = None,
        db: Session = ...,
    ) -> list[CropYieldPrediction]:
        """
        Predicts expected harvest yields for active seasonal crop cycles based on
        historical batch yields and seasonal meteorological multipliers.
        """
        query = select(models.SeasonalCropCycle).where(models.SeasonalCropCycle.company_id == company_id)
        if crop_cycle_id:
            query = query.where(models.SeasonalCropCycle.id == crop_cycle_id)

        crop_cycles = db.scalars(query).all()
        predictions: list[CropYieldPrediction] = []

        for cycle in crop_cycles:
            # Query historical completed batches for this cycle
            batch_query = select(models.HarvestBatch).where(
                models.HarvestBatch.company_id == company_id,
                models.HarvestBatch.crop_cycle_id == cycle.id,
                models.HarvestBatch.status.in_(("harvested", "inspected", "stored", "processed")),
            )
            batches = db.scalars(batch_query).all()
            batch_count = len(batches)

            if batch_count > 0:
                avg_net_weight = sum((b.net_weight for b in batches), Decimal("0.0")) / Decimal(str(batch_count))
            else:
                # Fallback baseline company average or industry standard
                company_avg = db.scalar(
                    select(func.avg(models.HarvestBatch.net_weight)).where(
                        models.HarvestBatch.company_id == company_id,
                        models.HarvestBatch.net_weight > 0,
                    )
                )
                avg_net_weight = Decimal(str(company_avg)) if company_avg else Decimal("5000.00")

            season_key = (cycle.cycle_season or "full_year").lower()
            season_factor = SEASONAL_MULTIPLIERS.get(season_key, Decimal("1.00"))

            # Projected yield
            predicted_yield = Decimal(str(round(float(avg_net_weight * season_factor), 2)))
            lower_bound = Decimal(str(round(float(predicted_yield * Decimal("0.85")), 2)))
            upper_bound = Decimal(str(round(float(predicted_yield * Decimal("1.15")), 2)))

            # Confidence based on batch sample size
            if batch_count >= 5:
                confidence = Decimal("0.9500")
            elif batch_count >= 2:
                confidence = Decimal("0.8500")
            elif batch_count == 1:
                confidence = Decimal("0.7500")
            else:
                confidence = Decimal("0.6000")

            predictions.append(
                CropYieldPrediction(
                    crop_cycle_id=cycle.id,
                    crop_cycle_code=cycle.code,
                    crop_cycle_name=cycle.name,
                    season=cycle.cycle_season,
                    historical_batch_count=batch_count,
                    predicted_yield_kg=predicted_yield,
                    lower_bound_kg=lower_bound,
                    upper_bound_kg=upper_bound,
                    confidence_score=confidence,
                    notes=f"Projected for {cycle.cycle_season} season with factor {season_factor} based on {batch_count} historical batches",
                )
            )

        return predictions

    def predict_stockouts(
        self,
        company_id: uuid.UUID,
        window_days: int = 30,
        risk_threshold_days: int = 14,
        db: Session = ...,
    ) -> list[StockoutRiskItem]:
        """
        Analyzes inventory stock items, calculating daily consumption velocity
        and projecting days until stockout to trigger timely replenishment.
        """
        stock_items = db.scalars(
            select(models.StockItem).where(
                models.StockItem.company_id == company_id,
                models.StockItem.is_active.is_(True),
            )
        ).all()

        cutoff_date = datetime.now(timezone.utc) - timedelta(days=window_days)
        results: list[StockoutRiskItem] = []

        for item in stock_items:
            # 1. Current available stock from active lots
            curr_stock = db.scalar(
                select(func.coalesce(func.sum(models.StockLot.remaining_quantity), Decimal("0.00"))).where(
                    models.StockLot.company_id == company_id,
                    models.StockLot.stock_item_id == item.id,
                    models.StockLot.status == "active",
                )
            )
            current_stock = Decimal(str(curr_stock or "0.00"))

            # 2. Historical outbound consumption
            consumed = db.scalar(
                select(func.coalesce(func.sum(models.StockMovement.quantity), Decimal("0.00"))).where(
                    models.StockMovement.company_id == company_id,
                    models.StockMovement.stock_item_id == item.id,
                    models.StockMovement.created_at >= cutoff_date,
                    models.StockMovement.movement_type.in_(("outbound", "adjustment", "ISSUE", "ADJUSTMENT")),
                )
            )
            total_consumed = Decimal(str(consumed or "0.00"))
            daily_velocity = Decimal(str(round(float(total_consumed) / float(window_days), 4)))

            # 3. Days until stockout
            if daily_velocity > Decimal("0.0001"):
                days_left = Decimal(str(round(float(current_stock) / float(daily_velocity), 1)))
            else:
                days_left = Decimal("999.0")

            # 4. Risk Level
            if current_stock <= item.reorder_point or days_left <= Decimal("3.0"):
                risk_level = "CRITICAL"
            elif days_left <= Decimal(str(risk_threshold_days)):
                risk_level = "WARNING"
            else:
                risk_level = "SAFE"

            # Recommended replenishment
            recommended_reorder = max(
                item.maximum_stock - current_stock,
                item.reorder_point * Decimal("2.0"),
                Decimal("50.00"),
            )

            results.append(
                StockoutRiskItem(
                    stock_item_id=item.id,
                    sku=item.sku,
                    name=item.name,
                    base_uom=item.base_uom,
                    current_stock=current_stock,
                    reorder_point=item.reorder_point,
                    maximum_stock=item.maximum_stock,
                    daily_consumption_velocity=daily_velocity,
                    days_until_stockout=days_left,
                    risk_level=risk_level,
                    recommended_reorder_qty=recommended_reorder,
                )
            )

        return results

    def detect_fleet_anomalies(
        self,
        company_id: uuid.UUID,
        db: Session = ...,
    ) -> list[FleetAnomalyAlert]:
        """
        Analyzes vehicle fleet operational metrics, flagging abnormal fuel efficiency
        or maintenance cost spikes that deviate significantly from the fleet baseline.
        """
        vehicles = db.scalars(
            select(models.Vehicle).where(
                models.Vehicle.company_id == company_id,
                models.Vehicle.is_active.is_(True),
            )
        ).all()

        alerts: list[FleetAnomalyAlert] = []
        if not vehicles:
            return alerts

        # Aggregate fleet-wide metrics
        fleet_fuel = db.execute(
            select(
                func.coalesce(func.sum(models.FuelTransaction.liters), Decimal("0.00")).label("total_liters"),
                func.coalesce(func.sum(models.FuelTransaction.total_amount), Decimal("0.00")).label("total_fuel_cost"),
            ).where(models.FuelTransaction.company_id == company_id)
        ).one()

        fleet_maint = db.scalar(
            select(func.coalesce(func.sum(models.MaintenanceWorkOrder.total_cost), Decimal("0.00"))).where(
                models.MaintenanceWorkOrder.company_id == company_id
            )
        )

        total_fleet_liters = Decimal(str(fleet_fuel.total_liters))
        total_fleet_maint = Decimal(str(fleet_maint or "0.00"))
        total_fleet_odometer = sum((v.current_odometer for v in vehicles), Decimal("0.00"))

        avg_fuel_rate = (
            total_fleet_liters / total_fleet_odometer if total_fleet_odometer > Decimal("0") else Decimal("0.30")
        )
        avg_maint_rate = (
            total_fleet_maint / total_fleet_odometer if total_fleet_odometer > Decimal("0") else Decimal("0.10")
        )

        for v in vehicles:
            v_liters = db.scalar(
                select(func.coalesce(func.sum(models.FuelTransaction.liters), Decimal("0.00"))).where(
                    models.FuelTransaction.vehicle_id == v.id
                )
            )
            v_maint = db.scalar(
                select(func.coalesce(func.sum(models.MaintenanceWorkOrder.total_cost), Decimal("0.00"))).where(
                    models.MaintenanceWorkOrder.vehicle_id == v.id
                )
            )

            v_distance = v.current_odometer if v.current_odometer > Decimal("100") else Decimal("100")
            v_fuel_rate = Decimal(str(v_liters or "0.00")) / v_distance
            v_maint_rate = Decimal(str(v_maint or "0.00")) / v_distance

            # Check Fuel Anomaly (> 30% above baseline)
            if avg_fuel_rate > Decimal("0.01") and v_fuel_rate > avg_fuel_rate * Decimal("1.30"):
                var_pct = Decimal(str(round(float((v_fuel_rate - avg_fuel_rate) / avg_fuel_rate) * 100, 1)))
                severity = "CRITICAL" if var_pct > 50 else "HIGH"
                alerts.append(
                    FleetAnomalyAlert(
                        vehicle_id=v.id,
                        license_plate=v.license_plate,
                        vehicle_type=v.vehicle_type,
                        anomaly_type="ABNORMAL_FUEL_CONSUMPTION",
                        metric_value=Decimal(str(round(float(v_fuel_rate), 4))),
                        fleet_baseline_value=Decimal(str(round(float(avg_fuel_rate), 4))),
                        variance_percentage=var_pct,
                        severity=severity,
                        suggested_action="Inspect fuel injection system and tire pressure; audit driver idling time.",
                    )
                )

            # Check Maintenance Anomaly (> 35% above baseline)
            if avg_maint_rate > Decimal("0.01") and v_maint_rate > avg_maint_rate * Decimal("1.35"):
                var_pct = Decimal(str(round(float((v_maint_rate - avg_maint_rate) / avg_maint_rate) * 100, 1)))
                severity = "CRITICAL" if var_pct > 60 else "MEDIUM"
                alerts.append(
                    FleetAnomalyAlert(
                        vehicle_id=v.id,
                        license_plate=v.license_plate,
                        vehicle_type=v.vehicle_type,
                        anomaly_type="MAINTENANCE_COST_SPIKE",
                        metric_value=Decimal(str(round(float(v_maint_rate), 4))),
                        fleet_baseline_value=Decimal(str(round(float(avg_maint_rate), 4))),
                        variance_percentage=var_pct,
                        severity=severity,
                        suggested_action="Audit maintenance work orders for recurring failure and component warranty coverage.",
                    )
                )

        return alerts

    def generate_restock_proposal(
        self,
        company_id: uuid.UUID,
        user_id: uuid.UUID | None,
        request: RestockProposalRequest,
        db: Session = ...,
    ) -> tuple[dict[str, Any], models.AIGovernanceLog]:
        """
        Generates a draft stock replenishment proposal and routes it through
        the SafetyBoundaryEngine with Human-In-The-Loop approval gates.
        """
        item = db.get(models.StockItem, request.stock_item_id)
        if not item or item.company_id != company_id:
            raise ValueError("Stock item not found or does not belong to active company")

        # Current stock
        curr_stock = db.scalar(
            select(func.coalesce(func.sum(models.StockLot.remaining_quantity), Decimal("0.00"))).where(
                models.StockLot.stock_item_id == item.id,
                models.StockLot.status == "active",
            )
        )
        current_stock = Decimal(str(curr_stock or "0.00"))

        # Latest unit cost from existing lots or baseline
        latest_cost = db.scalar(
            select(models.StockLot.unit_cost)
            .where(models.StockLot.stock_item_id == item.id)
            .order_by(models.StockLot.received_date.desc())
            .limit(1)
        )
        unit_cost = Decimal(str(latest_cost)) if latest_cost else Decimal("50.00")

        # Replenishment quantity
        if request.target_quantity:
            qty = request.target_quantity
        else:
            qty = max(
                item.maximum_stock - current_stock,
                item.reorder_point * Decimal("2.0"),
                Decimal("100.00"),
            )

        total_cost = Decimal(str(round(float(qty * unit_cost), 2)))

        warehouse_id = request.warehouse_id
        if not warehouse_id:
            wh = db.scalar(select(models.Warehouse).where(models.Warehouse.company_id == company_id).limit(1))
            warehouse_id = wh.id if wh else uuid.uuid4()

        proposal_dict = {
            "stock_item_id": str(item.id),
            "sku": item.sku,
            "name": item.name,
            "current_stock": float(current_stock),
            "warehouse_id": str(warehouse_id),
            "quantity": float(qty),
            "unit_cost": float(unit_cost),
            "total_cost": float(total_cost),
            "supplier_hint": request.supplier_hint or "Preferred Primary Supplier",
            "movement_type": "inbound",
            "reference": f"AI-RESTOCK-{item.sku}",
        }

        # Route through SafetyBoundaryEngine
        gov_log = ai_governance_engine.validate_proposal(
            company_id=company_id,
            agent_name="ai_supply_chain_forecaster",
            action_type="ADJUST_STOCK",
            proposal_payload=proposal_dict,
            confidence_score=Decimal("0.9200"),
            prompt=f"Automated restock order for SKU {item.sku} ({item.name})",
            user_id=user_id,
            db=db,
        )

        return proposal_dict, gov_log


ai_forecasting_service = AIForecastingService()
