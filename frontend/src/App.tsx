import { PlanningHubView } from './views/PlanningHubView';
import React, { useState, useEffect, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AIAssistantWidget } from './components/AIAssistantWidget';
import type { ExportDocType } from './components/ExportPrintModal';
import { Building2, Cpu, CreditCard, Layers, FileSpreadsheet, Landmark, LayoutDashboard, Menu, Palette, Receipt, Scale, Sparkles, Truck, Users, Wrench, X, Globe, Radio, TrendingUp } from 'lucide-react';
import { UserRole } from './types';
import { getSubdomain, isApexDomain, isCustomDomain, getCustomDomain, redirectToTenantWorkspace } from './utils/subdomain';
import { resolveDomain, getAuthToken } from './services/api';

import { useNavigate } from './hooks/useNavigate';
import { AdminLayout } from './components/admin/AdminLayout';
import { SystemBroadcastBanner } from './components/common/SystemBroadcastBanner';

// Code-split dynamic view imports
const DashboardView = React.lazy(() => import('./views/DashboardView').then(m => ({ default: m.DashboardView })));
const TenantLandingHubView = React.lazy(() => import('./views/TenantLandingHubView').then(m => ({ default: m.TenantLandingHubView })));
const OperationsLogView = React.lazy(() => import('./views/OperationsLogView').then(m => ({ default: m.OperationsLogView })));
const CustomerInvoicingView = React.lazy(() => import('./views/CustomerInvoicingView').then(m => ({ default: m.CustomerInvoicingView })));
const CrusherLedgerView = React.lazy(() => import('./views/CrusherLedgerView').then(m => ({ default: m.CrusherLedgerView })));
const TransporterPerformanceView = React.lazy(() => import('./views/TransporterPerformanceView').then(m => ({ default: m.TransporterPerformanceView })));
const AIOperationsView = React.lazy(() => import('./views/AIOperationsView').then(m => ({ default: m.AIOperationsView })));
const ExecutiveAdminView = React.lazy(() => import('./views/ExecutiveAdminView').then(m => ({ default: m.ExecutiveAdminView })));
const MasterDataView = React.lazy(() => import('./views/MasterDataView').then(m => ({ default: m.MasterDataView })));
const FinancialVouchersView = React.lazy(() => import('./views/FinancialVouchersView').then(m => ({ default: m.FinancialVouchersView })));
const TenantLoginView = React.lazy(() => import('./views/TenantLoginView').then(m => ({ default: m.TenantLoginView })));
const TenantRegistrationView = React.lazy(() => import('./views/TenantRegistrationView').then(m => ({ default: m.TenantRegistrationView })));
const LandingPageView = React.lazy(() => import('./views/LandingPageView').then(m => ({ default: m.LandingPageView })));
const OxenGLLandingPage = React.lazy(() => import('./pages/OxenGLLandingPage'));
const TenantLandingView = React.lazy(() => import('./views/TenantLandingView').then(m => ({ default: m.TenantLandingView })));
const SuperAdminLoginView = React.lazy(() => import('./views/SuperAdminLoginView').then(m => ({ default: m.SuperAdminLoginView })));
const SuperAdminCockpitView = React.lazy(() => import('./views/SuperAdminCockpitView').then(m => ({ default: m.SuperAdminCockpitView })));
const PublicSharedInvoiceView = React.lazy(() => import('./views/PublicSharedInvoiceView').then(m => ({ default: m.PublicSharedInvoiceView })));
const PublicInvoiceView = React.lazy(() => import('./views/PublicInvoiceView').then(m => ({ default: m.PublicInvoiceView })));
const WorkflowAutomationView = React.lazy(() => import('./views/WorkflowAutomationView').then(m => ({ default: m.WorkflowAutomationView })));
const DesignSystemStudioView = React.lazy(() => import('./views/DesignSystemStudioView').then(m => ({ default: m.DesignSystemStudioView })));
const TenantBillingView = React.lazy(() => import('./views/TenantBillingView').then(m => ({ default: m.TenantBillingView })));
const FleetMaintenanceView = React.lazy(() => import('./views/FleetMaintenanceView').then(m => ({ default: m.FleetMaintenanceView })));
const FleetMapView = React.lazy(() => import('./views/FleetMapView').then(m => ({ default: m.FleetMapView })));
const ExportPrintModal = React.lazy(() => import('./components/ExportPrintModal').then(m => ({ default: m.ExportPrintModal })));
const TenantSettingsPanel = React.lazy(() => import('./components/platform/TenantSettingsPanel').then(m => ({ default: m.TenantSettingsPanel })));
const PlanningDepartmentView = React.lazy(() => import('./components/PlanningDepartmentView').then(m => ({ default: m.PlanningDepartmentView })));
const ApprovalQueueView = React.lazy(() => import('./views/ApprovalQueueView').then(m => ({ default: m.ApprovalQueueView })));
const MfaVerificationView = React.lazy(() => import('./views/MfaVerificationView').then(m => ({ default: m.MfaVerificationView })));
const CustomsClearanceView = React.lazy(() => import('./views/CustomsClearanceView').then(m => ({ default: m.CustomsClearanceView })));
const FinanceReportsView = React.lazy(() => import('./views/FinanceReportsView').then(m => ({ default: m.FinanceReportsView })));
const SuperAdminTenantsView = React.lazy(() => import('./views/SuperAdminTenantsView').then(m => ({ default: m.SuperAdminTenantsView })));
const SuperAdminLogsView = React.lazy(() => import('./views/SuperAdminLogsView').then(m => ({ default: m.SuperAdminLogsView })));
const SuperAdminAnalyticsView = React.lazy(() => import('./views/SuperAdminAnalyticsView').then(m => ({ default: m.SuperAdminAnalyticsView })));
const LandingCmsStudioView = React.lazy(() => import('./views/admin/LandingCmsStudioView').then(m => ({ default: m.LandingCmsStudioView })));
const UnifiedMasterSettingsView = React.lazy(() => import('./views/admin/UnifiedMasterSettingsView').then(m => ({ default: m.UnifiedMasterSettingsView })));
const ResetPasswordView = React.lazy(() => import('./views/ResetPasswordView').then(m => ({ default: m.ResetPasswordView })));
const ForgotPasswordView = React.lazy(() => import('./views/auth/ForgotPassword').then(m => ({ default: m.ForgotPassword })));
const ProcurementView = React.lazy(() => import('./views/ProcurementView').then(m => ({ default: m.ProcurementView })));
const ProcurementP2PView = React.lazy(() => import('./views/ProcurementP2PView').then(m => ({ default: m.ProcurementP2PView })));
const InventoryView = React.lazy(() => import('./views/InventoryView').then(m => ({ default: m.InventoryView })));
const HRMSView = React.lazy(() => import('./views/HRMSView').then(m => ({ default: m.HRMSView })));
const OrganizationProfile = React.lazy(() => import('./views/settings/OrganizationProfile').then(m => ({ default: m.OrganizationProfile })));
const CorporateVault = React.lazy(() => import('./views/settings/CorporateVault').then(m => ({ default: m.CorporateVault })));
const FinancialReportsView = React.lazy(() => import('./views/FinancialReportsView').then(m => ({ default: m.FinancialReportsView })));
const VendorPortalView = React.lazy(() => import('./views/VendorPortalView').then(m => ({ default: m.VendorPortalView })));
const SalesReceivablesDashboard = React.lazy(() => import('./views/SalesReceivablesDashboard').then(m => ({ default: m.SalesReceivablesDashboard })));
const DataObservabilityView = React.lazy(() => import('./views/DataObservabilityView').then(m => ({ default: m.DataObservabilityView })));
const FinancialAnalyticsHubView = React.lazy(() => import('./views/FinancialAnalyticsHubView').then(m => ({ default: m.FinancialAnalyticsHubView })));
const BillingConfigurationPanel = React.lazy(() => import('./components/admin/BillingConfigurationPanel').then(m => ({ default: m.BillingConfigurationPanel })));
const PlatformAdminPortal = React.lazy(() => import('./views/PlatformAdminPortal').then(m => ({ default: m.PlatformAdminPortal })));

