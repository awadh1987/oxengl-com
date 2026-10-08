"""
Universal Bulk Import Engine & Legacy Excel Parser (REM-P7)

Parses the legacy "قاعدة البيانات الشاملة" format (and variations) from Excel (.xlsx/.xls), CSV, or JSON
and maps it into the active ERP ecosystem.
Maps legacy Excel headers (like "الناقل" or "الكسارة") into universal database entities
(`service_suppliers` and `material_suppliers`), creating or linking ResPartner, StockLocation,
ProductProduct, StockPicking, StockMove, WeighbridgeTicket (extended superset), and TransporterLedger.
"""

from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Generator, Iterable, List, Optional, Tuple

import openpyxl
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import models


# ------------------------------------------------------------------------------
# Header Normalization & Mapping Dictionary
# ------------------------------------------------------------------------------

def normalize_header(header: str) -> str:
    """Normalize Arabic and English headers for fuzzy robust matching."""
    if not header:
        return ""
    h = str(header).strip().lower()
    # Normalize Arabic diacritics and letter variants
    h = re.sub(r"[\u064B-\u065F\u0670]", "", h)  # tashkeel
    h = re.sub(r"[إأآا]", "ا", h)
    h = re.sub(r"[ة]", "ه", h)
    h = re.sub(r"[ى]", "ي", h)
    # Remove punctuation and extra whitespace
    h = re.sub(r"[^\w\s]", " ", h)
    h = re.sub(r"\s+", " ", h).strip()
    return h


