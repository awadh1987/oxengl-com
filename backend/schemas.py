"""Pydantic request and response contracts for the Phase 1 API."""

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator


class ORMReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ResCompanyRead(ORMReadModel):
    id: UUID
    parent_id: UUID | None = None
    name: str
    slug: str
    tax_id: str | None
    commercial_registration: str | None
    currency: str
    fiscal_calendar: str = "gregorian"
    fiscal_year_start_month: int = 1
    tax_regime: str = "KSA_VAT"
    created_at: datetime
    subscription_tier: str = "PROFESSIONAL"
    license_key: str | None = None
    license_expires_at: datetime | None = None
    max_cost_centers: int = 25
    theme_mode: str = "CUSTOM"
    ui_primary_color: str = "#1E3A8A"
    ui_logo_url: str | None = None
    wallpaper_url: str | None = None
    background_url: str | None = None


class PublicTenantRead(ORMReadModel):
    id: UUID
    name: str
    slug: str
    ui_logo_url: str | None = None
    ui_primary_color: str = "#1E3A8A"
    ui_secondary_color: str = "#7C3AED"
    wallpaper_url: str | None = None
    background_url: str | None = None


class LicenseIssueRequest(BaseModel):
    company_id: str = Field(min_length=1, max_length=128)
    subscription_tier: str = "PROFESSIONAL"
    validity_days: int = Field(default=365, ge=1, le=3650)
    theme_mode: str = "CUSTOM"
    ui_primary_color: str = "#1E3A8A"
    ui_secondary_color: str = "#7C3AED"


class CompanyBrandingUpdate(BaseModel):
    ui_logo_url: str | None = Field(default=None, max_length=5_000_000)
    ui_primary_color: str = Field(default="#1E3A8A", pattern=r"^#[0-9a-fA-F]{6}$")
    ui_secondary_color: str = Field(default="#7C3AED", pattern=r"^#[0-9a-fA-F]{6}$")
    wallpaper_url: str | None = Field(default=None, max_length=5_000_000)
    background_url: str | None = Field(default=None, max_length=5_000_000)


class PlatformAssetUploadRequest(BaseModel):
    file_name: str | None = Field(default=None, alias="fileName")
    file_type: str | None = Field(default=None, alias="fileType")
    file_size: int | None = Field(default=None, alias="fileSize")
    file_buffer: str = Field(..., alias="fileBuffer")
    asset_type: str | None = Field(default="platform_logo", alias="assetType")
    primary_color: str | None = Field(default=None, alias="primaryColor")
    secondary_color: str | None = Field(default=None, alias="secondaryColor")
    wallpaper_url: str | None = Field(default=None, alias="wallpaperUrl")
    background_url: str | None = Field(default=None, alias="backgroundUrl")
    company_id: UUID | None = Field(default=None, alias="companyId")

    model_config = ConfigDict(populate_by_name=True)


class PlatformAssetUploadResponse(BaseModel):
    status: str
    url: str
    file_name: str | None = Field(default=None, alias="fileName")
    asset_type: str | None = Field(default="platform_logo", alias="assetType")
    primary_color: str | None = Field(default=None, alias="primaryColor")
    secondary_color: str | None = Field(default=None, alias="secondaryColor")
    wallpaper_url: str | None = Field(default=None, alias="wallpaperUrl")
    background_url: str | None = Field(default=None, alias="backgroundUrl")

    model_config = ConfigDict(populate_by_name=True)


class IsolationAuditRead(BaseModel):
    isolated_tables: list[str]
    total_isolated_tables: int
    total_registered_tenants: int
    backend_status: str
    security_policy: str
    checked_at: datetime


class ResUserRead(ORMReadModel):
    id: UUID
    email: str
    full_name: str
    phone: str | None = None
    company_id: UUID
    role: Literal["Super_Admin", "Admin", "COO", "Accountant", "Data_Entry", "Guest"]
    role_ids: str | None = None
    branch_scope_ids: str | None = None
    warehouse_scope_ids: str | None = None
    access_control_list: str | None = None
    is_active: bool


class CompanyUpdate(BaseModel):
    parent_id: UUID | None = None
    name: str | None = Field(default=None, min_length=2, max_length=255)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    fiscal_calendar: str | None = Field(default=None, max_length=64)
    fiscal_year_start_month: int | None = Field(default=None, ge=1, le=12)
    tax_regime: str | None = Field(default=None, max_length=64)
    theme_mode: str | None = Field(default=None, max_length=16)
    ui_primary_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    ui_secondary_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    ui_logo_url: str | None = Field(default=None, max_length=5_000_000)


class CompanyRegistrationCreate(BaseModel):
    company_name: str = Field(min_length=2, max_length=255)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,62}$")
    cr_number: str = Field(pattern=r"^\d{10}$")
    vat_number: str = Field(pattern=r"^\d{15}$")
    admin_email: str = Field(min_length=3, max_length=255)
    admin_name: str = Field(min_length=2, max_length=255)
    admin_phone: str | None = Field(default=None, max_length=64)
    admin_password: str = Field(min_length=8, max_length=512)


class CompanyRegistrationRead(BaseModel):
    company: ResCompanyRead
    user: ResUserRead


class AuthVerifyRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=512)


class UserRegistrationCreate(BaseModel):
    company_id: UUID
    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    phone: str = Field(min_length=6, max_length=64)
    password: str = Field(min_length=8, max_length=512)
    requested_role: Literal["Guest", "Data_Entry", "Accountant"] = "Guest"


class AuthVerifyResponse(BaseModel):
    status: Literal["Active", "Pending"]
    message: str
    token: str | None = None
    user: dict[str, str | None]


class DirectAccessRequest(BaseModel):
    scope: Literal["master", "tenant"]
    company_id: UUID | None = None
    recovery_code: str = Field(min_length=16, max_length=512)


class ResPartnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    partner_type: Literal["raw_materials_supplier", "service_supplier", "customer", "internal", "supplier", "transporter", "employee", "other"] = "customer"
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    tax_number: str | None = Field(default=None, max_length=64)
    commercial_registration: str | None = Field(default=None, max_length=64)
    branch_scope_ids: str | None = None
    warehouse_scope_ids: str | None = None
    access_control_list: str | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class ResPartnerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    partner_type: Literal["raw_materials_supplier", "service_supplier", "customer", "internal", "supplier", "transporter", "employee", "other"] | None = None
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    tax_number: str | None = Field(default=None, max_length=64)
    commercial_registration: str | None = Field(default=None, max_length=64)
    branch_scope_ids: str | None = None
    warehouse_scope_ids: str | None = None
    access_control_list: str | None = None
    custom_attributes: dict[str, Any] | None = None


class ResPartnerRead(ResPartnerCreate, ORMReadModel):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StockLocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    location_type: Literal["supplier", "internal", "customer", "inventory", "production", "transit"] = "internal"
    parent_id: UUID | None = None


class StockLocationRead(StockLocationCreate, ORMReadModel):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProductProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    product_type: Literal["storable", "consumable", "service"] = "storable"
    unit_of_measure: str = Field(default="ton", min_length=1, max_length=32)
    standard_cost: Decimal = Field(default=Decimal("0"), ge=0)
    sale_price: Decimal = Field(default=Decimal("0"), ge=0)


class ProductProductRead(ProductProductCreate, ORMReadModel):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WeighbridgeOperationCreate(BaseModel):
    partner_id: UUID | None = None
    product_id: UUID | None = None
    source_location_id: UUID | None = None
    dest_location_id: UUID | None = None
    partner_name: str | None = None
    transporter_name: str | None = None
    product_name: str | None = None
    material_type: str | None = None
    source_location_name: str | None = None
    loading_source: str | None = None
    dest_location_name: str | None = None
    destination_customer: str | None = None
    destination_customer_name: str | None = None
    truck_number: str | None = Field(default=None, max_length=64)
    truck_no: str | None = Field(default=None, max_length=64)
    truckNumber: str | None = Field(default=None, max_length=64)
    plate_number: str | None = Field(default=None, max_length=64)
    gross_weight: Decimal = Field(default=Decimal("1.0"), gt=0, decimal_places=4)
    tare_weight: Decimal = Field(default=Decimal("0.0"), ge=0, decimal_places=4)
    net_weight: Decimal | None = None
    uom: str | None = None
    unit_of_measure: str | None = None
    qty_loaded: Decimal | None = None
    qty_delivered: Decimal | None = None
    qty_wastage: Decimal | None = None
    wastage_percentage: Decimal | None = None
    ticket_number: str | None = None
    ticketNumber: str | None = None
    scale_ticket_no: str | None = None
    scaleTicketNo: str | None = None
    loading_invoice_no: str | None = None
    loadingInvoiceNo: str | None = None
    receipt_invoice_no: str | None = None
    receiptInvoiceNo: str | None = None
    driver_name: str | None = None
    company_id: UUID | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    scale_ticket_attachment: str | None = None
    sales_amount: Decimal | None = None
    salesAmount: Decimal | None = None
    vat_amount: Decimal | None = None
    vatAmount: Decimal | None = None
    total_sales: Decimal | None = None
    totalSales: Decimal | None = None
    purchases_cost: Decimal | None = None
    purchasesCost: Decimal | None = None
    crusher_payment: Decimal | None = None
    crusherPayment: Decimal | None = None
    net_profit: Decimal | None = None
    netProfit: Decimal | None = None
    operation_month: int | None = None
    operationMonth: int | None = None
    operation_year: int | None = None
    operationYear: int | None = None
    notes: str | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    loading_date: datetime | str | None = None
    loadingDate: datetime | str | None = None

    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
    )

    @model_validator(mode="after")
    def validate_weighbridge_operation(self) -> "WeighbridgeOperationCreate":
        if not self.truck_number:
            self.truck_number = self.plate_number or self.truck_no or self.truckNumber
        if not self.plate_number and self.truck_number:
            self.plate_number = self.truck_number
        if not self.truck_number:
            self.truck_number = "TRK-001"
            self.plate_number = "TRK-001"

        if not self.partner_name and self.transporter_name:
            self.partner_name = self.transporter_name
        if not self.product_name and self.material_type:
            self.product_name = self.material_type
        if not self.source_location_name and self.loading_source:
            self.source_location_name = self.loading_source
        if not self.dest_location_name and (self.destination_customer or self.destination_customer_name):
            self.dest_location_name = self.destination_customer or self.destination_customer_name

        if not self.scale_ticket_no and self.scaleTicketNo:
            self.scale_ticket_no = self.scaleTicketNo
        if not self.ticket_number:
            self.ticket_number = self.scale_ticket_no or self.ticketNumber

        if not self.loading_invoice_no and self.loadingInvoiceNo:
            self.loading_invoice_no = self.loadingInvoiceNo

        if not self.receipt_invoice_no and self.receiptInvoiceNo:
            self.receipt_invoice_no = self.receiptInvoiceNo

        if not self.uom and self.unit_of_measure:
            self.uom = self.unit_of_measure
        elif not self.unit_of_measure and self.uom:
            self.unit_of_measure = self.uom
        if not self.uom:
            self.uom = "MT"
            self.unit_of_measure = "MT"

        if self.gross_weight <= self.tare_weight:
            if self.tare_weight >= self.gross_weight:
                self.tare_weight = max(Decimal("0.0"), self.gross_weight - Decimal("0.0001"))
        if self.net_weight is None:
            self.net_weight = self.gross_weight - self.tare_weight

        if self.source_location_id and self.dest_location_id and self.source_location_id == self.dest_location_id:
            raise ValueError("source_location_id and dest_location_id must differ")
        if self.source_location_name and self.dest_location_name and self.source_location_name.strip().lower() == self.dest_location_name.strip().lower():
            raise ValueError("source_location_name and dest_location_name must differ")
        return self


class WeighbridgeOperationRead(ORMReadModel):
    picking_id: UUID | None = None
    picking_reference: str | None = None
    partner_id: UUID | None = None
    partner_name: str | None = None
    product_id: UUID | None = None
    product_name: str | None = None
    source_location_id: UUID | None = None
    source_location_name: str | None = None
    dest_location_id: UUID | None = None
    dest_location_name: str | None = None
    ticket_id: UUID
    ticket_number: str
    truck_number: str
    gross_weight: Decimal
    tare_weight: Decimal
    net_weight: Decimal
    uom: str = "MT"
    unit_of_measure: str = "MT"
    weighed_in_at: datetime
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    scale_ticket_attachment: str | None = None
    material_supplier_name: str | None = None
    service_supplier_name: str | None = None
    destination_customer_name: str | None = None
    loading_invoice_no: str | None = None
    receipt_invoice_no: str | None = None
    material_type: str | None = None
    qty_loaded: Decimal | None = None
    qty_delivered: Decimal | None = None
    qty_wastage: Decimal | None = None
    wastage_percentage: Decimal | None = None
    sales_amount: Decimal | None = None
    vat_amount: Decimal | None = None
    total_sales: Decimal | None = None
    purchases_cost: Decimal | None = None
    crusher_payment: Decimal | None = None
    net_profit: Decimal | None = None
    operation_month: int | None = None
    operation_year: int | None = None
    notes: str | None = None
    raw_legacy_data: dict[str, Any] | None = Field(default_factory=dict)
    custom_attributes: dict[str, Any] | None = Field(default_factory=dict)


