"""
ETL Background Worker and Replication Engine for Enterprise Analytics & BI (ADR-008).
Extracts transactional records (General Ledger, Fleet Fuel, Maintenance Work Orders),
aggregates balances and operational metrics, and idempotently upserts into flattened fact/summary tables.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert  # New import for PostgreSQL specific UPSERT

from backend.database import SessionLocal
from backend import models

logger = logging.getLogger(__name__)


class ETLWorker:
    """
    Asynchronous and synchronous replication engine extracting transactional core data
    into flattened analytical tables: ReportingLedgerSummary and FleetUtilizationFact.
    """

    def __init__(self, session_factory=SessionLocal):
        self.session_factory = session_factory

    def extract_ledger_summary(
        self,
        company_id: uuid.UUID | None = None,
        period: str | None = None,
        db: Session | None = None,
    ) -> int:
        """
        Extracts posted AccountMoveLine entries aggregated by tenant, period (YYYY-MM), and account.
        Upserts results into ReportingLedgerSummary using ON CONFLICT DO UPDATE.
        """
        def _execute_logic(session: Session) -> int:
            query = (
                select(
                    models.AccountMoveLine.company_id,
                    models.AccountMoveLine.account_id,
                    models.AccountAccount.code.label("account_code"),
                    models.AccountAccount.name.label("account_name"),
                    models.AccountAccount.internal_type.label("account_type"),
                    func.to_char(models.AccountMove.date, "YYYY-MM").label("period"),
                    func.extract("year", models.AccountMove.date).label("fiscal_year"),
                    func.extract("month", models.AccountMove.date).label("fiscal_month"),
                    func.coalesce(func.sum(models.AccountMoveLine.debit), Decimal("0")).label("total_debit"),
                    func.coalesce(func.sum(models.AccountMoveLine.credit), Decimal("0")).label("total_credit"),
                    func.count(models.AccountMoveLine.id).label("entry_count"),
                )
                .join(models.AccountMove, models.AccountMoveLine.move_id == models.AccountMove.id)
                .join(models.AccountAccount, models.AccountMoveLine.account_id == models.AccountAccount.id)
                .where(models.AccountMove.state == "posted")
            )

            if company_id is not None:
                query = query.where(models.AccountMoveLine.company_id == company_id)

            if period is not None:
                query = query.where(func.to_char(models.AccountMove.date, "YYYY-MM") == period)

            query = query.group_by(
                models.AccountMoveLine.company_id,
                models.AccountMoveLine.account_id,
                models.AccountAccount.code,
                models.AccountAccount.name,
                models.AccountAccount.internal_type,
                func.to_char(models.AccountMove.date, "YYYY-MM"),
                func.extract("year", models.AccountMove.date),
                func.extract("month", models.AccountMove.date),
            )

            results: list[Any] = session.execute(query).all()
            now = datetime.now(timezone.utc)
            upserted_count = 0

            if not results:
                return 0

            # Prepare data for bulk upsert
            values_to_upsert = []
            for row in results:
                t_debit = Decimal(str(row.total_debit))
                t_credit = Decimal(str(row.total_credit))
                balance = t_debit - t_credit

                values_to_upsert.append({
                    "company_id": row.company_id,
                    "period": row.period,
                    "fiscal_year": int(row.fiscal_year),
                    "fiscal_month": int(row.fiscal_month),
                    "account_id": row.account_id,
                    "account_code": row.account_code,
                    "account_name": row.account_name,
                    "account_type": row.account_type,
                    "total_debit": t_debit,
                    "total_credit": t_credit,
                    "balance": balance,
                    "entry_count": int(row.entry_count),
                    "last_extracted_at": now,
                })

            # Perform bulk upsert using ON CONFLICT DO UPDATE
            stmt = insert(models.ReportingLedgerSummary).values(values_to_upsert)
            on_conflict_stmt = stmt.on_conflict_do_update(
                index_elements=[
                    models.ReportingLedgerSummary.company_id,
                    models.ReportingLedgerSummary.period,
                    models.ReportingLedgerSummary.account_id,
                ],
                set_={
                    "fiscal_year": stmt.excluded.fiscal_year,
                    "fiscal_month": stmt.excluded.fiscal_month,
                    "account_code": stmt.excluded.account_code,
                    "account_name": stmt.excluded.account_name,
                    "account_type": stmt.excluded.account_type,
                    "total_debit": stmt.excluded.total_debit,
                    "total_credit": stmt.excluded.total_credit,
                    "balance": stmt.excluded.balance,
                    "entry_count": stmt.excluded.entry_count,
                    "last_extracted_at": stmt.excluded.last_extracted_at,
                },
            )
            result = session.execute(on_conflict_stmt)
            upserted_count = result.rowcount

            return upserted_count

        if db is not None:
            # If an external session is provided, just execute the logic
            # and let the caller commit/rollback.
            return _execute_logic(db)
        else:
            # If no external session, manage its own transaction.
            with self.session_factory() as sess:
                count = _execute_logic(sess)
                sess.commit()  # Commit here for standalone calls
                return count

    def extract_fleet_utilization(
        self,
        company_id: uuid.UUID | None = None,
        period: str | None = None,
        db: Session | None = None,
    ) -> int:
        """
        Extracts vehicle utilization, fuel consumption, and maintenance expenditures for a period.
        Upserts facts into FleetUtilizationFact using ON CONFLICT DO UPDATE.
        """
        target_period = period or datetime.now(timezone.utc).strftime("%Y-%m")

        def _execute_logic(session: Session) -> int:
            v_query = select(models.Vehicle)
            if company_id is not None:
                v_query = v_query.where(models.Vehicle.company_id == company_id)
            vehicles = session.scalars(v_query).all()

            now = datetime.now(timezone.utc)
            upserted_count = 0

            if not vehicles:
                return 0

            values_to_upsert = []

            for v in vehicles:
                # Fuel metrics
                fuel_q = (
                    select(
                        func.coalesce(func.sum(models.FuelTransaction.liters), Decimal("0")).label("total_liters"),
                        func.coalesce(func.sum(models.FuelTransaction.total_amount), Decimal("0")).label("total_cost"),
                        func.min(models.FuelTransaction.odometer_reading).label("min_odometer"),
                        func.max(models.FuelTransaction.odometer_reading).label("max_odometer"),
                    )
                    .where(
                        models.FuelTransaction.vehicle_id == v.id,
                        func.to_char(models.FuelTransaction.transaction_date, "YYYY-MM") == target_period,
                    )
                )
                fuel_res: Any = session.execute(fuel_q).one()
                total_liters = Decimal(str(fuel_res.total_liters))
                total_fuel_cost = Decimal(str(fuel_res.total_cost))

                # Maintenance metrics
                maint_q = (
                    select(
                        func.coalesce(func.sum(models.MaintenanceWorkOrder.total_cost), Decimal("0")).label("total_maint_cost"),
                        func.count(models.MaintenanceWorkOrder.id).label("wo_count"),
                        func.min(models.MaintenanceWorkOrder.odometer_reading).label("min_maint_odo"),
                        func.max(models.MaintenanceWorkOrder.odometer_reading).label("max_maint_odo"),
                    )
                    .where(
                        models.MaintenanceWorkOrder.vehicle_id == v.id,
                        func.to_char(func.coalesce(models.MaintenanceWorkOrder.completed_date, models.MaintenanceWorkOrder.scheduled_date), "YYYY-MM") == target_period,
                    )
                )
                maint_res: Any = session.execute(maint_q).one()
                total_maint_cost = Decimal(str(maint_res.total_maint_cost))
                wo_count = int(maint_res.wo_count)

                all_min = [x for x in (fuel_res.min_odometer, maint_res.min_maint_odo) if x is not None]
                all_max = [x for x in (fuel_res.max_odometer, maint_res.max_maint_odo) if x is not None]

                start_odo = Decimal(str(min(all_min))) if all_min else (v.current_odometer or Decimal("0"))
                end_odo = Decimal(str(max(all_max))) if all_max else (v.current_odometer or Decimal("0"))
                distance = max(Decimal("0"), end_odo - start_odo)
                op_hours = Decimal(str(round(float(distance) / 45.0 + wo_count * 2.5, 2)))

                values_to_upsert.append({
                    "company_id": v.company_id,
                    "period": target_period,
                    "vehicle_id": v.id,
                    "license_plate": v.license_plate,
                    "vehicle_type": v.vehicle_type,
                    "start_odometer": start_odo,
                    "end_odometer": end_odo,
                    "distance_traveled_km": distance,
                    "fuel_liters": total_liters,
                    "fuel_cost": total_fuel_cost,
                    "maintenance_cost": total_maint_cost,
                    "work_order_count": wo_count,
                    "operational_hours": op_hours,
                    "last_extracted_at": now,
                })

            # Perform bulk upsert using ON CONFLICT DO UPDATE
            stmt = insert(models.FleetUtilizationFact).values(values_to_upsert)
            on_conflict_stmt = stmt.on_conflict_do_update(
                index_elements=[
                    models.FleetUtilizationFact.company_id,
                    models.FleetUtilizationFact.period,
                    models.FleetUtilizationFact.vehicle_id,
                ],
                set_={
                    "license_plate": stmt.excluded.license_plate,
                    "vehicle_type": stmt.excluded.vehicle_type,
                    "start_odometer": stmt.excluded.start_odometer,
                    "end_odometer": stmt.excluded.end_odometer,
                    "distance_traveled_km": stmt.excluded.distance_traveled_km,
                    "fuel_liters": stmt.excluded.fuel_liters,
                    "fuel_cost": stmt.excluded.fuel_cost,
                    "maintenance_cost": stmt.excluded.maintenance_cost,
                    "work_order_count": stmt.excluded.work_order_count,
                    "operational_hours": stmt.excluded.operational_hours,
                    "last_extracted_at": stmt.excluded.last_extracted_at,
                },
            )
            result = session.execute(on_conflict_stmt)
            upserted_count = result.rowcount

            return upserted_count

        if db is not None:
            # If an external session is provided, just execute the logic
            # and let the caller commit/rollback.
            return _execute_logic(db)
        else:
            # If no external session, manage its own transaction.
            with self.session_factory() as sess:
                count = _execute_logic(sess)
                sess.commit()  # Commit here for standalone calls
                return count

    def run_etl_pipeline(
        self,
        company_id: uuid.UUID | None = None,
        period: str | None = None,
        db: Session | None = None,
    ) -> dict:
        """
        Runs both GL extraction and Fleet utilization extraction within a single transaction.
        Commits both or rolls back both.
        """
        target_period = period or datetime.now(timezone.utc).strftime("%Y-%m")
        ledger_count = 0
        fleet_count = 0
        status_message = "completed"
        error_details = None

        # Determine the session to use: provided or new
        # If db is provided, assume caller manages transaction.
        # If db is None, create a new session and manage its transaction.
        session_to_use = db if db is not None else self.session_factory()
        
        try:
            if db is None:
                # Use a context manager for a newly created session to ensure commit/rollback
                # and proper session closing.
                with session_to_use as sess:
                    logger.info(f"Starting ETL pipeline for company_id={company_id}, period={target_period} within a new transaction.")
                    ledger_count = self.extract_ledger_summary(company_id=company_id, period=target_period, db=sess)
                    fleet_count = self.extract_fleet_utilization(company_id=company_id, period=target_period, db=sess)
                    sess.commit()
                    logger.info(f"ETL pipeline transaction committed successfully for company_id={company_id}, period={target_period}.")
            else:
                # If an external session was provided, just use it.
                # The caller is responsible for commit/rollback.
                logger.info(f"Starting ETL pipeline for company_id={company_id}, period={target_period} using an external transaction.")
                ledger_count = self.extract_ledger_summary(company_id=company_id, period=target_period, db=session_to_use)
                fleet_count = self.extract_fleet_utilization(company_id=company_id, period=target_period, db=session_to_use)
                logger.info(f"ETL pipeline logic completed for company_id={company_id}, period={target_period}. External session will handle commit/rollback.")

        except Exception as e:
            if db is None:
                # If we opened the session, we should roll it back.
                session_to_use.rollback()
                logger.error(
                    f"ETL pipeline transaction rolled back due to an error for company_id={company_id}, period={target_period}.",
                    exc_info=True
                )
            else:
                # If an external session, just log the error; the caller is responsible for rollback.
                logger.error(
                    f"ETL pipeline failed within an external transaction for company_id={company_id}, period={target_period}.",
                    exc_info=True
                )
            status_message = "failed"
            error_details = str(e)
            # Re-raise the exception for broader error handling if needed, or
            # just return the error status as per the current design.
            # Here, we will just return the error details in the dict.

        return {
            "status": status_message,
            "message": f"ETL pipeline executed {'successfully' if status_message == 'completed' else 'with errors'} for period {target_period}",
            "period": target_period,
            "company_id": str(company_id) if company_id else "all",
            "ledger_records_extracted": ledger_count,
            "fleet_records_extracted": fleet_count,
            "extracted_at": datetime.now(timezone.utc),
            "error_details": error_details,
        }

    async def run_async_etl(
        self,
        company_id: uuid.UUID | None = None,
        period: str | None = None,
    ) -> dict:
        """Asynchronously executes the ETL replication pipeline in a separate thread."""
        # This will call the synchronous run_etl_pipeline, which now handles transactions properly.
        return await asyncio.to_thread(self.run_etl_pipeline, company_id, period)


etl_worker = ETLWorker()
