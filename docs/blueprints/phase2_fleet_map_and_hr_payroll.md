# OxenGL Phase 2 Blueprint: Live Fleet Mapping & HR/Payroll Ledger Foundation
**Objective:** Deploy a responsive Next.js/Tailwind mapping interface to visualize real-time vehicle telemetry streams via WebSockets, and register the relational database schemas for employees, automated attendance checkpoints, and dynamic payroll calculations.

---

## LAYER 1: NEXT.JS REAL-TIME COMMAND MAP (`frontend/src/views/FleetMapView.tsx`)
This operational command layout connects directly to the backend WebSocket stream (`/api/v1/logistics/ws/fleet-stream`) and plots moving vehicles on a responsive visual grid canvas.

```tsx
import React, { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';

interface LiveVehicleGPS {
  vehicleId: string;
  lat: number;
  lng: number;
  speedKph: number;
  tripId: string;
}

export const FleetMapView: React.FC = () => {
  const [activeVehicles, setActiveVehicles] = useState<Record<string, LiveVehicleGPS>>({});
  const { user } = useSelector((state: any) => state.auth);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const tenantId = user?.tenantId || 'tenant_001';
    // Connect directly to the Vite proxy unified socket pipeline
    const wsUrl = `ws://${window.location.host}/api/v1/logistics/ws/fleet-stream?tenant_id=${tenantId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = jsonParse(event.data);
        if (data.vehicle_id) {
          setActiveVehicles((prev) => ({
            ...prev,
            [data.vehicle_id]: {
              vehicleId: data.vehicle_id,
              lat: data.lat,
              lng: data.lng,
              speedKph: data.speed,
              tripId: data.trip_id,
            },
          }));
        }
      } catch (err) { /* Silent telemetry drop */ }
    };

    return () => ws.close();
  }, [user]);

  const jsonParse = (str: string) => JSON.parse(str);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 grid grid-cols-1 xl:grid-cols-4 gap-6">
      {/* 1. MAP CANVAS VISUAL CONTAINER */}
      <div className="xl:col-span-3 bg-slate-950 rounded-xl border border-slate-800 relative min-h-[500px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
        {/* Mock Map Canvas plots. In production, wrap this container inside standard Leaflet/Mapbox bindings */}
        <div className="z-10 text-center max-w-sm p-4 bg-slate-900/80 rounded-xl border border-slate-700">
          <div className="text-blue-400 font-bold mb-2">📡 Live Telemetry Stream Grid Active</div>
          <div className="text-xs text-slate-400">Tracking {Object.keys(activeVehicles).length} vehicles in motion across allowed regional boundaries.</div>
        </div>
      </div>

      {/* 2. REAL-TIME VEHICLE TELEMETRY INDEX SIDEBAR */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4 max-h-[600px] overflow-y-auto">
        <h2 className="text-lg font-bold border-b border-slate-700 pb-2">Active Telematics</h2>
        <div className="space-y-3">
          {Object.values(activeVehicles).length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-8">Awaiting real-time GPS coordinates...</div>
          ) : (
            Object.values(activeVehicles).map((v) => (
              <div key={v.vehicleId} className="p-3 bg-slate-900 rounded-lg border border-slate-700 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-slate-200">
                  <span>ID: {v.vehicleId.slice(0, 8)}...</span>
                  <span className="text-emerald-400">{v.speedKph} km/h</span>
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  Coords: {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
```

---

## LAYER 2: BACKEND HRMS & PAYROLL SCHEMA DATA METRICS (`backend/app/domains/hr/models.py`)
Register these database schemas inside your database layer using standard SQLAlchemy 2.0 type mapping constraints.

```python
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, ForeignKey, DateTime, Boolean, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Employee(Base):
    """Core personnel identity record. Links profiles cleanly to users and tenant isolation."""
    __tablename__ = "employees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    base_salary: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0.00)
    hire_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AttendanceLog(Base):
    """Tracks biometric check-ins and check-outs for automated working hours logs."""
    __tablename__ = "attendance_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    
    check_in: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    check_out: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class PayrollRun(Base):
    """Calculates compensation ledgers, adding allowances and subtracting deductions dynamically."""
    __tablename__ = "payroll_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    
    pay_period: Mapped[str] = mapped_column(String(7), nullable=False, index=True) # e.g. '2026-09'
    gross_earnings: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    allowances: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    deductions: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    net_pay: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False) # Formula: Gross + Allowances - Deductions
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", nullable=False) # 'DRAFT', 'APPROVED', 'PAID'
```
