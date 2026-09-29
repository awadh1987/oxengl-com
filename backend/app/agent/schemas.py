from pydantic import BaseModel, Field

# 1. Finance Module
class JournalVoucherSchema(BaseModel):
    description: str = Field(description="Clear accounting description")
    amount: float = Field(description="Total transaction amount")
    currency: str = Field(description="Currency used, default SAR")
    expense_category: str = Field(description="Categorize the expense")

# 2. Logistics & Fleet Module
class FleetDispatchSchema(BaseModel):
    truck_id: str = Field(description="The ID of the truck (e.g., '3190', 'V-1002')")
    destination: str = Field(description="Destination facility or quarry")
    cargo_type: str = Field(description="Type of cargo being transported")
    priority: str = Field(description="Dispatch priority: 'Standard' or 'Urgent'")

# 3. Inventory Module
class InventoryTransferSchema(BaseModel):
    item_code: str = Field(description="SKU or material name")
    quantity: float = Field(description="Amount to transfer")
    source_warehouse: str = Field(description="Originating location")
    target_warehouse: str = Field(description="Destination location")

# 4. Procurement & S2P Module
class PurchaseOrderSchema(BaseModel):
    supplier_name: str = Field(description="Name of the vendor/supplier")
    items: str = Field(description="List of requested items and quantities")
    total_estimated_value: float = Field(description="Estimated total cost")

# 5. Sales & CRM (ZATCA Compliant)
class CustomerInvoiceSchema(BaseModel):
    customer_name: str = Field(description="Name of the client")
    service_rendered: str = Field(description="Description of services or goods provided")
    net_amount: float = Field(description="Amount before VAT")
    tax_rate: float = Field(description="VAT percentage, usually 15.0 for KSA")
    zatca_phase: int = Field(description="ZATCA clearance phase, default to 2")

# 6. HR & Payroll Module
class EmployeeLeaveSchema(BaseModel):
    employee_id: str = Field(description="ID or name of the employee")
    leave_type: str = Field(description="Type of leave: 'Annual', 'Sick', 'Unpaid'")
    days_requested: int = Field(description="Number of days requested")
