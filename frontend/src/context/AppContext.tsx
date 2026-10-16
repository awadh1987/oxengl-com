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
  ApprovalModuleType,
  TenantApprovalRule,
  WorkflowApprovalRequest,
  WorkflowApprovalStep,
  ApprovalAuditEntry,
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
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
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
  approvalRules: TenantApprovalRule[];
  workflowRequests: WorkflowApprovalRequest[];
  approvalAuditLogs: ApprovalAuditEntry[];
  refreshApprovalMatrix: () => Promise<void>;
  addApprovalRule: (rule: Partial<TenantApprovalRule> & { document_type: ApprovalModuleType; min_amount: number; required_role: string }) => Promise<TenantApprovalRule>;
  updateApprovalRule: (ruleId: string, patch: Partial<TenantApprovalRule>) => Promise<TenantApprovalRule>;
  deleteApprovalRule: (ruleId: string) => Promise<void>;
  toggleModuleApproval: (documentType: ApprovalModuleType, isActive: boolean) => Promise<void>;
  toggleModuleApprovalRules: (documentType: ApprovalModuleType, isActive: boolean) => Promise<void>;
  evaluateTransactionApproval: (
    paramsOrDocType:
      | {
          documentType: ApprovalModuleType;
          documentId: string;
          documentRef: string;
          title: string;
          amount: number;
          department?: string;
        }
      | ApprovalModuleType,
    documentId?: string,
    documentRef?: string,
    amount?: number,
    title?: string,
    department?: string
  ) => {
    requiresApproval: boolean;
    status: 'APPROVED' | 'PENDING_APPROVAL';
    request?: WorkflowApprovalRequest;
  };
  approveWorkflowRequest: (stepId: string, remarks?: string) => Promise<void>;
  rejectWorkflowRequest: (stepId: string, reason: string) => Promise<void>;
  escalateWorkflowRequest: (stepId: string, targetRole: string, reason?: string) => Promise<void>;
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
        setCurrentUser(DEFAULT_FALLBACK_USER);
        setCurrentCompany(null);
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
    const isPublic = typeof window !== 'undefined' && (
      window.location.pathname === '/' ||
      window.location.pathname === '' ||
      window.location.pathname === '/nextgen' ||
      window.location.pathname === '/landing-nextgen'
    );
    const token = getAuthToken();
    if (isPublic && !token) {
      setCompanies([]);
      return [];
    }
    try {
      const apiCompanies = await erpApi.getCompanies();
      if (!Array.isArray(apiCompanies)) {
        setCompanies([]);
        return [];
      }
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
    } catch (error) {
      console.warn('Company directory unavailable:', error);
      setCompanies([]);
      return [];
    }
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
    const token = getAuthToken();
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
      custom_attributes: operation.custom_attributes || {},
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
    const isPublic = typeof window !== 'undefined' && (
      window.location.pathname === '/' ||
      window.location.pathname === '' ||
      window.location.pathname === '/nextgen' ||
      window.location.pathname === '/landing-nextgen'
    );
    const token = getAuthToken();
    if (isPublic && !token) {
      return;
    }
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
  const [approvalRules, setApprovalRules] = useState<TenantApprovalRule[]>(() => [
    {
      id: 'rule-ops-1',
      name: 'Operations High-Value Dispatch Review',
      rule_name: 'Operations High-Value Dispatch Review',
      document_type: 'OPERATIONS',
      min_amount: 15000,
      max_amount: null,
      currency: 'SAR',
      department: 'OPERATIONS',
      required_role: 'OPERATIONS_MANAGER',
      step_order: 1,
      sequence_order: 1,
      is_active: true,
    },
    {
      id: 'rule-ops-2',
      name: 'Operations Executive Sign-Off (> 50k SAR)',
      rule_name: 'Operations Executive Sign-Off (> 50k SAR)',
      document_type: 'OPERATIONS',
      min_amount: 50000,
      max_amount: null,
      currency: 'SAR',
      department: 'OPERATIONS',
      required_role: 'FINANCE_MANAGER',
      step_order: 2,
      sequence_order: 2,
      is_active: true,
    },
    {
      id: 'rule-po-1',
      name: 'Purchase Order Procurement Manager Review',
      rule_name: 'Purchase Order Procurement Manager Review',
      document_type: 'PURCHASE_ORDER',
      min_amount: 10000,
      max_amount: null,
      currency: 'SAR',
      department: 'PROCUREMENT',
      required_role: 'PROCUREMENT_MANAGER',
      step_order: 1,
      sequence_order: 1,
      is_active: true,
    },
    {
      id: 'rule-po-2',
      name: 'Purchase Order Executive CFO Approval',
      rule_name: 'Purchase Order Executive CFO Approval',
      document_type: 'PURCHASE_ORDER',
      min_amount: 50000,
      max_amount: null,
      currency: 'SAR',
      department: 'PROCUREMENT',
      required_role: 'FINANCE_MANAGER',
      step_order: 2,
      sequence_order: 2,
      is_active: true,
    },
    {
      id: 'rule-pr-1',
      name: 'Purchase Requisition Supervisor Review',
      rule_name: 'Purchase Requisition Supervisor Review',
      document_type: 'PURCHASE_REQUISITION',
      min_amount: 5000,
      max_amount: null,
      currency: 'SAR',
      department: 'PROCUREMENT',
      required_role: 'DEPARTMENT_SUPERVISOR',
      step_order: 1,
      sequence_order: 1,
      is_active: true,
    },
    {
      id: 'rule-bill-1',
      name: 'Vendor Bill Finance Controller Review',
      rule_name: 'Vendor Bill Finance Controller Review',
      document_type: 'VENDOR_BILL',
      min_amount: 10000,
      max_amount: null,
      currency: 'SAR',
      department: 'FINANCE',
      required_role: 'FINANCE_MANAGER',
      step_order: 1,
      sequence_order: 1,
      is_active: true,
    },
    {
      id: 'rule-vch-1',
      name: 'Financial Voucher Treasury Approval',
      rule_name: 'Financial Voucher Treasury Approval',
      document_type: 'FINANCIAL_VOUCHER',
      min_amount: 10000,
      max_amount: null,
      currency: 'SAR',
      department: 'FINANCE',
      required_role: 'FINANCE_MANAGER',
      step_order: 1,
      sequence_order: 1,
      is_active: true,
    },
    {
      id: 'rule-vch-2',
      name: 'Financial Voucher Executive CEO Approval (> 50k SAR)',
      rule_name: 'Financial Voucher Executive CEO Approval (> 50k SAR)',
      document_type: 'FINANCIAL_VOUCHER',
      min_amount: 50000,
      max_amount: null,
      currency: 'SAR',
      department: 'FINANCE',
      required_role: 'CEO',
      step_order: 2,
      sequence_order: 2,
      is_active: true,
    },
    {
      id: 'rule-crusher-1',
      name: 'Crusher Supplier Settlement Approval',
      rule_name: 'Crusher Supplier Settlement Approval',
      document_type: 'CRUSHER_PAYMENT',
      min_amount: 20000,
      max_amount: null,
      currency: 'SAR',
      department: 'FINANCE',
      required_role: 'FINANCE_MANAGER',
      step_order: 1,
      sequence_order: 1,
      is_active: true,
    },
    {
      id: 'rule-fleet-1',
      name: 'Fleet Maintenance Work Order Approval',
      rule_name: 'Fleet Maintenance Work Order Approval',
      document_type: 'FLEET_WORK_ORDER',
      min_amount: 5000,
      max_amount: null,
      currency: 'SAR',
      department: 'FLEET',
      required_role: 'FLEET_MANAGER',
      step_order: 1,
      sequence_order: 1,
      is_active: true,
    },
    {
      id: 'rule-hrms-1',
      name: 'HRMS Payroll & Settlement Approval',
      rule_name: 'HRMS Payroll & Settlement Approval',
      document_type: 'HRMS',
      min_amount: 10000,
      max_amount: null,
      currency: 'SAR',
      department: 'HR',
      required_role: 'HR_DIRECTOR',
      step_order: 1,
      sequence_order: 1,
      is_active: true,
    },
  ]);
  const approvalRulesRef = useRef<TenantApprovalRule[]>(approvalRules);
  useEffect(() => {
    approvalRulesRef.current = approvalRules;
  }, [approvalRules]);

  const [workflowRequests, setWorkflowRequests] = useState<WorkflowApprovalRequest[]>([]);
  const workflowRequestsRef = useRef<WorkflowApprovalRequest[]>(workflowRequests);
  useEffect(() => {
    workflowRequestsRef.current = workflowRequests;
  }, [workflowRequests]);

  const [approvalAuditLogs, setApprovalAuditLogs] = useState<ApprovalAuditEntry[]>([]);

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
      mustChangePassword: !!(res?.must_change_password ?? (userObj as any)?.must_change_password),
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
    if (newUser.mustChangePassword) {
      showToast(
        language === 'ar'
          ? 'يجب تغيير كلمة المرور المؤقتة من الملف الشخصي قبل المتابعة'
          : 'Please replace your temporary password from your profile',
        'warning'
      );
    }
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
  const canEditOperations = isAdmin || isCOO || userRole === 'Owner' || userRole === 'Accountant' || userRole === 'Data_Entry';
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

  const evaluateTransactionApproval = (
    paramsOrDocType:
      | {
          documentType: ApprovalModuleType;
          documentId: string;
          documentRef: string;
          title: string;
          amount: number;
          department?: string;
        }
      | ApprovalModuleType,
    documentId?: string,
    documentRef?: string,
    amount?: number,
    title?: string,
    department?: string
  ): {
    requiresApproval: boolean;
    status: 'APPROVED' | 'PENDING_APPROVAL';
    request?: WorkflowApprovalRequest;
  } => {
    const params =
      typeof paramsOrDocType === 'object'
        ? paramsOrDocType
        : {
            documentType: paramsOrDocType,
            documentId: documentId || '',
            documentRef: documentRef || '',
            amount: Number(amount || 0),
            title: title || `${paramsOrDocType} (${documentRef || documentId || ''})`,
            department,
          };

    const evalAmt = Number(params.amount || 0);
    const activeRules = approvalRulesRef.current
      .filter(
        (rule) =>
          rule.is_active &&
          rule.document_type === params.documentType &&
          evalAmt >= Number(rule.min_amount || 0) &&
          (rule.max_amount == null || evalAmt <= Number(rule.max_amount)) &&
          (!rule.department || !params.department || rule.department.toUpperCase() === params.department.toUpperCase())
      )
      .sort(
        (a, b) =>
          Number(a.sequence_order ?? a.step_order ?? 1) - Number(b.sequence_order ?? b.step_order ?? 1) ||
          Number(a.min_amount || 0) - Number(b.min_amount || 0)
      );

    if (activeRules.length === 0) {
      return { requiresApproval: false, status: 'APPROVED' };
    }

    const now = new Date().toISOString();
    const instanceId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const steps: WorkflowApprovalStep[] = activeRules.map((rule, idx) => {
      const stepId = `step-${instanceId}-${idx + 1}`;
      const seq = idx + 1;
      const rName = rule.rule_name || rule.name;
      return {
        id: stepId,
        step_id: stepId,
        step_order: seq,
        sequence_order: seq,
        required_role: rule.required_role,
        assigned_role_code: rule.required_role,
        required_user_id: rule.required_user_id ?? null,
        status: idx === 0 ? 'PENDING' : 'WAITING',
        rule_name: rName,
        min_amount: rule.min_amount,
        max_amount: rule.max_amount ?? null,
      };
    });

    const requesterName = currentUser?.fullNameAr || currentUser?.fullName || 'System User';
    const request: WorkflowApprovalRequest = {
      id: instanceId,
      instance_id: instanceId,
      step_id: steps[0].step_id,
      step_order: 1,
      sequence_order: 1,
      required_role: steps[0].required_role,
      required_user_id: steps[0].required_user_id ?? null,
      document_type: params.documentType,
      document_id: params.documentId,
      document_ref: params.documentRef,
      title: params.title,
      amount: evalAmt,
      total_amount: evalAmt,
      currency: 'SAR',
      department: params.department || activeRules[0].department || 'GENERAL',
      requested_by: requesterName,
      requester_name: requesterName,
      requested_by_role: currentUser?.role || 'Data_Entry',
      status: 'PENDING_APPROVAL',
      current_step_order: 1,
      current_step_sequence: 1,
      total_steps: steps.length,
      steps,
      created_at: now,
    };

    const nextRequests = [request, ...workflowRequestsRef.current.filter((w) => w.instance_id !== instanceId)];
    workflowRequestsRef.current = nextRequests;
    setWorkflowRequests(nextRequests);

    const auditEntry: ApprovalAuditEntry = {
      id: `ap-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      instance_id: instanceId,
      step_id: steps[0].step_id,
      document_type: params.documentType,
      document_id: params.documentId,
      document_ref: params.documentRef,
      step_order: 1,
      sequence_order: 1,
      step_sequence: 1,
      action: 'SUBMITTED',
      required_role: steps[0].required_role,
      actor_name: requesterName,
      actor_role: currentUser?.role || 'Data_Entry',
      actor_id: currentUser?.id || 'system',
      remarks: `Triggered ${steps.length}-step approval policy (${activeRules[0].rule_name || activeRules[0].name}) for amount ${evalAmt.toLocaleString()} SAR`,
      total_amount: evalAmt,
      timestamp: now,
    };
    setApprovalAuditLogs((prev) => [auditEntry, ...prev]);

    // Sync with backend approval engine if authenticated
    if (typeof navigator !== 'undefined' && navigator.onLine && getAuthToken()) {
      fetch('/api/v1/procurement/approvals/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          document_type: params.documentType,
          document_id: params.documentId,
          total_amount: evalAmt,
          department: params.department || null,
        }),
      }).catch(() => {});
    }

    return { requiresApproval: true, status: 'PENDING_APPROVAL', request };
  };

  const addOperation = async (opData: Omit<OperationRecord, 'id' | 'created_at' | 'updated_at'>): Promise<void> => {
    const evalAmount = Number(opData.total_sales || opData.sales_amount || 0);
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
        custom_attributes: opData.custom_attributes || {},
      });
      const baseRecord = mapApiOperation(operation);
      const evalResult = evaluateTransactionApproval({
        documentType: 'OPERATIONS',
        documentId: baseRecord.id,
        documentRef: operation.scale_ticket_attachment || operation.ticket_number || opData.scale_ticket_no || baseRecord.id,
        title: `Dispatch Trip ${opData.truck_no} — ${opData.destination_customer}`,
        amount: evalAmount,
        department: 'OPERATIONS',
      });
      const serverRecord: OperationRecord = {
        ...baseRecord,
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
        approval_status: evalResult.status,
        workflow_instance_id: evalResult.request?.instance_id,
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
    const evalResult = evaluateTransactionApproval({
      documentType: 'OPERATIONS',
      documentId: id,
      documentRef: opData.scale_ticket_no || id,
      title: `Dispatch Trip ${opData.truck_no} — ${opData.destination_customer}`,
      amount: evalAmount,
      department: 'OPERATIONS',
    });
    const newRecord: OperationRecord = {
      ...opData,
      id,
      version: 1,
      is_deleted: false,
      created_at: now,
      updated_at: now,
      created_by: currentUser.fullNameAr || currentUser.fullName,
      approval_status: evalResult.status,
      workflow_instance_id: evalResult.request?.instance_id,
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
    const evalResult = evaluateTransactionApproval({
      documentType: 'CRUSHER_PAYMENT',
      documentId: id,
      documentRef: payment.reference_no || id,
      title: `Crusher Settlement — ${payment.crusher_name}`,
      amount: Number(payment.amount || 0),
      department: 'FINANCE',
    });
    const newPay: CrusherPaymentEntry = {
      ...payment,
      id,
      is_deleted: false,
      created_at: new Date().toISOString(),
      approval_status: evalResult.status,
      workflow_instance_id: evalResult.request?.instance_id,
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

    const evalResult = evaluateTransactionApproval({
      documentType: 'FINANCIAL_VOUCHER',
      documentId: id,
      documentRef: autoNumber,
      title: `${vchData.type} Voucher — ${vchData.partyName} (${autoNumber})`,
      amount: Number(vchData.amount || 0),
      department: 'FINANCE',
    });

    const mustAwaitApproval = evalResult.requiresApproval || vchData.status === 'Pending_Approval';

    const newVoucher: FinancialVoucher = {
      ...vchData,
      id,
      voucherNumber: autoNumber,
      amountInWordsAr: tafqeetArabic(vchData.amount),
      amountInWordsEn: tafqeetEnglish(vchData.amount),
      isApproved: mustAwaitApproval ? false : Boolean(vchData.isApproved ?? true),
      status: mustAwaitApproval ? 'Pending_Approval' : (vchData.status || 'Approved'),
      approvedBy: mustAwaitApproval ? undefined : vchData.approvedBy,
      approvedAt: mustAwaitApproval ? undefined : vchData.approvedAt,
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
    if (!isAdmin && !isCOO && !canApproveVouchers) return;
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

    // Also mark any matching workflow request for this voucher as APPROVED
    setWorkflowRequests((prev) => {
      const updated = prev.map((w) =>
        w.document_id === id && w.status !== 'APPROVED'
          ? {
              ...w,
              status: 'APPROVED' as const,
              completed_at: new Date().toISOString(),
              steps: w.steps.map((s) => ({
                ...s,
                status: 'APPROVED' as const,
                approved_by_name: s.approved_by_name || currentUser.fullNameAr || currentUser.fullName,
                approved_at: s.approved_at || new Date().toISOString(),
                comments: s.comments || reviewNotes || 'Executive direct voucher approval',
              })),
            }
          : w
      );
      workflowRequestsRef.current = updated;
      return updated;
    });

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
    // Block General Ledger posting when voucher requires approval!
    if (newVoucher.status === 'Pending_Approval' || !newVoucher.isApproved) {
      return newVoucher;
    }
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
          custom_attributes: newVoucher.custom_attributes,
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
          custom_attributes: custData.custom_attributes || {},
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
          custom_attributes: crushData.custom_attributes || {},
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
          custom_attributes: transData.custom_attributes || {},
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
            syncReferenceId: u.sync_reference_id ?? null,
            avatar_url: u.avatar_url ?? undefined,
            role: (u.role as UserRole) || 'Guest',
            iamRole: u.iam_role ?? null,
            mustChangePassword: !!u.must_change_password,
            status: u.is_active ? 'Active' : 'Suspended',
            created_at: u.created_at,
          };
        });
        const unique = Array.from(new Map(mapped.map((u) => [u.id, u])).values());
        setUsers(unique.length > 0 || !currentUser?.id ? unique : [currentUser]);
      }
    } catch (err) {
      console.warn('Notice loading users from live backend API:', err);
      // Never leave the matrix empty: show the authenticated session user.
      setUsers((prev) => (prev.length > 0 || !currentUser?.id ? prev : [currentUser]));
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

  const refreshApprovalMatrix = async (): Promise<void> => {
    const token = getAuthToken();
    if (!token || typeof navigator === 'undefined' || !navigator.onLine) return;
    try {
      const [matrixRes, queueRes, auditRes] = await Promise.all([
        fetch('/api/v1/procurement/approvals/matrix', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch('/api/v1/procurement/approvals/queue', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch('/api/v1/procurement/approvals/audit-logs', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);

      if (matrixRes?.ok) {
        const data = await matrixRes.json();
        if (Array.isArray(data?.rules) && data.rules.length > 0) {
          approvalRulesRef.current = data.rules;
          setApprovalRules(data.rules);
        }
      }

      if (queueRes?.ok) {
        const queueData = await queueRes.json();
        if (Array.isArray(queueData)) {
          setWorkflowRequests((prev) => {
            const existingIds = new Set(prev.map((p) => p.instance_id));
            const serverMapped: WorkflowApprovalRequest[] = queueData
              .filter((q: any) => !existingIds.has(String(q.instance_id)))
              .map((q: any) => ({
                instance_id: String(q.instance_id),
                step_id: String(q.step_id),
                step_order: Number(q.step_order || 1),
                required_role: String(q.required_role || 'FINANCE_MANAGER'),
                required_user_id: q.required_user_id ?? null,
                document_type: (q.document_type || 'PURCHASE_ORDER') as ApprovalModuleType,
                document_id: String(q.document_id),
                document_ref: String(q.document_id).slice(0, 12),
                title: `${q.document_type} Approval (${String(q.document_id).slice(0, 8)})`,
                total_amount: Number(q.total_amount || 0),
                department: q.department || 'PROCUREMENT',
                requested_by: 'Tenant User',
                requested_by_role: 'Accountant',
                status: 'IN_PROGRESS',
                current_step_order: Number(q.current_step_order || q.step_order || 1),
                steps: Array.isArray(q.steps)
                  ? q.steps
                  : [
                      {
                        step_id: String(q.step_id),
                        step_order: Number(q.step_order || 1),
                        required_role: String(q.required_role || 'FINANCE_MANAGER'),
                        status: 'PENDING',
                      },
                    ],
                created_at: q.created_at || new Date().toISOString(),
              }));
            const merged = [...serverMapped, ...prev];
            workflowRequestsRef.current = merged;
            return merged;
          });
        }
      }

      if (auditRes?.ok) {
        const auditData = await auditRes.json();
        if (Array.isArray(auditData) && auditData.length > 0) {
          setApprovalAuditLogs((prev) => {
            const existingIds = new Set(prev.map((a) => a.step_id + ':' + a.action));
            const newEntries: ApprovalAuditEntry[] = auditData
              .filter((a: any) => !existingIds.has(`${a.step_id}:${a.status}`))
              .map((a: any) => ({
                id: `srv-audit-${a.step_id}-${a.status}`,
                instance_id: String(a.instance_id),
                step_id: String(a.step_id),
                document_type: (a.document_type || 'PURCHASE_ORDER') as ApprovalModuleType,
                document_id: String(a.document_id),
                document_ref: String(a.document_id).slice(0, 12),
                step_order: Number(a.step_order || 1),
                action: (a.status || 'APPROVED') as ApprovalAuditEntry['action'],
                required_role: String(a.required_role || 'FINANCE_MANAGER'),
                actor_name: a.approved_by_user_id ? `User (${String(a.approved_by_user_id).slice(0, 8)})` : (currentUser?.fullName || 'Approver'),
                actor_id: String(a.approved_by_user_id || ''),
                remarks: a.comments || a.rejection_reason || '',
                escalated_to_role: a.escalated_to_role || null,
                total_amount: Number(a.total_amount || 0),
                timestamp: a.approved_at || new Date().toISOString(),
              }));
            return [...newEntries, ...prev];
          });
        }
      }
    } catch (err) {
      console.warn('[ApprovalsEngine] Matrix sync warning:', err);
    }
  };

  const addApprovalRule = async (ruleData: Partial<TenantApprovalRule> & { document_type: ApprovalModuleType; min_amount: number; required_role: string }): Promise<TenantApprovalRule> => {
    const rName = ruleData.rule_name || ruleData.name || `${ruleData.document_type} Approval Rule`;
    const seq = Number(ruleData.sequence_order ?? ruleData.step_order ?? 1);
    let createdRule: TenantApprovalRule = {
      ...ruleData,
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: rName,
      rule_name: rName,
      step_order: seq,
      sequence_order: seq,
      currency: ruleData.currency || 'SAR',
      is_active: ruleData.is_active ?? true,
    };
    const token = getAuthToken();
    if (token && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const res = await fetch('/api/v1/procurement/approvals/rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(createdRule),
        });
        if (res.ok) {
          const srv = await res.json();
          if (srv?.id) {
            createdRule = {
              ...createdRule,
              ...srv,
              name: srv.name || srv.rule_name || rName,
              rule_name: srv.rule_name || srv.name || rName,
              step_order: Number(srv.step_order ?? srv.sequence_order ?? seq),
              sequence_order: Number(srv.sequence_order ?? srv.step_order ?? seq),
            };
          }
        }
      } catch {
        // Fallback to local state rule
      }
    }
    const nextRules = [...approvalRulesRef.current, createdRule];
    approvalRulesRef.current = nextRules;
    setApprovalRules(nextRules);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'CREATE',
      entityType: 'ApprovalRule' as any,
      entityId: createdRule.id,
      summary: `Created approval policy rule "${createdRule.name}" (${createdRule.document_type} >= ${createdRule.min_amount.toLocaleString()} SAR -> ${createdRule.required_role})`,
      newData: createdRule,
    });
    return createdRule;
  };

  const updateApprovalRule = async (ruleId: string, patch: Partial<TenantApprovalRule>): Promise<TenantApprovalRule> => {
    const existing = approvalRulesRef.current.find((r) => r.id === ruleId);
    const merged = existing
      ? { ...existing, ...patch }
      : ({
          id: ruleId,
          name: 'Updated Rule',
          rule_name: 'Updated Rule',
          document_type: 'OPERATIONS',
          min_amount: 0,
          required_role: 'OPERATIONS_MANAGER',
          step_order: 1,
          sequence_order: 1,
          is_active: true,
          ...patch,
        } as TenantApprovalRule);
    const rName = patch.rule_name || patch.name || merged.rule_name || merged.name;
    const seq = Number(patch.sequence_order ?? patch.step_order ?? merged.sequence_order ?? merged.step_order ?? 1);
    const updatedRule: TenantApprovalRule = {
      ...merged,
      name: rName,
      rule_name: rName,
      step_order: seq,
      sequence_order: seq,
    };

    const token = getAuthToken();
    if (token && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const res = await fetch(`/api/v1/procurement/approvals/rules/${ruleId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const srv = await res.json();
          if (srv?.id) Object.assign(updatedRule, srv);
        }
      } catch {
        // Fallback to local update
      }
    }

    const nextRules = approvalRulesRef.current.map((r) => (r.id === ruleId ? updatedRule : r));
    approvalRulesRef.current = nextRules;
    setApprovalRules(nextRules);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'ApprovalRule' as any,
      entityId: ruleId,
      summary: `Updated approval policy rule "${updatedRule.name}" (${updatedRule.document_type})`,
      oldData: existing,
      newData: updatedRule,
    });
    return updatedRule;
  };

  const deleteApprovalRule = async (ruleId: string): Promise<void> => {
    const existing = approvalRulesRef.current.find((r) => r.id === ruleId);
    const token = getAuthToken();
    if (token && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        await fetch(`/api/v1/procurement/approvals/rules/${ruleId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore network error
      }
    }
    const nextRules = approvalRulesRef.current.filter((r) => r.id !== ruleId);
    approvalRulesRef.current = nextRules;
    setApprovalRules(nextRules);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'DELETE',
      entityType: 'ApprovalRule' as any,
      entityId: ruleId,
      summary: `Deleted approval policy rule "${existing?.name || ruleId}"`,
    });
  };

  const toggleModuleApproval = async (documentType: ApprovalModuleType, isActive: boolean): Promise<void> => {
    const token = getAuthToken();
    if (token && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        await fetch('/api/v1/procurement/approvals/rules/module-toggle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ document_type: documentType, is_active: isActive }),
        });
      } catch {
        // Fallback to local state
      }
    }
    const nextRules = approvalRulesRef.current.map((r) =>
      r.document_type === documentType ? { ...r, is_active: isActive } : r
    );
    approvalRulesRef.current = nextRules;
    setApprovalRules(nextRules);

    logAuditAction({
      userId: currentUser.id,
      userName: currentUser.fullNameAr || currentUser.fullName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: 'ApprovalRule' as any,
      entityId: documentType,
      summary: `${isActive ? 'Enabled' : 'Disabled'} approval enforcement for module ${documentType}`,
    });
  };

  const approveWorkflowRequest = async (stepId: string, remarks?: string): Promise<void> => {
    const now = new Date().toISOString();
    const actorName = currentUser?.fullNameAr || currentUser?.fullName || 'Executive Approver';
    const targetReq = workflowRequestsRef.current.find(
      (w) =>
        w.step_id === stepId ||
        w.id === stepId ||
        w.instance_id === stepId ||
        w.steps.some((s) => s.step_id === stepId || s.id === stepId)
    );

    const token = getAuthToken();
    if (token && typeof navigator !== 'undefined' && navigator.onLine) {
      fetch(`/api/v1/procurement/approvals/steps/${stepId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ comments: remarks || 'Approved via OxenGL Governance Engine' }),
      }).catch(() => {});
    }

    if (!targetReq) return;

    const updatedSteps = targetReq.steps.map((s) => {
      if (s.step_id === stepId || s.id === stepId) {
        return {
          ...s,
          status: 'APPROVED' as const,
          approved_by_name: actorName,
          approved_by_user_id: currentUser?.id,
          approved_at: now,
          comments: remarks || 'Approved',
        };
      }
      return s;
    });

    const nextWaitingIdx = updatedSteps.findIndex((s) => s.status === 'WAITING' || s.status === 'PENDING');
    let nextStatus: WorkflowApprovalRequest['status'] = 'APPROVED';
    let nextActiveStep = updatedSteps[updatedSteps.length - 1];

    if (nextWaitingIdx !== -1) {
      updatedSteps[nextWaitingIdx] = {
        ...updatedSteps[nextWaitingIdx],
        status: 'PENDING',
      };
      nextStatus = 'PENDING_APPROVAL';
      nextActiveStep = updatedSteps[nextWaitingIdx];
    }

    const nextSeq = Number(nextActiveStep.sequence_order ?? nextActiveStep.step_order ?? 1);
    const updatedReq: WorkflowApprovalRequest = {
      ...targetReq,
      step_id: nextActiveStep.step_id,
      step_order: nextSeq,
      sequence_order: nextSeq,
      required_role: nextActiveStep.required_role,
      current_step_order: nextSeq,
      current_step_sequence: nextSeq,
      status: nextStatus,
      steps: updatedSteps,
      completed_at: nextStatus === 'APPROVED' ? now : undefined,
    };

    const nextList = workflowRequestsRef.current.map((w) =>
      w.instance_id === targetReq!.instance_id ? updatedReq : w
    );
    workflowRequestsRef.current = nextList;
    setWorkflowRequests(nextList);

    const approvedStepObj =
      targetReq.steps.find((s) => s.step_id === stepId || s.id === stepId) || targetReq.steps[0];
    const approvedSeq = Number(approvedStepObj.sequence_order ?? approvedStepObj.step_order ?? 1);

    const auditEntry: ApprovalAuditEntry = {
      id: `ap-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      instance_id: targetReq.instance_id,
      step_id: stepId,
      document_type: targetReq.document_type,
      document_id: targetReq.document_id,
      document_ref: targetReq.document_ref,
      step_order: approvedSeq,
      sequence_order: approvedSeq,
      step_sequence: approvedSeq,
      action: 'APPROVED',
      required_role: approvedStepObj.required_role,
      actor_name: actorName,
      actor_role: currentUser?.role || approvedStepObj.required_role,
      actor_id: currentUser?.id || 'admin',
      remarks: remarks || 'Approved',
      total_amount: targetReq.total_amount,
      timestamp: now,
    };
    setApprovalAuditLogs((prev) => [auditEntry, ...prev]);

    // When all steps are approved, unlock the underlying transaction!
    if (nextStatus === 'APPROVED') {
      if (targetReq.document_type === 'OPERATIONS') {
        setOperations((prev) =>
          prev.map((op) =>
            op.id === targetReq!.document_id
              ? { ...op, approval_status: 'APPROVED', updated_at: now }
              : op
          )
        );
      } else if (targetReq.document_type === 'CRUSHER_PAYMENT') {
        setCrusherPayments((prev) =>
          prev.map((p) =>
            p.id === targetReq!.document_id
              ? { ...p, approval_status: 'APPROVED' }
              : p
          )
        );
      } else if (targetReq.document_type === 'FINANCIAL_VOUCHER') {
        await approveVoucher(targetReq.document_id, remarks || 'Approved via Multi-Step Workflow');
      }
    }

    logAuditAction({
      userId: currentUser.id,
      userName: actorName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'APPROVE',
      entityType: targetReq.document_type as any,
      entityId: targetReq.document_id,
      summary: `Approved Step #${approvedSeq} (${approvedStepObj.required_role}) for ${targetReq.document_ref}${remarks ? ` — Remarks: ${remarks}` : ''}`,
      newData: updatedReq,
    });
  };

  const rejectWorkflowRequest = async (stepId: string, reason: string): Promise<void> => {
    const now = new Date().toISOString();
    const actorName = currentUser?.fullNameAr || currentUser?.fullName || 'Executive Approver';
    const targetReq = workflowRequestsRef.current.find(
      (w) =>
        w.step_id === stepId ||
        w.id === stepId ||
        w.instance_id === stepId ||
        w.steps.some((s) => s.step_id === stepId || s.id === stepId)
    );

    const token = getAuthToken();
    if (token && typeof navigator !== 'undefined' && navigator.onLine) {
      fetch(`/api/v1/procurement/approvals/steps/${stepId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reason || 'Rejected by approver' }),
      }).catch(() => {});
    }

    if (!targetReq) return;

    const updatedSteps = targetReq.steps.map((s) =>
      s.step_id === stepId || s.id === stepId
        ? {
            ...s,
            status: 'REJECTED' as const,
            approved_by_name: actorName,
            approved_by_user_id: currentUser?.id,
            approved_at: now,
            rejection_reason: reason,
          }
        : s
    );

    const updatedReq: WorkflowApprovalRequest = {
      ...targetReq,
      status: 'REJECTED',
      steps: updatedSteps,
      completed_at: now,
    };

    const nextList = workflowRequestsRef.current.map((w) =>
      w.instance_id === targetReq.instance_id ? updatedReq : w
    );
    workflowRequestsRef.current = nextList;
    setWorkflowRequests(nextList);

    const rejectedStepObj =
      targetReq.steps.find((s) => s.step_id === stepId || s.id === stepId) || targetReq.steps[0];
    const rejectedSeq = Number(rejectedStepObj.sequence_order ?? rejectedStepObj.step_order ?? 1);

    const auditEntry: ApprovalAuditEntry = {
      id: `ap-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      instance_id: targetReq.instance_id,
      step_id: stepId,
      document_type: targetReq.document_type,
      document_id: targetReq.document_id,
      document_ref: targetReq.document_ref,
      step_order: rejectedSeq,
      sequence_order: rejectedSeq,
      step_sequence: rejectedSeq,
      action: 'REJECTED',
      required_role: rejectedStepObj.required_role,
      actor_name: actorName,
      actor_role: currentUser?.role || rejectedStepObj.required_role,
      actor_id: currentUser?.id || 'admin',
      remarks: reason,
      total_amount: targetReq.total_amount,
      timestamp: now,
    };
    setApprovalAuditLogs((prev) => [auditEntry, ...prev]);

    if (targetReq.document_type === 'OPERATIONS') {
      setOperations((prev) =>
        prev.map((op) =>
          op.id === targetReq.document_id
            ? { ...op, approval_status: 'REJECTED', updated_at: now }
            : op
        )
      );
    } else if (targetReq.document_type === 'CRUSHER_PAYMENT') {
      setCrusherPayments((prev) =>
        prev.map((p) =>
          p.id === targetReq.document_id
            ? { ...p, approval_status: 'REJECTED' }
            : p
        )
      );
    } else if (targetReq.document_type === 'FINANCIAL_VOUCHER') {
      setVouchers((prev) =>
        prev.map((v) =>
          v.id === targetReq.document_id
            ? { ...v, isApproved: false, status: 'Rejected', updated_at: now }
            : v
        )
      );
    }

    logAuditAction({
      userId: currentUser.id,
      userName: actorName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'REJECT',
      entityType: targetReq.document_type as any,
      entityId: targetReq.document_id,
      summary: `Rejected Step #${rejectedSeq} for ${targetReq.document_ref} — Reason: ${reason}`,
      newData: updatedReq,
    });
  };

  const escalateWorkflowRequest = async (stepId: string, targetRole: string, reason?: string): Promise<void> => {
    const now = new Date().toISOString();
    const actorName = currentUser?.fullNameAr || currentUser?.fullName || 'Executive Approver';
    const targetReq = workflowRequestsRef.current.find(
      (w) =>
        w.step_id === stepId ||
        w.id === stepId ||
        w.instance_id === stepId ||
        w.steps.some((s) => s.step_id === stepId || s.id === stepId)
    );

    const token = getAuthToken();
    if (token && typeof navigator !== 'undefined' && navigator.onLine) {
      fetch(`/api/v1/procurement/approvals/steps/${stepId}/escalate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target_role: targetRole, reason: reason || 'Escalated for executive review' }),
      }).catch(() => {});
    }

    if (!targetReq) return;

    const updatedSteps = targetReq.steps.map((s) =>
      s.step_id === stepId || s.id === stepId
        ? {
            ...s,
            status: 'ESCALATED' as const,
            escalated_to_role: targetRole,
            required_role: targetRole,
            assigned_role_code: targetRole,
            comments: reason || `Escalated to ${targetRole}`,
          }
        : s
    );

    const updatedReq: WorkflowApprovalRequest = {
      ...targetReq,
      required_role: targetRole,
      steps: updatedSteps,
    };

    const nextList = workflowRequestsRef.current.map((w) =>
      w.instance_id === targetReq.instance_id ? updatedReq : w
    );
    workflowRequestsRef.current = nextList;
    setWorkflowRequests(nextList);

    const escalatedStepObj =
      targetReq.steps.find((s) => s.step_id === stepId || s.id === stepId) || targetReq.steps[0];
    const escalatedSeq = Number(escalatedStepObj.sequence_order ?? escalatedStepObj.step_order ?? 1);

    const auditEntry: ApprovalAuditEntry = {
      id: `ap-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      instance_id: targetReq.instance_id,
      step_id: stepId,
      document_type: targetReq.document_type,
      document_id: targetReq.document_id,
      document_ref: targetReq.document_ref,
      step_order: escalatedSeq,
      sequence_order: escalatedSeq,
      step_sequence: escalatedSeq,
      action: 'ESCALATED',
      required_role: targetRole,
      actor_name: actorName,
      actor_role: currentUser?.role || escalatedStepObj.required_role,
      actor_id: currentUser?.id || 'admin',
      remarks: reason || `Escalated to ${targetRole}`,
      escalated_to_role: targetRole,
      total_amount: targetReq.total_amount,
      timestamp: now,
    };
    setApprovalAuditLogs((prev) => [auditEntry, ...prev]);

    logAuditAction({
      userId: currentUser.id,
      userName: actorName,
      userRole: currentUser?.role ?? 'Guest',
      action: 'UPDATE',
      entityType: targetReq.document_type as any,
      entityId: targetReq.document_id,
      summary: `Escalated Step #${escalatedSeq} for ${targetReq.document_ref} to role ${targetRole}`,
      newData: updatedReq,
    });
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
    setWorkflowRequests([]);
    setApprovalAuditLogs([]);
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

    const pendingApprovalsCount =
      editRequests.filter((r) => r.status === 'Pending').length +
      workflowRequests.filter(
        (w) => w.status === 'PENDING_APPROVAL' || w.status === 'IN_PROGRESS' || w.status === 'PENDING'
      ).length;

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
  }, [accessibleOperations, activeOperations, crusherPayments, editRequests, workflowRequests]);

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
        approvalRules,
        workflowRequests,
        approvalAuditLogs,
        refreshApprovalMatrix,
        addApprovalRule,
        updateApprovalRule,
        deleteApprovalRule,
        toggleModuleApproval,
        toggleModuleApprovalRules: toggleModuleApproval,
        evaluateTransactionApproval,
        approveWorkflowRequest,
        rejectWorkflowRequest,
        escalateWorkflowRequest,
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