# Canonical field mapping dictionary: maps normalized variants to canonical field names
FIELD_MAPPINGS: Dict[str, List[str]] = {
    # Service Supplier / Transporter
    "service_supplier": [
        "اسم الناقل المقاول",
        "اسم الناقل",
        "الناقل",
        "المقاول",
        "مورد الخدمة",
        "موردي الخدمات",
        "شركة النقل",
        "transporter name",
        "transporter",
        "service supplier",
        "carrier",
        "contractor",
    ],
    # Material Supplier / Crusher
    "material_supplier": [
        "مصدر التحميل الكساره",
        "مصدر التحميل الكسارة",
        "مصدر التحميل",
        "الكساره",
        "الكسارة",
        "مورد المواد",
        "موردي المواد",
        "المورد",
        "crusher name",
        "crusher",
        "loading source",
        "material supplier",
        "quarry",
    ],
    # Customer / Client
    "customer": [
        "العميل المستلم",
        "العميل",
        "اسم العميل",
        "شركة الخرسانة",
        "العملاء",
        "المشتري",
        "destination customer",
        "customer name",
        "customer",
        "client",
        "buyer",
    ],
    # Material / Product
    "material_type": [
        "نوع الماده",
        "نوع المادة",
        "الماده",
        "المادة",
        "المنتج",
        "الصنف",
        "نوع الصنف",
        "اسم الماده",
        "material type",
        "material",
        "product name",
        "product",
        "item",
    ],
    # Truck / Plate
    "truck_no": [
        "رقم الشاحنه",
        "رقم الشاحنة",
        "الشاحنه",
        "الشاحنة",
        "رقم اللوحه",
        "رقم اللوحة",
        "اللوحه",
        "اللوحة",
        "truck no",
        "truck number",
        "plate number",
        "plate no",
    ],
    # Scale Ticket Number
    "scale_ticket_no": [
        "رقم تذكرة الميزان",
        "رقم تذكره الميزان",
        "تذكرة الميزان",
        "تذكره الميزان",
        "رقم التذكره",
        "رقم التذكرة",
        "التذكره",
        "التذكرة",
        "scale ticket no",
        "ticket no",
        "ticket number",
        "scale ticket",
    ],
    # Loading Date
    "loading_date": [
        "تاريخ التحميل",
        "التاريخ",
        "تاريخ الرحله",
        "تاريخ الرحلة",
        "تاريخ العمل",
        "loading date",
        "date",
        "trip date",
    ],
    # Loading Invoice Number
    "loading_invoice_no": [
        "رقم فاتورة التحميل",
        "رقم فاتوره التحميل",
        "فاتورة التحميل",
        "فاتوره التحميل",
        "loading invoice no",
        "loading invoice",
        "crusher invoice",
    ],
    # Receipt Invoice Number
    "receipt_invoice_no": [
        "رقم فاتورة الاستلام",
        "رقم فاتوره الاستلام",
        "فاتورة الاستلام",
        "فاتوره الاستلام",
        "receipt invoice no",
        "receipt invoice",
        "customer invoice",
    ],
    # Quantities and Weights
    "qty_loaded": [
        "الوزن المحمل mt طن",
        "الوزن المحمل طن",
        "الوزن المحمل",
        "الكميه المحمله",
        "الكمية المحملة",
        "وزن التحميل",
        "qty loaded",
        "loaded weight",
        "gross weight",
        "loaded mt",
    ],
    "qty_delivered": [
        "الصافي",
        "الوزن الصافي",
        "صافي الوزن",
        "الوزن المفرغ",
        "وزن التفريغ",
        "الوزن المستلم mt طن",
        "الوزن المستلم طن",
        "الوزن المستلم",
        "الكميه المستلمه",
        "الكمية المستلمة",
        "وزن الاستلام",
        "qty delivered",
        "delivered weight",
        "net weight",
        "delivered mt",
    ],
    "qty_wastage": [
        "الفاقد mt طن",
        "الفاقد طن",
        "الفاقد",
        "كميه الفاقد",
        "كمية الفاقد",
        "هدر الطريق",
        "qty wastage",
        "wastage weight",
        "loss mt",
    ],
    "wastage_percentage": [
        "نسبه الفاقد",
        "نسبة الفاقد",
        "نسبه الهدر",
        "نسبة الهدر",
        "الفاقد",
        "wastage percentage",
        "loss percentage",
        "wastage pct",
    ],
    # Financial fields
    "sales_amount": [
        "قيمة المبيعات بدون ضريبة",
        "قيمه المبيعات بدون ضريبه",
        "قيمة المبيعات",
        "قيمه المبيعات",
        "المبيعات بدون ضريبه",
        "المبيعات",
        "sales amount",
        "subtotal",
        "sales excl vat",
    ],
    "vat_amount": [
        "ضريبة القيمة المضافة 15",
        "ضريبه القيمه المضافه 15",
        "ضريبة القيمة المضافة",
        "ضريبه القيمه المضافه",
        "الضريبه",
        "الضريبة",
        "vat amount",
        "vat 15",
        "tax amount",
        "vat",
    ],
    "total_sales": [
        "اجمالي المبيعات ر س",
        "اجمالي المبيعات",
        "إجمالي المبيعات",
        "صافي المبيعات شامله الضريبه",
        "total sales",
        "total sales sar",
        "total amount",
        "gross sales",
    ],
    "purchases_cost": [
        "تكلفة الشراء من الكسارة",
        "تكلفه الشراء من الكساره",
        "تكلفة الشراء",
        "تكلفه الشراء",
        "تكلفة المشتريات",
        "المشتريات",
        "purchases cost",
        "crusher cost",
        "cost amount",
    ],
    "crusher_payment": [
        "حساب الكسارة",
        "حساب الكساره",
        "مستحقات الكسارة",
        "مستحقات الكساره",
        "المسدد للكسارة",
        "المسدد للكساره",
        "المسدد",
        "المدفوع للكساره",
        "المدفوع للكسارة",
        "crusher payment",
        "paid to crusher",
        "amount paid",
    ],
    "net_profit": [
        "صافي الربح التشغيلي",
        "صافي الربح",
        "الربح التشغيلي",
        "الربح",
        "net profit",
        "operating profit",
        "margin",
    ],
    "operation_month": [
        "الشهر",
        "شهر",
        "operation month",
        "month",
    ],
    "notes": [
        "ملاحظات",
        "ملاحظه",
        "الملاحظات",
        "notes",
        "remarks",
        "comments",
    ],
    "unit_of_measure": [
        "وحدة القياس",
        "وحده القياس",
        "الوحدة",
        "الوحده",
        "unit of measure",
        "uom",
        "unit",
    ],
}


