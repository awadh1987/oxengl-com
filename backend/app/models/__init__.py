"""
Models package for OxenGL backend app.
Re-exports all backend models, domain models, and UserRole.
"""
from backend.models import *
from .user import UserRole
from .core_project import CoreProject, ProjectStatusEnum, attach_project_spine_columns
from .tenant import Tenant, MasterTenant
from .platform_governance import PlatformMasterSetting, PlatformMasterSettings, PlatformLandingSection, SystemBroadcast

# Import domain models to ensure full registry in Base.metadata
from backend.app.domains.planning.models import (
    ProjectCharter,
    ExecutionTask,
    StrategicHazard,
    ElectronicLedgerBlock,
    CustomsManifest,
)
from backend.app.domains.iam.models import (
    UserSession,
    RefreshToken,
    LoginAttempt,
    SecurityToken,
)
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
from backend.app.domains.inventory.models import (
    Material,
    StockBalance,
    LandedCostAllocation,
    LandedCostItem,
)
from backend.app.domains.finance.models import (
    Account,
    JournalEntry,
    JournalLine,
)
from backend.app.domains.hr.models import (
    Employee,
    AttendanceLog,
    PayrollRun,
)
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
from backend.app.domains.saas.models import (
    SubscriptionPlan,
    TenantSubscription,
)
from backend.app.domains.ai.models import (
    AIKnowledgeDocument,
    AIKnowledgeChunk,
)

# Attach project spine foreign keys and indexes to Base.metadata
attach_project_spine_columns()

