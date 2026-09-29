import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
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

class AgentPromptRequest(BaseModel):
    prompt: str
    current_route: str
    screen_context: Optional[Dict[str, Any]] = None
    thread_id: str  # Required to track the conversation/execution state

class AgentApprovalRequest(BaseModel):
    thread_id: str
    approved: bool

# Mock dependency for user context - replace with your actual JWT auth dependency
async def get_current_user_context():
    return {"user_id": "usr_123", "tenant_id": "tenant_abc", "role": "Owner"}

def _get_active_company_id(db: Session, tenant_id: Any) -> uuid.UUID:
    """Resolves an existing company ID or fallback to the primary registered tenant company."""
    try:
        cid = uuid.UUID(str(tenant_id))
        exists = db.execute(text("SELECT id FROM res_companies WHERE id = :cid"), {"cid": cid}).scalar()
        if exists:
            return cid
    except Exception:
        pass
    primary = db.execute(text("SELECT id FROM res_companies LIMIT 1")).scalar()
    return primary or uuid.uuid4()

@router.post("/interact")
async def process_agent_command(
    request: AgentPromptRequest, 
    current_user: dict = Depends(get_current_user_context)
):
    config = {"configurable": {"thread_id": request.thread_id}}
    
    # Initial state injection
    initial_state = {
        "user_prompt": request.prompt,
        "current_ui_route": request.current_route,
        "active_tenant_id": current_user["tenant_id"],
        "user_role": current_user["role"],
        "messages": []
    }
    
    # Run the graph until it hits the breakpoint (awaiting_approval)
    result = oxengl_agent.invoke(initial_state, config=config)
    
    return {
        "status": result.get("execution_status"),
        "draft": result.get("draft_payload"),
        "thread_id": request.thread_id,
        "message": result.get("message") or ("Action requires approval." if result.get("execution_status") == "awaiting_approval" else "Action processed.")
    }

