#!/usr/bin/env python3
"""Print a bearer token for WebSocket/health probes.

Uses OXENGL_WS_TOKEN when set; otherwise mints a short-lived master-tier JWT
from the backend's configured signing secret. Nothing is hardcoded.
"""
import os
from functools import lru_cache
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


@lru_cache(maxsize=1)
def get_ws_token() -> str:
    token = os.getenv("OXENGL_WS_TOKEN", "").strip()
    if token:
        return token
    from backend.two_tier_auth import issue_two_tier_jwt

    return issue_two_tier_jwt(
        tier="master",
        user_id=uuid.uuid5(uuid.NAMESPACE_DNS, "oxengl-health-probe"),
        identity="health-probe@oxengl.com",
        role="super_admin",
    )


if __name__ == "__main__":
    print(get_ws_token())