def match_column_key(col_header: str) -> Optional[str]:
    """Match raw column header to canonical field name with precision."""
    norm = normalize_header(col_header)
    if not norm:
        return None

    # Pass 1: Strict exact matching across all canonical fields
    for canonical, variations in FIELD_MAPPINGS.items():
        for var in variations:
            if norm == normalize_header(var):
                return canonical

    # Pass 2: Longest substring / prefix match (more specific variants win)
    best_match: Optional[str] = None
    max_len = 0
    for canonical, variations in FIELD_MAPPINGS.items():
        for var in variations:
            nvar = normalize_header(var)
            if norm.startswith(nvar) or nvar.startswith(norm) or nvar in norm:
                if len(nvar) > max_len:
                    max_len = len(nvar)
                    best_match = canonical

    return best_match


def to_decimal(val: Any, default: Decimal = Decimal("0")) -> Decimal:
    """Safely convert any value to Decimal."""
    if val is None:
        return default
    if isinstance(val, (int, float, Decimal)):
        return Decimal(str(val))
    s = str(val).strip().replace(",", "").replace("%", "").replace("ر.س", "").replace("SAR", "").strip()
    if not s:
        return default
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return default


def stream_raw_rows_from_excel(file_bytes: bytes) -> Any:
    """Stream rows from Excel workbook (.xlsx or .xls) using openpyxl in read_only streaming mode."""
    wb = openpyxl.load_workbook(filename=io.BytesIO(file_bytes), read_only=True, data_only=True)
    try:
        sheet = wb.active
        row_iter = sheet.iter_rows(values_only=True)
        headers = None
        for row in row_iter:
            if not any(row):
                continue
            non_empty = [c for c in row if c is not None and str(c).strip()]
            if len(non_empty) >= 2:
                headers = [str(c).strip() if c is not None else f"col_{i}" for i, c in enumerate(row)]
                break
        if not headers:
            return

        for row in row_iter:
            if not any(row):
                continue
            row_dict = {}
            has_content = False
            for i, val in enumerate(row):
                if i < len(headers):
                    if val is not None:
                        row_dict[headers[i]] = val
                        if str(val).strip():
                            has_content = True
            if has_content:
                yield row_dict
    finally:
        wb.close()


