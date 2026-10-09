"""Phase 1 SQLAlchemy domain models for OxenGL."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import Date, JSON, BigInteger, Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, event, func, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

try:
    from .database import Base
except ImportError:
    from database import Base
from backend.app.domains.inventory.models import Material
from backend.app.domains.iam.role_catalog import ALLOWED_RES_USER_ROLES_SQL


class UserRole(str, Enum):
    SUPERADMIN = "SUPERADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    USER = "USER"
    COO = "COO"
    CEO = "CEO"
    ACCOUNTANT = "ACCOUNTANT"
    DATA_ENTRY = "DATA_ENTRY"
    GUEST = "GUEST"

    # Title-case / Normalized aliases
    Super_Admin = "Super_Admin"
    Owner = "Owner"
    Admin = "Admin"
    User = "User"



# Portable JSON column: JSONB on PostgreSQL, plain JSON elsewhere (unit tests run on SQLite).
_PortableJSON = JSON().with_variant(JSONB(), "postgresql")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ResCompany(TimestampMixin, Base):
    __tablename__ = "res_companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_companies.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    domain_slug: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)
    custom_domain: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    tax_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    commercial_registration: Mapped[Optional[str]] = mapped_column(String(10), unique=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SAR")
    fiscal_calendar: Mapped[str] = mapped_column(String(64), nullable=False, default="gregorian")
    fiscal_year_start_month: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    tax_regime: Mapped[str] = mapped_column(String(64), nullable=False, default="KSA_VAT")
    subscription_tier: Mapped[str] = mapped_column(String(32), nullable=False, default="PROFESSIONAL")
    license_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    license_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    max_cost_centers: Mapped[int] = mapped_column(Integer, nullable=False, default=25)
    theme_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="CUSTOM")
    ui_primary_color: Mapped[str] = mapped_column(String(9), nullable=False, default="#1E3A8A")
    ui_logo_url: Mapped[Optional[str]] = mapped_column(Text)
    features_override: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=True)
    logo_url = Column(Text, nullable=True, default=None)
    workspace_domain: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    signature_name: Mapped[Optional[str]] = mapped_column(String(100), default="Executive Administration", server_default=text("'Executive Administration'"), nullable=True)
    signature_title: Mapped[Optional[str]] = mapped_column(String(100), default="Operations Team", server_default=text("'Operations Team'"), nullable=True)
    support_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_smtp_settings = Column(JSONB, nullable=True, default=None)
    is_active = Column(Boolean, default=True, server_default="true", nullable=False)
    status = Column(String(20), default="ACTIVE", server_default="ACTIVE", nullable=False)
    primary_color = Column(String(7), default="#0ea5e9", server_default="#0ea5e9", nullable=False)
    secondary_color = Column(String(7), default="#0f172a", server_default="#0f172a", nullable=False)
    wallpaper_url: Mapped[Optional[str]] = mapped_column(Text)
    background_url: Mapped[Optional[str]] = mapped_column(Text)
    database_config: Mapped[Optional["TenantDatabaseConfig"]] = relationship(
        "TenantDatabaseConfig", back_populates="company", uselist=False, cascade="all, delete-orphan"
    )
    sso_config: Mapped[Optional["TenantSSOConfig"]] = relationship(
        "TenantSSOConfig", back_populates="company", uselist=False, cascade="all, delete-orphan"
    )
    parent: Mapped[Optional["ResCompany"]] = relationship(
        "ResCompany", remote_side="ResCompany.id", back_populates="children"
    )
    children: Mapped[list["ResCompany"]] = relationship(
        "ResCompany", back_populates="parent"
    )

    # Multi-Tenant Child Cascades (cascade="all, delete-orphan")
    users: Mapped[list["ResUser"]] = relationship(
        "ResUser", cascade="all, delete-orphan", passive_deletes=True
    )
    tenant_user_roles: Mapped[list["TenantUserRole"]] = relationship(
        "TenantUserRole", cascade="all, delete-orphan", passive_deletes=True, back_populates="company"
    )
    partners: Mapped[list["ResPartner"]] = relationship(
        "ResPartner", cascade="all, delete-orphan", passive_deletes=True
    )
    products: Mapped[list["ProductProduct"]] = relationship(
        "ProductProduct", cascade="all, delete-orphan", passive_deletes=True
    )
    locations: Mapped[list["StockLocation"]] = relationship(
        "StockLocation", cascade="all, delete-orphan", passive_deletes=True
    )
    pickings: Mapped[list["StockPicking"]] = relationship(
        "StockPicking", cascade="all, delete-orphan", passive_deletes=True
    )
    moves: Mapped[list["StockMove"]] = relationship(
        "StockMove", cascade="all, delete-orphan", passive_deletes=True
    )
    quants: Mapped[list["StockQuant"]] = relationship(
        "StockQuant", cascade="all, delete-orphan", passive_deletes=True
    )
    trips: Mapped[list["WeighbridgeTicket"]] = relationship(
        "WeighbridgeTicket", cascade="all, delete-orphan", passive_deletes=True
    )
    attachments: Mapped[list["OperationAttachment"]] = relationship(
        "OperationAttachment", cascade="all, delete-orphan", passive_deletes=True
    )
    transporter_ledger: Mapped[list["TransporterLedger"]] = relationship(
        "TransporterLedger", cascade="all, delete-orphan", passive_deletes=True
    )
    accounts: Mapped[list["AccountAccount"]] = relationship(
        "AccountAccount", cascade="all, delete-orphan", passive_deletes=True
    )
    journals: Mapped[list["AccountJournal"]] = relationship(
        "AccountJournal", cascade="all, delete-orphan", passive_deletes=True
    )
    fiscal_years: Mapped[list["FiscalYear"]] = relationship(
        "FiscalYear", cascade="all, delete-orphan", passive_deletes=True
    )
    cost_centers: Mapped[list["CostCenter"]] = relationship(
        "CostCenter", cascade="all, delete-orphan", passive_deletes=True, back_populates="company"
    )
    purchasing_organizations: Mapped[list["PurchasingOrganization"]] = relationship(
        "PurchasingOrganization", cascade="all, delete-orphan", passive_deletes=True, back_populates="company"
    )
    tenant_documents: Mapped[list["TenantDocument"]] = relationship(
        "TenantDocument", cascade="all, delete-orphan", passive_deletes=True, back_populates="company"
    )
    invoices: Mapped[list["CustomerInvoice"]] = relationship(
        "CustomerInvoice", cascade="all, delete-orphan", passive_deletes=True
    )
    account_moves: Mapped[list["AccountMove"]] = relationship(
        "AccountMove", cascade="all, delete-orphan", passive_deletes=True
    )
    account_move_lines: Mapped[list["AccountMoveLine"]] = relationship(
        "AccountMoveLine", cascade="all, delete-orphan", passive_deletes=True
    )
    supplier_settlements: Mapped[list["SupplierSettlement"]] = relationship(
        "SupplierSettlement", cascade="all, delete-orphan", passive_deletes=True
    )
    platform_audit_logs: Mapped[list["PlatformAuditLog"]] = relationship(
        "PlatformAuditLog", cascade="all, delete-orphan", passive_deletes=True
    )
    materials: Mapped[list["Material"]] = relationship(
        "Material", cascade="all, delete-orphan", passive_deletes=True
    )
    vehicles: Mapped[list["Vehicle"]] = relationship(
        "Vehicle", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    maintenance_orders: Mapped[list["MaintenanceWorkOrder"]] = relationship(
        "MaintenanceWorkOrder", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    part_requirements: Mapped[list["PartRequirement"]] = relationship(
        "PartRequirement", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    fuel_transactions: Mapped[list["FuelTransaction"]] = relationship(
        "FuelTransaction", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    crop_cycles: Mapped[list["SeasonalCropCycle"]] = relationship(
        "SeasonalCropCycle", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    harvest_batches: Mapped[list["HarvestBatch"]] = relationship(
        "HarvestBatch", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    farm_gate_weighments: Mapped[list["FarmGateWeighment"]] = relationship(
        "FarmGateWeighment", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(
        "PurchaseOrder", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    goods_receipts: Mapped[list["GoodsReceipt"]] = relationship(
        "GoodsReceipt", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    supplier_invoices: Mapped[list["SupplierInvoice"]] = relationship(
        "SupplierInvoice", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    tax_profiles: Mapped[list["TaxProfile"]] = relationship(
        "TaxProfile", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    tax_rules: Mapped[list["TaxRule"]] = relationship(
        "TaxRule", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    zatca_logs: Mapped[list["ZATCALog"]] = relationship(
        "ZATCALog", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    security_events: Mapped[list["SecurityEvent"]] = relationship(
        "SecurityEvent", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    device_registrations: Mapped[list["DeviceRegistration"]] = relationship(
        "DeviceRegistration", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    sync_queue_events: Mapped[list["SyncQueueEvent"]] = relationship(
        "SyncQueueEvent", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    warehouses: Mapped[list["Warehouse"]] = relationship(
        "Warehouse", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    warehouse_zones: Mapped[list["WarehouseZone"]] = relationship(
        "WarehouseZone", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    stock_items: Mapped[list["StockItem"]] = relationship(
        "StockItem", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    stock_lots: Mapped[list["StockLot"]] = relationship(
        "StockLot", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    stock_movements: Mapped[list["StockMovement"]] = relationship(
        "StockMovement", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    yard_gate_appointments: Mapped[list["YardGateAppointment"]] = relationship(
        "YardGateAppointment", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    fleet_trips: Mapped[list["FleetTrip"]] = relationship(
        "FleetTrip", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    delivery_proofs: Mapped[list["DeliveryProof"]] = relationship(
        "DeliveryProof", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    trip_inspection_logs: Mapped[list["TripInspectionLog"]] = relationship(
        "TripInspectionLog", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    reporting_ledger_summaries: Mapped[list["ReportingLedgerSummary"]] = relationship(
        "ReportingLedgerSummary", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    fleet_utilization_facts: Mapped[list["FleetUtilizationFact"]] = relationship(
        "FleetUtilizationFact", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    ai_model_configs: Mapped[list["AIModelConfig"]] = relationship(
        "AIModelConfig", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )
    ai_governance_logs: Mapped[list["AIGovernanceLog"]] = relationship(
        "AIGovernanceLog", cascade="all, delete-orphan", overlaps="company", passive_deletes=True
    )

    def __init__(self, *args, **kwargs):
        if "slug" not in kwargs:
            name_val = kwargs.get("name", "")
            base_slug = name_val.lower().replace(" ", "_")[:50]
            kwargs["slug"] = f"{base_slug}_{uuid.uuid4().hex[:6]}"
        super().__init__(*args, **kwargs)


Company = ResCompany


class TenantAuditLog(Base):
    __tablename__ = "tenant_audit_logs"
    __table_args__ = {"extend_existing": True}

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="SET NULL"), nullable=True)
    action_type = Column(String(50), nullable=False, index=True)
    actor = Column(String(100), default="CRON_SYSTEM_DAEMON")
    details = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Tenant(Base):
    """Multi-Tenant Root Registry Profile."""
    __tablename__ = "tenants"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name: Mapped[str] = mapped_column(String(150), nullable=False)
    schema_name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    logo_url = Column(Text, nullable=True, default=None)
    workspace_domain: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    signature_name: Mapped[Optional[str]] = mapped_column(String(100), default="Executive Administration", server_default=text("'Executive Administration'"), nullable=True)
    signature_title: Mapped[Optional[str]] = mapped_column(String(100), default="Operations Team", server_default=text("'Operations Team'"), nullable=True)
    support_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_smtp_settings = Column(JSONB, nullable=True, default=None)
    features_override = Column(JSONB, default=dict, server_default=text("'{}'::jsonb"))

    def __init__(self, *args, **kwargs):
        if "name" in kwargs and "company_name" not in kwargs:
            kwargs["company_name"] = kwargs.pop("name")
        super().__init__(*args, **kwargs)

    @property
    def name(self) -> str:
        return self.company_name

    @name.setter
    def name(self, value: str):
        self.company_name = value


class ResUser(TimestampMixin, Base):
    __tablename__ = "res_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firebase_uid: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    sync_reference_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True, index=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="Guest")
    role_ids: Mapped[Optional[str]] = mapped_column(Text)
    branch_scope_ids: Mapped[Optional[str]] = mapped_column(Text)
    warehouse_scope_ids: Mapped[Optional[str]] = mapped_column(Text)
    access_control_list: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mfa_secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mfa_backup_codes: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # HR-to-IAM provisioning (docs/oxengl_hr_iam_provisioning_blueprint.md): exact blueprint RBAC role,
    # ABAC constraint payload, and the first-login password-change gate.
    iam_role: Mapped[Optional[str]] = mapped_column(String(48), nullable=True)
    abac_context: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    tenant_roles: Mapped[list["TenantUserRole"]] = relationship(
        "TenantUserRole", cascade="all, delete-orphan", passive_deletes=True, back_populates="user"
    )
    hr_employee: Mapped[Optional["HrEmployee"]] = relationship(
        "HrEmployee", uselist=False, cascade="all, delete-orphan", back_populates="user"
    )

    __table_args__ = (
        CheckConstraint(f"role IN ({ALLOWED_RES_USER_ROLES_SQL})", name="ck_res_user_role"),
    )

    @property
    def is_super_admin(self) -> bool:
        if getattr(self, "_is_super_admin_override", None) is not None:
            return bool(self._is_super_admin_override)
        return self.role in ("Super_Admin", "super_admin", "SUPER_ADMIN", "SUPERADMIN")

    @is_super_admin.setter
    def is_super_admin(self, val: bool):
        self._is_super_admin_override = bool(val)
        if val:
            self.is_superuser = True

    @property
    def tenant_id(self) -> Optional[uuid.UUID]:
        return self.company_id

    @tenant_id.setter
    def tenant_id(self, val: Optional[uuid.UUID]):
        self.company_id = val

    @property
    def hashed_password(self) -> str:
        return self.password_hash

    @hashed_password.setter
    def hashed_password(self, val: str):
        self.password_hash = val

    @property
    def password(self) -> str:
        return self.password_hash

    @password.setter
    def password(self, val: str):
        from backend.two_tier_auth import hash_password
        self.password_hash = hash_password(val)

    def __init__(self, *args, **kwargs):
        if "tenant_id" in kwargs and "company_id" not in kwargs:
            kwargs["company_id"] = kwargs.pop("tenant_id")
        else:
            kwargs.pop("tenant_id", None)

        if "password" in kwargs and "password_hash" not in kwargs:
            raw_pwd = kwargs.pop("password")
            from backend.two_tier_auth import hash_password
            kwargs["password_hash"] = hash_password(raw_pwd)

        if "hashed_password" in kwargs and "password_hash" not in kwargs:
            kwargs["password_hash"] = kwargs.pop("hashed_password")

        username = kwargs.pop("username", None)
        is_superuser = kwargs.pop("is_superuser", None)
        is_super_admin = kwargs.pop("is_super_admin", None)
        if "full_name" not in kwargs:
            kwargs["full_name"] = username or kwargs.get("email", "Admin User")
        if "firebase_uid" not in kwargs:
            kwargs["firebase_uid"] = f"fb_{uuid.uuid4().hex[:16]}"
        if "role" not in kwargs:
            kwargs["role"] = "Admin"
        super().__init__(*args, **kwargs)
        if is_superuser is not None:
            self.is_superuser = is_superuser
        if is_super_admin is not None:
            self.is_super_admin = is_super_admin


# Standard alias for ResUser
User = ResUser


class PlatformAuditLog(Base):
    """Permanent server-side trace for privileged platform actions such as break-glass logins."""

    __tablename__ = "platform_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(String(40), nullable=False, default="SUCCESS", index=True)
    endpoint_accessed: Mapped[str] = mapped_column(String(255), nullable=False)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    request_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512))
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


BACKUP_PROVIDER_TYPES = ("gdrive", "onedrive", "sftp")
BACKUP_RUN_STATUSES = ("success", "failed", "running")
class CustomFieldDefinition(TimestampMixin, Base):
    """Tenant-scoped definition of a dynamic field stored under an entity's ``custom_attributes``."""
    __tablename__ = "custom_field_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    entity: Mapped[str] = mapped_column(String(48), nullable=False)
    field_key: Mapped[str] = mapped_column(String(96), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    label_ar: Mapped[Optional[str]] = mapped_column(String(255))
    data_type: Mapped[str] = mapped_column(String(16), nullable=False, default="text")
    options: Mapped[Optional[list]] = mapped_column(_PortableJSON, nullable=True)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")

    __table_args__ = (
        Index("uq_custom_field_company_entity_key", "company_id", "entity", "field_key", unique=True),
    )


class BackupDestination(Base):
    """External backup target. ``tenant_id`` NULL = platform-wide destination (platform archive only).

    ``config`` holds NON-secret settings only. Secrets never live in this column: they are stored AES-256-GCM
    encrypted in ``credentials_encrypted`` (bound to this row via AAD) or referenced by ``credential_ref``
    (``db:<id>`` for the encrypted column, or an OXENGL_BACKUP_CRED_<REF> environment reference).
    """

    __tablename__ = "backup_destinations"
    __table_args__ = (
        CheckConstraint("provider_type IN ('gdrive', 'onedrive', 'sftp')", name="ck_backup_destinations_provider"),
        CheckConstraint(
            "credential_ref IS NULL OR credential_ref ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'",
            name="ck_backup_destinations_credential_ref",
        ).ddl_if(dialect="postgresql"),
        Index("ix_backup_destinations_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=True
    )
    provider_type: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    config: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict)
    credential_ref: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    credentials_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class BackupRunLog(Base):
    """One row per upload attempt per destination. ``error_message`` is credential-scrubbed and truncated."""

    __tablename__ = "backup_run_logs"
    __table_args__ = (
        CheckConstraint("status IN ('success', 'failed', 'running')", name="ck_backup_run_logs_status"),
        Index("ix_backup_run_logs_tenant_started", "tenant_id", "started_at"),
        Index("ix_backup_run_logs_destination_id", "destination_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    destination_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backup_destinations.id", ondelete="SET NULL"), nullable=True
    )
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=True
    )
    destination_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # survives destination delete
    provider_type: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