const ViewLoadingFallback = () => (
  <div className="flex min-h-[400px] w-full flex-col items-center justify-center p-12 text-center">
    <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 mb-3 animate-pulse">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
    </div>
    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
      جاري تحميل بيانات الشاشة... / Loading screen...
    </p>
  </div>
);

export const TENANT_LOGIN_PATH = '/tenant/login';

const isPublicPath = (path: string): boolean =>
  path === '/' ||
  path === '/nextgen' ||
  path === '/landing-nextgen' ||
  path === TENANT_LOGIN_PATH ||
  path === '/register' ||
  path === '/forgot-password' ||
  path === '/reset-password' ||
  path === '/customs' ||
  path === '/portal/vendor' ||
  path === '/vendor-portal' ||
  path === '/admin' ||
  path.startsWith('/admin/') ||
  path.startsWith('/shared/invoice/');

export interface RouteProps {
  path: string;
  element: React.ReactNode;
}

export const Route: React.FC<RouteProps> = ({ element }) => <>{element}</>;

// Exact Bi-directional Route to Tab Mappings
export const ROUTE_TAB_MAP: Record<string, ActiveTab> = {
  // Operations Ribbon
  '/admin': 'admin-hub',
  '/operations/daily': 'operations',
  '/operations/fleet-map': 'fleet-map',
  '/operations/fleet-maintenance': 'maintenance',
  '/operations/transporters': 'transporters',
  '/operations/crushers': 'crushers',
  '/operations/customs': 'customs',
  '/operations/planning': 'planning',
  '/operations/procurement': 'procurement',
  '/operations/procurement-p2p': 'procurement-p2p',
  '/operations/inventory': 'inventory',
  '/operations/hr': 'hr',

  // Finance Ribbon
  '/finance/invoices': 'invoicing',
  '/finance/sales-receivables': 'sales-receivables',
  '/finance/analytics-hub': 'financial-hub',
  '/finance/financial-hub': 'financial-hub',
  '/finance/vouchers': 'vouchers',
  '/finance/chart': 'finance-chart',
  '/finance/trial-balance': 'financial-reports',
  '/finance/reports': 'financial-reports',
  '/finance/income-statement': 'financial-reports',
  '/finance/balance-sheet': 'financial-reports',
  '/finance/audit-closing': 'finance-audit-closing',
  '/finance/ai-auditor': 'ai-insights',
  '/analytics/data-observability': 'data-observability',
  '/data-observability': 'data-observability',

  // Governance & Admin (Navbar Settings / Sidebar Governance)
  '/settings/approvals': 'executive-admin',
  '/settings/billing': 'billing',
  '/admin/billing-gateways': 'billing-gateways',
  '/admin/billing': 'billing-gateways',
  '/admin/platform': 'platform-portal',
  '/admin/platform-portal': 'platform-portal',
  '/settings/master-data': 'master-data',
  '/settings/tenant': 'tenant-settings',
  '/settings/workflows': 'workflow-builder',
  '/settings/organization': 'organization-profile',
  '/settings/org-chart': 'organization-profile',
  '/settings/org-profile': 'organization-profile',

  // Corporate Profile & Document Vault (Phase 8 Global Standard)
  '/compliance/vault': 'corporate-vault',
  '/compliance': 'corporate-vault',
  '/compliance/cv': 'corporate-vault',
  '/compliance/documents': 'corporate-vault',
  '/settings/compliance': 'corporate-vault',
  '/settings/vault': 'corporate-vault',
  '/settings/corporate-vault': 'corporate-vault',

  // Dev Studio (Hidden developer route)
  '/dev-studio': 'design-studio',

  // Shortcuts & Legacy Fallbacks
  '/operations': 'operations',
  '/planning': 'planning',
  '/procurement': 'procurement',
  '/procurement-p2p': 'procurement-p2p',
  '/inventory': 'inventory',
  '/hr': 'hr',
  '/customs': 'customs',
  '/invoicing': 'invoicing',
  '/vouchers': 'vouchers',
  '/dashboard': 'operations',
};

