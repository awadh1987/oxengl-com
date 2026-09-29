import React, { useState, useEffect, useRef } from 'react';
import { useAppSafe } from '../../context/AppContext';
import {
  Activity,
  Shield,
  Search,
  Plus,
  Trash2,
  Server,
  Zap,
  Globe,
  Users,
  Database,
  CheckCircle2,
  AlertTriangle,
  X,
  Sliders,
  Cpu,
  RefreshCw,
  ExternalLink,
  FileCheck2,
} from 'lucide-react';

interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  plan_tier: string;
  custom_domain: string | null;
  is_active: boolean;
  primary_color: string;
  theme_mode: string;
  rls_schema: string;
  stats: {
    active_users: number;
    max_users: number;
    storage_gb_used: number;
    max_storage_gb: number;
    ssl_status: string;
  };
}

interface SystemHealth {
  status: string;
  uptime_percent: number;
  uptime_seconds: number;
  api_latency_ms: number;
  error_rate_percent: number;
  active_rls_connections: number;
  db_connection_pool: { active: number; idle: number; max: number };
  infrastructure: { cluster: string; database: string; cache: string };
}

interface FeatureFlags {
  [key: string]: { enabled: boolean; description: string; rolloutPercent: number };
}

export const MasterControlPanel: React.FC = () => {
  const app = useAppSafe();
  const isAr = (app?.language || (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'ar' : 'en')).startsWith('ar');
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({});
  const [loading, setLoading] = useState(true);

  // Omnibox / Cmd+K Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ tenants: any[]; users: any[]; logs: any[] }>({ tenants: [], users: [], logs: [] });
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tenant Provision Modal
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [newTenantForm, setNewTenantForm] = useState({
    name: '',
    slug: '',
    plan_tier: 'enterprise',
    owner_email: '',
    primary_color: '#F05627',
  });
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Destructive Action Guard Modal
  const [deleteTarget, setDeleteTarget] = useState<TenantRecord | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadHealth, 15000);

    // Keyboard shortcut for Cmd+K / Ctrl+K
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setDeleteTarget(null);
        setShowProvisionModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadTenants(), loadHealth(), loadFeatureFlags()]);
    setLoading(false);
  };

  const loadTenants = async () => {
    try {
      const res = await fetch('/api/master/platform/tenants');
      const data = await res.json();
      if (data.success) setTenants(data.tenants);
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  };

  const loadHealth = async () => {
    try {
      const res = await fetch('/api/master/platform/health');
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error('Error fetching health:', err);
    }
  };

  const loadFeatureFlags = async () => {
    try {
      const res = await fetch('/api/admin/feature-flags').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.success && data.flags) {
          setFeatureFlags(data.flags);
          return;
        }
      }
      const fallbackRes = await fetch('/api/master/platform/feature-flags');
      const data = await fallbackRes.json();
      if (data.success && data.flags) setFeatureFlags(data.flags);
    } catch (err) {
      console.error('Error fetching flags:', err);
    }
  };

  const handleSearchChange = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults({ tenants: [], users: [], logs: [] });
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/master/platform/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleToggleFlag = async (flagKey: string, currentVal: boolean) => {
    const nextVal = !currentVal;
    // Optimistic UI state update
    setFeatureFlags((prev) => ({
      ...prev,
      [flagKey]: { ...prev[flagKey], enabled: nextVal },
    }));

    try {
      // Primary: PATCH /api/admin/feature-flags to persist in PostgreSQL
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag_key: flagKey, enabled: nextVal }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.flags) {
          setFeatureFlags(data.flags);
        }
      } else {
        // Fallback: POST /api/master/platform/feature-flags/toggle
        const fallbackRes = await fetch('/api/master/platform/feature-flags/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flag_key: flagKey, enabled: nextVal }),
        });
        const data = await fallbackRes.json();
        if (data.flags) {
          setFeatureFlags(data.flags);
        }
      }
    } catch (err) {
      console.error('Toggle flag error:', err);
      // Revert optimistic state on error
      setFeatureFlags((prev) => ({
        ...prev,
        [flagKey]: { ...prev[flagKey], enabled: currentVal },
      }));
    }
  };

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionError(null);
    try {
      const res = await fetch('/api/master/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTenantForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setProvisionError(data.error || 'Failed to provision tenant');
        return;
      }
      setShowProvisionModal(false);
      setNewTenantForm({ name: '', slug: '', plan_tier: 'enterprise', owner_email: '', primary_color: '#F05627' });
      loadTenants();
    } catch (err: any) {
      setProvisionError(err.message || 'Network error');
    }
  };

  const handleDeleteTenant = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/master/platform/tenants/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_phrase: confirmInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete tenant');
        setIsDeleting(false);
        return;
      }
      setDeleteTarget(null);
      setConfirmInput('');
      setIsDeleting(false);
      loadTenants();
    } catch (err: any) {
      setDeleteError(err.message || 'Network error');
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-dvh erp-viewport-root bg-slate-950 text-slate-100 font-sans pb-16">
      {/* 1. Persistent Top Telemetry Status Banner */}
      <div className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 md:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 md:gap-4 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-slate-200 tracking-wide whitespace-nowrap shrink-0">OXEN-GL MASTER PLATFORM PLANE</span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-400 whitespace-nowrap shrink-0">Cluster: <span className="text-indigo-400">{health?.infrastructure?.cluster || 'me-central-1'}</span></span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-400 whitespace-nowrap shrink-0">Database: <span className="text-indigo-400">{health?.infrastructure?.database || 'PostgreSQL 16 Multi-Tenant RLS'}</span></span>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-5 text-slate-400">
            <a
              href="/compliance/vault"
              className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white hover:underline transition-colors whitespace-nowrap shrink-0"
              title="Corporate Compliance Vault"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Corporate Compliance Vault</span>
            </a>
            <div className="whitespace-nowrap shrink-0">
              Uptime: <span className="text-emerald-400 font-bold">{health?.uptime_percent || 99.98}%</span>
            </div>
            <div className="whitespace-nowrap shrink-0">
              Latency: <span className="text-sky-400 font-bold">{health?.api_latency_ms || 14.2}ms</span>
            </div>
            <div className="whitespace-nowrap shrink-0">
              Error Rate: <span className="text-emerald-400 font-bold">{health?.error_rate_percent || 0.02}%</span>
            </div>
            <div className="whitespace-nowrap shrink-0">
              RLS Sessions: <span className="text-amber-400 font-bold">{health?.active_rls_connections || 18}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-8">
        {/* Header with Cmd+K and New Tenant button */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Server className="w-7 h-7 text-indigo-500" />
              <span>Master DevOps Platform HUD</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Multi-tenant architecture supervisor, tenant workspace provisioning, and Row-Level Security telemetry.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/compliance/vault"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-inner"
              title="Corporate Compliance Vault"
            >
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
              <span>Corporate Compliance Vault</span>
            </a>

            <button
              onClick={() => setSearchOpen(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-mono flex items-center gap-3 transition-all shadow-inner"
            >
              <Search className="w-4 h-4 text-slate-400" />
              <span>بحث شامل بالمنصة...</span>
              <kbd className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] text-slate-400">⌘K</kbd>
            </button>

            <button
              onClick={() => setShowProvisionModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء مساحة منشأة جديدة (Provision)</span>
            </button>
          </div>
        </div>

        {/* 2. Global Feature Flags Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-8 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">مفاتيح الخصائص العالمية (Global Feature Flags)</h2>
            </div>
            <span className="text-xs text-slate-500 font-mono">Real-time configuration toggles</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(featureFlags).map(([key, rawFlag]) => {
              const flag = rawFlag as { enabled: boolean; description: string };
              return (
                <div key={key} className="bg-slate-950/80 border border-slate-800/80 p-3.5 rounded-xl flex items-center justify-between gap-3">
                  <div className="space-y-0.5 overflow-hidden">
                    <div className="font-mono text-xs font-semibold text-slate-200 truncate">{key}</div>
                    <div className="text-[11px] text-slate-400 truncate">{flag.description}</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={flag.enabled}
                      onChange={() => handleToggleFlag(key, flag.enabled)}
                    />
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        handleToggleFlag(key, flag.enabled);
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                        flag.enabled ? 'bg-indigo-600' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                          flag.enabled ? 'right-1' : 'left-1'
                        }`}
                      />
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. High-Density Tenant Registry Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400 shrink-0" />
              <h2 className="text-sm font-bold text-white whitespace-nowrap shrink-0">سجل المنشآت المستضافة (Tenant Registry)</h2>
              <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-xs font-mono whitespace-nowrap shrink-0">
                {tenants.length} Active Tenants
              </span>
            </div>

            <button onClick={loadData} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold font-mono">
                <tr>
                  <th className="px-6 py-3.5">المنشأة (Tenant)</th>
                  <th className="px-6 py-3.5">الخطة (Tier)</th>
                  <th className="px-6 py-3.5">النطاق والمسار</th>
                  <th className="px-6 py-3.5">المستخدمين</th>
                  <th className="px-6 py-3.5">مساحة التخزين</th>
                  <th className="px-6 py-3.5">مخطط RLS</th>
                  <th className="px-6 py-3.5 text-right">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white">
                      <div className="flex items-center gap-3">
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.primary_color }} />
                        <div>
                          <div className="font-bold text-white text-sm">{t.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{t.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-1 rounded font-mono text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0 ${t.plan_tier === 'enterprise' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'}`}>
                        {t.plan_tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="font-mono text-slate-300 text-[11px] flex items-center gap-1.5">
                          <span>{t.slug}.oxengl.com</span>
                        </div>
                        {t.custom_domain && (
                          <div className="font-mono text-indigo-400 text-[11px] flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            <span>{t.custom_domain}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono">{t.stats.active_users} / {t.stats.max_users > 1000 ? '∞' : t.stats.max_users}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-mono text-slate-300 text-[11px]">
                        {t.stats.storage_gb_used} GB / {t.stats.max_storage_gb} GB
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-400">
                      <code className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-indigo-300">
                        {t.rls_schema}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setDeleteTarget(t);
                            setConfirmInput('');
                            setDeleteError(null);
                          }}
                          className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="حذف المنشأة مع إجراءات الأمان"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Omnibox Global Search Modal (Cmd+K) */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-24 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center gap-3">
              <Search className="w-5 h-5 text-indigo-400 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={isAr ? 'ابحث عن المنشآت، المستخدمين، النطاقات، أو سجلات التدقيق...' : 'Search tenants, users, domains, or audit logs...'}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full bg-transparent text-white placeholder-slate-500 text-sm focus:outline-none"
              />
              <button onClick={() => setSearchOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-4 space-y-4">
              {isSearching ? (
                <div className="text-center py-8 text-slate-500 text-xs">جاري البحث...</div>
              ) : searchQuery && searchResults.tenants.length === 0 && searchResults.users.length === 0 && searchResults.logs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">لا توجد نتائج مطابقة</div>
              ) : (
                <>
                  {searchResults.tenants.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">المنشآت (Tenants)</div>
                      <div className="space-y-1.5">
                        {searchResults.tenants.map((item) => (
                          <div key={item.id} className="p-2.5 bg-slate-950 hover:bg-slate-800 rounded-lg flex items-center justify-between cursor-pointer transition-colors">
                            <div>
                              <div className="font-semibold text-sm text-white">{item.title}</div>
                              <div className="text-xs text-slate-400 font-mono">{item.subtitle}</div>
                            </div>
                            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-mono rounded uppercase">{item.badge}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.users.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">المستخدمين (Users)</div>
                      <div className="space-y-1.5">
                        {searchResults.users.map((item) => (
                          <div key={item.id} className="p-2.5 bg-slate-950 hover:bg-slate-800 rounded-lg flex items-center justify-between cursor-pointer transition-colors">
                            <div>
                              <div className="font-semibold text-sm text-white">{item.title}</div>
                              <div className="text-xs text-slate-400 font-mono">{item.subtitle}</div>
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono rounded">{item.badge}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.logs.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">سجلات التدقيق (Audit Logs)</div>
                      <div className="space-y-1.5">
                        {searchResults.logs.map((item) => (
                          <div key={item.id} className="p-2.5 bg-slate-950 hover:bg-slate-800 rounded-lg flex items-center justify-between font-mono text-xs cursor-pointer transition-colors">
                            <div>
                              <div className="text-slate-200 font-semibold">{item.title}</div>
                              <div className="text-[11px] text-slate-500">{item.subtitle}</div>
                            </div>
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded">{item.badge}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Type-to-Confirm Destructive Action Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">إلغاء وحذف المنشأة نهائياً</h3>
                <p className="text-xs text-slate-400">حماية من العمليات المدمرة (Type-to-Confirm Guard)</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 leading-relaxed">
              تحذير: سيتم حذف مساحة العمل للمنشأة <strong>"{deleteTarget.name}"</strong> وجميع النطاقات وسجلات RLS الخاصة بها. هذا الإجراء لا يمكن التراجع عنه.
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-500/20 text-rose-300 text-xs rounded-lg">{deleteError}</div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                لتأكيد الحذف، اكتب العبارة التالية بدقة:
              </label>
              <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 font-mono text-xs text-amber-400 select-all mb-2">
                CONFIRM-DELETE-{deleteTarget.slug}
              </div>
              <input
                type="text"
                placeholder={`اكتب CONFIRM-DELETE-${deleteTarget.slug}`}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteTenant}
                disabled={confirmInput !== `CONFIRM-DELETE-${deleteTarget.slug}` || isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>حذف نهائي للمنشأة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Provision Tenant Modal */}
      {showProvisionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                <span>إنشاء مساحة منشأة تجارية جديدة (Provision Tenant)</span>
              </h3>
              <button onClick={() => setShowProvisionModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {provisionError && (
              <div className="p-3 bg-rose-500/20 text-rose-300 text-xs rounded-lg">{provisionError}</div>
            )}

            <form onSubmit={handleProvisionSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">اسم المنشأة التجاري (Company Name)</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: شركة الرياض للنقليات المحدودة' : 'e.g. Riyadh Transport Co. Ltd'}
                  value={newTenantForm.name}
                  onChange={(e) => setNewTenantForm({ ...newTenantForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">معرف المنشأة الفريد (Tenant Slug)</label>
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                  <input
                    type="text"
                    required
                    placeholder={isAr ? 'riyadh-transport' : 'riyadh-transport'}
                    value={newTenantForm.slug}
                    onChange={(e) => setNewTenantForm({ ...newTenantForm, slug: e.target.value })}
                    className="flex-1 bg-transparent px-3 py-2 text-white font-mono focus:outline-none"
                  />
                  <span className="px-3 py-2 text-slate-500 font-mono bg-slate-900 border-l border-slate-800">.oxengl.com</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">خطة الاشتراك (Plan Tier)</label>
                <select
                  value={newTenantForm.plan_tier}
                  onChange={(e) => setNewTenantForm({ ...newTenantForm, plan_tier: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="enterprise">Enterprise (غير محدود + RLS مخصص + دعم فوري)</option>
                  <option value="growth">Growth (حتى 50 مستخدم + 100GB)</option>
                  <option value="standard">Standard (حتى 15 مستخدم + 20GB)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">البريد الإلكتروني للمسؤول</label>
                  <input
                    type="email"
                    placeholder={isAr ? 'admin@tenant.sa' : 'admin@tenant.sa'}
                    value={newTenantForm.owner_email}
                    onChange={(e) => setNewTenantForm({ ...newTenantForm, owner_email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">لون الهوية الرئيسي (Accent Color)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newTenantForm.primary_color}
                      onChange={(e) => setNewTenantForm({ ...newTenantForm, primary_color: e.target.value })}
                      className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <span className="font-mono text-slate-300">{newTenantForm.primary_color}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
                >
                  إنشاء وتفعيل المنشأة فوراً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
