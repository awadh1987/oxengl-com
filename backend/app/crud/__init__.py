"""Sales and customer invoice CRUD package with ZATCA Phase 2 cryptographic integration."""
from .sales import create_invoice, get_previous_invoice_hash

__all__ = ["create_invoice", "get_previous_invoice_hash"]
