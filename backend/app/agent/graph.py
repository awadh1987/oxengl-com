# ==============================================================================
# OxenGL Multi-Engine LangGraph Operational Intelligence Architecture
# Phase 2: Unified State Graph, Dynamic Routing, and Checkpointer Synchronization
# Compatible with LangGraph, LangChain, Pyright, and FastAPI Asynchronous Mesh
# ==============================================================================

import os
import re
from typing import Any, Optional, TypedDict

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

try:
    from app.agent.schemas import (
        ProcurementPOSchema,
        PurchaseOrderSchema,
        FleetDispatchSchema,
        PayrollVoucherSchema,
        EmployeeLeaveSchema,
        GovernanceComplianceSchema,
        JournalVoucherSchema,
        CustomerInvoiceSchema,
        InventoryTransferSchema,
        InventoryValuationSchema,
        P2PMatchSchema,
    )
except (ImportError, ModuleNotFoundError):
    from backend.app.agent.schemas import (
        ProcurementPOSchema,
        PurchaseOrderSchema,
        FleetDispatchSchema,
        PayrollVoucherSchema,
        EmployeeLeaveSchema,
        GovernanceComplianceSchema,
        JournalVoucherSchema,
        CustomerInvoiceSchema,
        InventoryTransferSchema,
        InventoryValuationSchema,
        P2PMatchSchema,
    )


# ==============================================================================
# 1. Unified ERP Graph State Definition
# ==============================================================================

class ERPGraphState(TypedDict):
    """
    Unified distributed state schema for the Multi-Engine LangGraph system.
    Persisted across execution turns and checkpointer workers.
    """
    user_prompt: str
    current_ui_route: str
    active_tenant_id: str
    user_role: str
    requester_user_id: Optional[str]
    intent_category: Optional[str]        # 'procurement', 'fleet', 'payroll', 'governance', 'general'
    department: Optional[str]             # 'PROCUREMENT_S2P', 'FLEET_OPS', 'HR_PAYROLL', 'GOV_COMPLIANCE', 'FIN_CONTROLLER'
    draft_payload: Optional[dict]         # Departmental validated payload dictionary
    validation_status: Optional[str]      # 'VALIDATED', 'AWAITING_APPROVAL', 'ERROR'
    approval_status: Optional[str]        # 'pending', 'approved', or 'rejected'
    approved_by: Optional[str]
    approved_at: Optional[str]
    execution_status: str                 # 'classified', 'drafted', 'awaiting_approval', 'committed', 'rejected'
    messages: list
    message: Optional[str]                # Audit narrative or status summary
    error_message: Optional[str]


# Backward compatibility alias for legacy router imports
AgentState = ERPGraphState


# ==============================================================================
# 2. Checkpointer Initialization (RedisSaver with MemorySaver Fallback)
# ==============================================================================

def get_checkpointer():
    """
    Configures thread-safe checkpointer synchronization supporting RedisSaver
    with automatic fallback to MemorySaver if Redis or langgraph_checkpoint_redis is unavailable.
    """
    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    try:
        from langgraph_checkpoint_redis import RedisSaver
        print("[Agent Checkpointer] Initializing distributed RedisSaver checkpointer.")
        return RedisSaver.from_conn_info(url=redis_url)
    except Exception:
        try:
            from langgraph.checkpoint.redis import RedisSaver
            print("[Agent Checkpointer] Initializing LangGraph RedisSaver checkpointer.")
            return RedisSaver(url=redis_url)
        except Exception:
            print("[Agent Checkpointer] Using thread-safe MemorySaver fallback checkpointer.")
            return MemorySaver()


# ==============================================================================
# 3. Intent Classification Node & Routing Edge
# ==============================================================================

