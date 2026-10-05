export interface ApiOperation {
  picking_id: string;
  picking_reference: string;
  partner_id: string | null;
  partner_name: string | null;
  product_id: string;
  product_name: string;
  source_location_id: string;
  source_location_name: string;
  dest_location_id: string;
  dest_location_name: string;
  ticket_id: string;
  ticket_number: string;
  truck_number: string;
  gross_weight: number;
  tare_weight: number;
  net_weight: number;
  uom?: string;
  unit_of_measure?: string;
  weighed_in_at: string;
  attachments?: any[];
  scale_ticket_attachment?: string;
  material_supplier_name?: string | null;
  service_supplier_name?: string | null;
  destination_customer_name?: string | null;
  loading_invoice_no?: string | null;
  receipt_invoice_no?: string | null;
  material_type?: string | null;
  qty_loaded?: number | null;
  qty_delivered?: number | null;
  qty_wastage?: number | null;
  wastage_percentage?: number | null;
  sales_amount?: number | null;
  vat_amount?: number | null;
  total_sales?: number | null;
  purchases_cost?: number | null;
  crusher_payment?: number | null;
  net_profit?: number | null;
  operation_month?: number | null;
  operation_year?: number | null;
  notes?: string | null;
  raw_legacy_data?: Record<string, any>;
}

export interface ApiCompany {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  commercial_registration: string | null;
  tax_id: string | null;
  currency: string;
  fiscal_calendar: string;
  fiscal_year_start_month: number;
  tax_regime: string;
  subscription_tier: 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
  license_key: string | null;
  license_expires_at: string | null;
  max_cost_centers: number;
  theme_mode: 'LIGHT' | 'DARK' | 'CUSTOM';
  ui_primary_color: string;
  ui_secondary_color: string;
  ui_logo_url: string | null;
}

export interface LicenseIssuePayload {
  company_id: string;
  subscription_tier: 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
  validity_days: number;
  theme_mode: 'LIGHT' | 'DARK' | 'CUSTOM';
  ui_primary_color: string;
  ui_secondary_color: string;
}

export interface IsolationAudit {
  isolated_tables: string[];
  total_isolated_tables: number;
  total_registered_tenants: number;
  backend_status: string;
  security_policy: string;
  checked_at: string;
}

export interface CompanyBrandingPayload {
  ui_logo_url?: string | null;
  ui_primary_color?: string;
  ui_secondary_color?: string;
  wallpaper_url?: string | null;
  background_url?: string | null;
}

export interface PlatformBrandingDto {
  platform_name: string;
  brand_name: string;
  default_logo: string;
  logo_url: string;
  default_favicon?: string;
  favicon_url?: string;
  primary_color: string;
  accent_color: string;
  company_name_ar?: string;
  company_name_en?: string;
  support_email?: string;
  support_phone?: string;
}

export interface TenantBrandingDto {
  id?: number;
  tenant_id: number | string;
  brand_name: string;
  logo_url: string;
  favicon_url?: string;
  primary_color: string;
  accent_color: string;
  custom_domain?: string;
  created_at?: string;
  updated_at?: string;
  // Phase 4: Tenant Custom Landing Engine (optional until persisted by backend)
  landing_hero_title?: string | null;
  landing_hero_subtitle?: string | null;
  landing_cta_label?: string | null;
  landing_cta_url?: string | null;
  landing_theme_mode?: 'light' | 'dark' | null;
}

export interface TenantBrandingPayload {
  brand_name?: string;
  logo_url?: string;
  favicon_url?: string;
  primary_color?: string;
  accent_color?: string;
  custom_domain?: string;
  landing_hero_title?: string | null;
  landing_hero_subtitle?: string | null;
  landing_cta_label?: string | null;
  landing_cta_url?: string | null;
  landing_theme_mode?: 'light' | 'dark' | null;
}

export interface PlatformBrandingPayload {
  platform_name?: string;
  brand_name?: string;
  default_logo?: string;
  logo_url?: string;
  default_favicon?: string;
  favicon_url?: string;
  primary_color?: string;
  accent_color?: string;
  company_name_ar?: string;
  company_name_en?: string;
  support_email?: string;
  support_phone?: string;
}


export interface SubscriptionPlanDto {
  id: string;
  name: 'FREE' | 'PROFESSIONAL' | 'ENTERPRISE' | string;
  display_name: string;
  monthly_price: number;
  annual_price: number;
  max_seats: number;
  max_vehicles: number;
  max_storage_gb: number;
  monthly_invoices_limit: number;
  allow_external_database: boolean;
  allow_custom_domain: boolean;
  allow_dedicated_ssl: boolean;
  description: string;
  features?: string[];
  currency?: string;
  max_monthly_transactions?: number;
  /** Marketing bullets shown on every pricing view. */
  display_features?: string[];
  is_featured?: boolean;
  sort_order?: number;
  is_active?: boolean;
  /** Super Admin endpoint only. */
  subscriber_count?: number;
  updated_at?: string | null;
}

/** Super Admin edit payload for PUT /api/v1/superadmin/billing/plans/{id} (prices are SAR strings). */
export interface SubscriptionPlanUpdatePayload {
  display_name?: string;
  description?: string;
  monthly_price?: string;
  annual_price?: string;
  display_features?: string[];
  is_featured?: boolean;
  is_active?: boolean;
  sort_order?: number;
  max_seats?: number;
  max_vehicles?: number;
  max_storage_gb?: number;
  max_monthly_transactions?: number;
}

export interface TenantSubscriptionDto {
  tenant_id: string;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  subscription_id: string;
  status: string;
  billing_cycle: 'monthly' | 'annual' | string;
  payment_method_type: string;
  plan: SubscriptionPlanDto;
  meters: {
    current_seats_used: number;
    max_seats: number;
    current_vehicles_used: number;
    max_vehicles: number;
    current_storage_mb_used: number;
    max_storage_gb: number;
  };
  entitlements: {
    allow_external_database: boolean;
    allow_custom_domain: boolean;
    allow_dedicated_ssl: boolean;
  };
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  cancel_at_period_end?: boolean;
}

export interface SaaSInvoiceDto {
  id: string;
  invoice_number: string;
  tenant_id: string;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  plan_id?: string | null;
  plan_name?: string | null;
  plan_display_name?: string | null;
  billing_cycle: string;
  amount_sar: number;
  vat_amount_sar: number;
  grand_total_sar: number;
  currency: string;
  payment_method: string;
  status: 'pending' | 'paid' | 'failed' | 'canceled' | string;
  issued_date: string;
  due_date?: string | null;
  paid_at?: string | null;
  po_number?: string | null;
  payment_reference?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
}

export interface SuperAdminBillingSummaryDto {
  active_subscribers_count: number;
  tier_distribution: {
    FREE: number;
    PROFESSIONAL: number;
    ENTERPRISE: number;
  };
  estimated_mrr_sar: number;
  estimated_arr_sar: number;
  pending_invoices_count: number;
  pending_amount_sar: number;
  total_collected_sar: number;
}

export interface EnterpriseQuoteResponse {
  invoice_id: string;
  invoice_number: string;
  status: string;
  currency: string;
  amount_sar: number;
  vat_amount_sar: number;
  grand_total_sar: number;
  due_date: string;
  bank_details: {
    bank_name: string;
    account_name: string;
    iban: string;
    swift: string;
    payment_reference: string;
    vat_note: string;
  };
  next_steps: string;
}

export interface CompanyUpdatePayload {
  parent_id?: string | null;
  name?: string;
  currency?: string;
  fiscal_calendar?: string;
  fiscal_year_start_month?: number;
  tax_regime?: string;
  theme_mode?: 'LIGHT' | 'DARK' | 'CUSTOM';
  ui_primary_color?: string;
  ui_secondary_color?: string;
  ui_logo_url?: string | null;
}

export interface CompanyRegistrationPayload {
  company_name: string;
  slug: string;
  cr_number: string;
  vat_number: string;
  admin_email: string;
  admin_name: string;
  admin_phone?: string;
  admin_password: string;
}

export interface NativeLoginPayload {
  email: string;
  password: string;
}

export interface NativeAuthResponse {
  status: 'Active' | 'Pending';
  message: string;
  token?: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    fullNameAr: string;
    role: 'Super_Admin' | 'Admin' | 'COO' | 'Accountant' | 'Data_Entry' | 'Guest';
    status: 'Active' | 'Pending';
    company_id: string | null;
    tenant_id?: string | null;
    tenant_slug?: string | null;
    domain_slug?: string | null;
  };
}

export interface MasterLoginPayload {
  identity: string;
  password: string;
}

export interface TenantLoginPayload {
  tenant_slug: string;
  identity: string;
  password: string;
}

export interface TwoFactorVerifyPayload {
  two_factor_token?: string;
  code: string;
  tenant?: string;
  tenant_slug?: string;
  workspace_slug?: string;
  email?: string;
}

export interface TwoTierTenantRegistrationPayload {
  company_name: string;
  tenant_slug?: string;
  owner_full_name: string;
  email: string;
  mobile_number: string;
  password: string;
  commercial_registration?: string;
  tax_id?: string;
}

export interface PasswordRecoveryPayload {
  identity: string;
  plane: 'master' | 'tenant';
  workspace_slug?: string;
}

export interface PasswordResetPayload {
  identity?: string;
  plane: 'master' | 'tenant';
  workspace_slug?: string;
  reset_token?: string;
  reset_code?: string;
  otp_code: string;
  new_password: string;
}

export interface TwoTierAuthResponse {
  access_token?: string;
  token_type?: string;
  tier?: 'master' | 'tenant';
  role?: string;
  tenant_id?: string;
  tenant_slug?: string;
  status?: string;
  two_factor_token?: string;
  message?: string;
  user?: {
    id: string;
    email: string;
    mobile?: string;
    fullName?: string;
    fullNameAr?: string;
    role?: string;
  };
}


export interface UserRegistrationPayload {
  company_id: string;
  full_name: string;
  email: string;
  phone: string;
  password: string;
  requested_role?: 'Guest' | 'Data_Entry' | 'Accountant';
}

export interface DirectWorkspaceAccessPayload {
  scope: 'master' | 'tenant';
  company_id?: string;
  recovery_code: string;
}

export interface DirectWorkspaceAccessResponse {
  status: 'Active';
  message: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    fullNameAr: string;
    role: 'Super_Admin' | 'Admin' | 'COO';
    status: 'Active';
    company_id: string | null;
  };
}

export interface ApiAccount {
  id: string;
  company_id: string;
  code: string;
  name: string;
  internal_type: string;
  currency: string;
}

export interface AccountMoveLinePayload {
  account_id?: string;
  account_code?: string;
  partner_id?: string | null;
  cost_center_id?: string | null;
  debit: number;
  credit: number;
  name: string;
}

export interface AccountMoveCreatePayload {
  name?: string;
  journal_code: string;
  move_type?: 'entry' | 'out_invoice' | 'in_invoice' | 'settlement';
  partner_id?: string | null;
  cost_center_id?: string | null;
  date?: string;
  ref?: string;
  lines: AccountMoveLinePayload[];
}

export interface ApiAccountMove {
  id: string;
  company_id: string;
  name: string;
  move_type: 'entry' | 'out_invoice' | 'in_invoice' | 'settlement';
  partner_id: string | null;
  date: string;
  state: 'draft' | 'posted' | 'canceled';
  ref: string | null;
}

export interface ApiCustomerInvoice {
  id: string;
  company_id: string;
  partner_id: string | null;
  move_id: string | null;
  invoice_number: string;
  customer_name: string;
  customer_tax_number: string | null;
  issue_date: string;
  due_date: string | null;
  status: 'Draft' | 'Approved' | 'Issued' | 'Cancelled';
  subtotal: string | number;
  vat_amount: string | number;
  grand_total: string | number;
  approved_by: string | null;
  approved_at: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
  public_token?: string | null;
  journal_entry_id?: string | null;
  is_posted?: boolean;
}

