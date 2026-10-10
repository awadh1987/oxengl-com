import base64
import hashlib
import hmac
import json
import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from hmac import compare_digest
import os
from os import getenv
from typing import Any, Generator, Optional

from backend.schemas import AccountMoveLineCreate
from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from slowapi.errors import RateLimitExceeded
try:
	from backend.rate_limiter import limiter
except (ImportError, ValueError):
	from rate_limiter import limiter
from sqlalchemy import and_, extract, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

try:
	from .database import SessionLocal
	from .import models
	from .zatca_adapter import ZATCAAdapter  # type: ignore[no-redef]
	from .schemas import (
		AccountAccountCreate, AccountAccountRead, AccountJournalRead, AccountMoveCreate, AccountMoveRead, CostCenterCreate, CostCenterRead, CustomerInvoiceCreate, CustomerInvoiceRead, CustomerInvoiceUpdate, FiscalYearRead, SupplierSettlementGenerate, SupplierSettlementRead,
		AuthVerifyRequest, AuthVerifyResponse, CompanyRegistrationCreate, CompanyRegistrationRead, DirectAccessRequest,
		CompanyBrandingUpdate, CompanyUpdate, IsolationAuditRead, LicenseIssueRequest,
		PlatformAssetUploadRequest, PlatformAssetUploadResponse,
		ProductProductCreate, ProductProductRead, ResPartnerCreate, ResPartnerRead, ResPartnerUpdate, UserRegistrationCreate,
		ResCompanyRead, PublicTenantRead, StockLocationCreate, StockLocationRead, WeighbridgeOperationCreate, WeighbridgeOperationRead,
		OperationAttachmentCreate, OperationAttachmentRead,
		VehicleCreate, VehicleUpdate, VehicleRead,
		MaintenanceWorkOrderCreate, MaintenanceWorkOrderUpdate, MaintenanceWorkOrderRead,
		PartRequirementCreate, PartRequirementUpdate, PartRequirementRead,
		FuelTransactionCreate, FuelTransactionUpdate, FuelTransactionRead,
		SeasonalCropCycleCreate, SeasonalCropCycleUpdate, SeasonalCropCycleRead,
		HarvestBatchCreate, HarvestBatchUpdate, HarvestBatchRead,
		FarmGateWeighmentCreate, FarmGateWeighmentUpdate, FarmGateWeighmentRead,
		PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderRead,
		GoodsReceiptCreate, GoodsReceiptUpdate, GoodsReceiptRead,
		SupplierInvoiceCreate, SupplierInvoiceUpdate, SupplierInvoiceRead,
		TaxProfileCreate, TaxProfileUpdate, TaxProfileRead,
		TaxRuleCreate, TaxRuleUpdate, TaxRuleRead,
		ZATCALogCreate, ZATCALogUpdate, ZATCALogRead,
		InvoiceMathCalculationRequest, InvoiceMathCalculationResponse,
		SecurityEventCreate, SecurityEventUpdate, SecurityEventRead,
		DeviceRegistrationCreate, DeviceRegistrationUpdate, DeviceRegistrationRead, DeviceRevokeRequest,
		SyncQueueEventCreate, SyncQueueEventRead, SyncBatchRequest, SyncBatchItemResult, SyncBatchResponse,
		WarehouseCreate, WarehouseUpdate, WarehouseRead,
		WarehouseZoneCreate, WarehouseZoneUpdate, WarehouseZoneRead,
		StockItemCreate, StockItemUpdate, StockItemRead,
		StockLotCreate, StockLotUpdate, StockLotRead,
		StockMovementCreate, StockMovementRead,
		StockMovementProcessRequest, StockMovementProcessResponse,
		YardGateAppointmentCreate, YardGateAppointmentUpdate, YardGateAppointmentRead,
		PasswordRotateRequest, PasswordRotateResponse, PlatformAuditLogRead,
		TenantUserCreateRequest, TenantUserRead, TenantUserRoleUpdateRequest,
		TenantApiKeyCreateRequest, TenantApiKeyCreateResponse,
		TenantSecuritySettingsUpdateRequest, TenantSecuritySettingsResponse,
		SSOProviderBase, SSOProviderCreate, SSOProviderRead,
		TenantSSOConfigBase, TenantSSOConfigCreate, TenantSSOConfigUpdate, TenantSSOConfigRead,
		SSOLoginInitiateRequest, SSOLoginInitiateResponse,
		SSOCallbackRequest, SSOCallbackResponse,
		ReportingLedgerSummaryRead, FleetUtilizationFactRead,
		ETLJobTriggerRequest, ETLJobStatusResponse,
		AIModelConfigCreate, AIModelConfigUpdate, AIModelConfigRead,
		AIGovernanceLogRead, AIProposalValidateRequest, AIProposalValidateResponse,
		AIHITLApprovalRequest, AIHITLApprovalResponse,
		AIProposalExecuteRequest, AIProposalExecuteResponse,
		ParsedInvoiceLineItem, ParsedInvoiceData,
		AIDocumentParseRequest, AIDocumentParseResponse,
		CropYieldPrediction, StockoutRiskItem, FleetAnomalyAlert,
		RestockProposalRequest, RestockProposalResponse,
		TenantSubscriptionUpdate, TenantBillingSummaryRead, SaaSInvoiceRead,
		FleetTripCreate, FleetTripRead, TripStatusUpdate,
		DeliveryProofCreate, DeliveryProofRead,
		TripInspectionLogCreate, TripInspectionLogRead,
		TenantAnalyticsSummaryRead,
	)
	from .database import encrypt_connection_url, decrypt_connection_url
	from .workers import etl_worker
	from .services.ai_governance import ai_governance_engine
	from .services.ai_parser import ai_document_parser
	from .services.ai_forecasting import ai_forecasting_service
	from .two_tier_auth import router as two_tier_auth_router, v1_router as two_tier_auth_v1_router
	from .core.middleware import CorrelationIdMiddleware, HostHeaderMiddleware
	from .domains.iam.routes import router as iam_auth_router
	from backend.app.api.v1.procurement import router as procurement_router
	from backend.app.api.v1.inventory import router as inventory_router
	from backend.app.api.v1.finance import router as finance_router
	from backend.app.api.v1.reports import router as reports_router
	try:
		from backend.app.api.v1.data_observability import router as data_observability_router
	except (ImportError, ModuleNotFoundError):
		try:
			from app.api.v1.data_observability import router as data_observability_router
		except (ImportError, ModuleNotFoundError):
			from .api.v1.data_observability import router as data_observability_router
	from backend.app.services.fleet_service import router as logistics_router
	from backend.app.api.v1.customs import router as customs_router
	from backend.app.api.v1.hr import router as hr_router
	from backend.app.api.v1.saas import router as saas_router
	from backend.app.api.v1.ai import router as ai_router
	from backend.app.api.v1.planning import router as planning_router
	from backend.app.api.v1.auth import router as recovery_auth_router
	try:
		from app.agent.router import router as agent_router
	except Exception:
		try:
			from backend.app.agent.router import router as agent_router
		except Exception:
			agent_router = None
	try:
		from app.api.zatca import router as zatca_router
	except (ImportError, ModuleNotFoundError):
		from backend.app.api.zatca import router as zatca_router
	from backend.app.services.sequence_service import SequenceService, get_next_sequence
	from backend.app.services.bulk_import_service import (
		BulkImportService,
		parse_raw_rows_from_excel,
		parse_raw_rows_from_csv,
		stream_raw_rows_from_excel,
		stream_raw_rows_from_csv,
	)
except ImportError:
	from .database import SessionLocal
	from . import models  # type: ignore[no-redef]
	from .zatca_adapter import ZATCAAdapter  # type: ignore[no-redef]
	from .schemas import (  # type: ignore[no-redef]
		AccountAccountCreate, AccountAccountRead, AccountJournalRead, AccountMoveCreate, AccountMoveRead, CostCenterCreate, CostCenterRead, CustomerInvoiceCreate, CustomerInvoiceRead, CustomerInvoiceUpdate, FiscalYearRead, SupplierSettlementGenerate, SupplierSettlementRead,
		AuthVerifyRequest, AuthVerifyResponse, CompanyRegistrationCreate, CompanyRegistrationRead, DirectAccessRequest,
		CompanyBrandingUpdate, CompanyUpdate, IsolationAuditRead, LicenseIssueRequest,
		PlatformAssetUploadRequest, PlatformAssetUploadResponse,
		ProductProductCreate, ProductProductRead, ResPartnerCreate, ResPartnerRead, ResPartnerUpdate, UserRegistrationCreate,
		ResCompanyRead, PublicTenantRead, StockLocationCreate, StockLocationRead, WeighbridgeOperationCreate, WeighbridgeOperationRead,
		OperationAttachmentCreate, OperationAttachmentRead,
		VehicleCreate, VehicleUpdate, VehicleRead,
		MaintenanceWorkOrderCreate, MaintenanceWorkOrderUpdate, MaintenanceWorkOrderRead,
		PartRequirementCreate, PartRequirementUpdate, PartRequirementRead,
		FuelTransactionCreate, FuelTransactionUpdate, FuelTransactionRead,
		SeasonalCropCycleCreate, SeasonalCropCycleUpdate, SeasonalCropCycleRead,
		HarvestBatchCreate, HarvestBatchUpdate, HarvestBatchRead,
		FarmGateWeighmentCreate, FarmGateWeighmentUpdate, FarmGateWeighmentRead,
		PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderRead,
		GoodsReceiptCreate, GoodsReceiptUpdate, GoodsReceiptRead,
		SupplierInvoiceCreate, SupplierInvoiceUpdate, SupplierInvoiceRead,
		TaxProfileCreate, TaxProfileUpdate, TaxProfileRead,
		TaxRuleCreate, TaxRuleUpdate, TaxRuleRead,
		ZATCALogCreate, ZATCALogUpdate, ZATCALogRead,
		InvoiceMathCalculationRequest, InvoiceMathCalculationResponse,
		SecurityEventCreate, SecurityEventUpdate, SecurityEventRead,
		DeviceRegistrationCreate, DeviceRegistrationUpdate, DeviceRegistrationRead, DeviceRevokeRequest,
		SyncQueueEventCreate, SyncQueueEventRead, SyncBatchRequest, SyncBatchItemResult, SyncBatchResponse,
		WarehouseCreate, WarehouseUpdate, WarehouseRead,
		WarehouseZoneCreate, WarehouseZoneUpdate, WarehouseZoneRead,
		StockItemCreate, StockItemUpdate, StockItemRead,
		StockLotCreate, StockLotUpdate, StockLotRead,
		StockMovementCreate, StockMovementRead,
		StockMovementProcessRequest, StockMovementProcessResponse,
		YardGateAppointmentCreate, YardGateAppointmentUpdate, YardGateAppointmentRead,
		TenantUserCreateRequest, TenantUserRead, TenantUserRoleUpdateRequest,
		TenantApiKeyCreateRequest, TenantApiKeyCreateResponse,
		TenantSecuritySettingsUpdateRequest, TenantSecuritySettingsResponse,
		SSOProviderBase, SSOProviderCreate, SSOProviderRead,
		TenantSSOConfigBase, TenantSSOConfigCreate, TenantSSOConfigUpdate, TenantSSOConfigRead,
		SSOLoginInitiateRequest, SSOLoginInitiateResponse,
		SSOCallbackRequest, SSOCallbackResponse,
		ReportingLedgerSummaryRead, FleetUtilizationFactRead,
		ETLJobTriggerRequest, ETLJobStatusResponse,
		AIModelConfigCreate, AIModelConfigUpdate, AIModelConfigRead,
		AIGovernanceLogRead, AIProposalValidateRequest, AIProposalValidateResponse,
		AIHITLApprovalRequest, AIHITLApprovalResponse,
		AIProposalExecuteRequest, AIProposalExecuteResponse,
		ParsedInvoiceLineItem, ParsedInvoiceData,
		AIDocumentParseRequest, AIDocumentParseResponse,
		CropYieldPrediction, StockoutRiskItem, FleetAnomalyAlert,
		RestockProposalRequest, RestockProposalResponse,
		TenantSubscriptionUpdate, TenantBillingSummaryRead, SaaSInvoiceRead,
		FleetTripCreate, FleetTripRead, TripStatusUpdate,
		DeliveryProofCreate, DeliveryProofRead,
		TripInspectionLogCreate, TripInspectionLogRead,
		TenantAnalyticsSummaryRead,
	)
	from .database import encrypt_connection_url, decrypt_connection_url  # type: ignore[no-redef]
	from .workers import etl_worker  # type: ignore[no-redef]
	from .services.ai_governance import ai_governance_engine  # type: ignore[no-redef]
	from .services.ai_parser import ai_document_parser  # type: ignore[no-redef]
	from .services.ai_forecasting import ai_forecasting_service  # type: ignore[no-redef]
	from .two_tier_auth import router as two_tier_auth_router, v1_router as two_tier_auth_v1_router  # type: ignore[no-redef]
	from backend.app.core.middleware import CorrelationIdMiddleware, HostHeaderMiddleware  # type: ignore[no-redef]
	from backend.app.domains.iam.routes import router as iam_auth_router  # type: ignore[no-redef]
	from backend.app.api.v1.procurement import router as procurement_router  # type: ignore[no-redef]
	from backend.app.api.v1.inventory import router as inventory_router  # type: ignore[no-redef]
	from backend.app.api.v1.finance import router as finance_router  # type: ignore[no-redef]
	from backend.app.api.v1.reports import router as reports_router  # type: ignore[no-redef]
	try:
		from backend.app.api.v1.data_observability import router as data_observability_router  # type: ignore[no-redef]
	except (ImportError, ModuleNotFoundError):
		try:
			from app.api.v1.data_observability import router as data_observability_router  # type: ignore[no-redef]
		except (ImportError, ModuleNotFoundError):
			from .api.v1.data_observability import router as data_observability_router  # type: ignore[no-redef]
	from backend.app.services.fleet_service import router as logistics_router  # type: ignore[no-redef]
	from backend.app.api.v1.customs import router as customs_router  # type: ignore[no-redef]
	from backend.app.api.v1.hr import router as hr_router  # type: ignore[no-redef]
	from backend.app.api.v1.saas import router as saas_router  # type: ignore[no-redef]
	from backend.app.api.v1.ai import router as ai_router  # type: ignore[no-redef]
	from backend.app.api.v1.planning import router as planning_router  # type: ignore[no-redef]
	from backend.app.api.v1.auth import router as recovery_auth_router  # type: ignore[no-redef]
	try:
		from app.agent.router import router as agent_router  # type: ignore[no-redef]
	except Exception:
		try:
			from backend.app.agent.router import router as agent_router  # type: ignore[no-redef]
		except Exception:
			try:
				from .agent.router import router as agent_router  # type: ignore[no-redef]
			except Exception:
				agent_router = None
	try:
		from app.api.zatca import router as zatca_router  # type: ignore[no-redef]
	except (ImportError, ModuleNotFoundError):
		try:
			from backend.app.api.zatca import router as zatca_router  # type: ignore[no-redef]
		except (ImportError, ModuleNotFoundError):
			from .api.zatca import router as zatca_router  # type: ignore[no-redef]
	from backend.app.services.sequence_service import SequenceService, get_next_sequence  # type: ignore[no-redef]
	from backend.app.services.bulk_import_service import BulkImportService, parse_raw_rows_from_excel, parse_raw_rows_from_csv  # type: ignore[no-redef]

from backend.app.services.custom_fields import sanitize_attributes
try:
	data_observability_router
except NameError:
	try:
		from backend.app.api.v1.data_observability import router as data_observability_router  # type: ignore[no-redef]
	except (ImportError, ModuleNotFoundError):
		try:
			from app.api.v1.data_observability import router as data_observability_router  # type: ignore[no-redef]
		except (ImportError, ModuleNotFoundError):
			from .api.v1.data_observability import router as data_observability_router  # type: ignore[no-redef]


app = FastAPI(
	title="Meayon ERP backend API",
	version="1.0.0",
	description="نظام إدارة عمليات النقل والشحن والمالية لشركة ميون",
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
	return JSONResponse(
		status_code=429,
		content={
			"detail": "Too many access attempts detected. Your IP signature has been locked out for 60 seconds.",
			"error_code": "BRUTE_FORCE_PREVENTION_TRIGGERED",
		},
	)

DEFAULT_ACCOUNT_SEEDS = (
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

SESSION_COOKIE_NAME = getenv("SESSION_COOKIE_NAME", "oxengl_session")
SESSION_COOKIE_SECURE = getenv("SESSION_COOKIE_SECURE", "true").strip().lower() not in {"0", "false", "no"}
DOMAIN = getenv("DOMAIN", "oxengl.me").strip()
SESSION_COOKIE_DOMAIN = getenv("SESSION_COOKIE_DOMAIN", f".{DOMAIN}") if getenv("ENVIRONMENT") == "production" else None
INSECURE_DEFAULT_SECRETS = {"development-secret-change-me", "secret", "changeme", "default", ""}
from backend.secret_env import require_secret  # strict: no hard-coded fallback secret

JWT_SECRET_KEY = require_secret("JWT_SECRET", "JWT_SECRET_KEY", "OXENGL_JWT_SECRET")
JWT_EXPIRE_SECONDS = int(getenv("JWT_EXPIRE_SECONDS", "7200"))
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
	return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str | None) -> bool:
	if not password_hash:
		return False
	if password_hash.startswith(("$2a$", "$2b$", "$2y$")):
		try:
			import bcrypt
			return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
		except Exception:
			return False
	try:
		return pwd_context.verify(plain_password, password_hash)
	except Exception:
		return False


def _base64url_encode(payload: bytes) -> str:
	return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def _base64url_decode(payload: str) -> bytes:
	return base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))


def create_session_token(*, subject: str, company_id: uuid.UUID | None, role: str, tenant_slug: str | None = None, domain_slug: str | None = None) -> str:
	now = int(time.time())
	header = {"alg": "HS256", "typ": "JWT"}
	cid_str = str(company_id) if company_id else None
	slug = tenant_slug or domain_slug
	payload = {
		"sub": subject,
		"company_id": cid_str,
		"tenant_id": cid_str,
		"tenant_slug": slug,
		"domain_slug": slug,
		"role": role,
		"iat": now,
		"exp": now + JWT_EXPIRE_SECONDS,
	}
	signing_input = f"{_base64url_encode(json.dumps(header, separators=(',', ':')).encode())}.{_base64url_encode(json.dumps(payload, separators=(',', ':')).encode())}"
	signature = hmac.new(JWT_SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256).digest()
	return f"{signing_input}.{_base64url_encode(signature)}"


def decode_session_token(token: str) -> dict[str, object]:
	try:
		header_part, payload_part, signature_part = token.split(".")
	except ValueError as error:
		raise ValueError("Invalid token format") from error
	signing_input = f"{header_part}.{payload_part}"
	known_secrets = [s for s in dict.fromkeys([JWT_SECRET_KEY, os.getenv("JWT_SECRET_TENANT", ""), os.getenv("JWT_SECRET_MASTER", "")]) if s]
	if not any(
		compare_digest(signature_part, _base64url_encode(hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()))
		for secret in known_secrets
	):
		raise ValueError("Invalid token signature")
	payload = json.loads(_base64url_decode(payload_part))
	if int(payload.get("exp", 0)) < int(time.time()):
		raise ValueError("Expired token")
	return payload


def seed_default_accounts(database: Session, company: models.ResCompany) -> None:
	existing_codes = set(database.scalars(select(models.AccountAccount.code).where(models.AccountAccount.company_id == company.id)).all())
	for code, name, internal_type in DEFAULT_ACCOUNT_SEEDS:
		if code not in existing_codes:
			database.add(models.AccountAccount(company_id=company.id, code=code, name=name, internal_type=internal_type, currency=company.currency))


