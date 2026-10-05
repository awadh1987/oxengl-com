import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, MessageSquareText, Pencil, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import {
  CommunicationChannel,
  CommunicationProvider,
  CommunicationSettingDto,
  CommunicationSettingWritePayload,
  erpApi,
} from '../../services/api';

interface CommunicationsTabProps {
  isAr?: boolean;
  superAdmin?: boolean;
}

const providerOptions: Record<CommunicationChannel, CommunicationProvider[]> = {
  email: ['smtp', 'sendgrid'],
  sms: ['twilio', 'unifonic', 'taqnyat'],
};

const providerLabels: Record<CommunicationProvider, string> = {
  smtp: 'SMTP', sendgrid: 'SendGrid', twilio: 'Twilio', unifonic: 'Unifonic', taqnyat: 'Taqnyat',
};

const configFields: Record<CommunicationProvider, { key: string; label: string; type?: string; defaultValue?: string }[]> = {
  smtp: [
    { key: 'host', label: 'SMTP host' },
    { key: 'port', label: 'Port', defaultValue: '587' },
    { key: 'security', label: 'Transport security (starttls / ssl)', defaultValue: 'starttls' },
    { key: 'username', label: 'Username (optional)' },
  ],
  sendgrid: [{ key: 'region', label: 'Region', defaultValue: 'global' }],
  twilio: [
    { key: 'account_sid', label: 'Account SID' },
    { key: 'region', label: 'Region', defaultValue: 'us1' },
  ],
  unifonic: [{ key: 'region', label: 'Region', defaultValue: 'global' }],
  taqnyat: [{ key: 'region', label: 'Region', defaultValue: 'global' }],
};

const credentialFields: Record<CommunicationProvider, { key: string; label: string; required: boolean }[]> = {
  smtp: [{ key: 'password', label: 'SMTP password', required: false }],
  sendgrid: [{ key: 'api_key', label: 'API key', required: true }],
  twilio: [{ key: 'auth_token', label: 'Auth token', required: true }],
  unifonic: [{ key: 'app_sid', label: 'App SID', required: true }],
  taqnyat: [{ key: 'api_token', label: 'API token', required: true }],
};

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500';
const buttonClass = 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50';

