/**
 * OxenGL ERP — Platform Admin Portal View
 * =========================================
 * Location: src/views/PlatformAdminPortal.tsx
 *
 * Global cross-tenant executive control plane for OxenGL Super Administrators:
 * - Strict Role-Based Access Control (RBAC) guard: Super_Admin only
 * - Data fetching on mount via fetchPlatformAdminDashboards()
 * - Responsive executive grid layout (max-w-7xl mx-auto)
 * - State management with graceful error boundaries and Skeleton loading states
 * - Global telemetry cards, financial MRR/ARR velocity, and tenant comparisons
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  RefreshCw, 
  Activity, 
  Coins, 
  TrendingUp, 
  Building2, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Globe, 
  Sparkles,
  Server,
  Calendar,
  CreditCard
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { 
  fetchPlatformAdminDashboards, 
  PlatformAdminOverviewResponse, 
  TenantUsageData 
} from '../services/analyticsService';
import { GlobalSystemHealthCard } from '../components/analytics/GlobalSystemHealthCard';
import { TenantComparisonTable } from '../components/analytics/TenantComparisonTable';
import { SkeletonCard, SkeletonTable } from '../components/common/Skeleton';
import { getAuthToken, decodeJwtClaims } from '../services/api';
import { BillingConfigurationPanel } from '../components/admin/BillingConfigurationPanel';

export const PlatformAdminPortal: React.FC = () => {
  const { currentUser, authTier } = useApp();

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'telemetry' | 'billing'>('telemetry');

  // State Management
  const [data, setData] = useState<PlatformAdminOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<TenantUsageData | null>(null);

  // ─── 1. Role-Based Access Control (RBAC) Guard ────────────────────────────
  // Evaluates currentUser role, master auth tier, JWT claims, and local storage fallback
  const isSuperAdmin = Boolean(
    currentUser?.role === 'Super_Admin' ||
    (currentUser?.role as string) === 'Super Admin' ||
    (currentUser as any)?.is_superuser ||
    authTier === 'master' ||
    (() => {
      try {
        const claims = decodeJwtClaims(getAuthToken());
        if (claims?.is_superuser || claims?.role === 'Super_Admin' || claims?.role === 'Super Admin') {
          return true;
        }
      } catch {
        // Ignore JWT decoding failure
      }
      return (
        typeof window !== 'undefined' &&
        (localStorage.getItem('role') === 'Super_Admin' || localStorage.getItem('role') === 'Super Admin')
      );
    })()
  );

  // ─── 2. Data Fetching Hook ────────────────────────────────────────────────
  const loadDashboardData = useCallback(async (forceRefresh: boolean = false) => {
    try {
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await fetchPlatformAdminDashboards(forceRefresh);
      setData(response);
    } catch (err: any) {
      console.error('[PlatformAdminPortal] Error loading telemetry:', err);
      setError(err?.message || 'Failed to load platform analytics.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadDashboardData();
    }
  }, [isSuperAdmin, loadDashboardData]);

  // ─── 3. Unauthorized / Access Denied Fallback UI ─────────────────────────
  if (!isSuperAdmin) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-zinc-900 shadow-xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center mx-auto mb-5 text-rose-600 dark:text-rose-400">
            <Lock className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Platform Access Restricted
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
            The OxenGL Platform Admin Portal requires explicit <strong className="text-zinc-700 dark:text-zinc-200">Super Administrator</strong> privileges on the global master control plane.
          </p>

          <div className="mt-6 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-left text-xs space-y-1">
            <div className="text-zinc-500 dark:text-zinc-400">Current User: <strong className="text-zinc-800 dark:text-zinc-200">{currentUser?.email || 'Authenticated User'}</strong></div>
            <div className="text-zinc-500 dark:text-zinc-400">Assigned Role: <span className="font-semibold text-rose-600 dark:text-rose-400">{currentUser?.role || 'Tenant Member'}</span></div>
          </div>

          <button
            onClick={() => window.location.href = '/'}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm"
          >
            Return to Tenant Workspace
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─── 4. Main Executive View Render ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 pb-16 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Executive Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
                <Globe className="w-4 h-4" />
              </span>
              <span className="text-xs font-semibold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                Global Control Plane
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Telemetry
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              Platform Admin Portal
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl">
              Cross-tenant observability, multi-tenant row isolation verification, and real-time BigQuery data pipeline scaling.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'telemetry' && (
              <button
                onClick={() => loadDashboardData(true)}
                disabled={isLoading || isRefreshing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors shadow-2xs disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
                {isRefreshing ? 'Refreshing Snapshot...' : 'Force Refresh'}
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'telemetry'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Global Telemetry & Tenants
          </button>

          <button
            onClick={() => setActiveTab('billing')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'billing'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Payment & Billing Gateways
          </button>
        </div>

        {/* Tab 2: Billing & Payment Gateways Configuration */}
        {activeTab === 'billing' && (
          <BillingConfigurationPanel />
        )}

        {/* Tab 1: Global Telemetry & Observability View */}
        {activeTab === 'telemetry' && (
          <>
            {/* Error State Banner */}
            {error && (
              <div className="p-5 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                      Telemetry Fetch Error
                    </h4>
                    <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">
                      {error}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => loadDashboardData(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors shrink-0 shadow-2xs"
                >
                  Retry Pipeline
                </button>
              </div>
            )}

            {/* Loading State Skeleton Grid */}
            {isLoading && !data && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
                <SkeletonTable rows={6} cols={7} />
              </div>
            )}

            {/* Loaded Telemetry Grid */}
            {data && (
              <div className="space-y-8">
                {/* 1. Global System Health Cards */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Infrastructure & Global Metrics
                </h2>
                <span className="text-xs text-zinc-400 font-mono">
                  Updated: {new Date(data.generatedAt).toLocaleTimeString()}
                </span>
              </div>
              <GlobalSystemHealthCard
                kpis={data.kpis}
                systemHealth={data.systemHealth}
                isLoading={isRefreshing}
                onRefresh={() => loadDashboardData(true)}
              />
            </section>

            {/* 2. SaaS Revenue Distribution & Velocity Matrix */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* MRR & ARR Velocity */}
              <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider">Recurring SaaS Velocity</span>
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-3xl font-extrabold font-mono text-zinc-900 dark:text-zinc-100">
                    {data.revenue.mrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs font-semibold text-zinc-400 ml-1.5">SAR/mo</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Normalized Annual Run Rate (ARR): <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{data.revenue.arr.toLocaleString()} SAR</strong>
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">ZATCA Tax Collected:</span>
                  <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                    {data.revenue.vatCollected.toLocaleString()} SAR
                  </span>
                </div>
              </div>

              {/* Subscription Tier Distribution */}
              <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
                <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-4">
                  <span className="text-xs font-medium uppercase tracking-wider">Tenant Tier Allocation</span>
                  <Layers className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="space-y-3 text-xs">
                  {Object.entries(data.revenue.breakdownByPlan).map(([plan, pct]) => (
                    <div key={plan} className="space-y-1">
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-zinc-700 dark:text-zinc-300">{plan}</span>
                        <span className="font-mono text-zinc-500 dark:text-zinc-400">{pct}%</span>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            plan === 'ENTERPRISE'
                              ? 'bg-indigo-500'
                              : plan === 'PROFESSIONAL'
                              ? 'bg-blue-500'
                              : 'bg-zinc-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Pipeline Health Card */}
              <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider">Warehouse Pipeline</span>
                    <Server className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-3xl font-extrabold font-mono text-zinc-900 dark:text-zinc-100">
                    {data.kpis.systemHealthScore.toFixed(1)}%
                    <span className="text-xs font-semibold text-emerald-500 ml-1.5">Integrity</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Continuous BigQuery assertions across all staging models.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Inventory Movements:</span>
                  <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                    {data.kpis.totalInventoryMovements.toLocaleString()} rows
                  </span>
                </div>
              </div>
            </section>

            {/* 3. Cross-Tenant Comparison Table */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Tenant Organizations Comparison Matrix
                </h2>
                <span className="text-xs text-zinc-400 font-mono">
                  {data.tenants.length} active tenants loaded
                </span>
              </div>
              <TenantComparisonTable
                tenants={data.tenants}
                isLoading={isRefreshing}
                onSelectTenant={(t) => setSelectedTenant(t)}
              />
            </section>
          </div>
        )}
        </>
      )}

        {/* Tenant Detail Modal (if selected) */}
        {selectedTenant && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="max-w-lg w-full p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                    {selectedTenant.tenantName.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                      {selectedTenant.tenantName}
                    </h3>
                    <p className="text-xs font-mono text-zinc-400">
                      ID: {selectedTenant.tenantId}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTenant(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-zinc-400 text-[11px]">Subscription Plan</span>
                  <div className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{selectedTenant.plan}</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-zinc-400 text-[11px]">Tenant Status</span>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{selectedTenant.status}</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-zinc-400 text-[11px]">Data Health Score</span>
                  <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{selectedTenant.dataHealthScore}%</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-zinc-400 text-[11px]">ZATCA Compliance</span>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{selectedTenant.zatcaComplianceRate}%</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-zinc-400 text-[11px]">Total Transactions</span>
                  <div className="font-mono font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{selectedTenant.transactionCount.toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-zinc-400 text-[11px]">Total Revenue</span>
                  <div className="font-mono font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{selectedTenant.revenue.toLocaleString()} SAR</div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedTenant(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default PlatformAdminPortal;
