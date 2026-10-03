"""Database configuration for the OxenGL ERP backend."""

import base64
import hashlib
import os
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator, Optional

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from sqlalchemy import URL, Engine, create_engine, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def get_database_url() -> str:
    """Return DATABASE_URL or construct a local PostgreSQL development URL."""
    configured_url = os.getenv("DATABASE_URL")
    if configured_url:
        if "+asyncpg" in configured_url:
            return configured_url.replace("+asyncpg", "+psycopg2")
        return configured_url

    return URL.create(
        drivername="postgresql+psycopg2",
        username=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
        host=os.getenv("POSTGRES_HOST", "127.0.0.1"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        database=os.getenv("POSTGRES_DB", "erp_db"),
    ).render_as_string(hide_password=False)


DATABASE_URL = get_database_url()

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "20")),
)

class _AwaitableNone:
    def __await__(self):
        async def _noop():
            return None
        return _noop().__await__()


class _AwaitableResult:
    def __init__(self, res):
        self._res = res

    def __await__(self):
        async def _noop():
            return self._res
        return _noop().__await__()

    def __iter__(self):
        return iter(self._res)

    def __getattr__(self, name):
        return getattr(self._res, name)


class AsyncCompatibleSession(Session):
    def execute(self, statement, *args, **kwargs) -> Any:
        res = super().execute(statement, *args, **kwargs)
        return _AwaitableResult(res)

    def flush(self, objects=None) -> Any:
        super().flush(objects=objects)
        return _AwaitableNone()

    def commit(self) -> Any:
        super().commit()
        return _AwaitableNone()

    def rollback(self) -> Any:
        super().rollback()
        return _AwaitableNone()

    def refresh(self, instance, *args, **kwargs) -> Any:
        super().refresh(instance, *args, **kwargs)
        return _AwaitableNone()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        self.close()


SessionLocal = sessionmaker(bind=engine, class_=AsyncCompatibleSession, autoflush=False, autocommit=False)


from starlette.requests import Request


def get_db(request: Request = None):
    """Generator yielding a transactional database session with tenant/RLS context awareness
    and dynamic routing to dedicated physical databases for enterprise tenants."""
    tenant_id = None
    company_uuid = None
    is_master = False

    if request is not None:
        try:
            # 1. Check request headers
            if hasattr(request, "headers"):
                headers = request.headers
                tenant_id = (
                    headers.get("X-Tenant-ID")
                    or headers.get("x-tenant-id")
                    or headers.get("X-Company-ID")
                    or headers.get("x-company-id")
                    or headers.get("X-Tenant-Slug")
                    or headers.get("x-tenant-slug")
                )
                role = headers.get("x-role")
                if role and str(role).upper().replace(" ", "_") in ["SUPER_ADMIN", "SUPERADMIN", "ADMIN", "CEO", "EXECUTIVE"]:
                    is_master = True

            # 2. Check request.state
            if hasattr(request, "state"):
                if not tenant_id:
                    tenant_id = (
                        getattr(request.state, "tenant_id", None)
                        or getattr(request.state, "company_id", None)
                    )
                role = getattr(request.state, "role", None)
                if role and str(role).upper().replace(" ", "_") in ["SUPER_ADMIN", "SUPERADMIN", "ADMIN", "CEO", "EXECUTIVE"]:
                    is_master = True

            # 3. Check query and path params
            if not tenant_id:
                if hasattr(request, "path_params") and request.path_params:
                    tenant_id = request.path_params.get("tenant_id") or request.path_params.get("company_id")
                if not tenant_id and hasattr(request, "query_params") and request.query_params:
                    tenant_id = request.query_params.get("tenant_id") or request.query_params.get("company_id")

            # 4. Check Authorization Bearer JWT token
            if not tenant_id and hasattr(request, "headers"):
                auth = request.headers.get("Authorization") or request.headers.get("authorization")
                if auth and auth.startswith("Bearer "):
                    token = auth.split(" ", 1)[1].strip()
                    try:
                        from backend.app.dependencies import decode_jwt_token
                        claims = decode_jwt_token(token)
                        tenant_id = claims.get("tenant_id") or claims.get("company_id")
                        c_role = claims.get("role")
                        if c_role and str(c_role).upper().replace(" ", "_") in ["SUPER_ADMIN", "SUPERADMIN", "ADMIN", "CEO", "EXECUTIVE"]:
                            is_master = True
                    except Exception:
                        pass
        except Exception:
            pass

    # Resolve company_uuid
    if tenant_id:
        try:
            company_uuid = uuid.UUID(str(tenant_id))
        except (ValueError, TypeError):
            pass

    # Dynamic Connection Resolution: resolve dedicated engine or fallback to platform shared pool
    is_control_plane = False
    if request is not None and hasattr(request, "url") and hasattr(request.url, "path"):
        path = request.url.path
        if path.startswith((
            "/api/v1/tenant/control",
            "/api/tenant/control",
            "/api/v1/superadmin",
            "/api/superadmin",
            "/api/v1/platform",
            "/api/platform",
            "/api/v1/admin/platform",
            "/api/admin/platform",
            "/api/companies",
            "/api/v1/companies",
            "/api/v1/tenant/branding",
            "/api/tenant/branding",
            "/api/v1/tenants",
            "/api/tenants",
            "/validate-slug",
            "/api/v1/auth",
            "/api/auth",
            "/api/v1/ssl",
            "/api/ssl",
            "/ssl",
        )):
            is_control_plane = True

    if company_uuid and not is_control_plane:
        db = tenant_connection_manager.get_session(company_uuid)
    else:
        db = SessionLocal()

    # Apply tenant RLS session variables
    try:
        if tenant_id:
            try:
                db.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": str(tenant_id)})
                db.execute(text("SET LOCAL app.current_company_id = :tid"), {"tid": str(tenant_id)})
            except Exception:
                pass
        if is_master:
            try:
                db.execute(text("SET LOCAL app.is_master_admin = 'true'"))
            except Exception:
                pass
        yield db
    finally:
        if tenant_id or is_master:
            try:
                db.execute(text("RESET app.current_tenant_id;"))
                db.execute(text("RESET app.current_company_id;"))
                db.execute(text("RESET app.is_master_admin;"))
            except Exception:
                pass
        db.close()



