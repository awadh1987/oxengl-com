// File: frontend/src/components/NotificationTopBar.tsx
import React, { useState, useEffect } from 'react';
import { getAuthToken, getTenantId } from '../services/api';

interface AlertNotification {
  id: string;
  vehicle_id: string;
  magnitude: number;
  timestamp: string;
}

export const NotificationTopBar: React.FC = () => {
  const [activeAlerts, setActiveAlerts] = useState<AlertNotification[]>([]);
  const [isDismissed, setIsDismissed] = useState(false);

  // Bind directly into the live logistics telemetry socket wire mesh loop only if authenticated
  useEffect(() => {
    const token = getAuthToken();
    const tenantId = getTenantId();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (tenantId) params.set('tenant_id', tenantId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/logistics/ws/fleet-stream${qs}`);
      
      socket.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          
          if (packet.routing_status === 'VECTOR_DEVIATION_ALERT') {
            const newAlert: AlertNotification = {
              id: `${packet.vehicle_id}-${Date.now()}`,
              vehicle_id: packet.vehicle_id,
              magnitude: packet.deviation_magnitude_km || 0,
              timestamp: new Date().toLocaleTimeString()
            };
            
            // Push the newest high-priority warning right to the top of the context buffer
            setActiveAlerts((prev) => [newAlert, ...prev.slice(0, 4)]);
            setIsDismissed(false);
          }
        } catch {
          // ignore non-json
        }
      };

      socket.onerror = () => {};
    } catch {
      // socket init error
    }

    return () => {
      if (socket) socket.close();
    };
  }, []);

  if (activeAlerts.length === 0 || isDismissed) return null;

  const currentCriticalWarning = activeAlerts[0];

  return (
    <div className="w-full bg-gradient-to-r from-rose-950 via-red-900 to-rose-950 border-b border-rose-500/30 px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5 animate-fade-in relative z-50">
      <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
        {/* Flashing Alert Indicator Badge */}
        <span className="flex h-2 w-2 relative shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
        
        {/* High-Impact Security Marquee Text */}
        <p className="text-xs font-mono font-bold tracking-wide text-rose-100 uppercase truncate">
          <span dir="ltr" className="inline-block unicode-bidi-isolate">[CRITICAL OPERATION ALERT]</span> - Fleet Unit <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-amber-400">{currentCriticalWarning.vehicle_id}</span> has deviated <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono underline text-red-400 font-extrabold">{currentCriticalWarning.magnitude.toFixed(2)} KM</span> off-corridor. Dispatching Multi-Channel Notifications to managers.
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Dynamic Alarm Tracker Counter Bubble */}
        <span dir="ltr" className="inline-block unicode-bidi-isolate bg-red-600/30 border border-red-500/40 text-red-200 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold animate-pulse whitespace-nowrap shrink-0">
          {activeAlerts.length} Active Deviations
        </span>
        
        {/* Actionable Clear Button */}
        <button 
          onClick={() => setIsDismissed(true)}
          className="text-rose-300/60 hover:text-rose-100 text-xs font-sans transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
