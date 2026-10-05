"""
Legacy Data Bridge & System Resource Excel Parser (REM-P7 / Sprint 7)

Custom parser to ingest historical "System Resource.xlsx" workbooks and absorb
their data into the PostgreSQL architecture (WeighbridgeTicket, Material, ResPartner,
StockPicking, TransporterLedger) with strict transactional safety, idempotency,
and Decimal ROUND_HALF_UP math.
"""

from __future__ import annotations

import io
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import models
from backend.app.domains.inventory.models import Material


# ------------------------------------------------------------------------------
# Rounding & Conversion Utilities (Enforcing ROUND_HALF_UP)
# ------------------------------------------------------------------------------

def round_currency(val: Any) -> Optional[Decimal]:
    """Round monetary values to 2 decimal places using ROUND_HALF_UP."""
    if val is None:
        return None
    val_str = str(val).strip().replace(",", "")
    if not val_str or val_str.lower() in ["none", "null", "nan", "-", ""]:
        return None
    try:
        return Decimal(val_str).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None


def round_quantity(val: Any, places: int = 4) -> Optional[Decimal]:
    """Round weight or quantity values using ROUND_HALF_UP."""
    if val is None:
        return None
    val_str = str(val).strip().replace(",", "")
    if not val_str or val_str.lower() in ["none", "null", "nan", "-", ""]:
        return None
    try:
        target = Decimal("10") ** -places
        return Decimal(val_str).quantize(target, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None


from backend.app.services.custom_fields import (  # noqa: E402
    register_discovered_fields,
    sanitize_attributes,
    slugify_key,
)


def normalize_header(header: Any) -> str:
    """Normalize Arabic and English column headers for fuzzy matching."""
    if not header:
        return ""
    h = str(header).strip().lower()
    # Normalize Arabic diacritics and letters
    h = re.sub(r"[\u064B-\u065F\u0670]", "", h)
    h = re.sub(r"[إأآا]", "ا", h)
    h = re.sub(r"[ة]", "ه", h)
    h = re.sub(r"[ى]", "ي", h)
    h = re.sub(r"[^\w\s]", " ", h)
    h = re.sub(r"\s+", " ", h).strip()
    return h


# ------------------------------------------------------------------------------
# Canonical Header Matching Map
# ------------------------------------------------------------------------------

HEADER_KEYWORDS: Dict[str, List[str]] = {
    "ticket_number": [
        "رقم تذكرة الميزان", "رقم تذكره الميزان", "رقم التذكرة", "رقم التذكره",
        "تذكرة الميزان", "تذكره الميزان", "التذكرة", "التذكره", "رقم البسكول",
        "ticket no", "ticket number", "scale ticket no", "scale ticket", "ticket"
    ],
    "truck_number": [
        "رقم الشاحنة", "رقم الشاحنه", "الشاحنة", "الشاحنه", "رقم اللوحة",
        "رقم اللوحه", "اللوحة", "اللوحه", "truck no", "truck number",
        "plate number", "plate no", "truck"
    ],
    "service_supplier": [
        "اسم الناقل المقاول", "اسم الناقل", "الناقل", "المقاول", "مورد الخدمة",
        "موردي الخدمات", "شركة النقل", "transporter name", "transporter",
        "service supplier", "carrier", "contractor"
    ],
    "material_supplier": [
        "مصدر التحميل الكساره", "مصدر التحميل الكسارة", "مصدر التحميل",
        "الكساره", "الكسارة", "مورد المواد", "موردي المواد", "المورد",
        "crusher name", "crusher", "loading source", "material supplier", "quarry"
    ],
    "customer": [
        "العميل المستلم", "العميل", "اسم العميل", "شركة الخرسانة", "العملاء",
        "المشتري", "destination customer", "customer name", "customer", "client", "buyer"
    ],
    "material_type": [
        "نوع الماده", "نوع المادة", "الماده", "المادة", "المنتج", "الصنف",
        "نوع الصنف", "اسم الماده", "اسم المادة", "material type", "material",
        "product name", "product", "item"
    ],
    "loading_date": [
        "تاريخ التحميل", "التاريخ", "تاريخ الرحله", "تاريخ الرحلة", "تاريخ العمل",
        "loading date", "date", "trip date"
    ],
    "loading_invoice_no": [
        "رقم فاتورة التحميل", "رقم فاتوره التحميل", "فاتورة التحميل", "فاتوره التحميل",
        "loading invoice no", "loading invoice", "crusher invoice"
    ],
    "receipt_invoice_no": [
        "رقم فاتورة الاستلام", "رقم فاتوره الاستلام", "فاتورة الاستلام", "فاتوره الاستلام",
        "receipt invoice no", "receipt invoice", "customer invoice"
    ],
    "gross_weight": [
        "الوزن الاجمالي", "الوزن الإجمالي", "الوزن المحمل", "وزن التحميل",
        "gross weight", "qty loaded", "loaded weight", "gross wt"
    ],
    "tare_weight": [
        "الوزن الفارغ", "وزن الفارغ", "الفارغ", "tare weight", "tare wt", "tare"
    ],
    "net_weight": [
        "الصافي", "الوزن الصافي", "صافي الوزن", "الوزن المفرغ", "وزن التفريغ",
        "الوزن المستلم", "الكمية المستلمة", "الكميه المستلمه", "net weight",
        "qty delivered", "delivered weight", "net wt"
    ],
    "uom": [
        "الوحدة", "الوحده", "وحدة القياس", "وحده القياس", "uom", "unit of measure", "unit"
    ],
    "sales_amount": [
        "قيمة المبيعات بدون ضريبة", "قيمه المبيعات بدون ضريبه", "قيمة المبيعات",
        "قيمه المبيعات", "المبيعات بدون ضريبه", "المبيعات", "sales amount", "subtotal"
    ],
    "vat_amount": [
        "ضريبة القيمة المضافة 15", "ضريبه القيمه المضافه 15", "ضريبة القيمة المضافة",
        "ضريبه القيمه المضافه", "الضريبه", "الضريبة", "vat amount", "vat 15", "vat", "tax"
    ],
    "total_sales": [
        "اجمالي المبيعات ر س", "اجمالي المبيعات", "إجمالي المبيعات", "المجموع مع الضريبة",
        "total sales", "total amount", "gross sales", "total"
    ],
    "purchases_cost": [
        "تكلفة المشتريات", "تكلفه المشتريات", "تكلفة الشراء", "المشتريات",
        "purchases cost", "purchase cost", "material cost"
    ],
    "crusher_payment": [
        "حساب الكسارة", "حساب الكساره", "مستحقات الكسارة", "مستحقات الكساره",
        "crusher payment", "quarry payment"
    ],
    "net_profit": [
        "صافي الربح", "الربح الصافي", "الربح", "net profit", "margin", "profit"
    ],
    "notes": [
        "الملاحظات", "ملاحظات", "بيان", "البيان", "notes", "remarks", "description"
    ],
}


def match_canonical_column(raw_header: Any) -> Optional[str]:
    """Map a raw header to its canonical field name with exact pass first."""
    norm = normalize_header(raw_header)
    if not norm:
        return None

    # Pass 1: Exact normalized match across all field synonyms
    for field, synonyms in HEADER_KEYWORDS.items():
        for syn in synonyms:
            if normalize_header(syn) == norm:
                return field

    # Pass 2: Whole word / token subset match
    norm_words = set(norm.split())
    for field, synonyms in HEADER_KEYWORDS.items():
        for syn in synonyms:
            syn_norm = normalize_header(syn)
            syn_words = set(syn_norm.split())
            if syn_words and syn_words.issubset(norm_words):
                return field

    return None


# ------------------------------------------------------------------------------
# Legacy Data Bridge Service
# ------------------------------------------------------------------------------

class LegacyImportService:
    def __init__(self, db: Session, company_id: uuid.UUID):
        self.db = db
        self.company_id = company_id
        self._partner_cache: Dict[Tuple[str, str], uuid.UUID] = {}
        self._material_cache: Dict[str, uuid.UUID] = {}
        self._product_cache: Dict[str, uuid.UUID] = {}

    def get_or_create_partner(self, name: str, partner_type: str) -> uuid.UUID:
        """Find or create a ResPartner safely within the current company."""
        clean_name = name.strip()
        cache_key = (clean_name.lower(), partner_type)
        if cache_key in self._partner_cache:
            return self._partner_cache[cache_key]

        partner = self.db.scalar(
            select(models.ResPartner).where(
                models.ResPartner.company_id == self.company_id,
                models.ResPartner.name.ilike(clean_name),
            )
        )
        if not partner:
            partner = models.ResPartner(
                company_id=self.company_id,
                name=clean_name,
                partner_type=partner_type,
                is_active=True,
            )
            self.db.add(partner)
            self.db.flush()

        self._partner_cache[cache_key] = partner.id
        return partner.id

    def get_or_create_material(self, name: str, uom: str = "MT", standard_cost: Optional[Decimal] = None) -> uuid.UUID:
        """Find or create a Material (Inventory domain) and mirror ProductProduct."""
        clean_name = name.strip()
        cache_key = clean_name.lower()
        if cache_key in self._material_cache:
            return self._material_cache[cache_key]

        cost = standard_cost or Decimal("0.0000")
        material = self.db.scalar(
            select(Material).where(
                Material.company_id == self.company_id,
                Material.name.ilike(clean_name),
            )
        )
        if not material:
            short_slug = re.sub(r"[^A-Za-z0-9]", "", clean_name)[:8].upper() or "MAT"
            code = f"{short_slug}-{uuid.uuid4().hex[:6].upper()}"
            material = Material(
                id=uuid.uuid4(),
                tenant_id=self.company_id,
                company_id=self.company_id,
                code=code,
                name=clean_name,
                category="RAW_MATERIAL",
                primary_uom=uom,
                valuation_method="MOVING_AVERAGE",
                standard_cost=cost,
                current_moving_avg_cost=cost,
                is_active=True,
            )
            self.db.add(material)
            self.db.flush()

        # Mirror in ProductProduct for catalog parity
        product = self.db.scalar(
            select(models.ProductProduct).where(
                models.ProductProduct.company_id == self.company_id,
                models.ProductProduct.name.ilike(clean_name),
            )
        )
        if not product:
            product = models.ProductProduct(
                id=uuid.uuid4(),
                company_id=self.company_id,
                sku=f"SKU-{uuid.uuid4().hex[:8].upper()}",
                name=clean_name,
                product_type="storable",
                unit_of_measure=uom,
                standard_cost=cost,
                sale_price=Decimal("0.0000"),
                is_active=True,
            )
            self.db.add(product)
            self.db.flush()

        self._material_cache[cache_key] = material.id
        return material.id

    def get_or_create_picking(self, reference: str, partner_id: Optional[uuid.UUID] = None) -> uuid.UUID:
        """Find or create a StockPicking for the ticket FK constraint."""
        picking = self.db.scalar(
            select(models.StockPicking).where(
                models.StockPicking.company_id == self.company_id,
                models.StockPicking.reference == reference,
            )
        )
        if not picking:
            picking = models.StockPicking(
                id=uuid.uuid4(),
                company_id=self.company_id,
                reference=reference,
                picking_type="incoming",
                state="done",
                partner_id=partner_id,
                completed_at=datetime.now(timezone.utc),
            )
            self.db.add(picking)
            self.db.flush()
        return picking.id

    def import_excel_bytes(self, file_bytes: bytes, filename: str = "System Resource.xlsx") -> Dict[str, Any]:
        """
        Parses System Resource.xlsx (or any historical workbook) and absorbs its data.
        Applies strict database transactions, duplicate prevention/update idempotency,
        and ROUND_HALF_UP financial math.
        """
        bio = io.BytesIO(file_bytes)
        try:
            wb = openpyxl.load_workbook(bio, data_only=True)
        except Exception as exc:
            return {
                "success": False,
                "error": f"Failed to read Excel workbook: {str(exc)}",
                "imported_count": 0,
                "updated_count": 0,
                "skipped_count": 0,
            }

        # Locate relevant worksheet
        target_sheet = None
        preferred_names = ["قاعدة البيانات الشاملة", "system resource", "operations", "العمليات", "sheet1"]
        for sheetname in wb.sheetnames:
            norm_name = normalize_header(sheetname)
            if any(pref in norm_name for pref in preferred_names):
                target_sheet = wb[sheetname]
                break
        if target_sheet is None:
            target_sheet = wb.active

        # Scan for header row (check first 10 rows)
        header_row_idx = None
        column_mapping: Dict[int, str] = {}  # col_idx -> canonical_key
        extra_mapping: Dict[int, Tuple[str, str]] = {}  # col_idx -> (custom field key, original header)

        for r in range(1, min(15, target_sheet.max_row + 1)):
            matched_keys = 0
            temp_map: Dict[int, str] = {}
            temp_extra: Dict[int, Tuple[str, str]] = {}
            for col in range(1, target_sheet.max_column + 1):
                val = target_sheet.cell(row=r, column=col).value
                canonical = match_canonical_column(val)
                if canonical:
                    temp_map[col] = canonical
                    matched_keys += 1
                elif val is not None and str(val).strip():
                    custom_key = slugify_key(val)
                    if custom_key:
                        temp_extra[col] = (custom_key, str(val).strip())
            if matched_keys >= 2:
                header_row_idx = r
                column_mapping = temp_map
                extra_mapping = temp_extra
                break

        if header_row_idx is None:
            return {
                "success": False,
                "error": "Could not identify operational column headers in the uploaded Excel workbook.",
                "imported_count": 0,
                "updated_count": 0,
                "skipped_count": 0,
            }

        imported_count = 0
        updated_count = 0
        skipped_count = 0
        errors: List[str] = []
        imported_ticket_ids: List[str] = []

        BATCH_SIZE = 50
        discovered_fields: Dict[str, Tuple[str, Any]] = {}

        # Iterate rows
        for row_idx in range(header_row_idx + 1, target_sheet.max_row + 1):
            row_data: Dict[str, Any] = {}
            raw_cells: Dict[str, Any] = {}
            extra_values: Dict[str, Any] = {}
            has_data = False

            for col_idx, canonical in column_mapping.items():
                cell_val = target_sheet.cell(row=row_idx, column=col_idx).value
                if cell_val is not None:
                    has_data = True
                row_data[canonical] = cell_val
                raw_cells[f"col_{col_idx}"] = str(cell_val) if cell_val is not None else ""

            # Unrecognised columns are preserved as dynamic custom attributes rather than dropped.
            for col_idx, (custom_key, header_text) in extra_mapping.items():
                cell_val = target_sheet.cell(row=row_idx, column=col_idx).value
                if cell_val is None or (isinstance(cell_val, str) and not cell_val.strip()):
                    continue
                has_data = True
                extra_values[custom_key] = cell_val
                discovered_fields.setdefault(custom_key, (header_text, cell_val))

            if not has_data:
                continue

            # Isolated row transaction
            savepoint = self.db.begin_nested()
            try:
                # 1. Ticket & Truck Identification
                raw_ticket = row_data.get("ticket_number")
                if raw_ticket:
                    ticket_no = str(raw_ticket).strip()
                else:
                    ticket_no = f"TK-SYS-{self.company_id.hex[:4]}-{row_idx}"

                raw_truck = row_data.get("truck_number")
                truck_no = str(raw_truck).strip() if raw_truck else "TRK-LEGACY"

                # 2. Date parsing
                raw_date = row_data.get("loading_date")
                parsed_date = datetime.now(timezone.utc)
                if isinstance(raw_date, datetime):
                    parsed_date = raw_date
                elif isinstance(raw_date, str) and raw_date.strip():
                    try:
                        parsed_date = datetime.fromisoformat(raw_date.strip())
                    except ValueError:
                        pass

                # 3. Weights calculation with ROUND_HALF_UP & constraint integrity
                raw_gross = round_quantity(row_data.get("gross_weight"), 4)
                raw_tare = round_quantity(row_data.get("tare_weight"), 4)
                raw_net = round_quantity(row_data.get("net_weight"), 4)

                gross_wt = raw_gross
                tare_wt = raw_tare
                net_wt = raw_net

                if net_wt is not None and gross_wt is None:
                    tare_wt = tare_wt or Decimal("0.0000")
                    gross_wt = (net_wt + tare_wt).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                elif gross_wt is not None and tare_wt is not None and net_wt is None:
                    if gross_wt < tare_wt:
                        gross_wt, tare_wt = tare_wt, gross_wt
                    net_wt = (gross_wt - tare_wt).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                elif gross_wt is not None and net_wt is not None and tare_wt is None:
                    if gross_wt >= net_wt:
                        tare_wt = (gross_wt - net_wt).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    else:
                        tare_wt = Decimal("0.0000")
                        gross_wt = net_wt

                # Invariant checks for DB check constraint (gross_weight >= tare_weight and net_weight = gross_weight - tare_weight)
                gross_wt = gross_wt or Decimal("0.0000")
                tare_wt = tare_wt or Decimal("0.0000")
                if gross_wt < tare_wt:
                    gross_wt, tare_wt = tare_wt, gross_wt
                net_wt = (gross_wt - tare_wt).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                # Wastage metrics
                qty_loaded = gross_wt
                qty_delivered = net_wt
                qty_wastage = Decimal("0.0000")
                wastage_pct = Decimal("0.0000")
                if qty_loaded > qty_delivered and qty_loaded > Decimal("0.0000"):
                    qty_wastage = (qty_loaded - qty_delivered).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    wastage_pct = ((qty_wastage / qty_loaded) * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                # 4. Financial Calculations with ROUND_HALF_UP
                sales_amount = round_currency(row_data.get("sales_amount"))
                vat_amount = round_currency(row_data.get("vat_amount"))
                total_sales = round_currency(row_data.get("total_sales"))
                purchases_cost = round_currency(row_data.get("purchases_cost"))
                crusher_payment = round_currency(row_data.get("crusher_payment"))
                net_profit = round_currency(row_data.get("net_profit"))

                # Recalculate missing figures using ROUND_HALF_UP
                if sales_amount is not None:
                    if vat_amount is None:
                        vat_amount = (sales_amount * Decimal("0.15")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    if total_sales is None:
                        total_sales = (sales_amount + vat_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                elif total_sales is not None:
                    sales_amount = (total_sales / Decimal("1.15")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    vat_amount = (total_sales - sales_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                if purchases_cost is not None and net_profit is None and sales_amount is not None:
                    net_profit = (sales_amount - purchases_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                # 5. Entity resolution (ResPartner, Material)
                srv_name = str(row_data.get("service_supplier") or "").strip()
                mat_supp_name = str(row_data.get("material_supplier") or "").strip()
                cust_name = str(row_data.get("customer") or "").strip()
                mat_type = str(row_data.get("material_type") or "Subbase").strip()
                uom_val = str(row_data.get("uom") or "MT").strip()

                srv_partner_id = self.get_or_create_partner(srv_name, "service_supplier") if srv_name else None
                mat_supp_id = self.get_or_create_partner(mat_supp_name, "raw_materials_supplier") if mat_supp_name else None
                cust_partner_id = self.get_or_create_partner(cust_name, "customer") if cust_name else None

                material_id = self.get_or_create_material(mat_type, uom=uom_val, standard_cost=purchases_cost)

                # 6. StockPicking resolution
                primary_partner_id = cust_partner_id or mat_supp_id or srv_partner_id
                picking_id = self.get_or_create_picking(f"PICK-{ticket_no}", primary_partner_id)

                # 7. WeighbridgeTicket: Safe Persistence & Idempotency
                existing_ticket = self.db.scalar(
                    select(models.WeighbridgeTicket).where(
                        models.WeighbridgeTicket.company_id == self.company_id,
                        models.WeighbridgeTicket.ticket_number == ticket_no,
                    )
                )

                if existing_ticket:
                    # Idempotent update
                    existing_ticket.truck_number = truck_no
                    existing_ticket.gross_weight = gross_wt
                    existing_ticket.tare_weight = tare_wt
                    existing_ticket.net_weight = net_wt
                    existing_ticket.uom = uom_val
                    existing_ticket.unit_of_measure = f"{uom_val} طن"
                    existing_ticket.weighed_in_at = parsed_date
                    existing_ticket.material_supplier_name = mat_supp_name or existing_ticket.material_supplier_name
                    existing_ticket.service_supplier_name = srv_name or existing_ticket.service_supplier_name
                    existing_ticket.destination_customer_name = cust_name or existing_ticket.destination_customer_name
                    existing_ticket.loading_invoice_no = str(row_data.get("loading_invoice_no") or existing_ticket.loading_invoice_no or "")
                    existing_ticket.receipt_invoice_no = str(row_data.get("receipt_invoice_no") or existing_ticket.receipt_invoice_no or "")
                    existing_ticket.material_type = mat_type
                    existing_ticket.qty_loaded = qty_loaded
                    existing_ticket.qty_delivered = qty_delivered
                    existing_ticket.qty_wastage = qty_wastage
                    existing_ticket.wastage_percentage = wastage_pct
                    existing_ticket.sales_amount = sales_amount or existing_ticket.sales_amount
                    existing_ticket.vat_amount = vat_amount or existing_ticket.vat_amount
                    existing_ticket.total_sales = total_sales or existing_ticket.total_sales
                    existing_ticket.purchases_cost = purchases_cost or existing_ticket.purchases_cost
                    existing_ticket.crusher_payment = crusher_payment or existing_ticket.crusher_payment
                    existing_ticket.net_profit = net_profit or existing_ticket.net_profit
                    existing_ticket.operation_month = parsed_date.month
                    existing_ticket.operation_year = parsed_date.year
                    existing_ticket.notes = str(row_data.get("notes") or existing_ticket.notes or "")
                    existing_ticket.raw_legacy_data = raw_cells
                    if extra_values:
                        existing_ticket.custom_attributes = {
                            **(existing_ticket.custom_attributes or {}),
                            **sanitize_attributes(extra_values),
                        }
                    target_ticket = existing_ticket
                    updated_count += 1
                else:
                    # New ticket creation
                    new_ticket = models.WeighbridgeTicket(
                        id=uuid.uuid4(),
                        company_id=self.company_id,
                        ticket_number=ticket_no,
                        picking_id=picking_id,
                        truck_number=truck_no,
                        gross_weight=gross_wt,
                        tare_weight=tare_wt,
                        net_weight=net_wt,
                        uom=uom_val,
                        unit_of_measure=f"{uom_val} طن",
                        weighed_in_at=parsed_date,
                        material_supplier_name=mat_supp_name,
                        service_supplier_name=srv_name,
                        destination_customer_name=cust_name,
                        loading_invoice_no=str(row_data.get("loading_invoice_no") or ""),
                        receipt_invoice_no=str(row_data.get("receipt_invoice_no") or ""),
                        material_type=mat_type,
                        qty_loaded=qty_loaded,
                        qty_delivered=qty_delivered,
                        qty_wastage=qty_wastage,
                        wastage_percentage=wastage_pct,
                        sales_amount=sales_amount,
                        vat_amount=vat_amount,
                        total_sales=total_sales,
                        purchases_cost=purchases_cost,
                        crusher_payment=crusher_payment,
                        net_profit=net_profit,
                        operation_month=parsed_date.month,
                        operation_year=parsed_date.year,
                        notes=str(row_data.get("notes") or ""),
                        raw_legacy_data=raw_cells,
                        custom_attributes=sanitize_attributes(extra_values),
                    )
                    self.db.add(new_ticket)
                    target_ticket = new_ticket
                    imported_count += 1

                self.db.flush()

                # 8. TransporterLedger Entry
                if srv_partner_id:
                    op_id = f"OP-{ticket_no}"
                    existing_ledger = self.db.scalar(
                        select(models.TransporterLedger).where(
                            models.TransporterLedger.company_id == self.company_id,
                            models.TransporterLedger.operation_id == op_id,
                        )
                    )
                    if not existing_ledger:
                        ledger_entry = models.TransporterLedger(
                            id=uuid.uuid4(),
                            company_id=self.company_id,
                            transporter_id=srv_partner_id,
                            operation_id=op_id,
                            expected_qty=qty_loaded,
                            delivered_qty=qty_delivered,
                            loss_percentage=min(Decimal("100"), max(Decimal("0"), wastage_pct)),
                            ai_risk_assessment="Imported from historical System Resource workbook.",
                        )
                        self.db.add(ledger_entry)

                savepoint.commit()
                imported_ticket_ids.append(str(target_ticket.id))

                if (imported_count + updated_count) % BATCH_SIZE == 0:
                    self.db.commit()

            except Exception as row_exc:
                savepoint.rollback()
                errors.append(f"Row {row_idx}: {str(row_exc)}")
                skipped_count += 1
                continue

        # Final commit for all processed batches
        custom_fields_registered = 0
        try:
            if discovered_fields:
                custom_fields_registered = register_discovered_fields(
                    self.db,
                    self.company_id,
                    "weighbridge_ticket",
                    [(key, label, sample) for key, (label, sample) in discovered_fields.items()],
                )
            self.db.commit()
        except Exception as commit_exc:
            self.db.rollback()
            return {
                "success": False,
                "error": f"Database commit failed: {str(commit_exc)}",
                "imported_count": 0,
                "updated_count": 0,
                "skipped_count": skipped_count,
            }

        return {
            "success": True,
            "filename": filename,
            "imported_count": imported_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "records_processed": imported_count + updated_count + skipped_count,
            "entities_created": {
                "tickets": imported_count,
                "partners": len(self._partner_cache),
                "materials": len(self._material_cache),
            },
            "imported_ticket_ids": imported_ticket_ids,
            "custom_fields_registered": custom_fields_registered,
            "custom_field_keys": sorted(discovered_fields),
            "errors": errors,
        }
