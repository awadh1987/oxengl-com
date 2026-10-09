"""Audit schemas regression."""
import sys
sys.path.insert(0, "/home/ahmed_awadh/oxen_gl")
sys.path.insert(0, "/home/ahmed_awadh/oxen_gl/backend")

import backend.app.schemas as bas
import app.schemas as aps
from backend.app.schemas import (
    AccountAccountCreate, AccountAccountRead, AccountJournalRead, AccountMoveCreate, AccountMoveRead,
    TenantBrandContext, UserContext, InstructionStep
)
from app.schemas import (
    AccountAccountCreate as A1, TenantBrandContext as T1
)

symbols_count = len(dir(aps))
print(f"Direct and relative schemas import test: SUCCESS ({symbols_count} symbols available)")
