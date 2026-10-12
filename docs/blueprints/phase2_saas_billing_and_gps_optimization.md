# OxenGL Phase 2 Blueprint: Multi-Tenant SaaS Billing & High-Concurrency GPS Map Canvas
**Objective:** Deploy a highly scalable subscription billing module with atomic seat tracking, and optimize the frontend live-tracking radar layer to paint thousands of moving vehicles simultaneously using HTML5 Canvas instead of heavy DOM-node markers.

---

## LAYER 1: MULTI-TENANT SAAS BILLING ENGINE & SEAT QUOTAS (`backend/app/domains/saas/`)
Enforce automated tier metering, seat allocation constraints, and atomic usage boundaries across all tenant workspaces.

### 1. Database Schema (`backend/app/domains/saas/models.py`)
```python
import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, Boolean, Integer, Numeric, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class SubscriptionPlan(Base):
    """Stores product pricing tiers, seat quotas, and fleet size limits."""
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False) # 'STARTER', 'ENTERPRISE'
    stripe_price_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    max_seats: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_vehicles: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    monthly_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

class TenantSubscription(Base):
    """Tracks active tenant subscription contracts, payment states, and active metrics counters."""
    __tablename__ = "tenant_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, index=True, nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=False)
    stripe_customer_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False) # 'active', 'past_due', 'canceled'
    current_seats_used: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_vehicles_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
```

### 2. Stripe Webhook Handler (`backend/app/api/v1/saas.py`)
```python
from fastapi import APIRouter, Request, Header, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update, select
from app.db.session import get_db
from app.domains.saas.models import TenantSubscription
import json

router = APIRouter()
STRIPE_WEBHOOK_SECRET = "whsec_CHANGE_ME_IN_PRODUCTION"

@router.post("/webhooks/stripe", status_code=status.HTTP_200_OK)
async def process_stripe_webhook_events(request: Request, stripe_signature: str = Header(None), db: AsyncSession = Depends(get_db)):
    """Asynchronously intercepts cryptographic webhooks from Stripe to adjust subscription lifecycle status."""
    payload = await request.body()
    # In production, call stripe.Webhook.construct_event(payload, stripe_signature, STRIPE_WEBHOOK_SECRET)
    event = json.loads(payload)
    
    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {})
    
    if event_type in ["customer.subscription.updated", "customer.subscription.deleted"]:
        customer_id = data_object.get("customer")
        stripe_status = data_object.get("status") # 'active', 'past_due', 'canceled'
        period_end = datetime.fromtimestamp(data_object.get("current_period_end", 0))
        
        stmt = (
            update(TenantSubscription)
            .where(TenantSubscription.stripe_customer_id == customer_id)
            .values(status=stripe_status, current_period_end=period_end)
        )
        await db.execute(stmt)
        await db.commit()
        
    return {"status": "event_processed"}
```

---

## LAYER 2: HIGH-CONCURRENCY FRONTEND GPS CANVAS RADAR (`frontend/src/views/FleetMapView.tsx`)
Rendering hundreds of real-time vehicles using heavy HTML DOM-node components (`<div>` or Leaflet default markers) forces severe UI browser lag due to layout thrashing. OxenGL bypasses this by drawing elements directly onto an optimized **HTML5 Canvas Reference Loop**.

Replace or update your frontend tracking dashboard canvas at **`frontend/src/views/FleetMapView.tsx`**:

```tsx
import React, { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';

interface GPSPingPayload {
  vehicleId: string;
  lat: number;
  lng: number;
  speedKph: number;
}

export const FleetMapView: React.FC = () => {
  const { user } = useSelector((state: any) => state.auth);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vehiclesRef = useRef<Record<string, GPSPingPayload>>({});
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const tenantId = user?.tenantId || 'tenant_001';
    const wsUrl = `ws://${window.location.host}/api/v1/logistics/ws/fleet-stream?tenant_id=${tenantId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.vehicle_id) {
          // Store mutations directly into a mutable mutable ref bypasses heavy React state re-renders
          vehiclesRef.current[payload.vehicle_id] = {
            vehicleId: payload.vehicle_id,
            lat: payload.lat,
            lng: payload.lng,
            speedKph: payload.speed
          };
        }
      } catch (err) { /* Ingestion failsafe safeguard */ }
    };

    // ──► HTML5 HIGH-PERFORMANCE CANVAS RENDER LOOP ──►
    const renderRadarFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clean the drawing surface area instantly
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Render structural grid lines matching our design tokens
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }

      // Loop and paint all active fleet telemetry packets efficiently
      const vehicles = vehiclesRef.current;
      Object.values(vehicles).forEach((vehicle) => {
        // Map GPS spatial fractional positions bounds directly onto local coordinate matrices
        const x = (vehicle.lng - 44.0) * 400; // Normalized baseline grid modifiers examples
        const y = (45.0 - vehicle.lat) * 400;

        // Draw vehicle active glowing beacon point
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = vehicle.speedKph > 0 ? '#10b981' : '#64748b'; // Emerald if in motion, slate if idle
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.fill();

        // Overlay metadata text blocks without dropping execution frame limits
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`TRK-${vehicle.vehicleId.slice(0,4).toUpperCase()} (${vehicle.speedKph} km/h)`, x + 10, y + 4);
      });

      animationFrameRef.current = requestAnimationFrame(renderRadarFrame);
    };

    animationFrameRef.current = requestAnimationFrame(renderRadarFrame);

    return () => {
      ws.close();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">High-Concurrency Telemetry Command Center</h1>
        <p className="text-slate-400 text-xs">HTML5 Canvas rendering engine loop optimized to track 10,000+ logistics trucks concurrently with zero UI lag.</p>
      </div>
      <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex justify-center items-center p-2">
        <canvas ref={canvasRef} width={800} height={500} className="bg-slate-950 w-full max-w-4xl rounded-lg border border-slate-900" />
      </div>
    </div>
  );
};
```

# Instructions
Read and parse the multi-tenant SaaS billing and canvas rendering optimizations detailed at `docs/blueprints/phase2_saas_billing_and_gps_optimization.md`.

# Sub-Tasks
1. BACKEND MODEL: Register `SubscriptionPlan` and `TenantSubscription` models inside `backend/app/domains/saas/models.py`. Ensure they import cleanly in `backend/app/db/base.py`.
2. STRIPE WEBHOOK: Create `backend/app/api/v1/saas.py` with the `/webhooks/stripe` endpoint. Register the `saas_router` under `/api/v1/saas` inside `backend/app/main.py`.
3. FRONTEND VECTOR OPTIMIZATION: Overwrite `frontend/src/views/FleetMapView.tsx` with the high-performance HTML5 Canvas requestAnimationFrame loop context to bypass heavy React DOM thrashes.
4. MIGRATION: Generate and deploy the relational tracking tables schema via:
   `PYTHONPATH=. .venv/bin/alembic revision --autogenerate -m "deploy_oxengl_phase2_saas_billing_core" && PYTHONPATH=. .venv/bin/alembic upgrade head`
5. VALIDATION: Compile using `cd frontend && npm run build` and run `python3 scripts/migration_sanity_check.py` to confirm total path stability.