class OperationAttachmentBase(BaseModel):
    file_name: str | None = None
    fileName: str | None = None
    file_size: str | None = None
    fileSize: str | None = None
    file_type: str | None = None
    fileType: str | None = None
    doc_category: str | None = "Other"
    docCategory: str | None = "Other"
    file_data: str | None = None
    fileData: str | None = None
    uploaded_by: str | None = None
    uploadedBy: str | None = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class OperationAttachmentCreate(BaseModel):
    operation_id: UUID | str | None = None
    ticket_id: UUID | str | None = None
    picking_id: UUID | str | None = None
    file_name: str | None = None
    fileName: str | None = None
    file_size: str | None = None
    fileSize: str | None = None
    file_type: str | None = None
    fileType: str | None = None
    doc_category: str | None = None
    docCategory: str | None = None
    file_data: str | None = None
    fileData: str | None = None
    uploaded_by: str | None = None
    uploadedBy: str | None = None
    uploaded_at: str | None = None
    uploadedAt: str | None = None
    attachments: list[dict[str, Any]] | None = None


class OperationAttachmentRead(OperationAttachmentBase):
    id: UUID | str
    company_id: UUID | str | None = None
    ticket_id: UUID | str | None = None
    uploaded_at: datetime | str | None = None
    uploadedAt: datetime | str | None = None
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class AccountAccountCreate(BaseModel):
    code: str
    name: str
    internal_type: Literal["asset", "liability", "equity", "revenue", "expense"]
    currency: str = "SAR"
    node_path: str | None = None


class AccountAccountRead(ORMReadModel):
    id: UUID
    company_id: UUID
    code: str
    name: str
    internal_type: Literal["asset", "liability", "equity", "revenue", "expense"]
    currency: str


class AccountJournalRead(ORMReadModel):
    id: UUID
    company_id: UUID
    code: str
    name: str
    journal_type: str
    sequence_prefix: str
    next_sequence: int


class FiscalYearRead(ORMReadModel):
    id: UUID
    company_id: UUID
    name: str
    date_start: datetime
    date_end: datetime
    state: str


class CostCenterCreate(BaseModel):
    parent_id: UUID | None = None
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)


class CostCenterRead(CostCenterCreate, ORMReadModel):
    id: UUID
    company_id: UUID
    is_active: bool


class AccountMoveLineCreate(BaseModel):
    account_id: UUID | None = None
    account_code: str | None = None
    partner_id: UUID | None = None
    cost_center_id: UUID | None = None
    debit: Decimal = Field(default=Decimal("0"), ge=0)
    credit: Decimal = Field(default=Decimal("0"), ge=0)
    name: str = Field(default="Journal Line", min_length=1, max_length=255)

    @model_validator(mode="after")
    def validate_line(self) -> "AccountMoveLineCreate":
        if not self.account_id and not self.account_code:
            raise ValueError("Either account_id or account_code must be provided")
        if (self.debit > 0 and self.credit > 0) or (self.debit == 0 and self.credit == 0):
            raise ValueError("Journal line must have either debit or credit greater than zero, not both or neither")
        return self


class AccountMoveLineRead(ORMReadModel):
    id: UUID
    company_id: UUID
    move_id: UUID
    account_id: UUID
    partner_id: UUID | None = None
    cost_center_id: UUID | None = None
    debit: Decimal
    credit: Decimal
    name: str


class AccountMoveCreate(BaseModel):
    name: str | None = Field(default=None, max_length=64)
    journal_code: str = Field(default="MISC", min_length=1, max_length=16)
    move_type: Literal["entry", "out_invoice", "in_invoice", "settlement"] = "entry"
    partner_id: UUID | None = None
    cost_center_id: UUID | None = None
    date: datetime | None = None
    ref: str | None = Field(default=None, max_length=128)
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    lines: list[AccountMoveLineCreate] = Field(min_length=2)

    @model_validator(mode="after")
    def must_balance(self) -> "AccountMoveCreate":
        debit_total = sum((line.debit for line in self.lines), Decimal("0")).quantize(Decimal("0.0001"))
        credit_total = sum((line.credit for line in self.lines), Decimal("0")).quantize(Decimal("0.0001"))
        if debit_total <= Decimal("0"):
            raise ValueError("Journal entry total debit must be greater than zero")
        if debit_total != credit_total:
            raise ValueError(f"Journal entry debits ({debit_total}) must strictly equal credits ({credit_total})")
        return self


class AccountMoveRead(ORMReadModel):
    id: UUID
    company_id: UUID
    journal_id: UUID | None = None
    fiscal_year_id: UUID | None = None
    name: str
    sequence_number: int | None = None
    move_type: str
    partner_id: UUID | None
    cost_center_id: UUID | None = None
    date: datetime
    state: str
    ref: str | None
    posted_at: datetime | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    lines: list[AccountMoveLineRead] = []

    @computed_field
    @property
    def amount_total(self) -> Decimal:
        return sum((line.debit for line in self.lines), Decimal("0.0000"))


class CustomerInvoiceCreate(BaseModel):
    invoice_number: str | None = Field(default=None, max_length=64)
    partner_id: UUID | None = None
    customer_name: str = Field(min_length=1, max_length=255)
    customer_tax_number: str | None = Field(default=None, max_length=64)
    issue_date: datetime | None = None
    due_date: datetime | None = None
    subtotal: Decimal = Field(default=Decimal("0.00"), ge=0)
    vat_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    grand_total: Decimal = Field(default=Decimal("0.00"), ge=0)
    custom_attributes: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def totals_must_balance(self) -> "CustomerInvoiceCreate":
        self.subtotal = self.subtotal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        self.vat_amount = self.vat_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        self.grand_total = self.grand_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if self.subtotal + self.vat_amount != self.grand_total:
            raise ValueError("Invoice totals are unbalanced: subtotal plus VAT must equal grand total")
        return self


class CustomerInvoiceUpdate(BaseModel):
    partner_id: UUID | None = None
    customer_name: str | None = Field(default=None, min_length=1, max_length=255)
    customer_tax_number: str | None = Field(default=None, max_length=64)
    issue_date: datetime | None = None
    due_date: datetime | None = None
    subtotal: Decimal | None = Field(default=None, ge=0)
    vat_amount: Decimal | None = Field(default=None, ge=0)
    grand_total: Decimal | None = Field(default=None, ge=0)
    status: Literal["Draft", "Approved", "Issued", "Cancelled"] | None = None
    custom_attributes: dict[str, Any] | None = None

    @model_validator(mode="after")
    def totals_must_balance(self) -> "CustomerInvoiceUpdate":
        if self.subtotal is not None:
            self.subtotal = self.subtotal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if self.vat_amount is not None:
            self.vat_amount = self.vat_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if self.grand_total is not None:
            self.grand_total = self.grand_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if self.subtotal is not None and self.vat_amount is not None and self.grand_total is not None:
            if self.subtotal + self.vat_amount != self.grand_total:
                raise ValueError("Invoice totals are unbalanced: subtotal plus VAT must equal grand total")
        return self


class CustomerInvoiceRead(ORMReadModel):
    id: UUID
    company_id: UUID
    partner_id: UUID | None
    move_id: UUID | None
    invoice_number: str
    customer_name: str
    customer_tax_number: str | None
    issue_date: datetime
    due_date: datetime | None
    status: str
    subtotal: Decimal
    vat_amount: Decimal
    grand_total: Decimal
    approved_by: str | None
    approved_at: datetime | None
    issued_at: datetime | None
    created_at: datetime
    updated_at: datetime
    public_token: Optional[str] = None
    journal_entry_id: Optional[UUID] = None
    is_posted: bool = False
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class InvoiceOut(CustomerInvoiceRead):
    public_token: Optional[str] = None


class InvoiceResponse(CustomerInvoiceRead):
    public_token: Optional[str] = None



class SupplierSettlementGenerate(BaseModel):
    partner_id: UUID
    period_start: datetime
    period_end: datetime
    total_gross_amount: Decimal = Field(default=Decimal("0"), ge=0)
    total_penalties_loss: Decimal = Field(default=Decimal("0"), ge=0)

    @model_validator(mode="after")
    def valid_period_and_amounts(self) -> "SupplierSettlementGenerate":
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        if self.total_penalties_loss > self.total_gross_amount:
            raise ValueError("total_penalties_loss cannot exceed total_gross_amount")
        return self


class SupplierSettlementRead(ORMReadModel):
    id: UUID
    company_id: UUID
    partner_id: UUID
    move_id: UUID
    total_gross_amount: Decimal
    total_penalties_loss: Decimal
    net_payable: Decimal
    period_start: datetime
    period_end: datetime
    state: str


# ==============================================================================
# ==============================================================================
# Phase 4 Schemas: Asset Management / Fleet
# ==============================================================================

class VehicleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    license_plate: str = Field(min_length=1, max_length=32)
    vin_chassis: str | None = Field(default=None, max_length=64)
    make: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=64)
    model_year: int | None = Field(default=None, ge=1900, le=2100)
    vehicle_type: Literal["truck", "trailer", "pickup", "tanker", "forklift", "heavy_machinery", "other"] = "truck"
    status: Literal["active", "maintenance", "breakdown", "retired"] = "active"
    current_odometer: Decimal = Field(default=Decimal("0"), ge=0)
    fuel_capacity: Decimal | None = Field(default=None, ge=0)
    transporter_id: UUID | None = None
    cost_center_id: UUID | None = None
    is_active: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Mercedes ML63 Heavy Support",
                "license_plate": "KSA-6363-AMG",
                "vin_chassis": "WDC1641771A123456",
                "make": "Mercedes-Benz",
                "model": "ML 63 AMG (295/35 R21 XL tire specifications)",
                "model_year": 2010,
                "vehicle_type": "other",
                "status": "active",
                "current_odometer": 145200.0,
                "fuel_capacity": 95.0,
                "is_active": True,
            }
        }
    )

VehicleCreate.Config = type("Config", (), {"schema_extra": VehicleCreate.model_config["json_schema_extra"]})


class VehicleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    license_plate: str | None = Field(default=None, min_length=1, max_length=32)
    vin_chassis: str | None = Field(default=None, max_length=64)
    make: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=64)
    model_year: int | None = Field(default=None, ge=1900, le=2100)
    vehicle_type: Literal["truck", "trailer", "pickup", "tanker", "forklift", "heavy_machinery", "other"] | None = None
    status: Literal["active", "maintenance", "breakdown", "retired"] | None = None
    current_odometer: Decimal | None = Field(default=None, ge=0)
    fuel_capacity: Decimal | None = Field(default=None, ge=0)
    transporter_id: UUID | None = None
    cost_center_id: UUID | None = None
    is_active: bool | None = None


class VehicleRead(ORMReadModel):
    id: UUID
    company_id: UUID
    name: str
    license_plate: str
    vin_chassis: str | None = None
    make: str | None = None
    model: str | None = None
    model_year: int | None = None
    vehicle_type: str
    status: str
    current_odometer: Decimal
    fuel_capacity: Decimal | None = None
    transporter_id: UUID | None = None
    cost_center_id: UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MaintenanceWorkOrderCreate(BaseModel):
    order_number: str | None = Field(default=None, max_length=64)
    vehicle_id: UUID
    order_type: Literal["preventive", "corrective", "routine", "emergency", "inspection"] = "preventive"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    status: Literal["draft", "in_progress", "awaiting_parts", "completed", "cancelled"] = "draft"
    odometer_reading: Decimal | None = Field(default=None, ge=0)
    cost_center_id: UUID | None = None
    description: str = Field(min_length=1)
    total_parts_cost: Decimal = Field(default=Decimal("0"), ge=0)
    total_labor_cost: Decimal = Field(default=Decimal("0"), ge=0)
    total_cost: Decimal = Field(default=Decimal("0"), ge=0)
    scheduled_date: datetime | None = None
    completed_date: datetime | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "order_number": "MWO-2026-0001",
                "order_type": "preventive",
                "priority": "high",
                "status": "in_progress",
                "odometer_reading": 145000.0,
                "description": "50,000km Transmission and Brake Service with XL tire alignment",
                "total_parts_cost": 1200.0,
                "total_labor_cost": 450.0,
                "total_cost": 1650.0,
            }
        }
    )

MaintenanceWorkOrderCreate.Config = type("Config", (), {"schema_extra": MaintenanceWorkOrderCreate.model_config["json_schema_extra"]})


class MaintenanceWorkOrderUpdate(BaseModel):
    order_number: str | None = Field(default=None, min_length=1, max_length=64)
    vehicle_id: UUID | None = None
    order_type: Literal["preventive", "corrective", "routine", "emergency", "inspection"] | None = None
    priority: Literal["low", "medium", "high", "urgent"] | None = None
    status: Literal["draft", "in_progress", "awaiting_parts", "completed", "cancelled"] | None = None
    odometer_reading: Decimal | None = Field(default=None, ge=0)
    cost_center_id: UUID | None = None
    description: str | None = None
    total_parts_cost: Decimal | None = Field(default=None, ge=0)
    total_labor_cost: Decimal | None = Field(default=None, ge=0)
    total_cost: Decimal | None = Field(default=None, ge=0)
    scheduled_date: datetime | None = None
    completed_date: datetime | None = None


