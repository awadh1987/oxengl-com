# File: scripts/stress_test_divergent_radar.py
import asyncio
import json
import random
import websockets

TARGET_WS_URL = "ws://127.0.0.1:8000/api/v1/logistics/ws/fleet-stream"

# Coordinates centered near Riyadh workspace area
RIYADH_LAT = 24.7136
RIYADH_LON = 46.6753

async def simulate_truck_stream(truck_id: str, is_deviating: bool):
    """
    Simulates a persistent truck telemetry thread transmitting real-time coordinates.
    """
    async with websockets.connect(TARGET_WS_URL) as ws:
        current_lat = RIYADH_LAT + random.uniform(-0.02, 0.02)
        current_lon = RIYADH_LON + random.uniform(-0.02, 0.02)
        
        # Define travel destination coordinates
        target_lat = RIYADH_LAT + 0.08
        target_lon = RIYADH_LON + 0.08

        print(f"🚀 Started Telemetry Stream for {truck_id} (Divergent Mode: {is_deviating})")

        for tick in range(20):  # Stream over 20 consecutive intervals
            if is_deviating and tick > 4:
                # Force vehicle coordinates to drift dramatically off course (>15km threshold)
                current_lat += 0.045
                current_lon += 0.045
            else:
                # Move normally along tracking arcs
                current_lat += (target_lat - current_lat) * 0.1
                current_lon += (target_lon - current_lon) * 0.1

            payload = {
                "vehicle_id": truck_id,
                "lat": current_lat,
                "lon": current_lon,
                "target_lat": target_lat,
                "target_lon": target_lon,
                "congestion_index": random.uniform(0.05, 0.25)
            }

            await ws.send(json.dumps(payload))
            
            # Recieve response packet back down from server calculation ring
            raw_response = await ws.recv()
            response_data = json.loads(raw_response)
            
            status = response_data.get("routing_status", "UNKNOWN")
            print(f"[{truck_id}] Tick {tick+1}: Status={status} | ETA={response_data.get('eta_hours')} hrs")
            
            await asyncio.sleep(0.5)  # 500ms transmission intervals

async def main():
    print("======================================================================")
    print("⚡ INIT: Starting Mixed Fleet Telemetry Stream Simulation")
    print("======================================================================")
    
    # Run 3 on-schedule fleet trucks and 2 highly divergent vehicles simultaneously
    await asyncio.gather(
        simulate_truck_stream("TRK-MYON-101", is_deviating=False),
        simulate_truck_stream("TRK-MYON-102", is_deviating=False),
        simulate_truck_stream("TRK-MYON-103", is_deviating=False),
        simulate_truck_stream("TRK-ANOMALY-501", is_deviating=True),  # Triggers flashing red rings
        simulate_truck_stream("TRK-ANOMALY-502", is_deviating=True)   # Triggers flashing red rings
    )

if __name__ == "__main__":
    asyncio.run(main())
