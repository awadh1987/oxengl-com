import React, { useState } from 'react';
import { redirectToTenantSubdomain, getRootDomain, isLocalhost } from '../utils/subdomain';

export interface TenantRegistrationViewProps {
  onSuccess?: () => void;
}

export const TenantRegistrationView: React.FC<TenantRegistrationViewProps> = ({ onSuccess }) => {
  const navigate = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // Clean empty initial state for all form fields
  const [formData, setFormData] = useState({
    nameAr: '',
    nameEn: '',
    slug: '',
    email: '',
  });
  const [domainMode, setDomainMode] = useState<'subdomain' | 'custom'>('subdomain');
  const [customDomain, setCustomDomain] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [useExternalDb, setUseExternalDb] = useState(false);
  const [externalDbHost, setExternalDbHost] = useState('');
  const [externalDbPort, setExternalDbPort] = useState('');
  const [externalDbName, setExternalDbName] = useState('');
  const [externalDbUser, setExternalDbUser] = useState('');
  const [externalDbPassword, setExternalDbPassword] = useState('');
  const [externalDbSslMode, setExternalDbSslMode] = useState('prefer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);

  const cleanDomain = (d: string) => {
    let clean = d.trim().toLowerCase();
    if (clean.includes('://')) clean = clean.split('://')[1];
    return clean.split('/')[0].split(':')[0].trim();
  };

  const handleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const resolvedCustomDomain = domainMode === 'custom' && customDomain.trim()
      ? cleanDomain(customDomain)
      : undefined;

    if (domainMode === 'custom' && !resolvedCustomDomain) {
      setError("Please specify a valid custom domain (e.g. erp.yourdomain.com).");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/v1/auth/register-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name_ar: formData.nameAr.trim(),
          company_name_en: formData.nameEn.trim(),
          domain_slug: formData.slug.toLowerCase().trim(),
          custom_domain: resolvedCustomDomain,
          admin_email: formData.email.trim(),
          admin_password: adminPassword,
          password: adminPassword,
          use_external_db: useExternalDb,
          external_db_host: useExternalDb ? externalDbHost.trim() : undefined,
          external_db_port: useExternalDb ? parseInt(externalDbPort, 10) || 5432 : undefined,
          external_db_name: useExternalDb ? externalDbName.trim() : undefined,
          external_db_user: useExternalDb ? externalDbUser.trim() : undefined,
          external_db_password: useExternalDb ? externalDbPassword : undefined,
          external_db_sslmode: useExternalDb ? externalDbSslMode : undefined,
        }),
      });

      if (!response.ok) {
        const errPayload = await response.json();
        throw new Error(errPayload.detail || "Onboarding pipeline processing error.");
      }

      const result = await response.json();
      setSuccessData(result);
      onSuccess?.();

      const createdSlug = (result.workspace_slug || formData.slug).toLowerCase().trim();
      const finalCustomDomain = result.custom_domain || resolvedCustomDomain;
      const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

      if (!isLocal) {
        if (finalCustomDomain) {
          setTimeout(() => {
            window.location.href = `https://${finalCustomDomain}/login`;
          }, 3000);
        } else if (createdSlug) {
          const parts = window.location.hostname.split('.');
          const rootDomain = parts.slice(-2).join('.');
          const targetHost = `${createdSlug}.${rootDomain}`;
          if (window.location.hostname !== targetHost) {
            setTimeout(() => {
              window.location.href = `https://${targetHost}/login`;
            }, 2500);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to initialize company provisioning engine.");
    } finally {
      setLoading(false);
    }
  };

  if (successData) {
    const slug = (successData.workspace_slug || formData.slug).toLowerCase().trim();
    const hasCustomDomain = !!successData.custom_domain;
    const targetWorkspaceUrl = hasCustomDomain
      ? `https://${successData.custom_domain}/login`
      : (!isLocalhost() && slug
        ? `https://${slug}.${getRootDomain()}/login`
        : (successData.workspace_url || `https://${slug}.oxengl.me`));

    return (
      <div className="min-h-screen min-h-[100dvh] erp-viewport-root bg-[#030712] flex items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 font-sans overflow-x-hidden">
        <div className="w-full max-w-lg bg-[#090f1c] border border-emerald-500/20 rounded-2xl p-4 sm:p-6 md:p-8 shadow-2xl text-center">
          <div className="text-4xl mb-3 sm:mb-4 animate-bounce">🚀</div>
          <h2 className="text-lg sm:text-xl font-bold text-emerald-400">Workspace Generated!</h2>
          <p className="text-xs text-slate-400 mt-1 sm:mt-2">
            Your isolated multi-tenant data container has been successfully mapped and provisioned.
          </p>

          <div className="my-4 sm:my-6 p-3.5 sm:p-4 bg-[#030712] border border-slate-800 rounded-xl font-mono text-left text-xs space-y-2.5">
            <div className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">Corporate System Link:</div>
            <a
              href={targetWorkspaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 font-bold underline select-all block break-all hover:text-cyan-300 transition-colors"
            >
              <span dir="ltr" className="inline-block unicode-bidi-isolate">{targetWorkspaceUrl}</span>
            </a>

            {hasCustomDomain && (
              <div className="mt-3 p-3 bg-slate-900/90 rounded-lg border border-cyan-500/30 text-[11px] text-slate-300 space-y-1.5">
                <div className="text-cyan-400 font-bold flex flex-wrap items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                  <span>Custom Domain:</span>
                  <span dir="ltr" className="font-mono text-slate-100 unicode-bidi-isolate">{successData.custom_domain}</span>
                </div>
                <div className="text-slate-400 text-[10px] leading-relaxed">
                  DNS target: Point <span dir="ltr" className="text-amber-400 font-mono unicode-bidi-isolate">CNAME</span> record to <span dir="ltr" className="text-amber-400 font-mono unicode-bidi-isolate">domains.oxengl.me</span>. Automated TLS/SSL is provisioned on first handshake.
                </div>
                <div className="text-emerald-400/90 text-[10px] font-medium flex items-center gap-1">
                  <span>🔒</span>
                  <span>Zero-Slug Routing & SSL Active</span>
                </div>
              </div>
            )}

            <div className="text-[10px] text-emerald-500/80 pt-1 flex items-center gap-1">
              <span>✓</span>
              <span>Seeded Default 5-Deep General Ledger Hierarchy</span>
            </div>
            {successData.storage_mode === "DEDICATED_EXTERNAL" && (
              <div className="text-[10px] text-cyan-400 font-bold pt-1 flex flex-wrap items-center gap-1">
                <span>🔒</span>
                <span>Provisioned on Private Dedicated PostgreSQL:</span>
                <span dir="ltr" className="font-mono unicode-bidi-isolate">{successData.external_db_host || 'External Host'}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
              if (!isLocal) {
                if (hasCustomDomain) {
                  window.location.href = `https://${successData.custom_domain}/login`;
                  return;
                }
                if (slug) {
                  const parts = window.location.hostname.split('.');
                  const rootDomain = parts.slice(-2).join('.');
                  const targetHost = `${slug}.${rootDomain}`;
                  if (window.location.hostname !== targetHost) {
                    window.location.href = `https://${targetHost}/login`;
                    return;
                  }
                }
              }
              navigate('/login');
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 px-4 text-xs font-bold transition-colors cursor-pointer shadow-lg shadow-emerald-950/40"
          >
            Proceed to Corporate Portal Access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] erp-viewport-root bg-[#030712] flex items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 font-sans overflow-x-hidden">
      <div className="w-full max-w-lg bg-[#090f1c] border border-slate-800/80 rounded-2xl p-4 sm:p-6 md:p-8 shadow-2xl relative transition-all">
        {/* Header with Navigation */}
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="text-left">
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
              Register Enterprise Workspace
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Deploy an isolated cloud platform environment node instantly
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            type="button"
            className="flex items-center gap-1 text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors py-1 px-2.5 rounded-lg border border-slate-800 bg-slate-900/60 shrink-0"
            title="Return to Homepage"
          >
            <span dir="ltr" className="unicode-bidi-isolate">← Back</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs font-medium font-mono text-rose-400 text-center flex items-center justify-center gap-2">
            <span>⚠️</span>
            <span dir="ltr" className="unicode-bidi-isolate break-words">{error}</span>
          </div>
        )}

        <form onSubmit={handleRegistration} className="space-y-3.5 sm:space-y-4">
          {/* Company Name (Arabic) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span dir="rtl" className="unicode-bidi-isolate">اسم المنشأة / الشركة (بالعربية)</span>
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-normal">Arabic</span>
            </label>
            <input
              type="text"
              dir="rtl"
              value={formData.nameAr}
              onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
              placeholder="اسم المنشأة بالعربية (مثال: شركة التطوير اللوجستي)"
              className="w-full px-3.5 py-2.5 sm:px-4 sm:py-3 bg-[#030712] border border-slate-800 focus:border-cyan-500 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 outline-none text-right font-medium unicode-bidi-isolate transition-colors"
              required
            />
          </div>

          {/* Company Name (English) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span dir="ltr" className="unicode-bidi-isolate">Company Name (English)</span>
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-normal">English</span>
            </label>
            <input
              type="text"
              dir="ltr"
              value={formData.nameEn}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              placeholder="Company name in English (e.g. Logistics Development Co.)"
              className="w-full px-3.5 py-2.5 sm:px-4 sm:py-3 bg-[#030712] border border-slate-800 focus:border-cyan-500 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 outline-none text-left font-medium unicode-bidi-isolate transition-colors"
              required
            />
          </div>

          {/* Domain Architecture Selection */}
          <div className="p-3 sm:p-3.5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                <span dir="ltr" className="unicode-bidi-isolate">Domain Architecture</span>
              </label>
              <div className="flex bg-[#030712] border border-slate-800 rounded-lg p-0.5 text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={() => setDomainMode('subdomain')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    domainMode === 'subdomain'
                      ? 'bg-cyan-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">Subdomain</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDomainMode('custom')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    domainMode === 'custom'
                      ? 'bg-cyan-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">Custom Domain</span>
                </button>
              </div>
            </div>

            {/* Internal Slug */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                <span dir="ltr" className="unicode-bidi-isolate">Workspace Internal Slug</span>
              </label>
              <div className="flex rounded-xl bg-[#030712] border border-slate-800 focus-within:border-cyan-500 overflow-hidden transition-colors">
                <input
                  type="text"
                  dir="ltr"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="company-workspace"
                  className="w-full px-3.5 py-2 sm:px-4 sm:py-2.5 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate"
                  required
                />
                <span
                  dir="ltr"
                  className="bg-slate-900 border-l border-slate-800 px-3 py-2 text-xs font-mono text-cyan-400 flex items-center select-none shrink-0 unicode-bidi-isolate"
                >
                  .oxengl.me
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Unique identifier used for tenant isolation, microservices, and backend routing.
              </p>
            </div>

            {/* Custom Domain Input (Conditional) */}
            {domainMode === 'custom' && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span>🌐</span>
                    <span dir="ltr" className="unicode-bidi-isolate">Dedicated Custom Domain</span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="erp.company.com"
                    className="w-full px-3 py-2 bg-[#030712] border border-cyan-500/40 focus:border-cyan-400 rounded-lg text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
                    required={domainMode === 'custom'}
                  />
                </div>
                <div className="p-2.5 bg-[#030712] border border-cyan-500/20 rounded-lg text-[10px] text-slate-400 space-y-1">
                  <div className="text-cyan-300 font-semibold flex flex-wrap items-center gap-1">
                    <span>⚡</span>
                    <span>DNS Target:</span>
                    <span dir="ltr" className="font-mono text-amber-300 font-bold unicode-bidi-isolate">CNAME domains.oxengl.me</span>
                  </div>
                  <div className="text-slate-400 leading-relaxed">
                    Point your domain's CNAME record to <span dir="ltr" className="font-mono text-slate-200 unicode-bidi-isolate">domains.oxengl.me</span>. An automated TLS/SSL certificate is provisioned on first handshake.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Super Admin Email */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span dir="ltr" className="unicode-bidi-isolate">Super Admin Account Email</span>
              <span className="text-[10px] text-slate-500 font-mono">Authentication</span>
            </label>
            <input
              type="email"
              dir="ltr"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="admin@company.com"
              className="w-full px-3.5 py-2.5 sm:px-4 sm:py-3 bg-[#030712] border border-slate-800 focus:border-cyan-500 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
              required
            />
          </div>

          {/* Super Admin Password */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span dir="ltr" className="unicode-bidi-isolate">Super Admin Password</span>
              <span className="text-[10px] text-slate-500 font-mono">Security</span>
            </label>
            <input
              type="password"
              dir="ltr"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 sm:px-4 sm:py-3 bg-[#030712] border border-slate-800 focus:border-cyan-500 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
              required
            />
          </div>

          {/* Enterprise External Database Option */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-800">
              <div className="pr-2">
                <span className="text-xs font-bold text-slate-200 block">External Database Hosting</span>
                <span className="text-[10px] text-slate-400">Bring your own PostgreSQL instance (Dedicated Data Residency)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={useExternalDb}
                  onChange={(e) => setUseExternalDb(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
              </label>
            </div>

            {useExternalDb && (
              <div className="mt-3 p-3 sm:p-3.5 bg-[#030712] border border-cyan-500/20 rounded-xl space-y-3">
                <div className="text-[11px] font-semibold text-cyan-400 flex flex-wrap items-center gap-1.5">
                  <span>🔒</span>
                  <span>External PostgreSQL Credentials (TLS Encrypted)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      <span dir="ltr" className="unicode-bidi-isolate">Host / Endpoint</span>
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={externalDbHost}
                      onChange={(e) => setExternalDbHost(e.target.value)}
                      placeholder="db.company.com or 10.0.0.5"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
                      required={useExternalDb}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      <span dir="ltr" className="unicode-bidi-isolate">Port</span>
                    </label>
                    <input
                      type="number"
                      dir="ltr"
                      value={externalDbPort}
                      onChange={(e) => setExternalDbPort(e.target.value)}
                      placeholder="5432"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <span dir="ltr" className="unicode-bidi-isolate">Database Name</span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={externalDbName}
                    onChange={(e) => setExternalDbName(e.target.value)}
                    placeholder="company_enterprise_db"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
                    required={useExternalDb}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      <span dir="ltr" className="unicode-bidi-isolate">Username</span>
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={externalDbUser}
                      onChange={(e) => setExternalDbUser(e.target.value)}
                      placeholder="postgres_admin"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
                      required={useExternalDb}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      <span dir="ltr" className="unicode-bidi-isolate">Password</span>
                    </label>
                    <input
                      type="password"
                      dir="ltr"
                      value={externalDbPassword}
                      onChange={(e) => setExternalDbPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
                      required={useExternalDb}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <span dir="ltr" className="unicode-bidi-isolate">SSL / TLS Mode</span>
                  </label>
                  <select
                    value={externalDbSslMode}
                    onChange={(e) => setExternalDbSslMode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-200 outline-none transition-colors"
                  >
                    <option value="prefer">prefer (Attempt SSL, fallback to plain)</option>
                    <option value="require">require (Enforce TLS / SSL)</option>
                    <option value="verify-full">verify-full (Strict CA Verification)</option>
                    <option value="disable">disable (Plaintext - Not Recommended)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl py-3 px-4 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-950/40"
          >
            {loading ? 'Provisioning Cloud Framework Matrix...' : 'Deploy Secure Workspace Infrastructure'}
          </button>
        </form>
      </div>
    </div>
  );
};