COMMUNICATION_CHANNELS = ("email", "sms")
COMMUNICATION_PROVIDERS = ("smtp", "sendgrid", "twilio", "unifonic", "taqnyat")


class RecoveryChannelSetting(Base):
    """Per-tenant (or platform default when tenant_id is NULL) switches for password-recovery channels."""

    __tablename__ = "recovery_channel_settings"
    __table_args__ = (
        Index(
            "uq_recovery_channel_settings_tenant", "tenant_id", unique=True,
            postgresql_where=text("tenant_id IS NOT NULL"), sqlite_where=text("tenant_id IS NOT NULL"),
        ),
        Index(
            "uq_recovery_channel_settings_platform", text("(tenant_id IS NULL)"), unique=True,
            postgresql_where=text("tenant_id IS NULL"), sqlite_where=text("tenant_id IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=True
    )
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    sms_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class CommunicationSetting(Base):
    """Tenant override or platform default for transactional email/SMS delivery."""

    __tablename__ = "communication_settings"
    __table_args__ = (
        CheckConstraint("channel IN ('email', 'sms')", name="ck_communication_settings_channel"),
        CheckConstraint(
            "provider IN ('smtp', 'sendgrid', 'twilio', 'unifonic', 'taqnyat', 'custom_http')",
            name="ck_communication_settings_provider",
        ),
        CheckConstraint(
            "(channel = 'email' AND provider IN ('smtp', 'sendgrid')) OR "
            "(channel = 'sms' AND provider IN ('twilio', 'unifonic', 'taqnyat', 'custom_http'))",
            name="ck_communication_settings_channel_provider",
        ),
        CheckConstraint(
            "last_test_status IS NULL OR last_test_status IN ('success', 'failed')",
            name="ck_communication_settings_test_status",
        ),
        Index(
            "uq_communication_settings_active_tenant_channel",
            "tenant_id", "channel", unique=True,
            postgresql_where=text("is_active = true AND tenant_id IS NOT NULL"),
            sqlite_where=text("is_active = 1 AND tenant_id IS NOT NULL"),
        ),
        Index(
            "uq_communication_settings_active_platform_channel",
            "channel", unique=True,
            postgresql_where=text("is_active = true AND tenant_id IS NULL"),
            sqlite_where=text("is_active = 1 AND tenant_id IS NULL"),
        ),
        Index("ix_communication_settings_tenant_channel", "tenant_id", "channel"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=True
    )
    channel: Mapped[str] = mapped_column(String(8), nullable=False)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    sender_identity: Mapped[str] = mapped_column(String(255), nullable=False)
    config: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict)
    credentials_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    last_test_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    last_test_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
class ResPartner(TimestampMixin, Base):
    __tablename__ = "res_partners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    partner_type: Mapped[str] = mapped_column(String(32), nullable=False, default="customer")
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64))
    tax_number: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    commercial_registration: Mapped[Optional[str]] = mapped_column(String(64))
    branch_scope_ids: Mapped[Optional[str]] = mapped_column(Text)
    warehouse_scope_ids: Mapped[Optional[str]] = mapped_column(Text)
    access_control_list: Mapped[Optional[str]] = mapped_column(Text)
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict, server_default=text("'{}'"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    pickings: Mapped[list[StockPicking]] = relationship(back_populates="partner")
    transport_ledger_entries: Mapped[list[TransporterLedger]] = relationship(back_populates="transporter")

    __table_args__ = (
        CheckConstraint("partner_type IN ('raw_materials_supplier', 'service_supplier', 'customer', 'internal', 'supplier', 'transporter', 'employee', 'other')", name="ck_partner_type"),
    )


class StockLocation(TimestampMixin, Base):
    __tablename__ = "stock_locations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location_type: Mapped[str] = mapped_column(String(32), nullable=False, default="internal")
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("stock_locations.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    parent: Mapped[Optional[StockLocation]] = relationship(remote_side="StockLocation.id", back_populates="children")
    children: Mapped[list[StockLocation]] = relationship(back_populates="parent")
    source_moves: Mapped[list[StockMove]] = relationship(foreign_keys="StockMove.location_id", back_populates="source_location")
    destination_moves: Mapped[list[StockMove]] = relationship(
        foreign_keys="StockMove.location_dest_id", back_populates="destination_location"
    )
    quants: Mapped[list[StockQuant]] = relationship(back_populates="location")

    __table_args__ = (
        CheckConstraint(
            "location_type IN ('supplier', 'internal', 'customer', 'inventory', 'production', 'transit')",
            name="ck_stock_location_type",
        ),
        Index("ix_stock_locations_parent_name", "parent_id", "name"),
    )


class ProductProduct(TimestampMixin, Base):
    __tablename__ = "product_products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    product_type: Mapped[str] = mapped_column(String(32), nullable=False, default="storable")
    unit_of_measure: Mapped[str] = mapped_column(String(32), nullable=False, default="ton")
    standard_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    sale_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    moves: Mapped[list[StockMove]] = relationship(back_populates="product")
    quants: Mapped[list[StockQuant]] = relationship(back_populates="product")

    __table_args__ = (
        CheckConstraint("product_type IN ('storable', 'consumable', 'service')", name="ck_product_type"),
    )


class StockPicking(TimestampMixin, Base):
    __tablename__ = "stock_pickings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    reference: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    picking_type: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    partner_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"))
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    moves: Mapped[list[StockMove]] = relationship(back_populates="picking", cascade="all, delete-orphan")
    weighbridge_tickets: Mapped[list[WeighbridgeTicket]] = relationship(back_populates="picking", cascade="all, delete-orphan")
    partner: Mapped[Optional[ResPartner]] = relationship(back_populates="pickings")

    __table_args__ = (
        CheckConstraint("picking_type IN ('incoming', 'outgoing', 'internal')", name="ck_picking_type"),
        CheckConstraint("state IN ('draft', 'confirmed', 'assigned', 'done', 'cancelled')", name="ck_picking_state"),
        Index("ix_stock_pickings_state_scheduled", "state", "scheduled_at"),
    )


