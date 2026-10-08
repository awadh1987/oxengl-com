import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from backend.app.domains.logistics.router_engine import AutomatedRouteOptimizer

logger = logging.getLogger("oxengl_telemetry")
router = APIRouter(prefix="/api/v1/logistics", tags=["Telemetry Stream"])

# Instantiating the route calculation optimizer engine
optimizer = AutomatedRouteOptimizer()


def _extract_token_and_tenant(websocket: WebSocket) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Extracts raw JWT token, query tenant, and header tenant from handshake."""
    query_tenant = websocket.query_params.get("tenant_id")
    x_tenant_id = websocket.headers.get("x-tenant-id") or websocket.headers.get("X-Tenant-ID")

    token = websocket.query_params.get("token") or websocket.query_params.get("access_token")
    if not token:
        auth_header = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    if not token:
        subprotocols = websocket.headers.get("sec-websocket-protocol", "")
        for proto in subprotocols.split(","):
            proto = proto.strip()
            if proto.lower().startswith("bearer."):
                token = proto.split(".", 1)[1].strip()
                break
            elif "." in proto and len(proto.split(".")) == 3:
                token = proto
                break
    if not token:
        token = websocket.cookies.get("oxengl_session") or websocket.cookies.get("session")

    return token, query_tenant, x_tenant_id


def _verify_jwt_token(token: str) -> Optional[dict]:
    """Decodes and validates JWT token across session and two-tier JWT decoders."""
    try:
        from backend.app.main import decode_session_token
        return decode_session_token(token)
    except Exception:
        pass
    try:
        from backend.two_tier_auth import verify_two_tier_jwt
        return verify_two_tier_jwt(token, expected_tier="tenant")
    except Exception:
        pass
    try:
        from backend.two_tier_auth import verify_two_tier_jwt
        return verify_two_tier_jwt(token, expected_tier="master")
    except Exception:
        pass
    return None


@router.websocket("/ws/fleet-stream")
async def fleet_telemetry_stream_endpoint(websocket: WebSocket):
    """
    Consumes live telemetry arrays via persistent WebSocket connections,
    running real-time Haversine cost matrices to flag vector deviations.
    Enforces pre-handshake JWT authentication and strict tenant boundary isolation.
    """
    token, query_tenant, x_tenant_id = _extract_token_and_tenant(websocket)

    # 1. Enforce cross-tenant conflict detection (header vs query parameter)
    if query_tenant and x_tenant_id and str(x_tenant_id).strip().lower() != str(query_tenant).strip().lower():
        logger.warning(f"Cross-tenant WebSocket rejection: header '{x_tenant_id}' != query '{query_tenant}'")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Decode and validate token if present, or enforce authentication
    authenticated_tenant = None
    if token:
        claims = _verify_jwt_token(token)
        if not claims:
            logger.warning("WebSocket handshake rejected: invalid or expired JWT token")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        token_tenant = str(claims.get("tenant_id") or claims.get("company_id") or "").strip()
        if token_tenant:
            if query_tenant and str(query_tenant).strip().lower() != token_tenant.lower():
                logger.warning(f"WebSocket rejected: token tenant {token_tenant} != query tenant {query_tenant}")
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
            if x_tenant_id and str(x_tenant_id).strip().lower() != token_tenant.lower():
                logger.warning(f"WebSocket rejected: token tenant {token_tenant} != header tenant {x_tenant_id}")
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
            authenticated_tenant = token_tenant
        else:
            logger.warning("WebSocket rejected: token carries no tenant scope")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    else:
        logger.warning("Unauthenticated WebSocket handshake rejected: authentication token is required")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 3. Accept handshake only after authentication and tenant scoping succeed
    await websocket.accept()
    logger.info(f"📡 Telemetry Stream Connected: Tenant {authenticated_tenant} Handshake Active")

    try:
        while True:
            # Accept raw packet payload matrix arrays from streaming threads
            raw_data = await websocket.receive_text()
            packet = json.loads(raw_data)

            # Tenant scoping verification on stream packets
            packet_tenant = packet.get("tenant_id")
            if packet_tenant and str(packet_tenant).strip().lower() != str(authenticated_tenant).strip().lower():
                logger.warning(f"Cross-tenant packet rejected: {packet_tenant} != {authenticated_tenant}")
                continue

            # Enforce authenticated tenant on outgoing packet
            packet["tenant_id"] = authenticated_tenant

            # Handle subscription and ping messages
            msg_type = packet.get("type")
            if msg_type == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "tenant_id": authenticated_tenant,
                }))
                continue
            elif msg_type == "subscribe":
                await websocket.send_text(json.dumps({
                    "type": "subscribed",
                    "tenant_id": authenticated_tenant,
                    "channel": packet.get("channel", "fleet-telemetry"),
                }))
                continue

            # Extract telemetry coordinates vectors
            vehicle_id = packet.get("vehicle_id", "TRK-UNKNOWN")
            current_gps = (packet.get("lat", 24.7136), packet.get("lon", 46.6753))
            assigned_target = (packet.get("target_lat"), packet.get("target_lon"))

            # Trigger automatic path evaluation if active route vectors exist
            if assigned_target[0] and assigned_target[1]:
                congestion_coeff = packet.get("congestion_index", 0.1)

                # Run the math optimization matrix
                route_metrics = optimizer.evaluate_optimal_path(
                    origin=current_gps,
                    destination=assigned_target,
                    active_congestion=congestion_coeff,
                )

                # Check spatial distance thresholds for dynamic deviation flag alerts
                if route_metrics["base_distance_km"] > 15.0:
                    packet["routing_status"] = "VECTOR_DEVIATION_ALERT"
                    packet["deviation_magnitude_km"] = route_metrics["base_distance_km"]
                    logger.warning(f"⚠️ DEVIATION: {vehicle_id} drifted {route_metrics['base_distance_km']}km off course!")
                else:
                    packet["routing_status"] = "ON_SCHEDULE"

                # Append computed travel metrics down to the streaming matrix
                packet["eta_hours"] = route_metrics["estimated_transit_time_hrs"]
                packet["weighted_cost_index"] = route_metrics["weighted_cost_index"]

            # Stream augmented real-time data metrics back out to client panels
            await websocket.send_text(json.dumps(packet))

    except WebSocketDisconnect:
        logger.info(f"🔌 Telemetry Stream Disconnected for Tenant {authenticated_tenant}")

