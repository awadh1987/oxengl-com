"""Services package for OxenGL."""
try:
    from .optimization_service import IoTRouteOptimizationEngine
except (ImportError, Exception):
    IoTRouteOptimizationEngine = None  # type: ignore

try:
    from .openai_embedding import OpenAIEmbeddingService
except (ImportError, Exception):
    OpenAIEmbeddingService = None  # type: ignore

__all__ = ["IoTRouteOptimizationEngine", "OpenAIEmbeddingService"]