class MaintenanceWorkOrderRead(ORMReadModel):
    id: UUID
    company_id: UUID
    order_number: str
    vehicle_id: UUID
    order_type: str
    priority: str
    status: str
    odometer_reading: Decimal | None = None
    cost_center_id: UUID | None = None
    description: str
    total_parts_cost: Decimal
    total_labor_cost: Decimal
    total_cost: Decimal
    scheduled_date: datetime | None = None
    completed_date: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PartRequirementCreate(BaseModel):
    work_order_id: UUID
    product_id: UUID
    quantity_required: Decimal = Field(default=Decimal("1"), ge=0)
    quantity_used: Decimal = Field(default=Decimal("0"), ge=0)
    unit_cost: Decimal = Field(default=Decimal("0"), ge=0)
    total_cost: Decimal = Field(default=Decimal("0"), ge=0)
    is_issued: bool = False

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "quantity_required": 4.0,
                "quantity_used": 4.0,
                "unit_cost": 300.0,
                "total_cost": 1200.0,
                "is_issued": True,
            }
        }
    )

PartRequirementCreate.Config = type("Config", (), {"schema_extra": PartRequirementCreate.model_config["json_schema_extra"]})


class PartRequirementUpdate(BaseModel):
    quantity_required: Decimal | None = Field(default=None, ge=0)
    quantity_used: Decimal | None = Field(default=None, ge=0)
    unit_cost: Decimal | None = Field(default=None, ge=0)
    total_cost: Decimal | None = Field(default=None, ge=0)
    is_issued: bool | None = None


class PartRequirementRead(ORMReadModel):
    id: UUID
    company_id: UUID
    work_order_id: UUID
    product_id: UUID
    quantity_required: Decimal
    quantity_used: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    is_issued: bool
    created_at: datetime
    updated_at: datetime


class FuelTransactionCreate(BaseModel):
    transaction_number: str | None = Field(default=None, max_length=64)
    vehicle_id: UUID
    driver_id: UUID | None = None
    vendor_id: UUID | None = None
    cost_center_id: UUID | None = None
    trip_id: UUID | None = None
    transaction_date: datetime | None = None
    liters: Decimal = Field(gt=0)
    fuel_type: Literal["diesel", "gasoline_91", "gasoline_95", "cng", "other"] = "diesel"
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    total_amount: Decimal = Field(default=Decimal("0"), ge=0)
    odometer_reading: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "transaction_number": "FUEL-2026-00089",
                "liters": 85.5,
                "fuel_type": "diesel",
                "unit_price": 2.35,
                "total_amount": 200.93,
                "odometer_reading": 145100.0,
                "notes": "Refueled at Highway Station 4",
            }
        }
    )

FuelTransactionCreate.Config = type("Config", (), {"schema_extra": FuelTransactionCreate.model_config["json_schema_extra"]})


class FuelTransactionUpdate(BaseModel):
    transaction_number: str | None = Field(default=None, min_length=1, max_length=64)
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    vendor_id: UUID | None = None
    cost_center_id: UUID | None = None
    trip_id: UUID | None = None
    transaction_date: datetime | None = None
    liters: Decimal | None = Field(default=None, gt=0)
    fuel_type: Literal["diesel", "gasoline_91", "gasoline_95", "cng", "other"] | None = None
    unit_price: Decimal | None = Field(default=None, ge=0)
    total_amount: Decimal | None = Field(default=None, ge=0)
    odometer_reading: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None


class FuelTransactionRead(ORMReadModel):
    id: UUID
    company_id: UUID
    transaction_number: str
    vehicle_id: UUID
    driver_id: UUID | None = None
    vendor_id: UUID | None = None
    cost_center_id: UUID | None = None
    trip_id: UUID | None = None
    transaction_date: datetime
    liters: Decimal
    fuel_type: str
    unit_price: Decimal
    total_amount: Decimal
    odometer_reading: Decimal | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ==============================================================================
# Phase 4 Schemas: Supply Chain / Agri-Logistics
# ==============================================================================

class SeasonalCropCycleCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)
    product_id: UUID | None = None
    cycle_season: Literal["winter", "spring", "summer", "autumn", "full_year"] = "spring"
    start_date: datetime
    end_date: datetime
    status: Literal["planned", "active", "harvesting", "completed", "archived"] = "planned"
    target_yield_tons: Decimal = Field(default=Decimal("0"), ge=0)
    actual_yield_tons: Decimal = Field(default=Decimal("0"), ge=0)
    cost_center_id: UUID | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "code": "CROP-2026-WHEAT",
                "name": "Wheat Season 2026 - Qassim Fields",
                "cycle_season": "spring",
                "start_date": "2026-02-01T00:00:00Z",
                "end_date": "2026-06-30T23:59:59Z",
                "status": "active",
                "target_yield_tons": 2500.0,
                "actual_yield_tons": 0.0,
            }
        }
    )

    @model_validator(mode="after")
    def validate_dates(self) -> "SeasonalCropCycleCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self

SeasonalCropCycleCreate.Config = type("Config", (), {"schema_extra": SeasonalCropCycleCreate.model_config["json_schema_extra"]})


class SeasonalCropCycleUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    product_id: UUID | None = None
    cycle_season: Literal["winter", "spring", "summer", "autumn", "full_year"] | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    status: Literal["planned", "active", "harvesting", "completed", "archived"] | None = None
    target_yield_tons: Decimal | None = Field(default=None, ge=0)
    actual_yield_tons: Decimal | None = Field(default=None, ge=0)
    cost_center_id: UUID | None = None


class SeasonalCropCycleRead(ORMReadModel):
    id: UUID
    company_id: UUID
    code: str
    name: str
    product_id: UUID | None = None
    cycle_season: str
    start_date: datetime
    end_date: datetime
    status: str
    target_yield_tons: Decimal
    actual_yield_tons: Decimal
    cost_center_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class HarvestBatchCreate(BaseModel):
    batch_number: str | None = Field(default=None, max_length=64)
    crop_cycle_id: UUID
    location_id: UUID | None = None
    harvest_date: datetime | None = None
    gross_weight: Decimal = Field(default=Decimal("0"), ge=0)
    tare_weight: Decimal = Field(default=Decimal("0"), ge=0)
    net_weight: Decimal = Field(default=Decimal("0"), ge=0)
    quality_grade: Literal["A", "B", "C", "reject"] = "A"
    moisture_percentage: Decimal | None = Field(default=None, ge=0, le=100)
    status: Literal["harvested", "inspected", "stored", "processed"] = "harvested"
    notes: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "batch_number": "HB-2026-02-001",
                "gross_weight": 24500.0,
                "tare_weight": 8500.0,
                "net_weight": 16000.0,
                "quality_grade": "A",
                "moisture_percentage": 11.2,
                "status": "harvested",
                "notes": "First harvest intake from Sector 3",
            }
        }
    )

HarvestBatchCreate.Config = type("Config", (), {"schema_extra": HarvestBatchCreate.model_config["json_schema_extra"]})


class HarvestBatchUpdate(BaseModel):
    batch_number: str | None = Field(default=None, min_length=1, max_length=64)
    crop_cycle_id: UUID | None = None
    location_id: UUID | None = None
    harvest_date: datetime | None = None
    gross_weight: Decimal | None = Field(default=None, ge=0)
    tare_weight: Decimal | None = Field(default=None, ge=0)
    net_weight: Decimal | None = Field(default=None, ge=0)
    quality_grade: Literal["A", "B", "C", "reject"] | None = None
    moisture_percentage: Decimal | None = Field(default=None, ge=0, le=100)
    status: Literal["harvested", "inspected", "stored", "processed"] | None = None
    notes: str | None = None


class HarvestBatchRead(ORMReadModel):
    id: UUID
    company_id: UUID
    batch_number: str
    crop_cycle_id: UUID
    location_id: UUID | None = None
    harvest_date: datetime
    gross_weight: Decimal
    tare_weight: Decimal
    net_weight: Decimal
    quality_grade: str
    moisture_percentage: Decimal | None = None
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class FarmGateWeighmentCreate(BaseModel):
    ticket_number: str | None = Field(default=None, max_length=64)
    harvest_batch_id: UUID
    vehicle_id: UUID | None = None
    transporter_id: UUID | None = None
    farmer_id: UUID | None = None
    weighment_date: datetime | None = None
    gross_weight: Decimal = Field(ge=0)
    tare_weight: Decimal = Field(ge=0)
    net_weight: Decimal = Field(ge=0)
    field_location_name: str | None = Field(default=None, max_length=255)
    status: Literal["draft", "pending", "approved", "locked", "cancelled"] | None = "draft"
    notes: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "ticket_number": "FGW-2026-00452",
                "gross_weight": 18500.0,
                "tare_weight": 6500.0,
                "net_weight": 12000.0,
                "field_location_name": "Al-Kharj North Farm Gate 2",
                "status": "draft",
                "notes": "Direct farm gate intake",
            }
        }
    )

    @model_validator(mode="after")
    def enforce_exact_net_weight(self) -> "FarmGateWeighmentCreate":
        expected_net = self.gross_weight - self.tare_weight
        if self.net_weight != expected_net:
            raise ValueError(f"net_weight must exactly equal gross_weight - tare_weight: {self.net_weight} != {expected_net}")
        return self

FarmGateWeighmentCreate.Config = type("Config", (), {"schema_extra": FarmGateWeighmentCreate.model_config["json_schema_extra"]})


class FarmGateWeighmentUpdate(BaseModel):
    ticket_number: str | None = Field(default=None, min_length=1, max_length=64)
    harvest_batch_id: UUID | None = None
    vehicle_id: UUID | None = None
    transporter_id: UUID | None = None
    farmer_id: UUID | None = None
    weighment_date: datetime | None = None
    gross_weight: Decimal | None = Field(default=None, ge=0)
    tare_weight: Decimal | None = Field(default=None, ge=0)
    net_weight: Decimal | None = Field(default=None, ge=0)
    field_location_name: str | None = Field(default=None, max_length=255)
    status: Literal["draft", "pending", "approved", "locked", "cancelled"] | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def enforce_exact_net_weight_update(self) -> "FarmGateWeighmentUpdate":
        if self.gross_weight is not None and self.tare_weight is not None and self.net_weight is not None:
            expected_net = self.gross_weight - self.tare_weight
            if self.net_weight != expected_net:
                raise ValueError(f"net_weight ({self.net_weight}) must exactly equal gross_weight ({self.gross_weight}) minus tare_weight ({self.tare_weight}) = {expected_net}")
        return self


class FarmGateWeighmentRead(ORMReadModel):
    id: UUID
    company_id: UUID
    ticket_number: str
    harvest_batch_id: UUID
    vehicle_id: UUID | None = None
    transporter_id: UUID | None = None
    farmer_id: UUID | None = None
    weighment_date: datetime
    gross_weight: Decimal
    tare_weight: Decimal
    net_weight: Decimal
    field_location_name: str | None = None
    status: str = "draft"
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ==============================================================================
# Phase 4 Schemas: Procurement (PO -> GR -> SI)
# ==============================================================================

class PurchaseOrderCreate(BaseModel):
    po_number: str | None = Field(default=None, max_length=64)
    partner_id: UUID
    cost_center_id: UUID | None = None
    order_date: datetime | None = None
    expected_delivery_date: datetime | None = None
    status: Literal["draft", "confirmed", "received", "billed", "cancelled"] = "draft"
    currency: str = Field(default="SAR", min_length=3, max_length=3)
    subtotal: Decimal = Field(default=Decimal("0"), ge=0)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    total_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("custom_attributes", mode="before")
    @classmethod
    def _sanitize_custom_attributes(cls, value):
        if value is None:
            return value
        from backend.app.services.custom_fields import sanitize_attributes
        return sanitize_attributes(value)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "po_number": "PO-2026-00321",
                "currency": "SAR",
                "subtotal": 10000.0,
                "tax_amount": 1500.0,
                "total_amount": 11500.0,
                "status": "draft",
                "notes": "Procurement of Agricultural Irrigation Equipment",
            }
        }
    )

PurchaseOrderCreate.Config = type("Config", (), {"schema_extra": PurchaseOrderCreate.model_config["json_schema_extra"]})


class PurchaseOrderUpdate(BaseModel):
    po_number: str | None = Field(default=None, min_length=1, max_length=64)
    partner_id: UUID | None = None
    cost_center_id: UUID | None = None
    order_date: datetime | None = None
    expected_delivery_date: datetime | None = None
    status: Literal["draft", "confirmed", "received", "billed", "cancelled"] | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    subtotal: Decimal | None = Field(default=None, ge=0)
    tax_amount: Decimal | None = Field(default=None, ge=0)
    total_amount: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None
    custom_attributes: dict[str, Any] | None = None

    @field_validator("custom_attributes", mode="before")
    @classmethod
    def _sanitize_custom_attributes(cls, value):
        if value is None:
            return value
        from backend.app.services.custom_fields import sanitize_attributes
        return sanitize_attributes(value)