export const TAB_ROUTE_MAP: Record<ActiveTab, string> = {
  operations: '/operations/daily',
  'fleet-map': '/operations/fleet-map',
  maintenance: '/operations/fleet-maintenance',
  transporters: '/operations/transporters',
  crushers: '/operations/crushers',
  customs: '/operations/customs',
  planning: '/operations/planning',
  procurement: '/operations/procurement',
  'procurement-p2p': '/operations/procurement-p2p',
  hr: '/operations/hr',

  invoicing: '/finance/invoices',
  'sales-receivables': '/finance/sales-receivables',
  'financial-hub': '/finance/analytics-hub',
  vouchers: '/finance/vouchers',
  'finance-chart': '/finance/chart',
  'financial-reports': '/finance/reports',
  'finance-audit-closing': '/finance/audit-closing',
  'ai-insights': '/finance/ai-auditor',
  'data-observability': '/analytics/data-observability',

  'executive-admin': '/settings/approvals',
  billing: '/settings/billing',
  'billing-gateways': '/admin/billing-gateways',
  'platform-portal': '/admin/platform',
  'master-data': '/settings/master-data',
  'tenant-settings': '/settings/tenant',
  'workflow-builder': '/settings/workflows',
  'design-studio': '/dev-studio',
  'organization-profile': '/settings/organization',
  'corporate-vault': '/compliance/vault',

  hub: '/operations/daily',
  dashboard: '/operations/daily',
  approvals: '/settings/approvals',
  inventory: '/operations/inventory',
  mfa: '/tenant/login',
  'admin-hub': '/admin',
};

export const getTabFromPath = (path: string): ActiveTab => {
  const urlWithoutQuery = path.split('?')[0].split('#')[0];
  const cleanPath = urlWithoutQuery.replace(/\/$/, '');
  if (cleanPath === '/admin' || cleanPath === '/admin/cockpit' || cleanPath.startsWith('/admin/')) return 'admin-hub';
  if (ROUTE_TAB_MAP[cleanPath]) return ROUTE_TAB_MAP[cleanPath];
  if (ROUTE_TAB_MAP[path]) return ROUTE_TAB_MAP[path];

  if (cleanPath.startsWith('/operations/daily')) return 'operations';
  if (cleanPath.startsWith('/operations/fleet-map')) return 'fleet-map';
  if (cleanPath.startsWith('/operations/fleet-maintenance')) return 'maintenance';
  if (cleanPath.startsWith('/operations/transporters')) return 'transporters';
  if (cleanPath.startsWith('/operations/crushers')) return 'crushers';
  if (cleanPath.startsWith('/operations/customs')) return 'customs';
  if (cleanPath.startsWith('/operations/planning')) return 'planning';
  if (cleanPath.startsWith('/operations/procurement-p2p') || cleanPath.startsWith('/procurement-p2p')) return 'procurement-p2p';
  if (cleanPath.startsWith('/operations/procurement') || cleanPath.startsWith('/procurement')) return 'procurement';
  if (cleanPath.startsWith('/operations/inventory') || cleanPath.startsWith('/inventory')) return 'inventory';
  if (cleanPath.startsWith('/operations/hr') || cleanPath.startsWith('/hr')) return 'hr';

  if (cleanPath.startsWith('/finance/invoices')) return 'invoicing';
  if (cleanPath.startsWith('/finance/sales-receivables')) return 'sales-receivables';
  if (cleanPath.startsWith('/finance/vouchers')) return 'vouchers';
  if (cleanPath.startsWith('/finance/chart')) return 'finance-chart';
  if (cleanPath.startsWith('/finance/reports') || cleanPath.startsWith('/finance/trial-balance') || cleanPath.startsWith('/finance/income-statement') || cleanPath.startsWith('/finance/balance-sheet') || cleanPath.startsWith('/finance/fx-exposure')) return 'financial-reports';
  if (cleanPath.startsWith('/finance/audit-closing')) return 'finance-audit-closing';
  if (cleanPath.startsWith('/finance/ai-auditor')) return 'ai-insights';
  if (cleanPath.startsWith('/analytics/data-observability') || cleanPath.startsWith('/data-observability')) return 'data-observability';

  if (cleanPath.startsWith('/settings/approvals')) return 'executive-admin';
  if (cleanPath.startsWith('/settings/billing')) return 'billing';
  if (cleanPath.startsWith('/settings/master-data')) return 'master-data';
  if (cleanPath.startsWith('/settings/tenant')) return 'tenant-settings';
  if (cleanPath.startsWith('/settings/workflows')) return 'workflow-builder';
  if (cleanPath.startsWith('/settings/organization') || cleanPath.startsWith('/settings/org-chart')) return 'organization-profile';
  if (cleanPath.startsWith('/compliance') || cleanPath.startsWith('/settings/compliance') || cleanPath.startsWith('/settings/vault') || cleanPath.startsWith('/settings/corporate-vault')) return 'corporate-vault';
  if (cleanPath.startsWith('/dev-studio')) return 'design-studio';

  return 'operations';
};