export type InvoiceOut = ApiCustomerInvoice;
export type InvoiceResponse = ApiCustomerInvoice;

export interface ApiEmployee {
  id: string;
  tenant_id?: string;
  company_id?: string;
  user_id?: string | null;
  employee_code: string;
  employeeNumber?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  nameAr?: string;
  nameEn?: string;
  department: string;
  departmentAr?: string;
  departmentEn?: string;
  roleAr?: string;
  roleEn?: string;
  base_salary: number;
  baseSalary?: number;
  hire_date?: string;
  hireDate?: string;
  is_active: boolean;
  status?: string;
  attendance_rate?: number;
  attendanceRate?: number;
  iqamaOrNationalId?: string;
  name_ar?: string | null;
  name_en?: string | null;
  date_of_birth?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  nationality?: string | null;
  marital_status?: 'SINGLE' | 'MARRIED' | null;
  blood_type?: string | null;
  personal_mobile?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_number?: string | null;
  personal_email?: string | null;
  id_type?: 'SAUDI_NATIONAL_ID' | 'IQAMA' | 'GCC_ID' | 'BORDER_NUMBER' | null;
  identity_number?: string | null;
  iqama_expiry_hijri?: string | null;
  iqama_expiry_gregorian?: string | null;
  passport_number?: string | null;
  passport_expiry_date?: string | null;
  profession_on_iqama?: string | null;
  sponsorship_status?: string | null;
  department_type?: string | null;
  job_title?: string | null;
  job_title_category?: string | null;
  direct_manager_id?: string | null;
  direct_manager_name?: string | null;
  contract_type?: 'FIXED_TERM' | 'INDEFINITE' | 'PART_TIME' | 'FREELANCE' | null;
  contract_duration_months?: 12 | 24 | null;
  probation_period_days?: number | null;
  iban_number?: string | null;
  bank_name?: string | null;
  bank_code?: string | null;
  housing_allowance?: number;
  transportation_allowance?: number;
  operational_telecom_allowance?: number;
  food_other_allowance?: number;
  total_target_salary?: number;
  overtime_eligible?: boolean | null;
  standard_working_hours?: number | null;
  gosi_registration_number?: string | null;
  highest_education_level?: string | null;
  field_of_study?: string | null;
  certifications?: string[] | null;
  drivers_license_type?: 'PRIVATE' | 'PUBLIC' | 'HEAVY' | null;
  drivers_license_expiry_date?: string | null;
}

export interface ApiAttendanceLog {
  id: string;
  tenant_id: string;
  employee_id: string;
  device_id?: string | null;
  check_in: string;
  check_out?: string | null;
  biometric_hash?: string | null;
  verification_mode: string;
  created_at: string;
}

export interface ApiPayrollRun {
  id: string;
  tenant_id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  pay_period: string;
  gross_earnings: number;
  allowances: number;
  deductions: number;
  net_pay: number;
  status: 'DRAFT' | 'APPROVED' | 'PAID' | string;
}

export interface ApiJournalLine {
  id?: string;
  account_code: string;
  account_id?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
}

export interface ApiJournalEntry {
  id: string;
  tenant_id: string;
  company_id?: string | null;
  entry_number: string;
  entry_date: string;
  description: string;
  total_debit: number;
  total_credit: number;
  status: string;
  lines?: ApiJournalLine[];
}

export interface ApiTrialBalanceAccount {
  account_code: string;
  account_name: string;
  account_name_ar?: string | null;
  account_type: string;
  total_debit: number | string;
  total_credit: number | string;
  net_balance: number | string;
  debit_balance: number | string;
  credit_balance: number | string;
}

export interface ApiTrialBalanceReport {
  is_balanced: boolean;
  total_debit: number | string;
  total_credit: number | string;
  discrepancy: number | string;
  as_of_date: string;
  accounts: ApiTrialBalanceAccount[];
}

export interface ApiFinancialReportAccount {
  account_code: string;
  account_name: string;
  account_name_ar?: string | null;
  account_type: string;
  amount: number | string;
  total_debit: number | string;
  total_credit: number | string;
}

export interface ApiIncomeStatementReport {
  total_revenue: number | string;
  total_expenses: number | string;
  net_income: number | string;
  gross_profit: number | string;
  operating_margin_percentage: number;
  as_of_date: string;
  revenue_accounts: ApiFinancialReportAccount[];
  expense_accounts: ApiFinancialReportAccount[];
}

export interface ApiBalanceSheetReport {
  total_assets: number | string;
  total_liabilities: number | string;
  total_equity: number | string;
  current_period_net_income: number | string;
  total_liabilities_and_equity: number | string;
  is_balanced: boolean;
  discrepancy: number | string;
  as_of_date: string;
  asset_accounts: ApiFinancialReportAccount[];
  liability_accounts: ApiFinancialReportAccount[];
  equity_accounts: ApiFinancialReportAccount[];
}

export interface CustomerInvoiceCreatePayload {
  partner_id?: string | null;
  invoice_number?: string | null;
  customer_name: string;
  customer_tax_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  subtotal: number;
  vat_amount: number;
  grand_total: number;
}

export interface CustomerInvoiceUpdatePayload {
  partner_id?: string | null;
  customer_name?: string | null;
  customer_tax_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  subtotal?: number;
  vat_amount?: number;
  grand_total?: number;
  status?: 'Draft' | 'Approved' | 'Issued' | 'Cancelled';
}

export interface ApiSettlement {
  id: string;
  company_id: string;
  partner_id: string;
  move_id: string;
  total_gross_amount: string;
  total_penalties_loss: string;
  net_payable: string;
  period_start: string;
  period_end: string;
  state: 'draft' | 'approved' | 'paid';
}

export interface Partner { id: string; name: string; partner_type: string; email?: string | null; phone?: string | null; tax_number?: string | null; commercial_registration?: string | null; branch_scope_ids?: string | null; warehouse_scope_ids?: string | null; access_control_list?: string | null; }
export type PartnerPayload = Omit<Partner, 'id'>;
interface Location { id: string; name: string; location_type: string; }
interface Product {
  id: string;
  sku: string;
  name: string;
  product_type?: string;
  unit_of_measure?: string;
  standard_cost?: number;
  sale_price?: number;
}

import { setAuthCookie, getAuthCookie, clearAuthCookie, getSubdomain, isCustomDomain, getCustomDomain, getEffectiveDomainIdentifier } from '../utils/subdomain';

export const OXENGL_AUTH_TOKEN_KEY = 'oxengl_auth_jwt';
export const OXENGL_AUTH_TIER_KEY = 'oxengl_auth_tier';
export const OXENGL_TENANT_SLUG_KEY = 'oxengl_tenant_slug';
export const OXENGL_TENANT_ID_KEY = 'oxengl_tenant_id';

export interface ResolvedDomainResponse {
  resolved: boolean;
  tenant_id?: string;
  company_id?: string;
  tenant_slug?: string;
  name?: string;
  custom_domain?: string;
  is_custom_domain?: boolean;
  logo_url?: string | null;
  primary_color?: string | null;
  subscription_tier?: string;
  status?: string;
  message?: string;
}

