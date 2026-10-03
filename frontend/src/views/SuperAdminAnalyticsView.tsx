import React, { useState, useEffect } from 'react';
import {
  TrendingUp, Activity, BarChart3, Calendar, RefreshCw, ArrowUpRight,
  ShieldAlert, Zap, Layers, Building2, CheckCircle2, ArrowRight
} from 'lucide-react';

interface VelocityDay {
  date: string;
  day_label: string;
  journal_entries: number;
  audit_events: number;
  transaction_velocity: number;
}

interface TenantVelocityItem {
  tenant_id: string;
  tenant_name: string;
  slug: string;
  currency: string;
  is_active: boolean;
  status: string;
  velocity_7d: number;
  all_time_entries: number;
  sparkline: number[];
}

interface VelocityResponse {
  rolling_window_days: number;
  start_date: string;
  end_date: string;
  data: VelocityDay[];
  per_tenant_velocity?: TenantVelocityItem[];
}

// Compact SVG Sparkline Renderer
const Sparkline: React.FC<{ data: number[]; color?: string }> = ({ data, color = '#10b981' }) => {
  if (!data || data.length === 0) return <span className="text-slate-500 text-xs">—</span>;

  const width = 120;
  const height = 32;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="overflow-visible">
        {/* Sparkline path */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {/* Data points */}
        {data.map((val, idx) => {
          const x = (idx / (data.length - 1)) * width;
          const y = height - ((val - min) / range) * (height - 8) - 4;
          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r={idx === data.length - 1 ? 3 : 1.5}
              fill={idx === data.length - 1 ? color : '#334155'}
            />
          );
        })}
      </svg>
      <span className="text-[11px] font-mono font-bold text-slate-300 w-6 text-right">
        {data[data.length - 1]}
      </span>
    </div>
  );
};

