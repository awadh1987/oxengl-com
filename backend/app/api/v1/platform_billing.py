"""Re-export platform billing routes for api/v1 namespace."""
from backend.api.routes.platform_billing import router, handle_paddle_webhook, verify_paddle_signature

__all__ = ["router", "handle_paddle_webhook", "verify_paddle_signature"]
