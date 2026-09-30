# ==============================================================================
# OxenGL Enterprise Operational Intelligence - Domain-Specific Agent Schemas
# Phase 1: Strict Pydantic v2 Validation Models for LangGraph Routing & Execution
# Compatible with Pyright, Pylance, and FastAPI / Pydantic v2 Core Engines
# ==============================================================================

import json
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ==============================================================================
# 1. Procurement & S2P (Source-to-Pay) Domain
# ==============================================================================

class ProcurementItemSchema(BaseModel):
    """Line item for a procurement purchase order."""
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    sku: str = Field(
        ...,
        min_length=1,
        description="Stock Keeping Unit or item code (e.g. 'CON-AGG-01', 'CAT-OIL-FILT')",
    )
    quantity: float = Field(
        ...,
        gt=0.0,
        description="Quantity of item to purchase (must be greater than 0)",
    )
    estimated_unit_cost: float = Field(
        ...,
        ge=0.0,
        description="Estimated unit purchase cost in standard currency (e.g. SAR)",
    )


class ProcurementPOSchema(BaseModel):
    """
    Procurement Purchase Order Schema for the S2P (Source-to-Pay) domain.
    Enforces strict structural validation to avoid cross-module routing errors with general ledger or inventory.
    """
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    requisition_id: Optional[str] = Field(
        default=None,
        description="Optional upstream Purchase Requisition identifier (e.g. 'REQ-2026-0042')",
    )
    vendor_id: str = Field(
        ...,
        min_length=1,
        description="Unique identifier or registered corporate title of the vendor/supplier",
    )
    items: List[ProcurementItemSchema] = Field(
        ...,
        min_length=1,
        description="List of procurement line items specifying SKU, quantity, and estimated unit cost",
    )
    delivery_location: str = Field(
        ...,
        min_length=1,
        description="Target destination facility, construction quarry, or warehouse code",
    )

    @field_validator("items", mode="before")
    @classmethod
    def parse_items(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass
        return v


# Legacy compatibility schema for existing S2P operations
class PurchaseOrderSchema(BaseModel):
    supplier_name: str = Field(description="Name of the vendor/supplier")
    items: str = Field(description="List of requested items and quantities")
    total_estimated_value: float = Field(description="Estimated total cost")


# ==============================================================================
# 2. Logistics & Fleet Operations Domain
# ==============================================================================

class FleetDispatchSchema(BaseModel):
    """
    Fleet Dispatch and Mission Orchestration Schema for logistics and heavy asset operations.
    Validates vehicle, driver, route allocations, and payload capacities.
    """
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    vehicle_id: str = Field(
        ...,
        min_length=1,
        description="Unique identifier, fleet asset code, or registration plate (e.g. 'TRK-3190', 'V-1002')",
    )
    driver_id: str = Field(
        ...,
        min_length=1,
        description="Designated driver personnel ID, iqama number, or badge code (e.g. 'DRV-8821')",
    )
    route_code: str = Field(
        ...,
        min_length=1,
        description="Authorized logistics corridor, route code, or delivery waypoint (e.g. 'RT-RUH-JED-01', 'QID-QUARRY-NORTH')",
    )
    scheduled_departure: str = Field(
        ...,
        min_length=1,
        description="Target scheduled departure timestamp (ISO 8601 string or standard date-time, e.g. '2026-09-30T08:00:00Z')",
    )
    load_weight_tons: float = Field(
        ...,
        ge=0.0,
        description="Payload mass in metric tons",
    )

    # Backward compatibility fields with legacy single-turn prompts
    truck_id: Optional[str] = Field(default=None, description="Legacy truck identifier alias for vehicle_id")
    destination: Optional[str] = Field(default=None, description="Legacy destination facility or quarry")
    cargo_type: Optional[str] = Field(default=None, description="Type of cargo being transported")
    priority: Optional[str] = Field(default="Standard", description="Dispatch priority: 'Standard' or 'Urgent'")

    @model_validator(mode="before")
    @classmethod
    def harmonize_legacy_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("vehicle_id") and data.get("truck_id"):
                data["vehicle_id"] = str(data["truck_id"])
            if not data.get("route_code") and data.get("destination"):
                data["route_code"] = str(data["destination"])
            if not data.get("driver_id"):
                data["driver_id"] = str(data.get("driver") or "DRV-AUTO-ASSIGN")
            if not data.get("scheduled_departure"):
                data["scheduled_departure"] = str(data.get("departure_time") or datetime.now(timezone.utc).isoformat())
            if data.get("load_weight_tons") is None:
                data["load_weight_tons"] = float(data.get("weight") or data.get("tonnage") or 0.0)
        return data


# ==============================================================================
# 3. HR & Payroll Accounting Domain
# ==============================================================================

class PayrollVoucherSchema(BaseModel):
    """
    Payroll Voucher Schema for human resources, compensation, and wage ledger accounting.
    Validates wage base, statutory/contractual allowances, deductions, and fiscal period.
    """
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    employee_id: str = Field(
        ...,
        min_length=1,
        description="Unique employee badge number, national ID, or staff UUID (e.g. 'EMP-0149')",
    )
    base_salary: float = Field(
        ...,
        gt=0.0,
        description="Contractual monthly or period base wage in local currency (e.g. SAR)",
    )
    allowances: float = Field(
        default=0.0,
        ge=0.0,
        description="Total housing, transport, site, and operational allowances in currency",
    )
    deductions: float = Field(
        default=0.0,
        ge=0.0,
        description="Total statutory GOSI, loan repayments, advance, or penalty deductions in currency",
    )
    pay_period: str = Field(
        ...,
        min_length=4,
        description="Applicable accounting pay period (e.g. '2026-09', 'September 2026', '2026-M09')",
    )

    @property
    def net_salary(self) -> float:
        """Calculated net payable salary after allowances and deductions."""
        return round(self.base_salary + self.allowances - self.deductions, 2)


class EmployeeLeaveSchema(BaseModel):
    """Employee Leave Request schema for HR workflows."""
    employee_id: str = Field(description="ID or name of the employee")
    leave_type: str = Field(description="Type of leave: 'Annual', 'Sick', 'Unpaid'")
    days_requested: int = Field(description="Number of days requested")


# ==============================================================================
# 4. Governance & Regulatory Compliance Domain
# ==============================================================================

class GovernanceComplianceSchema(BaseModel):
    """
    Governance and Regulatory Compliance Schema for auditing, risk assessment, and policy enforcement.
    Prevents cross-module classification errors by formalizing infraction tracking across fleet, vendor, HR, and finance entities.
    """
    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    target_entity_type: str = Field(
        ...,
        min_length=1,
        description="Type of entity audited: 'driver', 'vehicle', 'vendor', 'tenant', 'employee', or 'transaction'",
    )
    entity_id: str = Field(
        ...,
        min_length=1,
        description="Unique business identifier or database primary key of the target entity",
    )
    infraction_code: str = Field(
        ...,
        min_length=1,
        description="Standardized regulatory or internal policy infraction code (e.g. 'ZATCA-E104', 'MOL-WAGE-DELAY', 'FLEET-SPEED-02', 'OVERWEIGHT-AXLE')",
    )
    severity_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = Field(
        ...,
        description="Assessed risk severity level: 'LOW', 'MEDIUM', 'HIGH', or 'CRITICAL'",
    )
    audit_notes: str = Field(
        ...,
        min_length=1,
        description="Comprehensive audit commentary, evidentiary observations, or mitigating context",
    )


# ==============================================================================
# 5. Financial Controller & General Ledger
# ==============================================================================

class JournalVoucherSchema(BaseModel):
    description: str = Field(description="Clear accounting description")
    amount: float = Field(description="Total transaction amount")
    currency: str = Field(default="SAR", description="Currency used, default SAR")
    expense_category: str = Field(description="Categorize the expense")


# ==============================================================================
# 6. Sales & CRM (ZATCA Compliant)
# ==============================================================================

class CustomerInvoiceSchema(BaseModel):
    customer_name: str = Field(description="Name of the client")
    service_rendered: str = Field(description="Description of services or goods provided")
    net_amount: float = Field(description="Amount before VAT")
    tax_rate: float = Field(default=15.0, description="VAT percentage, usually 15.0 for KSA")
    zatca_phase: int = Field(default=2, description="ZATCA clearance phase, default to 2")


# ==============================================================================
# 7. Inventory Module & Valuation
# ==============================================================================

class InventoryTransferSchema(BaseModel):
    item_code: str = Field(description="SKU or material name")
    quantity: float = Field(description="Amount to transfer")
    source_warehouse: str = Field(description="Originating location")
    target_warehouse: str = Field(description="Destination location")


class InventoryValuationSchema(BaseModel):
    warehouse_id: str = Field(default="ALL", description="Target warehouse name, code or ID (e.g. 'Qiddiya', 'WH-MAIN', 'ALL')")
    valuation_method: str = Field(default="FIFO", description="Valuation algorithm: 'FIFO', 'WEIGHTED_AVERAGE', or 'STANDARD_COST'")
    audit_focus: str = Field(default="comprehensive", description="Audit focus: 'comprehensive', 'reconciliation', or 'variance'")


# ==============================================================================
# 8. Procurement-to-Pay (P2P) & Three-Way Matching
# ==============================================================================

class P2PMatchSchema(BaseModel):
    po_reference: str = Field(default="ALL", description="PO number, vendor name, or 'ALL' to match all orders (e.g. 'PO-2026-09-QID001', 'Qiddiya')")
    price_tolerance_pct: float = Field(default=2.0, description="Maximum allowable price variance percentage before flagging discrepancy")
    qty_tolerance_pct: float = Field(default=0.0, description="Maximum allowable quantity variance percentage (0 = exact match required)")


__all__ = [
    "ProcurementItemSchema",
    "ProcurementPOSchema",
    "PurchaseOrderSchema",
    "FleetDispatchSchema",
    "PayrollVoucherSchema",
    "EmployeeLeaveSchema",
    "GovernanceComplianceSchema",
    "JournalVoucherSchema",
    "CustomerInvoiceSchema",
    "InventoryTransferSchema",
    "InventoryValuationSchema",
    "P2PMatchSchema",
]