class PurchaseOrderRead(ORMReadModel):
    id: UUID
    company_id: UUID
    po_number: str
    partner_id: UUID
    cost_center_id: UUID | None = None
    order_date: datetime
    expected_delivery_date: datetime | None = None
    status: str
    currency: str
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class GoodsReceiptCreate(BaseModel):
    gr_number: str | None = Field(default=None, max_length=64)
    purchase_order_id: UUID
    picking_id: UUID | None = None
    received_date: datetime | None = None
    status: Literal["draft", "inspected", "accepted", "rejected"] = "accepted"
    received_by_id: UUID | None = None
    notes: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "gr_number": "GR-2026-00109",
                "status": "accepted",
                "notes": "Delivered in full, inspection passed",
            }
        }
    )

GoodsReceiptCreate.Config = type("Config", (), {"schema_extra": GoodsReceiptCreate.model_config["json_schema_extra"]})


class GoodsReceiptUpdate(BaseModel):
    gr_number: str | None = Field(default=None, min_length=1, max_length=64)
    purchase_order_id: UUID | None = None
    picking_id: UUID | None = None
    received_date: datetime | None = None
    status: Literal["draft", "inspected", "accepted", "rejected"] | None = None
    received_by_id: UUID | None = None
    notes: str | None = None


class GoodsReceiptRead(ORMReadModel):
    id: UUID
    company_id: UUID
    gr_number: str
    purchase_order_id: UUID
    picking_id: UUID | None = None
    received_date: datetime
    status: str
    received_by_id: UUID | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class SupplierInvoiceCreate(BaseModel):
    invoice_number: str | None = Field(default=None, max_length=64)
    supplier_invoice_ref: str | None = Field(default=None, max_length=64)
    partner_id: UUID
    purchase_order_id: UUID | None = None
    goods_receipt_id: UUID | None = None
    invoice_date: datetime | None = None
    due_date: datetime | None = None
    status: str = Field(default="draft", max_length=32)
    subtotal: Decimal = Field(default=Decimal("0"), ge=0)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    total_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "invoice_number": "VINV-2026-00045",
                "supplier_invoice_ref": "SUP-INV-88912",
                "subtotal": 10000.0,
                "tax_amount": 1500.0,
                "total_amount": 11500.0,
                "status": "draft",
                "notes": "Vendor bill for Irrigation Equipment PO-2026-00321",
            }
        }
    )

SupplierInvoiceCreate.Config = type("Config", (), {"schema_extra": SupplierInvoiceCreate.model_config["json_schema_extra"]})


class SupplierInvoiceUpdate(BaseModel):
    invoice_number: str | None = Field(default=None, min_length=1, max_length=64)
    supplier_invoice_ref: str | None = Field(default=None, max_length=64)
    partner_id: UUID | None = None
    purchase_order_id: UUID | None = None
    goods_receipt_id: UUID | None = None
    move_id: UUID | None = None
    invoice_date: datetime | None = None
    due_date: datetime | None = None
    status: str | None = Field(default=None, max_length=32)
    subtotal: Decimal | None = Field(default=None, ge=0)
    tax_amount: Decimal | None = Field(default=None, ge=0)
    total_amount: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None


class SupplierInvoiceRead(ORMReadModel):
    id: UUID
    company_id: UUID
    invoice_number: str
    supplier_invoice_ref: str | None = None
    partner_id: UUID
    purchase_order_id: UUID | None = None
    goods_receipt_id: UUID | None = None
    move_id: UUID | None = None
    invoice_date: datetime
    due_date: datetime | None = None
    status: str
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ==============================================================================
# Phase 5 Schemas: Compliance & Security (Tax, ZATCA, Security Audit)
# ==============================================================================

class TaxProfileCreate(BaseModel):
    tax_id: str = Field(min_length=1, max_length=64)
    legal_name: str = Field(min_length=1, max_length=255)
    trade_name: str | None = Field(default=None, max_length=255)
    branch_name: str | None = Field(default=None, max_length=128)
    branch_number: str | None = Field(default=None, max_length=32)
    street_name: str | None = Field(default=None, max_length=255)
    building_number: str | None = Field(default=None, max_length=32)
    postal_zone: str | None = Field(default=None, max_length=32)
    city: str | None = Field(default=None, max_length=128)
    district: str | None = Field(default=None, max_length=128)
    country_code: str = Field(default="SA", min_length=2, max_length=2)
    zatca_stage: Literal["developer_portal", "simulation", "production"] = "developer_portal"
    zatca_environment: Literal["sandbox", "simulation", "production"] = "sandbox"
    csid: str | None = None
    secret_key: str | None = None
    is_active: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "tax_id": "300012345600003",
                "legal_name": "شركة ميون للنقل والخدمات اللوجستية",
                "trade_name": "ميون إكسبرس",
                "branch_name": "الفرع الرئيسي - الرياض",
                "branch_number": "101",
                "street_name": "طريق الملك فهد",
                "building_number": "7420",
                "postal_zone": "12334",
                "city": "Riyadh",
                "district": "Al-Olaya",
                "country_code": "SA",
                "zatca_stage": "simulation",
                "zatca_environment": "simulation",
                "is_active": True,
            }
        }
    )

TaxProfileCreate.Config = type("Config", (), {"schema_extra": TaxProfileCreate.model_config["json_schema_extra"]})


class TaxProfileUpdate(BaseModel):
    tax_id: str | None = Field(default=None, min_length=1, max_length=64)
    legal_name: str | None = Field(default=None, min_length=1, max_length=255)
    trade_name: str | None = Field(default=None, max_length=255)
    branch_name: str | None = Field(default=None, max_length=128)
    branch_number: str | None = Field(default=None, max_length=32)
    street_name: str | None = Field(default=None, max_length=255)
    building_number: str | None = Field(default=None, max_length=32)
    postal_zone: str | None = Field(default=None, max_length=32)
    city: str | None = Field(default=None, max_length=128)
    district: str | None = Field(default=None, max_length=128)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    zatca_stage: Literal["developer_portal", "simulation", "production"] | None = None
    zatca_environment: Literal["sandbox", "simulation", "production"] | None = None
    csid: str | None = None
    secret_key: str | None = None
    is_active: bool | None = None


class TaxProfileRead(ORMReadModel):
    id: UUID
    company_id: UUID
    tax_id: str
    legal_name: str
    trade_name: str | None = None
    branch_name: str | None = None
    branch_number: str | None = None
    street_name: str | None = None
    building_number: str | None = None
    postal_zone: str | None = None
    city: str | None = None
    district: str | None = None
    country_code: str
    zatca_stage: str
    zatca_environment: str
    csid: str | None = None
    secret_key: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TaxRuleCreate(BaseModel):
    tax_profile_id: UUID | None = None
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=128)
    rate: Decimal = Field(default=Decimal("0.1500"), ge=0)
    tax_type: Literal["vat", "withholding", "excise", "customs", "other"] = "vat"
    start_date: datetime | None = None
    end_date: datetime | None = None
    description: str | None = None
    is_active: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "code": "VAT_15",
                "name": "Standard KSA Value Added Tax 15%",
                "rate": 0.15,
                "tax_type": "vat",
                "start_date": "2020-07-01T00:00:00Z",
                "description": "Standard 15% VAT rate effective July 1, 2020 across Saudi Arabia",
                "is_active": True,
            }
        }
    )

TaxRuleCreate.Config = type("Config", (), {"schema_extra": TaxRuleCreate.model_config["json_schema_extra"]})


class TaxRuleUpdate(BaseModel):
    tax_profile_id: UUID | None = None
    code: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    rate: Decimal | None = Field(default=None, ge=0)
    tax_type: Literal["vat", "withholding", "excise", "customs", "other"] | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    description: str | None = None
    is_active: bool | None = None


class TaxRuleRead(ORMReadModel):
    id: UUID
    company_id: UUID
    tax_profile_id: UUID | None = None
    code: str
    name: str
    rate: Decimal
    tax_type: str
    start_date: datetime
    end_date: datetime | None = None
    description: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ZATCALogCreate(BaseModel):
    tax_profile_id: UUID | None = None
    invoice_id: UUID | None = None
    invoice_uuid: str | None = Field(default=None, max_length=64)
    invoice_hash: str | None = Field(default=None, max_length=128)
    previous_invoice_hash: str | None = Field(default=None, max_length=128)
    xml_payload: str | None = None
    qr_code_payload: str | None = None
    cryptographic_stamp: str | None = None
    submission_status: Literal["PENDING", "CLEARED", "REPORTED", "REJECTED", "FAILED"] = "PENDING"
    clearance_status: str | None = Field(default=None, max_length=32)
    reporting_status: str | None = Field(default=None, max_length=32)
    validation_errors: str | None = None
    warning_messages: str | None = None
    retry_count: int = Field(default=0, ge=0)
    last_attempt_at: datetime | None = None
    response_payload: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "invoice_uuid": "c3a64966-ecb8-4c92-a164-f6b86cfda12e",
                "invoice_hash": "NWZlMWMwMmRhMjA3ZjBhMmQ1MTUzYTM4MGQ2NTY1M2MwODFjMzg4OTdhNzg2N2VlYzA4OWI5Mjc4NjVkZDJjNA==",
                "previous_invoice_hash": "NWZlMWMwMmRhMjA3ZjBhMmQ1MTUzYTM4MGQ2NTY1M2MwODFjMzg4OTdhNzg2N2VlYzA4OWI5Mjc4NjVkZDJjNA==",
                "submission_status": "CLEARED",
                "clearance_status": "CLEARED",
                "reporting_status": "REPORTED",
                "retry_count": 0,
            }
        }
    )

ZATCALogCreate.Config = type("Config", (), {"schema_extra": ZATCALogCreate.model_config["json_schema_extra"]})


class ZATCALogUpdate(BaseModel):
    submission_status: Literal["PENDING", "CLEARED", "REPORTED", "REJECTED", "FAILED"] | None = None
    clearance_status: str | None = Field(default=None, max_length=32)
    reporting_status: str | None = Field(default=None, max_length=32)
    validation_errors: str | None = None
    warning_messages: str | None = None
    retry_count: int | None = Field(default=None, ge=0)
    last_attempt_at: datetime | None = None
    response_payload: str | None = None


class ZATCALogRead(ORMReadModel):
    id: UUID
    company_id: UUID
    tax_profile_id: UUID | None = None
    invoice_id: UUID | None = None
    invoice_uuid: str | None = None
    invoice_hash: str | None = None
    previous_invoice_hash: str | None = None
    xml_payload: str | None = None
    qr_code_payload: str | None = None
    cryptographic_stamp: str | None = None
    submission_status: str
    clearance_status: str | None = None
    reporting_status: str | None = None
    validation_errors: str | None = None
    warning_messages: str | None = None
    retry_count: int
    last_attempt_at: datetime | None = None
    response_payload: str | None = None
    created_at: datetime


class InvoiceMathCalculationRequest(BaseModel):
    subtotal: Decimal | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    rate: Decimal | None = None
    amount: Decimal | None = None
    vat_rate: Decimal = Decimal("0.15")


class InvoiceMathCalculationResponse(BaseModel):
    subtotal: Decimal
    vat_amount: Decimal
    grand_total: Decimal
    vat_rate: Decimal


class SecurityEventCreate(BaseModel):
    company_id: UUID | None = None
    user_id: UUID | None = None
    actor_email: str | None = Field(default=None, max_length=255)
    event_type: str = Field(min_length=1, max_length=64)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "HIGH"
    ip_address: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=512)
    request_path: str | None = Field(default=None, max_length=255)
    request_method: str | None = Field(default=None, max_length=16)
    resource_id: str | None = Field(default=None, max_length=128)
    details: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "event_type": "login_failure",
                "severity": "HIGH",
                "actor_email": "intruder@suspicious-origin.net",
                "ip_address": "197.245.10.42",
                "user_agent": "Mozilla/5.0 (Security Scanner)",
                "request_path": "/api/auth/verify",
                "request_method": "POST",
                "details": "Exceeded maximum retry attempts with invalid credentials",
            }
        }
    )

SecurityEventCreate.Config = type("Config", (), {"schema_extra": SecurityEventCreate.model_config["json_schema_extra"]})


class SecurityEventUpdate(BaseModel):
    details: str | None = None


class SecurityEventRead(ORMReadModel):
    id: UUID
    company_id: UUID | None = None
    user_id: UUID | None = None
    actor_email: str | None = None
    event_type: str
    severity: str
    ip_address: str | None = None
    user_agent: str | None = None
    request_path: str | None = None
    request_method: str | None = None
    resource_id: str | None = None
    details: str | None = None
    created_at: datetime


# ==============================================================================
# Phase 6: Mobile Sync Schemas (Device Registration, Queues, Idempotency & Batch Sync)
# ==============================================================================

