"""
Customs and Cross-Border Logistics ORM Models for OxenGL (REM-P2-03).
Maps directly to customs_manifests and electronic_ledger_blocks tables in PostgreSQL.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class CustomsManifest(Base):
    """
    Cross-Border Customs Manifest and Declaration Entity.
    Stores regulatory declaration details, tax/duty values, and SHA-256 blockchain ledger links.
    """
    __tablename__ = "customs_manifests"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=True, index=True)

    manifest_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    declaration_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    declaration_type: Mapped[str] = mapped_column(String(50), default="IMPORT", nullable=False)

    port_of_entry: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    border_port_name: Mapped[str] = mapped_column(String(150), default="King Abdulaziz Port", nullable=False)
    carrier_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="DRAFT", nullable=False, index=True)
    clearance_status: Mapped[str] = mapped_column(String(50), default="PENDING_DOCUMENTATION", nullable=False)
    zatca_compliance_status: Mapped[str] = mapped_column(String(50), default="NOT_SUBMITTED", nullable=False)

    duty_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    total_customs_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)

    hs_codes_json: Mapped[list[Any]] = mapped_column(JSONB, default=list, nullable=False)
    payload_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    previous_hash: Mapped[str] = mapped_column(String(64), default="0" * 64, nullable=False)
    block_index: Mapped[int] = mapped_column(BigInteger, default=1, nullable=False)
    cryptographic_uuid: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    @property
    def total_value_sar(self) -> float:
        return float(self.total_customs_amount)

    @property
    def block_hash(self) -> str:
        return self.payload_hash or ""

    @property
    def hs_codes(self) -> list[str]:
        if isinstance(self.hs_codes_json, list):
            return [str(c) for c in self.hs_codes_json]
        return []


# Declaration alias for semantic compliance
CustomsDeclaration = CustomsManifest


__all__ = ["CustomsManifest", "CustomsDeclaration"]
