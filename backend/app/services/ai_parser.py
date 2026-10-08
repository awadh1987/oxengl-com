"""
AI Document Parsing & OCR Ingestion Service (Phase 9 - Part 2).
Extracts structured financial invoice/receipt metadata from unstructured text,
computes mathematical confidence scores, and routes proposed entries through
the SafetyBoundaryEngine with Human-In-The-Loop governance.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import models
from backend.schemas import ParsedInvoiceData, ParsedInvoiceLineItem
from backend.services.ai_governance import ai_governance_engine

logger = logging.getLogger(__name__)


class AIDocumentParser:
    """
    Practical AI automation service parsing unstructured invoice/receipt text
    and safely constructing balanced double-entry GL proposals.
    """

    def parse_invoice_text(self, raw_text: str, vendor_hint: str | None = None) -> ParsedInvoiceData:
        """
        Parses unstructured document text (OCR output or raw transcript)
        extracting vendor, invoice identifiers, line items, and monetary totals.
        """
        lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
        warnings: list[str] = []

        # 1. Vendor Extraction
        vendor_name = vendor_hint
        if not vendor_name:
            vendor_match = re.search(
                r"(?:Vendor|Supplier|Seller|From|Company|Billed By)[:\s]+([^\n\r,]+)",
                raw_text,
                re.IGNORECASE,
            )
            if vendor_match:
                vendor_name = vendor_match.group(1).strip()
            elif lines:
                # Fallback to first line if it looks like a business name
                first_line = lines[0]
                if not any(k in first_line.lower() for k in ("invoice", "tax", "bill", "date", "total")):
                    vendor_name = first_line[:64].strip()

        # 2. Tax ID / VAT Number
        tax_id = None
        tax_match = re.search(
            r"(?:VAT\s*(?:No|Number|ID)?|Tax\s*(?:ID|No)?|TRN)[:\s]*([0-9]{10,15})",
            raw_text,
            re.IGNORECASE,
        )
        if tax_match:
            tax_id = tax_match.group(1).strip()

        # 3. Invoice Number
        invoice_number = None
        inv_match = re.search(
            r"(?:Invoice\s*(?:No|Number|#)?|Bill\s*(?:No|#)?|Receipt\s*(?:No|#)?)[:\s]*([A-Za-z0-9\-_/]+)",
            raw_text,
            re.IGNORECASE,
        )
        if inv_match:
            invoice_number = inv_match.group(1).strip()
        else:
            # Fallback generic pattern
            gen_match = re.search(r"\b(INV-[0-9A-Za-z\-]+)\b", raw_text)
            if gen_match:
                invoice_number = gen_match.group(1).strip()

        # 4. Invoice Date
        invoice_date = None
        date_match = re.search(
            r"(?:Date|Dated|Invoice Date)[:\s]*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})",
            raw_text,
            re.IGNORECASE,
        )
        if date_match:
            invoice_date = date_match.group(1).strip()
        else:
            invoice_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # 5. Currency
        currency = "SAR"
        if "USD" in raw_text.upper() or "$" in raw_text:
            currency = "USD"
        elif "EUR" in raw_text.upper() or "€" in raw_text:
            currency = "EUR"

        # 6. Line Items Extraction
        line_items: list[ParsedInvoiceLineItem] = []
        ignored_header_prefixes = (
            "vendor", "supplier", "seller", "from", "billed by", "company",
            "vat", "tax", "trn", "invoice", "bill", "receipt", "date",
            "subtotal", "sub-total", "grand total", "net payable", "total amount", "total due", "total"
        )

        item_regex = re.compile(
            r"^(?P<desc>[A-Za-z0-9\s\-_\.]+?)\s*(?:-|–|,)\s*(?:Qty|Quantity)?[:\s]*(?P<qty>[0-9]+(?:\.[0-9]+)?)[,\s]+(?:Unit|Price)?[:\s]*(?P<unit>[0-9]+(?:\.[0-9]+)?)[,\s]+(?:Total|Amt|Amount)?[:\s]*(?P<total>[0-9]+(?:\.[0-9]+)?)",
            re.IGNORECASE,
        )

        for line in lines:
            line_lower = line.lower().strip()
            # Skip any header or totals line
            if any(line_lower.startswith(p) for p in ignored_header_prefixes):
                continue
            if not any(indicator in line_lower for indicator in ("qty", "unit", "total", "–", "-")):
                continue

            match = item_regex.search(line)
            if match:
                desc = match.group("desc").strip()
                try:
                    q = Decimal(match.group("qty"))
                    u = Decimal(match.group("unit"))
                    t = Decimal(match.group("total"))
                except Exception:
                    continue
                if len(desc) >= 2 and q > 0 and t > 0:
                    line_items.append(
                        ParsedInvoiceLineItem(
                            description=desc,
                            quantity=q,
                            unit_cost=u,
                            line_total=t,
                            tax_amount=Decimal(str(round(float(t) * 0.15, 2))) if currency == "SAR" else Decimal("0"),
                        )
                    )

        # 7. Totals Extraction
        subtotal = Decimal("0.00")
        tax_total = Decimal("0.00")
        grand_total = Decimal("0.00")

        # Subtotal: explicitly match subtotal keywords
        sub_match = re.search(
            r"(?:Subtotal|Sub-total|Total\s+Excl\.?\s*VAT|Amount\s+before\s+tax)[:\s]*([0-9]+(?:\.[0-9]+)?)",
            raw_text,
            re.IGNORECASE,
        )
        if sub_match:
            try:
                subtotal = Decimal(sub_match.group(1))
            except Exception:
                pass

        # Tax: explicitly match VAT / Tax keywords
        tax_total_match = re.search(
            r"(?:VAT\s*(?:\(15%\))?|Total\s+VAT|Tax\s*(?:Amount)?|Total\s+Tax)[:\s]*([0-9]+(?:\.[0-9]+)?)",
            raw_text,
            re.IGNORECASE,
        )
        if tax_total_match:
            try:
                tax_total = Decimal(tax_total_match.group(1))
            except Exception:
                pass

        # Grand Total: Highest precedence to "Grand Total", "Total Amount", "Total Due", "Net Payable"
        grand_match = re.search(
            r"(?:Grand\s+Total|Total\s+Amount|Total\s+Due|Net\s+Payable)[:\s]*([0-9]+(?:\.[0-9]+)?)",
            raw_text,
            re.IGNORECASE,
        )
        if grand_match:
            try:
                grand_total = Decimal(grand_match.group(1))
            except Exception:
                pass
        else:
            # Fallback: standalone line starting with Total: ...
            standalone_total = re.search(r"^\s*Total[:\s]*([0-9]+(?:\.[0-9]+)?)", raw_text, re.IGNORECASE | re.MULTILINE)
            if standalone_total:
                try:
                    grand_total = Decimal(standalone_total.group(1))
                except Exception:
                    pass

        # Fallback derivations if totals are partially extracted
        if subtotal == Decimal("0.00") and line_items:
            subtotal = sum((item.line_total for item in line_items), Decimal("0.00"))

        if tax_total == Decimal("0.00") and subtotal > Decimal("0.00") and currency == "SAR":
            if grand_total > subtotal:
                tax_total = grand_total - subtotal
            else:
                tax_total = Decimal(str(round(float(subtotal) * 0.15, 2)))

        if grand_total == Decimal("0.00") and subtotal > Decimal("0.00"):
            grand_total = subtotal + tax_total

        # 8. Confidence Score Calculation
        confidence = self.calculate_confidence(
            vendor_name=vendor_name,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            line_items_count=len(line_items),
            subtotal=subtotal,
            tax_total=tax_total,
            grand_total=grand_total,
            warnings=warnings,
        )

        extracted_count = sum(
            1 for v in [vendor_name, tax_id, invoice_number, invoice_date, len(line_items) > 0, grand_total > 0] if v
        )

        return ParsedInvoiceData(
            vendor_name=vendor_name or "Unknown Supplier",
            vendor_tax_id=tax_id,
            invoice_number=invoice_number or f"UNKNOWN-{uuid.uuid4().hex[:6].upper()}",
            invoice_date=invoice_date,
            currency=currency,
            line_items=line_items,
            subtotal=subtotal,
            tax_total=tax_total,
            grand_total=grand_total,
            confidence_score=confidence,
            extracted_fields_count=extracted_count,
            warnings=warnings,
        )

    def calculate_confidence(
        self,
        vendor_name: str | None,
        invoice_number: str | None,
        invoice_date: str | None,
        line_items_count: int,
        subtotal: Decimal,
        tax_total: Decimal,
        grand_total: Decimal,
        warnings: list[str],
    ) -> Decimal:
        """
        Calculates a deterministic confidence score in [0.0, 1.0].
        Scores field completeness, mathematical coherence, and structural validity.
        """
        score = Decimal("0.40")

        if vendor_name and vendor_name != "Unknown Supplier":
            score += Decimal("0.15")
        else:
            warnings.append("Vendor name could not be reliably extracted from document")

        if invoice_number and not invoice_number.startswith("UNKNOWN-"):
            score += Decimal("0.15")
        else:
            warnings.append("Invoice number was not detected in document header")

        if invoice_date:
            score += Decimal("0.10")

        if line_items_count > 0:
            score += Decimal("0.10")

        # Mathematical consistency check
        if grand_total > Decimal("0.00"):
            math_diff = abs((subtotal + tax_total) - grand_total)
            if math_diff <= Decimal("0.05"):
                score += Decimal("0.10")
            else:
                score -= Decimal("0.35")
                warnings.append(
                    f"Mathematical discrepancy: Subtotal ({subtotal}) + Tax ({tax_total}) does not match Grand Total ({grand_total})"
                )
        else:
            score = Decimal("0.30")
            warnings.append("Document total is zero or missing")

        return max(Decimal("0.1000"), min(Decimal("0.9900"), score))

    def generate_draft_financial_proposal(
        self,
        company_id: uuid.UUID,
        parsed_data: ParsedInvoiceData,
        db: Session,
        journal_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """
        Constructs a balanced double-entry AccountMove dictionary:
        - Debit: Expense / Inventory (subtotal)
        - Debit: VAT Input / Tax Receivable (tax_total)
        - Credit: Accounts Payable (grand_total)
        """
        # Resolve standard chart of accounts
        from backend.main import account_by_code, journal_by_code

        expense_acc = account_by_code(db, company_id, "501000", "Cost of Goods Sold - Materials", "expense")
        vat_acc = account_by_code(db, company_id, "203000", "VAT Payable", "liability")
        ap_acc = account_by_code(db, company_id, "201000", "Accounts Payable - Raw Materials", "liability")

        target_journal_id = journal_id
        if not target_journal_id:
            journal = journal_by_code(db, company_id, "PURCH", "Purchase Journal", "purchase", "PUR-")
            target_journal_id = journal.id

        subtotal = parsed_data.subtotal
        tax_total = parsed_data.tax_total
        grand_total = parsed_data.grand_total

        # Re-verify perfect balance before proposing
        total_debits = subtotal + tax_total
        if abs(total_debits - grand_total) > Decimal("0.0001"):
            # Enforce balance by adjusting expense side to match grand total
            subtotal = grand_total - tax_total

        lines: list[dict[str, Any]] = [
            {
                "account_id": str(expense_acc.id),
                "name": f"AI Extracted Expense: {parsed_data.vendor_name} ({parsed_data.invoice_number})",
                "debit": float(subtotal),
                "credit": 0.0,
            }
        ]

        if tax_total > Decimal("0.00"):
            lines.append(
                {
                    "account_id": str(vat_acc.id),
                    "name": f"Input VAT (15%): {parsed_data.vendor_name}",
                    "debit": float(tax_total),
                    "credit": 0.0,
                }
            )

        lines.append(
            {
                "account_id": str(ap_acc.id),
                "name": f"Accounts Payable: {parsed_data.vendor_name}",
                "debit": 0.0,
                "credit": float(grand_total),
            }
        )

        return {
            "journal_id": str(target_journal_id),
            "name": f"AI-INV-{uuid.uuid4().hex[:6].upper()}",
            "move_type": "in_invoice",
            "ref": f"Invoice {parsed_data.invoice_number} from {parsed_data.vendor_name}",
            "lines": lines,
        }

    def process_and_govern_invoice(
        self,
        company_id: uuid.UUID,
        user_id: uuid.UUID | None,
        document_text: str,
        db: Session,
        vendor_hint: str | None = None,
        propose_financial_entry: bool = True,
        journal_id: uuid.UUID | None = None,
    ) -> tuple[ParsedInvoiceData, Optional[models.AIGovernanceLog], Optional[dict[str, Any]]]:
        """
        Main orchestration pipeline:
        1. Parse document text into structured invoice data.
        2. Compute confidence score.
        3. If requested, generate balanced draft GL proposal.
        4. Route extraction through SafetyBoundaryEngine to create audit log and HITL token.
        """
        parsed_data = self.parse_invoice_text(document_text, vendor_hint=vendor_hint)
        gov_log: Optional[models.AIGovernanceLog] = None
        proposal_dict: Optional[dict[str, Any]] = None

        if propose_financial_entry and parsed_data.grand_total > Decimal("0.00"):
            proposal_dict = self.generate_draft_financial_proposal(
                company_id=company_id,
                parsed_data=parsed_data,
                db=db,
                journal_id=journal_id,
            )

            # Route through SafetyBoundaryEngine
            gov_log = ai_governance_engine.validate_proposal(
                company_id=company_id,
                agent_name="ai_ocr_invoice_parser",
                action_type="POST_ACCOUNT_MOVE",
                proposal_payload=proposal_dict,
                confidence_score=parsed_data.confidence_score,
                prompt=document_text[:1000],
                user_id=user_id,
                db=db,
            )

        return parsed_data, gov_log, proposal_dict


ai_document_parser = AIDocumentParser()
