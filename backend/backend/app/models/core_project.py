from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from backend.database import Base

class CoreProject(Base):
    __tablename__ = "core_projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    tenant_id = Column(UUID(as_uuid=True), index=True, nullable=False) # Multi-tenant isolation anchor
    project_code = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Project Taxonomy: Logistics, EPC, Humanitarian, Fuel, Construction
    project_type = Column(String(50), nullable=False, index=True)
    
    # Lifecycle status: planning, active, suspended, completed, archived
    status = Column(String(32), default="planning", nullable=False, index=True)
    
    # Schema-flexible metadata for dynamic project specifications
    metadata_json = Column(JSONB, default=dict, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index("ix_core_projects_tenant_type", "tenant_id", "project_type"),
        CheckConstraint(
            "project_type IN ('logistics', 'epc', 'humanitarian', 'fuel', 'construction')",
            name="chk_valid_project_type"
        ),
    )