"""
OxenGL Executive Copilot & AI Platform API Endpoints.
Processes Natural Language queries and yields explainable enterprise recommendations
powered by pgvector 1536-dimensional L2-distance similarity search.
"""

from typing import List, Optional, Any
import uuid
import math
import inspect
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.database import get_db

try:
    from backend.app.domains.ai.models import AiKnowledgeChunk
    from backend.app.domains.ai.forecasting import AIExecutiveForecastingEngine
    from backend.app.services.openai_embedding import OpenAIEmbeddingService
    from backend.models import ResUser
except ImportError:
    from app.domains.ai.models import AiKnowledgeChunk
    from app.domains.ai.forecasting import AIExecutiveForecastingEngine
    from app.services.openai_embedding import OpenAIEmbeddingService
    from backend.models import ResUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI & Copilot"])


def get_current_user(request: Request, db: Any = Depends(get_db)) -> ResUser:
    """Use the platform's native cookie/JWT authentication dependency."""
    try:
        # main imports this router before defining its native auth helper. Resolve it
        # lazily to avoid a circular import while retaining the platform cookie flow.
        from backend.app.main import get_authenticated_user
    except ImportError:
        from app.main import get_authenticated_user
    try:
        return get_authenticated_user(request, db)
    except HTTPException:
        _record_ai_tenant_decision(db, request, None, None, "DENIED")
        raise


def _record_ai_tenant_decision(
    db: Any,
    request: Request,
    user: Optional[ResUser],
    tenant_id: Optional[uuid.UUID],
    outcome: str,
) -> None:
    """Write AI tenant-boundary decisions to the platform audit log."""
    try:
        try:
            from backend.app.main import get_request_id, record_platform_audit, resolve_client_ip
        except ImportError:
            from app.main import get_request_id, record_platform_audit, resolve_client_ip

        record_platform_audit(
            db,
            actor_email=user.email if user else "UNAUTHENTICATED",
            action="AI_TENANT_ACCESS",
            endpoint=request.url.path,
            ip_address=resolve_client_ip(request),
            company_id=tenant_id,
            outcome=outcome,
            request_id=get_request_id(request),
            user_agent=request.headers.get("user-agent"),
            actor_id=user.id if user else None,
            tenant_id=tenant_id,
        )
    except Exception as error:
        logger.error("Could not write AI tenant access audit (%s).", type(error).__name__)


def _tenant_for_authenticated_user(authenticated_user: ResUser, db: Any, request: Request) -> uuid.UUID:
    """Resolve the tenant exclusively from the authenticated user's database membership."""
    user = db.get(ResUser, authenticated_user.id)
    if user is None or not user.is_active or user.deleted_at is not None:
        _record_ai_tenant_decision(db, request, authenticated_user, None, "DENIED")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user is not an active platform account.",
        )
    if user.company_id is None:
        _record_ai_tenant_decision(db, request, user, None, "DENIED")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user is not assigned to a tenant workspace.",
        )
    tenant_id = uuid.UUID(str(user.company_id))
    _record_ai_tenant_decision(db, request, user, tenant_id, "ALLOWED")
    return tenant_id


def _query_embedding(text: str) -> List[float]:
    """Use the configured embedding provider; reject its offline/mock fallback output."""
    provider = OpenAIEmbeddingService()
    if not provider.api_key:
        raise RuntimeError("The configured embedding provider is unavailable.")
    provider.api_url = os.getenv(
        "OPENAI_EMBEDDING_URL",
        "https://api.openai.com/v1/embeddings",
    ).strip()
    if not provider.api_url:
        raise RuntimeError("OPENAI_EMBEDDING_URL must be configured.")

    vector = provider.get_embedding(text)
    # The existing service falls back to a locally generated vector after provider
    # failures. Such a vector is not evidence-compatible and must not drive retrieval.
    mock_generator = getattr(provider, "_generate_deterministic_mock_vector", None)
    if callable(mock_generator) and vector == mock_generator(text):
        raise RuntimeError("The configured embedding provider did not return a real embedding.")
    if len(vector) != 1536 or not all(math.isfinite(float(value)) for value in vector):
        raise RuntimeError("The embedding provider returned an invalid vector.")
    return vector