class DeviceRegistrationCreate(BaseModel):
    device_token: str = Field(min_length=1, max_length=255)
    user_id: UUID | None = None
    device_model: str | None = Field(default=None, max_length=128)
    os_version: str | None = Field(default=None, max_length=64)
    app_version: str | None = Field(default=None, max_length=32)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "device_token": "fcm_token_samsung_active4_rugged_field_001",
                "device_model": "Samsung Galaxy Tab Active4 Pro Rugged",
                "os_version": "Android 14 / One UI 6.0",
                "app_version": "v2.6.4-field",
            }
        }
    )

DeviceRegistrationCreate.Config = type("Config", (), {"schema_extra": DeviceRegistrationCreate.model_config["json_schema_extra"]})


class DeviceRegistrationUpdate(BaseModel):
    user_id: UUID | None = None
    device_model: str | None = Field(default=None, max_length=128)
    os_version: str | None = Field(default=None, max_length=64)
    app_version: str | None = Field(default=None, max_length=32)
    is_revoked: bool | None = None
    revocation_reason: str | None = None


class DeviceRevokeRequest(BaseModel):
    device_token: str = Field(min_length=1, max_length=255)
    revocation_reason: str = Field(min_length=1, default="Device decommissioned or reported lost in field operations")


class DeviceRegistrationRead(ORMReadModel):
    id: UUID
    company_id: UUID
    user_id: UUID | None = None
    device_token: str
    device_model: str | None = None
    os_version: str | None = None
    app_version: str | None = None
    is_revoked: bool
    revoked_at: datetime | None = None
    revocation_reason: str | None = None
    last_sync_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SyncQueueEventCreate(BaseModel):
    operation_id: str = Field(min_length=1, max_length=128)
    entity_type: str = Field(min_length=1, max_length=64)
    action: Literal["create", "update", "delete"] = "create"
    payload: dict[str, Any] | str
    client_timestamp: datetime | None = None

    @field_validator("operation_id")
    @classmethod
    def validate_operation_id(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("operation_id cannot be empty or whitespace")
        return cleaned

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "operation_id": "op-agri-weighment-7729-20260906-001",
                "entity_type": "farm_gate_weighment",
                "action": "create",
                "client_timestamp": "2026-09-06T05:30:00Z",
                "payload": {
                    "ticket_number": "FGW-2026-REMOTE-0091",
                    "harvest_batch_id": "22919830-6ea5-4fb8-9588-e2154433d7eb",
                    "gross_weight": "19400.00",
                    "tare_weight": "7200.00",
                    "net_weight": "12200.00",
                    "field_location_name": "Al-Jawf Northern Orchard Sector 4 Gate A",
                    "notes": "Off-grid rural harvest scale intake recorded offline via tablet",
                },
            }
        }
    )

SyncQueueEventCreate.Config = type("Config", (), {"schema_extra": SyncQueueEventCreate.model_config["json_schema_extra"]})


class SyncQueueEventRead(ORMReadModel):
    id: UUID
    company_id: UUID
    device_id: UUID | None = None
    user_id: UUID | None = None
    operation_id: str
    entity_type: str
    action: str
    payload: str
    sync_status: str
    is_conflict: bool
    conflict_reason: str | None = None
    client_timestamp: datetime | None = None
    applied_at: datetime | None = None
    server_response: str | None = None
    created_at: datetime
    updated_at: datetime


class SyncBatchRequest(BaseModel):
    device_token: str = Field(min_length=1, max_length=255)
    events: list[SyncQueueEventCreate] = Field(default_factory=list)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "device_token": "fcm_token_samsung_active4_rugged_field_001",
                "events": [
                    {
                        "operation_id": "op-maint-rugged-desert-0082",
                        "entity_type": "maintenance_work_order",
                        "action": "create",
                        "client_timestamp": "2026-09-06T06:15:00Z",
                        "payload": {
                            "order_number": "WO-RUGGED-2026-099",
                            "vehicle_id": "a901844b-4b2a-45c1-923f-e7ff53efba12",
                            "order_type": "emergency",
                            "priority": "urgent",
                            "title": "Emergency Steering Linkage Repair in Remote Desert Haul",
                            "description": "Suspension and steering linkage cracked on sand dunes in Rub al-Khali corridor. Field mobile repair completed.",
                        },
                    }
                ],
            }
        }
    )

SyncBatchRequest.Config = type("Config", (), {"schema_extra": SyncBatchRequest.model_config["json_schema_extra"]})


class SyncBatchItemResult(BaseModel):
    operation_id: str
    entity_type: str
    action: str
    status: Literal["APPLIED", "REJECTED_CONFLICT", "SKIPPED_DUPLICATE", "FAILED"]
    is_conflict: bool = False
    conflict_reason: str | None = None
    server_record_id: str | None = None
    message: str | None = None


class SyncBatchResponse(BaseModel):
    processed_count: int
    applied_count: int
    conflict_count: int
    duplicate_count: int
    failed_count: int
    results: list[SyncBatchItemResult]


# ==============================================================================
# Phase 7: Warehouse & Yard Management Schemas
# ==============================================================================

class WarehouseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=128)
    address: str | None = Field(default=None, max_length=255)
    is_active: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "code": "WH-RUH-01",
                "name": "Riyadh Central Distribution & Cold Hub",
                "address": "Al-Mishael Logistics Park, Exit 18, Riyadh, KSA",
                "is_active": True,
            }
        }
    )

WarehouseCreate.Config = type("Config", (), {"schema_extra": WarehouseCreate.model_config["json_schema_extra"]})


class WarehouseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=128)
    address: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class WarehouseRead(ORMReadModel):
    id: UUID
    company_id: UUID
    code: str
    name: str
    address: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WarehouseZoneCreate(BaseModel):
    warehouse_id: UUID
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=128)
    zone_type: Literal["receiving", "storage", "picking", "staging", "cold_storage", "hazardous", "quarantine"] = "storage"
    is_active: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "warehouse_id": "8a011234-5678-4900-a001-beefcafe0001",
                "code": "ZONE-COLD-A",
                "name": "Deep Freeze & Controlled Atmosphere Produce Vault",
                "zone_type": "cold_storage",
                "is_active": True,
            }
        }
    )

WarehouseZoneCreate.Config = type("Config", (), {"schema_extra": WarehouseZoneCreate.model_config["json_schema_extra"]})


class WarehouseZoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=128)
    zone_type: Literal["receiving", "storage", "picking", "staging", "cold_storage", "hazardous", "quarantine"] | None = None
    is_active: bool | None = None


class WarehouseZoneRead(ORMReadModel):
    id: UUID
    company_id: UUID
    warehouse_id: UUID
    code: str
    name: str
    zone_type: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StockItemCreate(BaseModel):
    product_id: UUID
    sku: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=255)
    base_uom: str = Field(default="kg", min_length=1, max_length=32)
    secondary_uom: str | None = Field(default=None, max_length=32)
    conversion_factor: Decimal = Field(default=Decimal("1.0000"), gt=Decimal("0"))
    reorder_point: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0"))
    maximum_stock: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0"))
    is_active: bool = True
    custom_attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("custom_attributes", mode="before")
    @classmethod
    def _sanitize_custom_attributes(cls, value):
        if value is None:
            return value
        from backend.app.services.custom_fields import sanitize_attributes
        return sanitize_attributes(value)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "product_id": "4b2e8111-9231-4112-b001-c0ffee000001",
                "sku": "SKU-DATE-SUKARI-PREM",
                "name": "Qassim Premium Sukari Dates (Bulk Organic)",
                "base_uom": "kg",
                "secondary_uom": "carton_20kg",
                "conversion_factor": "20.0000",
                "reorder_point": "2500.00",
                "maximum_stock": "50000.00",
                "is_active": True,
            }
        }
    )

StockItemCreate.Config = type("Config", (), {"schema_extra": StockItemCreate.model_config["json_schema_extra"]})


class StockItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    base_uom: str | None = Field(default=None, max_length=32)
    secondary_uom: str | None = None
    conversion_factor: Decimal | None = Field(default=None, gt=Decimal("0"))
    reorder_point: Decimal | None = Field(default=None, ge=Decimal("0"))
    maximum_stock: Decimal | None = Field(default=None, ge=Decimal("0"))
    is_active: bool | None = None
    custom_attributes: dict[str, Any] | None = None

    @field_validator("custom_attributes", mode="before")
    @classmethod
    def _sanitize_custom_attributes(cls, value):
        if value is None:
            return value
        from backend.app.services.custom_fields import sanitize_attributes
        return sanitize_attributes(value)


class StockItemRead(ORMReadModel):
    id: UUID
    company_id: UUID
    product_id: UUID
    sku: str
    name: str
    base_uom: str
    secondary_uom: str | None = None
    conversion_factor: Decimal
    reorder_point: Decimal
    maximum_stock: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class StockLotCreate(BaseModel):
    stock_item_id: UUID
    lot_number: str = Field(min_length=2, max_length=64)
    harvest_batch_id: UUID | None = None
    initial_quantity: Decimal = Field(ge=Decimal("0"))
    remaining_quantity: Decimal | None = None
    unit_cost: Decimal = Field(ge=Decimal("0"))
    received_date: datetime = Field(default_factory=lambda: datetime.now())
    expiration_date: datetime | None = None
    status: Literal["active", "depleted", "quarantined", "expired"] = "active"
    custom_attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("custom_attributes", mode="before")
    @classmethod
    def _sanitize_custom_attributes(cls, value):
        if value is None:
            return value
        from backend.app.services.custom_fields import sanitize_attributes
        return sanitize_attributes(value)

    @model_validator(mode="after")
    def validate_lot_quantities(self) -> "StockLotCreate":
        if self.remaining_quantity is None:
            self.remaining_quantity = self.initial_quantity
        if self.remaining_quantity > self.initial_quantity:
            raise ValueError("Remaining quantity cannot exceed initial quantity.")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "stock_item_id": "c1a02988-1212-4099-b111-cafed00d0001",
                "lot_number": "LOT-2026-HARVEST-SUKARI-001",
                "harvest_batch_id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
                "initial_quantity": "15000.0000",
                "remaining_quantity": "15000.0000",
                "unit_cost": "14.5000",
                "received_date": "2026-09-06T06:00:00Z",
                "expiration_date": "2027-12-31T23:59:59Z",
                "status": "active",
            }
        }
    )

StockLotCreate.Config = type("Config", (), {"schema_extra": StockLotCreate.model_config["json_schema_extra"]})


class StockLotUpdate(BaseModel):
    remaining_quantity: Decimal | None = Field(default=None, ge=Decimal("0"))
    unit_cost: Decimal | None = Field(default=None, ge=Decimal("0"))
    expiration_date: datetime | None = None
    status: Literal["active", "depleted", "quarantined", "expired"] | None = None
    custom_attributes: dict[str, Any] | None = None

    @field_validator("custom_attributes", mode="before")
    @classmethod
    def _sanitize_custom_attributes(cls, value):
        if value is None:
            return value
        from backend.app.services.custom_fields import sanitize_attributes
        return sanitize_attributes(value)


class StockLotRead(ORMReadModel):
    id: UUID
    company_id: UUID
    stock_item_id: UUID
    lot_number: str
    harvest_batch_id: UUID | None = None
    initial_quantity: Decimal
    remaining_quantity: Decimal
    unit_cost: Decimal
    received_date: datetime
    expiration_date: datetime | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    custom_attributes: dict[str, Any] = Field(default_factory=dict)


class StockMovementCreate(BaseModel):
    movement_number: str = Field(min_length=2, max_length=64)
    stock_item_id: UUID
    lot_id: UUID | None = None
    warehouse_id: UUID
    zone_id: UUID | None = None
    movement_type: Literal["inbound", "outbound", "transfer", "adjustment", "scrap"]
    quantity: Decimal
    unit_cost: Decimal = Field(default=Decimal("0.0000"), ge=Decimal("0"))
    reference_type: str | None = Field(default=None, max_length=64)
    reference_id: str | None = Field(default=None, max_length=128)
    performed_by_id: UUID | None = None
    balance_after: Decimal = Field(description="Post-movement stock balance; must be >= 0")
    notes: str | None = None

    @model_validator(mode="after")
    def validate_non_negative_balance(self) -> "StockMovementCreate":
        # Strict validation explicitly rejecting negative stock balances by default
        if self.balance_after < Decimal("0"):
            raise ValueError(
                f"Negative stock balance rejected by default. Resulting balance {self.balance_after} is negative."
            )
        if self.movement_type in {"inbound", "outbound", "transfer"} and self.quantity <= Decimal("0"):
            raise ValueError(f"Quantity for movement type '{self.movement_type}' must be strictly positive.")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "movement_number": "MV-2026-0906-0041",
                "stock_item_id": "c1a02988-1212-4099-b111-cafed00d0001",
                "lot_id": "d2b13099-2323-41aa-c222-beefd00d0002",
                "warehouse_id": "8a011234-5678-4900-a001-beefcafe0001",
                "zone_id": "9b122345-6789-4a11-b112-feedcafe0002",
                "movement_type": "inbound",
                "quantity": "5000.0000",
                "unit_cost": "14.5000",
                "reference_type": "goods_receipt",
                "reference_id": "GR-2026-0906-0012",
                "balance_after": "15000.0000",
                "notes": "Intake from Al-Kharj Harvest Batch #2026-01 under strict FIFO allocation",
            }
        }
    )

