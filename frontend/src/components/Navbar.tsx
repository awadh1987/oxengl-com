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
  Truck,
  FileText,
  Sparkles,
  Thermometer,
  ExternalLink,
  Network,
  FileCheck2,
  ChevronDown,
  ChevronUp,
  Landmark,
  Radio,
  Wrench,
  Scale,
  Building2,
  Layers,
  ShoppingCart,
  Boxes,
  FileSpreadsheet,
  TrendingUp,
  Receipt,
} from 'lucide-react';
import { UserRole } from '../types';
import { TENANT_PALETTES } from '../theme/designTokens';
import { BrandLogo } from './BrandLogo';
import { BrandWordmark } from '../views/landing/BrandWordmark';
import { UserAvatar } from './UserAvatar';
import { UserProfilePanel } from './UserProfilePanel';
import { TenantAvatar } from './TenantAvatar';
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

export interface NavbarProps {
  onOpenAIModal?: () => void;
  onOpenExportPrintModal?: () => void;
  onLogout?: () => void;
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
  selectedDomain?: 'Operations & Logistics' | 'Finance, Accounting & Control';
  onSelectDomain?: (domain: 'Operations & Logistics' | 'Finance, Accounting & Control') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onLogout,
  onNavigateTab,
  activeTab,
  selectedDomain: selectedDomainProp,
  onSelectDomain: onSelectDomainProp,
}) => {
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
    isDriverMode,
  } = useApp();

  const [internalDomain, setInternalDomain] = useState<'Operations & Logistics' | 'Finance, Accounting & Control'>(() => {
    if (selectedDomainProp) return selectedDomainProp;
    if (activeTab) {
      if (['invoicing', 'vouchers', 'finance-chart', 'financial-reports', 'finance-trial-balance', 'finance-audit-closing', 'ai-insights'].includes(activeTab)) {
        return 'Finance, Accounting & Control';
      }
    }
    return 'Operations & Logistics';
  });

  const [isOpsExpanded, setIsOpsExpanded] = useState<boolean>(true);
  const [isFinanceExpanded, setIsFinanceExpanded] = useState<boolean>(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const activeNavDomain = selectedDomainProp ?? internalDomain;

  const handleDomainSelect = (domain: 'Operations & Logistics' | 'Finance, Accounting & Control') => {
    if (onSelectDomainProp) {
      onSelectDomainProp(domain);
    } else {
      setInternalDomain(domain);
    }
  };

  useEffect(() => {
    if (!activeTab) return;
    const isFinance = ['invoicing', 'vouchers', 'finance-chart', 'financial-reports', 'finance-trial-balance', 'finance-audit-closing', 'ai-insights'].includes(activeTab);
    const isOps = ['operations', 'fleet-map', 'maintenance', 'transporters', 'crushers', 'customs', 'planning', 'procurement', 'inventory', 'dashboard'].includes(activeTab);
    if (isFinance && activeNavDomain !== 'Finance, Accounting & Control') {
      handleDomainSelect('Finance, Accounting & Control');
      setIsFinanceExpanded(true);
    } else if (isOps && activeNavDomain !== 'Operations & Logistics') {
      handleDomainSelect('Operations & Logistics');
      setIsOpsExpanded(true);
    }
  }, [activeTab]);

  const handleDomainClick = (domain: 'Operations & Logistics' | 'Finance, Accounting & Control') => {
    if (activeNavDomain === domain) {
      if (domain === 'Operations & Logistics') {
        setIsOpsExpanded((prev) => !prev);
      } else {
        setIsFinanceExpanded((prev) => !prev);
      }
    } else {
      handleDomainSelect(domain);
      if (domain === 'Operations & Logistics') {
        setIsOpsExpanded(true);
        const isOps = ['operations', 'fleet-map', 'maintenance', 'transporters', 'crushers', 'customs', 'planning', 'procurement', 'inventory'].includes(activeTab || '');
        if (!isOps) onNavigateTab?.('operations');
      } else {
        setIsFinanceExpanded(true);
        const isFinance = ['invoicing', 'vouchers', 'finance-chart', 'financial-reports', 'finance-trial-balance', 'finance-audit-closing', 'ai-insights'].includes(activeTab || '');
        if (!isFinance) onNavigateTab?.('invoicing');
      }
    }
  };

  // Sub-navigation definition for Operations & Logistics
  const opsSubItems = useMemo(() => {
    const rawItems = [
      { id: 'operations', labelAr: 'سجل العمليات اليومية', labelEn: 'Daily Operations Logs', icon: Truck },
      { id: 'fleet-map', labelAr: 'رادار وخريطة الأسطول', labelEn: 'Fleet Radar & GPS', icon: Radio },
      { id: 'maintenance', labelAr: 'صيانة الأسطول والوقود', labelEn: 'Fleet Maintenance & Fuel', icon: Wrench },
      { id: 'transporters', labelAr: 'موردي الخدمات والتسويات', labelEn: 'Service Suppliers', icon: Scale },
      { id: 'crushers', labelAr: 'موردي المواد وحساباتهم', labelEn: 'Material Suppliers', icon: Building2 },
      { id: 'customs', labelAr: 'لوحة التخليص الجمركي', labelEn: 'Customs Clearance', icon: Globe },
      { id: 'planning', labelAr: 'إدارة التخطيط والتشغيل', labelEn: 'Planning & Charters', icon: Layers },
      { id: 'procurement', labelAr: 'المشتريات وسلسلة التوريد', labelEn: 'Procurement & S2P', icon: ShoppingCart },
      { id: 'inventory', labelAr: 'المخزون والتقييم المالي', labelEn: 'Inventory & Valuation', icon: Boxes },
    ];
    if (isDriverMode) {
      return rawItems.filter((i) => i.id === 'operations' || i.id === 'transporters');
    }
    return rawItems;
  }, [isDriverMode]);

  // Sub-navigation definition for Finance, Accounting & Control
  const financeSubItems = useMemo(() => [
    { id: 'invoicing', labelAr: 'الفوترة الضريبية', labelEn: 'ZATCA Invoicing', icon: FileSpreadsheet },
    { id: 'vouchers', labelAr: 'السندات المالية', labelEn: 'Financial Vouchers', icon: Receipt },
    { id: 'finance-chart', labelAr: 'دليل الحسابات', labelEn: 'Chart of Accounts', icon: Network },
    { id: 'financial-reports', labelAr: 'التقارير المالية المجمعة', labelEn: 'Financial Reports Engine', icon: TrendingUp },
    { id: 'finance-trial-balance', labelAr: 'ميزان المراجعة', labelEn: 'Trial Balance', icon: Scale },
    { id: 'finance-audit-closing', labelAr: 'الإقفال السنوي والتدقيق', labelEn: 'Annual Audit Closing', icon: FileCheck2 },
    { id: 'ai-insights', labelAr: 'مدقق العمليات والمالية الذكي', labelEn: 'AI Financial Auditor', icon: Sparkles },
  ], []);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const settingsRef = useOutsideClick<HTMLDivElement>(() => {
    if (showSettings) setShowSettings(false);
  });

  const notificationsRef = useOutsideClick<HTMLDivElement>(() => {
    if (showNotifications) setShowNotifications(false);
  });

  const userMenuRef = useOutsideClick<HTMLDivElement>(() => {
    if (isUserMenuOpen) setIsUserMenuOpen(false);
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
    (activeDomain ? `${activeDomain.toUpperCase()} Workspace` : (tenantSlug ? `${tenantSlug.toUpperCase()} Workspace` : (isAr ? 'منظومة أوكسن السحابية' : 'OxenGL Enterprise Cloud')));

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
      className={`sticky top-0 z-30 flex flex-col border-b px-3 py-1 sm:px-4 backdrop-blur-md transition-all ${
        isDark
          ? 'border-slate-800 bg-slate-950/95 text-slate-200 shadow-sm'
          : 'border-neutral-200/80 bg-white/95 text-neutral-900'
      }`}
    >
      {/* Top Row: Identity & Primary Controls */}
      <div className="flex w-full items-center justify-between gap-2">
        {/* Left Section: Essentials Context (Logo, Subtitle, Tenant Selector, System Latency/Status) */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Dynamic Tenant Branding: Logo with strict fallback to Monogram Avatar Badge */}
          {isTenant ? (
            <TenantAvatar
              tenant={effectiveCompany}
              logoUrl={tenantLogoUrl}
              name={tenantDisplayName}
              size="sm"
              showGlow={true}
              title={tenantDisplayName}
            />
          ) : (
            /* Global Platform Master Logo strictly displayed on apex domain / unauthenticated / master portal routes */
            <div className="flex items-center shrink-0">
              <BrandWordmark height={18} />
            </div>
          )}

          <div className="hidden h-5 w-px bg-neutral-200 dark:bg-slate-800 md:block" />
          <div className="hidden flex-col md:flex">
            {/* Dynamic Isolated Tenant Title or Master Platform Global Header */}
            <span className="text-xs font-bold tracking-wide text-slate-200 leading-tight">
              {isTenant
                ? tenantDisplayName
                : (isAr ? (brandConfig?.companyNameAr || 'منظومة أوكسن السحابية') : (brandConfig?.companyNameEn || 'OXENGL ENTERPRISE CLOUD'))}
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

        {/* User profile and account actions */}
        <div ref={userMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setIsUserMenuOpen((open) => !open);
              setShowSettings(false);
              setShowNotifications(false);
            }}
            aria-label={isAr ? 'قائمة الحساب' : 'Account menu'}
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <UserAvatar user={currentUser} sizeClassName="h-7 w-7 text-[10px]" shape="circle" />
            <span className="hidden max-w-28 truncate text-xs font-bold sm:inline">
              {currentUser?.fullName || (isAr ? 'الحساب' : 'Account')}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {isUserMenuOpen && (
            <div
              role="menu"
              aria-label={isAr ? 'إجراءات الحساب' : 'Account actions'}
              className={`absolute top-11 z-[60] w-72 rounded-2xl border p-2 shadow-2xl ${
                isAr ? 'left-0' : 'right-0'
              } ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-slate-100'
                  : 'border-slate-200 bg-white text-slate-800'
              }`}
            >
              <div className={`mb-1 border-b px-3 py-2.5 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <p className="truncate text-sm font-black">{currentUser?.fullName || currentUser?.username}</p>
                <p className={`truncate text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {currentUser?.email}
                </p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsProfileOpen(true);
                  setIsUserMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition ${
                  isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                }`}
              >
                <UserCheck className="h-4 w-4 text-orange-500" />
                {isAr ? 'ملفي الشخصي' : 'My Profile'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowSettings(true);
                  setIsUserMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition ${
                  isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                }`}
              >
                <Settings className="h-4 w-4 text-slate-500" />
                {isAr ? 'إعدادات الحساب' : 'Account Settings'}
              </button>
              <div className={`my-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {isAr ? 'حالة مساحة العمل' : 'Workspace status'}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${
                  isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {isOnline ? (isAr ? 'متصل' : 'Online') : (isAr ? 'غير متصل' : 'Offline')}
                </span>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                  isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {isDark ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
                  {isAr ? 'المظهر' : 'Theme'}
                </span>
                <span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isDark ? (isAr ? 'داكن' : 'Dark') : (isAr ? 'فاتح' : 'Light')}
                </span>
              </button>
              <div className={`my-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`} />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  void signOutAuth();
                  onLogout?.();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <LogOut className="h-4 w-4" />
                {isAr ? 'تسجيل الخروج' : 'Sign Out / Logout'}
              </button>
            </div>
          )}
        </div>
      </div>
      {isProfileOpen && <UserProfilePanel onClose={() => setIsProfileOpen(false)} />}
    </div>

      {/* Bottom Row: Stacked Horizontal Domain Tabs (Phase 2) */}
      {!isDriverMode && (
        <div
          id="header-domain-navigation"
          className="flex w-full flex-col gap-1 border-t border-slate-200/60 dark:border-slate-800/80 pt-1 pb-0.5"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {/* Main Domain Tab 1: Operations & Logistics */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <button
                type="button"
                id="header-domain-tab-ops"
                onClick={() => handleDomainClick('Operations & Logistics')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-black transition-all duration-200 cursor-pointer ${
                  activeNavDomain === 'Operations & Logistics'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-xs hover:shadow-[0_0_12px_rgba(249,115,22,0.4)]'
                    : isDark
                    ? 'bg-slate-900/90 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <Truck className="h-3 w-3 shrink-0" />
                <span>{isAr ? '🚛 العمليات واللوجستيات' : '🚛 Operations & Logistics'}</span>
                <span
                  className={`text-[9.5px] px-1 rounded font-bold ${
                    activeNavDomain === 'Operations & Logistics'
                      ? 'bg-white/20 text-white'
                      : isDark
                      ? 'bg-slate-800 text-slate-400'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {opsSubItems.length}
                </span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${
                    activeNavDomain === 'Operations & Logistics' && isOpsExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {activeNavDomain === 'Operations & Logistics' && (
                <div className="hidden sm:flex items-center gap-1 text-[9.5px] text-orange-400 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                  <span>{isAr ? 'شاشات التشغيل والأسطول نشطة' : 'Operations & Logistics Active'}</span>
                </div>
              )}
            </div>

            {/* Horizontal Collapsible Sub-Navigation List */}
            {activeNavDomain === 'Operations & Logistics' && isOpsExpanded && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                {opsSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigateTab?.(item.id)}
                      className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50 shadow-xs'
                          : isDark
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 border border-transparent'
                      }`}
                    >
                      <Icon className="h-2.5 w-2.5 shrink-0" />
                      <span>{isAr ? item.labelAr : item.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Main Domain Tab 2: Finance, Accounting & Control */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <button
                type="button"
                id="header-domain-tab-finance"
                onClick={() => handleDomainClick('Finance, Accounting & Control')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-black transition-all duration-200 cursor-pointer ${
                  activeNavDomain === 'Finance, Accounting & Control'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xs hover:shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                    : isDark
                    ? 'bg-slate-900/90 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <Landmark className="h-3 w-3 shrink-0" />
                <span>{isAr ? '📊 المالية والمحاسبة والرقابة' : '📊 Finance, Accounting & Control'}</span>
                <span
                  className={`text-[9.5px] px-1 rounded font-bold ${
                    activeNavDomain === 'Finance, Accounting & Control'
                      ? 'bg-white/20 text-white'
                      : isDark
                      ? 'bg-slate-800 text-slate-400'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {financeSubItems.length}
                </span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${
                    activeNavDomain === 'Finance, Accounting & Control' && isFinanceExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {activeNavDomain === 'Finance, Accounting & Control' && (
                <div className="hidden sm:flex items-center gap-1 text-[9.5px] text-violet-400 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                  <span>{isAr ? 'شاشات المالية ودفتر الأستاذ نشطة' : 'Finance & Control Active'}</span>
                </div>
              )}
            </div>

            {/* Horizontal Collapsible Sub-Navigation List */}
            {activeNavDomain === 'Finance, Accounting & Control' && isFinanceExpanded && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                {financeSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigateTab?.(item.id)}
                      className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50 shadow-xs'
                          : isDark
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 border border-transparent'
                      }`}
                    >
                      <Icon className="h-2.5 w-2.5 shrink-0" />
                      <span>{isAr ? item.labelAr : item.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