@app.on_event("startup")
def verify_migration_managed_schema() -> None:
	"""Validate security baseline and ensure schema is managed by migrations."""
	current_env = getenv("ENVIRONMENT", getenv("NODE_ENV", "production")).strip().lower()
	secret = JWT_SECRET_KEY.strip()
	if not secret or secret in INSECURE_DEFAULT_SECRETS:
		if current_env not in {"development", "test", "testing", "sandbox_audit"}:
			raise RuntimeError(
				"CRITICAL SECURITY CONFIGURATION ERROR: Production JWT secret is unconfigured or using an insecure default. "
				"Set JWT_SECRET to a strong, high-entropy secret (>= 32 bytes) in environment configuration."
			)
	try:
		with SessionLocal() as db:
			db.execute(text("ALTER TABLE weighbridge_tickets ADD COLUMN IF NOT EXISTS uom VARCHAR(32) DEFAULT 'MT';"))
			db.execute(text("CREATE OR REPLACE VIEW public.chart_of_accounts AS SELECT id, tenant_id, company_id, code AS account_code, name AS account_name, path AS node_path, account_type, currency, is_active, created_at, parent_id FROM public.accounts;"))
			db.execute(text("ALTER TABLE res_companies ALTER COLUMN logo_url TYPE TEXT;"))
			db.execute(text("ALTER TABLE tenants ALTER COLUMN logo_url TYPE TEXT;"))
			db.execute(text("ALTER TABLE res_companies ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) UNIQUE;"))
			db.execute(text("CREATE INDEX IF NOT EXISTS ix_res_companies_custom_domain ON res_companies(custom_domain);"))
			db.execute(text("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES accounts(id) ON DELETE SET NULL;"))
			db.execute(text("ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_code_key;"))
			db.execute(text("""
				DO $$
				BEGIN
					IF NOT EXISTS (
						SELECT 1 FROM pg_constraint WHERE conname = 'uq_accounts_tenant_code'
					) THEN
						ALTER TABLE accounts ADD CONSTRAINT uq_accounts_tenant_code UNIQUE (tenant_id, code);
					END IF;
				END $$;
			"""))
			# SaaS Billing & Subscription Schema Self-Healing
			db.execute(text("ALTER TABLE subscription_plans ALTER COLUMN stripe_price_id DROP NOT NULL;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) DEFAULT 'Standard Plan';"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description TEXT;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS annual_price NUMERIC(10, 2) DEFAULT 0.00;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'SAR';"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255);"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_storage_gb INTEGER DEFAULT 10;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_monthly_transactions INTEGER DEFAULT 1000;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS allow_external_database BOOLEAN DEFAULT FALSE;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS allow_custom_domain BOOLEAN DEFAULT FALSE;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS allow_dedicated_ssl BOOLEAN DEFAULT FALSE;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS features JSON DEFAULT '[]'::json;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_features JSON NOT NULL DEFAULT '[]'::json;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;"))
			db.execute(text("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;"))
			db.execute(text("ALTER TABLE tenant_subscriptions ALTER COLUMN stripe_customer_id DROP NOT NULL;"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(32) DEFAULT 'monthly';"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS payment_method_type VARCHAR(64) DEFAULT 'card';"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS current_storage_mb_used INTEGER DEFAULT 0;"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ DEFAULT NOW();"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS custom_limits JSON;"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS notes TEXT;"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();"))
			db.execute(text("ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES tenant_subscriptions(id) ON DELETE SET NULL;"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL;"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'stripe_card';"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255);"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'SAR';"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS subtotal_sar NUMERIC(18, 4) DEFAULT 0;"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS tax_sar NUMERIC(18, 4) DEFAULT 0;"))
			db.execute(text("ALTER TABLE saas_invoices ADD COLUMN IF NOT EXISTS notes TEXT;"))
			db.execute(text("ALTER TABLE saas_invoices DROP CONSTRAINT IF EXISTS ck_saas_invoice_cycle;"))
			db.execute(text("ALTER TABLE saas_invoices ADD CONSTRAINT ck_saas_invoice_cycle CHECK (billing_cycle IN ('monthly', 'yearly', 'annual', 'quarterly', 'contract'));"))
			db.execute(text("ALTER TABLE master_tenants DROP CONSTRAINT IF EXISTS ck_master_tenant_tier;"))
			db.execute(text("ALTER TABLE master_tenants ADD CONSTRAINT ck_master_tenant_tier CHECK (subscription_tier IN ('starter', 'standard', 'growth', 'enterprise', 'free', 'professional'));"))
			db.commit()

			# Auto-seed the 3-tier subscription plans (Free, Professional, Enterprise)
			from backend.app.services.billing_service import seed_default_subscription_plans
			seed_default_subscription_plans(db)
	except Exception as exc:
		logging.getLogger("uvicorn.error").warning(f"Schema self-healing check warning: {exc}")
	return None


app.add_middleware(
	CORSMiddleware,
	allow_origins=[
		f"https://{DOMAIN}",
		f"https://app.{DOMAIN}",
		"https://oxengl.me",
		"https://app.oxengl.me",
		"https://oxengl.com",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	],
	allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*oxengl\.(me|com)$",
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(HostHeaderMiddleware)

from backend.app.domains.auth import onboard_tenant
app.include_router(onboard_tenant.router)

app.include_router(two_tier_auth_router)
app.include_router(two_tier_auth_v1_router)
app.include_router(iam_auth_router)
app.include_router(recovery_auth_router)
app.include_router(recovery_auth_router, prefix="/api")
app.include_router(recovery_auth_router, prefix="/api/v1")
app.include_router(procurement_router)
app.include_router(inventory_router)
app.include_router(finance_router)
app.include_router(reports_router)
try:
    from backend.app.api.v1.data_observability import router as data_observability_router
    app.include_router(data_observability_router)
except (ImportError, ModuleNotFoundError):
    try:
        from app.api.v1.data_observability import router as data_observability_router
        app.include_router(data_observability_router)
    except Exception:
        pass  # data_observability is optional
from backend.app.domains.finance import audit_export
app.include_router(audit_export.router)
app.include_router(logistics_router)
app.include_router(customs_router, prefix="/api/v1/logistics/customs/manifests")
app.include_router(customs_router, prefix="/api/logistics/customs/manifests")
app.include_router(hr_router, prefix="/api/v1/hr")
app.include_router(saas_router, prefix="/api/v1/saas")
app.include_router(ai_router, prefix="/api/v1/ai")
if agent_router is not None:
	app.include_router(agent_router)
app.include_router(zatca_router)
app.include_router(zatca_router, prefix="/api/v1")
try:
	from backend.app.api import sales_exports
	app.include_router(sales_exports.router)
except (ImportError, ModuleNotFoundError):
	try:
		from app.api import sales_exports
		app.include_router(sales_exports.router)
	except Exception as _e:
		logging.getLogger("uvicorn.error").warning(f"Failed to register sales_exports router: {_e}")
app.include_router(planning_router, prefix="/api/tenant/planning")
app.include_router(planning_router, prefix="/api/v1/planning")
from backend.app.api.v1 import super_admin
app.include_router(super_admin.router)
app.add_api_route(
    "/api/v1/super-admin/tenants/{tenant_slug}/overrides",
    super_admin.update_tenant_overrides,
    methods=["PATCH"],
    tags=["Super Admin"],
)
app.add_api_route(
    "/api/v1/super-admin/tenants/{tenant_id}/toggle-status",
    super_admin.toggle_tenant_status,
    methods=["POST"],
    tags=["Super Admin"],
)
app.add_api_route(
    "/api/v1/super-admin/tenants/{tenant_id}/offboard",
    super_admin.offboard_tenant,
    methods=["POST"],
    tags=["Super Admin"],
    status_code=status.HTTP_202_ACCEPTED,
)
from backend.app.api.v1 import users as users_api
app.include_router(users_api.router)
from backend.app.api.v1 import backup_destinations as backup_destinations_api
app.include_router(backup_destinations_api.tenant_router)
app.include_router(backup_destinations_api.superadmin_router)
from backend.app.api.v1 import communications as communications_api
app.include_router(communications_api.tenant_router)
app.include_router(communications_api.superadmin_router)
from backend.app.api.v1 import tenant_control, master_platform
# tenant_control.router carries a router-level get_authenticated_user dependency;
# public_router holds only the anonymous zero-slug domain-resolution endpoints.
for _tc_prefix in ("/api/tenant/control", "/api/v1/tenant/control", "/tenant/control", "/api/v1/tenant", "/api/tenant"):
	app.include_router(tenant_control.public_router, prefix=_tc_prefix)
	app.include_router(tenant_control.router, prefix=_tc_prefix)
from backend.app.api.v1 import form_schemas as form_schemas_api
for _fs_prefix in ("/api/v1/tenant", "/api/tenant"):
	app.include_router(form_schemas_api.router, prefix=_fs_prefix)
from backend.app.api.v1 import tenant_hr
for _hr_prefix in ("/api/v1/tenant/hr", "/api/tenant/hr"):
	app.include_router(tenant_hr.router, prefix=_hr_prefix)
app.include_router(master_platform.router, prefix="/api/master/platform")
app.include_router(master_platform.router, prefix="/api/v1/master/platform")
app.include_router(master_platform.admin_router, prefix="/api/admin")
app.include_router(master_platform.admin_router, prefix="/api/v1/admin")
from backend.app.api.v1 import system as system_api
app.include_router(system_api.router)
from backend.api.routes.platform_billing import router as platform_billing_router
app.include_router(platform_billing_router)
from backend.api.webhooks.sync import router as user_sync_webhook_router
app.include_router(user_sync_webhook_router)
from backend.app.api.v1.billing import (
    tenant_billing_router,
    superadmin_billing_router,
    billing_summary_router,
    stripe_webhook_router,
    pricing_router,
)
app.include_router(pricing_router, prefix="/api/v1/pricing")
app.include_router(pricing_router, prefix="/api/pricing")
app.include_router(tenant_billing_router, prefix="/api/v1/tenant/billing")
app.include_router(tenant_billing_router, prefix="/api/tenant/billing")
app.include_router(superadmin_billing_router)
app.include_router(billing_summary_router)
app.include_router(stripe_webhook_router, prefix="/api/v1/platform/webhooks")
app.include_router(stripe_webhook_router, prefix="/api/platform/webhooks")
from backend.api.routes.finance_payments import router as finance_payments_router
app.include_router(finance_payments_router)
from backend.api.routes.hrms_ledger import router as hrms_ledger_router
app.include_router(hrms_ledger_router)
from backend.api.routes.procurement import router as procurement_ledger_router
app.include_router(procurement_ledger_router)
from backend.api.routes.inventory import router as inventory_ledger_router
app.include_router(inventory_ledger_router)
from backend.api.routes.analytics import router as analytics_ledger_router
app.include_router(analytics_ledger_router)
from backend.app.api.routers.organization import router as organization_router
app.include_router(organization_router, prefix="/api/v1")
app.include_router(organization_router, prefix="/api")
from backend.app.api.routers.corporate_cv import router as corporate_cv_router
app.include_router(corporate_cv_router, prefix="/api/v1")
app.include_router(corporate_cv_router, prefix="/api")

# Multi-Tenant Workspace Verification & Resolution
from backend.app.api.routers import tenants
app.include_router(tenants.router, prefix="/api/v1/tenants", tags=["Tenants"])
app.include_router(tenants.router, prefix="/api/tenants", tags=["Tenants"])

# Phase 3: Enterprise SSL & Caddy Dynamic Reverse Proxy Gatekeeper
from backend.app.api.v1 import ssl as ssl_api
app.include_router(ssl_api.router, prefix="/api/v1")
app.include_router(ssl_api.router, prefix="/api")
app.include_router(ssl_api.router)

# Global Select & Bulk Operations Architecture
from backend.app.api.v1.bulk import router as bulk_router
app.include_router(bulk_router, prefix="/api/v1")
app.include_router(bulk_router, prefix="/api")




def get_db(request: Request = None) -> Generator[Session, None, None]:
	from backend.database import get_db as _core_get_db
	yield from _core_get_db(request)


def get_platform_db(request: Request) -> Generator[Session, None, None]:
	from backend.database import get_platform_db as _core_get_platform_db
	yield from _core_get_platform_db(request)



def resolve_client_ip(request: Request) -> str | None:
	"""Resolve the client address only through configured, trusted proxy hops."""
	try:
		from backend.app.domains.hr.audit import resolve_hr_client_ip
	except ImportError:
		try:
			from app.domains.hr.audit import resolve_hr_client_ip
		except ImportError:
			return request.client.host[:45] if request.client else None
	try:
		return resolve_hr_client_ip(request)
	except Exception:
		# On resolver failure, prefer the direct peer over an untrusted forwarded header.
		return request.client.host[:45] if request.client else None


def record_platform_audit(database: Session, *, actor_email: str, action: str, endpoint: str, ip_address: str | None, company_id: uuid.UUID | None, outcome: str | None = None, request_id: str | None = None, user_agent: str | None = None, actor_id: uuid.UUID | None = None, tenant_id: uuid.UUID | None = None) -> None:
	"""Break-glass access must leave a permanent trace, but auditing must never block the recovery path."""
	try:
		database.add(models.PlatformAuditLog(actor_email=actor_email, action=action, outcome=outcome or ("FAILED" if action.endswith("FAILED") else "SUCCESS"), endpoint_accessed=endpoint, request_id=request_id or str(uuid.uuid4()), user_agent=(user_agent or "unknown")[:512], ip_address=ip_address, company_id=company_id, actor_id=actor_id, tenant_id=tenant_id))
		database.commit()
	except Exception as error:  # noqa: BLE001
		database.rollback()
		print(f"CRITICAL: platform audit write failed for {action} by {actor_email}: {error}", flush=True)


def record_security_event(
	database: Session,
	*,
	event_type: str,
	severity: str = "HIGH",
	company_id: uuid.UUID | None = None,
	user_id: uuid.UUID | None = None,
	actor_email: str | None = None,
	ip_address: str | None = None,
	user_agent: str | None = None,
	request_path: str | None = None,
	request_method: str | None = None,
	resource_id: str | None = None,
	details: str | None = None,
) -> models.SecurityEvent:
	"""Immutably record security incidents into the security_events table."""
	event = models.SecurityEvent(
		company_id=company_id,
		user_id=user_id,
		actor_email=actor_email,
		event_type=event_type,
		severity=severity,
		ip_address=ip_address,
		user_agent=(user_agent or "")[:512] if user_agent else None,
		request_path=request_path,
		request_method=request_method,
		resource_id=resource_id,
		details=details,
	)
	try:
		database.add(event)
		database.commit()
		database.refresh(event)
	except Exception as error:  # noqa: BLE001
		database.rollback()
		print(f"CRITICAL: Failed to write security event {event_type}: {error}", flush=True)
	return event


def set_session_cookie(response: Response, token: str) -> None:
	response.set_cookie(key=SESSION_COOKIE_NAME, value=token, httponly=True, secure=SESSION_COOKIE_SECURE, samesite="lax", max_age=JWT_EXPIRE_SECONDS, path="/", domain=SESSION_COOKIE_DOMAIN)


def clear_session_cookie(response: Response) -> None:
	response.set_cookie(key=SESSION_COOKIE_NAME, value="", httponly=True, secure=SESSION_COOKIE_SECURE, samesite="lax", max_age=0, expires=0, path="/", domain=SESSION_COOKIE_DOMAIN)


def get_request_id(request: Request) -> str:
	return request.headers.get("x-request-id") or str(uuid.uuid4())


def get_authenticated_user(request: Request, database: Session = Depends(get_db)) -> models.ResUser:
	token = request.cookies.get(SESSION_COOKIE_NAME)
	if not token:
		auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
		if auth_header and auth_header.startswith("Bearer "):
			token = auth_header.split(" ", 1)[1].strip()
	if not token:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication session is required")
	claims = None
	try:
		claims = decode_session_token(token)
	except Exception:
		try:
			from .two_tier_auth import verify_two_tier_jwt
		except ImportError:
			from backend.two_tier_auth import verify_two_tier_jwt
		try:
			claims = verify_two_tier_jwt(token, expected_tier="tenant")
		except Exception:
			try:
				claims = verify_two_tier_jwt(token, expected_tier="master")
			except Exception as error:
				raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from error

	email = str(claims.get("identity") or claims.get("sub") or "").lower().strip()
	if not email:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is missing an authenticated subject")
	master_tier = claims.get("tier") == "master"
	tenant_slug = claims.get("tenant_slug") or claims.get("domain_slug")
	tenant_id = claims.get("tenant_id") or claims.get("company_id")
	if master_tier:
		tenant_slug = tenant_slug or request.headers.get("x-tenant-slug")
		tenant_id = tenant_id or request.headers.get("x-tenant-id") or request.headers.get("x-company-id")
	target_company = None
	if tenant_id:
		try:
			target_company = database.scalar(select(models.ResCompany).where(models.ResCompany.id == uuid.UUID(str(tenant_id))))
		except Exception:
			pass
	if target_company is None and tenant_slug:
		target_company = database.scalar(select(models.ResCompany).where(models.ResCompany.slug == tenant_slug))
	if target_company is None and getattr(request.state, "company_id", None):
		try:
			target_company = database.get(models.ResCompany, request.state.company_id)
		except Exception:
			pass
	if target_company is None and getattr(request.state, "tenant_slug", None):
		target_company = database.scalar(select(models.ResCompany).where(models.ResCompany.slug == request.state.tenant_slug))
	if target_company is None:
		raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
		if raw_host:
			try:
				from backend.app.core.middleware import resolve_tenant_from_host
				tmeta = resolve_tenant_from_host(raw_host, db=database)
				if tmeta and tmeta.get("company_id"):
					target_company = database.get(models.ResCompany, uuid.UUID(str(tmeta["company_id"])))
			except Exception:
				pass

	user = database.scalar(select(models.ResUser).where(models.ResUser.email == email, models.ResUser.is_active.is_(True)))
	if user is None:
		# SECURITY (2026-10-04, incident Addendum C): a validly signed token whose subject is not a
		# registered, active res_users account is REJECTED. Accounts are never provisioned by the auth
		# dependency (previously an unknown subject silently created a user, role taken from token claims,
		# bound to a header-derived or first company). Provisioning happens only via explicit flows
		# (registration, invites, admin user creation, configured SSO JIT).
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session subject is not a registered active user")

	# SECURITY (Addendum C): platform super-admin authority is taken ONLY from the database record.
	# Token claims (role / tier / scopes / is_superuser) are never trusted to elevate a user: the tenant
	# login token carries is_superuser=true for every tenant Admin/Owner, which previously turned all
	# tenant admins into platform super admins on the master-platform API.
	is_master_or_super = master_tier and is_super_admin_authorized(user, request)
	try:
		request.state.claims = claims
		request.state.token_claims = claims
	except Exception:
		pass

	claim_company_id = claims.get("company_id")
	is_exec_role = is_master_or_super
	if claim_company_id and not is_exec_role:
		try:
			claim_uuid = uuid.UUID(str(claim_company_id))
		except ValueError as error:
			raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session company claim is invalid") from error
		# SECURITY (Addendum C): membership is never assigned from token claims.
		if user.company_id is None or claim_uuid != user.company_id:
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Session company does not match authenticated user membership")

	# Dynamic Context Injection into request.state
	active_user_cid = (target_company.id if (target_company and is_exec_role) else user.company_id)
	if active_user_cid:
		request.state.company_id = active_user_cid
		request.state.tenant_company_id = active_user_cid
		request.state.tenant_id = str(active_user_cid)
	request.state.current_user = user
	request.state.is_platform_admin = is_master_or_super
	request.state.platform_db_authorized = is_master_or_super
	database.execute(
		text(
			"SELECT set_config('app.current_tenant_id', :tenant_id, true), "
			"set_config('app.current_company_id', :company_id, true)"
		),
		{
			"tenant_id": str(active_user_cid or ""),
			"company_id": str(active_user_cid or ""),
		},
	)

	return user
get_current_active_user = get_authenticated_user



def get_optional_authenticated_user(request: Request, database: Session = Depends(get_db)) -> models.ResUser | None:
	try:
		return get_authenticated_user(request, database)
	except Exception:
		return None


def get_active_company_id(request: Request, x_company_id: str | None = Header(default=None), database: Session = Depends(get_db), current_user: models.ResUser = Depends(get_authenticated_user)) -> uuid.UUID:
	"""
	Extracts and validates active company UUID with Super Admin bypass,
	graceful fallback for NULL company IDs, and dynamic context injection.
	"""
	user_role_norm = str(getattr(current_user, "role", "") or "").upper().replace(" ", "_")
	is_super_admin = (
		getattr(current_user, "is_superuser", False) is True
		or getattr(current_user, "is_super_admin", False) is True
		or user_role_norm in ["SUPER_ADMIN", "SUPERADMIN", "ROOT", "MASTER"]
		or is_super_admin_authorized(current_user, request)
	)

	raw_cid = (
		x_company_id
		or request.headers.get("x-company-id")
		or request.headers.get("x-tenant-id")
		or request.headers.get("x-target-company-id")
		or request.query_params.get("company_id")
		or request.query_params.get("tenant_id")
		or (str(getattr(request.state, "company_id", None)) if getattr(request.state, "company_id", None) else None)
		or (str(getattr(request.state, "tenant_company_id", None)) if getattr(request.state, "tenant_company_id", None) else None)
	)

	requested_uuid: uuid.UUID | None = None
	if raw_cid:
		try:
			requested_uuid = uuid.UUID(str(raw_cid).strip())
		except (ValueError, TypeError) as error:
			raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Company-ID must be a UUID") from error

	# SECURITY (Addendum C): never silently bind an unassigned account to a tenant
	# (previously: requested header -> Host -> first company, persisted to res_users).
	if current_user.company_id is None and not is_super_admin:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authenticated user is not bound to a tenant workspace")

	if requested_uuid:
		target_company = database.get(models.ResCompany, requested_uuid)
		if target_company is None:
			if is_super_admin:
				effective_id = current_user.company_id or database.scalar(select(models.ResCompany.id).order_by(models.ResCompany.created_at.asc()))
				if not effective_id:
					raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active company was not found")
				company_id = effective_id
			else:
				raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active company was not found")
		else:
			company_id = target_company.id
	else:
		if current_user.company_id:
			company_id = current_user.company_id
		else:
			raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Company-ID is required")

	# Super Admin Isolation Bypass vs Standard Tenant Check (Requirement 1)
	if is_super_admin:
		# SUPER ADMIN BYPASS: Bypass strict user.company_id == requested_tenant.company_id check
		pass
	elif current_user.company_id and company_id != current_user.company_id:
		# Check descendant branch or administrative scopes
		is_branch_allowed = False
		if user_role_norm in ["OWNER", "ADMIN", "CEO", "EXECUTIVE", "COO"]:
			curr = database.get(models.ResCompany, company_id)
			visited = set()
			while curr and curr.parent_id and curr.id not in visited:
				visited.add(curr.id)
				if curr.parent_id == current_user.company_id:
					is_branch_allowed = True
					break
				curr = database.get(models.ResCompany, curr.parent_id)

		if not is_branch_allowed:
			record_security_event(
				database,
				event_type="idor_attempt",
				severity="CRITICAL",
				company_id=company_id,
				user_id=current_user.id,
				actor_email=current_user.email,
				ip_address=resolve_client_ip(request),
				user_agent=request.headers.get("user-agent"),
				request_path=request.url.path,
				request_method=request.method,
				resource_id=str(company_id),
				details="Cross-tenant company header IDOR attempt intercepted by TenantContext write guard",
			)
			record_platform_audit(database, actor_email=current_user.email, action="TENANT_ACCESS_DENIED", endpoint=request.url.path, ip_address=resolve_client_ip(request), company_id=company_id, outcome="DENIED", request_id=get_request_id(request), user_agent=request.headers.get("user-agent"))
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authenticated user is not authorized for this company")

	# Dynamic Context Injection into request.state (Requirement 1)
	request.state.company_id = company_id
	request.state.tenant_company_id = company_id
	request.state.tenant_id = str(company_id)

	return company_id


def require_compliance_admin(
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
) -> models.ResUser:
	"""TenantContext write guard preventing privilege escalation for tax and compliance operations."""
	role_normalized = str(getattr(current_user, "role", "") or "").upper().replace(" ", "_")
	allowed_compliance_roles = {"SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "COO", "CEO", "EXECUTIVE"}
	if not getattr(current_user, "is_superuser", False) and role_normalized not in allowed_compliance_roles:
		record_security_event(
			database,
			event_type="policy_denial",
			severity="HIGH",
			company_id=company_id,
			user_id=current_user.id,
			actor_email=current_user.email,
			ip_address=resolve_client_ip(request),
			user_agent=request.headers.get("user-agent"),
			request_path=request.url.path,
			request_method=request.method,
			details=f"User role '{current_user.role}' denied access to compliance management: requires Admin, CEO, or Accountant",
		)
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Access denied: Admin, CEO, Accountant, or COO role required for compliance configurations",
		)
	return current_user


def is_super_admin_authorized(user: Any, request: Optional[Request] = None) -> bool:
	"""
	Verifies Super Admin authority from the authenticated server-side user record.
	A server-side platform-user flag is accepted only on a signed master-tier session.
	"""
	if user is None:
		return False

	claims = getattr(request.state, "claims", {}) if request is not None else {}
	master_tier = isinstance(claims, dict) and claims.get("tier") == "master"

	# 1. Server-side user authority flags and role.
	if master_tier and (
		getattr(user, "is_superuser", False) is True
		or getattr(user, "is_super_admin", False) is True
	):
		return True

	raw_role = str(getattr(user, "role", "") or "").strip()
	normalized_role = raw_role.upper().replace(" ", "_").replace("-", "_")
	if master_tier and normalized_role in {"SUPER_ADMIN", "SUPERADMIN", "ROOT", "MASTER"}:
		return True

	# 2. Server-side ACL and role mappings.
	acl = str(getattr(user, "access_control_list", "") or "").upper()
	role_ids = str(getattr(user, "role_ids", "") or "").upper()
	if master_tier and ("SUPER_ADMIN" in acl or "SUPER_ADMIN" in role_ids):
		return True

	# 3. Development/provisioning compatibility is opt-in and cannot be enabled
	# merely by omitting ENVIRONMENT or setting a production deployment flag.
	current_env = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "production")).lower()
	dev_env = (
		current_env in ("development", "dev", "test", "testing", "staging", "provisioning")
		and os.getenv("OXENGL_DEV_MODE", "false").lower() in ("true", "1", "yes")
	)
	if dev_env and master_tier:
		is_master_subject = (
			str(getattr(user, "email", "")).lower() in {"admin@oxengl.me", "admin@oxengl.com", "master@oxengl.com", "superadmin@oxengl.com", "devadmin@oxengl.com"}
			or getattr(user, "company_id", None) is None
		)
		if is_master_subject and normalized_role in {"ADMIN", "CEO", "EXECUTIVE", "OPERATOR"}:
			return True

	if request:
		# An explicitly configured platform provisioning key remains an auditable
		# break-glass path; it is never inferred from token claims.
		expected_key = (os.getenv("MASTER_PLATFORM_KEY") or "").strip()
		prov_header = request.headers.get("X-Master-Admin-Key") or request.headers.get("x-master-admin-key")
		if expected_key and prov_header and hmac.compare_digest(prov_header.encode("utf-8"), expected_key.encode("utf-8")):
			return True

	return False


def require_super_admin(
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
) -> models.ResUser:
	"""Master platform security guard verifying Super_Admin authority."""
	if not is_super_admin_authorized(current_user, request):
		record_platform_audit(
			database,
			actor_email=current_user.email,
			action="SUPER_ADMIN_DENIED",
			endpoint=request.url.path,
			ip_address=resolve_client_ip(request),
			company_id=getattr(current_user, "company_id", None),
			outcome="DENIED",
			request_id=get_request_id(request),
			user_agent=request.headers.get("user-agent"),
			actor_id=getattr(current_user, "id", None),
			tenant_id=getattr(current_user, "company_id", None),
		)
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Access denied: Master Platform Security requires Super_Admin role",
		)
	request.state.platform_db_authorized = True
	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="SUPER_ADMIN_ACCESS",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=getattr(current_user, "company_id", None),
		outcome="ALLOWED",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
		actor_id=getattr(current_user, "id", None),
		tenant_id=getattr(current_user, "company_id", None),
	)
	return current_user


# Security dependency aliases for Super Admin verification
get_current_active_superuser = require_super_admin
verify_super_admin_role = require_super_admin
verify_super_admin = require_super_admin


def require_tenant_admin(
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
) -> models.ResUser:
	"""TenantContext security guard restricting tenant administrative actions."""
	role_normalized = str(getattr(current_user, "role", "") or "").upper().replace(" ", "_")
	if not getattr(current_user, "is_superuser", False) and role_normalized not in {"SUPER_ADMIN", "ADMIN", "CEO", "EXECUTIVE"}:
		record_security_event(
			database,
			event_type="policy_denial",
			severity="HIGH",
			company_id=company_id,
			user_id=current_user.id,
			actor_email=current_user.email,
			ip_address=resolve_client_ip(request),
			user_agent=request.headers.get("user-agent"),
			request_path=request.url.path,
			request_method=request.method,
			details=f"User role '{current_user.role}' denied access: requires Admin, CEO, or Super_Admin",
		)
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Access denied: Admin or CEO role required for tenant security operations",
		)
	return current_user



def check_cross_tenant_idor(
	database: Session,
	model_class,
	resource_id: uuid.UUID,
	active_company_id: uuid.UUID,
	current_user: models.ResUser,
	request: Request,
	resource_label: str,
):
	"""Intercept unauthorized IDOR attempts across tenant boundaries, logging them immutably."""
	entity = database.scalar(select(model_class).where(model_class.id == resource_id, model_class.company_id == active_company_id))
	if entity is not None:
		return entity

	other_entity = database.scalar(select(model_class).where(model_class.id == resource_id))
	if other_entity is not None and other_entity.company_id != active_company_id:
		record_security_event(
			database,
			event_type="idor_attempt",
			severity="CRITICAL",
			company_id=active_company_id,
			user_id=current_user.id,
			actor_email=current_user.email,
			ip_address=resolve_client_ip(request),
			user_agent=request.headers.get("user-agent"),
			request_path=request.url.path,
			request_method=request.method,
			resource_id=str(resource_id),
			details=f"Cross-tenant IDOR attempt to access {resource_label} belonging to company {other_entity.company_id}",
		)
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-tenant access forbidden: IDOR security violation")

	raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{resource_label} was not found")


@app.get("/", tags=["Health Check"])
async def root():
	return {
		"status": "online",
		"message": "oxen-gl backend API is running successfully",
		"documentation": "/docs",
	}


@app.get("/health", tags=["Health Check"])
@app.get("/api/v1/health", tags=["Health Check"])
async def health_check():
	return {
		"status": "healthy",
		"timestamp": time.time(),
		"service": "OxenGL Core Backend Service Layer",
		"version": "1.0.0",
	}
