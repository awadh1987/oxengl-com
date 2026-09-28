import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useOutsideClick } from '../hooks/useOutsideClick';
import {
  Bell,
  Globe,
  UserCheck,
  Shield,
  Crown,
  LogOut,
  AlertTriangle,
  WifiOff,
  Settings,
  Sun,
  Moon,
  Rows3,
  Rows4,
  Check,
  CheckCircle2,
  CreditCard,
  Database,
  Truck,
  FileText,
  Sparkles,
  Thermometer,
  ExternalLink,
  Network,
  FolderTree,
  FileCheck2,
} from 'lucide-react';
import { UserRole } from '../types';
import { TENANT_PALETTES } from '../theme/designTokens';
import { BrandLogo } from './BrandLogo';
import { PlatformLogo } from './PlatformLogo';
import { UserAvatar } from './UserAvatar';
import { HoverIcon } from './common/HoverIcon';
import { isApexDomain, getSubdomain, getEffectiveDomainIdentifier, isCustomDomain } from '../utils/subdomain';

export interface SystemAlert {
  id: string;
  type: 'wastage' | 'billing' | 'cold_chain';
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  timeAgoAr: string;
  timeAgoEn: string;
  read: boolean;
  truckNo?: string;
  anomalyId?: string;
  partnerId?: string;
  vehicleId?: string;
  targetUrl: string;
  targetTab: string;
}

