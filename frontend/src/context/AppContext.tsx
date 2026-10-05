import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import i18n, { syncHtmlDirectionAndLanguage, LOCALE_STORAGE_KEY } from '../i18n';
import {
  db,
  doc,
  setDoc,
  getDocs,
  collection,
} from '../firebase';
import {
  User,
  Company,
  UserRole,
  Customer,
  Crusher,
  Transporter,
  MaterialOption,
  OperationRecord,
  CrusherPaymentEntry,
  DashboardKPIs,
  BrandConfig,
  EditApprovalRequest,
  AuditLogEntry,
  DigitalSignatureStamp,
  DocumentAttachment,
  CustomerInvoice,
  InvoiceVersion,
  FinancialVoucher,
  VoucherType,
  VoucherCategory,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_CUSTOMERS,
  INITIAL_CRUSHERS,
  INITIAL_TRANSPORTERS,
  MATERIAL_OPTIONS,
  INITIAL_CRUSHER_PAYMENTS,
  INITIAL_BRAND_CONFIG,
  INITIAL_EDIT_REQUESTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_FINANCIAL_VOUCHERS,
  generateInitialOperations,
} from '../data/mockData';
import { tafqeetArabic, tafqeetEnglish } from '../utils/tafqeet';
import {
  ApiCompany,
  ApiOperation,
  erpApi,
  getAuthToken,
  getAuthTier,
  getTenantSlug,
  setAuthSession,
  clearAuthSession,
  TwoTierAuthResponse,
  MasterLoginPayload,
  TenantLoginPayload,
  TwoTierTenantRegistrationPayload,
  PasswordRecoveryPayload,
  PasswordResetPayload,
  getActiveCompanyId,
  isValidUUID,
} from '../services/api';
import { getSubdomain, isApexDomain, getEffectiveDomainIdentifier, isCustomDomain, getCustomDomain } from '../utils/subdomain';
import { applyBrandingToDOM } from '../hooks/useDynamicBranding';
import {
  TenantColorTheme,
  DensityMode,
  ThemeMode,
  TENANT_PALETTES,
  DEFAULT_ISOLATION_TELEMETRY,
  IsolationTelemetry,
} from '../theme/designTokens';

interface DecodedTwoTierJwt {
  tier: 'master' | 'tenant';
  sub: string;
  identity?: string;
  role: string;
  tenant_id?: string | null;
  tenant_slug?: string | null;
  exp: number;
}

function decodeJwt(token: string): DecodedTwoTierJwt | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as DecodedTwoTierJwt;
  } catch {
    return null;
  }
}

function mapBackendRoleToFrontend(role?: string): UserRole {
  const r = (role || '').toLowerCase();
  if (r === 'super_admin' || r === 'master' || r === 'root') return 'Super_Admin';
  if (r === 'owner' || r === 'tenant_owner' || r === 'company_owner') return 'Owner';
  if (r === 'admin' || r === 'platform_admin' || r === 'ceo' || r === 'executive') return 'Admin';
  if (r === 'coo') return 'COO';
  if (r === 'accountant') return 'Accountant';
  if (r === 'data_entry' || r === 'user') return 'Data_Entry';
  if (r === 'guest_user' || r === 'guest') return 'Guest';
  return 'Guest'; // Least-privilege fallback
}

export const DEFAULT_FALLBACK_USER: User = {
  id: '',
  username: '',
  fullName: 'Guest User',
  fullNameAr: 'مستخدم غير مسجل',
  email: '',
  phone: '',
  role: 'Guest',
  status: 'Pending',
};

function sanitizeUserSession(rawUser: any): User {
  if (!rawUser || typeof rawUser !== 'object') {
    return DEFAULT_FALLBACK_USER;
  }
  const role = mapBackendRoleToFrontend(rawUser?.role);
  return {
    id: rawUser.id || '',
    username: rawUser.username || (rawUser.email ? String(rawUser.email).split('@')[0] : 'user'),
    fullName: rawUser.fullName || rawUser.fullNameAr || 'Guest User',
    fullNameAr: rawUser.fullNameAr || rawUser.fullName || 'مستخدم غير مسجل',
    email: rawUser.email || '',
    phone: rawUser.phone || rawUser.mobile || '',
    role: role || 'Guest',
    status: rawUser.status || 'Pending',
    companyId: rawUser.companyId || rawUser.company_id,
    assignedCustomerId: rawUser.assignedCustomerId,
  };
}

