"""
Database session factory providing AsyncSessionLocal and SessionLocal.
"""
from backend.database import SessionLocal, AsyncCompatibleSession, engine

# Session maker configured for async-compatible operations
AsyncSessionLocal = SessionLocal

__all__ = ["AsyncSessionLocal", "SessionLocal", "AsyncCompatibleSession", "engine"]
