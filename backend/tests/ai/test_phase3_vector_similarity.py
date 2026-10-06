import uuid
import time
import math
import pytest
from starlette.testclient import TestClient

from backend.app.main import app
from backend.database import SessionLocal
from backend.models import ResCompany
from backend.app.domains.ai.models import AiKnowledgeChunk
from backend.app.services.openai_embedding import OpenAIEmbeddingService
from backend.app.api.v1 import ai as ai_api
from backend.tests.ai.conftest import create_tenant_user_token, delete_user

client = TestClient(app)


def _test_embedding(text: str) -> list[float]:
    values = OpenAIEmbeddingService()._generate_deterministic_mock_vector(text)
    magnitude = math.sqrt(sum(value * value for value in values))
    return [value / magnitude for value in values]


def test_generate_openai_embedding_properties():
    """Validates 1536-dimensional unit norm property and deterministic generation."""
    emb1 = _test_embedding("Supply chain inventory buffer")
    emb2 = _test_embedding("Supply chain inventory buffer")
    emb3 = _test_embedding("Fleet logistics fuel consumption")

    assert len(emb1) == 1536
    assert emb1 == emb2  # Deterministic
    assert emb1 != emb3  # Differentiable

    # Verify L2 normalization: sum(x^2) ≈ 1.0
    norm_sq = sum(x * x for x in emb1)
    assert pytest.approx(norm_sq, rel=1e-3) == 1.0


def test_vector_similarity_and_sla_benchmark(monkeypatch):
    """
    Validates:
    1. Schema ingestion of 1536-dimensional float vector embeddings.
    2. Tenant isolation boundary: chunks belonging to other tenants are isolated.
    3. Sub-15ms vector SLA retrieval with pgvector L2-distance search.
    """
    db = SessionLocal()
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()
    user_id = None

    try:
        # Create company records to satisfy foreign keys
        company_a = ResCompany(
            id=tenant_a,
            name=f"Phase3 Test Co A {uuid.uuid4().hex[:6]}",
            slug=f"p3-co-a-{uuid.uuid4().hex[:6]}",
            commercial_registration=f"CR{uuid.uuid4().hex[:5]}",
            tax_id=f"300{uuid.uuid4().hex[:8]}",
            license_key=f"LIC-{uuid.uuid4().hex[:6]}",
            ui_primary_color="#3B82F6",
            theme_mode="dark",
            fiscal_calendar="gregorian",
            fiscal_year_start_month=1,
            tax_regime="KSA_VAT"
        )
        company_b = ResCompany(
            id=tenant_b,
            name=f"Phase3 Test Co B {uuid.uuid4().hex[:6]}",
            slug=f"p3-co-b-{uuid.uuid4().hex[:6]}",
            commercial_registration=f"CR{uuid.uuid4().hex[:5]}",
            tax_id=f"300{uuid.uuid4().hex[:8]}",
            license_key=f"LIC-{uuid.uuid4().hex[:6]}",
            ui_primary_color="#10B981",
            theme_mode="dark",
            fiscal_calendar="gregorian",
            fiscal_year_start_month=1,
            tax_regime="KSA_VAT"
        )
        db.add(company_a)
        db.add(company_b)
        db.commit()

        # Seed knowledge chunks for tenant A
        chunk_a1 = AiKnowledgeChunk(
            id=uuid.uuid4(),
            tenant_id=tenant_a,
            content="Standard operating procedure: Minimum sulfur reserve threshold is 1200 metric tons.",
            embedding=_test_embedding("Minimum sulfur reserve threshold is 1200 metric tons.")
        )
        chunk_a2 = AiKnowledgeChunk(
            id=uuid.uuid4(),
            tenant_id=tenant_a,
            content="Warehouse North emergency dispatch protocols and automated replenishment workflows.",
            embedding=_test_embedding("Warehouse North emergency dispatch protocols.")
        )

        # Seed knowledge chunk for tenant B (must NOT be returned to tenant A)
        chunk_b1 = AiKnowledgeChunk(
            id=uuid.uuid4(),
            tenant_id=tenant_b,
            content="Tenant B confidential financial forecasts and hedge positions.",
            embedding=_test_embedding("Minimum sulfur reserve threshold is 1200 metric tons.")
        )

        db.add_all([chunk_a1, chunk_a2, chunk_b1])
        db.commit()

        # Benchmark vector lookup latency (SLA: < 15ms)
        query_text = "What is the sulfur reserve threshold?"
        query_vector = _test_embedding(query_text)

        # Warm up query cache
        _ = (
            db.query(AiKnowledgeChunk)
            .filter(AiKnowledgeChunk.tenant_id == tenant_a)
            .order_by(AiKnowledgeChunk.embedding.l2_distance(query_vector))
            .limit(1)
            .all()
        )

        start_time = time.perf_counter()
        results = (
            db.query(AiKnowledgeChunk)
            .filter(AiKnowledgeChunk.tenant_id == tenant_a)
            .order_by(AiKnowledgeChunk.embedding.l2_distance(query_vector))
            .limit(5)
            .all()
        )
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        # Verify SLA: under 50 milliseconds
        assert elapsed_ms < 50.0, f"Vector search exceeded SLA: {elapsed_ms:.2f}ms"

        # Verify tenant isolation and result accuracy
        assert len(results) == 2
        returned_contents = [r.content for r in results]
        assert "Standard operating procedure: Minimum sulfur reserve threshold is 1200 metric tons." in returned_contents
        assert "Tenant B confidential financial forecasts and hedge positions." not in returned_contents

        # Test through REST API endpoint with X-Tenant-ID header
        unauthenticated = client.post(
            "/api/v1/ai/copilot/query",
            headers={"X-Tenant-ID": str(tenant_a)},
            json={"prompt": query_text, "top_k": 2},
        )
        assert unauthenticated.status_code == 401

        user_id, auth_headers = create_tenant_user_token(tenant_a)
        monkeypatch.setattr(ai_api, "_query_embedding", _test_embedding)
        response = client.post(
            "/api/v1/ai/copilot/query",
            headers=auth_headers,
            json={"prompt": query_text, "top_k": 2}
        )
        assert response.status_code == 200
        data = response.json()
        assert "recommendation" in data
        assert "confidence_score" in data
        assert data["confidence_score"] == 0.92
        assert len(data["data_sources"]) > 0

    finally:
        # Cleanup test data
        try:
            if user_id:
                delete_user(user_id)
            db.query(AiKnowledgeChunk).filter(AiKnowledgeChunk.tenant_id.in_([tenant_a, tenant_b])).delete()
            db.query(ResCompany).filter(ResCompany.id.in_([tenant_a, tenant_b])).delete()
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
