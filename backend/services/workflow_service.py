"""
OxenGL Multi-Level Approval Matrix Workflow Engine Service.
Re-exports from backend.app.services.workflow_service for unified import compatibility.
"""

from backend.app.services.workflow_service import (
    SUPPORTED_APPROVAL_MODULES,
    DEFAULT_MATRIX_RULES,
    WorkflowEngineService,
)

__all__ = [
    "SUPPORTED_APPROVAL_MODULES",
    "DEFAULT_MATRIX_RULES",
    "WorkflowEngineService",
]