class StockMove(TimestampMixin, Base):
    __tablename__ = "stock_moves"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    picking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_pickings.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_products.id"), nullable=False)
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_locations.id"), nullable=False)
    location_dest_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_locations.id"), nullable=False)
    quantity_planned: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    quantity_done: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    moved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    picking: Mapped[StockPicking] = relationship(back_populates="moves")
    product: Mapped[ProductProduct] = relationship(back_populates="moves")
    source_location: Mapped[StockLocation] = relationship(foreign_keys=[location_id], back_populates="source_moves")
    destination_location: Mapped[StockLocation] = relationship(
        foreign_keys=[location_dest_id], back_populates="destination_moves"
    )

    __table_args__ = (
        CheckConstraint("quantity_planned >= 0", name="ck_stock_move_quantity_planned"),
        CheckConstraint("quantity_done >= 0", name="ck_stock_move_quantity_done"),
        CheckConstraint("location_id <> location_dest_id", name="ck_stock_move_distinct_locations"),
        Index("ix_stock_moves_product_state", "product_id", "state"),
    )


class StockQuant(TimestampMixin, Base):
    __tablename__ = "stock_quants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_products.id"), nullable=False)
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_locations.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    reserved_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))

    product: Mapped[ProductProduct] = relationship(back_populates="quants")
    location: Mapped[StockLocation] = relationship(back_populates="quants")

    __table_args__ = (
        CheckConstraint("reserved_quantity >= 0", name="ck_stock_quant_reserved"),
        CheckConstraint(
            "reserved_quantity = 0 OR (quantity >= 0 AND reserved_quantity <= quantity)",
            name="ck_stock_quant_reserved_available",
        ),
        Index("uq_stock_quant_product_location", "product_id", "location_id", unique=True),
    )


class WeighbridgeTicket(TimestampMixin, Base):
    __tablename__ = "weighbridge_tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    picking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_pickings.id"), nullable=False, index=True)
    truck_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    gross_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tare_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    net_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    uom: Mapped[str] = mapped_column(String(32), default="MT", nullable=False)
    unit_of_measure: Mapped[str] = mapped_column(String(32), default="MT طن", nullable=False)
    weighed_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    weighed_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Supporting documents belong to the durable operation record, not React state.
    attachments: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    scale_ticket_attachment: Mapped[Optional[str]] = mapped_column(Text)

    # Legacy Superset Fields (REM-P7) for absorbing "قاعدة البيانات الشاملة"
    material_supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    service_supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    destination_customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    loading_invoice_no: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    receipt_invoice_no: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    material_type: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    qty_loaded: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    qty_delivered: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    qty_wastage: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    wastage_percentage: Mapped[Optional[Decimal]] = mapped_column(Numeric(7, 4), nullable=True)
    sales_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    vat_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    total_sales: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    purchases_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    crusher_payment: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    net_profit: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    operation_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    operation_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_legacy_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict, server_default=text("'{}'"))

    picking: Mapped[StockPicking] = relationship(back_populates="weighbridge_tickets")

    __table_args__ = (
        CheckConstraint("gross_weight >= tare_weight", name="ck_ticket_gross_weight"),
        CheckConstraint("net_weight = gross_weight - tare_weight", name="ck_ticket_net_weight"),
        Index("ix_weighbridge_tickets_truck_weighed_in", "truck_number", "weighed_in_at"),
    )


class OperationAttachment(TimestampMixin, Base):
    __tablename__ = "operation_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=True, index=True)
    ticket_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("weighbridge_tickets.id", ondelete="CASCADE"), nullable=True, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    doc_category: Mapped[str] = mapped_column(String(64), default="Other", nullable=False)
    file_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    uploaded_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class TenantDocument(TimestampMixin, Base):
    """
    Corporate Vault model storing verified commercial registrations, ZATCA tax certificates,
    ISO compliance documents, and other RFP attachments linked to res_companies.
    """
    __tablename__ = "tenant_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    document_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, default="application/pdf")
    issue_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    issuing_authority: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(32), nullable=False, default="UNVERIFIED", server_default="UNVERIFIED", index=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    company: Mapped["ResCompany"] = relationship("ResCompany", back_populates="tenant_documents")

    __table_args__ = (
        CheckConstraint(
            "verification_status IN ('UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REJECTED')",
            name="ck_tenant_document_verification_status",
        ),
        Index("ix_tenant_docs_company_type", "company_id", "document_type"),
        Index("ix_tenant_docs_company_expiry", "company_id", "expiry_date"),
    )


class TransporterLedger(TimestampMixin, Base):
    __tablename__ = "transporter_ledger"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    transporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_partners.id"), nullable=False)
    operation_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expected_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    delivered_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    loss_percentage: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=Decimal("0"))
    ai_risk_assessment: Mapped[Optional[str]] = mapped_column(Text)

    transporter: Mapped[ResPartner] = relationship(back_populates="transport_ledger_entries")

    __table_args__ = (
        CheckConstraint("expected_qty >= 0", name="ck_transporter_ledger_expected"),
        CheckConstraint("delivered_qty >= 0", name="ck_transporter_ledger_delivered"),
        CheckConstraint("loss_percentage >= 0 AND loss_percentage <= 100", name="ck_transporter_ledger_loss"),
        Index("ix_transporter_ledger_transporter_created", "transporter_id", "created_at"),
    )


class AccountAccount(TimestampMixin, Base):
    __tablename__ = "account_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    internal_type: Mapped[str] = mapped_column(String(16), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SAR")

    move_lines: Mapped[list[AccountMoveLine]] = relationship(back_populates="account")

    __table_args__ = (
        CheckConstraint("internal_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')", name="ck_account_internal_type"),
        Index("uq_account_accounts_company_code", "company_id", "code", unique=True),
    )


class AccountJournal(TimestampMixin, Base):
    __tablename__ = "account_journals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    journal_type: Mapped[str] = mapped_column(String(32), nullable=False, default="general")
    sequence_prefix: Mapped[str] = mapped_column(String(24), nullable=False, default="MISC")
    next_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    moves: Mapped[list[AccountMove]] = relationship(back_populates="journal")

    __table_args__ = (
        CheckConstraint("journal_type IN ('general', 'sale', 'purchase', 'cash', 'bank')", name="ck_account_journal_type"),
        Index("uq_account_journals_company_code", "company_id", "code", unique=True),
    )


class FiscalYear(TimestampMixin, Base):
    __tablename__ = "fiscal_years"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    date_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    date_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="open")

    moves: Mapped[list[AccountMove]] = relationship(back_populates="fiscal_year")

    __table_args__ = (
        CheckConstraint("date_end >= date_start", name="ck_fiscal_year_dates"),
        CheckConstraint("state IN ('open', 'closed', 'locked')", name="ck_fiscal_year_state"),
        Index("uq_fiscal_years_company_name", "company_id", "name", unique=True),
    )


class CostCenter(TimestampMixin, Base):
    __tablename__ = "cost_centers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship(back_populates="cost_centers")
    parent: Mapped[Optional[CostCenter]] = relationship(remote_side="CostCenter.id", back_populates="children")
    children: Mapped[list[CostCenter]] = relationship(back_populates="parent")

    __table_args__ = (
        Index("uq_cost_centers_company_code", "company_id", "code", unique=True),
    )


class PurchasingOrganization(TimestampMixin, Base):
    """Phase 7: Enterprise Purchasing Organization for procurement and tendering negotiations."""
    __tablename__ = "purchasing_organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("purchasing_organizations.id", ondelete="SET NULL"), index=True, nullable=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SAR")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship(back_populates="purchasing_organizations")
    parent: Mapped[Optional["PurchasingOrganization"]] = relationship(remote_side="PurchasingOrganization.id", back_populates="children")
    children: Mapped[list["PurchasingOrganization"]] = relationship(back_populates="parent")

    __table_args__ = (
        Index("uq_purchasing_organizations_company_code", "company_id", "code", unique=True),
        Index("ix_purchasing_organizations_company_active", "company_id", "is_active"),
    )


# Standard alias for PurchasingOrganization
PurchasingOrg = PurchasingOrganization


class AccountMove(TimestampMixin, Base):
    __tablename__ = "account_moves"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    journal_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("account_journals.id"), index=True)
    fiscal_year_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("fiscal_years.id"), index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    sequence_number: Mapped[Optional[int]] = mapped_column(Integer)
    move_type: Mapped[str] = mapped_column(String(16), nullable=False, default="entry")
    partner_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"))
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    ref: Mapped[Optional[str]] = mapped_column(String(128))
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    lines: Mapped[list[AccountMoveLine]] = relationship(back_populates="move", cascade="all, delete-orphan")
    journal: Mapped[Optional[AccountJournal]] = relationship(back_populates="moves")
    fiscal_year: Mapped[Optional[FiscalYear]] = relationship(back_populates="moves")
    settlement: Mapped[Optional[SupplierSettlement]] = relationship(back_populates="move")

    __table_args__ = (
        CheckConstraint("move_type IN ('entry', 'out_invoice', 'in_invoice', 'settlement')", name="ck_account_move_type"),
        CheckConstraint("state IN ('draft', 'posted', 'canceled')", name="ck_account_move_state"),
        Index("ix_account_moves_company_date", "company_id", "date"),
        Index("uq_account_moves_company_name", "company_id", "name", unique=True),
    )


class AccountMoveLine(Base):
    __tablename__ = "account_move_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    move_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("account_moves.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("account_accounts.id"), nullable=False)
    partner_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"))
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"))
    debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    move: Mapped[AccountMove] = relationship(back_populates="lines")
    account: Mapped[AccountAccount] = relationship(back_populates="move_lines")
    cost_center: Mapped[Optional[CostCenter]] = relationship()

    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0", name="ck_account_move_line_amounts"),
        CheckConstraint("debit = 0 OR credit = 0", name="ck_account_move_line_single_side"),
    )


class CustomerInvoice(TimestampMixin, Base):
    __tablename__ = "customer_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    move_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("account_moves.id", ondelete="SET NULL"), unique=True)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_tax_number: Mapped[Optional[str]] = mapped_column(String(64))
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="Draft")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    grand_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    approved_by: Mapped[Optional[str]] = mapped_column(String(255))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    journal_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("finance_journal_entries.id", ondelete="SET NULL"), nullable=True, index=True)
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    partner: Mapped[Optional[ResPartner]] = relationship()
    move: Mapped[Optional[AccountMove]] = relationship()
    journal_entry: Mapped[Optional["FinanceJournalEntry"]] = relationship("FinanceJournalEntry", foreign_keys=[journal_entry_id])

    @property
    def public_token(self) -> Optional[str]:
        from sqlalchemy.orm import object_session
        session = object_session(self)
        if session:
            try:
                InvoiceClass = globals().get("Invoice")
                if InvoiceClass:
                    inv = session.query(InvoiceClass).filter(InvoiceClass.invoice_number == self.invoice_number).first()
                    if inv and inv.public_token:
                        return inv.public_token
                    inv = InvoiceClass(
                        invoice_number=self.invoice_number,
                        total_amount=self.grand_total,
                        currency="SAR",
                        payment_status="paid" if self.status in ("Issued", "Paid") else "pending",
                    )
                    session.add(inv)
                    session.flush()
                    return inv.public_token
            except Exception:
                pass
        return None


    __table_args__ = (
        CheckConstraint("status IN ('Draft', 'Approved', 'Issued', 'Cancelled')", name="ck_customer_invoice_status"),
        CheckConstraint("subtotal >= 0 AND vat_amount >= 0 AND grand_total >= 0", name="ck_customer_invoice_amounts"),
        Index("uq_customer_invoices_company_number", "company_id", "invoice_number", unique=True),
    )


