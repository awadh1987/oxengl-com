"""
Tests for Multi-Warehouse Inventory Valuation and LangGraph Agent Engine Integration.
Verifies:
1. Multi-warehouse asset tracking and calculation across FIFO, WAC, and Standard Costing.
2. FastAPI endpoints /api/inventory/valuation/multi-warehouse and /api/inventory/valuation/calculate.
3. LangGraph execution engine autonomous operational prompt handling (e.g. Audit Qiddiya warehouse).
"""

import uuid
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SessionLocal
from backend.models import Warehouse, ResCompany
from backend.app.domains.inventory.valuation import (
    InventoryValuationCalculator,
    calculate_inventory_valuation,
)
from backend.app.agent.router import (
    process_agent_command,
    approve_and_execute,
    AgentPromptRequest,
    AgentApprovalRequest,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_inventory_valuation_calculator_multi_warehouse():
    """Verify calculator handles multi-warehouse FIFO, WAC, and Standard Costing."""
    with SessionLocal() as db:
        # 1. Audit Qiddiya warehouse specifically using FIFO
        qiddiya_fifo = InventoryValuationCalculator.calculate_valuation(
            db=db,
            warehouse_ref="Qiddiya",
            valuation_method="FIFO",
        )
        assert qiddiya_fifo.valuation_method == "FIFO"
        assert "Qiddiya" in qiddiya_fifo.warehouse_name
        assert qiddiya_fifo.total_valuation > 0
        assert qiddiya_fifo.total_quantity > 0
        assert len(qiddiya_fifo.breakdown_by_item) >= 3

        # Check FIFO layers exist on items
        first_item = qiddiya_fifo.breakdown_by_item[0]
        assert len(first_item.fifo_layers) > 0
        assert first_item.fifo_layers[0].unit_cost > 0

        # Method comparison check
        comparison = qiddiya_fifo.method_comparison
        assert comparison.fifo_valuation_sar > 0
        assert comparison.weighted_average_sar > 0
        assert comparison.standard_cost_sar > 0

        # 2. Audit using Weighted Average
        qiddiya_wac = InventoryValuationCalculator.calculate_valuation(
            db=db,
            warehouse_ref="Qiddiya",
            valuation_method="WEIGHTED_AVERAGE",
        )
        assert qiddiya_wac.valuation_method == "WEIGHTED_AVERAGE"
        assert qiddiya_wac.total_valuation == comparison.weighted_average_sar

        # 3. Consolidated Multi-Warehouse audit
        all_wh_report = InventoryValuationCalculator.calculate_valuation(
            db=db,
            warehouse_ref="ALL",
            valuation_method="FIFO",
        )
        assert all_wh_report.warehouses_audited >= 1
        assert len(all_wh_report.breakdown_by_warehouse) >= 1
        assert all_wh_report.total_valuation >= qiddiya_fifo.total_valuation


def test_fastapi_multi_warehouse_valuation_endpoints(client):
    """Verify GET and POST FastAPI endpoints return structured valuation reports."""
    # 1. GET /api/inventory/valuation/multi-warehouse
    response = client.get("/api/inventory/valuation/multi-warehouse?warehouse_id=Qiddiya&valuation_method=FIFO")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["valuation_method"] == "FIFO"
    assert "Qiddiya" in data["warehouse_name"]
    assert "breakdown_by_item" in data
    assert "method_comparison" in data
    assert "audit_narrative" in data

    # 2. POST /api/inventory/valuation/calculate
    calc_resp = client.post(
        "/api/inventory/valuation/calculate",
        json={"warehouse_id": "ALL", "valuation_method": "WEIGHTED_AVERAGE"}
    )
    assert calc_resp.status_code == 200, calc_resp.text
    calc_data = calc_resp.json()
    assert calc_data["valuation_method"] == "WEIGHTED_AVERAGE"
    assert calc_data["total_valuation"] > 0


@pytest.mark.asyncio
async def test_langgraph_agent_operational_audit_prompt():
    """Verify operational prompt triggers InventoryValuationSchema and executes autonomously."""
    thread_id = f"test-audit-{uuid.uuid4().hex[:8]}"

    # Step 1: User asks AI agent to audit Qiddiya warehouse valuation using FIFO
    prompt_req = AgentPromptRequest(
        prompt="Audit Qiddiya warehouse inventory valuation using FIFO",
        current_route="/operations/inventory",
        thread_id=thread_id,
    )
    user_context = {"user_id": "usr_test", "tenant_id": "tenant_test", "role": "Owner"}

    interact_res = await process_agent_command(prompt_req, current_user=user_context)
    assert interact_res["status"] == "awaiting_approval"
    draft = interact_res.get("draft") or {}
    assert draft.get("action") == "InventoryValuationSchema"

    # Pre-calculated valuation report attached
    assert "valuation_report" in draft
    val_report = draft["valuation_report"]
    assert "Qiddiya" in val_report["warehouse_name"]
    assert val_report["total_valuation"] > 0

    # Step 2: Approve and execute the audit
    approval_req = AgentApprovalRequest(thread_id=thread_id, approved=True)
    with SessionLocal() as db:
        exec_res = await approve_and_execute(approval_req, current_user=user_context, db=db)
        assert exec_res["status"] == "committed"
        assert "valuation_report" in exec_res
        assert "audit_narrative" in exec_res["valuation_report"]
        assert "FIFO" in exec_res["valuation_report"]["valuation_method"]