StockMovementCreate.Config = type("Config", (), {"schema_extra": StockMovementCreate.model_config["json_schema_extra"]})


class StockMovementRead(ORMReadModel):
    id: UUID
    company_id: UUID
    movement_number: str
    stock_item_id: UUID
    lot_id: UUID | None = None
    warehouse_id: UUID
    zone_id: UUID | None = None
    movement_type: str
    quantity: Decimal
    unit_cost: Decimal
    reference_type: str | None = None
    reference_id: str | None = None
    performed_by_id: UUID | None = None
    balance_after: Decimal
    notes: str | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class YardGateAppointmentCreate(BaseModel):
    appointment_number: str = Field(min_length=2, max_length=64)
    warehouse_id: UUID
    vehicle_id: UUID | None = None
    transporter_id: UUID | None = None
    driver_name: str | None = Field(default=None, max_length=128)
    driver_phone: str | None = Field(default=None, max_length=32)
    scheduled_time: datetime
    arrival_time: datetime | None = None
    gate_in_time: datetime | None = None
    gate_out_time: datetime | None = None
    waiting_area: str | None = Field(default=None, max_length=64)
    loading_slot: str | None = Field(default=None, max_length=64)
    purpose: Literal["inbound_unloading", "outbound_loading", "cross_dock", "inspection"] = "inbound_unloading"
    status: Literal["scheduled", "arrived_waiting", "docked", "processing", "completed", "cancelled", "no_show"] = "scheduled"
    notes: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "appointment_number": "YARD-APT-2026-0906-007",
                "warehouse_id": "8a011234-5678-4900-a001-beefcafe0001",
                "vehicle_id": "7c01a111-4567-4888-b222-123456789abc",
                "transporter_id": "5b02b222-6789-4999-c333-abcdef123456",
                "driver_name": "Hamad Al-Subaie",
                "driver_phone": "+966501234567",
                "scheduled_time": "2026-09-06T08:30:00Z",
                "waiting_area": "North Staging Buffer Lane 2",
                "loading_slot": "Cold Storage Dock Bay 4",
                "purpose": "inbound_unloading",
                "status": "scheduled",
                "notes": "Refrigerated trailer transporting Grade A Organic Dates at 4°C temperature control.",
            }
        }
    )

YardGateAppointmentCreate.Config = type("Config", (), {"schema_extra": YardGateAppointmentCreate.model_config["json_schema_extra"]})


class YardGateAppointmentUpdate(BaseModel):
    arrival_time: datetime | None = None
    gate_in_time: datetime | None = None
    gate_out_time: datetime | None = None
    waiting_area: str | None = Field(default=None, max_length=64)
    loading_slot: str | None = Field(default=None, max_length=64)
    purpose: Literal["inbound_unloading", "outbound_loading", "cross_dock", "inspection"] | None = None
    status: Literal["scheduled", "arrived_waiting", "docked", "processing", "completed", "cancelled", "no_show"] | None = None
    notes: str | None = None


class YardGateAppointmentRead(ORMReadModel):
    id: UUID
    company_id: UUID
    appointment_number: str
    warehouse_id: UUID
    vehicle_id: UUID | None = None
    transporter_id: UUID | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    scheduled_time: datetime
    arrival_time: datetime | None = None
    gate_in_time: datetime | None = None
    gate_out_time: datetime | None = None
    waiting_area: str | None = None
    loading_slot: str | None = None
    purpose: str
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class StockMovementProcessRequest(BaseModel):
    warehouse_id: UUID
    stock_item_id: UUID
    movement_type: Literal["inbound", "outbound", "transfer", "adjustment", "scrap"]
    quantity: Decimal = Field(gt=Decimal("0"))
    zone_id: UUID | None = None
    unit_cost: Decimal | None = Field(default=None, ge=Decimal("0"))
    lot_number: str | None = Field(default=None, max_length=64)
    harvest_batch_id: UUID | None = None
    expiration_date: datetime | None = None
    received_date: datetime | None = None
    reference_type: str | None = Field(default=None, max_length=64)
    reference_id: str | None = Field(default=None, max_length=128)
    movement_number: str | None = Field(default=None, max_length=64)
    notes: str | None = None
    custom_attributes: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "warehouse_id": "8a011234-5678-4900-a001-beefcafe0001",
                "stock_item_id": "c1a02988-1212-4099-b111-cafed00d0001",
                "movement_type": "inbound",
                "quantity": "5000.0000",
                "unit_cost": "14.5000",
                "lot_number": "LOT-2026-0906-001",
                "reference_type": "goods_receipt",
                "reference_id": "GR-2026-0906-0012",
                "notes": "Inbound shipment intake with automatic FIFO lot creation and GL posting",
            }
        }
    )

StockMovementProcessRequest.Config = type("Config", (), {"schema_extra": StockMovementProcessRequest.model_config["json_schema_extra"]})


class StockMovementProcessResponse(BaseModel):
    success: bool = True
    movements: list[StockMovementRead]
    account_move_id: UUID | None = None
    total_quantity: Decimal
    total_valuation: Decimal
    message: str


class PasswordRotateRequest(BaseModel):
    current_password: str | None = None
    new_password: str | None = Field(default=None, max_length=128)
    regenerate_recovery_codes: bool = True


class PasswordRotateResponse(BaseModel):
    success: bool = True
    message: str
    email: str
    recovery_codes: list[str] = Field(default_factory=list)


class PlatformAuditLogRead(ORMReadModel):
    id: UUID
    actor_email: str
    action: str
    outcome: str
    endpoint_accessed: str
    request_id: str | None = None
    ip_address: str | None = None
    company_id: UUID | None = None
    created_at: datetime


class TenantUserCreateRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(default="Guest", max_length=48)


class TenantUserRead(ORMReadModel):
    id: UUID
    company_id: Optional[UUID] = None
    email: str
    full_name: str
    role: str
    iam_role: Optional[str] = None
    is_active: bool
    status: Optional[str] = "active"
    created_at: datetime


class TenantAssignmentItem(BaseModel):
    tenant_id: UUID
    tenant_name: Optional[str] = None
    role: str


class AdminUserCreateRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(default="Admin", min_length=2, max_length=48)
    company_id: Optional[UUID] = None
    tenant_ids: list[UUID] = Field(default_factory=list)
    is_superuser: bool = False


class AdminUserRead(ORMReadModel):
    id: UUID
    email: str
    full_name: str
    role: str
    iam_role: Optional[str] = None
    is_superuser: bool = False
    is_active: bool = True
    company_id: Optional[UUID] = None
    company_name: Optional[str] = None
    assigned_tenants: list[TenantAssignmentItem] = Field(default_factory=list)
    created_at: datetime


class TenantUserRoleUpdateRequest(BaseModel):
    role: str = Field(default="Guest", max_length=48)


class TenantApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    scopes: list[str] = Field(default_factory=list)
    expires_days: int = Field(default=30, ge=1, le=365)


class TenantApiKeyCreateResponse(BaseModel):
    key_id: str
    api_key: str
    name: str
    scopes: list[str]
    expires_at: datetime
    message: str


class TenantSecuritySettingsUpdateRequest(BaseModel):
    mfa_enforced: bool = True


class TenantSecuritySettingsResponse(BaseModel):
    company_id: UUID
    mfa_enforced: bool
    active_keys_count: int


# ==============================================================================
# Phase 8: Enterprise Data Residency (ADR-005) Schemas
# ==============================================================================

class TenantDatabaseConfigBase(BaseModel):
    database_name: str = Field(min_length=3, max_length=128, json_schema_extra={"example": "oxengl_tenant_a_dedicated"})
    residency_region: str = Field(default="sa-central-1", max_length=64, json_schema_extra={"example": "sa-central-1"})
    isolation_level: str = Field(default="dedicated", max_length=32, json_schema_extra={"example": "dedicated"})
    is_active: bool = Field(default=True)


class TenantDatabaseConfigCreate(TenantDatabaseConfigBase):
    connection_url: str = Field(min_length=10, description="Raw connection string to be encrypted at rest")


class TenantDatabaseConfigUpdate(BaseModel):
    database_name: str | None = Field(default=None, min_length=3, max_length=128)
    connection_url: str | None = Field(default=None, min_length=10)
    residency_region: str | None = Field(default=None, max_length=64)
    isolation_level: str | None = Field(default=None, max_length=32)
    is_active: bool | None = Field(default=None)


class TenantDatabaseConfigRead(ORMReadModel):
    id: UUID
    company_id: UUID
    database_name: str
    residency_region: str
    isolation_level: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TenantDatabaseTestConnectionRequest(BaseModel):
    host: Optional[str] = Field(default=None, max_length=255)
    port: Optional[int] = Field(default=5432, ge=1, le=65535)
    database_name: Optional[str] = Field(default=None, max_length=128)
    username: Optional[str] = Field(default=None, max_length=128)
    password: Optional[str] = Field(default=None, max_length=255)
    ssl_mode: Optional[str] = Field(default="prefer", max_length=32)
    raw_url: Optional[str] = Field(default=None)


class TenantDatabaseTestConnectionResponse(BaseModel):
    success: bool
    message: str
    host: Optional[str] = None
    database: Optional[str] = None
    ssl_mode: Optional[str] = None


class TenantDatabaseMigrationRequest(BaseModel):
    host: Optional[str] = Field(default=None, max_length=255)
    port: Optional[int] = Field(default=5432, ge=1, le=65535)
    database_name: Optional[str] = Field(default=None, max_length=128)
    username: Optional[str] = Field(default=None, max_length=128)
    password: Optional[str] = Field(default=None, max_length=255)
    ssl_mode: Optional[str] = Field(default="prefer", max_length=32)
    raw_url: Optional[str] = Field(default=None)


class TenantDatabaseMigrationResponse(BaseModel):
    success: bool
    migration_id: UUID
    status: str
    message: str
    target_database: str
    target_host: str


class TenantDatabaseMigrationStatus(BaseModel):
    migration_id: UUID
    company_id: UUID
    status: str
    progress_pct: int
    current_step: str
    records_transferred: int
    target_host: str
    target_database: str
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class TenantDatabaseInfoResponse(BaseModel):
    storage_mode: str
    is_external: bool
    database_name: str
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    ssl_mode: Optional[str] = None
    residency_region: str
    isolation_level: str
    is_active: bool
    active_since: Optional[datetime] = None



# ==============================================================================
# Phase 8 (Part 2): Enterprise Single Sign-On (ADR-008) Schemas
# ==============================================================================

class SSOProviderBase(BaseModel):
    name: str = Field(min_length=2, max_length=128, json_schema_extra={"example": "Microsoft Entra ID"})
    slug: str = Field(min_length=2, max_length=64, json_schema_extra={"example": "entra-id"})
    protocol: str = Field(default="OIDC", max_length=32, json_schema_extra={"example": "OIDC"})
    issuer_url: str | None = Field(default=None, max_length=255)
    authorization_endpoint: str = Field(min_length=5, max_length=255)
    token_endpoint: str = Field(min_length=5, max_length=255)
    userinfo_endpoint: str | None = Field(default=None, max_length=255)
    is_active: bool = Field(default=True)


class SSOProviderCreate(SSOProviderBase):
    pass


class SSOProviderRead(ORMReadModel):
    id: UUID
    name: str
    slug: str
    protocol: str
    issuer_url: str | None = None
    authorization_endpoint: str
    token_endpoint: str
    userinfo_endpoint: str | None = None
    is_active: bool
    created_at: datetime


class TenantSSOConfigBase(BaseModel):
    provider_id: UUID
    client_id: str = Field(min_length=2, max_length=255, json_schema_extra={"example": "00000000-0000-0000-0000-000000000000"})
    domain_hint: str | None = Field(default=None, max_length=128, json_schema_extra={"example": "corp.example.com"})
    role_mapping: dict[str, str] | None = Field(
        default_factory=lambda: {"Global Admin": "Super_Admin", "Tenant Admin": "Admin", "Finance": "Accountant", "Logistics": "Data_Entry"},
        description="Mapping from external IdP roles/groups to internal ERP roles",
    )
    default_role: str = Field(default="Guest", max_length=32)
    enforce_sso_only: bool = Field(default=False)
    is_active: bool = Field(default=True)


class TenantSSOConfigCreate(TenantSSOConfigBase):
    client_secret: str = Field(min_length=1, description="Raw client secret to be encrypted at rest")


class TenantSSOConfigUpdate(BaseModel):
    provider_id: UUID | None = None
    client_id: str | None = Field(default=None, min_length=2, max_length=255)
    client_secret: str | None = Field(default=None, min_length=1)
    domain_hint: str | None = Field(default=None, max_length=128)
    role_mapping: dict[str, str] | None = None
    default_role: str | None = Field(default=None, max_length=32)
    enforce_sso_only: bool | None = None
    is_active: bool | None = None


