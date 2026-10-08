import uuid
import math
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
try:
    from ..domains.logistics.models import Waybill, DeliveryManifest, ManifestStop
except (ImportError, ValueError):
    try:
        from app.domains.logistics.models import Waybill, DeliveryManifest, ManifestStop
    except (ImportError, ModuleNotFoundError):
        from backend.app.domains.logistics.models import Waybill, DeliveryManifest, ManifestStop

class IoTRouteOptimizationEngine:
    @staticmethod
    def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Computes Great-Circle distance between two points in kilometers to map route legs."""
        rad_lat1, rad_lon1, rad_lat2, rad_lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        dlat = rad_lat2 - rad_lat1
        dlon = rad_lon2 - rad_lon1
        a = math.sin(dlat/2)**2 + math.cos(rad_lat1) * math.cos(rad_lat2) * math.sin(dlon/2)**2
        return 2 * 6371.0 * math.asin(math.sqrt(a))

    @classmethod
    async def optimize_manifest_routing_sequence(
        cls, db: AsyncSession, tenant_id: uuid.UUID, manifest_id: uuid.UUID, origin_lat: float, origin_lng: float
    ) -> Dict[str, Any]:
        """Greedy Nearest-Neighbor algorithm to calculate the optimal delivery sequence for multi-stop manifests."""
        # 1. Fetch all pending manifest stops linked to active waybills
        stmt = (
            select(ManifestStop, Waybill)
            .join(Waybill, ManifestStop.waybill_id == Waybill.id)
            .join(DeliveryManifest, ManifestStop.manifest_id == DeliveryManifest.id)
            .where(
                DeliveryManifest.id == manifest_id, DeliveryManifest.tenant_id == tenant_id
            )
        )
        res = db.execute(stmt)
        if hasattr(res, "__await__"):
            res = await res
        stops_data = res.all()
        
        if not stops_data:
            return {"status": "EMPTY_MANIFEST", "total_distance_km": 0.0}

        unvisited = list(stops_data)
        optimized_sequence = []
        current_lat, current_lng = origin_lat, origin_lng
        accumulated_distance = 0.0
        sequence_counter = 1

        # 2. Asynchronously calculate closest next stop coordinates
        while unvisited:
            closest_stop = min(
                unvisited,
                # In production, query an external logistics matrix mapping api (OSRM, TomTom, HERE API)
                key=lambda s: cls.calculate_haversine_distance(current_lat, current_lng, float(s.Waybill.dest_lat), float(s.Waybill.dest_lng))
            )
            
            distance_to_stop = cls.calculate_haversine_distance(current_lat, current_lng, float(closest_stop.Waybill.dest_lat), float(closest_stop.Waybill.dest_lng))
            accumulated_distance += distance_to_stop
            
            # Update the specific step execution order in memory
            closest_stop.ManifestStop.sequence_order = sequence_counter
            optimized_sequence.append(closest_stop.ManifestStop)
            if hasattr(db, "add"):
                db.add(closest_stop.ManifestStop)
            
            # Move coordinates anchor forward to current stop node
            current_lat, current_lng = float(closest_stop.Waybill.dest_lat), float(closest_stop.Waybill.dest_lng)
            sequence_counter += 1
            unvisited.remove(closest_stop)

        # 3. Commit optimized tracking indicators atomically to PostgreSQL
        res_up = db.execute(
            update(DeliveryManifest)
            .where(DeliveryManifest.id == manifest_id)
            .values(status="OPTIMIZED", total_distance_km=accumulated_distance)
        )
        if hasattr(res_up, "__await__"):
            await res_up

        res_c = db.commit()
        if hasattr(res_c, "__await__"):
            await res_c

        return {
            "status": "OPTIMIZED",
            "total_stops_sequenced": len(optimized_sequence),
            "calculated_distance_km": round(accumulated_distance, 2)
        }
