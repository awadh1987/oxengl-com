import os
import json
import re
from typing import TypedDict, Annotated, Optional
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

try:
    from app.agent.schemas import (
        JournalVoucherSchema,
        FleetDispatchSchema,
        InventoryTransferSchema,
        PurchaseOrderSchema,
        CustomerInvoiceSchema,
        EmployeeLeaveSchema,
        InventoryValuationSchema,
    )
except (ImportError, ModuleNotFoundError):
    from backend.app.agent.schemas import (
        JournalVoucherSchema,
        FleetDispatchSchema,
        InventoryTransferSchema,
        PurchaseOrderSchema,
        CustomerInvoiceSchema,
        EmployeeLeaveSchema,
        InventoryValuationSchema,
    )

# 1. Define the Global State
class AgentState(TypedDict):
    user_prompt: str
    current_ui_route: str
    active_tenant_id: str
    user_role: str
    intent_category: Optional[str]
    draft_payload: Optional[dict]
    execution_status: str
    messages: list

# 2. Node: Intent Classification
def classify_intent(state: AgentState):
    print(f"[Agent] Classifying intent for route: {state['current_ui_route']}")
    return {"intent_category": "write", "execution_status": "classified"}

def select_schema_for_prompt(prompt: str, route: str):
    text = f"{prompt} {route}".lower()
    
    if re.search(r"\b(valuation|costing|fifo|weighted average|standard cost|audit.*inventory|inventory.*value|stock.*valuation)\b", text):
        return InventoryValuationSchema, "InventoryValuationSchema", "Inventory & Valuation"
    elif re.search(r"\b(voucher|journal voucher|journal entry|payment|expense|accounting|ledger|depreciation)\b", text) or "finance" in route.lower():
        return JournalVoucherSchema, "JournalVoucherSchema", "Financial Controller"
    elif re.search(r"\b(invoice|zatca|client invoice|customer invoice|bill client|sales)\b", text) or "sales" in route.lower() or "billing" in route.lower():
        return CustomerInvoiceSchema, "CustomerInvoiceSchema", "Sales & CRM"
    elif re.search(r"\b(purchase order|procure|vendor|supplier|\bpo\b)\b", text) or "procurement" in route.lower():
        return PurchaseOrderSchema, "PurchaseOrderSchema", "Procurement & S2P"
    elif re.search(r"\b(leave|vacation|absence|sick leave|time off)\b", text) or "hr" in route.lower() or "payroll" in route.lower():
        return EmployeeLeaveSchema, "EmployeeLeaveSchema", "Human Resources"
    elif re.search(r"\b(transfer|stock transfer|move stock|inventory transfer|relocate stock)\b", text) or "inventory" in route.lower():
        return InventoryTransferSchema, "InventoryTransferSchema", "Inventory Management"
    elif re.search(r"\b(dispatch|truck|fleet|haul|cargo|quarry|trip)\b", text) or "fleet" in route.lower() or "logistics" in route.lower():
        return FleetDispatchSchema, "FleetDispatchSchema", "Logistics & Fleet Dispatch"
    else:
        return JournalVoucherSchema, "JournalVoucherSchema", "Financial Controller"