def classify_intent_node(state: ERPGraphState) -> dict:
    """
    Classifies user intent and UI route into one of the specialized ERP engine domains:
    - 'procurement': Purchase orders, requisitions, vendor RFPs, S2P, three-way match
    - 'fleet': Fleet dispatch, truck/vehicle allocations, route codes, weighbridge, GPS deviation
    - 'payroll': Salary allocations, wage slips, GOSI deductions, allowances, HR adjustments, leave
    - 'governance': Audit flags, policy violations, compliance checks, security clearances
    - 'general': General ledger vouchers, sales invoicing, inventory transfers/valuation
    """
    prompt = (state.get("user_prompt") or "").lower()
    route = (state.get("current_ui_route") or "").lower()
    text = f"{prompt} {route}"

    # Prioritize general financial journal/ledger entries if explicit accounting keywords or GL routes match
    if (re.search(r"\b(journal|general ledger|\bgl\b|financial statement|balance sheet|trial balance|ledger expense|fuel expense)\b", text) or 
        (re.search(r"\b(expense|ledger)\b", text) and "finance" in route)):
        intent = "general"
        dept = "FIN_CONTROLLER"
    elif re.search(r"\b(procure|purchase order|\bpo\b|requisition|rfp|supplier order|vendor order|vendor bill|p2p|three.way|3.way)\b", text) or "procurement" in route or "s2p" in route:
        intent = "procurement"
        dept = "PROCUREMENT_S2P"
    elif re.search(r"\b(dispatch|haul|quarry|trip|weighbridge|axle|route code|gps deviation)\b", text) or "fleet" in route or "logistics" in route:
        intent = "fleet"
        dept = "FLEET_LOGISTICS"
    elif re.search(r"\b(payroll|salary|wage|allowance|deduction|gosi|payslip|leave|vacation|attendance|hr adjustment|overtime)\b", text) or "payroll" in route or "hrms" in route:
        intent = "payroll"
        dept = "HR_PAYROLL"
    elif re.search(r"\b(governance|compliance|infraction|audit flag|violation|penalty|regulatory|security clearance|policy review)\b", text) or "governance" in route or "compliance" in route:
        intent = "governance"
        dept = "GOVERNANCE_COMPLIANCE"
    elif re.search(r"\b(truck|vehicle|fleet)\b", text):
        intent = "fleet"
        dept = "FLEET_LOGISTICS"
    else:
        intent = "general"
        dept = "FIN_CONTROLLER"

    print(f"[Agent Router] Classified prompt into domain [{dept}] (intent={intent}) for route [{route}]")
    return {
        "intent_category": intent,
        "department": dept,
        "execution_status": "classified",
    }


# Backward compatibility alias
classify_intent = classify_intent_node


def route_intent_edge(state: ERPGraphState) -> str:
    """
    Conditional routing edge directing state to the respective departmental sub-node.
    """
    intent = state.get("intent_category") or "general"
    routing_map = {
        "procurement": "procurement_node",
        "fleet": "fleet_node",
        "payroll": "payroll_node",
        "governance": "governance_node",
        "general": "general_node",
    }
    target_node = routing_map.get(intent, "general_node")
    print(f"[Agent Router] Edge directing intent '{intent}' -> '{target_node}'")
    return target_node


# ==============================================================================
# 4. Helper: LLM Extraction with Heuristic Resilience
# ==============================================================================

def _get_llm():
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY must be configured before the AI agent can run.")

    return ChatOpenAI(
        model=os.getenv("AGENT_MODEL", "openai/gpt-4o-mini"),
        openai_api_key=api_key,
        openai_api_base="https://openrouter.ai/api/v1",
        temperature=0,
        request_timeout=2,
        max_retries=0,
    )


def _invoke_structured(schema: Any, prompt: str) -> Any:
    """Invoke the configured model and enforce the requested Pydantic schema."""
    result = _get_llm().with_structured_output(schema).invoke(prompt)
    if isinstance(result, schema):
        return result
    return schema.model_validate(result)


def _draft_failure(node_name: str, error: Exception) -> dict:
    """Return a terminal, non-approval-ready state when drafting fails."""
    error_type = type(error).__name__
    print(f"[{node_name} Node] Draft rejected after provider/validation failure ({error_type}).")
    return {
        "draft_payload": None,
        "validation_status": "ERROR",
        "approval_status": None,
        "execution_status": "rejected",
        "message": "Draft unavailable: the provider response could not be validated. No action is ready for approval.",
        "error_message": f"Draft generation or validation failed ({error_type}).",
    }


# ==============================================================================
# 5. Departmental Nodes (Phase 1 Pydantic Validation)
# ==============================================================================

