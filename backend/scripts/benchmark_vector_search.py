import asyncio
import random
import uuid
from sqlalchemy import text, select
from backend.models import Company
from backend.database import SessionLocal as _BaseSessionLocal
from backend.app.domains.ai.models import AIKnowledgeDocument, AIKnowledgeChunk
from backend.app.security.abac import ABACUserContext


class AsyncSessionWrapper:
    """Async adapter wrapping synchronous SessionLocal for benchmark harness."""

    def __init__(self, session):
        self._session = session

    def add(self, instance):
        return self._session.add(instance)

    async def commit(self):
        return self._session.commit()

    async def execute(self, statement, params=None):
        if params is not None:
            p = dict(params)
            if "query_vector" in p and isinstance(p["query_vector"], list):
                p["query_vector"] = str(p["query_vector"])
            return self._session.execute(statement, p)
        return self._session.execute(statement)

    async def delete(self, instance):
        return self._session.delete(instance)

    def close(self):
        return self._session.close()

    def __getattr__(self, name):
        return getattr(self._session, name)


def SessionLocal():
    return AsyncSessionWrapper(_BaseSessionLocal())


async def seed_and_test_vectors():
    db = SessionLocal()
    # Dynamically acquire an existing tenant ID to satisfy fk_ai_knowledge_chunks_tenant
    tenant = await db.execute(select(Company.id).limit(1))
    tenant_id = tenant.scalar_one()
    doc_id = uuid.uuid4()

    # 1. Create mock document reference entry
    doc = AIKnowledgeDocument(
        id=doc_id,
        tenant_id=tenant_id,
        title="Enterprise Fuel Procurement Policy",
        document_type="POLICY",
    )
    db.add(doc)

    # 2. Inject high-dimensional vectors with random normal noise (1536 elements)
    mock_vector = [random.uniform(-0.1, 0.1) for _ in range(1536)]
    chunk = AIKnowledgeChunk(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        document_id=doc_id,
        content="Section 4.1: Maximum threshold for localized bulk diesel expenditures is set to $10,000.",
        embedding=mock_vector,
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
    await db.delete(chunk)
    await db.delete(doc)
    await db.commit()
    db.close()


if __name__ == "__main__":
    asyncio.run(seed_and_test_vectors())
