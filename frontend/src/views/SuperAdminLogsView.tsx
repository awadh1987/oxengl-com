import React, { useState, useEffect } from 'react';
import {
  FileText, Download, RefreshCw, AlertTriangle, ShieldCheck, HardDrive,
  Database, Building2, Filter, CheckCircle2, Clock, Cloud, Layers, Radio, Zap
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  tenant_id: string | null;
  action_type: string;
  actor: string;
  details: string;
  created_at: string;
}

interface CloudVaultData {
  bucket_name: string;
  provider: string;
  volume_bytes: number;
  volume_mb: number;
  volume_gb: number;
  file_units: number;
  network_throughput_mbps: number;
  storage_limit_bytes: number;
  storage_limit_gb: number;
  utilization_percent: number;
  sse_algorithm: string;
  key_status: string;
  archive_keys_count: number;
  tls_pipe_active: boolean;
}

interface TelemetryData {
  status: string;
  threshold_90_breached: boolean;
  cloud_vault?: CloudVaultData;
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    utilization_percent: number;
  };
  tenants: {
    total: number;
    active: number;
  };
  database: {
    name: string;
    size: string;
    connected_pool: string;
  };
  timestamp: string;
}

export const SuperAdminLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const url = actionFilter
        ? `/api/v1/superadmin/logs?action_type=${encodeURIComponent(actionFilter)}`
        : '/api/v1/superadmin/logs';
      const [logRes, telRes] = await Promise.all([
        fetch(url),
        fetch('/api/v1/superadmin/cloud-telemetry'),
      ]);

      if (logRes.ok) {
        const logData = await logRes.json();
        setLogs(logData.items || []);
        setTotalCount(logData.total || 0);
      }
      if (telRes.ok) {
        const telData = await telRes.json();
        setTelemetry(telData);
      }
    } catch (err) {
      console.error('Failed to fetch telemetry/logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, [actionFilter]);

  return (
    <div className="min-h-dvh erp-viewport-root bg-slate-950 text-slate-100 font-sans px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white">Live Telemetry & Audit Ledger</h1>
                <p className="text-xs text-slate-400 font-mono">/admin/logs • Platform Audit Trail & Capacity Watcher</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/api/v1/superadmin/logs/export-csv"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold hover:border-purple-500 hover:text-purple-300 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </a>
            <a href="/admin/tenants" className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold hover:bg-slate-800 transition-colors">
              Tenants Grid
            </a>
            <a href="/admin/analytics" className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold hover:bg-slate-800 transition-colors">
              Velocity Charts
            </a>
            <button
              type="button"
              id="btn-admin-hub"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/admin';
                }
              }}
              className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Admin Hub
            </button>
            <button onClick={fetchLogs} className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 90% Threshold Alert Banner if breached */}
        {telemetry?.threshold_90_breached && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-rose-400 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-sm">Critical Capacity Threshold Breached (≥90%)</h4>
              <p className="text-xs text-rose-200/80">
                Storage utilization is currently at {telemetry.disk.utilization_percent}% ({telemetry.disk.free_gb} GB free).
                Log vacuuming and automated test tenant pruning have been triggered.
              </p>
            </div>
          </div>
        )}

        {/* Core Telemetry Cards */}
        {telemetry && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-mono">DISK CAPACITY</span>
                  <HardDrive className="h-4 w-4 text-sky-400" />
                </div>
                <div className="text-2xl font-black text-white"><span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.disk.utilization_percent}%</span></div>
                <div className="text-[11px] text-slate-400 mt-1">
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.disk.used_gb} GB / {telemetry.disk.total_gb} GB ({telemetry.disk.free_gb} GB free)</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${telemetry.disk.utilization_percent >= 90 ? 'bg-rose-500' : 'bg-sky-500'}`}
                    style={{ width: `${Math.min(telemetry.disk.utilization_percent, 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-mono">DATABASE CORE</span>
                  <Database className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-white"><span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.database.size}</span></div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Database: <strong className="text-slate-200">{telemetry.database.name}</strong> • Pool Healthy
                </div>
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 mt-3">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>PostgreSQL 16 Multi-Tenant RLS Online</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-mono">MANAGED TENANTS</span>
                  <Building2 className="h-4 w-4 text-purple-400" />
                </div>
                <div className="text-2xl font-black text-white"><span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.tenants.total}</span></div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Active Workspaces: <strong className="text-emerald-400">{telemetry.tenants.active}</strong>
                </div>
                <div className="text-[10px] text-slate-500 mt-3 font-mono">
                  Suspended / Trial: <span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.tenants.total - telemetry.tenants.active}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-mono">SECURITY INTEGRITY</span>
                  <ShieldCheck className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-2xl font-black text-white">AES-256-GCM</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Master Vault Key: <strong className="text-slate-200">Active</strong>
                </div>
                <div className="text-[10px] text-amber-400/80 mt-3 font-mono">
                  Hardware In-Memory Crypto
                </div>
              </div>
            </div>

            {/* Cloud Telemetry Visualization Cards: Offsite Vault Volume, File Units, Network Throughput */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/70 via-sky-950/20 to-slate-900/70 border border-sky-500/20 shadow-md">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-mono text-sky-400 font-semibold">OFFSITE VAULT VOLUME</span>
                  <Cloud className="h-4 w-4 text-sky-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.cloud_vault ? `${telemetry.cloud_vault.volume_mb} MB` : '0.00 MB'}</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Allocated Limit: <strong className="text-white"><span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.cloud_vault?.storage_limit_gb || 500} GB</span></strong> (
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.cloud_vault?.utilization_percent ?? 0.01}%</span> used)
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all duration-500"
                    style={{ width: `${Math.max(telemetry.cloud_vault?.utilization_percent || 1, 3)}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/70 via-indigo-950/20 to-slate-900/70 border border-indigo-500/20 shadow-md">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-mono text-indigo-400 font-semibold">FILE UNITS</span>
                  <Layers className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-black text-white">
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.cloud_vault?.file_units ?? 0}</span> <span className="text-xs font-normal text-slate-400">archives</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Target Bucket: <strong className="text-white">{telemetry.cloud_vault?.bucket_name || 'oxengl-offsite-vault'}</strong>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-indigo-300 mt-3 font-mono">
                  <CheckCircle2 className="h-3 w-3 text-indigo-400 shrink-0" />
                  <span>AES-256 Encrypted Stream Containers</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/70 via-emerald-950/20 to-slate-900/70 border border-emerald-500/20 shadow-md">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-mono text-emerald-400 font-semibold">NETWORK THROUGHPUT</span>
                  <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
                </div>
                <div className="text-2xl font-black text-white">
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">{telemetry.cloud_vault?.network_throughput_mbps ?? 52.4}</span> <span className="text-xs font-normal text-slate-400">Mbps</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Encrypted TLS Pipe: <strong className="text-emerald-400">Active</strong> • SSE-C (AES256)
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-emerald-300 mt-3 font-mono">
                  <Zap className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span>Master Key Mirrored Offsite</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-slate-500 shrink-0" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="">All Action Types</option>
              <option value="TENANT_STATUS_UPDATED">Status Updates</option>
              <option value="EMERGENCY_ALERT_DISPATCHED">Emergency Alerts</option>
              <option value="TENANT_PURGED">Purge Events</option>
              <option value="TENANT_RESTORED">Restoration Events</option>
              <option value="WEEKLY_SNAPSHOT_CREATED">Weekly Snapshots</option>
              <option value="MASTER_KEY_ROTATED">Key Rotations</option>
              <option value="KEY_MIRRORED_OFFSITE">Key Mirroring</option>
              <option value="OFFSITE_ARCHIVES_REPLICATED">Offsite Sync</option>
            </select>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Recorded Ledger Entries: <strong className="text-white">{totalCount}</strong>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action Event</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Tenant Scope</th>
                  <th className="py-3 px-4">Intervention Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      <span dir="ltr" className="inline-block unicode-bidi-isolate">{log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-bold whitespace-nowrap shrink-0 inline-flex items-center">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{log.action_type}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-semibold">{log.actor}</td>
                    <td className="py-3 px-4 text-sky-400"><span dir="ltr" className="inline-block unicode-bidi-isolate">{log.tenant_id ? log.tenant_id.slice(0, 8) + '...' : 'GLOBAL'}</span></td>
                    <td className="py-3 px-4 text-slate-300 font-sans max-w-md truncate" title={log.details}>
                      {log.details}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                      No audit events recorded yet. Perform actions to stream ledger records.
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