def procurement_node(state: ERPGraphState) -> dict:
    """
    Procurement & S2P Engine Node:
    Validates purchase orders against ProcurementPOSchema, calculating line item totals.
    """
    prompt = state.get("user_prompt", "")
    print("[Procurement Node] Formulating S2P payload.")

    try:
        if re.search(r"\b(3.way|three.way|p2p|match.*po|match.*invoice|vendor.*match)\b", prompt, re.I):
            schema = P2PMatchSchema
            action = "P2PMatchSchema"
        else:
            schema = ProcurementPOSchema
            action = "ProcurementPOSchema"
        po = _invoke_structured(
            schema,
            f"Extract the requested procurement operation as a validated {action}.\nPrompt: {prompt}",
        )
    except Exception as e:
        return _draft_failure("Procurement", e)

    data = po.model_dump()
    if action == "ProcurementPOSchema":
        data["total_estimated_cost"] = po.total_estimated_cost
    return {
        "draft_payload": {
            "action": action,
            "data": data,
        },
        "validation_status": "VALIDATED",
        "approval_status": None,
        "execution_status": "awaiting_approval",
        "error_message": None,
        "message": f"Validated {action} draft created; no database operation has been performed.",
    }


def fleet_node(state: ERPGraphState) -> dict:
    """
    Logistics & Fleet Operations Node:
    Validates vehicle dispatches against FleetDispatchSchema (payload, GPS deviation, route audit).
    """
    prompt = state.get("user_prompt", "")
    print("[Fleet Node] Formulating fleet dispatch payload.")

    try:
        dispatch = _invoke_structured(
            FleetDispatchSchema,
            f"Extract fleet dispatch details into FleetDispatchSchema.\nPrompt: {prompt}",
        )
    except Exception as e:
        return _draft_failure("Fleet", e)

    return {
        "draft_payload": {
            "action": "FleetDispatchSchema",
            "data": dispatch.model_dump(),
        },
        "validation_status": "VALIDATED",
        "approval_status": None,
        "execution_status": "awaiting_approval",
        "error_message": None,
        "message": "Validated fleet dispatch draft created; no database operation has been performed.",
    }


def payroll_node(state: ERPGraphState) -> dict:
    """
    HRMS & Payroll Accounting Node:
    Validates personnel salary allocations against PayrollVoucherSchema (allowances, deductions, HR adjustments).
    """
    prompt = state.get("user_prompt", "")
    print("[Payroll Node] Formulating payroll voucher.")

    try:
        if re.search(r"\b(leave|vacation|absence|time off)\b", prompt, re.I):
            schema = EmployeeLeaveSchema
            action = "EmployeeLeaveSchema"
        else:
            schema = PayrollVoucherSchema
            action = "PayrollVoucherSchema"
        payroll = _invoke_structured(
            schema,
            f"Extract the requested payroll operation as a validated {action}.\nPrompt: {prompt}",
        )
    except Exception as e:
        return _draft_failure("Payroll", e)

    data = payroll.model_dump()
    if action == "PayrollVoucherSchema":
        data["net_salary"] = payroll.net_salary
    return {
        "draft_payload": {
            "action": action,
            "data": data,
        },
        "validation_status": "VALIDATED",
        "approval_status": None,
        "execution_status": "awaiting_approval",
        "error_message": None,
        "message": f"Validated {action} draft created; no database operation has been performed.",
    }


def governance_node(state: ERPGraphState) -> dict:
    """
    Governance & Compliance Engine Node:
    Validates infraction logging and regulatory audits against GovernanceComplianceSchema.
    """
    prompt = state.get("user_prompt", "")
    print("[Governance Node] Formulating compliance review.")

    try:
        gov = _invoke_structured(
            GovernanceComplianceSchema,
            f"Extract governance compliance review into GovernanceComplianceSchema.\nPrompt: {prompt}",
        )
    except Exception as e:
        return _draft_failure("Governance", e)

    return {
        "draft_payload": {
            "action": "GovernanceComplianceSchema",
            "data": gov.model_dump(),
        },
        "validation_status": "VALIDATED",
        "approval_status": None,
        "execution_status": "awaiting_approval",
        "error_message": None,
        "message": "Validated governance review draft created; no database operation has been performed.",
    }


