import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2, Search, RefreshCw, AlertTriangle, Trash2, Bell, Upload,
  CheckCircle2, XCircle, ArrowRight, Shield, Layers, HardDrive, Activity,
  CheckSquare, Check
} from 'lucide-react';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { BulkActionBar, BulkActionItem } from '../components/platform/BulkActionBar';
import { erpApi } from '../services/api';

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  domain_slug?: string;
  tax_id?: string;
  currency?: string;
  subscription_tier?: string;
  is_active: boolean;
  status: string;
  primary_color: string;
  secondary_color: string;
  created_at?: string;
}

export const SuperAdminTenantsView: React.FC = () => {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [alertChannel, setAlertChannel] = useState('ALL');
  const [customAlertMsg, setCustomAlertMsg] = useState('Emergency platform security notice from SuperAdmin.');
  const [isUploading, setIsUploading] = useState(false);
  const [alertStatus, setAlertStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});

  // Global Bulk Operations
  const bulk = useBulkSelection(tenants);

  const bulkActions: BulkActionItem[] = [
    {
      id: 'bulk-activate',
      label: 'Activate Selected',
      icon: CheckCircle2,
      variant: 'success',
      onClick: async (selectedIds) => {
        try {
          const res = await erpApi.bulkTenantStatus({ ids: selectedIds, is_active: true, status: 'ACTIVE' });
          setActionMessage(res?.message || `Successfully activated ${selectedIds.length} tenants.`);
          bulk.clearSelection();
          fetchTenants();
        } catch (err: any) {
          setActionMessage(`Bulk activation failed: ${err.message}`);
        }
      },
    },
    {
      id: 'bulk-suspend',
      label: 'Suspend Selected',
      icon: AlertTriangle,
      variant: 'warning',
      requiresConfirmation: true,
      confirmTitle: 'Suspend Selected Workspaces',
      confirmMessage: `Are you sure you want to suspend ${bulk.selectedCount} tenant workspaces? Users of suspended tenants will be temporarily blocked from logging in.`,
      onClick: async (selectedIds) => {
        try {
          const res = await erpApi.bulkTenantStatus({ ids: selectedIds, is_active: false, status: 'SUSPENDED' });
          setActionMessage(res?.message || `Successfully suspended ${selectedIds.length} tenants.`);
          bulk.clearSelection();
          fetchTenants();
        } catch (err: any) {
          setActionMessage(`Bulk suspension failed: ${err.message}`);
        }
      },
    },
    {
      id: 'bulk-delete',
      label: 'Purge Selected',
      icon: Trash2,
      variant: 'danger',
      requiresConfirmation: true,
      confirmTitle: 'Hard Purge Selected Workspaces',
      confirmMessage: `CRITICAL ACTION: You are about to purge ${bulk.selectedCount} tenant workspaces and all their associated RLS schema data. This cannot be undone.`,
      onClick: async (selectedIds) => {
        try {
          const res = await erpApi.bulkTenantDelete({ ids: selectedIds, hard_delete: true });
          setActionMessage(res?.message || `Successfully purged ${selectedIds.length} tenants.`);
          bulk.clearSelection();
          fetchTenants();
        } catch (err: any) {
          setActionMessage(`Bulk purge failed: ${err.message}`);
        }
      },
    },
  ];

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/superadmin/tenants?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setTenants(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [search]);

  const toggleTenantStatus = async (tenant: TenantItem) => {
    const nextActive = !tenant.is_active;
    const nextStatus = nextActive ? 'ACTIVE' : 'SUSPENDED';
    try {
      const res = await fetch(`/api/v1/superadmin/tenants/${tenant.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive, status: nextStatus }),
      });
      if (res.ok) {
        setActionMessage(`Tenant ${tenant.name} status updated to ${nextStatus}.`);
        fetchTenants();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const triggerTestAlert = async () => {
    if (!selectedTenant) return;
    const tId = selectedTenant.id;
    setAlertStatus(prev => ({ ...prev, [tId]: 'sending' }));
    try {
      const res = await fetch(`/api/v1/superadmin/tenants/${tId}/trigger-test-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: alertChannel, message: customAlertMsg }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlertStatus(prev => ({ ...prev, [tId]: 'sent' }));
        setActionMessage(`Dispatched notice [${data.dispatch_id}] via ${data.channel} to ${selectedTenant.name}.`);
        setIsAlertModalOpen(false);
      } else {
        setAlertStatus(prev => ({ ...prev, [tId]: 'error' }));
      }
    } catch (err) {
      setAlertStatus(prev => ({ ...prev, [tId]: 'error' }));
      console.error(err);
    }
  };

  const purgeTenant = async (tenant: TenantItem) => {
    const confirmMessage =
      `CONFIRM WORKSPACE HARD PURGE: ${tenant.name} (${tenant.slug})\n\n` +
      `Automated Pre-Purge Archival Protocol:\n` +
      `1. Full JSON backup of tenant's 5-deep ledger, accounts, and customs manifests will be generated and archived.\n` +
      `2. Non-destructive AES-256-GCM encrypted snapshot (.enc.tar.gz) will be saved to persistent storage.\n` +
      `3. Tenant database rows and schemas will then be permanently wiped.\n\n` +
      `Do you want to proceed with the pre-purge backup and permanent wipe?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/superadmin/tenants/${tenant.id}/purge`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        const accountsCount = data.records_archived?.accounts ?? 'all';
        const entriesCount = data.records_archived?.journal_entries ?? 'all';
        setActionMessage(
          `Tenant purged! Pre-purge JSON backup preserved (${accountsCount} accounts, ${entriesCount} journal entries). Snapshot archive: ${data.backup_archive}`
        );
        fetchTenants();
      } else {
        const err = await res.json();
        alert(`Purge failed: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchiveUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/v1/superadmin/tenants/restore-upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        const accs = data.records_reconstituted?.accounts ?? 'all';
        const jes = data.records_reconstituted?.journal_entries ?? 'all';
        setActionMessage(`✅ Reconstituted workspace "${data.name}" [${data.slug}]! Restored ${accs} accounts and ${jes} journal entries.`);
        fetchTenants();
      } else {
        const err = await res.json();
        alert(`Restoration failed: ${err.detail || 'Upload processing error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to restoration gateway.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRestoreUpload = handleArchiveUpload;

  return (
    <div className="min-h-dvh erp-viewport-root bg-slate-950 text-slate-100 font-sans px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white">Tenant Life-Cycle Cockpit</h1>
                <p className="text-xs text-slate-400 font-mono">/admin/tenants • OxenGL Multi-Tenant Grid Controller</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold hover:border-sky-500 hover:text-sky-400 transition-colors">
              <Upload className="h-4 w-4" />
              <span>{isUploading ? 'Reconstituting...' : 'Restore Archive'}</span>
              <input type="file" accept=".json,.gz,.enc,.tar" onChange={handleArchiveUpload} className="hidden" disabled={isUploading} />
            </label>
            <a href="/admin/logs" className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold hover:bg-slate-800 transition-colors">
              Audit Logs
            </a>
            <a href="/admin/analytics" className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold hover:bg-slate-800 transition-colors">
              Velocity Analytics
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
          </div>
        </div>

        {/* Disaster Recovery & Node Reconstitution Banner */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-sky-950/40 to-slate-900 border border-sky-500/30 shadow-lg shadow-sky-950/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="h-11 w-11 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-wide">Disaster Recovery & Node Reconstitution</h2>
                  <span className="px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono font-semibold text-sky-400">
                    JSON / .ENC.TAR.GZ
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                  Reconstitute isolated workspace entities, 5-deep Chart of Accounts, Journal Entries, and Customs Manifests from pre-purge JSON files or encrypted cold archives.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <label className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md ${
                isUploading
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 cursor-wait animate-pulse'
                  : 'bg-sky-600 hover:bg-sky-500 text-white hover:shadow-sky-500/25 border border-sky-400/40'
              }`}>
                <Upload className={`h-4 w-4 ${isUploading ? 'animate-bounce' : ''}`} />
                <span>{isUploading ? 'Reconstituting Workspace...' : 'Upload Archive / JSON'}</span>
                <input
                  type="file"
                  accept=".json,.gz,.enc,.tar"
                  onChange={handleArchiveUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Action alert feedback */}
        {actionMessage && (
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>{actionMessage}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">&times;</button>
          </div>
        )}

        {/* Search and stats bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by tenant name, slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <span>Total Workspaces: <strong className="text-white">{tenants.length}</strong></span>
            <span>Active: <strong className="text-emerald-400">{tenants.filter(t => t.is_active).length}</strong></span>
            <button onClick={fetchTenants} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Grid / Table */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={bulk.isAllSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = bulk.isIndeterminate;
                      }}
                      onChange={bulk.toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      title="Select All Workspaces"
                    />
                  </th>
                  <th className="py-3 px-4">Workspace Entity</th>
                  <th className="py-3 px-4">Domain Slug</th>
                  <th className="py-3 px-4">Tier & Tax</th>
                  <th className="py-3 px-4">Theme</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {tenants.map((t) => (
                  <tr key={t.id} className={`hover:bg-slate-800/20 transition-colors ${bulk.isSelected(t.id) ? 'bg-sky-950/30' : ''}`}>
                    <td className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={bulk.isSelected(t.id)}
                        onChange={() => bulk.toggleSelect(t.id)}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        title={`Select ${t.name}`}
                      />
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-white text-xs" style={{ backgroundColor: t.primary_color || '#0ea5e9' }}>
                          {t.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div>{t.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono"><span dir="ltr" className="inline-block unicode-bidi-isolate">{t.id}</span></div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-sky-400"><span dir="ltr" className="inline-block unicode-bidi-isolate">{t.slug}.oxengl.me</span></td>
                    <td className="py-3 px-4 text-slate-400">
                      <div><span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300 whitespace-nowrap shrink-0">{t.subscription_tier || 'PRO'}</span></div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5"><span dir="ltr" className="inline-block unicode-bidi-isolate">{t.currency} • {t.tax_id || 'N/A'}</span></div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="h-3.5 w-3.5 rounded-full border border-slate-700 shrink-0" style={{ backgroundColor: t.primary_color }} title={`Primary: ${t.primary_color}`} />
                        <span className="h-3.5 w-3.5 rounded-full border border-slate-700 shrink-0" style={{ backgroundColor: t.secondary_color }} title={`Secondary: ${t.secondary_color}`} />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 ${
                        t.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {t.is_active ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                        {t.status || (t.is_active ? 'ACTIVE' : 'SUSPENDED')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => toggleTenantStatus(t)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] transition-colors whitespace-nowrap shrink-0"
                        >
                          {t.is_active ? 'Suspend' : 'Activate'}
                        </button>
                        <button
                          onClick={() => { setSelectedTenant(t); setIsAlertModalOpen(true); }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                            alertStatus[t.id] === 'sent'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : alertStatus[t.id] === 'sending'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}
                          title="Trigger Multi-Channel Lifecycle Notice"
                        >
                          <Bell className="h-3 w-3" />
                          <span>
                            {alertStatus[t.id] === 'sending'
                              ? 'Sending...'
                              : alertStatus[t.id] === 'sent'
                              ? 'Notice Sent'
                              : 'Trigger Notice'}
                          </span>
                        </button>
                        <button
                          onClick={() => purgeTenant(t)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                          title="Purge and Encrypt Snapshot"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No matching tenant workspaces identified.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Emergency Alert Modal */}
      {isAlertModalOpen && selectedTenant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-400" />
              Trigger Notice: {selectedTenant.name}
            </h3>
            <p className="text-xs text-slate-400">Transmit simulated or live lifecycle test notice to workspace notification hooks.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Notice Channel</label>
                <select
                  value={alertChannel}
                  onChange={(e) => setAlertChannel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white"
                >
                  <option value="ALL">Omni-Channel (Email + WhatsApp)</option>
                  <option value="EMAIL">SMTP Relay Warning Only</option>
                  <option value="WHATSAPP">WhatsApp Gateway Direct</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Message Content</label>
                <textarea
                  rows={3}
                  value={customAlertMsg}
                  onChange={(e) => setCustomAlertMsg(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsAlertModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={triggerTestAlert}
                disabled={alertStatus[selectedTenant.id] === 'sending'}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                <Bell className="h-4 w-4" />
                <span>
                  {alertStatus[selectedTenant.id] === 'sending'
                    ? 'Transmitting Notice...'
                    : 'Trigger Notice Now'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedIds={bulk.selectedIds}
        onClearSelection={bulk.clearSelection}
        actions={bulkActions}
        itemLabel="tenants"
      />
    </div>
  );
};
