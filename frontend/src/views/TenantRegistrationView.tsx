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
  const [formData, setFormData] = useState({ nameAr: '', nameEn: '', slug: '', email: '' });
  const [domainMode, setDomainMode] = useState<'subdomain' | 'custom'>('subdomain');
  const [customDomain, setCustomDomain] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [useExternalDb, setUseExternalDb] = useState(false);
  const [externalDbHost, setExternalDbHost] = useState('');
  const [externalDbPort, setExternalDbPort] = useState('5432');
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
      setError("Please specify a valid custom domain (e.g. myon-contrac.cloud).");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/v1/auth/register-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name_ar: formData.nameAr,
          company_name_en: formData.nameEn,
          domain_slug: formData.slug.toLowerCase().trim(),
          custom_domain: resolvedCustomDomain,
          admin_email: formData.email,
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
      <div className="min-h-dvh erp-viewport-root bg-[#030712] flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-[#090f1c] border border-emerald-500/20 rounded-2xl p-8 shadow-2xl text-center">
          <div className="text-4xl mb-4 animate-bounce">🚀</div>
          <h2 className="text-xl font-bold text-emerald-400">Workspace Generated!</h2>
          <p className="text-xs text-slate-400 mt-2">Your isolated multi-tenant data container has been successfully mapped and provisioned.</p>
          
          <div className="my-6 p-4 bg-[#030712] border border-slate-800 rounded-xl font-mono text-left text-xs space-y-2">
            <div className="text-slate-500">Corporate System Link:</div>
            <a
              href={targetWorkspaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 font-bold underline select-all block truncate hover:text-cyan-300"
            >
              {targetWorkspaceUrl}
            </a>

            {hasCustomDomain && (
              <div className="mt-3 p-3 bg-slate-900/90 rounded-lg border border-cyan-500/30 text-[11px] text-slate-300 space-y-1.5">
                <div className="text-cyan-400 font-bold flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Custom Domain: {successData.custom_domain}
                </div>
                <div className="text-slate-400 text-[10px] leading-relaxed">
                  DNS target: Point <span className="text-amber-400 font-mono">CNAME</span> record to <span className="text-amber-400 font-mono">domains.oxengl.me</span>. Automated TLS/SSL is provisioned on first handshake.
                </div>
                <div className="text-emerald-400/90 text-[10px] font-medium">
                  🔒 Zero-Slug Routing & SSL Active
                </div>
              </div>
            )}

            <div className="text-[10px] text-emerald-500/70 pt-1">✓ Seeded Default 5-Deep General Ledger Hierarchy</div>
            {successData.storage_mode === "DEDICATED_EXTERNAL" && (
              <div className="text-[10px] text-cyan-400 font-bold pt-1">
                🔒 Provisioned on Private Dedicated PostgreSQL ({successData.external_db_host || 'External Host'})
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
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 text-xs font-bold transition-colors cursor-pointer"
          >
            Proceed to Corporate Portal Access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh erp-viewport-root bg-[#030712] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-[#090f1c] border border-slate-800 rounded-2xl p-8 shadow-2xl relative">
        <button onClick={() => navigate('/')} className="absolute top-4 right-4 text-xs font-mono text-slate-500 hover:text-slate-300">← Back</button>

        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-slate-200">Register New Enterprise Workspace</h2>
          <p className="text-xs text-slate-500 mt-1">Deploy an isolated cloud platform environment node instantly</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-medium font-mono text-rose-400 text-center">⚠️ {error}</div>
        )}

        <form onSubmit={handleRegistration} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Company Name (Arabic)</label>
            <input type="text" value={formData.nameAr} onChange={(e) => setFormData({...formData, nameAr: e.target.value})} placeholder="شركة ميون الاقتصادية المحدودة" className="w-full px-4 py-2.5 bg-[#030712] border border-slate-800 focus:border-cyan-500 rounded-xl text-sm text-slate-200 outline-none text-right font-medium" required />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Company Name (English)</label>
            <input type="text" value={formData.nameEn} onChange={(e) => setFormData({...formData, nameEn: e.target.value})} placeholder="MYON ECONOMIC CO LTD." className="w-full px-4 py-2.5 bg-[#030712] border border-slate-800 focus:border-cyan-500 rounded-xl text-sm text-slate-200 outline-none font-medium" required />
          </div>

          {/* Domain Architecture Selection */}
          <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Domain Architecture
              </label>
              <div className="flex bg-[#030712] border border-slate-800 rounded-lg p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDomainMode('subdomain')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${domainMode === 'subdomain' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Subdomain
                </button>
                <button
                  type="button"
                  onClick={() => setDomainMode('custom')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${domainMode === 'custom' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Custom Domain
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Workspace Internal Slug
              </label>
              <div className="flex rounded-xl bg-[#030712] border border-slate-800 focus-within:border-cyan-500 overflow-hidden">
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({...formData, slug: e.target.value})}
                  placeholder="myon-economic"
                  className="w-full px-4 py-2 bg-transparent text-sm text-slate-200 outline-none font-mono"
                  required
                />
                <span className="bg-slate-900 border-l border-slate-800 px-3 py-2 text-xs font-mono text-slate-500 flex items-center">
                  .oxengl.me
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Unique identifier used for tenant isolation and backend routing.</p>
            </div>

            {domainMode === 'custom' && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div>
                  <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span>🌐</span> Dedicated Custom Domain
                  </label>
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="myon-contrac.cloud"
                    className="w-full px-3 py-2 bg-[#030712] border border-cyan-500/40 focus:border-cyan-400 rounded-lg text-xs text-slate-100 outline-none font-mono"
                    required={domainMode === 'custom'}
                  />
                </div>
                <div className="p-2.5 bg-[#030712] border border-cyan-500/20 rounded-lg text-[10px] text-slate-400 space-y-1">
                  <div className="text-cyan-300 font-semibold flex items-center gap-1">
                    <span>⚡</span> DNS Target: <span className="font-mono text-amber-300">CNAME domains.oxengl.me</span>
                  </div>
                  <div className="text-slate-400">
                    Point your domain's CNAME record to <span className="font-mono text-slate-200">domains.oxengl.me</span>. Automatic TLS certificate will be provisioned on your first visit.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Super Admin Account Email</label>
            <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="admin@company.com" className="w-full px-4 py-2.5 bg-[#030712] border border-slate-800 focus:border-cyan-500 rounded-xl text-sm text-slate-200 outline-none" required />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Super Admin Password</label>
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••••••••••" className="w-full px-4 py-2.5 bg-[#030712] border border-slate-800 focus:border-cyan-500 rounded-xl text-sm text-slate-200 outline-none font-mono" required />
          </div>

          {/* Enterprise External Database Option */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-200 block">External Database Hosting</span>
                <span className="text-[10px] text-slate-400">Bring your own PostgreSQL instance (Dedicated Data Residency)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
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
              <div className="mt-3 p-3 bg-[#030712] border border-cyan-500/20 rounded-xl space-y-3">
                <div className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1.5">
                  <span>🔒</span> External PostgreSQL Credentials (TLS Encrypted)
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Host / Endpoint</label>
                    <input
                      type="text"
                      value={externalDbHost}
                      onChange={(e) => setExternalDbHost(e.target.value)}
                      placeholder="db.company.internal or 10.0.0.5"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-200 outline-none font-mono"
                      required={useExternalDb}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Port</label>
                    <input
                      type="number"
                      value={externalDbPort}
                      onChange={(e) => setExternalDbPort(e.target.value)}
                      placeholder="5432"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-200 outline-none font-mono"
                      required={useExternalDb}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Database Name</label>
                  <input
                    type="text"
                    value={externalDbName}
                    onChange={(e) => setExternalDbName(e.target.value)}
                    placeholder="oxengl_enterprise"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-200 outline-none font-mono"
                    required={useExternalDb}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Username</label>
                    <input
                      type="text"
                      value={externalDbUser}
                      onChange={(e) => setExternalDbUser(e.target.value)}
                      placeholder="pg_admin"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-200 outline-none font-mono"
                      required={useExternalDb}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Password</label>
                    <input
                      type="password"
                      value={externalDbPassword}
                      onChange={(e) => setExternalDbPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-200 outline-none font-mono"
                      required={useExternalDb}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">SSL / TLS Mode</label>
                  <select
                    value={externalDbSslMode}
                    onChange={(e) => setExternalDbSslMode(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs text-slate-200 outline-none"
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

          <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl py-3 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50">
            {loading ? 'Provisioning Cloud Framework Matrix...' : 'Deploy Secure Workspace Infrastructure'}
          </button>

        </form>
      </div>
    </div>
  );
};
