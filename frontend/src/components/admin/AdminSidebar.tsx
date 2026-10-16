import React from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Globe,
  LayoutDashboard,
  LogOut,
  Palette,
  Sliders,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BrandWordmark } from '../../views/landing/BrandWordmark';

export interface AdminNavItem {
  id: string;
  path: string;
  label: string;
  labelAr: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: 'cockpit',
    path: '/admin',
    label: 'Mission Cockpit',
    labelAr: 'لوحة القيادة المركزية',
    description: 'Panoramic MRR, volume & telemetry',
    icon: LayoutDashboard,
  },
  {
    id: 'billing-gateways',
    path: '/admin/billing-gateways',
    label: 'Payment & Billing Gateways',
    labelAr: 'بوابات الدفع والفوترة',
    description: 'Manual wallets, bank accounts, Stripe & Moyasar',
    badge: 'PAY',
    icon: CreditCard,
  },
  {
    id: 'platform-portal',
    path: '/admin/platform',
    label: 'Platform Admin Portal',
    labelAr: 'بوابة تحكم المنصة والقياس',
    description: 'Cross-tenant telemetry & approvals',
    badge: 'PORTAL',
    icon: Globe,
  },
  {
    id: 'tenants',
    path: '/admin/tenants',
    label: 'Tenants Registry',
    labelAr: 'سجل المستأجرين',
    description: 'Client organizations & provisioning',
    icon: Building2,
  },
  {
    id: 'landing-editor',
    path: '/admin/landing-editor',
    label: 'Landing CMS Studio',
    labelAr: 'محرر الصفحة الرئيسية CMS',
    description: 'Dynamic schema-driven landing engine',
    badge: 'CMS',
    icon: Sparkles,
  },
  {
    id: 'settings-master',
    path: '/admin/settings/master',
    label: 'Master Settings',
    labelAr: 'إعدادات المنظومة الموحدة',
    description: 'Unified branding, broadcasts & policies',
    icon: Sliders,
  },
  {
    id: 'logs',
    path: '/admin/logs',
    label: 'Platform Audit Logs',
    labelAr: 'سجلات تدقيق المنظومة',
    description: 'Security & compliance event stream',
    icon: FileCheck2,
  },
  {
    id: 'analytics',
    path: '/admin/analytics',
    label: 'Cross-Tenant Analytics',
    labelAr: 'تحليلات الأداء الشاملة',
    description: 'Aggregated velocity & transaction metrics',
    icon: TrendingUp,
  },
];

interface AdminSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentPath,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onLogout,
}) => {
  const { language } = useApp();
  const isAr = language === 'ar';

  const isActive = (itemPath: string) => {
    if (itemPath === '/admin') {
      return currentPath === '/admin' || currentPath === '/admin/cockpit';
    }
    return currentPath.startsWith(itemPath);
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between overflow-y-auto overflow-x-hidden bg-slate-950 text-slate-100 border-e border-slate-800/80 transition-all duration-300 select-none">
      {/* Top Header / Branding */}
      <div>
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-800/80">
          {!collapsed ? (
            <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => onNavigate('/admin')}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 shadow-lg shadow-orange-500/20 text-white font-black text-sm">
                OX
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold tracking-tight text-white text-sm">OxenGL</span>
                  <span className="rounded bg-orange-500/20 px-1 py-0.2 text-[9px] font-black uppercase text-orange-400">
                    Control Plane
                  </span>
                </div>
                <p className="truncate text-[10px] text-slate-400">Root Governance v4.8</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white font-black text-sm cursor-pointer" onClick={() => onNavigate('/admin')}>
              OX
            </div>
          )}

          {/* Mobile close button */}
          <button
            onClick={onCloseMobile}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden cursor-pointer"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-1.5">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.path);
                  onCloseMobile();
                }}
                title={collapsed ? (isAr ? item.labelAr : item.label) : undefined}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 text-start cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-orange-500/20 to-orange-500/10 text-orange-400 border border-orange-500/30 shadow-sm shadow-orange-500/10'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${
                    active
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                      : 'bg-slate-800/80 text-slate-400 group-hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                {!collapsed && (
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <div className="truncate">
                      <div className="truncate font-semibold">{isAr ? item.labelAr : item.label}</div>
                      <div className="truncate text-[10px] text-slate-500 font-normal">{item.description}</div>
                    </div>
                    {item.badge && (
                      <span className="ms-2 rounded-full bg-orange-500/20 px-2 py-0.5 text-[9px] font-black tracking-wider text-orange-400">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Actions */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        {/* View Public Landing */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? 'View Public Site' : undefined}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
            <ExternalLink className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-1 items-center justify-between min-w-0">
              <span className="truncate">{isAr ? 'عرض الواجهة العامة' : 'View Public Landing'}</span>
              <span className="text-[10px] text-slate-500">oxengl.me</span>
            </div>
          )}
        </a>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
        >
          {collapsed ? <ChevronRight className={`h-4 w-4 ${isAr ? 'rotate-180' : ''}`} /> : <ChevronLeft className={`h-4 w-4 ${isAr ? 'rotate-180' : ''}`} />}
          {!collapsed && <span className="text-[11px] font-medium">{isAr ? 'طي القائمة' : 'Collapse Sidebar'}</span>}
        </button>

        {/* Logout */}
        <button
          onClick={onLogout}
          title={collapsed ? 'Sign Out' : undefined}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
            <LogOut className="h-4 w-4" />
          </div>
          {!collapsed && <span className="truncate">{isAr ? 'تسجيل الخروج' : 'Sign Out Control Plane'}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-300 h-full ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
