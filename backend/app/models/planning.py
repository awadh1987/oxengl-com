"""
OxenGL Planning Core Spine Models (`backend/app/models/planning.py`).

Implements the Genesis Engine master `CoreProject` (`core_projects`) entity and
downstream transactional models (`SaleOrder`, `LogisticsTrip`), establishing
bidirectional ORM relationships across GL/Accounting, Inventory, Supply Chain,
and Fleet/Logistics modules.
"""
from __future__ import annotations

import enum
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.modules.setdefault("app.models.planning", sys.modules[__name__])
sys.modules.setdefault("backend.app.models.planning", sys.modules[__name__])

try:
    from backend.database import Base
except ImportError:
    from database import Base

if TYPE_CHECKING:
    from backend.models import (
        AccountMoveLine,
        CostCenter,
        FleetTrip,
        PurchaseOrder,
        ResCompany,
        ResPartner,
        StockMovement,
        StockPicking,
        Vehicle,
    )

# Portable JSON column: JSONB on PostgreSQL, plain JSON elsewhere (e.g. SQLite unit tests).
_PortableJSON = JSON().with_variant(JSONB(), "postgresql")


class ProjectType(str, enum.Enum):
    """Polymorphic Project Taxonomy for OxenGL Core Spine."""
    LOGISTICS = "logistics"
    SUPPLY_CHAIN = "supply_chain"
    HUMANITARIAN_SUPPLY = "humanitarian_supply"
    EPC = "epc"
    OIL_GAS = "oil_gas"
    COMMERCIAL_AGRIBUSINESS = "commercial_agribusiness"

    @classmethod
    def _missing_(cls, value: object) -> Optional["ProjectType"]:
        if isinstance(value, str):
            cleaned = value.strip().lower().replace("-", "_").replace(" ", "_")
            for member in cls:
                if member.value.lower() == cleaned or member.name.lower() == cleaned:
                    return member
        return None


class ProjectStatus(str, enum.Enum):
    """Lifecycle states for a CoreProject."""
    DRAFT = "Draft"
    PLANNING = "Planning"
    ACTIVE_EXECUTION = "Active Execution"
    SUSPENDED = "Suspended"
    COMPLETED = "Completed"
    CLOSED = "Closed"
    AUDITED = "Audited"

    @classmethod
    def _missing_(cls, value: object) -> Optional["ProjectStatus"]:
        if isinstance(value, str):
            raw_lower = value.strip().lower()
            if raw_lower in ("active", "active execution", "active_execution", "in_progress", "in progress", "approved"):
                return cls.ACTIVE_EXECUTION
            if raw_lower in ("on_hold", "on hold", "paused", "suspended"):
                return cls.SUSPENDED
            if raw_lower in ("cancelled", "canceled", "closed"):
                return cls.CLOSED
            cleaned = raw_lower.replace("-", "_").replace(" ", "_")
            for member in cls:
                if member.value.lower() == raw_lower or member.name.lower() == cleaned:
                    return member
        return None