@contextmanager
def tenant_rls_scope(db, tenant_id: str, is_master: bool = False):
    """Connection Pool Scoping Safeguard:
    Safely scopes RLS database operations using transaction-local blocks
    (SET LOCAL app.current_tenant_id) and immediately clears the session
    variable post-query / on exit (RESET app.current_tenant_id) to prevent
    context leaks across pooled database connections.
    """
    try:
        if tenant_id:
            db.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": str(tenant_id)})
            db.execute(text("SET LOCAL app.current_company_id = :tid"), {"tid": str(tenant_id)})
        if is_master:
            db.execute(text("SET LOCAL app.is_master_admin = 'true'"))
        yield db
    finally:
        try:
            db.execute(text("RESET app.current_tenant_id;"))
            db.execute(text("RESET app.current_company_id;"))
            db.execute(text("RESET app.is_master_admin;"))
        except Exception:
            pass


class Base(DeclarativeBase):
    """Base class shared by all persisted ERP entities."""


# ==============================================================================
# Phase 8: Enterprise Data Residency (ADR-005) - Connection Routing & Encryption
# ==============================================================================


def _get_encryption_fernet(secret_key: str | None = None) -> Fernet:
    """Derives a deterministic 32-byte URL-safe base64 key for Fernet symmetric encryption."""
    raw_key = (
        secret_key
        or os.getenv("DATA_RESIDENCY_KEY")
        or os.getenv("JWT_SECRET_KEY")

        or "oxengl-data-residency-secret-key-32b-default"
    )
    derived_32 = hashlib.sha256(raw_key.encode("utf-8")).digest()
    fernet_key = base64.urlsafe_b64encode(derived_32)
    return Fernet(fernet_key)


def encrypt_connection_url(url: str, secret_key: str | None = None) -> str:
    """Encrypts a physical database connection string for secure at-rest storage."""
    fernet = _get_encryption_fernet(secret_key)
    return fernet.encrypt(url.encode("utf-8")).decode("utf-8")


def decrypt_connection_url(encrypted_url: str, secret_key: str | None = None) -> str:
    """Decrypts an encrypted database connection string."""
    fernet = _get_encryption_fernet(secret_key)
    return fernet.decrypt(encrypted_url.encode("utf-8")).decode("utf-8")