// Professional Multi-Tenant Secondary Navigation Structure
export const tenantNavigation: {
  id: ActiveTab;
  path: string;
  labelAr: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'Operations & Logistics' | 'Finance, Accounting & Control';
}[] = [
  // 1. Operations & Logistics Ribbon - Strictly Core Modules
  { id: 'operations', path: '/operations/daily', labelAr: 'سجل العمليات اليومية', labelEn: 'Daily Operations Logs', icon: Truck, group: 'Operations & Logistics' },
  { id: 'fleet-map', path: '/operations/fleet-map', labelAr: 'رادار وخريطة الأسطول', labelEn: 'Fleet Radar & GPS', icon: Radio, group: 'Operations & Logistics' },
  { id: 'maintenance', path: '/operations/fleet-maintenance', labelAr: 'صيانة الأسطول والوقود', labelEn: 'Fleet Maintenance & Fuel', icon: Wrench, group: 'Operations & Logistics' },
  { id: 'transporters', path: '/operations/transporters', labelAr: 'موردي الخدمات والتسويات', labelEn: 'Service Suppliers', icon: Scale, group: 'Operations & Logistics' },
  { id: 'crushers', path: '/operations/crushers', labelAr: 'موردي المواد وحساباتهم', labelEn: 'Material Suppliers', icon: Building2, group: 'Operations & Logistics' },
  { id: 'customs', path: '/operations/customs', labelAr: 'لوحة التخليص الجمركي', labelEn: 'Customs Clearance', icon: Globe, group: 'Operations & Logistics' },
  { id: 'planning', path: '/operations/planning', labelAr: 'إدارة التخطيط والتشغيل', labelEn: 'Planning & Charters', icon: Layers, group: 'Operations & Logistics' },

  // 2. Finance, Accounting & Control Ribbon
  { id: 'invoicing', path: '/finance/invoices', labelAr: 'الفوترة الضريبية', labelEn: 'ZATCA Invoicing', icon: FileSpreadsheet, group: 'Finance, Accounting & Control' },
  { id: 'sales-receivables', path: '/finance/sales-receivables', labelAr: 'المبيعات والذمم', labelEn: 'Sales & Receivables', icon: TrendingUp, group: 'Finance, Accounting & Control' },
  { id: 'vouchers', path: '/finance/vouchers', labelAr: 'السندات المالية', labelEn: 'Financial Vouchers', icon: Receipt, group: 'Finance, Accounting & Control' },
  { id: 'finance-chart', path: '/finance/chart', labelAr: 'شجرة الحسابات', labelEn: 'Chart of Accounts', icon: Landmark, group: 'Finance, Accounting & Control' },
  { id: 'financial-reports', path: '/finance/reports', labelAr: 'التقارير المالية المجمعة', labelEn: 'Financial Reports Engine', icon: TrendingUp, group: 'Finance, Accounting & Control' },
  { id: 'finance-audit-closing', path: '/finance/audit-closing', labelAr: 'الإقفال السنوي والتدقيق', labelEn: 'Annual Audit Closing', icon: FileSpreadsheet, group: 'Finance, Accounting & Control' },
  { id: 'ai-insights', path: '/finance/ai-auditor', labelAr: 'مدقق العمليات الذكي', labelEn: 'AI Financial Auditor', icon: Sparkles, group: 'Finance, Accounting & Control' },
];