class CoreProject(Base):
    """
    Master Project Entity (`core_projects`) — The Planning-First Core Spine.

    Every operational and financial transaction anchors to `CoreProject`,
    supporting infinite self-referential WBS hierarchies (`parent_project_id`),
    real-time IoT telemetry (`telemetry_data`), and Scope 1/2/3 ESG carbon
    accounting (`esg_metrics`) under strict multi-tenant PostgreSQL RLS.
    """
    __tablename__ = "core_projects"
    __table_args__ = (
        UniqueConstraint("tenant_id", "project_code", name="uq_core_projects_tenant_code"),
        Index("ix_core_projects_tenant_id", "tenant_id"),
        Index("ix_core_projects_company_id", "company_id"),
        Index("ix_core_projects_parent_project_id", "parent_project_id"),
        Index("ix_core_projects_project_code", "project_code"),
        Index("ix_core_projects_client_id", "client_id"),
        Index("ix_core_projects_beneficiary_id", "beneficiary_id"),
        Index("ix_core_projects_status", "status"),
        {"extend_existing": True},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_companies.id", ondelete="CASCADE"),
        nullable=True,
    )
    parent_project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("core_projects.id", ondelete="RESTRICT"),
        nullable=True,
    )
    project_code: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, default="", server_default=text("''")
    )
    project_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=ProjectType.LOGISTICS.value,
        server_default=text("'logistics'"),
    )
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_partners.id", ondelete="RESTRICT"),
        nullable=True,
    )
    beneficiary_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_partners.id", ondelete="RESTRICT"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=ProjectStatus.DRAFT.value,
        server_default=text("'Draft'"),
    )
    financial_envelope: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        default=Decimal("0.0000"),
        server_default=text("0.0000"),
    )
    metadata_json: Mapped[dict] = mapped_column(
        _PortableJSON,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    telemetry_data: Mapped[dict] = mapped_column(
        _PortableJSON,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    esg_metrics: Mapped[dict] = mapped_column(
        _PortableJSON,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    def __init__(self, **kwargs: Any) -> None:
        if "tenant_id" in kwargs and kwargs.get("company_id") is None:
            kwargs["company_id"] = kwargs["tenant_id"]
        elif "company_id" in kwargs and kwargs.get("tenant_id") is None:
            kwargs["tenant_id"] = kwargs["company_id"]
        super().__init__(**kwargs)

    # -------------------------------------------------------------------------
    # Hierarchical WBS & Partner Relationships
    # -------------------------------------------------------------------------
    company: Mapped["ResCompany"] = relationship(
        "ResCompany", foreign_keys=[tenant_id]
    )
    parent_project: Mapped[Optional["CoreProject"]] = relationship(
        "CoreProject",
        remote_side="CoreProject.id",
        back_populates="sub_projects",
    )
    sub_projects: Mapped[List["CoreProject"]] = relationship(
        "CoreProject",
        back_populates="parent_project",
    )
    client: Mapped[Optional["ResPartner"]] = relationship(
        "ResPartner",
        foreign_keys=[client_id],
    )
    beneficiary: Mapped[Optional["ResPartner"]] = relationship(
        "ResPartner",
        foreign_keys=[beneficiary_id],
    )

    # -------------------------------------------------------------------------
    # Downstream Transactional Nervous System Relationships
    # -------------------------------------------------------------------------
    # 1. Finance & GL (`account_move_lines`)
    journal_items: Mapped[List["AccountMoveLine"]] = relationship(
        "AccountMoveLine",
        back_populates="project",
    )
    account_move_lines: Mapped[List["AccountMoveLine"]] = relationship(
        "AccountMoveLine",
        back_populates="project",
        overlaps="journal_items",
    )

    # 2. Inventory (`stock_pickings` & `stock_movements`)
    stock_pickings: Mapped[List["StockPicking"]] = relationship(
        "StockPicking",
        back_populates="project",
    )
    pickings: Mapped[List["StockPicking"]] = relationship(
        "StockPicking",
        back_populates="project",
        overlaps="stock_pickings",
    )
    stock_movements: Mapped[List["StockMovement"]] = relationship(
        "StockMovement",
        back_populates="project",
    )

    # 3. Supply Chain (`purchase_orders` & `sale_orders`)
    purchase_orders: Mapped[List["PurchaseOrder"]] = relationship(
        "PurchaseOrder",
        back_populates="project",
    )
    sale_orders: Mapped[List["SaleOrder"]] = relationship(
        "SaleOrder",
        back_populates="project",
    )

    # 4. Fleet & Logistics (`logistics_trips` & `fleet_trips`)
    trips: Mapped[List["LogisticsTrip"]] = relationship(
        "LogisticsTrip",
        back_populates="project",
    )
    logistics_trips: Mapped[List["LogisticsTrip"]] = relationship(
        "LogisticsTrip",
        back_populates="project",
        overlaps="trips",
    )
    fleet_trips: Mapped[List["FleetTrip"]] = relationship(
        "FleetTrip",
        back_populates="project",
    )

    def to_dict(self, include_sub_projects: bool = False) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "company_id": str(self.company_id or self.tenant_id),
            "parent_project_id": str(self.parent_project_id) if self.parent_project_id else None,
            "project_code": self.project_code,
            "name": self.name or "",
            "project_type": self.project_type,
            "client_id": str(self.client_id) if self.client_id else None,
            "beneficiary_id": str(self.beneficiary_id) if self.beneficiary_id else None,
            "status": self.status,
            "financial_envelope": float(self.financial_envelope or 0),
            "metadata_json": self.metadata_json or {},
            "telemetry_data": self.telemetry_data or {},
            "esg_metrics": self.esg_metrics or {},
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
        }
        if include_sub_projects and self.sub_projects:
            result["sub_projects"] = [
                sub.to_dict(include_sub_projects=True) for sub in self.sub_projects
            ]
        return result


class SaleOrder(Base):
    """Supply Chain Sale Order anchored to a master CoreProject."""
    __tablename__ = "sale_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "so_number", name="uq_sale_orders_tenant_number"),
        Index("ix_sale_orders_tenant_id", "tenant_id"),
        Index("ix_sale_orders_company_id", "company_id"),
        Index("ix_sale_orders_project_id", "project_id"),
        Index("ix_sale_orders_partner_id", "partner_id"),
        {"extend_existing": True},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_companies.id", ondelete="CASCADE"),
        nullable=True,
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("core_projects.id", ondelete="RESTRICT"),
        nullable=True,
    )
    so_number: Mapped[str] = mapped_column(String(64), nullable=False)
    partner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_partners.id", ondelete="SET NULL"),
        nullable=True,
    )
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cost_centers.id", ondelete="SET NULL"),
        nullable=True,
    )
    order_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    expected_delivery_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="draft", server_default=text("'draft'")
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="SAR", server_default=text("'SAR'")
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0.0000"), server_default=text("0.0000")
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0.0000"), server_default=text("0.0000")
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0.0000"), server_default=text("0.0000")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    custom_attributes: Mapped[dict] = mapped_column(
        _PortableJSON, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    def __init__(self, **kwargs: Any) -> None:
        if "tenant_id" in kwargs and kwargs.get("company_id") is None:
            kwargs["company_id"] = kwargs["tenant_id"]
        elif "company_id" in kwargs and kwargs.get("tenant_id") is None:
            kwargs["tenant_id"] = kwargs["company_id"]
        super().__init__(**kwargs)

    project: Mapped[Optional["CoreProject"]] = relationship(
        "CoreProject", back_populates="sale_orders"
    )
    partner: Mapped[Optional["ResPartner"]] = relationship(
        "ResPartner", foreign_keys=[partner_id]
    )
    cost_center: Mapped[Optional["CostCenter"]] = relationship(
        "CostCenter", foreign_keys=[cost_center_id]
    )