def _raise_posted_move_immutable_error(operation: str) -> None:
    raise IntegrityError(operation, {}, ValueError("Posted journal entries are immutable and must be reversed, not modified."))


@event.listens_for(AccountMove, "before_update")
def prevent_posted_move_update(_, __, move: AccountMove) -> None:
    if move.state == "posted":
        state_history = inspect(move).attrs.state.history
        if state_history.deleted and state_history.deleted[0] == "draft" and state_history.added == ["posted"]:
            return
        _raise_posted_move_immutable_error("UPDATE account_moves")


@event.listens_for(AccountMove, "before_delete")
def prevent_posted_move_delete(_, __, move: AccountMove) -> None:
    if move.state == "posted":
        _raise_posted_move_immutable_error("DELETE account_moves")


@event.listens_for(AccountMoveLine, "before_update")
def prevent_posted_move_line_update(_, connection, line: AccountMoveLine) -> None:
    move = line.move
    if move and move.state == "posted":
        _raise_posted_move_immutable_error("UPDATE account_move_lines")
    elif move is None and line.move_id:
        from sqlalchemy import select
        move_state = connection.scalar(select(AccountMove.state).where(AccountMove.id == line.move_id))
        if move_state == "posted":
            _raise_posted_move_immutable_error("UPDATE account_move_lines")


@event.listens_for(AccountMoveLine, "before_delete")
def prevent_posted_move_line_delete(_, connection, line: AccountMoveLine) -> None:
    move = line.move
    if move and move.state == "posted":
        _raise_posted_move_immutable_error("DELETE account_move_lines")
    elif move is None and line.move_id:
        from sqlalchemy import select
        move_state = connection.scalar(select(AccountMove.state).where(AccountMove.id == line.move_id))
        if move_state == "posted":
            _raise_posted_move_immutable_error("DELETE account_move_lines")


class SupplierSettlement(TimestampMixin, Base):
    __tablename__ = "supplier_settlements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_partners.id"), nullable=False)
    move_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("account_moves.id"), nullable=False, unique=True)
    total_gross_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    total_penalties_loss: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    net_payable: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")

    move: Mapped[AccountMove] = relationship(back_populates="settlement")

    __table_args__ = (
        CheckConstraint("state IN ('draft', 'approved', 'paid')", name="ck_supplier_settlement_state"),
        CheckConstraint("total_gross_amount >= 0 AND total_penalties_loss >= 0 AND net_payable >= 0", name="ck_supplier_settlement_amounts"),
        CheckConstraint("period_end >= period_start", name="ck_supplier_settlement_period"),
        Index("ix_supplier_settlements_company_partner_period", "company_id", "partner_id", "period_start", "period_end"),
    )


# ==============================================================================
# Phase 4: Asset Management Models
# ==============================================================================

class Vehicle(TimestampMixin, Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    plate_number: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    license_plate: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    vin_chassis: Mapped[Optional[str]] = mapped_column(String(64))
    make: Mapped[Optional[str]] = mapped_column(String(64))
    model: Mapped[Optional[str]] = mapped_column(String(64))
    model_year: Mapped[Optional[int]] = mapped_column(Integer)
    vehicle_type: Mapped[str] = mapped_column(String(32), nullable=False, default="truck")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    current_odometer: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    breakdown_risk_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fuel_capacity: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    transporter_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship()
    transporter: Mapped[Optional[ResPartner]] = relationship()
    cost_center: Mapped[Optional[CostCenter]] = relationship()
    maintenance_orders: Mapped[list[MaintenanceWorkOrder]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    fuel_transactions: Mapped[list[FuelTransaction]] = relationship(back_populates="vehicle")

    __table_args__ = (
        CheckConstraint(
            "vehicle_type IN ('truck', 'trailer', 'pickup', 'tanker', 'forklift', 'heavy_machinery', 'other')",
            name="ck_vehicle_type",
        ),
        CheckConstraint("status IN ('active', 'maintenance', 'breakdown', 'retired')", name="ck_vehicle_status"),
        CheckConstraint("current_odometer >= 0", name="ck_vehicle_current_odometer"),
        Index("uq_vehicles_company_license_plate", "company_id", "license_plate", unique=True),
    )


class MaintenanceWorkOrder(TimestampMixin, Base):
    __tablename__ = "maintenance_work_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    order_type: Mapped[str] = mapped_column(String(32), nullable=False, default="preventive")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    odometer_reading: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    total_parts_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    total_labor_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    total_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    scheduled_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    company: Mapped[ResCompany] = relationship()
    vehicle: Mapped[Vehicle] = relationship(back_populates="maintenance_orders")
    cost_center: Mapped[Optional[CostCenter]] = relationship()
    part_requirements: Mapped[list[PartRequirement]] = relationship(back_populates="work_order", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "order_type IN ('preventive', 'corrective', 'routine', 'emergency', 'inspection')",
            name="ck_maintenance_work_order_type",
        ),
        CheckConstraint("priority IN ('low', 'medium', 'high', 'urgent')", name="ck_maintenance_work_order_priority"),
        CheckConstraint(
            "status IN ('draft', 'in_progress', 'awaiting_parts', 'completed', 'cancelled')",
            name="ck_maintenance_work_order_status",
        ),
        CheckConstraint(
            "total_parts_cost >= 0 AND total_labor_cost >= 0 AND total_cost >= 0",
            name="ck_maintenance_work_order_costs",
        ),
        Index("uq_maintenance_work_orders_company_number", "company_id", "order_number", unique=True),
    )


class PartRequirement(TimestampMixin, Base):
    __tablename__ = "part_requirements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maintenance_work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_products.id"), nullable=False, index=True)
    quantity_required: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("1"))
    quantity_used: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    total_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    is_issued: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    company: Mapped[ResCompany] = relationship()
    work_order: Mapped[MaintenanceWorkOrder] = relationship(back_populates="part_requirements")
    product: Mapped[ProductProduct] = relationship()

    __table_args__ = (
        CheckConstraint("quantity_required >= 0 AND quantity_used >= 0", name="ck_part_requirement_quantities"),
        CheckConstraint("unit_cost >= 0 AND total_cost >= 0", name="ck_part_requirement_costs"),
    )


class FuelTransaction(TimestampMixin, Base):
    __tablename__ = "fuel_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_number: Mapped[str] = mapped_column(String(64), nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    driver_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    vendor_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), index=True)
    trip_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("fleet_trips.id", ondelete="SET NULL"), index=True)
    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    liters: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    fuel_type: Mapped[str] = mapped_column(String(32), nullable=False, default="diesel")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    odometer_reading: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    company: Mapped[ResCompany] = relationship()
    vehicle: Mapped[Vehicle] = relationship(back_populates="fuel_transactions")
    driver: Mapped[Optional[ResPartner]] = relationship(foreign_keys=[driver_id])
    vendor: Mapped[Optional[ResPartner]] = relationship(foreign_keys=[vendor_id])
    cost_center: Mapped[Optional[CostCenter]] = relationship()
    trip: Mapped[Optional["FleetTrip"]] = relationship(back_populates="fuel_transactions")

    __table_args__ = (
        CheckConstraint("fuel_type IN ('diesel', 'gasoline_91', 'gasoline_95', 'cng', 'other')", name="ck_fuel_transaction_type"),
        CheckConstraint("liters > 0", name="ck_fuel_transaction_liters"),
        CheckConstraint("unit_price >= 0 AND total_amount >= 0", name="ck_fuel_transaction_amounts"),
        Index("uq_fuel_transactions_company_number", "company_id", "transaction_number", unique=True),
        Index("ix_fuel_transactions_vehicle_date", "vehicle_id", "transaction_date"),
    )


# ==============================================================================
# Phase 4: Supply Chain Models
# ==============================================================================

class SeasonalCropCycle(TimestampMixin, Base):
    __tablename__ = "seasonal_crop_cycles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("product_products.id", ondelete="SET NULL"), index=True)
    cycle_season: Mapped[str] = mapped_column(String(32), nullable=False, default="full_year")
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="planned")
    target_yield_tons: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    actual_yield_tons: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), index=True)

    company: Mapped[ResCompany] = relationship()
    product: Mapped[Optional[ProductProduct]] = relationship()
    cost_center: Mapped[Optional[CostCenter]] = relationship()
    harvest_batches: Mapped[list[HarvestBatch]] = relationship(back_populates="crop_cycle")

    __table_args__ = (
        CheckConstraint("cycle_season IN ('winter', 'spring', 'summer', 'autumn', 'full_year')", name="ck_seasonal_crop_cycle_season"),
        CheckConstraint("status IN ('planned', 'active', 'harvesting', 'completed', 'archived')", name="ck_seasonal_crop_cycle_status"),
        CheckConstraint("end_date >= start_date", name="ck_seasonal_crop_cycle_dates"),
        CheckConstraint("target_yield_tons >= 0 AND actual_yield_tons >= 0", name="ck_seasonal_crop_cycle_yields"),
        Index("uq_seasonal_crop_cycles_company_code", "company_id", "code", unique=True),
    )


class HarvestBatch(TimestampMixin, Base):
    __tablename__ = "harvest_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_number: Mapped[str] = mapped_column(String(64), nullable=False)
    crop_cycle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("seasonal_crop_cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("stock_locations.id", ondelete="SET NULL"), index=True)
    harvest_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    gross_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    tare_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    net_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    quality_grade: Mapped[str] = mapped_column(String(16), nullable=False, default="A")
    moisture_percentage: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="harvested")
    notes: Mapped[Optional[str]] = mapped_column(Text)

    company: Mapped[ResCompany] = relationship()
    crop_cycle: Mapped[SeasonalCropCycle] = relationship(back_populates="harvest_batches")
    location: Mapped[Optional[StockLocation]] = relationship()
    weighments: Mapped[list[FarmGateWeighment]] = relationship(back_populates="harvest_batch")

    __table_args__ = (
        CheckConstraint("quality_grade IN ('A', 'B', 'C', 'reject')", name="ck_harvest_batch_quality_grade"),
        CheckConstraint("status IN ('harvested', 'inspected', 'stored', 'processed')", name="ck_harvest_batch_status"),
        CheckConstraint("gross_weight >= 0 AND tare_weight >= 0 AND net_weight >= 0", name="ck_harvest_batch_weights"),
        Index("uq_harvest_batches_company_number", "company_id", "batch_number", unique=True),
    )


class FarmGateWeighment(TimestampMixin, Base):
    __tablename__ = "farm_gate_weighments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_number: Mapped[str] = mapped_column(String(64), nullable=False)
    harvest_batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("harvest_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"), index=True)
    transporter_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    farmer_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    weighment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    gross_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tare_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    net_weight: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    field_location_name: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", server_default="draft")
    notes: Mapped[Optional[str]] = mapped_column(Text)

    company: Mapped[ResCompany] = relationship()
    harvest_batch: Mapped[HarvestBatch] = relationship(back_populates="weighments")
    vehicle: Mapped[Optional[Vehicle]] = relationship()
    transporter: Mapped[Optional[ResPartner]] = relationship(foreign_keys=[transporter_id])
    farmer: Mapped[Optional[ResPartner]] = relationship(foreign_keys=[farmer_id])

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'pending', 'approved', 'locked', 'cancelled')", name="ck_farm_gate_weighment_status"),
        CheckConstraint("gross_weight >= 0 AND tare_weight >= 0 AND net_weight >= 0", name="ck_farm_gate_weighment_weights"),
        Index("uq_farm_gate_weighments_company_ticket", "company_id", "ticket_number", unique=True),
    )