@router.post("/execute")
async def approve_and_execute(
    request: AgentApprovalRequest,
    current_user: dict = Depends(get_current_user_context),
    db: Session = Depends(get_db)
):
    config = {"configurable": {"thread_id": request.thread_id}}
    
    # Check current state of the thread
    current_state = oxengl_agent.get_state(config)
    
    if not current_state.next or "execute" not in current_state.next:
        raise HTTPException(status_code=400, detail="No pending execution found for this thread.")
    
    if not request.approved:
        return {"status": "cancelled", "message": "Execution cancelled by user."}
    
    # Extract the drafted payload from the state before resuming
    payload = current_state.values.get("draft_payload")
    action_name = "unknown"
    
    if payload:
        action_name = payload.get("action")
        data = payload.get("data", {})
        tenant_id = current_user.get("tenant_id", "default_tenant")
        company_id = _get_active_company_id(db, tenant_id)
        
        print(f"[Dispatcher] Routing '{action_name}' for company {company_id}")
        
        # --- THE ERP DISPATCHER: LIVE SQLALCHEMY CRUD EXECUTIONS ---
        try:
            # 1. Finance Module: Balanced General Ledger Journal Entry
            if action_name in ["JournalVoucherSchema", "create_journal_voucher"]:
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
                
                # Debit Line (Expense)
                db.execute(text("""
                    INSERT INTO finance_journal_lines (id, tenant_id, entry_id, account_code, description, debit, credit)
                    VALUES (:id, :co_id, :entry_id, :acc, :desc, :amt, 0.00)
                """), {"id": uuid.uuid4(), "co_id": company_id, "entry_id": entry_id, "acc": f"5100-{category}", "desc": f"Debit: {desc}", "amt": amount})
                
                # Credit Line (Cash / Bank)
                db.execute(text("""
                    INSERT INTO finance_journal_lines (id, tenant_id, entry_id, account_code, description, debit, credit)
                    VALUES (:id, :co_id, :entry_id, '1010-CASH', :desc, 0.00, :amt)
                """), {"id": uuid.uuid4(), "co_id": company_id, "entry_id": entry_id, "desc": f"Credit: {desc}", "amt": amount})
                
                db.commit()

            # 2. Logistics & Fleet Module: Vehicle Dispatch Trip
            elif action_name == "FleetDispatchSchema":
                print(f"-> [Logistics Module] Executing Fleet Dispatch Insert: {data}")
                trip_num = f"TRIP-{uuid.uuid4().hex[:6].upper()}"
                truck_id = data.get("truck_id", "V-1001")
                priority = data.get("priority", "Standard")
                
                db.execute(text("""
                    INSERT INTO fleet_trips (id, company_id, trip_number, origin_location, destination_location, cargo_description, planned_weight_tons, status, notes, created_at, updated_at)
                    VALUES (:id, :company_id, :trip_number, :origin, :destination, :cargo, :weight, 'assigned', :notes, NOW(), NOW())
                """), {
                    "id": uuid.uuid4(),
                    "company_id": company_id,
                    "trip_number": trip_num,
                    "origin": "Central Logistics Hub",
                    "destination": data.get("destination", "Quarry Facility"),
                    "cargo": data.get("cargo_type", "Industrial Cargo"),
                    "weight": 25.0,
                    "notes": f"Truck ID: {truck_id} | Priority: {priority}"
                })
                db.commit()

            # 3. Inventory Module: Stock Transfer Movement
            elif action_name == "InventoryTransferSchema":
                print(f"-> [Inventory Module] Executing Stock Transfer Insert: {data}")
                wh_row = db.execute(text("SELECT id FROM warehouses LIMIT 1")).scalar()
                wh_id = wh_row or uuid.uuid4()
                qty = Decimal(str(data.get("quantity", 1.0)))
                unit_cost = Decimal("10.00")
                item_code = data.get("item_code", "GEN-SKU")
                src_wh = data.get("source_warehouse", "Origin Warehouse")
                dst_wh = data.get("target_warehouse", "Destination Warehouse")
                
                db.execute(text("""
                    INSERT INTO inventory_movements (id, tenant_id, company_id, movement_number, movement_type, warehouse_id, quantity, unit_cost, total_cost, reason, reference, status, is_posted, created_at, updated_at)
                    VALUES (:id, :co_id, :co_id, :mov_num, 'TRANSFER', :wh_id, :qty, :cost, :total_cost, :reason, :reference, 'COMPLETED', FALSE, NOW(), NOW())
                """), {
                    "id": uuid.uuid4(),
                    "co_id": company_id,
                    "mov_num": f"TRF-{uuid.uuid4().hex[:6].upper()}",
                    "wh_id": wh_id,
                    "qty": qty,
                    "cost": unit_cost,
                    "total_cost": qty * unit_cost,
                    "reason": f"Autonomous Stock Transfer for {item_code}",
                    "reference": f"{src_wh} -> {dst_wh}"
                })
                db.commit()

            # 4. Procurement & S2P Module: Purchase Order
            elif action_name == "PurchaseOrderSchema":
                print(f"-> [Procurement Module] Executing Purchase Order Insert: {data}")
                supplier_name = data.get("supplier_name", "Vendor Partner")
                
                partner_id = db.execute(
                    text("SELECT id FROM res_partners WHERE company_id = :cid AND LOWER(name) = LOWER(:name) LIMIT 1"),
                    {"cid": company_id, "name": supplier_name}
                ).scalar()
                
                if not partner_id:
                    partner_id = uuid.uuid4()
                    db.execute(text("""
                        INSERT INTO res_partners (id, company_id, name, partner_type, is_active, created_at, updated_at)
                        VALUES (:id, :company_id, :name, 'supplier', TRUE, NOW(), NOW())
                    """), {"id": partner_id, "company_id": company_id, "name": supplier_name})
                    db.flush()
                
                total_val = Decimal(str(data.get("total_estimated_value", 1000.0)))
                subtotal = (total_val / Decimal("1.15")).quantize(Decimal("0.0001"))
                tax_amt = total_val - subtotal
                
                db.execute(text("""
                    INSERT INTO purchase_orders (id, company_id, po_number, partner_id, order_date, status, currency, subtotal, tax_amount, total_amount, notes, created_at, updated_at)
                    VALUES (:id, :company_id, :po_num, :partner_id, NOW(), 'draft', 'SAR', :subtotal, :tax_amount, :total_amount, :notes, NOW(), NOW())
                """), {
                    "id": uuid.uuid4(),
                    "company_id": company_id,
                    "po_num": f"PO-{uuid.uuid4().hex[:6].upper()}",
                    "partner_id": partner_id,
                    "subtotal": subtotal,
                    "tax_amount": tax_amt,
                    "total_amount": total_val,
                    "notes": f"Items: {data.get('items', 'Procured goods')}"
                })
                db.commit()

            # 5. Sales & CRM Module: ZATCA Customer Invoice with Cryptographic Chaining
            elif action_name == "CustomerInvoiceSchema":
                print(f"-> [Sales & CRM Module] Executing Customer Invoice with ZATCA Phase 2 Chaining: {data}")
                from app.crud.sales import create_invoice
                inv_result = create_invoice(db, data, company_id=company_id)
                print(f"-> [ZATCA Chaining] Invoice {inv_result['invoice_number']} created with Hash: {inv_result['zatca']['invoice_hash'][:20]}... PIH: {inv_result['zatca']['previous_invoice_hash'][:20]}...")

            # 6. HR & Payroll Module: Employee Leave Log
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
                    
                    db.execute(text("""
                        INSERT INTO attendance_logs (id, tenant_id, employee_id, check_in, check_out, device_id)
                        VALUES (:id, :tenant_id, :employee_id, NOW(), NOW() + interval '1 day' * :days, :device_id)
                    """), {
                        "id": uuid.uuid4(),
                        "tenant_id": emp_tenant,
                        "employee_id": emp_uuid,
                        "days": days,
                        "device_id": f"LEAVE_APPROVED:{leave_type}"
                    })
                    db.commit()

            else:
                raise ValueError(f"Unrecognized AI action schema: {action_name}")

        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Database execution failed: {str(e)}")
    
    # Resume the graph to clear the execution node
    result = oxengl_agent.invoke(None, config=config)
    
    return {
        "status": "committed",
        "message": f"Action '{action_name}' successfully committed.",
        "executed_payload": payload
    }