class LogisticsTrip(Base):
    """
    Fleet & Logistics Trip (`logistics_trips`) anchored to a master CoreProject.
    Rolls up trip costs, fuel consumption, driver hours, and live GPS telemetry
    to the parent project's financial envelope and ESG carbon ledger.
    """
    __tablename__ = "logistics_trips"
    __table_args__ = (
        UniqueConstraint("tenant_id", "trip_number", name="uq_logistics_trips_tenant_number"),
        Index("ix_logistics_trips_tenant_id", "tenant_id"),
        Index("ix_logistics_trips_company_id", "company_id"),
        Index("ix_logistics_trips_project_id", "project_id"),
        Index("ix_logistics_trips_trip_number", "trip_number"),
        {"extend_existing": True},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_companies.id", ondelete="CASCADE"),
        nullable=True,
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("core_projects.id", ondelete="RESTRICT"),
        nullable=True,
    )
    trip_number: Mapped[str] = mapped_column(String(64), nullable=False)
    vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="SET NULL"),
        nullable=True,
    )
    driver_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("res_partners.id", ondelete="SET NULL"),
        nullable=True,
    )
    origin_location: Mapped[str] = mapped_column(
        String(255), nullable=False, default="", server_default=text("''")
    )
    destination_location: Mapped[str] = mapped_column(
        String(255), nullable=False, default="", server_default=text("''")
    )
    cargo_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    planned_weight_tons: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), nullable=False, default=Decimal("0.0000"), server_default=text("0.0000")
    )
    distance_km: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default=text("0.00")
    )
    fuel_consumed_liters: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default=text("0.00")
    )
    trip_cost: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0.0000"), server_default=text("0.0000")
    )
    driver_hours: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default=text("0.00")
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="assigned", server_default=text("'assigned'")
    )
    scheduled_departure: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actual_departure: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actual_delivery: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    telemetry_data: Mapped[dict] = mapped_column(
        _PortableJSON, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    def __init__(self, **kwargs: Any) -> None:
        if "tenant_id" in kwargs and kwargs.get("company_id") is None:
            kwargs["company_id"] = kwargs["tenant_id"]
        elif "company_id" in kwargs and kwargs.get("tenant_id") is None:
            kwargs["tenant_id"] = kwargs["company_id"]
        super().__init__(**kwargs)

    project: Mapped[Optional["CoreProject"]] = relationship(
        "CoreProject", back_populates="trips"
    )
    vehicle: Mapped[Optional["Vehicle"]] = relationship(
        "Vehicle", foreign_keys=[vehicle_id]
    )
    driver: Mapped[Optional["ResPartner"]] = relationship(
        "ResPartner", foreign_keys=[driver_id]
    )


if "backend.models" not in sys.modules and "models" not in sys.modules:
    try:
        import backend.models  # noqa: F401, E402
    except ImportError:
        import models  # noqa: F401, E402


__all__ = [
    "ProjectType",
    "ProjectStatus",
    "CoreProject",
    "SaleOrder",
    "LogisticsTrip",
]
