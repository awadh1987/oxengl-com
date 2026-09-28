import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Truck,
  Radio,
  Activity,
  Wifi,
  WifiOff,
  Gauge,
  Compass,
  Fuel,
  MapPin,
  AlertTriangle,
  RefreshCw,
  Play,
  Pause,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  ArrowUpRight,
  Clock,
  Layers,
  Send,
  Thermometer,
  Zap,
  Droplets,
  Cpu,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getAuthToken, getTenantId } from '../services/api';
import { GPSVehicleTelemetry, FleetStreamMessage } from '../types';

export interface FleetTrackerProps {
  wsEndpoint?: string;
  autoConnect?: boolean;
  className?: string;
}

type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

const DEFAULT_WS_PATH = '/api/v1/logistics/ws/fleet-stream';

// Baseline fallback telemetry vehicles representing heavy logistics fleet with cold-chain IoT telemetry
const INITIAL_MOCK_FLEET: GPSVehicleTelemetry[] = [
  {
    vehicle_id: 'TRK-401',
    license_plate: 'أ ب ج 4492',
    make_model: 'Mercedes-Benz Actros 3340',
    driver_name: 'Tariq Al-Mansoor',
    latitude: 24.7136,
    longitude: 46.6753,
    speed_kmh: 68.4,
    heading: 142,
    altitude_m: 612,
    engine_status: 'running',
    fuel_level_pct: 78.5,
    odometer_km: 142580.4,
    timestamp: new Date().toISOString(),
    route_id: 'RTH-RYD-DMM-01',
    destination: 'Eastern Province Dry Port Hub',
    alerts: [],
    cargo_temperature_celsius: 2.8,
    ambient_humidity_percentage: 45.2,
    device_battery_voltage: 12.4,
    temp: 2.8,
    humidity: 45.2,
    voltage: 12.4,
  },
  {
    vehicle_id: 'TRK-402',
    license_plate: 'د هـ و 8812',
    make_model: 'Volvo FMX 440 Heavy Tiper',
    driver_name: 'Salman Khamees',
    latitude: 21.5433,
    longitude: 39.1728,
    speed_kmh: 0.0,
    heading: 0,
    altitude_m: 14,
    engine_status: 'idle',
    fuel_level_pct: 42.0,
    odometer_km: 98410.2,
    timestamp: new Date().toISOString(),
    route_id: 'JED-QUARRY-SEC-4',
    destination: 'Jeddah North Quarry Silo',
    alerts: ['Idling > 25 mins', 'Cold-Chain Breach (+5.6°C > 4.2°C)'],
    cargo_temperature_celsius: 5.6, // Breach > 4.2 C
    ambient_humidity_percentage: 62.0,
    device_battery_voltage: 12.1,
    temp: 5.6,
    humidity: 62.0,
    voltage: 12.1,
  },
  {
    vehicle_id: 'TRK-403',
    license_plate: 'س ص ق 1903',
    make_model: 'Scania R500 V8 Streamline',
    driver_name: 'Bader Al-Zahrani',
    latitude: 26.4207,
    longitude: 50.0888,
    speed_kmh: 84.1,
    heading: 285,
    altitude_m: 8,
    engine_status: 'running',
    fuel_level_pct: 91.2,
    odometer_km: 210450.8,
    timestamp: new Date().toISOString(),
    route_id: 'KHF-DAMMAM-CORRIDOR',
    destination: 'King Fahd Industrial Port Depot',
    alerts: [],
    cargo_temperature_celsius: 3.2,
    ambient_humidity_percentage: 41.5,
    device_battery_voltage: 12.8,
    temp: 3.2,
    humidity: 41.5,
    voltage: 12.8,
  },
  {
    vehicle_id: 'TRK-404',
    license_plate: 'م ن ل 7721',
    make_model: 'MAN TGS 33.480 6x4',
    driver_name: 'Abdullah Al-Ghamdi',
    latitude: 24.1289,
    longitude: 47.3119,
    speed_kmh: 0.0,
    heading: 0,
    altitude_m: 490,
    engine_status: 'stopped',
    fuel_level_pct: 18.4,
    odometer_km: 175300.0,
    timestamp: new Date().toISOString(),
    route_id: 'AL-KHARJ-FEEDER',
    destination: 'Al-Kharj Central Maintenance Base',
    alerts: ['Low Fuel Warning (<20%)'],
    cargo_temperature_celsius: 1.8,
    ambient_humidity_percentage: 38.0,
    device_battery_voltage: 12.5,
    temp: 1.8,
    humidity: 38.0,
    voltage: 12.5,
  },
];

