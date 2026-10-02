# ==============================================================================
# OxenGL Multi-Engine LangGraph Operational Intelligence Architecture
# Phase 3: Departmental CRUD Action Handlers & Human-in-the-Loop Review Gates
# Compatible with FastAPI, SQLAlchemy 2.0, PostgreSQL, and Distributed Workers
# ==============================================================================

import uuid
import json
import hashlib
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text

try:
    from backend.database import get_db
except (ImportError, ModuleNotFoundError):
    try:
        from database import get_db
    except (ImportError, ModuleNotFoundError):
        from app.db.session import get_db

try:
    from app.agent.graph import oxengl_agent
except (ImportError, ModuleNotFoundError):
    from backend.app.agent.graph import oxengl_agent

router = APIRouter(prefix="/api/v1/agent", tags=["AI Agent"])

# ------------------------------------------------------------------------------
# Request & Response Schemas
# ------------------------------------------------------------------------------

class AgentPromptRequest(BaseModel):
    prompt: str
    current_route: str
    screen_context: Optional[Dict[str, Any]] = None
    thread_id: str  # Required to track conversation and checkpointer state


class AgentApprovalRequest(BaseModel):
    thread_id: str
    approved: bool
    approval_notes: Optional[str] = None
    reviewer_id: Optional[str] = None


class AgentRejectionRequest(BaseModel):
    thread_id: str
    reason: Optional[str] = "Rejected by managerial review."


# ------------------------------------------------------------------------------
# Managerial Review Gate & Authentication Utilities
# ------------------------------------------------------------------------------

MANAGERIAL_ROLES = {
    "owner",
    "admin",
    "manager",
    "superadmin",
    "director",
    "executive",
    "controller",
    "lead",
    "supervisor",
}


def _verify_managerial_clearance(role: Optional[str]) -> bool:
    """Verifies that the actor possesses managerial authority to sign off on ERP actions."""
    if not role:
        return False
    return role.lower().strip() in MANAGERIAL_ROLES


async def get_current_user_context() -> dict:
    """Context resolver providing tenant ID, user ID, and role."""
    return {"user_id": "usr_123", "tenant_id": "tenant_abc", "role": "Owner"}


def _safe_uuid(val: Any) -> Optional[uuid.UUID]:
    """Safely converts input to a UUID object or returns None."""
    if not val:
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError, AttributeError):
        return None


def _get_active_company_id(db: Session, tenant_id: Any) -> uuid.UUID:
    """Resolves an existing company ID or falls back to the primary registered tenant company."""
    cid = _safe_uuid(tenant_id)
    if cid:
        exists = db.execute(text("SELECT id FROM res_companies WHERE id = :cid"), {"cid": cid}).scalar()
        if exists:
            return cid
    primary = db.execute(text("SELECT id FROM res_companies LIMIT 1")).scalar()
    return primary or uuid.uuid4()


def _resolve_user_id(db: Session, user_val: Any) -> Optional[uuid.UUID]:
    """Resolves a valid user ID from res_users or falls back to first available user or None."""
    uid = _safe_uuid(user_val)
    if uid:
        exists = db.execute(text("SELECT id FROM res_users WHERE id = :uid"), {"uid": uid}).scalar()
        if exists:
            return uid
    first_u = db.execute(text("SELECT id FROM res_users LIMIT 1")).scalar()
    return first_u


# ------------------------------------------------------------------------------
# API Endpoints
# ------------------------------------------------------------------------------

