import React, { useState, useEffect } from 'react';
import {
  Building2,
  Server,
  Layers,
  Globe,
  Settings,
  Shield,
  Truck,
  FileText,
  Radio,
  ChevronDown,
  LogOut,
  ExternalLink,
  FileCheck2,
} from 'lucide-react';
import { MasterControlPanel } from './MasterControlPanel';
import { TenantSettingsPanel } from './TenantSettingsPanel';
import { CustomDomainWizard } from './CustomDomainWizard';

interface TenantContext {
  id: string;
  slug: string;
  name: string;
  customDomain?: string | null;
  tier: 'starter' | 'standard' | 'growth' | 'enterprise';
  isActive: boolean;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    themeMode: 'LIGHT' | 'DARK' | 'CUSTOM';
    logoUrl?: string | null;
  };
  rlsSchema: string;
}

interface DynamicTenantShellProps {
  children?: React.ReactNode;
}

export const DynamicTenantShell: React.FC<DynamicTenantShellProps> = ({ children }) => {
  const [plane, setPlane] = useState<'master' | 'tenant' | 'root' | 'unknown'>('tenant');
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'operations' | 'settings' | 'domains'>('dashboard');

  // Simulated host switcher for local testing and demoing
  const [activeHost, setActiveHost] = useState<string>('horizon-logistics.oxengl.me');

  useEffect(() => {
    resolvePlaneAndTenant(activeHost);
  }, [activeHost]);

  const resolvePlaneAndTenant = async (hostOverride?: string) => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (hostOverride) {
        // We pass host in custom header or query for resolution simulation
        headers['Host'] = hostOverride;
      }
      const res = await fetch('/api/platform/resolve-tenant', { headers });
      const data = await res.json();
      if (data.success) {
        setPlane(data.plane);
        setTenant(data.tenant);

        // Dynamically inject CSS Custom Properties for Tenant Theme
        if (data.tenant?.theme) {
          document.documentElement.style.setProperty('--tenant-primary-color', data.tenant.theme.primaryColor);
          document.documentElement.style.setProperty('--tenant-secondary-color', data.tenant.theme.secondaryColor);
        } else {
          document.documentElement.style.setProperty('--tenant-primary-color', '#4F46E5');
          document.documentElement.style.setProperty('--tenant-secondary-color', '#1E1B4B');
        }
      }
    } catch (err) {
      console.error('Failed to resolve tenant plane:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh erp-viewport-root bg-slate-950 flex flex-col items-center justify-center text-slate-400 font-mono text-xs gap-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span>Resolving tenant plane & multi-tenant RLS schema...</span>
      </div>
    );
  }

  return (
    <div className="min-h-dvh erp-viewport-root bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Dynamic Multi-Tenant Top Bar */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Dynamic Tenant Identity */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white shadow-md transition-colors"
                style={{
                  backgroundColor: tenant?.theme.primaryColor || '#4F46E5',
                  boxShadow: `0 4px 14px 0 ${tenant?.theme.primaryColor || '#4F46E5'}40`,
                }}
              >
                {plane === 'master' ? <Server className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
              </div>

              <div>
                <div className="font-bold text-sm text-white flex items-center gap-2">
                  <span>{plane === 'master' ? 'Oxen-GL SaaS Master Admin' : tenant?.name || 'Oxen-GL Platform'}</span>
                  {tenant && (
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[10px] font-mono uppercase">
                      {tenant.tier}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>RLS: {tenant?.rlsSchema || 'master_public_schema'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Plane & Domain Switcher (DevOps / Multi-Tenant Preview Tool) */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-mono">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-500">Virtual Host:</span>
              <select
                value={activeHost}
                onChange={(e) => setActiveHost(e.target.value)}
                className="bg-transparent text-indigo-300 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="horizon-logistics.oxengl.me" className="bg-slate-900 text-white">horizon-logistics.oxengl.me (Subdomain)</option>
                <option value="custom-client-domain.com" className="bg-slate-900 text-white">custom-client-domain.com (Custom CNAME)</option>
                <option value="meayon-transport.oxengl.me" className="bg-slate-900 text-white">meayon-transport.oxengl.me (Meayon)</option>
                <option value="admin.oxengl.me" className="bg-slate-900 text-white">admin.oxengl.me (Master Plane HUD)</option>
              </select>
            </div>

            {plane === 'tenant' && (
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
                >
                  العمليات والأسطول
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
                >
                  إعدادات المنشأة
                </button>
                <button
                  onClick={() => setActiveTab('domains')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'domains' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
                >
                  النطاقات
                </button>
                <a
                  href="/compliance/vault"
                  title="Corporate Compliance Vault"
                  className="px-3 py-1.5 rounded-lg transition-all text-slate-400 hover:text-white flex items-center gap-1.5 font-semibold"
                >
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Corporate Compliance Vault</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Dynamic Workspace Body */}
      <main className="flex-1">
        {plane === 'master' ? (
          <MasterControlPanel />
        ) : plane === 'tenant' && tenant ? (
          <div className="max-w-7xl mx-auto px-6 py-8">
            {activeTab === 'dashboard' && (
              <div>
                {/* Dynamic Tenant Hero Banner */}
                <div
                  className="rounded-2xl p-6 mb-8 border border-slate-800 relative overflow-hidden shadow-2xl"
                  style={{
                    background: `linear-gradient(135deg, ${tenant.theme.primaryColor}15 0%, #0F172A 100%)`,
                    borderLeft: `4px solid ${tenant.theme.primaryColor}`,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold" style={{ backgroundColor: `${tenant.theme.primaryColor}30`, color: tenant.theme.primaryColor }}>
                          WORKSPACE ISOLATED · POSTGRESQL RLS
                        </span>
                      </div>
                      <h1 className="text-2xl font-black text-white">{tenant.name}</h1>
                      <p className="text-xs text-slate-400 mt-1">
                        بيئة تشغيلية مستقلة مع تشفير البيانات، واجهات ZATCA المخصصة، وإدارة الأوزان والموازين.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <a
                        href="/compliance/vault"
                        className="px-4 py-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-xs font-medium rounded-xl text-slate-200 flex items-center gap-2 transition-colors"
                        title="Corporate Compliance Vault"
                      >
                        <FileCheck2 className="w-4 h-4 text-emerald-400" />
                        <span>Corporate Compliance Vault</span>
                      </a>
                      <button
                        onClick={() => setActiveTab('domains')}
                        className="px-4 py-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-xs font-medium rounded-xl text-slate-200 flex items-center gap-2 transition-colors"
                      >
                        <Globe className="w-4 h-4 text-indigo-400" />
                        <span>إعداد النطاق المخصص</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="px-4 py-2 text-white text-xs font-bold rounded-xl transition-all shadow-md"
                        style={{ backgroundColor: tenant.theme.primaryColor }}
                      >
                        إدارة الصلاحيات والـ API
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-app / Children Workspace */}
                {children ? (
                  children
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm">أسطول النقل والشاحنات</h3>
                          <p className="text-xs text-slate-400">14 شاحنة نشطة على مسارات الرياض</p>
                        </div>
                      </div>
                      <div className="text-2xl font-black text-white font-mono">1,842.50 <span className="text-xs font-normal text-slate-400">طن اليوم</span></div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm">الفوترة والربط مع زكاة (ZATCA)</h3>
                          <p className="text-xs text-slate-400">جميع الفواتير معتمدة مع ختم TLV</p>
                        </div>
                      </div>
                      <div className="text-2xl font-black text-emerald-400 font-mono">100% <span className="text-xs font-normal text-slate-400">Clearance</span></div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
                          <Radio className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm">حالة التتبع والاتصال</h3>
                          <p className="text-xs text-slate-400">اتصال مباشر بأجهزة التتبع GPS</p>
                        </div>
                      </div>
                      <div className="text-2xl font-black text-amber-400 font-mono">Online <span className="text-xs font-normal text-slate-400">Low Latency</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <TenantSettingsPanel tenantId={tenant.id} tenantSlug={tenant.slug} />
            )}

            {activeTab === 'domains' && (
              <CustomDomainWizard tenantId={tenant.id} tenantSlug={tenant.slug} />
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-16 text-center">
            <h1 className="text-3xl font-black text-white mb-3">Oxen-GL Cloud Platform</h1>
            <p className="text-slate-400 text-sm mb-6">
              بوابة الدخول الموحد لمنصة الخدمات اللوجستية والنقليات متعددة المنشآت.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setActiveHost('horizon-logistics.oxengl.me')}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all"
              >
                الدخول لمنشأة هورايزون لوجستيكس
              </button>
              <button
                onClick={() => setActiveHost('admin.oxengl.me')}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
              >
                الدخول للوحة تحكم DevOps
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
