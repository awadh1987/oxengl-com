import React, { useCallback, useEffect, useState } from 'react';
import { CloudUpload, Trash2, Pencil, PlugZap, RefreshCw, CheckCircle2, AlertCircle, Plus, X } from 'lucide-react';
import {
  erpApi,
  BackupDestinationDto,
  BackupDestinationWritePayload,
  BackupProviderType,
  BackupRunLogDto,
} from '../../services/api';

/**
 * "Data Backups & Archives" tab.
 *
 * Security notes:
 *  - The backend derives the company from the authenticated session; no tenant id is ever sent.
 *  - Credential inputs are write-only: they live in component state only while the form is open,
 *    are cleared after every submit / cancel / provider change, and are never rendered back.
 *    The API only returns `has_credential` (boolean).
 */

interface BackupDestinationsTabProps {
  isAr?: boolean;
}

const PROVIDERS: { value: BackupProviderType; label: string }[] = [
  { value: 'gdrive', label: 'Google Drive' },
  { value: 'onedrive', label: 'Microsoft OneDrive' },
  { value: 'sftp', label: 'SFTP' },
];

const CREDENTIAL_FIELDS: Record<BackupProviderType, { key: string; label: string; multiline?: boolean; optional?: boolean }[]> = {
  gdrive: [
    { key: 'client_id', label: 'OAuth Client ID' },
    { key: 'client_secret', label: 'OAuth Client Secret' },
    { key: 'refresh_token', label: 'Refresh Token' },
  ],
  onedrive: [
    { key: 'client_id', label: 'Application (client) ID' },
    { key: 'client_secret', label: 'Client Secret', optional: true },
    { key: 'refresh_token', label: 'Refresh Token' },
  ],
  sftp: [{ key: 'private_key', label: 'Private Key (PEM)', multiline: true }],
};

interface FormState {
  provider_type: BackupProviderType;
  name: string;
  base_path: string;
  folder_id: string;
  onedrive_tenant: string;
  host: string;
  port: string;
  username: string;
  pinned_host_key: string;
  is_active: boolean;
  credentials: Record<string, string>;
}

const emptyForm = (): FormState => ({
  provider_type: 'gdrive',
  name: '',
  base_path: '/oxengl-backups',
  folder_id: '',
  onedrive_tenant: '',
  host: '',
  port: '22',
  username: '',
  pinned_host_key: '',
  is_active: true,
  credentials: {},
});

const inputCls =
  'w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500';

export const formatBytes = (n?: number | null): string => {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
};

export const formatTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export const providerLabel = (p?: string | null): string => PROVIDERS.find((x) => x.value === p)?.label ?? (p || '—');