class TenantSSOConfigRead(ORMReadModel):
    id: UUID
    company_id: UUID
    provider_id: UUID
    client_id: str
    domain_hint: str | None = None
    role_mapping: str | None = None
    default_role: str
    enforce_sso_only: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    provider: SSOProviderRead | None = None


class SSOLoginInitiateRequest(BaseModel):
    company_slug: str | None = Field(default=None, description="Company slug to initiate tenant SSO")
    company_id: UUID | None = Field(default=None, description="Company UUID to initiate tenant SSO")
    domain: str | None = Field(default=None, description="Email domain hint for discovery")
    redirect_uri: str | None = Field(default=None, description="Client redirect URI")


class SSOLoginInitiateResponse(BaseModel):
    authorization_url: str
    state: str
    provider_name: str
    client_id: str


class SSOCallbackRequest(BaseModel):
    state: str = Field(min_length=10, description="Signed state token returned from IdP")
    code: str | None = Field(default=None, description="Authorization code from IdP")
    id_token: str | None = Field(default=None, description="ID Token if implicit or hybrid flow")
    claims: dict[str, Any] | None = Field(default=None, description="Simulated or pre-verified claims payload")


class SSOCallbackResponse(BaseModel):
    message: str
    status: str
    mapped_role: str
    user: dict[str, Any]


# ==============================================================================
# Phase 8 (Part 3): BI & Analytical Reporting Schemas
# ==============================================================================

class ReportingLedgerSummaryRead(ORMReadModel):
    id: UUID
    company_id: UUID
    period: str
    fiscal_year: int
    fiscal_month: int
    account_id: UUID
    account_code: str
    account_name: str
    account_type: str
    total_debit: Decimal
    total_credit: Decimal
    balance: Decimal
    entry_count: int
    last_extracted_at: datetime


class FleetUtilizationFactRead(ORMReadModel):
    id: UUID
    company_id: UUID
    period: str
    vehicle_id: UUID
    license_plate: str
    vehicle_type: str
    start_odometer: Decimal
    end_odometer: Decimal
    distance_traveled_km: Decimal
    fuel_liters: Decimal
    fuel_cost: Decimal
    maintenance_cost: Decimal
    work_order_count: int
    operational_hours: Decimal
    last_extracted_at: datetime


class ETLJobTriggerRequest(BaseModel):
    period: str | None = Field(default=None, description="Optional period YYYY-MM to extract")
    sync_all_tenants: bool = Field(default=False, description="Super_Admin only: sync across all tenants")


class ETLJobStatusResponse(BaseModel):
    status: str
    message: str
    ledger_records_extracted: int
    fleet_records_extracted: int
    period: str
    extracted_at: datetime


# ==============================================================================
# Phase 9 (Part 1): AI Governance & Safety Sandbox Schemas
# ==============================================================================

class AIModelConfigCreate(BaseModel):
    model_name: str = Field(min_length=2, max_length=64)
    provider: str = Field(default="google", max_length=32)
    endpoint_url: str | None = Field(default=None, max_length=255)
    api_key: str | None = Field(default=None, max_length=512)
    rate_limit_rpm: int = Field(default=60, ge=1, le=10000)
    rate_limit_tpm: int = Field(default=100000, ge=1, le=10000000)
    permission_tier: Literal["READ_ONLY", "ASSISTANT", "OPERATIONAL_PROPOSER", "SUPER_USER"] = "ASSISTANT"
    max_risk_tier_allowed: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    is_active: bool = True


class AIModelConfigUpdate(BaseModel):
    endpoint_url: str | None = Field(default=None, max_length=255)
    api_key: str | None = Field(default=None, max_length=512)
    rate_limit_rpm: int | None = Field(default=None, ge=1, le=10000)
    rate_limit_tpm: int | None = Field(default=None, ge=1, le=10000000)
    permission_tier: Literal["READ_ONLY", "ASSISTANT", "OPERATIONAL_PROPOSER", "SUPER_USER"] | None = None
    max_risk_tier_allowed: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] | None = None
    is_active: bool | None = None


class AIModelConfigRead(ORMReadModel):
    id: UUID
    company_id: UUID
    model_name: str
    provider: str
    endpoint_url: str | None = None
    rate_limit_rpm: int
    rate_limit_tpm: int
    permission_tier: str
    max_risk_tier_allowed: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AIGovernanceLogRead(ORMReadModel):
    id: UUID
    company_id: UUID
    user_id: UUID | None = None
    model_config_id: UUID | None = None
    agent_name: str
    prompt_hash: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    confidence_score: Decimal
    safety_validation_status: str
    risk_level: str
    action_type: str
    proposal_payload: str
    validation_errors: str | None = None
    hitl_required: bool
    hitl_approved: bool
    hitl_approved_by: UUID | None = None
    hitl_approved_at: datetime | None = None
    hitl_approval_token: str | None = None
    execution_status: str
    executed_at: datetime | None = None
    created_at: datetime


class AIProposalValidateRequest(BaseModel):
    agent_name: str = Field(min_length=2, max_length=64)
    action_type: str = Field(min_length=2, max_length=64)
    proposal_payload: dict[str, Any]
    confidence_score: Decimal = Field(ge=Decimal("0.0"), le=Decimal("1.0"))
    prompt: str = Field(default="", max_length=4096)
    model_config_id: UUID | None = None
    tokens_used: int = Field(default=0, ge=0)


class AIProposalValidateResponse(BaseModel):
    log_id: UUID
    safety_validation_status: str
    risk_level: str
    execution_status: str
    hitl_required: bool
    approval_token: str | None = None
    validation_errors: str | None = None
    message: str


class AIHITLApprovalRequest(BaseModel):
    approval_token: str = Field(min_length=16, description="Cryptographic HMAC token generated during proposal validation")


class AIHITLApprovalResponse(BaseModel):
    log_id: UUID
    status: str
    approved_by: UUID
    approved_at: datetime
    message: str


class AIProposalExecuteRequest(BaseModel):
    force_sync: bool = False


class AIProposalExecuteResponse(BaseModel):
    log_id: UUID
    execution_status: str
    executed_at: datetime
    result: dict[str, Any]
    message: str


# ==============================================================================
# Phase 9 (Part 2): Practical AI Automation & OCR Parsing Schemas
# ==============================================================================

class ParsedInvoiceLineItem(BaseModel):
    description: str = Field(min_length=1)
    quantity: Decimal = Field(default=Decimal("1.00"), ge=Decimal("0.01"))
    unit_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    line_total: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))


class ParsedInvoiceData(BaseModel):
    vendor_name: str | None = None
    vendor_tax_id: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None
    currency: str = "SAR"
    line_items: list[ParsedInvoiceLineItem] = Field(default_factory=list)
    subtotal: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    tax_total: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    grand_total: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    confidence_score: Decimal = Field(default=Decimal("1.0000"), ge=Decimal("0.0"), le=Decimal("1.0"))
    extracted_fields_count: int = 0
    warnings: list[str] = Field(default_factory=list)


class AIDocumentParseRequest(BaseModel):
    document_text: str = Field(min_length=5, description="Raw text, OCR transcript, or invoice payload")
    vendor_hint: str | None = Field(default=None, description="Optional vendor name hint")
    propose_financial_entry: bool = Field(default=True, description="Whether to generate and govern draft AccountMove")
    journal_id: UUID | None = Field(default=None, description="Optional target journal UUID")


class AIDocumentParseResponse(BaseModel):
    parsed_invoice: ParsedInvoiceData
    confidence_score: Decimal
    governance_log_id: UUID | None = None
    safety_validation_status: str | None = None
    risk_level: str | None = None
    hitl_required: bool = False
    hitl_approval_token: str | None = None
    proposed_account_move: dict[str, Any] | None = None
    message: str


# ==============================================================================
# Phase 9 (Part 3): Predictive Analytics & Supply Chain Forecasting Schemas
# ==============================================================================

class CropYieldPrediction(BaseModel):
    crop_cycle_id: UUID
    crop_cycle_code: str
    crop_cycle_name: str
    season: str
    historical_batch_count: int
    predicted_yield_kg: Decimal
    lower_bound_kg: Decimal
    upper_bound_kg: Decimal
    confidence_score: Decimal
    notes: str


class StockoutRiskItem(BaseModel):
    stock_item_id: UUID
    sku: str
    name: str
    base_uom: str
    current_stock: Decimal
    reorder_point: Decimal
    maximum_stock: Decimal
    daily_consumption_velocity: Decimal
    days_until_stockout: Decimal
    risk_level: Literal["CRITICAL", "WARNING", "SAFE"]
    recommended_reorder_qty: Decimal


class FleetAnomalyAlert(BaseModel):
    vehicle_id: UUID
    license_plate: str
    vehicle_type: str
    anomaly_type: Literal["ABNORMAL_FUEL_CONSUMPTION", "MAINTENANCE_COST_SPIKE"]
    metric_value: Decimal
    fleet_baseline_value: Decimal
    variance_percentage: Decimal
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    suggested_action: str


class RestockProposalRequest(BaseModel):
    stock_item_id: UUID
    warehouse_id: UUID | None = None
    target_quantity: Decimal | None = Field(default=None, ge=Decimal("0.01"))
    supplier_hint: str | None = None


class RestockProposalResponse(BaseModel):
    proposal_id: UUID
    stock_item_id: UUID
    sku: str
    item_name: str
    current_stock: Decimal
    proposed_quantity: Decimal
    estimated_unit_cost: Decimal
    estimated_total_cost: Decimal
    governance_log_id: UUID
    safety_validation_status: str
    risk_level: str
    hitl_required: bool
    hitl_approval_token: str | None = None
    message: str


# ==============================================================================
# Phase 5: Advanced Expansion Schemas
# ==============================================================================

class TenantSubscriptionUpdate(BaseModel):
    subscription_tier: Optional[str] = None
    tier: Optional[str] = None
    max_users: int | None = Field(default=None, ge=1)
    max_storage_gb: int | None = Field(default=None, ge=1)

    @model_validator(mode="before")
    @classmethod
    def resolve_tier(cls, data: Any) -> Any:
        if isinstance(data, dict):
            tier_val = data.get("subscription_tier") or data.get("tier")
            if tier_val:
                data["subscription_tier"] = str(tier_val).lower()
                data["tier"] = str(tier_val).lower()
        return data


class TenantBillingSummaryRead(BaseModel):
    tenant_id: UUID
    tenant_name: str
    tenant_slug: str
    subscription_tier: str
    max_users: int
    max_storage_gb: int
    current_users_count: int
    current_storage_gb: float
    current_cost_centers_count: int
    billing_cycle: str = "monthly"
    status: str = "active"
    monthly_rate_sar: Decimal
    next_billing_date: datetime | None = None


class SaaSInvoiceRead(ORMReadModel):
    id: UUID
    tenant_id: UUID
    invoice_number: str
    billing_cycle: str
    tier: str
    amount_sar: Decimal
    status: str
    issued_date: datetime
    due_date: datetime | None = None
    paid_at: datetime | None = None
    pdf_url: str | None = None


class FleetTripCreate(BaseModel):
    trip_number: str | None = Field(default=None, max_length=64)
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    origin_location: str = Field(min_length=2, max_length=255)
    destination_location: str = Field(min_length=2, max_length=255)
    cargo_description: str | None = Field(default=None, max_length=255)
    planned_weight_tons: Decimal = Field(default=Decimal("0"), ge=0)
    scheduled_departure: datetime | None = None
    notes: str | None = None


class FleetTripRead(ORMReadModel):
    id: UUID
    company_id: UUID
    trip_number: str
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    origin_location: str
    destination_location: str
    cargo_description: str | None = None
    planned_weight_tons: Decimal
    status: str
    scheduled_departure: datetime | None = None
    actual_departure: datetime | None = None
    actual_delivery: datetime | None = None
    current_latitude: Decimal | None = None
    current_longitude: Decimal | None = None
    speed_kmh: Decimal | None = None
    last_gps_at: datetime | None = None
    notes: str | None = None
    created_at: datetime


class TripStatusUpdate(BaseModel):
    status: Literal["assigned", "in_transit", "en_route_pickup", "at_pickup", "loaded", "en_route_delivery", "at_delivery", "delivered", "cancelled"]
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    speed_kmh: Decimal | None = None
    recorded_at: datetime | None = None
    notes: str | None = None


class DeliveryProofCreate(BaseModel):
    trip_id: UUID
    recipient_name: str = Field(min_length=2, max_length=128)
    recipient_phone: str | None = Field(default=None, max_length=32)
    latitude: Decimal
    longitude: Decimal
    altitude: Decimal | None = None
    accuracy_meters: Decimal | None = None
    digital_signature_data: str | None = None
    encrypted_photo_urls: list[str] | str | None = None
    delivery_notes: str | None = None
    delivered_at: datetime | None = None


class DeliveryProofRead(ORMReadModel):
    id: UUID
    company_id: UUID
    trip_id: UUID
    recipient_name: str
    recipient_phone: str | None = None
    latitude: Decimal
    longitude: Decimal
    altitude: Decimal | None = None
    accuracy_meters: Decimal | None = None
    digital_signature_data: str | None = None
    encrypted_photo_urls: str | None = None
    delivery_notes: str | None = None
    delivered_at: datetime


