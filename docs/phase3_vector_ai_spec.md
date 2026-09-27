# OxenGL Enterprise Platform Specification Sheet
## Phase 3: Vector AI Engine & Predictive Inventory Forecasting Matrix

---

## 1. Architectural Objective
Phase 3 transitions the OxenGL Enterprise platform into a data-intelligent engine. It deploys a native 1536-dimensional vector embedding database tier directly within the PostgreSQL monolith (`pgvector`) to feed the **Explainable AI Copilot conversational engine** (`AiCopilotView.tsx`) and hooks up **least-squares linear regression model arrays** to draw real-time inventory runway curves inside the **Global Panoramic Cockpit** (`DashboardView.tsx`).

---

## 2. Database Topology & Migration Schema (`pgvector`)

### A. Core Vector Ingestion Model
To provide scalable semantic context search blocks, the system leverages 1536-dimensional floating-point array matrices (matching the default `text-embedding-3-small` vector footprints).

### B. Relational SQL Migration Footprint
```sql
-- 1. Activate the native pgvector processing extension inside the engine mesh
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Provision isolated data-intelligent knowledge block tables
CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- 1536-dimensional float array block
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES res_companies(id) ON DELETE CASCADE
);

-- 3. Deploy high-performance HNSW vector search indexing to keep queries sub-millisecond
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_vector 
ON ai_knowledge_chunks 
USING hnsw (embedding vector_l2_ops) 
WITH (m = 16, ef_construction = 64);
```

---

## 3. Backend Similarity Engine (`POST /api/v1/ai/copilot/query`)

### A. FastAPI Request / Response Schema
- **Inbound Envelope:** `CopilotQueryRequest(prompt: str, top_k: int = 5)`
- **Outbound Envelope:** `StructuredAIOutput(recommendation: str, confidence_score: float, business_reasoning: str, data_sources: list, risk_classification: str)`

### B. Core Similarity Engine Logic (SQLAlchemy / pgvector)
The API handler translates the user's plain-text input prompt into an embedding vector, queries the database using L2 distance (`<->` operator) or cosine distance metrics, builds an optimized semantic context block, and fires an explainable analysis matrix back to the client interface:
```python
# Core vector distance matching algorithm loop
query_vector = generate_openai_embedding(request.prompt)
matched_chunks = session.query(AiKnowledgeChunk)\
    .filter(AiKnowledgeChunk.tenant_id == active_tenant_id)\
    .order_by(AiKnowledgeChunk.embedding.l2_distance(query_vector))\
    .limit(request.top_k)\
    .all()
```

---

## 4. Frontend Least-Squares Linear Regression System (`DashboardView.tsx`)

### A. Ingestion Dataset Contracts
When the endpoint `/api/v1/ai/forecasting/inventory` transitions from `INSUFFICIENT_DATA` into `DATA_SYNCHRONIZED`, it streams a floating-point calculation dictionary matrix:
```json
{
  "status": "DATA_SYNCHRONIZED",
  "current_value": 45000.00,
  "projected_value_30d": 38400.00,
  "calculated_slope": -220.00,
  "confidence_metric": 0.94
}
```

### B. Inline SVG Trend Line Mathematics
The cockpit views parse these numerical metrics to dynamically overlay a least-squares slope path ($y = mx + b$) using hardware-accelerated SVG elements:
- **Slope Parameter ($m$):** `calculated_slope` (Runway exhaust vector velocity)
- **Intercept Parameter ($b$):** `current_value` (Current physical asset count value)
- **Time Window Matrix ($x$):** Flexible 7-day, 30-day, or 90-day analytics toggle selector array.

---

## 5. Verification & Strict Build Policy
To pass Phase 3 compliance, the workspace layout must fulfill the following quality gates:
1. **0 TypeScript Errors:** `cd frontend && npx tsc --noEmit` must exit with code `0`.
2. **Sub-Millisecond Vector SLA:** Vector similarity lookup metrics must resolve under **15 milliseconds** per vector lookup query.
3. **Flawless Monolith Parity:** `python3 scripts/migration_sanity_check.py` must return 0 blocking path defects.