def parse_raw_rows_from_excel(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Parse rows from Excel workbook into a list (wrapper over streaming parser)."""
    return list(stream_raw_rows_from_excel(file_bytes))


def stream_raw_rows_from_csv(file_bytes: bytes) -> Any:
    """Stream rows from CSV bytes, handling UTF-8, UTF-8-BOM, or fallback encodings."""
    for encoding in ["utf-8-sig", "utf-8", "cp1256", "iso-8859-1"]:
        try:
            text = file_bytes.decode(encoding)
            reader = csv.DictReader(io.StringIO(text))
            for r in reader:
                clean_row = {k.strip(): v for k, v in r.items() if k and v and str(v).strip()}
                if clean_row:
                    yield clean_row
            return
        except (UnicodeDecodeError, Exception):
            continue


def parse_raw_rows_from_csv(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Parse rows from CSV bytes into a list (wrapper over streaming parser)."""
    return list(stream_raw_rows_from_csv(file_bytes))


# ------------------------------------------------------------------------------
# Universal Bulk Import Engine
# ------------------------------------------------------------------------------

class BulkImportService:
    """
    Executes bulk import operations, mapping rows to the relational database
    while maintaining extended superset fidelity.
    """

    def __init__(self, db: Session, company_id: uuid.UUID):
        self.db = db
        self.company_id = company_id
        # In-memory ID caches for fast, memory-lean entity resolution
        self._partner_id_cache: Dict[Tuple[str, str], uuid.UUID] = {}
        self._location_id_cache: Dict[Tuple[str, str], uuid.UUID] = {}
        self._product_id_cache: Dict[str, uuid.UUID] = {}

    def get_or_create_partner_id(self, name: str, partner_type: str) -> uuid.UUID:
        """Resolve existing partner ID by name or create a new partner with appropriate type."""
        clean_name = name.strip()
        cache_key = (clean_name.lower(), partner_type)
        if cache_key in self._partner_id_cache:
            return self._partner_id_cache[cache_key]

        partner_id = self.db.scalar(
            select(models.ResPartner.id).where(
                models.ResPartner.company_id == self.company_id,
                models.ResPartner.name.ilike(clean_name),
            )
        )
        if partner_id is None:
            partner = models.ResPartner(
                company_id=self.company_id,
                name=clean_name,
                partner_type=partner_type,
                is_active=True,
            )
            self.db.add(partner)
            self.db.flush()
            partner_id = partner.id
        self._partner_id_cache[cache_key] = partner_id
        return partner_id

    def get_or_create_partner(self, name: str, partner_type: str) -> models.ResPartner:
        """Resolve existing partner model or create one (backwards compatibility)."""
        pid = self.get_or_create_partner_id(name, partner_type)
        return self.db.get(models.ResPartner, pid)

    def get_or_create_location_id(self, name: str, location_type: str) -> uuid.UUID:
        """Resolve existing stock location ID or create one."""
        clean_name = name.strip()
        cache_key = (clean_name.lower(), location_type)
        if cache_key in self._location_id_cache:
            return self._location_id_cache[cache_key]

        loc_id = self.db.scalar(
            select(models.StockLocation.id).where(
                models.StockLocation.company_id == self.company_id,
                models.StockLocation.name.ilike(clean_name),
            )
        )
        if loc_id is None:
            loc = models.StockLocation(
                company_id=self.company_id,
                name=clean_name,
                location_type=location_type,
                is_active=True,
            )
            self.db.add(loc)
            self.db.flush()
            loc_id = loc.id
        self._location_id_cache[cache_key] = loc_id
        return loc_id

    def get_or_create_location(self, name: str, location_type: str) -> models.StockLocation:
        """Resolve existing stock location model or create one (backwards compatibility)."""
        lid = self.get_or_create_location_id(name, location_type)
        return self.db.get(models.StockLocation, lid)

    def get_or_create_product_id(self, name: str) -> uuid.UUID:
        """Resolve existing product ID or create one."""
        clean_name = name.strip()
        cache_key = clean_name.lower()
        if cache_key in self._product_id_cache:
            return self._product_id_cache[cache_key]

        prod_id = self.db.scalar(
            select(models.ProductProduct.id).where(
                models.ProductProduct.company_id == self.company_id,
                models.ProductProduct.name.ilike(clean_name),
            )
        )
        if prod_id is None:
            sku_val = f"SKU-{uuid.uuid4().hex[:8].upper()}"
            prod = models.ProductProduct(
                company_id=self.company_id,
                sku=sku_val,
                name=clean_name,
                product_type="storable",
                sale_price=Decimal("0.0"),
                standard_cost=Decimal("0.0"),
                unit_of_measure="ton",
                is_active=True,
            )
            self.db.add(prod)
            self.db.flush()
            prod_id = prod.id
        self._product_id_cache[cache_key] = prod_id
        return prod_id

    def get_or_create_product(self, name: str) -> models.ProductProduct:
        """Resolve existing product model or create one (backwards compatibility)."""
        pid = self.get_or_create_product_id(name)
        return self.db.get(models.ProductProduct, pid)

    def map_row_to_canonical(self, raw_row: Dict[str, Any]) -> Dict[str, Any]:
        """Maps any arbitrary raw row dictionary into the canonical operational schema."""
        mapped: Dict[str, Any] = {}
        for col_name, val in raw_row.items():
            if val is None:
                continue
            canonical_field = match_column_key(str(col_name))
            if canonical_field:
                mapped[canonical_field] = val
            else:
                # Retain in extra raw data
                mapped.setdefault("_unmapped", {})[str(col_name)] = val
        return mapped

    def import_operations(self, raw_rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Processes and imports operations from legacy 'قاعدة البيانات الشاملة' rows.
        Streams rows and commits in batches with savepoints for maximum memory efficiency.
        Creates relational records (Picking, Move, WeighbridgeTicket, TransporterLedger).
        """
        imported_count = 0
        skipped_count = 0
        errors: List[str] = []
        imported_ticket_ids: List[str] = []
        BATCH_SIZE = 100

        for idx, raw_row in enumerate(raw_rows):
            savepoint = self.db.begin_nested()
            try:
                mapped = self.map_row_to_canonical(raw_row)

                # 1. Resolve Parties
                # Material Supplier (الكسارة) -> raw_materials_supplier
                mat_supp_name = str(mapped.get("material_supplier") or "كسارة عامة / General Crusher").strip()
                material_supplier_id = self.get_or_create_partner_id(mat_supp_name, "raw_materials_supplier")

                # Service Supplier (الناقل) -> service_supplier
                srv_supp_name = str(mapped.get("service_supplier") or "ناقل عام / General Transporter").strip()
                service_supplier_id = self.get_or_create_partner_id(srv_supp_name, "service_supplier")

                # Customer (العميل) -> customer
                cust_name = str(mapped.get("customer") or "عميل عام / General Client").strip()
                customer_id = self.get_or_create_partner_id(cust_name, "customer")

                # 2. Locations and Product
                src_loc_id = self.get_or_create_location_id(f"{mat_supp_name} (موقع الكسارة)", "supplier")
                dest_loc_id = self.get_or_create_location_id(f"{cust_name} (موقع العميل)", "customer")
                prod_name = str(mapped.get("material_type") or "دفان / ركام عام").strip()
                product_id = self.get_or_create_product_id(prod_name)

                # 3. Numeric Values & Math
                qty_loaded = to_decimal(mapped.get("qty_loaded"))
                qty_delivered = to_decimal(mapped.get("qty_delivered"))
                if qty_loaded == 0 and qty_delivered > 0:
                    qty_loaded = qty_delivered
                elif qty_delivered == 0 and qty_loaded > 0:
                    qty_delivered = qty_loaded
                elif qty_loaded == 0 and qty_delivered == 0:
                    qty_loaded = Decimal("30.0000")
                    qty_delivered = Decimal("29.5000")

                qty_wastage = to_decimal(mapped.get("qty_wastage"))
                if qty_wastage == 0 and qty_loaded > qty_delivered:
                    qty_wastage = qty_loaded - qty_delivered

                wastage_pct = to_decimal(mapped.get("wastage_percentage"))
                if wastage_pct == 0 and qty_loaded > 0 and qty_wastage > 0:
                    wastage_pct = (qty_wastage / qty_loaded) * Decimal("100")

                gross_weight = qty_loaded
                net_weight = qty_delivered
                tare_weight = max(Decimal("0.0000"), gross_weight - net_weight)

                # Financials
                sales_amount = to_decimal(mapped.get("sales_amount"))
                vat_amount = to_decimal(mapped.get("vat_amount"))
                if vat_amount == 0 and sales_amount > 0:
                    vat_amount = (sales_amount * Decimal("0.15")).quantize(Decimal("0.01"))

                total_sales = to_decimal(mapped.get("total_sales"))
                if total_sales == 0 and sales_amount > 0:
                    total_sales = sales_amount + vat_amount

                purchases_cost = to_decimal(mapped.get("purchases_cost"))
                crusher_payment = to_decimal(mapped.get("crusher_payment"))
                net_profit = to_decimal(mapped.get("net_profit"))
                if net_profit == 0 and sales_amount > 0 and purchases_cost > 0:
                    net_profit = sales_amount - purchases_cost

                # Month and Year
                month = None
                raw_month = mapped.get("operation_month")
                if raw_month is not None:
                    try:
                        month = int(str(raw_month).strip())
                    except ValueError:
                        month = None

                # Ticket and Truck numbers
                truck_no = str(mapped.get("truck_no") or f"TRK-{uuid.uuid4().hex[:6].upper()}").strip()
                raw_ticket = mapped.get("scale_ticket_no")
                ticket_no = str(raw_ticket).strip() if raw_ticket else f"WB-IMP-{datetime.now(timezone.utc).strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

                # Date
                loading_date_val = mapped.get("loading_date")
                parsed_date = datetime.now(timezone.utc)
                if loading_date_val:
                    if isinstance(loading_date_val, datetime):
                        parsed_date = loading_date_val.replace(tzinfo=timezone.utc)
                    else:
                        d_str = str(loading_date_val).strip()
                        for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"]:
                            try:
                                parsed_date = datetime.strptime(d_str, fmt).replace(tzinfo=timezone.utc)
                                break
                            except ValueError:
                                pass

                if not month:
                    month = parsed_date.month
                year = parsed_date.year

                # Check if ticket already exists by scalar ID
                existing_id = self.db.scalar(
                    select(models.WeighbridgeTicket.id).where(
                        models.WeighbridgeTicket.company_id == self.company_id,
                        models.WeighbridgeTicket.ticket_number == ticket_no,
                    )
                )
                if existing_id:
                    savepoint.rollback()
                    skipped_count += 1
                    continue

                # 4. Create Relational Core: Picking & Move
                picking_ref = f"WH/OUT/{datetime.now(timezone.utc).strftime('%y%m%d')}/{uuid.uuid4().hex[:4].upper()}"
                picking = models.StockPicking(
                    company_id=self.company_id,
                    reference=picking_ref,
                    partner_id=customer_id,
                    picking_type="outgoing",
                    state="done",
                )
                self.db.add(picking)
                self.db.flush()

                move = models.StockMove(
                    company_id=self.company_id,
                    picking_id=picking.id,
                    product_id=product_id,
                    location_id=src_loc_id,
                    location_dest_id=dest_loc_id,
                    quantity_planned=gross_weight,
                    quantity_done=net_weight,
                    state="done",
                )
                self.db.add(move)
                self.db.flush()

                # 5. Create WeighbridgeTicket with Extended Superset Fields
                raw_dict_serializable = {
                    k: (str(v) if isinstance(v, (datetime, Decimal)) else v)
                    for k, v in raw_row.items()
                }

                ticket = models.WeighbridgeTicket(
                    company_id=self.company_id,
                    ticket_number=ticket_no,
                    picking_id=picking.id,
                    truck_number=truck_no,
                    gross_weight=gross_weight,
                    tare_weight=tare_weight,
                    net_weight=net_weight,
                    uom=str(mapped.get("uom") or mapped.get("unit_of_measure") or "MT"),
                    unit_of_measure=str(mapped.get("unit_of_measure") or mapped.get("uom") or "MT"),
                    weighed_in_at=parsed_date,
                    # Superset Fields (REM-P7)
                    material_supplier_name=mat_supp_name,
                    service_supplier_name=srv_supp_name,
                    destination_customer_name=cust_name,
                    loading_invoice_no=str(mapped.get("loading_invoice_no") or ""),
                    receipt_invoice_no=str(mapped.get("receipt_invoice_no") or ""),
                    material_type=prod_name,
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
                    operation_month=month,
                    operation_year=year,
                    notes=str(mapped.get("notes") or ""),
                    raw_legacy_data=raw_dict_serializable,
                )
                self.db.add(ticket)
                self.db.flush()

                # 6. Record in TransporterLedger for Instant Analytics Integration
                op_identifier = f"OP-{ticket_no}"
                existing_ledger_id = self.db.scalar(
                    select(models.TransporterLedger.id).where(
                        models.TransporterLedger.company_id == self.company_id,
                        models.TransporterLedger.operation_id == op_identifier,
                    )
                )
                if not existing_ledger_id:
                    transporter_entry = models.TransporterLedger(
                        company_id=self.company_id,
                        transporter_id=service_supplier_id,
                        operation_id=op_identifier,
                        expected_qty=qty_loaded,
                        delivered_qty=qty_delivered,
                        loss_percentage=min(Decimal("100"), max(Decimal("0"), wastage_pct)),
                        ai_risk_assessment="Standard operational transit data imported from legacy comprehensive database.",
                    )
                    self.db.add(transporter_entry)

                savepoint.commit()
                imported_count += 1
                imported_ticket_ids.append(str(ticket.id))

                # Periodic batch commit to keep database buffer and Python memory constant
                if imported_count % BATCH_SIZE == 0:
                    self.db.commit()

            except Exception as row_exc:
                savepoint.rollback()
                errors.append(f"Row {idx + 1}: {str(row_exc)}")
                continue

        # Final commit for remaining imported rows
        try:
            self.db.commit()
        except Exception as commit_exc:
            self.db.rollback()
            return {
                "success": False,
                "imported_count": 0,
                "skipped_count": skipped_count,
                "errors": [f"Database commit error: {str(commit_exc)}"],
                "imported_ticket_ids": [],
            }

        return {
            "success": True,
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "errors": errors,
            "imported_ticket_ids": imported_ticket_ids,
        }

    def import_partners(self, raw_rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Bulk imports Partners/Master Data, automatically classifying into:
        - raw_materials_supplier (الكسارات)
        - service_supplier (الناقلون / المقاولون)
        - customer (العملاء)
        Streams rows and commits in batches with savepoint isolation.
        """
        imported_count = 0
        updated_count = 0
        errors: List[str] = []
        BATCH_SIZE = 100

        for idx, raw in enumerate(raw_rows):
            savepoint = self.db.begin_nested()
            try:
                # Name resolution
                name = str(
                    raw.get("name")
                    or raw.get("partner_name")
                    or raw.get("اسم الشريك")
                    or raw.get("الاسم")
                    or raw.get("اسم العميل")
                    or raw.get("اسم الكسارة")
                    or raw.get("اسم الناقل")
                    or ""
                ).strip()
                if not name:
                    savepoint.rollback()
                    continue

                # Type resolution
                raw_type = str(
                    raw.get("partner_type")
                    or raw.get("type")
                    or raw.get("النوع")
                    or raw.get("التصنيف")
                    or ""
                ).strip().lower()

                partner_type = "customer"
                if any(k in raw_type for k in ["كسار", "مواد", "crusher", "quarry", "raw_material"]):
                    partner_type = "raw_materials_supplier"
                elif any(k in raw_type for k in ["ناقل", "مقول", "خدم", "transporter", "service", "carrier"]):
                    partner_type = "service_supplier"
                elif any(k in raw_type for k in ["عميل", "زبون", "خرسان", "customer", "client"]):
                    partner_type = "customer"

                # Fields
                tax_no = str(raw.get("tax_number") or raw.get("الرقم الضريبي") or "").strip() or None
                cr_no = str(raw.get("commercial_registration") or raw.get("السجل التجاري") or "").strip() or None
                phone = str(raw.get("phone") or raw.get("الجوال") or raw.get("رقم الجوال") or "").strip() or None
                email = str(raw.get("email") or raw.get("البريد") or "").strip() or None

                existing = self.db.scalar(
                    select(models.ResPartner).where(
                        models.ResPartner.company_id == self.company_id,
                        models.ResPartner.name.ilike(name),
                    )
                )
                is_new = False
                if existing:
                    existing.partner_type = partner_type
                    if tax_no and not existing.tax_number:
                        existing.tax_number = tax_no
                    if cr_no and not existing.commercial_registration:
                        existing.commercial_registration = cr_no
                    if phone and not existing.phone:
                        existing.phone = phone
                    if email and not existing.email:
                        existing.email = email
                else:
                    new_partner = models.ResPartner(
                        company_id=self.company_id,
                        name=name,
                        partner_type=partner_type,
                        tax_number=tax_no,
                        commercial_registration=cr_no,
                        phone=phone,
                        email=email,
                        is_active=True,
                    )
                    self.db.add(new_partner)
                    is_new = True

                self.db.flush()
                savepoint.commit()

                if is_new:
                    imported_count += 1
                else:
                    updated_count += 1

                if (imported_count + updated_count) % BATCH_SIZE == 0:
                    self.db.commit()

            except Exception as e:
                savepoint.rollback()
                errors.append(f"Row {idx + 1}: {str(e)}")
                continue

        try:
            self.db.commit()
        except Exception as commit_exc:
            self.db.rollback()
            return {"success": False, "imported_count": 0, "updated_count": 0, "errors": [str(commit_exc)]}

        return {
            "success": True,
            "imported_count": imported_count,
            "updated_count": updated_count,
            "errors": errors,
        }
