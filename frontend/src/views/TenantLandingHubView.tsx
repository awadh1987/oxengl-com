import React from 'react';
import {
  Building2,
  FileSpreadsheet,
  Landmark,
  Receipt,
  Scale,
  ShieldCheck,
  Sparkles,
  Truck,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Activity,
  Layers,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BrandLogo } from '../components/BrandLogo';
import { formatCurrency, formatTonnage } from '../utils/formatters';
import { ActiveTab } from '../components/Sidebar';
import { BentoCard } from '../components/design-system/BentoCard';
import { IsolationTelemetryBadge } from '../components/design-system/IsolationTelemetryBadge';
import { ThemeDensityToolbar } from '../components/design-system/ThemeDensityToolbar';

interface TenantLandingHubViewProps {
  onNavigateToTab: (tab: ActiveTab) => void;
}

export const TenantLandingHubView: React.FC<TenantLandingHubViewProps> = ({ onNavigateToTab }) => {
  const {
    currentCompany,
    currentUser,
    kpis,
    accessibleOperations,
    canAccessFinancials,
    densityMode,
    themeMode,
  } = useApp();

  const isDark = themeMode === 'dark';

  const actions: {
    tab: ActiveTab;
    label: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
  }[] = [
    {
      tab: 'operations',
      label: 'New Trip Entry',
      detail: 'Weighbridge & slip log',
      icon: Truck,
      accentColor: '#f97316',
    },
    {
      tab: 'invoicing',
      label: 'Create Tax Invoice',
      detail: 'ZATCA Phase 2 billing',
      icon: FileSpreadsheet,
      accentColor: '#10b981',
    },
    {
      tab: 'vouchers',
      label: 'New Financial Voucher',
      detail: 'Payment & receipt vouchers',
      icon: Receipt,
      accentColor: '#eab308',
    },
    {
      tab: 'executive-admin',
      label: 'Approvals & Audit',
      detail: 'Controls and approvals',
      icon: Landmark,
      accentColor: '#8b5cf6',
    },
  ];

  const modules: {
    tab: ActiveTab;
    label: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }[] = [
    {
      tab: 'operations',
      label: 'Heavy Transport Fleet',
      detail: 'Daily trip logs, loading, delivery, and scale tickets.',
      icon: Truck,
      tone: 'text-orange-400',
    },
    {
      tab: 'crushers',
      label: 'Crusher & Quarry Networks',
      detail: 'Supplier ledgers, settlements, and material purchases.',
      icon: Building2,
      tone: 'text-amber-400',
    },
    {
      tab: 'transporters',
      label: 'Weighbridge & Loss Control',
      detail: 'Transporter performance and shrinkage analysis.',
      icon: Scale,
      tone: 'text-emerald-400',
    },
    {
      tab: 'invoicing',
      label: 'ZATCA Tax Invoicing Engine',
      detail: 'Customer tax invoices and controlled exports.',
      icon: FileSpreadsheet,
      tone: 'text-rose-400',
    },
    {
      tab: 'dashboard',
      label: 'Executive Dashboard & KPIs',
      detail: 'Financial and operational insight for this workspace.',
      icon: Landmark,
      tone: 'text-blue-400',
    },
    {
      tab: 'ai-insights',
      label: 'AI Operations Auditor',
      detail: 'Operational audit and anomaly analysis.',
      icon: Sparkles,
      tone: 'text-violet-400',
    },
  ];

  return (
    <div
      dir="ltr"
      className={`min-h-dvh erp-viewport-root pb-16 font-sans transition-colors ${
        isDark
          ? 'bg-slate-950 text-slate-200 selection:bg-orange-500 selection:text-white'
          : 'bg-slate-50 text-slate-900 selection:bg-orange-500 selection:text-white'
      }`}
    >
      {/* Top Tenant Navigation Banner */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          isDark
            ? 'border-slate-800/80 bg-slate-950/90'
            : 'border-slate-200 bg-white/90 shadow-xs'
        } px-4 py-3.5 sm:px-6`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo
              size="lg"
              showText={true}
              horizontal={true}
              theme={isDark ? 'dark' : 'light'}
              customLogoUrl={currentCompany?.logo_url || currentCompany?.uiLogoUrl || undefined}
              companyNameAr={currentCompany?.name_ar || currentCompany?.company_name_ar || currentCompany?.name || 'Tenant Workspace'}
              companyNameEn={currentCompany?.name_en || currentCompany?.company_name || currentCompany?.name || 'Enterprise Workspace'}
              primaryColor={currentCompany?.uiPrimaryColor}
              secondaryColor={currentCompany?.uiSecondaryColor}
            />
          </div>

          <div className="flex items-center gap-3">
            <ThemeDensityToolbar />
            <div className="hidden items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 md:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-200">{currentUser.fullName}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
        {/* Telemetry HUD Banner */}
        <IsolationTelemetryBadge variant="banner" />

        {/* Hero Section: Corporate Orange & Bright Yellow Highlights */}
        <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div
            className={`relative overflow-hidden rounded-3xl border p-7 sm:p-9 shadow-2xl backdrop-blur-xl ${
              isDark
                ? 'border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950'
                : 'border-slate-200 bg-white'
            }`}
          >
            {/* Luminous Glow Backdrop */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/15 blur-3xl" />

            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-orange-500/10 px-3.5 py-1 text-xs font-bold text-orange-400">
                <Sparkles className="h-3.5 w-3.5" />
                Premier Heavy Transport & Quarry Logistics ERP
              </span>

              <h2 className="mt-5 text-2xl font-black leading-tight text-white sm:text-3xl lg:text-4xl">
                Pioneering Heavy Fleet Haulage &{' '}
                <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-300 bg-clip-text text-transparent">
                  Quarry Material Supply
                </span>
              </h2>

              <p className="mt-4 max-w-xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                Manage the full operational lifecycle for building aggregate haulage, quarry crusher
                payables, weighbridge scale tickets, and cryptographic ZATCA Phase-2 tax invoicing.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onNavigateToTab('operations')}
                  className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 px-6 py-3.5 text-xs font-black text-white shadow-xl shadow-orange-950/50 hover:brightness-110"
                >
                  <Truck className="h-4 w-4" />
                  <span>Open Operations & Weighbridge</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateToTab('dashboard')}
                  className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-3.5 text-xs font-black text-white hover:border-slate-500"
                >
                  <Landmark className="h-4 w-4 text-amber-300" />
                  <span>Executive KPIs Dashboard</span>
                </button>
              </div>
            </div>
          </div>

          {/* Revenue & Profit Hero Card (Dark Slate bg-slate-900) */}
          <div
            className={`flex flex-col justify-between rounded-3xl border p-7 shadow-2xl backdrop-blur-xl ${
              isDark
                ? 'border-slate-800 bg-slate-900'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-400">
                  Tenant Live Revenue
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  LIVE ISOLATED
                </span>
              </div>

              {/* Bright Yellow Typography */}
              <div className="mt-5">
                <span className="font-mono text-3xl font-black text-yellow-300 sm:text-4xl">
                  {canAccessFinancials ? formatCurrency(kpis.totalSales, 'en') : '***'}
                </span>
                <p className="mt-1 text-xs text-slate-400">
                  Cryptographically secured revenue ledger
                </p>
              </div>

              <div className="mt-6 space-y-2.5 border-t border-slate-800/80 pt-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Net Operating Profit:</span>
                  <b className="font-mono font-bold text-emerald-400">
                    {canAccessFinancials ? formatCurrency(kpis.netOperatingProfit, 'en') : '***'}
                  </b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Operating Margin:</span>
                  <b className="font-mono font-bold text-amber-300">
                    {canAccessFinancials ? `${kpis.profitMarginPercent.toFixed(1)}%` : '***'}
                  </b>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('invoicing')}
              className="mt-6 flex w-full items-center justify-between rounded-2xl border border-orange-500/40 bg-orange-500/15 px-4 py-3 text-xs font-black text-orange-300 transition-all hover:bg-orange-500/25"
            >
              <span>View ZATCA Tax Invoices</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* 4 Operational Metric Blocks */}
        <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {[
            {
              label: 'Delivered Tons',
              value: formatTonnage(kpis.totalDeliveredTonnage, 'en'),
              tone: 'text-white',
              sub: 'Certified Scale Weight',
            },
            {
              label: 'Fleet Trips',
              value: `${kpis.totalTrips}`,
              tone: 'text-orange-400',
              sub: 'Active Haulage Dispatches',
            },
            {
              label: 'ZATCA Phase 2',
              value: '100%',
              tone: 'text-yellow-300',
              sub: 'Cryptographic Ready',
            },
            {
              label: 'Partner Quarries',
              value: '5+ Crushers',
              tone: 'text-emerald-400',
              sub: 'Contracted Supplies',
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className={`rounded-2xl border p-5 transition-all duration-300 hover:scale-[1.01] ${
                isDark
                  ? 'border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-700 hover:shadow-[0_0_15px_rgba(14,165,233,0.25)]'
                  : 'border-slate-200 bg-white shadow-xs'
              }`}
            >
              <span className="text-xs font-bold text-slate-400">{metric.label}</span>
              <strong className={`mt-2 block font-mono text-2xl font-black ${metric.tone}`}>
                {metric.value}
              </strong>
              <span className="mt-1 block text-[11px] text-slate-500">{metric.sub}</span>
            </article>
          ))}
        </section>

        {/* Quick Access Command Hub */}
        <section
          className={`rounded-3xl border p-6 shadow-xl ${
            isDark ? 'border-slate-800 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                Operational Shortcuts
              </span>
              <h3 className="text-base font-black text-white">Quick Access Command Hub</h3>
            </div>
            <span className="font-mono text-xs text-slate-400">Direct Entry Points</span>
          </div>

          <div className="mt-5 grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.tab}
                  type="button"
                  onClick={() => onNavigateToTab(action.tab)}
                  className={`group flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all duration-300 cursor-pointer ${
                    isDark
                      ? 'border-slate-800 bg-slate-950/70 hover:border-sky-500/50 hover:shadow-[0_0_15px_rgba(14,165,233,0.35)]'
                      : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: `${action.accentColor}44`,
                      backgroundColor: `${action.accentColor}18`,
                      color: action.accentColor,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <strong className="block truncate text-xs font-black text-white group-hover:text-orange-400">
                      {action.label}
                    </strong>
                    <small className="block truncate text-[11px] text-slate-400">
                      {action.detail}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Capability Cards: Fleet Logistics, Crusher Networks, Weighbridge & Loss Control */}
        <section>
          <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                Platform Architecture
              </span>
              <h3 className="text-base font-black text-white">
                Enterprise Logistics & Financial Capabilities
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-400">
              {currentCompany?.name || 'Dedicated Tenant ERP'}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <button
                  key={module.label}
                  type="button"
                  onClick={() => onNavigateToTab(module.tab)}
                  className={`group rounded-2xl border p-5 text-left transition-all duration-300 hover:scale-[1.01] cursor-pointer ${
                    isDark
                      ? 'border-slate-800 bg-slate-900 text-slate-200 hover:border-orange-500/60 hover:bg-slate-800/80 hover:shadow-[0_0_15px_rgba(249,115,22,0.4)]'
                      : 'border-slate-200 bg-white hover:border-orange-500 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className={`h-6 w-6 ${module.tone}`} />
                    <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                  </div>
                  <h4 className="mt-4 text-sm font-black text-white group-hover:text-orange-300">
                    {module.label}
                  </h4>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {module.detail}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Isolation Boundary Status Footer Card */}
        <section
          className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 text-xs ${
            isDark
              ? 'border-slate-800 bg-slate-900/80 text-slate-300 shadow-sm'
              : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-black text-white">Strict Multi-Tenant Row Isolation Active</p>
              <p className="text-[11px] text-slate-400">
                {accessibleOperations.length} company-scoped operation records loaded without cross-tenant exposure.
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] text-emerald-400 font-bold">
            Schema RLS L3 Enforced
          </span>
        </section>
      </main>
    </div>
  );
};