"""
AI Safety Boundary Engine & Governance Sandbox (Phase 9 - Part 1).
Enforces deterministic guardrails, schema validation, confidence thresholds,
and cryptographic Human-In-The-Loop (HITL) approval gates before executing OLTP mutations.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Tuple

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import models
from backend.schemas import AccountMoveCreate

logger = logging.getLogger(__name__)

AI_GOVERNANCE_SECRET = os.getenv(
    "AI_GOVERNANCE_SECRET_KEY",
    "oxengl-ai-governance-secret-key-salt-2026-phase9",
)

# Thresholds
HIGH_VALUE_THRESHOLD = Decimal("10000.00")
LOW_CONFIDENCE_THRESHOLD = Decimal("0.6000")
AUTO_APPROVE_CONFIDENCE_THRESHOLD = Decimal("0.8500")


class SafetyBoundaryEngine:
    """
    Evaluates AI suggestions against deterministic schemas and enterprise risk policies.
    Guarantees that no unverified or high-risk proposal can write to the OLTP database.
    """

    def __init__(self, secret_key: str = AI_GOVERNANCE_SECRET):
        self.secret_key = secret_key.encode("utf-8")

    def generate_prompt_hash(self, prompt_text: str) -> str:
        """Computes SHA-256 hash of the input prompt/context."""
        return hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()

    def generate_hitl_token(self, log_id: uuid.UUID, company_id: uuid.UUID, payload_hash: str) -> str:
        """Generates a tamper-proof HMAC-SHA256 signature required to approve a HITL proposal."""
        message = f"{log_id}:{company_id}:{payload_hash}"
        return hmac.new(self.secret_key, message.encode("utf-8"), hashlib.sha256).hexdigest()

    def verify_hitl_token(self, token: str, log: models.AIGovernanceLog) -> bool:
        """Validates that the presented HITL approval token is cryptographically authentic."""
        if not token or not log.hitl_approval_token:
            return False
        return hmac.compare_digest(token, log.hitl_approval_token)

    def validate_proposal(
        self,
        company_id: uuid.UUID,
        agent_name: str,
        action_type: str,
        proposal_payload: dict[str, Any] | str,
        confidence_score: Decimal | float,
        prompt: str = "",
        user_id: uuid.UUID | None = None,
        model_config_id: uuid.UUID | None = None,
        tokens_used: int = 0,
        db: Session | None = None,
    ) -> models.AIGovernanceLog:
        """
        Validates an AI proposal against deterministic safety rules and records the decision.
        """
        if isinstance(proposal_payload, str):
            payload_str = proposal_payload
            try:
                payload_dict = json.loads(proposal_payload)
            except Exception:
                payload_dict = {}
        else:
            payload_dict = proposal_payload
            payload_str = json.dumps(proposal_payload, default=str)

        conf_decimal = Decimal(str(confidence_score))
        prompt_hash = self.generate_prompt_hash(prompt or payload_str)
        payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        # Initialize governance evaluation
        validation_errors: list[str] = []
        risk_level = "LOW"
        safety_status = "PASSED"
        hitl_required = False
        execution_status = "PROPOSED"

        # 1. Low Confidence Guardrail (< 0.60 = Instant Block)
        if conf_decimal < LOW_CONFIDENCE_THRESHOLD:
            validation_errors.append(
                f"Confidence score {conf_decimal} is below minimum safety threshold {LOW_CONFIDENCE_THRESHOLD}. Proposal immediately blocked."
            )
            safety_status = "BLOCKED"
            risk_level = "CRITICAL"
            execution_status = "BLOCKED"

        # 2. Action-Specific Deterministic Validation
        elif action_type in ("POST_ACCOUNT_MOVE", "CREATE_JOURNAL_ENTRY"):
            total_amount, errs = self._validate_account_move(payload_dict, company_id)
            if errs:
                validation_errors.extend(errs)
                safety_status = "BLOCKED"
                risk_level = "HIGH"
                execution_status = "BLOCKED"
            else:
                # Value threshold check
                if total_amount > HIGH_VALUE_THRESHOLD:
                    risk_level = "HIGH"
                    hitl_required = True
                    safety_status = "PENDING_APPROVAL"
                elif conf_decimal < AUTO_APPROVE_CONFIDENCE_THRESHOLD:
                    risk_level = "MEDIUM"
                    hitl_required = True
                    safety_status = "PENDING_APPROVAL"
                else:
                    risk_level = "LOW"
                    safety_status = "PASSED"
                    execution_status = "APPROVED"

        elif action_type in ("ADJUST_STOCK", "POST_STOCK_MOVEMENT"):
            qty, errs = self._validate_stock_movement(payload_dict)
            if errs:
                validation_errors.extend(errs)
                safety_status = "BLOCKED"
                risk_level = "HIGH"
                execution_status = "BLOCKED"
            else:
                if qty > Decimal("100.00") or conf_decimal < AUTO_APPROVE_CONFIDENCE_THRESHOLD:
                    risk_level = "MEDIUM"
                    hitl_required = True
                    safety_status = "PENDING_APPROVAL"
                else:
                    risk_level = "LOW"
                    safety_status = "PASSED"
                    execution_status = "APPROVED"

        else:
            # Generic action check
            if conf_decimal < AUTO_APPROVE_CONFIDENCE_THRESHOLD:
                hitl_required = True
                safety_status = "PENDING_APPROVAL"
                risk_level = "MEDIUM"
            else:
                safety_status = "PASSED"
                risk_level = "LOW"
                execution_status = "APPROVED"

        # Create Governance Log
        log_id = uuid.uuid4()
        approval_token = None
        if hitl_required and safety_status != "BLOCKED":
            approval_token = self.generate_hitl_token(log_id, company_id, payload_hash)

        err_text = "; ".join(validation_errors) if validation_errors else None

        gov_log = models.AIGovernanceLog(
            id=log_id,
            company_id=company_id,
            user_id=user_id,
            model_config_id=model_config_id,
            agent_name=agent_name,
            prompt_hash=prompt_hash,
            prompt_tokens=tokens_used // 2,
            completion_tokens=tokens_used // 2,
            total_tokens=tokens_used,
            confidence_score=conf_decimal,
            safety_validation_status=safety_status,
            risk_level=risk_level,
            action_type=action_type,
            proposal_payload=payload_str,
            validation_errors=err_text,
            hitl_required=hitl_required,
            hitl_approved=False,
            hitl_approval_token=approval_token,
            execution_status=execution_status,
        )

        if db is not None:
            db.add(gov_log)
            db.commit()
            db.refresh(gov_log)

        return gov_log

    def approve_hitl_proposal(
        self,
        log_id: uuid.UUID,
        approver_user: models.ResUser,
        approval_token: str,
        db: Session,
    ) -> models.AIGovernanceLog:
        """
        Human-In-The-Loop approval gate for flagged or high-risk proposals.
        Validates token integrity and approver authority before promoting proposal to APPROVED.
        """
        log = db.get(models.AIGovernanceLog, log_id)
        if not log:
            raise ValueError("AI Governance log record not found")

        # Tenant isolation check
        if approver_user.role != "Super_Admin" and log.company_id != approver_user.company_id:
            raise PermissionError("Cross-tenant HITL approval is strictly forbidden")

        # Role check
        if approver_user.role not in {"Super_Admin", "Admin", "Accountant"}:
            raise PermissionError("User does not have sufficient privileges to approve AI proposals")

        if log.safety_validation_status == "BLOCKED":
            raise ValueError("Blocked proposals cannot be approved via HITL; safety invariant violated")

        if not self.verify_hitl_token(approval_token, log):
            raise ValueError("Invalid or tampered HITL approval token")

        log.hitl_approved = True
        log.hitl_approved_by = approver_user.id
        log.hitl_approved_at = datetime.now(timezone.utc)
        log.safety_validation_status = "PASSED"
        log.execution_status = "APPROVED"

        db.commit()
        db.refresh(log)
        return log

    def execute_approved_proposal(
        self,
        log_id: uuid.UUID,
        executing_user: models.ResUser,
        db: Session,
    ) -> dict[str, Any]:
        """
        Executes an approved AI proposal against the OLTP database tables.
        Guarantees that unapproved or blocked proposals can never mutate production tables.
        """
        log = db.get(models.AIGovernanceLog, log_id)
        if not log:
            raise ValueError("AI Governance log record not found")

        # Tenant isolation check
        if executing_user.role != "Super_Admin" and log.company_id != executing_user.company_id:
            raise PermissionError("Cross-tenant execution attempt blocked")

        if log.execution_status != "APPROVED":
            raise ValueError(
                f"Proposal execution denied: Current status is '{log.execution_status}', expected 'APPROVED'"
            )

        if log.hitl_required and not log.hitl_approved:
            raise ValueError("Proposal requires Human-In-The-Loop approval prior to database mutation")

        payload = json.loads(log.proposal_payload)
        result_details: dict[str, Any] = {}

        # Perform the actual OLTP mutation
        if log.action_type in ("POST_ACCOUNT_MOVE", "CREATE_JOURNAL_ENTRY"):
            move = self._execute_account_move(payload, log.company_id, db)
            result_details = {"entity": "AccountMove", "id": str(move.id), "name": move.name}

        elif log.action_type in ("ADJUST_STOCK", "POST_STOCK_MOVEMENT"):
            movement = self._execute_stock_movement(payload, log.company_id, db)
            result_details = {"entity": "StockMovement", "id": str(movement.id)}

        else:
            result_details = {"entity": "GenericAction", "status": "executed", "payload": payload}

        log.execution_status = "EXECUTED"
        log.executed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(log)

        return result_details

    # --------------------------------------------------------------------------
    # Private Validation & Execution Helpers
    # --------------------------------------------------------------------------

    def _validate_account_move(self, payload: dict[str, Any], company_id: uuid.UUID) -> Tuple[Decimal, list[str]]:
        """Deterministic schema & balance validation for GL account moves."""
        errors: list[str] = []
        total_amount = Decimal("0")

        lines = payload.get("lines")
        if not lines or not isinstance(lines, list):
            errors.append("AccountMove must contain a non-empty 'lines' list")
            return total_amount, errors

        total_debit = Decimal("0")
        total_credit = Decimal("0")

        for idx, line in enumerate(lines):
            try:
                deb = Decimal(str(line.get("debit", 0)))
                crd = Decimal(str(line.get("credit", 0)))
            except Exception:
                errors.append(f"Line {idx} amounts must be valid decimal numbers")
                continue

            if deb < 0 or crd < 0:
                errors.append(f"Line {idx} amounts cannot be negative")
            if deb > 0 and crd > 0:
                errors.append(f"Line {idx} cannot have both debit and credit amounts")

            total_debit += deb
            total_credit += crd

        if abs(total_debit - total_credit) > Decimal("0.0001"):
            errors.append(
                f"Double-entry balance violation (BR-001): total debits ({total_debit}) must equal total credits ({total_credit})"
            )

        if total_debit == Decimal("0"):
            errors.append("AccountMove total value cannot be zero")

        total_amount = total_debit
        return total_amount, errors

    def _validate_stock_movement(self, payload: dict[str, Any]) -> Tuple[Decimal, list[str]]:
        """Deterministic validation for inventory movements."""
        errors: list[str] = []
        try:
            qty = Decimal(str(payload.get("quantity", 0)))
        except Exception:
            return Decimal("0"), ["Movement quantity must be a valid number"]

        if qty <= Decimal("0"):
            errors.append("Movement quantity must be strictly positive")

        return qty, errors

    def _execute_account_move(self, payload: dict[str, Any], company_id: uuid.UUID, db: Session) -> models.AccountMove:
        """Performs OLTP insertion of verified AccountMove and AccountMoveLines."""
        move = models.AccountMove(
            company_id=company_id,
            journal_id=uuid.UUID(payload["journal_id"]) if payload.get("journal_id") else None,
            name=payload.get("name") or f"AI-MOV-{uuid.uuid4().hex[:8].upper()}",
            move_type=payload.get("move_type", "entry"),
            state="posted",
            ref=payload.get("ref", "AI Governance Agent Approved Entry"),
            date=datetime.now(timezone.utc),
            posted_at=datetime.now(timezone.utc),
        )
        db.add(move)
        db.flush()

        for line_data in payload.get("lines", []):
            line = models.AccountMoveLine(
                company_id=company_id,
                move_id=move.id,
                account_id=uuid.UUID(line_data["account_id"]),
                name=line_data.get("name", "AI Approved Move Line"),
                debit=Decimal(str(line_data.get("debit", 0))),
                credit=Decimal(str(line_data.get("credit", 0))),
            )
            db.add(line)

        db.flush()
        return move

    def _execute_stock_movement(self, payload: dict[str, Any], company_id: uuid.UUID, db: Session) -> models.StockMovement:
        """Performs OLTP insertion of verified StockMovement."""
        movement = models.StockMovement(
            company_id=company_id,
            stock_item_id=uuid.UUID(payload["stock_item_id"]),
            warehouse_id=uuid.UUID(payload["warehouse_id"]),
            movement_type=payload.get("movement_type", "ADJUSTMENT"),
            quantity=Decimal(str(payload.get("quantity", 0))),
            unit_cost=Decimal(str(payload.get("unit_cost", 0))),
            total_cost=Decimal(str(payload.get("total_cost", 0))),
            reference=payload.get("reference", "AI Stock Adjustment"),
        )
        db.add(movement)
        db.flush()
        return movement


ai_governance_engine = SafetyBoundaryEngine()