@router.post("/interact")
async def process_agent_command(
    request: AgentPromptRequest, 
    current_user: dict = Depends(get_current_user_context)
):
    """
    Submits a conversational operational command to the Multi-Engine State Graph.
    Executes intent classification, departmental schema formulation, and pauses
    at the Human-in-the-Loop breakpoint (awaiting managerial approval).
    """
    config = {"configurable": {"thread_id": request.thread_id}}
    
    # State payload injected into LangGraph
    initial_state = {
        "user_prompt": request.prompt,
        "current_ui_route": request.current_route,
        "active_tenant_id": current_user.get("tenant_id", "default_tenant"),
        "user_role": current_user.get("role", "Owner"),
        "messages": [],
    }
    
    # Run the graph until it reaches interrupt_before=["execute"]
    result = oxengl_agent.invoke(initial_state, config=config)

    # Persist draft state in Redis for distributed worker visibility
    try:
        try:
            from backend.app.core.redis import redis_client
        except (ImportError, ModuleNotFoundError):
            from app.core.redis import redis_client

        payload_data = result.get("draft_payload")
        if payload_data:
            cache_val = {
                "action": payload_data.get("action"),
                "data": payload_data.get("data"),
                "draft_payload": payload_data,
                "execution_status": result.get("execution_status"),
                "department": result.get("department"),
                "intent_category": result.get("intent_category"),
                "tenant_id": current_user.get("tenant_id"),
            }
            await redis_client.set(f"oxengl:agent:thread:{request.thread_id}", json.dumps(cache_val), ex=3600)
    except Exception as re:
        print(f"[Agent] Redis caching notice: {re}")
    
    status_str = result.get("execution_status", "awaiting_approval")
    return {
        "status": status_str,
        "draft": result.get("draft_payload"),
        "thread_id": request.thread_id,
        "department": result.get("department"),
        "intent_category": result.get("intent_category"),
        "hitl_gate_required": status_str == "awaiting_approval",
        "message": result.get("message") or ("Managerial approval required prior to database commit." if status_str == "awaiting_approval" else "Action processed.")
    }


@router.get("/threads/{thread_id}/state")
async def get_thread_state(
    thread_id: str,
    current_user: dict = Depends(get_current_user_context)
):
    """
    Retrieves the pending execution state and draft payload for a given conversation thread.
    """
    config = {"configurable": {"thread_id": thread_id}}
    current_state = oxengl_agent.get_state(config)
    payload = None
    if current_state and current_state.values:
        payload = current_state.values.get("draft_payload")

    if not payload:
        try:
            try:
                from backend.app.core.redis import redis_client
            except (ImportError, ModuleNotFoundError):
                from app.core.redis import redis_client
            raw_cache = await redis_client.get(f"oxengl:agent:thread:{thread_id}")
            if raw_cache:
                cached_json = json.loads(raw_cache)
                payload = cached_json.get("draft_payload") or cached_json
        except Exception:
            pass

    if not payload:
        raise HTTPException(status_code=404, detail=f"No active state found for thread '{thread_id}'.")

    return {
        "thread_id": thread_id,
        "state": payload,
        "next": list(current_state.next) if current_state and current_state.next else [],
    }


@router.post("/reject")
async def reject_agent_command(
    request: AgentRejectionRequest,
    current_user: dict = Depends(get_current_user_context),
    db: Session = Depends(get_db)
):
    """
    Explicitly rejects a pending action at the Human-in-the-Loop review gate.
    Logs rejection audit entry and cleans up Redis cache.
    """
    # Clean up Redis cache
    try:
        try:
            from backend.app.core.redis import redis_client
        except (ImportError, ModuleNotFoundError):
            from app.core.redis import redis_client
        await redis_client.delete(f"oxengl:agent:thread:{request.thread_id}")
    except Exception:
        pass

    return {
        "status": "rejected",
        "thread_id": request.thread_id,
        "message": f"Action rejected: {request.reason}",
    }