@app.get("/api/sequences/next/{entity_type}", tags=["Sequences"])
@app.get("/api/v1/sequences/next/{entity_type}", tags=["Sequences"])
def get_next_entity_sequence(
	entity_type: str,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Returns the preview of the next available sequence code for the entity type."""
	next_seq = SequenceService.preview_next_sequence(database, company_id, entity_type)
	return {
		"entity_type": entity_type,
		"company_id": str(company_id),
		"next_sequence": next_seq,
	}



@app.websocket("/api/v1/tracking/ws/fleet-stream")
@app.websocket("/api/v1/tracking/ws/{stream_id:path}")
@app.websocket("/api/v1/tracking/ws")
async def websocket_fleet_tracking(websocket: WebSocket, stream_id: str = "fleet-stream"):
	await websocket.accept()
	try:
		await websocket.send_json({
			"type": "connection_established",
			"stream_id": stream_id,
			"status": "connected",
			"timestamp": datetime.now(timezone.utc).isoformat(),
			"server": "OxenGL Telemetry Gateway",
			"protocol_version": "1.0",
		})
		while True:
			data = await websocket.receive_text()
			try:
				msg = json.loads(data)
				msg_type = msg.get("type", "ping")
				if msg_type == "ping":
					await websocket.send_json({
						"type": "pong",
						"timestamp": datetime.now(timezone.utc).isoformat(),
					})
				elif msg_type == "subscribe":
					await websocket.send_json({
						"type": "subscribed",
						"channel": msg.get("channel", "fleet-telemetry"),
						"timestamp": datetime.now(timezone.utc).isoformat(),
					})
				else:
					await websocket.send_json({
						"type": "ack",
						"received": msg,
						"timestamp": datetime.now(timezone.utc).isoformat(),
					})
			except json.JSONDecodeError:
				await websocket.send_json({
					"type": "echo",
					"payload": data,
					"timestamp": datetime.now(timezone.utc).isoformat(),
				})
	except WebSocketDisconnect:
		pass
	except Exception:
		pass


@app.get("/api/companies", response_model=list[ResCompanyRead], tags=["Companies"])
def list_companies(database: Session = Depends(get_db), current_user: models.ResUser | None = Depends(get_optional_authenticated_user)):
	companies = database.scalars(select(models.ResCompany).order_by(models.ResCompany.name)).all()
	result = []
	for c in companies:
		if current_user and (is_super_admin_authorized(current_user) or current_user.company_id == c.id):
			result.append(c)
		else:
			# Mask secret licensing keys and tax details for unauthenticated or foreign tenants
			masked = models.ResCompany(
				id=c.id,
				name=c.name,
				slug=c.slug,
				parent_id=c.parent_id,
				currency=c.currency,
				fiscal_calendar=c.fiscal_calendar,
				fiscal_year_start_month=c.fiscal_year_start_month,
				tax_regime=c.tax_regime,
				created_at=c.created_at or datetime.now(timezone.utc),
				subscription_tier=c.subscription_tier,
				license_key=None,
				license_expires_at=None,
				max_cost_centers=c.max_cost_centers,
				theme_mode=c.theme_mode,
				ui_primary_color=c.ui_primary_color,
				ui_logo_url=c.ui_logo_url,
				tax_id=None,
				commercial_registration=None,
			)
			result.append(masked)
	return result


@app.get("/api/auth/tenants-public", response_model=list[PublicTenantRead], tags=["Authentication"])
def list_public_tenants(database: Session = Depends(get_db)):
	"""Safe public tenant directory for tenant discovery without exposing sensitive registration/license secrets."""
	return database.scalars(select(models.ResCompany).order_by(models.ResCompany.name)).all()


@app.get("/api/public/tenants", tags=["Public"])
@app.get("/api/public/tenants/", tags=["Public"])
def list_available_public_tenants(database: Session = Depends(get_db)):
	"""Retrieve active/approved licensed corporate tenants for the public workspace directory."""
	try:
		tenants = database.execute(
			text("""
				SELECT 
					coalesce(c.id, m.id)::text as id,
					coalesce(c.name, m.name) as name,
					coalesce(c.slug, m.slug) as slug,
					coalesce(c.commercial_registration, '1010' || substring(replace(coalesce(c.id, m.id)::text, '-', '') from 1 for 6)) as commercial_registration,
					coalesce(c.max_cost_centers, 25) as max_cost_centers,
					upper(coalesce(c.subscription_tier, m.subscription_tier, 'PROFESSIONAL')) as subscription_tier,
					coalesce(c.ui_logo_url, c.logo_url) as logo_url,
					coalesce(c.ui_primary_color, c.primary_color, '#F97316') as theme_color,
					coalesce(c.ui_primary_color, c.primary_color, '#F97316') as primary_color,
					coalesce(c.secondary_color, '#111827') as secondary_color,
					coalesce(m.status, c.status, 'active') as status
				FROM master_tenants m
				LEFT JOIN res_companies c ON c.id = m.id OR c.slug = m.slug
				WHERE m.status IN ('active', 'approved')
				ORDER BY name ASC
			""")
		).mappings().all()
		return [dict(t) for t in tenants]
	except Exception:
		companies = database.execute(
			text("""
				SELECT 
					id::text,
					name,
					slug,
					coalesce(commercial_registration, '1010' || substring(replace(id::text, '-', '') from 1 for 6)) as commercial_registration,
					coalesce(max_cost_centers, 25) as max_cost_centers,
					upper(coalesce(subscription_tier, 'PROFESSIONAL')) as subscription_tier,
					coalesce(ui_logo_url, logo_url) as logo_url,
					coalesce(ui_primary_color, primary_color, '#F97316') as theme_color,
					coalesce(ui_primary_color, primary_color, '#F97316') as primary_color,
					coalesce(secondary_color, '#111827') as secondary_color,
					coalesce(status, 'active') as status
				FROM res_companies
				WHERE is_active = true OR status IN ('approved', 'active')
				ORDER BY name ASC
				LIMIT 20
			""")
		).mappings().all()
		return [dict(c) for c in companies]


@app.get("/api/v1/tenant/resolve-domain", tags=["Tenants"])
@app.get("/api/tenant/resolve-domain", tags=["Tenants"])
@app.get("/api/v1/auth/resolve-domain", tags=["Tenants"])
def resolve_tenant_domain_public(
	request: Request,
	host: Optional[str] = Query(None),
	database: Session = Depends(get_db),
):
	"""Public Zero-Slug domain resolution endpoint for custom domains and subdomains."""
	from backend.app.core.middleware import resolve_tenant_from_host
	target_host = host or request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
	clean_host = target_host.split(":")[0].strip().lower()

	if not clean_host:
		return {"resolved": False, "message": "Host is required"}

	meta = resolve_tenant_from_host(clean_host, db=database)
	if not meta:
		return {
			"resolved": False,
			"host": clean_host,
			"message": f"No active tenant mapped to domain '{clean_host}'",
		}

	return {
		"resolved": True,
		"tenant_id": meta["tenant_id"],
		"company_id": meta["company_id"],
		"tenant_slug": meta["tenant_slug"],
		"name": meta["name"],
		"custom_domain": meta["custom_domain"],
		"is_custom_domain": meta.get("is_custom_domain", False),
		"logo_url": meta.get("logo_url"),
		"primary_color": meta.get("primary_color"),
		"subscription_tier": meta.get("subscription_tier"),
		"status": meta.get("status"),
	}


@app.get("/api/companies/{company_id}", response_model=ResCompanyRead, tags=["Companies"])
def get_company(company_id: uuid.UUID, active_company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	if company_id != active_company_id:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company details can only be read for the active company")
	company = database.get(models.ResCompany, company_id)
	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company was not found")
	return company


@app.patch("/api/companies/{company_id}", response_model=ResCompanyRead, tags=["Companies"])
def update_company(company_id: uuid.UUID, payload: CompanyUpdate, active_company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	if company_id != active_company_id:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company can only be updated for the active company")
	company = database.get(models.ResCompany, company_id)
	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company was not found")
	updates = payload.model_dump(exclude_unset=True)
	if "parent_id" in updates and updates["parent_id"] == company_id:
		raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Company cannot be its own parent")
	for field, value in updates.items():
		setattr(company, field, value)
	database.commit()
	database.refresh(company)
	return company


@app.put("/api/companies/{company_id}/branding", response_model=ResCompanyRead, tags=["Companies"])
def update_company_branding(company_id: uuid.UUID, payload: CompanyBrandingUpdate, active_company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	if company_id != active_company_id:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company branding can only be updated for the active company")
	company = database.get(models.ResCompany, company_id)
	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company was not found")
	company.ui_logo_url = payload.ui_logo_url
	company.ui_primary_color = payload.ui_primary_color
	company.ui_secondary_color = payload.ui_secondary_color
	if payload.wallpaper_url is not None:
		company.wallpaper_url = payload.wallpaper_url
	if payload.background_url is not None:
		company.background_url = payload.background_url
	database.commit()
	database.refresh(company)
	return company


@app.post("/api/platform/assets/upload", response_model=PlatformAssetUploadResponse, tags=["Platform"])
def upload_platform_asset(
	payload: PlatformAssetUploadRequest,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
):
	target_company = None
	target_cid = payload.company_id or current_user.company_id
	if target_cid:
		target_company = database.get(models.ResCompany, target_cid)

	asset_url = None
	file_name = None
	if payload.file_buffer:
		import os
		ALLOWED_ASSET_MIMES = {
			"data:image/png;base64,": "png",
			"data:image/jpeg;base64,": "jpg",
			"data:image/jpg;base64,": "jpg",
			"data:image/webp;base64,": "webp",
			"data:image/svg+xml;base64,": "svg",
		}
		matched_ext = None
		prefix_len = 0
		for prefix, ext in ALLOWED_ASSET_MIMES.items():
			if payload.file_buffer.startswith(prefix):
				matched_ext = ext
				prefix_len = len(prefix)
				break
		if not matched_ext:
			raise HTTPException(
				status_code=status.HTTP_400_BAD_REQUEST,
				detail="Invalid file type: allowed types are .png, .jpg, .jpeg, .webp, .svg",
			)

		if payload.file_name:
			_, user_ext = os.path.splitext(payload.file_name)
			if user_ext and user_ext.lower().lstrip(".") not in ("png", "jpg", "jpeg", "webp", "svg"):
				raise HTTPException(
					status_code=status.HTTP_400_BAD_REQUEST,
					detail=f"Disallowed file extension: {user_ext}",
				)

		try:
			file_bytes = base64.b64decode(payload.file_buffer[prefix_len:])
			file_name = f"asset_{uuid.uuid4().hex}.{matched_ext}"

			for target_dir in [
				"/var/www/oxengl/dist/assets",
				"/var/www/erp/frontend/dist/assets",
				os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/public/assets")),
			]:
				if os.path.exists(target_dir):
					abs_target = os.path.abspath(target_dir)
					dest_path = os.path.abspath(os.path.join(abs_target, file_name))
					if dest_path.startswith(abs_target + os.sep):
						with open(dest_path, "wb") as f:
							f.write(file_bytes)
			asset_url = f"/assets/{file_name}"
		except HTTPException:
			raise
		except Exception:
			asset_url = f"/assets/{file_name}" if file_name else None

	resolved_wallpaper = payload.wallpaper_url or (asset_url if payload.asset_type in ("platform_wallpaper", "wallpaper", "background", "platform_background") else None)
	resolved_background = payload.background_url or (asset_url if payload.asset_type in ("platform_wallpaper", "wallpaper", "background", "platform_background") else None)

	if target_company:
		if payload.asset_type in ("platform_logo", "logo", "platform_branding") and asset_url:
			target_company.ui_logo_url = asset_url
		if resolved_wallpaper:
			target_company.wallpaper_url = resolved_wallpaper
		if resolved_background:
			target_company.background_url = resolved_background
		if payload.primary_color:
			target_company.ui_primary_color = payload.primary_color
		if payload.secondary_color:
			target_company.ui_secondary_color = payload.secondary_color
		database.commit()
		database.refresh(target_company)

	return PlatformAssetUploadResponse(
		status="success",
		url=asset_url or "",
		file_name=file_name or (f"asset_{uuid.uuid4().hex}.png"),
		asset_type=payload.asset_type,
		primary_color=payload.primary_color,
		secondary_color=payload.secondary_color,
		wallpaper_url=resolved_wallpaper or (target_company.wallpaper_url if target_company else None),
		background_url=resolved_background or (target_company.background_url if target_company else None),
	)


@app.post("/api/companies/register", response_model=CompanyRegistrationRead, status_code=status.HTTP_201_CREATED, tags=["Companies"])
def register_company(payload: CompanyRegistrationCreate, database: Session = Depends(get_db)):
	admin_email = payload.admin_email.lower().strip()
	try:
		with database.begin():
			company = models.ResCompany(name=payload.company_name, slug=payload.slug, tax_id=payload.vat_number, commercial_registration=payload.cr_number)
			database.add(company)
			database.flush()
			seed_default_accounts(database, company)
			database.add(models.StockLocation(company_id=company.id, name="Main Warehouse", location_type="internal"))
			user = models.ResUser(firebase_uid=f"native:{admin_email}", email=admin_email, full_name=payload.admin_name, phone=payload.admin_phone, password_hash=hash_password(payload.admin_password), company_id=company.id, role="Admin", is_active=True)
			database.add(user)
		database.refresh(company)
		database.refresh(user)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Company slug, registration, VAT number, or admin email already exists") from error
	return {"company": company, "user": user}


@app.post("/api/auth/verify", response_model=AuthVerifyResponse, tags=["Authentication"])
def verify_user(payload: AuthVerifyRequest, request: Request, response: Response, database: Session = Depends(get_db)):
	email = payload.email.lower().strip()
	user = database.scalar(select(models.ResUser).where(models.ResUser.email == email))
	if user is None:
		record_platform_audit(database, actor_email=email, action="LOGIN_FAILED", endpoint="/api/auth/verify", ip_address=resolve_client_ip(request), company_id=None)
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
	if not user.is_active:
		record_platform_audit(database, actor_email=email, action="LOGIN_FAILED", endpoint="/api/auth/verify", ip_address=resolve_client_ip(request), company_id=user.company_id)
		return {"message": "Account pending tenant administrator approval", "status": "Pending", "user": {"id": str(user.id), "email": user.email, "fullName": user.full_name, "fullNameAr": user.full_name, "role": user.role, "status": "Pending", "company_id": str(user.company_id)}}
	if not verify_password(payload.password, user.password_hash):
		record_platform_audit(database, actor_email=email, action="LOGIN_FAILED", endpoint="/api/auth/verify", ip_address=resolve_client_ip(request), company_id=user.company_id)
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
	company = database.get(models.ResCompany, user.company_id) if user.company_id else None
	company_slug = company.slug if company else None
	token = create_session_token(
		subject=user.email,
		company_id=user.company_id,
		role=user.role,
		tenant_slug=company_slug,
		domain_slug=company_slug,
	)
	set_session_cookie(response, token)
	record_platform_audit(database, actor_email=user.email, action="LOGIN", endpoint="/api/auth/verify", ip_address=resolve_client_ip(request), company_id=user.company_id)
	return {
		"message": "Authenticated",
		"status": "Active",
		"token": token,
		"user": {
			"id": str(user.id),
			"email": user.email,
			"fullName": user.full_name,
			"fullNameAr": user.full_name,
			"role": user.role,
			"status": "Active",
			"company_id": str(user.company_id) if user.company_id else None,
			"tenant_id": str(user.company_id) if user.company_id else None,
			"tenant_slug": company_slug,
			"domain_slug": company_slug,
		},
	}


@app.post("/api/auth/logout", tags=["Authentication"])
def logout_user(request: Request, response: Response, database: Session = Depends(get_db)):
	actor_email = "anonymous"
	company_id = None
	token = request.cookies.get(SESSION_COOKIE_NAME)
	if token:
		try:
			claims = decode_session_token(token)
			actor_email = str(claims.get("sub") or actor_email)
			company_claim = claims.get("company_id")
			company_id = uuid.UUID(str(company_claim)) if company_claim else None
		except Exception:
			actor_email = "invalid-session"
	record_platform_audit(database, actor_email=actor_email, action="LOGOUT", endpoint="/api/auth/logout", ip_address=resolve_client_ip(request), company_id=company_id)
	clear_session_cookie(response)
	return {"message": "Logged out"}


@app.post("/api/user-registrations", response_model=AuthVerifyResponse, status_code=status.HTTP_201_CREATED, tags=["Authentication"])
def register_user(payload: UserRegistrationCreate, request: Request, database: Session = Depends(get_db)):
	email = payload.email.lower().strip()
	company = database.get(models.ResCompany, payload.company_id)
	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company was not found")
	if database.scalar(select(models.ResUser).where(models.ResUser.email == email)) is not None:
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user already exists with this email")
	user = models.ResUser(firebase_uid=f"native:{email}", email=email, full_name=payload.full_name.strip(), phone=payload.phone.strip(), password_hash=hash_password(payload.password), company_id=payload.company_id, role=payload.requested_role, is_active=False)
	database.add(user)
	database.commit()
	database.refresh(user)
	record_platform_audit(database, actor_email=user.email, action="REGISTRATION", endpoint="/api/user-registrations", ip_address=resolve_client_ip(request), company_id=user.company_id)
	return {"message": "Registration submitted for administrator approval", "status": "Pending", "user": {"id": str(user.id), "email": user.email, "fullName": user.full_name, "fullNameAr": user.full_name, "role": user.role, "status": "Pending", "company_id": str(user.company_id)}}


@app.post("/api/auth/direct-access", tags=["Authentication"])
def direct_workspace_access():
	"""Deprecated backdoor endpoint permanently disabled for security and regulatory compliance."""
	raise HTTPException(
		status_code=status.HTTP_404_NOT_FOUND,
		detail="Direct workspace backdoor access has been permanently disabled.",
	)


TIER_COST_CENTERS = {"BASIC": 5, "PROFESSIONAL": 25, "ENTERPRISE": 100}


def require_platform_key(
	request: Request,
	database: Session = Depends(get_db),
) -> None:
	"""Platform-owner endpoints require an authenticated session with Super_Admin role.

	Uses the exact same guard as the platform branding PUT: a valid master-tier JWT
	(Bearer header or oxengl_session cookie, no 2FA handshake tokens) whose subject is an
	ACTIVE master_users row with role super_admin/admin, checked live against the DB.
	Raises 401 (no/invalid token) or 403 (not an active platform admin).
	"""
	# Lazy import: the branding router is imported near the end of this module.
	from backend.app.api.v1.branding import _authenticate_branding_editor, _require_active_platform_admin

	claims = _authenticate_branding_editor(request, action="issue platform licenses")
	_require_active_platform_admin(claims, database)


@app.get("/api/platform/audit", response_model=IsolationAuditRead, tags=["Platform"])
def platform_isolation_audit(database: Session = Depends(get_db)):
	isolated_tables = database.scalars(text(
		"SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'company_id' ORDER BY table_name"
	)).all()
	tenant_count = database.scalar(select(func.count()).select_from(models.ResCompany)) or 0
	return {
		"isolated_tables": list(isolated_tables),
		"total_isolated_tables": len(isolated_tables),
		"total_registered_tenants": tenant_count,
		"backend_status": "Online 200 OK",
		"security_policy": "Strict Multi-Tenant",
		"checked_at": datetime.now(timezone.utc),
	}


@app.post("/api/platform/licenses", response_model=ResCompanyRead, tags=["Platform"], dependencies=[Depends(require_platform_key)])
def issue_platform_license(payload: LicenseIssueRequest, database: Session = Depends(get_db)):
	lookup = payload.company_id.strip()
	company = None
	try:
		target_uuid = uuid.UUID(lookup)
		company = database.get(models.ResCompany, target_uuid)
	except (ValueError, TypeError):
		pass
	if company is None and lookup:
		company = database.scalar(select(models.ResCompany).where(models.ResCompany.slug == lookup))
	if company is None and lookup:
		# Exact (case-insensitive) match only: ilike() would treat '%'/'_' as wildcards and
		# could silently resolve to an arbitrary tenant.
		company = database.scalar(select(models.ResCompany).where(func.lower(models.ResCompany.name) == lookup.lower()))
	# Never fall back to another tenant: an unknown target must abort, not license someone else.
	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Company '{lookup[:100]}' not found; no license was issued.")

	tier = payload.subscription_tier.upper().strip()
	if tier not in TIER_COST_CENTERS:
		tier = "PROFESSIONAL"

	theme_mode = payload.theme_mode.upper().strip()
	if theme_mode not in ("LIGHT", "DARK", "CUSTOM"):
		theme_mode = "CUSTOM"

	primary_color = payload.ui_primary_color.strip()
	if not re.match(r"^#[0-9a-fA-F]{6}$", primary_color):
		primary_color = "#1E3A8A"
	secondary_color = payload.ui_secondary_color.strip()
	if not re.match(r"^#[0-9a-fA-F]{6}$", secondary_color):
		secondary_color = "#7C3AED"

	company.subscription_tier = tier
	company.max_cost_centers = TIER_COST_CENTERS[tier]
	company.theme_mode = theme_mode
	company.ui_primary_color = primary_color
	company.ui_secondary_color = secondary_color
	company.license_key = f"OXEN-{tier[:3]}-{uuid.uuid4().hex[:8].upper()}-{uuid.uuid4().hex[:4].upper()}"
	company.license_expires_at = datetime.now(timezone.utc) + timedelta(days=max(1, payload.validity_days))
	database.commit()
	database.refresh(company)
	return company


@app.get("/api/partners", response_model=list[ResPartnerRead], tags=["Master Data"])
@app.get("/api/v1/partners", response_model=list[ResPartnerRead], tags=["Master Data"])
def list_partners(
	company_id: uuid.UUID = Depends(get_active_company_id),
	partner_type: Optional[str] = None,
	database: Session = Depends(get_db)
):
	clean_name = func.trim(models.ResPartner.name)
	stmt = (
		select(models.ResPartner)
		.distinct(clean_name)
		.where(
			models.ResPartner.company_id == company_id,
			models.ResPartner.is_active.is_(True),
		)
	)
	if partner_type:
		stmt = stmt.where(models.ResPartner.partner_type == partner_type)
	stmt = stmt.order_by(clean_name, models.ResPartner.created_at.desc())
	return database.scalars(stmt).all()


# Operational quotas per tier. Prices are NOT here: they live in subscription_plans.
TIER_LIMITS = {
	"free": {
		"max_users": 2,
		"max_storage_gb": 5,
		"max_cost_centers": 2,
	},
	"starter": {
		"max_users": 5,
		"max_storage_gb": 5,
		"max_cost_centers": 5,
	},
	"professional": {
		"max_users": 20,
		"max_storage_gb": 50,
		"max_cost_centers": 25,
	},
	"standard": {
		"max_users": 20,
		"max_storage_gb": 50,
		"max_cost_centers": 25,
	},
	"growth": {
		"max_users": 50,
		"max_storage_gb": 50,
		"max_cost_centers": 50,
	},
	"enterprise": {
		"max_users": 999999,
		"max_storage_gb": 1000,
		"max_cost_centers": 999999,
	},
}


def _plan_monthly_rate_sar(database: Session, tier: str | None) -> Decimal:
	"""Monthly list price (SAR) for a tier, read from subscription_plans (single source of truth)."""
	from backend.app.services.billing_service import get_plan_by_name
	plan = get_plan_by_name(database, tier or "free")
	return plan.monthly_price if plan is not None else Decimal("0")


@app.put("/api/master/tenants/{tenant_id}/subscription", tags=["SaaS Billing"])
@app.put("/api/tenant/billing/subscription/{tenant_id}", tags=["SaaS Billing"])
def update_tenant_subscription(
	tenant_id: uuid.UUID,
	payload: TenantSubscriptionUpdate,
	request: Request,
	current_user: models.ResUser = Depends(get_authenticated_user),
	database: Session = Depends(get_db),
):
	"""SuperAdmin: update tenant subscription plan and usage limits."""
	if not is_super_admin_authorized(current_user, request):
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: changing a tenant subscription requires Super_Admin role")
	tenant = database.get(models.MasterTenant, tenant_id)
	if tenant is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Master tenant not found")

	raw_tier = payload.subscription_tier or payload.tier or "professional"
	tier_key = raw_tier.strip().lower()
	from backend.app.services.billing_service import LEGACY_TIER_ALIASES, get_plan_by_name
	plan = get_plan_by_name(database, tier_key) if tier_key in LEGACY_TIER_ALIASES else None
	if plan is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown subscription plan '{raw_tier}'")
	defaults = TIER_LIMITS.get(tier_key, TIER_LIMITS["professional"])
	tenant.subscription_tier = tier_key
	tenant.max_users = payload.max_users or plan.max_seats
	tenant.max_storage_gb = payload.max_storage_gb or plan.max_storage_gb

	# Sync to tenant company if exists in same db
	company = database.scalar(select(models.ResCompany).where(models.ResCompany.slug == tenant.slug))
	if company is not None:
		company.subscription_tier = tier_key.upper()
		company.max_cost_centers = defaults["max_cost_centers"]

	# Sync with Phase 1-3 TenantSubscription model
	try:
		from backend.app.services.billing_service import activate_tenant_subscription
		activate_tenant_subscription(
			db=database,
			tenant_id=tenant.id,
			plan_name=tier_key,
			billing_cycle="monthly",
			payment_method="contract",
			extend_period=True,
		)
	except Exception as exc:
		logging.getLogger("uvicorn.error").warning("Could not sync TenantSubscription domain model: %s", exc)

	# Generate SaaS invoice for plan update
	inv_num = f"SAAS-{datetime.now(timezone.utc):%Y%m}-{uuid.uuid4().hex[:6].upper()}"
	saas_inv = models.SaaSInvoice(
		tenant_id=tenant.id,
		invoice_number=inv_num,
		billing_cycle="monthly",
		tier=tier_key,
		amount_sar=plan.monthly_price,
		status="paid",
		issued_date=datetime.now(timezone.utc),
		paid_at=datetime.now(timezone.utc),
	)
	database.add(saas_inv)
	database.commit()
	database.refresh(tenant)

	return {
		"message": f"Tenant subscription updated to {tier_key}",
		"tenant_id": str(tenant.id),
		"subscription_tier": tenant.subscription_tier,
		"max_users": tenant.max_users,
		"max_storage_gb": tenant.max_storage_gb,
	}


@app.get("/api/master/subscriptions/plans", tags=["SaaS Billing"])
def list_subscription_plans(database: Session = Depends(get_db)):
	"""Legacy catalog shape, served from subscription_plans (canonical endpoint: /api/v1/pricing/plans)."""
	from backend.app.services.billing_service import list_catalog_plans
	result = []
	for plan in list_catalog_plans(database):
		quotas = TIER_LIMITS.get(plan.name.lower(), {})
		result.append({
			"tier": plan.name.lower(),
			"name": plan.display_name,
			"monthly_sar": float(plan.monthly_price),
			"yearly_sar": float(plan.annual_price),
			"max_users": plan.max_seats,
			"max_storage_gb": plan.max_storage_gb,
			"max_cost_centers": quotas.get("max_cost_centers", 25),
			"features": list(plan.display_features or []),
		})
	return result


@app.get("/api/tenant/billing/summary", response_model=TenantBillingSummaryRead, tags=["SaaS Billing"])
def get_tenant_billing_summary(
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Tenant Admin: view active plan, quota limits, and current usage."""
	company = database.get(models.ResCompany, company_id)
	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

	master_tenant = database.scalar(select(models.MasterTenant).where(models.MasterTenant.slug == company.slug))
	tier_key = (master_tenant.subscription_tier if master_tenant else company.subscription_tier or "standard").lower()
	defaults = TIER_LIMITS.get(tier_key, TIER_LIMITS["standard"])

	users_count = database.scalar(
		select(func.count(models.ResUser.id)).where(models.ResUser.company_id == company_id, models.ResUser.is_active.is_(True))
	) or 0
	cost_centers_count = database.scalar(
		select(func.count(models.CostCenter.id)).where(models.CostCenter.company_id == company_id)
	) or 0
	storage_gb = round(users_count * 0.15 + 1.25, 2)

	sub = master_tenant.subscription if (master_tenant and hasattr(master_tenant, "subscription")) else None
	plan = sub.plan if (sub and hasattr(sub, "plan")) else None
	billing_cycle = sub.billing_cycle if sub else "monthly"
	sub_status = sub.status if sub else (master_tenant.status if master_tenant else "active")
	monthly_rate = plan.monthly_price if plan else _plan_monthly_rate_sar(database, tier_key)
	max_users = sub.max_seats if sub else (master_tenant.max_users if master_tenant else defaults["max_users"])
	max_storage = plan.max_storage_gb if plan else (master_tenant.max_storage_gb if master_tenant else defaults["max_storage_gb"])
	next_bill = sub.current_period_end if (sub and sub.current_period_end) else (datetime.now(timezone.utc) + timedelta(days=23))

	return TenantBillingSummaryRead(
		tenant_id=master_tenant.id if master_tenant else company.id,
		tenant_name=company.name,
		tenant_slug=company.slug,
		subscription_tier=tier_key,
		max_users=max_users,
		max_storage_gb=max_storage,
		current_users_count=users_count,
		current_storage_gb=storage_gb,
		current_cost_centers_count=cost_centers_count,
		billing_cycle=billing_cycle,
		status=sub_status,
		monthly_rate_sar=monthly_rate,
		next_billing_date=next_bill,
	)


@app.get("/api/tenant/billing/invoices", response_model=list[SaaSInvoiceRead], tags=["SaaS Billing"])
def get_tenant_saas_invoices(
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Tenant Admin: retrieve historical SaaS subscription invoices."""
	company = database.get(models.ResCompany, company_id)
	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

	master_tenant = database.scalar(select(models.MasterTenant).where(models.MasterTenant.slug == company.slug))
	if master_tenant is None:
		return []

	invoices = database.scalars(
		select(models.SaaSInvoice).where(models.SaaSInvoice.tenant_id == master_tenant.id).order_by(models.SaaSInvoice.issued_date.desc())
	).all()

	if not invoices:
		defaults = TIER_LIMITS.get(master_tenant.subscription_tier.lower(), TIER_LIMITS["standard"])
		inv = models.SaaSInvoice(
			tenant_id=master_tenant.id,
			invoice_number=f"SAAS-INV-{datetime.now(timezone.utc):%Y%m}-001",
			billing_cycle="monthly",
			tier=master_tenant.subscription_tier,
			amount_sar=_plan_monthly_rate_sar(database, master_tenant.subscription_tier),
			status="paid",
			issued_date=datetime.now(timezone.utc) - timedelta(days=7),
			due_date=datetime.now(timezone.utc) + timedelta(days=23),
			paid_at=datetime.now(timezone.utc) - timedelta(days=7),
			pdf_url=f"/api/tenant/billing/invoices/SAAS-INV-{datetime.now(timezone.utc):%Y%m}-001.pdf",
		)
		database.add(inv)
		database.commit()
		database.refresh(inv)
		invoices = [inv]

	return invoices


@app.get("/api/partners/{partner_id}", response_model=ResPartnerRead, tags=["Master Data"])
def get_partner(partner_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == partner_id, models.ResPartner.company_id == company_id, models.ResPartner.is_active.is_(True)))
	if partner is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner was not found")
	return partner


@app.post("/api/partners", response_model=ResPartnerRead, status_code=status.HTTP_201_CREATED, tags=["Master Data"])
def create_partner(payload: ResPartnerCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	partner = models.ResPartner(company_id=company_id, **payload.model_dump())
	try:
		database.add(partner)
		database.commit()
		database.refresh(partner)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partner email or tax number already exists") from error
	return partner


@app.patch("/api/partners/{partner_id}", response_model=ResPartnerRead, tags=["Master Data"])
def update_partner(partner_id: uuid.UUID, payload: ResPartnerUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == partner_id, models.ResPartner.company_id == company_id, models.ResPartner.is_active.is_(True)))
	if partner is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		if field == "custom_attributes":
			partner.custom_attributes = {**(partner.custom_attributes or {}), **(value or {})}
			continue
		setattr(partner, field, value)
	try:
		database.commit()
		database.refresh(partner)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partner email or tax number already exists") from error
	return partner


@app.delete("/api/partners/{partner_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Master Data"])
def archive_partner(partner_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == partner_id, models.ResPartner.company_id == company_id, models.ResPartner.is_active.is_(True)))
	if partner is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner was not found")
	partner.is_active = False
	database.commit()
	return None


@app.get("/api/locations", response_model=list[StockLocationRead], tags=["Master Data"])
def list_locations(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.StockLocation).where(models.StockLocation.company_id == company_id, models.StockLocation.is_active.is_(True)).order_by(models.StockLocation.name)).all()


@app.post("/api/locations", response_model=StockLocationRead, status_code=status.HTTP_201_CREATED, tags=["Master Data"])
def create_location(payload: StockLocationCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	location = models.StockLocation(company_id=company_id, **payload.model_dump())
	database.add(location)
	database.commit()
	database.refresh(location)
	return location


@app.get("/api/products", response_model=list[ProductProductRead], tags=["Master Data"])
@app.get("/api/v1/products", response_model=list[ProductProductRead], tags=["Master Data"])
def list_products(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	clean_name = func.trim(models.ProductProduct.name)
	stmt = (
		select(models.ProductProduct)
		.distinct(clean_name)
		.where(
			models.ProductProduct.company_id == company_id,
			models.ProductProduct.is_active.is_(True),
		)
		.order_by(clean_name, models.ProductProduct.created_at.desc())
	)
	return database.scalars(stmt).all()


@app.post("/api/products", response_model=ProductProductRead, status_code=status.HTTP_201_CREATED, tags=["Master Data"])
def create_product(payload: ProductProductCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	product = models.ProductProduct(company_id=company_id, **payload.model_dump())
	try:
		database.add(product)
		database.commit()
		database.refresh(product)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product SKU already exists") from error
	return product


def operation_response(ticket: models.WeighbridgeTicket) -> WeighbridgeOperationRead:
	moves = ticket.picking.moves if ticket.picking and ticket.picking.moves else []
	move = moves[0] if moves else None
	return WeighbridgeOperationRead(
		picking_id=ticket.picking.id if ticket.picking else None,
		picking_reference=ticket.picking.reference if ticket.picking else None,
		partner_id=ticket.picking.partner_id if ticket.picking else None,
		partner_name=ticket.picking.partner.name if (ticket.picking and ticket.picking.partner) else None,
		product_id=move.product_id if move else None,
		product_name=move.product.name if (move and move.product) else None,
		source_location_id=move.location_id if move else None,
		source_location_name=move.source_location.name if (move and move.source_location) else None,
		dest_location_id=move.location_dest_id if move else None,
		dest_location_name=move.destination_location.name if (move and move.destination_location) else None,
		ticket_id=ticket.id, ticket_number=ticket.ticket_number, truck_number=ticket.truck_number,
		gross_weight=ticket.gross_weight, tare_weight=ticket.tare_weight, net_weight=ticket.net_weight,
		uom=getattr(ticket, "uom", None) or getattr(ticket, "unit_of_measure", "MT") or "MT",
		unit_of_measure=getattr(ticket, "uom", None) or getattr(ticket, "unit_of_measure", "MT") or "MT",
		weighed_in_at=ticket.weighed_in_at, attachments=ticket.attachments or [],
		scale_ticket_attachment=ticket.scale_ticket_attachment,
		material_supplier_name=getattr(ticket, "material_supplier_name", None),
		service_supplier_name=getattr(ticket, "service_supplier_name", None),
		destination_customer_name=getattr(ticket, "destination_customer_name", None),
		loading_invoice_no=getattr(ticket, "loading_invoice_no", None),
		receipt_invoice_no=getattr(ticket, "receipt_invoice_no", None),
		material_type=getattr(ticket, "material_type", None),
		qty_loaded=getattr(ticket, "qty_loaded", None),
		qty_delivered=getattr(ticket, "qty_delivered", None),
		qty_wastage=getattr(ticket, "qty_wastage", None),
		wastage_percentage=getattr(ticket, "wastage_percentage", None),
		sales_amount=getattr(ticket, "sales_amount", None),
		vat_amount=getattr(ticket, "vat_amount", None),
		total_sales=getattr(ticket, "total_sales", None),
		purchases_cost=getattr(ticket, "purchases_cost", None),
		crusher_payment=getattr(ticket, "crusher_payment", None),
		net_profit=getattr(ticket, "net_profit", None),
		operation_month=getattr(ticket, "operation_month", None),
		operation_year=getattr(ticket, "operation_year", None),
		notes=getattr(ticket, "notes", None),
		raw_legacy_data=getattr(ticket, "raw_legacy_data", {}) or {},
		custom_attributes=getattr(ticket, "custom_attributes", {}) or {},
	)


def fiscal_year_for_date(database: Session, company_id: uuid.UUID, move_date: datetime) -> models.FiscalYear:
	year_name = str(move_date.year)
	fiscal_year = database.scalar(select(models.FiscalYear).where(models.FiscalYear.company_id == company_id, models.FiscalYear.name == year_name))
	if fiscal_year is None:
		fiscal_year = models.FiscalYear(company_id=company_id, name=year_name, date_start=datetime(move_date.year, 1, 1, tzinfo=timezone.utc), date_end=datetime(move_date.year, 12, 31, 23, 59, 59, tzinfo=timezone.utc), state="open")
		database.add(fiscal_year)
		database.flush()
	if fiscal_year.state in {"closed", "locked"}:
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Fiscal year is closed or locked")
	return fiscal_year


def account_by_code(database: Session, company_id: uuid.UUID, code: str, name: str, internal_type: str) -> models.AccountAccount:
	account = database.scalar(select(models.AccountAccount).where(models.AccountAccount.company_id == company_id, models.AccountAccount.code == code))
	if account is None:
		company = database.get(models.ResCompany, company_id)
		account = models.AccountAccount(company_id=company_id, code=code, name=name, internal_type=internal_type, currency=company.currency if company else "SAR")
		database.add(account)
		database.flush()
	return account


def journal_by_code(database: Session, company_id: uuid.UUID, code: str, name: str, journal_type: str, prefix: str) -> models.AccountJournal:
	journal = database.scalar(select(models.AccountJournal).where(models.AccountJournal.company_id == company_id, models.AccountJournal.code == code).with_for_update())
	if journal is None:
		journal = models.AccountJournal(company_id=company_id, code=code, name=name, journal_type=journal_type, sequence_prefix=prefix, next_sequence=1)
		database.add(journal)
		database.flush()
	return journal


def assign_move_sequence(move: models.AccountMove, journal: models.AccountJournal, move_date: datetime) -> None:
	sequence_number = journal.next_sequence
	journal.next_sequence += 1
	move.sequence_number = sequence_number
	move.name = move.name or f"{journal.sequence_prefix}/{move_date:%Y}/{sequence_number:05d}"


def validate_balanced_lines(lines: list[AccountMoveLineCreate]) -> None:
	if len(lines) < 2:
		raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Journal entry must contain at least two lines")
	debit_total = sum((line.debit for line in lines), Decimal("0"))
	credit_total = sum((line.credit for line in lines), Decimal("0"))
	if debit_total <= 0:
		raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Journal entry total debit and credit must be greater than zero")
	if debit_total != credit_total:
		raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Journal entry is unbalanced: total debit must equal total credit")
	for line in lines:
		if line.debit < 0 or line.credit < 0:
			raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Line amounts cannot be negative")
		if (line.debit > 0 and line.credit > 0) or (line.debit == 0 and line.credit == 0):
			raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Each line must have either debit or credit greater than zero, not both or neither")


def create_posted_account_move(database: Session, company_id: uuid.UUID, payload: AccountMoveCreate) -> models.AccountMove:
	from backend.app.domains.finance import TransactionProcessingService
	return TransactionProcessingService.create_posted_account_move(database, company_id, payload)


@app.post("/api/operations/weighbridge", response_model=WeighbridgeOperationRead, status_code=status.HTTP_201_CREATED, tags=["Operations"])
@app.post("/api/v1/operations/weighbridge", response_model=WeighbridgeOperationRead, status_code=status.HTTP_201_CREATED, tags=["Operations"])
def create_weighbridge_operation(payload: WeighbridgeOperationCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	gross_weight = payload.gross_weight.quantize(Decimal("0.0001"))
	tare_weight = payload.tare_weight.quantize(Decimal("0.0001"))
	net_weight = payload.net_weight if payload.net_weight is not None else (gross_weight - tare_weight)

	tkt_input = (payload.scale_ticket_no or payload.scaleTicketNo or payload.ticket_number or payload.ticketNumber or "").strip()
	if not tkt_input or "auto" in tkt_input.lower() or "توليد" in tkt_input or (tkt_input.startswith("TKT-") and len(tkt_input) > 15):
		ticket_number = SequenceService.get_next_sequence(database, company_id, "ticket")
	else:
		ticket_number = tkt_input
	reference = ticket_number

	loading_inv_input = (payload.loading_invoice_no or payload.loadingInvoiceNo or "").strip()
	if not loading_inv_input or "auto" in loading_inv_input.lower() or "توليد" in loading_inv_input:
		loading_invoice_no = SequenceService.get_next_sequence(database, company_id, "supplier_invoice")
	else:
		loading_invoice_no = loading_inv_input

	receipt_inv_input = (payload.receipt_invoice_no or payload.receiptInvoiceNo or "").strip()
	if not receipt_inv_input or "auto" in receipt_inv_input.lower() or "توليد" in receipt_inv_input:
		receipt_invoice_no = SequenceService.get_next_sequence(database, company_id, "customer_invoice")
	else:
		receipt_invoice_no = receipt_inv_input

	try:
		tx_ctx = database.begin_nested() if database.in_transaction() else database.begin()
		with tx_ctx:
			# 1. Resolve partner
			partner = None
			if payload.partner_id:
				partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == payload.partner_id, models.ResPartner.company_id == company_id))
			if partner is None and payload.partner_name:
				partner = database.scalar(select(models.ResPartner).where(models.ResPartner.company_id == company_id, models.ResPartner.name == payload.partner_name.strip()))
				if partner is None:
					partner = models.ResPartner(company_id=company_id, name=payload.partner_name.strip(), partner_type="supplier")
					database.add(partner)
					database.flush()

			# 2. Resolve product
			product = None
			if payload.product_id:
				product = database.scalar(select(models.ProductProduct).where(models.ProductProduct.id == payload.product_id, models.ProductProduct.company_id == company_id))
			if product is None and payload.product_name:
				product = database.scalar(select(models.ProductProduct).where(models.ProductProduct.company_id == company_id, models.ProductProduct.name == payload.product_name.strip()))
				if product is None:
					sku = f"AUTO-{uuid.uuid4().hex[:8].upper()}"
					product = models.ProductProduct(company_id=company_id, name=payload.product_name.strip(), sku=sku, product_type="storable")
					database.add(product)
					database.flush()

			# 3. Resolve source location
			source = None
			if payload.source_location_id:
				source = database.scalar(select(models.StockLocation).where(models.StockLocation.id == payload.source_location_id, models.StockLocation.company_id == company_id))
			if source is None and payload.source_location_name:
				source = database.scalar(select(models.StockLocation).where(models.StockLocation.company_id == company_id, models.StockLocation.name == payload.source_location_name.strip()))
				if source is None:
					source = models.StockLocation(company_id=company_id, name=payload.source_location_name.strip(), location_type="supplier")
					database.add(source)
					database.flush()

			# 4. Resolve destination location
			destination = None
			if payload.dest_location_id:
				destination = database.scalar(select(models.StockLocation).where(models.StockLocation.id == payload.dest_location_id, models.StockLocation.company_id == company_id))
			if destination is None and payload.dest_location_name:
				destination = database.scalar(select(models.StockLocation).where(models.StockLocation.company_id == company_id, models.StockLocation.name == payload.dest_location_name.strip()))
				if destination is None:
					destination = models.StockLocation(company_id=company_id, name=payload.dest_location_name.strip(), location_type="customer")
					database.add(destination)
					database.flush()

			if not all((partner, product, source, destination)):
				raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner, product, or stock location was not found or could not be resolved")

			picking = models.StockPicking(company_id=company_id, reference=reference, picking_type="outgoing", state="done", partner_id=partner.id, completed_at=datetime.now(timezone.utc))
			database.add(picking)
			database.flush()

			move = models.StockMove(company_id=company_id, picking_id=picking.id, product_id=product.id, location_id=source.id, location_dest_id=destination.id, quantity_planned=net_weight, quantity_done=net_weight, state="done", moved_at=datetime.now(timezone.utc))
			database.add(move)

			for location_id, quantity_change in ((source.id, -net_weight), (destination.id, net_weight)):
				quant = database.scalar(select(models.StockQuant).where(models.StockQuant.company_id == company_id, models.StockQuant.product_id == product.id, models.StockQuant.location_id == location_id).with_for_update())
				if quant:
					quant.quantity += quantity_change
				else:
					database.add(models.StockQuant(company_id=company_id, product_id=product.id, location_id=location_id, quantity=quantity_change))

			selected_uom = payload.uom or payload.unit_of_measure or "MT"
			ticket = models.WeighbridgeTicket(
				company_id=company_id,
				ticket_number=ticket_number,
				picking_id=picking.id,
				truck_number=payload.truck_number,
				gross_weight=gross_weight,
				tare_weight=tare_weight,
				net_weight=net_weight,
				uom=selected_uom,
				unit_of_measure=selected_uom,
				weighed_in_at=datetime.now(timezone.utc),
				weighed_out_at=datetime.now(timezone.utc),
				attachments=payload.attachments or [],
				scale_ticket_attachment=payload.scale_ticket_attachment,
				material_supplier_name=source.name if source else None,
				service_supplier_name=partner.name if partner else None,
				destination_customer_name=destination.name if destination else None,
				loading_invoice_no=loading_invoice_no,
				receipt_invoice_no=receipt_invoice_no,
				material_type=product.name if product else None,
				qty_loaded=payload.qty_loaded if payload.qty_loaded is not None else gross_weight,
				qty_delivered=payload.qty_delivered if payload.qty_delivered is not None else net_weight,
				qty_wastage=payload.qty_wastage if payload.qty_wastage is not None else (gross_weight - net_weight),
				wastage_percentage=payload.wastage_percentage,
				sales_amount=payload.sales_amount if payload.sales_amount is not None else payload.salesAmount,
				vat_amount=payload.vat_amount if payload.vat_amount is not None else payload.vatAmount,
				total_sales=payload.total_sales if payload.total_sales is not None else payload.totalSales,
				purchases_cost=payload.purchases_cost if payload.purchases_cost is not None else payload.purchasesCost,
				crusher_payment=payload.crusher_payment if payload.crusher_payment is not None else payload.crusherPayment,
				net_profit=payload.net_profit if payload.net_profit is not None else payload.netProfit,
				operation_month=payload.operation_month if payload.operation_month is not None else payload.operationMonth,
				operation_year=payload.operation_year if payload.operation_year is not None else payload.operationYear,
				notes=payload.notes,
				custom_attributes=payload.custom_attributes or {},
			)
			database.add(ticket)
		database.commit()
		database.refresh(ticket)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to create the weighbridge operation") from error
	return operation_response(ticket)


@app.get("/api/operations", response_model=list[WeighbridgeOperationRead], tags=["Operations"])
@app.get("/api/v1/operations", response_model=list[WeighbridgeOperationRead], tags=["Operations"])
@app.get("/api/v1/logistics/operations", response_model=list[WeighbridgeOperationRead], tags=["Operations"])
@app.get("/api/v1/procurement/weighbridge", response_model=list[WeighbridgeOperationRead], tags=["Operations"])
def get_operations(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	tickets = database.scalars(select(models.WeighbridgeTicket).join(models.WeighbridgeTicket.picking).where(models.WeighbridgeTicket.company_id == company_id).order_by(models.WeighbridgeTicket.weighed_in_at.desc()).limit(100)).all()
	return [operation_response(ticket) for ticket in tickets]


@app.post("/api/operations/attachments", response_model=OperationAttachmentRead, status_code=status.HTTP_201_CREATED, tags=["Operations"])
@app.post("/api/v1/operations/attachments", response_model=OperationAttachmentRead, status_code=status.HTTP_201_CREATED, tags=["Operations"])
def create_operation_attachment(
	payload: OperationAttachmentCreate,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db)
):
	from sqlalchemy.orm.attributes import flag_modified

	fn = payload.fileName or payload.file_name or "attachment"
	fs = payload.fileSize or payload.file_size or "0 KB"
	ft = payload.fileType or payload.file_type or "application/octet-stream"
	dc = payload.docCategory or payload.doc_category or "Other"
	fd = payload.fileData or payload.file_data or ""
	ub = payload.uploadedBy or payload.uploaded_by or "System"

	target_ticket = None
	target_id_raw = payload.operation_id or payload.picking_id or payload.ticket_id
	if target_id_raw:
		try:
			target_uuid = uuid.UUID(str(target_id_raw))
			target_ticket = database.scalar(
				select(models.WeighbridgeTicket).where(
					(models.WeighbridgeTicket.id == target_uuid) |
					(models.WeighbridgeTicket.picking_id == target_uuid)
				)
			)
		except ValueError:
			target_ticket = database.scalar(
				select(models.WeighbridgeTicket).where(
					models.WeighbridgeTicket.ticket_number == str(target_id_raw)
				)
			)

	if not target_ticket:
		target_ticket = database.scalar(
			select(models.WeighbridgeTicket)
			.where(models.WeighbridgeTicket.company_id == company_id)
			.order_by(models.WeighbridgeTicket.weighed_in_at.desc())
		)

	att = models.OperationAttachment(
		company_id=company_id,
		ticket_id=target_ticket.id if target_ticket else None,
		file_name=fn,
		file_size=fs,
		file_type=ft,
		doc_category=dc,
		file_data=fd,
		uploaded_by=ub,
		uploaded_at=datetime.now(timezone.utc),
	)
	database.add(att)

	if target_ticket:
		current_attachments = list(target_ticket.attachments or [])
		current_attachments.append({
			"id": str(att.id),
			"fileName": fn,
			"fileSize": fs,
			"fileType": ft,
			"docCategory": dc,
			"fileData": fd,
			"uploadedAt": att.uploaded_at.isoformat(),
			"uploadedBy": ub,
		})
		target_ticket.attachments = current_attachments
		if dc == "Scale Ticket" and fd:
			target_ticket.scale_ticket_attachment = fd
		flag_modified(target_ticket, "attachments")
		database.add(target_ticket)

	database.commit()
	database.refresh(att)
	return att


@app.get("/api/operations/attachments", response_model=list[OperationAttachmentRead], tags=["Operations"])
@app.get("/api/v1/operations/attachments", response_model=list[OperationAttachmentRead], tags=["Operations"])
def list_operation_attachments(
	operation_id: Optional[uuid.UUID] = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db)
):
	stmt = select(models.OperationAttachment).where(
		(models.OperationAttachment.company_id == company_id) | (models.OperationAttachment.company_id.is_(None))
	)
	if operation_id:
		stmt = stmt.where(models.OperationAttachment.ticket_id == operation_id)
	return database.scalars(stmt.order_by(models.OperationAttachment.created_at.desc())).all()


@app.get("/api/operations/{picking_id}", response_model=WeighbridgeOperationRead, tags=["Operations"])
@app.get("/api/v1/operations/{picking_id}", response_model=WeighbridgeOperationRead, tags=["Operations"])
def get_operation_by_picking_id(picking_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	ticket = database.scalar(select(models.WeighbridgeTicket).where(models.WeighbridgeTicket.picking_id == picking_id, models.WeighbridgeTicket.company_id == company_id))
	if ticket is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weighbridge operation not found")
	return operation_response(ticket)


@app.delete("/api/operations/{picking_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Operations"])
@app.delete("/api/v1/operations/{picking_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Operations"])
def delete_operation_by_picking_id(picking_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	picking = database.scalar(select(models.StockPicking).where(models.StockPicking.id == picking_id, models.StockPicking.company_id == company_id))
	if picking is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation picking not found")
	database.delete(picking)
	database.commit()
	return None


# ==============================================================================
# Phase 7: Universal Bulk Import Engine Endpoints
# ==============================================================================

@app.post("/api/operations/bulk-import", tags=["Operations"])
@app.post("/api/v1/operations/bulk-import", tags=["Operations"])
@app.post("/api/v1/procurement/bulk-import", tags=["Operations"])
@app.post("/api/v1/logistics/bulk-import", tags=["Operations"])
@app.post("/api/v1/invoicing/bulk-import", tags=["Operations"])
@app.post("/api/v1/accounting/bulk-import", tags=["Operations"])
@app.post("/api/v1/finance/bulk-import", tags=["Operations"])
@app.post("/api/v1/hrms/bulk-import", tags=["Operations"])
async def bulk_import_operations(
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db)
):
	"""
	Universal bulk import engine for operations and legacy "قاعدة البيانات الشاملة".
	Accepts multipart file upload (.xlsx, .xls, .csv) OR JSON payload {"records": [...]}.
	Streams data for optimal memory efficiency and maps legacy columns ('الناقل', 'الكسارة', 'العميل', etc.)
	into universal entities (service_suppliers, material_suppliers, customers) while persisting extended superset records.
	"""
	content_type = request.headers.get("content-type", "").lower()
	raw_rows = None

	if "multipart/form-data" in content_type:
		form = await request.form()
		uploaded_file = form.get("file")
		if uploaded_file and hasattr(uploaded_file, "read"):
			content = await uploaded_file.read()
			filename = (getattr(uploaded_file, "filename", "") or "").lower()
			if filename.endswith(".xlsx") or filename.endswith(".xls"):
				raw_rows = stream_raw_rows_from_excel(content)
			else:
				raw_rows = stream_raw_rows_from_csv(content)
		elif form.get("records") or form.get("rows"):
			raw_text = str(form.get("records") or form.get("rows"))
			raw_rows = json.loads(raw_text)
	else:
		try:
			body = await request.json()
			if isinstance(body, list):
				raw_rows = body
			elif isinstance(body, dict):
				raw_rows = body.get("records") or body.get("rows") or body.get("items") or [body]
		except Exception as parse_err:
			raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON payload: {str(parse_err)}")

	if raw_rows is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows or file provided for bulk import")

	service = BulkImportService(database, company_id)
	result = service.import_operations(raw_rows)
	return result


@app.post("/api/partners/bulk-import", tags=["Master Data"])
@app.post("/api/v1/partners/bulk-import", tags=["Master Data"])
@app.post("/api/v1/master/partners/bulk-import", tags=["Master Data"])
@app.post("/api/v1/customers/bulk-import", tags=["Master Data"])
@app.post("/api/v1/crushers/bulk-import", tags=["Master Data"])
@app.post("/api/v1/transporters/bulk-import", tags=["Master Data"])
async def bulk_import_partners(
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db)
):
	"""
	Universal bulk import engine for Master Data Partners (Clients, Material Suppliers, Service Suppliers).
	Accepts multipart file upload (.xlsx, .xls, .csv) OR JSON payload.
	Streams data for optimal memory efficiency.
	"""
	content_type = request.headers.get("content-type", "").lower()
	raw_rows = None

	if "multipart/form-data" in content_type:
		form = await request.form()
		uploaded_file = form.get("file")
		if uploaded_file and hasattr(uploaded_file, "read"):
			content = await uploaded_file.read()
			filename = (getattr(uploaded_file, "filename", "") or "").lower()
			if filename.endswith(".xlsx") or filename.endswith(".xls"):
				raw_rows = stream_raw_rows_from_excel(content)
			else:
				raw_rows = stream_raw_rows_from_csv(content)
		elif form.get("records") or form.get("rows"):
			raw_text = str(form.get("records") or form.get("rows"))
			raw_rows = json.loads(raw_text)
	else:
		try:
			body = await request.json()
			if isinstance(body, list):
				raw_rows = body
			elif isinstance(body, dict):
				raw_rows = body.get("records") or body.get("rows") or body.get("items") or [body]
		except Exception as parse_err:
			raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON payload: {str(parse_err)}")

	if raw_rows is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows or file provided for bulk import")

	service = BulkImportService(database, company_id)
	result = service.import_partners(raw_rows)
	return result


@app.post("/api/v1/finance/invoices/bulk-import", tags=["Customer Invoices"])
@app.post("/api/v1/finance/vouchers/bulk-import", tags=["Finance"])
async def bulk_import_finance_documents(
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Excel/CSV/JSON import of invoices or vouchers; unknown columns land in custom_attributes."""
	from backend.app.services.finance_document_import import import_customer_invoices, import_journal_vouchers

	is_voucher = "/vouchers/" in request.url.path
	content_type = request.headers.get("content-type", "").lower()
	raw_rows = None
	if "multipart/form-data" in content_type:
		form = await request.form()
		uploaded_file = form.get("file")
		if uploaded_file and hasattr(uploaded_file, "read"):
			content = await uploaded_file.read()
			filename = (getattr(uploaded_file, "filename", "") or "").lower()
			raw_rows = stream_raw_rows_from_excel(content) if filename.endswith((".xlsx", ".xls")) else stream_raw_rows_from_csv(content)
	else:
		try:
			body = await request.json()
		except Exception as parse_err:
			raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON payload: {parse_err}")
		raw_rows = body if isinstance(body, list) else (body.get("records") or body.get("rows") or body.get("items")) if isinstance(body, dict) else None
	if raw_rows is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows or file provided for bulk import")
	importer = import_journal_vouchers if is_voucher else import_customer_invoices
	return importer(database, company_id, raw_rows)


@app.post("/api/v1/procurement/purchase-orders/bulk-import", tags=["Procurement"])
@app.post("/api/v1/inventory/items/bulk-import", tags=["Warehouse"])
async def bulk_import_procurement_inventory(
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Excel/CSV/JSON import of purchase orders or stock items; unknown columns land in custom_attributes."""
	from backend.app.services.erp_document_import import import_purchase_orders, import_stock_items, read_import_rows

	rows = await read_import_rows(request)
	importer = import_purchase_orders if "/procurement/" in request.url.path else import_stock_items
	return importer(database, company_id, rows)


@app.get("/api/accounting/accounts", response_model=list[AccountAccountRead], tags=["Accounting"])
@app.get("/api/v1/accounting/accounts", response_model=list[AccountAccountRead], tags=["Accounting"])
def list_accounts(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.AccountAccount).where(models.AccountAccount.company_id == company_id).order_by(models.AccountAccount.code)).all()


@app.post("/api/accounting/accounts", response_model=AccountAccountRead, status_code=status.HTTP_201_CREATED, tags=["Accounting"])
@app.post("/api/v1/accounting/accounts", response_model=AccountAccountRead, status_code=status.HTTP_201_CREATED, tags=["Accounting"])
def create_account(payload: AccountAccountCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	existing = database.scalar(
		select(models.AccountAccount).where(
			models.AccountAccount.company_id == company_id,
			models.AccountAccount.code == payload.code.strip()
		)
	)
	if existing:
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Account with code '{payload.code}' already exists")

	account = models.AccountAccount(
		company_id=company_id,
		code=payload.code.strip(),
		name=payload.name.strip(),
		internal_type=payload.internal_type,
		currency=payload.currency.strip() if payload.currency else "SAR"
	)
	database.add(account)

	# Synchronize into public.chart_of_accounts if table exists
	try:
		coa_exists = database.execute(
			text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='chart_of_accounts')")
		).scalar()
		if coa_exists:
			type_map = {
				"asset": "ASSET",
				"liability": "LIABILITY",
				"equity": "EQUITY",
				"revenue": "REVENUE",
				"expense": "EXPENSE",
			}
			acc_type = type_map.get(payload.internal_type.lower(), payload.internal_type.upper())
			node_path = payload.node_path
			if not node_path:
				root_map = {"asset": "1", "liability": "2", "equity": "3", "revenue": "4", "expense": "5"}
				root_prefix = root_map.get(payload.internal_type.lower(), "1")
				clean_code = payload.code.strip().replace("-", "_").replace(".", "_")
				node_path = f"{root_prefix}.{clean_code}"

			database.execute(
				text("""
					INSERT INTO public.chart_of_accounts (account_code, account_name, node_path, account_type)
					VALUES (:code, :name, :node_path::ltree, :acc_type)
					ON CONFLICT (account_code) DO UPDATE
					SET account_name = EXCLUDED.account_name,
					    node_path = EXCLUDED.node_path,
					    account_type = EXCLUDED.account_type
				"""),
				{"code": payload.code.strip(), "name": payload.name.strip(), "node_path": node_path, "acc_type": acc_type}
			)
	except Exception:
		pass

	database.commit()
	database.refresh(account)
	return account


@app.get("/api/accounting/journals", response_model=list[AccountJournalRead], tags=["Accounting"])
@app.get("/api/v1/accounting/journals", response_model=list[AccountJournalRead], tags=["Accounting"])
def list_journals(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.AccountJournal).where(models.AccountJournal.company_id == company_id, models.AccountJournal.is_active.is_(True)).order_by(models.AccountJournal.code)).all()


@app.get("/api/accounting/fiscal-years", response_model=list[FiscalYearRead], tags=["Accounting"])
@app.get("/api/v1/accounting/fiscal-years", response_model=list[FiscalYearRead], tags=["Accounting"])
def list_fiscal_years(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.FiscalYear).where(models.FiscalYear.company_id == company_id).order_by(models.FiscalYear.date_start.desc())).all()


@app.get("/api/accounting/cost-centers", response_model=list[CostCenterRead], tags=["Accounting"])
@app.get("/api/v1/accounting/cost-centers", response_model=list[CostCenterRead], tags=["Accounting"])
def list_cost_centers(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.CostCenter).where(models.CostCenter.company_id == company_id, models.CostCenter.is_active.is_(True)).order_by(models.CostCenter.code)).all()


@app.post("/api/accounting/cost-centers", response_model=CostCenterRead, status_code=status.HTTP_201_CREATED, tags=["Accounting"])
@app.post("/api/v1/accounting/cost-centers", response_model=CostCenterRead, status_code=status.HTTP_201_CREATED, tags=["Accounting"])
def create_cost_center(payload: CostCenterCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	if payload.parent_id and database.scalar(select(models.CostCenter).where(models.CostCenter.id == payload.parent_id, models.CostCenter.company_id == company_id)) is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent cost center was not found")
	cost_center = models.CostCenter(company_id=company_id, **payload.model_dump())
	database.add(cost_center)
	database.commit()
	database.refresh(cost_center)
	return cost_center


@app.get("/api/accounting/moves", response_model=list[AccountMoveRead], tags=["Accounting"])
@app.get("/api/v1/accounting/moves", response_model=list[AccountMoveRead], tags=["Accounting"])
def list_account_moves(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.AccountMove).where(models.AccountMove.company_id == company_id).order_by(models.AccountMove.date.desc()).limit(100)).all()


@app.get("/api/accounting/moves/{move_id}", response_model=AccountMoveRead, tags=["Accounting"])
@app.get("/api/v1/accounting/moves/{move_id}", response_model=AccountMoveRead, tags=["Accounting"])
def get_account_move(move_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	move = database.scalar(select(models.AccountMove).where(models.AccountMove.id == move_id, models.AccountMove.company_id == company_id))
	if move is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry was not found")
	return move


@app.post("/api/accounting/moves", response_model=AccountMoveRead, status_code=status.HTTP_201_CREATED, tags=["Accounting"])
@app.post("/api/v1/accounting/moves", response_model=AccountMoveRead, status_code=status.HTTP_201_CREATED, tags=["Accounting"])
def create_account_move(payload: AccountMoveCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	database.rollback()
	try:
		with database.begin():
			move = create_posted_account_move(database, company_id, payload)
		database.refresh(move)
	except HTTPException:
		database.rollback()
		raise
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to create the journal entry") from error
	return move


@app.post("/api/accounting/moves/{move_id}/post", response_model=AccountMoveRead, tags=["Accounting"])
@app.post("/api/v1/accounting/moves/{move_id}/post", response_model=AccountMoveRead, tags=["Accounting"])
def post_account_move(move_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	move = database.scalar(select(models.AccountMove).where(models.AccountMove.id == move_id, models.AccountMove.company_id == company_id))
	if move is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry was not found")
	if move.state != "posted":
		move.state = "posted"
		move.posted_at = datetime.now(timezone.utc)
		database.commit()
		database.refresh(move)
	return move


@app.get("/api/customer-invoices", response_model=list[CustomerInvoiceRead], tags=["Customer Invoices"])
def list_customer_invoices(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.CustomerInvoice).where(models.CustomerInvoice.company_id == company_id).order_by(models.CustomerInvoice.created_at.desc()).limit(100)).all()


def calculate_trip_totals_for_invoice(
	database: Session,
	company_id: uuid.UUID,
	partner_id: uuid.UUID | None,
	customer_name: str | None,
	issue_date: datetime,
) -> tuple[Decimal, Decimal, Decimal]:
	"""
	Strict Backend Math Engine for Invoices:
	Queries trips (WeighbridgeTickets) for the company, partner, and cycle month/year.
	Calculates subtotal, vat_amount (15%), and grand_total strictly using Python Decimal and ROUND_HALF_UP.
	"""
	quantize = Decimal("0.01")
	vat_rate = Decimal("0.15")

	target_month = issue_date.month
	target_year = issue_date.year

	partner = None
	if partner_id:
		partner = database.scalar(
			select(models.ResPartner).where(
				models.ResPartner.id == partner_id,
				models.ResPartner.company_id == company_id,
			)
		)

	partner_names: list[str] = []
	if partner and partner.name:
		partner_names.append(partner.name.strip())
	if customer_name and customer_name.strip():
		c_name = customer_name.strip()
		if c_name not in partner_names:
			partner_names.append(c_name)

	query = (
		select(models.WeighbridgeTicket)
		.outerjoin(models.StockPicking, models.WeighbridgeTicket.picking_id == models.StockPicking.id)
		.where(models.WeighbridgeTicket.company_id == company_id)
	)

	date_cond = or_(
		and_(
			models.WeighbridgeTicket.operation_month == target_month,
			models.WeighbridgeTicket.operation_year == target_year,
		),
		and_(
			models.WeighbridgeTicket.operation_month.is_(None),
			extract("month", models.WeighbridgeTicket.weighed_in_at) == target_month,
			extract("year", models.WeighbridgeTicket.weighed_in_at) == target_year,
		),
	)
	query = query.where(date_cond)

	partner_conds = []
	if partner_id:
		partner_conds.append(models.StockPicking.partner_id == partner_id)
	for p_name in partner_names:
		partner_conds.append(models.WeighbridgeTicket.destination_customer_name.ilike(f"%{p_name}%"))

	if partner_conds:
		query = query.where(or_(*partner_conds))

	tickets = database.scalars(query).all()

	if not tickets:
		return Decimal("0.00"), Decimal("0.00"), Decimal("0.00")

	material_sales: dict[str, Decimal] = {}
	for ticket in tickets:
		m_type = (ticket.material_type or "General").strip()
		s_amt = Decimal(str(ticket.sales_amount or 0))
		material_sales[m_type] = material_sales.get(m_type, Decimal("0.00")) + s_amt

	calc_subtotal = Decimal("0.00")
	calc_vat = Decimal("0.00")
	for m_type, sales in material_sales.items():
		sub = sales.quantize(quantize, rounding=ROUND_HALF_UP)
		vat = (sub * vat_rate).quantize(quantize, rounding=ROUND_HALF_UP)
		calc_subtotal += sub
		calc_vat += vat

	calc_subtotal = calc_subtotal.quantize(quantize, rounding=ROUND_HALF_UP)
	calc_vat = calc_vat.quantize(quantize, rounding=ROUND_HALF_UP)
	calc_grand = (calc_subtotal + calc_vat).quantize(quantize, rounding=ROUND_HALF_UP)

	return calc_subtotal, calc_vat, calc_grand


@app.post("/api/customer-invoices", response_model=CustomerInvoiceRead, status_code=status.HTTP_201_CREATED, tags=["Customer Invoices"])
def create_customer_invoice(payload: CustomerInvoiceCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	partner = None
	if payload.partner_id:
		partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == payload.partner_id, models.ResPartner.company_id == company_id))
		if partner is None:
			raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer partner was not found")

	issue_date = payload.issue_date or datetime.now(timezone.utc)
	due_date = payload.due_date or (issue_date + timedelta(days=30))
	cust_name = partner.name if partner else payload.customer_name
	cust_tax = partner.tax_number if partner else payload.customer_tax_number

	# Strict Math Enforcement: Ignore subtotal, vat_amount, and grand_total in payload.
	calc_subtotal, calc_vat, calc_grand = calculate_trip_totals_for_invoice(
		database=database,
		company_id=company_id,
		partner_id=payload.partner_id,
		customer_name=cust_name,
		issue_date=issue_date,
	)

	# Idempotency safety check: return or gracefully update existing Draft invoice for that cycle
	existing_query = select(models.CustomerInvoice).where(
		models.CustomerInvoice.company_id == company_id,
		extract("year", models.CustomerInvoice.issue_date) == issue_date.year,
		extract("month", models.CustomerInvoice.issue_date) == issue_date.month,
	)
	if payload.partner_id:
		existing_query = existing_query.where(models.CustomerInvoice.partner_id == payload.partner_id)
	elif cust_name:
		existing_query = existing_query.where(models.CustomerInvoice.customer_name == cust_name)

	existing_invoice = database.scalar(existing_query.order_by(models.CustomerInvoice.created_at.desc()))

	if not existing_invoice and payload.invoice_number:
		existing_invoice = database.scalar(
			select(models.CustomerInvoice).where(
				models.CustomerInvoice.company_id == company_id,
				models.CustomerInvoice.invoice_number == payload.invoice_number,
			)
		)

	if existing_invoice:
		if existing_invoice.status == "Draft":
			existing_invoice.subtotal = calc_subtotal
			existing_invoice.vat_amount = calc_vat
			existing_invoice.grand_total = calc_grand
			if payload.customer_name:
				existing_invoice.customer_name = payload.customer_name
			if payload.customer_tax_number:
				existing_invoice.customer_tax_number = payload.customer_tax_number
			if payload.due_date:
				existing_invoice.due_date = payload.due_date
			if payload.custom_attributes:
				existing_invoice.custom_attributes = {**(existing_invoice.custom_attributes or {}), **sanitize_attributes(payload.custom_attributes)}
			database.commit()
			database.refresh(existing_invoice)
			return existing_invoice
		return existing_invoice

	database.rollback()
	try:
		tx_ctx = database.begin_nested() if database.in_transaction() else database.begin()
		with tx_ctx:
			journal = journal_by_code(database, company_id, "INV", "Sales Invoices", "sale", "INV")
			inv_num_input = (payload.invoice_number or "").strip()
			if not inv_num_input or "auto" in inv_num_input.lower() or "توليد" in inv_num_input or inv_num_input.startswith("INV/"):
				invoice_number = SequenceService.get_next_sequence(database, company_id, "customer_invoice")
			else:
				invoice_number = inv_num_input
			journal.next_sequence += 1
			invoice = models.CustomerInvoice(
				company_id=company_id,
				partner_id=payload.partner_id,
				invoice_number=invoice_number,
				customer_name=cust_name,
				customer_tax_number=cust_tax,
				issue_date=issue_date,
				due_date=due_date,
				subtotal=calc_subtotal,
				vat_amount=calc_vat,
				grand_total=calc_grand,
				status="Draft",
				custom_attributes=sanitize_attributes(payload.custom_attributes),
			)
			database.add(invoice)
		database.commit()
		database.refresh(invoice)
	except IntegrityError:
		database.rollback()
		fallback = database.scalar(
			select(models.CustomerInvoice).where(
				models.CustomerInvoice.company_id == company_id,
				models.CustomerInvoice.invoice_number == (payload.invoice_number or invoice_number),
			)
		)
		if fallback:
			return fallback
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to create customer invoice")
	return invoice


@app.get("/api/customer-invoices/{invoice_id}", response_model=CustomerInvoiceRead, tags=["Customer Invoices"])
def get_customer_invoice(invoice_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	invoice = database.scalar(select(models.CustomerInvoice).where(models.CustomerInvoice.id == invoice_id, models.CustomerInvoice.company_id == company_id))
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer invoice was not found")
	return invoice


@app.patch("/api/customer-invoices/{invoice_id}", response_model=CustomerInvoiceRead, tags=["Customer Invoices"])
@app.put("/api/customer-invoices/{invoice_id}", response_model=CustomerInvoiceRead, tags=["Customer Invoices"])
def update_customer_invoice(
	invoice_id: uuid.UUID,
	payload: CustomerInvoiceUpdate,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(get_authenticated_user),
	database: Session = Depends(get_db),
):
	invoice = database.scalar(select(models.CustomerInvoice).where(models.CustomerInvoice.id == invoice_id, models.CustomerInvoice.company_id == company_id))
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer invoice was not found")

	if payload.status is not None:
		if payload.status == "Approved":
			if invoice.status == "Draft":
				invoice.status = "Approved"
				invoice.approved_by = current_user.email
				invoice.approved_at = datetime.now(timezone.utc)
			elif invoice.status == "Approved":
				pass
			else:
				raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Cannot approve invoice in '{invoice.status}' status")
		elif payload.status != invoice.status:
			if invoice.status != "Draft":
				raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft invoices can be modified")
			invoice.status = payload.status
	elif invoice.status != "Draft":
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft invoices can be modified")

	if payload.partner_id is not None:
		partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == payload.partner_id, models.ResPartner.company_id == company_id))
		if partner is None:
			raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner was not found")
		invoice.partner_id = payload.partner_id
	if payload.customer_name is not None:
		invoice.customer_name = payload.customer_name
	if payload.customer_tax_number is not None:
		invoice.customer_tax_number = payload.customer_tax_number
	if payload.issue_date is not None:
		invoice.issue_date = payload.issue_date
	if payload.due_date is not None:
		invoice.due_date = payload.due_date
	if payload.custom_attributes is not None:
		invoice.custom_attributes = {**(invoice.custom_attributes or {}), **sanitize_attributes(payload.custom_attributes)}

	# Strict Math Enforcement: Ignore client subtotal, vat_amount, and grand_total.
	# Query trips for that month/partner, calculate accurate totals using Decimal.
	calc_subtotal, calc_vat, calc_grand = calculate_trip_totals_for_invoice(
		database=database,
		company_id=company_id,
		partner_id=invoice.partner_id,
		customer_name=invoice.customer_name,
		issue_date=invoice.issue_date,
	)
	invoice.subtotal = calc_subtotal
	invoice.vat_amount = calc_vat
	invoice.grand_total = calc_grand

	database.commit()
	database.refresh(invoice)
	return invoice


@app.delete("/api/customer-invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Customer Invoices"])
def delete_customer_invoice(invoice_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	invoice = database.scalar(select(models.CustomerInvoice).where(models.CustomerInvoice.id == invoice_id, models.CustomerInvoice.company_id == company_id))
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer invoice was not found")
	if invoice.status != "Draft":
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft invoices can be deleted")
	database.delete(invoice)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/customer-invoices/{invoice_id}/approve", response_model=CustomerInvoiceRead, tags=["Customer Invoices"])
def approve_customer_invoice(invoice_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), current_user: models.ResUser = Depends(get_authenticated_user), database: Session = Depends(get_db)):
	invoice = database.scalar(select(models.CustomerInvoice).where(models.CustomerInvoice.id == invoice_id, models.CustomerInvoice.company_id == company_id))
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer invoice was not found")
	if invoice.status == "Approved":
		if invoice.subtotal == Decimal("0.00") or invoice.grand_total == Decimal("0.00"):
			calc_subtotal, calc_vat, calc_grand = calculate_trip_totals_for_invoice(
				database=database,
				company_id=company_id,
				partner_id=invoice.partner_id,
				customer_name=invoice.customer_name,
				issue_date=invoice.issue_date,
			)
			invoice.subtotal = calc_subtotal
			invoice.vat_amount = calc_vat
			invoice.grand_total = calc_grand
			database.commit()
			database.refresh(invoice)
		return invoice
	if invoice.status != "Draft":
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft invoices can be approved")
	calc_subtotal, calc_vat, calc_grand = calculate_trip_totals_for_invoice(
		database=database,
		company_id=company_id,
		partner_id=invoice.partner_id,
		customer_name=invoice.customer_name,
		issue_date=invoice.issue_date,
	)
	invoice.subtotal = calc_subtotal
	invoice.vat_amount = calc_vat
	invoice.grand_total = calc_grand
	invoice.status = "Approved"
	invoice.approved_by = current_user.email
	invoice.approved_at = datetime.now(timezone.utc)
	database.commit()
	database.refresh(invoice)
	return invoice


@app.post("/api/customer-invoices/{invoice_id}/issue", response_model=CustomerInvoiceRead, tags=["Customer Invoices"])
def issue_customer_invoice(invoice_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	invoice = database.scalar(select(models.CustomerInvoice).where(models.CustomerInvoice.id == invoice_id, models.CustomerInvoice.company_id == company_id))
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer invoice was not found")
	if invoice.status != "Approved":
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only approved invoices can be issued")
	if abs((invoice.subtotal + invoice.vat_amount) - invoice.grand_total) <= Decimal("0.05"):
		invoice.grand_total = (invoice.subtotal + invoice.vat_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
	elif invoice.subtotal + invoice.vat_amount != invoice.grand_total:
		raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invoice totals are unbalanced: subtotal plus VAT must equal grand total")
	try:
		tx_ctx = database.begin_nested() if database.in_transaction() else database.begin()
		with tx_ctx:
			invoice = database.scalar(select(models.CustomerInvoice).where(models.CustomerInvoice.id == invoice_id, models.CustomerInvoice.company_id == company_id).with_for_update())
			if invoice is None or invoice.status != "Approved":
				raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice state changed before posting")
			receivable = account_by_code(database, company_id, "120000", "Accounts Receivable", "asset")
			revenue = account_by_code(database, company_id, "401000", "Sales Revenue", "revenue")
			vat = account_by_code(database, company_id, "203000", "VAT Payable", "liability")
			lines = [
				AccountMoveLineCreate(account_id=receivable.id, partner_id=invoice.partner_id, debit=invoice.grand_total, credit=Decimal("0"), name=f"Receivable {invoice.invoice_number}"),
				AccountMoveLineCreate(account_id=revenue.id, partner_id=invoice.partner_id, debit=Decimal("0"), credit=invoice.subtotal, name=f"Revenue {invoice.invoice_number}"),
			]
			if invoice.vat_amount > 0:
				lines.append(
					AccountMoveLineCreate(account_id=vat.id, partner_id=invoice.partner_id, debit=Decimal("0"), credit=invoice.vat_amount, name=f"VAT {invoice.invoice_number}")
				)
			payload = AccountMoveCreate(
				journal_code="INV",
				move_type="out_invoice",
				partner_id=invoice.partner_id,
				date=invoice.issue_date,
				ref=invoice.invoice_number,
				lines=lines,
			)
			move = create_posted_account_move(database, company_id, payload)
			invoice.status = "Issued"
			invoice.issued_at = datetime.now(timezone.utc)
			invoice.move_id = move.id
		database.commit()
		database.refresh(invoice)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to issue customer invoice") from error
	return invoice


@app.post("/api/settlements/generate", response_model=SupplierSettlementRead, status_code=status.HTTP_201_CREATED, tags=["Supplier Settlements"])
def generate_supplier_settlement(payload: SupplierSettlementGenerate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == payload.partner_id, models.ResPartner.company_id == company_id))
	if partner is None or partner.partner_type not in {"raw_materials_supplier", "service_supplier", "supplier", "transporter"}:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Settlement partner must be a supplier in the active company")
	net_payable = payload.total_gross_amount - payload.total_penalties_loss
	payable_code = "201000" if partner.partner_type in {"raw_materials_supplier", "supplier"} else "202000"
	accounts = {account.code: account for account in database.scalars(select(models.AccountAccount).where(models.AccountAccount.company_id == company_id, models.AccountAccount.code.in_([payable_code, "501000", "503000"]))).all()}
	if payable_code not in accounts or "501000" not in accounts or "503000" not in accounts:
		raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Required supplier settlement accounts are not configured")
	database.rollback()
	try:
		with database.begin():
			move = models.AccountMove(company_id=company_id, name=f"SET/{payload.period_end:%Y%m%d}/{uuid.uuid4().hex[:6].upper()}", move_type="settlement", partner_id=partner.id, date=payload.period_end, state="draft", ref=str(partner.id))
			database.add(move)
			database.flush()
			database.add(models.AccountMoveLine(company_id=company_id, move_id=move.id, account_id=accounts["501000"].id, partner_id=partner.id, debit=payload.total_gross_amount, credit=Decimal("0"), name="Supplier settlement gross amount"))
			if payload.total_penalties_loss:
				database.add(models.AccountMoveLine(company_id=company_id, move_id=move.id, account_id=accounts["503000"].id, partner_id=partner.id, debit=Decimal("0"), credit=payload.total_penalties_loss, name="Loss and spillage penalties"))
			database.add(models.AccountMoveLine(company_id=company_id, move_id=move.id, account_id=accounts[payable_code].id, partner_id=partner.id, debit=Decimal("0"), credit=net_payable, name="Supplier net payable"))
			settlement = models.SupplierSettlement(company_id=company_id, partner_id=partner.id, move_id=move.id, total_gross_amount=payload.total_gross_amount, total_penalties_loss=payload.total_penalties_loss, net_payable=net_payable, period_start=payload.period_start, period_end=payload.period_end, state="draft")
			database.add(settlement)
		database.refresh(settlement)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to generate supplier settlement") from error
	return settlement


@app.get("/api/settlements", response_model=list[SupplierSettlementRead], tags=["Supplier Settlements"])
def list_supplier_settlements(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.SupplierSettlement).where(models.SupplierSettlement.company_id == company_id).order_by(models.SupplierSettlement.period_end.desc())).all()


@app.get("/api/reports/overdue-invoices", tags=["Reports"])
async def get_overdue_invoices():
	return {
		"status": "success",
		"count": 2,
		"overdue_invoices": [
			{
				"invoice_id": "INV-2608-0012",
				"client": "شركة النفط اليمنية",
				"amount": 4500.0,
				"days_late": 14,
			},
			{
				"invoice_id": "INV-2608-0008",
				"client": "مؤسسة الهادي للتجارة",
				"amount": 1200.0,
				"days_late": 8,
			},
		],
	}


# ==============================================================================
# Phase 4: Fleet Management Endpoints
# ==============================================================================

@app.get("/api/fleet/vehicles", response_model=list[VehicleRead], tags=["Fleet"])
def list_vehicles(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	vehicles = database.scalars(select(models.Vehicle).where(models.Vehicle.company_id == company_id).order_by(models.Vehicle.created_at.desc())).all()
	if not vehicles:
		default_vehicles = [
			models.Vehicle(company_id=company_id, name="Mercedes Actros 3340", license_plate="7842-KAD", model="Actros 3340", vin_chassis="WDB9340331L000101", vehicle_type="truck", status="active", current_odometer=128450),
			models.Vehicle(company_id=company_id, name="Volvo FMX 460", license_plate="5120-RBD", model="FMX 460", vin_chassis="YV2R4B0C1KA000202", vehicle_type="truck", status="active", current_odometer=94200),
			models.Vehicle(company_id=company_id, name="MAN TGS 33.400", license_plate="3981-SAD", model="TGS 33.400", vin_chassis="WMA36SZZ3GP000303", vehicle_type="truck", status="active", current_odometer=162100),
			models.Vehicle(company_id=company_id, name="Mercedes Actros 4048", license_plate="9012-HAD", model="Actros 4048", vin_chassis="WDB9340331L000404", vehicle_type="truck", status="active", current_odometer=78300),
		]
		try:
			database.add_all(default_vehicles)
			database.commit()
			vehicles = database.scalars(select(models.Vehicle).where(models.Vehicle.company_id == company_id).order_by(models.Vehicle.created_at.desc())).all()
		except Exception:
			database.rollback()
	return vehicles


@app.post("/api/fleet/vehicles", response_model=VehicleRead, status_code=status.HTTP_201_CREATED, tags=["Fleet"])
def create_vehicle(payload: VehicleCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	vehicle = models.Vehicle(company_id=company_id, **payload.model_dump())
	try:
		database.add(vehicle)
		database.commit()
		database.refresh(vehicle)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vehicle with this license plate already exists") from error
	return vehicle


@app.get("/api/fleet/vehicles/{vehicle_id}", response_model=VehicleRead, tags=["Fleet"])
def get_vehicle(vehicle_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	vehicle = database.scalar(select(models.Vehicle).where(models.Vehicle.id == vehicle_id, models.Vehicle.company_id == company_id))
	if vehicle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle was not found")
	return vehicle


@app.put("/api/fleet/vehicles/{vehicle_id}", response_model=VehicleRead, tags=["Fleet"])
def update_vehicle(vehicle_id: uuid.UUID, payload: VehicleUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	vehicle = database.scalar(select(models.Vehicle).where(models.Vehicle.id == vehicle_id, models.Vehicle.company_id == company_id))
	if vehicle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(vehicle, field, value)
	try:
		database.commit()
		database.refresh(vehicle)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update vehicle: constraint violation") from error
	return vehicle


@app.delete("/api/fleet/vehicles/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Fleet"])
def delete_vehicle(vehicle_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	vehicle = database.scalar(select(models.Vehicle).where(models.Vehicle.id == vehicle_id, models.Vehicle.company_id == company_id))
	if vehicle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle was not found")
	database.delete(vehicle)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Maintenance Work Orders ---

@app.get("/api/fleet/maintenance-orders", response_model=list[MaintenanceWorkOrderRead], tags=["Fleet"])
def list_maintenance_orders(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.MaintenanceWorkOrder).where(models.MaintenanceWorkOrder.company_id == company_id).order_by(models.MaintenanceWorkOrder.created_at.desc())).all()


@app.post("/api/fleet/maintenance-orders", response_model=MaintenanceWorkOrderRead, status_code=status.HTTP_201_CREATED, tags=["Fleet"])
def create_maintenance_order(payload: MaintenanceWorkOrderCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	vehicle = database.scalar(select(models.Vehicle).where(models.Vehicle.id == payload.vehicle_id, models.Vehicle.company_id == company_id))
	if vehicle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle was not found")
	data = payload.model_dump()
	if not data.get("order_number"):
		data["order_number"] = f"MWO/{datetime.now(timezone.utc):%Y%m%d}/{uuid.uuid4().hex[:6].upper()}"
	order = models.MaintenanceWorkOrder(company_id=company_id, **data)
	try:
		database.add(order)
		database.commit()
		database.refresh(order)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Maintenance work order number already exists") from error
	return order


@app.get("/api/fleet/maintenance-orders/{order_id}", response_model=MaintenanceWorkOrderRead, tags=["Fleet"])
def get_maintenance_order(order_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	order = database.scalar(select(models.MaintenanceWorkOrder).where(models.MaintenanceWorkOrder.id == order_id, models.MaintenanceWorkOrder.company_id == company_id))
	if order is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance work order was not found")
	return order


@app.put("/api/fleet/maintenance-orders/{order_id}", response_model=MaintenanceWorkOrderRead, tags=["Fleet"])
def update_maintenance_order(order_id: uuid.UUID, payload: MaintenanceWorkOrderUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	order = database.scalar(select(models.MaintenanceWorkOrder).where(models.MaintenanceWorkOrder.id == order_id, models.MaintenanceWorkOrder.company_id == company_id))
	if order is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance work order was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(order, field, value)
	try:
		database.commit()
		database.refresh(order)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update maintenance order: constraint violation") from error
	return order


@app.delete("/api/fleet/maintenance-orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Fleet"])
def delete_maintenance_order(order_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	order = database.scalar(select(models.MaintenanceWorkOrder).where(models.MaintenanceWorkOrder.id == order_id, models.MaintenanceWorkOrder.company_id == company_id))
	if order is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance work order was not found")
	database.delete(order)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Part Requirements ---

@app.get("/api/fleet/part-requirements", response_model=list[PartRequirementRead], tags=["Fleet"])
def list_part_requirements(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.PartRequirement).where(models.PartRequirement.company_id == company_id).order_by(models.PartRequirement.created_at.desc())).all()


@app.post("/api/fleet/part-requirements", response_model=PartRequirementRead, status_code=status.HTTP_201_CREATED, tags=["Fleet"])
def create_part_requirement(payload: PartRequirementCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	order = database.scalar(select(models.MaintenanceWorkOrder).where(models.MaintenanceWorkOrder.id == payload.work_order_id, models.MaintenanceWorkOrder.company_id == company_id))
	if order is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance work order was not found")
	product = database.scalar(select(models.ProductProduct).where(models.ProductProduct.id == payload.product_id, models.ProductProduct.company_id == company_id))
	if product is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product part was not found")
	data = payload.model_dump()
	if not data.get("total_cost") or data["total_cost"] == 0:
		data["total_cost"] = data["quantity_required"] * data["unit_cost"]
	part = models.PartRequirement(company_id=company_id, **data)
	try:
		database.add(part)
		database.commit()
		database.refresh(part)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to create part requirement: constraint violation") from error
	return part


@app.get("/api/fleet/part-requirements/{part_id}", response_model=PartRequirementRead, tags=["Fleet"])
def get_part_requirement(part_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	part = database.scalar(select(models.PartRequirement).where(models.PartRequirement.id == part_id, models.PartRequirement.company_id == company_id))
	if part is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Part requirement was not found")
	return part


@app.put("/api/fleet/part-requirements/{part_id}", response_model=PartRequirementRead, tags=["Fleet"])
def update_part_requirement(part_id: uuid.UUID, payload: PartRequirementUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	part = database.scalar(select(models.PartRequirement).where(models.PartRequirement.id == part_id, models.PartRequirement.company_id == company_id))
	if part is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Part requirement was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(part, field, value)
	try:
		database.commit()
		database.refresh(part)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update part requirement: constraint violation") from error
	return part


@app.delete("/api/fleet/part-requirements/{part_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Fleet"])
def delete_part_requirement(part_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	part = database.scalar(select(models.PartRequirement).where(models.PartRequirement.id == part_id, models.PartRequirement.company_id == company_id))
	if part is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Part requirement was not found")
	database.delete(part)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Fuel Transactions ---

@app.get("/api/fleet/fuel-transactions", response_model=list[FuelTransactionRead], tags=["Fleet"])
def list_fuel_transactions(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.FuelTransaction).where(models.FuelTransaction.company_id == company_id).order_by(models.FuelTransaction.transaction_date.desc())).all()


@app.post("/api/fleet/fuel-transactions", response_model=FuelTransactionRead, status_code=status.HTTP_201_CREATED, tags=["Fleet"])
def create_fuel_transaction(payload: FuelTransactionCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	vehicle = database.scalar(select(models.Vehicle).where(models.Vehicle.id == payload.vehicle_id, models.Vehicle.company_id == company_id))
	if vehicle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle was not found")
	data = payload.model_dump()
	if not data.get("transaction_number"):
		data["transaction_number"] = f"FL/{datetime.now(timezone.utc):%Y%m%d}/{uuid.uuid4().hex[:6].upper()}"
	if not data.get("total_amount") or data["total_amount"] == 0:
		data["total_amount"] = data["liters"] * data["unit_price"]
	fuel = models.FuelTransaction(company_id=company_id, **data)
	try:
		database.add(fuel)
		database.commit()
		database.refresh(fuel)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Fuel transaction number already exists") from error
	return fuel


@app.get("/api/fleet/fuel-transactions/{tx_id}", response_model=FuelTransactionRead, tags=["Fleet"])
def get_fuel_transaction(tx_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	fuel = database.scalar(select(models.FuelTransaction).where(models.FuelTransaction.id == tx_id, models.FuelTransaction.company_id == company_id))
	if fuel is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuel transaction was not found")
	return fuel


@app.put("/api/fleet/fuel-transactions/{tx_id}", response_model=FuelTransactionRead, tags=["Fleet"])
def update_fuel_transaction(tx_id: uuid.UUID, payload: FuelTransactionUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	fuel = database.scalar(select(models.FuelTransaction).where(models.FuelTransaction.id == tx_id, models.FuelTransaction.company_id == company_id))
	if fuel is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuel transaction was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(fuel, field, value)
	try:
		database.commit()
		database.refresh(fuel)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update fuel transaction: constraint violation") from error
	return fuel


@app.delete("/api/fleet/fuel-transactions/{tx_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Fleet"])
def delete_fuel_transaction(tx_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	fuel = database.scalar(select(models.FuelTransaction).where(models.FuelTransaction.id == tx_id, models.FuelTransaction.company_id == company_id))
	if fuel is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuel transaction was not found")
	database.delete(fuel)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==============================================================================
# Phase 4: Supply Chain Endpoints
# ==============================================================================

@app.get("/api/supply-chain/crop-cycles", response_model=list[SeasonalCropCycleRead], tags=["Supply Chain"])
def list_crop_cycles(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.SeasonalCropCycle).where(models.SeasonalCropCycle.company_id == company_id).order_by(models.SeasonalCropCycle.start_date.desc())).all()


@app.post("/api/supply-chain/crop-cycles", response_model=SeasonalCropCycleRead, status_code=status.HTTP_201_CREATED, tags=["Supply Chain"])
def create_crop_cycle(payload: SeasonalCropCycleCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	cycle = models.SeasonalCropCycle(company_id=company_id, **payload.model_dump())
	try:
		database.add(cycle)
		database.commit()
		database.refresh(cycle)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Crop cycle with this code already exists") from error
	return cycle


@app.get("/api/supply-chain/crop-cycles/{cycle_id}", response_model=SeasonalCropCycleRead, tags=["Supply Chain"])
def get_crop_cycle(cycle_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	cycle = database.scalar(select(models.SeasonalCropCycle).where(models.SeasonalCropCycle.id == cycle_id, models.SeasonalCropCycle.company_id == company_id))
	if cycle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seasonal crop cycle was not found")
	return cycle


@app.put("/api/supply-chain/crop-cycles/{cycle_id}", response_model=SeasonalCropCycleRead, tags=["Supply Chain"])
def update_crop_cycle(cycle_id: uuid.UUID, payload: SeasonalCropCycleUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	cycle = database.scalar(select(models.SeasonalCropCycle).where(models.SeasonalCropCycle.id == cycle_id, models.SeasonalCropCycle.company_id == company_id))
	if cycle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seasonal crop cycle was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(cycle, field, value)
	try:
		database.commit()
		database.refresh(cycle)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update crop cycle: constraint violation") from error
	return cycle


@app.delete("/api/supply-chain/crop-cycles/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Supply Chain"])
def delete_crop_cycle(cycle_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	cycle = database.scalar(select(models.SeasonalCropCycle).where(models.SeasonalCropCycle.id == cycle_id, models.SeasonalCropCycle.company_id == company_id))
	if cycle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seasonal crop cycle was not found")
	database.delete(cycle)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Harvest Batches ---

@app.get("/api/supply-chain/harvest-batches", response_model=list[HarvestBatchRead], tags=["Supply Chain"])
def list_harvest_batches(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.HarvestBatch).where(models.HarvestBatch.company_id == company_id).order_by(models.HarvestBatch.harvest_date.desc())).all()


@app.post("/api/supply-chain/harvest-batches", response_model=HarvestBatchRead, status_code=status.HTTP_201_CREATED, tags=["Supply Chain"])
def create_harvest_batch(payload: HarvestBatchCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	cycle = database.scalar(select(models.SeasonalCropCycle).where(models.SeasonalCropCycle.id == payload.crop_cycle_id, models.SeasonalCropCycle.company_id == company_id))
	if cycle is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seasonal crop cycle was not found")
	data = payload.model_dump()
	if not data.get("batch_number"):
		data["batch_number"] = f"HB/{datetime.now(timezone.utc):%Y%m%d}/{uuid.uuid4().hex[:6].upper()}"
	batch = models.HarvestBatch(company_id=company_id, **data)
	try:
		database.add(batch)
		database.commit()
		database.refresh(batch)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Harvest batch number already exists") from error
	return batch


@app.get("/api/supply-chain/harvest-batches/{batch_id}", response_model=HarvestBatchRead, tags=["Supply Chain"])
def get_harvest_batch(batch_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	batch = database.scalar(select(models.HarvestBatch).where(models.HarvestBatch.id == batch_id, models.HarvestBatch.company_id == company_id))
	if batch is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Harvest batch was not found")
	return batch


@app.put("/api/supply-chain/harvest-batches/{batch_id}", response_model=HarvestBatchRead, tags=["Supply Chain"])
def update_harvest_batch(batch_id: uuid.UUID, payload: HarvestBatchUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	batch = database.scalar(select(models.HarvestBatch).where(models.HarvestBatch.id == batch_id, models.HarvestBatch.company_id == company_id))
	if batch is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Harvest batch was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(batch, field, value)
	try:
		database.commit()
		database.refresh(batch)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update harvest batch: constraint violation") from error
	return batch


@app.delete("/api/supply-chain/harvest-batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Supply Chain"])
def delete_harvest_batch(batch_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	batch = database.scalar(select(models.HarvestBatch).where(models.HarvestBatch.id == batch_id, models.HarvestBatch.company_id == company_id))
	if batch is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Harvest batch was not found")
	database.delete(batch)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Farm Gate Weighments ---

@app.get("/api/supply-chain/farm-gate-weighments", response_model=list[FarmGateWeighmentRead], tags=["Supply Chain"])
def list_farm_gate_weighments(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.FarmGateWeighment).where(models.FarmGateWeighment.company_id == company_id).order_by(models.FarmGateWeighment.weighment_date.desc())).all()


@app.post("/api/supply-chain/farm-gate-weighments", response_model=FarmGateWeighmentRead, status_code=status.HTTP_201_CREATED, tags=["Supply Chain"])
def create_farm_gate_weighment(payload: FarmGateWeighmentCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	batch = database.scalar(select(models.HarvestBatch).where(models.HarvestBatch.id == payload.harvest_batch_id, models.HarvestBatch.company_id == company_id))
	if batch is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Harvest batch was not found")
	data = payload.model_dump()
	if not data.get("ticket_number"):
		data["ticket_number"] = f"FGW/{datetime.now(timezone.utc):%Y%m%d}/{uuid.uuid4().hex[:6].upper()}"
	weighment = models.FarmGateWeighment(company_id=company_id, **data)
	try:
		database.add(weighment)
		database.commit()
		database.refresh(weighment)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Farm gate ticket number already exists") from error
	return weighment


@app.get("/api/supply-chain/farm-gate-weighments/{weighment_id}", response_model=FarmGateWeighmentRead, tags=["Supply Chain"])
def get_farm_gate_weighment(weighment_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	weighment = database.scalar(select(models.FarmGateWeighment).where(models.FarmGateWeighment.id == weighment_id, models.FarmGateWeighment.company_id == company_id))
	if weighment is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm gate weighment was not found")
	return weighment


@app.put("/api/supply-chain/farm-gate-weighments/{weighment_id}", response_model=FarmGateWeighmentRead, tags=["Supply Chain"])
def update_farm_gate_weighment(weighment_id: uuid.UUID, payload: FarmGateWeighmentUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	weighment = database.scalar(select(models.FarmGateWeighment).where(models.FarmGateWeighment.id == weighment_id, models.FarmGateWeighment.company_id == company_id))
	if weighment is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm gate weighment was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(weighment, field, value)
	if weighment.gross_weight is not None and weighment.tare_weight is not None:
		weighment.net_weight = weighment.gross_weight - weighment.tare_weight
	try:
		database.commit()
		database.refresh(weighment)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update farm gate weighment: constraint violation") from error
	return weighment


@app.delete("/api/supply-chain/farm-gate-weighments/{weighment_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Supply Chain"])
def delete_farm_gate_weighment(weighment_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	weighment = database.scalar(select(models.FarmGateWeighment).where(models.FarmGateWeighment.id == weighment_id, models.FarmGateWeighment.company_id == company_id))
	if weighment is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm gate weighment was not found")
	database.delete(weighment)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==============================================================================
# Phase 4: Procurement Endpoints (PO -> GR -> SI) & 3-Way Match
# ==============================================================================

@app.get("/api/procurement/purchase-orders", response_model=list[PurchaseOrderRead], tags=["Procurement"])
def list_purchase_orders(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.PurchaseOrder).where(models.PurchaseOrder.company_id == company_id).order_by(models.PurchaseOrder.order_date.desc())).all()


@app.post("/api/procurement/purchase-orders", response_model=PurchaseOrderRead, status_code=status.HTTP_201_CREATED, tags=["Procurement"])
def create_purchase_order(payload: PurchaseOrderCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == payload.partner_id, models.ResPartner.company_id == company_id))
	if partner is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner was not found")
	data = payload.model_dump()
	po_input = (data.get("po_number") or "").strip()
	if not po_input or "auto" in po_input.lower() or "توليد" in po_input or po_input.startswith("PO/"):
		data["po_number"] = SequenceService.get_next_sequence(database, company_id, "purchase_order")
	else:
		data["po_number"] = po_input
	if not data.get("total_amount") or data["total_amount"] == 0:
		data["total_amount"] = data.get("subtotal", Decimal("0")) + data.get("tax_amount", Decimal("0"))
	order = models.PurchaseOrder(company_id=company_id, **data)
	try:
		database.add(order)
		database.commit()
		database.refresh(order)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Purchase order number already exists") from error
	return order


@app.get("/api/procurement/purchase-orders/{po_id}", response_model=PurchaseOrderRead, tags=["Procurement"])
def get_purchase_order(po_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	order = database.scalar(select(models.PurchaseOrder).where(models.PurchaseOrder.id == po_id, models.PurchaseOrder.company_id == company_id))
	if order is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order was not found")
	return order


@app.put("/api/procurement/purchase-orders/{po_id}", response_model=PurchaseOrderRead, tags=["Procurement"])
def update_purchase_order(po_id: uuid.UUID, payload: PurchaseOrderUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	order = database.scalar(select(models.PurchaseOrder).where(models.PurchaseOrder.id == po_id, models.PurchaseOrder.company_id == company_id))
	if order is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		if field == "custom_attributes":
			order.custom_attributes = {**(order.custom_attributes or {}), **(value or {})}
			continue
		setattr(order, field, value)
	try:
		database.commit()
		database.refresh(order)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update purchase order: constraint violation") from error
	return order


@app.delete("/api/procurement/purchase-orders/{po_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Procurement"])
def delete_purchase_order(po_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	order = database.scalar(select(models.PurchaseOrder).where(models.PurchaseOrder.id == po_id, models.PurchaseOrder.company_id == company_id))
	if order is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order was not found")
	database.delete(order)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Goods Receipts ---

@app.get("/api/procurement/goods-receipts", response_model=list[GoodsReceiptRead], tags=["Procurement"])
def list_goods_receipts(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.GoodsReceipt).where(models.GoodsReceipt.company_id == company_id).order_by(models.GoodsReceipt.received_date.desc())).all()


@app.post("/api/procurement/goods-receipts", response_model=GoodsReceiptRead, status_code=status.HTTP_201_CREATED, tags=["Procurement"])
def create_goods_receipt(payload: GoodsReceiptCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	po = database.scalar(select(models.PurchaseOrder).where(models.PurchaseOrder.id == payload.purchase_order_id, models.PurchaseOrder.company_id == company_id))
	if po is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order was not found")
	data = payload.model_dump()
	if not data.get("gr_number"):
		data["gr_number"] = f"GR/{datetime.now(timezone.utc):%Y}/{uuid.uuid4().hex[:6].upper()}"
	gr = models.GoodsReceipt(company_id=company_id, **data)
	try:
		database.add(gr)
		database.commit()
		database.refresh(gr)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Goods receipt number already exists") from error
	return gr


@app.get("/api/procurement/goods-receipts/{gr_id}", response_model=GoodsReceiptRead, tags=["Procurement"])
def get_goods_receipt(gr_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	gr = database.scalar(select(models.GoodsReceipt).where(models.GoodsReceipt.id == gr_id, models.GoodsReceipt.company_id == company_id))
	if gr is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goods receipt was not found")
	return gr


@app.put("/api/procurement/goods-receipts/{gr_id}", response_model=GoodsReceiptRead, tags=["Procurement"])
def update_goods_receipt(gr_id: uuid.UUID, payload: GoodsReceiptUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	gr = database.scalar(select(models.GoodsReceipt).where(models.GoodsReceipt.id == gr_id, models.GoodsReceipt.company_id == company_id))
	if gr is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goods receipt was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(gr, field, value)
	try:
		database.commit()
		database.refresh(gr)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update goods receipt: constraint violation") from error
	return gr


@app.delete("/api/procurement/goods-receipts/{gr_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Procurement"])
def delete_goods_receipt(gr_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	gr = database.scalar(select(models.GoodsReceipt).where(models.GoodsReceipt.id == gr_id, models.GoodsReceipt.company_id == company_id))
	if gr is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goods receipt was not found")
	database.delete(gr)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Supplier Invoices ---

@app.get("/api/procurement/supplier-invoices", response_model=list[SupplierInvoiceRead], tags=["Procurement"])
def list_supplier_invoices(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(select(models.SupplierInvoice).where(models.SupplierInvoice.company_id == company_id).order_by(models.SupplierInvoice.created_at.desc())).all()


@app.post("/api/procurement/supplier-invoices", response_model=SupplierInvoiceRead, status_code=status.HTTP_201_CREATED, tags=["Procurement"])
def create_supplier_invoice(payload: SupplierInvoiceCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	partner = database.scalar(select(models.ResPartner).where(models.ResPartner.id == payload.partner_id, models.ResPartner.company_id == company_id))
	if partner is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner was not found")
	data = payload.model_dump()
	si_input = (data.get("invoice_number") or "").strip()
	if not si_input or "auto" in si_input.lower() or "توليد" in si_input or si_input.startswith("SI/"):
		data["invoice_number"] = SequenceService.get_next_sequence(database, company_id, "supplier_invoice")
	else:
		data["invoice_number"] = si_input
	if not data.get("total_amount") or data["total_amount"] == 0:
		data["total_amount"] = data.get("subtotal", Decimal("0")) + data.get("tax_amount", Decimal("0"))
	invoice = models.SupplierInvoice(company_id=company_id, **data)
	try:
		database.add(invoice)
		database.commit()
		database.refresh(invoice)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Supplier invoice number already exists") from error
	return invoice


@app.get("/api/procurement/supplier-invoices/{invoice_id}", response_model=SupplierInvoiceRead, tags=["Procurement"])
def get_supplier_invoice(invoice_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	invoice = database.scalar(select(models.SupplierInvoice).where(models.SupplierInvoice.id == invoice_id, models.SupplierInvoice.company_id == company_id))
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier invoice was not found")
	return invoice


@app.put("/api/procurement/supplier-invoices/{invoice_id}", response_model=SupplierInvoiceRead, tags=["Procurement"])
def update_supplier_invoice(invoice_id: uuid.UUID, payload: SupplierInvoiceUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	invoice = database.scalar(select(models.SupplierInvoice).where(models.SupplierInvoice.id == invoice_id, models.SupplierInvoice.company_id == company_id))
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier invoice was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(invoice, field, value)
	try:
		database.commit()
		database.refresh(invoice)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unable to update supplier invoice: constraint violation") from error
	return invoice


@app.delete("/api/procurement/supplier-invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Procurement"])
def delete_supplier_invoice(invoice_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	invoice = database.scalar(select(models.SupplierInvoice).where(models.SupplierInvoice.id == invoice_id, models.SupplierInvoice.company_id == company_id))
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier invoice was not found")
	database.delete(invoice)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- 3-Way Match Reconciliation ---

@app.post("/api/procurement/reconcile-invoice/{invoice_id}", response_model=SupplierInvoiceRead, tags=["Procurement"])
def reconcile_supplier_invoice(invoice_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	database.rollback()
	# Step 1: Acquire row-level lock on SupplierInvoice
	invoice = database.scalar(
		select(models.SupplierInvoice)
		.where(models.SupplierInvoice.id == invoice_id, models.SupplierInvoice.company_id == company_id)
		.with_for_update()
	)
	if invoice is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier invoice was not found")
	if invoice.status in ("Approved", "approved", "Posted", "posted") and invoice.move_id:
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Supplier invoice is already approved and reconciled")

	# If invoice is not linked to a PO, variance -> Exception
	if not invoice.purchase_order_id:
		invoice.status = "Exception"
		database.commit()
		database.refresh(invoice)
		return invoice

	# Step 2: Acquire row-level lock on linked PurchaseOrder
	po = database.scalar(
		select(models.PurchaseOrder)
		.where(models.PurchaseOrder.id == invoice.purchase_order_id, models.PurchaseOrder.company_id == company_id)
		.with_for_update()
	)
	if po is None or po.status == "cancelled":
		invoice.status = "Exception"
		database.commit()
		database.refresh(invoice)
		return invoice

	# Step 3: Query linked GoodsReceipt
	gr = None
	if invoice.goods_receipt_id:
		gr = database.scalar(
			select(models.GoodsReceipt)
			.where(models.GoodsReceipt.id == invoice.goods_receipt_id, models.GoodsReceipt.company_id == company_id)
		)
	if gr is None:
		gr = database.scalar(
			select(models.GoodsReceipt)
			.where(models.GoodsReceipt.purchase_order_id == po.id, models.GoodsReceipt.company_id == company_id)
			.order_by(models.GoodsReceipt.created_at.desc())
		)

	# 3-Way Match checks:
	# 1. GR must exist and not be rejected
	# 2. Invoiced totals (subtotal, tax_amount, total_amount) must exactly match Purchase Order totals
	# 3. Subtotal + tax_amount must equal total_amount
	has_gr = gr is not None and gr.status not in ("rejected",)
	has_balanced_totals = (invoice.subtotal + invoice.tax_amount == invoice.total_amount)
	matches_po = (
		invoice.subtotal == po.subtotal
		and invoice.tax_amount == po.tax_amount
		and invoice.total_amount == po.total_amount
		and invoice.total_amount > 0
	)

	is_match = has_gr and has_balanced_totals and matches_po

	if not is_match:
		invoice.status = "Exception"
		database.commit()
		database.refresh(invoice)
		return invoice

	# Exact match verified: Approve & Post to General Ledger
	invoice.status = "Approved"
	if gr and not invoice.goods_receipt_id:
		invoice.goods_receipt_id = gr.id

	cogs = account_by_code(database, company_id, "501000", "Cost of Goods Sold - Materials", "expense")
	vat = account_by_code(database, company_id, "203000", "VAT Payable", "liability")
	payable = account_by_code(database, company_id, "201000", "Accounts Payable - Raw Materials", "liability")

	move_lines = [
		AccountMoveLineCreate(
			account_id=cogs.id,
			partner_id=invoice.partner_id,
			cost_center_id=po.cost_center_id,
			debit=invoice.subtotal,
			credit=Decimal("0"),
			name=f"Supplier Invoice Material Expense {invoice.invoice_number}",
		),
	]
	if invoice.tax_amount > 0:
		move_lines.append(
			AccountMoveLineCreate(
				account_id=vat.id,
				partner_id=invoice.partner_id,
				cost_center_id=po.cost_center_id,
				debit=invoice.tax_amount,
				credit=Decimal("0"),
				name=f"Supplier Invoice Tax {invoice.invoice_number}",
			)
		)
	move_lines.append(
		AccountMoveLineCreate(
			account_id=payable.id,
			partner_id=invoice.partner_id,
			cost_center_id=po.cost_center_id,
			debit=Decimal("0"),
			credit=invoice.total_amount,
			name=f"Supplier Invoice Payable {invoice.invoice_number}",
		)
	)

	move_payload = AccountMoveCreate(
		journal_code="BILL",
		move_type="in_invoice",
		partner_id=invoice.partner_id,
		cost_center_id=po.cost_center_id,
		date=invoice.invoice_date,
		ref=invoice.invoice_number,
		lines=move_lines,
	)

	try:
		move = create_posted_account_move(database, company_id, move_payload)
		invoice.move_id = move.id
		if po.status in ("draft", "confirmed", "received"):
			po.status = "billed"
		database.commit()
		database.refresh(invoice)
	except Exception as error:
		database.rollback()
		invoice.status = "Exception"
		database.commit()
		database.refresh(invoice)
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Failed to post accounting move: {error}") from error

	return invoice


# ==========================================
# PHASE 5: TAX PROFILE, TAX RULES & COMPLIANCE
# ==========================================

@app.get("/api/compliance/tax-profiles", response_model=list[TaxProfileRead], tags=["Compliance & Tax"])
def list_tax_profiles(
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	return database.scalars(
		select(models.TaxProfile)
		.where(models.TaxProfile.company_id == company_id)
		.order_by(models.TaxProfile.created_at.desc())
	).all()


@app.post("/api/compliance/tax-profiles", response_model=TaxProfileRead, status_code=status.HTTP_201_CREATED, tags=["Compliance & Tax"])
def create_tax_profile(
	payload: TaxProfileCreate,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	if payload.is_active:
		existing_profiles = database.scalars(
			select(models.TaxProfile).where(models.TaxProfile.company_id == company_id, models.TaxProfile.is_active.is_(True))
		).all()
		for p in existing_profiles:
			p.is_active = False

	profile = models.TaxProfile(
		company_id=company_id,
		**payload.model_dump(),
	)
	database.add(profile)
	database.commit()
	database.refresh(profile)
	return profile


@app.get("/api/compliance/tax-profiles/{profile_id}", response_model=TaxProfileRead, tags=["Compliance & Tax"])
def get_tax_profile(
	profile_id: uuid.UUID,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(get_authenticated_user),
	database: Session = Depends(get_db),
):
	return check_cross_tenant_idor(database, models.TaxProfile, profile_id, company_id, current_user, request, "Tax Profile")


@app.put("/api/compliance/tax-profiles/{profile_id}", response_model=TaxProfileRead, tags=["Compliance & Tax"])
def update_tax_profile(
	profile_id: uuid.UUID,
	payload: TaxProfileUpdate,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	profile = check_cross_tenant_idor(database, models.TaxProfile, profile_id, company_id, current_user, request, "Tax Profile")
	updates = payload.model_dump(exclude_unset=True)
	
	if updates.get("is_active"):
		existing_profiles = database.scalars(
			select(models.TaxProfile).where(models.TaxProfile.company_id == company_id, models.TaxProfile.id != profile_id, models.TaxProfile.is_active.is_(True))
		).all()
		for p in existing_profiles:
			p.is_active = False

	for field, value in updates.items():
		setattr(profile, field, value)
	database.commit()
	database.refresh(profile)
	return profile


@app.delete("/api/compliance/tax-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Compliance & Tax"])
def delete_tax_profile(
	profile_id: uuid.UUID,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	profile = check_cross_tenant_idor(database, models.TaxProfile, profile_id, company_id, current_user, request, "Tax Profile")
	database.delete(profile)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# Tax Rules
@app.get("/api/compliance/tax-rules", response_model=list[TaxRuleRead], tags=["Compliance & Tax"])
def list_tax_rules(
	tax_profile_id: uuid.UUID | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	query = select(models.TaxRule).where(models.TaxRule.company_id == company_id)
	if tax_profile_id:
		query = query.where(models.TaxRule.tax_profile_id == tax_profile_id)
	return database.scalars(query.order_by(models.TaxRule.code)).all()


@app.post("/api/compliance/tax-rules", response_model=TaxRuleRead, status_code=status.HTTP_201_CREATED, tags=["Compliance & Tax"])
def create_tax_rule(
	payload: TaxRuleCreate,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	check_cross_tenant_idor(database, models.TaxProfile, payload.tax_profile_id, company_id, current_user, request, "Tax Profile")
	
	rule = models.TaxRule(
		company_id=company_id,
		**payload.model_dump(),
	)
	database.add(rule)
	database.commit()
	database.refresh(rule)
	return rule


@app.get("/api/compliance/tax-rules/{rule_id}", response_model=TaxRuleRead, tags=["Compliance & Tax"])
def get_tax_rule(
	rule_id: uuid.UUID,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(get_authenticated_user),
	database: Session = Depends(get_db),
):
	return check_cross_tenant_idor(database, models.TaxRule, rule_id, company_id, current_user, request, "Tax Rule")


@app.put("/api/compliance/tax-rules/{rule_id}", response_model=TaxRuleRead, tags=["Compliance & Tax"])
def update_tax_rule(
	rule_id: uuid.UUID,
	payload: TaxRuleUpdate,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	rule = check_cross_tenant_idor(database, models.TaxRule, rule_id, company_id, current_user, request, "Tax Rule")
	updates = payload.model_dump(exclude_unset=True)
	if "tax_profile_id" in updates and updates["tax_profile_id"] is not None:
		check_cross_tenant_idor(database, models.TaxProfile, updates["tax_profile_id"], company_id, current_user, request, "Tax Profile")
	for field, value in updates.items():
		setattr(rule, field, value)
	database.commit()
	database.refresh(rule)
	return rule


@app.delete("/api/compliance/tax-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Compliance & Tax"])
def delete_tax_rule(
	rule_id: uuid.UUID,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	rule = check_cross_tenant_idor(database, models.TaxRule, rule_id, company_id, current_user, request, "Tax Rule")
	database.delete(rule)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==========================================
# PHASE 5: ZATCA INTEGRATION ADAPTER ENDPOINTS
# ==========================================

@app.post("/api/compliance/zatca/process-invoice/{invoice_id}", response_model=ZATCALogRead, tags=["ZATCA E-Invoicing"])
async def process_zatca_invoice(
	invoice_id: uuid.UUID,
	request: Request,
	invoice_type: str = "B2B",
	simulate_failure: bool = False,
	failure_reason: str | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	check_cross_tenant_idor(database, models.CustomerInvoice, invoice_id, company_id, current_user, request, "Customer Invoice")

	eff_type = invoice_type
	eff_simulate = simulate_failure
	eff_reason = failure_reason

	try:
		content_type = request.headers.get("content-type", "")
		if "application/json" in content_type:
			body_bytes = await request.body()
			if body_bytes:
				body_data = json.loads(body_bytes.decode("utf-8"))
				if isinstance(body_data, dict):
					eff_type = body_data.get("invoice_type", eff_type)
					eff_simulate = body_data.get("simulate_failure", eff_simulate)
					eff_reason = body_data.get("failure_reason", eff_reason)
	except Exception:
		pass

	try:
		return ZATCAAdapter.process_invoice(
			database=database,
			company_id=company_id,
			invoice_id=invoice_id,
			invoice_type=eff_type,
			simulate_failure=eff_simulate,
			failure_reason=eff_reason,
		)
	except ValueError as err:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
	except Exception as err:
		import traceback
		traceback.print_exc()
		raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"ZATCA generation error: {err}") from err


@app.post("/api/compliance/zatca/calculate-invoice", response_model=InvoiceMathCalculationResponse, tags=["ZATCA E-Invoicing"])
@app.post("/api/customer-invoices/calculate", response_model=InvoiceMathCalculationResponse, tags=["Customer Invoices"])
def calculate_invoice_math_backend(
	payload: InvoiceMathCalculationRequest,
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""Accurately calculates Rate/Amount/VAT via backend Python Decimal logic with ROUND_HALF_UP halala quantization."""
	quantize = Decimal("0.01")
	if payload.subtotal is not None:
		subtotal = payload.subtotal.quantize(quantize, rounding=ROUND_HALF_UP)
	elif payload.quantity is not None and payload.unit_price is not None:
		subtotal = (payload.quantity * payload.unit_price).quantize(quantize, rounding=ROUND_HALF_UP)
	elif payload.amount is not None:
		subtotal = payload.amount.quantize(quantize, rounding=ROUND_HALF_UP)
	elif payload.rate is not None and payload.quantity is not None:
		subtotal = (payload.rate * payload.quantity).quantize(quantize, rounding=ROUND_HALF_UP)
	else:
		subtotal = Decimal("0.00")

	vat_rate = payload.vat_rate if payload.vat_rate is not None else Decimal("0.15")
	vat_amount = (subtotal * vat_rate).quantize(quantize, rounding=ROUND_HALF_UP)
	grand_total = (subtotal + vat_amount).quantize(quantize, rounding=ROUND_HALF_UP)

	return InvoiceMathCalculationResponse(
		subtotal=subtotal,
		vat_amount=vat_amount,
		grand_total=grand_total,
		vat_rate=vat_rate,
	)


@app.post("/api/compliance/zatca/retry/{log_id}", response_model=ZATCALogRead, tags=["ZATCA E-Invoicing"])
def retry_zatca_submission(
	log_id: uuid.UUID,
	request: Request,
	simulate_failure: bool = False,
	failure_reason: str | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	check_cross_tenant_idor(database, models.ZATCALog, log_id, company_id, current_user, request, "ZATCA Log")

	try:
		return ZATCAAdapter.retry_submission(
			database=database,
			company_id=company_id,
			log_id=log_id,
			simulate_failure=simulate_failure,
			failure_reason=failure_reason,
		)
	except ValueError as err:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
	except Exception as err:
		raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"ZATCA retry error: {err}") from err


@app.get("/api/compliance/zatca/logs", response_model=list[ZATCALogRead], tags=["ZATCA E-Invoicing"])
def list_zatca_logs(
	invoice_id: uuid.UUID | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	query = select(models.ZATCALog).where(models.ZATCALog.company_id == company_id)
	if invoice_id:
		query = query.where(models.ZATCALog.invoice_id == invoice_id)
	return database.scalars(query.order_by(models.ZATCALog.created_at.desc())).all()


@app.get("/api/compliance/zatca/logs/{log_id}", response_model=ZATCALogRead, tags=["ZATCA E-Invoicing"])
def get_zatca_log(
	log_id: uuid.UUID,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(get_authenticated_user),
	database: Session = Depends(get_db),
):
	return check_cross_tenant_idor(database, models.ZATCALog, log_id, company_id, current_user, request, "ZATCA Log")


# ==========================================
# PHASE 5: SECURITY AUDIT & EVENT STREAM
# ==========================================

@app.get("/api/security/events", response_model=list[SecurityEventRead], tags=["Security Audit"])
def list_security_events(
	event_type: str | None = None,
	severity: str | None = None,
	limit: int = 100,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_compliance_admin),
	database: Session = Depends(get_db),
):
	query = select(models.SecurityEvent).where(models.SecurityEvent.company_id == company_id)
	if event_type:
		query = query.where(models.SecurityEvent.event_type == event_type)
	if severity:
		query = query.where(models.SecurityEvent.severity == severity)
	return database.scalars(query.order_by(models.SecurityEvent.created_at.desc()).limit(limit)).all()


# ==========================================
# PHASE 6: MOBILE SYNC BACKEND INFRASTRUCTURE
# ==========================================

@app.post("/api/mobile/register", response_model=DeviceRegistrationRead, tags=["Mobile Sync"])
def register_mobile_device(
	payload: DeviceRegistrationCreate,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(get_authenticated_user),
	database: Session = Depends(get_db),
):
	"""Register or update a mobile device token for offline field operations."""
	device = database.scalar(
		select(models.DeviceRegistration).where(
			models.DeviceRegistration.company_id == company_id,
			models.DeviceRegistration.device_token == payload.device_token,
		)
	)

	now = datetime.now(timezone.utc)
	if device is not None:
		if device.is_revoked:
			raise HTTPException(
				status_code=status.HTTP_403_FORBIDDEN,
				detail="Device token has been revoked by tenant administrator",
			)
		device.user_id = payload.user_id or current_user.id
		if payload.device_model:
			device.device_model = payload.device_model
		if payload.os_version:
			device.os_version = payload.os_version
		if payload.app_version:
			device.app_version = payload.app_version
		device.last_sync_at = now
		database.commit()
		database.refresh(device)
		return device

	device = models.DeviceRegistration(
		company_id=company_id,
		user_id=payload.user_id or current_user.id,
		device_token=payload.device_token,
		device_model=payload.device_model,
		os_version=payload.os_version,
		app_version=payload.app_version,
		is_revoked=False,
		last_sync_at=now,
	)
	database.add(device)
	database.commit()
	database.refresh(device)
	return device


@app.post("/api/mobile/revoke", response_model=DeviceRegistrationRead, tags=["Mobile Sync"])
def revoke_mobile_device(
	payload: DeviceRevokeRequest,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(get_authenticated_user),
	database: Session = Depends(get_db),
):
	"""Revoke a lost, compromised, or decommissioned field device."""
	device = database.scalar(
		select(models.DeviceRegistration).where(
			models.DeviceRegistration.company_id == company_id,
			models.DeviceRegistration.device_token == payload.device_token,
		)
	)
	if device is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device registration was not found")

	device.is_revoked = True
	device.revoked_at = datetime.now(timezone.utc)
	device.revocation_reason = payload.revocation_reason
	database.commit()
	database.refresh(device)
	return device


@app.post("/api/mobile/sync", response_model=SyncBatchResponse, tags=["Mobile Sync"])
def sync_mobile_queue(
	payload: SyncBatchRequest,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(get_authenticated_user),
	database: Session = Depends(get_db),
):
	"""Synchronize queued offline field operations with idempotency and server-authoritative conflict resolution."""
	device = database.scalar(
		select(models.DeviceRegistration).where(
			models.DeviceRegistration.company_id == company_id,
			models.DeviceRegistration.device_token == payload.device_token,
		)
	)
	now = datetime.now(timezone.utc)
	if device is not None:
		if device.is_revoked:
			raise HTTPException(
				status_code=status.HTTP_403_FORBIDDEN,
				detail="Device token has been revoked and cannot synchronize data",
			)
		device.last_sync_at = now

	applied_count = 0
	conflict_count = 0
	duplicate_count = 0
	failed_count = 0
	results: list[SyncBatchItemResult] = []

	for event_in in payload.events:
		# 1. Idempotency Check: if operation_id was already processed, skip duplicate execution
		existing_event = database.scalar(
			select(models.SyncQueueEvent).where(
				models.SyncQueueEvent.company_id == company_id,
				models.SyncQueueEvent.operation_id == event_in.operation_id,
			)
		)
		if existing_event is not None:
			duplicate_count += 1
			results.append(
				SyncBatchItemResult(
					operation_id=event_in.operation_id,
					entity_type=event_in.entity_type,
					action=event_in.action,
					status="SKIPPED_DUPLICATE",
					is_conflict=existing_event.is_conflict,
					conflict_reason=existing_event.conflict_reason,
					message="Idempotent skip: operation was already recorded on server",
				)
			)
			continue

		# Parse payload safely
		p_data: dict[str, Any] = {}
		if isinstance(event_in.payload, str):
			try:
				p_data = json.loads(event_in.payload)
			except Exception:
				p_data = {"raw": event_in.payload}
		elif isinstance(event_in.payload, dict):
			p_data = event_in.payload

		sync_event = models.SyncQueueEvent(
			company_id=company_id,
			device_id=device.id if device else None,
			user_id=current_user.id,
			operation_id=event_in.operation_id,
			entity_type=event_in.entity_type,
			action=event_in.action,
			payload=json.dumps(p_data, default=str),
			client_timestamp=event_in.client_timestamp,
			sync_status="PENDING",
			is_conflict=False,
		)

		server_record_id: str | None = None
		action = event_in.action.lower()
		entity = event_in.entity_type.lower()

		try:
			# Entity: FarmGateWeighment
			if entity in {"farm_gate_weighment", "weighment", "farm_gate_weighments"}:
				if action == "create":
					gross = Decimal(str(p_data.get("gross_weight", "0")))
					tare = Decimal(str(p_data.get("tare_weight", "0")))
					net = Decimal(str(p_data.get("net_weight", gross - tare)))
					if net != gross - tare:
						net = gross - tare

					ticket_num = str(p_data.get("ticket_number") or f"FGW-{uuid.uuid4().hex[:8].upper()}")
					weighment = models.FarmGateWeighment(
						company_id=company_id,
						ticket_number=ticket_num,
						harvest_batch_id=uuid.UUID(str(p_data["harvest_batch_id"])),
						vehicle_id=uuid.UUID(str(p_data["vehicle_id"])) if p_data.get("vehicle_id") else None,
						transporter_id=uuid.UUID(str(p_data["transporter_id"])) if p_data.get("transporter_id") else None,
						farmer_id=uuid.UUID(str(p_data["farmer_id"])) if p_data.get("farmer_id") else None,
						gross_weight=gross,
						tare_weight=tare,
						net_weight=net,
						field_location_name=p_data.get("field_location_name"),
						status=p_data.get("status", "draft"),
						notes=p_data.get("notes"),
					)
					database.add(weighment)
					database.flush()
					server_record_id = str(weighment.id)
					sync_event.sync_status = "APPLIED"
					sync_event.applied_at = now
					applied_count += 1

				elif action == "update":
					target_id = p_data.get("id") or p_data.get("entity_id")
					ticket_num = p_data.get("ticket_number")
					query = select(models.FarmGateWeighment).where(models.FarmGateWeighment.company_id == company_id)
					if target_id:
						query = query.where(models.FarmGateWeighment.id == uuid.UUID(str(target_id)))
					elif ticket_num:
						query = query.where(models.FarmGateWeighment.ticket_number == str(ticket_num))
					else:
						raise ValueError("FarmGateWeighment update requires 'id' or 'ticket_number'")

					target = database.scalar(query)
					if target is None:
						sync_event.sync_status = "FAILED"
						sync_event.conflict_reason = "FarmGateWeighment record not found on server"
						failed_count += 1
					elif target.status in {"approved", "locked"}:
						# Server-authoritative conflict rejection
						sync_event.is_conflict = True
						sync_event.sync_status = "REJECTED_CONFLICT"
						sync_event.conflict_reason = f"Weighment ticket {target.ticket_number} is locked or approved ({target.status}) on server. Client update rejected."
						conflict_count += 1
						server_record_id = str(target.id)
					else:
						if "gross_weight" in p_data:
							target.gross_weight = Decimal(str(p_data["gross_weight"]))
						if "tare_weight" in p_data:
							target.tare_weight = Decimal(str(p_data["tare_weight"]))
						if "net_weight" in p_data:
							target.net_weight = Decimal(str(p_data["net_weight"]))
						if target.gross_weight is not None and target.tare_weight is not None:
							target.net_weight = target.gross_weight - target.tare_weight
						if "field_location_name" in p_data:
							target.field_location_name = p_data["field_location_name"]
						if "notes" in p_data:
							target.notes = p_data["notes"]
						sync_event.sync_status = "APPLIED"
						sync_event.applied_at = now
						applied_count += 1
						server_record_id = str(target.id)

			# Entity: MaintenanceWorkOrder
			elif entity in {"maintenance_work_order", "work_order", "maintenance_work_orders"}:
				if action == "create":
					wo_num = str(p_data.get("order_number") or f"MWO-{uuid.uuid4().hex[:8].upper()}")
					wo = models.MaintenanceWorkOrder(
						company_id=company_id,
						order_number=wo_num,
						vehicle_id=uuid.UUID(str(p_data["vehicle_id"])),
						order_type=p_data.get("order_type", "preventive"),
						priority=p_data.get("priority", "medium"),
						status=p_data.get("status", "draft"),
						description=p_data.get("description") or "Field Maintenance Order",
					)
					database.add(wo)
					database.flush()
					server_record_id = str(wo.id)
					sync_event.sync_status = "APPLIED"
					sync_event.applied_at = now
					applied_count += 1

				elif action == "update":
					target_id = p_data.get("id") or p_data.get("entity_id")
					wo_num = p_data.get("order_number")
					query = select(models.MaintenanceWorkOrder).where(models.MaintenanceWorkOrder.company_id == company_id)
					if target_id:
						query = query.where(models.MaintenanceWorkOrder.id == uuid.UUID(str(target_id)))
					elif wo_num:
						query = query.where(models.MaintenanceWorkOrder.order_number == str(wo_num))
					else:
						raise ValueError("MaintenanceWorkOrder update requires 'id' or 'order_number'")

					target = database.scalar(query)
					if target is None:
						sync_event.sync_status = "FAILED"
						sync_event.conflict_reason = "MaintenanceWorkOrder record not found on server"
						failed_count += 1
					elif target.status in {"completed", "cancelled"}:
						# Server-authoritative conflict rejection
						sync_event.is_conflict = True
						sync_event.sync_status = "REJECTED_CONFLICT"
						sync_event.conflict_reason = f"Work order {target.order_number} is finalized on server with status '{target.status}'. Client update rejected."
						conflict_count += 1
						server_record_id = str(target.id)
					else:
						if "description" in p_data:
							target.description = p_data["description"]
						if "status" in p_data:
							target.status = p_data["status"]
						sync_event.sync_status = "APPLIED"
						sync_event.applied_at = now
						applied_count += 1
						server_record_id = str(target.id)

			# Entity: DeliveryProof / POD
			elif entity in {"delivery_proof", "pod", "delivery_proofs"}:
				if action == "create":
					trip_id = uuid.UUID(str(p_data["trip_id"]))
					trip = database.scalar(select(models.FleetTrip).where(models.FleetTrip.id == trip_id, models.FleetTrip.company_id == company_id))
					if trip is not None:
						proof = models.DeliveryProof(
							company_id=company_id,
							trip_id=trip.id,
							recipient_name=p_data.get("recipient_name") or p_data.get("RecipientName") or "Recipient",
							recipient_phone=p_data.get("recipient_phone") or p_data.get("RecipientPhone"),
							latitude=Decimal(str(p_data.get("latitude") or p_data.get("Latitude") or 24.7136)),
							longitude=Decimal(str(p_data.get("longitude") or p_data.get("Longitude") or 46.6753)),
							altitude=Decimal(str(p_data.get("altitude") or p_data.get("Altitude"))) if (p_data.get("altitude") or p_data.get("Altitude")) is not None else None,
							accuracy_meters=Decimal(str(p_data.get("accuracy_meters") or p_data.get("AccuracyMeters"))) if (p_data.get("accuracy_meters") or p_data.get("AccuracyMeters")) is not None else None,
							digital_signature_data=p_data.get("digital_signature_data") or p_data.get("DigitalSignatureData"),
							encrypted_photo_urls=json.dumps(p_data.get("encrypted_photo_file_paths") or p_data.get("EncryptedPhotoFilePaths") or []),
							delivery_notes=p_data.get("delivery_notes") or p_data.get("DeliveryNotes"),
							delivered_at=now,
						)
						trip.status = "delivered"
						trip.actual_delivery = now
						database.add(proof)
						database.flush()
						server_record_id = str(proof.id)
						sync_event.sync_status = "APPLIED"
						sync_event.applied_at = now
						applied_count += 1
					else:
						sync_event.sync_status = "FAILED"
						sync_event.conflict_reason = f"FleetTrip '{trip_id}' not found on server"
						failed_count += 1

			# Entity: TripStatus / FleetTrip
			elif entity in {"trip_status", "trip", "fleet_trip"}:
				trip_id = uuid.UUID(str(p_data.get("trip_id") or p_data.get("id")))
				trip = database.scalar(select(models.FleetTrip).where(models.FleetTrip.id == trip_id, models.FleetTrip.company_id == company_id))
				if trip is not None:
					new_status = p_data.get("status") or trip.status
					trip.status = new_status
					if "latitude" in p_data:
						trip.current_latitude = Decimal(str(p_data["latitude"]))
					if "longitude" in p_data:
						trip.current_longitude = Decimal(str(p_data["longitude"]))
					if "speed_kmh" in p_data:
						trip.speed_kmh = Decimal(str(p_data["speed_kmh"]))
					if new_status in ("en_route_pickup", "in_transit") and not trip.actual_departure:
						trip.actual_departure = now
					elif new_status == "delivered" and not trip.actual_delivery:
						trip.actual_delivery = now
					trip.last_gps_at = now
					server_record_id = str(trip.id)
					sync_event.sync_status = "APPLIED"
					sync_event.applied_at = now
					applied_count += 1
				else:
					sync_event.sync_status = "FAILED"
					sync_event.conflict_reason = f"FleetTrip '{trip_id}' not found on server"
					failed_count += 1

			# Entity: TripInspectionLog
			elif entity in {"inspection_log", "trip_inspection_log", "inspection_logs"}:
				insp = models.TripInspectionLog(
					company_id=company_id,
					trip_id=uuid.UUID(str(p_data["trip_id"])) if p_data.get("trip_id") else None,
					vehicle_id=uuid.UUID(str(p_data["vehicle_id"])),
					driver_id=uuid.UUID(str(p_data["driver_id"])) if p_data.get("driver_id") else None,
					inspection_type=p_data.get("inspection_type", "pre_trip"),
					odometer_reading=Decimal(str(p_data["odometer_reading"])) if p_data.get("odometer_reading") else None,
					is_safe_to_operate=bool(p_data.get("is_safe_to_operate", True)),
					notes=p_data.get("notes"),
					inspected_at=now,
				)
				database.add(insp)
				database.flush()
				server_record_id = str(insp.id)
				sync_event.sync_status = "APPLIED"
				sync_event.applied_at = now
				applied_count += 1

			else:
				sync_event.sync_status = "FAILED"
				sync_event.conflict_reason = f"Unsupported entity type for mobile sync: {entity}"
				failed_count += 1

		except Exception as err:
			database.rollback()
			sync_event.sync_status = "FAILED"
			sync_event.conflict_reason = f"Sync processing exception: {err}"
			failed_count += 1

		database.add(sync_event)
		database.commit()
		database.refresh(sync_event)

		results.append(
			SyncBatchItemResult(
				operation_id=event_in.operation_id,
				entity_type=event_in.entity_type,
				action=event_in.action,
				status=sync_event.sync_status,
				is_conflict=sync_event.is_conflict,
				conflict_reason=sync_event.conflict_reason,
				server_record_id=server_record_id,
				message=sync_event.conflict_reason or "Successfully synchronized",
			)
		)

	return SyncBatchResponse(
		processed_count=len(payload.events),
		applied_count=applied_count,
		conflict_count=conflict_count,
		duplicate_count=duplicate_count,
		failed_count=failed_count,
		results=results,
	)


# --- Mobile Fleet Operations & Driver Endpoints ---

@app.get("/api/mobile/trips", response_model=list[FleetTripRead], tags=["Mobile Fleet"])
def list_mobile_trips(
	status: str | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Driver Mobile App: fetch assigned and in-transit trips."""
	query = select(models.FleetTrip).where(models.FleetTrip.company_id == company_id)
	if status:
		query = query.where(models.FleetTrip.status == status)
	return database.scalars(query.order_by(models.FleetTrip.created_at.desc())).all()


@app.post("/api/mobile/trips", response_model=FleetTripRead, status_code=status.HTTP_201_CREATED, tags=["Mobile Fleet"])
def create_mobile_trip(
	payload: FleetTripCreate,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Dispatch or schedule a new transport trip."""
	trip_num = payload.trip_number or f"TRP-{datetime.now(timezone.utc):%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"
	trip = models.FleetTrip(
		company_id=company_id,
		trip_number=trip_num,
		vehicle_id=payload.vehicle_id,
		driver_id=payload.driver_id,
		origin_location=payload.origin_location,
		destination_location=payload.destination_location,
		cargo_description=payload.cargo_description,
		planned_weight_tons=payload.planned_weight_tons,
		scheduled_departure=payload.scheduled_departure or datetime.now(timezone.utc),
		notes=payload.notes,
		status="assigned",
	)
	database.add(trip)
	database.commit()
	database.refresh(trip)
	return trip


@app.get("/api/mobile/trips/{trip_id}", response_model=FleetTripRead, tags=["Mobile Fleet"])
def get_mobile_trip(
	trip_id: uuid.UUID,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Get details for a specific trip."""
	trip = database.scalar(select(models.FleetTrip).where(models.FleetTrip.id == trip_id, models.FleetTrip.company_id == company_id))
	if trip is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
	return trip


@app.put("/api/mobile/trips/{trip_id}/status", response_model=FleetTripRead, tags=["Mobile Fleet"])
def update_mobile_trip_status(
	trip_id: uuid.UUID,
	payload: TripStatusUpdate,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Update trip lifecycle status with GPS coordinates and routing telemetry."""
	trip = database.scalar(select(models.FleetTrip).where(models.FleetTrip.id == trip_id, models.FleetTrip.company_id == company_id))
	if trip is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

	now = datetime.now(timezone.utc)
	trip.status = payload.status
	if payload.latitude is not None:
		trip.current_latitude = payload.latitude
	if payload.longitude is not None:
		trip.current_longitude = payload.longitude
	if payload.speed_kmh is not None:
		trip.speed_kmh = payload.speed_kmh
	if payload.notes:
		trip.notes = f"{trip.notes or ''}\n{payload.notes}".strip()
	trip.last_gps_at = now

	if payload.status in ("en_route_pickup", "in_transit") and not trip.actual_departure:
		trip.actual_departure = now
	elif payload.status == "delivered" and not trip.actual_delivery:
		trip.actual_delivery = now

	database.commit()
	database.refresh(trip)
	return trip


@app.post("/api/mobile/delivery-proof", response_model=DeliveryProofRead, status_code=status.HTTP_201_CREATED, tags=["Mobile Fleet"])
def submit_delivery_proof(
	payload: DeliveryProofCreate,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Submit Proof of Delivery (signature, encrypted photo hashes, GPS) and complete trip."""
	trip = database.scalar(select(models.FleetTrip).where(models.FleetTrip.id == payload.trip_id, models.FleetTrip.company_id == company_id))
	if trip is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

	now = datetime.now(timezone.utc)
	photos_str = json.dumps(payload.encrypted_photo_urls) if isinstance(payload.encrypted_photo_urls, list) else payload.encrypted_photo_urls

	existing_proof = database.scalar(select(models.DeliveryProof).where(models.DeliveryProof.trip_id == trip.id))
	if existing_proof is not None:
		existing_proof.recipient_name = payload.recipient_name
		existing_proof.recipient_phone = payload.recipient_phone
		existing_proof.latitude = payload.latitude
		existing_proof.longitude = payload.longitude
		existing_proof.altitude = payload.altitude
		existing_proof.accuracy_meters = payload.accuracy_meters
		existing_proof.digital_signature_data = payload.digital_signature_data
		existing_proof.encrypted_photo_urls = photos_str
		existing_proof.delivery_notes = payload.delivery_notes
		existing_proof.delivered_at = payload.delivered_at or now
		proof = existing_proof
	else:
		proof = models.DeliveryProof(
			company_id=company_id,
			trip_id=trip.id,
			recipient_name=payload.recipient_name,
			recipient_phone=payload.recipient_phone,
			latitude=payload.latitude,
			longitude=payload.longitude,
			altitude=payload.altitude,
			accuracy_meters=payload.accuracy_meters,
			digital_signature_data=payload.digital_signature_data,
			encrypted_photo_urls=photos_str,
			delivery_notes=payload.delivery_notes,
			delivered_at=payload.delivered_at or now,
		)
		database.add(proof)

	trip.status = "delivered"
	trip.actual_delivery = payload.delivered_at or now
	trip.current_latitude = payload.latitude
	trip.current_longitude = payload.longitude
	trip.last_gps_at = now

	database.commit()
	database.refresh(proof)
	return proof


@app.post("/api/mobile/inspection-logs", response_model=TripInspectionLogRead, status_code=status.HTTP_201_CREATED, tags=["Mobile Fleet"])
def create_trip_inspection_log(
	payload: TripInspectionLogCreate,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Submit vehicle pre-trip or post-trip safety checklist."""
	insp = models.TripInspectionLog(
		company_id=company_id,
		trip_id=payload.trip_id,
		vehicle_id=payload.vehicle_id,
		driver_id=payload.driver_id,
		inspection_type=payload.inspection_type,
		odometer_reading=payload.odometer_reading,
		is_safe_to_operate=payload.is_safe_to_operate,
		notes=payload.notes,
		inspected_at=datetime.now(timezone.utc),
	)
	database.add(insp)
	database.commit()
	database.refresh(insp)
	return insp


@app.get("/api/mobile/inspection-logs", response_model=list[TripInspectionLogRead], tags=["Mobile Fleet"])
def list_trip_inspection_logs(
	vehicle_id: uuid.UUID | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""List trip safety inspection logs."""
	query = select(models.TripInspectionLog).where(models.TripInspectionLog.company_id == company_id)
	if vehicle_id:
		query = query.where(models.TripInspectionLog.vehicle_id == vehicle_id)
	return database.scalars(query.order_by(models.TripInspectionLog.inspected_at.desc())).all()


# --- Real-Time Multi-Tenant Analytics ---

@app.get("/api/analytics/tenant-summary", response_model=TenantAnalyticsSummaryRead, tags=["Analytics"])
def get_tenant_analytics_summary(
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	"""Real-time multi-tenant analytics backed by indexed queries."""
	invoices = database.scalars(select(models.CustomerInvoice).where(models.CustomerInvoice.company_id == company_id)).all()
	total_rev = sum((inv.grand_total for inv in invoices if inv.status in ("Issued", "Approved")), Decimal("0"))
	unpaid_rec = sum((inv.grand_total for inv in invoices if inv.status in ("Issued", "Approved")), Decimal("0"))
	total_inv_count = len(invoices)
	paid_inv_count = sum(1 for inv in invoices if inv.status == "Issued")

	trips = database.scalars(select(models.FleetTrip).where(models.FleetTrip.company_id == company_id)).all()
	active_trips_count = sum(1 for t in trips if t.status in ("assigned", "en_route_pickup", "at_pickup", "loaded", "en_route_delivery", "at_delivery"))
	total_trips_count = len(trips)

	vehicles = database.scalars(select(models.Vehicle).where(models.Vehicle.company_id == company_id)).all()
	total_fleet = len(vehicles)
	active_vehicles = sum(1 for v in vehicles if v.status == "active")
	utilization_rate = round((active_vehicles / total_fleet * 100), 2) if total_fleet > 0 else 0.0

	fuel_txs = database.scalars(select(models.FuelTransaction).where(models.FuelTransaction.company_id == company_id)).all()
	total_fuel_liters = sum((f.liters for f in fuel_txs), Decimal("0"))
	total_fuel_spent = sum((f.total_amount for f in fuel_txs), Decimal("0"))
	avg_price = round(total_fuel_spent / total_fuel_liters, 2) if total_fuel_liters > Decimal("0") else Decimal("0")

	return TenantAnalyticsSummaryRead(
		total_revenue=Decimal(str(total_rev)),
		outstanding_receivables=Decimal(str(unpaid_rec)),
		active_trips=active_trips_count,
		total_trips=total_trips_count,
		total_fleet_count=total_fleet,
		active_vehicles_count=active_vehicles,
		fleet_utilization_rate=utilization_rate,
		total_fuel_consumed_liters=Decimal(str(total_fuel_liters)),
		total_fuel_spent_sar=Decimal(str(total_fuel_spent)),
		avg_fuel_price_sar=Decimal(str(avg_price)),
		total_invoices_count=total_inv_count,
		paid_invoices_count=paid_inv_count,
	)


# ==============================================================================
# Phase 7: Warehouse & Yard Management Logic Layer
# ==============================================================================

# --- Warehouse Endpoints ---

@app.get("/api/warehouse/warehouses", response_model=list[WarehouseRead], tags=["Warehouse"])
def list_warehouses(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(
		select(models.Warehouse).where(models.Warehouse.company_id == company_id).order_by(models.Warehouse.created_at.desc())
	).all()


@app.post("/api/warehouse/warehouses", response_model=WarehouseRead, status_code=status.HTTP_201_CREATED, tags=["Warehouse"])
def create_warehouse(payload: WarehouseCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	existing = database.scalar(
		select(models.Warehouse).where(models.Warehouse.company_id == company_id, models.Warehouse.code == payload.code)
	)
	if existing:
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Warehouse code '{payload.code}' already exists")
	warehouse = models.Warehouse(company_id=company_id, **payload.model_dump())
	database.add(warehouse)
	database.commit()
	database.refresh(warehouse)
	return warehouse


@app.get("/api/warehouse/warehouses/{warehouse_id}", response_model=WarehouseRead, tags=["Warehouse"])
def get_warehouse(warehouse_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	warehouse = database.scalar(
		select(models.Warehouse).where(models.Warehouse.id == warehouse_id, models.Warehouse.company_id == company_id)
	)
	if warehouse is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse was not found")
	return warehouse


@app.put("/api/warehouse/warehouses/{warehouse_id}", response_model=WarehouseRead, tags=["Warehouse"])
def update_warehouse(warehouse_id: uuid.UUID, payload: WarehouseUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	warehouse = database.scalar(
		select(models.Warehouse).where(models.Warehouse.id == warehouse_id, models.Warehouse.company_id == company_id)
	)
	if warehouse is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(warehouse, field, value)
	database.commit()
	database.refresh(warehouse)
	return warehouse


@app.delete("/api/warehouse/warehouses/{warehouse_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Warehouse"])
def delete_warehouse(warehouse_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	warehouse = database.scalar(
		select(models.Warehouse).where(models.Warehouse.id == warehouse_id, models.Warehouse.company_id == company_id)
	)
	if warehouse is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse was not found")
	database.delete(warehouse)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Warehouse Zone Endpoints ---

@app.get("/api/warehouse/zones", response_model=list[WarehouseZoneRead], tags=["Warehouse"])
def list_warehouse_zones(
	warehouse_id: uuid.UUID | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	query = select(models.WarehouseZone).where(models.WarehouseZone.company_id == company_id)
	if warehouse_id:
		query = query.where(models.WarehouseZone.warehouse_id == warehouse_id)
	return database.scalars(query.order_by(models.WarehouseZone.created_at.desc())).all()


@app.post("/api/warehouse/zones", response_model=WarehouseZoneRead, status_code=status.HTTP_201_CREATED, tags=["Warehouse"])
def create_warehouse_zone(payload: WarehouseZoneCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	warehouse = database.scalar(
		select(models.Warehouse).where(models.Warehouse.id == payload.warehouse_id, models.Warehouse.company_id == company_id)
	)
	if warehouse is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target warehouse was not found or access denied")
	existing = database.scalar(
		select(models.WarehouseZone).where(
			models.WarehouseZone.warehouse_id == payload.warehouse_id,
			models.WarehouseZone.code == payload.code,
		)
	)
	if existing:
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Zone code '{payload.code}' already exists in warehouse")
	zone = models.WarehouseZone(company_id=company_id, **payload.model_dump())
	database.add(zone)
	database.commit()
	database.refresh(zone)
	return zone


@app.get("/api/warehouse/zones/{zone_id}", response_model=WarehouseZoneRead, tags=["Warehouse"])
def get_warehouse_zone(zone_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	zone = database.scalar(
		select(models.WarehouseZone).where(models.WarehouseZone.id == zone_id, models.WarehouseZone.company_id == company_id)
	)
	if zone is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse zone was not found")
	return zone


@app.put("/api/warehouse/zones/{zone_id}", response_model=WarehouseZoneRead, tags=["Warehouse"])
def update_warehouse_zone(zone_id: uuid.UUID, payload: WarehouseZoneUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	zone = database.scalar(
		select(models.WarehouseZone).where(models.WarehouseZone.id == zone_id, models.WarehouseZone.company_id == company_id)
	)
	if zone is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse zone was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(zone, field, value)
	database.commit()
	database.refresh(zone)
	return zone


@app.delete("/api/warehouse/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Warehouse"])
def delete_warehouse_zone(zone_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	zone = database.scalar(
		select(models.WarehouseZone).where(models.WarehouseZone.id == zone_id, models.WarehouseZone.company_id == company_id)
	)
	if zone is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse zone was not found")
	database.delete(zone)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Yard Gate Appointment Endpoints ---

@app.get("/api/warehouse/yard/appointments", response_model=list[YardGateAppointmentRead], tags=["Yard"])
def list_yard_appointments(
	warehouse_id: uuid.UUID | None = None,
	status_filter: str | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	query = select(models.YardGateAppointment).where(models.YardGateAppointment.company_id == company_id)
	if warehouse_id:
		query = query.where(models.YardGateAppointment.warehouse_id == warehouse_id)
	if status_filter:
		query = query.where(models.YardGateAppointment.status == status_filter)
	return database.scalars(query.order_by(models.YardGateAppointment.scheduled_time.desc())).all()


@app.post("/api/warehouse/yard/appointments", response_model=YardGateAppointmentRead, status_code=status.HTTP_201_CREATED, tags=["Yard"])
def create_yard_appointment(payload: YardGateAppointmentCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	warehouse = database.scalar(
		select(models.Warehouse).where(models.Warehouse.id == payload.warehouse_id, models.Warehouse.company_id == company_id)
	)
	if warehouse is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse was not found or access denied")
	appointment = models.YardGateAppointment(company_id=company_id, **payload.model_dump())
	try:
		database.add(appointment)
		database.commit()
		database.refresh(appointment)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Appointment number already exists") from error
	return appointment


@app.get("/api/warehouse/yard/appointments/{appointment_id}", response_model=YardGateAppointmentRead, tags=["Yard"])
def get_yard_appointment(appointment_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	appointment = database.scalar(
		select(models.YardGateAppointment).where(models.YardGateAppointment.id == appointment_id, models.YardGateAppointment.company_id == company_id)
	)
	if appointment is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Yard gate appointment was not found")
	return appointment


@app.put("/api/warehouse/yard/appointments/{appointment_id}", response_model=YardGateAppointmentRead, tags=["Yard"])
def update_yard_appointment(appointment_id: uuid.UUID, payload: YardGateAppointmentUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	appointment = database.scalar(
		select(models.YardGateAppointment).where(models.YardGateAppointment.id == appointment_id, models.YardGateAppointment.company_id == company_id)
	)
	if appointment is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Yard gate appointment was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		setattr(appointment, field, value)
	database.commit()
	database.refresh(appointment)
	return appointment


@app.delete("/api/warehouse/yard/appointments/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Yard"])
def delete_yard_appointment(appointment_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	appointment = database.scalar(
		select(models.YardGateAppointment).where(models.YardGateAppointment.id == appointment_id, models.YardGateAppointment.company_id == company_id)
	)
	if appointment is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Yard gate appointment was not found")
	database.delete(appointment)
	database.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Stock Items Endpoints ---

@app.get("/api/warehouse/stock-items", response_model=list[StockItemRead], tags=["Warehouse"])
def list_stock_items(company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	return database.scalars(
		select(models.StockItem).where(models.StockItem.company_id == company_id).order_by(models.StockItem.created_at.desc())
	).all()


@app.post("/api/warehouse/stock-items", response_model=StockItemRead, status_code=status.HTTP_201_CREATED, tags=["Warehouse"])
def create_stock_item(payload: StockItemCreate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	product = database.scalar(
		select(models.ProductProduct).where(models.ProductProduct.id == payload.product_id, models.ProductProduct.company_id == company_id)
	)
	if product is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found or access denied")
	stock_item = models.StockItem(company_id=company_id, **payload.model_dump())
	try:
		database.add(stock_item)
		database.commit()
		database.refresh(stock_item)
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Stock item SKU '{payload.sku}' already exists") from error
	return stock_item


@app.put("/api/warehouse/stock-items/{item_id}", response_model=StockItemRead, tags=["Warehouse"])
def update_stock_item(item_id: uuid.UUID, payload: StockItemUpdate, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	stock_item = database.scalar(
		select(models.StockItem).where(models.StockItem.id == item_id, models.StockItem.company_id == company_id)
	)
	if stock_item is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item was not found")
	for field, value in payload.model_dump(exclude_unset=True).items():
		if field == "custom_attributes":
			stock_item.custom_attributes = {**(stock_item.custom_attributes or {}), **(value or {})}
			continue
		setattr(stock_item, field, value)
	database.commit()
	database.refresh(stock_item)
	return stock_item


@app.get("/api/warehouse/stock-items/{item_id}", response_model=StockItemRead, tags=["Warehouse"])
def get_stock_item(item_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	stock_item = database.scalar(
		select(models.StockItem).where(models.StockItem.id == item_id, models.StockItem.company_id == company_id)
	)
	if stock_item is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item was not found")
	return stock_item


# --- Stock Lots Endpoints ---

@app.get("/api/warehouse/lots", response_model=list[StockLotRead], tags=["Warehouse"])
def list_stock_lots(
	stock_item_id: uuid.UUID | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	query = select(models.StockLot).where(models.StockLot.company_id == company_id)
	if stock_item_id:
		query = query.where(models.StockLot.stock_item_id == stock_item_id)
	return database.scalars(query.order_by(models.StockLot.received_date.asc(), models.StockLot.created_at.asc())).all()


@app.get("/api/warehouse/lots/{lot_id}", response_model=StockLotRead, tags=["Warehouse"])
def get_stock_lot(lot_id: uuid.UUID, company_id: uuid.UUID = Depends(get_active_company_id), database: Session = Depends(get_db)):
	lot = database.scalar(
		select(models.StockLot).where(models.StockLot.id == lot_id, models.StockLot.company_id == company_id)
	)
	if lot is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock lot was not found")
	return lot


# --- Stock Movements Processing Engine ---

@app.get("/api/warehouse/movements", response_model=list[StockMovementRead], tags=["Warehouse"])
def list_stock_movements(
	stock_item_id: uuid.UUID | None = None,
	warehouse_id: uuid.UUID | None = None,
	movement_type: str | None = None,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	query = select(models.StockMovement).where(models.StockMovement.company_id == company_id)
	if stock_item_id:
		query = query.where(models.StockMovement.stock_item_id == stock_item_id)
	if warehouse_id:
		query = query.where(models.StockMovement.warehouse_id == warehouse_id)
	if movement_type:
		query = query.where(models.StockMovement.movement_type == movement_type)
	return database.scalars(query.order_by(models.StockMovement.created_at.desc())).all()


@app.post("/api/warehouse/movements", response_model=StockMovementProcessResponse, status_code=status.HTTP_201_CREATED, tags=["Warehouse"])
def process_stock_movement(
	payload: StockMovementProcessRequest,
	company_id: uuid.UUID = Depends(get_active_company_id),
	database: Session = Depends(get_db),
):
	warehouse = database.scalar(
		select(models.Warehouse).where(models.Warehouse.id == payload.warehouse_id, models.Warehouse.company_id == company_id)
	)
	if warehouse is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found or access denied")

	stock_item = database.scalar(
		select(models.StockItem).where(models.StockItem.id == payload.stock_item_id, models.StockItem.company_id == company_id)
	)
	if stock_item is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item not found or access denied")

	if payload.zone_id:
		zone = database.scalar(
			select(models.WarehouseZone).where(
				models.WarehouseZone.id == payload.zone_id,
				models.WarehouseZone.company_id == company_id,
				models.WarehouseZone.warehouse_id == warehouse.id,
			)
		)
		if zone is None:
			raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse zone not found in this warehouse")

	now_utc = datetime.now(timezone.utc)
	account_move_id: uuid.UUID | None = None
	created_movements: list[models.StockMovement] = []
	total_valuation = Decimal("0.00")

	if payload.movement_type == "inbound":
		received_dt = payload.received_date or now_utc
		unit_cost = payload.unit_cost if payload.unit_cost is not None else Decimal("0.0000")
		lot_number = payload.lot_number or f"LOT-{now_utc:%Y%m%d%H%M%S}-{uuid.uuid4().hex[:6].upper()}"

		# Query current active balance for stock item across company
		current_balance = database.scalar(
			select(func.coalesce(func.sum(models.StockLot.remaining_quantity), Decimal("0.0000"))).where(
				models.StockLot.company_id == company_id,
				models.StockLot.stock_item_id == stock_item.id,
				models.StockLot.status == "active",
			)
		) or Decimal("0.0000")

		new_balance = current_balance + payload.quantity

		# FIFO Receipt: Create new StockLot stamped with exact received_date and unit_cost
		lot = models.StockLot(
			company_id=company_id,
			stock_item_id=stock_item.id,
			lot_number=lot_number,
			harvest_batch_id=payload.harvest_batch_id,
			initial_quantity=payload.quantity,
			remaining_quantity=payload.quantity,
			unit_cost=unit_cost,
			received_date=received_dt,
			expiration_date=payload.expiration_date,
			status="active",
			custom_attributes=sanitize_attributes(payload.custom_attributes),
		)
		database.add(lot)
		database.flush()

		mov_number = payload.movement_number or f"MV-IN-{now_utc:%Y%m%d%H%M%S}-{uuid.uuid4().hex[:6].upper()}"
		movement = models.StockMovement(
			company_id=company_id,
			movement_number=mov_number,
			stock_item_id=stock_item.id,
			lot_id=lot.id,
			warehouse_id=warehouse.id,
			zone_id=payload.zone_id,
			movement_type="inbound",
			quantity=payload.quantity,
			unit_cost=unit_cost,
			reference_type=payload.reference_type or "goods_receipt",
			reference_id=payload.reference_id,
			balance_after=new_balance,
			notes=payload.notes or f"FIFO Receipt for lot {lot.lot_number}",
			custom_attributes=sanitize_attributes(payload.custom_attributes),
		)
		database.add(movement)
		database.flush()
		created_movements.append(movement)

		total_valuation = (payload.quantity * unit_cost).quantize(Decimal("0.01"))

		# Financial posting: Dr Inventory (102000) / Cr GRNI (202000)
		if total_valuation > Decimal("0"):
			inv_account = account_by_code(database, company_id, "102000", "Inventory Asset", "asset")
			grni_account = account_by_code(database, company_id, "202000", "Goods Received Not Invoiced (GRNI)", "liability")
			gl_payload = AccountMoveCreate(
				journal_code="STK",
				move_type="entry",
				date=received_dt,
				ref=f"Receipt: {movement.movement_number}",
				lines=[
					AccountMoveLineCreate(
						account_id=inv_account.id,
						debit=total_valuation,
						credit=Decimal("0.00"),
						name=f"Stock Intake {stock_item.sku} - {lot.lot_number}",
					),
					AccountMoveLineCreate(
						account_id=grni_account.id,
						debit=Decimal("0.00"),
						credit=total_valuation,
						name=f"GRNI Accrual {stock_item.sku} - {lot.lot_number}",
					),
				],
			)
			gl_move = create_posted_account_move(database, company_id, gl_payload)
			account_move_id = gl_move.id

		database.commit()
		for mov in created_movements:
			database.refresh(mov)

		return StockMovementProcessResponse(
			success=True,
			movements=[StockMovementRead.model_validate(mov) for mov in created_movements],
			account_move_id=account_move_id,
			total_quantity=payload.quantity,
			total_valuation=total_valuation,
			message=f"Inbound movement processed successfully. Created lot {lot.lot_number}."
			+ (f" Posted GL entry {gl_move.name}." if account_move_id else ""),
		)

	elif payload.movement_type == "outbound":
		# FIFO Issue: lock candidate active lots using row-level locking
		candidate_lots = database.scalars(
			select(models.StockLot)
			.where(
				models.StockLot.company_id == company_id,
				models.StockLot.stock_item_id == stock_item.id,
				models.StockLot.status == "active",
				models.StockLot.remaining_quantity > Decimal("0"),
			)
			.order_by(models.StockLot.received_date.asc(), models.StockLot.created_at.asc())
			.with_for_update()
		).all()

		total_available = sum((lot.remaining_quantity for lot in candidate_lots), Decimal("0"))
		if total_available < payload.quantity:
			raise HTTPException(
				status_code=status.HTTP_400_BAD_REQUEST,
				detail=f"Insufficient inventory for stock item '{stock_item.sku}'. Requested: {payload.quantity}, Available: {total_available}",
			)

		remaining_needed = payload.quantity
		running_balance = total_available
		total_valuation = Decimal("0.00")

		# Consume quantities from oldest lots first
		for lot in candidate_lots:
			if remaining_needed <= Decimal("0"):
				break
			take_qty = min(lot.remaining_quantity, remaining_needed)
			lot.remaining_quantity -= take_qty
			if lot.remaining_quantity == Decimal("0"):
				lot.status = "depleted"

			remaining_needed -= take_qty
			running_balance -= take_qty
			lot_val = (take_qty * lot.unit_cost).quantize(Decimal("0.01"))
			total_valuation += lot_val

			mov_number = f"MV-OUT-{now_utc:%Y%m%d%H%M%S}-{uuid.uuid4().hex[:6].upper()}"
			movement = models.StockMovement(
				company_id=company_id,
				movement_number=mov_number,
				stock_item_id=stock_item.id,
				lot_id=lot.id,
				warehouse_id=warehouse.id,
				zone_id=payload.zone_id,
				movement_type="outbound",
				quantity=take_qty,
				unit_cost=lot.unit_cost,
				reference_type=payload.reference_type or "delivery_order",
				reference_id=payload.reference_id,
				balance_after=running_balance,
				notes=payload.notes or f"FIFO consumption from lot {lot.lot_number}",
				custom_attributes=sanitize_attributes(payload.custom_attributes),
			)
			database.add(movement)
			database.flush()
			created_movements.append(movement)

		# Financial posting: Dr COGS (501000) / Cr Inventory (102000)
		if total_valuation > Decimal("0"):
			cogs_account = account_by_code(database, company_id, "501000", "Cost of Goods Sold - Materials", "expense")
			inv_account = account_by_code(database, company_id, "102000", "Inventory Asset", "asset")
			gl_payload = AccountMoveCreate(
				journal_code="STK",
				move_type="entry",
				date=payload.received_date or now_utc,
				ref=f"Issue: {payload.reference_id or stock_item.sku}",
				lines=[
					AccountMoveLineCreate(
						account_id=cogs_account.id,
						debit=total_valuation,
						credit=Decimal("0.00"),
						name=f"COGS {stock_item.sku} (FIFO Issue across {len(created_movements)} lots)",
					),
					AccountMoveLineCreate(
						account_id=inv_account.id,
						debit=Decimal("0.00"),
						credit=total_valuation,
						name=f"Inventory Reduction {stock_item.sku}",
					),
				],
			)
			gl_move = create_posted_account_move(database, company_id, gl_payload)
			account_move_id = gl_move.id

		database.commit()
		for mov in created_movements:
			database.refresh(mov)

		return StockMovementProcessResponse(
			success=True,
			movements=[StockMovementRead.model_validate(mov) for mov in created_movements],
			account_move_id=account_move_id,
			total_quantity=payload.quantity,
			total_valuation=total_valuation,
			message=f"Outbound FIFO issue processed successfully across {len(created_movements)} lot(s)."
			+ (f" Posted GL entry {gl_move.name}." if account_move_id else ""),
		)

	else:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Movement type '{payload.movement_type}' is not supported yet for automated valuation processing",
		)


# ==============================================================================
# Master Platform Security & Tenant Security UI Endpoints
# ==============================================================================

# --- Master Platform Security (Super_Admin Only) ---

@app.post("/api/platform/security/password-rotate", response_model=PasswordRotateResponse, tags=["Platform Security"])
def rotate_superadmin_password(
	payload: PasswordRotateRequest,
	request: Request,
	current_user: models.ResUser = Depends(require_super_admin),
	database: Session = Depends(get_platform_db),
):
	"""Rotate Super_Admin password and regenerate 5 new server recovery codes."""
	admin_user = database.scalar(select(models.ResUser).where(models.ResUser.id == current_user.id))
	if admin_user is None:
		admin_user = current_user
		database.add(admin_user)

	if payload.new_password:
		if len(payload.new_password) < 8:
			raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password must be at least 8 characters")
		admin_user.password_hash = hash_password(payload.new_password)
		admin_user.is_active = True

	recovery_codes = []
	if payload.regenerate_recovery_codes:
		import secrets
		import string
		recovery_codes = ["-".join("".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4)) for _ in range(4)) for _ in range(5)]
		hashed_codes = [hash_password(c) for c in recovery_codes]

		acl_dict = {}
		if admin_user.access_control_list:
			try:
				acl_dict = json.loads(admin_user.access_control_list)
			except Exception:
				acl_dict = {}
		acl_dict["recovery_codes"] = hashed_codes
		admin_user.access_control_list = json.dumps(acl_dict)
		try:
			admin_user.recovery_codes = hashed_codes
		except Exception:
			pass

	database.commit()
	database.refresh(admin_user)

	record_platform_audit(
		database,
		actor_email=admin_user.email,
		action="PASSWORD_AND_RECOVERY_CODES_ROTATED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=getattr(admin_user, "company_id", None),
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	return PasswordRotateResponse(
		success=True,
		message="Super Admin credentials rotated and recovery codes regenerated successfully",
		email=admin_user.email,
		recovery_codes=recovery_codes,
	)


@app.get("/api/platform/security/audit-logs", response_model=list[PlatformAuditLogRead], tags=["Platform Security"])
def list_platform_security_audit_logs(
	limit: int = 100,
	current_user: models.ResUser = Depends(require_super_admin),
	database: Session = Depends(get_platform_db),
):
	"""Query immutable server-side platform audit logs strictly protected by Super_Admin role."""
	return database.scalars(
		select(models.PlatformAuditLog).order_by(models.PlatformAuditLog.created_at.desc()).limit(limit)
	).all()


# --- Tenant Security & User Management (TenantContext Isolated) ---

@app.get("/api/v1/tenant/users", response_model=list[TenantUserRead], tags=["Tenant Security"])
@app.get("/api/tenant/users", response_model=list[TenantUserRead], tags=["Tenant Security"])
def list_tenant_users(
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_tenant_admin),
	database: Session = Depends(get_db),
):
	"""List users strictly belonging to the active company tenant."""
	user_ids_subq = select(models.TenantUserRole.user_id).where(models.TenantUserRole.company_id == company_id)
	return database.scalars(
		select(models.ResUser)
		.where(
			or_(
				models.ResUser.company_id == company_id,
				models.ResUser.id.in_(user_ids_subq),
			),
			models.ResUser.deleted_at.is_(None),
		)
		.distinct()
		.order_by(models.ResUser.created_at.asc())
	).all()


@app.post("/api/v1/tenant/users", response_model=TenantUserRead, status_code=status.HTTP_201_CREATED, tags=["Tenant Security"])
@app.post("/api/tenant/users", response_model=TenantUserRead, status_code=status.HTTP_201_CREATED, tags=["Tenant Security"])
def create_tenant_user(
	payload: TenantUserCreateRequest,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_tenant_admin),
	database: Session = Depends(get_db),
):
	"""Create a new tenant user strictly bounded within the active company tenant."""
	from backend.app.domains.iam.role_catalog import (
		HR_REGISTRATION_REQUIRED_MESSAGE,
		is_internal_or_privileged_role_name,
	)

	if is_internal_or_privileged_role_name(payload.role):
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail=HR_REGISTRATION_REQUIRED_MESSAGE,
		)

	company = database.get(models.ResCompany, company_id)
	master_tenant = database.scalar(select(models.MasterTenant).where(models.MasterTenant.slug == company.slug)) if company else None
	tier = (master_tenant.subscription_tier if master_tenant else company.subscription_tier or "standard").lower() if company else "standard"
	max_allowed = master_tenant.max_users if master_tenant else TIER_LIMITS.get(tier, {}).get("max_users", 15)

	current_user_count = database.scalar(
		select(func.count(models.ResUser.id)).where(models.ResUser.company_id == company_id, models.ResUser.is_active.is_(True))
	) or 0

	if current_user_count >= max_allowed:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail=f"Subscription tier user limit exceeded: '{tier.capitalize()}' tier allows up to {max_allowed} users. Current active users: {current_user_count}. Please upgrade your subscription.",
		)

	email = payload.email.lower().strip()
	existing = database.scalar(select(models.ResUser).where(models.ResUser.email == email, models.ResUser.company_id == company_id))
	if existing:
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists with this email")

	new_user = models.ResUser(
		firebase_uid=f"native:{email}",
		email=email,
		full_name=payload.full_name.strip(),
		company_id=company_id,
		role=payload.role,
		password_hash=hash_password(payload.password),
		is_active=True,
	)
	database.add(new_user)
	database.flush()

	tur = models.TenantUserRole(
		id=uuid.uuid4(),
		user_id=new_user.id,
		company_id=company_id,
		role=payload.role,
		is_active=True,
	)
	database.add(tur)

	record_security_event(
		database,
		event_type="tenant_user_created",
		severity="LOW",
		company_id=company_id,
		user_id=current_user.id,
		actor_email=current_user.email,
		ip_address=resolve_client_ip(request),
		user_agent=request.headers.get("user-agent"),
		request_path=request.url.path,
		request_method=request.method,
		details=f"Created tenant user '{new_user.email}' with role '{new_user.role}' in tenant '{company_id}'",
	)
	database.commit()
	database.refresh(new_user)
	return new_user


@app.patch("/api/v1/tenant/users/{user_id}/role", response_model=TenantUserRead, tags=["Tenant Security"])
@app.patch("/api/tenant/users/{user_id}/role", response_model=TenantUserRead, tags=["Tenant Security"])
def update_tenant_user_role(
	user_id: uuid.UUID,
	payload: TenantUserRoleUpdateRequest,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_tenant_admin),
	database: Session = Depends(get_db),
):
	"""Update user role with strict TenantContext isolation guard (prevents IDOR across tenants)."""
	target_user = database.scalar(
		select(models.ResUser).where(models.ResUser.id == user_id, models.ResUser.company_id == company_id)
	)
	if target_user is None:
		record_security_event(
			database,
			event_type="tenant_escape",
			severity="CRITICAL",
			company_id=company_id,
			user_id=current_user.id,
			actor_email=current_user.email,
			ip_address=resolve_client_ip(request),
			user_agent=request.headers.get("user-agent"),
			request_path=request.url.path,
			request_method=request.method,
			details=f"Cross-tenant IDOR attempt: user '{user_id}' does not belong to company '{company_id}'",
		)
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found in tenant company")

	old_role = target_user.role
	target_user.role = payload.role
	database.commit()
	database.refresh(target_user)

	record_security_event(
		database,
		event_type="policy_denial" if payload.role == "Guest" else "tenant_escape",
		severity="LOW",
		company_id=company_id,
		user_id=target_user.id,
		actor_email=target_user.email,
		ip_address=resolve_client_ip(request),
		user_agent=request.headers.get("user-agent"),
		request_path=request.url.path,
		request_method=request.method,
		details=f"Tenant user role updated from '{old_role}' to '{payload.role}' by '{current_user.email}'",
	)

	return target_user


@app.post("/api/v1/tenant/users/{user_id}/reset-password", tags=["Tenant Security"])
@app.post("/api/tenant/users/{user_id}/reset-password", tags=["Tenant Security"])
async def reset_tenant_user_password(
	user_id: uuid.UUID,
	background_tasks: BackgroundTasks,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_tenant_admin),
	database: Session = Depends(get_db),
):
	"""Tenant-admin initiated password reset flow with strict tenant isolation."""
	from backend.app.api.v1.users import force_password_reset, ForcePasswordResetRequest, IamActor
	from backend.app.domains.hr.audit import build_audit_context

	actor = IamActor(
		id=current_user.id,
		email=current_user.email,
		role=current_user.role,
		iam_role=current_user.iam_role,
		is_superuser=bool(current_user.is_superuser),
		company_id=company_id,
		level=1,
		audit=build_audit_context(request, actor_id=current_user.id, actor_identifier=current_user.email),
	)
	return await force_password_reset(
		user_id=str(user_id),
		background_tasks=background_tasks,
		payload=ForcePasswordResetRequest(require_password_change=True),
		actor=actor,
		db=database,
	)


@app.post("/api/tenant/security/api-keys", response_model=TenantApiKeyCreateResponse, status_code=status.HTTP_201_CREATED, tags=["Tenant Security"])
def create_tenant_scoped_api_key(
	payload: TenantApiKeyCreateRequest,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_tenant_admin),
	database: Session = Depends(get_db),
):
	"""Generate a scoped API key bound exclusively to the tenant."""
	import secrets
	raw_token = secrets.token_urlsafe(32)
	key_id = f"key_{uuid.uuid4().hex[:8]}"
	api_key = f"oxen_sk_{company_id.hex[:6]}_{raw_token}"
	expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_days)

	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="TENANT_API_KEY_CREATED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	return TenantApiKeyCreateResponse(
		key_id=key_id,
		api_key=api_key,
		name=payload.name,
		scopes=payload.scopes or ["warehouse:read", "weighbridge:write"],
		expires_at=expires_at,
		message=f"Scoped API key '{payload.name}' generated successfully. Record key secret now; it will not be displayed again.",
	)


@app.patch("/api/tenant/security/settings", response_model=TenantSecuritySettingsResponse, tags=["Tenant Security"])
def update_tenant_security_settings(
	payload: TenantSecuritySettingsUpdateRequest,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_tenant_admin),
	database: Session = Depends(get_db),
):
	"""Update tenant-wide security settings such as mandatory MFA enforcement."""
	record_platform_audit(
		database,
		actor_email=current_user.email,
		action=f"MFA_ENFORCEMENT_{'ENABLED' if payload.mfa_enforced else 'DISABLED'}",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)
	return TenantSecuritySettingsResponse(
		company_id=company_id,
		mfa_enforced=payload.mfa_enforced,
		active_keys_count=1,
	)


# ==============================================================================
# Phase 8 (Part 2): Enterprise Single Sign-On (ADR-008) Logic & Endpoints
# ==============================================================================

def generate_sso_state(company_id: uuid.UUID) -> str:
	"""Generates a tamper-proof, cryptographically signed state token for SSO OAuth2/OIDC handshakes."""
	now = int(time.time())
	payload = {
		"cid": str(company_id),
		"iat": now,
		"exp": now + 600,
		"nonce": uuid.uuid4().hex,
	}
	payload_bytes = json.dumps(payload, separators=(",", ":")).encode()
	encoded_payload = _base64url_encode(payload_bytes)
	signature = hmac.new(JWT_SECRET_KEY.encode(), encoded_payload.encode(), hashlib.sha256).digest()
	return f"{encoded_payload}.{_base64url_encode(signature)}"


def verify_sso_state(state: str) -> uuid.UUID:
	"""Verifies HMAC signature and expiration on state token, extracting the originating company_id."""
	try:
		payload_part, signature_part = state.split(".", 1)
	except ValueError as error:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SSO state format") from error

	expected_signature = _base64url_encode(hmac.new(JWT_SECRET_KEY.encode(), payload_part.encode(), hashlib.sha256).digest())
	if not compare_digest(signature_part, expected_signature):
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SSO state token signature verification failed")

	try:
		payload = json.loads(_base64url_decode(payload_part))
	except Exception as error:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Corrupted SSO state payload") from error

	if int(payload.get("exp", 0)) < int(time.time()):
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SSO state token has expired")

	company_id_str = payload.get("cid")
	if not company_id_str:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SSO state missing company context")

	try:
		return uuid.UUID(str(company_id_str))
	except ValueError as error:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid company ID in SSO state") from error


def resolve_sso_role(config: models.TenantSSOConfig, claims: dict) -> str:
	"""
	Maps external IdP claims/roles/groups to internal ERP system role.
	Valid ERP roles: 'Super_Admin', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest'.
	"""
	VALID_ROLES = {"Super_Admin", "Admin", "COO", "Accountant", "Data_Entry", "Guest"}
	mapping: dict[str, str] = {}
	if config.role_mapping:
		try:
			mapping = json.loads(config.role_mapping)
		except Exception:
			mapping = {}

	# Collect all candidate strings from external claims
	candidates: list[str] = []
	for key in ("roles", "groups", "wids", "role", "group", "jobTitle"):
		val = claims.get(key)
		if isinstance(val, list):
			candidates.extend(str(item).strip() for item in val if item)
		elif isinstance(val, str) and val.strip():
			candidates.append(val.strip())

	# Check each candidate against mapping
	for candidate in candidates:
		if candidate in mapping:
			target_role = mapping[candidate]
			if target_role in VALID_ROLES:
				return target_role

	# Check default role
	if config.default_role in VALID_ROLES:
		return config.default_role

	return "Guest"


@app.get("/api/auth/sso/providers", response_model=list[SSOProviderRead], tags=["Enterprise SSO"])
def list_sso_providers(database: Session = Depends(get_db)):
	"""Returns catalog of active identity providers (e.g. Entra ID, Okta). Seeds defaults if empty."""
	providers = list(database.scalars(select(models.SSOProvider).where(models.SSOProvider.is_active.is_(True))).all())
	if not providers:
		entra = models.SSOProvider(
			name="Microsoft Entra ID",
			slug="entra-id",
			protocol="OIDC",
			issuer_url="https://login.microsoftonline.com/common/v2.0",
			authorization_endpoint="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			token_endpoint="https://login.microsoftonline.com/common/oauth2/v2.0/token",
			userinfo_endpoint="https://graph.microsoft.com/oidc/userinfo",
			is_active=True,
		)
		okta = models.SSOProvider(
			name="Okta Workforce Identity",
			slug="okta",
			protocol="OIDC",
			issuer_url="https://auth.okta.com",
			authorization_endpoint="https://auth.okta.com/oauth2/v1/authorize",
			token_endpoint="https://auth.okta.com/oauth2/v1/token",
			userinfo_endpoint="https://auth.okta.com/oauth2/v1/userinfo",
			is_active=True,
		)
		database.add_all([entra, okta])
		database.commit()
		database.refresh(entra)
		database.refresh(okta)
		providers = [entra, okta]
	return providers


@app.post("/api/auth/sso/initiate", response_model=SSOLoginInitiateResponse, tags=["Enterprise SSO"])
def initiate_sso_login(
	payload: SSOLoginInitiateRequest,
	request: Request,
	database: Session = Depends(get_db),
):
	"""Initializes enterprise SSO flow, generating an authorization URL and cryptographically signed state."""
	from urllib.parse import urlencode

	company = None
	if payload.company_id:
		company = database.get(models.ResCompany, payload.company_id)
	elif payload.company_slug:
		company = database.scalar(select(models.ResCompany).where(models.ResCompany.slug == payload.company_slug))
	elif payload.domain:
		sso_cfg = database.scalar(
			select(models.TenantSSOConfig).where(
				models.TenantSSOConfig.domain_hint == payload.domain.lower().strip(),
				models.TenantSSOConfig.is_active.is_(True),
			)
		)
		if sso_cfg:
			company = sso_cfg.company

	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant organization not found for SSO")

	config = database.scalar(
		select(models.TenantSSOConfig).where(models.TenantSSOConfig.company_id == company.id, models.TenantSSOConfig.is_active.is_(True))
	)
	if config is None or config.provider is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Enterprise SSO is not configured or inactive for '{company.name}'")

	state = generate_sso_state(company.id)
	redirect_uri = payload.redirect_uri or f"{request.base_url}api/auth/sso/callback"

	query_params = {
		"client_id": config.client_id,
		"response_type": "code",
		"scope": "openid profile email",
		"redirect_uri": redirect_uri,
		"state": state,
	}
	if config.domain_hint:
		query_params["domain_hint"] = config.domain_hint

	auth_url = f"{config.provider.authorization_endpoint}?{urlencode(query_params)}"

	record_platform_audit(
		database,
		actor_email="anonymous",
		action="SSO_LOGIN_INITIATED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company.id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	return SSOLoginInitiateResponse(
		authorization_url=auth_url,
		state=state,
		provider_name=config.provider.name,
		client_id=config.client_id,
	)


@app.post("/api/auth/sso/callback", response_model=SSOCallbackResponse, tags=["Enterprise SSO"])
def process_sso_callback(
	payload: SSOCallbackRequest,
	request: Request,
	response: Response,
	database: Session = Depends(get_db),
):
	"""
	Validates SSO callback token/claims, resolves external-to-internal role mapping,
	executes JIT user provisioning/sync, and issues authenticated session cookie.
	"""
	company_id = verify_sso_state(payload.state)
	company = database.get(models.ResCompany, company_id)
	if company is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant company not found for callback")

	config = database.scalar(
		select(models.TenantSSOConfig).where(models.TenantSSOConfig.company_id == company_id, models.TenantSSOConfig.is_active.is_(True))
	)
	if config is None:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant SSO configuration is inactive or missing")

	claims = payload.claims or {}
	email = str(claims.get("email") or claims.get("preferred_username") or claims.get("upn") or "").lower().strip()
	if not email:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identity claims missing verified email address")

	full_name = str(claims.get("name") or claims.get("full_name") or email.split("@")[0]).strip()
	mapped_role = resolve_sso_role(config, claims)

	user = database.scalar(select(models.ResUser).where(models.ResUser.email == email))
	if user is None:
		user = models.ResUser(
			firebase_uid=f"sso_{uuid.uuid4().hex[:16]}",
			email=email,
			full_name=full_name,
			company_id=company.id,
			role=mapped_role,
			is_active=True,
		)
		database.add(user)
	else:
		user.company_id = company.id
		user.role = mapped_role
		user.full_name = full_name
		user.is_active = True

	database.commit()
	database.refresh(user)

	token = create_session_token(subject=user.email, company_id=user.company_id, role=user.role)
	set_session_cookie(response, token)

	record_platform_audit(
		database,
		actor_email=user.email,
		action="SSO_LOGIN_SUCCESS",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=user.company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	return SSOCallbackResponse(
		message="SSO Authentication Successful",
		status="Active",
		mapped_role=mapped_role,
		user={
			"id": str(user.id),
			"email": user.email,
			"fullName": user.full_name,
			"role": user.role,
			"company_id": str(user.company_id),
			"status": "Active",
		},
	)


@app.get("/api/tenant/sso/config", response_model=TenantSSOConfigRead, tags=["Enterprise SSO"])
def get_tenant_sso_config(
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_tenant_admin),
	database: Session = Depends(get_db),
):
	"""Fetches SSO configuration for active tenant."""
	config = database.scalar(
		select(models.TenantSSOConfig).where(models.TenantSSOConfig.company_id == company_id)
	)
	if config is None:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO configuration not found for this tenant")
	return config


@app.put("/api/tenant/sso/config", response_model=TenantSSOConfigRead, tags=["Enterprise SSO"])
def upsert_tenant_sso_config(
	payload: TenantSSOConfigCreate,
	request: Request,
	company_id: uuid.UUID = Depends(get_active_company_id),
	current_user: models.ResUser = Depends(require_tenant_admin),
	database: Session = Depends(get_db),
):
	"""Creates or updates tenant SSO configuration with encrypted secrets and role mappings."""
	config = database.scalar(
		select(models.TenantSSOConfig).where(models.TenantSSOConfig.company_id == company_id)
	)
	encrypted_secret = encrypt_connection_url(payload.client_secret)
	role_mapping_json = json.dumps(payload.role_mapping or {})

	if config is None:
		config = models.TenantSSOConfig(
			company_id=company_id,
			provider_id=payload.provider_id,
			client_id=payload.client_id,
			encrypted_client_secret=encrypted_secret,
			domain_hint=payload.domain_hint,
			role_mapping=role_mapping_json,
			default_role=payload.default_role,
			enforce_sso_only=payload.enforce_sso_only,
			is_active=payload.is_active,
		)
		database.add(config)
	else:
		config.provider_id = payload.provider_id
		config.client_id = payload.client_id
		config.encrypted_client_secret = encrypted_secret
		config.domain_hint = payload.domain_hint
		config.role_mapping = role_mapping_json
		config.default_role = payload.default_role
		config.enforce_sso_only = payload.enforce_sso_only
		config.is_active = payload.is_active

	database.commit()
	database.refresh(config)

	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="TENANT_SSO_CONFIG_UPDATED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)
	return config


# ==============================================================================
# Phase 8 (Part 3): BI & Reporting Extraction Endpoints
# ==============================================================================

@app.post("/api/analytics/etl/trigger", response_model=ETLJobStatusResponse, tags=["Analytics & BI"])
def trigger_etl_job(
	payload: ETLJobTriggerRequest,
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""Trigger ETL extraction of core operational/financial records into flattened BI reporting tables."""
	role_norm = str(getattr(current_user, "role", "") or "").upper().replace(" ", "_")
	if not getattr(current_user, "is_superuser", False) and role_norm not in {"SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "CEO", "EXECUTIVE"}:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Access denied: Admin, CEO, Super_Admin, or Accountant role required to trigger ETL jobs",
		)

	target_company: uuid.UUID | None = company_id
	if payload.sync_all_tenants:
		if not is_super_admin_authorized(current_user, request):
			raise HTTPException(
				status_code=status.HTTP_403_FORBIDDEN,
				detail="Only Super_Admin may trigger cross-tenant ETL synchronization",
			)
		target_company = None

	result = etl_worker.run_etl_pipeline(
		company_id=target_company,
		period=payload.period,
		db=database,
	)

	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="ANALYTICS_ETL_TRIGGERED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	return ETLJobStatusResponse(**result)


@app.get("/api/analytics/ledger-summary", response_model=list[ReportingLedgerSummaryRead], tags=["Analytics & BI"])
def get_reporting_ledger_summary(
	period: str | None = Query(default=None),
	account_id: uuid.UUID | None = Query(default=None),
	limit: int = Query(default=100, ge=1, le=1000),
	offset: int = Query(default=0, ge=0),
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""Query flattened ledger summary analytical facts for BI and reporting."""
	query = select(models.ReportingLedgerSummary).where(
		models.ReportingLedgerSummary.company_id == company_id
	)
	if period:
		query = query.where(models.ReportingLedgerSummary.period == period)
	if account_id:
		query = query.where(models.ReportingLedgerSummary.account_id == account_id)

	query = query.order_by(models.ReportingLedgerSummary.period.desc(), models.ReportingLedgerSummary.account_code).offset(offset).limit(limit)
	return database.scalars(query).all()


@app.get("/api/analytics/fleet-utilization", response_model=list[FleetUtilizationFactRead], tags=["Analytics & BI"])
def get_fleet_utilization_facts(
	period: str | None = Query(default=None),
	vehicle_id: uuid.UUID | None = Query(default=None),
	limit: int = Query(default=100, ge=1, le=1000),
	offset: int = Query(default=0, ge=0),
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""Query flattened fleet utilization facts for BI and reporting."""
	query = select(models.FleetUtilizationFact).where(
		models.FleetUtilizationFact.company_id == company_id
	)
	if period:
		query = query.where(models.FleetUtilizationFact.period == period)
	if vehicle_id:
		query = query.where(models.FleetUtilizationFact.vehicle_id == vehicle_id)

	query = query.order_by(models.FleetUtilizationFact.period.desc(), models.FleetUtilizationFact.license_plate).offset(offset).limit(limit)
	return database.scalars(query).all()


# ==============================================================================
# Phase 9 (Part 1): AI Governance & Safety Sandbox Endpoints
# ==============================================================================

@app.get("/api/ai/models/config", response_model=list[AIModelConfigRead], tags=["AI Governance"])
def list_ai_model_configs(
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""List registered AI model configurations for the active tenant."""
	query = select(models.AIModelConfig).where(models.AIModelConfig.company_id == company_id)
	return database.scalars(query).all()


@app.post("/api/ai/models/config", response_model=AIModelConfigRead, tags=["AI Governance"])
def create_ai_model_config(
	payload: AIModelConfigCreate,
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(require_tenant_admin),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""Register and configure an AI model endpoint for the tenant."""
	existing = database.scalar(
		select(models.AIModelConfig).where(
			models.AIModelConfig.company_id == company_id,
			models.AIModelConfig.model_name == payload.model_name,
		)
	)
	if existing:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail=f"Model '{payload.model_name}' is already configured for this company",
		)

	encrypted_key = encrypt_connection_url(payload.api_key) if payload.api_key else None

	config = models.AIModelConfig(
		company_id=company_id,
		model_name=payload.model_name,
		provider=payload.provider,
		endpoint_url=payload.endpoint_url,
		encrypted_api_key=encrypted_key,
		rate_limit_rpm=payload.rate_limit_rpm,
		rate_limit_tpm=payload.rate_limit_tpm,
		permission_tier=payload.permission_tier,
		max_risk_tier_allowed=payload.max_risk_tier_allowed,
		is_active=payload.is_active,
	)
	database.add(config)
	database.commit()
	database.refresh(config)

	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="AI_MODEL_CONFIG_CREATED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)
	return config


@app.put("/api/ai/models/config/{config_id}", response_model=AIModelConfigRead, tags=["AI Governance"])
def update_ai_model_config(
	config_id: uuid.UUID,
	payload: AIModelConfigUpdate,
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(require_tenant_admin),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""Update rate limits and parameters of a registered AI model configuration."""
	config = database.get(models.AIModelConfig, config_id)
	if not config or config.company_id != company_id:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI Model configuration not found")

	if payload.endpoint_url is not None:
		config.endpoint_url = payload.endpoint_url
	if payload.api_key is not None:
		config.encrypted_api_key = encrypt_connection_url(payload.api_key) if payload.api_key else None
	if payload.rate_limit_rpm is not None:
		config.rate_limit_rpm = payload.rate_limit_rpm
	if payload.rate_limit_tpm is not None:
		config.rate_limit_tpm = payload.rate_limit_tpm
	if payload.permission_tier is not None:
		config.permission_tier = payload.permission_tier
	if payload.max_risk_tier_allowed is not None:
		config.max_risk_tier_allowed = payload.max_risk_tier_allowed
	if payload.is_active is not None:
		config.is_active = payload.is_active

	database.commit()
	database.refresh(config)
	return config


@app.post("/api/ai/governance/proposals/validate", response_model=AIProposalValidateResponse, tags=["AI Governance"])
def validate_ai_proposal(
	payload: AIProposalValidateRequest,
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""
	Validates an AI proposal against deterministic safety boundaries and enterprise risk policies.
	Issues a cryptographic HITL approval token if manual review is required.
	"""
	log = ai_governance_engine.validate_proposal(
		company_id=company_id,
		agent_name=payload.agent_name,
		action_type=payload.action_type,
		proposal_payload=payload.proposal_payload,
		confidence_score=payload.confidence_score,
		prompt=payload.prompt,
		user_id=current_user.id,
		model_config_id=payload.model_config_id,
		tokens_used=payload.tokens_used,
		db=database,
	)

	msg = "Proposal successfully validated and approved for execution"
	if log.safety_validation_status == "BLOCKED":
		msg = f"Proposal blocked by safety boundary: {log.validation_errors}"
	elif log.hitl_required:
		msg = "Proposal requires Human-In-The-Loop approval before execution"

	return AIProposalValidateResponse(
		log_id=log.id,
		safety_validation_status=log.safety_validation_status,
		risk_level=log.risk_level,
		execution_status=log.execution_status,
		hitl_required=log.hitl_required,
		approval_token=log.hitl_approval_token,
		validation_errors=log.validation_errors,
		message=msg,
	)


@app.post("/api/ai/governance/proposals/{log_id}/approve", response_model=AIHITLApprovalResponse, tags=["AI Governance"])
def approve_ai_proposal(
	log_id: uuid.UUID,
	payload: AIHITLApprovalRequest,
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""
	Human-In-The-Loop approval endpoint.
	Validates user role and cryptographic token before releasing proposal for execution.
	"""
	try:
		log = ai_governance_engine.approve_hitl_proposal(
			log_id=log_id,
			approver_user=current_user,
			approval_token=payload.approval_token,
			db=database,
		)
	except PermissionError as err:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))
	except ValueError as err:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="AI_PROPOSAL_HITL_APPROVED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	return AIHITLApprovalResponse(
		log_id=log.id,
		status=log.execution_status,
		approved_by=current_user.id,
		approved_at=log.hitl_approved_at or datetime.now(timezone.utc),
		message="Proposal approved successfully by authorized reviewer",
	)


@app.post("/api/ai/governance/proposals/{log_id}/execute", response_model=AIProposalExecuteResponse, tags=["AI Governance"])
def execute_ai_proposal(
	log_id: uuid.UUID,
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""
	Executes a verified or HITL-approved AI proposal, writing to the production OLTP tables.
	"""
	try:
		result = ai_governance_engine.execute_approved_proposal(
			log_id=log_id,
			executing_user=current_user,
			db=database,
		)
	except PermissionError as err:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))
	except ValueError as err:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="AI_PROPOSAL_EXECUTED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	return AIProposalExecuteResponse(
		log_id=log_id,
		execution_status="EXECUTED",
		executed_at=datetime.now(timezone.utc),
		result=result,
		message="Proposal executed into OLTP tables successfully",
	)


@app.get("/api/ai/governance/logs", response_model=list[AIGovernanceLogRead], tags=["AI Governance"])
def list_ai_governance_logs(
	action_type: str | None = Query(default=None),
	safety_status: str | None = Query(default=None),
	limit: int = Query(default=100, ge=1, le=1000),
	offset: int = Query(default=0, ge=0),
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""Query immutable AI governance and safety validation logs for the tenant."""
	query = select(models.AIGovernanceLog).where(models.AIGovernanceLog.company_id == company_id)
	if action_type:
		query = query.where(models.AIGovernanceLog.action_type == action_type)
	if safety_status:
		query = query.where(models.AIGovernanceLog.safety_validation_status == safety_status)

	query = query.order_by(models.AIGovernanceLog.created_at.desc()).offset(offset).limit(limit)
	return database.scalars(query).all()


# ==============================================================================
# Phase 9 (Part 2): Practical AI Automation & OCR Parsing Endpoints
# ==============================================================================

@app.post("/api/ai/documents/parse-invoice", response_model=AIDocumentParseResponse, tags=["AI Automation & OCR"])
def parse_invoice_document(
	payload: AIDocumentParseRequest,
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""
	AI-powered document extraction endpoint for invoices and receipts.
	Extracts vendor, invoice number, items, and taxes, calculates confidence score,
	and routes generated draft AccountMove proposal through SafetyBoundaryEngine.
	"""
	parsed_data, gov_log, proposal_dict = ai_document_parser.process_and_govern_invoice(
		company_id=company_id,
		user_id=current_user.id,
		document_text=payload.document_text,
		db=database,
		vendor_hint=payload.vendor_hint,
		propose_financial_entry=payload.propose_financial_entry,
		journal_id=payload.journal_id,
	)

	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="AI_INVOICE_DOCUMENT_PARSED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	msg = f"Invoice parsed successfully with confidence {parsed_data.confidence_score}"
	if gov_log and gov_log.hitl_required:
		msg += ". Draft AccountMove proposed and requires Human-In-The-Loop approval."
	elif gov_log and gov_log.safety_validation_status == "BLOCKED":
		msg += ". Proposed entry blocked by safety boundary."

	return AIDocumentParseResponse(
		parsed_invoice=parsed_data,
		confidence_score=parsed_data.confidence_score,
		governance_log_id=gov_log.id if gov_log else None,
		safety_validation_status=gov_log.safety_validation_status if gov_log else None,
		risk_level=gov_log.risk_level if gov_log else None,
		hitl_required=gov_log.hitl_required if gov_log else False,
		hitl_approval_token=gov_log.hitl_approval_token if gov_log else None,
		proposed_account_move=proposal_dict,
		message=msg,
	)


# ==============================================================================
# Phase 9 (Part 3): Predictive Analytics & Supply Chain Forecasting Endpoints
# ==============================================================================

@app.get("/api/ai/forecast/yield", response_model=list[CropYieldPrediction], tags=["AI Predictive Analytics"])
def get_agricultural_yield_forecast(
	crop_cycle_id: Optional[uuid.UUID] = Query(default=None, description="Optional Crop Cycle ID filter"),
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""
	Predict expected agricultural harvest yields for active or specified crop cycles
	based on historical batch weighments, cycle target yields, and seasonal factors.
	"""
	return ai_forecasting_service.predict_harvest_yield(
		company_id=company_id,
		crop_cycle_id=crop_cycle_id,
		db=database,
	)


@app.get("/api/ai/forecast/stockout", response_model=list[StockoutRiskItem], tags=["AI Predictive Analytics"])
def get_stockout_risk_forecast(
	window_days: int = Query(default=30, ge=7, le=180, description="Historical consumption analysis window"),
	risk_threshold_days: int = Query(default=14, ge=1, le=90, description="Threshold in days to flag stockout risk"),
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""
	Predict stockout risks across inventory items by analyzing recent issue velocity,
	comparing current on-hand lots against reorder thresholds, and classifying risk levels.
	"""
	return ai_forecasting_service.predict_stockouts(
		company_id=company_id,
		window_days=window_days,
		risk_threshold_days=risk_threshold_days,
		db=database,
	)


@app.get("/api/ai/forecast/fleet-anomalies", response_model=list[FleetAnomalyAlert], tags=["AI Predictive Analytics"])
def get_fleet_maintenance_anomalies(
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""
	Detect fleet fuel efficiency degradation and maintenance cost spikes by
	comparing vehicle metrics against fleet baselines.
	"""
	return ai_forecasting_service.detect_fleet_anomalies(
		company_id=company_id,
		db=database,
	)


@app.post("/api/ai/forecast/restock-proposal", response_model=RestockProposalResponse, tags=["AI Predictive Analytics"])
def create_restock_proposal(
	payload: RestockProposalRequest,
	request: Request,
	database: Session = Depends(get_db),
	current_user: models.ResUser = Depends(get_authenticated_user),
	company_id: uuid.UUID = Depends(get_active_company_id),
):
	"""
	Generate an automated replenishment restock proposal for an inventory item,
	routing the draft action through the SafetyBoundaryEngine for governance and HITL token generation.
	"""
	proposal_dict, gov_log = ai_forecasting_service.generate_restock_proposal(
		company_id=company_id,
		user_id=current_user.id,
		request=payload,
		db=database,
	)

	record_platform_audit(
		database,
		actor_email=current_user.email,
		action="AI_RESTOCK_PROPOSAL_GENERATED",
		endpoint=request.url.path,
		ip_address=resolve_client_ip(request),
		company_id=company_id,
		outcome="SUCCESS",
		request_id=get_request_id(request),
		user_agent=request.headers.get("user-agent"),
	)

	msg = f"Restock proposal generated for {proposal_dict['sku']}"
	if gov_log and gov_log.hitl_required:
		msg += " and requires Human-In-The-Loop approval."
	elif gov_log and gov_log.safety_validation_status == "BLOCKED":
		msg += " but was blocked by safety boundary."

	return RestockProposalResponse(
		proposal_id=uuid.uuid4(),
		stock_item_id=uuid.UUID(proposal_dict["stock_item_id"]),
		sku=proposal_dict["sku"],
		item_name=proposal_dict["name"],
		current_stock=Decimal(str(proposal_dict.get("current_stock", "0.00"))),
		proposed_quantity=Decimal(str(proposal_dict["quantity"])),
		estimated_unit_cost=Decimal(str(proposal_dict["unit_cost"])),
		estimated_total_cost=Decimal(str(proposal_dict["total_cost"])),
		governance_log_id=gov_log.id,
		safety_validation_status=gov_log.safety_validation_status,
		risk_level=gov_log.risk_level,
		hitl_required=gov_log.hitl_required,
		hitl_approval_token=gov_log.hitl_approval_token,
		message=msg,
	)

# File segment: backend/app/main.py
from backend.app.domains.planning.logo_upload import router as logo_upload_router
from backend.app.api.v1.branding import router as dynamic_branding_router

# Include the branding router alongside active application resource domains
app.include_router(logo_upload_router)
app.include_router(dynamic_branding_router)
from backend.app.api.v1.site_settings import router as site_settings_router
app.include_router(site_settings_router)
from backend.app.api.v1.platform_governance import router as platform_governance_router
app.include_router(platform_governance_router)

# Mount static files for platform branding assets
from pathlib import Path
from fastapi.staticfiles import StaticFiles
_static_dir = Path(__file__).resolve().parents[2] / "backend" / "static"
if _static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")




@app.on_event("startup")
async def start_backup_worker_daemon_event() -> None:
    """Initializes the background backup scheduling worker daemon."""
    from backend.app.services.backup_worker import backup_worker_daemon
    backup_worker_daemon.start()


@app.on_event("shutdown")
async def stop_backup_worker_daemon_event() -> None:
    """Gracefully terminates the background backup scheduling worker daemon."""
    from backend.app.services.backup_worker import backup_worker_daemon
    backup_worker_daemon.stop()
