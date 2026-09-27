import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Truck,
  FileSpreadsheet,
  Building2,
  TrendingDown,
  Sparkles,
  Database,
  ShieldCheck,
  Lock,
  Receipt,
  Cpu,
  Palette,
  Wrench,
  CreditCard,
  Globe,
  Layers,
  Radio,
  Network,
  Scale,
  FileCheck2,
  ShoppingCart,
  Boxes,
  Users,
  FolderTree,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { HoverIcon } from './common/HoverIcon';

export type ActiveTab =
  | 'hub'
  | 'dashboard'
  | 'planning'
  | 'operations'
  | 'maintenance'
  | 'fleet-map'
  | 'billing'
  | 'invoicing'
  | 'vouchers'
  | 'finance-chart'
  | 'finance-trial-balance'
  | 'financial-reports'
  | 'finance-audit-closing'
  | 'crushers'
  | 'transporters'
  | 'ai-insights'
  | 'executive-admin'
  | 'master-data'
  | 'workflow-builder'
  | 'design-studio'
  | 'tenant-settings'
  | 'approvals'
  | 'procurement'
  | 'inventory'
  | 'hr'
  | 'mfa'
  | 'customs'
  | 'organization-profile'
  | 'corporate-vault'
  | 'admin-hub';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface MenuItemDef {
  id: ActiveTab;
  labelAr: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }> | string;
  roles: string[];
  badge?: string | null;
  path?: string;
  highlight?: boolean;
}

