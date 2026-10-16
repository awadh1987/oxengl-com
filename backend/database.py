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
from sqlalchemy import URL, Engine, create_engine, select, text, event
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

PLATFORM_DATABASE_URL = os.getenv("PLATFORM_DATABASE_URL")
platform_engine = (
    create_engine(
        PLATFORM_DATABASE_URL,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "5")),
    )
    if PLATFORM_DATABASE_URL
    else None
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
PlatformSessionLocal = (
    sessionmaker(bind=platform_engine, class_=AsyncCompatibleSession, autoflush=False, autocommit=False)
    if platform_engine is not None
    else None
)


@event.listens_for(Session, "after_begin")
def _set_rls_tenant_context(session, transaction, connection):
    tenant_id = session.info.get("tenant_id")
    if tenant_id:
        connection.execute(
            text(
                "SELECT set_config('app.current_tenant_id', :tid, true), "
                "set_config('app.current_company_id', :tid, true)"
            ),
            {"tid": str(tenant_id)},
        )


@event.listens_for(Engine, "checkin")
def _reset_tenant_context_on_checkin(dbapi_connection, connection_record):
    try:
        if getattr(dbapi_connection, "autocommit", False):
            cursor = dbapi_connection.cursor()
            cursor.execute("RESET app.current_tenant_id; RESET app.current_company_id;")
            cursor.close()
        else:
            dbapi_connection.rollback()
            prev_autocommit = dbapi_connection.autocommit
            dbapi_connection.autocommit = True
            cursor = dbapi_connection.cursor()
            cursor.execute("RESET app.current_tenant_id; RESET app.current_company_id;")
            cursor.close()
            dbapi_connection.autocommit = prev_autocommit
    except Exception:
        pass


from starlette.requests import Request


def get_db(request: Request = None):
    """Generator yielding a transactional database session with tenant/RLS context awareness
    and dynamic routing to dedicated physical databases for enterprise tenants."""
    tenant_id = None
    company_uuid = None
    is_master = False

    if request is not None:
        authenticated_user = getattr(request.state, "current_user", None)
        raw_token = request.cookies.get("access_token") or request.cookies.get("oxengl_session")
        authorization = request.headers.get("Authorization") or request.headers.get("authorization")
        if not raw_token and authorization and authorization.startswith("Bearer "):
            raw_token = authorization.split(" ", 1)[1].strip()

        claims = None
        if raw_token:
            from fastapi import HTTPException
            from backend.two_tier_auth import verify_two_tier_jwt

            try:
                claims = verify_two_tier_jwt(raw_token, expected_tier="master")
            except HTTPException:
                try:
                    claims = verify_two_tier_jwt(raw_token, expected_tier="tenant")
                except HTTPException:
                    from backend.app.dependencies import decode_jwt_token

                    try:
                        claims = decode_jwt_token(raw_token)
                    except HTTPException:
                        try:
                            from backend.app.main import decode_session_token
                            claims = decode_session_token(raw_token)
                        except Exception:
                            claims = None

        if authenticated_user is not None:
            tenant_id = getattr(authenticated_user, "company_id", None)
            is_master = bool(getattr(request.state, "is_platform_admin", False))
        elif claims:
            tenant_id = claims.get("tenant_id") or claims.get("company_id")
            if claims.get("tier") == "master" or str(claims.get("role", "")).lower() in ("super_admin", "superadmin"):
                is_master = True
        else:
            # Context resolution from HostHeaderMiddleware (custom domains and subdomains)
            state_tenant = (
                getattr(request.state, "tenant_company_id", None)
                or getattr(request.state, "tenant_id", None)
                or getattr(request.state, "company_id", None)
            )
            if state_tenant:
                tenant_id = str(state_tenant)
            elif request.url.path.startswith(("/api/v1/auth", "/api/auth", "/api/v1/iam", "/api/v1/tenant/auth")):
                tenant_id = (
                    request.headers.get("X-Tenant-ID")
                    or request.headers.get("X-Company-ID")
                )
            else:
                tenant_id = None
            is_master = False

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
            "/api/v1/tenant-control",
            "/api/v1/tenant/billing",
            "/api/tenant/billing",
            "/api/v1/billing",
            "/api/billing",
            "/api/v1/pricing",
            "/api/pricing",
            "/api/v1/public/billing-gateways",
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

    if (is_master or is_control_plane) and PlatformSessionLocal is not None:
        db = PlatformSessionLocal()
    elif company_uuid and not is_control_plane and not is_master:
        db = tenant_connection_manager.get_session(company_uuid)
    else:
        db = SessionLocal()

    if tenant_id:
        db.info["tenant_id"] = str(tenant_id)

    # Apply transaction-local context after discarding all caller-selected scope.
    try:
        db.execute(
            text(
                "SELECT set_config('app.current_tenant_id', :tenant_id, true), "
                "set_config('app.current_company_id', :company_id, true)"
            ),
            {
                "tenant_id": str(tenant_id or ""),
                "company_id": str(tenant_id or ""),
            },
        )
        yield db
    finally:
        if tenant_id:
            try:
                db.execute(text("RESET app.current_tenant_id;"))
                db.execute(text("RESET app.current_company_id;"))
            except Exception:
                pass
        db.close()