class TripInspectionLogCreate(BaseModel):
    trip_id: UUID | None = None
    vehicle_id: UUID
    driver_id: UUID | None = None
    inspection_type: Literal["pre_trip", "post_trip", "safety_audit"] = "pre_trip"
    odometer_reading: Decimal | None = Field(default=None, ge=0)
    is_safe_to_operate: bool = True
    notes: str | None = None


class TripInspectionLogRead(ORMReadModel):
    id: UUID
    company_id: UUID
    trip_id: UUID | None = None
    vehicle_id: UUID
    driver_id: UUID | None = None
    inspection_type: str
    odometer_reading: Decimal | None = None
    is_safe_to_operate: bool
    notes: str | None = None
    inspected_at: datetime


class TenantAnalyticsSummaryRead(BaseModel):
    total_revenue: Decimal
    outstanding_receivables: Decimal
    active_trips: int
    total_trips: int
    total_fleet_count: int
    active_vehicles_count: int
    fleet_utilization_rate: float
    total_fuel_consumed_liters: Decimal
    total_fuel_spent_sar: Decimal
    avg_fuel_price_sar: Decimal
    total_invoices_count: int
    paid_invoices_count: int


# ==============================================================================
# Phase 10: Procurement Tendering, RFQ Engine & Vendor Portal Schemas
# ==============================================================================

class TenderRFQLineCreate(BaseModel):
    item_code: str
    description: str
    quantity: Decimal = Field(..., gt=0)
    uom: str = "UNIT"
    target_unit_price: Decimal | None = None
    technical_specifications: str | None = None


class TenderRFQLineRead(ORMReadModel):
    id: UUID
    tender_id: UUID
    line_number: int
    item_code: str
    description: str
    quantity: Decimal
    uom: str
    target_unit_price: Decimal | None = None
    technical_specifications: str | None = None
    created_at: datetime


class ProcurementTenderCreate(BaseModel):
    company_id: UUID
    purchasing_organization_id: UUID
    title: str = Field(..., min_length=3, max_length=255)
    description: str | None = None
    category: str = "Raw Materials"
    submission_deadline: datetime
    bid_opening_date: datetime
    currency: str = "SAR"
    estimated_budget: Decimal | None = None
    is_sealed_bid: bool = True
    terms_and_conditions: str | None = None
    lines: list[TenderRFQLineCreate] = Field(default_factory=list)


class ProcurementTenderRead(ORMReadModel):
    id: UUID
    company_id: UUID
    purchasing_organization_id: UUID
    tender_number: str
    title: str
    description: str | None = None
    category: str
    status: str
    submission_deadline: datetime
    bid_opening_date: datetime
    currency: str
    estimated_budget: Decimal | None = None
    is_sealed_bid: bool
    bids_unsealed: bool
    unsealed_at: datetime | None = None
    winning_bid_id: UUID | None = None
    awarded_purchase_order_id: UUID | None = None
    created_at: datetime
    lines_count: int = 0
    bids_count: int = 0
    purchasing_org_name: str | None = None
    purchasing_org_code: str | None = None


class ProcurementTenderDetailRead(ProcurementTenderRead):
    terms_and_conditions: str | None = None
    lines: list[TenderRFQLineRead] = Field(default_factory=list)


class VendorPortalRegisterRequest(BaseModel):
    company_id: UUID
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=8)
    contact_name: str = Field(..., min_length=2)
    company_name: str = Field(..., min_length=2)
    mobile_number: str | None = None
    commercial_registration: str | None = None
    tax_id: str | None = None


class VendorPortalLoginRequest(BaseModel):
    email: str
    password: str
    workspace_slug: str | None = None
    company_id: UUID | None = None


class VendorPortalLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "vendor"
    vendor_user_id: UUID
    partner_id: UUID
    company_id: UUID
    company_name: str
    contact_name: str
    email: str


class ProcurementBidLineCreate(BaseModel):
    tender_line_id: UUID
    quoted_quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    notes: str | None = None
    is_alternative: bool = False


class ProcurementBidLineRead(ORMReadModel):
    id: UUID
    bid_id: UUID
    tender_line_id: UUID
    quoted_quantity: Decimal
    unit_price: Decimal | None = None  # None if masked/sealed
    total_price: Decimal | None = None  # None if masked/sealed
    notes: str | None = None
    is_alternative: bool


class ProcurementBidCreate(BaseModel):
    tender_id: UUID
    partner_id: UUID | None = None
    technical_proposal: str | None = None
    commercial_terms: str | None = None
    delivery_lead_time_days: int = Field(default=7, ge=1)
    validity_period_days: int = Field(default=60, ge=15)
    lines: list[ProcurementBidLineCreate] = Field(..., min_length=1)


class ProcurementBidRead(ORMReadModel):
    id: UUID
    tender_id: UUID
    partner_id: UUID
    bid_number: str
    total_amount: Decimal | None = None  # Masked if sealed!
    currency: str
    sealed_quote_hash: str
    is_sealed: bool
    unsealed_at: datetime | None = None
    status: str
    technical_proposal: str | None = None
    commercial_terms: str | None = None
    delivery_lead_time_days: int
    validity_period_days: int
    evaluation_score: Decimal | None = None
    evaluation_notes: str | None = None
    submission_timestamp: datetime
    vendor_name: str | None = None
    lines: list[ProcurementBidLineRead] = Field(default_factory=list)


class TenderUnsealResponse(BaseModel):
    status: str
    tender_id: UUID
    tender_number: str
    unsealed_at: datetime
    bids_unsealed_count: int
    bids: list[ProcurementBidRead]


class TenderAwardRequest(BaseModel):
    winning_bid_id: UUID
    justification_notes: str | None = None


class TenderAwardResponse(BaseModel):
    status: str
    tender_id: UUID
    winning_bid_id: UUID
    awarded_vendor_name: str
    purchase_order_id: UUID
    purchase_order_number: str
    awarded_amount: Decimal
    currency: str


class GenerateRFQFromPRRequest(BaseModel):
    purchase_requisition_id: UUID
    purchasing_organization_id: UUID
    submission_deadline: datetime
    bid_opening_date: datetime
    title: str | None = None


# ==============================================================================
# Two-Tier Dynamic Branding & Platform Settings Schemas
# ==============================================================================
class PlatformBrandingResponse(BaseModel):
    platform_name: str = Field(default="OxenGL Enterprise", description="Global platform application title")
    brand_name: str = Field(default="OxenGL Enterprise", description="Global platform brand name")
    default_logo: str = Field(default="/oxengl-logo.svg", description="Global default SVG/PNG asset logo")
    logo_url: str = Field(default="/oxengl-logo.svg", description="Global default logo URL")
    default_favicon: str | None = Field(default="/favicon.ico", description="Platform default favicon asset")
    favicon_url: str | None = Field(default="/favicon.ico", description="Platform default favicon URL")
    primary_color: str = Field(default="#f97316", description="Platform global primary brand color hex")
    accent_color: str = Field(default="#0f172a", description="Platform global accent brand color hex")
    company_name_ar: str | None = Field(default="منظومة أوكسن السحابية", description="Global platform Arabic title")
    company_name_en: str | None = Field(default="OxenGL Enterprise Cloud", description="Global platform English title")
    support_email: str | None = Field(default="contact@oxengl.me", description="Platform system support email")
    support_phone: str | None = Field(default="+966 50 123 4567", description="Platform system support telephone")

    model_config = ConfigDict(extra="allow", from_attributes=True)


class TenantBrandingResponse(BaseModel):
    id: int | None = None
    tenant_id: int | str
    brand_name: str
    logo_url: str
    favicon_url: str | None = None
    primary_color: str = "#f97316"
    accent_color: str = "#0f172a"
    custom_domain: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    landing_hero_title: str | None = None
    landing_hero_subtitle: str | None = None
    landing_cta_label: str | None = None
    landing_cta_url: str | None = None
    landing_theme_mode: str | None = None

    model_config = ConfigDict(extra="allow", from_attributes=True)


class TenantBrandingUpdate(BaseModel):
    brand_name: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    primary_color: str | None = None
    accent_color: str | None = None
    custom_domain: str | None = None
    # Phase 4: Tenant landing page content. Explicit null clears a value.
    landing_hero_title: str | None = Field(default=None, max_length=160)
    landing_hero_subtitle: str | None = Field(default=None, max_length=600)
    landing_cta_label: str | None = Field(default=None, max_length=60)
    landing_cta_url: str | None = Field(default=None, max_length=2048)
    landing_theme_mode: Literal["light", "dark"] | None = None

    @field_validator("landing_hero_title", "landing_hero_subtitle", "landing_cta_label", "landing_cta_url", mode="before")
    @classmethod
    def _blank_to_none(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("landing_cta_url")
    @classmethod
    def _safe_cta_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v.startswith("/") and not v.startswith("//"):
            return v
        if v.lower().startswith(("https://", "http://")):
            return v
        raise ValueError("landing_cta_url must be an http(s) URL or a site-relative path starting with '/'")

    model_config = ConfigDict(extra="ignore")


class PlatformBrandingUpdate(BaseModel):
    platform_name: str | None = None
    brand_name: str | None = None
    default_logo: str | None = None
    logo_url: str | None = None
    default_favicon: str | None = None
    favicon_url: str | None = None
    primary_color: str | None = None
    accent_color: str | None = None
    company_name_ar: str | None = None
    company_name_en: str | None = None
    support_email: str | None = None
    support_phone: str | None = None

    model_config = ConfigDict(extra="allow")


# ==============================================================================
# Unified Master Settings, Landing CMS & Broadcast Subsystem Schemas
# ==============================================================================
class PlatformMasterSettingsRead(BaseModel):
    id: str = "default"
    platform_name: str = "OxenGL Enterprise"
    platform_tagline: str | None = None
    logo_light_url: str | None = None
    logo_dark_url: str | None = None
    favicon_url: str | None = None
    primary_color: str = "#f97316"
    secondary_color: str = "#0f172a"
    support_email: str | None = None
    legal_terms_url: str | None = None
    privacy_policy_url: str | None = None
    custom_css: str | None = None
    enable_sovereignty_badge: bool = True
    sovereignty_badge_title: str = "Data Sovereignty & Infrastructure Policy"
    sovereignty_badge_text: str = "All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure."
    metadata: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime | None = None
    updated_by: str | None = None

    model_config = ConfigDict(extra="allow", from_attributes=True, populate_by_name=True)


# Semantic alias
PlatformMasterSettings = PlatformMasterSettingsRead


class PlatformMasterSettingsUpdate(BaseModel):
    platform_name: str | None = None
    platform_tagline: str | None = None
    logo_light_url: str | None = None
    logo_dark_url: str | None = None
    favicon_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    support_email: str | None = None
    legal_terms_url: str | None = None
    privacy_policy_url: str | None = None
    custom_css: str | None = None
    enable_sovereignty_badge: bool | None = None
    sovereignty_badge_title: str | None = None
    sovereignty_badge_text: str | None = None
    metadata: dict[str, Any] | None = None

    model_config = ConfigDict(extra="allow")


class LandingSectionRead(BaseModel):
    id: str
    section_key: str
    locale: str = "en"
    title: str | None = None
    subtitle: str | None = None
    content_data: dict[str, Any] = Field(default_factory=dict)
    sort_order: int = 0
    is_visible: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(extra="allow", from_attributes=True)


class LandingSectionUpdate(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    content_data: dict[str, Any] | None = None
    sort_order: int | None = None
    is_visible: bool | None = None
    locale: str | None = None

    model_config = ConfigDict(extra="allow")


class LandingSectionCreate(BaseModel):
    id: str | None = None
    section_key: str = Field(min_length=1, max_length=64)
    locale: str = "en"
    title: str | None = None
    subtitle: str | None = None
    content_data: dict[str, Any] = Field(default_factory=dict)
    sort_order: int = 0
    is_visible: bool = True

    model_config = ConfigDict(extra="allow")


class PublicLandingResponse(BaseModel):
    platform_settings: dict[str, Any]
    sections: list[LandingSectionRead]
    sections_map: dict[str, LandingSectionRead]
    cached_at: datetime | None = None

    model_config = ConfigDict(extra="allow")


class SystemBroadcastRead(BaseModel):
    id: str
    title: str
    message: str
    severity: str = "info"
    is_active: bool = True
    starts_at: datetime
    expires_at: datetime | None = None
    is_dismissible: bool = True
    target_scope: str = "all"
    created_at: datetime | None = None
    created_by: str | None = None

    model_config = ConfigDict(extra="allow", from_attributes=True)


class SystemBroadcastCreate(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1)
    severity: Literal["info", "warning", "critical", "maintenance"] = "info"
    is_active: bool = True
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_dismissible: bool = True
    target_scope: str = "all"

    model_config = ConfigDict(extra="allow")


class SystemBroadcastUpdate(BaseModel):
    title: str | None = None
    message: str | None = None
    severity: Literal["info", "warning", "critical", "maintenance"] | None = None
    is_active: bool | None = None
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_dismissible: bool | None = None
    target_scope: str | None = None

    model_config = ConfigDict(extra="allow")


