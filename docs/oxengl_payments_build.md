# OxenGL Multi-Tier Payment & Subscription Specification

## Overview & Architecture Boundaries
1. **Platform SaaS Subscriptions (Tenant -> OxenGL Platform)**
   - **Engine**: Paddle (Merchant of Record).
   - **Scope**: Automated billing for tenant seats and workspace licensing. Handles global tax compliance, automated dunning, and recurring billing cycles.
   - **Target Flow**: Webhooks sent from Paddle directly update `master_tenants.subscription_status` and advance `master_tenants.license_expiry_date`.

2. **B2B Invoice Collections (Client -> Tenant)**
   - **Engine**: Moyasar (SAMA & KSA Banking Compliant Gateway).
   - **Scope**: Local settlement for logistics and commercial invoices via Mada, Visa, Mastercard, and STC Pay.
   - **Target Flow**: Invoice checkout generates a payment session; server-to-server webhook callbacks verify transactions and update `invoices.payment_status` to `paid`.

---

## Phase 1: Database Schemas & Migrations

### 1.1 Master Tenant Subscription Model
File: `backend/models.py` (or `backend/app/models/tenant.py`)
```python
from sqlalchemy import Column, String, DateTime, Integer, Boolean
from datetime import datetime
from database import Base

class MasterTenant(Base):
    __tablename__ = "master_tenants"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Paddle SaaS Subscription Metadata
    subscription_plan = Column(String(64), nullable=True, default="trial")
    subscription_status = Column(String(32), nullable=False, default="trialing")
    paddle_customer_id = Column(String(128), unique=True, nullable=True, index=True)
    paddle_subscription_id = Column(String(128), unique=True, nullable=True, index=True)
    license_expiry_date = Column(DateTime, nullable=True)

    from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey, Integer
from database import Base

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(64), unique=True, index=True, nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="SAR", nullable=False)

    # Moyasar Payment Metadata
    payment_status = Column(String(32), default="pending", index=True)
    moyasar_transaction_id = Column(String(128), unique=True, nullable=True, index=True)
    payment_method = Column(String(32), nullable=True)
    paid_at = Column(DateTime, nullable=True)

    import hmac
import hashlib
import json
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, HTTPException, Depends, Header, status
from sqlalchemy.orm import Session
from database import get_db
from models import MasterTenant

router = APIRouter(prefix="/api/platform/webhooks", tags=["Platform Billing"])
PADDLE_WEBHOOK_SECRET = os.getenv("PADDLE_WEBHOOK_SECRET", "")

def verify_paddle_signature(raw_body: bytes, paddle_signature: str) -> bool:
    if not PADDLE_WEBHOOK_SECRET or not paddle_signature:
        return False
    try:
        parts = dict(item.split("=") for item in paddle_signature.split(";"))
        ts = parts.get("ts")
        h1 = parts.get("h1")
        if not ts or not h1:
            return False
        signed_payload = f"{ts}:{raw_body.decode('utf-8')}"
        expected = hmac.new(
            PADDLE_WEBHOOK_SECRET.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, h1)
    except Exception:
        return False

@router.post("/paddle")
async def handle_paddle_webhook(
    request: Request,
    paddle_signature: str = Header(None, alias="Paddle-Signature"),
    db: Session = Depends(get_db)
):
    raw_body = await request.body()
    if not verify_paddle_signature(raw_body, paddle_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = json.loads(raw_body.decode("utf-8"))
    event_type = payload.get("event_type")
    data = payload.get("data", {})
    customer_id = data.get("customer_id")
    subscription_id = data.get("id")

    tenant = db.query(MasterTenant).filter(
        (MasterTenant.paddle_customer_id == customer_id) |
        (MasterTenant.paddle_subscription_id == subscription_id)
    ).first()

    if not tenant:
        return {"status": "ignored", "reason": "Tenant not found"}

    if event_type in ["subscription.created", "subscription.activated", "subscription.updated"]:
        tenant.subscription_status = data.get("status", "active")
        tenant.paddle_subscription_id = subscription_id
        next_billed_at = data.get("next_billed_at")
        tenant.license_expiry_date = datetime.fromisoformat(next_billed_at.replace("Z", "+00:00")) if next_billed_at else datetime.utcnow() + timedelta(days=365)
        db.commit()

    elif event_type in ["subscription.past_due", "subscription.canceled"]:
        tenant.subscription_status = event_type.split(".")[1]
        db.commit()

    return {"status": "processed", "event": event_type}

    import os
import requests
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from database import get_db
from models import Invoice

router = APIRouter(prefix="/api/finance/payments", tags=["Tenant Invoices"])
MOYASAR_SECRET_KEY = os.getenv("MOYASAR_SECRET_KEY", "")

@router.post("/moyasar/verify/{invoice_id}")
async def verify_moyasar_payment(invoice_id: int, request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    payment_id = body.get("id")

    if not payment_id:
        raise HTTPException(status_code=400, detail="Transaction ID required")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    response = requests.get(
        f"[https://api.moyasar.com/v1/payments/](https://api.moyasar.com/v1/payments/){payment_id}",
        auth=(MOYASAR_SECRET_KEY, "")
    )

    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Gateway verification failed")

    payment_record = response.json()
    if payment_record.get("status") == "paid":
        invoice.payment_status = "paid"
        invoice.moyasar_transaction_id = payment_id
        invoice.payment_method = payment_record.get("source", {}).get("type", "card")
        invoice.paid_at = datetime.utcnow()
        db.commit()
        return {"status": "paid", "transaction_id": payment_id}
    else:
        raise HTTPException(status_code=402, detail="Payment not completed")

        import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export const MoyasarInvoicePaymentModal = ({ invoiceId, amount, isOpen, onClose, onPaymentSuccess }) => {
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const amountInHalalas = Math.round(amount * 100);

    const checkMoyasarLoaded = setInterval(() => {
      if (window.Moyasar && formRef.current) {
        clearInterval(checkMoyasarLoaded);
        formRef.current.innerHTML = '';
        window.Moyasar.init({
          element: formRef.current,
          amount: amountInHalalas,
          currency: 'SAR',
          description: `Invoice #${invoiceId} Settlement`,
          publishable_api_key: import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY,
          callback_url: window.location.href,
          methods: ['creditcard', 'stcpay'],
          on_completed: async (payment: any) => {
            try {
              const res = await axios.post(`/api/finance/payments/moyasar/verify/${invoiceId}`, { id: payment.id });
              if (res.data.status === 'paid') {
                onPaymentSuccess();
                onClose();
              }
            } catch (err) {
              console.error('Verification failed', err);
            }
          }
        });
      }
    }, 100);
    return () => clearInterval(checkMoyasarLoaded);
  }, [isOpen, invoiceId, amount]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 w-full max-w-lg rounded-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-white">✕</button>
        <div ref={formRef} className="mysr-form mt-4"></div>
      </div>
    </div>
  );
};
