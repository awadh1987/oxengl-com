import React, { useState } from 'react';
import {
  Activity, ArrowRight, Building2, ChevronDown, CreditCard, Crown, ExternalLink, Globe2,
  KeyRound, LayoutDashboard, LogOut, Menu, Radio, Search, Settings, ShieldCheck, X, Server,
  TrendingUp, BarChart3, FileCheck2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { Company } from '../types';
import { LicenseProvisionerView, PanoramicCockpit, PlatformSettingsView, PricingPlansView, SystemAuditView, TenantsRegistryView } from '../components/platform/PlatformModules';
import { MasterControlPanel } from '../components/platform/MasterControlPanel';
import { SuperAdminAnalyticsView } from './SuperAdminAnalyticsView';
import { SuperAdminFinancialHubView } from './SuperAdminFinancialHubView';

type PlatformTab = 'cockpit' | 'financial-hub' | 'tenants' | 'analytics' | 'licenses' | 'pricing' | 'health' | 'settings' | 'master-devops';

interface SuperAdminCockpitViewProps {
  onOpenTenantOnboarding: () => void;
  onLogout: () => void;
  onInspectTenantWorkspace?: () => void;
}

const navigation: { id: PlatformTab; label: string; description: string; badge?: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'cockpit', label: 'Global Mission Cockpit', description: 'Panoramic MRR, volume & telemetry', badge: 'LIVE', icon: LayoutDashboard },
  { id: 'financial-hub', label: 'Financial Hub & Invoicing', description: 'MRR, ARR, PO wire verification & custom limits', badge: 'FINANCE', icon: CreditCard },
  { id: 'master-devops', label: 'DevOps & RLS HUD', description: 'Domain routing, RLS isolation & Cmd+K', badge: 'LIVE', icon: Server },
  { id: 'tenants', label: 'Tenants Registry', description: 'Client accounts & tenant entities', icon: Building2 },
  { id: 'analytics', label: 'Cross-Tenant Velocity', description: 'Transaction density & sparklines', badge: '7-DAY', icon: TrendingUp },
  { id: 'licenses', label: 'License Provisioner', description: 'JWT license key issuer', badge: 'JWT', icon: KeyRound },
  { id: 'pricing', label: 'Pricing & Subscription Plans', description: 'Tiers, quotas & features', icon: CreditCard },
  { id: 'health', label: 'System Isolation & Health', description: 'Tenant table audit & engine metrics', badge: '100%', icon: Activity },
  { id: 'settings', label: 'Platform Master Settings', description: 'Platform branding & announcement', icon: Settings },
];