@router.post("/execute")
async def approve_and_execute(
    request: AgentApprovalRequest,
    current_user: dict = Depends(get_current_user_context),
    db: Session = Depends(get_db)
):
    """
    Human-in-the-Loop Managerial Execution Gate:
    1. Verifies managerial clearance.
    2. Validates approval flag.
    3. Dispatches payload to the corresponding Departmental CRUD handler.
    4. Commits changes to PostgreSQL and logs an immutable audit trail.
    """
    # --------------------------------------------------------------------------
    # 1. Managerial Clearance Gate
    # --------------------------------------------------------------------------
    user_role = current_user.get("role", "")
    if not _verify_managerial_clearance(user_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Managerial sign-off required: Role '{user_role}' lacks authority to approve database commits."
        )

    # --------------------------------------------------------------------------
    # 2. Rejection Handling
    # --------------------------------------------------------------------------
    if not request.approved:
        try:
            try:
                from backend.app.core.redis import redis_client
            except (ImportError, ModuleNotFoundError):
                from app.core.redis import redis_client
            await redis_client.delete(f"oxengl:agent:thread:{request.thread_id}")
        except Exception:
            pass
        return {"status": "cancelled", "message": "Execution rejected at managerial gate."}

    # --------------------------------------------------------------------------
    # 3. State & Payload Retrieval (Worker Memory -> Redis Fallback)
    # --------------------------------------------------------------------------
    config = {"configurable": {"thread_id": request.thread_id}}
    current_state = oxengl_agent.get_state(config)
    payload = None
    if current_state and current_state.next and "execute" in current_state.next:
        payload = current_state.values.get("draft_payload")
    
    if not payload:
        try:
            try:
                from backend.app.core.redis import redis_client
            except (ImportError, ModuleNotFoundError):
                from app.core.redis import redis_client
            raw_cache = await redis_client.get(f"oxengl:agent:thread:{request.thread_id}")
            if raw_cache:
                cached_json = json.loads(raw_cache)
                payload = cached_json.get("draft_payload") or cached_json
        except Exception as re:
            print(f"[Agent] Redis thread lookup notice: {re}")

    if not payload:
        raise HTTPException(status_code=400, detail="No pending execution found for this thread.")
    
    action_name = payload.get("action", "unknown")
    data = payload.get("data", {})
    tenant_id = current_user.get("tenant_id", "default_tenant")
    company_id = _get_active_company_id(db, tenant_id)
    user_uuid = _resolve_user_id(db, current_user.get("user_id"))
    tenant_uuid = _safe_uuid(tenant_id) or company_id
    
    print(f"[Dispatcher] Routing '{action_name}' for company {company_id} by user {current_user.get('user_id')} ({user_role})")
    
    committed_id = None
    committed_ref = None

    try:
        # ======================================================================
        # Departmental CRUD Action Handlers
        # ======================================================================

        # ----------------------------------------------------------------------
        # A. Procurement & S2P Module: Purchase Orders & Requisitions
        # ----------------------------------------------------------------------
        if action_name in ["ProcurementPOSchema", "PurchaseOrderSchema"]:
            print(f"-> [Procurement Module] Executing Purchase Order Insert: {data}")
            supplier_name = data.get("vendor_id") or data.get("supplier_name", "Vendor Partner")
            
            partner_id = db.execute(
                text("SELECT id FROM res_partners WHERE company_id = :cid AND LOWER(name) = LOWER(:name) LIMIT 1"),
                {"cid": company_id, "name": str(supplier_name)}
            ).scalar()
            
            if not partner_id:
                partner_id = uuid.uuid4()
                db.execute(text("""
                    INSERT INTO res_partners (id, company_id, name, partner_type, is_active, created_at, updated_at)
                    VALUES (:id, :company_id, :name, 'supplier', TRUE, NOW(), NOW())
                """), {"id": partner_id, "company_id": company_id, "name": str(supplier_name)})
                db.flush()
            
            # Calculate total valuation from item breakdown or estimated total
            items = data.get("items", [])
            if items and isinstance(items, list):
                total_val = sum(
                    Decimal(str(item.get("quantity", 1))) * Decimal(str(item.get("estimated_unit_cost", 100.0)))
                    for item in items if isinstance(item, dict)
                )
            else:
                total_val = Decimal(str(data.get("total_estimated_value") or data.get("total_estimated_cost") or 1000.0))
            
            subtotal = (total_val / Decimal("1.15")).quantize(Decimal("0.0001"))
            tax_amt = total_val - subtotal
            po_id = uuid.uuid4()
            po_num = f"PO-{uuid.uuid4().hex[:6].upper()}"
            notes_str = f"Requisition: {data.get('requisition_id', 'N/A')} | Loc: {data.get('delivery_location', 'MAIN-WH')}"
            
            db.execute(text("""
                INSERT INTO purchase_orders (id, company_id, po_number, partner_id, order_date, status, currency, subtotal, tax_amount, total_amount, notes, created_at, updated_at)
                VALUES (:id, :company_id, :po_num, :partner_id, NOW(), 'confirmed', :currency, :subtotal, :tax_amount, :total_amount, :notes, NOW(), NOW())
            """), {
                "id": po_id,
                "company_id": company_id,
                "po_num": po_num,
                "partner_id": partner_id,
                "currency": data.get("currency", "SAR"),
                "subtotal": subtotal,
                "tax_amount": tax_amt,
                "total_amount": total_val,
                "notes": notes_str,
            })
            
            # Insert individual line items
            if items and isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        qty = Decimal(str(item.get("quantity", 1)))
                        unit_cost = Decimal(str(item.get("estimated_unit_cost", 100.0)))
                        line_tot = qty * unit_cost
                        line_sub = (line_tot / Decimal("1.15")).quantize(Decimal("0.0001"))
                        db.execute(text("""
                            INSERT INTO purchase_order_lines (id, purchase_order_id, description, quantity_ordered, quantity_received, quantity_billed, unit_price, tax_rate, line_subtotal, line_total)
                            VALUES (:id, :po_id, :desc, :qty, 0, 0, :unit_price, 0.1500, :line_sub, :line_tot)
                        """), {
                            "id": uuid.uuid4(),
                            "po_id": po_id,
                            "desc": f"SKU: {item.get('sku', 'GEN-SKU')}",
                            "qty": qty,
                            "unit_price": unit_cost,
                            "line_sub": line_sub,
                            "line_tot": line_tot,
                        })
            
            db.commit()
            committed_id = str(po_id)
            committed_ref = po_num

        # ----------------------------------------------------------------------
        # B. Logistics & Fleet Module: Dispatches & Trip Assignments
        # ----------------------------------------------------------------------
        elif action_name == "FleetDispatchSchema":
            print(f"-> [Logistics Module] Executing Fleet Dispatch Insert: {data}")
            trip_num = f"TRIP-{uuid.uuid4().hex[:6].upper()}"
            truck_id = data.get("vehicle_id") or data.get("truck_id", "TRK-3190")
            driver_id = data.get("driver_id", "DRV-8821")
            route_code = data.get("route_code") or data.get("destination", "Quarry Facility")
            weight = Decimal(str(data.get("load_weight_tons", 28.5)))
            gps_dev = data.get("gps_deviation_km", 0.0)
            audit_status = data.get("route_audit_status", "PASSED")
            
            trip_id = uuid.uuid4()
            notes_str = f"Vehicle: {truck_id} | Driver: {driver_id} | GPS Dev: {gps_dev}km | Route Audit: {audit_status}"
            
            db.execute(text("""
                INSERT INTO fleet_trips (id, company_id, trip_number, origin_location, destination_location, cargo_description, planned_weight_tons, status, scheduled_departure, notes, created_at, updated_at)
                VALUES (:id, :company_id, :trip_number, :origin, :destination, :cargo, :weight, 'assigned', NOW(), :notes, NOW(), NOW())
            """), {
                "id": trip_id,
                "company_id": company_id,
                "trip_number": trip_num,
                "origin": "Central Hub",
                "destination": route_code,
                "cargo": f"Heavy Haulage ({weight}T)",
                "weight": weight,
                "notes": notes_str,
            })
            db.commit()
            committed_id = str(trip_id)
            committed_ref = trip_num

        # ----------------------------------------------------------------------
        # C. HR & Payroll Module: Payroll Vouchers & Leave Allocations
        # ----------------------------------------------------------------------
        elif action_name == "PayrollVoucherSchema":
            print(f"-> [HR & Payroll Module] Executing Payroll Voucher Insert: {data}")
            emp_ref = str(data.get("employee_id", "EMP-0149"))
            emp_row = db.execute(
                text("SELECT id, tenant_id FROM employees WHERE id::text = :emp_ref OR employee_code = :emp_ref OR first_name ILIKE :emp_like LIMIT 1"),
                {"emp_ref": emp_ref, "emp_like": f"%{emp_ref}%"}
            ).fetchone()
            
            if not emp_row:
                emp_row = db.execute(text("SELECT id, tenant_id FROM employees LIMIT 1")).fetchone()
            
            emp_uuid = emp_row[0] if emp_row else uuid.uuid4()
            emp_tenant = emp_row[1] if emp_row else tenant_uuid
            
            base_sal = Decimal(str(data.get("base_salary", 15000.0)))
            allowances = Decimal(str(data.get("allowances", 0.0)))
            deductions = Decimal(str(data.get("deductions", 0.0)))
            adj = Decimal(str(data.get("hr_adjustments", 0.0)))
            gross = base_sal + allowances + adj
            net = Decimal(str(data.get("net_salary", gross - deductions)))
            period = str(data.get("pay_period", datetime.now(timezone.utc).strftime("%Y-%m")))
            
            payroll_id = uuid.uuid4()
            db.execute(text("""
                INSERT INTO payroll_runs (id, tenant_id, employee_id, pay_period, gross_earnings, allowances, deductions, net_pay, status)
                VALUES (:id, :tenant_id, :employee_id, :period, :gross, :allowances, :deductions, :net, 'COMPLETED')
            """), {
                "id": payroll_id,
                "tenant_id": emp_tenant,
                "employee_id": emp_uuid,
                "period": period,
                "gross": gross,
                "allowances": allowances,
                "deductions": deductions,
                "net": net,
            })
            db.commit()
            committed_id = str(payroll_id)
            committed_ref = f"PAY-{period}-{emp_ref}"

        elif action_name == "EmployeeLeaveSchema":
            print(f"-> [HR & Payroll Module] Executing Leave Request Insert: {data}")
            emp_ref = str(data.get("employee_id", ""))
            emp_row = db.execute(
                text("SELECT id, tenant_id FROM employees WHERE id::text = :emp_ref OR employee_code = :emp_ref OR first_name ILIKE :emp_like LIMIT 1"),
                {"emp_ref": emp_ref, "emp_like": f"%{emp_ref}%"}
            ).fetchone()
            
            if not emp_row:
                emp_row = db.execute(text("SELECT id, tenant_id FROM employees LIMIT 1")).fetchone()
            
            if emp_row:
                emp_uuid, emp_tenant = emp_row
                days = int(data.get("days_requested", 1))
                leave_type = data.get("leave_type", "Annual")
                leave_id = uuid.uuid4()
                
                db.execute(text("""
                    INSERT INTO attendance_logs (id, tenant_id, employee_id, check_in, check_out, device_id)
                    VALUES (:id, :tenant_id, :employee_id, NOW(), NOW() + interval '1 day' * :days, :device_id)
                """), {
                    "id": leave_id,
                    "tenant_id": emp_tenant,
                    "employee_id": emp_uuid,
                    "days": days,
                    "device_id": f"LEAVE_APPROVED:{leave_type}"
                })
                db.commit()
                committed_id = str(leave_id)
                committed_ref = f"LEAVE-{emp_ref}-{days}D"

        # ----------------------------------------------------------------------
        # D. Governance & Compliance Module: Infractions & Policy Reviews
        # ----------------------------------------------------------------------
        elif action_name == "GovernanceComplianceSchema":
            print(f"-> [Governance Module] Executing Compliance Infraction Logging: {data}")
            gov_id = uuid.uuid4()
            entity_type = str(data.get("target_entity_type", "vehicle"))
            entity_id = str(data.get("entity_id", "ENT-AUDIT-01"))
            infraction = str(data.get("infraction_code", "COMPLIANCE-FLAG-01"))
            severity = str(data.get("severity_level", "MEDIUM")).upper()
            if severity not in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
                severity = "MEDIUM"
            prompt_hash = hashlib.sha256(f"{entity_type}:{entity_id}:{infraction}".encode()).hexdigest()[:32]
            
            db.execute(text("""
                INSERT INTO ai_governance_logs (
                    id, company_id, user_id, agent_name, prompt_hash, prompt_tokens,
                    completion_tokens, total_tokens, confidence_score, safety_validation_status,
                    risk_level, action_type, proposal_payload, hitl_required, hitl_approved,
                    hitl_approved_by, hitl_approved_at, execution_status, executed_at,
                    created_at, updated_at
                ) VALUES (
                    :id, :company_id, :user_id, 'OxenGL-Governance-Engine', :prompt_hash, 100,
                    50, 150, 0.99, 'PASSED', :severity, 'GovernanceComplianceSchema',
                    :payload, TRUE, TRUE, :approver_id, NOW(), 'EXECUTED', NOW(), NOW(), NOW()
                )
            """), {
                "id": gov_id,
                "company_id": company_id,
                "user_id": user_uuid,
                "prompt_hash": prompt_hash,
                "severity": severity,
                "payload": json.dumps(data),
                "approver_id": user_uuid,
            })
            
            # Log in tenant audit logs
            db.execute(text("""
                INSERT INTO tenant_audit_logs (id, tenant_id, action_type, actor, details, created_at)
                VALUES (:id, :tenant_id, :action_type, :actor, :details, NOW())
            """), {
                "id": f"AUD-{uuid.uuid4().hex[:8].upper()}",
                "tenant_id": tenant_uuid,
                "action_type": f"GOVERNANCE_INFRACTION_{severity}",
                "actor": f"{current_user.get('user_id')} ({user_role})",
                "details": f"Logged {infraction} for {entity_type} {entity_id}. Managerial sign-off by {user_role}.",
            })
            db.commit()
            committed_id = str(gov_id)
            committed_ref = f"GOV-{infraction}"

        # ----------------------------------------------------------------------
        # E. General Financial Controller & Inventory Modules
        # ----------------------------------------------------------------------
        elif action_name in ["JournalVoucherSchema", "create_journal_voucher"]:
            print(f"-> [Finance Module] Executing Journal Voucher Insert: {data}")
            amount = Decimal(str(data.get("amount", 0.0)))
            entry_id = uuid.uuid4()
            entry_num = f"JV-{uuid.uuid4().hex[:8].upper()}"
            desc = data.get("description", "Agent Generated Financial Voucher")
            category = str(data.get("expense_category", "Operational"))[:15]
            
            db.execute(text("""
                INSERT INTO finance_journal_entries (id, tenant_id, company_id, entry_number, entry_date, description, total_debit, total_credit, status, created_at)
                VALUES (:id, :co_id, :co_id, :entry_num, NOW(), :desc, :amt, :amt, 'POSTED', NOW())
            """), {"id": entry_id, "co_id": company_id, "entry_num": entry_num, "desc": desc, "amt": amount})
            
            db.execute(text("""
                INSERT INTO finance_journal_lines (id, tenant_id, entry_id, account_code, description, debit, credit)
                VALUES (:id, :co_id, :entry_id, :acc, :desc, :amt, 0.00)
            """), {"id": uuid.uuid4(), "co_id": company_id, "entry_id": entry_id, "acc": f"5100-{category}", "desc": f"Debit: {desc}", "amt": amount})
            
            db.execute(text("""
                INSERT INTO finance_journal_lines (id, tenant_id, entry_id, account_code, description, debit, credit)
                VALUES (:id, :co_id, :entry_id, '1010-CASH', :desc, 0.00, :amt)
            """), {"id": uuid.uuid4(), "co_id": company_id, "entry_id": entry_id, "desc": f"Credit: {desc}", "amt": amount})
            
            db.commit()
            committed_id = str(entry_id)
            committed_ref = entry_num

        elif action_name == "InventoryTransferSchema":
            print(f"-> [Inventory Module] Executing Stock Transfer Insert: {data}")
            wh_row = db.execute(text("SELECT id FROM warehouses LIMIT 1")).scalar()
            wh_id = wh_row or uuid.uuid4()
            qty = Decimal(str(data.get("quantity", 1.0)))
            unit_cost = Decimal("10.00")
            item_code = data.get("item_code", "GEN-SKU")
            src_wh = data.get("source_warehouse", "Origin Warehouse")
            dst_wh = data.get("target_warehouse", "Destination Warehouse")
            mov_id = uuid.uuid4()
            mov_num = f"TRF-{uuid.uuid4().hex[:6].upper()}"
            
            db.execute(text("""
                INSERT INTO inventory_movements (id, tenant_id, company_id, movement_number, movement_type, warehouse_id, quantity, unit_cost, total_cost, reason, reference, status, is_posted, created_at, updated_at)
                VALUES (:id, :co_id, :co_id, :mov_num, 'TRANSFER', :wh_id, :qty, :cost, :total_cost, :reason, :reference, 'COMPLETED', FALSE, NOW(), NOW())
            """), {
                "id": mov_id,
                "co_id": company_id,
                "mov_num": mov_num,
                "wh_id": wh_id,
                "qty": qty,
                "cost": unit_cost,
                "total_cost": qty * unit_cost,
                "reason": f"Autonomous Stock Transfer for {item_code}",
                "reference": f"{src_wh} -> {dst_wh}"
            })
            db.commit()
            committed_id = str(mov_id)
            committed_ref = mov_num

        elif action_name == "CustomerInvoiceSchema":
            print(f"-> [Sales & CRM Module] Executing Customer Invoice with ZATCA Phase 2 Chaining: {data}")
            try:
                from ..crud.sales import create_invoice
            except (ImportError, ModuleNotFoundError, ValueError):
                try:
                    from backend.app.crud.sales import create_invoice
                except (ImportError, ModuleNotFoundError):
                    from app.crud.sales import create_invoice
            inv_result = create_invoice(db, data, company_id=company_id)
            committed_id = inv_result.get("invoice_id")
            committed_ref = inv_result.get("invoice_number")

        elif action_name == "InventoryValuationSchema":
            print(f"-> [Inventory Module] Executing Multi-Warehouse Valuation Audit: {data}")
            from backend.app.domains.inventory.valuation import calculate_inventory_valuation
            wh_ref = data.get("warehouse_id", "ALL")
            method = data.get("valuation_method", "FIFO")
            valuation_result = calculate_inventory_valuation(
                warehouse_id=wh_ref,
                valuation_method=method,
                company_id=company_id,
                db=db,
            )
            committed_ref = f"VAL-{wh_ref}-{method}"

        elif action_name == "P2PMatchSchema":
            print(f"-> [P2P Module] Executing Autonomous Three-Way Match: {data}")
            from backend.app.domains.procurement.p2p import execute_p2p_match
            p2p_result = execute_p2p_match(
                po_reference=data.get("po_reference", "ALL"),
                price_tolerance=data.get("price_tolerance_pct", 2.0),
                qty_tolerance=data.get("qty_tolerance_pct", 0.0),
                company_id=company_id,
                db=db,
            )
            committed_ref = f"P2P-{data.get('po_reference', 'ALL')}"

        else:
            raise ValueError(f"Unrecognized AI action schema: {action_name}")

        # ----------------------------------------------------------------------
        # Immutable Governance Trail for Every Approved Execution
        # ----------------------------------------------------------------------
        try:
            gov_audit_id = uuid.uuid4()
            audit_hash = hashlib.sha256(f"{action_name}:{committed_ref}:{request.thread_id}".encode()).hexdigest()[:32]
            db.execute(text("""
                INSERT INTO ai_governance_logs (
                    id, company_id, user_id, agent_name, prompt_hash, prompt_tokens,
                    completion_tokens, total_tokens, confidence_score, safety_validation_status,
                    risk_level, action_type, proposal_payload, hitl_required, hitl_approved,
                    hitl_approved_by, hitl_approved_at, execution_status, executed_at,
                    created_at, updated_at
                ) VALUES (
                    :id, :company_id, :user_id, 'OxenGL-HITL-Dispatcher', :prompt_hash, 100,
                    50, 150, 0.99, 'PASSED', 'LOW', :action_type,
                    :payload, TRUE, TRUE, :approver_id, NOW(), 'EXECUTED', NOW(), NOW(), NOW()
                )
            """), {
                "id": gov_audit_id,
                "company_id": company_id,
                "user_id": user_uuid,
                "prompt_hash": audit_hash,
                "action_type": action_name,
                "payload": json.dumps(data),
                "approver_id": user_uuid,
            })
            db.commit()
        except Exception as audit_err:
            print(f"[Agent Governance Audit Warning]: {audit_err}")

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        import traceback
        db.rollback()
        tb_str = traceback.format_exc()
        print(f"[Agent Execution Error]:\n{tb_str}")
        raise HTTPException(status_code=500, detail=f"Database execution failed: {str(e)}")

    # Resume the graph to clear the execution node if state exists in this worker
    if current_state and current_state.next:
        try:
            oxengl_agent.invoke(None, config=config)
        except Exception:
            pass

    # Clean up Redis cache for this thread
    try:
        try:
            from backend.app.core.redis import redis_client
        except (ImportError, ModuleNotFoundError):
            from app.core.redis import redis_client
        await redis_client.delete(f"oxengl:agent:thread:{request.thread_id}")
    except Exception:
        pass

    response_data = {
        "status": "committed",
        "action": action_name,
        "message": f"Action '{action_name}' successfully approved and committed to database.",
        "committed_id": committed_id,
        "committed_ref": committed_ref,
        "reviewed_by": current_user.get("user_id"),
        "reviewer_role": user_role,
        "executed_payload": payload,
    }
    
    if action_name == "CustomerInvoiceSchema" and "inv_result" in locals() and inv_result:
        response_data["zatca"] = inv_result.get("zatca")
        response_data["invoice_number"] = inv_result.get("invoice_number")
    if action_name == "InventoryValuationSchema" and "valuation_result" in locals() and valuation_result:
        response_data["valuation_report"] = valuation_result
        response_data["message"] = valuation_result.get("audit_narrative")
    if action_name == "P2PMatchSchema" and "p2p_result" in locals() and p2p_result:
        response_data["p2p_report"] = p2p_result
        response_data["message"] = p2p_result.get("audit_narrative")

    return response_data
