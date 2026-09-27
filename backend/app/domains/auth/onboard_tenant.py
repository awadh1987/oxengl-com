# File: backend/app/domains/auth/onboard_tenant.py
import re
import uuid
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.app.database import SessionLocal
from backend.app.domains.planning.models import ResCompany
from backend.app.domains.finance.models import AccountChart
from backend.models import ResUser, AccountAccount, AccountJournal, FiscalYear, StockLocation

try:
    from backend.app.services.notification_service import VerificationService
except ImportError:
    from app.services.notification_service import VerificationService

logger = logging.getLogger("oxengl.onboarding")

router = APIRouter(prefix="/api/v1/auth", tags=["Tenant Provisioning & Onboarding"])

# Cryptographic password hashing context matrix
pwd_context = CryptContext(
    schemes=["argon2", "pbkdf2_sha256"],
    deprecated="auto",
    argon2__memory_cost=65536,
    argon2__time_cost=3,
    argon2__parallelism=4,
)

class TenantRegistrationPayload(BaseModel):
    company_name_ar: Optional[str] = Field(None, min_length=3, max_length=150)
    company_name_en: str = Field(..., min_length=3, max_length=150)
    domain_slug: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-z0-9_-]+$")
    custom_domain: Optional[str] = Field(default=None, max_length=255)
    admin_email: str = Field(..., min_length=5, max_length=100)
    admin_password: Optional[str] = Field(None, min_length=6, max_length=128)
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    phone_number: Optional[str] = Field(None, max_length=30)
    use_external_db: Optional[bool] = Field(default=False)
    external_db_host: Optional[str] = Field(default=None, max_length=255)
    external_db_port: Optional[int] = Field(default=5432, ge=1, le=65535)
    external_db_name: Optional[str] = Field(default=None, max_length=128)
    external_db_user: Optional[str] = Field(default=None, max_length=128)
    external_db_password: Optional[str] = Field(default=None, max_length=255)
    external_db_sslmode: Optional[str] = Field(default="prefer", max_length=32)
    external_db_url: Optional[str] = Field(default=None)

class RegisterInitRequest(BaseModel):
    company_name_en: str = Field(..., min_length=3, max_length=150)
    company_name_ar: Optional[str] = Field(None, min_length=3, max_length=150)
    admin_email: Optional[str] = Field(None, min_length=5, max_length=100)
    email: Optional[str] = Field(None, min_length=5, max_length=100)
    domain_slug: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-z0-9_-]+$")
    custom_domain: Optional[str] = Field(default=None, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=30)
    phone: Optional[str] = Field(None, max_length=30)
    admin_password: Optional[str] = Field(None, min_length=6, max_length=128)
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    use_external_db: Optional[bool] = Field(default=False)
    external_db_host: Optional[str] = Field(default=None, max_length=255)
    external_db_port: Optional[int] = Field(default=5432, ge=1, le=65535)
    external_db_name: Optional[str] = Field(default=None, max_length=128)
    external_db_user: Optional[str] = Field(default=None, max_length=128)
    external_db_password: Optional[str] = Field(default=None, max_length=255)
    external_db_sslmode: Optional[str] = Field(default="prefer", max_length=32)
    external_db_url: Optional[str] = Field(default=None)

    @property
    def resolved_email(self) -> str:
        return self.admin_email or self.email or ""

    @property
    def resolved_phone(self) -> Optional[str]:
        return self.phone_number or self.phone


class RegisterVerifyRequest(BaseModel):
    admin_email: Optional[str] = Field(None, min_length=5, max_length=100)
    email: Optional[str] = Field(None, min_length=5, max_length=100)
    otp_code: Optional[str] = Field(None, min_length=4, max_length=10)
    otp: Optional[str] = Field(None, min_length=4, max_length=10)
    company_name_en: Optional[str] = Field(None, min_length=3, max_length=150)
    company_name_ar: Optional[str] = Field(None, min_length=3, max_length=150)
    domain_slug: Optional[str] = Field(None, min_length=3, max_length=50)
    custom_domain: Optional[str] = Field(default=None, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=30)
    phone: Optional[str] = Field(None, max_length=30)
    admin_password: Optional[str] = Field(None, min_length=6, max_length=128)
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    use_external_db: Optional[bool] = Field(default=False)
    external_db_host: Optional[str] = Field(default=None, max_length=255)
    external_db_port: Optional[int] = Field(default=5432, ge=1, le=65535)
    external_db_name: Optional[str] = Field(default=None, max_length=128)
    external_db_user: Optional[str] = Field(default=None, max_length=128)
    external_db_password: Optional[str] = Field(default=None, max_length=255)
    external_db_sslmode: Optional[str] = Field(default="prefer", max_length=32)
    external_db_url: Optional[str] = Field(default=None)


    @property
    def resolved_email(self) -> str:
        return self.admin_email or self.email or ""

    @property
    def resolved_otp(self) -> str:
        return self.otp_code or self.otp or ""