interface NavCategoryDef {
  id: 'core' | 'procurement' | 'logistics' | 'finance' | 'hr' | 'governance';
  labelAr: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  itemIds: ActiveTab[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const {
    currentUser,
    language,
    kpis,
    isDriverMode,
    toggleDriverMode,
    isolationTelemetry,
    tenantId,
    currentCompany,
    authTier,
  } = useApp();
  const isAr = language === 'ar';

  // Persistent Collapsed State (w-64 to w-16)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('oxengl_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('oxengl_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  const [availableViews, setAvailableViews] = useState<string[] | null>(null);

  // Fetch tenant configurations using active X-Tenant-ID header
  useEffect(() => {
    const activeTenantId =
      tenantId ||
      (authTier === 'tenant' ? currentCompany?.id : null) ||
      localStorage.getItem('oxengl_tenant_id') ||
      localStorage.getItem('tenant_id');
    if (!activeTenantId) return;

    const token = localStorage.getItem('oxengl_auth_jwt') || localStorage.getItem('token');
    const fetchTenantConfig = async () => {
      try {
        let response = await fetch('/api/v1/tenant/control/settings', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'X-Tenant-ID': activeTenantId,
          },
        });
        if (!response.ok && response.status === 404) {
          response = await fetch('/api/tenant/control/settings', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              'X-Tenant-ID': activeTenantId,
            },
          });
        }
        if (response.ok) {
          const data = await response.json();
          const views =
            data?.settings?.modules || data?.settings?.available_views || data?.availableViews;
          if (Array.isArray(views) && views.length > 0) {
            setAvailableViews(views);
          }
        }
      } catch (err) {
        console.warn('Tenant config lookup failed, using local schema fallback:', err);
      }
    };

    fetchTenantConfig();
  }, [tenantId, currentCompany?.id, authTier]);

  const allMenuItems: MenuItemDef[] = useMemo(
    () => [
      // 1. Core Operations
      {
        id: 'dashboard',
        labelAr: 'لوحة القيادة والمؤشرات',
        labelEn: 'Executive Dashboard',
        icon: LayoutDashboard,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest', 'Read_Only', 'Super_Admin'],
        badge: isAr ? 'رئيسي' : 'Core',
      },
      {
        id: 'planning',
        labelAr: 'إدارة التخطيط الاستراتيجي',
        labelEn: 'Planning Department',
        path: '/operations/planning',
        icon: Layers,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest', 'Read_Only', 'Super_Admin'],
        badge: 'Tier 1-3',
      },
      {
        id: 'operations',
        labelAr: 'قيد العمليات اليومية',
        labelEn: 'Daily Operations Entry',
        path: '/operations/daily',
        icon: Truck,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest', 'Read_Only', 'Super_Admin'],
        badge: isDriverMode ? (isAr ? 'نشط' : 'Active') : null,
      },
      {
        id: 'customs',
        labelAr: 'إدارة وتخليص الجمارك',
        labelEn: 'Customs Clearance',
        path: '/operations/customs',
        icon: Globe,
        roles: ['Super_Admin', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest'],
        badge: 'ZATCA P2',
      },

      // 2. Procurement & S2P
      {
        id: 'procurement',
        labelAr: 'المشتريات وسلسلة التوريد',
        labelEn: 'Procurement & S2P',
        path: '/operations/procurement',
        icon: ShoppingCart,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Super_Admin'],
        badge: 'S2P',
      },
      {
        id: 'inventory',
        labelAr: 'المخزون والتقييم المالي',
        labelEn: 'Inventory & Valuation',
        path: '/operations/inventory',
        icon: Boxes,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Super_Admin'],
        badge: 'GL',
      },

      // 3. Logistics & Fleet
      {
        id: 'fleet-map',
        labelAr: 'خريطة التتبع والرادار المباشر',
        labelEn: 'Live Fleet Radar & Map',
        path: '/operations/fleet-map',
        icon: Radio,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest', 'Read_Only', 'Super_Admin'],
        badge: isAr ? 'رادار حي' : 'Live GPS',
      },
      {
        id: 'maintenance',
        labelAr: 'صيانة الأسطول ومصروفات الوقود',
        labelEn: 'Fleet Maintenance & Fuel',
        path: '/operations/fleet-maintenance',
        icon: Wrench,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Super_Admin'],
        badge: isAr ? 'أوامر ووقود' : 'Fleet Ops',
      },
      {
        id: 'transporters',
        labelAr: 'موردي الخدمات والتسويات',
        labelEn: 'Service Suppliers',
        path: '/operations/transporters',
        icon: Scale,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Super_Admin'],
        badge: isAr ? 'تتبع الفاقد' : 'Wastage',
      },
      {
        id: 'crushers',
        labelAr: 'موردي المواد وحساباتهم',
        labelEn: 'Material Suppliers',
        path: '/operations/crushers',
        icon: Building2,
        roles: ['Admin', 'COO', 'Accountant', 'Read_Only', 'Super_Admin'],
        badge: null,
      },

      // 4. Finance & GL
      {
        id: 'invoicing',
        labelAr: 'الفواتير الضريبية للعملاء',
        labelEn: 'Customer Invoicing (ZATCA)',
        path: '/finance/invoices',
        icon: FileSpreadsheet,
        roles: ['Admin', 'COO', 'Accountant', 'Guest', 'Read_Only', 'Super_Admin'],
        badge: 'ZATCA',
      },
      {
        id: 'vouchers',
        labelAr: 'سندات القبض والصرف',
        labelEn: 'Payment & Receipt Vouchers',
        path: '/finance/vouchers',
        icon: Receipt,
        roles: ['Admin', 'COO', 'Accountant', 'Super_Admin'],
        badge: isAr ? 'سندات' : 'Vouchers',
      },
      {
        id: 'finance-chart',
        labelAr: 'دليل الحسابات الشجري',
        labelEn: 'Chart of Accounts',
        path: '/finance/chart',
        icon: Network,
        roles: ['Admin', 'COO', 'Accountant', 'Read_Only', 'Super_Admin'],
        badge: '5-Deep',
      },
      {
        id: 'finance-trial-balance',
        labelAr: 'ميزان المراجعة العام',
        labelEn: 'Trial Balance',
        path: '/finance/trial-balance',
        icon: Scale,
        roles: ['Admin', 'COO', 'Accountant', 'Read_Only', 'Super_Admin'],
        badge: 'GL',
      },
      {
        id: 'financial-reports',
        labelAr: 'التقارير والتحليلات المالية المجمعة',
        labelEn: 'Financial Reports Engine',
        path: '/finance/reports',
        icon: TrendingUp,
        roles: ['Admin', 'COO', 'Accountant', 'Read_Only', 'Super_Admin'],
        badge: 'P&L / BS',
      },
      {
        id: 'finance-audit-closing',
        labelAr: 'الإقفال المالي والمراجعة السنوية',
        labelEn: 'Annual Audit Closing',
        path: '/finance/audit-closing',
        icon: FileCheck2,
        roles: ['Admin', 'COO', 'Accountant', 'Super_Admin'],
        badge: 'Audit',
      },

      // 5. Human Resources & Payroll
      {
        id: 'hr',
        labelAr: 'الموارد البشرية والرواتب',
        labelEn: 'Human Resources (HR)',
        path: '/operations/hr',
        icon: Users,
        roles: ['Admin', 'COO', 'Accountant', 'Read_Only', 'Super_Admin'],
        badge: 'HRMS',
      },

      // 4. System Governance
      {
        id: 'master-data',
        labelAr: 'البيانات المرجعية والمستخدمين',
        labelEn: 'Master Data & Users',
        path: '/settings/master-data',
        icon: Database,
        roles: ['Admin', 'COO', 'Super_Admin'],
        badge: null,
      },
      {
        id: 'billing',
        labelAr: 'اشتراك المنصة والفوترة',
        labelEn: 'SaaS Subscription & Billing',
        path: '/settings/billing',
        icon: CreditCard,
        roles: ['Admin', 'COO', 'Super_Admin'],
        badge: 'SaaS',
      },
      {
        id: 'workflow-builder',
        labelAr: 'أتمتة وسير العمليات',
        labelEn: 'Workflow Automation',
        icon: Cpu,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest', 'Super_Admin'],
        badge: 'BPM',
      },
      {
        id: 'design-studio',
        labelAr: 'استوديو التصميم وهوية المستأجر',
        labelEn: 'Design Studio & AI',
        path: '/dev-studio',
        icon: Palette,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest', 'Super_Admin'],
        badge: 'Dev',
      },
      {
        id: 'executive-admin',
        labelAr: 'لوحة الإدارة والاعتمادات',
        labelEn: 'Executive Approvals & Audit',
        path: '/settings/approvals',
        icon: ShieldCheck,
        roles: ['Admin', 'COO', 'Super_Admin'],
        badge:
          kpis.pendingApprovalsCount > 0
            ? `${kpis.pendingApprovalsCount} ${isAr ? 'معلق' : 'Req'}`
            : null,
        highlight: true,
      },
      {
        id: 'tenant-settings',
        labelAr: 'إدارة المنشأة والنطاقات',
        labelEn: 'Tenant Admin & Domains',
        path: '/settings/tenant',
        icon: Globe,
        roles: ['Admin', 'COO', 'Super_Admin'],
        badge: 'RLS',
      },
      {
        id: 'corporate-vault',
        labelAr: 'خزينة الامتثال والوثائق المؤسسية',
        labelEn: 'Corporate Compliance Vault',
        path: '/compliance/vault',
        icon: FileCheck2,
        roles: ['Admin', 'COO', 'Accountant', 'Data_Entry', 'Read_Only', 'Guest', 'Super_Admin'],
        badge: 'Standard',
      },
      {
        id: 'organization-profile',
        labelAr: 'الهيكل التنظيمي للمنشأة والفروع',
        labelEn: 'Enterprise Organization Profile',
        path: '/settings/organization',
        icon: FolderTree,
        roles: ['Admin', 'COO', 'Super_Admin'],
        badge: 'Hierarchy',
      },
      ...(currentUser?.role === 'Super_Admin' || authTier === 'master'
        ? [
            {
              id: 'admin-hub' as ActiveTab,
              labelAr: 'مركز تحكم المنصة الرئيسي',
              labelEn: 'Admin Hub',
              path: '/admin',
              icon: LayoutDashboard,
              roles: ['Super_Admin', 'Admin'],
              badge: 'Cockpit',
            },
          ]
        : []),
    ],
    [currentUser?.role, authTier, isAr, isDriverMode, kpis.pendingApprovalsCount]
  );

  // Enterprise Accordion Categories
  const categories: NavCategoryDef[] = useMemo(
    () => [
      {
        id: 'core',
        labelAr: 'العمليات الأساسية',
        labelEn: 'Core Operations',
        icon: LayoutDashboard,
        itemIds: ['dashboard', 'planning', 'operations', 'customs'],
      },
      {
        id: 'procurement',
        labelAr: 'المشتريات وسلسلة التوريد',
        labelEn: 'Procurement & S2P',
        icon: ShoppingCart,
        itemIds: ['procurement', 'inventory'],
      },
      {
        id: 'logistics',
        labelAr: 'الأسطول واللوجستيات',
        labelEn: 'Logistics & Fleet',
        icon: Truck,
        itemIds: ['fleet-map', 'maintenance', 'transporters', 'crushers'],
      },
      {
        id: 'finance',
        labelAr: 'المالية ودفتر الأستاذ',
        labelEn: 'Finance & GL',
        icon: Receipt,
        itemIds: ['invoicing', 'vouchers', 'finance-chart', 'finance-trial-balance', 'financial-reports', 'finance-audit-closing'],
      },
      {
        id: 'hr',
        labelAr: 'الموارد البشرية والرواتب',
        labelEn: 'Human Resources (HR)',
        icon: Users,
        itemIds: ['hr'],
      },
      {
        id: 'governance',
        labelAr: 'الحوكمة والامتثال',
        labelEn: 'Governance & Compliance',
        icon: ShieldCheck,
        // 'ai-insights' intentionally omitted — canonical entry is the top sub-nav ribbon
        // (/finance/ai-auditor). The floating AIAssistantWidget drawer is the secondary entry.
        itemIds: [
          'corporate-vault',
          'organization-profile',
          'master-data',
          'billing',
          'workflow-builder',
          'design-studio',
          'executive-admin',
          'tenant-settings',
          'admin-hub',
        ],
      },
    ],
    []
  );

  // Accordion open/close state with Auto-Expand of category containing activeTab
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {
      core: false,
      procurement: false,
      logistics: false,
      finance: false,
      hr: false,
      governance: false,
    };
    const found = categories.find((c) => c.itemIds.includes(activeTab));
    if (found) {
      initial[found.id] = true;
    } else {
      initial.core = true;
    }
    return initial;
  });

  // Auto-Expand: Automatically expand category containing the active route
  useEffect(() => {
    const activeCategory = categories.find((c) => c.itemIds.includes(activeTab));
    if (activeCategory) {
      setExpandedCategories((prev) => ({
        ...prev,
        [activeCategory.id]: true,
      }));
    }
  }, [activeTab, categories]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  // Filter items by tenant/role
  const filteredMenuItems = useMemo(() => {
    let items = allMenuItems;
    if (availableViews && availableViews.length > 0) {
      items = items.filter((item) => availableViews.includes(item.id));
    }
    if (isDriverMode) {
      items = items.filter((item) => item.id === 'operations' || item.id === 'transporters');
    }

    // Conditionally hide navigation tabs based on active permissions
    const activeRole = currentUser?.role ?? 'Guest';
    items = items.filter((item) => {
      if (activeRole === 'Super_Admin') return true;
      return item.roles.includes(activeRole);
    });

    return items;
  }, [allMenuItems, authTier, tenantId, availableViews, isDriverMode, currentUser?.role]);

  const menuItemsMap = useMemo(() => {
    const map = new Map<ActiveTab, MenuItemDef>();
    filteredMenuItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [filteredMenuItems]);

  const handleToggleDriverView = () => {
    const nextState = !isDriverMode;
    toggleDriverMode();
    if (nextState && activeTab !== 'operations' && activeTab !== 'transporters') {
      setActiveTab('operations');
    }
  };

  const handleNavigate = (item: MenuItemDef) => {
    if (item.path) {
      if (item.path === '/admin') {
        window.location.href = '/admin';
        return;
      }
      window.history.pushState({}, '', item.path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    setActiveTab(item.id);
    if (onCloseMobile) onCloseMobile();
  };

  const renderIconNode = (icon: any, className: string) => {
    if (typeof icon === 'string') {
      return (
        <span className={`text-sm inline-flex items-center justify-center leading-none ${className}`}>
          {icon}
        </span>
      );
    }
    const IconComp = icon;
    return (
      <HoverIcon className={className}>
        <IconComp className="h-full w-full" />
      </HoverIcon>
    );
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpenMobile && (
        <div
          className="erp-drawer-backdrop fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar-navigation"
        className={`erp-sidebar-drawer fixed inset-y-0 start-0 z-40 flex h-full h-dvh flex-col justify-between border-e border-slate-800 bg-[#0B132B] text-slate-100 shadow-2xl transition-all duration-300 ease-in-out md:static md:z-auto md:h-[calc(100dvh-4.5rem)] ${
          isCollapsed ? 'md:w-16' : 'md:w-64'
        } ${
          isOpenMobile
            ? 'w-72 sm:w-80 max-w-[85vw] translate-x-0'
            : isAr
            ? 'hidden md:flex translate-x-full md:translate-x-0'
            : 'hidden md:flex -translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex h-full flex-col justify-between p-2.5">
          {/* Main Top Scrolling Container */}
          <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar">
            {/* Header: Title & Action Buttons (Mobile Close & Desktop Collapse Rail) */}
            <div
              className={`flex items-center border-b border-slate-800 pb-2 ${
                isCollapsed ? 'justify-center' : 'justify-between px-1'
              }`}
            >
              {!isCollapsed && (
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className="text-[10px] font-black tracking-[0.16em] text-slate-400 uppercase truncate">
                    {isDriverMode
                      ? isAr
                        ? 'القائمة الميدانية'
                        : 'Field Mode'
                      : isAr
                      ? 'بوابة الملاحة الرئيسية'
                      : 'Navigation'}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1">
                {/* Mobile Drawer Close Button */}
                {onCloseMobile && (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    className="group flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/80 text-slate-300 hover:border-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-xs md:hidden cursor-pointer"
                    title={isAr ? 'إغلاق القائمة' : 'Close Menu'}
                  >
                    <HoverIcon className="h-4 w-4">
                      <X className="h-full w-full" />
                    </HoverIcon>
                  </button>
                )}

                {/* Desktop Sidebar Collapse Rail Button */}
                <button
                  type="button"
                  id="sidebar-collapse-toggle-btn"
                  onClick={toggleCollapsed}
                  className="group hidden md:flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/80 text-slate-300 hover:border-orange-500 hover:bg-orange-500 hover:text-white transition-all shadow-xs cursor-pointer"
                  title={
                    isCollapsed
                      ? isAr
                        ? 'توسيع القائمة الجانبية (w-64)'
                        : 'Expand Sidebar (w-64)'
                      : isAr
                      ? 'تصغير القائمة الجانبية (w-16)'
                      : 'Collapse Sidebar (w-16)'
                  }
                >
                  <HoverIcon className="h-4 w-4">
                    {isCollapsed ? (
                      isAr ? (
                        <ChevronLeft className="h-full w-full" />
                      ) : (
                        <ChevronRight className="h-full w-full" />
                      )
                    ) : isAr ? (
                      <ChevronRight className="h-full w-full" />
                    ) : (
                      <ChevronLeft className="h-full w-full" />
                    )}
                  </HoverIcon>
                </button>
              </div>
            </div>

            {/* Driver View Banner */}
            {!isCollapsed ? (
              <div
                className={`rounded-xl border p-2.5 transition-all ${
                  isDriverMode
                    ? 'border-orange-400/50 bg-gradient-to-r from-orange-500/20 to-amber-500/10 shadow-xs'
                    : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-md ${
                        isDriverMode ? 'bg-[#F05627] text-white shadow-xs' : 'bg-slate-800 text-blue-300'
                      }`}
                    >
                      <Truck className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="block text-[11px] font-black text-white">
                        {isAr ? 'وضع السائقين' : 'Driver View'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    id="driver-view-mode-toggle"
                    onClick={handleToggleDriverView}
                    className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isDriverMode ? 'bg-[#F05627]' : 'bg-slate-600'
                    }`}
                    aria-pressed={isDriverMode}
                    title={isAr ? 'تبديل وضع السائقين المبسط' : 'Toggle Driver View Mode'}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        isDriverMode ? (isAr ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleToggleDriverView}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
                    isDriverMode
                      ? 'border-orange-400 bg-[#F05627] text-white shadow-sm'
                      : 'border-slate-700 bg-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                  title={isAr ? 'تبديل وضع السائقين' : 'Driver Mode'}
                >
                  <Truck className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Accordion Categories or Collapsed Rail Icons */}
            {!isCollapsed ? (
              <div className="space-y-2">
                {categories.map((cat) => {
                  const catItems = cat.itemIds
                    .map((id) => menuItemsMap.get(id))
                    .filter((item): item is MenuItemDef => Boolean(item));

                  if (catItems.length === 0) return null;

                  const isCatExpanded = Boolean(expandedCategories[cat.id]);
                  const hasActiveChild = cat.itemIds.includes(activeTab);
                  const CatIcon = cat.icon;

                  return (
                    <div
                      key={cat.id}
                      className="rounded-xl border border-slate-800/80 bg-slate-900/30 overflow-hidden"
                    >
                      {/* Accordion Section Header with Classic Enterprise Icon Badge */}
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={`group flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-bold transition-all ${
                          hasActiveChild
                            ? 'bg-slate-800/80 text-orange-400'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`flex h-5 w-5 items-center justify-center rounded border shadow-2xs ${
                            cat.id === 'core'
                              ? 'neo-icon-core'
                              : cat.id === 'procurement'
                              ? 'neo-icon-procurement'
                              : cat.id === 'logistics'
                              ? 'neo-icon-logistics'
                              : cat.id === 'finance'
                              ? 'neo-icon-finance'
                              : cat.id === 'hr'
                              ? 'neo-icon-hr'
                              : 'neo-icon-governance'
                          }`}>
                            <HoverIcon className="h-3 w-3">
                              <CatIcon className="h-full w-full" />
                            </HoverIcon>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-wider">
                            {isAr ? cat.labelAr : cat.labelEn}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {hasActiveChild && (
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                          )}
                          {isCatExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                          )}
                        </div>
                      </button>

                      {/* Accordion Children Items */}
                      {isCatExpanded && (
                        <div className="p-1 space-y-0.5 border-t border-slate-800/60 bg-slate-950/20">
                          {catItems.map((item) => {
                            const isAllowed = item.roles.includes(currentUser?.role ?? 'Guest');
                            const isActive = activeTab === item.id;
                            const catIconClass =
                              cat.id === 'core'
                                ? 'neo-icon-core'
                                : cat.id === 'procurement'
                                ? 'neo-icon-procurement'
                                : cat.id === 'logistics'
                                ? 'neo-icon-logistics'
                                : cat.id === 'finance'
                                ? 'neo-icon-finance'
                                : cat.id === 'hr'
                                ? 'neo-icon-hr'
                                : 'neo-icon-governance';

                            if (!isAllowed) {
                              return null;
                            }

                            return (
                              <button
                                key={item.id}
                                onClick={() => handleNavigate(item)}
                                className={`group flex w-full items-center justify-between rounded px-2 py-1 text-xs font-semibold transition-all cursor-pointer ${
                                  isActive
                                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-xs'
                                    : item.highlight
                                    ? 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
                                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <div className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border shadow-2xs ${
                                    isActive ? 'bg-white/20 border-white/40 text-white' : item.highlight ? 'bg-amber-400/20 border-amber-400/40 text-amber-300' : catIconClass
                                  }`}>
                                    {renderIconNode(
                                      item.icon,
                                      'h-2.5 w-2.5'
                                    )}
                                  </div>
                                  <span className="truncate text-[10.5px]">
                                    {isAr ? item.labelAr : item.labelEn}
                                  </span>
                                </div>

                                {item.badge && (
                                  <span
                                    className={`shrink-0 rounded px-1.5 py-0.2 text-[8.5px] font-black ${
                                      isActive
                                        ? 'bg-white/20 text-white'
                                        : item.highlight && kpis.pendingApprovalsCount > 0
                                        ? 'bg-amber-500 text-white animate-pulse'
                                        : 'bg-slate-800 text-orange-300 border border-orange-500/20'
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Compact Rail Mode (w-16) with Classic Color-Coded Module Icons */
              <div className="space-y-2 py-0.5 flex flex-col items-center">
                {categories.map((cat) => {
                  const catItems = cat.itemIds
                    .map((id) => menuItemsMap.get(id))
                    .filter((item): item is MenuItemDef => Boolean(item));

                  if (catItems.length === 0) return null;

                  const railCatIconClass =
                    cat.id === 'core'
                      ? 'neo-icon-core'
                      : cat.id === 'procurement'
                      ? 'neo-icon-procurement'
                      : cat.id === 'logistics'
                      ? 'neo-icon-logistics'
                      : cat.id === 'finance'
                      ? 'neo-icon-finance'
                      : cat.id === 'hr'
                      ? 'neo-icon-hr'
                      : 'neo-icon-governance';

                  return (
                    <div key={cat.id} className="w-full space-y-1 pb-1 border-b border-slate-800/80">
                      {catItems.map((item) => {
                        const isAllowed = item.roles.includes(currentUser?.role ?? 'Guest');
                        const isActive = activeTab === item.id;
                        const label = isAr ? item.labelAr : item.labelEn;

                        if (!isAllowed) {
                          return null;
                        }

                        return (
                          <button
                            key={item.id}
                            onClick={() => handleNavigate(item)}
                            title={`${label}${item.badge ? ` [${item.badge}]` : ''}`}
                            className={`group relative flex h-7.5 w-7.5 mx-auto items-center justify-center rounded border transition-all cursor-pointer ${
                              isActive
                                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md border-orange-400'
                                : `${railCatIconClass} hover:opacity-90`
                            }`}
                          >
                            {renderIconNode(
                              item.icon,
                              `h-3 w-3 ${isActive ? 'text-white' : ''}`
                            )}
                            {item.badge && !isActive && (
                              <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar Footer: Telemetry & User Card */}
          <div className="pt-2 border-t border-slate-800 space-y-2 shrink-0">
            {/* Telemetry Indicator */}
            {!isCollapsed ? (
              <div
                id="sidebar-telemetry-panel"
                className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-2 text-emerald-300 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="font-mono font-bold">{isolationTelemetry?.cloudLatencyMs ?? 12}ms</span>
                    <span className="opacity-40">|</span>
                    <span className="text-[10px] font-semibold">{isAr ? 'مزامنة' : 'Sync'}</span>
                  </div>
                  <span className="font-mono text-[9px] text-emerald-400/70">
                    {isAr ? 'معزول' : 'Isolated'}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="flex justify-center"
                title={`${isAr ? 'مزامنة فورية' : 'Live Sync'}: ${isolationTelemetry?.cloudLatencyMs ?? 12}ms`}
              >
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
              </div>
            )}

            {/* User Profile */}
            {!isCollapsed ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
                <div className="flex items-center gap-2">
                  <UserAvatar
                    user={currentUser}
                    sizeClassName="h-7 w-7 text-[10px]"
                    className="rounded-lg"
                  />
                  <div className="overflow-hidden">
                    <p className="truncate text-xs font-bold text-white">
                      {currentUser?.fullNameAr || currentUser?.fullName || 'User'}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-orange-300 font-semibold truncate">
                        {currentUser?.role || 'Operator'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex justify-center"
                title={`${currentUser?.fullName || 'User'} (${currentUser?.role || 'Operator'})`}
              >
                <UserAvatar
                  user={currentUser}
                  sizeClassName="h-8 w-8 text-xs"
                  className="rounded-xl"
                />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
