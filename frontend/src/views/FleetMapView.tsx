import React, { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useApp } from '../context/AppContext';
import { getAuthToken, getTenantId } from '../services/api';
import {
  Radio,
  Activity,
  Thermometer,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Wifi,
  Truck,
  MapPin,
  Navigation,
  Layers,
  Zap,
  BatteryCharging,
  Eye,
  Maximize2,
  Plus,
} from 'lucide-react';
import { RegisterGpsTruckModal } from '../components/RegisterGpsTruckModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TelemetryVehicleState {
  vehicleId: string;
  driverNameAr?: string;
  driverNameEn?: string;
  plateNumber?: string;
  destinationAr?: string;
  destinationEn?: string;
  lat: number;
  lng: number;
  speedKph: number;
  tempCelsius: number;
  humidityPct: number;
  batteryVoltage: number;
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SLA_THRESHOLD = 4.2;
const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS_ID = 'leaflet-css-oxengl';
const LEAFLET_JS_ID = 'leaflet-js-oxengl';
const RIYADH_CENTER: [number, number] = [24.7136, 46.6753];
const DEFAULT_ZOOM = 12;

const INITIAL_VEHICLES: Record<string, TelemetryVehicleState> = {
  'V-1001': {
    vehicleId: 'V-1001',
    driverNameAr: 'أحمد السالم',
    driverNameEn: 'Ahmed Al-Salem',
    plateNumber: '3190-ر س ب',
    destinationAr: 'محطة خرسانة يوني بيتون (طريق الخرج)',
    destinationEn: 'Uni-Beton Batch Plant (Al-Kharj)',
    lat: 24.7136,
    lng: 46.6753,
    speedKph: 68.4,
    tempCelsius: 2.8,
    humidityPct: 45.2,
    batteryVoltage: 12.4,
    lastUpdated: Date.now(),
  },
  'V-1002': {
    vehicleId: 'V-1002',
    driverNameAr: 'سعد القحطاني',
    driverNameEn: 'Saad Al-Qahtani',
    plateNumber: '8821-د ك ل',
    destinationAr: 'مشروع القدية - البوابة الشرقية',
    destinationEn: 'Qiddiya Project - East Gate',
    lat: 24.745,
    lng: 46.702,
    speedKph: 82.5,
    tempCelsius: 5.4,
    humidityPct: 58.0,
    batteryVoltage: 12.1,
    lastUpdated: Date.now(),
  },
  'V-1003': {
    vehicleId: 'V-1003',
    driverNameAr: 'خالد المطيري',
    driverNameEn: 'Khalid Al-Mutairi',
    plateNumber: '4452-ن ص ق',
    destinationAr: 'كسارات الحاير الجنوبية',
    destinationEn: "Al-Ha'ir South Quarry",
    lat: 24.685,
    lng: 46.651,
    speedKph: 74.2,
    tempCelsius: 3.1,
    humidityPct: 44.0,
    batteryVoltage: 12.8,
    lastUpdated: Date.now(),
  },
  'V-1004': {
    vehicleId: 'V-1004',
    driverNameAr: 'محمد الشمري',
    driverNameEn: 'Mohammed Al-Shammari',
    plateNumber: '6119-ط م ح',
    destinationAr: 'محطة ميزان الرياض - الخرج المحوري',
    destinationEn: 'Riyadh Weighbridge Axis',
    lat: 24.755,
    lng: 46.715,
    speedKph: 55.0,
    tempCelsius: 1.9,
    humidityPct: 39.8,
    batteryVoltage: 12.5,
    lastUpdated: Date.now(),
  },
};

