"""
OxenGL Finance Domain Pydantic Schemas.
Supports strict double-entry ledger contracts with bidirectional camelCase / snake_case aliasing.
"""

from typing import Optional, List
import uuid
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict


class JournalLineItemSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    account_code: str = Field(..., alias="accountCode")
    debit: float = Field(0.0, ge=0.0)
    credit: float = Field(0.0, ge=0.0)
    description: Optional[str] = None
    cost_center_id: Optional[uuid.UUID] = Field(None, alias="costCenterId")


class JournalEntryCreateSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    description: str
    entry_date: Optional[str] = Field(None, alias="entryDate")
    lines: List[JournalLineItemSchema]


class BalancedJournalLineSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = None
    account_code: str = Field(..., alias="accountCode")
    account_name: Optional[str] = Field(None, alias="accountName")
    description: Optional[str] = None
    debit: float = Field(0.0, ge=0.0)
    credit: float = Field(0.0, ge=0.0)


class BalancedJournalVoucherSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    entry_number: str = Field(..., alias="entryNumber")
    description: str
    entry_date: Optional[str] = Field(None, alias="entryDate")
    total_debit: float = Field(..., alias="totalDebit")
    total_credit: float = Field(..., alias="totalCredit")
    status: str
    lines: List[BalancedJournalLineSchema] = Field(default_factory=list)


# Aliases for compatibility
JournalLineItem = JournalLineItemSchema
JournalEntryCreate = JournalEntryCreateSchema
BalancedJournalLine = BalancedJournalLineSchema
BalancedJournalVoucher = BalancedJournalVoucherSchema