class TenantConnectionManager:
    """
    Enterprise Data Residency Connection Router (ADR-005).
    Dynamically resolves and caches physical SQLAlchemy database engines based on authenticated company_id.
    Standard tenants route to the default multi-tenant platform database.
    Enterprise tenants route to dedicated, physically isolated physical databases.
    """

    def __init__(self, default_engine: Engine | None = None):
        self._default_engine = default_engine or engine
        self._default_sessionmaker = SessionLocal
        self._engine_cache: dict[uuid.UUID, Engine] = {}
        self._sessionmaker_cache: dict[uuid.UUID, sessionmaker] = {}
        self._no_dedicated_cache: set[uuid.UUID] = set()
        self._lock = threading.Lock()

    @property
    def default_engine(self) -> Engine:
        return self._default_engine

    def has_dedicated_engine(self, company_id: uuid.UUID) -> bool:
        """Checks if a tenant currently has a dedicated engine cached."""
        with self._lock:
            return company_id in self._engine_cache

    def get_engine(self, company_id: uuid.UUID | None = None, db: Session | None = None) -> Engine:
        """
        Resolves the appropriate physical database Engine for the given tenant company_id.
        Returns dedicated physical engine if configured and active, otherwise falls back to platform default engine.
        """
        if company_id is None:
            return self._default_engine

        with self._lock:
            if company_id in self._engine_cache:
                return self._engine_cache[company_id]
            if company_id in self._no_dedicated_cache:
                return self._default_engine

        dedicated_url = self._resolve_dedicated_url(company_id, db=db)
        if dedicated_url:
            with self._lock:
                if company_id in self._engine_cache:
                    return self._engine_cache[company_id]

                # SQLite URLs do not accept pool_size/max_overflow; PostgreSQL and others do
                is_sqlite = dedicated_url.startswith("sqlite")
                engine_kwargs: dict = {"pool_pre_ping": True}
                if not is_sqlite:
                    engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "10"))
                    engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "20"))

                new_engine = create_engine(dedicated_url, **engine_kwargs)
                self._engine_cache[company_id] = new_engine
                self._sessionmaker_cache[company_id] = sessionmaker(
                    bind=new_engine, class_=AsyncCompatibleSession, autoflush=False, autocommit=False
                )
                self._no_dedicated_cache.discard(company_id)
                return new_engine

        with self._lock:
            self._no_dedicated_cache.add(company_id)
        return self._default_engine

    def get_sessionmaker(self, company_id: uuid.UUID | None = None, db: Session | None = None) -> sessionmaker:
        """Returns the sessionmaker bound to the tenant's physical engine."""
        if company_id is None:
            return self._default_sessionmaker
        self.get_engine(company_id, db=db)
        with self._lock:
            return self._sessionmaker_cache.get(company_id, self._default_sessionmaker)

    def get_session(self, company_id: uuid.UUID | None = None, db: Session | None = None) -> Session:
        """Creates and returns a new SQLAlchemy Session connected to the tenant's physical database."""
        sm = self.get_sessionmaker(company_id, db=db)
        return sm()

    @contextmanager
    def session_scope(self, company_id: uuid.UUID | None = None, db: Session | None = None) -> Generator[Session, None, None]:
        """Transactional context manager providing an isolated physical database session."""
        session = self.get_session(company_id, db=db)
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _resolve_dedicated_url(self, company_id: uuid.UUID, db: Session | None = None) -> str | None:
        """Queries the metadata catalog for active dedicated tenant database configs."""
        # Import lazily to avoid circular imports during startup
        from backend import models

        def _lookup(sess: Session) -> str | None:
            config = sess.scalar(
                select(models.TenantDatabaseConfig).where(
                    models.TenantDatabaseConfig.company_id == company_id,
                    models.TenantDatabaseConfig.is_active.is_(True),
                )
            )
            if config and config.encrypted_connection_url:
                try:
                    return decrypt_connection_url(config.encrypted_connection_url)
                except Exception as err:
                    import logging
                    logging.getLogger(__name__).error(
                        f"Failed to decrypt database connection string for tenant {company_id}: {err}"
                    )
                    return None
            return None

        if db is not None:
            return _lookup(db)
        else:
            with self._default_sessionmaker() as lookup_sess:
                return _lookup(lookup_sess)

    def register_tenant_engine(self, company_id: uuid.UUID, engine_or_url: Engine | str) -> Engine:
        """Manually registers an engine or connection URL for a tenant (useful for testing and bootstrapping)."""
        with self._lock:
            if isinstance(engine_or_url, str):
                is_sqlite = engine_or_url.startswith("sqlite")
                engine_kwargs: dict = {"pool_pre_ping": True}
                if not is_sqlite:
                    engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "10"))
                    engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "20"))
                eng = create_engine(engine_or_url, **engine_kwargs)
            else:
                eng = engine_or_url

            self._engine_cache[company_id] = eng
            self._sessionmaker_cache[company_id] = sessionmaker(
                bind=eng, class_=AsyncCompatibleSession, autoflush=False, autocommit=False
            )
            self._no_dedicated_cache.discard(company_id)
            return eng

    register_engine = register_tenant_engine

    def reset_cache(self, company_id: uuid.UUID | None = None) -> None:
        """Disposes and removes cached tenant engines."""
        with self._lock:
            if company_id is not None:
                self._no_dedicated_cache.discard(company_id)
                if company_id in self._engine_cache:
                    eng = self._engine_cache.pop(company_id)
                    if eng is not self._default_engine:
                        eng.dispose()
                self._sessionmaker_cache.pop(company_id, None)
            else:
                self._no_dedicated_cache.clear()
                for eng in self._engine_cache.values():
                    if eng is not self._default_engine:
                        eng.dispose()
                self._engine_cache.clear()
                self._sessionmaker_cache.clear()

    @staticmethod
    def test_connection(connection_url: str, timeout: int = 5) -> tuple[bool, Optional[str]]:
        """Tests connectivity and credentials for an external database."""
        try:
            is_sqlite = connection_url.startswith("sqlite")
            kwargs: dict = {}
            if not is_sqlite:
                kwargs["connect_args"] = {"connect_timeout": timeout}
            test_eng = create_engine(connection_url, **kwargs)
            with test_eng.connect() as conn:
                conn.execute(text("SELECT 1"))
            test_eng.dispose()
            return True, None
        except Exception as e:
            return False, str(e)


tenant_connection_manager = TenantConnectionManager(engine)

