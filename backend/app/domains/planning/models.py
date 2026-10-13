"""
OxenGL Planning Department Domain Models
Defines ProjectCharter, ExecutionTask, and StrategicHazard entities.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List, Dict, Any

from sqlalchemy import Column, String, Numeric, Text, DateTime, ForeignKey, Index, BigInteger, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column

try:
    from backend.database import Base
except ImportError:
    from backend.app.db.base import Base


class ProjectCharter(Base):
    """Tier 1 Strategic Project Charter Model."""
    __tablename__ = "project_charters"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    project_name: Mapped[str] = mapped_column(String(255), nullable=False)
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    manager_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_budget: Mapped[float] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    smart_goals: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    kpis_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    scope_of_work_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    tasks: Mapped[List["ExecutionTask"]] = relationship("ExecutionTask", back_populates="charter", cascade="all, delete-orphan")

    def to_dict(self, include_tasks: bool = False) -> Dict[str, Any]:
        total_tasks = len(self.tasks) if self.tasks else 0
        completed_tasks = len([t for t in self.tasks if t.status == "COMPLETED"]) if self.tasks else 0
        completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
        committed_cost = sum(float(t.task_cost or 0) for t in self.tasks) if self.tasks else 0
        budget = float(self.total_budget or 0)
        budget_burn_rate = round((committed_cost / budget * 100), 1) if budget > 0 else 0

        hazards_count = 0
        if self.tasks:
            for t in self.tasks:
                if hasattr(t, "hazards") and t.hazards:
                    hazards_count += len([h for h in t.hazards if h.mitigation_status != "MITIGATED"])

        result = {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "project_name": self.project_name,
            "manager_id": str(self.manager_id) if self.manager_id else None,
            "manager_name": self.manager_name or "Unassigned",
            "start_date": self.start_date.isoformat() if self.start_date else "",
            "end_date": self.end_date.isoformat() if self.end_date else "",
            "total_budget": float(self.total_budget or 0),
            "smart_goals": self.smart_goals or [],
            "kpis_json": self.kpis_json or {},
            "scope_of_work_text": self.scope_of_work_text or "",
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "completion_rate": completion_rate,
            "committed_cost": committed_cost,
            "budget_burn_rate": budget_burn_rate,
            "active_hazards_count": hazards_count,
        }
        if include_tasks and self.tasks:
            result["tasks"] = [t.to_dict(include_hazards=True) for t in self.tasks]
        return result


class ExecutionTask(Base):
    """Tier 2 Granular Execution Matrix Task Model."""
    __tablename__ = "execution_tasks"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    charter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("project_charters.id", ondelete="CASCADE"), index=True, nullable=False)
    task_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phase: Mapped[str] = mapped_column(String(50), default="Initiation", nullable=False)
    department: Mapped[str] = mapped_column(String(100), default="Operations", nullable=False)
    assigned_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    assigned_user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False)
    planned_hours: Mapped[float] = mapped_column(Numeric(8, 2), default=Decimal("0.00"), nullable=False)
    task_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    materials_required: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    charter: Mapped["ProjectCharter"] = relationship("ProjectCharter", back_populates="tasks")
    hazards: Mapped[List["StrategicHazard"]] = relationship("StrategicHazard", back_populates="execution_task", cascade="all, delete-orphan")

    def to_dict(self, include_hazards: bool = True) -> Dict[str, Any]:
        result = {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "charter_id": str(self.charter_id),
            "task_name": self.task_name,
            "phase": self.phase,
            "department": self.department,
            "assigned_user_id": str(self.assigned_user_id) if self.assigned_user_id else None,
            "assigned_user_name": self.assigned_user_name or "Unassigned",
            "priority": self.priority,
            "status": self.status,
            "planned_hours": float(self.planned_hours or 0),
            "task_cost": float(self.task_cost or 0),
            "materials_required": self.materials_required or [],
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
        }
        if include_hazards and hasattr(self, "hazards"):
            result["hazards"] = [h.to_dict() for h in (self.hazards or [])]
        return result


class StrategicHazard(Base):
    """Tier 3 Strategic Risk and Hazard Tracker Model."""
    __tablename__ = "strategic_hazards"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    execution_task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("execution_tasks.id", ondelete="CASCADE"), index=True, nullable=False)
    desired_outcome: Mapped[str] = mapped_column(Text, nullable=False)
    potential_hazard_description: Mapped[str] = mapped_column(Text, nullable=False)
    mitigation_status: Mapped[str] = mapped_column(String(50), default="IDENTIFIED", nullable=False)
    mitigation_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False)
    mitigated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    execution_task: Mapped["ExecutionTask"] = relationship("ExecutionTask", back_populates="hazards")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "execution_task_id": str(self.execution_task_id),
            "desired_outcome": self.desired_outcome,
            "potential_hazard_description": self.potential_hazard_description,
            "mitigation_status": self.mitigation_status,
            "mitigation_plan": self.mitigation_plan or "",
            "severity": self.severity,
            "mitigated_at": self.mitigated_at.isoformat() if self.mitigated_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
        }


class ElectronicLedgerBlock(Base):
    """Phase 5 Immutable Electronic Ledger Block Model."""
    __tablename__ = "electronic_ledger_blocks"
    __table_args__ = (
        Index("idx_ledger_chain_sequence", "tenant_id", "block_index", unique=True),
        {"extend_existing": True},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), index=True, nullable=False)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    block_index: Mapped[int] = mapped_column(BigInteger, nullable=False)
    payload_json: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    current_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    digitally_signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "journal_entry_id": str(self.journal_entry_id),
            "block_index": self.block_index,
            "payload_json": self.payload_json,
            "previous_hash": self.previous_hash,
            "current_hash": self.current_hash,
            "digitally_signed_at": self.digitally_signed_at.isoformat() if self.digitally_signed_at else "",
        }


class CustomsManifest(Base):
    """Phase 5 Cross-Border Customs Manifest Model."""
    __tablename__ = "customs_manifests"
    __table_args__ = (
        Index("idx_customs_manifests_tenant", "tenant_id", unique=False),
        {"extend_existing": True},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), nullable=False)
    manifest_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    declaration_type: Mapped[str] = mapped_column(String(50), default="IMPORT", nullable=False)
    border_port_name: Mapped[str] = mapped_column(String(150), nullable=False)
    hs_codes_json: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    clearance_status: Mapped[str] = mapped_column(String(50), default="PENDING_DOCUMENTATION", nullable=False)
    zatca_compliance_status: Mapped[str] = mapped_column(String(50), default="NOT_SUBMITTED", nullable=False)
    cryptographic_uuid: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), unique=True, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "tenant_id": str(self.tenant_id),
            "manifest_number": self.manifest_number,
            "declaration_type": self.declaration_type,
            "border_port_name": self.border_port_name,
            "hs_codes_json": self.hs_codes_json,
            "clearance_status": self.clearance_status,
            "zatca_compliance_status": self.zatca_compliance_status,
            "cryptographic_uuid": str(self.cryptographic_uuid) if self.cryptographic_uuid else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
        }


class Tenant(Base):
    """Corporate configuration profile."""
    __tablename__ = "tenants"
    __table_args__ = {"extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name: Mapped[str] = mapped_column(String(150), nullable=False)
    schema_name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    logo_url = Column(String(500), nullable=True, default=None)


try:
    from backend.models import ResCompany
except ImportError:
    ResCompany = Tenant

from backend.app.models.core_project import CoreProject, ProjectStatusEnum

__all__ = [
    "ProjectCharter",
    "ExecutionTask",
    "StrategicHazard",
    "ElectronicLedgerBlock",
    "CustomsManifest",
    "Tenant",
    "ResCompany",
    "CoreProject",
    "ProjectStatusEnum",
]