export const StatusBadge: React.FC<{ status?: string | null }> = ({ status }) => {
  const tone =
    status === 'success'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : status === 'failed'
        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        : status === 'running'
          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          : 'bg-slate-800 text-slate-400 border-slate-700';
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${tone}`}>{status || 'never run'}</span>;
};

const buildConfig = (f: FormState): Record<string, any> => {
  if (f.provider_type === 'gdrive') {
    return { base_path: f.base_path.trim(), ...(f.folder_id.trim() ? { folder_id: f.folder_id.trim() } : {}) };
  }
  if (f.provider_type === 'onedrive') {
    return { base_path: f.base_path.trim(), ...(f.onedrive_tenant.trim() ? { tenant: f.onedrive_tenant.trim() } : {}) };
  }
  return {
    base_path: f.base_path.trim(),
    host: f.host.trim(),
    port: Number(f.port) || 22,
    username: f.username.trim(),
    pinned_host_key: f.pinned_host_key.trim(),
  };
};

const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'Request failed');

export const BackupDestinationsTab: React.FC<BackupDestinationsTabProps> = ({ isAr = false }) => {
  const [destinations, setDestinations] = useState<BackupDestinationDto[]>([]);
  const [logs, setLogs] = useState<BackupRunLogDto[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const LOG_PAGE_SIZE = 20;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [dest, runLogs] = await Promise.all([
        erpApi.listBackupDestinations({ page_size: 200 }),
        erpApi.listBackupRunLogs({ page: logPage, page_size: LOG_PAGE_SIZE }),
      ]);
      setDestinations(dest.items);
      setLogs(runLogs.items);
      setLogTotal(runLogs.total);
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setLoading(false);
    }
  }, [logPage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const closeForm = () => {
    // Drop any credential material held in state.
    setForm(emptyForm());
    setEditingId(null);
    setFormOpen(false);
  };

  const openCreate = () => {
    setForm(emptyForm());
    setEditingId(null);
    setFormOpen(true);
    setMessage(null);
  };

  const openEdit = (d: BackupDestinationDto) => {
    const c = d.config || {};
    setForm({
      ...emptyForm(),
      provider_type: d.provider_type,
      name: d.name,
      base_path: c.base_path || '',
      folder_id: c.folder_id && c.folder_id !== 'root' ? c.folder_id : '',
      onedrive_tenant: c.tenant || '',
      host: c.host || '',
      port: String(c.port || 22),
      username: c.username || '',
      pinned_host_key: c.pinned_host_key || '',
      is_active: d.is_active,
      credentials: {},
    });
    setEditingId(d.id);
    setFormOpen(true);
    setMessage(null);
  };

  const setCredential = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, credentials: { ...prev.credentials, [key]: value } }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const filled = Object.fromEntries(Object.entries(form.credentials).filter(([, v]) => v && v.trim() !== ''));
    const payload: BackupDestinationWritePayload = {
      name: form.name.trim(),
      config: buildConfig(form),
      is_active: form.is_active,
      // On edit, omitting credentials keeps the stored ones unchanged.
      ...(Object.keys(filled).length > 0 ? { credentials: filled } : {}),
    };
    try {
      if (editingId) {
        await erpApi.updateBackupDestination(editingId, payload);
      } else {
        await erpApi.createBackupDestination({ ...payload, provider_type: form.provider_type });
      }
      setMessage({ ok: true, text: isAr ? 'تم حفظ وجهة النسخ الاحتياطي' : 'Backup destination saved' });
      closeForm();
      await refresh();
    } catch (err) {
      // Credentials stay out of the error path; clear them anyway so a retry requires re-entry.
      setForm((prev) => ({ ...prev, credentials: {} }));
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (d: BackupDestinationDto) => {
    if (!window.confirm(isAr ? `حذف الوجهة "${d.name}"؟` : `Delete destination "${d.name}"?`)) return;
    setBusy(true);
    try {
      await erpApi.deleteBackupDestination(d.id);
      setMessage({ ok: true, text: isAr ? 'تم حذف الوجهة' : 'Destination deleted' });
      await refresh();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async (d: BackupDestinationDto) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await erpApi.testBackupDestination(d.id);
      setMessage({ ok: result.ok, text: `${d.name}: ${result.message}` });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const totalLogPages = Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE));

  return (
    <div className="space-y-6 animate-in fade-in duration-150" data-testid="backup-destinations-tab">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">{isAr ? 'النسخ الاحتياطي والأرشفة' : 'Data Backups & Archives'}</h3>
          <p className="text-[11px] text-slate-400">
            {isAr
              ? 'يتم رفع نسخ بياناتك المشفرة إلى الوجهات المفعّلة أدناه. لا تُعرض بيانات الاعتماد بعد الحفظ.'
              : 'Encrypted backups of your data are uploaded to the active destinations below. Credentials are write-only and never shown after saving.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة وجهة' : 'Add destination'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          role="status"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${message.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}
        >
          {message.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{message.text}</span>
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleSubmit} autoComplete="off" className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 text-xs max-w-3xl">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">
              {editingId ? (isAr ? 'تعديل الوجهة' : 'Edit destination') : isAr ? 'وجهة جديدة' : 'New destination'}
            </span>
            <button type="button" onClick={closeForm} aria-label="Close" className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">{isAr ? 'المزوّد' : 'Provider'}</label>
              <select
                value={form.provider_type}
                disabled={!!editingId}
                onChange={(e) => setForm({ ...emptyForm(), provider_type: e.target.value as BackupProviderType, name: form.name })}
                className={inputCls}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">{isAr ? 'الاسم' : 'Name'}</label>
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">{isAr ? 'المسار الأساسي' : 'Base path'}</label>
              <input
                required
                value={form.base_path}
                placeholder="/oxengl-backups"
                onChange={(e) => setForm({ ...form, base_path: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>

            {form.provider_type === 'gdrive' && (
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Folder ID ({isAr ? 'اختياري' : 'optional'})</label>
                <input value={form.folder_id} onChange={(e) => setForm({ ...form, folder_id: e.target.value })} className={`${inputCls} font-mono`} />
              </div>
            )}
            {form.provider_type === 'onedrive' && (
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Azure Tenant ({isAr ? 'اختياري' : 'optional'})</label>
                <input value={form.onedrive_tenant} onChange={(e) => setForm({ ...form, onedrive_tenant: e.target.value })} className={`${inputCls} font-mono`} />
              </div>
            )}
            {form.provider_type === 'sftp' && (
              <>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Host</label>
                  <input required value={form.host} placeholder="sftp.example.com" onChange={(e) => setForm({ ...form, host: e.target.value })} className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Port</label>
                  <input type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">{isAr ? 'اسم المستخدم' : 'Username'}</label>
                  <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={`${inputCls} font-mono`} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-slate-400 font-semibold mb-1">{isAr ? 'بصمة مفتاح الخادم (Pinned host key)' : 'Pinned host key'}</label>
                  <input required value={form.pinned_host_key} placeholder="SHA256:…" onChange={(e) => setForm({ ...form, pinned_host_key: e.target.value })} className={`${inputCls} font-mono`} />
                </div>
              </>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-800">
            <p className="text-slate-400">
              {editingId
                ? isAr
                  ? 'اترك حقول الاعتماد فارغة للإبقاء على القيم المخزنة. لا يمكن عرضها.'
                  : 'Leave credential fields empty to keep the stored credentials. They cannot be displayed.'
                : isAr
                  ? 'بيانات الاعتماد للكتابة فقط ويتم تشفيرها على الخادم.'
                  : 'Credentials are write-only and encrypted on the server.'}
            </p>
            {CREDENTIAL_FIELDS[form.provider_type].map((field) => (
              <div key={field.key}>
                <label className="block text-slate-400 font-semibold mb-1">
                  {field.label}
                  {field.optional ? ` (${isAr ? 'اختياري' : 'optional'})` : ''}
                </label>
                {field.multiline ? (
                  // A PEM key is multi-line, which <input type="password"> would corrupt (newlines are stripped),
                  // so use a textarea visually masked like a password field.
                  <textarea
                    name={`backup-cred-${field.key}`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    rows={4}
                    required={!editingId && !field.optional}
                    value={form.credentials[field.key] || ''}
                    onChange={(e) => setCredential(field.key, e.target.value)}
                    style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
                    className={`${inputCls} font-mono resize-none`}
                  />
                ) : (
                  <input
                    type="password"
                    name={`backup-cred-${field.key}`}
                    autoComplete="new-password"
                    spellCheck={false}
                    required={!editingId && !field.optional}
                    value={form.credentials[field.key] || ''}
                    onChange={(e) => setCredential(field.key, e.target.value)}
                    className={`${inputCls} font-mono`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              <span>{isAr ? 'نشط' : 'Active'}</span>
            </label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={closeForm} className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white">
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" disabled={busy} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold inline-flex items-center gap-2">
                <CloudUpload className="w-4 h-4" />
                <span>{isAr ? 'حفظ' : 'Save'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Destinations grid */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table className="w-full text-xs text-start">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 text-start">{isAr ? 'المزوّد' : 'Provider'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'الاسم' : 'Name'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'الحالة' : 'Status'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'آخر نسخة' : 'Last backup'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {destinations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  {loading ? '…' : isAr ? 'لا توجد وجهات نسخ احتياطي خارجية.' : 'No external backup destinations configured.'}
                </td>
              </tr>
            )}
            {destinations.map((d) => (
              <tr key={d.id} className="text-slate-200">
                <td className="px-3 py-2">{providerLabel(d.provider_type)}</td>
                <td className="px-3 py-2">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {d.is_active ? (isAr ? 'نشط' : 'Active') : isAr ? 'متوقف' : 'Paused'} ·{' '}
                    {d.has_credential ? (isAr ? 'بيانات الاعتماد محفوظة' : 'credentials stored') : isAr ? 'بدون اعتماد' : 'no credentials'}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={d.last_status} />
                </td>
                <td className="px-3 py-2">{formatTime(d.last_backup_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button type="button" disabled={busy} onClick={() => void handleTest(d)} title="Test connection" className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-500 text-sky-400">
                      <PlugZap className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" disabled={busy} onClick={() => openEdit(d)} title="Edit" className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500 text-indigo-400">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" disabled={busy} onClick={() => void handleDelete(d)} title="Delete" className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500 text-rose-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Run history grid */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-white">{isAr ? 'سجل التشغيل' : 'Run history'}</h4>
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-start">{isAr ? 'الوجهة' : 'Destination'}</th>
                <th className="px-3 py-2 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="px-3 py-2 text-start">{isAr ? 'الحجم' : 'Size'}</th>
                <th className="px-3 py-2 text-start">{isAr ? 'بدأ' : 'Started'}</th>
                <th className="px-3 py-2 text-start">{isAr ? 'انتهى' : 'Completed'}</th>
                <th className="px-3 py-2 text-start">{isAr ? 'الخطأ' : 'Error'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    {loading ? '…' : isAr ? 'لا توجد عمليات بعد.' : 'No backup runs recorded yet.'}
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="text-slate-200">
                  <td className="px-3 py-2">
                    {l.destination_name || '—'} <span className="text-slate-500">({providerLabel(l.provider_type)})</span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="px-3 py-2">{formatBytes(l.file_size_bytes)}</td>
                  <td className="px-3 py-2">{formatTime(l.started_at)}</td>
                  <td className="px-3 py-2">{formatTime(l.completed_at)}</td>
                  <td className="px-3 py-2 text-rose-300 max-w-xs truncate" title={l.error_message || ''}>
                    {l.error_message || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 text-xs text-slate-400">
          <button type="button" disabled={logPage <= 1 || loading} onClick={() => setLogPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40">
            ‹
          </button>
          <span>
            {logPage} / {totalLogPages}
          </span>
          <button type="button" disabled={logPage >= totalLogPages || loading} onClick={() => setLogPage((p) => p + 1)} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40">
            ›
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupDestinationsTab;
