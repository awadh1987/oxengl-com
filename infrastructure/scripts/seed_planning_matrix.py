#!/usr/bin/env python3
"""
OxenGL Planning Matrix Seeder Script
Seeds a valid Tier 1 Strategic Project Charter, Execution Matrix Tasks,
and Strategic Hazards for the active operational tenant (49edafb3-1b7e-40a7-8802-180af5c1e7d6).
"""

import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

# Ensure python path mapping detects the backend modules root directory
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from backend.database import SessionLocal
from backend.app.domains.planning.models import ProjectCharter, ExecutionTask, StrategicHazard
from sqlalchemy import text


def seed_planning_matrix():
    print("=== [STARTING] OxenGL Planning Matrix Seeding Process ===")
    session = SessionLocal()

    ACTIVE_TENANT_ID = uuid.UUID("49edafb3-1b7e-40a7-8802-180af5c1e7d6")

    try:
        # 1. Clean existing records for this tenant to ensure fresh idempotency
        session.execute(
            text("DELETE FROM project_charters WHERE tenant_id = :t_id"),
            {"t_id": ACTIVE_TENANT_ID}
        )
        session.commit()
        print(f"[1/4] Cleaned legacy planning records for tenant {ACTIVE_TENANT_ID}.")

        now = datetime.now(timezone.utc)
        start_date = now
        end_date = now + timedelta(days=180)

        # 2. Seed Tier 1 Strategic Project Charter
        charter_id = uuid.uuid4()
        charter = ProjectCharter(
            id=charter_id,
            tenant_id=ACTIVE_TENANT_ID,
            project_name="Phase 4: Cold-Chain Telemetry Radar & Strategic Expansion",
            manager_name="Eng. Tariq Al-Mansoor",
            start_date=start_date,
            end_date=end_date,
            total_budget=Decimal("1500000.00"),
            smart_goals=[
                {
                    "id": "sg-101",
                    "goal": "Deploy hardware-accelerated 60 FPS HTML5 radar tracking grid across regional fleet",
                    "target_date": (now + timedelta(days=60)).strftime("%Y-%m-%d"),
                    "status": "COMPLETED",
                },
                {
                    "id": "sg-102",
                    "goal": "Instrument real-time 15.00ms SLA telemetry alarms for AI Copilot vector similarity",
                    "target_date": (now + timedelta(days=90)).strftime("%Y-%m-%d"),
                    "status": "COMPLETED",
                },
                {
                    "id": "sg-103",
                    "goal": "Enforce strict double-entry ledger balance invariance across multi-tenant payroll cycles",
                    "target_date": (now + timedelta(days=120)).strftime("%Y-%m-%d"),
                    "status": "IN_PROGRESS",
                },
                {
                    "id": "sg-104",
                    "goal": "Integrate cold-chain IoT temperature alarms (+4.2°C critical threshold) into logistics pipeline",
                    "target_date": (now + timedelta(days=150)).strftime("%Y-%m-%d"),
                    "status": "ACTIVE",
                },
            ],
            kpis_json={
                "sla_latency_threshold_ms": 15.00,
                "cold_chain_breach_limit_celsius": 4.20,
                "on_time_dispatch_rate_pct": 99.4,
                "cost_efficiency_variance_ratio": 0.98,
                "fleet_utilization_target_pct": 94.0,
                "biometric_attendance_compliance_pct": 100.0,
            },
            scope_of_work_text=(
                "Comprehensive Tier 1 Strategic Master Plan orchestrating high-concurrency "
                "telemetry streaming, cold-chain temperature monitoring, double-entry financial ledger "
                "invariance guards, and AI Copilot vector similarity pipelines across active tenant infrastructure."
            ),
            status="ACTIVE",
            created_at=now,
            updated_at=now,
        )
        session.add(charter)
        session.flush()
        print(f"[2/4] Seeded Tier 1 Strategic Project Charter: '{charter.project_name}' (Budget: 1,500,000.00 SAR).")

        # 3. Seed Tier 2 Granular Execution Tasks
        task1_id = uuid.uuid4()
        task1 = ExecutionTask(
            id=task1_id,
            tenant_id=ACTIVE_TENANT_ID,
            charter_id=charter_id,
            task_name="Calibrate Cold-Chain Temperature Sensors & Onboard Units",
            phase="Execution",
            department="Fleet Operations",
            assigned_user_name="Eng. Tariq Al-Mansoor",
            priority="CRITICAL",
            status="IN_PROGRESS",
            planned_hours=Decimal("80.00"),
            task_cost=Decimal("45000.00"),
            materials_required=["Digital Thermal Probes", "CAN-Bus Translators", "Rugged IP67 Housings"],
            created_at=now,
            updated_at=now,
        )

        task2_id = uuid.uuid4()
        task2 = ExecutionTask(
            id=task2_id,
            tenant_id=ACTIVE_TENANT_ID,
            charter_id=charter_id,
            task_name="HNSW 1536-D Vector Index Provisioning & Latency Tuning",
            phase="Planning",
            department="Logistics",
            assigned_user_name="Dr. Sarah Jenkins",
            priority="HIGH",
            status="COMPLETED",
            planned_hours=Decimal("120.00"),
            task_cost=Decimal("75000.00"),
            materials_required=["PostgreSQL pgvector Extension", "OpenAI Embedding Pipeline", "Redis Memory Cache"],
            created_at=now,
            updated_at=now,
        )

        task3_id = uuid.uuid4()
        task3 = ExecutionTask(
            id=task3_id,
            tenant_id=ACTIVE_TENANT_ID,
            charter_id=charter_id,
            task_name="Automated Double-Entry Financial Ledger Guard Integration",
            phase="Execution",
            department="Finance",
            assigned_user_name="Abdullah Al-Ghamdi",
            priority="HIGH",
            status="COMPLETED",
            planned_hours=Decimal("60.00"),
            task_cost=Decimal("35000.00"),
            materials_required=["Chart of Accounts Schema", "Invariance Validation Decorators"],
            created_at=now,
            updated_at=now,
        )

        session.add_all([task1, task2, task3])
        session.flush()
        print(f"[3/4] Seeded 3 Tier 2 Execution Matrix Tasks across Fleet, Logistics, and Finance departments.")

        # 4. Seed Tier 3 Strategic Hazards
        hazard1 = StrategicHazard(
            id=uuid.uuid4(),
            tenant_id=ACTIVE_TENANT_ID,
            execution_task_id=task1_id,
            desired_outcome="Maintain cargo temperatures continuously at or below +4.2°C across desert corridors",
            potential_hazard_description="Auxiliary refrigeration alternator failure under extreme ambient heat (>50°C)",
            mitigation_status="IN_PROGRESS",
            mitigation_plan="Deploy dual-compressor automatic failover and 60 FPS flashing crimson alarm beacons to operations command center.",
            severity="CRITICAL",
            created_at=now,
            updated_at=now,
        )

        hazard2 = StrategicHazard(
            id=uuid.uuid4(),
            tenant_id=ACTIVE_TENANT_ID,
            execution_task_id=task2_id,
            desired_outcome="Ensure vector similarity search latency remains strictly below 15.00ms SLA",
            potential_hazard_description="Sequential vector scans causing query queue stalls during high-concurrency Copilot prompts",
            mitigation_status="MITIGATED",
            mitigation_plan="Provision HNSW index with m=16, ef_construction=64 and cache hot vector embeddings in Redis cache.",
            severity="HIGH",
            mitigated_at=now,
            created_at=now,
            updated_at=now,
        )

        session.add_all([hazard1, hazard2])
        session.commit()
        print(f"[4/4] Seeded 2 Tier 3 Strategic Risk Hazards with proactive mitigation plans.")

        print(f"\n✅ [SUCCESS] Planning matrix successfully provisioned for tenant {ACTIVE_TENANT_ID}!")
        print(f"   Charter ID: {charter_id}")
        print(f"   Project   : {charter.project_name}")
        print(f"   Tasks     : 3 items seeded")
        print(f"   Hazards   : 2 items seeded")

    except Exception as e:
        session.rollback()
        print(f"❌ [ERROR] Planning seeder failed: {e}")
        raise e
    finally:
        session.close()


if __name__ == "__main__":
    seed_planning_matrix()