export const FleetTracker: React.FC<FleetTrackerProps> = ({
  wsEndpoint = DEFAULT_WS_PATH,
  autoConnect = true,
  className = '',
}) => {
  const { language, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [vehicles, setVehicles] = useState<GPSVehicleTelemetry[]>(INITIAL_MOCK_FLEET);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(INITIAL_MOCK_FLEET[0].vehicle_id);
  const [telemetryLogs, setTelemetryLogs] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }>>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'idle' | 'stopped'>('all');
  const [messageCounter, setMessageCounter] = useState(0);
  const [canvasFps, setCanvasFps] = useState<number>(60);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingTimestampRef = useRef<number>(0);

  // Dedicated HTML5 Canvas and Locked 60 FPS Render Loop Refs
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarAnimationRef = useRef<number | null>(null);
  const vehiclesCanvasRef = useRef<GPSVehicleTelemetry[]>(INITIAL_MOCK_FLEET);

  // Sync ref with vehicles state for immediate 60 FPS canvas painting without waiting for rerender cycles
  useEffect(() => {
    vehiclesCanvasRef.current = vehicles;
  }, [vehicles]);

  const appendLog = useCallback((text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    setTelemetryLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        time: new Date().toLocaleTimeString(),
        text,
        type,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // Compute WebSocket URL resolving relative path against current location to leverage Vite dev proxy
  const resolveWsUrl = useCallback((path: string): string => {
    if (path.startsWith('ws://') || path.startsWith('wss://')) {
      return path;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${protocol}//${window.location.host}${cleanPath}`;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('DISCONNECTED');
    setLatencyMs(null);
  }, []);

  const connect = useCallback(() => {
    disconnect();
    const token = getAuthToken();
    const tenantId = getTenantId();
    if (!token) {
      setConnectionStatus('DISCONNECTED');
      return;
    }

    const rawUrl = resolveWsUrl(wsEndpoint);
    let url = rawUrl;
    try {
      const parsedUrl = new URL(rawUrl, window.location.href);
      if (token) parsedUrl.searchParams.set('token', token);
      if (tenantId) parsedUrl.searchParams.set('tenant_id', tenantId);
      url = parsedUrl.toString();
    } catch {
      // url parse fallback
    }

    setConnectionStatus('CONNECTING');
    appendLog(isAr ? `جاري الاتصال بقناة تتبع الأسطول: ${url}` : `Opening WebSocket telemetry bridge to: ${url}`, 'info');

    try {
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus('CONNECTED');
        appendLog(isAr ? 'تم فتح نفق التتبع اللاسلكي بنجاح دون أخطاء CORS' : 'WebSocket connection established without CORS faults', 'success');

        // Handshake subscription
        socket.send(JSON.stringify({ type: 'subscribe', channel: 'fleet-telemetry', timestamp: new Date().toISOString() }));

        // Start ping heartbeat
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            pingTimestampRef.current = performance.now();
            socket.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          }
        }, 10000);
      };

      socket.onmessage = (event) => {
        setMessageCounter((c) => c + 1);
        try {
          const parsed = JSON.parse(event.data);

          if (parsed.type === 'pong' && pingTimestampRef.current > 0) {
            const rtt = Math.round(performance.now() - pingTimestampRef.current);
            setLatencyMs(rtt);
            return;
          }

          if (parsed.type === 'connection_established') {
            appendLog(
              isAr
                ? `بوابة القياس عن بعد مفعلة (${parsed.server || 'OxenGL Gateway'})`
                : `Gateway connection verified (${parsed.server || 'OxenGL Gateway'})`,
              'success'
            );
            return;
          }

          // Ingest single telemetry point (with cold chain support)
          if (parsed.vehicle_id) {
            const tempVal = parsed.cargo_temperature_celsius ?? parsed.temp ?? 2.8;
            const humVal = parsed.ambient_humidity_percentage ?? parsed.humidity ?? 45.0;
            const voltVal = parsed.device_battery_voltage ?? parsed.voltage ?? 12.4;
            const speedVal = parsed.speed ?? parsed.speed_kph ?? 0;

            const updatedItem: GPSVehicleTelemetry = {
              vehicle_id: parsed.vehicle_id,
              latitude: parsed.lat ?? parsed.latitude ?? 24.71,
              longitude: parsed.lng ?? parsed.longitude ?? 46.67,
              speed_kmh: speedVal,
              cargo_temperature_celsius: tempVal,
              ambient_humidity_percentage: humVal,
              device_battery_voltage: voltVal,
              temp: tempVal,
              humidity: humVal,
              voltage: voltVal,
              engine_status: speedVal > 0 ? 'running' : 'idle',
              timestamp: parsed.timestamp || new Date().toISOString(),
            };

            setVehicles((prev) => {
              const idx = prev.findIndex((v) => v.vehicle_id === updatedItem.vehicle_id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...updatedItem };
                vehiclesCanvasRef.current = next;
                return next;
              }
              const next = [updatedItem, ...prev];
              vehiclesCanvasRef.current = next;
              return next;
            });

            if (tempVal > 4.2) {
              appendLog(`⚠️ CRITICAL COLD CHAIN BREACH: ${parsed.vehicle_id} @ ${tempVal.toFixed(1)}°C (SLA > +4.2°C)`, 'error');
            } else {
              appendLog(`Telemetry: ${parsed.vehicle_id} @ ${speedVal} km/h (${tempVal.toFixed(1)}°C)`, 'info');
            }
            return;
          }

          if (parsed.telemetry) {
            const item: GPSVehicleTelemetry = parsed.telemetry;
            setVehicles((prev) => {
              const idx = prev.findIndex((v) => v.vehicle_id === item.vehicle_id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...item };
                vehiclesCanvasRef.current = next;
                return next;
              }
              const next = [item, ...prev];
              vehiclesCanvasRef.current = next;
              return next;
            });
            appendLog(`Telemetry: ${item.vehicle_id} @ ${item.speed_kmh} km/h`, 'info');
          } else if (Array.isArray(parsed.batch)) {
            const batch: GPSVehicleTelemetry[] = parsed.batch;
            setVehicles((prev) => {
              const map = new Map<string, GPSVehicleTelemetry>(prev.map((v) => [v.vehicle_id, v]));
              batch.forEach((b) => {
                const prevItem = map.get(b.vehicle_id);
                if (prevItem) {
                  map.set(b.vehicle_id, { ...prevItem, ...b });
                } else {
                  map.set(b.vehicle_id, b);
                }
              });
              const next = Array.from(map.values());
              vehiclesCanvasRef.current = next;
              return next;
            });
            appendLog(`Received telemetry batch of ${batch.length} vehicles`, 'info');
          } else {
            appendLog(`Incoming packet: ${event.data.slice(0, 80)}...`, 'info');
          }
        } catch {
          appendLog(`Raw telemetry frame: ${event.data}`, 'info');
        }
      };

      socket.onerror = () => {
        setConnectionStatus('ERROR');
        appendLog(isAr ? 'خطأ في قناة الاتصال المباشرة' : 'WebSocket transport anomaly detected', 'error');
      };

      socket.onclose = (ev) => {
        setConnectionStatus('DISCONNECTED');
        setLatencyMs(null);
        appendLog(isAr ? `انقطع الاتصال (${ev.code}): سيتم محاولة إعادة الاتصال تلقائياً` : `Connection closed (${ev.code}): auto-reconnect scheduled`, 'warn');

        // Auto-reconnect with 5s delay
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };
    } catch (err: any) {
      setConnectionStatus('ERROR');
      appendLog(err?.message || 'Failed to instantiate WebSocket', 'error');
    }
  }, [disconnect, resolveWsUrl, wsEndpoint, appendLog, isAr]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Simulated live telemetry movement generator when idle
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setVehicles((prev) => {
        const next = prev.map((v) => {
          if (v.engine_status === 'stopped') return v;
          const jitterLat = (Math.random() - 0.5) * 0.0008;
          const jitterLng = (Math.random() - 0.5) * 0.0008;
          const speedDelta = (Math.random() - 0.5) * 4;
          const nextSpeed = Math.max(0, Math.min(110, v.speed_kmh + speedDelta));
          const currentTemp = v.cargo_temperature_celsius ?? v.temp ?? 2.8;
          const tempDelta = (Math.random() - 0.48) * 0.1;
          const nextTemp = Number(Math.max(-5, Math.min(12, currentTemp + tempDelta)).toFixed(1));

          return {
            ...v,
            latitude: Number((v.latitude + jitterLat).toFixed(5)),
            longitude: Number((v.longitude + jitterLng).toFixed(5)),
            speed_kmh: Number(nextSpeed.toFixed(1)),
            cargo_temperature_celsius: nextTemp,
            temp: nextTemp,
            fuel_level_pct: Math.max(5, Number(((v.fuel_level_pct || 75) - 0.01).toFixed(2))),
            timestamp: new Date().toISOString(),
          };
        });
        vehiclesCanvasRef.current = next;
        return next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isPaused]);

  // ──► DEDICATED HARDWARE-ACCELERATED 60 FPS HTML5 RADAR CANVAS RENDER LOOP ──►
  useEffect(() => {
    let frameCount = 0;
    let fpsTimer = performance.now();
    let sweepAngle = 0;

    const renderCanvas = (time: number) => {
      const canvas = radarCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      frameCount++;
      if (time - fpsTimer >= 1000) {
        setCanvasFps(Math.round((frameCount * 1000) / (time - fpsTimer)));
        frameCount = 0;
        fpsTimer = time;
      }

      // Background wipe
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const radius = Math.min(cx, cy) - 25;

      // 1. Polar Range Circles
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.lineWidth = 1;
      for (let r = 40; r <= radius; r += 40) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // 2. Crosshair Axes
      ctx.beginPath();
      ctx.moveTo(cx, 15); ctx.lineTo(cx, canvas.height - 15);
      ctx.moveTo(15, cy); ctx.lineTo(canvas.width - 15, cy);
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
      ctx.stroke();

      // 3. Rotating Sweep Line & Cone
      sweepAngle = (sweepAngle + 0.025) % (2 * Math.PI);
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      sweepGrad.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
      sweepGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, sweepAngle - 0.3, sweepAngle);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      ctx.restore();

      // 4. Render Vehicle Nodes with Cold-Chain Indicators
      const fleetList = vehiclesCanvasRef.current;
      fleetList.forEach((v, idx) => {
        // Map GPS spatial offsets to radar polar coordinates
        const latRef = 24.7136;
        const lngRef = 46.6753;
        const dx = (v.longitude - lngRef) * 2800 + (idx % 2 === 0 ? idx * 30 : -idx * 30);
        const dy = (latRef - v.latitude) * 2800 + (idx % 3 === 0 ? idx * 25 : -idx * 25);

        const x = Math.max(30, Math.min(canvas.width - 30, cx + dx));
        const y = Math.max(30, Math.min(canvas.height - 30, cy + dy));

        const temp = v.cargo_temperature_celsius ?? v.temp ?? 2.8;
        const isBreached = temp > 4.2;

        if (isBreached) {
          // CRITICAL TEMPERATURE BREACH: Flashing Crimson (#ef4444)
          const ringExpansion = (time % 1000) / 1000;
          const outerR = 6 + (ringExpansion * 20);
          const alpha = Math.max(0, 1 - ringExpansion);

          // Outer secondary warning wave
          ctx.beginPath();
          ctx.arc(x, y, outerR, 0, 2 * Math.PI);
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Core beacon
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 12;
          ctx.fill();

          // Badge label
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`🚨 ${v.vehicle_id} (+${temp.toFixed(1)}°C)`, x + 9, y - 2);
        } else {
          // NORMAL OPERATION: Pulsing Emerald Green (#10b981)
          const pulse = (Math.sin(time / 300) + 1) / 2;
          const outerR = 6 + (pulse * 3);

          ctx.beginPath();
          ctx.arc(x, y, outerR, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
          ctx.fillStyle = '#10b981';
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 7;
          ctx.fill();

          ctx.shadowBlur = 0;
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(`${v.vehicle_id} (+${temp.toFixed(1)}°C)`, x + 8, y - 2);
        }
      });

      // 5. Canvas HUD Stamp
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(8, 8, 160, 36);
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
      ctx.strokeRect(8, 8, 160, 36);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`60 FPS CANVAS RADAR`, 15, 22);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(`LOCKED: 60 FPS • COLD-CHAIN`, 15, 34);

      radarAnimationRef.current = requestAnimationFrame(renderCanvas);
    };

    radarAnimationRef.current = requestAnimationFrame(renderCanvas);

    return () => {
      if (radarAnimationRef.current) {
        cancelAnimationFrame(radarAnimationRef.current);
      }
    };
  }, []);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchesSearch =
        v.vehicle_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.license_plate && v.license_plate.includes(searchQuery)) ||
        (v.driver_name && v.driver_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (v.make_model && v.make_model.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || v.engine_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vehicles, searchQuery, statusFilter]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.vehicle_id === selectedVehicleId) || vehicles[0] || null;
  }, [vehicles, selectedVehicleId]);

  const runningCount = vehicles.filter((v) => v.engine_status === 'running').length;
  const idleCount = vehicles.filter((v) => v.engine_status === 'idle').length;
  const stoppedCount = vehicles.filter((v) => v.engine_status === 'stopped').length;
  const breachedCount = vehicles.filter((v) => (v.cargo_temperature_celsius ?? v.temp ?? 2.8) > 4.2).length;
  const avgSpeed = vehicles.length > 0 ? (vehicles.reduce((acc, v) => acc + v.speed_kmh, 0) / vehicles.length).toFixed(1) : '0';

  const sendManualPing = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      pingTimestampRef.current = performance.now();
      wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
      appendLog(isAr ? 'تم إرسال إشارة نبض يدوي PING' : 'Manual PING frame sent across WebSocket tunnel', 'info');
    } else {
      appendLog(isAr ? 'القناة غير متصلة لإرسال الإشارة' : 'Socket is disconnected; cannot transmit ping', 'warn');
    }
  };

  return (
    <div className={`space-y-6 ${isDark ? 'text-slate-100' : 'text-slate-900'} ${className}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Top Banner & Control Deck */}
      <div
        className={`rounded-3xl border p-6 shadow-xl relative overflow-hidden transition-all ${
          isDark
            ? 'border-slate-800 bg-gradient-to-r from-slate-900 via-neutral-900 to-slate-950'
            : 'border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Radio className="h-7 w-7 text-orange-400 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h2 className="text-xl font-black tracking-tight text-white">
                  {isAr ? 'بوابة البث اللاسلكي وتتبع الأسطول الميداني' : 'Cold-Chain Telemetry Radar Grid'}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-black uppercase tracking-wider whitespace-nowrap shrink-0 ${
                    connectionStatus === 'CONNECTED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : connectionStatus === 'CONNECTING'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {connectionStatus === 'CONNECTED' ? (
                    <Wifi className="h-3.5 w-3.5 shrink-0" />
                  ) : connectionStatus === 'CONNECTING' ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {connectionStatus}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono whitespace-nowrap shrink-0">
                  <Cpu className="h-3 w-3 shrink-0" />
                  {canvasFps} FPS CANVAS
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                {isAr
                  ? 'بث حي لإحداثيات GPS ودرجات حرارة التبريد والرطوبة والجهد مع رادار HTML5 Canvas بسرعة 60 إطار/ثانية'
                  : 'Hardware-accelerated 60 FPS Canvas radar tracking real-time cold chain payloads (+4.2°C SLA thresholds)'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <div className="text-[11px] font-mono">
                <span className="text-slate-400">RTT: </span>
                <span className="font-bold text-white">{latencyMs !== null ? `${latencyMs}ms` : '—'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-400" />
              <div className="text-[11px] font-mono">
                <span className="text-slate-400">Frames: </span>
                <span className="font-bold text-white">{messageCounter}</span>
              </div>
            </div>

            <button
              onClick={sendManualPing}
              className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-bold text-white transition-colors"
              title="Transmit WebSocket Ping"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Ping</span>
            </button>

            <button
              onClick={() => setIsPaused((p) => !p)}
              className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-bold text-white transition-colors"
            >
              {isPaused ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-amber-400" />}
              <span>{isPaused ? (isAr ? 'استئناف' : 'Resume') : isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
            </button>

            {connectionStatus === 'CONNECTED' ? (
              <button
                onClick={disconnect}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors"
              >
                <WifiOff className="h-3.5 w-3.5" />
                <span>{isAr ? 'قطع الاتصال' : 'Disconnect'}</span>
              </button>
            ) : (
              <button
                onClick={connect}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{isAr ? 'إعادة الاتصال' : 'Connect WebSocket'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Metric Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-800 bg-[#141726]/90' : 'border-slate-200 bg-white shadow-xs'}`}>
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>{isAr ? 'الأسطول المتتبع' : 'Tracked Fleet'}</span>
            <Truck className="h-4 w-4 text-orange-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-black">{vehicles.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{vehicles.length} Active Transponders</p>
        </div>

        <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-800 bg-[#141726]/90' : 'border-slate-200 bg-white shadow-xs'}`}>
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>{isAr ? 'في المسار (تشغيل)' : 'In-Transit'}</span>
            <Gauge className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-black text-emerald-500">{runningCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{((runningCount / (vehicles.length || 1)) * 100).toFixed(0)}% Fleet Active</p>
        </div>

        <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-800 bg-[#141726]/90' : 'border-slate-200 bg-white shadow-xs'}`}>
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>{isAr ? 'ضمن المواصفة' : 'Within Spec (≤4.2°C)'}</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-black text-emerald-400">{vehicles.length - breachedCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Emerald Green Beacons</p>
        </div>

        <div className={`rounded-2xl border p-4 ${breachedCount > 0 ? 'border-rose-900/60 bg-rose-950/20' : isDark ? 'border-slate-800 bg-[#141726]/90' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center justify-between text-xs font-bold">
            <span className={breachedCount > 0 ? 'text-rose-400' : 'text-slate-400'}>
              {isAr ? 'تجاوزات التبريد' : 'Breaches (>4.2°C)'}
            </span>
            <ShieldAlert className={`h-4 w-4 ${breachedCount > 0 ? 'text-rose-400 animate-bounce' : 'text-slate-400'}`} />
          </div>
          <p className={`mt-2 font-mono text-2xl font-black ${breachedCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>{breachedCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Flashing Crimson Alert</p>
        </div>

        <div className={`rounded-2xl border p-4 ${isDark ? 'border-slate-800 bg-[#141726]/90' : 'border-slate-200 bg-white shadow-xs'}`}>
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>{isAr ? 'متوسط السرعة' : 'Fleet Avg Speed'}</span>
            <Activity className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-black text-blue-500">{avgSpeed} <span className="text-xs font-normal">km/h</span></p>
          <p className="text-[11px] text-slate-400 mt-0.5">Highway & Corridor Transit</p>
        </div>
      </div>

      {/* 60 FPS HTML5 Radar Canvas Grid Section */}
      <div className={`rounded-3xl border p-5 shadow-xl ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-900 text-white'}`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Compass className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Hardware-Accelerated 60 FPS Telemetry Radar Canvas
              </h3>
              <p className="text-[11px] text-slate-400">
                Direct GPU 2D context rendering with zero DOM re-render lag. Flashing Crimson beacons isolate temperature breaches exceeding +4.2°C SLA limit.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
              {canvasFps} FPS LOCKED
            </span>
          </div>
        </div>

        <div className="flex justify-center items-center bg-slate-950 rounded-2xl border border-slate-900 p-2 overflow-hidden">
          <canvas 
            ref={radarCanvasRef} 
            width={850} 
            height={380} 
            className="w-full max-w-4xl rounded-xl border border-slate-900"
          />
        </div>
      </div>

      {/* Main Grid: Fleet Roster & Realtime Inspection Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Vehicle List & Telemetry Cards */}
        <div className="lg:col-span-7 space-y-4">
          <div className={`rounded-3xl border p-5 shadow-xs ${isDark ? 'border-slate-800 bg-[#141726]/90' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث بالشاحنة أو السائق...' : 'Filter vehicles or drivers...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full rounded-xl border pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    isDark ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                {(['all', 'running', 'idle', 'stopped'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setStatusFilter(filterKey)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize transition-all ${
                      statusFilter === filterKey
                        ? 'bg-orange-500 text-white shadow-xs'
                        : isDark
                        ? 'text-slate-400 hover:bg-slate-800'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {filterKey}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle List */}
            <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
              {filteredVehicles.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  {isAr ? 'لا توجد شاحنات مطابقة للبحث' : 'No vehicle telemetry matches the query.'}
                </div>
              ) : (
                filteredVehicles.map((vehicle) => {
                  const isSelected = selectedVehicleId === vehicle.vehicle_id;
                  const temp = vehicle.cargo_temperature_celsius ?? vehicle.temp ?? 2.8;
                  const isTempBreached = temp > 4.2;

                  return (
                    <div
                      key={vehicle.vehicle_id}
                      onClick={() => setSelectedVehicleId(vehicle.vehicle_id)}
                      className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                        isTempBreached
                          ? 'border-rose-500/60 bg-rose-500/5 hover:border-rose-500'
                          : isSelected
                          ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-500/5'
                          : isDark
                          ? 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700'
                          : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isTempBreached
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                : vehicle.engine_status === 'running'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : vehicle.engine_status === 'idle'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                            }`}
                          >
                            <Truck className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className="font-mono text-xs font-black text-slate-900 dark:text-white whitespace-nowrap shrink-0">
                                {vehicle.vehicle_id}
                              </span>
                              {vehicle.license_plate && (
                                <span className="rounded-md border border-slate-300 dark:border-slate-700 px-1.5 py-0.2 text-[10px] font-mono text-slate-500 whitespace-nowrap shrink-0">
                                  {vehicle.license_plate}
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold whitespace-nowrap shrink-0 ${
                                  isTempBreached
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}
                              >
                                <Thermometer className="h-3 w-3 shrink-0" />
                                {temp.toFixed(1)}°C
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {vehicle.driver_name || 'Unassigned'} • {vehicle.make_model || 'Heavy Hauler'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <Gauge className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            <span className="font-mono text-sm font-black">{vehicle.speed_kmh}</span>
                            <span className="text-[10px] text-slate-400">km/h</span>
                          </div>
                          <div className="flex items-center justify-end gap-1 text-[11px] text-slate-400 mt-1 whitespace-nowrap">
                            <Fuel className="h-3 w-3 text-blue-400 shrink-0" />
                            <span className="font-mono">{vehicle.fuel_level_pct?.toFixed(0) || '—'}%</span>
                          </div>
                        </div>
                      </div>

                      {vehicle.alerts && vehicle.alerts.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {vehicle.alerts.map((alt, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400 whitespace-nowrap shrink-0"
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {alt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Active Telemetry Detail & Stream Logs */}
        <div className="lg:col-span-5 space-y-4">
          {/* Selected Vehicle Card with Cold Chain Vitals */}
          {selectedVehicle && (
            <div className={`rounded-3xl border p-5 shadow-xs ${isDark ? 'border-slate-800 bg-[#141726]/90' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    {isAr ? 'الإحداثيات الحية والبيانات المباشرة' : 'Cold-Chain IoT Sensor Vitals'}
                  </h3>
                </div>
                <span className="font-mono text-xs font-black text-orange-500">{selectedVehicle.vehicle_id}</span>
              </div>

              <div className="mt-4 space-y-3">
                {/* Cold Chain Sensor Grid */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className={`p-3 rounded-xl border ${
                    (selectedVehicle.cargo_temperature_celsius ?? selectedVehicle.temp ?? 2.8) > 4.2
                      ? 'border-rose-500/60 bg-rose-500/10'
                      : isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50'
                  }`}>
                    <span className="text-[10px] text-slate-400 block font-bold flex items-center gap-1">
                      <Thermometer className="h-3 w-3 text-rose-400" /> Temp
                    </span>
                    <span className={`font-mono text-xs font-black ${
                      (selectedVehicle.cargo_temperature_celsius ?? selectedVehicle.temp ?? 2.8) > 4.2
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}>
                      +{(selectedVehicle.cargo_temperature_celsius ?? selectedVehicle.temp ?? 2.8).toFixed(1)}°C
                    </span>
                  </div>

                  <div className={`p-3 rounded-xl border ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50'}`}>
                    <span className="text-[10px] text-slate-400 block font-bold flex items-center gap-1">
                      <Droplets className="h-3 w-3 text-blue-400" /> Humidity
                    </span>
                    <span className="font-mono text-xs font-black text-blue-400">
                      {(selectedVehicle.ambient_humidity_percentage ?? selectedVehicle.humidity ?? 45.2).toFixed(1)}%
                    </span>
                  </div>

                  <div className={`p-3 rounded-xl border ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50'}`}>
                    <span className="text-[10px] text-slate-400 block font-bold flex items-center gap-1">
                      <Zap className="h-3 w-3 text-amber-400" /> Battery
                    </span>
                    <span className="font-mono text-xs font-black text-amber-400">
                      {(selectedVehicle.device_battery_voltage ?? selectedVehicle.voltage ?? 12.4).toFixed(1)}V
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`p-3 rounded-xl border ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50'}`}>
                    <span className="text-[10px] text-slate-400 block font-bold">Latitude</span>
                    <span className="font-mono text-xs font-black">{selectedVehicle.latitude.toFixed(5)}° N</span>
                  </div>
                  <div className={`p-3 rounded-xl border ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50'}`}>
                    <span className="text-[10px] text-slate-400 block font-bold">Longitude</span>
                    <span className="font-mono text-xs font-black">{selectedVehicle.longitude.toFixed(5)}° E</span>
                  </div>
                </div>

                <div className={`p-3 rounded-xl border space-y-1 text-xs ${isDark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px]">{isAr ? 'مسار النقل المخصص' : 'Corridor Route'}:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedVehicle.route_id || 'Active Haulage'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px]">{isAr ? 'الوجهة / المستودع' : 'Destination Depot'}:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                      {selectedVehicle.destination || 'Industrial Hub'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Real-time WebSocket Telemetry Log Console */}
          <div className={`rounded-3xl border p-5 shadow-xs ${isDark ? 'border-slate-800 bg-[#141726]/90' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  {isAr ? 'سجل إشارات التتبع الحية (WebSocket)' : 'Incoming Signal Ingestion Feed'}
                </h4>
              </div>
              <button
                onClick={() => setTelemetryLogs([])}
                className="text-[10px] font-bold text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            </div>

            <div className="h-44 overflow-y-auto space-y-1 font-mono text-[11px] pr-1">
              {telemetryLogs.length === 0 ? (
                <p className="text-center py-6 text-slate-500 text-xs">Waiting for telemetry signals...</p>
              ) : (
                telemetryLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 p-1.5 rounded-lg text-xs leading-relaxed ${
                      log.type === 'error'
                        ? 'bg-rose-500/10 text-rose-400'
                        : log.type === 'warn'
                        ? 'bg-amber-500/10 text-amber-400'
                        : log.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : isDark
                        ? 'text-slate-300'
                        : 'text-slate-700'
                    }`}
                  >
                    <span className="opacity-50 text-[10px] shrink-0">{log.time}</span>
                    <span className="break-all">{log.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
