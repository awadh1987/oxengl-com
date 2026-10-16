"""
OxenGL Multi-Level Approval Matrix Workflow Engine Service.
Orchestrates document threshold routing, sequential signature tracking,
auto-approval fallbacks, escalation workflows, audit trail logging,
and human-in-the-loop state transitions across all enterprise modules:
  - OPERATIONS (Daily Operations / Weighbridge Dispatch)
  - PURCHASE_ORDER (Procurement Purchase Orders)
  - VENDOR_BILL (Procurement Vendor Bills)
  - PURCHASE_REQUISITION (Departmental Purchase Requisitions)
  - FINANCIAL_VOUCHER (Financial Vouchers / GL Journal Entries)
  - CRUSHER_PAYMENT (Crusher & Raw Material Supplier Settlements)
  - FLEET_WORK_ORDER (Fleet Maintenance Work Orders)
  - HRMS (HRMS Payroll, Advances & Leave Settlements)
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List, Union, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, text, desc

from backend.app.domains.procurement.models import (
    ApprovalRule,
    WorkflowInstance,
    WorkflowStep,
    PurchaseRequisition,
    VendorBill,
)


SUPPORTED_APPROVAL_MODULES: List[str] = [
    "OPERATIONS",
    "PURCHASE_ORDER",
    "VENDOR_BILL",
    "PURCHASE_REQUISITION",
    "FINANCIAL_VOUCHER",
    "CRUSHER_PAYMENT",
    "FLEET_WORK_ORDER",
    "HRMS",
]

DEFAULT_MATRIX_RULES: List[Dict[str, Any]] = [
    # 1. Daily Operations / Weighbridge Dispatch
    {
        "document_type": "OPERATIONS",
        "min_amount": Decimal("15000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 1,
        "required_role_code": "OPERATIONS_MANAGER",
        "is_active": True,
    },
    {
        "document_type": "OPERATIONS",
        "min_amount": Decimal("50000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 2,
        "required_role_code": "FINANCE_MANAGER",
        "is_active": True,
    },
    # 2. Procurement Purchase Orders
    {
        "document_type": "PURCHASE_ORDER",
        "min_amount": Decimal("10000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 1,
        "required_role_code": "PROCUREMENT_MANAGER",
        "is_active": True,
    },
    {
        "document_type": "PURCHASE_ORDER",
        "min_amount": Decimal("50000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 2,
        "required_role_code": "FINANCE_MANAGER",
        "is_active": True,
    },
    {
        "document_type": "PURCHASE_ORDER",
        "min_amount": Decimal("200000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 3,
        "required_role_code": "CEO",
        "is_active": True,
    },
    # 3. Procurement Vendor Bills
    {
        "document_type": "VENDOR_BILL",
        "min_amount": Decimal("15000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 1,
        "required_role_code": "CHIEF_ACCOUNTANT",
        "is_active": True,
    },
    {
        "document_type": "VENDOR_BILL",
        "min_amount": Decimal("100000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 2,
        "required_role_code": "CFO",
        "is_active": True,
    },
    # 4. Purchase Requisitions
    {
        "document_type": "PURCHASE_REQUISITION",
        "min_amount": Decimal("5000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 1,
        "required_role_code": "DEPARTMENT_SUPERVISOR",
        "is_active": True,
    },
    {
        "document_type": "PURCHASE_REQUISITION",
        "min_amount": Decimal("25000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 2,
        "required_role_code": "FINANCE_MANAGER",
        "is_active": True,
    },
    # 5. Financial Vouchers & GL Journal Entries
    {
        "document_type": "FINANCIAL_VOUCHER",
        "min_amount": Decimal("10000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 1,
        "required_role_code": "FINANCE_MANAGER",
        "is_active": True,
    },
    {
        "document_type": "FINANCIAL_VOUCHER",
        "min_amount": Decimal("100000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 2,
        "required_role_code": "CEO",
        "is_active": True,
    },
    # 6. Crusher & Raw Material Supplier Settlements
    {
        "document_type": "CRUSHER_PAYMENT",
        "min_amount": Decimal("20000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 1,
        "required_role_code": "FINANCE_MANAGER",
        "is_active": True,
    },
    {
        "document_type": "CRUSHER_PAYMENT",
        "min_amount": Decimal("75000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 2,
        "required_role_code": "COO",
        "is_active": True,
    },
    # 7. Fleet Maintenance Work Orders
    {
        "document_type": "FLEET_WORK_ORDER",
        "min_amount": Decimal("5000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 1,
        "required_role_code": "FLEET_MANAGER",
        "is_active": True,
    },
    {
        "document_type": "FLEET_WORK_ORDER",
        "min_amount": Decimal("25000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 2,
        "required_role_code": "OPERATIONS_DIRECTOR",
        "is_active": True,
    },
    # 8. HRMS Payroll, Advances & Leave Settlements
    {
        "document_type": "HRMS",
        "min_amount": Decimal("5000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 1,
        "required_role_code": "HR_MANAGER",
        "is_active": True,
    },
    {
        "document_type": "HRMS",
        "min_amount": Decimal("30000.0000"),
        "max_amount": Decimal("999999999.0000"),
        "currency": "SAR",
        "sequence_order": 2,
        "required_role_code": "FINANCE_MANAGER",
        "is_active": True,
    },
]


class WorkflowEngineService:
    """Orchestration service driving dynamic threshold routing and step-by-step approvals."""

    @staticmethod
    def _to_uuid(val: Union[str, uuid.UUID]) -> uuid.UUID:
        if isinstance(val, uuid.UUID):
            return val
        try:
            return uuid.UUID(str(val))
        except Exception:
            # Deterministic UUID5 fallback for string IDs like "OP-1001" or "VCH-102"
            return uuid.uuid5(uuid.NAMESPACE_OID, str(val))

    @staticmethod
    def _set_rls_context(db: Session, tenant_id: Optional[Union[str, uuid.UUID]]) -> Optional[uuid.UUID]:
        """Sets PostgreSQL session-level RLS tenant context (`app.current_tenant_id`)."""
        if not tenant_id:
            return None
        tenant_uuid = WorkflowEngineService._to_uuid(tenant_id)
        try:
            if hasattr(db, "info") and isinstance(db.info, dict):
                db.info["tenant_id"] = str(tenant_uuid)
            bind = db.get_bind()
            if bind and bind.dialect.name == "postgresql":
                db.execute(
                    text("SELECT set_config('app.current_tenant_id', :tid, false), set_config('app.current_company_id', :tid, false)"),
                    {"tid": str(tenant_uuid)},
                )
        except Exception:
            pass
        return tenant_uuid

    @staticmethod
    def _record_audit_log(
        db: Session,
        tenant_id: uuid.UUID,
        actor_id: Optional[uuid.UUID],
        action: str,
        target_ref: str,
        remarks: Optional[str] = None,
        outcome: str = "SUCCESS",
    ) -> None:
        """Persists an immutable approval audit log entry without disrupting active transactions."""
        try:
            from backend.models import PlatformAuditLog
            with db.begin_nested():
                log_entry = PlatformAuditLog(
                    id=uuid.uuid4(),
                    actor_email=str(actor_id) if actor_id else "system@oxengl.com",
                    action=action,
                    outcome=outcome,
                    endpoint_accessed=f"/approvals/{target_ref}"[:255],
                    actor_id=actor_id,
                    tenant_id=tenant_id,
                    user_agent=(remarks or "")[:512] if remarks else None,
                )
                db.add(log_entry)
                db.flush()
        except Exception:
            pass

    @staticmethod
    def _sync_target_document_status(
        db: Session,
        instance: WorkflowInstance,
        final_status: str,
    ) -> None:
        """
        Synchronizes the underlying domain record when a workflow transitions to
        APPROVED or REJECTED, unblocking or cancelling downstream GL posting/settlement/dispatch.
        """
        doc_type = (instance.document_type or "").upper()
        doc_id = instance.document_id
        now = datetime.now(timezone.utc)

        try:
            from backend import models as core_models
            with db.begin_nested():
                if doc_type == "PURCHASE_REQUISITION":
                    pr = db.scalar(select(PurchaseRequisition).where(PurchaseRequisition.id == doc_id))
                    if pr:
                        pr.status = "APPROVED" if final_status == "APPROVED" else "REJECTED"

                elif doc_type == "PURCHASE_ORDER":
                    po = db.scalar(select(core_models.PurchaseOrder).where(core_models.PurchaseOrder.id == doc_id))
                    if po:
                        po.status = "confirmed" if final_status == "APPROVED" else "cancelled"
                        attrs = dict(po.custom_attributes or {})
                        attrs["approval_status"] = final_status
                        po.custom_attributes = attrs

                elif doc_type == "VENDOR_BILL":
                    bill = db.scalar(select(VendorBill).where(VendorBill.id == doc_id))
                    if bill:
                        bill.match_status = "MATCHED" if final_status == "APPROVED" else "REJECTED"
                    if hasattr(core_models, "VendorBill"):
                        core_bill = db.scalar(select(core_models.VendorBill).where(core_models.VendorBill.id == doc_id))
                        if core_bill:
                            core_bill.match_status = "MATCHED" if final_status == "APPROVED" else "REJECTED"

                elif doc_type == "FINANCIAL_VOUCHER":
                    move = db.scalar(select(core_models.AccountMove).where(core_models.AccountMove.id == doc_id))
                    if move:
                        if final_status == "APPROVED":
                            move.state = "posted"
                            move.posted_at = now
                        else:
                            move.state = "canceled"
                        attrs = dict(move.custom_attributes or {})
                        attrs["approval_status"] = final_status
                        move.custom_attributes = attrs

                elif doc_type == "FLEET_WORK_ORDER":
                    order = db.scalar(
                        select(core_models.MaintenanceWorkOrder).where(core_models.MaintenanceWorkOrder.id == doc_id)
                    )
                    if order:
                        order.status = "in_progress" if final_status == "APPROVED" else "cancelled"

                elif doc_type == "OPERATIONS":
                    ticket = db.scalar(
                        select(core_models.WeighbridgeTicket).where(core_models.WeighbridgeTicket.id == doc_id)
                    )
                    if ticket:
                        attrs = dict(ticket.custom_attributes or {})
                        attrs["approval_status"] = final_status
                        ticket.custom_attributes = attrs
                        if ticket.picking_id:
                            picking = db.scalar(
                                select(core_models.StockPicking).where(core_models.StockPicking.id == ticket.picking_id)
                            )
                            if picking:
                                picking.state = "done" if final_status == "APPROVED" else "cancelled"

                elif doc_type == "CRUSHER_PAYMENT":
                    settlement = db.scalar(
                        select(core_models.SupplierSettlement).where(core_models.SupplierSettlement.id == doc_id)
                    )
                    if settlement:
                        settlement.state = "approved" if final_status == "APPROVED" else "draft"
                db.flush()
        except Exception:
            pass

    @staticmethod
    def rule_to_dict(rule: ApprovalRule) -> Dict[str, Any]:
        return {
            "id": str(rule.id),
            "tenant_id": str(rule.tenant_id),
            "document_type": rule.document_type,
            "cost_center_id": str(rule.cost_center_id) if rule.cost_center_id else None,
            "min_amount": float(rule.min_amount or 0),
            "max_amount": float(rule.max_amount or 0),
            "currency": rule.currency or "SAR",
            "sequence_order": int(rule.sequence_order or 1),
            "required_role_code": rule.required_role_code,
            "is_active": bool(rule.is_active),
            "created_at": rule.created_at.isoformat() if rule.created_at else None,
        }

    @staticmethod
    def seed_default_rules(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
    ) -> List[ApprovalRule]:
        """Seeds the default multi-module approval matrix for a tenant if no rules exist."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        existing = db.scalars(
            select(ApprovalRule)
            .where(ApprovalRule.tenant_id == tenant_uuid)
            .order_by(ApprovalRule.document_type, ApprovalRule.sequence_order)
        ).all()
        if existing:
            return list(existing)

        created: List[ApprovalRule] = []
        for item in DEFAULT_MATRIX_RULES:
            rule = ApprovalRule(
                id=uuid.uuid4(),
                tenant_id=tenant_uuid,
                document_type=item["document_type"],
                min_amount=item["min_amount"],
                max_amount=item["max_amount"],
                currency=item["currency"],
                sequence_order=item["sequence_order"],
                required_role_code=item["required_role_code"],
                is_active=item["is_active"],
            )
            db.add(rule)
            created.append(rule)
        db.commit()
        for r in created:
            db.refresh(r)
        return created

    @staticmethod
    def list_rules(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        document_type: Optional[str] = None,
        seed_if_empty: bool = False,
    ) -> List[Dict[str, Any]]:
        """Lists approval matrix rules strictly isolated to the specified tenant."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        if seed_if_empty:
            WorkflowEngineService.seed_default_rules(db, tenant_uuid)

        stmt = select(ApprovalRule).where(ApprovalRule.tenant_id == tenant_uuid)
        if document_type:
            stmt = stmt.where(ApprovalRule.document_type == document_type.upper())
        stmt = stmt.order_by(ApprovalRule.document_type, ApprovalRule.sequence_order, ApprovalRule.min_amount)
        rows = db.scalars(stmt).all()
        return [WorkflowEngineService.rule_to_dict(r) for r in rows]

    @staticmethod
    def create_rule(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        document_type: str,
        min_amount: float,
        max_amount: float,
        required_role_code: str,
        sequence_order: int = 1,
        currency: str = "SAR",
        cost_center_id: Optional[Union[str, uuid.UUID]] = None,
        is_active: bool = True,
    ) -> ApprovalRule:
        """Creates a new tenant-scoped approval threshold rule."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        cc_uuid = WorkflowEngineService._to_uuid(cost_center_id) if cost_center_id else None
        rule = ApprovalRule(
            id=uuid.uuid4(),
            tenant_id=tenant_uuid,
            document_type=document_type.upper().strip(),
            cost_center_id=cc_uuid,
            min_amount=Decimal(str(min_amount)),
            max_amount=Decimal(str(max_amount)),
            currency=(currency or "SAR").upper()[:3],
            sequence_order=max(1, int(sequence_order)),
            required_role_code=required_role_code.strip(),
            is_active=bool(is_active),
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)
        return rule

    @staticmethod
    def update_rule(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        rule_id: Union[str, uuid.UUID],
        updates: Dict[str, Any],
    ) -> ApprovalRule:
        """Updates an existing approval threshold rule strictly within the caller's tenant."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        rule_uuid = WorkflowEngineService._to_uuid(rule_id)
        rule = db.scalar(
            select(ApprovalRule).where(
                ApprovalRule.id == rule_uuid,
                ApprovalRule.tenant_id == tenant_uuid,
            )
        )
        if not rule:
            raise ValueError(f"Approval rule {rule_id} not found for tenant")

        if "document_type" in updates and updates["document_type"] is not None:
            rule.document_type = str(updates["document_type"]).upper().strip()
        if "min_amount" in updates and updates["min_amount"] is not None:
            rule.min_amount = Decimal(str(updates["min_amount"]))
        if "max_amount" in updates and updates["max_amount"] is not None:
            rule.max_amount = Decimal(str(updates["max_amount"]))
        if "currency" in updates and updates["currency"] is not None:
            rule.currency = str(updates["currency"]).upper()[:3]
        if "sequence_order" in updates and updates["sequence_order"] is not None:
            rule.sequence_order = max(1, int(updates["sequence_order"]))
        if "required_role_code" in updates and updates["required_role_code"] is not None:
            rule.required_role_code = str(updates["required_role_code"]).strip()
        if "is_active" in updates and updates["is_active"] is not None:
            rule.is_active = bool(updates["is_active"])

        db.commit()
        db.refresh(rule)
        return rule

    @staticmethod
    def delete_rule(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        rule_id: Union[str, uuid.UUID],
    ) -> bool:
        """Deletes a tenant approval rule."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        rule_uuid = WorkflowEngineService._to_uuid(rule_id)
        rule = db.scalar(
            select(ApprovalRule).where(
                ApprovalRule.id == rule_uuid,
                ApprovalRule.tenant_id == tenant_uuid,
            )
        )
        if not rule:
            return False
        db.delete(rule)
        db.commit()
        return True

    @staticmethod
    def toggle_module_rules(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        document_type: str,
        is_active: bool,
    ) -> int:
        """Toggles `is_active` for all approval rules of a specific module/document_type."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        rules = db.scalars(
            select(ApprovalRule).where(
                ApprovalRule.tenant_id == tenant_uuid,
                ApprovalRule.document_type == document_type.upper().strip(),
            )
        ).all()
        for rule in rules:
            rule.is_active = bool(is_active)
        db.commit()
        return len(rules)

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
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        doc_uuid = WorkflowEngineService._to_uuid(doc_id)
        cost_center_uuid = WorkflowEngineService._to_uuid(cost_center_id) if cost_center_id else None
        amount_decimal = Decimal(str(total_amount or 0))
        normalized_doc_type = doc_type.upper().strip()

        # Ensure tenant has default approval matrix rules seeded if none exist at all
        has_any_rule = db.scalar(
            select(ApprovalRule.id).where(ApprovalRule.tenant_id == tenant_uuid).limit(1)
        )
        if not has_any_rule:
            WorkflowEngineService.seed_default_rules(db, tenant_uuid)

        # 1. Select active matching rules sorted by execution sequence order
        conditions = [
            ApprovalRule.tenant_id == tenant_uuid,
            ApprovalRule.document_type == normalized_doc_type,
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

        first_step_seq = rules[0].sequence_order if rules else 1

        # 2. Build live instance tracking parent header record
        instance = WorkflowInstance(
            tenant_id=tenant_uuid,
            document_type=normalized_doc_type,
            document_id=doc_uuid,
            status="PENDING",
            current_step=first_step_seq,
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

        WorkflowEngineService._record_audit_log(
            db=db,
            tenant_id=tenant_uuid,
            actor_id=None,
            action="WORKFLOW_INITIALIZED",
            target_ref=f"{normalized_doc_type}/{doc_uuid}",
            remarks=f"Intercepted {normalized_doc_type} (Amount: {amount_decimal} SAR) -> PENDING_APPROVAL ({len(rules)} steps)",
        )

        db.commit()
        db.refresh(instance)
        return instance.id

    @staticmethod
    def is_document_pending_approval(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        doc_type: str,
        doc_id: Union[str, uuid.UUID],
    ) -> bool:
        """Returns True if the document has an unapproved or rejected workflow instance blocking execution."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        doc_uuid = WorkflowEngineService._to_uuid(doc_id)
        instance = db.scalar(
            select(WorkflowInstance)
            .where(
                WorkflowInstance.tenant_id == tenant_uuid,
                WorkflowInstance.document_type == doc_type.upper().strip(),
                WorkflowInstance.document_id == doc_uuid,
            )
            .order_by(desc(WorkflowInstance.created_at))
        )
        if not instance:
            return False
        return instance.status in ("PENDING", "PENDING_APPROVAL", "ESCALATED", "REJECTED")

    @staticmethod
    def approve_step(
        db: Session,
        step_id: Union[str, uuid.UUID],
        actioned_by: Union[str, uuid.UUID],
        remarks: Optional[str] = None,
        tenant_id: Optional[Union[str, uuid.UUID]] = None,
    ) -> WorkflowInstance:
        """
        Approves a specific workflow step with optional audit remarks.
        Advances workflow or marks instance APPROVED if all steps complete.
        """
        if tenant_id:
            WorkflowEngineService._set_rls_context(db, tenant_id)

        step_uuid = WorkflowEngineService._to_uuid(step_id)
        user_uuid = WorkflowEngineService._to_uuid(actioned_by)

        step = db.execute(select(WorkflowStep).where(WorkflowStep.id == step_uuid)).scalar_one_or_none()
        if not step:
            raise ValueError(f"Workflow step {step_id} not found")

        instance = db.execute(
            select(WorkflowInstance).where(WorkflowInstance.id == step.instance_id)
        ).scalar_one_or_none()
        if not instance:
            raise ValueError("Parent workflow instance not found")

        if tenant_id and instance.tenant_id != WorkflowEngineService._to_uuid(tenant_id):
            raise PermissionError("Cross-tenant approval access denied")

        if instance.status not in ("PENDING", "PENDING_APPROVAL", "ESCALATED"):
            raise ValueError(f"Workflow instance is already {instance.status}")

        step.status = "APPROVED"
        step.actioned_by = user_uuid
        step.actioned_at = datetime.now(timezone.utc)
        if remarks:
            step.rejection_reason = str(remarks)[:255]

        # Check remaining steps in this instance
        all_steps = db.execute(
            select(WorkflowStep)
            .where(WorkflowStep.instance_id == instance.id)
            .order_by(WorkflowStep.sequence_order)
        ).scalars().all()

        pending_steps = [s for s in all_steps if s.status == "PENDING"]
        if not pending_steps:
            instance.status = "APPROVED"
            WorkflowEngineService._sync_target_document_status(db, instance, "APPROVED")
        else:
            instance.status = "PENDING"
            instance.current_step = pending_steps[0].sequence_order

        WorkflowEngineService._record_audit_log(
            db=db,
            tenant_id=instance.tenant_id,
            actor_id=user_uuid,
            action="WORKFLOW_STEP_APPROVED",
            target_ref=f"{instance.document_type}/{instance.document_id}/step-{step.sequence_order}",
            remarks=remarks or f"Step {step.sequence_order} ({step.assigned_role_code}) approved. Instance status: {instance.status}",
        )

        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def reject_step(
        db: Session,
        step_id: Union[str, uuid.UUID],
        actioned_by: Union[str, uuid.UUID],
        rejection_reason: str,
        tenant_id: Optional[Union[str, uuid.UUID]] = None,
    ) -> WorkflowInstance:
        """
        Rejects a specific workflow step, immediately transitioning the parent instance to REJECTED.
        """
        if tenant_id:
            WorkflowEngineService._set_rls_context(db, tenant_id)

        step_uuid = WorkflowEngineService._to_uuid(step_id)
        user_uuid = WorkflowEngineService._to_uuid(actioned_by)

        step = db.execute(select(WorkflowStep).where(WorkflowStep.id == step_uuid)).scalar_one_or_none()
        if not step:
            raise ValueError(f"Workflow step {step_id} not found")

        instance = db.execute(
            select(WorkflowInstance).where(WorkflowInstance.id == step.instance_id)
        ).scalar_one_or_none()
        if not instance:
            raise ValueError("Parent workflow instance not found")

        if tenant_id and instance.tenant_id != WorkflowEngineService._to_uuid(tenant_id):
            raise PermissionError("Cross-tenant rejection access denied")

        step.status = "REJECTED"
        step.actioned_by = user_uuid
        step.actioned_at = datetime.now(timezone.utc)
        step.rejection_reason = str(rejection_reason)[:255]

        instance.status = "REJECTED"
        WorkflowEngineService._sync_target_document_status(db, instance, "REJECTED")

        WorkflowEngineService._record_audit_log(
            db=db,
            tenant_id=instance.tenant_id,
            actor_id=user_uuid,
            action="WORKFLOW_STEP_REJECTED",
            target_ref=f"{instance.document_type}/{instance.document_id}/step-{step.sequence_order}",
            remarks=rejection_reason,
        )

        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def escalate_step(
        db: Session,
        step_id: Union[str, uuid.UUID],
        actioned_by: Union[str, uuid.UUID],
        escalated_to_role: str = "CEO",
        reason: Optional[str] = None,
        tenant_id: Optional[Union[str, uuid.UUID]] = None,
    ) -> WorkflowInstance:
        """
        Escalates a pending workflow step to a higher authority role (e.g., COO / CEO / Owner),
        recording who escalated, timestamp, and escalation remarks in the audit trail.
        """
        if tenant_id:
            WorkflowEngineService._set_rls_context(db, tenant_id)

        step_uuid = WorkflowEngineService._to_uuid(step_id)
        user_uuid = WorkflowEngineService._to_uuid(actioned_by)
        target_role = (escalated_to_role or "CEO").strip().upper()

        step = db.execute(select(WorkflowStep).where(WorkflowStep.id == step_uuid)).scalar_one_or_none()
        if not step:
            raise ValueError(f"Workflow step {step_id} not found")

        instance = db.execute(
            select(WorkflowInstance).where(WorkflowInstance.id == step.instance_id)
        ).scalar_one_or_none()
        if not instance:
            raise ValueError("Parent workflow instance not found")

        if tenant_id and instance.tenant_id != WorkflowEngineService._to_uuid(tenant_id):
            raise PermissionError("Cross-tenant escalation access denied")

        if instance.status not in ("PENDING", "PENDING_APPROVAL", "ESCALATED"):
            raise ValueError(f"Cannot escalate workflow in {instance.status} status")

        escalation_note = f"[ESCALATED -> {target_role}] {reason or 'Escalated for executive sign-off'}"[:255]
        step.status = "ESCALATED"
        step.actioned_by = user_uuid
        step.actioned_at = datetime.now(timezone.utc)
        step.rejection_reason = escalation_note

        # Shift any existing subsequent pending steps up by 1 to insert escalated step cleanly
        subsequent_steps = db.scalars(
            select(WorkflowStep)
            .where(
                WorkflowStep.instance_id == instance.id,
                WorkflowStep.sequence_order > step.sequence_order,
            )
            .order_by(desc(WorkflowStep.sequence_order))
        ).all()
        for sub_step in subsequent_steps:
            sub_step.sequence_order += 1

        new_seq = step.sequence_order + 1
        escalated_step = WorkflowStep(
            id=uuid.uuid4(),
            instance_id=instance.id,
            sequence_order=new_seq,
            assigned_role_code=target_role,
            status="PENDING",
        )
        db.add(escalated_step)

        instance.current_step = new_seq
        instance.status = "PENDING"

        WorkflowEngineService._record_audit_log(
            db=db,
            tenant_id=instance.tenant_id,
            actor_id=user_uuid,
            action="WORKFLOW_STEP_ESCALATED",
            target_ref=f"{instance.document_type}/{instance.document_id}/step-{step.sequence_order}",
            remarks=escalation_note,
        )

        db.commit()
        db.refresh(instance)
        return instance

    @staticmethod
    def get_pending_queue(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        role_codes: Optional[List[str]] = None,
        include_history: bool = False,
    ) -> List[dict]:
        """Fetches pending approval queue items filtered by tenant and active roles."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)

        if not include_history:
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
                all_steps = db.scalars(
                    select(WorkflowStep)
                    .where(WorkflowStep.instance_id == instance.id)
                    .order_by(WorkflowStep.sequence_order)
                ).all()
                queue_items.append({
                    "step_id": str(step.id),
                    "instance_id": str(instance.id),
                    "document_type": instance.document_type,
                    "document_id": str(instance.document_id),
                    "sequence_order": step.sequence_order,
                    "required_role": step.assigned_role_code,
                    "status": instance.status,
                    "created_at": instance.created_at.isoformat() if instance.created_at else datetime.utcnow().isoformat(),
                    "steps": [
                        {
                            "step_id": str(s.id),
                            "sequence_order": s.sequence_order,
                            "assigned_role_code": s.assigned_role_code,
                            "status": s.status,
                            "actioned_by": str(s.actioned_by) if s.actioned_by else None,
                            "actioned_at": s.actioned_at.isoformat() if s.actioned_at else None,
                            "remarks": s.rejection_reason,
                        }
                        for s in all_steps
                    ],
                })
            return queue_items

        # When include_history=True, return all workflow instances for the tenant
        instances = db.scalars(
            select(WorkflowInstance)
            .where(WorkflowInstance.tenant_id == tenant_uuid)
            .order_by(desc(WorkflowInstance.created_at))
        ).all()
        items = []
        for instance in instances:
            all_steps = db.scalars(
                select(WorkflowStep)
                .where(WorkflowStep.instance_id == instance.id)
                .order_by(WorkflowStep.sequence_order)
            ).all()
            active_step = next(
                (s for s in all_steps if s.sequence_order == instance.current_step and s.status == "PENDING"),
                all_steps[-1] if all_steps else None,
            )
            if not active_step:
                continue
            items.append({
                "step_id": str(active_step.id),
                "instance_id": str(instance.id),
                "document_type": instance.document_type,
                "document_id": str(instance.document_id),
                "sequence_order": active_step.sequence_order,
                "required_role": active_step.assigned_role_code,
                "status": instance.status,
                "created_at": instance.created_at.isoformat() if instance.created_at else datetime.utcnow().isoformat(),
                "steps": [
                    {
                        "step_id": str(s.id),
                        "sequence_order": s.sequence_order,
                        "assigned_role_code": s.assigned_role_code,
                        "status": s.status,
                        "actioned_by": str(s.actioned_by) if s.actioned_by else None,
                        "actioned_at": s.actioned_at.isoformat() if s.actioned_at else None,
                        "remarks": s.rejection_reason,
                    }
                    for s in all_steps
                ],
            })
        return items

    @staticmethod
    def get_audit_trail(
        db: Session,
        tenant_id: Union[str, uuid.UUID],
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Returns chronological approval action history (who approved/rejected/escalated, timestamp, remarks)."""
        tenant_uuid = WorkflowEngineService._set_rls_context(db, tenant_id)
        stmt = (
            select(WorkflowStep, WorkflowInstance)
            .join(WorkflowInstance, WorkflowStep.instance_id == WorkflowInstance.id)
            .where(
                WorkflowInstance.tenant_id == tenant_uuid,
                WorkflowStep.status.in_(["APPROVED", "REJECTED", "ESCALATED"]),
            )
            .order_by(desc(WorkflowStep.actioned_at))
            .limit(limit)
        )
        rows = db.execute(stmt).all()
        audit_entries: List[Dict[str, Any]] = []
        for step, instance in rows:
            audit_entries.append({
                "step_id": str(step.id),
                "instance_id": str(instance.id),
                "tenant_id": str(instance.tenant_id),
                "document_type": instance.document_type,
                "document_id": str(instance.document_id),
                "sequence_order": step.sequence_order,
                "assigned_role_code": step.assigned_role_code,
                "action": step.status,
                "instance_status": instance.status,
                "actioned_by": str(step.actioned_by) if step.actioned_by else None,
                "actioned_at": step.actioned_at.isoformat() if step.actioned_at else None,
                "remarks": step.rejection_reason,
            })
        return audit_entries
