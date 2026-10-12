# OxenGL Enterprise Platform: Core REST & WebSocket API Integration Specifications
**Target Audience:** Downstream Software Engineers, IoT Hardware Integrators, Third-Party Developers
**Objective:** Programmatic integration guidelines for executing secure, authenticated, and tenant-isolated operations against OxenGL Phase 1–4 microservice routes.

---

## 1. GLOBAL GATEWAY BASE ENDPOINTS
All programmatic requests must route over the encrypted production reverse proxy layer:
*   **REST Base Core URI:**     `https://your-server-domain-or-ip/api/v1`
*   **WebSocket Stream URI:**  `wss://your-server-domain-or-ip/api/v1`

---

## 2. CLIENT AUTHENTICATION & HEADERS
Every request must append an entropic bearer token alongside strict multi-tenant boundary headers. Unauthenticated queries instantly trip a 401 Unauthorized block.

### Mandatory Request Headers Profile
```http
Authorization: Bearer <your_jwt_access_token>
X-Tenant-ID: 49edafb3-1b7e-40a7-8802-180af5c1e7d6
X-Role: LOGISTICS_DIRECTOR
Content-Type: application/json
```

---

## 3. INTEGRATION CONTRACT EXAMPLES

### A. High-Frequency IoT Telemetry Ingestion (REST)
*   **Route:** `POST /logistics/telemetry/ping`
*   **SLA Constraint:** Sub-10ms write execution footprint (PostgreSQL Save + Redis Cache-Aside Pub/Sub Broadcast).
*   **JSON Request Payload:**
```json
{
  "vehicle_id": "00000000-0000-0000-0000-000000000001",
  "tenant_id": "49edafb3-1b7e-40a7-8802-180af5c1e7d6",
  "trip_id": "50db6dff-f231-42a7-9084-a563bea6bb5f",
  "latitude": 15.3562,
  "longitude": 44.2081,
  "speed": 65.5,
  "cargo_temperature_celsius": 4.2
}
```
*   **Response Payload (201 Created):**
```json
{
  "status": "INGESTED",
  "event_id": "c3b6a2d1-e4f5-7a8b-9c0d-1e2f3a4b5c6d",
  "geofence_triggered": false
}
```

### B. Asynchronous Multi-Stop Route Optimizer (REST)
*   **Route:** `POST /logistics/manifests/{id}/optimize`
*   **Algorithmic Engine:** Greedy Nearest-Neighbor geospatial routing model utilizing Haversine metrics.
*   **JSON Request Payload:**
```json
{
  "origin_latitude": 15.3562,
  "origin_longitude": 44.2081
}
```
*   **Response Payload (200 OK):**
```json
{
  "status": "OPTIMIZED",
  "total_stops_sequenced": 12,
  "calculated_distance_km": 142.85,
  "routing_sequence_map": [
    {"sequence": 1, "waybill_number": "WB-0041", "distance_leg_km": 12.4},
    {"sequence": 2, "waybill_number": "WB-0089", "distance_leg_km": 24.1}
  ]
}
```

### C. Live Command Canvas Telemetry Stream (WebSockets)
*   **Route:** `WS /logistics/ws/fleet-stream?tenant_id=49edafb3-1b7e-40a7-8802-180af5c1e7d6`
*   **Handshake Protocol:** Employs HTTP/1.1 Upgrade headers. Subscribes straight to Redis Pub/Sub channels to broadcast 60 FPS real-time vehicle trajectories.
*   **Outbound Stream Packet Payload:**
```json
{
  "vehicle_id": "00000000-0000-0000-0000-000000000001",
  "lat": 15.3621,
  "lng": 44.2145,
  "speed": 68.2,
  "trip_id": "50db6dff-f231-42a7-9084-a563bea6bb5f"
}
```
