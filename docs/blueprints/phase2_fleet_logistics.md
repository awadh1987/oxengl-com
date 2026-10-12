# OxenGL Phase 2 Blueprint: Fleet, Logistics, and Live GPS Telemetry
**Target Role:** Principal ERP Architect, Lead Logistics Engineer, Telematics DBA
**Objective:** Deploy the relational data layer, live telemetry event stream models, and scheduling logic required to track heavy vehicles, map driver assignments, and enforce waybill isolation.

---

## 1. CORE OPERATIONAL WORKFLOW
The logistics pipeline transitions shipments across real-time milestone transitions, automatically syncing with your Phase 1 inventory and finance ledger modules:
`Shipment Planned ──► Vehicle/Driver Assigned ──► Waybill Issued ──► Trip Started (GPS Tracking Live) ──► Cargo Delivered (POD Captured) ──► Fuel/Maintenance Costs Posted`

---

## 2. RELATIONAL SCHEMAS (`backend/app/domains/logistics/models.py`)

Register the database schemas following SQLAlchemy 2.0 type mapping standards, inheriting from your declarative `Base`:

### A. Vehicle Asset Registry (`vehicles` table)
- `id`: UUID (Primary Key, default=uuid4)
- `tenant_id`: UUID (Indexed, non-nullable)
- `plate_number`: String(50) (Unique, indexed, non-nullable)
- `model`: String(200) (Non-nullable)
- `vehicle_type`: String(50) (Non-nullable: 'HAULER', 'TANKER', 'FLATBED')
- `status`: String(30) (Default='OPERATIONAL': 'OPERATIONAL', 'IN_SHOP', 'CRITICAL_ALERT')
- `current_odometer`: Numeric(12, 2) (Default=0.00)
- `breakdown_risk_score`: Integer (Default=0)

### B. Driver Assignment Profile (`drivers` table)
- `id`: UUID (Primary Key, default=uuid4)
- `tenant_id`: UUID (Indexed, non-nullable)
- `user_id`: UUID (Indexed, ForeignKey to `users.id` with cascade delete)
- `license_number`: String(100) (Unique, non-nullable)
- `license_type`: String(50) (Non-nullable - e.g., 'HEAVY_TRUCK')
- `is_available`: Boolean (Default=True)

### C. Live GPS Telemetry Event Stream (`gps_events` table - Partitioned by Month)
- `id`: UUID (Primary Key, default=uuid4)
- `tenant_id`: UUID (Indexed, non-nullable)
- `vehicle_id`: UUID (Indexed, ForeignKey to `vehicles.id` with cascade delete)
- `trip_id`: UUID (Indexed, nullable)
- `latitude`: Numeric(9, 6) (Non-nullable)
- `longitude`: Numeric(9, 6) (Non-nullable)
- `speed_kph`: Numeric(5, 2) (Default=0.00)
- `timestamp`: DateTime (Timezone-aware, default=utcnow, index=True)

### D. Waybill Consignment Tracker (`waybills` table)
- `id`: UUID (Primary Key, default=uuid4)
- `tenant_id`: UUID (Indexed, non-nullable)
- `waybill_number`: String(100) (Unique, indexed, non-nullable)
- `purchase_order_id`: UUID (Indexed, ForeignKey to `purchase_orders.id`, nullable=True)
- `origin_warehouse_id`: UUID (Indexed, non-nullable)
- `destination_warehouse_id`: UUID (Indexed, non-nullable)
- `status`: String(30) (Default='PLANNED': 'PLANNED', 'DISPATCHED', 'TRANSIT', 'DELIVERED')
- `cargo_weight_ton`: Numeric(10, 3) (Non-nullable)