# ==============================================================================
# Phase 4: Procurement Models (PO -> GR -> SI)
# ==============================================================================

class PurchaseOrder(TimestampMixin, Base):
    __tablename__ = "purchase_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    po_number: Mapped[str] = mapped_column(String(64), nullable=False)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_partners.id"), nullable=False, index=True)
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), index=True)
    purchasing_organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("purchasing_organizations.id", ondelete="SET NULL"), index=True, nullable=True)
    order_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expected_delivery_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SAR")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict, server_default=text("'{}'"))

    company: Mapped[ResCompany] = relationship()
    partner: Mapped[ResPartner] = relationship()
    cost_center: Mapped[Optional[CostCenter]] = relationship()
    purchasing_organization: Mapped[Optional[PurchasingOrganization]] = relationship()
    goods_receipts: Mapped[list[GoodsReceipt]] = relationship(back_populates="purchase_order")
    supplier_invoices: Mapped[list[SupplierInvoice]] = relationship(back_populates="purchase_order")

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'confirmed', 'received', 'billed', 'cancelled')", name="ck_purchase_order_status"),
        CheckConstraint("subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0", name="ck_purchase_order_amounts"),
        Index("uq_purchase_orders_company_number", "company_id", "po_number", unique=True),
    )


class GoodsReceipt(TimestampMixin, Base):
    __tablename__ = "goods_receipts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    gr_number: Mapped[str] = mapped_column(String(64), nullable=False)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    picking_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("stock_pickings.id", ondelete="SET NULL"), index=True)
    received_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    received_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_users.id", ondelete="SET NULL"), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    company: Mapped[ResCompany] = relationship()
    purchase_order: Mapped[PurchaseOrder] = relationship(back_populates="goods_receipts")
    picking: Mapped[Optional[StockPicking]] = relationship()
    received_by: Mapped[Optional[ResUser]] = relationship()
    supplier_invoices: Mapped[list[SupplierInvoice]] = relationship(back_populates="goods_receipt")

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'inspected', 'accepted', 'rejected')", name="ck_goods_receipt_status"),
        Index("uq_goods_receipts_company_number", "company_id", "gr_number", unique=True),
    )


class SupplierInvoice(TimestampMixin, Base):
    __tablename__ = "supplier_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False)
    supplier_invoice_ref: Mapped[Optional[str]] = mapped_column(String(64))
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_partners.id"), nullable=False, index=True)
    purchase_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("purchase_orders.id", ondelete="SET NULL"), index=True)
    goods_receipt_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("goods_receipts.id", ondelete="SET NULL"), index=True)
    move_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("account_moves.id", ondelete="SET NULL"), unique=True)
    invoice_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    company: Mapped[ResCompany] = relationship()
    partner: Mapped[ResPartner] = relationship()
    purchase_order: Mapped[Optional[PurchaseOrder]] = relationship(back_populates="supplier_invoices")
    goods_receipt: Mapped[Optional[GoodsReceipt]] = relationship(back_populates="supplier_invoices")
    move: Mapped[Optional[AccountMove]] = relationship()

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'approved', 'posted', 'paid', 'cancelled', 'exception', 'Draft', 'Approved', 'Posted', 'Paid', 'Cancelled', 'Exception')", name="ck_supplier_invoice_status"),
        CheckConstraint("subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0", name="ck_supplier_invoice_amounts"),
        Index("uq_supplier_invoices_company_number", "company_id", "invoice_number", unique=True),
    )


# ==============================================================================
# Phase 5: Compliance & Security Models (Tax, ZATCA, Security Audit)
# ==============================================================================

class TaxProfile(TimestampMixin, Base):
    __tablename__ = "tax_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    tax_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    trade_name: Mapped[Optional[str]] = mapped_column(String(255))
    branch_name: Mapped[Optional[str]] = mapped_column(String(128))
    branch_number: Mapped[Optional[str]] = mapped_column(String(32))
    street_name: Mapped[Optional[str]] = mapped_column(String(255))
    building_number: Mapped[Optional[str]] = mapped_column(String(32))
    postal_zone: Mapped[Optional[str]] = mapped_column(String(32))
    city: Mapped[Optional[str]] = mapped_column(String(128))
    district: Mapped[Optional[str]] = mapped_column(String(128))
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, default="SA")
    zatca_stage: Mapped[str] = mapped_column(String(32), nullable=False, default="developer_portal")
    zatca_environment: Mapped[str] = mapped_column(String(32), nullable=False, default="sandbox")
    csid: Mapped[Optional[str]] = mapped_column(Text)
    secret_key: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship()
    tax_rules: Mapped[list["TaxRule"]] = relationship(back_populates="tax_profile", cascade="all, delete-orphan")
    zatca_logs: Mapped[list["ZATCALog"]] = relationship(back_populates="tax_profile")

    __table_args__ = (
        CheckConstraint("zatca_stage IN ('developer_portal', 'simulation', 'production')", name="ck_tax_profile_zatca_stage"),
        CheckConstraint("zatca_environment IN ('sandbox', 'simulation', 'production')", name="ck_tax_profile_zatca_env"),
        Index("uq_tax_profiles_company_tax_id", "company_id", "tax_id", unique=True),
    )


class TaxRule(TimestampMixin, Base):
    __tablename__ = "tax_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    tax_profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("tax_profiles.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0.1500"))
    tax_type: Mapped[str] = mapped_column(String(32), nullable=False, default="vat")
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship()
    tax_profile: Mapped[Optional[TaxProfile]] = relationship(back_populates="tax_rules")

    __table_args__ = (
        CheckConstraint("rate >= 0", name="ck_tax_rule_rate_non_negative"),
        CheckConstraint("tax_type IN ('vat', 'withholding', 'excise', 'customs', 'other')", name="ck_tax_rule_type"),
        Index("uq_tax_rules_company_code", "company_id", "code", unique=True),
    )


class ZATCALog(Base):
    """ZATCA e-Invoicing Phase 2 audit log capturing XML generation, validation, clearance and reporting."""
    __tablename__ = "zatca_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    tax_profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("tax_profiles.id", ondelete="SET NULL"), index=True)
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("customer_invoices.id", ondelete="SET NULL"), index=True)
    invoice_uuid: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    invoice_hash: Mapped[Optional[str]] = mapped_column(String(128), index=True)
    previous_invoice_hash: Mapped[Optional[str]] = mapped_column(String(128))
    xml_payload: Mapped[Optional[str]] = mapped_column(Text)
    qr_code_payload: Mapped[Optional[str]] = mapped_column(Text)
    cryptographic_stamp: Mapped[Optional[str]] = mapped_column(Text)
    submission_status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING", index=True)
    clearance_status: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    reporting_status: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    validation_errors: Mapped[Optional[str]] = mapped_column(Text)
    warning_messages: Mapped[Optional[str]] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    response_payload: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    company: Mapped[ResCompany] = relationship()
    tax_profile: Mapped[Optional[TaxProfile]] = relationship(back_populates="zatca_logs")
    invoice: Mapped[Optional[CustomerInvoice]] = relationship()

    __table_args__ = (
        CheckConstraint("submission_status IN ('PENDING', 'CLEARED', 'REPORTED', 'REJECTED', 'FAILED')", name="ck_zatca_submission_status"),
        CheckConstraint("retry_count >= 0", name="ck_zatca_retry_count_non_negative"),
        Index("ix_zatca_logs_company_created", "company_id", "created_at"),
    )


class SecurityEvent(Base):
    """Immutable audit trail of security-sensitive events including login failures, IDOR attempts, and policy denials."""
    __tablename__ = "security_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_companies.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_users.id", ondelete="SET NULL"), index=True)
    actor_email: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="HIGH", index=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), index=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512))
    request_path: Mapped[Optional[str]] = mapped_column(String(255))
    request_method: Mapped[Optional[str]] = mapped_column(String(16))
    resource_id: Mapped[Optional[str]] = mapped_column(String(128))
    details: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    company: Mapped[Optional[ResCompany]] = relationship()
    user: Mapped[Optional[ResUser]] = relationship()

    __table_args__ = (
        CheckConstraint("severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", name="ck_security_event_severity"),
        Index("ix_security_events_event_created", "event_type", "created_at"),
    )


def _raise_security_audit_immutable_error(operation: str) -> None:
    raise IntegrityError(operation, {}, ValueError("Security event audit logs are immutable and cannot be modified or deleted."))


@event.listens_for(SecurityEvent, "before_update")
def prevent_security_event_update(_, __, ___):
    _raise_security_audit_immutable_error("UPDATE security_events")


@event.listens_for(SecurityEvent, "before_delete")
def prevent_security_event_delete(_, __, ___):
    _raise_security_audit_immutable_error("DELETE security_events")


# ==============================================================================
# Phase 6: Mobile Sync Models (Device Registration & Sync Queue)
# ==============================================================================

class DeviceRegistration(TimestampMixin, Base):
    __tablename__ = "device_registrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_users.id", ondelete="SET NULL"), index=True)
    device_token: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    device_model: Mapped[Optional[str]] = mapped_column(String(128))
    os_version: Mapped[Optional[str]] = mapped_column(String(64))
    app_version: Mapped[Optional[str]] = mapped_column(String(32))
    is_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revocation_reason: Mapped[Optional[str]] = mapped_column(Text)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    company: Mapped[ResCompany] = relationship()
    user: Mapped[Optional[ResUser]] = relationship()
    sync_events: Mapped[list["SyncQueueEvent"]] = relationship(back_populates="device")

    __table_args__ = (
        Index("uq_device_registrations_company_token", "company_id", "device_token", unique=True),
    )


class SyncQueueEvent(TimestampMixin, Base):
    __tablename__ = "sync_queue_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("device_registrations.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_users.id", ondelete="SET NULL"), index=True)
    operation_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False, default="create")
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    sync_status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING", index=True)
    is_conflict: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    conflict_reason: Mapped[Optional[str]] = mapped_column(Text)
    client_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    server_response: Mapped[Optional[str]] = mapped_column(Text)

    company: Mapped[ResCompany] = relationship()
    device: Mapped[Optional[DeviceRegistration]] = relationship(back_populates="sync_events")
    user: Mapped[Optional[ResUser]] = relationship()

    __table_args__ = (
        CheckConstraint("sync_status IN ('PENDING', 'APPLIED', 'REJECTED_CONFLICT', 'FAILED')", name="ck_sync_queue_event_status"),
        CheckConstraint("action IN ('create', 'update', 'delete')", name="ck_sync_queue_event_action"),
        Index("uq_sync_queue_events_company_op", "company_id", "operation_id", unique=True),
        Index("ix_sync_queue_events_company_status", "company_id", "sync_status"),
    )


# ==============================================================================
# Phase 7: Warehouse & Yard Management Models
# ==============================================================================

class Warehouse(TimestampMixin, Base):
    __tablename__ = "warehouses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship()
    zones: Mapped[list["WarehouseZone"]] = relationship(back_populates="warehouse", cascade="all, delete-orphan")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="warehouse")
    gate_appointments: Mapped[list["YardGateAppointment"]] = relationship(back_populates="warehouse")

    __table_args__ = (
        Index("uq_warehouses_company_code", "company_id", "code", unique=True),
    )


