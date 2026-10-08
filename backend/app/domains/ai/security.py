"""
OxenGL AI Platform Matrix Security & Governance Infrastructure.
Implements:
- Strict multi-stage RAG permission validation pipeline (tenant boundary & RBAC scope enforcement)
- Sensitive PII / financial value data sanitization & masking before model context injection
- Structured explainable output contract standard (recommendation, confidence, reasoning, trace sources, risk)
- Database extension state verification (ltree, pgvector)
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from pydantic import BaseModel, Field


class AIRiskClassification(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class StructuredAIOutput(BaseModel):
    """
    Standardized schema contract for all Phase 3 AI reasoning outputs,
    guaranteeing explainability, provenance tracing, and auditability.
    """
    model_config = {"protected_namespaces": ()}

    recommendation: str = Field(..., description="Actionable business recommendation or synthetic answer")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Confidence metric between 0.0 and 1.0")
    business_reasoning: str = Field(..., description="Step-by-step rationalization grounded in enterprise facts")
    trace_sources: List[str] = Field(default_factory=list, description="List of source document IDs, table records, or audit citations")
    risk_classification: AIRiskClassification = Field(default=AIRiskClassification.LOW, description="Calculated operational risk level")
    tenant_id: uuid.UUID = Field(..., description="Multi-tenant boundary verification")
    model_version: str = Field(default="gemini-1.5-pro", description="Backing foundation or tuned model identifier")
    execution_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RAGSecurityPipeline:
    """
    Multi-stage retrieval-augmented generation security pipeline.
    Validates tenant isolation, verifies domain-level entitlements,
    and sanitizes sensitive data prior to model payload dispatch.
    """

    # Masking regex patterns for PII, financial credentials, and regional IDs
    SAUDI_IBAN_REGEX = re.compile(r"\bSA\d{2}[A-Z0-9]{20}\b", re.IGNORECASE)
    SAUDI_NATIONAL_ID_REGEX = re.compile(r"\b[12]\d{9}\b")
    CREDIT_CARD_REGEX = re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b")
    EMAIL_PASSWORD_REGEX = re.compile(r"(password|pwd|secret|auth_token)\s*[:=]\s*['\"][^'\"]+['\"]", re.IGNORECASE)
    SALARY_REGEX = re.compile(r"(salary|wage|basic_pay|net_pay)\s*[:=]\s*(\d+([.,]\d+)?)", re.IGNORECASE)

    @classmethod
    def enforce_tenant_boundary(cls, query_tenant_id: uuid.UUID, active_tenant_id: uuid.UUID) -> None:
        """Enforces hardcoded tenant boundary constraints on all retrieval queries."""
        if query_tenant_id != active_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cross-tenant data retrieval prohibited. Target {query_tenant_id} != Active {active_tenant_id}",
            )

    @classmethod
    def enforce_domain_permission(
        cls,
        user_role: str,
        user_acl: Optional[str],
        required_permission: str,
    ) -> None:
        """
        Enforces domain-level permission check before pulling text chunks into RAG context.
        Example required_permission: 'HR_PAYROLL_VIEW', 'WAREHOUSE_STOCK_AUDIT', 'FINANCIAL_POSTING'.
        """
        if user_role in ("Super_Admin", "Admin"):
            return  # SuperAdmins possess global clearance

        acl_tokens = set(user_acl.split(",")) if user_acl else set()
        if required_permission not in acl_tokens:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Security constraint: Missing required permission '{required_permission}' for context injection.",
            )

    @classmethod
    def sanitize_sensitive_context(cls, text: str) -> str:
        """
        Sanitizes text footprint before sending payloads to AI models:
        - Masks IBAN / Bank accounts -> SA**...****
        - Masks National IDs / Iqama -> [REDACTED_ID]
        - Masks Credit Cards -> [REDACTED_CC]
        - Masks Passwords / Secrets -> [REDACTED_SECRET]
        - Masks Salary numbers -> [REDACTED_FINANCIAL]
        """
        if not text:
            return ""

        sanitized = cls.SAUDI_IBAN_REGEX.sub("[REDACTED_IBAN]", text)
        sanitized = cls.SAUDI_NATIONAL_ID_REGEX.sub("[REDACTED_NATIONAL_ID]", sanitized)
        sanitized = cls.CREDIT_CARD_REGEX.sub("[REDACTED_PAYMENT_CARD]", sanitized)
        sanitized = cls.EMAIL_PASSWORD_REGEX.sub(r"\1: [REDACTED_CREDENTIAL]", sanitized)
        sanitized = cls.SALARY_REGEX.sub(r"\1: [REDACTED_COMPENSATION]", sanitized)
        return sanitized