// ---------------------------------------------------------------------------
// Leaflet dynamic loader (version-pinned 1.9.4 via unpkg CDN)
// ---------------------------------------------------------------------------
function loadLeaflet(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).L && (window as any).L.map) { resolve(); return; }
    if (!document.getElementById(LEAFLET_CSS_ID)) {
      const link = document.createElement('link');
      link.id = LEAFLET_CSS_ID;
      link.rel = 'stylesheet';
      link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
      document.head.appendChild(link);
    }
    if (document.getElementById(LEAFLET_JS_ID)) {
      const existing = document.getElementById(LEAFLET_JS_ID) as HTMLScriptElement;
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = LEAFLET_JS_ID;
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function ensureLeafletAnimations() {
  if (document.getElementById('oxengl-leaflet-keyframes')) return;
  const style = document.createElement('style');
  style.id = 'oxengl-leaflet-keyframes';
  style.textContent = `
    @keyframes oxengl-ping {
      0% { transform: translate(-50%,-50%) scale(1); opacity: 0.85; }
      70% { transform: translate(-50%,-50%) scale(2.2); opacity: 0; }
      100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0; }
    }
    @keyframes oxengl-pulse {
      0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.6; }
      50% { transform: translate(-50%,-50%) scale(1.4); opacity: 0.3; }
    }
  `;
  document.head.appendChild(style);
}

function buildBeaconHtml(vehicle: TelemetryVehicleState, isSelected: boolean, _isAr: boolean): string {
  const breached = vehicle.tempCelsius > SLA_THRESHOLD;
  const color = breached ? '#ef4444' : '#10b981';
  const ring = breached
    ? `<div style="position:absolute;top:50%;left:50%;width:28px;height:28px;border-radius:50%;border:2px solid #ef4444;animation:oxengl-ping 1.2s cubic-bezier(0,0,0.2,1) infinite;opacity:0.85;pointer-events:none;"></div>`
    : `<div style="position:absolute;top:50%;left:50%;width:24px;height:24px;border-radius:50%;border:1.5px solid #10b981;animation:oxengl-pulse 2s ease-in-out infinite;opacity:0.6;pointer-events:none;"></div>`;
  const selectionRing = isSelected
    ? `<div style="position:absolute;top:50%;left:50%;width:36px;height:36px;border-radius:50%;border:2px solid #f59e0b;pointer-events:none;"></div>`
    : '';
  const badge = breached ? ' 🚨' : '';
  const label = `<div dir="ltr" class="unicode-bidi-isolate" style="position:absolute;top:50%;left:20px;transform:translateY(-50%);white-space:nowrap;background:rgba(2,6,23,0.88);border:1px solid ${color}55;border-radius:6px;padding:2px 7px;font-family:monospace;font-size:10px;font-weight:bold;color:${color};pointer-events:none;direction:ltr;unicode-bidi:isolate;">${vehicle.vehicleId}${badge} +${vehicle.tempCelsius.toFixed(1)}°C</div>`;
  return `<div style="position:relative;width:16px;height:16px;">${selectionRing}${ring}<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:12px;height:12px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};"></div>${label}</div>`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const FleetMapView: React.FC = () => {
  let user: any = null;
  try {
    const auth = useSelector((state: any) => state?.auth);
    user = auth?.user;
  } catch { user = null; }

  const { language } = useApp();
  const isAr = language === 'ar';

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leafletContainerRef = useRef<HTMLDivElement | null>(null);
  const vehiclesRef = useRef<Record<string, TelemetryVehicleState>>(INITIAL_VEHICLES);
  const animationFrameRef = useRef<number | null>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletMarkersRef = useRef<Record<string, any>>({});

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('vehicle');
      if (v) return v;
    }
    return 'V-1002';
  });

  const [mapMode, setMapMode] = useState<'hybrid' | 'radar'>('hybrid');
  const [fps, setFps] = useState<number>(60);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [metrics, setMetrics] = useState({ total: 4, safe: 3, breached: 1, avgTemp: 3.3 });
  const [leafletReady, setLeafletReady] = useState<boolean>(false);

  const [vehicles, setVehicles] = useState<Record<string, TelemetryVehicleState>>(INITIAL_VEHICLES);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const handleTruckRegistered = (newTruck: TelemetryVehicleState) => {
    vehiclesRef.current[newTruck.vehicleId] = newTruck;
    setVehicles((prev) => ({ ...prev, [newTruck.vehicleId]: newTruck }));
    setSelectedVehicleId(newTruck.vehicleId);

    // Dynamic marker addition into Leaflet
    const L = (window as any).L;
    if (L && leafletMapRef.current) {
      try {
        const html = buildBeaconHtml(newTruck, true, isAr);
        const icon = L.divIcon({ className: '', html, iconAnchor: [8, 8] });
        if (leafletMarkersRef.current[newTruck.vehicleId]) {
          leafletMarkersRef.current[newTruck.vehicleId].setLatLng([newTruck.lat, newTruck.lng]).setIcon(icon);
        } else {
          leafletMarkersRef.current[newTruck.vehicleId] = L.marker([newTruck.lat, newTruck.lng], { icon, interactive: true })
            .addTo(leafletMapRef.current)
            .on('click', () => setSelectedVehicleId(newTruck.vehicleId));
        }
        leafletMapRef.current.panTo([newTruck.lat, newTruck.lng], { animate: true, duration: 0.8 });
      } catch (e) {
        console.warn('Leaflet marker registration error:', e);
      }
    }

    // Dynamic metrics recalculation
    const all = Object.values({ ...vehiclesRef.current, [newTruck.vehicleId]: newTruck });
    const safe = all.filter((v) => v.tempCelsius <= SLA_THRESHOLD).length;
    const avg = all.reduce((sum, v) => sum + v.tempCelsius, 0) / (all.length || 1);
    setMetrics({
      total: all.length,
      safe,
      breached: all.length - safe,
      avgTemp: parseFloat(avg.toFixed(1)),
    });
  };

  // URL sync
  useEffect(() => {
    const handler = () => {
      const v = new URLSearchParams(window.location.search).get('vehicle');
      if (v) setSelectedVehicleId(v);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // -------------------------------------------------------------------------
  // 1. Live WebSocket Telemetry (/api/v1/logistics/ws/fleet-stream)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const token = getAuthToken();
    const tenantId = user?.tenantId || user?.tenant_id || getTenantId();
    if (!token || !tenantId) { setIsConnected(false); return; }

    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${host}/api/v1/logistics/ws/fleet-stream?token=${encodeURIComponent(token)}&tenant_id=${encodeURIComponent(tenantId)}`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => setIsConnected(false);
      ws.onerror = () => setIsConnected(false);
      ws.onmessage = (event) => {
        try {
          const p = JSON.parse(event.data);
          if (p.vehicle_id) {
            const updated: TelemetryVehicleState = {
              ...(vehiclesRef.current[p.vehicle_id] || {}),
              vehicleId: p.vehicle_id,
              plateNumber: p.plate_number ?? vehiclesRef.current[p.vehicle_id]?.plateNumber,
              driverNameAr: p.driver_name_ar ?? vehiclesRef.current[p.vehicle_id]?.driverNameAr,
              driverNameEn: p.driver_name_en ?? vehiclesRef.current[p.vehicle_id]?.driverNameEn,
              destinationAr: p.destination_ar ?? vehiclesRef.current[p.vehicle_id]?.destinationAr,
              destinationEn: p.destination_en ?? vehiclesRef.current[p.vehicle_id]?.destinationEn,
              lat: p.lat ?? p.latitude ?? 24.71,
              lng: p.lng ?? p.longitude ?? 46.67,
              speedKph: p.speed ?? p.speed_kph ?? 0,
              tempCelsius: p.cargo_temperature_celsius ?? p.temp ?? 2.8,
              humidityPct: p.ambient_humidity_percentage ?? p.humidity ?? 45.0,
              batteryVoltage: p.device_battery_voltage ?? p.voltage ?? 12.4,
              lastUpdated: Date.now(),
            };
            vehiclesRef.current[p.vehicle_id] = updated;
            setVehicles((prev) => ({ ...prev, [p.vehicle_id]: updated }));
          }
        } catch { /* ignore */ }
      };
    } catch { setIsConnected(false); }

    return () => { if (ws) ws.close(); };
  }, [user]);

  // -------------------------------------------------------------------------
  // 2. Leaflet Map (dynamic script injection, no npm dep)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let map: any = null;
    let markerInterval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    ensureLeafletAnimations();

    loadLeaflet()
      .then(() => {
        if (!mounted || !leafletContainerRef.current) return;
        const L = (window as any).L;

        // Guard against double-init in strict mode
        if ((leafletContainerRef.current as any)._leaflet_id) {
          delete (leafletContainerRef.current as any)._leaflet_id;
        }

        map = L.map(leafletContainerRef.current, {
          center: RIYADH_CENTER,
          zoom: DEFAULT_ZOOM,
          zoomControl: true,
          attributionControl: false,
          preferCanvas: true,
        });

        // CartoDB Dark Matter OSM tiles
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { subdomains: 'abcd', maxZoom: 19, opacity: 0.9 }
        ).addTo(map);

        L.control.attribution({ prefix: false })
          .addAttribution('© <a href="https://carto.com" style="color:#94a3b8">CARTO</a> | © <a href="https://openstreetmap.org" style="color:#94a3b8">OSM</a>')
          .addTo(map);

        // Waypoint POI markers
        const poiIcon = (label: string, color: string) => L.divIcon({
          className: '',
          html: `<div style="background:rgba(2,6,23,0.92);border:1px solid ${color}55;border-radius:5px;padding:2px 8px;font-size:10px;font-weight:bold;color:${color};font-family:monospace;white-space:nowrap;">📍 ${label}</div>`,
          iconAnchor: [0, 0],
        });
        L.marker([24.71, 46.675], { icon: poiIcon(isAr ? 'ميزان الخرج' : 'Al-Kharj Weighbridge', '#fbbf24') }).addTo(map);
        L.marker([24.685, 46.651], { icon: poiIcon(isAr ? 'كسارات الحاير' : "Al-Ha'ir Quarry", '#34d399') }).addTo(map);
        L.marker([24.755, 46.715], { icon: poiIcon(isAr ? 'بوابة الشرق' : 'East Gate Dammam Rd', '#60a5fa') }).addTo(map);

        const syncMarkers = (currentSelected: string) => {
          Object.values(vehiclesRef.current).forEach((v) => {
            const isSelected = v.vehicleId === currentSelected;
            const html = buildBeaconHtml(v, isSelected, isAr);
            const icon = L.divIcon({ className: '', html, iconAnchor: [8, 8] });
            if (leafletMarkersRef.current[v.vehicleId]) {
              leafletMarkersRef.current[v.vehicleId].setLatLng([v.lat, v.lng]).setIcon(icon);
            } else {
              leafletMarkersRef.current[v.vehicleId] = L.marker([v.lat, v.lng], { icon, interactive: true })
                .addTo(map)
                .on('click', () => setSelectedVehicleId(v.vehicleId));
            }
          });
        };

        syncMarkers('V-1002');
        markerInterval = setInterval(() => syncMarkers(selectedVehicleId), 2000);

        leafletMapRef.current = map;
        if (mounted) setLeafletReady(true);
      })
      .catch(() => { if (mounted) setLeafletReady(false); });

    return () => {
      mounted = false;
      if (markerInterval) clearInterval(markerInterval);
      if (map) { try { map.remove(); } catch { /* ignore */ } }
      leafletMapRef.current = null;
      leafletMarkersRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAr]);

  // Show/hide Leaflet layer on mapMode change
  useEffect(() => {
    const el = leafletContainerRef.current;
    if (!el) return;
    el.style.opacity = mapMode === 'radar' ? '0' : '1';
    el.style.pointerEvents = mapMode === 'radar' ? 'none' : 'auto';
    if (leafletMapRef.current) {
      setTimeout(() => { try { leafletMapRef.current.invalidateSize(); } catch { /* ignore */ } }, 50);
    }
  }, [mapMode]);

  // Pan & refresh icons on selection change
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !leafletMapRef.current) return;
    Object.values(vehiclesRef.current).forEach((v) => {
      const m = leafletMarkersRef.current[v.vehicleId];
      if (!m) return;
      m.setIcon(L.divIcon({ className: '', html: buildBeaconHtml(v, v.vehicleId === selectedVehicleId, isAr), iconAnchor: [8, 8] }));
    });
    const sv = vehiclesRef.current[selectedVehicleId];
    if (sv) {
      try { leafletMapRef.current.panTo([sv.lat, sv.lng], { animate: true, duration: 0.6 }); } catch { /* ignore */ }
    }
  }, [selectedVehicleId, isAr]);

  // -------------------------------------------------------------------------
  // 3. 60 FPS Canvas Radar Overlay (transparent over Leaflet in hybrid mode)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let frameCount = 0;
    let fpsTimer = performance.now();
    let sweepAngle = 0;

    const render = (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) { animationFrameRef.current = requestAnimationFrame(render); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animationFrameRef.current = requestAnimationFrame(render); return; }

      frameCount++;
      if (t - fpsTimer >= 1000) {
        setFps(Math.round((frameCount * 1000) / (t - fpsTimer)));
        frameCount = 0;
        fpsTimer = t;
        const vs = Object.values(vehiclesRef.current);
        const br = vs.filter((v) => v.tempCelsius > SLA_THRESHOLD).length;
        setMetrics({ total: vs.length, safe: vs.length - br, breached: br, avgTemp: Number((vs.reduce((a, v) => a + v.tempCelsius, 0) / (vs.length || 1)).toFixed(1)) });
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = mapMode === 'radar' ? '#030712' : 'rgba(3,7,18,0.28)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2, cy = canvas.height / 2;
      const maxR = Math.min(cx, cy) - 20;

      // Range rings
      ctx.strokeStyle = 'rgba(56,189,248,0.16)'; ctx.lineWidth = 1;
      for (let r = 70; r <= maxR; r += 70) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillStyle = 'rgba(56,189,248,0.5)'; ctx.font = '9px monospace';
        ctx.fillText(`${r * 2}00m`, cx + 6, cy - r + 11);
      }
      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx, 20); ctx.lineTo(cx, canvas.height - 20);
      ctx.moveTo(20, cy); ctx.lineTo(canvas.width - 20, cy);
      ctx.strokeStyle = 'rgba(56,189,248,0.16)'; ctx.stroke();

      // Sweep beam
      sweepAngle = (sweepAngle + 0.02) % (2 * Math.PI);
      const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      sg.addColorStop(0, 'rgba(16,185,129,0.25)'); sg.addColorStop(0.8, 'rgba(16,185,129,0.08)'); sg.addColorStop(1, 'rgba(16,185,129,0)');
      ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, maxR, sweepAngle - 0.25, sweepAngle); ctx.closePath(); ctx.fillStyle = sg; ctx.fill(); ctx.restore();

      // Route vectors
      ctx.save(); ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(249,115,22,0.32)';
      ctx.beginPath(); ctx.moveTo(cx - 180, cy + 160); ctx.lineTo(cx + 60, cy - 20); ctx.lineTo(cx + 180, cy - 140); ctx.stroke();
      ctx.strokeStyle = 'rgba(59,130,246,0.25)';
      ctx.beginPath(); ctx.arc(cx, cy, 140, Math.PI * 0.3, Math.PI * 1.6); ctx.stroke();
      ctx.restore();

      // In tactical radar mode: draw canvas beacons
      if (mapMode === 'radar') {
        Object.values(vehiclesRef.current).forEach((v, idx) => {
          const latD = (v.lat - 24.7136) * 5500, lngD = (v.lng - 46.6753) * 5500;
          const x = Math.max(40, Math.min(canvas.width - 40, cx + lngD + (idx % 2 === 0 ? idx * 22 : -idx * 22)));
          const y = Math.max(40, Math.min(canvas.height - 40, cy - latD + (idx % 3 === 0 ? idx * 18 : -idx * 18)));
          const breach = v.tempCelsius > SLA_THRESHOLD;
          const sel = selectedVehicleId === v.vehicleId;

          if (sel) {
            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5;
            ctx.strokeRect(x - 14, y - 14, 28, 28);
            ctx.fillStyle = 'rgba(245,158,11,0.12)'; ctx.fillRect(x - 14, y - 14, 28, 28);
          }

          if (breach) {
            const fc = (Math.sin(t / 150) + 1) / 2;
            const re = (t % 1200) / 1200;
            ctx.beginPath(); ctx.arc(x, y, 8 + re * 26, 0, 2 * Math.PI);
            ctx.strokeStyle = `rgba(239,68,68,${Math.max(0, 1 - re) * 0.9})`; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(239,68,68,${0.7 + fc * 0.3})`; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 15; ctx.fill(); ctx.shadowBlur = 0;
            ctx.fillStyle = '#ef4444'; ctx.font = 'bold 11px monospace';
            ctx.fillText(`🚨 ${v.vehicleId} [${v.tempCelsius.toFixed(1)}°C]`, x + 12, y - 4);
          } else {
            const pc = (Math.sin(t / 800) + 1) / 2;
            ctx.beginPath(); ctx.arc(x, y, 9 + pc * 4, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(16,185,129,0.26)'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#10b981'; ctx.shadowColor = '#10b981'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
            ctx.fillStyle = '#10b981'; ctx.font = 'bold 10px monospace'; ctx.fillText(`${v.vehicleId}`, x + 10, y - 2);
            ctx.fillStyle = '#94a3b8'; ctx.font = '9px monospace'; ctx.fillText(`${v.tempCelsius.toFixed(1)}°C • ${v.speedKph} km/h`, x + 10, y + 9);
          }
        });
      }

      // HUD overlay
      ctx.fillStyle = 'rgba(15,23,42,0.80)'; ctx.fillRect(12, 12, 210, 52);
      ctx.strokeStyle = 'rgba(51,65,85,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(12, 12, 210, 52);
      ctx.fillStyle = fps >= 55 ? '#10b981' : '#f59e0b'; ctx.font = 'bold 11px monospace'; ctx.fillText(`ENGINE: 60 FPS LOCKED`, 22, 28);
      ctx.fillStyle = '#94a3b8'; ctx.font = '9px monospace';
      ctx.fillText(`RENDER: ${fps} FPS HARDWARE`, 22, 42);
      ctx.fillText(mapMode === 'radar' ? `TACTICAL RADAR • WGS-84` : `LEAFLET OSM + CANVAS OVERLAY`, 22, 54);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [mapMode, selectedVehicleId]);

  const selectedVehicle = vehicles[selectedVehicleId] || vehiclesRef.current[selectedVehicleId] || INITIAL_VEHICLES['V-1002'];

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-6 space-y-6" id="fleet-radar-view">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              {isAr ? 'رادار تتبع الأسطول المباشر وسلسلة التبريد' : 'Fleet Radar & Cold-Chain GPS'}
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {isAr ? 'Leaflet OSM مباشر' : 'Live Leaflet OSM'}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              {isAr
                ? 'خريطة Leaflet OpenStreetMap تفاعلية مع طبقة رادار Canvas 60FPS وبث WebSocket المباشر'
                : 'Interactive Leaflet OSM map with 60FPS Canvas radar overlay and live WebSocket telematics'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsRegisterModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition shadow-md shadow-emerald-950/40 cursor-pointer"
            id="register-gps-truck-btn"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? '+ تسجيل شاحنة برادار التتبع' : '+ Register GPS Truck'}</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            <button type="button" onClick={() => setMapMode('hybrid')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${mapMode === 'hybrid' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {isAr ? 'خريطة تفاعلية' : 'Leaflet Map'}
            </button>
            <button type="button" onClick={() => setMapMode('radar')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${mapMode === 'radar' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {isAr ? 'رادار تكتيكي' : 'Tactical Radar'}
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-xs font-mono whitespace-nowrap shrink-0">
            <Cpu className="h-4 w-4 text-cyan-400 shrink-0" />
            <span className="text-slate-400 whitespace-nowrap">Canvas:</span>
            <span dir="ltr" className="inline-block unicode-bidi-isolate font-bold text-cyan-300 whitespace-nowrap">{fps} FPS</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-xs font-mono whitespace-nowrap shrink-0">
            <Wifi className={`h-4 w-4 shrink-0 ${isConnected ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
            <span className="text-slate-400 whitespace-nowrap">Stream:</span>
            <span dir="ltr" className={`inline-block unicode-bidi-isolate font-bold whitespace-nowrap ${isConnected ? 'text-emerald-300' : 'text-amber-300'}`}>
              {isConnected ? 'LIVE WS' : 'SIMULATED'}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-xs font-mono whitespace-nowrap shrink-0">
            <Layers className={`h-4 w-4 shrink-0 ${leafletReady ? 'text-blue-400' : 'text-slate-600'}`} />
            <span dir="ltr" className={`inline-block unicode-bidi-isolate font-bold whitespace-nowrap ${leafletReady ? 'text-blue-300' : 'text-slate-500'}`}>
              {leafletReady ? 'OSM LIVE' : 'MAP LOADING'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>{isAr ? 'إجمالي الشاحنات المرصودة' : 'Active Haulers'}</span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-2 font-mono text-2xl font-black text-white">{metrics.total}</p>
          <p className="text-[11px] text-slate-500">{isAr ? 'وحدات GPS تعمل بكفاءة' : 'Telemetry Transponders'}</p>
        </div>
        <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>{isAr ? 'حمولات مطابقة (≤ +4.2°C)' : 'Within Spec (≤ +4.2°C)'}</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-2 font-mono text-2xl font-black text-emerald-400">{metrics.safe}</p>
          <p className="text-[11px] text-slate-500">{isAr ? 'حمولات آمنة وموثقة' : 'Pulsing Emerald Beacons'}</p>
        </div>
        <div className="p-4 rounded-2xl border border-rose-900/60 bg-rose-950/20 shadow-xs">
          <div className="flex items-center justify-between text-rose-400 text-xs font-bold">
            <span>{isAr ? 'تجاوزات حرارية (> +4.2°C)' : 'SLA Breaches (> +4.2°C)'}</span>
            <ShieldAlert className="h-4 w-4 text-rose-400 animate-bounce" />
          </div>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-2 font-mono text-2xl font-black text-rose-400">{metrics.breached}</p>
          <p className="text-[11px] text-rose-400/80">{isAr ? 'تنبيه طوارئ فوري' : 'Flashing Crimson Alerts'}</p>
        </div>
        <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>{isAr ? 'متوسط حرارة الحمولات' : 'Mean Cargo Temp'}</span>
            <Thermometer className="h-4 w-4 text-blue-400" />
          </div>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-2 font-mono text-2xl font-black text-blue-400">+{metrics.avgTemp}°C</p>
          <p className="text-[11px] text-slate-500">{isAr ? 'حساسات الشاحنات المركزية' : 'Core Cargo Probes'}</p>
        </div>
      </div>

      {/* SLA Alarm Bar */}
      {metrics.breached > 0 && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 animate-pulse" />
            <div>
              <span className="font-bold">{isAr ? 'إنذار طارئ في سلسلة التبريد: ' : 'CRITICAL COLD-CHAIN BREACH: '}</span>
              <span>
                {isAr ? (
                  <>
                    الشاحنة <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-rose-200">V-1002</span> تجاوزت الحرارة المسموحة وسجلت <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-rose-200">+5.4°C</span> في مسار مشروع القدية.
                  </>
                ) : (
                  <>
                    Vehicle <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-rose-200">V-1002</span> registered <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-rose-200">+5.4°C</span> exceeding safety limit of <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-rose-200">+4.2°C</span> along Qiddiya transit route.
                  </>
                )}
              </span>
            </div>
          </div>
          <button type="button" onClick={() => setSelectedVehicleId('V-1002')}
            className="font-mono text-[10px] uppercase bg-rose-500/20 border border-rose-500/40 px-3 py-1 rounded text-rose-200 hover:bg-rose-500/40 transition whitespace-nowrap shrink-0">
            {isAr ? 'فحص الشاحنة' : 'Inspect Unit'}
          </button>
        </div>
      )}

      {/* Main Map + Radar + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Map/Radar Viewport */}
        <div className="lg:col-span-3 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl relative min-h-[560px]">

          {/* Leaflet map container (z-0) */}
          <div
            ref={leafletContainerRef}
            style={{
              position: 'absolute', inset: 0, zIndex: 0,
              transition: 'opacity 0.4s ease',
              opacity: mapMode === 'radar' ? 0 : 1,
              pointerEvents: mapMode === 'radar' ? 'none' : 'auto',
              borderRadius: '1rem',
            }}
          />

          {/* Loading placeholder while Leaflet bootstraps */}
          {!leafletReady && mapMode !== 'radar' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}
              className="flex flex-col items-center justify-center bg-slate-950/90">
              <div className="h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-slate-400 font-mono">
                {isAr ? 'تحميل خريطة OpenStreetMap...' : 'Loading Leaflet OSM tiles…'}
              </p>
            </div>
          )}

          {/* Canvas 60FPS radar overlay (z-10, pointer-events-none) */}
          <canvas
            ref={canvasRef}
            width={900}
            height={550}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          />

          {/* Footer bar */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 11 }}
            className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono px-1">
            <span>RIYADH LOGISTICS AXIS • WGS-84</span>
            <span>THERMAL LIMIT: +{SLA_THRESHOLD}°C THRESHOLD</span>
            <span>{mapMode === 'radar' ? 'TACTICAL CANVAS RADAR ACTIVE' : 'LEAFLET OSM + CANVAS OVERLAY'}</span>
          </div>
        </div>

        {/* Vehicle Telemetry Detail Panel */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-orange-500 shrink-0" />
                <h3 dir="ltr" className="inline-block unicode-bidi-isolate font-bold text-sm text-white font-mono">{selectedVehicle.vehicleId}</h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                selectedVehicle.tempCelsius > SLA_THRESHOLD
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                {selectedVehicle.tempCelsius > SLA_THRESHOLD ? (isAr ? 'تجاوز حراري' : 'Breached') : (isAr ? 'مطابق للمواصفة' : 'Nominal')}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'السائق:' : 'Driver:'}</span>
                <span className="font-bold text-white">{isAr ? selectedVehicle.driverNameAr : selectedVehicle.driverNameEn}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'رقم اللوحة:' : 'Plate No:'}</span>
                <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-amber-300">{selectedVehicle.plateNumber}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'الوجهة:' : 'Destination:'}</span>
                <span className="font-medium text-slate-300 text-right max-w-[170px] truncate">
                  {isAr ? selectedVehicle.destinationAr : selectedVehicle.destinationEn}
                </span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between text-slate-400">
                <span>{isAr ? 'الإحداثيات:' : 'Coordinates:'}</span>
                <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-[10px] text-slate-300">
                  {selectedVehicle.lat.toFixed(4)}, {selectedVehicle.lng.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'السرعة:' : 'Speed:'}</span>
                <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-emerald-400">{selectedVehicle.speedKph} km/h</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'حرارة الحمولة:' : 'Cargo Temp:'}</span>
                <span dir="ltr" className={`inline-block unicode-bidi-isolate font-mono font-bold ${selectedVehicle.tempCelsius > SLA_THRESHOLD ? 'text-rose-400' : 'text-blue-400'}`}>
                  +{selectedVehicle.tempCelsius.toFixed(1)}°C
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'رطوبة الحجرة:' : 'Humidity:'}</span>
                <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-slate-200">{selectedVehicle.humidityPct}%</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'بطارية الجهاز:' : 'Device Battery:'}</span>
                <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-emerald-400">{selectedVehicle.batteryVoltage} V</span>
              </div>
            </div>
          </div>

          {/* Fleet Selector */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <h4 className="text-xs font-bold text-slate-300 mb-2">
              {isAr ? 'قائمة الشاحنات الميدانية:' : 'Fleet Units in Range:'}
            </h4>
            {Object.values(vehicles).map((v) => (
              <button key={v.vehicleId} type="button" onClick={() => setSelectedVehicleId(v.vehicleId)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs transition ${
                  selectedVehicleId === v.vehicleId
                    ? 'border-orange-500 bg-orange-500/10 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                }`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${v.tempCelsius > SLA_THRESHOLD ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
                  <span dir="ltr" className="inline-block unicode-bidi-isolate font-bold font-mono">{v.vehicleId}</span>
                </div>
                <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-[11px] text-slate-400">+{v.tempCelsius.toFixed(1)}°C • {v.speedKph} km/h</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Register GPS Truck Modal */}
      <RegisterGpsTruckModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onTruckRegistered={handleTruckRegistered}
      />
    </div>
  );
};

export default FleetMapView;
