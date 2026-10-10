"""
OxenGL Multi-Tenant SaaS Billing & Subscription Domain Models.
Enforces automated multi-grade tier metering, seat allocation constraints,
infrastructure entitlement flags, and payment life-cycle tracking.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Any
from sqlalchemy import String, ForeignKey, Boolean, Integer, Numeric, DateTime, Text, JSON, CheckConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

try:
    from backend.database import Base
except ImportError:
    from app.db.base import Base


class SubscriptionPlan(Base):
    """
    Stores product pricing tiers, seat quotas, fleet unit limits,
    storage allowances, and enterprise architectural unlock flags.
    """
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)  # 'FREE', 'PROFESSIONAL', 'ENTERPRISE'
    display_name: Mapped[str] = mapped_column(String(100), nullable=False, default="Standard Plan")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    monthly_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    annual_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="SAR")
    
    stripe_price_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_product_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    max_seats: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_vehicles: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    max_storage_gb: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    max_monthly_transactions: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    
    # Enterprise Architectural Unlock Flags (Phases 1-3)
    allow_external_database: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_custom_domain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_dedicated_ssl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    features: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Catalog presentation (single source of truth for the landing page, tenant billing and
    # the Super Admin pricing console; editable via PUT /api/v1/superadmin/billing/plans/{id})
    display_features: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    subscriptions: Mapped[list["TenantSubscription"]] = relationship(
        "TenantSubscription", back_populates="plan", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "monthly_price": float(self.monthly_price) if self.monthly_price is not None else 0.0,
            "annual_price": float(self.annual_price) if self.annual_price is not None else 0.0,
            "currency": self.currency,
            "stripe_price_id": self.stripe_price_id,
            "stripe_product_id": self.stripe_product_id,
            "max_seats": self.max_seats,
            "max_vehicles": self.max_vehicles,
            "max_storage_gb": self.max_storage_gb,
            "max_monthly_transactions": self.max_monthly_transactions,
            "allow_external_database": self.allow_external_database,
            "allow_custom_domain": self.allow_custom_domain,
            "allow_dedicated_ssl": self.allow_dedicated_ssl,
            "features": self.features or [],
            "display_features": self.display_features or [],
            "is_featured": bool(self.is_featured),
            "sort_order": self.sort_order or 0,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TenantSubscription(Base):
    """
    Tracks active tenant subscription contracts, payment states,
    active metrics counters, and enterprise contract amendments.
    """
    __tablename__ = "tenant_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("master_tenants.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscription_plans.id"),
        nullable=False,
        index=True,
    )
    
    status: Mapped[str] = mapped_column(
        String(50),
        default="active",
        nullable=False,
    )  # 'trialing', 'active', 'past_due', 'canceled', 'grace_period', 'unpaid'
    
    billing_cycle: Mapped[str] = mapped_column(String(32), default="monthly", nullable=False)
    payment_method_type: Mapped[str] = mapped_column(String(64), default="card", nullable=False)
    
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    
    current_seats_used: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_vehicles_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_storage_mb_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    canceled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    custom_limits: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    plan: Mapped["SubscriptionPlan"] = relationship("SubscriptionPlan", back_populates="subscriptions")
    tenant: Mapped[Optional["MasterTenant"]] = relationship("MasterTenant", back_populates="subscription", foreign_keys=[tenant_id])
    invoices: Mapped[list["SaaSInvoice"]] = relationship("SaaSInvoice", back_populates="subscription")

    def __init__(self, **kwargs):
        max_seats_val = kwargs.pop("max_seats", None)
        super().__init__(**kwargs)
        if max_seats_val is not None:
            self._max_seats = max_seats_val

    @property
    def max_seats(self) -> int:
        if hasattr(self, "_max_seats") and self._max_seats is not None:
            return self._max_seats
        if self.custom_limits and isinstance(self.custom_limits, dict) and "max_seats" in self.custom_limits:
            return int(self.custom_limits["max_seats"])
        if self.plan and hasattr(self.plan, "max_seats"):
            return self.plan.max_seats
        return 5

    @max_seats.setter
    def max_seats(self, value: int):
        self._max_seats = value

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "plan_id": str(self.plan_id),
            "plan_name": self.plan.name if self.plan else None,
            "status": self.status,
            "billing_cycle": self.billing_cycle,
            "payment_method_type": self.payment_method_type,
            "stripe_customer_id": self.stripe_customer_id,
            "stripe_subscription_id": self.stripe_subscription_id,
            "current_seats_used": self.current_seats_used,
            "max_seats": self.max_seats,
            "current_vehicles_used": self.current_vehicles_used,
            "current_storage_mb_used": self.current_storage_mb_used,
            "current_period_start": self.current_period_start.isoformat() if self.current_period_start else None,
            "current_period_end": self.current_period_end.isoformat() if self.current_period_end else None,
            "cancel_at_period_end": self.cancel_at_period_end,
            "canceled_at": self.canceled_at.isoformat() if self.canceled_at else None,
            "trial_ends_at": self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            "custom_limits": self.custom_limits,
            "notes": self.notes,
        }


class PaymentGatewaySettings(Base):
    """
    Platform-wide (control-plane) configuration for collecting tenant subscription payments.

    Singleton: exactly one row with ``id = 1`` (enforced by a CHECK constraint).
    Every ``*_encrypted`` column holds a Fernet token produced by
    ``backend.app.core.secret_vault`` -- plaintext credentials are NEVER persisted.
    ``version`` is bumped on every write and used for optimistic concurrency on PUT.
    """
    __tablename__ = "platform_payment_gateway_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_platform_payment_gateway_settings_singleton"),)

    SINGLETON_ID = 1

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=SINGLETON_ID)

    # Global card processing (Stripe)
    stripe_secret_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stripe_publishable_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stripe_webhook_secret_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_stripe_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    # Regional card & wallet processing (Moyasar: Mada, STC Pay, Apple Pay)
    moyasar_api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    moyasar_publishable_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_moyasar_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    # Offline channels (non-secret, shown to tenants at checkout)
    # [{bank_name, account_name, account_number, iban, swift, branch, currency, is_active}]
    local_bank_instructions: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    # [{provider, wallet_number, account_name, qr_code_url, is_active}]
    digital_wallet_instructions: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    updated_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