export const SuperAdminCockpitView: React.FC<SuperAdminCockpitViewProps> = ({ onOpenTenantOnboarding, onLogout, onInspectTenantWorkspace }) => {
  const { companies, currentCompany, setCurrentCompany, currentUser, language, setLanguage } = useApp();
  const isAr = Boolean(
    language === 'ar' ||
    language?.startsWith('ar') ||
    (typeof localStorage !== 'undefined' && (
      localStorage.getItem('oxengl_language') === 'ar' ||
      localStorage.getItem('i18nextLng')?.startsWith('ar')
    )) ||
    (typeof document !== 'undefined' && (
      document.documentElement.lang?.startsWith('ar') ||
      document.documentElement.dir === 'rtl'
    ))
  );
  const [activeTab, setActiveTab] = useState<PlatformTab>('cockpit');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [search, setSearch] = useState('');

  const inspectRef = useOutsideClick<HTMLDivElement>(() => {
    if (inspectOpen) setInspectOpen(false);
  });

  const announcementActive = localStorage.getItem('oxengl_announcement_active') === 'true';
  const announcement = localStorage.getItem('oxengl_announcement') || '';

  const inspect = (company: Company) => {
    setCurrentCompany(company);
    setInspectOpen(false);
    onInspectTenantWorkspace?.();
  };

  const renderModule = () => {
    switch (activeTab) {
      case 'financial-hub': return <div className="h-full overflow-y-auto"><SuperAdminFinancialHubView /></div>;
      case 'master-devops': return <div className="h-full overflow-y-auto"><MasterControlPanel /></div>;
      case 'tenants': return <TenantsRegistryView onInspect={inspect} />;
      case 'analytics': return <div className="h-full overflow-y-auto"><SuperAdminAnalyticsView /></div>;
      case 'licenses': return <LicenseProvisionerView />;
      case 'pricing': return <PricingPlansView />;
      case 'health': return <SystemAuditView />;
      case 'settings': return <PlatformSettingsView />;
      default: return <PanoramicCockpit onNavigate={setActiveTab} />;
    }
  };

  return (
    <div dir="ltr" className="platform-dark flex h-dvh erp-viewport-screen w-full overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased pt-safe pb-safe px-safe">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="erp-drawer-backdrop fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden cursor-pointer"
        />
      )}

      <aside
        className={`erp-sidebar-drawer fixed inset-y-0 left-0 z-50 flex w-80 shrink-0 flex-col justify-between overflow-y-auto border-r border-slate-800 bg-slate-950 p-4 pb-safe pl-safe shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3 border-b border-blue-900/50 px-1 pb-4 pt-1">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 shadow-lg shadow-blue-500/25"><Crown className="h-6 w-6 text-amber-300" /></div>
              <div>
                <div className="flex items-center gap-1.5"><span className="font-mono text-base font-black tracking-tight text-white">OxenGL</span><span className="rounded-md border border-blue-400/30 bg-blue-500/20 px-2 py-0.5 text-[10px] font-black text-blue-300">MASTER</span></div>
                <p className="text-[11px] font-medium text-slate-400">Central Platform Owner Console</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-slate-400 lg:hidden cursor-pointer hover:text-white"><X className="h-4 w-4" /></button>
          </div>

          <div className="space-y-1 rounded-xl border border-blue-500/20 bg-blue-950/40 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Global Master Environment</span>
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            </div>
            <p className="flex items-center gap-1 text-xs font-bold text-slate-200"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Central Super Admin Root</p>
          </div>

          <nav className="space-y-1.5">
            <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Platform Administration Modules</p>
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                  className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all ${active ? 'bg-blue-600 font-black text-white shadow-lg shadow-blue-600/30' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'}`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-blue-400 group-hover:text-blue-300'}`} />
                    <span className="truncate"><span className="block text-xs font-bold leading-tight">{item.label}</span><span className={`block truncate text-[10px] ${active ? 'text-blue-100' : 'text-slate-400'}`}>{item.description}</span></span>
                  </span>
                  {item.badge && <span className={`ml-2 shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black ${active ? 'bg-white/20 text-white' : 'border border-blue-400/20 bg-blue-500/20 text-blue-300'}`}>{item.badge}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <a
            href="/compliance/vault"
            className="group flex w-full items-center justify-between rounded-xl border border-emerald-700/60 bg-emerald-950/60 p-2.5 text-emerald-200 transition-all hover:bg-emerald-900/80"
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <FileCheck2 className="h-3.5 w-3.5" />
              </span>
              <span className="text-left">
                <span className="block text-xs font-bold text-white">Corporate Compliance Vault</span>
                <span className="block text-[10px] text-emerald-300/80">Corporate Profile &amp; Document Vault</span>
              </span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </a>

          <button onClick={onOpenTenantOnboarding} className="group flex w-full items-center justify-between rounded-xl border border-indigo-700/60 bg-indigo-950/70 p-2.5 text-indigo-200 transition-all hover:bg-indigo-900/80">
            <span className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white"><Building2 className="h-3.5 w-3.5" /></span>
              <span className="text-left"><span className="block text-xs font-bold text-white">OxenGL Portal Gateway</span><span className="block text-[10px] text-indigo-300/80">Organizations Directory &amp; Onboarding</span></span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </button>

          <button onClick={() => { const target = currentCompany || companies[0]; if (target) inspect(target); }} className="group flex w-full items-center justify-between rounded-xl border border-amber-700/60 bg-amber-950/60 p-2.5 text-amber-200 transition-all hover:bg-amber-900/70">
            <span className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-[10px] font-black text-slate-950">{(currentCompany?.name || 'T').slice(0, 1).toUpperCase()}</span>
              <span className="text-left"><span className="block text-xs font-bold text-white">Launch Tenant Workspace</span><span className="block text-[10px] text-amber-300/80">Inspect Tenant Experience</span></span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </button>

          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-slate-950">{(currentUser.fullName || 'A').slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0"><span className="block truncate text-xs font-bold text-white">{currentUser.fullName}</span><span className="block text-[10px] text-slate-400">Platform Owner · Super Admin</span></span>
            </span>
            <button onClick={onLogout} title="Logout" className="shrink-0 text-slate-400 hover:text-rose-400"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-950 text-slate-100">
        <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-4 shadow-xs sm:px-6 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-300 lg:hidden cursor-pointer hover:bg-slate-900 transition-colors"><Menu className="h-4 w-4" /></button>
            <span className="flex shrink-0 items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="font-mono text-xs font-black uppercase tracking-wider text-orange-400">OxenGL • Master Root</span>
            </span>
            <span className="hidden h-4 w-px bg-slate-800 lg:block" />
            <label className="relative hidden w-72 lg:block xl:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isAr ? 'بحث بالمنشأة، الرخصة، أو السجل...' : 'Search tenants, licenses, audit logs...'} className="w-full rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-500 focus:border-orange-500/50 focus:bg-slate-900" />
            </label>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div ref={inspectRef} className="relative">
              <button onClick={() => setInspectOpen(!inspectOpen)} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-200 transition-all hover:bg-slate-900">
                <Building2 className="h-4 w-4 text-orange-400" /><span className="hidden sm:inline">Inspect Tenant:</span>
                <span className="max-w-28 sm:max-w-32 truncate rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-slate-300">{currentCompany?.slug || 'Central Master'}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {inspectOpen && (
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-2xl backdrop-blur-xl">
                  <p className="border-b border-slate-800 p-2 text-[11px] font-bold uppercase text-slate-400">Select Tenant Workspace to Inspect</p>
                  <div className="space-y-1 py-1 max-h-64 overflow-y-auto">
                    {companies.map((company) => (
                      <button key={company.id} onClick={() => inspect(company)} className="flex w-full items-center justify-between rounded-lg p-2 text-left text-xs font-bold text-slate-200 transition-colors hover:bg-slate-800">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-orange-600 text-[10px] font-black text-white">{company.name.slice(0, 1).toUpperCase()}</span>
                          <span className="min-w-0"><span className="block truncate">{company.name}</span><span className="block font-mono text-[10px] text-slate-400">{company.slug} · {company.subscriptionTier || 'PRO'}</span></span>
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')} className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-300 transition-all hover:bg-slate-900 hover:text-white"><Globe2 className="h-3.5 w-3.5 text-slate-400" />{language === 'ar' ? 'English' : 'عربي'}</button>
            <button onClick={onLogout} className="flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-500/20"><LogOut className="h-3.5 w-3.5" /><span className="hidden sm:inline">Logout</span></button>
          </div>
        </header>

        {announcementActive && announcement && (
          <div className="flex shrink-0 items-center justify-between gap-3 bg-amber-500 px-6 py-2 text-xs font-bold text-slate-950 shadow-xs">
            <span className="flex min-w-0 items-center gap-2"><Radio className="h-4 w-4 shrink-0 animate-pulse text-amber-900" /><span className="font-black uppercase">Platform Broadcast:</span><span className="truncate">{announcement}</span></span>
            <span className="shrink-0 rounded bg-amber-900 px-2 py-0.5 font-mono text-[10px] text-amber-100">GLOBAL BROADCAST</span>
          </div>
        )}

        <main className="w-full flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 text-slate-100">
          <div className="w-full max-w-7xl mx-auto">{renderModule()}</div>
        </main>

        <footer className="flex shrink-0 flex-col items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/90 px-6 py-2.5 text-xs text-slate-400 sm:flex-row pb-safe">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-300">OxenGL Global Cloud ERP Core</span><span className="text-slate-600">•</span>
            <span className="font-mono text-[11px] text-slate-500">Build: 2026.09-ENTERPRISE-PRO</span><span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Multi-Tenant Schema Level 3 Isolation</span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">Central Platform Ops • All Rights Reserved © 2026</span>
        </footer>
      </div>
    </div>
  );
};
