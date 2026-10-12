"""
OxenGL PDF Receipt Generator Service.
File: backend/app/services/pdf_service.py

Renders professional PDF invoice receipts for tenant subscriptions using WeasyPrint and Jinja2.
Generated upon Super Admin approval of manual bank transfer and offline payments.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional, Union

from jinja2 import Environment, FileSystemLoader, select_autoescape

try:
    from weasyprint import HTML
except (ImportError, Exception):
    HTML = None

logger = logging.getLogger("oxengl.billing.pdf_service")

# Resolve template directories
_BASE_DIR = os.path.dirname(os.path.dirname(__file__))
_BILLING_TEMPLATE_DIR = os.path.join(_BASE_DIR, "templates", "billing")
_ROOT_TEMPLATE_DIR = os.path.join(_BASE_DIR, "templates")

# Configure Jinja2 Environment
_jinja_env = Environment(
    loader=FileSystemLoader([_BILLING_TEMPLATE_DIR, _ROOT_TEMPLATE_DIR]),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _format_currency(value: Any, currency: str = "SAR") -> str:
    """Format numeric values into standard monetary notation with thousand separators."""
    if value is None:
        num = 0.0
    elif isinstance(value, (int, float, Decimal)):
        num = float(value)
    else:
        try:
            num = float(str(value).strip().replace(",", ""))
        except (ValueError, TypeError):
            num = 0.0
    return f"{num:,.2f} {currency}"


def _format_date(value: Any) -> str:
    """Format date or datetime into YYYY-MM-DD or standard readable string."""
    if not value:
        return "N/A"
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    val_str = str(value).strip()
    try:
        if "T" in val_str:
            dt = datetime.fromisoformat(val_str.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d")
        return val_str[:10]
    except Exception:
        return val_str[:10]


# Register filters in Jinja2 environment
_jinja_env.filters["format_currency"] = _format_currency
_jinja_env.filters["format_date"] = _format_date


def _get_field(obj: Any, *keys: str, default: Any = None) -> Any:
    """Helper to safely extract field from dict, Pydantic model, or SQLAlchemy ORM model."""
    for key in keys:
        if isinstance(obj, dict):
            if key in obj and obj[key] is not None:
                return obj[key]
        elif hasattr(obj, key):
            val = getattr(obj, key)
            if val is not None:
                return val
    return default


def generate_invoice_pdf(
    invoice: Union[Any, Dict[str, Any]],
    tenant: Union[Any, Dict[str, Any]],
) -> bytes:
    """
    Renders the billing invoice receipt Jinja2 template and compiles it into a PDF byte buffer.

    Args:
        invoice: SaaSInvoice ORM instance, Pydantic schema, or dict representation.
        tenant: MasterTenant / ResCompany ORM instance, Pydantic schema, or dict representation.

    Returns:
        bytes: Compiled PDF binary stream.

    Raises:
        RuntimeError: If WeasyPrint is not installed or available.
    """
    if HTML is None:
        raise RuntimeError("WeasyPrint library is not installed or available in the environment.")

    # Normalize invoice dictionary
    subtotal = float(_get_field(invoice, "subtotal_sar", "subtotal", default=0.0) or 0.0)
    tax = float(_get_field(invoice, "tax_sar", "tax", default=0.0) or 0.0)
    amount = float(_get_field(invoice, "amount_sar", "amount", default=0.0) or 0.0)
    if amount == 0.0 and (subtotal > 0 or tax > 0):
        amount = subtotal + tax

    currency = _get_field(invoice, "currency", default="SAR")
    invoice_number = _get_field(invoice, "invoice_number", default="INV-DRAFT")
    tier = _get_field(invoice, "tier", "subscription_tier", default="PROFESSIONAL")
    billing_cycle = _get_field(invoice, "billing_cycle", default="monthly")
    payment_method = _get_field(invoice, "payment_method", default="Manual Bank Transfer")
    payment_reference = _get_field(invoice, "payment_reference", default=None)
    issued_date = _get_field(invoice, "issued_date", "created_at", default=datetime.now(timezone.utc))
    paid_at = _get_field(invoice, "paid_at", default=datetime.now(timezone.utc))
    notes = _get_field(invoice, "notes", default=None)
    status = _get_field(invoice, "status", default="paid")

    invoice_data = {
        "invoice_number": invoice_number,
        "amount": amount,
        "subtotal": subtotal,
        "tax": tax,
        "currency": currency,
        "tier": tier,
        "billing_cycle": billing_cycle,
        "payment_method": payment_method,
        "payment_reference": payment_reference,
        "issued_date": issued_date,
        "paid_at": paid_at,
        "notes": notes,
        "status": status,
    }

    # Normalize tenant dictionary
    tenant_name = _get_field(tenant, "name", "tenant_name", "company_name", default="Valued Tenant")
    tenant_slug = _get_field(tenant, "slug", "tenant_slug", default="")
    owner_full_name = _get_field(tenant, "owner_full_name", "contact_name", default="Account Administrator")
    owner_email = _get_field(tenant, "owner_email", "email", default="")
    owner_mobile = _get_field(tenant, "owner_mobile", "mobile_number", "phone", default="")

    tenant_data = {
        "name": tenant_name,
        "slug": tenant_slug,
        "owner_full_name": owner_full_name,
        "owner_email": owner_email,
        "owner_mobile": owner_mobile,
    }

    context = {
        "invoice": invoice_data,
        "tenant": tenant_data,
        "raw_invoice": invoice,
        "raw_tenant": tenant,
        "generated_at": datetime.now(timezone.utc),
    }

    logger.info("Rendering invoice receipt template for invoice %s (tenant: %s)", invoice_number, tenant_name)
    template = _jinja_env.get_template("invoice_receipt.html")
    rendered_html = template.render(context)

    logger.info("Compiling PDF byte stream via WeasyPrint for invoice %s", invoice_number)
    pdf_bytes = HTML(string=rendered_html).write_pdf()
    logger.info(
        "Successfully compiled PDF receipt for %s (%d bytes)",
        invoice_number,
        len(pdf_bytes),
    )

    return pdf_bytes
