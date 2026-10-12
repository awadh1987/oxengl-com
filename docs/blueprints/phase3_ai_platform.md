# OxenGL Phase 3 Blueprint: Enterprise pgvector & RAG Architecture
**Target Role:** Principal AI Engineer, Chief Data Scientist, Core Platform Architect
**Objective:** Deploy the embedded semantic data models, document chunk extraction services, and secure Retrieval-Augmented Generation (RAG) loops required to power the Executive Agent and Chat Copilot.

---

## 1. RAG SECURITY & RETRIEVAL WORKFLOW
To protect company data, vector search execution queries must perform multi-stage security filtering *before* any text chunk contexts are forwarded to the LLM reasoning core:
[ User Prompt Input ] ──► [ Generate Embeddings ] ──► [ SQL: Filter Active tenant_id & ABAC ]│▼[ Explainable JSON Output ] ◄── [ LLM Context Analysis ] ◄── [ pgvector Cosine Distance Search ]
---

## 2. RELATIONAL VECTOR SCHEMAS (`backend/app/domains/ai/models.py`)

Register the vector storage tables using SQLAlchemy 2.0 type mapping standards and **`pgvector` spatial column extensions**:

```python
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, TEXT, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector  # High-performance pgvector integration
from app.db.base import Base

class AIKnowledgeDocument(Base):
    """Stores master document metadata references (Policies, Contracts, ERP Manuals)."""
    __tablename__ = "ai_knowledge_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False) # 'POLICY', 'CONTRACT', 'MANUAL'
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class AIKnowledgeChunk(Base):
    """Stores tokenized raw text boundaries alongside high-dimensional vector embeddings."""
    __tablename__ = "ai_knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ai_knowledge_documents.id", ondelete="CASCADE"), nullable=False)
    
    content: Mapped[str] = mapped_column(TEXT, nullable=False)
    # 1536 Dimensions corresponds directly to standard OpenAI text-embedding-3-small specifications
    embedding: Mapped[List[float]] = mapped_column(Vector(1536), nullable=False)
```

---

## 3. VECTOR EXTENSION SEARCH ENGINE (`backend/app/domains/ai/services.py`)

Implement the asynchronous text search pipeline to perform semantic lookups while enforcing data privacy policies:

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pgvector.sqlalchemy import Vector
from app.domains.ai.models import AIKnowledgeChunk
from app.security.abac import ABACUserContext

class AIKnowledgeRetrievalService:
    @staticmethod
    async def semantic_search_context(
        db: AsyncSession, user: ABACUserContext, query_embedding: List[float], limit: int = 5
    ) -> List[str]:
        """Performs a pgvector cosine similarity search locked strictly within the user tenant box."""
        # Enforce non-negotiable multi-tenant boundary containment filters first
        stmt = (
            select(AIKnowledgeChunk.content)
            .where(AIKnowledgeChunk.tenant_id == user.tenant_id)
            # '<=>' operator represents Cosine Distance operation natively within pgvector
            .order_by(AIKnowledgeChunk.embedding.cosine_distance(query_embedding))
            .limit(limit)
        )
        
        res = await db.execute(stmt)
        chunks = res.scalars().all()
        return list(chunks)
```

---

## 4. EXECUTIVE COPILOT ENDPOINT MAPPING (`backend/app/api/v1/ai.py`)

Expose a secure, schema-enforced POST routing controller to handle NL queries from users:

```python
from fastapi import APIRouter, Depends, status, HTTPException
from pydantic import BaseModel, Field
from typing import List

router = APIRouter()

class CopilotQueryRequest(BaseModel):
    prompt: str = Field(..., example="Show current inventory risks or delayed fleet vectors.")

class StructuredAIOutput(BaseModel):
    recommendation: str
    confidence_score: float
    business_reasoning: str
    data_sources: List[str]
    risk_classification: str

@router.post("/copilot/query", response_model=StructuredAIOutput, status_code=status.HTTP_200_OK)
async def process_copilot_conversational_insight(payload: CopilotQueryRequest):
    """Processes Natural Language queries and yields an explainable enterprise recommendation blueprint."""
    # In production context: Embed text -> Search pgvector -> Build Context -> Forward to LLM
    return StructuredAIOutput(
        recommendation="Increase base Sulfur safety buffers by 200 MT at Warehouse North.",
        confidence_score=0.92,
        business_reasoning="Current consumption scales register a rolling 14% deviation spike against baseline assume levels.",
        data_sources=["public.stock_balances", "public.inventory_transactions"],
        risk_classification="Low"
    )
```
# Instructions
Read, parse, and execute the Phase 3 AI platform specifications detailed at `docs/blueprints/phase3_ai_platform.md`.

# Sub-Tasks
1. VECTOR MODELS: Create `backend/app/domains/ai/models.py` registering the `AIKnowledgeDocument` and `AIKnowledgeChunk` models. Wire `pgvector.sqlalchemy.Vector(1536)` mapping into the chunk table. Register both classes inside `backend/app/db/base.py`.
2. SERVICES: Create the semantic query engine inside `backend/app/domains/ai/services.py` incorporating the `.cosine_distance` lookup syntax wrapper.
3. ROUTES: Create `backend/app/api/v1/ai.py` exposing the `/copilot/query` endpoint with the strict `StructuredAIOutput` validation schema footprint. Include the `ai_router` prefix under `/api/v1/ai` in `backend/app/main.py`.
4. MIGRATION: Auto-generate and apply the layout database changes:
   `PYTHONPATH=. .venv/bin/alembic revision --autogenerate -m "deploy_oxengl_phase3_ai_vector_core" && PYTHONPATH=. .venv/bin/alembic upgrade head`
5. SANITY: Run `python3 scripts/migration_sanity_check.py` to confirm total path stability.