def _no_evidence_response(reason: str = "No relevant evidence was found in this company's knowledge base.") -> "StructuredAIOutput":
    return StructuredAIOutput(
        recommendation="No recommendation can be made without relevant, tenant-scoped evidence.",
        confidence_score=0.0,
        business_reasoning=reason,
        data_sources=[],
        risk_classification="Unassessed",
    )


class CopilotQueryRequest(BaseModel):
    prompt: str = Field(..., example="Show current inventory risks or delayed fleet vectors.")
    top_k: int = Field(5, example=5)
    tenant_id: Optional[str] = Field(
        default=None,
        description="Deprecated and ignored; tenant scope comes from the authenticated user's company membership.",
    )
    context: Optional[Any] = None


class StructuredAIOutput(BaseModel):
    recommendation: str
    confidence_score: float
    business_reasoning: str
    data_sources: List[str]
    risk_classification: str
    analysis: Optional[Any] = None


@router.post("/query", response_model=StructuredAIOutput, status_code=status.HTTP_200_OK)
@router.post("/copilot/query", response_model=StructuredAIOutput, status_code=status.HTTP_200_OK)
async def process_copilot_conversational_insight(
    payload: CopilotQueryRequest,
    request: Request,
    db: Any = Depends(get_db),
    current_user: ResUser = Depends(get_current_user),
):
    """
    Processes Natural Language queries and yields an explainable enterprise recommendation blueprint.
    Performs pgvector L2-distance similarity searches (.l2_distance()) locked strictly within the active tenant_id.
    """
    active_tenant_id = _tenant_for_authenticated_user(current_user, db, request)

    # 2. Core vector distance matching algorithm loop (pgvector L2 distance)
    try:
        query_vector = _query_embedding(payload.prompt)
    except Exception as error:
        logger.warning("AI query embedding unavailable (%s).", type(error).__name__)
        return _no_evidence_response(
            "The configured embedding provider did not return a usable query vector; retrieval was not performed."
        )

    matched_chunks: List[AiKnowledgeChunk] = []

    try:
        query = (
            db.query(AiKnowledgeChunk)
            .filter(AiKnowledgeChunk.tenant_id == active_tenant_id)
            .order_by(AiKnowledgeChunk.embedding.l2_distance(query_vector))
            .limit(payload.top_k)
        )
        res = query.all()
        if inspect.isawaitable(res):
            res = await res
        matched_chunks = list(res)
    except Exception as error:
        logger.warning("Vector search failed (%s).", type(error).__name__)
        return _no_evidence_response(
            "Tenant-scoped knowledge retrieval failed; no evidence-backed recommendation is available."
        )

    # 3. Formulate explainable structured insight matrix
    if matched_chunks:
        sources = [f"ai_knowledge_chunks:{str(c.id)[:8]}" for c in matched_chunks]
        context_preview = " | ".join([c.content[:100].strip() for c in matched_chunks])
        top_content = matched_chunks[0].content

        return StructuredAIOutput(
            recommendation=f"Context-informed recommendation: {top_content[:140]}...",
            confidence_score=0.92,
            business_reasoning=(
                f"Retrieved {len(matched_chunks)} knowledge vectors via pgvector HNSW L2-distance search "
                f"under active tenant boundary. Semantic context: {context_preview[:180]}"
            ),
            data_sources=sources,
            risk_classification="Low" if len(matched_chunks) >= 3 else "Medium",
        )

    return _no_evidence_response()


@router.get("/forecasting/inventory", status_code=status.HTTP_200_OK)
async def get_predictive_inventory_trends(
    request: Request,
    db: Any = Depends(get_db),
    current_user: ResUser = Depends(get_current_user),
):
    """Computes and exposes a rolling 30-day stock allocation value projection trend."""
    active_tenant_id = _tenant_for_authenticated_user(current_user, db, request)
    metrics = await AIExecutiveForecastingEngine.project_30day_inventory_value(
        db=db, tenant_id=active_tenant_id
    )
    return metrics
