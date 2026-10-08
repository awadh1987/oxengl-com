"""OxenGL Logistics Domain Models."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional
from decimal import Decimal

from sqlalchemy import String, ForeignKey, DateTime, Boolean, Numeric, Integer, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

try:
    from app.db.base import Base
except ImportError:
    try:
        from backend.app.db.base import Base
    except ImportError:
        from backend.database import Base


try:
    from backend.models import Vehicle
except ImportError:
    from models import Vehicle

from .phase4_models import DeliveryManifest, ManifestStop, IoTTelemetryEvent
from .customs_models import CustomsManifest, CustomsDeclaration

__all__ = [
    "Driver",
    "GPSEvent",
    "Waybill",
    "DeliveryManifest",
    "ManifestStop",
    "IoTTelemetryEvent",
    "CustomsManifest",
    "CustomsDeclaration",
]


class Driver(Base):
    """Driver Assignment Profile."""
    __tablename__ = "drivers"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_users.id", ondelete="CASCADE"), index=True, nullable=False)
    
    license_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    license_type: Mapped[str] = mapped_column(String(50), default="HEAVY_TRUCK", nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class GPSEvent(Base):
    """Live GPS Telemetry Event Stream."""
    __tablename__ = "gps_events"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), index=True, nullable=False)
    trip_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    speed_kph: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False)


class Waybill(Base):
    """Waybill Consignment Tracker."""
    __tablename__ = "waybills"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    waybill_number: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    purchase_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_orders.id"), index=True, nullable=True)
    origin_warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    destination_warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="PLANNED", nullable=False)
    cargo_weight_ton: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    dest_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6), default=Decimal("15.3562"), nullable=True)
    dest_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6), default=Decimal("44.2081"), nullable=True)
