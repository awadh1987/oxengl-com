import React from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Clock,
  ShoppingCart,
  Boxes,
  BookOpen,
  Truck,
  Scale,
  ShieldCheck,
  Settings,
  Users,
  Layers,
  ChevronRight,
  LogOut,
  Building,
  Network,
  X,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';

export type NavigationTab =
  | 'dashboard'
  | 'approvals'
  | 'procurement'
  | 'inventory'
  | 'hr'
  | 'vouchers'
  | 'finance-chart'
  | 'operations'
  | 'maintenance'
  | 'master-data'
  | 'tenant-settings'
  | 'mfa-security';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { currentUser, language, canAccessFinancials, kpis, setLanguage } = useApp();
  const isAr = language === 'ar';

  const userRole = currentUser?.role || 'Admin';

  const navItems = [
    {
      id: 'dashboard',
      labelAr: 'لوحة القيادة والمؤشرات',
      labelEn: 'Executive Dashboard',
      icon: LayoutDashboard,
      allowedRoles: ['Super_Admin', 'Admin', 'COO', 'Accountant', 'Data_Entry', 'Guest'],
    },
    {
      id: 'approvals',
      labelAr: 'مصفوفة الموافقات',
      labelEn: 'Approval Matrix Queue',
      icon: Clock,
      badge: 3,
      allowedRoles: ['Super_Admin', 'Admin', 'COO', 'Accountant'],
    },
    {
      id: 'procurement',
      labelAr: 'المشتريات وسلسلة التوريد',
      labelEn: 'Procurement & S2P',
      icon: ShoppingCart,
      allowedRoles: ['Super_Admin', 'Admin', 'COO', 'Accountant', 'Data_Entry'],
    },
    {
      id: 'inventory',
      labelAr: 'المخزون والمستودعات',
      labelEn: 'Inventory & Dual-UOM',
      icon: Boxes,
      allowedRoles: ['Super_Admin', 'Admin', 'COO', 'Accountant', 'Data_Entry'],
    },
    {
      id: 'hr',
      labelAr: 'الموارد البشرية والرواتب',
      labelEn: 'Human Resources & WPS',
      icon: Users,
      allowedRoles: ['Super_Admin', 'Admin', 'COO', 'Accountant'],
    },
    {
      id: 'vouchers',
      labelAr: 'الأستاذ العام والمحاسبة',
      labelEn: 'General Ledger & Financials',
      icon: BookOpen,
      allowedRoles: ['Super_Admin', 'Admin', 'COO', 'Accountant'],
    },
    {
      id: 'finance-chart',
      labelAr: 'دليل الحسابات الشجري',
      labelEn: 'Chart of Accounts Tree',
      icon: Network,
      allowedRoles: ['Super_Admin', 'Admin', 'COO', 'Accountant'],
    },
    {
      id: 'operations',
      labelAr: 'العمليات والميزان',
      labelEn: 'Weighbridge & Yard Operations',
      icon: Scale,
      allowedRoles: ['Super_Admin', 'Admin', 'COO', 'Data_Entry'],
    },
    {
      id: 'maintenance',
      labelAr: 'صيانة الأسطول والشاحنات',
      labelEn: 'Fleet Maintenance & GPS',
      icon: Truck,
      allowedRoles: ['Super_Admin', 'Admin', 'COO'],
    },
    {
      id: 'master-data',
      labelAr: 'البيانات الأساسية للشركاء',
      labelEn: 'Master Data & Partners',
      icon: Users,
      allowedRoles: ['Super_Admin', 'Admin', 'COO'],
    },
    {
      id: 'tenant-settings',
      labelAr: 'إعدادات المؤسسة والتخصيص',
      labelEn: 'Organization Settings',
      icon: Settings,
      allowedRoles: ['Super_Admin', 'Admin'],
    },
  ];

  // Filter based on user permissions
  const visibleItems = navItems.filter(item =>
    item.allowedRoles.includes(userRole as any)
  );

  return (
    <>
      {isOpenMobile && (
        <div
          className="erp-drawer-backdrop fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`erp-sidebar-drawer fixed inset-y-0 start-0 z-40 flex w-72 flex-col justify-between border-e border-slate-800 bg-slate-950/95 p-4 backdrop-blur-xl transition-transform duration-300 md:static md:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div>
          {/* Brand Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20">
                <Layers className="h-6 w-6 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white">OxenGL</span>
                <span className="ml-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Phase 1 Enterprise
                </span>
                <p className="text-[11px] text-slate-400">Global ERP Logistics</p>
              </div>
            </div>
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white md:hidden cursor-pointer"
                title={isAr ? 'إغلاق' : 'Close'}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

        {/* User Context Badge */}
        <div className="mx-2 mb-4 rounded-xl bg-slate-900/80 p-3 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <UserAvatar
              user={currentUser}
              sizeClassName="h-8 w-8 text-xs"
              className="rounded-lg"
            />
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">
                {currentUser?.fullName || 'Administrator'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {userRole.replace('_', ' ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white"
          >
            {language === 'ar' ? 'EN' : 'عربي'}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1">
          {visibleItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/10 text-amber-300 border border-amber-500/30 shadow-md shadow-amber-500/5'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 transition-colors ${
                      isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  />
                  <span>{isAr ? item.labelAr : item.labelEn}</span>
                </div>

                {item.badge ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950 shadow-sm">
                    {item.badge}
                  </span>
                ) : (
                  isActive && <ChevronRight className="h-3.5 w-3.5 text-amber-400/60" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Security status */}
      <div className="border-t border-slate-800/80 pt-4 px-2">
        <div className="flex items-center justify-between rounded-xl bg-slate-900/60 p-2.5 border border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-slate-300">ABAC Policy Active</span>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
        </div>
      </div>
    </aside>
  </>
  );
};