def generate_balanced_brand_palette(seed: Optional[str] = None) -> tuple[str, str]:
    """
    Automated Brand Palette Generator:
    Derives harmonic, high-contrast, accessibility-compliant primary and secondary hex color codes
    deterministically from the tenant slug or name, ensuring unique brand aesthetics per workspace.
    """
    CURATED_PALETTES = [
        ("#0ea5e9", "#0f172a"),  # Sky Blue & Deep Slate
        ("#10b981", "#064e3b"),  # Emerald & Forest
        ("#6366f1", "#1e1b4b"),  # Indigo & Deep Midnight
        ("#f97316", "#1c1917"),  # Industrial Orange & Warm Black
        ("#06b6d4", "#083344"),  # Cyan & Ocean Navy
        ("#8b5cf6", "#2e1065"),  # Violet & Deep Purple
        ("#ec4899", "#500724"),  # Pink / Magenta & Dark Wine
        ("#14b8a6", "#134e4a"),  # Teal & Dark Teal
        ("#f59e0b", "#451a03"),  # Amber & Deep Bronze
        ("#3b82f6", "#172554"),  # Cobalt Blue & Navy
        ("#2563eb", "#0f172a"),  # Royal Blue & Slate
        ("#059669", "#022c22"),  # Mint & Deep Pine
    ]
    if not seed:
        return CURATED_PALETTES[0]
    import hashlib
    hash_val = int(hashlib.md5(str(seed).strip().lower().encode("utf-8")).hexdigest(), 16)
    return CURATED_PALETTES[hash_val % len(CURATED_PALETTES)]


def seed_default_chart_of_accounts(db: Session, tenant_id: str | uuid.UUID, slug: str = "tenant"):
    """
    Automated Seeding Hook: Attaches a standardized 5-deep nested corporate 
    Chart of Accounts skeleton framework to the newly provisioned tenant slot.
    """
    import logging
    logger = logging.getLogger("oxengl.onboarding")
    tenant_uuid = uuid.UUID(str(tenant_id)) if isinstance(tenant_id, str) else tenant_id
    from datetime import datetime, timezone

    # If accounts already exist for this tenant, return immediately to maintain idempotency
    existing_root = db.execute(
        text("SELECT 1 FROM accounts WHERE tenant_id = :tid LIMIT 1"),
        {"tid": tenant_uuid}
    ).first()
    if existing_root:
        return

    try:
        with db.begin_nested():
            def get_code(base_code: str) -> str:
                exists = db.execute(
                    text("SELECT 1 FROM accounts WHERE tenant_id = :tid AND code = :code"),
                    {"tid": tenant_uuid, "code": base_code}
                ).first()
                if not exists:
                    return base_code
                return f"{base_code}-{uuid.uuid4().hex[:4].upper()}"

            now_utc = datetime.now(timezone.utc)
            # Level 1: Root Node
            root_asset = AccountChart(
                id=uuid.uuid4(),
                tenant_id=tenant_uuid,
                company_id=tenant_uuid,
                code=get_code("10000"),
                name="Assets (Root)",
                path="1",
                account_type="ASSET",
                currency="SAR",
                is_active=True,
                created_at=now_utc,
            )
            db.add(root_asset)
            db.flush()
            
            # Level 2: Control Group
            current_asset = AccountChart(
                id=uuid.uuid4(),
                tenant_id=tenant_uuid,
                company_id=tenant_uuid,
                code=get_code("11000"),
                name="Current Assets",
                path="1.1",
                account_type="ASSET",
                currency="SAR",
                is_active=True,
                created_at=now_utc,
                parent_id=root_asset.id,
            )
            db.add(current_asset)
            db.flush()
            
            # Level 3: Subsidiary Class
            cash_banks = AccountChart(
                id=uuid.uuid4(),
                tenant_id=tenant_uuid,
                company_id=tenant_uuid,
                code=get_code("11100"),
                name="Cash & Bank Accounts",
                path="1.1.1",
                account_type="ASSET",
                currency="SAR",
                is_active=True,
                created_at=now_utc,
                parent_id=current_asset.id,
            )
            db.add(cash_banks)
            db.flush()
            
            # Level 4: Ledger Account
            sub_cash = AccountChart(
                id=uuid.uuid4(),
                tenant_id=tenant_uuid,
                company_id=tenant_uuid,
                code=get_code("11110"),
                name="Sub-Cash Vault Ledgers",
                path="1.1.1.1",
                account_type="ASSET",
                currency="SAR",
                is_active=True,
                created_at=now_utc,
                parent_id=cash_banks.id,
            )
            db.add(sub_cash)
            db.flush()
            
            # Level 5: Child Operating Micro-Account
            operating_cash = AccountChart(
                id=uuid.uuid4(),
                tenant_id=tenant_uuid,
                company_id=tenant_uuid,
                code=get_code("11110-01"),
                name="Primary Corporate Treasury Vault",
                path="1.1.1.1.1",
                account_type="ASSET",
                currency="SAR",
                is_active=True,
                created_at=now_utc,
                parent_id=sub_cash.id,
            )
            db.add(operating_cash)
            db.flush()
    except Exception as exc:
        logger.warning(f"Error seeding chart of accounts for tenant {tenant_uuid}: {exc}")