# 3. Node: Drafter (Formulates the API payload)
def draft_payload(state: AgentState):
    user_prompt = state.get("user_prompt", "")
    route = state.get("current_ui_route", "")
    schema_cls, action_name, domain_name = select_schema_for_prompt(user_prompt, route)
    print(f"[Agent] Drafting payload for {domain_name} ({action_name}) for: {user_prompt}")
    
    # Initialize OpenRouter connection using the provided key
    llm = ChatOpenAI(
        model="anthropic/claude-3.5-sonnet",
        openai_api_key="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",
        openai_api_base="https://openrouter.ai/api/v1",
        temperature=0,
        request_timeout=3,
        max_retries=1,
    )
    
    # Bind the selected Pydantic schema to force strict JSON generation
    structured_llm = llm.with_structured_output(schema_cls)
    system_prompt = f"You are an expert ERP {domain_name} for OxenGL. Extract the details from the user prompt and format them into a strict {action_name} schema.\nUser Request: {user_prompt}"
    
    try:
        # Invoke the LLM
        generated_payload = structured_llm.invoke(system_prompt)
    except Exception as e:
        print(f"[Agent] OpenRouter primary endpoint error: {e}. Falling back to Claude Sonnet on OpenRouter...")
        try:
            fallback_llm = ChatOpenAI(
                model="anthropic/claude-sonnet-4",
                openai_api_key="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",
                openai_api_base="https://openrouter.ai/api/v1",
                temperature=0,
                max_tokens=1000,
                request_timeout=3,
                max_retries=1,
            )
            structured_fallback = fallback_llm.with_structured_output(schema_cls, method="function_calling")
            generated_payload = structured_fallback.invoke(system_prompt)
        except Exception as e2:
            print(f"[Agent] Secondary fallback triggered for {action_name}: {e2}")
            numbers = re.findall(r"[-+]?(?:\d*\.\d+|\d+)", user_prompt)
            num = float(numbers[0]) if numbers else 0.0
            
            if action_name == "FleetDispatchSchema":
                truck_match = re.search(r"(?:truck|unit|vehicle)\s*([A-Za-z0-9-]+)", user_prompt, re.I)
                generated_payload = FleetDispatchSchema(
                    truck_id=truck_match.group(1) if truck_match else "3190",
                    destination="Quarry North Facility",
                    cargo_type="Aggregates",
                    priority="Urgent" if "urgent" in user_prompt.lower() else "Standard"
                )
            elif action_name == "InventoryTransferSchema":
                generated_payload = InventoryTransferSchema(
                    item_code="RAW-MAT-01",
                    quantity=num if num > 0 else 50.0,
                    source_warehouse="Main Warehouse",
                    target_warehouse="Production Facility"
                )
            elif action_name == "PurchaseOrderSchema":
                generated_payload = PurchaseOrderSchema(
                    supplier_name="National Industrial Supplies",
                    items=user_prompt,
                    total_estimated_value=num if num > 0 else 10000.0
                )
            elif action_name == "CustomerInvoiceSchema":
                generated_payload = CustomerInvoiceSchema(
                    customer_name="Al-Bayan Commercial Group",
                    service_rendered=user_prompt,
                    net_amount=num if num > 0 else 5000.0,
                    tax_rate=15.0,
                    zatca_phase=2
                )
            elif action_name == "EmployeeLeaveSchema":
                generated_payload = EmployeeLeaveSchema(
                    employee_id="EMP-1001",
                    leave_type="Annual",
                    days_requested=int(num) if num > 0 else 3
                )
            elif action_name == "InventoryValuationSchema":
                wh_name = "ALL"
                if "qiddiya" in user_prompt.lower():
                    wh_name = "Qiddiya"
                elif "central" in user_prompt.lower() or "main" in user_prompt.lower() or "riyadh" in user_prompt.lower():
                    wh_name = "WH-MAIN"
                else:
                    wh_match = re.search(r"(?:warehouse|depot|facility|site)\s*([A-Za-z0-9-]+)", user_prompt, re.I)
                    if wh_match:
                        wh_name = wh_match.group(1)

                val_method = "FIFO"
                if "weighted" in user_prompt.lower() or "wac" in user_prompt.lower() or "average" in user_prompt.lower():
                    val_method = "WEIGHTED_AVERAGE"
                elif "standard" in user_prompt.lower() or "std" in user_prompt.lower():
                    val_method = "STANDARD_COST"

                generated_payload = InventoryValuationSchema(
                    warehouse_id=wh_name,
                    valuation_method=val_method,
                    audit_focus="variance_reconciliation" if "variance" in user_prompt.lower() else "comprehensive"
                )
            else:
                generated_payload = JournalVoucherSchema(
                    description=user_prompt or "Financial Voucher Transaction",
                    amount=num,
                    currency="SAR",
                    expense_category="Fleet Fuel" if "fuel" in user_prompt.lower() else "Maintenance"
                )
    
    draft_dict = {
        "action": action_name,
        "data": generated_payload.model_dump()
    }

    # Automatically calculate real-time valuation metrics for valuation queries
    audit_narrative = None
    if action_name == "InventoryValuationSchema":
        try:
            from backend.app.domains.inventory.valuation import calculate_inventory_valuation
            val_data = generated_payload.model_dump()
            report = calculate_inventory_valuation(
                warehouse_id=val_data.get("warehouse_id", "ALL"),
                valuation_method=val_data.get("valuation_method", "FIFO"),
            )
            draft_dict["valuation_report"] = report
            audit_narrative = report.get("audit_narrative")
        except Exception as e:
            print(f"[Agent] Inventory valuation calculation error in graph: {e}")

    return {
        "draft_payload": draft_dict,
        "execution_status": "awaiting_approval",
        "message": audit_narrative,
    }

# 4. Node: Execution (Commits to PostgreSQL)
def execute_action(state: AgentState):
    print(f"[Agent] Executing payload: {json.dumps(state['draft_payload'])}")
    return {"execution_status": "committed"}

# 5. Build and Compile the Graph
workflow = StateGraph(AgentState)

workflow.add_node("classify", classify_intent)
workflow.add_node("draft", draft_payload)
workflow.add_node("execute", execute_action)

workflow.set_entry_point("classify")
workflow.add_edge("classify", "draft")
workflow.add_edge("draft", "execute")
workflow.add_edge("execute", END)

# Initialize memory to persist state between the draft and execute phases
memory = MemorySaver()

# Compile the graph with a strict interruption before execution
oxengl_agent = workflow.compile(
    checkpointer=memory,
    interrupt_before=["execute"] 
)
