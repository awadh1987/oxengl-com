import uuid
import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock

from starlette.requests import Request

from backend.app.api.v1 import ai as ai_api
from backend.app.api.v1.ai import CopilotQueryRequest, process_copilot_conversational_insight
from backend.app.domains.ai.models import AIKnowledgeChunk
from backend.app.domains.ai.services import AIKnowledgeRetrievalService
from backend.app.security.abac import ABACUserContext


@pytest.fixture(autouse=True)
def warmup_redis():
    """Keep this isolated unit test from inheriting the suite's Redis warmup."""
    yield


@pytest.fixture
def mock_copilot_db():
    """Mock both the ResCompany lookup and vector-search query chain."""
    db = MagicMock()
    query = db.query.return_value
    query.first.return_value = None
    query.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
    return db


@pytest.mark.asyncio
async def test_ai_copilot_query_endpoint(mock_copilot_db, monkeypatch):
    tenant_id = uuid.uuid4()
    user = SimpleNamespace(id=uuid.uuid4(), company_id=tenant_id, is_active=True, deleted_at=None)
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/ai/copilot/query", "headers": [], "client": ("127.0.0.1", 1)})
    chunk = SimpleNamespace(id=uuid.uuid4(), content="Procurement delays raise logistics supply chain risk.")
    mock_copilot_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [chunk]
    monkeypatch.setattr(ai_api, "_tenant_for_authenticated_user", lambda *_: tenant_id)
    monkeypatch.setattr(ai_api, "_query_embedding", lambda _text: [0.01] * 1536)
    response = await process_copilot_conversational_insight(
        payload=CopilotQueryRequest(
            prompt="Evaluate procurement delay and logistics supply chain risk."
        ),
        request=request,
        db=mock_copilot_db,
        current_user=user,
    )
    assert response.recommendation
    assert response.confidence_score == 0.92
    assert response.business_reasoning
    assert isinstance(response.data_sources, list)
    assert response.risk_classification


@pytest.mark.asyncio
async def test_ai_knowledge_retrieval_service():
    tenant_id = uuid.uuid4()
    user = ABACUserContext(
        user_id=uuid.uuid4(),
        tenant_id=tenant_id,
        role="Admin",
        assigned_branches=[],
        is_platform_admin=False
    )
    mock_db = MagicMock()
    mock_result = MagicMock()
    
    mock_result.scalars.return_value.all.return_value = [
        "Fleet telemetry indicates low operational latency."
    ]
    mock_db.execute.return_value = mock_result

    results = await AIKnowledgeRetrievalService.semantic_search_context(
        db=mock_db,
        user=user,
        query_embedding=[0.01] * 1536,
        limit=3
    )

    assert len(results) == 1
    assert results[0] == "Fleet telemetry indicates low operational latency."