class WarehouseZone(TimestampMixin, Base):
    __tablename__ = "warehouse_zones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    zone_type: Mapped[str] = mapped_column(String(32), nullable=False, default="storage")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship()
    warehouse: Mapped[Warehouse] = relationship(back_populates="zones")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="zone")

    __table_args__ = (
        CheckConstraint(
            "zone_type IN ('receiving', 'storage', 'picking', 'staging', 'cold_storage', 'hazardous', 'quarantine')",
            name="ck_warehouse_zone_type",
        ),
        Index("uq_warehouse_zones_warehouse_code", "warehouse_id", "code", unique=True),
    )


class StockItem(TimestampMixin, Base):
    __tablename__ = "stock_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_products.id"), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_uom: Mapped[str] = mapped_column(String(32), nullable=False, default="kg")
    secondary_uom: Mapped[Optional[str]] = mapped_column(String(32))
    conversion_factor: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=Decimal("1.0000"))
    reorder_point: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    maximum_stock: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict, server_default=text("'{}'"))

    company: Mapped[ResCompany] = relationship()
    product: Mapped[ProductProduct] = relationship()
    lots: Mapped[list["StockLot"]] = relationship(back_populates="stock_item", cascade="all, delete-orphan")
    movements: Mapped[list["StockMovement"]] = relationship(back_populates="stock_item")

    __table_args__ = (
        CheckConstraint("conversion_factor > 0", name="ck_stock_item_conversion_factor"),
        CheckConstraint("reorder_point >= 0", name="ck_stock_item_reorder_point"),
        CheckConstraint("maximum_stock >= 0", name="ck_stock_item_maximum_stock"),
        Index("uq_stock_items_company_product", "company_id", "product_id", unique=True),
        Index("uq_stock_items_company_sku", "company_id", "sku", unique=True),
    )


class StockLot(TimestampMixin, Base):
    __tablename__ = "stock_lots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_items.id"), nullable=False, index=True)
    lot_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    harvest_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("harvest_batches.id", ondelete="SET NULL"), index=True)
    initial_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    remaining_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    received_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expiration_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict, server_default=text("'{}'"))

    company: Mapped[ResCompany] = relationship()
    stock_item: Mapped[StockItem] = relationship(back_populates="lots")
    harvest_batch: Mapped[Optional[HarvestBatch]] = relationship()
    movements: Mapped[list["StockMovement"]] = relationship(back_populates="lot")

    __table_args__ = (
        CheckConstraint("initial_quantity >= 0", name="ck_stock_lot_initial_quantity"),
        CheckConstraint("remaining_quantity >= 0", name="ck_stock_lot_remaining_quantity"),
        CheckConstraint("remaining_quantity <= initial_quantity", name="ck_stock_lot_remaining_le_initial"),
        CheckConstraint("unit_cost >= 0", name="ck_stock_lot_unit_cost"),
        CheckConstraint("status IN ('active', 'depleted', 'quarantined', 'expired')", name="ck_stock_lot_status"),
        Index("uq_stock_lots_company_item_lot", "company_id", "stock_item_id", "lot_number", unique=True),
        Index("ix_stock_lots_fifo_lookup", "company_id", "stock_item_id", "status", "received_date"),
    )


class StockMovement(TimestampMixin, Base):
    __tablename__ = "stock_movements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    movement_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    stock_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_items.id"), nullable=False, index=True)
    lot_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("stock_lots.id", ondelete="SET NULL"), index=True)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False, index=True)
    zone_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("warehouse_zones.id", ondelete="SET NULL"), index=True)
    movement_type: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0.0000"))
    reference_type: Mapped[Optional[str]] = mapped_column(String(64))
    reference_id: Mapped[Optional[str]] = mapped_column(String(128))
    performed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_users.id", ondelete="SET NULL"), index=True)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict, server_default=text("'{}'"))

    company: Mapped[ResCompany] = relationship()
    stock_item: Mapped[StockItem] = relationship(back_populates="movements")
    lot: Mapped[Optional[StockLot]] = relationship(back_populates="movements")
    warehouse: Mapped[Warehouse] = relationship(back_populates="stock_movements")
    zone: Mapped[Optional[WarehouseZone]] = relationship(back_populates="stock_movements")
    performed_by: Mapped[Optional[ResUser]] = relationship()

    __table_args__ = (
        CheckConstraint("movement_type IN ('inbound', 'outbound', 'transfer', 'adjustment', 'scrap')", name="ck_stock_movement_type"),
        CheckConstraint("balance_after >= 0", name="ck_stock_movement_balance_after_non_negative"),
        Index("uq_stock_movements_company_number", "company_id", "movement_number", unique=True),
        Index("ix_stock_movements_item_created", "company_id", "stock_item_id", "created_at"),
    )


@event.listens_for(StockMovement, "before_update")
def prevent_stock_movement_update(_, __, ___):
    raise ValueError("StockMovement transactions are immutable audit logs. UPDATE is prohibited.")


@event.listens_for(StockMovement, "before_delete")
def prevent_stock_movement_delete(_, __, ___):
    raise ValueError("StockMovement transactions are immutable audit logs. DELETE is prohibited.")


class YardGateAppointment(TimestampMixin, Base):
    __tablename__ = "yard_gate_appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    appointment_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False, index=True)
    vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"), index=True)
    transporter_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    driver_name: Mapped[Optional[str]] = mapped_column(String(128))
    driver_phone: Mapped[Optional[str]] = mapped_column(String(32))
    scheduled_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    arrival_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    gate_in_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    gate_out_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    waiting_area: Mapped[Optional[str]] = mapped_column(String(64))
    loading_slot: Mapped[Optional[str]] = mapped_column(String(64))
    purpose: Mapped[str] = mapped_column(String(32), nullable=False, default="inbound_unloading")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="scheduled")
    notes: Mapped[Optional[str]] = mapped_column(Text)

    company: Mapped[ResCompany] = relationship()
    warehouse: Mapped[Warehouse] = relationship(back_populates="gate_appointments")
    vehicle: Mapped[Optional[Vehicle]] = relationship()
    transporter: Mapped[Optional[ResPartner]] = relationship()

    __table_args__ = (
        CheckConstraint("purpose IN ('inbound_unloading', 'outbound_loading', 'cross_dock', 'inspection')", name="ck_yard_gate_purpose"),
        CheckConstraint("status IN ('scheduled', 'arrived_waiting', 'docked', 'processing', 'completed', 'cancelled', 'no_show')", name="ck_yard_gate_status"),
        Index("uq_yard_gate_company_number", "company_id", "appointment_number", unique=True),
        Index("ix_yard_gate_schedule", "company_id", "warehouse_id", "scheduled_time"),
    )


# ==============================================================================
# Phase 8: Enterprise Data Residency (ADR-005)
# ==============================================================================

class TenantDatabaseConfig(TimestampMixin, Base):
    """Configuration for Enterprise data residency, storing encrypted connection strings for dedicated physical databases."""
    __tablename__ = "tenant_database_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    database_name: Mapped[str] = mapped_column(String(128), nullable=False)
    encrypted_connection_url: Mapped[str] = mapped_column(Text, nullable=False)
    residency_region: Mapped[str] = mapped_column(String(64), nullable=False, default="sa-central-1")
    isolation_level: Mapped[str] = mapped_column(String(32), nullable=False, default="dedicated")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship(back_populates="database_config")

    __table_args__ = (
        CheckConstraint("isolation_level IN ('dedicated', 'shared', 'isolated')", name="ck_tenant_db_isolation"),
        Index("ix_tenant_db_active", "company_id", "is_active"),
    )


class TenantDatabaseMigration(TimestampMixin, Base):
    """Tracks live database migration jobs from local/shared container to external private databases."""
    __tablename__ = "tenant_database_migrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False, default="shared_postgres")
    target_host: Mapped[str] = mapped_column(String(255), nullable=False)
    target_port: Mapped[int] = mapped_column(Integer, nullable=False, default=5432)
    target_database: Mapped[str] = mapped_column(String(128), nullable=False)
    ssl_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="prefer")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    progress_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_step: Mapped[str] = mapped_column(String(255), nullable=False, default="Queued")
    records_transferred: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    company: Mapped[ResCompany] = relationship(foreign_keys=[company_id])

    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')", name="ck_tenant_migration_status"),
        Index("ix_tenant_migration_company", "company_id", "status"),
    )



# ==============================================================================
# Phase 8 (Part 2): Enterprise Single Sign-On (ADR-008)
# ==============================================================================

class SSOProvider(TimestampMixin, Base):
    """Federated identity provider catalog (e.g., Microsoft Entra ID, Okta)."""
    __tablename__ = "sso_providers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False, default="OIDC")
    issuer_url: Mapped[Optional[str]] = mapped_column(String(255))
    authorization_endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    token_endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    userinfo_endpoint: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    configs: Mapped[list["TenantSSOConfig"]] = relationship(back_populates="provider")

    __table_args__ = (
        CheckConstraint("protocol IN ('OIDC', 'SAML2', 'OAuth2')", name="ck_sso_provider_protocol"),
    )


class TenantSSOConfig(TimestampMixin, Base):
    """Enterprise SSO configuration per tenant, mapping external IdP claims to internal ERP roles."""
    __tablename__ = "tenant_sso_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sso_providers.id", ondelete="RESTRICT"), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(255), nullable=False)
    encrypted_client_secret: Mapped[str] = mapped_column(Text, nullable=False)
    domain_hint: Mapped[Optional[str]] = mapped_column(String(128))
    role_mapping: Mapped[Optional[str]] = mapped_column(Text)  # JSON-encoded claim-to-role mappings
    default_role: Mapped[str] = mapped_column(String(32), nullable=False, default="Guest")
    enforce_sso_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship(back_populates="sso_config")
    provider: Mapped[SSOProvider] = relationship(back_populates="configs")

    __table_args__ = (
        CheckConstraint("default_role IN ('Super_Admin', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest')", name="ck_tenant_sso_default_role"),
        Index("ix_tenant_sso_active", "company_id", "is_active"),
    )


# ==============================================================================
# Phase 8 (Part 3): BI & Analytical Reporting Extraction Layer
# ==============================================================================

class ReportingLedgerSummary(TimestampMixin, Base):
    """Aggregated general ledger balances partitioned by tenant, financial period, and account."""
    __tablename__ = "reporting_ledger_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    fiscal_month: Mapped[int] = mapped_column(Integer, nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("account_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    account_code: Mapped[str] = mapped_column(String(32), nullable=False)
    account_name: Mapped[str] = mapped_column(String(128), nullable=False)
    account_type: Mapped[str] = mapped_column(String(32), nullable=False)
    total_debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    total_credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    balance: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    entry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_extracted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company: Mapped[ResCompany] = relationship()
    account: Mapped[AccountAccount] = relationship()

    __table_args__ = (
        Index("uq_reporting_ledger_company_period_account", "company_id", "period", "account_id", unique=True),
        Index("ix_reporting_ledger_period", "company_id", "period"),
    )


class FleetUtilizationFact(TimestampMixin, Base):
    """Aggregated analytical fact table tracking vehicle utilization, operational costs, and maintenance metrics."""
    __tablename__ = "fleet_utilization_facts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    license_plate: Mapped[str] = mapped_column(String(32), nullable=False)
    vehicle_type: Mapped[str] = mapped_column(String(32), nullable=False)
    start_odometer: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    end_odometer: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    distance_traveled_km: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    fuel_liters: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    fuel_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    maintenance_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    work_order_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    operational_hours: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    last_extracted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company: Mapped[ResCompany] = relationship()
    vehicle: Mapped[Vehicle] = relationship()

    __table_args__ = (
        Index("uq_fleet_fact_company_period_vehicle", "company_id", "period", "vehicle_id", unique=True),
        Index("ix_fleet_fact_period", "company_id", "period"),
    )


