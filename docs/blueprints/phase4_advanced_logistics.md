# OxenGL Phase 4 Blueprint: Advanced Logistics & Smart IoT Route Optimization
**Target Role:** Principal Logistics Architect, Telematics SRE, Core Backend Engineer
**Objective:** Deploy the data schemas, multi-stop routing services, and asynchronous event streams required to manage smart vehicle manifests, calculate optimal delivery sequences, and process cold-chain IoT temperature pings.

---

## 1. CORE OPERATIONAL LIFECYCLE
The Phase 4 dispatch pipeline automates delivery optimization loops across real-time external events:
`Manifest Created ──► Multi-Stop Waybills Sequenced ──► IoT Route Optimizer Fires ──► Dispatch Confirmed ──► Live Telematics Stream Active (GPS + Temp) ──► Geofence Arrival Tripped`

---

## 2. RELATIONAL SCHEMAS (`backend/app/domains/logistics/phase4_models.py`)

Register the advanced transport tables using SQLAlchemy 2.0 type mapping standards, inheriting from your declarative `Base`:

### A. Consolidated Logistics Manifest (`delivery_manifests` table)
- `id`: Mapped[uuid.UUID] (Primary Key, default=uuid4)
- `tenant_id`: Mapped[uuid.UUID] (Indexed, non-nullable)
- `manifest_number`: Mapped[str] (String 100, unique, indexed, non-nullable)
- `vehicle_id`: Mapped[uuid.UUID] (ForeignKey to `vehicles.id`, non-nullable)
- `driver_id`: Mapped[uuid.UUID] (ForeignKey to `drivers.id`, non-nullable)
- `status`: Mapped[str] (Default='DRAFT': 'DRAFT', 'OPTIMIZED', 'IN_TRANSIT', 'COMPLETED')
- `total_distance_km`: Mapped[float] (Numeric 10,2, default=0.00)

### B. Multi-Stop Waybill Sequence Link (`manifest_stops` table)
- `id`: Mapped[uuid.UUID] (Primary Key, default=uuid4)
- `manifest_id`: Mapped[uuid.UUID] (ForeignKey to `delivery_manifests.id` with cascade delete)
- `waybill_id`: Mapped[uuid.UUID] (ForeignKey to `waybills.id`, unique index per manifest)
- `sequence_order`: Mapped[int] (Integer, non-nullable) # Determined dynamically by the IoT route optimizer
- `status`: Mapped[str] (Default='PENDING': 'PENDING', 'ARRIVED', 'DEPARTED', 'SKIPPED')

### C. Smart Cold-Chain IoT Sensor Event Stream (`iot_telemetry_events` table)
- `id`: Mapped[uuid.UUID] (Primary Key, default=uuid4)
- `tenant_id`: Mapped[uuid.UUID] (Indexed, non-nullable)
- `vehicle_id`: Mapped[uuid.UUID] (ForeignKey to `vehicles.id`, indexed)
- `cargo_temperature_celsius`: Mapped[float] (Numeric 5,2, non-nullable)
- `ambient_humidity_percentage`: Mapped[float] (Numeric 5,2, nullable)
- `device_battery_voltage`: Mapped[float] (Numeric 4,2, nullable)
- `timestamp`: Mapped[datetime] (DateTime with timezone, default=utcnow, index=True)