export async function resolveDomain(host?: string): Promise<ResolvedDomainResponse> {
  const query = host ? `?host=${encodeURIComponent(host)}` : '';
  try {
    const res = await fetch(`/api/v1/tenant/resolve-domain${query}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return { resolved: false, message: `Failed to resolve domain: ${res.statusText}` };
    }
    return await res.json();
  } catch (err: any) {
    return { resolved: false, message: err?.message || 'Network error resolving domain' };
  }
}

export async function checkDomainSslStatus(domain: string, port: number = 443): Promise<any> {
  try {
    const res = await fetch(`/api/v1/ssl/status?domain=${encodeURIComponent(domain)}&port=${port}`);
    return await res.json();
  } catch (err: any) {
    return { has_ssl: false, ssl_status: 'unreachable', error: err?.message };
  }
}

export async function verifyDomainDns(domain: string, expectedCname: string = 'domains.oxengl.me', token?: string): Promise<any> {
  const query = token ? `&token=${encodeURIComponent(token)}` : '';
  try {
    const res = await fetch(`/api/v1/ssl/check-dns?domain=${encodeURIComponent(domain)}&expected_cname=${encodeURIComponent(expectedCname)}${query}`);
    return await res.json();
  } catch (err: any) {
    return { is_valid: false, message: err?.message };
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const cookieToken = getAuthCookie();
  const localToken = localStorage.getItem(OXENGL_AUTH_TOKEN_KEY) || localStorage.getItem('token') || localStorage.getItem('access_token');
  if (cookieToken && !localToken) {
    localStorage.setItem(OXENGL_AUTH_TOKEN_KEY, cookieToken);
    localStorage.setItem('token', cookieToken);
    localStorage.setItem('access_token', cookieToken);
    return cookieToken;
  }
  return localToken || cookieToken;
}

export function getAuthTier(): 'master' | 'tenant' | null {
  if (typeof window === 'undefined') return null;
  const tier = (localStorage.getItem(OXENGL_AUTH_TIER_KEY) as 'master' | 'tenant');
  if (tier) return tier;
  if (getSubdomain() || isCustomDomain() || localStorage.getItem('tenant_slug') || localStorage.getItem(OXENGL_TENANT_SLUG_KEY)) return 'tenant';
  if (localStorage.getItem('role') === 'Super_Admin') return 'master';
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(val: any): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

/**
 * Safely decodes JWT claims from a token string without external dependencies.
 */
export function decodeJwtClaims(token: string | null): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const jsonStr = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Extracts and strictly validates the active company UUID from:
 * 1. Explicit argument (if valid UUID)
 * 2. LocalStorage direct keys (tenant_id, company_id, oxengl_tenant_id)
 * 3. Decoded active JWT claims (company_id, tenant_id)
 * 4. Stored user objects (oxengl_user, meayon_user)
 * 5. Stored company object (oxengl_current_company)
 *
 * Guarantees that non-UUID slugs (e.g. 'default', 'saudi-aggregate') are NEVER returned.
 */
export function getActiveCompanyId(explicitId?: string): string | null {
  // 1. Explicit parameter if valid UUID
  if (isValidUUID(explicitId)) {
    return explicitId.trim();
  }

  if (typeof window === 'undefined') return null;

  const effectiveDomain = getEffectiveDomainIdentifier();

  // 2. If on a tenant workspace / custom domain, prioritize matching domain metadata
  if (effectiveDomain) {
    const rawCompany = localStorage.getItem('oxengl_current_company');
    if (rawCompany) {
      try {
        const c = JSON.parse(rawCompany);
        const matchesDomain =
          c?.slug?.toLowerCase() === effectiveDomain.toLowerCase() ||
          c?.custom_domain?.toLowerCase() === effectiveDomain.toLowerCase() ||
          c?.domain_slug?.toLowerCase() === effectiveDomain.toLowerCase();
        if (matchesDomain && isValidUUID(c?.id)) {
          return c.id.trim();
        }
      } catch {}
    }

    const token = getAuthToken();
    if (token) {
      const claims = decodeJwtClaims(token);
      if (claims) {
        const matchesDomain =
          claims.tenant_slug?.toLowerCase() === effectiveDomain.toLowerCase() ||
          claims.domain_slug?.toLowerCase() === effectiveDomain.toLowerCase();
        const cand = claims.company_id || claims.tenant_id || claims.companyId || claims.tenantId;
        if (matchesDomain && isValidUUID(cand)) {
          return cand.trim();
        }
      }
    }

    const rawUser = localStorage.getItem('oxengl_user') || localStorage.getItem('currentUser');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        const matchesDomain =
          u?.tenant_slug?.toLowerCase() === effectiveDomain.toLowerCase() ||
          u?.domain_slug?.toLowerCase() === effectiveDomain.toLowerCase();
        const cand = u?.company_id || u?.companyId || u?.tenant_id || u?.tenantId || u?.company?.id;
        if (matchesDomain && isValidUUID(cand)) {
          return cand.trim();
        }
      } catch {}
    }

    // Direct localStorage storage keys - only use if on this tenant's slug or saved company matches
    const storedSlug = localStorage.getItem(OXENGL_TENANT_SLUG_KEY) || localStorage.getItem('tenant_slug');
    if (storedSlug && storedSlug.toLowerCase() === effectiveDomain.toLowerCase()) {
      const directKeys = [OXENGL_TENANT_ID_KEY, 'tenant_id', 'company_id', 'oxengl_tenant_uuid', 'active_company_id'];
      for (const key of directKeys) {
        const val = localStorage.getItem(key);
        if (isValidUUID(val)) {
          return val.trim();
        }
      }
    }

    // On a tenant domain, if local storage contains a stale mismatching tenant UUID, return null
    // so downstream requests rely on backend Host header resolution instead of corrupting context.
    return null;
  }

  // 3. Stored company object in localStorage (on apex or platform domain)
  const rawCompany = localStorage.getItem('oxengl_current_company');
  if (rawCompany) {
    try {
      const c = JSON.parse(rawCompany);
      const candidates = [c?.id, c?.company_id, c?.tenant_id, c?.uuid];
      for (const cand of candidates) {
        if (isValidUUID(cand)) {
          return cand.trim();
        }
      }
    } catch {}
  }

  // 4. Direct localStorage storage keys (on apex or platform domain)
  const directKeys = [
    OXENGL_TENANT_ID_KEY,
    'tenant_id',
    'company_id',
    'oxengl_tenant_uuid',
    'active_company_id',
  ];
  for (const key of directKeys) {
    const val = localStorage.getItem(key);
    if (isValidUUID(val)) {
      return val.trim();
    }
  }

  // 5. Decoded JWT claims from active session token
  const token = getAuthToken();
  if (token) {
    const claims = decodeJwtClaims(token);
    if (claims) {
      const candidates = [
        claims.company_id,
        claims.tenant_id,
        claims.companyId,
        claims.tenantId,
      ];
      for (const cand of candidates) {
        if (isValidUUID(cand)) {
          try {
            localStorage.setItem(OXENGL_TENANT_ID_KEY, cand.trim());
            localStorage.setItem('tenant_id', cand.trim());
            localStorage.setItem('company_id', cand.trim());
          } catch {}
          return cand.trim();
        }
      }
    }
  }

  // 6. Stored user objects in localStorage
  const userKeys = ['oxengl_user', 'meayon_user', 'currentUser'];
  for (const key of userKeys) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const u = JSON.parse(raw);
        const candidates = [
          u?.company_id,
          u?.companyId,
          u?.tenant_id,
          u?.tenantId,
          u?.company?.id,
        ];
        for (const cand of candidates) {
          if (isValidUUID(cand)) {
            return cand.trim();
          }
        }
      } catch {}
    }
  }

  return null;
}

export function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const effectiveDomain = getEffectiveDomainIdentifier();
  if (effectiveDomain) return effectiveDomain;
  const stored = localStorage.getItem(OXENGL_TENANT_SLUG_KEY) || localStorage.getItem('tenant_slug');
  if (stored) return stored;
  const token = getAuthToken();
  const claims = decodeJwtClaims(token);
  return claims?.tenant_slug || claims?.domain_slug || null;
}

export function getTenantId(): string | null {
  return getActiveCompanyId();
}

export function setAuthSession(token: string, tier: 'master' | 'tenant', tenantSlug?: string | null, tenantId?: string | null): void {
  if (typeof window === 'undefined') return;
  setAuthCookie(token);
  localStorage.setItem(OXENGL_AUTH_TOKEN_KEY, token);
  localStorage.setItem('token', token);
  localStorage.setItem('access_token', token);
  localStorage.setItem(OXENGL_AUTH_TIER_KEY, tier);
  const effectiveSlug = tenantSlug || getEffectiveDomainIdentifier();
  if (effectiveSlug) {
    localStorage.setItem(OXENGL_TENANT_SLUG_KEY, effectiveSlug);
    localStorage.setItem('tenant_slug', effectiveSlug);
  } else {
    localStorage.removeItem(OXENGL_TENANT_SLUG_KEY);
    localStorage.removeItem('tenant_slug');
  }

  // Resolve valid UUID for tenantId, falling back to JWT claims if tenantId is a slug or missing
  let validTenantId: string | null = null;
  if (isValidUUID(tenantId)) {
    validTenantId = tenantId.trim();
  } else {
    const claims = decodeJwtClaims(token);
    const candidate = claims?.company_id || claims?.tenant_id || claims?.companyId || claims?.tenantId;
    if (isValidUUID(candidate)) {
      validTenantId = candidate.trim();
    }
  }

  if (validTenantId) {
    localStorage.setItem(OXENGL_TENANT_ID_KEY, validTenantId);
    localStorage.setItem('tenant_id', validTenantId);
    localStorage.setItem('company_id', validTenantId);
  } else {
    localStorage.removeItem(OXENGL_TENANT_ID_KEY);
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('company_id');
  }
  localStorage.setItem('oxengl_session_active', 'true');
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  clearAuthCookie();
  localStorage.removeItem(OXENGL_AUTH_TOKEN_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('oxengl_auth_jwt');
  localStorage.removeItem(OXENGL_AUTH_TIER_KEY);
  localStorage.removeItem(OXENGL_TENANT_SLUG_KEY);
  localStorage.removeItem('tenant_slug');
  localStorage.removeItem(OXENGL_TENANT_ID_KEY);
  localStorage.removeItem('tenant_id');
  localStorage.removeItem('company_id');
  localStorage.removeItem('oxengl_tenant_uuid');
  localStorage.removeItem('active_company_id');
  localStorage.removeItem('oxengl_current_company');
  localStorage.removeItem('oxengl_user');
  localStorage.removeItem('meayon_user');
  localStorage.removeItem('currentUser');
  localStorage.removeItem('role');
  localStorage.removeItem('oxengl_session_active');
}

const apiBaseUrl = typeof window === 'undefined' ? '' : window.location.origin;

/**
 * Debounced 401 session clearing to prevent cascading auth wipes.
 * When parallel requests are in flight (e.g., Corporate Vault loads documents + CV payload
 * simultaneously), a single transient 401 must NOT immediately destroy the session for
 * the other in-flight requests. Instead, we debounce: only clear the session if no
 * successful request arrives within 1.5 seconds of the first 401.
 */
let _pending401ClearTimer: ReturnType<typeof setTimeout> | null = null;
let _is401SessionClearScheduled = false;

function scheduleDebouncedSessionClear(): void {
  if (_is401SessionClearScheduled) return; // Already scheduled, don't stack
  _is401SessionClearScheduled = true;
  _pending401ClearTimer = setTimeout(() => {
    // Only clear if a fresh token hasn't been set in the meantime
    const currentToken = getAuthToken();
    if (!currentToken) {
      clearAuthSession();
    }
    _is401SessionClearScheduled = false;
    _pending401ClearTimer = null;
  }, 1500);
}

function cancelDebouncedSessionClear(): void {
  if (_pending401ClearTimer) {
    clearTimeout(_pending401ClearTimer);
    _pending401ClearTimer = null;
  }
  _is401SessionClearScheduled = false;
}

/** Tracks whether a 401 retry is already in progress for a given path to prevent infinite loops. */
const _retryingPaths = new Set<string>();

async function request<T>(path: string, companyId?: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const activeTenantSlug = getTenantSlug();
  const activeCompanyId = getActiveCompanyId(companyId);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeTenantSlug ? { 'X-Tenant-Slug': activeTenantSlug } : {}),
    ...(activeCompanyId ? { 'X-Company-ID': activeCompanyId, 'X-Tenant-ID': activeCompanyId } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (options?.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.ok) {
    // A successful response cancels any pending 401 session clear —
    // the session is clearly still valid.
    cancelDebouncedSessionClear();
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      if (typeof errJson.detail === 'string') {
        errorDetail = errJson.detail;
      } else if (Array.isArray(errJson.detail)) {
        errorDetail = errJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
      } else if (errJson.message) {
        errorDetail = errJson.message;
      } else if (errJson.error) {
        errorDetail = typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error);
      }
    } catch {}
    if (errorDetail) {
      console.error(`[API Error ${response.status}] ${path}:`, errorDetail);
    }

    // Global Error Interceptor: 403, 422, and 500 piped into toast notification system
    if (typeof window !== 'undefined') {
      let toastMsg = '';
      if (response.status === 403) {
        toastMsg = errorDetail || 'Access forbidden: You do not have permission for this resource (403).';
      } else if (response.status === 422) {
        toastMsg = errorDetail ? `Validation error: ${errorDetail}` : 'Unprocessable Entity: Form validation failed (422).';
      } else if (response.status >= 500) {
        toastMsg = errorDetail ? `Server error: ${errorDetail}` : `Internal server error (${response.status}). Please try again later.`;
      }

      if (toastMsg) {
        window.dispatchEvent(
          new CustomEvent('oxengl-toast', {
            detail: { message: toastMsg, type: 'error' },
          })
        );
      }
    }

    // 401 Single-Retry Strategy:
    // If we have a valid token and this is the first attempt for this path,
    // retry once. This handles transient JWT validation failures (e.g., clock skew,
    // backend restart, or middleware race condition during parallel requests).
    if (response.status === 401 && token && !_retryingPaths.has(path)) {
      _retryingPaths.add(path);
      try {
        // Brief delay to let any concurrent token refresh settle
        await new Promise((resolve) => setTimeout(resolve, 150));
        const retryToken = getAuthToken();
        if (retryToken) {
          const retryHeaders: Record<string, string> = {
            ...headers,
            Authorization: `Bearer ${retryToken}`,
          };
          const retryActiveCompanyId = getActiveCompanyId(companyId);
          if (retryActiveCompanyId) {
            retryHeaders['X-Company-ID'] = retryActiveCompanyId;
            retryHeaders['X-Tenant-ID'] = retryActiveCompanyId;
          }
          const retryResponse = await fetch(`${apiBaseUrl}${path}`, {
            ...options,
            headers: retryHeaders,
            credentials: 'include',
          });
          if (retryResponse.ok) {
            cancelDebouncedSessionClear();
            _retryingPaths.delete(path);
            if (retryResponse.status === 204) {
              return undefined as T;
            }
            return retryResponse.json() as Promise<T>;
          }
        }
      } catch {
        // Retry failed silently, fall through to original error handling
      } finally {
        _retryingPaths.delete(path);
      }
    }

    // Global 401/403 Interceptor
    if (response.status === 401 || response.status === 403) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('oxengl-auth-error', {
            detail: { status: response.status, message: errorDetail || `Authentication error (${response.status})` },
          })
        );
        if (response.status === 401) {
          // Use debounced session clearing to prevent cascading auth wipe
          // during parallel requests (e.g., Corporate Vault loads multiple
          // endpoints simultaneously).
          scheduleDebouncedSessionClear();
        }
      }
    }

    throw new Error(errorDetail || `API request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function findOrCreate<T extends { id: string }>(path: string, companyId: string, predicate: (record: T) => boolean, payload: object): Promise<T> {
  const records = await request<T[]>(path, companyId);
  return records.find(predicate) ?? request<T>(path, companyId, { method: 'POST', body: JSON.stringify(payload) });
}

/** External backup destinations. The API never returns credential material: only `has_credential`. */
export type CommunicationChannel = 'email' | 'sms';
export type CommunicationProvider = 'smtp' | 'sendgrid' | 'twilio' | 'unifonic' | 'taqnyat';

export interface CommunicationSettingDto {
  id: string;
  tenant_id: string | null;
  scope: 'platform' | 'tenant';
  tenant_name?: string | null;
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  sender_identity: string;
  config: Record<string, unknown>;
  is_active: boolean;
  has_credential: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  last_test_at?: string | null;
  last_test_status?: 'success' | 'failed' | null;
  last_test_error?: string | null;
}

export interface CommunicationSettingWritePayload {
  channel?: CommunicationChannel;
  provider?: CommunicationProvider;
  sender_identity?: string;
  config?: Record<string, string | number>;
  credentials?: Record<string, string>;
  is_active?: boolean;
}

export type BackupProviderType = 'gdrive' | 'onedrive' | 'sftp';

export interface BackupDestinationDto {
  id: string;
  tenant_id: string | null;
  tenant_name?: string | null;
  scope: 'platform' | 'tenant';
  provider_type: BackupProviderType;
  name: string;
  config: Record<string, any>;
  is_active: boolean;
  has_credential: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  last_backup_at?: string | null;
  last_status?: 'success' | 'failed' | 'running' | null;
}

export interface BackupRunLogDto {
  id: string;
  destination_id: string | null;
  destination_name: string | null;
  provider_type: BackupProviderType | null;
  tenant_id: string | null;
  tenant_name?: string | null;
  scope: 'platform' | 'tenant';
  status: 'success' | 'failed' | 'running';
  file_size_bytes: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface BackupPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** Write-only payload: credentials are sent once and never read back. */
export interface BackupDestinationWritePayload {
  provider_type?: BackupProviderType;
  name?: string;
  config?: Record<string, any>;
  credentials?: Record<string, string>;
  is_active?: boolean;
}

function backupQuery(params?: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  return qs.toString() ? `?${qs.toString()}` : '';
}


export const erpApi = {
  resolveDomain: (host?: string) => resolveDomain(host),
  checkDomainSslStatus: (domain: string, port?: number) => checkDomainSslStatus(domain, port),
  verifyDomainDns: (domain: string, expectedCname?: string, token?: string) => verifyDomainDns(domain, expectedCname, token),
  // Two-Tier Identity & Auth Endpoints
  masterLogin: (payload: MasterLoginPayload) =>
    request<TwoTierAuthResponse>('/api/auth/master/login', undefined, { method: 'POST', body: JSON.stringify(payload) }),
  tenantLogin: async (payload: TenantLoginPayload) => {
    const res = await request<TwoTierAuthResponse>('/api/auth/tenant/login', undefined, { method: 'POST', body: JSON.stringify(payload) });
    if (res?.access_token) {
      setAuthSession(res.access_token, 'tenant', res.tenant_slug || payload.tenant_slug, res.tenant_id);
    }
    return res;
  },
  loginTenant: async (payload: TenantLoginPayload) => {
    const res = await request<TwoTierAuthResponse>('/api/auth/tenant/login', undefined, { method: 'POST', body: JSON.stringify(payload) });
    if (res?.access_token) {
      setAuthSession(res.access_token, 'tenant', res.tenant_slug || payload.tenant_slug, res.tenant_id);
    }
    return res;
  },
  verifyTwoFactor: async (payload: TwoFactorVerifyPayload) => {
    const res = await request<TwoTierAuthResponse>('/auth/2fa/verify', undefined, { method: 'POST', body: JSON.stringify(payload) });
    if (res?.access_token) {
      setAuthSession(res.access_token, 'tenant', res.tenant_slug || payload.tenant_slug || payload.workspace_slug, res.tenant_id);
    }
    return res;
  },
  registerTenant: (payload: TwoTierTenantRegistrationPayload) =>
    request<{ message: string; tenant_id: string; tenant_slug: string; tenant: any; admin_user_id: string }>('/api/auth/register-tenant', undefined, { method: 'POST', body: JSON.stringify(payload) }),
  recoverPassword: (payload: PasswordRecoveryPayload) =>
    request<{ message: string; delivery_channel?: string; reset_token?: string }>('/api/auth/recover-password', undefined, { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload: PasswordResetPayload) =>
    request<{ message: string }>('/api/auth/reset-password', undefined, { method: 'POST', body: JSON.stringify(payload) }),
  getMasterMe: () =>
    request<any>('/api/auth/master/me'),
  getTenantMe: () =>
    request<any>('/api/auth/tenant/me'),

  getCompanies: () => request<ApiCompany[]>('/api/companies'),
  getCompany: (companyId: string) => request<ApiCompany>(`/api/companies/${companyId}`, companyId),
  updateCompany: (companyId: string, payload: CompanyUpdatePayload) => request<ApiCompany>(`/api/companies/${companyId}`, companyId, { method: 'PATCH', body: JSON.stringify(payload) }),
  login: async (payload: NativeLoginPayload) => {
    const res = await request<NativeAuthResponse>('/api/auth/verify', undefined, { method: 'POST', body: JSON.stringify(payload) });
    const tenantId = res?.user?.company_id || res?.user?.tenant_id;
    const tenantSlug = res?.user?.tenant_slug || res?.user?.domain_slug;
    if (res?.token) {
      setAuthSession(res.token, 'tenant', tenantSlug, tenantId);
    } else if (tenantId) {
      localStorage.setItem(OXENGL_TENANT_ID_KEY, tenantId);
      localStorage.setItem('tenant_id', tenantId);
      localStorage.setItem('company_id', tenantId);
      if (tenantSlug) {
        localStorage.setItem(OXENGL_TENANT_SLUG_KEY, tenantSlug);
        localStorage.setItem('tenant_slug', tenantSlug);
      }
    }
    return res;
  },
  logout: () => {
    clearAuthSession();
    return request<{ message: string }>('/api/auth/logout', undefined, { method: 'POST' });
  },
  registerUser: (payload: UserRegistrationPayload) => request<NativeAuthResponse>('/api/user-registrations', payload.company_id, { method: 'POST', body: JSON.stringify(payload) }),
  registerCompany: (payload: CompanyRegistrationPayload) => request<{ company: ApiCompany; user: { id: string; company_id: string; role: string } }>('/api/companies/register', undefined, { method: 'POST', body: JSON.stringify(payload) }),
  updateCompanyBranding: (companyId: string, payload: CompanyBrandingPayload) => request<ApiCompany>(`/api/companies/${companyId}/branding`, companyId, { method: 'PUT', body: JSON.stringify(payload) }),
  getPlatformBranding: () => request<PlatformBrandingDto>('/api/v1/platform/branding'),
  updatePlatformBranding: (payload: PlatformBrandingPayload) =>
    request<PlatformBrandingDto>('/api/v1/admin/platform/branding', undefined, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getTenantBranding: (tenantId?: string) => {
    const url = tenantId ? `/api/v1/tenant/branding?tenant_id=${encodeURIComponent(tenantId)}` : '/api/v1/tenant/branding';
    return request<TenantBrandingDto>(url, tenantId);
  },
  updateTenantBranding: (tenantId: string | number, payload: TenantBrandingPayload) =>
    request<TenantBrandingDto>(`/api/v1/admin/tenant/${tenantId}/branding`, String(tenantId), {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  uploadPlatformAsset: (
    payload: {
      asset_type: string;
      file_buffer?: string;
      file_name?: string;
      company_id?: string;
      primary_color?: string;
      secondary_color?: string;
      wallpaper_url?: string;
      background_url?: string;
    },
    companyId?: string
  ) =>
    request<{ success: boolean; asset_url: string; asset_type: string }>('/api/platform/assets/upload', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  directWorkspaceAccess: (payload: DirectWorkspaceAccessPayload) => request<DirectWorkspaceAccessResponse>('/api/auth/direct-access', undefined, { method: 'POST', body: JSON.stringify(payload) }),
  getIsolationAudit: () => request<IsolationAudit>('/api/platform/audit'),
  issueLicense: (payload: LicenseIssuePayload) => request<ApiCompany>('/api/platform/licenses', undefined, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getOperations: (companyId: string) => request<ApiOperation[]>('/api/operations', companyId),
  getProducts: (companyId: string) => request<Product[]>('/api/products', companyId),
  deleteOperation: (companyId: string, pickingId: string) => request<void>(`/api/operations/${pickingId}`, companyId, {
    method: 'DELETE',
  }),
  getAccountingAccounts: (companyId: string) => request<ApiAccount[]>('/api/accounting/accounts', companyId),
  createAccountingAccount: (
    companyId: string,
    payload: {
      code: string;
      name: string;
      internal_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
      currency?: string;
      node_path?: string;
    }
  ) =>
    request<ApiAccount>('/api/accounting/accounts', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAccountingMoves: (companyId: string) => request<ApiAccountMove[]>('/api/accounting/moves', companyId),
  getAccountingMove: (companyId: string, moveId: string) => request<ApiAccountMove>(`/api/accounting/moves/${moveId}`, companyId),
  createAccountMove: (companyId: string, payload: AccountMoveCreatePayload) => request<ApiAccountMove>('/api/accounting/moves', companyId, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getCustomerInvoices: (companyId: string) => request<ApiCustomerInvoice[]>('/api/customer-invoices', companyId),
  getCustomerInvoice: (companyId: string, invoiceId: string) => request<ApiCustomerInvoice>(`/api/customer-invoices/${invoiceId}`, companyId),
  createCustomerInvoice: (companyId: string, payload: CustomerInvoiceCreatePayload) => request<ApiCustomerInvoice>('/api/customer-invoices', companyId, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateCustomerInvoice: (companyId: string, invoiceId: string, payload: CustomerInvoiceUpdatePayload) => request<ApiCustomerInvoice>(`/api/customer-invoices/${invoiceId}`, companyId, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  deleteCustomerInvoice: (companyId: string, invoiceId: string) => request<void>(`/api/customer-invoices/${invoiceId}`, companyId, {
    method: 'DELETE',
  }),
  approveCustomerInvoice: (companyId: string, invoiceId: string) => request<ApiCustomerInvoice>(`/api/customer-invoices/${invoiceId}/approve`, companyId, {
    method: 'POST',
  }),
  issueCustomerInvoice: (companyId: string, invoiceId: string) => request<ApiCustomerInvoice>(`/api/customer-invoices/${invoiceId}/issue`, companyId, {
    method: 'POST',
  }),
  postInvoiceToLedger: (invoiceId: string, companyId?: string) =>
    request<ApiJournalEntry>(`/api/finance/invoices/${invoiceId}/post-ledger`, companyId, {
      method: 'POST',
    }),
  processZatcaInvoice: (companyId: string, invoiceId: string) => request<any>(`/api/compliance/zatca/process-invoice/${invoiceId}`, companyId, {
    method: 'POST',
  }),
  calculateZatcaInvoice: (companyId: string, payload: {
    subtotal?: number;
    quantity?: number;
    unit_price?: number;
    rate?: number;
    amount?: number;
    vat_rate?: number;
  }) => request<{
    subtotal: number;
    vat_amount: number;
    grand_total: number;
    vat_rate: number;
  }>('/api/compliance/zatca/calculate-invoice', companyId, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getSettlements: (companyId: string) => request<ApiSettlement[]>('/api/settlements', companyId),
  getVouchers: (companyId: string) => request<any[]>('/api/accounting/moves', companyId),
  createVoucher: (companyId: string, payload: any) => request<any>('/api/accounting/moves', companyId, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getPartners: (companyId: string) => request<Partner[]>('/api/partners', companyId),
  createPartner: (companyId: string, payload: PartnerPayload) => request<Partner>('/api/partners', companyId, { method: 'POST', body: JSON.stringify(payload) }),
  updatePartner: (companyId: string, partnerId: string, payload: Partial<PartnerPayload>) => request<Partner>(`/api/partners/${partnerId}`, companyId, { method: 'PATCH', body: JSON.stringify(payload) }),
  archivePartner: (companyId: string, partnerId: string) => request<void>(`/api/partners/${partnerId}`, companyId, { method: 'DELETE' }),
  
  // Universal Bulk Import Engine
  bulkImportOperations: (payload: FormData | any, companyId?: string) =>
    request<{ success: boolean; imported_count: number; skipped_count: number; errors: string[]; imported_ticket_ids: string[] }>(
      '/api/v1/operations/bulk-import',
      companyId,
      {
        method: 'POST',
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
      }
    ),
  bulkImportPartners: (payload: FormData | any, companyId?: string) =>
    request<{ success: boolean; imported_count: number; updated_count: number; errors: string[] }>(
      '/api/v1/partners/bulk-import',
      companyId,
      {
        method: 'POST',
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
      }
    ),
  
  // Multi-Grade SaaS Subscription & Billing (Phase 4)
  // Unified pricing catalog: single source of truth is the subscription_plans table.
  getPricingPlans: () => request<SubscriptionPlanDto[]>('/api/v1/pricing/plans'),
  getSubscriptionPlans: () => request<SubscriptionPlanDto[]>('/api/v1/pricing/plans'),
  getAdminPricingPlans: () => request<SubscriptionPlanDto[]>('/api/v1/superadmin/billing/plans'),
  updatePricingPlan: (planId: string, payload: SubscriptionPlanUpdatePayload) =>
    request<SubscriptionPlanDto>(`/api/v1/superadmin/billing/plans/${planId}`, undefined, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getTenantSubscription: (companyId?: string) => request<TenantSubscriptionDto>('/api/v1/tenant/billing/subscription', companyId),
  createStripeCheckout: (
    payload: { plan_name: string; billing_cycle: string; success_url?: string; cancel_url?: string },
    companyId?: string
  ) => request<{ checkout_url: string; session_id: string }>('/api/v1/tenant/billing/checkout', companyId, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createEnterpriseQuote: (
    payload: {
      plan_name: string;
      billing_cycle: string;
      po_number?: string;
      company_tax_id?: string;
      billing_address?: string;
      contact_email?: string;
      notes?: string;
    },
    companyId?: string
  ) => request<EnterpriseQuoteResponse>('/api/v1/tenant/billing/enterprise-quote', companyId, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getTenantInvoices: (companyId?: string) => request<SaaSInvoiceDto[]>('/api/v1/tenant/billing/invoices', companyId),
  getInvoiceDetail: (invoiceId: string) => request<SaaSInvoiceDto>(`/api/v1/tenant/billing/invoices/${invoiceId}`),
  updateTenantSubscription: (tenantId: string, payload: { tier: string; max_users?: number; max_storage_gb?: number }) =>
    request<any>(`/api/master/tenants/${tenantId}/subscription`, undefined, { method: 'PUT', body: JSON.stringify(payload) }),
  getTenantBillingSummary: () => request<any>('/api/v1/tenant/billing/subscription'),
  getTenantSaaSInvoices: () => request<SaaSInvoiceDto[]>('/api/v1/tenant/billing/invoices'),

  // SuperAdmin Financial Control Center (Phase 4)
  getSuperAdminBillingSummary: () => request<SuperAdminBillingSummaryDto>('/api/v1/superadmin/billing/summary'),
  getSuperAdminInvoices: (params?: { status?: string; payment_method?: string; tenant_id?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.payment_method) qs.set('payment_method', params.payment_method);
    if (params?.tenant_id) qs.set('tenant_id', params.tenant_id);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return request<SaaSInvoiceDto[]>(`/api/v1/superadmin/billing/invoices${queryStr}`);
  },
  verifyAndSettleInvoice: (invoiceId: string, payload: { payment_reference: string; notes?: string }) =>
    request<any>(`/api/v1/superadmin/billing/invoices/${invoiceId}/verify`, undefined, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateTenantCustomLimits: (tenantId: string, customLimits: Record<string, any>) =>
    request<any>(`/api/v1/superadmin/billing/tenants/${tenantId}/custom-limits`, undefined, {
      method: 'PUT',
      body: JSON.stringify({ custom_limits: customLimits }),
    }),

  // Outbound transactional communications. Credential fields are write-only.
  listCommunicationSettings: () =>
    request<CommunicationSettingDto[]>('/api/v1/tenant-control/communications'),
  createCommunicationSetting: (payload: CommunicationSettingWritePayload) =>
    request<CommunicationSettingDto>('/api/v1/tenant-control/communications', undefined, { method: 'POST', body: JSON.stringify(payload) }),
  updateCommunicationSetting: (id: string, payload: CommunicationSettingWritePayload) =>
    request<CommunicationSettingDto>(`/api/v1/tenant-control/communications/${id}`, undefined, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCommunicationSetting: (id: string) =>
    request<{ success: boolean; id: string }>(`/api/v1/tenant-control/communications/${id}`, undefined, { method: 'DELETE' }),
  testCommunicationSetting: (id: string, recipient: string) =>
    request<{ ok: boolean; message: string }>(`/api/v1/tenant-control/communications/${id}/test`, undefined, { method: 'POST', body: JSON.stringify({ recipient }) }),
  getSuperAdminCommunicationSettings: (params?: { channel?: string; provider?: string; scope?: string; tenant_id?: string }) =>
    request<CommunicationSettingDto[]>(`/api/v1/superadmin/communications${backupQuery(params)}`),
  createSuperAdminCommunicationSetting: (payload: CommunicationSettingWritePayload) =>
    request<CommunicationSettingDto>('/api/v1/superadmin/communications', undefined, { method: 'POST', body: JSON.stringify(payload) }),
  updateSuperAdminCommunicationSetting: (id: string, payload: CommunicationSettingWritePayload) =>
    request<CommunicationSettingDto>(`/api/v1/superadmin/communications/${id}`, undefined, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteSuperAdminCommunicationSetting: (id: string) =>
    request<{ success: boolean; id: string }>(`/api/v1/superadmin/communications/${id}`, undefined, { method: 'DELETE' }),
  testSuperAdminCommunicationSetting: (id: string, recipient: string) =>
    request<{ ok: boolean; message: string }>(`/api/v1/superadmin/communications/${id}/test`, undefined, { method: 'POST', body: JSON.stringify({ recipient }) }),

  // Data Backups & Archives (tenant scope: company is derived server-side from the session)
  listBackupDestinations: (params?: { page?: number; page_size?: number }) =>
    request<BackupPage<BackupDestinationDto>>(`/api/v1/tenant-control/backups/destinations${backupQuery(params)}`),
  createBackupDestination: (payload: BackupDestinationWritePayload) =>
    request<BackupDestinationDto>('/api/v1/tenant-control/backups/destinations', undefined, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateBackupDestination: (id: string, payload: BackupDestinationWritePayload) =>
    request<BackupDestinationDto>(`/api/v1/tenant-control/backups/destinations/${id}`, undefined, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteBackupDestination: (id: string) =>
    request<any>(`/api/v1/tenant-control/backups/destinations/${id}`, undefined, { method: 'DELETE' }),
  testBackupDestination: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/v1/tenant-control/backups/destinations/${id}/test`, undefined, { method: 'POST' }),
  listBackupRunLogs: (params?: { page?: number; page_size?: number; status?: string; destination_id?: string }) =>
    request<BackupPage<BackupRunLogDto>>(`/api/v1/tenant-control/backups/logs${backupQuery(params)}`),

  // Super Admin backup oversight (platform superadmin only)
  getSuperAdminBackupDestinations: (params?: { page?: number; page_size?: number; tenant_id?: string; scope?: string }) =>
    request<BackupPage<BackupDestinationDto>>(`/api/v1/superadmin/backups/destinations${backupQuery(params)}`),
  getSuperAdminBackupLogs: (params?: { page?: number; page_size?: number; tenant_id?: string; status?: string; scope?: string }) =>
    request<BackupPage<BackupRunLogDto>>(`/api/v1/superadmin/backups/logs${backupQuery(params)}`),
  testSuperAdminBackupDestination: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/v1/superadmin/backups/destinations/${id}/test`, undefined, { method: 'POST' }),
  deleteSuperAdminBackupDestination: (id: string) =>
    request<any>(`/api/v1/superadmin/backups/destinations/${id}`, undefined, { method: 'DELETE' }),
  
  // Phase 5: Mobile Fleet Operations & Driver Proof of Delivery
  getMobileTrips: (companyId: string) => request<any[]>('/api/mobile/trips', companyId),
  createMobileTrip: (companyId: string, payload: any) => request<any>('/api/mobile/trips', companyId, { method: 'POST', body: JSON.stringify(payload) }),
  getMobileTrip: (tripId: string, companyId?: string) => request<any>(`/api/mobile/trips/${tripId}`, companyId),
  updateTripStatus: (tripId: string, payload: any, companyId?: string) => request<any>(`/api/mobile/trips/${tripId}/status`, companyId, { method: 'PUT', body: JSON.stringify(payload) }),
  submitDeliveryProof: (payload: any, companyId?: string) => request<any>('/api/mobile/delivery-proof', companyId, { method: 'POST', body: JSON.stringify(payload) }),
  submitInspectionLog: (payload: any, companyId?: string) => request<any>('/api/mobile/inspection-logs', companyId, { method: 'POST', body: JSON.stringify(payload) }),
  getInspectionLogs: (companyId?: string) => request<any[]>('/api/mobile/inspection-logs', companyId),
  
  // Phase 5: Fleet Maintenance & Fuel Management
  getVehicles: (companyId: string) => request<any[]>('/api/fleet/vehicles', companyId),
  createVehicle: (companyId: string, payload: any) => request<any>('/api/fleet/vehicles', companyId, { method: 'POST', body: JSON.stringify(payload) }),
  getMaintenanceOrders: (companyId: string) => request<any[]>('/api/fleet/maintenance-orders', companyId),
  createMaintenanceOrder: (companyId: string, payload: any) => request<any>('/api/fleet/maintenance-orders', companyId, { method: 'POST', body: JSON.stringify(payload) }),
  getFuelTransactions: (companyId: string) => request<any[]>('/api/fleet/fuel-transactions', companyId),
  createFuelTransaction: (companyId: string, payload: any) => request<any>('/api/fleet/fuel-transactions', companyId, { method: 'POST', body: JSON.stringify(payload) }),

  // Phase 5: GPS Fleet Radar Registration
  registerFleetTruck: (payload: {
    plate_number: string;
    vehicle_id?: string;
    carrier_id?: string;
    carrier_name?: string;
    imei?: string;
    driver_name_ar?: string;
    driver_name_en?: string;
    destination_ar?: string;
    destination_en?: string;
    min_temp?: number;
    max_temp?: number;
    initial_lat?: number;
    initial_lng?: number;
    speed?: number;
    cargo_temp?: number;
    ambient_humidity?: number;
    device_battery_voltage?: number;
    vehicle_type?: string;
    tenant_id?: string;
  }, companyId?: string) => request<any>('/api/v1/logistics/fleet/register', companyId, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Phase 5: Planning Department Charters
  getProjectCharters: (companyId?: string) => request<any[]>('/api/tenant/planning/charters', companyId),
  getProjectCharterDetails: (charterId: string, companyId?: string) => request<any>(`/api/tenant/planning/charters/${charterId}`, companyId),
  createProjectCharter: (payload: {
    project_name: string;
    manager_name?: string;
    manager_id?: string;
    total_budget?: number;
    start_date?: string;
    end_date?: string;
    scope_of_work_text?: string;
    smart_goals?: any[];
    kpis_json?: Record<string, any>;
    status?: string;
  }, companyId?: string) => request<any>('/api/tenant/planning/charters', companyId, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  
  // Phase 5: Multi-Tenant Real-Time Analytics
  getTenantAnalyticsSummary: (companyId: string) => request<any>('/api/analytics/tenant-summary', companyId),

  // Tenant Control Panel API (Live Backend Integration with /api/v1/ and /api/ support)
  getTenantControlSettings: (companyId?: string) =>
    request<any>('/api/v1/tenant/control/settings', companyId),
  updateTenantControlSettings: (payload: any, companyId?: string) =>
    request<any>('/api/v1/tenant/control/settings', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTenantControlDomains: (companyId?: string) =>
    request<any>('/api/v1/tenant/control/domains', companyId),
  registerTenantControlDomain: (payload: any, companyId?: string) =>
    request<any>('/api/v1/tenant/control/domains', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  verifyTenantControlDomain: (domainId: string, companyId?: string) =>
    request<any>(`/api/v1/tenant/control/domains/${domainId}/verify`, companyId, {
      method: 'POST',
    }),

  // Enterprise Database & Migration (Phase 1)
  getTenantDatabaseConfig: (companyId?: string) =>
    request<{
      company_id: string;
      storage_mode: 'LOCAL_SHARED' | 'DEDICATED_EXTERNAL';
      is_external_db: boolean;
      database_name: string;
      residency_region: string;
      target_host?: string;
      ssl_mode?: string;
      created_at?: string;
      updated_at?: string;
    }>('/api/v1/tenant/control/database/config', companyId),

  testTenantDatabaseConnection: (payload: {
    host?: string;
    port?: number;
    database_name?: string;
    username?: string;
    password?: string;
    ssl_mode?: string;
    raw_url?: string;
  }, companyId?: string) =>
    request<{
      success: boolean;
      message: string;
      host?: string;
      database?: string;
      ssl_mode?: string;
    }>('/api/v1/tenant/control/database/test-connection', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  triggerTenantDatabaseMigration: (payload: {
    host?: string;
    port?: number;
    database_name?: string;
    username?: string;
    password?: string;
    ssl_mode?: string;
    raw_url?: string;
  }, companyId?: string) =>
    request<{
      success: boolean;
      migration_id: string;
      status: string;
      message: string;
      target_database: string;
      target_host: string;
    }>('/api/v1/tenant/control/database/migrate', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTenantDatabaseMigrationStatus: (migrationId?: string, companyId?: string) => {
    const qs = migrationId ? `?migration_id=${encodeURIComponent(migrationId)}` : '';
    return request<{
      id?: string;
      company_id: string;
      status: string;
      progress_pct: number;
      current_step?: string;
      records_transferred: number;
      error_message?: string;
      target_host?: string;
      target_database?: string;
      ssl_mode?: string;
      completed_at?: string;
      updated_at?: string;
    }>(`/api/v1/tenant/control/database/migration-status${qs}`, companyId);
  },

  revertTenantToSharedDatabase: (companyId?: string) =>
    request<{
      success: boolean;
      message: string;
      storage_mode: string;
    }>('/api/v1/tenant/control/database/switch-back', companyId, {
      method: 'POST',
    }),


  // Tenant User Management API (IAM Control Panel - backend: /api/v1/users)
  getUsers: () =>
    request<
      Array<{
        id: string;
        email: string;
        phone?: string | null;
        sync_reference_id?: string | null;
        full_name: string;
        role: string;
        iam_role?: string | null;
        must_change_password?: boolean;
        is_active: boolean;
        created_at?: string;
        tenant_id: string;
      }>
    >('/api/v1/users'),

  /** Standardized role catalogue (single source of truth: backend role_catalog). */
  getIamRoles: () =>
    request<{
      roles: Array<{ value: string; privileged: boolean }>;
      external_roles: Array<{ value: string; privileged: boolean }>;
      can_assign_privileged: boolean;
      can_manage_users: boolean;
    }>('/api/v1/users/roles'),

  /** External / contractor identities only; internal staff are provisioned by the HR module. */
  inviteUser: (payload: { email?: string; phone?: string; channel: 'email' | 'sms' | 'manual'; role: string; full_name?: string }) =>
    request<{
      status: string;
      user_id: string;
      email: string | null;
      phone: string | null;
      channel: 'email' | 'sms' | 'manual';
      full_name: string;
      role: string;
      reset_dispatched: boolean;
      message: string;
      temporary_password?: string | null;
    }>('/api/v1/users/invite', undefined, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteUser: (userId: string) =>
    request<{ status: string; user_id: string; message: string }>(`/api/v1/users/${userId}`, undefined, {
      method: 'DELETE',
    }),

  updateUserRole: (userId: string, role: string) =>
    request<{ status: string; user_id: string; role: string; iam_role: string; message: string }>(
      `/api/v1/users/${userId}/role`,
      undefined,
      {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }
    ),

  suspendUser: (userId: string) =>
    request<{ status: string; user_id: string; is_active: boolean; message: string }>(
      `/api/v1/users/${userId}/suspend`,
      undefined,
      { method: 'POST' }
    ),

  reactivateUser: (userId: string) =>
    request<{ status: string; user_id: string; is_active: boolean; message: string }>(
      `/api/v1/users/${userId}/reactivate`,
      undefined,
      { method: 'POST' }
    ),

  forcePasswordReset: (userId: string) =>
    request<{ status: string; user_id: string; must_change_password: boolean; reset_dispatched: boolean; message: string }>(
      `/api/v1/users/${userId}/force-password-reset`,
      undefined,
      { method: 'POST' }
    ),

  async createWeighbridgeOperation(input: {
    companyId: string;
    transporterName: string;
    materialName: string;
    sourceName: string;
    destinationName: string;
    truckNumber: string;
    grossWeight: number;
    tareWeight: number;
    uom?: string;
    unitOfMeasure?: string;
    attachments?: any[];
    scaleTicketAttachment?: string;
    scaleTicketNo?: string;
    scale_ticket_no?: string;
    loadingInvoiceNo?: string;
    loading_invoice_no?: string;
    receiptInvoiceNo?: string;
    receipt_invoice_no?: string;
    ticket_number?: string;
    ticketNumber?: string;
    qty_loaded?: number;
    qty_delivered?: number;
    qty_wastage?: number;
    wastage_percentage?: number;
    sales_amount?: number;
    vat_amount?: number;
    total_sales?: number;
    purchases_cost?: number;
    crusher_payment?: number;
    net_profit?: number;
    operation_month?: number;
    operation_year?: number;
    notes?: string;
  }) {
    const partner = await findOrCreate<Partner>('/api/partners', input.companyId, (record) => record.name === input.transporterName, {
      name: input.transporterName, partner_type: 'service_supplier',
    });
    const product = await findOrCreate<Product>('/api/products', input.companyId, (record) => record.name === input.materialName, {
      name: input.materialName, sku: `AUTO-${input.materialName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40) || 'MATERIAL'}`,
    });
    const source = await findOrCreate<Location>('/api/locations', input.companyId, (record) => record.name === input.sourceName, {
      name: input.sourceName, location_type: 'supplier',
    });
    const destination = await findOrCreate<Location>('/api/locations', input.companyId, (record) => record.name === input.destinationName, {
      name: input.destinationName, location_type: 'customer',
    });
      return request<ApiOperation>('/api/operations/weighbridge', input.companyId, {
        method: 'POST',
        body: JSON.stringify({
          partner_id: partner.id,
          product_id: product.id,
          source_location_id: source.id,
          dest_location_id: destination.id,
          truck_number: input.truckNumber,
          gross_weight: input.grossWeight,
          tare_weight: input.tareWeight,
          uom: input.uom || input.unitOfMeasure || 'MT',
          unit_of_measure: input.unitOfMeasure || input.uom || 'MT',
          attachments: input.attachments || [],
          scale_ticket_attachment: input.scaleTicketAttachment || null,
          scale_ticket_no: input.scale_ticket_no || input.scaleTicketNo || null,
          loading_invoice_no: input.loading_invoice_no || input.loadingInvoiceNo || null,
          receipt_invoice_no: input.receipt_invoice_no || input.receiptInvoiceNo || null,
          ticket_number: input.ticket_number || input.ticketNumber || null,
          qty_loaded: input.qty_loaded,
          qty_delivered: input.qty_delivered,
          qty_wastage: input.qty_wastage,
          wastage_percentage: input.wastage_percentage,
          sales_amount: input.sales_amount,
          vat_amount: input.vat_amount,
          total_sales: input.total_sales,
          purchases_cost: input.purchases_cost,
          crusher_payment: input.crusher_payment,
          net_profit: input.net_profit,
          operation_month: input.operation_month,
          operation_year: input.operation_year,
          notes: input.notes,
        }),
      });
    },

  getCustomsManifests: (companyId: string) =>
    request<ApiCustomsManifest[]>('/api/v1/logistics/customs/manifests', companyId),

  createCustomsManifest: (companyId: string, payload: CreateCustomsManifestPayload) =>
    request<ApiCustomsManifest>('/api/v1/logistics/customs/manifests', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCustomsStatus: (companyId: string, manifestId: string, status: string, reviewNotes?: string) =>
    request<ApiCustomsManifest>(`/api/v1/logistics/customs/manifests/${manifestId}/status`, companyId, {
      method: 'PUT',
      body: JSON.stringify({ status, review_notes: reviewNotes }),
    }),

  // HR Personnel Core
  getEmployees: (companyId?: string) =>
    request<any[]>('/api/hrms/employees', companyId),
  createEmployee: (payload: any, companyId?: string) =>
    request<any>('/api/hrms/employees', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 2: Biometric HRMS & Double-Entry Financial Ledger
  getHrmsEmployees: (companyId?: string, department?: string) => {
    const query = department ? `?department=${encodeURIComponent(department)}` : '';
    return request<ApiEmployee[]>(`/api/hrms/employees${query}`, companyId);
  },
  createHrmsEmployee: (payload: Partial<ApiEmployee>, companyId?: string) =>
    request<ApiEmployee>('/api/hrms/employees', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  uploadEmployeeDocument: (employeeId: string, documentType: string, file: File, companyId?: string) => {
    const formData = new FormData();
    formData.append('document_type', documentType);
    formData.append('file', file);
    return request<any>(`/api/hrms/employees/${employeeId}/documents`, companyId, {
      method: 'POST',
      body: formData,
    });
  },
  getHrmsAttendanceLogs: (companyId?: string, employeeId?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (employeeId) params.append('employee_id', employeeId);
    params.append('limit', String(limit));
    return request<ApiAttendanceLog[]>(`/api/hrms/attendance?${params.toString()}`, companyId);
  },
  recordHrmsAttendance: (payload: { employee_id: string; device_id?: string; verification_mode?: string; check_in?: string; check_out?: string }, companyId?: string) =>
    request<ApiAttendanceLog>('/api/hrms/attendance', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getHrmsPayrollRuns: (companyId?: string, payPeriod?: string, status?: string) => {
    const params = new URLSearchParams();
    if (payPeriod) params.append('pay_period', payPeriod);
    if (status) params.append('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<ApiPayrollRun[]>(`/api/hrms/payroll${qs}`, companyId);
  },
  createHrmsPayrollRun: (payload: { employee_id: string; pay_period: string; gross_earnings: number; allowances?: number; deductions?: number; status?: string }, companyId?: string) =>
    request<ApiPayrollRun>('/api/hrms/payroll', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  postPayrollToLedger: (runId: string, companyId?: string) =>
    request<ApiJournalEntry>(`/api/hrms/payroll/${runId}/post-ledger`, companyId, {
      method: 'POST',
    }),
  getHrmsJournalEntries: (companyId?: string, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<ApiJournalEntry[]>(`/api/hrms/journal-entries${qs}`, companyId);
  },
  createHrmsJournalEntry: (payload: { description: string; lines: Array<{ account_code: string; debit: number; credit: number; description?: string }>; entry_date?: string }, companyId?: string) =>
    request<ApiJournalEntry>('/api/hrms/journal-entries', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Procurement & Inventory Purchase Orders
  getPurchaseOrders: (companyId?: string) =>
    request<any[]>('/api/v1/inventory/purchase-orders', companyId),
  createPurchaseOrder: (payload: any, companyId?: string) =>
    request<any>('/api/v1/inventory/purchase-orders', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Procurement Bills & Double-Entry Ledger Integration
  getProcurementBills: (companyId?: string) =>
    request<ApiProcurementBill[]>('/api/procurement/bills', companyId),
  createProcurementBill: (payload: any, companyId?: string) =>
    request<ApiProcurementBill>('/api/procurement/bills', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  postProcurementBillToLedger: (billId: string, companyId?: string) =>
    request<ApiJournalEntry>(`/api/procurement/bills/${billId}/post-ledger`, companyId, {
      method: 'POST',
    }),
  getProcurementVendors: (companyId?: string) =>
    request<any[]>('/api/procurement/vendors', companyId),

  // Procurement Tendering & Vendor Portal (Phase 10)
  getProcurementTenders: (companyId?: string) =>
    request<ApiProcurementTender[]>('/api/v1/procurement/tenders', companyId),
  getProcurementTender: (tenderId: string, companyId?: string) =>
    request<ApiProcurementTender>(`/api/v1/procurement/tenders/${tenderId}`, companyId),
  createProcurementTender: (payload: any, companyId?: string) =>
    request<ApiProcurementTender>('/api/v1/procurement/tenders', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  generateRFQFromPR: (payload: any, companyId?: string) =>
    request<ApiProcurementTender>('/api/v1/procurement/rfq/from-pr', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTenderBids: (tenderId: string, companyId?: string) =>
    request<ApiProcurementBid[]>(`/api/v1/procurement/tenders/${tenderId}/bids`, companyId),
  submitTenderBid: (tenderId: string, payload: any, companyId?: string) =>
    request<ApiProcurementBid>(`/api/v1/procurement/tenders/${tenderId}/bids`, companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  unsealTenderBids: (tenderId: string, companyId?: string) =>
    request<ApiUnsealResponse>(`/api/v1/procurement/tenders/${tenderId}/unseal`, companyId, {
      method: 'POST',
    }),
  awardTenderBid: (tenderId: string, payload: any, companyId?: string) =>
    request<ApiAwardResponse>(`/api/v1/procurement/tenders/${tenderId}/award`, companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  vendorPortalRegister: (payload: any) =>
    request<any>('/api/v1/procurement/vendor-portal/register', undefined, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  vendorPortalLogin: (payload: any) =>
    request<ApiVendorPortalUser>('/api/v1/procurement/vendor-portal/login', undefined, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Inventory Management & Double-Entry Ledger Integration (Phase 8)
  getInventoryMovements: (companyId?: string) =>
    request<ApiInventoryMovement[]>('/api/inventory/movements', companyId),
  getInventoryMovement: (movementId: string, companyId?: string) =>
    request<ApiInventoryMovement>(`/api/inventory/movements/${movementId}`, companyId),
  createInventoryMovement: (payload: any, companyId?: string) =>
    request<ApiInventoryMovement>('/api/inventory/movements', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  postInventoryMovementToLedger: (movementId: string, companyId?: string) =>
    request<ApiJournalEntry>(`/api/inventory/movements/${movementId}/post-ledger`, companyId, {
      method: 'POST',
    }),
  getInventoryWarehouses: (companyId?: string) =>
    request<ApiWarehouse[]>('/api/inventory/warehouses', companyId),
  createInventoryWarehouse: (payload: any, companyId?: string) =>
    request<ApiWarehouse>('/api/inventory/warehouses', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getInventoryProducts: (companyId?: string) =>
    request<ApiProduct[]>('/api/inventory/products', companyId),
  getInventoryValuationSummary: (companyId?: string) =>
    request<ApiInventoryValuationSummary>('/api/inventory/valuation', companyId),
  getMultiWarehouseValuation: (params?: { warehouseId?: string; valuationMethod?: string; companyId?: string }) => {
    const sp = new URLSearchParams();
    if (params?.warehouseId) sp.append('warehouse_id', params.warehouseId);
    if (params?.valuationMethod) sp.append('valuation_method', params.valuationMethod);
    if (params?.companyId) sp.append('company_id', params.companyId);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return request<ApiMultiWarehouseValuationReport>(`/api/inventory/valuation/multi-warehouse${qs}`, params?.companyId);
  },
  calculateInventoryValuation: (payload: { warehouse_id?: string; valuation_method?: string; company_id?: string }) =>
    request<ApiMultiWarehouseValuationReport>('/api/inventory/valuation/calculate', payload.company_id, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendAgentPrompt: (payload: { prompt: string; current_route: string; thread_id: string; screen_context?: any }, companyId?: string) =>
    request<any>('/api/v1/agent/interact', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  executeAgentAction: (payload: { thread_id: string; approved: boolean }, companyId?: string) =>
    request<any>('/api/v1/agent/execute', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Financial Reporting & Analytics Engine (Phase 10)
  getAnalyticsTrialBalance: (params?: { companyId?: string; tenantId?: string; fromDate?: string; toDate?: string }) => {
    const sp = new URLSearchParams();
    if (params?.companyId) sp.append('company_id', params.companyId);
    if (params?.tenantId) sp.append('tenant_id', params.tenantId);
    if (params?.fromDate) sp.append('from_date', params.fromDate);
    if (params?.toDate) sp.append('to_date', params.toDate);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return request<ApiTrialBalanceReport>(`/api/analytics/trial-balance${qs}`, params?.companyId);
  },
  getAnalyticsIncomeStatement: (params?: { companyId?: string; tenantId?: string; fromDate?: string; toDate?: string }) => {
    const sp = new URLSearchParams();
    if (params?.companyId) sp.append('company_id', params.companyId);
    if (params?.tenantId) sp.append('tenant_id', params.tenantId);
    if (params?.fromDate) sp.append('from_date', params.fromDate);
    if (params?.toDate) sp.append('to_date', params.toDate);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return request<ApiIncomeStatementReport>(`/api/analytics/income-statement${qs}`, params?.companyId);
  },
  getAnalyticsBalanceSheet: (params?: { companyId?: string; tenantId?: string; asOfDate?: string }) => {
    const sp = new URLSearchParams();
    if (params?.companyId) sp.append('company_id', params.companyId);
    if (params?.tenantId) sp.append('tenant_id', params.tenantId);
    if (params?.asOfDate) sp.append('as_of_date', params.asOfDate);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return request<ApiBalanceSheetReport>(`/api/analytics/balance-sheet${qs}`, params?.companyId);
  },

  // Legacy System Resource Excel Import
  importLegacySystemResource: (file: File, companyId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{
      success: boolean;
      filename: string;
      imported_count: number;
      updated_count: number;
      skipped_count: number;
      records_processed: number;
      entities_created: {
        tickets: number;
        partners: number;
        materials: number;
      };
      errors: string[];
    }>('/api/v1/system/import-legacy', companyId, {
      method: 'POST',
      body: formData,
    });
  },

  // Enterprise Organizational Management (Hierarchical Profiles)
  getOrgTree: (rootId?: string, companyId?: string) =>
    request<OrgTreeNode[]>(
      rootId ? `/api/v1/organization/tree?root_id=${encodeURIComponent(rootId)}` : '/api/v1/organization/tree',
      companyId
    ),
  getOrgCompanies: (companyId?: string) =>
    request<any[]>('/api/v1/organization/companies', companyId),
  createOrgCompany: (payload: CreateBranchPayload, companyId?: string) =>
    request<any>('/api/v1/organization/companies', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateOrgCompany: (id: string, payload: Partial<CreateBranchPayload>, companyId?: string) =>
    request<any>(`/api/v1/organization/companies/${id}`, companyId, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteOrgCompany: (id: string, companyId?: string) =>
    request<any>(`/api/v1/organization/companies/${id}`, companyId, {
      method: 'DELETE',
    }),
  getCostCenters: (companyIdFilter?: string, activeCompanyId?: string) =>
    request<OrgCostCenter[]>(
      companyIdFilter ? `/api/v1/organization/cost-centers?company_id=${encodeURIComponent(companyIdFilter)}` : '/api/v1/organization/cost-centers',
      activeCompanyId
    ),
  createCostCenter: (payload: CreateCostCenterPayload, companyId?: string) =>
    request<OrgCostCenter>('/api/v1/organization/cost-centers', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCostCenter: (id: string, payload: Partial<CreateCostCenterPayload>, companyId?: string) =>
    request<OrgCostCenter>(`/api/v1/organization/cost-centers/${id}`, companyId, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteCostCenter: (id: string, companyId?: string) =>
    request<any>(`/api/v1/organization/cost-centers/${id}`, companyId, {
      method: 'DELETE',
    }),
  getPurchasingOrgs: (companyIdFilter?: string, activeCompanyId?: string) =>
    request<OrgPurchasingOrg[]>(
      companyIdFilter ? `/api/v1/organization/purchasing-orgs?company_id=${encodeURIComponent(companyIdFilter)}` : '/api/v1/organization/purchasing-orgs',
      activeCompanyId
    ),
  createPurchasingOrg: (payload: CreatePurchasingOrgPayload, companyId?: string) =>
    request<OrgPurchasingOrg>('/api/v1/organization/purchasing-orgs', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePurchasingOrg: (id: string, payload: Partial<CreatePurchasingOrgPayload>, companyId?: string) =>
    request<OrgPurchasingOrg>(`/api/v1/organization/purchasing-orgs/${id}`, companyId, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deletePurchasingOrg: (id: string, companyId?: string) =>
    request<any>(`/api/v1/organization/purchasing-orgs/${id}`, companyId, {
      method: 'DELETE',
    }),

  // Corporate Profile & Document Vault (Phase 8 Global Standard)
  getCorporateCvPayload: (companyId?: string, includeBranches: boolean = true) =>
    request<any>(
      `/api/v1/corporate/cv-payload?include_branches=${includeBranches}${companyId ? `&company_id=${encodeURIComponent(companyId)}` : ''}`,
      companyId
    ),
  getCorporateDocuments: (
    params?: { companyId?: string; documentType?: string; verificationStatus?: string },
    activeCompanyId?: string
  ) => {
    const query = new URLSearchParams();
    if (params?.companyId) query.append('company_id', params.companyId);
    if (params?.documentType) query.append('document_type', params.documentType);
    if (params?.verificationStatus) query.append('verification_status', params.verificationStatus);
    const queryString = query.toString();
    return request<TenantDocumentRecord[]>(
      queryString ? `/api/v1/corporate/documents?${queryString}` : '/api/v1/corporate/documents',
      activeCompanyId || params?.companyId
    );
  },
  getCorporateDocumentById: (id: string, companyId?: string) =>
    request<TenantDocumentRecord>(`/api/v1/corporate/documents/${id}`, companyId),
  createCorporateDocument: (payload: CreateTenantDocumentPayload, companyId?: string) =>
    request<TenantDocumentRecord>('/api/v1/corporate/documents', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCorporateDocument: (id: string, payload: UpdateTenantDocumentPayload, companyId?: string) =>
    request<TenantDocumentRecord>(`/api/v1/corporate/documents/${id}`, companyId, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteCorporateDocument: (id: string, companyId?: string) =>
    request<void>(`/api/v1/corporate/documents/${id}`, companyId, {
      method: 'DELETE',
    }),

  // Global Bulk Operations (BULK_OPERATIONS_ARCHITECTURE.md)
  bulkUpdateStatus: (payload: { ids: string[]; entity: string; is_active?: boolean; status?: string; reason?: string }, companyId?: string) =>
    request<{ success: boolean; affected_count: number; message: string }>('/api/v1/bulk/status', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  bulkDelete: (payload: { ids: string[]; entity: string; hard_delete?: boolean; confirm_phrase?: string }, companyId?: string) =>
    request<{ success: boolean; affected_count: number; message: string }>('/api/v1/bulk/delete', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  bulkTenantStatus: (payload: { ids: string[]; is_active?: boolean; status?: string; reason?: string }) =>
    request<{ success: boolean; affected_count: number; message: string }>('/api/v1/bulk/tenants/status', undefined, {
      method: 'POST',
      body: JSON.stringify({ ...payload, entity: 'tenants' }),
    }),
  bulkTenantDelete: (payload: { ids: string[]; hard_delete?: boolean }) =>
    request<{ success: boolean; affected_count: number; message: string }>('/api/v1/bulk/tenants/delete', undefined, {
      method: 'POST',
      body: JSON.stringify({ ...payload, entity: 'tenants' }),
    }),
  bulkProcurementStatus: (payload: { ids: string[]; entity: 'procurement_bills' | 'purchase_orders'; status: string }, companyId?: string) =>
    request<{ success: boolean; affected_count: number; message: string }>('/api/v1/bulk/procurement/status', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  bulkProcurementDelete: (payload: { ids: string[]; entity: 'procurement_bills' | 'purchase_orders'; hard_delete?: boolean }, companyId?: string) =>
    request<{ success: boolean; affected_count: number; message: string }>('/api/v1/bulk/procurement/delete', companyId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export interface TenantDocumentRecord {
  id: string;
  company_id: string;
  document_type: string;
  title: string;
  file_path: string;
  file_name: string;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  issuing_authority?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  verification_status: 'UNVERIFIED' | 'VERIFIED' | 'EXPIRED' | 'REJECTED';
  verified_at?: string | null;
  verified_by_user_id?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantDocumentPayload {
  document_type: string;
  title: string;
  file_path: string;
  file_name: string;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  issuing_authority?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  company_id?: string | null;
}

export interface UpdateTenantDocumentPayload {
  document_type?: string;
  title?: string;
  issuing_authority?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  verification_status?: 'UNVERIFIED' | 'VERIFIED' | 'EXPIRED' | 'REJECTED';
  notes?: string | null;
  is_active?: boolean;
}

export interface OrgCostCenter {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OrgPurchasingOrg {
  id: string;
  company_id: string;
  code: string;
  name: string;
  currency: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OrgTreeNode {
  id: string;
  name: string;
  slug: string;
  org_type: 'company_code' | 'branch';
  currency: string;
  is_active: boolean;
  parent_id?: string | null;
  branches: OrgTreeNode[];
  cost_centers: OrgCostCenter[];
  purchasing_organizations: OrgPurchasingOrg[];
}

export interface CreateBranchPayload {
  name: string;
  slug?: string;
  parent_id?: string | null;
  currency?: string;
  is_active?: boolean;
}

export interface CreateCostCenterPayload {
  company_id: string;
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface CreatePurchasingOrgPayload {
  company_id: string;
  code: string;
  name: string;
  currency?: string;
  is_active?: boolean;
}

export interface ApiInventoryMovement {
  id: string;
  tenant_id: string;
  company_id?: string;
  movement_number: string;
  movement_type: string;
  warehouse_id: string;
  warehouse_name?: string;
  product_id?: string;
  product_name?: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  reason?: string;
  reference?: string;
  status: string;
  is_posted: boolean;
  journal_entry_id?: string;
  created_at: string;
}

export interface ApiWarehouse {
  id: string;
  company_id: string;
  code: string;
  name: string;
  address?: string;
  is_active: boolean;
}

export interface ApiProduct {
  id: string;
  sku: string;
  name: string;
  product_type: string;
  unit_of_measure: string;
  standard_cost: number;
  sale_price: number;
  is_active: boolean;
}

export interface ApiInventoryValuationSummary {
  total_valuation: number;
  total_items: number;
  posted_movements: number;
  pending_movements: number;
}

export interface ApiFifoLayer {
  lot_number: string;
  received_date: string;
  remaining_qty: number;
  unit_cost: number;
  layer_total_value: number;
}

export interface ApiItemValuationDetail {
  item_id: string;
  sku: string;
  name: string;
  category: string;
  quantity_on_hand: number;
  unit_of_measure: string;
  valuation_method: string;
  effective_unit_cost: number;
  total_valuation: number;
  standard_cost: number;
  cost_variance: number;
  variance_percentage: number;
  fifo_layers: ApiFifoLayer[];
}

export interface ApiWarehouseValuationSummary {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  is_active: boolean;
  total_items_count: number;
  total_quantity_on_hand: number;
  total_valuation_sar: number;
}

export interface ApiMethodComparison {
  fifo_valuation_sar: number;
  weighted_average_sar: number;
  standard_cost_sar: number;
  variance_fifo_vs_wac_sar: number;
  variance_fifo_vs_standard_sar: number;
}

export interface ApiMultiWarehouseValuationReport {
  warehouse_ref: string;
  warehouse_name: string;
  valuation_method: string;
  currency: string;
  total_quantity: number;
  total_valuation: number;
  warehouses_audited: number;
  items_count: number;
  breakdown_by_item: ApiItemValuationDetail[];
  breakdown_by_warehouse: ApiWarehouseValuationSummary[];
  method_comparison: ApiMethodComparison;
  audit_narrative: string;
  timestamp: string;
}

export interface ApiProcurementBill {
  id: string;
  tenant_id: string;
  company_id?: string;
  invoice_number: string;
  vendor_id?: string;
  vendor_name?: string;
  purchase_order_id?: string;
  purchase_order_number?: string;
  goods_receipt_id?: string;
  invoice_date: string;
  due_date?: string;
  currency: string;
  amount: number;
  tax_amount: number;
  total_billed: number;
  match_status: 'MATCHED' | 'PENDING' | 'HOLD_DISCREPANCY';
  is_posted: boolean;
  journal_entry_id?: string;
  created_at: string;
}

export interface ApiCustomsManifest {
  id: string;
  tenant_id: string;
  company_id?: string;
  manifest_number: string;
  declaration_number?: string;
  declaration_type: 'IMPORT' | 'EXPORT' | 'TRANSIT';
  port_of_entry?: string;
  border_port_name: string;
  carrier_name?: string;
  status: string;
  clearance_status: 'CLEARED' | 'PENDING_DOCUMENTATION' | 'UNDER_INSPECTION' | 'HELD';
  zatca_compliance_status: 'REPORTED' | 'NOT_SUBMITTED' | 'REJECTED';
  duty_amount: number;
  vat_amount: number;
  total_customs_amount: number;
  total_value_sar: number;
  hs_codes: string[];
  payload_hash?: string;
  block_hash: string;
  previous_hash: string;
  block_index: number;
  created_at: string;
  updated_at: string;
  timestamp: string;
}

export interface CreateCustomsManifestPayload {
  manifest_number?: string;
  declaration_number?: string;
  declaration_type?: 'IMPORT' | 'EXPORT' | 'TRANSIT';
  port_of_entry?: string;
  border_port_name?: string;
  carrier_name?: string;
  status?: string;
  duty_amount?: number;
  vat_amount?: number;
  total_customs_amount?: number;
  total_value_sar?: number;
  hs_codes?: string[];
}

export interface ApiTenderLine {
  id: string;
  tender_id: string;
  line_number: number;
  item_code: string;
  description: string;
  quantity: number;
  uom: string;
  target_unit_price?: number;
  technical_specifications?: string;
  created_at: string;
}

export interface ApiProcurementTender {
  id: string;
  company_id: string;
  purchasing_organization_id: string;
  tender_number: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  submission_deadline: string;
  bid_opening_date: string;
  currency: string;
  estimated_budget?: number;
  is_sealed_bid: boolean;
  bids_unsealed: boolean;
  unsealed_at?: string;
  winning_bid_id?: string;
  awarded_purchase_order_id?: string;
  created_at: string;
  lines_count: number;
  bids_count: number;
  purchasing_org_name?: string;
  purchasing_org_code?: string;
  terms_and_conditions?: string;
  lines?: ApiTenderLine[];
}

export interface ApiBidLine {
  id: string;
  bid_id: string;
  tender_line_id: string;
  quoted_quantity: number;
  unit_price?: number;
  total_price?: number;
  notes?: string;
  is_alternative: boolean;
}

export interface ApiProcurementBid {
  id: string;
  tender_id: string;
  partner_id: string;
  bid_number: string;
  total_amount?: number;
  currency: string;
  sealed_quote_hash: string;
  is_sealed: boolean;
  unsealed_at?: string;
  status: string;
  technical_proposal?: string;
  commercial_terms?: string;
  delivery_lead_time_days: number;
  validity_period_days: number;
  evaluation_score?: number;
  evaluation_notes?: string;
  submission_timestamp: string;
  vendor_name?: string;
  lines: ApiBidLine[];
}

export interface ApiUnsealResponse {
  status: string;
  tender_id: string;
  tender_number: string;
  unsealed_at: string;
  bids_unsealed_count: number;
  bids: ApiProcurementBid[];
}

export interface ApiAwardResponse {
  status: string;
  tender_id: string;
  winning_bid_id: string;
  awarded_vendor_name: string;
  purchase_order_id: string;
  purchase_order_number: string;
  awarded_amount: number;
  currency: string;
}

export interface ApiVendorPortalUser {
  access_token: string;
  token_type: string;
  role: string;
  vendor_user_id: string;
  partner_id: string;
  company_id: string;
  company_name: string;
  contact_name: string;
  email: string;
}


// ==============================================================================
// P2P Three-Way Matching Engine Interfaces
// ==============================================================================

export interface P2PMatchLineDetail {
  line_number: number;
  description: string;
  po_qty: number;
  po_unit_price: number;
  po_line_total: number;
  grn_qty_received: number;
  invoice_qty: number;
  invoice_unit_price: number;
  invoice_line_total: number;
  qty_variance: number;
  price_variance: number;
  price_variance_pct: number;
  status: 'MATCHED' | 'QTY_SHORT' | 'PRICE_OVER' | 'HOLD';
}

export interface P2PDiscrepancyFlag {
  flag_id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category: string;
  description: string;
  expected_value: string;
  actual_value: string;
  variance: string;
  recommendation: string;
}

export interface P2PMatchResult {
  match_id: string;
  po_number: string;
  po_id: string;
  grn_number: string;
  grn_id: string;
  invoice_number: string;
  vendor_name: string;
  vendor_id: string;
  overall_status: 'MATCHED' | 'HOLD_DISCREPANCY' | 'PENDING';
  match_confidence: number;
  currency: string;
  po_total: number;
  grn_received_value: number;
  invoice_total: number;
  tax_amount: number;
  total_billed: number;
  total_qty_ordered: number;
  total_qty_received: number;
  total_qty_invoiced: number;
  qty_fill_rate: number;
  price_variance_sar: number;
  price_variance_pct: number;
  qty_variance_units: number;
  price_tolerance_pct: number;
  qty_tolerance_pct: number;
  line_matches: P2PMatchLineDetail[];
  discrepancy_flags: P2PDiscrepancyFlag[];
  matched_by: string;
  matched_at: string;
  narrative: string;
  resolution_action: string;
  journal_entry_id?: string;
}

export interface P2PSummaryResponse {
  kpis: {
    total_orders: number;
    matched: number;
    on_hold: number;
    match_rate_pct: number;
    total_po_value_sar: number;
    total_invoice_value_sar: number;
    total_discrepancy_flags: number;
    avg_match_confidence: number;
  };
  match_results: P2PMatchResult[];
  audit_narrative: string;
}