export const SuperAdminAnalyticsView: React.FC = () => {
  const [velocityData, setVelocityData] = useState<VelocityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVelocity = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/superadmin/analytics/velocity');
      if (res.ok) {
        const data = await res.json();
        setVelocityData(data);
      }
    } catch (err) {
      console.error('Failed to fetch velocity analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVelocity();
  }, []);

  const maxVelocity = Math.max(
    ...(velocityData?.data.map((d) => d.transaction_velocity) || [10]),
    1
  );

  const totalOps = velocityData?.data.reduce((acc, d) => acc + d.transaction_velocity, 0) || 0;
  const totalEntries = velocityData?.data.reduce((acc, d) => acc + (d.journal_entries || 0), 0) || 0;
  const avgDaily = velocityData?.data.length ? Math.round(totalOps / velocityData.data.length) : 0;

  return (
    <div className="platform-dark min-h-dvh erp-viewport-root pt-safe pb-safe px-safe bg-slate-950 text-slate-100 font-sans px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white">Transaction Velocity Visualizer</h1>
                <p className="text-xs text-slate-400 font-mono">/admin/analytics • Rolling 7-Day Density Analyzer & Sparklines</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a href="/admin/tenants" className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold hover:bg-slate-800 transition-colors">
              Tenants Grid
            </a>
            <a href="/admin/logs" className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold hover:bg-slate-800 transition-colors">
              Audit Logs
            </a>
            <button
              type="button"
              id="btn-admin-hub"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/admin';
                }
              }}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Admin Hub
            </button>
            <button onClick={fetchVelocity} className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <SpotlightCard tone="platform" className="p-5 shadow-lg border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider">TOTAL OPERATIONS (7-DAY)</span>
              <div className="h-8 w-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white ltr-isolate-num">{totalOps.toLocaleString()}</div>
            <div className="text-xs text-emerald-400 flex items-center gap-1 mt-2">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>Multi-Tenant Transaction Throughput Stable</span>
            </div>
          </SpotlightCard>

          <SpotlightCard tone="platform" className="p-5 shadow-lg border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider">JOURNAL ENTRIES (7-DAY)</span>
              <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white ltr-isolate-num">{totalEntries.toLocaleString()} <span className="text-sm font-normal text-slate-400">entries</span></div>
            <div className="text-xs text-slate-400 mt-2 font-mono">
              Window: <span className="ltr-isolate">{velocityData?.start_date}</span> to <span className="ltr-isolate">{velocityData?.end_date}</span>
            </div>
          </SpotlightCard>

          <SpotlightCard tone="platform" className="p-5 shadow-lg border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider">DAILY VELOCITY AVERAGE</span>
              <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <BarChart3 className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white ltr-isolate-num">
              {avgDaily.toLocaleString()} <span className="text-sm font-normal text-slate-400">ops/day</span>
            </div>
            <div className="text-xs text-sky-400 flex items-center gap-1 mt-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Cryptographic Auditing Active</span>
            </div>
          </SpotlightCard>
        </div>

        {/* Chart Viewport Canvas */}
        <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-400" />
              Rolling 7-Day Platform Velocity Spectrum
            </h3>
            <span className="text-xs font-mono text-slate-400">Journal Entries vs Audit Actions</span>
          </div>

          {/* Bar Chart Representation */}
          <div className="h-56 flex items-end justify-between gap-3 pt-6 pb-2 border-b border-slate-800">
            {velocityData?.data.map((item, idx) => {
              const heightPct = Math.round((item.transaction_velocity / maxVelocity) * 100);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                  {/* Tooltip on hover */}
                  <div className="text-[10px] font-mono text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 px-2 py-1 rounded shadow-md border border-slate-700">
                    {item.transaction_velocity} ops ({item.journal_entries || 0} ledger, {item.audit_events} audit)
                  </div>
                  <div className="w-full max-w-[50px] bg-slate-800/60 rounded-t-xl overflow-hidden flex flex-col justify-end p-1">
                    <div
                      className="w-full bg-gradient-to-t from-emerald-600 to-sky-400 rounded-t-lg transition-all duration-500 group-hover:from-emerald-500 group-hover:to-sky-300"
                      style={{ height: `${Math.max(heightPct, 10)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 text-center">{item.day_label}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>Minimum Baseline: 1 op/window</span>
            <span>Peak Day: {velocityData?.data.reduce((max, d) => d.transaction_velocity > max.transaction_velocity ? d : max, velocityData.data[0])?.day_label}</span>
          </div>
        </div>

        {/* Per-Tenant Transaction Velocity & Sparklines Table */}
        <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="h-4 w-4 text-sky-400" />
                Tenant Transaction Velocity & Sparklines
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                7-day journal entry counts and live sparkline density trajectories across isolated workspaces
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
              {velocityData?.per_tenant_velocity?.length || 0} Workspaces
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="py-3 px-3">WORKSPACE ENTITY</th>
                  <th className="py-3 px-3">SLUG / DOMAIN</th>
                  <th className="py-3 px-3">STATUS</th>
                  <th className="py-3 px-3 text-center">7-DAY VELOCITY</th>
                  <th className="py-3 px-3">7-DAY SPARKLINE TREND</th>
                  <th className="py-3 px-3 text-right">ALL-TIME ENTRIES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {velocityData?.per_tenant_velocity && velocityData.per_tenant_velocity.length > 0 ? (
                  velocityData.per_tenant_velocity.map((t) => (
                    <tr key={t.tenant_id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-white">{t.tenant_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{t.tenant_id.slice(0, 8)}...</div>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-300">
                        /{t.slug}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          t.is_active
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                            : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                        }`}>
                          {t.is_active ? 'ACTIVE' : 'SUSPENDED'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-mono font-bold text-sm text-white">
                          {t.velocity_7d}
                        </span>
                        <span className="text-[10px] text-slate-500 block">entries</span>
                      </td>
                      <td className="py-3.5 px-3">
                        <Sparkline
                          data={t.sparkline}
                          color={t.is_active ? '#10b981' : '#94a3b8'}
                        />
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-300">
                        {t.all_time_entries.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500 font-mono">
                      No tenant velocity data records available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
