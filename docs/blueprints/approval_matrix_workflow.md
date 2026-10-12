# OxenGL Enterprise Blueprint: Multi-Level Approval Matrix Workflow Engine
**Target Role:** Lead ERP Engineer, Workflow Architect, Principal Backend Engineer
**Objective:** Deploy a metadata-driven, multi-level approval engine that intercepts and routes business documents (PR/PO) based on value thresholds, cost centers, and structural role hierachies—with a strict human-in-the-loop audit framework.

---

## 1. CORE DOMAIN REQUIREMENTS
The system must dynamically resolve who needs to approve a document without hardcoding values. 
- **Dynamic Threshold Matrix (Example baseline in USD)**:
  - `$0.00 – $10,000.00`: Requires Department Supervisor Approval.
  - `$10,000.01 – $50,000.00`: Requires Department Manager Approval.
  - `$50,000.01 – $100,000.00`: Requires Divisional Director Approval.
  - `$100,000.01+`: Requires Executive Director / CEO Approval.
- **Cross-Cutting Constraints**: Supports multi-currency conversion out-of-the-box (checks baseline limits in localized equivalents) and enforces strict delegation rules if an approver is marked out-of-office.

---

## 2. REPOSITORY & DATA STRUCTURES (`backend/app/domains/procurement/models.py`)

Implement the following database schema modifications to handle metadata configurations and persistent operational workflow chains:

```python
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Numeric, ForeignKey, DateTime, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class ApprovalRule(Base):
    """Metadata-driven routing rules determining approvals based on value thresholds."""
    __tablename__ = "approval_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'PURCHASE_REQUISITION', 'PURCHASE_ORDER'
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    
    min_amount: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False, default=0.0000)
    max_amount: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    required_role_code: Mapped[str] = mapped_column(String(100), nullable=False) # e.g., 'PROCUREMENT_MANAGER'


class WorkflowInstance(Base):
    """Tracks live lifecycle routing pipelines for targeted document transactions."""
    __tablename__ = "workflow_instances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    
    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False) # 'PENDING', 'APPROVED', 'REJECTED'
    current_step: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    steps = relationship("WorkflowStep", back_populates="instance", cascade="all, delete-orphan")


class WorkflowStep(Base):
    """Granular approval tier records tracking historical logs and individual signatures."""
    __tablename__ = "workflow_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instance_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workflow_instances.id", ondelete="CASCADE"), nullable=False)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_role_code: Mapped[str] = mapped_column(String(100), nullable=False)
    
    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False) # 'PENDING', 'APPROVED', 'REJECTED'
    actioned_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    actioned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    instance = relationship("WorkflowInstance", back_populates="steps")
```

---

## 3. ENGINE ROUTING SERVICE (`backend/app/services/workflow_service.py`)

The orchestration layer must analyze the document total and instantiate steps out-of-band:

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.domains.procurement.models import ApprovalRule, WorkflowInstance, WorkflowStep

class WorkflowEngineService:
    @staticmethod
    async def initialize_document_workflow(db: AsyncSession, tenant_id: str, doc_type: str, doc_id: str, total_amount: float, cost_center_id: Optional[str] = None):
        """Evaluates thresholds metadata matching configuration constraints and fires instances chains."""
        # 1. Select active matching rules sorted by execution sequence
        stmt = select(ApprovalRule).where(
            ApprovalRule.tenant_id == tenant_id,
            ApprovalRule.document_type == doc_type,
            ApprovalRule.min_amount <= total_amount,
            ApprovalRule.max_amount >= total_amount
        ).order_by(ApprovalRule.sequence_order)
        
        result = await db.execute(stmt)
        rules = result.scalars().all()
        
        if not rules:
            # Fallback path: If no limits apply, mark document as auto-approved natively
            return "AUTO_APPROVED"

        # 2. Build live instance tracking parent header record
        instance = WorkflowInstance(
            tenant_id=tenant_id,
            document_type=doc_type,
            document_id=doc_id,
            status="PENDING",
            current_step=1
        )
        db.add(instance)
        await db.flush()

        # 3. Create cascading approval pipeline steps records
        for rule in rules:
            step = WorkflowStep(
                instance_id=instance.id,
                sequence_order=rule.sequence_order,
                assigned_role_code=rule.required_role_code,
                status="PENDING"
            )
            db.add(step)
            
        await db.commit()
        return instance.id
```

---

## 4. FRONTEND ACTION WRAPPERS (`frontend/src/views/ApprovalQueueView.tsx`)
Deploy an operations management widget displaying items matching the current user's role parameters, processing approvals and rejections via a centralized Tailwind dialog interface box.

## 5. REVENUE PROTECTION ASSURANCE TESTS
Every structural submission workflow iteration requires unit test validations:
- **Test Case WRK-01**: A $5,000 Purchase Order must cleanly initialize a single-step `WorkflowInstance` assigned exclusively to the `DEPARTMENT_SUPERVISOR` layer role.
- **Test Case WRK-02**: A $150,000 Purchase Order must sequentially bind steps checking off Supervisor, Manager, and Executive validation keys sequentially.
- **Test Case WRK-03**: Submitting rejection notes to a targeted level step must automatically update the parent instance configuration boundary state flag directly to `REJECTED`.

