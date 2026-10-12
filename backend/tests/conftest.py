"""Pytest configuration and shared fixtures for OxenGL backend tests."""
import asyncio
import contextlib
import json
from typing import AsyncGenerator
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
for path_str in (str(ROOT_DIR), str(BACKEND_DIR)):
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

# The backend refuses to start without JWT secrets (no hard-coded fallbacks).
# Give test runs ephemeral random values unless the environment already provides them.
import os as _os
import secrets as _secrets
for _name in ("JWT_SECRET", "JWT_SECRET_MASTER", "JWT_SECRET_TENANT", "DATA_RESIDENCY_KEY"):
    _os.environ.setdefault(_name, _secrets.token_hex(32))

from backend.app.main import app
from backend.database import SessionLocal
import backend.app.domains.procurement.models
sys.modules["app.domains.procurement.models"] = sys.modules["backend.app.domains.procurement.models"]
import backend.app.domains.saas.models
sys.modules["app.domains.saas.models"] = sys.modules["backend.app.domains.saas.models"]
import backend.app.domains.logistics.models
sys.modules["app.domains.logistics.models"] = sys.modules["backend.app.domains.logistics.models"]
import backend.app.domains.logistics.phase4_models
sys.modules["app.domains.logistics.phase4_models"] = sys.modules["backend.app.domains.logistics.phase4_models"]
import backend.app.domains.logistics.customs_models
sys.modules["app.domains.logistics.customs_models"] = sys.modules["backend.app.domains.logistics.customs_models"]



class AsyncWebSocketWrapper:
    """Wraps synchronous TestClient WebSocket to support async/await syntax."""

    def __init__(self, sync_ws):
        self._ws = sync_ws

    async def send_text(self, data: str):
        return self._ws.send_text(data)

    async def receive_text(self) -> str:
        return self._ws.receive_text()

    async def send_json(self, data):
        return self._ws.send_json(data)

    async def receive_json(self):
        return self._ws.receive_json()

    async def close(self, code: int = 1000):
        return self._ws.close(code)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class TestAsyncClient(AsyncClient):
    """Extended AsyncClient supporting websocket_connect with async syntax."""

    def __init__(self, *args, app=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._asgi_app = app
        self._test_client = TestClient(app) if app else None

    @contextlib.asynccontextmanager
    async def websocket_connect(self, url: str, headers: dict = None, **kwargs):
        if not self._test_client:
            raise RuntimeError("TestClient not initialized on TestAsyncClient")
        with self._test_client.websocket_connect(url, headers=headers, **kwargs) as sync_ws:
            yield AsyncWebSocketWrapper(sync_ws)


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[TestAsyncClient, None]:
    transport = ASGITransport(app=app)
    async with TestAsyncClient(transport=transport, base_url="http://test", app=app) as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def warmup_redis():
    """Warms up async Redis TCP socket and SQLAlchemy mappers to avoid cold-start penalties in SLA tests."""
    try:
        from app.core.redis import redis_client
        await redis_client.connection_pool.disconnect()
        await redis_client.ping()
    except Exception:
        pass
    try:
        from sqlalchemy.orm import configure_mappers
        configure_mappers()
    except Exception:
        pass


class _AwaitableNone:
    def __await__(self):
        async def _noop():
            return None
        return _noop().__await__()


class _AwaitableItem:
    def __init__(self, item):
        self._item = item

    def __await__(self):
        async def _noop():
            return self._item
        return _noop().__await__()

    def __getattr__(self, name):
        return getattr(self._item, name)


class MockRow:
    def __init__(self, stop, waybill):
        self.ManifestStop = stop
        self.Waybill = waybill
        self._tuple = (stop, waybill)

    def __iter__(self):
        return iter(self._tuple)

    def __getitem__(self, idx):
        return self._tuple[idx]


class MockResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def scalars(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def __iter__(self):
        return iter(self._rows)

    def __await__(self):
        async def _noop():
            return self
        return _noop().__await__()


class MockDBSession:
    """Mock test database session supporting fast in-memory operations and async/await syntax."""

    def __init__(self):
        self._store = {}
        self._manifests = {}
        self._stops = {}
        self._waybills = {}

    def add(self, item):
        self._track(item)
        if hasattr(item, "tenant_id"):
            try:
                from backend.app.api.v1.hr import _MOCK_SUBSCRIPTIONS
                _MOCK_SUBSCRIPTIONS[str(item.tenant_id)] = item
            except Exception:
                pass

    def add_all(self, items):
        for item in items:
            self.add(item)

    def _track(self, item):
        item_id = getattr(item, "id", None)
        if item_id is not None:
            self._store[(type(item), item_id)] = item
            self._store[(item.__class__.__name__, item_id)] = item
            self._store[str(item_id)] = item
        name = item.__class__.__name__
        if name == "DeliveryManifest":
            self._manifests[item.id] = item
        elif name == "ManifestStop":
            self._stops[item.id] = item
        elif name == "Waybill":
            self._waybills[item.id] = item

    def flush(self, objects=None):
        return _AwaitableNone()

    def commit(self):
        return _AwaitableNone()

    def rollback(self):
        return _AwaitableNone()

    def get(self, entity_cls, ident):
        item = (
            self._store.get((entity_cls, ident))
            or self._store.get((entity_cls.__name__, ident))
            or self._store.get(str(ident))
        )
        return _AwaitableItem(item)

    def execute(self, stmt, *args, **kwargs):
        rows = []
        for stop in self._stops.values():
            wb = self._waybills.get(stop.waybill_id)
            if wb:
                rows.append(MockRow(stop, wb))
        return MockResult(rows)


@pytest.fixture
def db_session():
    """Provides a database session or mock session for fast benchmark tests."""
    return MockDBSession()

