from typing import Generator
from fastapi import Request
from sqlalchemy.orm import Session

from backend.database import *


def get_isolated_db_session(request: Request) -> Generator[Session, None, None]:
    """Use the shared database dependency's verified RLS context."""
    yield from get_db(request)
