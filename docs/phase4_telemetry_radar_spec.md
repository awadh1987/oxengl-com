# OxenGL Enterprise Platform Specification Sheet
## Phase 4: Advanced Transport & Cold Chain Telemetry Radar Grid

---

## 1. Architectural Objective
Phase 4 implements a high-frequency, low-latency telemetry processing network. It bridges cold chain hardware measurements (`cargo_temperature_celsius`, `ambient_humidity_percentage`, `device_battery_voltage`) into a unified, fluid visualization layer using a hardware-accelerated HTML5 2D Canvas context running at a locked 60 Frames Per Second (FPS). This eliminates heavy DOM node re-renders during high-concurrency fleet data ingestions.

---

## 2. Telemetry Ingest Schema & Redis Cache-Aside Layer

### A. Data Ingestion Contract (`iot_telemetry_events`)
The database schema must capture high-frequency telemetry events emitted by vehicle IoT hardware tracking units.

```sql
CREATE TABLE IF NOT EXISTS iot_telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id VARCHAR(50) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES res_companies(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION NOT NULL,
    cargo_temperature_celsius NUMERIC(5, 2) NOT NULL,
    ambient_humidity_percentage NUMERIC(5, 2) NOT NULL,
    device_battery_voltage NUMERIC(4, 2) NOT NULL,
    recorded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_time 
ON iot_telemetry_events (vehicle_id, recorded_at DESC);
```

### B. Redis Broadcast Pipeline
FastAPI ingest processes push arriving coordinates to a Redis pub/sub cache channel `fleet:telemetry:stream` to ensure message routing is performed out of memory with sub-millisecond overhead.

---

## 3. High-Frequency Broadcaster (`/api/v1/logistics/ws/fleet-stream`)

- **Protocol:** WebSocket (`ws://` / `wss://`)
- **Isolation Scope:** Handshakes must validate `X-Tenant-ID` configurations or query strings (`?tenant_id=...`). Traffic must be strictly partitioned at the socket frame level.
- **Payload Footprint:**
  ```json
  {
    "vehicle_id": "V-1002",
    "lat": 24.7136,
    "lng": 46.6753,
    "speed": 82.5,
    "temp": 2.8,
    "humidity": 45.2,
    "voltage": 12.4,
    "timestamp": "2026-09-14T01:40:00Z"
  }
  ```

---

## 4. 60 FPS HTML5 Radar Tracking Canvas UI

### A. Render Loop Optimization
Instead of pushing incoming WebSocket state variables directly to standard React state trees (which causes cascading DOM performance degradation), coordinates pass into a local mutable memory array block. A `requestAnimationFrame` loop handles rendering directly on an HTML5 `<canvas>` node at a locked 60 FPS.

### B. Color Vector Logic
Vehicles map dynamically onto the tracking canvas based on cargo temperature metrics:
- **Normal Operation ($\le +4.2^\circ\text{C}$):** Rendered as a pulsing **Emerald Green** indicator (`#10b981`).
- **Critical Threshold Breach ($> +4.2^\circ\text{C}$):** Flips immediately to a flashing **Crimson Red** warning beacon (`#ef4444`) with an expanding secondary rings footprint to isolate the anomaly.

---

## 5. Verification & SLA Thresholds
1. **Zero Layout Regressions:** `cd frontend && npx tsc --noEmit` must exit with code `0`.
2. **Locked Frame Rate:** The graphics container must achieve a consistent **60 FPS** during simulated ingestion bursts of 1,000 parallel vehicle coordinates.
3. **Automated Alarm Loop:** Alert cron rules must scan network pipes and route latencies higher than **15.00ms** straight to system failure files.
