"""
OxenGL AI Matrix Domain Models.
Implements vector storage models with pgvector spatial column extensions for RAG semantic search.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, TEXT, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from backend.database import Base


class AIKnowledgeDocument(Base):
    """Stores master document metadata references (Policies, Contracts, ERP Manuals)."""
    __tablename__ = "ai_knowledge_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'POLICY', 'CONTRACT', 'MANUAL'
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    chunks: Mapped[List["AIKnowledgeChunk"]] = relationship("AIKnowledgeChunk", back_populates="document", cascade="all, delete-orphan")


class AIKnowledgeChunk(Base):
    """Stores tokenized raw text boundaries alongside high-dimensional vector embeddings."""
    __tablename__ = "ai_knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("res_companies.id", ondelete="CASCADE"), index=True, nullable=False)
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_knowledge_documents.id", ondelete="CASCADE"), nullable=True)

    content: Mapped[str] = mapped_column(TEXT, nullable=False)
    # 1536 Dimensions corresponds directly to standard OpenAI text-embedding-3-small specifications
    embedding: Mapped[List[float]] = mapped_column(Vector(1536), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)

    document: Mapped[Optional["AIKnowledgeDocument"]] = relationship("AIKnowledgeDocument", back_populates="chunks")


# Compatibility alias
AiKnowledgeChunk = AIKnowledgeChunk