function AppContent() {
  const { language, currentUser, brandConfig, isDriverMode, themeMode, authTier, tenantId, logoutUser, isTwoTierAuthenticated } = useApp();
  const isAr = language === 'ar';
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const hasToken = Boolean(getAuthToken());
    const sessionActive = localStorage.getItem('oxengl_session_active') === 'true';
    return Boolean(hasToken && sessionActive && currentUser?.role !== 'Guest' && currentUser?.id);
  });

  useEffect(() => {
    setIsLoggedIn(Boolean(isTwoTierAuthenticated && currentUser?.role !== 'Guest' && currentUser?.id));
  }, [isTwoTierAuthenticated, currentUser]);

  const [resolvedCustomSlug, setResolvedCustomSlug] = useState<string | null>(null);
  const [isResolvingDomain, setIsResolvingDomain] = useState<boolean>(() => isCustomDomain());

  useEffect(() => {
    if (isCustomDomain()) {
      resolveDomain()
        .then((res) => {
          if (res?.resolved && res.tenant_slug) {
            setResolvedCustomSlug(res.tenant_slug);
            localStorage.setItem('oxengl_tenant_slug', res.tenant_slug);
            localStorage.setItem('tenant_slug', res.tenant_slug);
          }
        })
        .finally(() => {
          setIsResolvingDomain(false);
        });
    }
  }, []);

  const [inspectingWorkspace, setInspectingWorkspace] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined') {
      return getTabFromPath(window.location.pathname);
    }
    return 'operations';
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isExportPrintModalOpen, setIsExportPrintModalOpen] = useState(false);

  const [selectedDomain, setSelectedDomain] = useState<'Operations & Logistics' | 'Finance, Accounting & Control'>(() => {
    const tab = typeof window !== 'undefined' ? getTabFromPath(window.location.pathname) : 'operations';
    const item = tenantNavigation.find(n => n.id === tab);
    if (item?.group) return item.group;
    if (tab === 'finance-chart' || tab === 'financial-reports' || tab === 'finance-audit-closing' || tab === 'invoicing' || tab === 'sales-receivables' || tab === 'vouchers' || tab === 'ai-insights') {
      return 'Finance, Accounting & Control';
    }
    return 'Operations & Logistics';
  });

  // Centralized URL Navigation & History Synchronizer
  const navigateToTab = (tab: ActiveTab, updateHistory = true) => {
    setActiveTab(tab);
    const navItem = tenantNavigation.find(n => n.id === tab);
    if (navItem) {
      setSelectedDomain(navItem.group);
    } else if (tab === 'finance-chart' || tab === 'financial-reports' || tab === 'finance-audit-closing' || tab === 'invoicing' || tab === 'sales-receivables' || tab === 'vouchers' || tab === 'ai-insights') {
      setSelectedDomain('Finance, Accounting & Control');
    } else {
      setSelectedDomain('Operations & Logistics');
    }

    const targetPath = TAB_ROUTE_MAP[tab] || (isLoggedIn ? '/operations/daily' : TENANT_LOGIN_PATH);
    if (updateHistory && typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
      setCurrentPath(targetPath);
    }
  };

  // Browser History (popstate) Synchronization
  useEffect(() => {
    const syncPath = () => {
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        setCurrentPath(path);
        const resolvedTab = getTabFromPath(path);
        setActiveTab(resolvedTab);
        const item = tenantNavigation.find(n => n.id === resolvedTab);
        if (item?.group) {
          setSelectedDomain(item.group);
        }
      }
    };
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  useEffect(() => {
    const item = tenantNavigation.find(n => n.id === activeTab);
    if (item?.group) {
      setSelectedDomain(item.group);
    }
  }, [activeTab]);

  useEffect(() => {
    const openOperationalIntelligence = () => setIsAIChatOpen(true);
    window.addEventListener('oxengl-open-ai', openOperationalIntelligence);
    return () => window.removeEventListener('oxengl-open-ai', openOperationalIntelligence);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      localStorage.setItem('oxengl_session_active', 'true');
    } else {
      localStorage.removeItem('oxengl_session_active');
      localStorage.removeItem('oxengl_recovery_session');
    }
  }, [isLoggedIn]);

  // If driver mode is turned on and current tab is restricted, switch to operations
  useEffect(() => {
    if (isDriverMode && activeTab !== 'operations' && activeTab !== 'transporters') {
      navigateToTab('operations');
    }
  }, [isDriverMode, activeTab]);

  // Derive default document type based on current active tab
  const defaultDocTypeForTab: ExportDocType = React.useMemo(() => {
    switch (activeTab) {
      case 'operations':
        return 'daily-operations';
      case 'invoicing':
        return 'vat-invoice';
      case 'crushers':
        return 'crusher-statement';
      case 'transporters':
        return 'transporter-shrinkage';
      case 'vouchers':
        return 'financial-vouchers';
      default:
        return 'vat-invoice';
    }
  }, [activeTab]);

  // Check URL for public shared invoice link (?shared_invoice=INV-2026-08-1048&token=...)
  const [sharedInvoiceParams, setSharedInvoiceParams] = useState<{
    invoiceNumber: string;
    token?: string;
  } | null>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedInv = urlParams.get('shared_invoice');
      const token = urlParams.get('token') || undefined;
      if (sharedInv) {
        return { invoiceNumber: sharedInv, token };
      }
    }
    return null;
  });

  // Strict redirect: unauthenticated visitors never see a protected tenant URL, and legacy /login is retired
  const needsLoginRedirect =
    !isResolvingDomain &&
    !sharedInvoiceParams &&
    (currentPath === '/login' || (!isLoggedIn && !isPublicPath(currentPath)));
  useEffect(() => {
    if (needsLoginRedirect) {
      if (window.location.pathname !== TENANT_LOGIN_PATH) {
        window.location.replace(TENANT_LOGIN_PATH);
      }
    }
  }, [needsLoginRedirect]);

  const leaveWorkspace = () => {
    logoutUser();
    setIsLoggedIn(false);
    setInspectingWorkspace(false);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // If a public shared invoice link was accessed, render the standalone auditor view
  if (sharedInvoiceParams) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <PublicSharedInvoiceView
          invoiceNumber={sharedInvoiceParams.invoiceNumber}
          token={sharedInvoiceParams.token}
          onBackToPortal={() => {
            // Clear query params and show login/portal
            window.history.replaceState({}, document.title, window.location.pathname);
            setSharedInvoiceParams(null);
          }}
        />
      </Suspense>
    );
  }

  // Phase 5: Tokenized Magic Link Public Invoice Routing (Unauthenticated External Checkout)
  if (currentPath.startsWith('/shared/invoice/')) {
    const token = currentPath.substring('/shared/invoice/'.length).split('/')[0].split('?')[0];
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route path="/shared/invoice/:token" element={<PublicInvoiceView token={token} />} />
      </Suspense>
    );
  }

  if (currentPath === '/customs') {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route path="/customs" element={<CustomsClearanceView />} />
      </Suspense>
    );
  }

  // Platform Owner Console: /admin and its sub-paths are the only routes that may mount admin UI
  if (currentPath === '/admin' || currentPath.startsWith('/admin/')) {
    const adminPath = currentPath.replace(/\/+$/, '') || '/admin';
    if (!isLoggedIn) {
      return (
        <Suspense fallback={<ViewLoadingFallback />}>
          <Route
            path="/admin"
            element={
              <SuperAdminLoginView
                onLoginSuccess={() => {
                  setIsLoggedIn(true);
                  window.location.href = adminPath === '/admin/cockpit' ? '/admin' : adminPath;
                }}
              />
            }
          />
        </Suspense>
      );
    }

    let adminElement: React.ReactNode = null;
    switch (adminPath) {
      case '/admin':
      case '/admin/cockpit':
        adminElement = (
          <SuperAdminCockpitView
            onOpenTenantOnboarding={() => navigate('/admin/tenants')}
            onLogout={leaveWorkspace}
            onInspectTenantWorkspace={() => {
              setInspectingWorkspace(true);
              navigateToTab('hub');
            }}
          />
        );
        break;
      case '/admin/tenants':
        adminElement = (
          <AdminLayout currentPath={adminPath} onNavigate={navigate} onLogout={leaveWorkspace}>
            <SuperAdminTenantsView />
          </AdminLayout>
        );
        break;
      case '/admin/billing-gateways':
      case '/admin/billing':
      case '/admin/settings/billing':
        adminElement = (
          <AdminLayout currentPath={adminPath} onNavigate={navigate} onLogout={leaveWorkspace}>
            <BillingConfigurationPanel />
          </AdminLayout>
        );
        break;
      case '/admin/platform':
      case '/admin/platform-portal':
        adminElement = (
          <AdminLayout currentPath={adminPath} onNavigate={navigate} onLogout={leaveWorkspace}>
            <PlatformAdminPortal />
          </AdminLayout>
        );
        break;
      case '/admin/landing-editor':
        adminElement = (
          <AdminLayout currentPath={adminPath} onNavigate={navigate} onLogout={leaveWorkspace}>
            <LandingCmsStudioView />
          </AdminLayout>
        );
        break;
      case '/admin/settings/master':
      case '/admin/settings':
        adminElement = (
          <AdminLayout currentPath={adminPath} onNavigate={navigate} onLogout={leaveWorkspace}>
            <UnifiedMasterSettingsView />
          </AdminLayout>
        );
        break;
      case '/admin/logs':
        adminElement = (
          <AdminLayout currentPath={adminPath} onNavigate={navigate} onLogout={leaveWorkspace}>
            <SuperAdminLogsView />
          </AdminLayout>
        );
        break;
      case '/admin/analytics':
        adminElement = (
          <AdminLayout currentPath={adminPath} onNavigate={navigate} onLogout={leaveWorkspace}>
            <SuperAdminAnalyticsView />
          </AdminLayout>
        );
        break;
    }

    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <ProtectedRoute
          tier="master"
          requireSuperAdmin
          isLoggedIn={isLoggedIn}
          onRequireLogin={leaveWorkspace}
          onNavigateHome={() => navigate('/operations/daily')}
        >
          {adminElement ?? (
            <div id="admin-route-not-found" className="flex min-h-[50vh] w-full flex-col items-center justify-center p-8 text-center">
              <h2 className="text-xl font-black text-neutral-900 dark:text-white">404</h2>
              <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">Unknown admin route.</p>
            </div>
          )}
        </ProtectedRoute>
      </Suspense>
    );
  }

  if (currentPath === '/register') {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route
          path="/register"
          element={
            <TenantRegistrationView
              onSuccess={() => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', TENANT_LOGIN_PATH);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }}
            />
          }
        />
      </Suspense>
    );
  }

  if (currentPath === '/forgot-password') {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route
          path="/forgot-password"
          element={
            <ForgotPasswordView
              onSuccessRedirect={(email, slug) => {
                if (typeof window !== 'undefined') {
                  const target = `/reset-password?email=${encodeURIComponent(email)}&slug=${encodeURIComponent(slug || 'master')}`;
                  window.history.pushState({}, '', target);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }}
            />
          }
        />
      </Suspense>
    );
  }

  if (currentPath === '/reset-password') {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route
          path="/reset-password"
          element={
            <ResetPasswordView
              onSuccessRedirect={() => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', TENANT_LOGIN_PATH);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }}
            />
          }
        />
      </Suspense>
    );
  }

  if (currentPath === '/portal/vendor' || currentPath === '/vendor-portal') {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route
          path={currentPath}
          element={<VendorPortalView />}
        />
      </Suspense>
    );
  }

  if (isResolvingDomain) {
    return <ViewLoadingFallback />;
  }

  const activeSubdomain = getSubdomain();
  const effectiveTenantSlug = activeSubdomain || resolvedCustomSlug || (isCustomDomain() ? getCustomDomain() : null);

  const handleWorkspaceLoginRedirect = () => {
    setIsLoggedIn(true);
    const storedSlug = localStorage.getItem('tenant_slug') || effectiveTenantSlug;
    const customDom = isCustomDomain() ? getCustomDomain() : null;
    redirectToTenantWorkspace({
      slug: storedSlug,
      custom_domain: customDom,
    }, '/operations/daily');
  };

  if ((currentPath === '/nextgen' || currentPath === '/landing-nextgen') && !effectiveTenantSlug) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route path={currentPath} element={<OxenGLLandingPage />} />
      </Suspense>
    );
  }

  if (currentPath === '/' && !effectiveTenantSlug) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route path="/" element={<LandingPageView onLoginSuccess={handleWorkspaceLoginRedirect} />} />
      </Suspense>
    );
  }

  if (needsLoginRedirect) {
    window.location.replace('/tenant/login');
    return null;
  }

  if (currentPath === TENANT_LOGIN_PATH) {
    if (isLoggedIn && authTier !== 'master') {
      if (typeof window !== 'undefined') {
        const storedSlug = localStorage.getItem('tenant_slug') || effectiveTenantSlug;
        const customDom = isCustomDomain() ? getCustomDomain() : null;
        redirectToTenantWorkspace({
          slug: storedSlug,
          custom_domain: customDom,
        }, '/operations/daily');
      }
    } else {
      return (
        <Suspense fallback={<ViewLoadingFallback />}>
          <Route path="/tenant/login" element={<TenantLoginView forcedSlug={effectiveTenantSlug || undefined} onNavigate={(to) => {
            navigate(to);
          }} onLoginSuccess={handleWorkspaceLoginRedirect} />} />
        </Suspense>
      );
    }
  }

  if (currentPath === '/' && !isLoggedIn) {
    if (effectiveTenantSlug) {
      // Phase 4: tenant subdomain (*.oxengl.me) or mapped custom domain -> tenant-branded landing
      return (
        <Suspense fallback={<ViewLoadingFallback />}>
          <Route
            path="/"
            element={
              <TenantLandingView
                onSignIn={() => {
                  navigate(TENANT_LOGIN_PATH);
                }}
              />
            }
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Route path="/" element={<LandingPageView onLoginSuccess={handleWorkspaceLoginRedirect} />} />
      </Suspense>
    );
  }

  if (!isLoggedIn) {
    window.location.replace('/tenant/login');
    return null;
  }


  // View-level RBAC role mappings
  const viewRoleRequirements: Record<ActiveTab, UserRole[] | undefined> = {
    hub: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    dashboard: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    planning: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    operations: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    maintenance: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    invoicing: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Read_Only', 'Guest'],
    'sales-receivables': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Read_Only'],
    'financial-hub': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Read_Only'],
    vouchers: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant'],
    billing: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant'],
    crushers: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Read_Only'],
    transporters: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only'],
    'ai-insights': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant'],
    'executive-admin': ['Super_Admin', 'Owner', 'Admin', 'COO'],
    'master-data': ['Super_Admin', 'Owner', 'Admin', 'COO'],
    'workflow-builder': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest'],
    'design-studio': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest'],
    'tenant-settings': ['Super_Admin', 'Owner', 'Admin', 'COO'],
    'organization-profile': ['Super_Admin', 'Owner', 'Admin', 'COO'],
    'corporate-vault': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    'fleet-map': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    'finance-chart': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Read_Only'],
    'financial-reports': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Read_Only'],
    'finance-audit-closing': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant'],
    'data-observability': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only'],
    approvals: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant'],
    procurement: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only'],
    'procurement-p2p': ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only'],
    inventory: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only'],
    hr: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Read_Only'],
    mfa: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    customs: ['Super_Admin', 'Owner', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
    'admin-hub': ['Super_Admin'],
    'billing-gateways': ['Super_Admin'],
    'platform-portal': ['Super_Admin'],
  };

  const renderActiveViewContent = () => {
    switch (activeTab) {
      case 'admin-hub':
      case 'hub':
        return <TenantLandingHubView onNavigateToTab={(tab) => navigateToTab(tab)} />;
      case 'dashboard':
        return <DashboardView onNavigateToTab={(tab) => navigateToTab(tab)} />;
      case 'customs':
        return <CustomsClearanceView />;
      case 'approvals':
        return <ApprovalQueueView />;
      case 'procurement':
        return <ProcurementView />;
      case 'procurement-p2p':
        return <ProcurementP2PView />;
      case 'inventory':
        return <InventoryView />;
      case 'hr':
        return <HRMSView />;
      case 'mfa':
        return <MfaVerificationView onCancel={() => navigateToTab('dashboard')} />;
      case 'planning':
      return <PlanningHubView />;
      case 'operations':
        return <OperationsLogView />;
      case 'maintenance':
        return <FleetMaintenanceView />;
      case 'fleet-map':
        return <FleetMapView />;
      case 'invoicing':
        return <CustomerInvoicingView />;
      case 'sales-receivables':
        return <SalesReceivablesDashboard />;
      case 'financial-hub':
        return <FinancialAnalyticsHubView />;
      case 'vouchers':
        return <FinancialVouchersView />;
      case 'finance-chart':
        return <FinanceReportsView initialMode="chart" />;
      case 'financial-reports':
        return <FinancialReportsView />;
      case 'finance-audit-closing':
        return <FinanceReportsView initialMode="audit-closing" />;
      case 'billing':
        return <TenantBillingView />;
      case 'billing-gateways':
        return <BillingConfigurationPanel />;
      case 'platform-portal':
        return <PlatformAdminPortal />;
      case 'crushers':
        return <CrusherLedgerView />;
      case 'transporters':
        return <TransporterPerformanceView />;
      case 'ai-insights':
        return <AIOperationsView />;
      case 'data-observability':
        return <DataObservabilityView />;
      case 'executive-admin':
        return <ExecutiveAdminView />;
      case 'master-data':
        return <MasterDataView />;
      case 'workflow-builder':
        return <WorkflowAutomationView />;
      case 'design-studio':
        return <DesignSystemStudioView />;
      case 'tenant-settings': {
        const resolvedTenantId = tenantId || (brandConfig as any)?.tenantId || null;
        const resolvedTenantSlug = effectiveTenantSlug || (brandConfig as any)?.slug || null;
        if (!resolvedTenantId || !resolvedTenantSlug) {
          return (
            <div id="tenant-not-found" className="flex min-h-[50vh] w-full flex-col items-center justify-center p-8 text-center">
              <h2 className="text-xl font-black text-neutral-900 dark:text-white">
                {isAr ? 'المستأجر غير موجود' : 'Tenant Not Found'}
              </h2>
              <p className="mt-2 max-w-md text-xs text-neutral-600 dark:text-neutral-400">
                {isAr
                  ? 'تعذر تحديد مساحة عمل المستأجر من عنوان URL. يرجى فتح الصفحة من نطاق المستأجر الصحيح.'
                  : 'The tenant workspace could not be resolved from the URL. Please open this page from the correct tenant domain.'}
              </p>
            </div>
          );
        }
        return <TenantSettingsPanel tenantId={resolvedTenantId} tenantSlug={resolvedTenantSlug} />;
      }
      case 'organization-profile':
        return <OrganizationProfile />;
      case 'corporate-vault':
        return <CorporateVault />;
      default:
        return <DashboardView onNavigateToTab={(tab) => navigateToTab(tab)} />;
    }
  };

  return (
    <div
      id="oxengl-erp-app-root"
      dir={isAr ? 'rtl' : 'ltr'}
      className={`min-h-dvh erp-viewport-root font-sans antialiased selection:bg-[#F05627] selection:text-white relative transition-colors ${
        themeMode === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-100 text-neutral-900'
      }`}
    >
      {/* Platform Real-Time Broadcast Subsystem */}
      <SystemBroadcastBanner />

      {activeTab !== 'hub' && <Navbar
        onOpenAIModal={() => setIsAIChatOpen(true)}
        onOpenExportPrintModal={() => setIsExportPrintModalOpen(true)}
        onLogout={leaveWorkspace}
        onNavigateTab={(tab) => navigateToTab(tab as any)}
        activeTab={activeTab}
        selectedDomain={selectedDomain}
        onSelectDomain={setSelectedDomain}
      />}


      <div className="flex">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={navigateToTab}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />
        <main className={`min-w-0 flex-1 px-3 sm:px-4 md:px-6 py-2 sm:py-3 ${themeMode === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-100 text-neutral-900'}`}>
          <div className="mb-2 flex items-center justify-between md:hidden">
            <button
              type="button"
              id="mobile-nav-toggle-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="h-4 w-4 text-rose-500" /> : <Menu className="h-4 w-4 text-orange-500" />}
              <span>{isAr ? 'القائمة الرئيسية' : 'Menu'}</span>
            </button>
            <span className="text-xs font-black text-[#F05627]">{isAr ? brandConfig.companyNameAr : brandConfig.companyNameEn}</span>
          </div>
          <div className="w-full max-w-7xl mx-auto">
            <ProtectedRoute
              tier={authTier === 'master' || currentUser?.role === 'Super_Admin' ? undefined : 'tenant'}
              allowedRoles={viewRoleRequirements[activeTab]}
              isLoggedIn={isLoggedIn}
              onRequireLogin={leaveWorkspace}
              onNavigateHome={() => navigateToTab('dashboard')}
            >
              <Suspense fallback={<ViewLoadingFallback />}>
                {renderActiveViewContent()}
              </Suspense>
            </ProtectedRoute>
          </div>
        </main>
      </div>

      {/* Global Live Preview & Print/Export Modal */}
      {isExportPrintModalOpen && (
        <Suspense fallback={null}>
          <ExportPrintModal
            isOpen={isExportPrintModalOpen}
            onClose={() => setIsExportPrintModalOpen(false)}
            initialDocType={defaultDocTypeForTab}
          />
        </Suspense>
      )}

      {/* Persistent AI Assistant Widget */}
      <AIAssistantWidget
        isOpenExternal={isAIChatOpen}
        onCloseExternal={() => setIsAIChatOpen(false)}
        onNavigateToTab={(tab) => {
          navigateToTab(tab);
          setIsAIChatOpen(false);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
