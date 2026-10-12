# OxenGL Phase 3 AI Vector Search Simulation & Benchmark Spec
**Objective:** Programmatic validation of pgvector Cosine Distance lookups. Seeds mock 1536-dimension data matrices and verifies multi-tenant retrieval safety under load.

---

## VECTOR SEED & LOOKUP SIMULATOR (`scripts/benchmark_vector_search.py`)
```python
import asyncio, uuid, random
from sqlalchemy import text
from backend.database import SessionLocal
from backend.app.domains.ai.models import AIKnowledgeDocument, AIKnowledgeChunk
from backend.app.security.abac import ABACUserContext

async def seed_and_test_vectors():
    db = SessionLocal()
    tenant_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    
    # 1. Create mock document reference entry
    doc = AIKnowledgeDocument(
        id=doc_id, tenant_id=tenant_id, title="Enterprise Fuel Procurement Policy", document_type="POLICY"
    )
    db.add(doc)
    
    # 2. Inject high-dimensional vectors with random normal noise (1536 elements)
    mock_vector = [random.uniform(-0.1, 0.1) for _ in range(1536)]
    chunk = AIKnowledgeChunk(
        id=uuid.uuid4(), tenant_id=tenant_id, document_id=doc_id,
        content="Section 4.1: Maximum threshold for localized bulk diesel expenditures is set to \$10,000.",
        embedding=mock_vector
    )
    db.add(chunk)
    await db.commit()
    
    # 3. Benchmark similarity search performance using the native cosine distance query
    start_time = asyncio.get_event_loop().time()
    stmt = text("""
        SELECT content, embedding <=> :query_vector AS distance 
        FROM ai_knowledge_chunks 
        WHERE tenant_id = :tenant_id 
        ORDER BY distance LIMIT 1;
    """)
    res = await db.execute(stmt, {"query_vector": mock_vector, "tenant_id": tenant_id})
    record = res.fetchone()
    duration = (asyncio.get_event_loop().time() - start_time) * 1000
    
    print(f"\n[AI BENCHMARK] Match Found: {record[0]}")
    print(f"[AI BENCHMARK] Calculated Distance: {record[1]:.6f}")
    print(f"[AI BENCHMARK] pgvector Query Latency: {duration:.2f} ms")
    
    # Clean up trace elements
    await db.delete(chunk); await db.delete(doc); await db.commit(); db.close()

if __name__ == "__main__":
    asyncio.run(seed_and_test_vectors())
```

# Instructions
Read and parse the vector search benchmark tasks detailed at `docs/blueprints/phase3_vector_benchmark.md`.

# Sub-Tasks
1. Write the Python code block into a new standalone tool script file at `scripts/benchmark_vector_search.py`.
2. Open an active environment terminal loop and execute the simulator script:
   `PYTHONPATH=.:backend backend/.venv/bin/python scripts/benchmark_vector_search.py`

Print the returned context match strings and the direct pgvector query latency metrics.
