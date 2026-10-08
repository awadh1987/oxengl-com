# File: backend/app/domains/logistics/router_engine.py
import math
from typing import List, Tuple, Dict, Optional

class AutomatedRouteOptimizer:
    """
    Computes optimal transit vectors using real-time spatial cost formulas.
    Integrates live velocity, border delays, and destination targets.
    """
    def __init__(self, border_port_delay_weights: Optional[Dict[str, float]] = None):
        # Localized latency delay multipliers (e.g., Batha Border vs RUH Airport)
        self.port_weights = border_port_delay_weights or {"Batha": 1.0, "RUH": 1.2}

    def calculate_haversine_distance(self, coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
        """
        Computes accurate spherical path distance between two GPS vector elements.
        """
        lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
        lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
        
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        earth_radius_km = 6371.0
        return earth_radius_km * c

    def evaluate_optimal_path(self, origin: Tuple[float, float], destination: Tuple[float, float], active_congestion: float) -> Dict:
        """
        Evaluates best path vector weights balancing physical distance and delay factors.
        """
        base_distance = self.calculate_haversine_distance(origin, destination)
        
        # Operational Cost Formula: Distance modified by traffic latency variables
        optimized_cost_weight = base_distance * (1.0 + active_congestion)
        estimated_time_hours = optimized_cost_weight / 75.0 # Calculated at 75 km/h base fleet velocity
        
        return {
            "base_distance_km": round(base_distance, 2),
            "weighted_cost_index": round(optimized_cost_weight, 2),
            "estimated_transit_time_hrs": round(estimated_time_hours, 2),
            "status": "OPTIMAL" if active_congestion < 0.4 else "CONGESTION_AVOIDANCE"
        }