interface NavbarProps {
  onOpenAIModal?: () => void;
  onOpenExportPrintModal?: () => void;
  onLogout?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onLogout, onNavigateTab }) => {
  const {
    currentUser,
    language,
    setLanguage,
    kpis,
    isOnline,
    signOutAuth,
    currentCompany,
    companies,
    setCurrentCompany,
    brandConfig,
    themeMode,
    setThemeMode,
    densityMode,
    setDensityMode,
    tenantTheme,
    setTenantTheme,
    isolationTelemetry,
    tenantId,
    tenantSlug,
    authTier,
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const settingsRef = useOutsideClick<HTMLDivElement>(() => {
    if (showSettings) setShowSettings(false);
  });

  const notificationsRef = useOutsideClick<HTMLDivElement>(() => {
    if (showNotifications) setShowNotifications(false);
  });

  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';
  const activePalette = TENANT_PALETTES[tenantTheme] || TENANT_PALETTES.orange;
  const paletteList = Object.values(TENANT_PALETTES);

  const roleColors: Record<UserRole, { bg: string; text: string; border: string; labelAr: string; labelEn: string }> = {
    Super_Admin: {
      bg: 'bg-violet-50 dark:bg-violet-950/40',
      text: 'text-violet-800 dark:text-violet-300',
      border: 'border-violet-200 dark:border-violet-800/60',
      labelAr: 'مدير المنصة (Super Admin)',
      labelEn: 'Platform Super Admin',
    },
    Owner: {
      bg: 'bg-gradient-to-r from-amber-500/15 to-yellow-500/10 dark:from-amber-400/20 dark:to-yellow-400/10',
      text: 'text-amber-800 dark:text-amber-300 font-bold',
      border: 'border-amber-400/60 dark:border-amber-400/50 shadow-sm shadow-amber-500/10',
      labelAr: 'مالك المنشأة (Tenant Owner)',
      labelEn: 'Tenant Owner',
    },
    Admin: {
      bg: 'bg-orange-50 dark:bg-orange-950/40',
      text: 'text-[#F05627] dark:text-orange-400',
      border: 'border-orange-200 dark:border-orange-800/60',
      labelAr: 'المدير العام CEO (Admin)',
      labelEn: 'Admin / CEO',
    },
    COO: {
      bg: 'bg-neutral-100 dark:bg-slate-800',
      text: 'text-neutral-900 dark:text-slate-200',
      border: 'border-neutral-300 dark:border-slate-700',
      labelAr: 'مدير العمليات (COO)',
      labelEn: 'COO Executive',
    },
    Accountant: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-800 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800/60',
      labelAr: 'محاسب (Accountant)',
      labelEn: 'Accountant',
    },
    Data_Entry: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800/60',
      labelAr: 'مدخل بيانات (Data Entry)',
      labelEn: 'Data Entry Operator',
    },
    Read_Only: {
      bg: 'bg-slate-50 dark:bg-slate-900',
      text: 'text-slate-700 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-800',
      labelAr: 'للقراءة فقط (Read Only)',
      labelEn: 'Read Only Viewer',
    },
    Guest: {
      bg: 'bg-slate-50 dark:bg-slate-900',
      text: 'text-slate-700 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-800',
      labelAr: 'مراجع / بوابة عميل (Guest)',
      labelEn: 'Guest / Client Auditor',
    },
  };

  const [alerts, setAlerts] = useState<SystemAlert[]>([
    {
      id: 'alert-wastage-3190',
      type: 'wastage',
      titleAr: 'تنبيه فاقد وزن زائد (ميزان البسكول)',
      titleEn: 'Excess Weighbridge Wastage',
      descAr: 'رحلة شاحنة (3190-ر س ب) سجلت فاقداً 1.4 طن لعميل يوني بيتون.',
      descEn: 'Truck 3190 recorded 1.4 tons loss to UniBeton.',
      timeAgoAr: 'منذ 10 د',
      timeAgoEn: '10m ago',
      read: false,
      truckNo: '3190',
      anomalyId: 'anom-3190',
      targetUrl: '/operations/daily?search=3190',
      targetTab: 'operations',
    },
    {
      id: 'alert-billing-kifah',
      type: 'billing',
      titleAr: 'جاهزية الفاتورة الشهرية للعميل',
      titleEn: 'Monthly Invoices Ready',
      descAr: 'تم تجميع بيانات شهر أغسطس لشركة الكفاح وجاهزة للتصدير الضريبي.',
      descEn: 'August logs ready for Kifah billing.',
      timeAgoAr: 'منذ 35 د',
      timeAgoEn: '35m ago',
      read: false,
      partnerId: 'kifah',
      targetUrl: '/finance/invoices?action=draft-batch&partner=kifah',
      targetTab: 'invoicing',
    },
    {
      id: 'alert-coldchain-v1002',
      type: 'cold_chain',
      titleAr: 'تجاوز حراري لسلسلة التبريد (SLA Breach)',
      titleEn: 'Cold-Chain SLA Breach',
      descAr: 'المركبة (V-1002 - سعد القحطاني) سجلت حرارة +5.4°C متجاوزة الحد (+4.2°C).',
      descEn: 'Vehicle V-1002 breached cold-chain threshold (+5.4°C > +4.2°C).',
      timeAgoAr: 'منذ 1 ساعة',
      timeAgoEn: '1h ago',
      read: false,
      vehicleId: 'V-1002',
      targetUrl: '/operations/fleet-map?vehicle=V-1002',
      targetTab: 'fleet-map',
    },
  ]);

  const unreadAlertsCount = alerts.filter((a) => !a.read).length;

  const handleNavigateAlert = (alert: SystemAlert, customUrl?: string, customTab?: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, read: true } : a)));
    setShowNotifications(false);

    const destUrl = customUrl || alert.targetUrl;
    const destTab = customTab || alert.targetTab;

    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', destUrl);
      window.dispatchEvent(new Event('popstate'));
    }

    if (onNavigateTab) {
      onNavigateTab(destTab);
    }
  };

  const isMasterAdmin = authTier === 'master' || currentUser?.role === 'Super_Admin';
  const currentTenantId = !isMasterAdmin ? (tenantId || currentCompany?.id || localStorage.getItem('oxengl_tenant_id') || '') : tenantId;
  const isTenantScoped = Boolean((authTier === 'tenant' || tenantId || currentTenantId) && !isMasterAdmin);
  const activeDomain = typeof window !== 'undefined' ? getEffectiveDomainIdentifier() : null;
  const isApex = typeof window !== 'undefined' ? isApexDomain() : true;
  const isTenantDomain = !isApex && Boolean(activeDomain);
  const isTenant = isTenantDomain || isTenantScoped || Boolean(tenantSlug) || Boolean(currentTenantId);

  // Match the company from currentCompany, companies list, or tenant context
  const effectiveCompany = useMemo(() => {
    // If currentCompany is properly loaded with a real company name (not just uppercase slug placeholder)
    if (currentCompany && currentCompany.name && currentCompany.name.toLowerCase() !== (currentCompany.slug || '').toLowerCase()) {
      return currentCompany;
    }
    const targetSlug = (activeDomain || tenantSlug || '').toLowerCase();
    if (targetSlug && companies.length > 0) {
      const match = companies.find(
        (c) =>
          c.slug?.toLowerCase() === targetSlug ||
          (c as any).domain_slug?.toLowerCase() === targetSlug ||
          (c as any).custom_domain?.toLowerCase() === targetSlug ||
          (c as any).domain?.toLowerCase() === targetSlug
      );
      if (match) return match;
    }
    if (currentTenantId && companies.length > 0) {
      const match = companies.find((c) => c.id === currentTenantId || c.id === currentUser?.companyId);
      if (match) return match;
    }
    return currentCompany;
  }, [currentCompany, companies, activeDomain, tenantSlug, currentTenantId, currentUser?.companyId]);

  // Synchronize context if effectiveCompany has the authentic tenant name from companies registry
  useEffect(() => {
    if (effectiveCompany && (!currentCompany || currentCompany.name !== effectiveCompany.name)) {
      setCurrentCompany(effectiveCompany);
    }
  }, [effectiveCompany, currentCompany, setCurrentCompany]);

  const tenantDisplayName =
    effectiveCompany?.name ||
    effectiveCompany?.company_name ||
    (isAr ? effectiveCompany?.name_ar : effectiveCompany?.name_en) ||
    (currentUser as any)?.companyName ||
    (isAr ? brandConfig?.companyNameAr : brandConfig?.companyNameEn) ||
    (activeSubdomain ? `${activeSubdomain.toUpperCase()} Workspace` : (tenantSlug ? `${tenantSlug.toUpperCase()} Workspace` : (isAr ? 'منظومة أوكسن السحابية' : 'OxenGL Enterprise Cloud')));

  const tenantLogoUrl =
    effectiveCompany?.logo_url ||
    effectiveCompany?.uiLogoUrl ||
    (effectiveCompany as any)?.ui_logo_url ||
    brandConfig?.customLogoUrl ||
    null;

  const CompanyDropdown: React.FC = () => {
    if (!currentCompany || isTenantDomain) return null;
    return (
      <div className="flex items-center gap-2">
        <div className="hidden h-7 w-px bg-neutral-200 dark:bg-slate-800 lg:block" />
        <select
          id="nav-tenant-selector"
          aria-label={isAr ? 'الشركة والمستأجر النشط' : 'Active Tenant Company'}
          value={currentCompany.id}
          onChange={(event) => {
            const company = companies.find((item) => item.id === event.target.value);
            if (company) setCurrentCompany(company);
          }}
          className={`hidden max-w-44 truncate rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none transition-colors focus:border-orange-500 lg:block ${
            isDark
              ? 'border-slate-800 bg-slate-900/90 text-slate-200 hover:border-slate-700'
              : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300'
          }`}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <header
      id="main-app-header"
      className={`sticky top-0 z-30 grid grid-cols-[1fr_auto] items-center gap-2 border-b px-3 py-1 sm:px-4 backdrop-blur-md transition-all ${
        isDark
          ? 'border-slate-800 bg-slate-950/95 text-slate-200 shadow-sm'
          : 'border-neutral-200/80 bg-white/95 text-neutral-900'
      }`}
    >
      {/* Left Section: Essentials Context (Logo, Subtitle, Tenant Selector, System Latency/Status) */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Dynamic Logo Asset Rendering Container */}
          {isTenant ? (
            tenantLogoUrl ? (
              <div className="relative h-7 w-7 shrink-0">
                <img 
                  src={tenantLogoUrl} 
                  alt={`${tenantDisplayName} Logo`} 
                  className="h-7 w-7 object-contain rounded-lg bg-slate-900 p-0.5 border border-slate-800 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div
                  className="hidden h-7 w-7 items-center justify-center rounded-lg text-xs font-black text-white shadow-xs border border-slate-700"
                  style={{ background: `linear-gradient(135deg, ${effectiveCompany?.uiPrimaryColor || '#F05627'}, #1e293b)` }}
                >
                  {(tenantDisplayName || 'T').charAt(0).toUpperCase()}
                </div>
              </div>
            ) : (
              <div
                style={{ background: `linear-gradient(135deg, ${effectiveCompany?.uiPrimaryColor || '#F05627'}, #1e293b)` }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black text-white shadow-xs border border-slate-700 shrink-0"
                title={tenantDisplayName}
              >
                {(tenantDisplayName || 'T').charAt(0).toUpperCase()}
              </div>
            )
          ) : (
            /* Global Platform Master Logo strictly displayed on apex domain / unauthenticated / master portal routes */
            <div className="flex h-7 w-7 items-center justify-center shrink-0">
              <PlatformLogo size="sm" />
            </div>
          )}

          <div className="hidden h-5 w-px bg-neutral-200 dark:bg-slate-800 md:block" />
          <div className="hidden flex-col md:flex">
            {/* Dynamic Isolated Tenant Title or Master OxenGL Enterprise Header */}
            <span className="text-xs font-bold tracking-wide text-slate-200 leading-tight">
              {isTenant ? tenantDisplayName : 'OXENGL ENTERPRISE CLOUD'}
            </span>
            <span className="text-[9px] text-neutral-500 dark:text-slate-400 font-medium leading-tight">
              {isTenant
                ? (isAr ? 'المملكة العربية السعودية • ZATCA Compatible' : 'Kingdom of Saudi Arabia • ZATCA')
                : (isAr ? 'منصة العمليات اللوجستية وإدارة الموارد' : 'Unified Logistics & Supply Chain Cloud')}
            </span>
          </div>
        </div>

        {/* Isolated Tenant Guarded Company Dropdown */}
        { !isTenantDomain && !currentTenantId && <CompanyDropdown /> }

        {/* Offline Failsafe Indicator */}
        {!isOnline && (
          <div
            id="nav-offline-status-pill"
            className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 shadow-xs animate-pulse"
            title={
              isAr
                ? 'وضع العمل دون اتصال نشط: يتم حفظ العمليات والسندات محلياً في الذاكرة التخزينية الميدانية'
                : 'Offline Mode Active: All weighbridge data and vouchers persist locally'
            }
          >
            <WifiOff className="h-3 w-3 text-amber-600 shrink-0" />
            <span className="hidden sm:inline">
              {isAr ? 'أوفلاين (حفظ محلي)' : 'Offline Mode'}
            </span>
          </div>
        )}
      </div>

      {/* Right Section: Clean Controls (Settings Dropdown, Notifications, Language, Role / Avatar) */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Consolidated Settings Dropdown (⚙️ Icon) */}
        <div ref={settingsRef} className="relative">
          <button
            id="nav-settings-btn"
            type="button"
            onClick={() => {
              setShowSettings(!showSettings);
              setShowNotifications(false);
            }}
            className={`group flex h-7.5 w-7.5 items-center justify-center rounded-lg border transition-all duration-300 ${
              showSettings
                ? 'border-orange-500 bg-orange-50 text-[#F05627] dark:border-orange-500/80 dark:bg-orange-950/40 dark:text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                : isDark
                ? 'border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/60 hover:text-white hover:shadow-[0_0_15px_rgba(14,165,233,0.4)]'
                : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
            title={isAr ? 'إعدادات العرض والمظهر' : 'Display & Theme Settings'}
            aria-label="Settings"
          >
            <HoverIcon className="h-3.5 w-3.5">
              <Settings className="h-full w-full" />
            </HoverIcon>
          </button>

          {showSettings && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSettings(false)}
              />
              <div
                className={`absolute top-11 ${
                  isAr ? 'left-0' : 'right-0'
                } z-50 w-72 origin-top-right rounded-2xl border p-3 shadow-2xl backdrop-blur-xl transition-all ${
                  isDark
                    ? 'border-slate-800 bg-slate-900/98 text-slate-200 shadow-black/80'
                    : 'border-neutral-200 bg-white/95 text-neutral-900 shadow-xl'
                }`}
              >
                {/* Popover Header */}
                <div className="mb-3 flex items-center justify-between border-b pb-2 border-neutral-100 dark:border-slate-800">
                  <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase text-neutral-800 dark:text-slate-200">
                    <Settings className="h-3.5 w-3.5 text-[#F05627]" />
                    {isAr ? 'إعدادات النظام والواجهة' : 'System & Settings'}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {isolationTelemetry.cloudLatencyMs}ms
                  </span>
                </div>

                {/* System Governance Shortcuts */}
                <div className="mb-3 space-y-1.5 border-b pb-3 border-neutral-100 dark:border-slate-800">
                  <label className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">
                    {isAr ? 'حوكمة وإدارة النظام' : 'System Governance'}
                  </label>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab?.('approvals');
                        setShowSettings(false);
                      }}
                      className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>{isAr ? 'الموافقات التنفيذية والتدقيق' : 'Executive Approvals'}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">/settings/approvals</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab?.('billing');
                        setShowSettings(false);
                      }}
                      className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <span className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-blue-500" />
                        <span>{isAr ? 'خطة الاشتراك والفوترة' : 'Subscription & Billing'}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">/settings/billing</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab?.('master-data');
                        setShowSettings(false);
                      }}
                      className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <span className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-amber-500" />
                        <span>{isAr ? 'البيانات الرئيسية (Master Data & RBAC)' : 'Master Data & RBAC'}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">/settings/master-data</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab?.('finance-chart');
                        setShowSettings(false);
                      }}
                      className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <span className="flex items-center gap-2">
                        <Network className="h-3.5 w-3.5 text-orange-500" />
                        <span>{isAr ? 'دليل الحسابات (Chart of Accounts)' : 'Chart of Accounts'}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">/finance/chart</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab?.('tenant-settings');
                        setShowSettings(false);
                      }}
                      className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-orange-500" />
                        <span>{isAr ? 'إعدادات المنشأة والمستأجر' : 'Tenant Settings'}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">/settings/tenant</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab?.('organization-profile');
                        setShowSettings(false);
                      }}
                      className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <span className="flex items-center gap-2">
                        <FolderTree className="h-3.5 w-3.5 text-emerald-500" />
                        <span>{isAr ? 'الهيكل التنظيمي والفروع' : 'Enterprise Org Profile'}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">/settings/organization</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab?.('corporate-vault');
                        setShowSettings(false);
                      }}
                      className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <span className="flex items-center gap-2">
                        <FileCheck2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>{isAr ? 'خزينة الامتثال والوثائق المؤسسية' : 'Corporate Compliance Vault'}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">/compliance/vault</span>
                    </button>
                  </div>
                </div>

                {/* Theme Mode Toggle (Light / Dark) */}
                <div className="mb-3 space-y-1.5">
                  <label className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">
                    {isAr ? 'نمط الألوان (المظهر)' : 'Theme Mode'}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setThemeMode('light')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold transition-all ${
                        !isDark
                          ? 'border-orange-500 bg-orange-50 text-orange-950 ring-1 ring-orange-200'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5 text-amber-500" />
                      <span>{isAr ? 'نهاري' : 'Light'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setThemeMode('dark')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold transition-all ${
                        isDark
                          ? 'border-indigo-500 bg-indigo-950/80 text-indigo-200 ring-1 ring-indigo-400'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      <Moon className="h-3.5 w-3.5 text-indigo-400" />
                      <span>{isAr ? 'ليلي' : 'Dark ERP'}</span>
                    </button>
                  </div>
                </div>

                {/* Density Mode Toggle */}
                <div className="mb-3 space-y-1.5">
                  <label className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">
                    {isAr ? 'كثافة العرض (Density)' : 'Grid Density'}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDensityMode('comfortable')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold transition-all ${
                        densityMode === 'comfortable'
                          ? isDark
                            ? 'border-orange-500/80 bg-orange-950/40 text-orange-300 ring-1 ring-orange-400/50'
                            : 'border-orange-500 bg-orange-50 text-orange-950 ring-1 ring-orange-200'
                          : isDark
                          ? 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      <Rows3 className="h-3.5 w-3.5 text-indigo-500" />
                      <span>{isAr ? 'مريح' : 'Comfortable'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDensityMode('compact')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold transition-all ${
                        densityMode === 'compact'
                          ? isDark
                            ? 'border-orange-500/80 bg-orange-950/40 text-orange-300 ring-1 ring-orange-400/50'
                            : 'border-orange-500 bg-orange-50 text-orange-950 ring-1 ring-orange-200'
                          : isDark
                          ? 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      <Rows4 className="h-3.5 w-3.5 text-amber-500" />
                      <span>{isAr ? 'مضغوط' : 'Compact'}</span>
                    </button>
                  </div>
                </div>

                {/* Tenant White-Labeling Theme Accent */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-neutral-500 dark:text-slate-400">
                      {isAr ? 'سمة ألوان المستأجر' : 'Tenant Palette'}
                    </label>
                    <span className="text-[10px] font-semibold text-[#F05627]">
                      {activePalette.nameEn}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1.5 rounded-xl border border-neutral-100 dark:border-slate-800/80 bg-neutral-50/50 dark:bg-slate-900/50">
                    {paletteList.map((palette) => {
                      const isSelected = tenantTheme === palette.id;
                      return (
                        <button
                          key={palette.id}
                          type="button"
                          onClick={() => setTenantTheme(palette.id)}
                          className={`group relative flex flex-col items-center justify-center rounded-lg p-1.5 text-center transition-all ${
                            isSelected
                              ? 'ring-2 ring-orange-500 bg-white dark:bg-slate-800 shadow-xs'
                              : 'hover:bg-white/80 dark:hover:bg-slate-800/50'
                          }`}
                          title={isAr ? palette.nameAr : palette.nameEn}
                        >
                          <span className="mt-1 text-[9px] font-medium text-neutral-600 dark:text-slate-400 truncate w-full">
                            {palette.nameEn.split(' ')[0]}
                          </span>
                          {isSelected && (
                            <Check className="absolute top-1 right-1 h-2.5 w-2.5 text-orange-600 dark:text-orange-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Notifications */}
        <div ref={notificationsRef} className="relative">
          <button
            id="nav-notifications-btn"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowSettings(false);
            }}
            className={`group relative flex h-7.5 w-7.5 items-center justify-center rounded-lg border transition-all duration-300 ${
              showNotifications
                ? 'border-orange-500 bg-orange-50 text-[#F05627] dark:border-orange-500/80 dark:bg-orange-950/40 dark:text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                : isDark
                ? 'border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/60 hover:text-white hover:shadow-[0_0_15px_rgba(14,165,233,0.4)]'
                : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
            title={isAr ? 'التنبيهات والإشعارات' : 'Notifications'}
          >
            <HoverIcon className="h-3.5 w-3.5">
              <Bell className="h-full w-full" />
            </HoverIcon>
            {unreadAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white shadow-xs">
                <span dir="ltr" className="inline-block unicode-bidi-isolate">{unreadAlertsCount}</span>
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div
                className={`absolute top-11 ${
                  isAr ? 'left-0' : 'right-0'
                } z-50 w-88 rounded-2xl border p-4 shadow-2xl backdrop-blur-xl transition-all ${
                  isDark
                    ? 'border-slate-800 bg-slate-900/98 text-slate-200 shadow-black/80'
                    : 'border-neutral-200 bg-white/95 text-neutral-900 shadow-xl'
                }`}
              >
                <div className="mb-3 flex items-center justify-between border-b pb-2 border-neutral-100 dark:border-slate-800">
                  <span className="text-sm font-bold text-neutral-800 dark:text-slate-200">
                    {isAr ? 'مركز الإشعارات والرقابة' : 'Alerts & Operations'}
                  </span>
                  <div className="flex items-center gap-2">
                    {unreadAlertsCount > 0 && (
                      <button
                        onClick={() => setAlerts((prev) => prev.map((a) => ({ ...a, read: true })))}
                        className="text-[10px] font-medium text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                      >
                        {isAr ? 'تحديد الكل كمقروء' : 'Mark all read'}
                      </button>
                    )}
                    <span className="rounded-full bg-orange-50 dark:bg-orange-950/50 px-2 py-0.5 text-[10px] font-semibold text-[#F05627]">
                      <span dir="ltr" className="inline-block unicode-bidi-isolate">{unreadAlertsCount}</span> {isAr ? 'تنبيهات' : 'Alerts'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  {alerts.length === 0 || unreadAlertsCount === 0 && alerts.every((a) => a.read) ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center text-slate-500 dark:text-slate-400">
                      <p className="font-semibold">{isAr ? 'لا توجد تنبيهات جديدة معلقة' : 'All clear! No pending alerts'}</p>
                      <p className="text-[11px] mt-1 text-slate-400 dark:text-slate-500">
                        {isAr ? 'العمليات اللوجستية والمالية تعمل بانتظام' : 'Operations and telemetry operating nominally'}
                      </p>
                    </div>
                  ) : null}

                  {alerts.map((alert) => {
                    const isWastage = alert.type === 'wastage';
                    const isBilling = alert.type === 'billing';
                    const isColdChain = alert.type === 'cold_chain';

                    return (
                      <div
                        key={alert.id}
                        className={`group relative rounded-xl border p-3 transition-all cursor-pointer ${
                          alert.read
                            ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/30 border-slate-200/50 dark:border-slate-800/40'
                            : isWastage
                            ? 'bg-amber-50/90 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-800/60 shadow-2xs hover:border-amber-400'
                            : isBilling
                            ? 'bg-orange-50/90 dark:bg-orange-950/30 text-orange-950 dark:text-orange-200 border-orange-200 dark:border-orange-800/60 shadow-2xs hover:border-orange-400'
                            : 'bg-rose-50/90 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 border-rose-200 dark:border-rose-800/60 shadow-2xs hover:border-rose-400'
                        }`}
                        onClick={() => handleNavigateAlert(alert)}
                      >
                        <div className="flex items-start gap-2.5">
                          {isWastage && (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                          )}
                          {isBilling && (
                            <FileText className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400 mt-0.5" />
                          )}
                          {isColdChain && (
                            <Thermometer className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <p className="font-bold text-xs truncate">
                                {isAr ? alert.titleAr : alert.titleEn}
                              </p>
                              <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                                <span dir="ltr" className="inline-block unicode-bidi-isolate">{isAr ? alert.timeAgoAr : alert.timeAgoEn}</span>
                              </span>
                            </div>
                            <p className="text-[11px] leading-relaxed opacity-90">
                              {isAr ? alert.descAr : alert.descEn}
                            </p>

                            {/* Deep link action badges */}
                            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 group-hover:underline">
                                <ExternalLink className="h-2.5 w-2.5" />
                                {isWastage
                                  ? isAr
                                    ? <>فحص رحلة الشاحنة <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">3190</span></>
                                    : <>Inspect Truck <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">3190</span> Log</>
                                  : isBilling
                                  ? isAr
                                    ? 'إصدار دفعة فواتير الكفاح'
                                    : 'Draft Kifah Batch'
                                  : isAr
                                  ? <>تتبع المركبة <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">V-1002</span> على الخريطة</>
                                  : <>Track <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">V-1002</span> on Map</>}
                              </span>

                              {isWastage && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigateAlert(
                                      alert,
                                      '/finance/ai-auditor?focusAnomaly=anom-3190',
                                      'ai-insights'
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-200/70 dark:bg-amber-900/60 px-1.5 py-0.5 text-[9px] font-bold text-amber-950 dark:text-amber-200 hover:bg-amber-300"
                                >
                                  <Sparkles className="h-2.5 w-2.5 text-amber-700 dark:text-amber-300" />
                                  {isAr ? 'المدقق الذكي' : 'AI Auditor'}
                                </button>
                              )}
                            </div>
                          </div>

                          {!alert.read && (
                            <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0 mt-1" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Language Selector */}
        <button
          id="nav-lang-toggle-btn"
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          className={`group flex h-7.5 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition-all duration-300 ${
            isDark
              ? 'border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/60 hover:text-white hover:shadow-[0_0_15px_rgba(14,165,233,0.4)]'
              : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
          }`}
          title={isAr ? 'Switch to English' : 'التحويل للغة العربية'}
        >
          <HoverIcon className="h-3 w-3">
            <Globe className="h-full w-full text-[#F05627]" />
          </HoverIcon>
          <span>{language === 'ar' ? 'English' : 'عربي'}</span>
        </button>

        {/* Authenticated User Role Badge (Derived strictly from Authentication Context) */}
        {(() => {
          const rawRole = currentUser?.role;
          const normalizedRole = rawRole?.toLowerCase() === 'owner' ? 'Owner' : rawRole;
          const activeUserRole: UserRole = (normalizedRole && roleColors[normalizedRole as UserRole]) ? (normalizedRole as UserRole) : 'Guest';
          const activeRoleBadge = roleColors[activeUserRole] ?? roleColors.Guest;
          const isOwner = activeUserRole === 'Owner';
          return (
            <div
              id="nav-user-role-badge"
              className={`flex h-7.5 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold select-none ${
                activeRoleBadge.bg
              } ${activeRoleBadge.border} ${activeRoleBadge.text} ${
                isOwner ? 'ring-1 ring-amber-400/40 dark:ring-amber-400/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]' : ''
              }`}
              title={isAr ? `صلاحية الحساب الحالية: ${activeRoleBadge.labelAr}` : `Active Account Role: ${activeRoleBadge.labelEn}`}
            >
              {isOwner ? (
                <Crown className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 animate-pulse" />
              ) : (
                <Shield className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">
                {isAr ? activeRoleBadge.labelAr : activeRoleBadge.labelEn}
              </span>
              <span className="sm:hidden">{activeUserRole}</span>
            </div>
          );
        })()}

        {/* User Profile Avatar & Logout */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <UserAvatar user={currentUser} sizeClassName="h-7.5 w-7.5 text-xs" />
          {onLogout && (
            <button
              onClick={() => {
                void signOutAuth();
                onLogout();
              }}
              className={`group flex h-7.5 w-7.5 items-center justify-center rounded-lg transition-all duration-300 ${
                isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-rose-400 hover:shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                  : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
              }`}
              title={isAr ? 'تسجيل الخروج' : 'Logout'}
            >
              <HoverIcon className="h-3.5 w-3.5">
                <LogOut className="h-full w-full" />
              </HoverIcon>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

