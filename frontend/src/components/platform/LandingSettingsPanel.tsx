import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Globe,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Upload,
} from 'lucide-react';
import { authFetch } from '../../services/api';
import {
  DEFAULT_SITE_SETTINGS,
  fetchPublicSiteSettings,
  notifySiteSettingsUpdated,
  SITE_SETTING_KEYS,
  SiteSettings,
} from '../../hooks/useSiteSettings';
import { BrandWordmark } from '../../views/landing/BrandWordmark';

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-100 placeholder-slate-500 outline-none transition focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 disabled:opacity-50';

const REFERENCE_TAGLINE =
  'Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.';

export const LandingSettingsPanel: React.FC = () => {
  const [form, setForm] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPublicSiteSettings()
      .then((data) => setForm((prev) => ({ ...prev, ...data })))
      .catch(() => setMessage({ ok: false, text: 'Could not load current site settings.' }))
      .finally(() => setLoading(false));
  }, []);

  const handleLogoFileUpload = async (file: File) => {
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({
        ok: false,
        text: 'Unsupported image format. Please select PNG, SVG, JPEG, or WebP.',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ ok: false, text: 'Logo image exceeds the 5MB size limit.' });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await authFetch('/api/settings/upload-logo', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.logo_url) {
          setForm((prev) => ({ ...prev, site_logo: data.logo_url }));
          notifySiteSettingsUpdated({ site_logo: data.logo_url });
          setMessage({
            ok: true,
            text: 'Logo uploaded and hosted on backend server successfully.',
          });
        }
      } else {
        // Fallback to local base64 reader if multipart endpoint returns error
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Data = e.target?.result as string;
          if (base64Data) {
            setForm((prev) => ({ ...prev, site_logo: base64Data }));
            setMessage({ ok: true, text: 'Logo loaded as data URL (click Save to persist).' });
          }
        };
        reader.readAsDataURL(file);
      }
    } catch {
      // Fallback: direct FileReader base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target?.result as string;
        if (base64Data) {
          setForm((prev) => ({ ...prev, site_logo: base64Data }));
          setMessage({ ok: true, text: 'Logo loaded as local data URL buffer.' });
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleLogoFileUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleLogoFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const resetLogoToDefault = () => {
    setForm((prev) => ({ ...prev, site_logo: '/oxengl-wordmark.svg', site_name: 'OxenGL' }));
    setMessage({ ok: true, text: 'Logo reset to official OxenGL default.' });
  };

  const resetTaglineToReference = () => {
    setForm((prev) => ({
      ...prev,
      site_description: REFERENCE_TAGLINE,
      site_tagline: REFERENCE_TAGLINE,
    }));
    setMessage({ ok: true, text: 'Tagline reset to image_8a1328.png design reference text.' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    // Keep description and tagline synced
    const effectiveTagline = form.site_description || form.site_tagline || REFERENCE_TAGLINE;
    const payload = {
      ...form,
      site_description: effectiveTagline,
      site_tagline: effectiveTagline,
    };

    try {
      const res = await authFetch('/api/settings/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SITE_SETTING_KEYS.map((key) => ({ key, value: payload[key] || '' }))),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const detail = typeof err?.detail === 'string' ? err.detail : `Request failed (${res.status})`;
        throw new Error(detail);
      }

      notifySiteSettingsUpdated(payload);
      setMessage({
        ok: true,
        text: 'All site settings, logo, and tagline saved successfully to database.',
      });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mb-8 rounded-2xl border border-slate-800/90 bg-slate-900/95 p-6 shadow-2xl text-slate-100"
    >
      {/* Panel Header */}
      <div className="flex flex-col gap-2 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="text-base font-black text-white">
              Dynamic Front-End Content &amp; Platform Identity
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Control the main platform logo and descriptive tagline rendered across{' '}
            <span className="font-mono text-amber-300">https://oxengl.me</span> (Design Reference:{' '}
            <span className="font-mono text-slate-300">image_8a1328.png</span>).
          </p>
        </div>
        <span className="inline-flex self-start sm:self-auto items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-300">
          <Globe className="h-3 w-3" />
          Database-Driven Schema
        </span>
      </div>

      <div className="mt-6 space-y-6">
        {/* ==================================================================== */}
        {/* SECTION 1: Platform Logo Upload & Identity Configuration             */}
        {/* ==================================================================== */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400">
              <ImageIcon className="h-4 w-4" />
              1. Main Platform Logo &amp; Identity (OxenGL)
            </h4>
            <button
              type="button"
              onClick={resetLogoToDefault}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Default Logo
            </button>
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-12">
            {/* Live Logo Preview Box */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-center">
              <p className="text-[11px] font-bold text-slate-400 mb-3">Live Logo Render</p>
              <div className="flex items-center justify-center min-h-[64px] w-full">
                <BrandWordmark
                  height={30}
                  logoUrl={form.site_logo}
                  siteName={form.site_name || 'OxenGL'}
                />
              </div>
              <p className="mt-3 text-[10px] text-slate-500">
                Rendered on luxury navy tile (header &amp; footer style)
              </p>
            </div>

            {/* Logo Upload Dropzone & Controls */}
            <div className="lg:col-span-8 space-y-3">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition ${
                  isDragOver
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-950/80'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={onFileInputChange}
                  className="hidden"
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">
                      Uploading logo to server...
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 py-1">
                    <Upload className="h-6 w-6 text-slate-400" />
                    <p className="text-xs font-bold text-slate-200">
                      Click to choose file or drag &amp; drop logo here
                    </p>
                    <p className="text-[10px] text-slate-500">
                      PNG, SVG, JPEG, or WebP • Max size 5MB
                    </p>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-bold text-slate-300">
                  Site Name / Wordmark Alt Text
                  <input
                    type="text"
                    required
                    maxLength={100}
                    disabled={loading}
                    value={form.site_name || ''}
                    onChange={(e) => setForm({ ...form, site_name: e.target.value })}
                    placeholder="OxenGL"
                    className={inputClass}
                  />
                </label>
                <label className="block text-[11px] font-bold text-slate-300">
                  Logo Asset Path or URL
                  <input
                    type="text"
                    required
                    maxLength={2000}
                    disabled={loading}
                    value={form.site_logo || ''}
                    onChange={(e) => setForm({ ...form, site_logo: e.target.value })}
                    placeholder="/oxengl-wordmark.svg"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* SECTION 2: Descriptive Tagline Text (image_8a1328.png)              */}
        {/* ==================================================================== */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400">
              <Globe className="h-4 w-4" />
              2. Descriptive Tagline Text (Landing Page Footer Copy)
            </h4>
            <button
              type="button"
              onClick={resetTaglineToReference}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Reference Copy
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <label className="block text-xs font-bold text-slate-300">
              Platform Descriptive Tagline (Footer Description)
              <span className="block mt-0.5 text-[11px] font-normal text-slate-400">
                Populates the footer brand paragraph below the logo on the main website (referenced
                in <span className="font-mono text-amber-300">image_8a1328.png</span>).
              </span>
              <textarea
                rows={3}
                required
                maxLength={2000}
                disabled={loading}
                value={form.site_description || form.site_tagline || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    site_description: e.target.value,
                    site_tagline: e.target.value,
                  })
                }
                className={inputClass}
                placeholder={REFERENCE_TAGLINE}
              />
            </label>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Dynamic key: site_description / site_tagline</span>
              <span>{(form.site_description || form.site_tagline || '').length} / 2000 chars</span>
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* SECTION 3: Live Reference Mockup Preview (image_8a1328.png)          */}
        {/* ==================================================================== */}
        <div className="rounded-xl border border-amber-500/20 bg-slate-950/80 p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400 mb-3">
            <Eye className="h-4 w-4" />
            Live Preview: Landing Page Footer Brand Block (image_8a1328.png)
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#070d18] p-5 shadow-inner">
            <div className="max-w-md space-y-3">
              <div className="inline-block">
                <BrandWordmark
                  height={24}
                  logoUrl={form.site_logo}
                  siteName={form.site_name || 'OxenGL'}
                />
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                {form.site_description || form.site_tagline || REFERENCE_TAGLINE}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="rounded-md border border-slate-800 bg-slate-900/90 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                  ISO 27001 COMPLIANT
                </span>
                <span className="rounded-md border border-slate-800 bg-slate-900/90 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                  ZATCA PHASE 2 QUALIFIED
                </span>
                <span className="rounded-md border border-slate-800 bg-slate-900/90 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                  NDMO REGULATORY ALIGNED
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* SECTION 4: Landing Page Headlines & Footer Contact Details           */}
        {/* ==================================================================== */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-400">
            3. Landing Headlines &amp; Footer Contact Details
          </h4>

          <div className="space-y-3.5">
            <label className="block text-xs font-bold text-slate-300">
              Landing Hero Headline
              <span className="block text-[10px] font-normal text-slate-400">
                Wrap accent words in [highlight]...[/highlight]
              </span>
              <textarea
                rows={2}
                required
                maxLength={2000}
                disabled={loading}
                value={form.landing_headline || ''}
                onChange={(e) => setForm({ ...form, landing_headline: e.target.value })}
                className={inputClass}
              />
            </label>

            <label className="block text-xs font-bold text-slate-300">
              Landing Hero Subheadline
              <textarea
                rows={2}
                required
                maxLength={2000}
                disabled={loading}
                value={form.landing_subheadline || ''}
                onChange={(e) => setForm({ ...form, landing_subheadline: e.target.value })}
                className={inputClass}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-bold text-slate-300">
                Contact Email
                <input
                  type="email"
                  required
                  maxLength={2000}
                  disabled={loading}
                  value={form.contact_email || ''}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="block text-xs font-bold text-slate-300">
                Contact Phone
                <input
                  type="tel"
                  required
                  maxLength={2000}
                  disabled={loading}
                  value={form.contact_phone || ''}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="block text-xs font-bold text-slate-300">
                Contact Address
                <input
                  type="text"
                  required
                  maxLength={2000}
                  disabled={loading}
                  value={form.contact_address || ''}
                  onChange={(e) => setForm({ ...form, contact_address: e.target.value })}
                  className={inputClass}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {message && (
        <div
          role="status"
          className={`mt-4 flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${
            message.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          {message.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Save Button */}
      <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-5">
        <p className="text-[11px] text-slate-400">
          Changes are stored in PostgreSQL and take effect immediately.
        </p>
        <button
          type="submit"
          disabled={saving || loading || isUploading}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:opacity-50 transition"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All Site Settings
        </button>
      </div>
    </form>
  );
};
