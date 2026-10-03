"""
Central database metadata registry for OxenGL enterprise platform.
Imported by Alembic and runtime bootstrap to discover all declarative models.
"""

from backend.database import Base
from backend import models  # noqa: F401
from backend.models import Invoice  # noqa: F401

# IAM Domain Models
from backend.app.domains.iam.models import (
    UserSession,
    RefreshToken,
    LoginAttempt,
    SecurityToken,
)

# Procurement Domain Models
from backend.app.domains.procurement.models import (
    ApprovalRule,
    WorkflowInstance,
    WorkflowStep,
    Vendor,
    PurchaseRequisition,
    PurchaseRequisitionLine,
    PurchaseOrderLine,
    GoodsReceiptBatchLog,
    VendorBill,
)

# Inventory Domain Models
from backend.app.domains.inventory.models import (
    Material,
    StockBalance,
    LandedCostAllocation,
    LandedCostItem,
)

# Finance & General Ledger Domain Models
from backend.app.domains.finance.models import (
    Account,
    JournalEntry,
    JournalLine,
)

# HR & Payroll Domain Models
from backend.app.domains.hr.models import (
    Employee,
    AttendanceLog,
    PayrollRun,
)

# Logistics & Fleet Domain Models
from backend.app.domains.logistics.models import (
    Vehicle,
    Driver,
    GPSEvent,
    Waybill,
)
from backend.app.domains.logistics.phase4_models import (
    DeliveryManifest,
    ManifestStop,
    IoTTelemetryEvent,
)

# SaaS Billing Domain Models
from backend.app.domains.saas.models import (
    SubscriptionPlan,
    TenantSubscription,
)

# AI & RAG Matrix Domain Models
from backend.app.domains.ai.models import (
    AIKnowledgeDocument,
    AIKnowledgeChunk,
)

from backend.app.domains.planning.models import (
    ProjectCharter,
    ExecutionTask,
    StrategicHazard,
    ElectronicLedgerBlock,
    CustomsManifest,
)

__all__ = [
    "Base",
    # IAM
    "UserSession",
    "RefreshToken",
    "LoginAttempt",
    "SecurityToken",
    # Procurement
    "ApprovalRule",
    "WorkflowInstance",
    "WorkflowStep",
    "Vendor",
    "PurchaseRequisition",
    "PurchaseRequisitionLine",
    "PurchaseOrderLine",
    "GoodsReceiptBatchLog",
    "VendorBill",
    # Inventory
    "Material",
    "StockBalance",
    "LandedCostAllocation",
    "LandedCostItem",
    # Finance
    "Account",
    "JournalEntry",
    "JournalLine",
    "Invoice",
    # HR & Payroll
    "Employee",
    "AttendanceLog",
    "PayrollRun",
    # Logistics
    "Vehicle",
    "Driver",
    "GPSEvent",
    "Waybill",
    "DeliveryManifest",
    "ManifestStop",
    "IoTTelemetryEvent",
    # SaaS
    "SubscriptionPlan",
    "TenantSubscription",
    # AI & RAG
    "AIKnowledgeDocument",
    "AIKnowledgeChunk",
]