# ==============================================================================
# Phase 9: AI Governance & Safety Sandbox Models
# ==============================================================================

class AIModelConfig(TimestampMixin, Base):
    """Configuration and rate limit control for registered AI model endpoints."""
    __tablename__ = "ai_model_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="google")
    endpoint_url: Mapped[Optional[str]] = mapped_column(String(255))
    encrypted_api_key: Mapped[Optional[str]] = mapped_column(String(512))
    rate_limit_rpm: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    rate_limit_tpm: Mapped[int] = mapped_column(Integer, nullable=False, default=100000)
    permission_tier: Mapped[str] = mapped_column(String(32), nullable=False, default="ASSISTANT")
    max_risk_tier_allowed: Mapped[str] = mapped_column(String(16), nullable=False, default="MEDIUM")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company: Mapped[ResCompany] = relationship()
    governance_logs: Mapped[list["AIGovernanceLog"]] = relationship(back_populates="model_config")

    __table_args__ = (
        CheckConstraint("permission_tier IN ('READ_ONLY', 'ASSISTANT', 'OPERATIONAL_PROPOSER', 'SUPER_USER')", name="ck_ai_model_config_permission"),
        CheckConstraint("max_risk_tier_allowed IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", name="ck_ai_model_config_risk"),
        CheckConstraint("rate_limit_rpm > 0 AND rate_limit_tpm > 0", name="ck_ai_model_config_limits"),
        Index("uq_ai_model_configs_company_model", "company_id", "model_name", unique=True),
    )


class AIGovernanceLog(TimestampMixin, Base):
    """Immutable audit trail of AI agent suggestions, safety evaluations, and HITL approvals."""
    __tablename__ = "ai_governance_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_users.id", ondelete="SET NULL"), index=True)
    model_config_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("ai_model_configs.id", ondelete="SET NULL"), index=True)
    agent_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confidence_score: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False, default=Decimal("1.0000"))
    safety_validation_status: Mapped[str] = mapped_column(String(32), nullable=False, default="PASSED")
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False, default="LOW")
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    proposal_payload: Mapped[str] = mapped_column(Text, nullable=False)
    validation_errors: Mapped[Optional[str]] = mapped_column(Text)
    hitl_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hitl_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hitl_approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_users.id", ondelete="SET NULL"))
    hitl_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    hitl_approval_token: Mapped[Optional[str]] = mapped_column(String(128))
    execution_status: Mapped[str] = mapped_column(String(32), nullable=False, default="PROPOSED")
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    company: Mapped[ResCompany] = relationship()
    user: Mapped[Optional[ResUser]] = relationship(foreign_keys=[user_id])
    model_config: Mapped[Optional[AIModelConfig]] = relationship(back_populates="governance_logs")
    approver: Mapped[Optional[ResUser]] = relationship(foreign_keys=[hitl_approved_by])

    __table_args__ = (
        CheckConstraint(
            "safety_validation_status IN ('PASSED', 'BLOCKED', 'FLAGGED', 'PENDING_APPROVAL')",
            name="ck_ai_gov_log_safety_status",
        ),
        CheckConstraint(
            "risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')",
            name="ck_ai_gov_log_risk_level",
        ),
        CheckConstraint(
            "execution_status IN ('PROPOSED', 'APPROVED', 'EXECUTED', 'REJECTED', 'BLOCKED')",
            name="ck_ai_gov_log_execution_status",
        ),
        CheckConstraint("confidence_score >= 0.0 AND confidence_score <= 1.0", name="ck_ai_gov_log_confidence"),
        Index("ix_ai_gov_log_company_created", "company_id", "created_at"),
    )


# ==============================================================================
# Two-Tier Authentication and Identity Subsystem Models
# Level 1: Control Plane (Master Portal) & Level 2: Tenant Plane
# ==============================================================================

class MasterTenant(TimestampMixin, Base):
    """Level 1: Central Control Plane master tenant directory."""
    __tablename__ = "master_tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    custom_domain: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True)
    owner_full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_email: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_mobile: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    subscription_tier: Mapped[str] = mapped_column(String(32), default="standard", nullable=False)
    max_users: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    max_storage_gb: Mapped[int] = mapped_column(Integer, default=25, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)

    # Paddle SaaS Subscription Metadata
    subscription_plan: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, default="trial", server_default=text("'trial'"))
    subscription_status: Mapped[str] = mapped_column(String(32), nullable=False, default="trialing", server_default=text("'trialing'"))
    paddle_customer_id: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True, index=True)
    paddle_subscription_id: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True, index=True)
    license_expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    features_override: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    workspace_domain: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    signature_name: Mapped[Optional[str]] = mapped_column(String(100), default="Executive Administration", server_default=text("'Executive Administration'"), nullable=True)
    signature_title: Mapped[Optional[str]] = mapped_column(String(100), default="Operations Team", server_default=text("'Operations Team'"), nullable=True)
    support_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_smtp_settings = Column(JSONB, nullable=True, default=None)

    @property
    def grade(self) -> str:
        return (self.subscription_tier or "PROFESSIONAL").upper()

    @grade.setter
    def grade(self, value: str):
        self.subscription_tier = (value or "PROFESSIONAL").lower()

    database_config: Mapped["TenantDatabase"] = relationship(
        "TenantDatabase", back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )
    subscription: Mapped[Optional["TenantSubscription"]] = relationship(
        "TenantSubscription", back_populates="tenant", uselist=False, cascade="all, delete-orphan", foreign_keys="TenantSubscription.tenant_id"
    )
    saas_invoices: Mapped[list["SaaSInvoice"]] = relationship(
        "SaaSInvoice", back_populates="tenant", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("status IN ('provisioning', 'active', 'suspended', 'deprovisioned')", name="ck_master_tenant_status"),
        CheckConstraint("subscription_tier IN ('starter', 'standard', 'growth', 'enterprise', 'free', 'professional')", name="ck_master_tenant_tier"),
    )


class TenantDatabase(Base):
    """Level 1: Dedicated database routing and encrypted DSN store for tenant physical isolation."""
    __tablename__ = "tenant_databases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("master_tenants.id", ondelete="CASCADE"), unique=True, nullable=False)
    database_name: Mapped[str] = mapped_column(String(128), nullable=False)
    encrypted_dsn: Mapped[str] = mapped_column(Text, nullable=False)
    host: Mapped[str] = mapped_column(String(255), default="localhost", nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=5432, nullable=False)
    residency_region: Mapped[str] = mapped_column(String(64), default="sa-central-1", nullable=False)
    pool_size: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    max_overflow: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[MasterTenant] = relationship("MasterTenant", back_populates="database_config")

    __table_args__ = (
        Index("ix_tenant_databases_active", "tenant_id", "is_active"),
    )


class MasterUser(TimestampMixin, Base):
    """Level 1: Control Plane staff and platform operators (isolated from tenant users)."""
    __tablename__ = "master_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    mobile_number: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True, default=None, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="user", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    tfa_secret: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, default=None)
    tfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('super_admin', 'admin', 'user')", name="ck_master_user_role"),
    )

    def __init__(self, **kwargs):
        if "hashed_password" in kwargs and "password_hash" not in kwargs:
            kwargs["password_hash"] = kwargs.pop("hashed_password")
        if "mobile_number" not in kwargs:
            kwargs["mobile_number"] = None
        super().__init__(**kwargs)

    @property
    def hashed_password(self) -> str:
        return self.password_hash

    @hashed_password.setter
    def hashed_password(self, val: str):
        self.password_hash = val

    @property
    def is_super_admin(self) -> bool:
        return self.role == "super_admin"

    @is_super_admin.setter
    def is_super_admin(self, val: bool):
        self._is_super_admin_override = bool(val)
        if val:
            self.is_superuser = True


class MasterPasswordReset(Base):
    """Level 1: Control Plane self-service OTP and password reset requests."""
    __tablename__ = "master_password_resets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("master_users.id", ondelete="CASCADE"), nullable=False)
    identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    reset_token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MasterAuditLog(Base):
    """Level 1: Immutable audit trail for Control Plane operations and tenant provisioning."""
    __tablename__ = "master_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    actor_identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    target_tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("master_tenants.id", ondelete="SET NULL"))
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(String(512))
    outcome: Mapped[str] = mapped_column(String(32), default="SUCCESS", nullable=False)
    details: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_master_audit_action_time", "action", "created_at"),
    )


class PlatformFeatureFlag(TimestampMixin, Base):
    """Level 1: Platform-wide feature flag state persisted in PostgreSQL."""
    __tablename__ = "platform_feature_flags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flag_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rollout_percent: Mapped[int] = mapped_column(Integer, default=100, nullable=False)



class TenantUser(TimestampMixin, Base):
    """Level 2: Tenant-specific company employees and operators."""
    __tablename__ = "tenant_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    mobile_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(128), nullable=False)
    last_name: Mapped[str] = mapped_column(String(128), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="user", nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    department: Mapped[Optional[str]] = mapped_column(String(128))
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    invited_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("tenant_users.id", ondelete="SET NULL"))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    tfa_secret: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, default=None)
    tfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'ADMIN', 'Admin', 'owner', 'OWNER', 'Owner', 'ceo', 'user', 'USER', 'guest_user')", name="ck_tenant_user_role"),
    )


class TenantUserRole(TimestampMixin, Base):
    """Level 2: Relational mapping between users and multiple tenant workspaces with localized roles."""
    __tablename__ = "tenant_user_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_users.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="Data_Entry")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)

    user: Mapped["ResUser"] = relationship("ResUser", back_populates="tenant_roles")
    company: Mapped["ResCompany"] = relationship("ResCompany", back_populates="tenant_user_roles")

    @property
    def tenant_id(self) -> uuid.UUID:
        return self.company_id

    @tenant_id.setter
    def tenant_id(self, val: uuid.UUID):
        self.company_id = val

    __table_args__ = (
        Index("uq_tenant_user_roles_user_company", "user_id", "company_id", unique=True),
    )


class HrEmployee(TimestampMixin, Base):
    """Core HR employee profile with 1-to-1 linkage to ResUser IAM and strict tenant isolation."""
    __tablename__ = "hr_employees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    department_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    job_title: Mapped[str] = mapped_column(String(128), nullable=False, default="Standard")
    hire_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    employment_status: Mapped[str] = mapped_column(String(32), nullable=False, default="ACTIVE")
    base_salary: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True)

    user: Mapped["ResUser"] = relationship("ResUser", back_populates="hr_employee")
    company: Mapped["ResCompany"] = relationship("ResCompany")
    manager: Mapped[Optional["HrEmployee"]] = relationship("HrEmployee", remote_side="HrEmployee.id")

    @property
    def tenant_id(self) -> uuid.UUID:
        return self.company_id

    @tenant_id.setter
    def tenant_id(self, val: uuid.UUID):
        self.company_id = val

    __table_args__ = (
        Index("uq_hr_employees_company_employee_id", "company_id", "employee_id", unique=True),
    )


class TenantPasswordReset(Base):
    """Level 2: Tenant-specific self-service OTP and password reset requests."""
    __tablename__ = "tenant_password_resets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_users.id", ondelete="CASCADE"), nullable=False)
    identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    reset_token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TenantUserInvitation(Base):
    """Level 2: Tenant user invitation tokens."""
    __tablename__ = "tenant_user_invitations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    mobile_number: Mapped[Optional[str]] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(32), default="user", nullable=False)
    invited_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_users.id", ondelete="CASCADE"), nullable=False)
    invite_token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'ADMIN', 'Admin', 'owner', 'OWNER', 'Owner', 'user', 'USER', 'guest_user')", name="ck_tenant_invite_role"),
    )


