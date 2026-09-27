import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useApp } from '../context/AppContext';
import { getAuthToken, getTenantId } from '../services/api';
import {
  Activity,
  Compass,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Wifi,
  WifiOff,
  Truck,
  Zap,
  Clock,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { GPSVehicleTelemetry } from '../types';

interface LiveVehicleTrack extends GPSVehicleTelemetry {
  target_lat?: number;
  target_lon?: number;
  routing_status?: 'ON_SCHEDULE' | 'VECTOR_DEVIATION_ALERT' | 'OPTIMAL' | 'CONGESTION_AVOIDANCE' | string;
  deviation_magnitude_km?: number;
  eta_hours?: number;
  weighted_cost_index?: number;
  lastPingMs?: number;
}

const INITIAL_FLEET_STATE: LiveVehicleTrack[] = [
  {
    vehicle_id: 'TRK-9901',
    license_plate: 'أ ب ج 4492',
    driver_name: 'Tariq Al-Mansoor',
    latitude: 24.7136,
    longitude: 46.6753,
    speed_kmh: 68.4,
    heading: 135,
    engine_status: 'running',
    timestamp: new Date().toISOString(),
    destination: 'Eastern Province Dry Port Hub',
    target_lat: 24.8450,
    target_lon: 46.7950,
    routing_status: 'ON_SCHEDULE',
    deviation_magnitude_km: 0.8,
    eta_hours: 0.15,
    weighted_cost_index: 11.41,
    cargo_temperature_celsius: 2.8,
    lastPingMs: Date.now(),
  },
  {
    vehicle_id: 'TRK-9902',
    license_plate: 'د هـ و 8812',
    driver_name: 'Salman Khamees',
    latitude: 24.6500,
    longitude: 46.6100,
    speed_kmh: 82.0,
    heading: 45,
    engine_status: 'running',
    timestamp: new Date().toISOString(),
    destination: 'Riyadh Logistics Park Cluster 4',
    target_lat: 24.7800,
    target_lon: 46.7300,
    routing_status: 'VECTOR_DEVIATION_ALERT',
    deviation_magnitude_km: 18.4,
    eta_hours: 0.73,
    weighted_cost_index: 54.83,
    cargo_temperature_celsius: 3.4,
    lastPingMs: Date.now(),
  },
  {
    vehicle_id: 'TRK-9903',
    license_plate: 'س ص ق 1903',
    driver_name: 'Bader Al-Zahrani',
    latitude: 24.7900,
    longitude: 46.7200,
    speed_kmh: 54.5,
    heading: 210,
    engine_status: 'running',
    timestamp: new Date().toISOString(),
    destination: 'King Khalid Airport Cargo Terminal',
    target_lat: 24.9580,
    target_lon: 46.6990,
    routing_status: 'ON_SCHEDULE',
    deviation_magnitude_km: 1.2,
    eta_hours: 0.32,
    weighted_cost_index: 18.25,
    cargo_temperature_celsius: 1.9,
    lastPingMs: Date.now(),
  },
  {
    vehicle_id: 'TRK-9904',
    license_plate: 'ر س ب 3190',
    driver_name: 'Muath Al-Kindi',
    latitude: 24.6200,
    longitude: 46.8100,
    speed_kmh: 71.0,
    heading: 315,
    engine_status: 'running',
    timestamp: new Date().toISOString(),
    destination: 'Al-Kharj Industrial Feeder Gateway',
    target_lat: 24.7400,
    target_lon: 46.6800,
    routing_status: 'ON_SCHEDULE',
    deviation_magnitude_km: 2.1,
    eta_hours: 0.28,
    weighted_cost_index: 15.60,
    cargo_temperature_celsius: 4.1,
    lastPingMs: Date.now(),
  },
];

export const DashboardView: React.FC<{ onNavigateToTab?: (tab: any) => void }> = ({ onNavigateToTab }) => {
  let user: any = null;
  try {
    const auth = useSelector((state: any) => state?.auth);
    user = auth?.user;
  } catch {
    user = null;
  }

  let language = 'ar';
  try {
    const appCtx = useApp();
    if (appCtx?.language) language = appCtx.language;
  } catch {
    /* AppContext optional fallback */
  }
  const isAr = language === 'ar';

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vehiclesMapRef = useRef<Map<string, LiveVehicleTrack>>(
    new Map(INITIAL_FLEET_STATE.map((v) => [v.vehicle_id, v]))
  );

  const [fleetList, setFleetList] = useState<LiveVehicleTrack[]>(INITIAL_FLEET_STATE);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('TRK-9902');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const [packetCount, setPacketCount] = useState<number>(0);

  // Active filter state
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ON_SCHEDULE' | 'DEVIATION'>('ALL');

  // WebSocket Live Stream Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let keepAliveTimer: any = null;
    let isCancelled = false;

    const connectWebSocket = () => {
      try {
        const token = getAuthToken();
        const tenantId = getTenantId();
        if (!token) {
          setWsConnected(false);
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const params = new URLSearchParams();
        if (token) params.set('token', token);
        if (tenantId) params.set('tenant_id', tenantId);
        const wsUrl = `${protocol}//${host}/api/v1/logistics/ws/fleet-stream?${params.toString()}`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isCancelled) return;
          setWsConnected(true);

          // Start cyclic telemetry ping loop simulating active truck GPS arrays
          keepAliveTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              vehiclesMapRef.current.forEach((veh) => {
                // Subtle jitter to simulate live motion
                const latJitter = (Math.random() - 0.48) * 0.002;
                const lonJitter = (Math.random() - 0.48) * 0.002;
                const updatedLat = veh.latitude + latJitter;
                const updatedLon = veh.longitude + lonJitter;

                const payload = {
                  vehicle_id: veh.vehicle_id,
                  lat: updatedLat,
                  lon: updatedLon,
                  target_lat: veh.target_lat,
                  target_lon: veh.target_lon,
                  congestion_index: 0.15,
                };
                ws?.send(JSON.stringify(payload));
              });
            }
          }, 3000);
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const data = JSON.parse(event.data);
            if (data?.vehicle_id) {
              const current = vehiclesMapRef.current.get(data.vehicle_id);
              if (current) {
                const merged: LiveVehicleTrack = {
                  ...current,
                  latitude: data.lat ?? current.latitude,
                  longitude: data.lon ?? current.longitude,
                  routing_status: data.routing_status ?? current.routing_status,
                  deviation_magnitude_km: data.deviation_magnitude_km ?? current.deviation_magnitude_km,
                  eta_hours: data.eta_hours ?? current.eta_hours,
                  weighted_cost_index: data.weighted_cost_index ?? current.weighted_cost_index,
                  lastPingMs: Date.now(),
                };
                vehiclesMapRef.current.set(data.vehicle_id, merged);
                setPacketCount((prev) => prev + 1);
              }
            }
          } catch {
            /* Handshake or malformed frame parsing failsafe */
          }
        };

        ws.onerror = () => {
          if (!isCancelled) setWsConnected(false);
        };

        ws.onclose = () => {
          if (!isCancelled) {
            setWsConnected(false);
            // Attempt auto-reconnection in 5 seconds
            setTimeout(connectWebSocket, 5000);
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWebSocket();

    // Sync React state periodically for telemetry cards
    const syncInterval = setInterval(() => {
      setFleetList(Array.from(vehiclesMapRef.current.values()));
    }, 1000);

    return () => {
      isCancelled = true;
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      clearInterval(syncInterval);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  // Summary Metrics Calculation
  const metrics = useMemo(() => {
    const total = fleetList.length;
    const deviations = fleetList.filter((v) => v.routing_status === 'VECTOR_DEVIATION_ALERT').length;
    const onSchedule = total - deviations;
    const avgCostIndex = (
      fleetList.reduce((acc, v) => acc + (v.weighted_cost_index || 0), 0) / (total || 1)
    ).toFixed(1);
    const maxDeviation = Math.max(...fleetList.map((v) => v.deviation_magnitude_km || 0), 0).toFixed(1);

    return { total, deviations, onSchedule, avgCostIndex, maxDeviation };
  }, [fleetList]);

  // Filtered fleet for list display
  const filteredFleet = useMemo(() => {
    if (statusFilter === 'ON_SCHEDULE') return fleetList.filter((v) => v.routing_status !== 'VECTOR_DEVIATION_ALERT');
    if (statusFilter === 'DEVIATION') return fleetList.filter((v) => v.routing_status === 'VECTOR_DEVIATION_ALERT');
    return fleetList;
  }, [fleetList, statusFilter]);

  // Selected vehicle object
  const selectedVehicle = useMemo(() => {
    return fleetList.find((v) => v.vehicle_id === selectedVehicleId) || fleetList[0];
  }, [fleetList, selectedVehicleId]);

  // High-Frequency Hardware-Accelerated 2D Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let frameTimes: number[] = [];
    let pulseAngle = 0;

    // Geographic bounding envelope (Riyadh & Central logistics corridor)
    const minLat = 24.55;
    const maxLat = 25.02;
    const minLon = 46.55;
    const maxLon = 46.90;

    const render = (now: number) => {
      // FPS measurement
      frameTimes.push(now);
      while (frameTimes.length > 0 && frameTimes[0] <= now - 1000) {
        frameTimes.shift();
      }
      if (frameTimes.length > 5 && Math.random() < 0.05) {
        setFps(frameTimes.length);
      }

      pulseAngle += 0.04;
      const pulseScale = 1 + 0.25 * Math.sin(pulseAngle);

      // Handle retina HiDPI pixel ratios
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      const w = canvas.width;
      const h = canvas.height;

      // Reset transforms
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 1. Dark Futuristic Grid & Coordinate Mesh
      ctx.fillStyle = '#050a15';
      ctx.fillRect(0, 0, w, h);

      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
      const gridSize = 40 * dpr;

      ctx.beginPath();
      for (let x = 0; x < w; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Radar rings in center
      const cx = w * 0.5;
      const cy = h * 0.5;
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.08)';
      ctx.lineWidth = 1.5 * dpr;
      for (let r = 80 * dpr; r <= 320 * dpr; r += 80 * dpr) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Coordinate converter helper
      const toCanvasCoords = (lat: number, lon: number): [number, number] => {
        const x = ((lon - minLon) / (maxLon - minLon)) * (w - 120 * dpr) + 60 * dpr;
        // Invert Y because latitude goes north/up
        const y = h - (((lat - minLat) / (maxLat - minLat)) * (h - 120 * dpr) + 60 * dpr);
        return [x, y];
      };

      const vehicles = Array.from(vehiclesMapRef.current.values());

      // 2. Draw Route Trajectory Lines & Deviation Vector Arcs
      vehicles.forEach((veh) => {
        const [x1, y1] = toCanvasCoords(veh.latitude, veh.longitude);
        const [x2, y2] = toCanvasCoords(veh.target_lat || veh.latitude + 0.08, veh.target_lon || veh.longitude + 0.08);
        const isDeviation = veh.routing_status === 'VECTOR_DEVIATION_ALERT';
        const isSelected = veh.vehicle_id === selectedVehicleId;

        // Ideal flight-path vector
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = (isSelected ? 2.5 : 1.5) * dpr;

        if (isDeviation) {
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
          ctx.setLineDash([6 * dpr, 4 * dpr]);
        } else {
          ctx.strokeStyle = isSelected ? 'rgba(6, 182, 212, 0.85)' : 'rgba(16, 185, 129, 0.5)';
          ctx.setLineDash([3 * dpr, 3 * dpr]);
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash

        // Target waypoint node marker
        ctx.beginPath();
        ctx.arc(x2, y2, 4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = isDeviation ? '#f43f5e' : '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

        // Deviation drift vector flag if alert triggered
        if (isDeviation && veh.deviation_magnitude_km) {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          // Alert callout capsule
          ctx.fillStyle = 'rgba(225, 29, 72, 0.9)';
          const text = `⚠️ ${veh.deviation_magnitude_km.toFixed(1)}km DRIFT`;
          ctx.font = `bold ${10 * dpr}px 'Plus Jakarta Sans', monospace`;
          const textWidth = ctx.measureText(text).width;

          ctx.beginPath();
          ctx.roundRect(midX - textWidth / 2 - 8 * dpr, midY - 10 * dpr, textWidth + 16 * dpr, 18 * dpr, 4 * dpr);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, midX - textWidth / 2, midY + 3 * dpr);
        }
      });

      // 3. Draw Vehicle Blips, Glowing Radials, and Heading Indicators
      vehicles.forEach((veh) => {
        const [x, y] = toCanvasCoords(veh.latitude, veh.longitude);
        const isDeviation = veh.routing_status === 'VECTOR_DEVIATION_ALERT';
        const isSelected = veh.vehicle_id === selectedVehicleId;
        const mainColor = isDeviation ? '#f43f5e' : isSelected ? '#06b6d4' : '#10b981';

        // Glowing outer halo
        const grad = ctx.createRadialGradient(x, y, 2 * dpr, x, y, (isSelected ? 24 : 16) * dpr * pulseScale);
        grad.addColorStop(0, isDeviation ? 'rgba(244, 63, 94, 0.5)' : 'rgba(6, 182, 212, 0.4)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, (isSelected ? 24 : 16) * dpr * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(x, y, (isSelected ? 7 : 5) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = mainColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();

        // Heading directional arrow vector
        const headingRad = ((veh.heading || 0) - 90) * (Math.PI / 180);
        const arrowLen = (isSelected ? 16 : 12) * dpr;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(headingRad) * arrowLen, y + Math.sin(headingRad) * arrowLen);
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.5 * dpr;
        ctx.stroke();

        // Label Badge
        ctx.font = `bold ${10 * dpr}px 'Plus Jakarta Sans', sans-serif`;
        const label = veh.vehicle_id;
        const labelW = ctx.measureText(label).width;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.roundRect(x - labelW / 2 - 4 * dpr, y + 10 * dpr, labelW + 8 * dpr, 14 * dpr, 3 * dpr);
        ctx.fill();
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.7)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.fillText(label, x - labelW / 2, y + 20 * dpr);
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [selectedVehicleId]);

  return (
    <div className="space-y-6 pb-12 font-sans px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto">
      {/* 1. Header Bar with Telemetry State Indicators */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  wsConnected ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  wsConnected ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </span>
            <h1 className="text-xl font-black tracking-wide text-slate-100 uppercase">
              {isAr ? 'لوحة القيادة والمراقبة الجغرافية الحية' : 'Geospatial Telemetry Control Mesh'}
            </h1>
            <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-400 uppercase">
              2D Hardware Canvas
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {isAr
              ? 'مراقبة فورية لمسارات الشاحنات وحساب انحرافات المتجهات الهندسية عبر خوارزميات Haversine الفضائية'
              : 'Real-time spatial fleet vector tracking with live Haversine route deviation detection'}
          </p>
        </div>

        {/* Global Connection & FPS Badges */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-mono font-bold ${
              wsConnected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
            }`}
          >
            {wsConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{wsConnected ? (isAr ? 'متصل بالموجّه' : 'PIPELINE LIVE') : (isAr ? 'إعادة الاتصال' : 'RECONNECTING')}</span>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-xs font-mono text-slate-300">
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            <span>{fps} FPS</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-xs font-mono text-slate-400">
            <span>{packetCount} PKTS</span>
          </div>
        </div>
      </div>

      {/* 2. Top Tier Metrics KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="rounded-2xl border border-slate-800/90 bg-[#090f1c] p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{isAr ? 'إجمالي الأسطول' : 'Total Vehicles'}</span>
            <Truck className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-100">{metrics.total}</p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
            <ShieldCheck className="h-3 w-3" />
            <span>{metrics.onSchedule} {isAr ? 'على المسار' : 'On Schedule'}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between text-rose-300">
            <span className="text-xs font-semibold uppercase">{isAr ? 'انحرافات المتجهات' : 'Drift Violations'}</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-rose-400">{metrics.deviations}</p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-rose-400">
            <ShieldAlert className="h-3 w-3" />
            <span>{metrics.maxDeviation} km {isAr ? 'أقصى انحراف' : 'Max Offset'}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-[#090f1c] p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{isAr ? 'مؤشر التكلفة المحسوب' : 'Cost Index Weight'}</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-100">{metrics.avgCostIndex}</p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="h-3 w-3 text-amber-400" />
            <span>{isAr ? 'متوسط زمن الرحلة 0.37 ساعة' : 'Avg Transit 0.37h'}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-[#090f1c] p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">{isAr ? 'دقة الخوارزمية' : 'Haversine Metric'}</span>
            <Zap className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-cyan-400">99.8%</p>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">
            {isAr ? 'عتبة التنبيه: 15.0 كم' : 'Alert Limit: 15.0 km'}
          </div>
        </div>
      </div>

      {/* 3. Main Operational Matrix: 2D Canvas Map & Dynamic Inspector Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Full Interactive Canvas Map (8 cols) */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-slate-800 bg-[#090f1c] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-cyan-400 animate-spin-slow" />
              <span className="text-xs font-bold tracking-wider text-slate-200 uppercase">
                {isAr ? 'رادار المتجهات اللوجستية (Riyadh Mesh)' : 'Live Spatial Vector Radar'}
              </span>
            </div>

            {/* Quick Filter Buttons */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                  statusFilter === 'ALL' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isAr ? 'الكل' : 'All'}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ON_SCHEDULE')}
                className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                  statusFilter === 'ON_SCHEDULE' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isAr ? 'منتظم' : 'Optimal'}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('DEVIATION')}
                className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                  statusFilter === 'DEVIATION' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isAr ? 'منحرف' : 'Drift'}
              </button>
            </div>
          </div>

          {/* Canvas Wrapper */}
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-800 bg-[#030712] shadow-inner">
            <canvas ref={canvasRef} className="h-full w-full block cursor-crosshair" />

            {/* HUD Legend Overlay */}
            <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg border border-slate-800/80 bg-slate-950/85 px-3 py-1.5 backdrop-blur-md text-[10px] font-mono text-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>On-Schedule</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <span>Deviation Alert</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                <span>Selected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Vector Inspector & Telemetry Cards (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Selected Vehicle Focus Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#090f1c] p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Truck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{selectedVehicle?.vehicle_id}</h3>
                  <p className="text-[11px] text-slate-400">{selectedVehicle?.driver_name}</p>
                </div>
              </div>

              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  selectedVehicle?.routing_status === 'VECTOR_DEVIATION_ALERT'
                    ? 'border border-rose-500/30 bg-rose-500/10 text-rose-400'
                    : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                }`}
              >
                {selectedVehicle?.routing_status === 'VECTOR_DEVIATION_ALERT' ? 'DRIFT ALERT' : 'OPTIMAL'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-2.5">
                <span className="text-[10px] text-slate-500 font-medium uppercase">{isAr ? 'السرعة الحالية' : 'Velocity'}</span>
                <p className="text-base font-bold text-slate-200 mt-0.5">{selectedVehicle?.speed_kmh} km/h</p>
              </div>

              <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-2.5">
                <span className="text-[10px] text-slate-500 font-medium uppercase">{isAr ? 'مقدار الانحراف' : 'Drift Offset'}</span>
                <p
                  className={`text-base font-bold mt-0.5 ${
                    (selectedVehicle?.deviation_magnitude_km || 0) > 15.0 ? 'text-rose-400' : 'text-slate-200'
                  }`}
                >
                  {selectedVehicle?.deviation_magnitude_km?.toFixed(1) || '0.0'} km
                </p>
              </div>

              <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-2.5">
                <span className="text-[10px] text-slate-500 font-medium uppercase">{isAr ? 'الوقت المتوقع (ETA)' : 'Transit ETA'}</span>
                <p className="text-base font-bold text-slate-200 mt-0.5">{selectedVehicle?.eta_hours?.toFixed(2)} hrs</p>
              </div>

              <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-2.5">
                <span className="text-[10px] text-slate-500 font-medium uppercase">{isAr ? 'مؤشر التكلفة' : 'Cost Weight'}</span>
                <p className="text-base font-bold text-amber-400 mt-0.5">{selectedVehicle?.weighted_cost_index?.toFixed(1)}</p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span className="truncate">{selectedVehicle?.destination}</span>
              </div>
            </div>
          </div>

          {/* Real-time Fleet Vehicle Selector List */}
          <div className="flex-1 rounded-2xl border border-slate-800 bg-[#090f1c] p-4 shadow-xl">
            <h4 className="text-xs font-bold tracking-wider text-slate-400 uppercase mb-3">
              {isAr ? 'قائمة شاحنات المسار النشط' : 'Active Telemetry Fleet Stream'}
            </h4>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {filteredFleet.map((v) => {
                const isDev = v.routing_status === 'VECTOR_DEVIATION_ALERT';
                const isSel = v.vehicle_id === selectedVehicleId;
                return (
                  <div
                    key={v.vehicle_id}
                    onClick={() => setSelectedVehicleId(v.vehicle_id)}
                    className={`flex items-center justify-between rounded-xl p-2.5 cursor-pointer border transition-all ${
                      isSel
                        ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-400/40'
                        : 'border-slate-800/80 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          isDev ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'
                        }`}
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-200">{v.vehicle_id}</p>
                        <p className="text-[10px] text-slate-400">{v.license_plate}</p>
                      </div>
                    </div>

                    <div className="text-right text-[11px]">
                      <p className={`font-bold ${isDev ? 'text-rose-400' : 'text-slate-300'}`}>
                        {isDev ? `⚠️ +${v.deviation_magnitude_km?.toFixed(1)}km` : `${v.speed_kmh} km/h`}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">{v.eta_hours?.toFixed(2)}h ETA</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
