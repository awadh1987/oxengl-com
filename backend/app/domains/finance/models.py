"""
OxenGL General Ledger & Finance Domain Models.
Implements hierarchical Account trees using PostgreSQL ltree and strict Double-Entry Ledger entities.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import (
    String,
    Numeric,
    ForeignKey,
    DateTime,
    Boolean,
    Text,
    CheckConstraint,
    Index,
    UniqueConstraint,
    func,
    JSON,
)
from sqlalchemy.types import UserDefinedType
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, backref

from backend.database import Base


class LtreeType(UserDefinedType):
    """PostgreSQL native ltree data type representation for SQLAlchemy."""
    def get_col_spec(self, **kw):
        return "ltree"

    def bind_processor(self, dialect):
        def process(value):
            return str(value) if value is not None else None
        return process

    def result_processor(self, dialect, coltype):
        def process(value):
            return str(value) if value is not None else None
        return process


class Account(Base):
    """Hierarchical General Ledger Chart of Accounts using PostgreSQL ltree."""
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(LtreeType(), nullable=False)  # e.g., '1.1.1.1.1' or 'assets.cash'
    account_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    children = relationship("AccountChart", backref=backref("parent", remote_side=[id]), lazy="selectin", join_depth=5)
    journal_lines: Mapped[List["JournalLine"]] = relationship("JournalLine", back_populates="account")

    @property
    def account_code(self) -> str:
        return self.code

    @account_code.setter
    def account_code(self, value: str):
        self.code = value

    __table_args__ = (
        Index("idx_accounts_path_gist", "path", postgresql_using="gist"),
        Index("idx_accounts_code", "code"),
        Index("idx_accounts_tenant_type", "tenant_id", "account_type"),
        UniqueConstraint("tenant_id", "code", name="uq_accounts_tenant_code"),
    )


AccountChart = Account
Base.registry._class_registry["AccountChart"] = Account


class JournalEntry(Base):
    """General Ledger Journal Voucher Header enforcing strict Double-Entry balancing."""
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    entry_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    entry_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)

    total_debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    total_credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)

    status: Mapped[str] = mapped_column(String(32), default="POSTED", nullable=False)  # DRAFT, POSTED, CANCELLED
    posted_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    lines: Mapped[List["JournalLine"]] = relationship("JournalLine", back_populates="entry", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("total_debit = total_credit", name="ck_journal_entries_balanced"),
    )


class JournalLine(Base):
    """Individual debit and credit postings comprising a balanced journal entry."""
    __tablename__ = "journal_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    account_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True)

    debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    entry: Mapped["JournalEntry"] = relationship("JournalEntry", back_populates="lines")
    account: Mapped[Optional["Account"]] = relationship("Account", back_populates="journal_lines")

    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0", name="ck_journal_lines_non_negative"),
        CheckConstraint("(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)", name="ck_journal_lines_either_dr_cr"),
    )


class FinanceJournalEntry(Base):
    """General Ledger Journal Voucher Header enforcing strict Double-Entry balancing."""
    __tablename__ = "finance_journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    entry_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    entry_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)

    total_debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    total_credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)

    status: Mapped[str] = mapped_column(String(32), default="POSTED", nullable=False)
    custom_attributes: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), default=dict, nullable=False)
    posted_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)

    lines: Mapped[List["FinanceJournalLine"]] = relationship("FinanceJournalLine", back_populates="entry", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("total_debit = total_credit", name="ck_finance_journal_entries_balanced"),
    )


class FinanceJournalLine(Base):
    """Individual debit and credit postings comprising a balanced journal entry."""
    __tablename__ = "finance_journal_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    entry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("finance_journal_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    account_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)

    debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0.0000"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))

    entry: Mapped["FinanceJournalEntry"] = relationship("FinanceJournalEntry", back_populates="lines")
    account: Mapped[Optional["Account"]] = relationship("Account")

    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0", name="ck_finance_journal_lines_non_negative"),
    )

