"""
OxenGL Phase 4 Advanced Logistics & Smart IoT Route Optimization Models.
Defines DeliveryManifest, ManifestStop, and IoTTelemetryEvent entities.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.app.domains.logistics.models import Waybill

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

try:
    from backend.database import Base
except ImportError:
    from app.db.base import Base


class DeliveryManifest(Base):
    """Consolidated Logistics Manifest header for multi-stop dispatches."""
    __tablename__ = "delivery_manifests"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    manifest_number: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    vehicle_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=True)
    driver_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", nullable=False)  # 'DRAFT', 'OPTIMIZED', 'IN_TRANSIT', 'COMPLETED'
    total_distance_km: Mapped[float] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)

    # Relationships
    stops: Mapped[list["ManifestStop"]] = relationship(lambda: ManifestStop, back_populates="manifest", cascade="all, delete-orphan", overlaps="manifest,stops")


class ManifestStop(Base):
    """Multi-Stop Waybill Sequence Link."""
    __tablename__ = "manifest_stops"
    __table_args__ = (
        Index("uq_manifest_stops_waybill", "manifest_id", "waybill_id", unique=True),
        {"extend_existing": True},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manifest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("delivery_manifests.id", ondelete="CASCADE"), nullable=False, index=True)
    waybill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("waybills.id"), nullable=False, index=True)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)  # Determined dynamically by the IoT route optimizer
    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False)  # 'PENDING', 'ARRIVED', 'DEPARTED', 'SKIPPED'

    # Relationships
    manifest: Mapped["DeliveryManifest"] = relationship(lambda: DeliveryManifest, back_populates="stops", overlaps="manifest,stops")


class IoTTelemetryEvent(Base):
    """Smart Cold-Chain IoT Sensor Event Stream."""
    __tablename__ = "iot_telemetry_events"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), index=True, nullable=False)
    cargo_temperature_celsius: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    ambient_humidity_percentage: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    device_battery_voltage: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False)