def get_platform_db(request: Request):
    """Yield a global-scope session only after the platform authorization guard succeeds."""
    from fastapi import HTTPException, status

    if not getattr(request.state, "platform_db_authorized", False):
        auth_header = request.headers.get("Authorization") or ""
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            try:
                from backend.two_tier_auth import decode_two_tier_jwt
                claims = decode_two_tier_jwt(token)
                if claims and (claims.get("tier") == "master" or str(claims.get("role", "")).lower() in ("super_admin", "superadmin")):
                    request.state.platform_db_authorized = True
            except Exception:
                pass

    if not getattr(request.state, "platform_db_authorized", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform database access is not authorized")
    if PlatformSessionLocal is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Platform database access is not configured")

    db = PlatformSessionLocal()
    try:
        role = db.execute(
            text(
                "SELECT current_user, role.rolsuper, role.rolbypassrls "
                "FROM pg_roles AS role WHERE role.rolname = current_user"
            )
        ).one()
        if role != ("oxengl_platform", False, True):
            raise RuntimeError("Platform database URL did not connect as the dedicated non-superuser platform role")
        yield db
    finally:
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
            db.info["tenant_id"] = str(tenant_id)
            db.execute(text("SET LOCAL app.current_tenant_id = :tid"), {"tid": str(tenant_id)})
            db.execute(text("SET LOCAL app.current_company_id = :tid"), {"tid": str(tenant_id)})
        yield db
    finally:
        db.info.pop("tenant_id", None)
        try:
            db.execute(text("RESET app.current_tenant_id;"))
            db.execute(text("RESET app.current_company_id;"))
        except Exception:
            pass


class Base(DeclarativeBase):
    """Base class shared by all persisted ERP entities."""


# ==============================================================================
# Phase 8: Enterprise Data Residency (ADR-005) - Connection Routing & Encryption
# ==============================================================================


from backend.secret_env import require_secret  # noqa: E402  (strict, no fallbacks)

# Required. There is intentionally NO fallback (formerly a public literal and JWT_SECRET_KEY):
# the process refuses to start without it. Rotate with backend/scripts/rotate_data_residency_key.py.
DATA_RESIDENCY_KEY = require_secret("DATA_RESIDENCY_KEY")


def _get_encryption_fernet(secret_key: str | None = None) -> Fernet:
    """Derives a deterministic 32-byte URL-safe base64 key for Fernet symmetric encryption."""
    raw_key = secret_key or DATA_RESIDENCY_KEY
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
        self._default_sessionmaker = sessionmaker(
            bind=self._default_engine, class_=AsyncCompatibleSession, autoflush=False, autocommit=False
        )
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
        session = sm()
        if company_id is not None:
            session.info["tenant_id"] = str(company_id)
            try:
                session.execute(
                    text(
                        "SELECT set_config('app.current_tenant_id', :tid, true), "
                        "set_config('app.current_company_id', :tid, true)"
                    ),
                    {"tid": str(company_id)},
                )
            except Exception:
                pass
        return session

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
            if company_id is not None:
                try:
                    session.execute(text("RESET app.current_tenant_id; RESET app.current_company_id;"))
                except Exception:
                    pass
            session.close()

    def _resolve_dedicated_url(self, company_id: uuid.UUID, db: Session | None = None) -> str | None:
        """Queries the metadata catalog for active dedicated tenant database configs."""
        # Import lazily to avoid circular imports during startup
        from backend import models

        def _lookup(sess: Session) -> str | None:
            try:
                sess.execute(
                    text(
                        "SELECT set_config('app.current_tenant_id', :tid, true), "
                        "set_config('app.current_company_id', :tid, true)"
                    ),
                    {"tid": str(company_id)},
                )
            except Exception:
                pass
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
        elif PlatformSessionLocal is not None:
            with PlatformSessionLocal() as lookup_sess:
                return _lookup(lookup_sess)
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