def general_node(state: ERPGraphState) -> dict:
    """
    General Ledger, Invoicing, and Inventory Sub-Node:
    Handles non-specialized general financial controller operations.
    """
    prompt = state.get("user_prompt", "")
    route = state.get("current_ui_route", "")
    print("[General Node] Formulating general ledger/inventory payload.")

    if re.search(r"\b(valuation|costing|fifo|wac|inventory valuation|audit.*warehouse|audit.*inventory)\b", prompt, re.I):
        schema = InventoryValuationSchema
    elif re.search(r"\b(transfer|stock transfer|move stock)\b", prompt, re.I) or "inventory" in route:
        schema = InventoryTransferSchema
    elif re.search(r"\b(invoice|zatca|client invoice|bill client)\b", prompt, re.I) or "sales" in route:
        schema = CustomerInvoiceSchema
    else:
        schema = JournalVoucherSchema

    action_name = schema.__name__
    try:
        payload = _invoke_structured(
            schema,
            f"Extract the requested controller operation as a validated {action_name}.\nPrompt: {prompt}",
        )
    except Exception as e:
        return _draft_failure("General", e)
    return {
        "draft_payload": {
            "action": action_name,
            "data": payload.model_dump(),
        },
        "validation_status": "VALIDATED",
        "approval_status": None,
        "execution_status": "awaiting_approval",
        "error_message": None,
        "message": f"Validated {action_name} draft created; no database operation has been performed.",
    }


# ==============================================================================
# 6. Execution Node (Emits a Validated Command Draft)
# ==============================================================================

def execute_action(state: ERPGraphState) -> dict:
    """
    Marks the validated command as ready for API-side execution.
    Database writes are performed only by the authenticated API transaction.
    """
    draft_payload = state.get("draft_payload")
    if state.get("validation_status") != "VALIDATED" or not isinstance(draft_payload, dict):
        return {
            "draft_payload": None,
            "validation_status": "ERROR",
            "approval_status": None,
            "execution_status": "rejected",
            "message": "Execution blocked because the graph has no validated command draft.",
            "error_message": "Execution blocked because the graph has no validated command draft.",
        }

    return {
        "execution_status": "awaiting_approval",
        "approval_status": state.get("approval_status") or "pending",
        "message": "Validated command draft is ready for authenticated API-side execution.",
    }


# ==============================================================================
# 7. State Graph Construction & Compilation
# ==============================================================================

def build_erp_state_graph():
    """
    Constructs the Multi-Engine LangGraph State Machine with conditional routing
    and interrupted human-in-the-loop gates.
    """
    workflow = StateGraph(ERPGraphState)

    # Add core classifier and departmental nodes
    workflow.add_node("classify", classify_intent_node)
    workflow.add_node("procurement_node", procurement_node)
    workflow.add_node("fleet_node", fleet_node)
    workflow.add_node("payroll_node", payroll_node)
    workflow.add_node("governance_node", governance_node)
    workflow.add_node("general_node", general_node)
    workflow.add_node("execute", execute_action)

    # Entry point is classification
    workflow.set_entry_point("classify")

    # Conditional routing edge from classification
    workflow.add_conditional_edges(
        "classify",
        route_intent_edge,
        {
            "procurement_node": "procurement_node",
            "fleet_node": "fleet_node",
            "payroll_node": "payroll_node",
            "governance_node": "governance_node",
            "general_node": "general_node",
        },
    )

    # Departmental nodes route into the execution gate
    workflow.add_edge("procurement_node", "execute")
    workflow.add_edge("fleet_node", "execute")
    workflow.add_edge("payroll_node", "execute")
    workflow.add_edge("governance_node", "execute")
    workflow.add_edge("general_node", "execute")
    workflow.add_edge("execute", END)

    # Initialize checkpointer (Redis with MemorySaver fallback)
    checkpointer = get_checkpointer()

    # Compile with human-in-the-loop gate before execution
    compiled_agent = workflow.compile(
        checkpointer=checkpointer,
        interrupt_before=["execute"],
    )
    return compiled_agent


# Export compiled agent singleton
oxengl_agent = build_erp_state_graph()

__all__ = [
    "ERPGraphState",
    "AgentState",
    "classify_intent_node",
    "route_intent_edge",
    "procurement_node",
    "fleet_node",
    "payroll_node",
    "governance_node",
    "general_node",
    "execute_action",
    "get_checkpointer",
    "build_erp_state_graph",
    "oxengl_agent",
]
