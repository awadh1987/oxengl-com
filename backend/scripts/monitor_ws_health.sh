#!/bin/bash
# OxenGL Telemetry Stream & AI Copilot Latency Monitor Probe
# Phase 4 Cold-Chain & WebSocket SLA Protection Daemon
# SLA Latency Threshold: 15.00ms

WORKSPACE_DIR="/root/oxen-gl"
LOG_FILE="$WORKSPACE_DIR/oxengl_ws_health.log"
ALERTS_LOG="$WORKSPACE_DIR/oxengl_telemetry_alerts.log"
RECOVERY_LOG="$WORKSPACE_DIR/oxengl_recovery.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[$TIMESTAMP] Running automated WebSocket health & AI Copilot SLA scan..." >> "$LOG_FILE"

# ==============================================================================
# 1. High-Frequency RFC-6455 WebSocket Handshake Probe
# ==============================================================================
WS_START_NS=$(date +%s%N)
WS_OUT=$(curl -s -N --max-time 1 \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Origin: http://127.0.0.1:8000" \
  -H "X-Tenant-ID: 49edafb3-1b7e-40a7-8802-180af5c1e7d6" \
  -o /dev/null -w "%{http_code}:%{time_starttransfer}" \
  --insecure "https://127.0.0.1/api/v1/logistics/ws/fleet-stream?tenant_id=49edafb3-1b7e-40a7-8802-180af5c1e7d6" 2>/dev/null)
WS_END_NS=$(date +%s%N)

WS_STATUS_CODE=$(echo "$WS_OUT" | cut -d':' -f1)
WS_TIME_SEC=$(echo "$WS_OUT" | cut -d':' -f2)

if [[ -n "$WS_TIME_SEC" && "$WS_TIME_SEC" != "0.000000" ]]; then
    ELAPSED_MS=$(awk -v t="$WS_TIME_SEC" 'BEGIN {printf "%.2f", t * 1000}')
else
    ELAPSED_MS=$(awk "BEGIN {printf \"%.2f\", ($WS_END_NS - $WS_START_NS) / 1000000}")
fi

if [[ "$WS_STATUS_CODE" == "101" ]]; then
    echo "[$TIMESTAMP] ✅ SUCCESS: WebSocket telemetry pipeline responsive (HTTP 101, latency: ${ELAPSED_MS}ms)." >> "$LOG_FILE"
else
    echo "[$TIMESTAMP] 🚨 FAILURE: WebSocket handshake returned status '${WS_STATUS_CODE:-TIMEOUT}' (expected 101, elapsed: ${ELAPSED_MS}ms)." >> "$LOG_FILE"
    
    # Append critical warning matrix to alerts log
    cat <<EOF >> "$ALERTS_LOG"
[$TIMESTAMP] ⚠️ CRITICAL SLA ALARM: WebSocket Telemetry Pipeline Handshake Failure
  Target Endpoint  : wss://127.0.0.1/api/v1/logistics/ws/fleet-stream
  Observed Status  : ${WS_STATUS_CODE:-CONNECTION_FAILURE}
  Expected Status  : 101 Switching Protocols
  Handshake Latency: ${ELAPSED_MS}ms
  Root Cause       : Telemetry socket frame stream unacknowledged or proxy connection dropped.
--------------------------------------------------------------------------------
EOF

    # Automated non-interactive nohup service recovery
    echo "[$TIMESTAMP] ⚙️ Initiating automated non-interactive service recovery..." >> "$LOG_FILE"
    if systemctl is-active --quiet oxengl; then
        systemctl restart oxengl
    else
        nohup /bin/bash /root/oxen-gl/run_oxengl.sh > "$RECOVERY_LOG" 2>&1 &
    fi
    systemctl reload nginx
fi

# ==============================================================================
# 2. AI Copilot Router SLA Latency Probe (< 15.00ms SLA)
# ==============================================================================
AI_START_NS=$(date +%s%N)
AI_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 \
  -X POST http://127.0.0.1:8000/api/v1/ai/copilot/query \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 49edafb3-1b7e-40a7-8802-180af5c1e7d6" \
  -d '{"prompt": "Diagnostic health SLA latency benchmark probe", "top_k": 2}' 2>/dev/null)
AI_END_NS=$(date +%s%N)

AI_ELAPSED_MS=$(awk "BEGIN {printf \"%.2f\", ($AI_END_NS - $AI_START_NS) / 1000000}")

echo "[$TIMESTAMP] ℹ️ AI Copilot diagnostic query completed: HTTP $AI_HTTP_CODE in ${AI_ELAPSED_MS}ms (SLA threshold: 15.00ms)." >> "$LOG_FILE"

# Evaluate 15.00ms SLA Threshold
EXCEEDS_SLA=$(awk -v lat="$AI_ELAPSED_MS" 'BEGIN {if (lat > 15.00) print 1; else print 0}')

if [[ "$EXCEEDS_SLA" -eq 1 || "$AI_HTTP_CODE" != "200" ]]; then
    echo "[$TIMESTAMP] ⚠️ ALARM: AI Copilot latency breached SLA (${AI_ELAPSED_MS}ms > 15.00ms or status $AI_HTTP_CODE)." >> "$LOG_FILE"
    
    cat <<EOF >> "$ALERTS_LOG"
[$TIMESTAMP] ⚠️ CRITICAL SLA ALARM: AI Copilot Latency Threshold Breach
  Target Endpoint : POST /api/v1/ai/copilot/query
  Observed Latency: ${AI_ELAPSED_MS}ms
  SLA Threshold   : 15.00ms
  HTTP Status     : $AI_HTTP_CODE
  Vector Engine   : PostgreSQL pgvector (1536-D HNSW Index)
  Violation Delta : +$(awk -v lat="$AI_ELAPSED_MS" 'BEGIN {printf "%.2f", lat - 15.00}')ms over SLA threshold
--------------------------------------------------------------------------------
EOF
fi
