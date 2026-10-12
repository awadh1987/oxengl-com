"""
OxenGL Multi-Level Approval Matrix Workflow Engine Service.
Orchestrates document threshold routing, sequential signature tracking,
auto-approval fallbacks, and human-in-the-loop state transitions.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Union
from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from backend.app.domains.procurement.models import (
    ApprovalRule,
    WorkflowInstance,
    WorkflowStep,
)


class WorkflowEngineService:
    """Orchestration service driving dynamic threshold routing and step-by-step approvals."""

    @staticmethod
    def initialize_document_workflow(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        doc_type: str,
        doc_id: Union[str, uuid.UUID],
        total_amount: float,
        cost_center_id: Optional[Union[str, uuid.UUID]] = None,
    ) -> Union[str, uuid.UUID]:
        """
        Evaluates approval rule thresholds and instantiates workflow instance with sequential steps.
        If no rules match the threshold bounds, the document is marked AUTO_APPROVED.
        """
        tenant_uuid = uuid.UUID(str(tenant_id)) if isinstance(tenant_id, str) else tenant_id
        doc_uuid = uuid.UUID(str(doc_id)) if isinstance(doc_id, str) else doc_id
        cost_center_uuid = uuid.UUID(str(cost_center_id)) if cost_center_id else None
        amount_decimal = Decimal(str(total_amount))

        # 1. Select active matching rules sorted by execution sequence order
        conditions = [
            ApprovalRule.tenant_id == tenant_uuid,
            ApprovalRule.document_type == doc_type,
            ApprovalRule.is_active == True,
            ApprovalRule.min_amount <= amount_decimal,
            ApprovalRule.max_amount >= amount_decimal,
        ]
        if cost_center_uuid:
            conditions.append(
                (ApprovalRule.cost_center_id == cost_center_uuid) | (ApprovalRule.cost_center_id == None)
            )

        stmt = select(ApprovalRule).where(and_(*conditions)).order_by(ApprovalRule.sequence_order)
        rules = db.execute(stmt).scalars().all()

        if not rules:
            # Fallback path: If no rules match the bounds, mark document as auto-approved natively
            return "AUTO_APPROVED"

        # 2. Build live instance tracking parent header record
        instance = WorkflowInstance(
            tenant_id=tenant_uuid,
            document_type=doc_type,
            document_id=doc_uuid,
            status="PENDING",
            current_step=1,
        )
        db.add(instance)
        db.flush()

        # 3. Create cascading approval pipeline step records
        for rule in rules:
            step = WorkflowStep(
                instance_id=instance.id,
                sequence_order=rule.sequence_order,
                assigned_role_code=rule.required_role_code,
                status="PENDING",
            )
            db.add(step)

        db.commit()
        db.refresh(instance)
        return instance.id

    @staticmethod
    def approve_step(
        db: Session,
        step_id: Union[str, uuid.UUID],
        actioned_by: Union[str, uuid.UUID],
    ) -> WorkflowInstance:
        """
        Approves a specific workflow step. Advances workflow or marks instance APPROVED if all steps complete.
        """
        step_uuid = uuid.UUID(str(step_id)) if isinstance(step_id, str) else step_id
        user_uuid = uuid.UUID(str(actioned_by)) if isinstance(actioned_by, str) else actioned_by

        step = db.execute(select(WorkflowStep).where(WorkflowStep.id == step_uuid)).scalar_one_or_none()
        if not step:
            raise ValueError(f"Workflow step {step_id} not found")

        instance = db.execute(
            select(WorkflowInstance).where(WorkflowInstance.id == step.instance_id)
        ).scalar_one()

        if instance.status != "PENDING":
            raise ValueError(f"Workflow instance is already {instance.status}")

        step.status = "APPROVED"
        step.actioned_by = user_uuid
        step.actioned_at = datetime.utcnow()

        # Check remaining steps in this instance
        all_steps = db.execute(
            select(WorkflowStep)
            .where(WorkflowStep.instance_id == instance.id)
            .order_by(WorkflowStep.sequence_order)
        ).scalars().all()

        pending_steps = [s for s in all_steps if s.status == "PENDING"]
        if not pending_steps:
            instance.status = "APPROVED"
        else:
            instance.current_step = pending_steps[0].sequence_order

        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def reject_step(
        db: Session,
        step_id: Union[str, uuid.UUID],
        actioned_by: Union[str, uuid.UUID],
        rejection_reason: str,
    ) -> WorkflowInstance:
        """
        Rejects a specific workflow step, immediately transitioning the parent instance to REJECTED.
        """
        step_uuid = uuid.UUID(str(step_id)) if isinstance(step_id, str) else step_id
        user_uuid = uuid.UUID(str(actioned_by)) if isinstance(actioned_by, str) else actioned_by

        step = db.execute(select(WorkflowStep).where(WorkflowStep.id == step_uuid)).scalar_one_or_none()
        if not step:
            raise ValueError(f"Workflow step {step_id} not found")

        instance = db.execute(
            select(WorkflowInstance).where(WorkflowInstance.id == step.instance_id)
        ).scalar_one()

        step.status = "REJECTED"
        step.actioned_by = user_uuid
        step.actioned_at = datetime.utcnow()
        step.rejection_reason = rejection_reason

        instance.status = "REJECTED"

        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def get_pending_queue(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        role_codes: Optional[List[str]] = None,
    ) -> List[dict]:
        """Fetches pending approval queue items filtered by tenant and active roles."""
        tenant_uuid = uuid.UUID(str(tenant_id)) if isinstance(tenant_id, str) else tenant_id

        stmt = (
            select(WorkflowStep, WorkflowInstance)
            .join(WorkflowInstance, WorkflowStep.instance_id == WorkflowInstance.id)
            .where(
                WorkflowInstance.tenant_id == tenant_uuid,
                WorkflowInstance.status == "PENDING",
                WorkflowStep.status == "PENDING",
                WorkflowStep.sequence_order == WorkflowInstance.current_step,
            )
        )
        if role_codes:
            stmt = stmt.where(WorkflowStep.assigned_role_code.in_(role_codes))

        results = db.execute(stmt).all()
        queue_items = []
        for step, instance in results:
            queue_items.append({
                "step_id": str(step.id),
                "instance_id": str(instance.id),
                "document_type": instance.document_type,
                "document_id": str(instance.document_id),
                "sequence_order": step.sequence_order,
                "required_role": step.assigned_role_code,
                "created_at": instance.created_at.isoformat(),
            })
        return queue_items