interface AppContextType {
  isAuthReady: boolean;
  currentUser: User;
  setCurrentUser: (user: User) => void;
  currentCompany: Company | null;
  setCurrentCompany: (company: Company) => void;
  companies: Company[];
  refreshCompanies: () => Promise<Company[]>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  refreshUsers: () => Promise<void>;
  language: 'ar' | 'en';
  setLanguage: (lang: 'ar' | 'en') => void;
  dir: 'rtl' | 'ltr';
  // Entities
  customers: Customer[];
  crushers: Crusher[];
  transporters: Transporter[];
  materials: MaterialOption[];
  operations: OperationRecord[];
  crusherPayments: CrusherPaymentEntry[];
  // Operations Actions
  refreshOperations: () => Promise<void>;
  refreshPartners: () => Promise<void>;
  addOperation: (op: Omit<OperationRecord, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateOperation: (id: string, op: Partial<OperationRecord>) => { success: boolean; requiresApproval?: boolean };
  deleteOperation: (id: string) => boolean;
  softDeleteOperation: (id: string) => void;
  restoreOperation: (id: string) => void;
  batchAddOperations: (ops: Omit<OperationRecord, 'id' | 'created_at' | 'updated_at'>[]) => void;
  overrideOperationRecord: (id: string, updates: Partial<OperationRecord>) => void;
  bulkOverrideOperations: (ids: string[], updates: Partial<OperationRecord>) => void;
  // Ledger Actions
  addCrusherPayment: (payment: Omit<CrusherPaymentEntry, 'id' | 'created_at'>) => void;
  deleteCrusherPayment: (id: string) => void;
  softDeleteCrusherPayment: (id: string) => void;
  // Entity CRUD - Customers
  addCustomer: (cust: Omit<Customer, 'id'>) => Promise<Customer>;
  updateCustomer: (id: string, cust: Partial<Customer>) => void;
  softDeleteCustomer: (id: string) => void;
  restoreCustomer: (id: string) => void;
  deleteCustomer: (id: string) => void;
  batchAddCustomers: (custs: Omit<Customer, 'id'>[], updateExisting?: boolean) => { addedCount: number; updatedCount: number };
  // Entity CRUD - Crushers
  addCrusher: (crush: Omit<Crusher, 'id'>) => Promise<Crusher>;
  updateCrusher: (id: string, crush: Partial<Crusher>) => void;
  softDeleteCrusher: (id: string) => void;
  restoreCrusher: (id: string) => void;
  deleteCrusher: (id: string) => void;
  batchAddCrushers: (crushes: Omit<Crusher, 'id'>[], updateExisting?: boolean) => { addedCount: number; updatedCount: number };
  // Entity CRUD - Transporters
  addTransporter: (trans: Omit<Transporter, 'id'>) => Promise<Transporter>;
  updateTransporter: (id: string, trans: Partial<Transporter>) => void;
  softDeleteTransporter: (id: string) => void;
  restoreTransporter: (id: string) => void;
  deleteTransporter: (id: string) => void;
  batchAddTransporters: (trans: Omit<Transporter, 'id'>[], updateExisting?: boolean) => { addedCount: number; updatedCount: number };
  // Entity CRUD - Materials
  addMaterial: (mat: Omit<MaterialOption, 'id'>) => MaterialOption;
  updateMaterial: (id: string, mat: Partial<MaterialOption>) => void;
  softDeleteMaterial: (id: string) => void;
  restoreMaterial: (id: string) => void;
  deleteMaterial: (id: string) => void;
  // Entity CRUD - Users
  addUser: (usr: Omit<User, 'id'>) => User;
  updateUser: (id: string, usr: Partial<User>) => void;
  softDeleteUser: (id: string) => void;
  restoreUser: (id: string) => void;
  deleteUser: (id: string) => void;
  // Approvals & Workflows
  editRequests: EditApprovalRequest[];
  createEditRequest: (req: Omit<EditApprovalRequest, 'id' | 'requestedAt' | 'status'>) => void;
  approveEditRequest: (id: string, reviewNotes?: string) => void;
  rejectEditRequest: (id: string, reviewNotes?: string) => void;
  // Brand Configuration & Dynamic Theming
  brandConfig: BrandConfig;
  updateBrandConfig: (config: Partial<BrandConfig>) => void;
  resetBrandConfig: () => void;
  // Digital Signatures
  signDocument: (docType: 'Invoice' | 'Statement' | 'Settlement', docId: string, signNotes?: string) => DigitalSignatureStamp;
  // Comprehensive Audit Trail
  auditLogs: AuditLogEntry[];
  logAuditAction: (entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'ipAddress'>) => void;
  clearAuditLogs: () => void;
  // Multi-Attachment System
  addAttachmentToRecord: (
    recordType: 'Operation' | 'Payment' | 'Invoice',
    recordId: string,
    attachment: Omit<DocumentAttachment, 'id' | 'uploadedAt' | 'uploadedBy'>
  ) => DocumentAttachment;
  removeAttachmentFromRecord: (
    recordType: 'Operation' | 'Payment' | 'Invoice',
    recordId: string,
    attachmentId: string
  ) => void;
  // Financial Vouchers (سندات القبض والصرف)
  vouchers: FinancialVoucher[];
  addVoucher: (vch: Omit<FinancialVoucher, 'id' | 'created_at' | 'updated_at' | 'amountInWordsAr'>) => FinancialVoucher;
  createVoucher: (vch: Omit<FinancialVoucher, 'id' | 'created_at' | 'updated_at' | 'amountInWordsAr'>) => Promise<FinancialVoucher>;
  updateVoucher: (id: string, updates: Partial<FinancialVoucher>) => void;
  deleteVoucher: (id: string) => boolean;
  approveVoucher: (id: string, reviewNotes?: string) => Promise<void>;
  autoGenerateVoucherFromPayment: (payment: CrusherPaymentEntry) => FinancialVoucher;
  // Offline / Quarry Sync Status
  isOnline: boolean;
  isLoadingData: boolean;
  // Native Authentication & Cloud Sync
  signOutAuth: () => Promise<void>;
  isNativeAuthSyncing: boolean;
  // Helpers & Security checks
  canAccessFinancials: boolean;
  canEditOperations: boolean;
  canDeleteRecords: boolean;
  canManageSettings: boolean;
  isAdmin: boolean;
  isCOO: boolean;
  isExecutive: boolean;
  canApproveEdits: boolean;
  canApproveInvoices: boolean;
  canApproveVouchers: boolean;
  canEditBranding: boolean;
  isGuestUser: boolean;
  assignedCustomerId?: string | null;
  // Driver View Mode (simplified access for transport / drivers)
  isDriverMode: boolean;
  setIsDriverMode: (val: boolean) => void;
  toggleDriverMode: () => void;
  exportDailyOperationsSnapshotJSON: (targetDate?: string) => void;
  // Filtered operations based on Guest privacy barrier
  accessibleOperations: OperationRecord[];
  activeOperations: OperationRecord[];
  softDeletedOperations: OperationRecord[];
  // Computed KPIs
  kpis: DashboardKPIs;
  resetToDefaults: () => void;
  // Unified Multi-Tenant Design System & Isolation Telemetry
  tenantTheme: TenantColorTheme;
  setTenantTheme: (theme: TenantColorTheme) => void;
  densityMode: DensityMode;
  setDensityMode: (density: DensityMode) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isolationTelemetry: IsolationTelemetry;
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  dismissToast: (id: string) => void;
  // Two-Tier Authentication Subsystem State
  authToken: string | null;
  authTier: 'master' | 'tenant' | null;
  tenantSlug: string | null;
  tenantId: string | null;
  isTwoTierAuthenticated: boolean;
  loginMaster: (payload: MasterLoginPayload) => Promise<TwoTierAuthResponse>;
  loginTenant: (payload: TenantLoginPayload) => Promise<TwoTierAuthResponse>;
  verifyTenantTwoFactor: (payload: {
    two_factor_token: string;
    code: string;
    tenant?: string;
    tenant_slug?: string;
    workspace_slug?: string;
    email?: string;
  }) => Promise<TwoTierAuthResponse>;
  registerTenantAccount: (payload: TwoTierTenantRegistrationPayload) => Promise<any>;
  recoverUserPassword: (payload: PasswordRecoveryPayload) => Promise<any>;
  resetUserPassword: (payload: PasswordResetPayload) => Promise<any>;
  logoutUser: () => Promise<void>;
  authErrorMessage: string | null;
  setAuthErrorMessage: (msg: string | null) => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const recentToastKeys = useRef(new Map<string, { id: string; createdAt: number; visibleUntil: number }>());

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const now = Date.now();
    const key = `${type}\u0000${message}`;
    const previous = recentToastKeys.current.get(key);
    if (previous && (now - previous.createdAt < 3000 || previous.visibleUntil > now)) return;

    const id = `toast-${now}-${Math.random().toString(36).slice(2, 7)}`;
    recentToastKeys.current.set(key, { id, createdAt: now, visibleUntil: now + 4000 });
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      if (recentToastKeys.current.get(key)?.id === id) recentToastKeys.current.delete(key);
    }, 4000);
  };

  useEffect(() => {
    const handleGlobalToast = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; type?: 'info' | 'success' | 'warning' | 'error' }>;
      if (customEvent.detail?.message) {
        showToast(customEvent.detail.message, customEvent.detail.type || 'error');
      }
    };
    window.addEventListener('oxengl-toast', handleGlobalToast);
    return () => {
      window.removeEventListener('oxengl-toast', handleGlobalToast);
    };
  }, []);

  const [language, setLanguageState] = useState<'ar' | 'en'>(() => {
    const stored = (localStorage.getItem(LOCALE_STORAGE_KEY) as 'ar' | 'en') || (localStorage.getItem('oxengl_language') as 'ar' | 'en');
    return stored === 'en' ? 'en' : 'ar';
  });

  const setLanguage = (lang: 'ar' | 'en') => {
    setLanguageState(lang);
    localStorage.setItem(LOCALE_STORAGE_KEY, lang);
    localStorage.setItem('oxengl_language', lang);
    i18n.changeLanguage(lang);
    syncHtmlDirectionAndLanguage(lang);
  };

  useEffect(() => {
    syncHtmlDirectionAndLanguage(language);
  }, [language]);

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  // Two-Tier Authentication Subsystem State
  const [authToken, setAuthToken] = useState<string | null>(() => getAuthToken());
  const [authTier, setAuthTier] = useState<'master' | 'tenant' | null>(() => getAuthTier());
  const [tenantSlug, setTenantSlug] = useState<string | null>(() => getTenantSlug());
  const [tenantId, setTenantId] = useState<string | null>(() => {
    const token = getAuthToken();
    if (!token) return null;
    const claims = decodeJwt(token);
    return claims?.tenant_id || null;
  });
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const isTwoTierAuthenticated = Boolean(authToken && authTier);

  // Validate token expiration on mount and listen to global auth error events
  useEffect(() => {
    const activeDomain = getEffectiveDomainIdentifier();
    if (activeDomain) {
      setTenantSlug(activeDomain);
      setAuthTier('tenant');
      localStorage.setItem('oxengl_tenant_slug', activeDomain);
      localStorage.setItem('tenant_slug', activeDomain);
    }
    const token = getAuthToken();
    if (token) {
      const claims = decodeJwt(token);
      if (!claims || (claims.exp && claims.exp * 1000 < Date.now())) {
        clearAuthSession();
        setAuthToken(null);
        setAuthTier(activeDomain ? 'tenant' : null);
        if (!activeDomain) {
          setTenantSlug(null);
          setTenantId(null);
        }
        localStorage.setItem('oxengl_session_active', 'false');
      } else {
        setAuthTier(activeDomain ? 'tenant' : claims.tier);
        if (activeDomain) {
          setTenantSlug(activeDomain);
        } else if (claims.tenant_slug) {
          setTenantSlug(claims.tenant_slug);
        }
        if (claims.tenant_id) setTenantId(claims.tenant_id);
      }
    }
  }, []);

  useEffect(() => {
    const handleAuthError = (event: Event) => {
      const customEvent = event as CustomEvent<{ status: number; message: string }>;
      if (customEvent.detail?.status === 401) {
        setAuthToken(null);
        setAuthTier(null);
        setTenantSlug(null);
        setTenantId(null);
        localStorage.setItem('oxengl_session_active', 'false');
      }
      setAuthErrorMessage(customEvent.detail?.message || 'Authentication error');
    };
    window.addEventListener('oxengl-auth-error', handleAuthError);
    return () => window.removeEventListener('oxengl-auth-error', handleAuthError);
  }, []);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(() => {
    const activeDomain = getEffectiveDomainIdentifier();
    const activeUuid = getActiveCompanyId();
    if (activeDomain) {
      const saved = localStorage.getItem('oxengl_current_company');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const matches =
            parsed.slug?.toLowerCase() === activeDomain.toLowerCase() ||
            (parsed as any).domain_slug?.toLowerCase() === activeDomain.toLowerCase() ||
            (parsed as any).custom_domain?.toLowerCase() === activeDomain.toLowerCase() ||
            (parsed as any).domain?.toLowerCase() === activeDomain.toLowerCase();
          if (matches) {
            if (activeUuid && !isValidUUID(parsed.id)) {
              parsed.id = activeUuid;
            }
            return parsed;
          }
        } catch {}
      }
      return {
        id: activeUuid || activeDomain,
        name: activeDomain.toUpperCase(),
        slug: activeDomain,
        currency: 'SAR',
        subscriptionTier: 'ENTERPRISE',
      };
    }
    const isRoot = typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '');
    const token = getAuthToken();
    const tier = getAuthTier();
    if (isRoot && (!token || tier === 'master')) {
      return null;
    }
    const saved = localStorage.getItem('oxengl_current_company');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (activeUuid && !isValidUUID(parsed.id)) {
          parsed.id = activeUuid;
        }
        return parsed;
      } catch {}
    }
    return null;
  });

  const refreshCompanies = async (): Promise<Company[]> => {
    const apiCompanies = await erpApi.getCompanies();
    const mapped = apiCompanies.map((company) => ({
      id: company.id,
      parentId: company.parent_id,
      name: company.name,
      slug: company.slug,
      domain_slug: (company as any).domain_slug || company.slug,
      custom_domain: (company as any).custom_domain || (company as any).domain,
      commercialRegistration: company.commercial_registration || undefined,
      taxId: company.tax_id || undefined,
      currency: company.currency,
      fiscalCalendar: company.fiscal_calendar,
      fiscalYearStartMonth: company.fiscal_year_start_month,
      taxRegime: company.tax_regime,
      subscriptionTier: company.subscription_tier,
      licenseKey: company.license_key,
      licenseExpiresAt: company.license_expires_at,
      maxCostCenters: company.max_cost_centers,
      themeMode: company.theme_mode,
      uiPrimaryColor: company.ui_primary_color,
      uiLogoUrl: company.ui_logo_url,
      logo_url: company.ui_logo_url || (company as any).logo_url,
      branding_context: (company as any).branding_context || {
        custom_logo: Boolean(company.ui_logo_url || (company as any).logo_url),
        logo_url: company.ui_logo_url || (company as any).logo_url || null,
        primary_color: company.ui_primary_color || (company as any).primary_color || '#F05627',
        theme_mode: company.theme_mode || 'CUSTOM',
      },
    }));
    setCompanies(mapped);
    setCurrentCompany((selected) => {
      const activeDomain = getEffectiveDomainIdentifier();
      const activeUuid = getActiveCompanyId();
      if (activeDomain) {
        const foundByDomain = mapped.find((company) =>
          company.slug?.toLowerCase() === activeDomain.toLowerCase() ||
          (company as any).domain_slug?.toLowerCase() === activeDomain.toLowerCase() ||
          (company as any).custom_domain?.toLowerCase() === activeDomain.toLowerCase() ||
          (company as any).domain?.toLowerCase() === activeDomain.toLowerCase()
        );
        if (foundByDomain) return foundByDomain;
        return {
          id: activeUuid || activeDomain,
          name: activeDomain.toUpperCase(),
          slug: activeDomain,
          currency: 'SAR',
          subscriptionTier: 'ENTERPRISE',
          branding_context: {
            custom_logo: false,
            logo_url: null,
            primary_color: '#F05627',
            theme_mode: 'CUSTOM',
          },
        };
      }
      const activeTenantId = localStorage.getItem('oxengl_tenant_id') || localStorage.getItem('tenant_id') || currentUser?.companyId;
      const activeTenantSlug = localStorage.getItem('oxengl_tenant_slug') || localStorage.getItem('tenant_slug');
      if (activeTenantId) {
        const foundById = mapped.find((company) => company.id === activeTenantId);
        if (foundById) return foundById;
      }
      if (activeTenantSlug) {
        const foundBySlug = mapped.find((company) => company.slug === activeTenantSlug);
        if (foundBySlug) return foundBySlug;
      }
      if (selected && mapped.some((company) => company.id === selected.id)) {
        return selected;
      }
      return null;
    });
    return mapped;
  };

  // Brand Configuration State (Dynamically derived from active company session)
  const [brandConfig, setBrandConfig] = useState<BrandConfig>(() => {
    const activeDomain = getEffectiveDomainIdentifier();
    if (activeDomain) {
      const saved = localStorage.getItem('oxengl_brand_config');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
      return {
        ...INITIAL_BRAND_CONFIG,
        companyNameAr: activeDomain.toUpperCase(),
        companyNameEn: activeDomain.toUpperCase(),
      };
    }
    const isRoot = typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '');
    const token = getAuthToken();
    const tier = getAuthTier();
    if (isRoot && (!token || tier === 'master')) {
      return INITIAL_BRAND_CONFIG;
    }
    const saved = localStorage.getItem('oxengl_brand_config');
    return saved ? JSON.parse(saved) : INITIAL_BRAND_CONFIG;
  });

  // Users State (Authoritative Tenant Accounts)
  const [users, setUsers] = useState<User[]>([]);

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('oxengl_user') || localStorage.getItem('user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return sanitizeUserSession(parsed);
        }
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_FALLBACK_USER;
  });

  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  useEffect(() => {
    setIsAuthReady(true);
    const token = localStorage.getItem('token') || localStorage.getItem('oxengl_auth_jwt');
    if (token) {
      refreshUsers();
    }
  }, []);

  // Entities State - Decoupled from LocalStorage (Authoritative PostgreSQL sync)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [crushers, setCrushers] = useState<Crusher[]>([]);
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [crusherPayments, setCrusherPayments] = useState<CrusherPaymentEntry[]>([]);
  const [vouchers, setVouchers] = useState<FinancialVoucher[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);

  const mapApiOperation = (operation: ApiOperation): OperationRecord => {
    const loadedWeight = operation.qty_loaded != null ? Number(operation.qty_loaded) : Number(operation.gross_weight);
    const deliveredWeight = operation.qty_delivered != null ? Number(operation.qty_delivered) : Number(operation.net_weight);
    const wastageWeight = operation.qty_wastage != null ? Number(operation.qty_wastage) : Number((loadedWeight - deliveredWeight).toFixed(4));
    const weighedAt = operation.weighed_in_at;
    const operationDate = weighedAt.slice(0, 10);
    const operationMonth = operation.operation_month ?? (new Date(weighedAt).getMonth() + 1);
    const operationYear = operation.operation_year ?? new Date(weighedAt).getFullYear();

    const wastagePct = operation.wastage_percentage != null
      ? Number(operation.wastage_percentage)
      : (loadedWeight > 0 ? Number(((wastageWeight / loadedWeight) * 100).toFixed(4)) : 0);

    return {
      id: operation.picking_id,
      loading_date: operationDate,
      truck_no: operation.truck_number,
      transporter_name: operation.service_supplier_name || operation.partner_name || 'Unknown Transporter',
      loading_source: operation.material_supplier_name || operation.source_location_name,
      loading_invoice_no: operation.loading_invoice_no || operation.picking_reference,
      destination_customer: operation.destination_customer_name || operation.dest_location_name,
      receipt_invoice_no: operation.receipt_invoice_no || operation.ticket_number,
      material_type: operation.material_type || operation.product_name,
      uom: operation.uom || operation.unit_of_measure || 'MT',
      qty_loaded: loadedWeight,
      qty_delivered: deliveredWeight,
      qty_wastage: wastageWeight,
      wastage_percentage: wastagePct,
      scale_ticket_no: operation.ticket_number,
      sales_amount: Number(operation.sales_amount || 0),
      vat_amount: Number(operation.vat_amount || 0),
      total_sales: Number(operation.total_sales || 0),
      purchases_cost: Number(operation.purchases_cost || 0),
      crusher_payment: Number(operation.crusher_payment || 0),
      net_profit: Number(operation.net_profit || 0),
      operation_month: operationMonth,
      operation_year: operationYear,
      created_at: weighedAt,
      updated_at: weighedAt,
      attachments: operation.attachments || [],
      scale_ticket_attachment: operation.scale_ticket_attachment || '',
    };
  };

  // Offline / Quarry Connection Status Tracker
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  // Synchronize Brand Configuration from Active Tenant Context
  useEffect(() => {
    if (currentCompany) {
      setBrandConfig((prev) => ({
        ...prev,
        companyNameAr: currentCompany.name,
        companyNameEn: currentCompany.name,
        crNumber: currentCompany.commercialRegistration || '',
        taxNumber: currentCompany.taxId || '',
        primaryColor: currentCompany.uiPrimaryColor || '#F05627',
        customLogoUrl: currentCompany.uiLogoUrl || (currentCompany as any).logo_url || prev.customLogoUrl,
      }));
    }
  }, [currentCompany]);

  // Synchronize all operational entities directly with PostgreSQL backend
  useEffect(() => {
    if (!isOnline || !currentCompany) {
      setOperations([]);
      setCustomers([]);
      setCrushers([]);
      setTransporters([]);
      setVouchers([]);
      return;
    }

    setIsLoadingData(true);

    const fetchOperations = erpApi
      .getOperations(currentCompany.id)
      .then((serverOperations) => {
        setOperations(Array.isArray(serverOperations) ? serverOperations.map(mapApiOperation) : []);
      })
      .catch((error) => console.warn('Operations API unavailable:', error));

    const fetchPartners = erpApi
      .getPartners(currentCompany.id)
      .then((partners) => {
        if (!partners || !Array.isArray(partners)) {
          setCustomers([]);
          setCrushers([]);
          setTransporters([]);
          return;
        }

        const apiCustomers: Customer[] = partners
          .filter((p) => p.partner_type === 'customer')
          .map((p) => ({
            id: p.id,
            customerName: p.name,
            customerNameEn: p.name,
            taxNumber: p.tax_number || '',
            crNumber: p.commercial_registration || '',
            contactPerson: '',
            phone: p.phone || '',
            email: p.email || '',
            address: '',
            openingBalance: 0,
            creditLimit: 0,
            is_deleted: false,
          }));

        const apiCrushers: Crusher[] = partners
          .filter((p) => ['supplier', 'raw_materials_supplier', 'quarry'].includes(p.partner_type))
          .map((p) => ({
            id: p.id,
            crusherName: p.name,
            crusherNameEn: p.name,
            location: '',
            bankDetails: '',
            taxNumber: p.tax_number || '',
            openingBalance: 0,
            phone: p.phone || '',
            is_deleted: false,
          }));

        const apiTransporters: Transporter[] = partners
          .filter((p) => ['transporter', 'service_supplier', 'logistics'].includes(p.partner_type))
          .map((p) => ({
            id: p.id,
            transporterName: p.name,
            transporterNameEn: p.name,
            driverName: '',
            phone: p.phone || '',
            truckDetails: '',
            is_deleted: false,
          }));

        setCustomers(Array.from(new Map(apiCustomers.map((c) => [c.id, c])).values()));
        setCrushers(Array.from(new Map(apiCrushers.map((c) => [c.id, c])).values()));
        setTransporters(Array.from(new Map(apiTransporters.map((t) => [t.id, t])).values()));
      })
      .catch((error) => console.warn('Partners API unavailable:', error));

    const fetchMaterials = erpApi
      .getProducts(currentCompany.id)
      .then((products) => {
        const mappedMaterials: MaterialOption[] = (Array.isArray(products) ? products : []).map((product: any) => ({
          id: product.id,
          nameAr: product.name,
          nameEn: product.name,
          category: 'Aggregate',
          defaultPurchasePrice: Number(product.standard_cost || 0),
          defaultSellingPrice: Number(product.sale_price || 0),
          unit: product.unit_of_measure || 'MT',
          is_deleted: false,
        }));
        setMaterials(Array.from(new Map(mappedMaterials.map((material) => [material.id, material])).values()));
      })
      .catch((error) => console.warn('Materials API unavailable:', error));

    const fetchVouchers = erpApi
      .getVouchers(currentCompany.id)
      .then((serverVouchers) => {
        if (Array.isArray(serverVouchers)) {
          const mappedVouchers: FinancialVoucher[] = serverVouchers.map((v: any) => ({
            id: v.id || v.entry_number || `vch-${Date.now()}`,
            voucherNumber: v.entry_number || v.voucherNumber || `VCH-${v.id?.slice(0, 8) || '0001'}`,
            type: (v.type || 'Payment') as VoucherType,
            category: (v.category || 'General') as VoucherCategory,
            date: v.entry_date ? v.entry_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
            amount: Number(v.total_debit || v.amount || 0),
            amountInWordsAr: tafqeetArabic(Number(v.total_debit || v.amount || 0)),
            amountInWordsEn: tafqeetEnglish(Number(v.total_debit || v.amount || 0)),
            partyType: 'Other',
            partyName: v.description || 'General Ledger Entry',
            paymentMethod: 'Bank Transfer',
            purpose: v.description || '',
            month: v.entry_date ? new Date(v.entry_date).getMonth() + 1 : new Date().getMonth() + 1,
            year: v.entry_date ? new Date(v.entry_date).getFullYear() : new Date().getFullYear(),
            preparedBy: 'System',
            isApproved: v.status === 'POSTED' || v.status === 'Approved',
            status: v.status === 'POSTED' ? 'Approved' : 'Draft',
            created_at: v.entry_date || new Date().toISOString(),
            updated_at: v.entry_date || new Date().toISOString(),
          }));
          setVouchers(Array.from(new Map(mappedVouchers.map((voucher) => [voucher.id, voucher])).values()));
        }
      })
      .catch((error) => console.warn('Vouchers API unavailable:', error));

    Promise.allSettled([fetchOperations, fetchPartners, fetchMaterials, fetchVouchers]).finally(() => {
      setIsLoadingData(false);
    });
  }, [isOnline, currentCompany]);

  useEffect(() => {
    refreshCompanies().catch((error) => console.warn('Company directory unavailable:', error));
  }, []);

  useEffect(() => {
    if (currentCompany) {
      localStorage.setItem('oxengl_current_company', JSON.stringify(currentCompany));
      if (currentCompany.id && isValidUUID(currentCompany.id)) {
        localStorage.setItem('oxengl_tenant_id', currentCompany.id);
        localStorage.setItem('tenant_id', currentCompany.id);
        localStorage.setItem('company_id', currentCompany.id);
      }
      if (currentCompany.slug) {
        localStorage.setItem('oxengl_tenant_slug', currentCompany.slug);
        localStorage.setItem('tenant_slug', currentCompany.slug);
      }
    }
  }, [currentCompany]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Workflows & Approvals State
  const [editRequests, setEditRequests] = useState<EditApprovalRequest[]>([]);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Driver View Mode State (simplified UI for drivers and logistics field operations)
  const [isDriverMode, setIsDriverMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('oxengl_driver_mode');
    return saved === 'true';
  });

  const toggleDriverMode = () => {
    setIsDriverMode((prev) => {
      const next = !prev;
      localStorage.setItem('oxengl_driver_mode', String(next));
      return next;
    });
  };

  useEffect(() => {
    localStorage.setItem('oxengl_driver_mode', String(isDriverMode));
  }, [isDriverMode]);

  // Unified Multi-Tenant Design System State
  const [tenantTheme, setTenantThemeState] = useState<TenantColorTheme>(() => {
    return (localStorage.getItem('oxengl_tenant_theme') as TenantColorTheme) || 'orange';
  });

  const [densityMode, setDensityModeState] = useState<DensityMode>(() => {
    return (localStorage.getItem('oxengl_density_mode') as DensityMode) || 'compact';
  });

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('oxengl_theme_mode') as ThemeMode) || 'dark';
  });

  const [isolationTelemetry] = useState<IsolationTelemetry>(DEFAULT_ISOLATION_TELEMETRY);

  const setTenantTheme = (theme: TenantColorTheme) => {
    setTenantThemeState(theme);
    localStorage.setItem('oxengl_tenant_theme', theme);
  };

  const setDensityMode = (density: DensityMode) => {
    setDensityModeState(density);
    localStorage.setItem('oxengl_density_mode', density);
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('oxengl_theme_mode', mode);
  };

  // Sync design system theme, density, and CSS variables across document
  useEffect(() => {
    const palette = TENANT_PALETTES[tenantTheme] || TENANT_PALETTES.orange;
    const root = document.documentElement;

    root.setAttribute('data-theme-mode', themeMode);
    root.setAttribute('data-density', densityMode);
    root.setAttribute('data-tenant-theme', tenantTheme);
    root.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    root.setAttribute('lang', language);

    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const primary = currentCompany?.uiPrimaryColor || palette.primary;
    const secondary = currentCompany?.uiSecondaryColor || palette.secondary;
    root.style.setProperty('--tenant-primary', primary);
    root.style.setProperty('--tenant-primary-hover', palette.primaryHover);
    root.style.setProperty('--tenant-primary-light', palette.primaryLight);
    root.style.setProperty('--tenant-secondary', secondary);
    root.style.setProperty('--tenant-glow', palette.glow);
    root.style.setProperty('--tenant-surface', palette.surfaceAccent);
    root.style.setProperty('--tenant-border', palette.badgeBorder);
  }, [tenantTheme, themeMode, densityMode, currentCompany, language]);

  // Export JSON Snapshot of daily operations for auditing
  const exportDailyOperationsSnapshotJSON = (targetDate?: string) => {
    const todayStr = targetDate || new Date().toISOString().split('T')[0];
    const dayOps = accessibleOperations.filter((op) => {
      if (op.is_deleted) return false;
      return op.date.startsWith(todayStr) || (targetDate ? op.date === targetDate : true);
    });

    const snapshot = {
      snapshotId: `OXEN-OPS-SNAP-${Date.now()}`,
      version: '1.0.0-PROD',
      exportTimestamp: new Date().toISOString(),
      snapshotTargetDate: todayStr,
      company: {
        nameAr: brandConfig.companyNameAr,
        nameEn: brandConfig.companyNameEn,
        crNumber: brandConfig.crNumber,
        taxNumber: brandConfig.taxNumber,
        address: brandConfig.addressAr,
        email: brandConfig.email,
        phone: brandConfig.phone,
      },
      exportedBy: {
        userId: currentUser?.id ?? 'usr_fallback',
        name: currentUser?.fullNameAr || currentUser?.fullName || 'User',
        email: currentUser?.email ?? '',
        role: currentUser?.role ?? 'Guest',
      },
      metricsSummary: {
        totalTripCount: dayOps.length,
        totalLoadedTonnage: Number(dayOps.reduce((sum, o) => sum + (o.qty_loaded || 0), 0).toFixed(3)),
        totalDeliveredTonnage: Number(dayOps.reduce((sum, o) => sum + (o.qty_delivered || 0), 0).toFixed(3)),
        totalWastageTonnage: Number(dayOps.reduce((sum, o) => sum + (o.qty_wastage || 0), 0).toFixed(3)),
        totalSalesAmountSAR: Number(dayOps.reduce((sum, o) => sum + (o.sales_amount || 0), 0).toFixed(2)),
        totalTransporterCostSAR: Number(dayOps.reduce((sum, o) => sum + (o.transporter_cost_amount || 0), 0).toFixed(2)),
        totalCrusherCostSAR: Number(dayOps.reduce((sum, o) => sum + (o.crusher_cost_amount || 0), 0).toFixed(2)),
        netMarginSAR: Number(
          dayOps
            .reduce((sum, o) => sum + (o.sales_amount || 0) - (o.transporter_cost_amount || 0) - (o.crusher_cost_amount || 0), 0)
            .toFixed(2)
        ),
      },
      cryptographicAuditStamp: {
        algorithm: 'SHA-256-DIGEST',
        stampHash: `OXEN-HEX-${Math.random().toString(36).substring(2, 12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        status: 'TAMPER_VERIFIED',
      },
      operations: dayOps,
    };

    const jsonString = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `OxenGL_Operations_Snapshot_${todayStr}_${Date.now().toString().slice(-4)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Sync active user session to LocalStorage
  useEffect(() => {
    if (currentUser && currentUser.id !== 'usr_default') {
      localStorage.setItem('oxengl_user', JSON.stringify(currentUser));
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('oxengl_brand_config', JSON.stringify(brandConfig));
  }, [brandConfig]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
  }, [language]);

  // Inject dynamic CSS custom properties for Brand Theming
  useEffect(() => {
    const primaryColor = currentCompany?.uiPrimaryColor || brandConfig.primaryColor || '#f97316';
    const secondaryColor = currentCompany?.uiSecondaryColor || brandConfig.secondaryColor || '#0f172a';
    if (primaryColor) {
      document.documentElement.style.setProperty('--color-primary', primaryColor);
      document.documentElement.style.setProperty('--primary-color', primaryColor);
      document.documentElement.style.setProperty('--brand-primary', primaryColor);
      document.documentElement.style.setProperty('--tenant-primary', primaryColor);
    }
    if (secondaryColor) {
      document.documentElement.style.setProperty('--color-accent', secondaryColor);
      document.documentElement.style.setProperty('--secondary-color', secondaryColor);
      document.documentElement.style.setProperty('--brand-secondary', secondaryColor);
      document.documentElement.style.setProperty('--tenant-secondary', secondaryColor);
    }
  }, [brandConfig, currentCompany]);

  // Synchronize dynamic two-tier branding on mount and tenant/route transitions
  useEffect(() => {
    let isCancelled = false;

    const loadDynamicBranding = async () => {
      const isApex = typeof window !== 'undefined' ? isApexDomain() : true;
      const isRoot = typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '');
      const token = getAuthToken();
      const tier = getAuthTier();
      const storedSlug = getTenantSlug();
      const sub = typeof window !== 'undefined' ? getSubdomain() : null;
      const isCustom = typeof window !== 'undefined' ? isCustomDomain() : false;

      const isTenantActive = Boolean(
        (sub && sub !== 'www' && sub !== 'app' && sub !== 'api' && sub !== 'admin') ||
        isCustom ||
        (!isApex && tier !== 'master') ||
        (tier === 'tenant' && (storedSlug || currentCompany)) ||
        (currentCompany && !isApex)
      );

      if (isTenantActive) {
        try {
          const targetId = currentCompany?.id || storedSlug || undefined;
          const tenantBranding = await erpApi.getTenantBranding(targetId);
          if (tenantBranding && !isCancelled) {
            setBrandConfig((prev) => ({
              ...prev,
              companyNameEn: tenantBranding.brand_name || prev.companyNameEn,
              companyNameAr: tenantBranding.brand_name || prev.companyNameAr,
              primaryColor: tenantBranding.primary_color || prev.primaryColor,
              secondaryColor: tenantBranding.accent_color || prev.secondaryColor,
              customLogoUrl: tenantBranding.logo_url || prev.customLogoUrl,
            }));
            applyBrandingToDOM({
              isTenant: true,
              tenantId: tenantBranding.tenant_id,
              brandName: tenantBranding.brand_name,
              logoUrl: tenantBranding.logo_url,
              faviconUrl: tenantBranding.favicon_url,
              primaryColor: tenantBranding.primary_color,
              accentColor: tenantBranding.accent_color,
              customDomain: tenantBranding.custom_domain,
            });
            return;
          }
        } catch (e) {
          console.warn('[OxenGL Branding] Tenant dynamic fetch fallback:', e);
        }
      }

      // Public landing page / Apex Root: Fetch and apply global platform branding defaults
      try {
        const platformBranding = await erpApi.getPlatformBranding();
        if (platformBranding && !isCancelled) {
          setBrandConfig((prev) => ({
            ...prev,
            companyNameEn: platformBranding.company_name_en || platformBranding.platform_name || prev.companyNameEn,
            companyNameAr: platformBranding.company_name_ar || prev.companyNameAr,
            primaryColor: platformBranding.primary_color || prev.primaryColor,
            secondaryColor: platformBranding.accent_color || prev.secondaryColor,
            customLogoUrl: platformBranding.logo_url || platformBranding.default_logo || prev.customLogoUrl,
            platformLogoUrl: platformBranding.logo_url || platformBranding.default_logo,
            email: platformBranding.support_email || prev.email,
            phone: platformBranding.support_phone || prev.phone,
          }));
          applyBrandingToDOM({
            isTenant: false,
            brandName: platformBranding.brand_name || platformBranding.platform_name,
            platformName: platformBranding.platform_name,
            logoUrl: platformBranding.logo_url || platformBranding.default_logo,
            faviconUrl: platformBranding.favicon_url || platformBranding.default_favicon,
            primaryColor: platformBranding.primary_color,
            accentColor: platformBranding.accent_color,
            companyNameAr: platformBranding.company_name_ar,
            companyNameEn: platformBranding.company_name_en,
            supportEmail: platformBranding.support_email,
            supportPhone: platformBranding.support_phone,
          });
        }
      } catch (e) {
        console.warn('[OxenGL Branding] Global platform branding fallback:', e);
      }
    };

    loadDynamicBranding();

    const handleLocationChange = () => {
      const isApexRoot = typeof window !== 'undefined' && isApexDomain() && (window.location.pathname === '/' || window.location.pathname === '');
      const token = getAuthToken();
      const tier = getAuthTier();
      if (isApexRoot && (!token || tier === 'master')) {
        setCurrentCompany(null);
      }
      loadDynamicBranding();
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      isCancelled = true;
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, [currentCompany]);


  // Native Authentication & Sync State
  const [isNativeAuthSyncing] = useState<boolean>(false);

  // Sync BrandConfig to Firestore when updated
  useEffect(() => {
    if (db && brandConfig) {
      try {
        setDoc(doc(db, 'brand_config', 'default'), brandConfig, { merge: true }).catch(() => {});
      } catch (e) {}
    }
  }, [brandConfig]);

  const logoutUser = async (): Promise<void> => {
    try {
      await erpApi.logout();
    } catch (err) {
      console.warn('Server logout failed; clearing local session state:', err);
    }
    clearAuthSession();
    setAuthToken(null);
    setAuthTier(null);
    setTenantSlug(null);
    setTenantId(null);
    localStorage.removeItem('oxengl_session_active');
    localStorage.removeItem('oxengl_recovery_session');
    localStorage.removeItem('oxengl_user');
    localStorage.removeItem('oxengl_current_company');
    localStorage.removeItem('oxengl_brand_config');
    localStorage.removeItem('oxengl_tenant_id');
    localStorage.removeItem('oxengl_tenant_slug');
    setCurrentCompany(null);
    setBrandConfig(INITIAL_BRAND_CONFIG);
    setCurrentUser(DEFAULT_FALLBACK_USER);
    showToast(language === 'ar' ? 'تم تسجيل الخروج بأمان' : 'Signed out securely', 'info');
  };

  const signOutAuth = async (): Promise<void> => {
    await logoutUser();
  };

  const loginMaster = async (payload: MasterLoginPayload): Promise<TwoTierAuthResponse> => {
    setAuthErrorMessage(null);
    const res = await erpApi.masterLogin(payload);
    if (res?.access_token) {
      setAuthSession(res.access_token, 'master', null);
      setAuthToken(res.access_token);
      localStorage.setItem('token', res.access_token);
      localStorage.setItem('oxengl_auth_jwt', res.access_token);
    }
    setAuthTier('master');
    setTenantSlug(null);
    setTenantId(null);

    const mappedRole = mapBackendRoleToFrontend(res?.role ?? res?.user?.role);
    const userObj = res?.user;
    const email = userObj?.email ?? (payload.identity.includes('@') ? payload.identity : 'master@oxengl.me');
    const newUser: User = {
      id: userObj?.id ?? 'master-operator',
      username: email ? email.split('@')[0] : 'master',
      fullName: userObj?.fullName ?? 'Master Operator',
      fullNameAr: userObj?.fullName ?? 'مشغل النظام الرئيسي',
      email: email,
      phone: userObj?.mobile ?? '',
      role: mappedRole,
      status: 'Active',
    };
    setCurrentUser(newUser);
    localStorage.setItem('oxengl_user', JSON.stringify(newUser));
    localStorage.setItem('oxengl_session_active', 'true');
    localStorage.setItem('role', mappedRole);
    showToast(
      language === 'ar'
        ? 'تم تسجيل الدخول بنجاح إلى لوحة التحكم الرئيسية (Master Control Plane)'
        : 'Successfully authenticated to Master Control Plane',
      'success'
    );
    return res;
  };

  const loginTenant = async (payload: TenantLoginPayload): Promise<TwoTierAuthResponse> => {
    setAuthErrorMessage(null);
    const loginMethod = erpApi.loginTenant || erpApi.tenantLogin;
    const res = await loginMethod(payload);
    const slug = res?.tenant_slug || payload.tenant_slug || '';

    // If 2FA checkpoint is returned, preserve handshake state and avoid premature session setting
    if (res?.status === '2FA_REQUIRED' || (!res?.access_token && res?.two_factor_token)) {
      if (res?.two_factor_token) {
        localStorage.setItem('oxengl_2fa_pending_token', res.two_factor_token);
      }
      return res;
    }

    const activeTenantId = res?.tenant_id || (res as any)?.company_id || null;
    if (res?.access_token) {
      setAuthSession(res.access_token, 'tenant', slug, activeTenantId);
      setAuthToken(res.access_token);
      localStorage.setItem('token', res.access_token);
      localStorage.setItem('oxengl_auth_jwt', res.access_token);
    }
    setAuthTier('tenant');
    setTenantSlug(slug);
    setTenantId(activeTenantId);
    if (activeTenantId) {
      localStorage.setItem('oxengl_tenant_id', activeTenantId);
      localStorage.setItem('tenant_id', activeTenantId);
      localStorage.setItem('company_id', activeTenantId);
    }

    const mappedRole = mapBackendRoleToFrontend(res?.role ?? res?.user?.role);
    const userObj = res?.user;
    const email = userObj?.email ?? (payload.identity.includes('@') ? payload.identity : `${payload.identity}@${slug}.com`);
    const newUser: User = {
      id: userObj?.id ?? 'tenant-user',
      username: email ? email.split('@')[0] : 'user',
      fullName: userObj?.fullName ?? (slug ? `${slug.toUpperCase()} Admin` : 'Tenant User'),
      fullNameAr: userObj?.fullName ?? (slug ? `مسؤول ${slug}` : 'مستخدم المنشأة'),
      email: email,
      phone: userObj?.mobile ?? '',
      role: mappedRole,
      companyId: activeTenantId || undefined,
      status: 'Active',
    };
    setCurrentUser(newUser);
    localStorage.setItem('oxengl_user', JSON.stringify(newUser));
    localStorage.setItem('oxengl_session_active', 'true');
    localStorage.setItem('tenant_slug', slug);
    localStorage.setItem('role', mappedRole);

    const foundCompany = companies.find((c) => (slug && c.slug === slug) || (activeTenantId && c.id === activeTenantId));
    if (foundCompany) {
      setCurrentCompany(foundCompany);
    } else if (activeTenantId || slug) {
      setCurrentCompany({
        id: activeTenantId || slug,
        name: slug,
        slug: slug,
        currency: 'SAR',
        subscriptionTier: 'PROFESSIONAL',
      });
    }
    showToast(
      language === 'ar' ? `مرحباً بك في مساحة عمل المنشأة: ${slug}` : `Welcome to workspace: ${slug}`,
      'success'
    );
    return res;
  };

  const verifyTenantTwoFactor = async (payload: {
    two_factor_token: string;
    code: string;
    tenant?: string;
    tenant_slug?: string;
    workspace_slug?: string;
    email?: string;
  }): Promise<TwoTierAuthResponse> => {
    setAuthErrorMessage(null);
    const slug = payload.tenant || payload.tenant_slug || payload.workspace_slug || tenantSlug || '';
    const res = await erpApi.verifyTwoFactor({
      two_factor_token: payload.two_factor_token,
      code: payload.code,
      tenant: slug,
      tenant_slug: slug,
      workspace_slug: slug,
      email: payload.email,
    });

    const activeTenantId = res?.tenant_id || (res as any)?.company_id || null;
    if (res?.access_token) {
      setAuthSession(res.access_token, 'tenant', slug, activeTenantId);
      setAuthToken(res.access_token);
      localStorage.setItem('token', res.access_token);
      localStorage.setItem('oxengl_auth_jwt', res.access_token);
      localStorage.removeItem('oxengl_2fa_pending_token');
      setAuthTier('tenant');
      setTenantSlug(slug);
      setTenantId(activeTenantId);
      if (activeTenantId) {
        localStorage.setItem('oxengl_tenant_id', activeTenantId);
        localStorage.setItem('tenant_id', activeTenantId);
        localStorage.setItem('company_id', activeTenantId);
      }

      const mappedRole = mapBackendRoleToFrontend(res?.role ?? res?.user?.role);
      const userObj = res?.user;
      const email = userObj?.email ?? (payload.email || `user@${slug}.com`);
      const newUser: User = {
        id: userObj?.id ?? 'tenant-user',
        username: email ? email.split('@')[0] : 'user',
        fullName: userObj?.fullName ?? (slug ? `${slug.toUpperCase()} Admin` : 'Tenant User'),
        fullNameAr: userObj?.fullNameAr ?? (slug ? `مسؤول ${slug}` : 'مستخدم المنشأة'),
        email: email,
        phone: userObj?.mobile ?? '',
        role: mappedRole,
        companyId: activeTenantId || undefined,
        status: 'Active',
      };
      setCurrentUser(newUser);
      localStorage.setItem('oxengl_user', JSON.stringify(newUser));
      localStorage.setItem('oxengl_session_active', 'true');
      localStorage.setItem('tenant_slug', slug);
      localStorage.setItem('role', mappedRole);

      const foundCompany = companies.find((c) => (slug && c.slug === slug) || (activeTenantId && c.id === activeTenantId));
      if (foundCompany) {
        setCurrentCompany(foundCompany);
      } else if (activeTenantId || slug) {
        setCurrentCompany({
          id: activeTenantId || slug,
          name: slug,
          slug: slug,
          currency: 'SAR',
          subscriptionTier: 'PROFESSIONAL',
        });
      }
      showToast(
        language === 'ar' ? `تم تأكيد التحقق الثنائي بنجاح: ${slug}` : `Two-factor verification confirmed for: ${slug}`,
        'success'
      );
    }
    return res;
  };

  const registerTenantAccount = async (payload: TwoTierTenantRegistrationPayload): Promise<any> => {
    setAuthErrorMessage(null);
    const res = await erpApi.registerTenant(payload);
    await refreshCompanies();
    showToast(
      language === 'ar'
        ? 'تم تسجيل الشركة وإنشاء قاعدة البيانات المعزولة بنجاح'
        : 'Company registered and dedicated database provisioned successfully',
      'success'
    );
    return res;
  };

  const recoverUserPassword = async (payload: PasswordRecoveryPayload): Promise<any> => {
    setAuthErrorMessage(null);
    const res = await erpApi.recoverPassword(payload);
    showToast(
      language === 'ar' ? 'تم إرسال رمز التحقق بنجاح إلى وسيلة التواصل' : 'Verification code dispatched successfully',
      'info'
    );
    return res;
  };

  const resetUserPassword = async (payload: PasswordResetPayload): Promise<any> => {
    setAuthErrorMessage(null);
    const res = await erpApi.resetPassword(payload);
    showToast(
      language === 'ar'
        ? 'تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول'
        : 'Password reset successfully. You can now log in.',
      'success'
    );
    return res;
  };

  // RBAC Permission Gates with defensive optional chaining & fallbacks
  const userRole: UserRole = currentUser?.role ?? 'Guest';
  const isAdmin = userRole === 'Admin' || userRole === 'Super_Admin';
  const isCOO = userRole === 'COO';
  const isExecutive = isAdmin || isCOO;
  const canAccessFinancials = isAdmin || isCOO || userRole === 'Accountant';
  const canEditOperations = isAdmin || isCOO || userRole === 'Accountant' || userRole === 'Data_Entry';
  const canApproveEdits = isAdmin || isCOO;
  const canApproveInvoices = isAdmin; // strictly CEO/Admin
  const canApproveVouchers = isAdmin; // strictly CEO/Admin for PV & RV
  const canEditBranding = isAdmin; // strictly CEO/Admin
  const canDeleteRecords = isAdmin || isCOO;
  const canManageSettings = isAdmin;
  const isGuestUser = userRole === 'Guest';
  const assignedCustomerId = currentUser?.assignedCustomerId;

  // Active operations excluding soft-deleted
  const activeOperations = useMemo(() => {
    return operations.filter((op) => !op.is_deleted);
  }, [operations]);

  const softDeletedOperations = useMemo(() => {
    return operations.filter((op) => !!op.is_deleted);
  }, [operations]);

  // Filter operations for Guest/Client Portal (Read-only + privacy barrier)
  const accessibleOperations = useMemo(() => {
    const active = activeOperations;
    if (!isGuestUser) return active;

    const targetCust = customers.find((c) => c.id === assignedCustomerId);
    const custName = targetCust ? targetCust.customerName : '';

    return active
      .filter(
        (op) =>
          !custName ||
          op.destination_customer.includes(custName) ||
          (targetCust?.customerNameEn && op.destination_customer.includes(targetCust.customerNameEn))
      )
      .map((op) => ({
        ...op,
        // STRICT PRIVACY BARRIER: Mask sensitive cost prices, profit, and crusher buy rates
        purchases_cost: 0,
        crusher_payment: 0,
        net_profit: 0,
        loading_source: '*** (محمي / Confidential)',
      }));
  }, [activeOperations, isGuestUser, assignedCustomerId, customers]);

  // Audit Logger Helper
  const logAuditAction = (entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'ipAddress'>) => {
    const id = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const newEntry: AuditLogEntry = {
      ...entry,
      id,
      timestamp: now,
      ipAddress: '192.168.1.10 (Saudi Local Network)',
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  };

  const clearAuditLogs = () => {
    if (!isAdmin) return;
    setAuditLogs([]);
  };

  // Operations Handlers
  const refreshOperations = async (): Promise<void> => {
    if (!currentCompany || !navigator.onLine) return;
    try {
      const serverOperations = await erpApi.getOperations(currentCompany.id);
      if (Array.isArray(serverOperations)) {
        setOperations(serverOperations.map(mapApiOperation));
      }
    } catch (err) {
      console.warn('[OperationsSync] Failed to refresh operations from backend:', err);
    }
  };

  const refreshPartners = async (): Promise<void> => {
    if (!currentCompany || !navigator.onLine) return;
    try {
      const partners = await erpApi.getPartners(currentCompany.id);
      if (!partners || !Array.isArray(partners)) return;

      const apiCustomers: Customer[] = partners
        .filter((p) => p.partner_type === 'customer')
        .map((p) => ({
          id: p.id,
          customerName: p.name,
          customerNameEn: p.name,
          taxNumber: p.tax_number || '',
          crNumber: p.commercial_registration || '',
          contactPerson: '',
          phone: p.phone || '',
          email: p.email || '',
          address: '',
          openingBalance: 0,
          creditLimit: 0,
          is_deleted: false,
        }));

      const apiCrushers: Crusher[] = partners
        .filter((p) => ['supplier', 'raw_materials_supplier', 'quarry'].includes(p.partner_type))
        .map((p) => ({
          id: p.id,
          crusherName: p.name,
          crusherNameEn: p.name,
          location: '',
          bankDetails: '',
          taxNumber: p.tax_number || '',
          openingBalance: 0,
          phone: p.phone || '',
          is_deleted: false,
        }));

      const apiTransporters: Transporter[] = partners
        .filter((p) => ['transporter', 'service_supplier', 'logistics'].includes(p.partner_type))
        .map((p) => ({
          id: p.id,
          transporterName: p.name,
          transporterNameEn: p.name,
          driverName: '',
          phone: p.phone || '',
          truckDetails: '',
          is_deleted: false,
        }));

      setCustomers(Array.from(new Map(apiCustomers.map((c) => [c.id, c])).values()));
      setCrushers(Array.from(new Map(apiCrushers.map((c) => [c.id, c])).values()));
      setTransporters(Array.from(new Map(apiTransporters.map((t) => [t.id, t])).values()));
    } catch (err) {
      console.warn('[PartnersSync] Failed to refresh partners from backend:', err);
    }
  };

  const addOperation = async (opData: Omit<OperationRecord, 'id' | 'created_at' | 'updated_at'>): Promise<void> => {
    if (navigator.onLine && currentCompany) {
      const numGross = Number(opData.qty_loaded) || 1;
      const numDelivered = Number(opData.qty_delivered) || 0;
      const computedTare = Math.max(0, numGross - numDelivered);
      const safeTare = computedTare >= numGross ? Math.max(0, numGross - 0.0001) : computedTare;

      const operation = await erpApi.createWeighbridgeOperation({
        companyId: currentCompany.id,
        transporterName: opData.transporter_name,
        materialName: opData.material_type,
        sourceName: opData.loading_source,
        destinationName: opData.destination_customer,
        truckNumber: opData.truck_no,
        grossWeight: numGross,
        tareWeight: safeTare,
        uom: (opData.uom as string) || 'MT',
        unitOfMeasure: (opData.uom as string) || 'MT',
        attachments: opData.attachments || [],
        scaleTicketAttachment: opData.scale_ticket_attachment,
        scaleTicketNo: opData.scale_ticket_no,
        loadingInvoiceNo: opData.loading_invoice_no,
        receiptInvoiceNo: opData.receipt_invoice_no,
        qty_loaded: opData.qty_loaded,
        qty_delivered: opData.qty_delivered,
        qty_wastage: opData.qty_wastage,
        wastage_percentage: opData.wastage_percentage,
        sales_amount: opData.sales_amount,
        vat_amount: opData.vat_amount,
        total_sales: opData.total_sales,
        purchases_cost: opData.purchases_cost,
        crusher_payment: opData.crusher_payment,
        net_profit: opData.net_profit,
        operation_month: opData.operation_month,
        operation_year: opData.operation_year,
        notes: opData.notes,
      });
      const serverRecord: OperationRecord = {
        ...mapApiOperation(operation),
        uom: (opData.uom as string) || operation.uom || operation.unit_of_measure || 'MT',
        scale_ticket_no: operation.scale_ticket_attachment || operation.ticket_number || opData.scale_ticket_no,
        loading_invoice_no: operation.loading_invoice_no || opData.loading_invoice_no,
        receipt_invoice_no: operation.receipt_invoice_no || opData.receipt_invoice_no,
        sales_amount: opData.sales_amount || 0,
        vat_amount: opData.vat_amount || 0,
        total_sales: opData.total_sales || 0,
        purchases_cost: opData.purchases_cost || 0,
        crusher_payment: opData.crusher_payment || 0,
        net_profit: opData.net_profit || 0,
        notes: opData.notes,
        scale_ticket_attachment: opData.scale_ticket_attachment,
        attachments: opData.attachments,
      };
      setOperations((previous) => [serverRecord, ...previous.filter((item) => item.id !== serverRecord.id)]);
      logAuditAction({
        userId: currentUser.id,
        userName: currentUser.fullNameAr || currentUser.fullName,
        userRole: currentUser?.role ?? 'Guest',
        action: 'CREATE',
        entityType: 'Operation',
        entityId: serverRecord.id,
        summary: `تم تسجيل تذكرة الميزان في قاعدة البيانات للشاحنة (${serverRecord.truck_no})`,
        newData: serverRecord,
      });
      return;
    }

    const id = `op-2026-${String(Date.now()).slice(-6)}`;
    const now = new Date().toISOString();
    const newRecord: OperationRecord = {
      ...opData,
      id,
      version: 1,
      is_deleted: false,
      created_at: now,
      updated_at: now,
      created_by: currentUser.fullNameAr || currentUser.fullName,
    };
    setOperations((prev) => [newRecord, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Operation',
      entityId: id,
      summary: `إنشاء تذكرة ميزان جديدة للشاحنة (${newRecord.truck_no}) بحمولة ${newRecord.qty_delivered} طن`,
      newData: newRecord,
    });
  };

  const updateOperation = (id: string, patch: Partial<OperationRecord>): { success: boolean; requiresApproval?: boolean } => {
    const existing = operations.find((o) => o.id === id);
    if (!existing) return { success: false };

    // If non-admin modifies a sensitive financial or weight field, create an Edit Approval Request (Change Management)
    if (!isAdmin && (patch.qty_delivered !== undefined || patch.qty_loaded !== undefined || patch.sales_amount !== undefined || patch.purchases_cost !== undefined)) {
      const diffFields: string[] = [];
      if (patch.qty_delivered !== undefined && patch.qty_delivered !== existing.qty_delivered) {
        diffFields.push(`الوزن المستلم: ${existing.qty_delivered} -> ${patch.qty_delivered}`);
      }
      if (patch.sales_amount !== undefined && patch.sales_amount !== existing.sales_amount) {
        diffFields.push(`المبيعات: ${existing.sales_amount} -> ${patch.sales_amount}`);
      }

      createEditRequest({
        recordId: id,
        entityType: 'Operation',
        requestedBy: currentUser?.fullNameAr || currentUser?.fullName || 'User',
        requestedByRole: currentUser?.role ?? 'Guest',
        diffSummary: `طلب تعديل تذكرة ميزان: ${diffFields.join(', ')}`,
        oldValues: existing as any,
        newValues: { ...existing, ...patch } as any,
      });

      return { success: true, requiresApproval: true };
    }

    // Admin direct update
    setOperations((prev) =>
      prev.map((op) =>
        op.id === id
          ? {
              ...op,
              ...patch,
              version: (op.version || 1) + 1,
              updated_at: new Date().toISOString(),
            }
          : op
      )
    );

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'Operation',
      entityId: id,
      summary: `تحديث مباشر لبيانات الرحلة (${existing.truck_no})`,
      oldData: existing,
      newData: { ...existing, ...patch },
    });

    return { success: true, requiresApproval: false };
  };

  const overrideOperationRecord = (id: string, updates: Partial<OperationRecord>) => {
    if (!isAdmin) return;
    const existing = operations.find((o) => o.id === id);
    if (!existing) return;

    setOperations((prev) =>
      prev.map((op) =>
        op.id === id
          ? {
              ...op,
              ...updates,
              version: (op.version || 1) + 1,
              updated_at: new Date().toISOString(),
            }
          : op
      )
    );

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'OVERRIDE_DB',
      entityType: 'Operation',
      entityId: id,
      summary: `تعديل مباشر من شبكة البيانات التنفيذية (Global Grid Override) للسجل ${id}`,
      oldData: existing,
      newData: updates,
    });
  };

  const bulkOverrideOperations = (ids: string[], updates: Partial<OperationRecord>) => {
    if (!isAdmin) return;
    setOperations((prev) =>
      prev.map((op) =>
        ids.includes(op.id)
          ? {
              ...op,
              ...updates,
              version: (op.version || 1) + 1,
              updated_at: new Date().toISOString(),
            }
          : op
      )
    );

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'OVERRIDE_DB',
      entityType: 'Operation',
      entityId: `bulk-${ids.length}`,
      summary: `تعديل جماعي مباشر لعدد (${ids.length}) سجل في قاعدة البيانات`,
      newData: updates,
    });
  };

  const softDeleteOperation = (id: string) => {
    const existing = operations.find((o) => o.id === id);
    if (!existing) return;

    setOperations((prev) =>
      prev.map((op) =>
        op.id === id
          ? {
              ...op,
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by: currentUser.fullNameAr || currentUser.fullName,
            }
          : op
      )
    );

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'SOFT_DELETE',
      entityType: 'Operation',
      entityId: id,
      summary: `أرشفة / حذف مؤقت لتذكرة الميزان (${existing.truck_no} - ${existing.loading_date})`,
    });
  };

  const restoreOperation = (id: string) => {
    const existing = operations.find((o) => o.id === id);
    if (!existing) return;

    setOperations((prev) =>
      prev.map((op) =>
        op.id === id
          ? {
              ...op,
              is_deleted: false,
              deleted_at: undefined,
              deleted_by: undefined,
            }
          : op
      )
    );

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'RESTORE',
      entityType: 'Operation',
      entityId: id,
      summary: `استعادة تذكرة الميزان (${existing.truck_no}) من سلة المحذوفات`,
    });
  };

  const deleteOperation = (id: string): boolean => {
    if (!canDeleteRecords) return false;
    if (currentCompany && navigator.onLine) {
      void erpApi.deleteOperation(currentCompany.id, id).catch((err) => {
        console.warn('[OperationsSync] Failed to delete operation from server:', err);
      });
    }
    setOperations((prev) => prev.filter((op) => op.id !== id));
    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'DELETE',
      entityType: 'Operation',
      entityId: id,
      summary: `حذف نهائي لسجل العملية ${id}`,
    });
    return true;
  };

  const batchAddOperations = (newOps: Omit<OperationRecord, 'id' | 'created_at' | 'updated_at'>[]) => {
    const now = new Date().toISOString();
    const formatted: OperationRecord[] = newOps.map((op, idx) => ({
      ...op,
      id: `op-batch-${Date.now()}-${idx}`,
      version: 1,
      is_deleted: false,
      created_at: now,
      updated_at: now,
      created_by: currentUser.fullNameAr || currentUser.fullName,
    }));
    setOperations((prev) => [...formatted, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Operation',
      entityId: `batch-${newOps.length}`,
      summary: `استيراد دفعة رحلات بعدد (${newOps.length}) سجل`,
    });
  };

  // Crusher Payments
  const addCrusherPayment = (payment: Omit<CrusherPaymentEntry, 'id' | 'created_at'>) => {
    const id = `pay-${Date.now()}`;
    const newPay: CrusherPaymentEntry = {
      ...payment,
      id,
      is_deleted: false,
      created_at: new Date().toISOString(),
    };
    setCrusherPayments((prev) => [newPay, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Payment',
      entityId: id,
      summary: `تسجيل دفعة سداد بقيمة ${newPay.amount} ر.س لصالح ${newPay.crusher_name}`,
      newData: newPay,
    });
  };

  const deleteCrusherPayment = (id: string) => {
    if (!canDeleteRecords) return;
    setCrusherPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const softDeleteCrusherPayment = (id: string) => {
    setCrusherPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_deleted: true, deleted_at: new Date().toISOString() } : p))
    );
  };

  // Financial Vouchers (سندات القبض والصرف) Methods
  const addVoucher = (
    vchData: Omit<FinancialVoucher, 'id' | 'created_at' | 'updated_at' | 'amountInWordsAr'>
  ): FinancialVoucher => {
    const id = `vch-${Date.now()}`;
    const now = new Date().toISOString();
    const prefix = vchData.type === 'Payment' ? 'PV' : 'RV';
    const year = vchData.year || new Date().getFullYear();
    const month = String(vchData.month || new Date().getMonth() + 1).padStart(2, '0');
    const serial = String(vouchers.length + 1).padStart(4, '0');
    const autoNumber = vchData.voucherNumber || `${prefix}-${year}-${month}-${serial}`;

    const newVoucher: FinancialVoucher = {
      ...vchData,
      id,
      voucherNumber: autoNumber,
      amountInWordsAr: tafqeetArabic(vchData.amount),
      amountInWordsEn: tafqeetEnglish(vchData.amount),
      created_at: now,
      updated_at: now,
    };

    setVouchers((prev) => [newVoucher, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Voucher',
      entityId: id,
      summary: `إنشاء سند ${newVoucher.type === 'Payment' ? 'صرف' : 'قبض'} رسمي رقم (${newVoucher.voucherNumber}) بقيمة ${newVoucher.amount} ر.س لصالح/من (${newVoucher.partyName})`,
      newData: newVoucher,
    });

    return newVoucher;
  };

  const updateVoucher = (id: string, updates: Partial<FinancialVoucher>) => {
    const existing = vouchers.find((v) => v.id === id);
    if (!existing) return;

    const updatedAmount = updates.amount !== undefined ? updates.amount : existing.amount;
    const amountInWordsAr = updates.amount !== undefined ? tafqeetArabic(updatedAmount) : existing.amountInWordsAr;
    const amountInWordsEn = updates.amount !== undefined ? tafqeetEnglish(updatedAmount) : existing.amountInWordsEn;

    const patched: FinancialVoucher = {
      ...existing,
      ...updates,
      amount: updatedAmount,
      amountInWordsAr,
      amountInWordsEn,
      updated_at: new Date().toISOString(),
    };

    setVouchers((prev) => prev.map((v) => (v.id === id ? patched : v)));

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'Voucher',
      entityId: id,
      summary: `تحديث بيانات السند المالي رقم (${existing.voucherNumber})`,
      oldData: existing,
      newData: patched,
    });
  };

  const deleteVoucher = (id: string): boolean => {
    if (!canDeleteRecords) return false;
    const existing = vouchers.find((v) => v.id === id);
    if (!existing) return false;

    setVouchers((prev) => prev.filter((v) => v.id !== id));

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'DELETE',
      entityType: 'Voucher',
      entityId: id,
      summary: `حذف السند المالي (${existing.voucherNumber}) بقيمة ${existing.amount} ر.س`,
    });
    return true;
  };

  const approveVoucher = async (id: string, reviewNotes?: string): Promise<void> => {
    if (!isAdmin && !isCOO) return;
    const existing = vouchers.find((v) => v.id === id);
    if (!existing) return;

    const signature = signDocument('Invoice', id, reviewNotes || 'اعتماد المدير التنفيذي العام للسند المالي');

    let approvedVoucher: FinancialVoucher = {
      ...existing,
      isApproved: true,
      status: 'Approved',
      approvedBy: currentUser.fullNameAr || currentUser.fullName,
      approvedAt: new Date().toISOString(),
      digitalSignature: signature,
      updated_at: new Date().toISOString(),
    };

    if (currentCompany) {
      try {
        const accounts = await erpApi.getAccountingAccounts(currentCompany.id).catch(() => []);
        const cashAcc = accounts.find((a) => a.code === '101000') || accounts.find((a) => a.internal_type === 'asset');
        const counterAcc = approvedVoucher.type === 'Receipt'
          ? (accounts.find((a) => a.code === '120000') || accounts.find((a) => a.code === '401000') || accounts.find((a) => a.internal_type === 'revenue'))
          : (accounts.find((a) => a.code === '201000') || accounts.find((a) => a.code === '501000') || accounts.find((a) => a.internal_type === 'expense'));

        const isReceipt = approvedVoucher.type === 'Receipt';
        const debitAccountId = isReceipt ? cashAcc?.id : counterAcc?.id;
        const creditAccountId = isReceipt ? counterAcc?.id : cashAcc?.id;
        const debitAccountCode = isReceipt ? (cashAcc?.code || '101000') : (counterAcc?.code || '201000');
        const creditAccountCode = isReceipt ? (counterAcc?.code || '120000') : (cashAcc?.code || '101000');

        const move = await erpApi.createAccountMove(currentCompany.id, {
          journal_code: 'MISC',
          move_type: 'settlement',
          ref: approvedVoucher.voucherNumber,
          name: approvedVoucher.purpose || approvedVoucher.voucherNumber,
          lines: [
            {
              account_id: debitAccountId,
              account_code: debitAccountCode,
              debit: Number(approvedVoucher.amount),
              credit: 0,
              name: `${approvedVoucher.voucherNumber} - ${approvedVoucher.partyName || ''}`,
            },
            {
              account_id: creditAccountId,
              account_code: creditAccountCode,
              debit: 0,
              credit: Number(approvedVoucher.amount),
              name: `${approvedVoucher.voucherNumber} - ${approvedVoucher.partyName || ''}`,
            },
          ],
        });

        if (move?.id) {
          approvedVoucher = { ...approvedVoucher, move_id: move.id };
        }
      } catch (err) {
        console.warn('[VoucherSync] Failed to post voucher to general ledger AccountMove:', err);
      }
    }

    setVouchers((prev) => prev.map((v) => (v.id === id ? approvedVoucher : v)));

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'APPROVE',
      entityType: 'Voucher',
      entityId: id,
      summary: `اعتماد وتوقيع السند المالي (${existing.voucherNumber}) بالختم الرقمي والتفويض التنفيذي`,
      newData: approvedVoucher,
    });
  };

  const createVoucher = async (
    vchData: Omit<FinancialVoucher, 'id' | 'created_at' | 'updated_at' | 'amountInWordsAr'>
  ): Promise<FinancialVoucher> => {
    const newVoucher = addVoucher(vchData);
    if (currentCompany) {
      try {
        const accounts = await erpApi.getAccountingAccounts(currentCompany.id);
        const cashAccount = accounts.find((account) => account.code === '101000') || accounts.find((account) => account.internal_type === 'asset');
        const counterAccount = newVoucher.type === 'Receipt'
          ? (accounts.find((account) => account.code === '120000') || accounts.find((account) => account.internal_type === 'revenue'))
          : (accounts.find((account) => account.code === '201000') || accounts.find((account) => account.internal_type === 'expense'));
        const isReceipt = newVoucher.type === 'Receipt';
        const move = await erpApi.createAccountMove(currentCompany.id, {
          journal_code: 'MISC',
          move_type: 'settlement',
          ref: newVoucher.voucherNumber,
          name: newVoucher.purpose || newVoucher.voucherNumber,
          lines: [
            { account_id: isReceipt ? cashAccount?.id : counterAccount?.id, account_code: isReceipt ? (cashAccount?.code || '101000') : (counterAccount?.code || '201000'), debit: isReceipt ? newVoucher.amount : 0, credit: isReceipt ? 0 : newVoucher.amount, name: newVoucher.partyName },
            { account_id: isReceipt ? counterAccount?.id : cashAccount?.id, account_code: isReceipt ? (counterAccount?.code || '120000') : (cashAccount?.code || '101000'), debit: isReceipt ? 0 : newVoucher.amount, credit: isReceipt ? newVoucher.amount : 0, name: newVoucher.partyName },
          ],
        });
        const persistedVoucher = { ...newVoucher, id: move.id || newVoucher.id, move_id: move.id, isApproved: true, status: 'Approved' as const };
        setVouchers((previous) => [persistedVoucher, ...previous.filter((voucher) => voucher.id !== newVoucher.id && voucher.id !== persistedVoucher.id)]);
        return persistedVoucher;
      } catch (error) {
        console.warn('[VoucherSync] Failed to persist voucher:', error);
      }
    }
    return newVoucher;
  };

  const autoGenerateVoucherFromPayment = (payment: CrusherPaymentEntry): FinancialVoucher => {
    const targetCrusher = crushers.find((c) => c.id === payment.crusher_id);
    const category: VoucherCategory = 'Crusher_Settlement';
    const serial = String(vouchers.length + 1).padStart(4, '0');
    const voucherNumber = `PV-${payment.year}-${String(payment.month).padStart(2, '0')}-${serial}`;

    const newVoucher = addVoucher({
      voucherNumber,
      type: 'Payment',
      category,
      date: payment.payment_date,
      amount: payment.amount,
      partyType: 'Crusher',
      partyId: payment.crusher_id,
      partyName: payment.crusher_name,
      partyTaxNumber: targetCrusher?.taxNumber,
      paymentMethod: payment.payment_method,
      transferRefNumber: payment.reference_no,
      linkedReferenceNo: payment.reference_no || `CRUSH-STMT-${payment.year}-${payment.month}`,
      purpose: `سداد مستحقات توريد مواد حصوية لـ (${payment.crusher_name}) عن شهر ${payment.month}/${payment.year}`,
      notes: payment.notes || 'سند صرف صادر آلياً من جدول حسابات ومدفوعات موردي المواد الخام',
      month: payment.month,
      year: payment.year,
      preparedBy: currentUser.fullNameAr || currentUser.fullName,
      reviewedBy: 'عبدالمجيد أحمد (المدير المالي والتشغيلي COO)',
      receivedBy: `${payment.crusher_name} - الإدارة المالية`,
      isApproved: isAdmin,
      status: isAdmin ? 'Approved' : 'Pending_Approval',
      approvedBy: isAdmin ? (currentUser.fullNameAr || currentUser.fullName) : undefined,
      approvedAt: isAdmin ? new Date().toISOString() : undefined,
    });

    return newVoucher;
  };

  // Entity CRUD - Customers
  const addCustomer = async (custData: Omit<Customer, 'id'>): Promise<Customer> => {
    const partner = currentCompany && typeof navigator !== 'undefined' && navigator.onLine
      ? await erpApi.createPartner(currentCompany.id, {
          name: custData.customerName,
          partner_type: 'customer',
          email: custData.email || null,
          phone: custData.phone || null,
          tax_number: custData.taxNumber || null,
          commercial_registration: custData.crNumber || null,
        })
      : null;
    const id = partner?.id || `cust-${Date.now()}`;
    const newCust: Customer = {
      ...custData,
      id,
      is_deleted: false,
    };
    setCustomers((prev) => [newCust, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Customer',
      entityId: id,
      summary: `إضافة عميل جديد: ${newCust.customerName}`,
      newData: newCust,
    });

    return newCust;
  };

  const updateCustomer = (id: string, patch: Partial<Customer>) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'Customer',
      entityId: id,
      summary: `تحديث بيانات العميل ${id}`,
      newData: patch,
    });
  };

  const softDeleteCustomer = (id: string) => {
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: currentUser.fullName }
          : c
      )
    );
    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'SOFT_DELETE',
      entityType: 'Customer',
      entityId: id,
      summary: `أرشفة العميل ${id}`,
    });
  };

  const restoreCustomer = (id: string) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_deleted: false, deleted_at: undefined, deleted_by: undefined } : c))
    );
  };

  const deleteCustomer = (id: string) => {
    if (!isAdmin) return;
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  };

  const batchAddCustomers = (newCusts: Omit<Customer, 'id'>[], updateExisting: boolean = true) => {
    let added = 0;
    let updated = 0;
    setCustomers((prev) => {
      let current = [...prev];
      newCusts.forEach((item) => {
        const existingIdx = current.findIndex(
          (c) =>
            (item.taxNumber && c.taxNumber && c.taxNumber.trim() === item.taxNumber.trim()) ||
            (c.customerName && item.customerName && c.customerName.trim().toLowerCase() === item.customerName.trim().toLowerCase())
        );

        if (existingIdx >= 0 && updateExisting) {
          current[existingIdx] = {
            ...current[existingIdx],
            ...item,
            is_deleted: false,
          };
          updated++;
        } else {
          current.unshift({
            ...item,
            id: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            is_deleted: false,
          });
          added++;
        }
      });
      return current;
    });

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Customer',
      entityId: `batch-cust-${newCusts.length}`,
      summary: `استيراد دفعة عملاء عبر CSV: تم إضافة (${added}) وتحديث (${updated}) سجل`,
    });

    return { addedCount: added, updatedCount: updated };
  };

  // Entity CRUD - Crushers
  const addCrusher = async (crushData: Omit<Crusher, 'id'>): Promise<Crusher> => {
    const partner = currentCompany && typeof navigator !== 'undefined' && navigator.onLine
      ? await erpApi.createPartner(currentCompany.id, {
          name: crushData.crusherName,
          partner_type: 'supplier',
          phone: crushData.phone || null,
          tax_number: crushData.taxNumber || null,
        })
      : null;
    const id = partner?.id || `crush-${Date.now()}`;
    const newCrush: Crusher = {
      ...crushData,
      id,
      is_deleted: false,
    };
    setCrushers((prev) => [newCrush, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Crusher',
      entityId: id,
      summary: `إضافة كسارة جديدة: ${newCrush.crusherName}`,
      newData: newCrush,
    });

    return newCrush;
  };

  const updateCrusher = (id: string, patch: Partial<Crusher>) => {
    setCrushers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'Crusher',
      entityId: id,
      summary: `تحديث بيانات مورد المواد الخام ${id}`,
      newData: patch,
    });
  };

  const softDeleteCrusher = (id: string) => {
    setCrushers((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: currentUser.fullName }
          : c
      )
    );
  };

  const restoreCrusher = (id: string) => {
    setCrushers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_deleted: false, deleted_at: undefined, deleted_by: undefined } : c))
    );
  };

  const deleteCrusher = (id: string) => {
    if (!isAdmin) return;
    setCrushers((prev) => prev.filter((c) => c.id !== id));
  };

  const batchAddCrushers = (newCrushes: Omit<Crusher, 'id'>[], updateExisting: boolean = true) => {
    let added = 0;
    let updated = 0;
    setCrushers((prev) => {
      let current = [...prev];
      newCrushes.forEach((item) => {
        const existingIdx = current.findIndex(
          (c) =>
            (item.taxNumber && c.taxNumber && c.taxNumber.trim() === item.taxNumber.trim()) ||
            (c.crusherName && item.crusherName && c.crusherName.trim().toLowerCase() === item.crusherName.trim().toLowerCase())
        );

        if (existingIdx >= 0 && updateExisting) {
          current[existingIdx] = {
            ...current[existingIdx],
            ...item,
            is_deleted: false,
          };
          updated++;
        } else {
          current.unshift({
            ...item,
            id: `crush-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            is_deleted: false,
          });
          added++;
        }
      });
      return current;
    });

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Crusher',
      entityId: `batch-crush-${newCrushes.length}`,
      summary: `استيراد دفعة كسارات وموردين عبر CSV: تم إضافة (${added}) وتحديث (${updated}) سجل`,
    });

    return { addedCount: added, updatedCount: updated };
  };

  // Entity CRUD - Transporters
  const addTransporter = async (transData: Omit<Transporter, 'id'>): Promise<Transporter> => {
    const partner = currentCompany && typeof navigator !== 'undefined' && navigator.onLine
      ? await erpApi.createPartner(currentCompany.id, {
          name: transData.transporterName,
          partner_type: 'transporter',
          phone: transData.phone || null,
        })
      : null;
    const id = partner?.id || `trans-${Date.now()}`;
    const newTrans: Transporter = {
      ...transData,
      id,
      is_deleted: false,
    };
    setTransporters((prev) => [newTrans, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Transporter',
      entityId: id,
      summary: `إضافة مزود خدمة جديد: ${newTrans.transporterName}`,
      newData: newTrans,
    });

    return newTrans;
  };

  const updateTransporter = (id: string, patch: Partial<Transporter>) => {
    setTransporters((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'Transporter',
      entityId: id,
      summary: `تحديث بيانات مزود الخدمة ${id}`,
      newData: patch,
    });
  };

  const softDeleteTransporter = (id: string) => {
    setTransporters((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: currentUser.fullName }
          : t
      )
    );
  };

  const restoreTransporter = (id: string) => {
    setTransporters((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_deleted: false, deleted_at: undefined, deleted_by: undefined } : t))
    );
  };

  const deleteTransporter = (id: string) => {
    if (!isAdmin) return;
    setTransporters((prev) => prev.filter((t) => t.id !== id));
  };

  const batchAddTransporters = (newTrans: Omit<Transporter, 'id'>[], updateExisting: boolean = true) => {
    let added = 0;
    let updated = 0;
    setTransporters((prev) => {
      let current = [...prev];
      newTrans.forEach((item) => {
        const existingIdx = current.findIndex(
          (t) =>
            t.transporterName &&
            item.transporterName &&
            t.transporterName.trim().toLowerCase() === item.transporterName.trim().toLowerCase()
        );

        if (existingIdx >= 0 && updateExisting) {
          current[existingIdx] = {
            ...current[existingIdx],
            ...item,
            is_deleted: false,
          };
          updated++;
        } else {
          current.unshift({
            ...item,
            id: `trans-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            is_deleted: false,
          });
          added++;
        }
      });
      return current;
    });

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Transporter',
      entityId: `batch-trans-${newTrans.length}`,
      summary: `استيراد دفعة مزودي خدمات عبر CSV: تم إضافة (${added}) وتحديث (${updated}) سجل`,
    });

    return { addedCount: added, updatedCount: updated };
  };

  // Entity CRUD - Materials
  const addMaterial = (matData: Omit<MaterialOption, 'id'>): MaterialOption => {
    const id = `mat-${Date.now()}`;
    const newMat: MaterialOption = {
      ...matData,
      id,
      is_deleted: false,
    };
    setMaterials((prev) => [newMat, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'Material',
      entityId: id,
      summary: `إضافة صنف مادة جديد: ${newMat.nameAr}`,
      newData: newMat,
    });

    return newMat;
  };

  const updateMaterial = (id: string, patch: Partial<MaterialOption>) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'Material',
      entityId: id,
      summary: `تحديث تسعير/بيانات المادة ${id}`,
      newData: patch,
    });
  };

  const softDeleteMaterial = (id: string) => {
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: currentUser.fullName }
          : m
      )
    );
  };

  const restoreMaterial = (id: string) => {
    setMaterials((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_deleted: false, deleted_at: undefined, deleted_by: undefined } : m))
    );
  };

  const deleteMaterial = (id: string) => {
    if (!isAdmin) return;
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  // Entity CRUD - Users
  const addUser = (usrData: Omit<User, 'id'>): User => {
    const id = `usr-${Date.now()}`;
    const newUsr: User = {
      ...usrData,
      id,
      status: 'Active',
      is_deleted: false,
      created_at: new Date().toISOString(),
    };
    setUsers((prev) => [...prev, newUsr]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'User',
      entityId: id,
      summary: `دعوة/إنشاء حساب مستخدم جديد: ${newUsr.fullNameAr || newUsr.fullName} بدور (${newUsr.role})`,
      newData: newUsr,
    });

    return newUsr;
  };

  const updateUser = (id: string, patch: Partial<User>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      summary: `تحديث صلاحيات/بيانات المستخدم ${id}`,
      newData: patch,
    });
  };

  const softDeleteUser = (id: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, is_deleted: true, status: 'Suspended', deleted_at: new Date().toISOString(), deleted_by: currentUser.fullName }
          : u
      )
    );
  };

  const restoreUser = (id: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, is_deleted: false, status: 'Active', deleted_at: undefined, deleted_by: undefined } : u))
    );
  };

  const refreshUsers = async (): Promise<void> => {
    try {
      const apiUsers = await erpApi.getUsers();
      if (Array.isArray(apiUsers)) {
        const mapped: User[] = apiUsers.map((u) => {
          const contact = u.email || u.phone || '';
          return {
            id: u.id,
            username: contact.includes('@') ? contact.split('@')[0] : contact,
            fullName: u.full_name,
            fullNameAr: u.full_name,
            email: u.email || '',
            phone: u.phone || '',
            role: (u.role as UserRole) || 'Guest',
            iamRole: u.iam_role ?? null,
            mustChangePassword: !!u.must_change_password,
            status: u.is_active ? 'Active' : 'Suspended',
            created_at: u.created_at,
          };
        });
        setUsers(Array.from(new Map(mapped.map((u) => [u.id, u])).values()));
      }
    } catch (err) {
      console.warn('Notice loading users from live backend API:', err);
    }
  };

  const deleteUser = async (id: string) => {
    if (!isAdmin) return;
    try {
      await erpApi.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      showToast(language === 'ar' ? 'تم حذف المستخدم بنجاح' : 'User deleted successfully', 'success');
    } catch (err: any) {
      console.error('Failed to delete user via API:', err);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    }
  };

  // Approvals & Workflows
  const createEditRequest = (req: Omit<EditApprovalRequest, 'id' | 'requestedAt' | 'status'>) => {
    const id = `req-edit-${Date.now()}`;
    const newReq: EditApprovalRequest = {
      ...req,
      id,
      requestedAt: new Date().toISOString(),
      status: 'Pending',
    };
    setEditRequests((prev) => [newReq, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: req.entityType as any,
      entityId: req.recordId,
      summary: `تقديم طلب موافقة على تعديل سجل (Change Request) للمدير التنفيذي`,
      newData: req.newValues,
    });
  };

  const approveEditRequest = (id: string, reviewNotes?: string) => {
    const req = editRequests.find((r) => r.id === id);
    if (!req) return;

    // Apply the change to the respective record
    if (req.entityType === 'Operation') {
      setOperations((prev) =>
        prev.map((op) =>
          op.id === req.recordId
            ? {
                ...op,
                ...req.newValues,
                version: (op.version || 1) + 1,
                updated_at: new Date().toISOString(),
              }
            : op
        )
      );
    }

    setEditRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'Approved',
              reviewedBy: currentUser.fullNameAr || currentUser.fullName,
              reviewedAt: new Date().toISOString(),
              reviewNotes,
            }
          : r
      )
    );

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'APPROVE',
      entityType: req.entityType as any,
      entityId: req.recordId,
      summary: `موافقة المدير التنفيذي على طلب التعديل ${id} وتطبيق البيانات الجديدة فوراً`,
      oldData: req.oldValues,
      newData: req.newValues,
    });
  };

  const rejectEditRequest = (id: string, reviewNotes?: string) => {
    const req = editRequests.find((r) => r.id === id);
    if (!req) return;

    setEditRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'Rejected',
              reviewedBy: currentUser.fullNameAr || currentUser.fullName,
              reviewedAt: new Date().toISOString(),
              reviewNotes,
            }
          : r
      )
    );

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'REJECT',
      entityType: req.entityType as any,
      entityId: req.recordId,
      summary: `رفض طلب التعديل ${id}. السبب: ${reviewNotes || 'غير مطابق للشروط'}`,
    });
  };

  // Brand Customization
  const updateBrandConfig = (configPatch: Partial<BrandConfig>) => {
    if (!canEditBranding && !isAdmin) return;
    setBrandConfig((prev) => {
      const updated = { ...prev, ...configPatch };
      if (currentCompany) {
        erpApi.updateCompanyBranding(currentCompany.id, {
          ui_logo_url: updated.customLogoUrl || null,
          ui_primary_color: updated.primaryColor || '#1E3A8A',
          ui_secondary_color: updated.secondaryColor || '#7C3AED',
        }).then(() => refreshCompanies()).catch((error) => console.warn('Tenant branding sync failed:', error));
      }
      return updated;
    });

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'BRAND_CONFIG',
      entityType: 'BrandConfig',
      entityId: 'brand-main',
      summary: `تحديث الهوية البصرية وإعدادات الشركة (White-Labeling)`,
      newData: configPatch,
    });
  };

  const resetBrandConfig = () => {
    if (!canEditBranding && !isAdmin) return;
    setBrandConfig(INITIAL_BRAND_CONFIG);
  };

  // Digital Signatures Engine
  const signDocument = (
    docType: 'Invoice' | 'Statement' | 'Settlement',
    docId: string,
    signNotes?: string
  ): DigitalSignatureStamp => {
    const now = new Date().toISOString();
    const hash = `SA-ZATCA-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const signatureStamp: DigitalSignatureStamp = {
      signedBy: brandConfig.ceoNameAr || currentUser.fullNameAr || currentUser.fullName,
      signedByRole: brandConfig.ceoTitleAr || 'المدير التنفيذي العام',
      signedAt: now,
      verificationHash: hash,
      signatureImageUrl: brandConfig.ceoSignatureUrl || '',
      stampImageUrl: brandConfig.companyStampUrl || '',
      signNotes,
    };

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'SIGN',
      entityType: docType as any,
      entityId: docId,
      summary: `توقيع واعتماد ${docType} رقم (${docId}) رقم التشفير: ${hash}`,
      newData: signatureStamp,
    });

    return signatureStamp;
  };

  // Multi-Attachment Handlers
  const addAttachmentToRecord = (
    recordType: 'Operation' | 'Payment' | 'Invoice',
    recordId: string,
    attData: Omit<DocumentAttachment, 'id' | 'uploadedAt' | 'uploadedBy'>
  ): DocumentAttachment => {
    const id = `att-${Date.now()}`;
    const newAtt: DocumentAttachment = {
      ...attData,
      id,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUser.fullNameAr || currentUser.fullName,
    };

    if (recordType === 'Operation') {
      setOperations((prev) =>
        prev.map((op) =>
          op.id === recordId
            ? {
                ...op,
                attachments: [...(op.attachments || []), newAtt],
                updated_at: new Date().toISOString(),
              }
            : op
        )
      );
    } else if (recordType === 'Payment') {
      setCrusherPayments((prev) =>
        prev.map((p) =>
          p.id === recordId
            ? {
                ...p,
                attachments: [...(p.attachments || []), newAtt],
              }
            : p
        )
      );
    }

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'ATTACH_FILE',
      entityType: recordType as any,
      entityId: recordId,
      summary: `إرفاق مستند جديد (${newAtt.fileName}) من تصنيف (${newAtt.docCategory})`,
      newData: { fileName: newAtt.fileName, category: newAtt.docCategory },
    });

    return newAtt;
  };

  const removeAttachmentFromRecord = (
    recordType: 'Operation' | 'Payment' | 'Invoice',
    recordId: string,
    attachmentId: string
  ) => {
    if (recordType === 'Operation') {
      setOperations((prev) =>
        prev.map((op) =>
          op.id === recordId
            ? {
                ...op,
                attachments: (op.attachments || []).filter((a) => a.id !== attachmentId),
                updated_at: new Date().toISOString(),
              }
            : op
        )
      );
    } else if (recordType === 'Payment') {
      setCrusherPayments((prev) =>
        prev.map((p) =>
          p.id === recordId
            ? {
                ...p,
                attachments: (p.attachments || []).filter((a) => a.id !== attachmentId),
              }
            : p
        )
      );
    }
  };

  const resetToDefaults = () => {
    setOperations([]);
    setCustomers([]);
    setCrushers([]);
    setTransporters([]);
    setMaterials(MATERIAL_OPTIONS);
    setUsers([]);
    setCrusherPayments([]);
    setEditRequests([]);
    setAuditLogs([]);
    setBrandConfig(INITIAL_BRAND_CONFIG);
  };

  // KPIs aggregation
  const kpis: DashboardKPIs = useMemo(() => {
    const ops = accessibleOperations;
    const totalSales = ops.reduce((acc, curr) => acc + (curr.sales_amount || 0), 0);
    const totalPurchasesCost = ops.reduce((acc, curr) => acc + (curr.purchases_cost || 0), 0);
    const netOperatingProfit = ops.reduce((acc, curr) => acc + (curr.net_profit || 0), 0);
    const profitMarginPercent = totalSales > 0 ? (netOperatingProfit / totalSales) * 100 : 0;
    const totalDeliveredTonnage = ops.reduce((acc, curr) => acc + (curr.qty_delivered || 0), 0);
    const totalLoadedTonnage = ops.reduce((acc, curr) => acc + (curr.qty_loaded || 0), 0);
    const totalWastageTonnage = ops.reduce((acc, curr) => acc + (curr.qty_wastage || 0), 0);
    const overallWastagePercent = totalLoadedTonnage > 0 ? (totalWastageTonnage / totalLoadedTonnage) * 100 : 0;
    const totalTrips = ops.length;

    const totalCrusherPurchased = activeOperations.reduce((acc, curr) => acc + (curr.purchases_cost || 0), 0);
    const totalCrusherPaid = crusherPayments
      .filter((p) => !p.is_deleted)
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const crusherPayableBalance = totalCrusherPurchased - totalCrusherPaid;

    const pendingApprovalsCount = editRequests.filter((r) => r.status === 'Pending').length;

    return {
      totalSales,
      totalPurchasesCost,
      netOperatingProfit,
      profitMarginPercent,
      totalDeliveredTonnage,
      totalLoadedTonnage,
      totalWastageTonnage,
      overallWastagePercent,
      totalTrips,
      crusherPayableBalance,
      pendingApprovalsCount,
    };
  }, [accessibleOperations, activeOperations, crusherPayments, editRequests]);

  return (
    <AppContext.Provider
      value={{
        isAuthReady,
        currentUser,
        setCurrentUser,
        currentCompany,
        setCurrentCompany,
        companies,
        refreshCompanies,
        users,
        setUsers,
        refreshUsers,
        language,
        setLanguage,
        dir,
        customers,
        crushers,
        transporters,
        materials,
        operations,
        crusherPayments,
        refreshOperations,
        refreshPartners,
        addOperation,
        updateOperation,
        deleteOperation,
        softDeleteOperation,
        restoreOperation,
        batchAddOperations,
        overrideOperationRecord,
        bulkOverrideOperations,
        addCrusherPayment,
        deleteCrusherPayment,
        softDeleteCrusherPayment,
        addCustomer,
        updateCustomer,
        softDeleteCustomer,
        restoreCustomer,
        deleteCustomer,
        batchAddCustomers,
        addCrusher,
        updateCrusher,
        softDeleteCrusher,
        restoreCrusher,
        deleteCrusher,
        batchAddCrushers,
        addTransporter,
        updateTransporter,
        softDeleteTransporter,
        restoreTransporter,
        deleteTransporter,
        batchAddTransporters,
        addMaterial,
        updateMaterial,
        softDeleteMaterial,
        restoreMaterial,
        deleteMaterial,
        addUser,
        updateUser,
        softDeleteUser,
        restoreUser,
        deleteUser,
        editRequests,
        createEditRequest,
        approveEditRequest,
        rejectEditRequest,
        brandConfig,
        updateBrandConfig,
        resetBrandConfig,
        signDocument,
        auditLogs,
        logAuditAction,
        clearAuditLogs,
        addAttachmentToRecord,
        removeAttachmentFromRecord,
        vouchers,
        addVoucher,
        createVoucher,
        updateVoucher,
        deleteVoucher,
        approveVoucher,
        autoGenerateVoucherFromPayment,
        isOnline,
        isLoadingData,
        signOutAuth,
        isNativeAuthSyncing,
        canAccessFinancials,
        canEditOperations,
        canDeleteRecords,
        canManageSettings,
        isAdmin,
        isCOO,
        isExecutive,
        canApproveEdits,
        canApproveInvoices,
        canApproveVouchers,
        canEditBranding,
        isGuestUser,
        assignedCustomerId,
        isDriverMode,
        setIsDriverMode,
        toggleDriverMode,
        exportDailyOperationsSnapshotJSON,
        accessibleOperations,
        activeOperations,
        softDeletedOperations,
        kpis,
        resetToDefaults,
        tenantTheme,
        setTenantTheme,
        densityMode,
        setDensityMode,
        themeMode,
        setThemeMode,
        isolationTelemetry,
        toasts,
        showToast,
        dismissToast,
        authToken,
        authTier,
        tenantSlug,
        tenantId,
        isTwoTierAuthenticated,
        loginMaster,
        loginTenant,
        verifyTenantTwoFactor,
        registerTenantAccount,
        recoverUserPassword,
        resetUserPassword,
        logoutUser,
        authErrorMessage,
        setAuthErrorMessage,
      }}
    >
      {children}
      {toasts.length > 0 && (
        <div
          role="region"
          aria-live="polite"
          id="oxengl-toast-container"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md transition-all ${
                t.type === 'error'
                  ? 'bg-rose-950/95 border-rose-700 text-white shadow-rose-950/50'
                  : t.type === 'warning'
                  ? 'bg-amber-950/95 border-amber-700 text-white shadow-amber-950/50'
                  : t.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-700 text-white shadow-emerald-950/50'
                  : 'bg-slate-900/95 border-slate-700 text-white shadow-black/50'
              }`}
            >
              <span className="text-xs font-bold leading-relaxed">{t.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 shrink-0 text-xs font-mono"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