# ==============================================================================
# Phase 5: Advanced Product Expansion Models
# ==============================================================================

class SaaSInvoice(TimestampMixin, Base):
    """Level 1: Central SaaS subscription invoices for tenant billing."""
    __tablename__ = "saas_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("master_tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("tenant_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True)
    plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    billing_cycle: Mapped[str] = mapped_column(String(32), nullable=False, default="monthly")
    tier: Mapped[str] = mapped_column(String(32), nullable=False, default="standard")
    amount_sar: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    subtotal_sar: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default=text("0"))
    tax_sar: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default=text("0"))
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="SAR", server_default=text("'SAR'"))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="paid")
    payment_method: Mapped[str] = mapped_column(String(64), nullable=False, default="stripe_card", server_default=text("'stripe_card'"))
    payment_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    po_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    issued_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    pdf_url: Mapped[Optional[str]] = mapped_column(String(255))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    tenant: Mapped["MasterTenant"] = relationship(back_populates="saas_invoices")
    subscription: Mapped[Optional["TenantSubscription"]] = relationship("TenantSubscription", back_populates="invoices")
    plan: Mapped[Optional["SubscriptionPlan"]] = relationship("SubscriptionPlan")

    __table_args__ = (
        CheckConstraint("status IN ('paid', 'pending', 'overdue', 'cancelled')", name="ck_saas_invoice_status"),
        CheckConstraint("billing_cycle IN ('monthly', 'yearly', 'annual', 'quarterly', 'contract')", name="ck_saas_invoice_cycle"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "subscription_id": str(self.subscription_id) if self.subscription_id else None,
            "plan_id": str(self.plan_id) if self.plan_id else None,
            "invoice_number": self.invoice_number,
            "billing_cycle": self.billing_cycle,
            "tier": self.tier,
            "amount_sar": float(self.amount_sar) if self.amount_sar is not None else 0.0,
            "subtotal_sar": float(self.subtotal_sar) if self.subtotal_sar is not None else 0.0,
            "tax_sar": float(self.tax_sar) if self.tax_sar is not None else 0.0,
            "currency": self.currency,
            "status": self.status,
            "payment_method": self.payment_method,
            "payment_reference": self.payment_reference,
            "po_number": self.po_number,
            "issued_date": self.issued_date.isoformat() if self.issued_date else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "pdf_url": self.pdf_url,
            "notes": self.notes,
        }


class FleetTrip(TimestampMixin, Base):
    """Level 2: Fleet dispatch and trip routing with real-time GPS tracking."""
    __tablename__ = "fleet_trips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    trip_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"), index=True)
    driver_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    origin_location: Mapped[str] = mapped_column(String(255), nullable=False)
    destination_location: Mapped[str] = mapped_column(String(255), nullable=False)
    cargo_description: Mapped[Optional[str]] = mapped_column(String(255))
    planned_weight_tons: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="assigned")
    scheduled_departure: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    actual_departure: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    actual_delivery: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    current_latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 6))
    current_longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 6))
    speed_kmh: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    last_gps_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    custom_attributes: Mapped[dict] = mapped_column(_PortableJSON, nullable=False, default=dict, server_default=text("'{}'"))

    company: Mapped[ResCompany] = relationship()
    vehicle: Mapped[Optional[Vehicle]] = relationship()
    driver: Mapped[Optional[ResPartner]] = relationship()
    delivery_proof: Mapped[Optional["DeliveryProof"]] = relationship(back_populates="trip", uselist=False, cascade="all, delete-orphan")
    fuel_transactions: Mapped[list[FuelTransaction]] = relationship(back_populates="trip")

    __table_args__ = (
        CheckConstraint(
            "status IN ('assigned', 'in_transit', 'en_route_pickup', 'at_pickup', 'loaded', 'en_route_delivery', 'at_delivery', 'delivered', 'cancelled')",
            name="ck_fleet_trip_status",
        ),
        Index("uq_fleet_trips_company_number", "company_id", "trip_number", unique=True),
        Index("ix_fleet_trips_status", "company_id", "status"),
    )


class DeliveryProof(TimestampMixin, Base):
    """Level 2: Proof of Delivery (POD) with signature, photo hashes, and GPS coordinates."""
    __tablename__ = "delivery_proofs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fleet_trips.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    recipient_name: Mapped[str] = mapped_column(String(128), nullable=False)
    recipient_phone: Mapped[Optional[str]] = mapped_column(String(32))
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    altitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    accuracy_meters: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    digital_signature_data: Mapped[Optional[str]] = mapped_column(Text)
    encrypted_photo_urls: Mapped[Optional[str]] = mapped_column(Text)
    delivery_notes: Mapped[Optional[str]] = mapped_column(Text)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    company: Mapped[ResCompany] = relationship()
    trip: Mapped[FleetTrip] = relationship(back_populates="delivery_proof")


class TripInspectionLog(TimestampMixin, Base):
    """Level 2: Vehicle pre-trip and post-trip inspection checklists from mobile app."""
    __tablename__ = "trip_inspection_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    trip_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("fleet_trips.id", ondelete="SET NULL"), index=True)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    driver_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("res_partners.id", ondelete="SET NULL"), index=True)
    inspection_type: Mapped[str] = mapped_column(String(32), nullable=False, default="pre_trip")
    odometer_reading: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    is_safe_to_operate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    inspected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    company: Mapped[ResCompany] = relationship()
    vehicle: Mapped[Vehicle] = relationship()
    trip: Mapped[Optional[FleetTrip]] = relationship()

    __table_args__ = (
        CheckConstraint("inspection_type IN ('pre_trip', 'post_trip', 'safety_audit')", name="ck_trip_inspection_type"),
    )


# ==============================================================================
# Enterprise IAM & Security Models
# ==============================================================================
from backend.app.domains.iam.models import (  # noqa: E402
    UserSession,
    RefreshToken,
    LoginAttempt,
    SecurityToken,
)

# ==============================================================================
# Cross-Border Logistics & Customs Models (REM-P2-03)
# ==============================================================================
from backend.app.domains.logistics.customs_models import (  # noqa: E402
    CustomsManifest,
    CustomsDeclaration,
)


# ==============================================================================
# Universal System Sequence Generator (REM-SEQ-01)
# ==============================================================================
class SystemSequence(TimestampMixin, Base):
    """Authoritative tenant-isolated sequence generator for auto-numbering entities."""
    __tablename__ = "system_sequences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    prefix: Mapped[str] = mapped_column(String(20), nullable=False)
    current_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    format_pattern: Mapped[str] = mapped_column(String(100), nullable=False, default="{prefix}-{YYYY}-{XXXX}")
    fiscal_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        Index("uq_tenant_entity_fiscal", "tenant_id", "entity_type", text("COALESCE(fiscal_year, 0)"), unique=True),
    )


# ==============================================================================
# Moyasar B2B Invoices Subsystem Models
# ==============================================================================
class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    invoice_number: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)

    # Moyasar Payment Metadata
    payment_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    moyasar_transaction_id: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True, index=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    public_token = Column(String(64), unique=True, index=True, nullable=True, default=lambda: str(uuid.uuid4()))
    journal_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("finance_journal_entries.id", ondelete="SET NULL"), nullable=True, index=True)
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    journal_entry: Mapped[Optional["FinanceJournalEntry"]] = relationship("FinanceJournalEntry", foreign_keys=[journal_entry_id])


# ==============================================================================
# Phase 2: Biometric HRMS & Double-Entry Financial Ledgers
# ==============================================================================
from backend.app.domains.hr.models import (  # noqa: E402
    Employee,
    EmployeeDocument,
    AttendanceLog,
    PayrollRun,
    HrmsAttendanceLog,
)
from backend.app.domains.finance.models import (  # noqa: E402
    FinanceJournalEntry,
    FinanceJournalLine,
    Account,
    AccountChart,
    JournalEntry,
    JournalLine,
)

# Semantic domain aliases for HRMS & General Ledger integration
Payroll = PayrollRun
LedgerTransaction = FinanceJournalEntry
LedgerLine = FinanceJournalLine


# ==============================================================================
# Phase 7: Procurement & Double-Entry Ledger Integration
# ==============================================================================
from backend.app.domains.procurement.models import (  # noqa: E402
    Vendor,
    VendorBill,
    ProcurementBill,
    ProcurementVendor,
    PurchaseRequisition,
    PurchaseRequisitionLine,
    PurchaseOrderLine,
    GoodsReceiptBatchLog,
    ApprovalRule,
    WorkflowInstance,
    WorkflowStep,
)


# ==============================================================================
# Phase 8: Inventory Management & Double-Entry Ledger Integration
# ==============================================================================
from backend.app.domains.inventory.models import (  # noqa: E402
    Material,
    StockBalance,
    LandedCostAllocation,
    LandedCostItem,
    InventoryMovement,
)

# Semantic domain aliases for Inventory & General Ledger integration
Product = ProductProduct
InventoryLedgerMovement = InventoryMovement


# ==============================================================================
# Phase 10: Procurement Tendering, RFQ Engine & Vendor Portal Integration
# ==============================================================================
from backend.app.domains.procurement.models import (  # noqa: E402
    ProcurementTender,
    TenderRFQLine,
    VendorPortalUser,
    ProcurementBid,
    ProcurementBidLine,
    TenderRFQ,
    TenderBid,
    TenderBidLine,
)

# ==============================================================================
# Phase 1: SaaS Multi-Grade Subscription & Billing Domain Models
# ==============================================================================
from backend.app.domains.saas.models import (  # noqa: E402
    SubscriptionPlan,
    TenantSubscription,
)


# ==============================================================================
# Two-Tier Dynamic Branding & Platform Settings Models
# ==============================================================================
class PlatformSetting(Base):
    """Global system-wide configuration parameters (Admin Portal Tier)."""
    __tablename__ = "platform_settings"
    __table_args__ = {"extend_existing": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    setting_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    setting_value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now(), nullable=False
    )


class SiteSetting(Base):
    """Platform-wide dynamic site settings (key-value store for public landing, logo, tagline, and global copy)."""
    __tablename__ = "site_settings"
    __table_args__ = {"extend_existing": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now(), nullable=False
    )


class Organization(TimestampMixin, Base):
    """Authoritative tenant organization boundary for branding and workspace resolution."""
    __tablename__ = "organizations"
    __table_args__ = {"extend_existing": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="SET NULL"), unique=True, nullable=True, index=True
    )

    branding: Mapped[Optional["TenantBranding"]] = relationship(
        "TenantBranding",
        primaryjoin="Organization.company_id == foreign(TenantBranding.tenant_id)",
        back_populates="organization",
        uselist=False,
        cascade="all, delete-orphan",
    )


class TenantBranding(Base):
    """Tenant-level visual identity overrides (Tenant Workspace Tier)."""
    __tablename__ = "tenant_branding"
    __table_args__ = {"extend_existing": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), unique=True, nullable=True, index=True
    )
    brand_name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_url: Mapped[str] = mapped_column(Text, nullable=False)
    favicon_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    primary_color: Mapped[str] = mapped_column(
        String(50), default="#f97316", server_default="#f97316", nullable=False
    )
    accent_color: Mapped[str] = mapped_column(
        String(50), default="#0f172a", server_default="#0f172a", nullable=False
    )
    custom_domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    # Phase 4: Tenant Custom Landing Engine (public landing page on subdomain / custom domain)
    landing_hero_title: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    landing_hero_subtitle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    landing_cta_label: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    landing_cta_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    landing_theme_mode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now(), nullable=False
    )

    organization: Mapped[Optional["Organization"]] = relationship(
        "Organization",
        primaryjoin="Organization.company_id == foreign(TenantBranding.tenant_id)",
        back_populates="branding",
    )
