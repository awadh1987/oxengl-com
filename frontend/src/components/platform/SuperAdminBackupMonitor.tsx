import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, RefreshCw, PlugZap, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { erpApi, BackupDestinationDto, BackupRunLogDto } from '../../services/api';
import { StatusBadge, formatBytes, formatTime, providerLabel } from './BackupDestinationsTab';

/**
 * Super Admin backup oversight: every destination and run log across tenants plus platform-wide ones.
 * Strictly read-only for tenant-owned destinations (the API refuses to modify them); platform-scope
 * destinations can be tested/removed here. No credential material is ever returned by the API.
 */

interface SuperAdminBackupMonitorProps {
  tenants: { id: string; name: string }[];
}

const PAGE_SIZE = 25;
const selectCls = 'bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500';

export const SuperAdminBackupMonitor: React.FC<SuperAdminBackupMonitorProps> = ({ tenants }) => {
  const [scope, setScope] = useState<'' | 'platform' | 'tenant'>('');
  const [tenantId, setTenantId] = useState('');
  const [status, setStatus] = useState('');
  const [destPage, setDestPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [destinations, setDestinations] = useState<BackupDestinationDto[]>([]);
  const [destTotal, setDestTotal] = useState(0);
  const [logs, setLogs] = useState<BackupRunLogDto[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const tenantName = useCallback(
    (id: string | null, fallback?: string | null) =>
      id === null ? 'Platform' : fallback || tenants.find((t) => t.id === id)?.name || id.slice(0, 8),
    [tenants],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const common = { scope: scope || undefined, tenant_id: scope === 'platform' ? undefined : tenantId || undefined };
      const [d, l] = await Promise.all([
        erpApi.getSuperAdminBackupDestinations({ ...common, page: destPage, page_size: PAGE_SIZE }),
        erpApi.getSuperAdminBackupLogs({ ...common, status: status || undefined, page: logPage, page_size: PAGE_SIZE }),
      ]);
      setDestinations(d.items);
      setDestTotal(d.total);
      setLogs(l.items);
      setLogTotal(l.total);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to load backup data' });
    } finally {
      setLoading(false);
    }
  }, [scope, tenantId, status, destPage, logPage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetPages = () => {
    setDestPage(1);
    setLogPage(1);
  };

  const testDestination = async (d: BackupDestinationDto) => {
    try {
      const r = await erpApi.testSuperAdminBackupDestination(d.id);
      setMessage({ ok: r.ok, text: `${d.name}: ${r.message}` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Test failed' });
    }
  };

  const removeDestination = async (d: BackupDestinationDto) => {
    if (!window.confirm(`Delete platform destination "${d.name}"?`)) return;
    try {
      await erpApi.deleteSuperAdminBackupDestination(d.id);
      setMessage({ ok: true, text: 'Platform destination deleted' });
      await refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Delete failed' });
    }
  };

  const pager = (page: number, total: number, set: (n: number) => void) => {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return (
      <div className="flex items-center justify-end gap-2 text-xs text-slate-400 pt-2">
        <span>{total} total</span>
        <button type="button" disabled={page <= 1 || loading} onClick={() => set(page - 1)} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40">‹</button>
        <span>{page} / {pages}</span>
        <button type="button" disabled={page >= pages || loading} onClick={() => set(page + 1)} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40">›</button>
      </div>
    );
  };

  return (
    <section className="space-y-4 border border-slate-800 rounded-2xl bg-slate-900/40 p-4 sm:p-5" data-testid="superadmin-backup-monitor">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Backup Monitoring</h2>
            <p className="text-[11px] text-slate-400">External backup destinations and upload history across the platform and all tenants.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Scope" value={scope} onChange={(e) => { setScope(e.target.value as '' | 'platform' | 'tenant'); resetPages(); }} className={selectCls}>
            <option value="">All scopes</option>
            <option value="platform">Platform-wide</option>
            <option value="tenant">Tenant-owned</option>
          </select>
          <select aria-label="Tenant" value={tenantId} disabled={scope === 'platform'} onChange={(e) => { setTenantId(e.target.value); resetPages(); }} className={selectCls}>
            <option value="">All tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setLogPage(1); }} className={selectCls}>
            <option value="">Any run status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white inline-flex items-center gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div role="status" className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${message.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
          {message.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{message.text}</span>
        </div>
      )}

      <div>
        <h3 className="text-xs font-bold text-white mb-2">Destinations</h3>
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Scope / Tenant</th>
                <th className="px-3 py-2 text-left">Provider</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Active</th>
                <th className="px-3 py-2 text-left">Credentials</th>
                <th className="px-3 py-2 text-left">Last status</th>
                <th className="px-3 py-2 text-left">Last backup</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {destinations.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">{loading ? '…' : 'No destinations match the filters.'}</td></tr>
              )}
              {destinations.map((d) => (
                <tr key={d.id} className="text-slate-200">
                  <td className="px-3 py-2">
                    <span className={`mr-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${d.scope === 'platform' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-800 text-slate-300'}`}>{d.scope}</span>
                    {tenantName(d.tenant_id, d.tenant_name)}
                  </td>
                  <td className="px-3 py-2">{providerLabel(d.provider_type)}</td>
                  <td className="px-3 py-2 font-semibold">{d.name}</td>
                  <td className="px-3 py-2">{d.is_active ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">{d.has_credential ? 'Stored' : 'Missing'}</td>
                  <td className="px-3 py-2"><StatusBadge status={d.last_status} /></td>
                  <td className="px-3 py-2">{formatTime(d.last_backup_at)}</td>
                  <td className="px-3 py-2">
                    {d.scope === 'platform' ? (
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => void testDestination(d)} title="Test connection" className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-500 text-sky-400"><PlugZap className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => void removeDestination(d)} title="Delete" className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500 text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500">tenant-managed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pager(destPage, destTotal, setDestPage)}
      </div>

      <div>
        <h3 className="text-xs font-bold text-white mb-2">Run history</h3>
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Scope / Tenant</th>
                <th className="px-3 py-2 text-left">Destination</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Size</th>
                <th className="px-3 py-2 text-left">Started</th>
                <th className="px-3 py-2 text-left">Completed</th>
                <th className="px-3 py-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">{loading ? '…' : 'No backup runs match the filters.'}</td></tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="text-slate-200">
                  <td className="px-3 py-2">{tenantName(l.tenant_id, l.tenant_name)}</td>
                  <td className="px-3 py-2">{l.destination_name || '—'} <span className="text-slate-500">({providerLabel(l.provider_type)})</span></td>
                  <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                  <td className="px-3 py-2">{formatBytes(l.file_size_bytes)}</td>
                  <td className="px-3 py-2">{formatTime(l.started_at)}</td>
                  <td className="px-3 py-2">{formatTime(l.completed_at)}</td>
                  <td className="px-3 py-2 text-rose-300 max-w-xs truncate" title={l.error_message || ''}>{l.error_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pager(logPage, logTotal, setLogPage)}
      </div>
    </section>
  );
};

export default SuperAdminBackupMonitor;
