import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { authFetch } from '../../services/api';
import { fetchPublicSiteSettings, SITE_SETTING_KEYS, SiteSettings } from '../../hooks/useSiteSettings';

const EMPTY: SiteSettings = {
  landing_headline: '', landing_subheadline: '', contact_email: '', contact_phone: '', contact_address: '',
};

const FIELDS: { key: keyof SiteSettings; label: string; multiline?: boolean; type?: string }[] = [
  { key: 'landing_headline', label: 'Landing Headline', multiline: true },
  { key: 'landing_subheadline', label: 'Landing Subheadline', multiline: true },
  { key: 'contact_email', label: 'Contact Email', type: 'email' },
  { key: 'contact_phone', label: 'Contact Phone', type: 'tel' },
  { key: 'contact_address', label: 'Contact Address' },
];

const inputClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-100 outline-none focus:border-indigo-500';

export const LandingSettingsPanel: React.FC = () => {
  const [form, setForm] = useState<SiteSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchPublicSiteSettings()
      .then((data) => setForm((prev) => ({ ...prev, ...data })))
      .catch(() => setMessage({ ok: false, text: 'Could not load current landing page settings.' }))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await authFetch('/api/settings/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SITE_SETTING_KEYS.map((key) => ({ key, value: form[key] }))),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const detail = typeof err?.detail === 'string' ? err.detail : `Request failed (${res.status})`;
        throw new Error(detail);
      }
      setMessage({ ok: true, text: 'Landing page settings saved.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-6 rounded-2xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-xl text-slate-100">
      <h3 className="text-sm font-black">Public Landing Page &amp; Footer Contact</h3>
      <p className="text-[11px] text-slate-500">Content shown on the public landing page.</p>
      <div className="mt-4 space-y-3.5">
        {FIELDS.map(({ key, label, multiline, type }) => (
          <label key={key} className="block text-xs font-bold text-slate-300">
            {label}
            {key === 'landing_headline' && <span className="block text-[10px] font-normal text-slate-500">Wrap accent words in [highlight]...[/highlight]</span>}
            {multiline ? (
              <textarea rows={3} required maxLength={2000} disabled={loading} value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
            ) : (
              <input type={type ?? 'text'} required maxLength={2000} disabled={loading} value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
            )}
          </label>
        ))}
      </div>
      {message && <p role="status" className={`mt-3 text-xs font-bold ${message.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{message.text}</p>}
      <button type="submit" disabled={saving || loading}
        className="mt-4 flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-xs font-black text-white hover:brightness-110 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Landing Page Settings
      </button>
    </form>
  );
};