export const CommunicationsTab: React.FC<CommunicationsTabProps> = ({ isAr = false, superAdmin = false }) => {
  const [settings, setSettings] = useState<CommunicationSettingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [editing, setEditing] = useState<CommunicationSettingDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [channel, setChannel] = useState<CommunicationChannel>('email');
  const [provider, setProvider] = useState<CommunicationProvider>('smtp');
  const [senderIdentity, setSenderIdentity] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [active, setActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = superAdmin
        ? await erpApi.getSuperAdminCommunicationSettings({
            scope: scopeFilter || undefined,
            channel: channelFilter || undefined,
            tenant_id: tenantFilter || undefined,
          })
        : await erpApi.listCommunicationSettings();
      setSettings(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load communication settings.');
    } finally {
      setLoading(false);
    }
  }, [superAdmin, scopeFilter, channelFilter, tenantFilter]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setFormOpen(false);
    setEditing(null);
    setChannel('email');
    setProvider('smtp');
    setSenderIdentity('');
    setConfig({});
    setCredentials({});
    setActive(true);
  };

  const beginEdit = (row?: CommunicationSettingDto) => {
    if (!row) {
      setEditing(null);
      setChannel('email');
      setProvider('smtp');
      setSenderIdentity('');
      setConfig({});
      setCredentials({});
      setActive(true);
      setError('');
      setFormOpen(true);
      return;
    }
    setFormOpen(true);
    setEditing(row);
    setChannel(row.channel);
    setProvider(row.provider);
    setSenderIdentity(row.sender_identity);
    setConfig(Object.fromEntries(Object.entries(row.config).map(([key, value]) => [key, String(value)])));
    setCredentials({});
    setActive(row.is_active);
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const submittedCredentials = Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim()));
    const payload: CommunicationSettingWritePayload = {
      channel,
      provider,
      sender_identity: senderIdentity,
      config: Object.fromEntries(Object.entries(config).filter(([, value]) => value !== '')),
      is_active: active,
      ...(Object.keys(submittedCredentials).length ? { credentials: submittedCredentials } : {}),
    };
    try {
      if (superAdmin) {
        if (editing) await erpApi.updateSuperAdminCommunicationSetting(editing.id, payload);
        else await erpApi.createSuperAdminCommunicationSetting(payload);
      } else if (editing) {
        await erpApi.updateCommunicationSetting(editing.id, payload);
      } else {
        await erpApi.createCommunicationSetting(payload);
      }
      setNotice(isAr ? 'تم حفظ الإعدادات.' : 'Communication settings saved.');
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save communication settings.');
    } finally {
      setCredentials({});
      setSaving(false);
    }
  };

  const test = async (row: CommunicationSettingDto) => {
    const recipient = window.prompt(row.channel === 'email' ? 'Test recipient email address' : 'Test recipient mobile number');
    if (!recipient?.trim()) return;
    setError('');
    setNotice('');
    try {
      const result = superAdmin
        ? await erpApi.testSuperAdminCommunicationSetting(row.id, recipient.trim())
        : await erpApi.testCommunicationSetting(row.id, recipient.trim());
      setNotice(`${row.sender_identity}: ${result.message}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test delivery failed.');
    }
  };

  const remove = async (row: CommunicationSettingDto) => {
    if (!window.confirm(`Delete ${row.channel.toUpperCase()} configuration for ${row.tenant_name || 'this workspace'}?`)) return;
    setError('');
    try {
      if (superAdmin) await erpApi.deleteSuperAdminCommunicationSetting(row.id);
      else await erpApi.deleteCommunicationSetting(row.id);
      if (editing?.id === row.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete communication setting.');
    }
  };

  const visibleSettings = settings.filter((row) => !superAdmin || !tenantFilter || row.tenant_id === tenantFilter);

  return (
    <section className="space-y-5" data-testid={superAdmin ? 'superadmin-communications' : 'tenant-communications'}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{isAr ? 'الاتصالات' : 'Communications'}</h2>
          <p className="mt-1 text-xs text-slate-400">
            {superAdmin
              ? 'Manage platform defaults and inspect tenant overrides. Tenant settings are read-only here.'
              : 'Configure transactional email and SMS delivery for this workspace.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className={`${buttonClass} border border-slate-700 bg-slate-900 text-slate-200`}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {(!superAdmin || (scopeFilter !== 'tenant' && !tenantFilter)) && (
            <button type="button" onClick={() => beginEdit()} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>
              <Plus className="h-3.5 w-3.5" /> Add setting
            </button>
          )}
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}

      {superAdmin && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)} className={inputClass} aria-label="Filter by scope">
            <option value="">All scopes</option><option value="platform">Platform defaults</option><option value="tenant">Tenant overrides</option>
          </select>
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} className={inputClass} aria-label="Filter by channel">
            <option value="">All channels</option><option value="email">Email</option><option value="sms">SMS</option>
          </select>
          <input value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)} placeholder="Filter by tenant UUID" className={inputClass} aria-label="Filter by tenant" />
        </div>
      )}

      {formOpen ? (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">{editing ? `Edit ${editing.channel.toUpperCase()} setting` : 'New communication setting'}</h3>
            <button type="button" onClick={resetForm} className="rounded p-1 text-slate-400 hover:text-white" aria-label="Cancel"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-300">Channel
              <select value={channel} disabled={Boolean(editing)} onChange={(event) => {
                const next = event.target.value as CommunicationChannel;
                setChannel(next); setProvider(providerOptions[next][0]); setConfig({}); setCredentials({});
              }} className={inputClass}>
                <option value="email">Email</option><option value="sms">SMS</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-300">Provider
              <select value={provider} disabled={Boolean(editing)} onChange={(event) => {
                setProvider(event.target.value as CommunicationProvider); setConfig({}); setCredentials({});
              }} className={inputClass}>
                {providerOptions[channel].map((option) => <option key={option} value={option}>{providerLabels[option]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
              {channel === 'email' ? 'Sender identity (email or display name <email>)' : 'Sender identity (sender ID or number)'}
              <input required value={senderIdentity} onChange={(event) => setSenderIdentity(event.target.value)} className={inputClass} maxLength={255} />
            </label>
            {configFields[provider].map((field) => (
              <label key={field.key} className="space-y-1 text-xs text-slate-300">{field.label}
                <input
                  required={provider === 'smtp' && field.key === 'host' || provider === 'twilio' && field.key === 'account_sid'}
                  type={field.type || 'text'} value={config[field.key] ?? field.defaultValue ?? ''}
                  onChange={(event) => setConfig((previous) => ({ ...previous, [field.key]: event.target.value }))}
                  className={inputClass} autoComplete="off"
                />
              </label>
            ))}
            {credentialFields[provider].map((field) => (
              <label key={field.key} className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                {field.label} {field.required ? '(required for new settings)' : '(optional)'}
                <input
                  type="password" required={field.required && !editing}
                  value={credentials[field.key] || ''}
                  onChange={(event) => setCredentials((previous) => ({ ...previous, [field.key]: event.target.value }))}
                  className={inputClass} autoComplete="new-password" placeholder={editing?.has_credential ? 'Stored credential; leave blank to keep unchanged' : 'Write-only credential'}
                />
              </label>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="accent-indigo-500" /> Active
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={resetForm} className={`${buttonClass} border border-slate-700 text-slate-300`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}><Send className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save setting'}</button>
          </div>
        </form>
      ) : null}

      {loading ? <div className="py-8 text-center text-xs text-slate-500">Loading communication settings…</div> : visibleSettings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">No communication settings match this view.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {visibleSettings.map((row) => {
            const readOnly = superAdmin && row.tenant_id !== null;
            return (
              <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="rounded-lg bg-indigo-500/10 p-2 text-indigo-300">{row.channel === 'email' ? <Mail className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}</span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-white">{row.sender_identity}</h3>
                      <p className="mt-1 text-xs text-slate-400">{row.channel.toUpperCase()} · {providerLabels[row.provider]}{superAdmin ? ` · ${row.tenant_name || 'Platform default'}` : ''}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{row.has_credential ? 'Credential stored' : 'No credential'} · {row.is_active ? 'Active' : 'Inactive'}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${row.is_active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>{row.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                </div>
                <div className="mt-3 text-[11px] text-slate-400">
                  Last test: {row.last_test_at ? new Date(row.last_test_at).toLocaleString() : 'Never'}
                  {row.last_test_status && <span className={row.last_test_status === 'success' ? ' text-emerald-300' : ' text-rose-300'}> · {row.last_test_status}</span>}
                  {row.last_test_error && <p className="mt-1 text-rose-300">{row.last_test_error}</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!readOnly && <>
                    <button type="button" onClick={() => beginEdit(row)} className={`${buttonClass} border border-slate-700 text-slate-300`}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                    <button type="button" onClick={() => void test(row)} className={`${buttonClass} border border-slate-700 text-slate-300`}><Send className="h-3.5 w-3.5" /> Test</button>
                    <button type="button" onClick={() => void remove(row)} className={`${buttonClass} border border-rose-500/30 text-rose-300`}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </>}
                  {readOnly && <span className="text-[11px] text-slate-500">Tenant override · read-only</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default CommunicationsTab;