def seed_tenant_default_records(db: Session, company_id: uuid.UUID | str, currency: str = "SAR") -> None:
    """
    Automated Seeding Pipeline: Provisions all foundational enterprise financial
    and operational baseline records for a newly registered tenant:
    1. 5-depth hierarchical Chart of Accounts (accounts table)
    2. General Ledger accounts (account_accounts table)
    3. Standard financial journals (account_journals table)
    4. Current fiscal year (fiscal_years table)
    5. Main internal warehouse location (stock_locations table)
    """
    import logging
    from datetime import datetime, timezone
    logger = logging.getLogger("oxengl.onboarding")
    company_uuid = uuid.UUID(str(company_id)) if isinstance(company_id, str) else company_id

    # 1. 5-Depth Hierarchical Chart of Accounts
    try:
        seed_default_chart_of_accounts(db, tenant_id=company_uuid)
    except Exception as exc:
        logger.warning(f"Failed to seed chart of accounts for {company_uuid}: {exc}")

    # 2. General Ledger Accounts (account_accounts)
    DEFAULT_GL_ACCOUNTS = (
        ("101000", "Operating Cash / Bank", "asset"),
        ("120000", "Accounts Receivable", "asset"),
        ("130000", "Stock Valuation / Material Inventory", "asset"),
        ("201000", "Accounts Payable - Raw Materials", "liability"),
        ("202000", "Accounts Payable - Freight & Logistics", "liability"),
        ("203000", "VAT Payable", "liability"),
        ("401000", "Sales Revenue", "revenue"),
        ("501000", "Cost of Goods Sold - Materials", "expense"),
        ("503000", "In-Transit Loss & Spillage Expense", "expense"),
    )
    try:
        with db.begin_nested():
            existing_gl_codes = set(
                row[0] for row in db.execute(
                    text("SELECT code FROM account_accounts WHERE company_id = :cid"),
                    {"cid": company_uuid}
                ).all()
            )
            for code, name, itype in DEFAULT_GL_ACCOUNTS:
                if code not in existing_gl_codes:
                    db.add(AccountAccount(
                        id=uuid.uuid4(),
                        company_id=company_uuid,
                        code=code,
                        name=name,
                        internal_type=itype,
                        currency=currency,
                    ))
            db.flush()
    except Exception as exc:
        logger.warning(f"Failed to seed general ledger accounts for {company_uuid}: {exc}")

    # 3. Standard Financial Journals (account_journals)
    DEFAULT_JOURNALS = (
        ("GEN", "General Operations Journal", "general", "MISC"),
        ("SALE", "Customer Invoicing Journal", "sale", "INV"),
        ("PURCH", "Vendor Bills Journal", "purchase", "BILL"),
        ("BANK", "Bank Operations Journal", "bank", "BNK"),
        ("CASH", "Cash Receipts and Petty Cash", "cash", "CSH"),
    )
    try:
        with db.begin_nested():
            existing_journal_codes = set(
                row[0] for row in db.execute(
                    text("SELECT code FROM account_journals WHERE company_id = :cid"),
                    {"cid": company_uuid}
                ).all()
            )
            for code, name, jtype, prefix in DEFAULT_JOURNALS:
                if code not in existing_journal_codes:
                    db.add(AccountJournal(
                        id=uuid.uuid4(),
                        company_id=company_uuid,
                        code=code,
                        name=name,
                        journal_type=jtype,
                        sequence_prefix=prefix,
                        next_sequence=1,
                        is_active=True,
                    ))
            db.flush()
    except Exception as exc:
        logger.warning(f"Failed to seed account journals for {company_uuid}: {exc}")

    # 4. Current Fiscal Year (fiscal_years)
    try:
        with db.begin_nested():
            now_utc = datetime.now(timezone.utc)
            current_year = now_utc.year
            fy_name = f"FY-{current_year}"
            existing_fy = db.execute(
                text("SELECT 1 FROM fiscal_years WHERE company_id = :cid AND name = :name"),
                {"cid": company_uuid, "name": fy_name}
            ).first()
            if not existing_fy:
                db.add(FiscalYear(
                    id=uuid.uuid4(),
                    company_id=company_uuid,
                    name=fy_name,
                    date_start=datetime(current_year, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
                    date_end=datetime(current_year, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
                    state="open",
                ))
            db.flush()
    except Exception as exc:
        logger.warning(f"Failed to seed fiscal year for {company_uuid}: {exc}")

    # 5. Main Stock Location (stock_locations)
    try:
        with db.begin_nested():
            existing_loc = db.execute(
                text("SELECT 1 FROM stock_locations WHERE company_id = :cid AND name = 'Main Warehouse'"),
                {"cid": company_uuid}
            ).first()
            if not existing_loc:
                db.add(StockLocation(
                    id=uuid.uuid4(),
                    company_id=company_uuid,
                    name="Main Warehouse",
                    location_type="internal",
                    is_active=True,
                ))
            db.flush()
    except Exception as exc:
        logger.warning(f"Failed to seed stock location for {company_uuid}: {exc}")

def execute_tenant_provisioning(db: Session, payload_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Atomic multi-tenant tenant provisioning core:
    - Allocates ResCompany record
    - Synchronizes tenants table
    - Auto-seeds 5-depth hierarchical Chart of Accounts and operational defaults
    - Creates Admin ResUser & users records with Argon2/PBKDF2 hashing
    - Dynamically provisions PostgreSQL isolated schema & clones base tables
    - Syncs master_tenants and tenant_users for multi-plane consistency
    - Generates authenticated session bearer token
    """
    company_name_en = payload_data.get("company_name_en")
    company_name_ar = payload_data.get("company_name_ar") or company_name_en
    slug_cleaned = (payload_data.get("domain_slug") or "").lower().strip()
    norm_email = (payload_data.get("admin_email") or "").strip().lower()
    raw_password = payload_data.get("admin_password") or payload_data.get("password") or "OxenGL2026!Secure"
    phone_number = payload_data.get("phone_number")

    if not slug_cleaned or not re.match(r"^[a-z0-9_-]+$", slug_cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain slug may only contain lowercase letters, numbers, hyphens, and underscores."
        )

    if not norm_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrator email is required."
        )

    hashed_pwd = pwd_context.hash(raw_password)

    try:
        # 1. Enforce safety validation check against the newly indexed slug field
        existing_tenant = db.query(ResCompany).filter(
            (ResCompany.domain_slug == slug_cleaned) | (ResCompany.slug == slug_cleaned)
        ).first()
        if existing_tenant:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workspace domain slug is already allocated to another enterprise account."
            )

        # 1b. Validate custom domain uniqueness if specified
        raw_custom_domain = payload_data.get("custom_domain")
        clean_custom_domain = None
        if raw_custom_domain:
            cd = str(raw_custom_domain).strip().lower()
            if "//" in cd:
                cd = cd.split("//")[-1].split("/")[0]
            cd = cd.split(":")[0].strip()
            if cd:
                clean_custom_domain = cd

        if clean_custom_domain:
            from sqlalchemy import func
            from backend.models import MasterTenant
            existing_dom_company = db.query(ResCompany).filter(
                func.lower(func.trim(ResCompany.custom_domain)) == clean_custom_domain
            ).first()
            existing_dom_master = db.query(MasterTenant).filter(
                func.lower(func.trim(MasterTenant.custom_domain)) == clean_custom_domain
            ).first()
            if existing_dom_company or existing_dom_master:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Custom domain '{clean_custom_domain}' is already allocated to another enterprise workspace."
                )

        # 2. Allocate core enterprise company registry entry
        company_uuid = uuid.uuid4()
        primary_color, secondary_color = generate_balanced_brand_palette(slug_cleaned)
        new_company = ResCompany(
            id=company_uuid,
            name=company_name_en or company_name_ar,
            slug=slug_cleaned,
            currency="SAR",
            is_active=True,
            status="ACTIVE",
            primary_color=primary_color,
            secondary_color=secondary_color,
        )
        new_company.domain_slug = slug_cleaned
        new_company.primary_color = primary_color
        new_company.secondary_color = secondary_color
        new_company.is_active = True
        new_company.status = "ACTIVE"
        if clean_custom_domain:
            new_company.custom_domain = clean_custom_domain
        if hasattr(new_company, 'name_ar'):
            setattr(new_company, 'name_ar', company_name_ar)
        if hasattr(new_company, 'name_en'):
            setattr(new_company, 'name_en', company_name_en)

        db.add(new_company)
        db.flush()

        # Also align with tenants table if present
        try:
            with db.begin_nested():
                db.execute(
                    text("INSERT INTO tenants (id, company_name, schema_name) VALUES (:id, :name, :schema) ON CONFLICT (id) DO UPDATE SET company_name = :name, schema_name = :schema"),
                    {"id": company_uuid, "name": company_name_en or company_name_ar, "schema": slug_cleaned}
                )
        except Exception:
            pass

        # 3. Fire the template seed routine to auto-inject default financial records, journals, fiscal year, and warehouse
        seed_tenant_default_records(db, company_id=company_uuid, currency="SAR")

        # 4. Provision & Seed Super Admin User with Hashed Password
        admin_user_id = uuid.uuid4()

        # 4a. Sync into res_users table
        res_user = db.query(ResUser).filter(ResUser.email == norm_email).first()
        if not res_user:
            res_user = ResUser(
                id=admin_user_id,
                firebase_uid=f"native:{norm_email}",
                email=norm_email,
                full_name=company_name_en or "Administrator",
                password_hash=hashed_pwd,
                company_id=company_uuid,
                role="Admin",
                is_active=True,
                mfa_enabled=False,
            )
            db.add(res_user)
        else:
            res_user.password_hash = hashed_pwd
            res_user.company_id = company_uuid

        db.flush()

        # 4b. Sync into users table if table exists
        try:
            with db.begin_nested():
                users_cols = [r[0] for r in db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users'")).all()]
                if users_cols:
                    pwd_col = 'hashed_password' if 'hashed_password' in users_cols else 'password_hash'
                    has_name = 'name' in users_cols
                    has_role = 'role' in users_cols
                    has_username = 'username' in users_cols
                    has_tenant_id = 'tenant_id' in users_cols

                    existing_u = db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": norm_email}).first()
                    if existing_u:
                        db.execute(
                            text(f"UPDATE users SET {pwd_col} = :pwd, tenant_id = :tid WHERE id = :uid"),
                            {"pwd": hashed_pwd, "tid": company_uuid, "uid": existing_u[0]}
                        )
                    else:
                        insert_cols = ["id", "email", pwd_col]
                        insert_vals = [":id", ":email", ":pwd"]
                        params = {"id": admin_user_id, "email": norm_email, "pwd": hashed_pwd}
                        if has_tenant_id:
                            insert_cols.append("tenant_id")
                            insert_vals.append(":tenant_id")
                            params["tenant_id"] = company_uuid
                        if has_name:
                            insert_cols.append("name")
                            insert_vals.append(":name")
                            params["name"] = company_name_en or "Administrator"
                        if has_role:
                            insert_cols.append("role")
                            insert_vals.append(":role")
                            params["role"] = "Admin"
                        if has_username:
                            insert_cols.append("username")
                            insert_vals.append(":username")
                            params["username"] = f"{norm_email.split('@')[0]}_{slug_cleaned.replace('-', '_')[:8]}_{uuid.uuid4().hex[:4]}"

                        db.execute(text(f"INSERT INTO users ({', '.join(insert_cols)}) VALUES ({', '.join(insert_vals)})"), params)
        except Exception:
            pass

        # 4c. Dynamic Schema Creation & Table Cloning into isolated PostgreSQL schema
        sanitized_slug = re.sub(r'[^a-z0-9_]', '_', slug_cleaned)
        if not re.match(r'^[a-z0-9_]+$', sanitized_slug):
            sanitized_slug = f"tenant_{sanitized_slug}"
        if sanitized_slug[0].isdigit():
            sanitized_slug = f"tenant_{sanitized_slug}"

        try:
            with db.begin_nested():
                # 1. Create the tenant schema dynamically using safe identifier quotation
                db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{sanitized_slug}";'))
        except Exception as e:
            logger.warning(f"Error creating schema {sanitized_slug}: {e}")

        try:
            with db.begin_nested():
                # 2. Clone base tables directly into the new schema layer
                db.execute(text(f'CREATE TABLE IF NOT EXISTS "{sanitized_slug}".users (LIKE public.users INCLUDING ALL);'))

                # 3. Seed admin user directly into tenant schema users table
                try:
                    db.execute(text(f'''
                        INSERT INTO "{sanitized_slug}".users (id, tenant_id, username, email, password_hash, name, role, status)
                        VALUES (:id, :tenant_id, :username, :email, :pwd, :name, :role, :status)
                        ON CONFLICT (email) DO UPDATE SET password_hash = :pwd, status = :status;
                    '''), {
                        "id": admin_user_id,
                        "tenant_id": company_uuid,
                        "username": f"{norm_email.split('@')[0]}_{sanitized_slug[:8]}",
                        "email": norm_email,
                        "pwd": hashed_pwd,
                        "name": company_name_en or company_name_ar or "Administrator",
                        "role": "Admin",
                        "status": "ACTIVE",
                    })
                except Exception:
                    pass
        except Exception:
            pass

        # 4d. Synchronize master_tenants and tenant_users for multi-plane consistency
        try:
            with db.begin_nested():
                unique_mobile = phone_number or f"+9665{uuid.uuid4().int % 90000000 + 10000000:08d}"
                db.execute(text('''
                    INSERT INTO master_tenants (id, name, slug, custom_domain, owner_full_name, owner_email, owner_mobile, status, subscription_tier, max_users, max_storage_gb)
                    VALUES (:id, :name, :slug, :custom_domain, :owner_name, :owner_email, :mobile, 'active', 'standard', 10, 25)
                    ON CONFLICT (id) DO UPDATE SET slug = :slug, status = 'active', name = :name, custom_domain = :custom_domain;
                '''), {
                    "id": company_uuid,
                    "name": company_name_en or company_name_ar,
                    "slug": slug_cleaned,
                    "custom_domain": clean_custom_domain,
                    "owner_name": company_name_en or company_name_ar,
                    "owner_email": norm_email,
                    "mobile": unique_mobile,
                })
                db.execute(text('''
                    INSERT INTO tenant_users (id, email, mobile_number, first_name, last_name, password_hash, role, is_active)
                    VALUES (:id, :email, :mobile, :first_name, :last_name, :pwd, 'admin', true)
                    ON CONFLICT (email) DO UPDATE SET password_hash = :pwd, is_active = true, mobile_number = :mobile;
                '''), {
                    "id": admin_user_id,
                    "email": norm_email,
                    "mobile": unique_mobile,
                    "first_name": (company_name_en or "Admin").split()[0],
                    "last_name": (company_name_en or "User").split()[1] if len((company_name_en or "User").split()) > 1 else "User",
                    "pwd": hashed_pwd,
                })
        except Exception:
            pass

        if clean_custom_domain:
            try:
                from backend.app.core.middleware import invalidate_domain_cache
                invalidate_domain_cache(clean_custom_domain)
            except Exception:
                pass

        # 4e. Dedicated Private External Database Provisioning (Phase 1)
        use_external_db = bool(payload_data.get("use_external_db"))
        ext_db_host = payload_data.get("external_db_host")
        ext_db_port = payload_data.get("external_db_port") or 5432
        ext_db_name = payload_data.get("external_db_name")
        ext_db_user = payload_data.get("external_db_user")
        ext_db_password = payload_data.get("external_db_password")
        ext_db_sslmode = payload_data.get("external_db_sslmode") or "prefer"
        ext_db_url = payload_data.get("external_db_url")

        if use_external_db:
            try:
                from backend.app.services.migration_service import build_connection_url, test_target_connection
                from backend.database import encrypt_connection_url, tenant_connection_manager
                from backend.models import TenantDatabaseConfig

                target_url = build_connection_url(
                    host=ext_db_host,
                    port=ext_db_port,
                    database_name=ext_db_name,
                    username=ext_db_user,
                    password=ext_db_password,
                    ssl_mode=ext_db_sslmode,
                    raw_url=ext_db_url,
                )

                test_ok, test_err, meta = test_target_connection(raw_url=target_url, timeout=10)
                if not test_ok:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"External database connection test failed: {test_err}",
                    )

                # Provision tables on external database
                ext_engine = tenant_connection_manager.register_tenant_engine(company_uuid, target_url)
                Base.metadata.create_all(bind=ext_engine)

                # Seed base tenant record into external database
                ext_session = tenant_connection_manager.get_session(company_uuid)
                try:
                    ext_company = ResCompany(
                        id=company_uuid,
                        name=company_name_en,
                        slug=slug_cleaned,
                        domain_slug=slug_cleaned,
                        email=norm_email,
                    )
                    ext_session.merge(ext_company)
                    ext_session.commit()
                except Exception as ext_seed_err:
                    logger.warning(f"External database company record seeding warning: {ext_seed_err}")
                finally:
                    ext_session.close()

                # Register encrypted configuration in master catalog
                enc_url = encrypt_connection_url(target_url)
                tenant_db_config = TenantDatabaseConfig(
                    id=uuid.uuid4(),
                    company_id=company_uuid,
                    database_name=meta.get("database_name") or ext_db_name or "external_db",
                    encrypted_connection_url=enc_url,
                    residency_region="external-private",
                    isolation_level="dedicated",
                    is_active=True,
                )
                db.add(tenant_db_config)
                logger.info(f"Provisioned dedicated external database for tenant {company_uuid} on {ext_db_host}")
            except Exception as ext_err:
                if isinstance(ext_err, HTTPException):
                    raise ext_err
                logger.error(f"Failed to provision external database: {ext_err}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"External database provisioning error: {str(ext_err)}",
                )

        db.commit()

        # Generate session token if available
        session_token = None
        try:
            from backend.app.main import create_session_token
            session_token = create_session_token(
                subject=str(admin_user_id),
                company_id=company_uuid,
                role="Admin",
                tenant_slug=slug_cleaned,
                domain_slug=slug_cleaned,
            )
        except Exception:
            pass

        return {
            "status": "PROVISIONED",
            "message": "Enterprise workspace container generated with default ledger templates and seeded administrator.",
            "workspace_slug": slug_cleaned,
            "workspace_url": f"https://{clean_custom_domain}" if clean_custom_domain else f"https://{slug_cleaned}.oxengl.me",
            "custom_domain": clean_custom_domain,
            "tenant_id": str(company_uuid),
            "admin_user_id": str(admin_user_id),
            "primary_color": primary_color,
            "secondary_color": secondary_color,
            "storage_mode": "DEDICATED_EXTERNAL" if use_external_db else "LOCAL_SHARED",
            "is_external_db": use_external_db,
            "external_db_host": ext_db_host if use_external_db else None,
            "database_name": ext_db_name if use_external_db else "erp_db",
            "access_token": session_token,
            "token_type": "bearer" if session_token else None,
        }

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Onboarding fault: {str(e)}")


@router.post("/register-init", status_code=status.HTTP_200_OK)
async def initiate_tenant_registration(req: RegisterInitRequest, background_tasks: BackgroundTasks):
    """
    Step 1 of Multi-Factor Tenant Onboarding:
    Validates domain slug and administrator email availability, generates a 6-digit OTP,
    caches registration data in Redis (5-min TTL), and asynchronously dispatches verification via Email/SMS.
    """
    slug_cleaned = req.domain_slug.lower().strip()
    if not re.match(r"^[a-z0-9_-]+$", slug_cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain slug may only contain lowercase letters, numbers, hyphens, and underscores."
        )

    norm_email = req.resolved_email.strip().lower()
    if not norm_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrative email is required."
        )

    # Pre-validation check against database
    db = SessionLocal()
    try:
        existing_tenant = db.query(ResCompany).filter(
            (ResCompany.domain_slug == slug_cleaned) | (ResCompany.slug == slug_cleaned)
        ).first()
        if existing_tenant:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace domain slug is already allocated to another enterprise account."
            )

        existing_user = db.query(ResUser).filter(ResUser.email == norm_email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this administrator email already exists."
            )
    finally:
        db.close()

    # Generate 6-digit OTP stored in Redis
    otp = await VerificationService.generate_and_store_otp(norm_email)

    # Store registration metadata in Redis pending OTP verification
    reg_data = {
        "company_name_en": req.company_name_en,
        "company_name_ar": req.company_name_ar or req.company_name_en,
        "domain_slug": slug_cleaned,
        "custom_domain": req.custom_domain.strip().lower() if req.custom_domain else None,
        "admin_email": norm_email,
        "phone_number": req.resolved_phone,
        "admin_password": req.admin_password or req.password or "OxenGL2026!Secure",
        "use_external_db": req.use_external_db,
        "external_db_host": req.external_db_host,
        "external_db_port": req.external_db_port,
        "external_db_name": req.external_db_name,
        "external_db_user": req.external_db_user,
        "external_db_password": req.external_db_password,
        "external_db_sslmode": req.external_db_sslmode,
        "external_db_url": req.external_db_url,
    }

    await VerificationService.store_registration_payload(norm_email, reg_data)

    # Asynchronously dispatch notifications without blocking API response
    background_tasks.add_task(VerificationService.dispatch_email_otp, norm_email, otp, req.company_name_en)
    if req.resolved_phone:
        background_tasks.add_task(VerificationService.dispatch_sms_otp, req.resolved_phone, otp)

    return {
        "status": "OTP_DISPATCHED",
        "message": "Verification code dispatched. Expires in 5 minutes.",
        "admin_email": norm_email,
        "email": norm_email,
        "domain_slug": slug_cleaned,
        "expires_in": 300,
    }


@router.post("/register-verify", status_code=status.HTTP_201_CREATED)
async def verify_and_provision_tenant(req: RegisterVerifyRequest):
    """
    Step 2 of Multi-Factor Tenant Onboarding:
    Validates the 6-digit OTP against Redis. Once validated, executes atomic
    database provisioning, seeds the 5-depth chart of accounts, and links default records.
    """
    norm_email = req.resolved_email.strip().lower()
    otp_code = req.resolved_otp.strip()
    if not norm_email or not otp_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both email and otp verification code are required."
        )

    is_valid = await VerificationService.verify_otp(norm_email, otp_code)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code."
        )

    # Retrieve cached registration payload from Redis
    cached = await VerificationService.get_registration_payload(norm_email) or {}

    # Merge cached data with explicit request overrides
    merged_data = {**cached}
    for k, v in req.model_dump().items():
        if v is not None and k != "otp_code":
            merged_data[k] = v

    if not merged_data.get("domain_slug") or not (merged_data.get("company_name_en") or merged_data.get("company_name_ar")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing required workspace registration metadata. Please restart registration."
        )

    db = SessionLocal()
    try:
        result = execute_tenant_provisioning(db, merged_data)
        # Invalidate cached payload upon successful provision
        await VerificationService.delete_registration_payload(norm_email)
        return result
    finally:
        db.close()


@router.post("/register-tenant", status_code=status.HTTP_201_CREATED)
async def register_new_enterprise_tenant(payload: TenantRegistrationPayload):
    """
    Synchronized multi-tenant tenant onboarding pipeline (direct registration).
    Maintained for automated integrations and test backward-compatibility.
    """
    db = SessionLocal()
    try:
        return execute_tenant_provisioning(db, payload.model_dump())
    finally:
        db.close()

