import React, { useState } from 'react';
import { redirectToTenantSubdomain, getRootDomain, isLocalhost } from '../utils/subdomain';
import {
  Lock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  CreditCard,
  X,
  Building2,
  Database,
  Globe,
  ArrowRight,
  ShieldAlert,
  Check,
  Zap,
} from 'lucide-react';

export interface TenantRegistrationViewProps {
  onSuccess?: () => void;
}

const SAUDI_BANK_DETAILS = {
  bankName: 'مصرف الإنماء (Alinma Bank)',
  accountName: 'شركة منصة أوكسن للخدمات اللوجستية (Oxen Logistics Platform Co.)',
  iban: 'SA4405000068201234567890',
  swift: 'INMASARI',
};

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

  // Subscription tier and enterprise payment verification gating
  const [subscriptionTier, setSubscriptionTier] = useState<'standard' | 'professional' | 'enterprise'>('standard');
  const [isEnterprisePaid, setIsEnterprisePaid] = useState<boolean>(false);
  const [enterprisePaymentRef, setEnterprisePaymentRef] = useState<string>('');
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [upgradeTriggerReason, setUpgradeTriggerReason] = useState<'custom_domain' | 'external_db' | 'tier_select' | 'general'>('general');

  // Checkout modal states
  const [checkoutMethod, setCheckoutMethod] = useState<'card' | 'bank_transfer'>('card');
  const [isVerifyingPayment, setIsVerifyingPayment] = useState<boolean>(false);
  const [cardNumber, setCardNumber] = useState<string>('');
  const [cardExpiry, setCardExpiry] = useState<string>('');
  const [cardCvc, setCardCvc] = useState<string>('');
  const [bankWireRef, setBankWireRef] = useState<string>('');

  // Strict enterprise gating check
  const requiresEnterprise = domainMode === 'custom' || useExternalDb;
  const isEnterpriseGated = requiresEnterprise && (!isEnterprisePaid || subscriptionTier !== 'enterprise');

  const cleanDomain = (d: string) => {
    let clean = d.trim().toLowerCase();
    if (clean.includes('://')) clean = clean.split('://')[1];
    return clean.split('/')[0].split(':')[0].trim();
  };

  const handleDomainModeSelect = (mode: 'subdomain' | 'custom') => {
    if (mode === 'custom' && (!isEnterprisePaid || subscriptionTier !== 'enterprise')) {
      setError("Custom Domain and Dedicated Database Hosting require an Enterprise Grade subscription. Please upgrade and complete payment to proceed.");
      setUpgradeTriggerReason('custom_domain');
      setShowUpgradeModal(true);
    }
    setDomainMode(mode);
  };

  const handleToggleExternalDb = (checked: boolean) => {
    if (checked && (!isEnterprisePaid || subscriptionTier !== 'enterprise')) {
      setError("Custom Domain and Dedicated Database Hosting require an Enterprise Grade subscription. Please upgrade and complete payment to proceed.");
      setUpgradeTriggerReason('external_db');
      setShowUpgradeModal(true);
    }
    setUseExternalDb(checked);
  };

  const handleSelectTier = (tier: 'standard' | 'professional' | 'enterprise') => {
    if (tier === 'enterprise' && !isEnterprisePaid) {
      setUpgradeTriggerReason('tier_select');
      setShowUpgradeModal(true);
      return;
    }
    setSubscriptionTier(tier);
  };

  const handleSimulatePayment = () => {
    setIsVerifyingPayment(true);
    setTimeout(() => {
      const generatedRef = checkoutMethod === 'card'
        ? `MADA-AUTH-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
        : (bankWireRef.trim() || `WIRE-${Math.random().toString(36).substring(2, 9).toUpperCase()}`);

      setIsEnterprisePaid(true);
      setSubscriptionTier('enterprise');
      setEnterprisePaymentRef(generatedRef);
      setIsVerifyingPayment(false);
      setShowUpgradeModal(false);
      setError(null);
    }, 1200);
  };

  const handleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Gating check
    if (isEnterpriseGated) {
      setError("Custom Domain and Dedicated Database Hosting require an Enterprise Grade subscription. Please upgrade and complete payment to proceed.");
      setShowUpgradeModal(true);
      return;
    }

    setLoading(true);

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
          subscription_tier: subscriptionTier,
          is_enterprise_paid: isEnterprisePaid,
          payment_reference: enterprisePaymentRef || undefined,
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
            {isEnterprisePaid && (
              <div className="text-[10px] text-amber-400 font-bold pt-1 flex items-center gap-1">
                <span>⭐</span>
                <span>Enterprise Grade License: Verified Active ({enterprisePaymentRef || 'PAID'})</span>
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
        <div className="flex items-center justify-between mb-4 sm:mb-5">
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

        {/* Subscription Tier Ribbon */}
        <div className="mb-5 p-3 rounded-xl bg-[#030712] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Workspace Subscription Grade
            </span>
            {isEnterprisePaid ? (
              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                <CheckCircle2 className="h-3 w-3" />
                <span>Enterprise Verified</span>
              </span>
            ) : (
              <span className="text-[10px] font-mono text-slate-500">
                Tier: {subscriptionTier.toUpperCase()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center">
            {/* Standard Tier */}
            <button
              type="button"
              onClick={() => handleSelectTier('standard')}
              className={`p-2 rounded-lg border text-left transition-all ${
                subscriptionTier === 'standard'
                  ? 'border-cyan-500 bg-cyan-950/20 text-white shadow-xs'
                  : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="text-[11px] font-bold truncate">Standard</div>
              <div className="text-[9px] text-slate-400 mt-0.5 truncate">Subdomain Only</div>
            </button>

            {/* Professional Tier */}
            <button
              type="button"
              onClick={() => handleSelectTier('professional')}
              className={`p-2 rounded-lg border text-left transition-all ${
                subscriptionTier === 'professional'
                  ? 'border-blue-500 bg-blue-950/20 text-white shadow-xs'
                  : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="text-[11px] font-bold truncate">Professional</div>
              <div className="text-[9px] text-slate-400 mt-0.5 truncate">Priority Queue</div>
            </button>

            {/* Enterprise Tier */}
            <button
              type="button"
              onClick={() => handleSelectTier('enterprise')}
              className={`p-2 rounded-lg border text-left transition-all relative ${
                subscriptionTier === 'enterprise'
                  ? 'border-amber-500 bg-amber-950/20 text-white shadow-xs'
                  : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold truncate">Enterprise</span>
                {isEnterprisePaid ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Lock className="h-3 w-3 text-amber-400" />
                )}
              </div>
              <div className="text-[9px] text-amber-400 mt-0.5 truncate">Custom Domain & DB</div>
            </button>
          </div>
        </div>

        {/* Global Error / Warning Alert */}
        {error && (
          <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs font-medium font-mono text-rose-400 text-center flex items-center justify-center gap-2">
            <span>⚠️</span>
            <span dir="ltr" className="unicode-bidi-isolate break-words">{error}</span>
          </div>
        )}

        {/* Enterprise Upgrade CTA Alert when feature is gated */}
        {isEnterpriseGated && (
          <div className="mb-4 sm:mb-5 p-3.5 bg-gradient-to-r from-amber-950/30 via-slate-900 to-amber-950/30 border border-amber-500/40 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                <Lock className="h-4 w-4 shrink-0" />
                <span>Enterprise Subscription & Payment Required</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUpgradeTriggerReason(domainMode === 'custom' ? 'custom_domain' : 'external_db');
                  setShowUpgradeModal(true);
                }}
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-md cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Upgrade & Verify Payment</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Custom Domain and Dedicated Database Hosting require an Enterprise Grade subscription. Please upgrade and complete payment to proceed.
            </p>
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
              <div className="flex items-center gap-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <span dir="ltr" className="unicode-bidi-isolate">Domain Architecture</span>
                </label>
                {domainMode === 'custom' && !isEnterprisePaid && (
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" />
                    <span>Enterprise Only</span>
                  </span>
                )}
              </div>
              <div className="flex bg-[#030712] border border-slate-800 rounded-lg p-0.5 text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={() => handleDomainModeSelect('subdomain')}
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
                  onClick={() => handleDomainModeSelect('custom')}
                  className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                    domainMode === 'custom'
                      ? 'bg-cyan-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {!isEnterprisePaid && <Lock className="h-3 w-3 text-amber-400" />}
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
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span>🌐</span>
                    <span dir="ltr" className="unicode-bidi-isolate">Dedicated Custom Domain</span>
                  </label>
                  {!isEnterprisePaid && (
                    <button
                      type="button"
                      onClick={() => {
                        setUpgradeTriggerReason('custom_domain');
                        setShowUpgradeModal(true);
                      }}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 underline"
                    >
                      <span>Upgrade to Unlock</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  dir="ltr"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="erp.company.com"
                  className="w-full px-3 py-2 bg-[#030712] border border-cyan-500/40 focus:border-cyan-400 rounded-lg text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono unicode-bidi-isolate transition-colors"
                  required={domainMode === 'custom'}
                />
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
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200 block">External Database Hosting</span>
                  {!isEnterprisePaid && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1">
                      <Lock className="h-2.5 w-2.5" />
                      <span>Enterprise</span>
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">Bring your own PostgreSQL instance (Dedicated Data Residency)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={useExternalDb}
                  onChange={(e) => handleToggleExternalDb(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
              </label>
            </div>

            {useExternalDb && (
              <div className="mt-3 p-3 sm:p-3.5 bg-[#030712] border border-cyan-500/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-cyan-400 flex flex-wrap items-center gap-1.5">
                    <span>🔒</span>
                    <span>External PostgreSQL Credentials (TLS Encrypted)</span>
                  </div>
                  {!isEnterprisePaid && (
                    <button
                      type="button"
                      onClick={() => {
                        setUpgradeTriggerReason('external_db');
                        setShowUpgradeModal(true);
                      }}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 underline"
                    >
                      <span>Verify License</span>
                    </button>
                  )}
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

          {/* Gated Deployment Button */}
          {isEnterpriseGated ? (
            <button
              type="button"
              onClick={() => {
                setUpgradeTriggerReason(domainMode === 'custom' ? 'custom_domain' : 'external_db');
                setShowUpgradeModal(true);
              }}
              className="w-full bg-slate-800 hover:bg-slate-700/80 text-amber-400 border border-amber-500/40 rounded-xl py-3 px-4 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-black/60"
            >
              <Lock className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Upgrade & Verify Payment to Deploy Enterprise Workspace</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl py-3 px-4 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-950/40"
            >
              {loading ? 'Provisioning Cloud Framework Matrix...' : 'Deploy Secure Workspace Infrastructure'}
            </button>
          )}
        </form>
      </div>

      {/* Enterprise Upgrade & Payment Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-[#090f1c] border border-cyan-500/30 rounded-2xl p-5 sm:p-7 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-left">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="absolute end-4 top-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>Enterprise Grade Subscription</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Required
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Custom Domain and Dedicated Database Hosting require an Enterprise Grade subscription. Please upgrade and complete payment to proceed.
                </p>
              </div>
            </div>

            {/* Included Features Pill Matrix */}
            <div className="my-4 p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                Included in Enterprise Grade:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Dedicated Custom Domain & SSL</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>External PostgreSQL Residency</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>White-Label Branding & Logos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>24/7 Dedicated Support & 99.99% SLA</span>
                </div>
              </div>
            </div>

            {/* Pricing Tag */}
            <div className="p-3 bg-gradient-to-r from-cyan-950/40 to-blue-950/40 rounded-xl border border-cyan-500/20 flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Enterprise Annual Plan</div>
                <div className="text-lg font-black text-white font-mono">
                  SAR 4,999 <span className="text-xs text-slate-400 font-normal">/ year</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-emerald-400 font-bold block">Instant Verification</span>
                <span className="text-[9px] text-slate-400 font-mono">Tax Invoice Included</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-3">
              <div className="flex bg-[#030712] border border-slate-800 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setCheckoutMethod('card')}
                  className={`flex-1 py-1.5 rounded-md font-bold transition-colors flex items-center justify-center gap-1.5 ${
                    checkoutMethod === 'card'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Mada / Credit Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCheckoutMethod('bank_transfer')}
                  className={`flex-1 py-1.5 rounded-md font-bold transition-colors flex items-center justify-center gap-1.5 ${
                    checkoutMethod === 'bank_transfer'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Saudi Bank Wire (سداد)</span>
                </button>
              </div>

              {checkoutMethod === 'card' ? (
                <div className="p-3 bg-[#030712] border border-slate-800 rounded-xl space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Card Number (Mada / Visa / MasterCard)
                    </label>
                    <input
                      type="text"
                      placeholder="4000 1234 5678 9010"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Expiry Date
                      </label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        CVV / CVC
                      </label>
                      <input
                        type="password"
                        placeholder="•••"
                        maxLength={4}
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-[#030712] border border-slate-800 rounded-xl space-y-2 text-xs">
                  <div className="text-[11px] font-bold text-slate-300">
                    {SAUDI_BANK_DETAILS.bankName}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    IBAN: <span className="text-white font-bold select-all">{SAUDI_BANK_DETAILS.iban}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Beneficiary: {SAUDI_BANK_DETAILS.accountName}
                  </div>
                  <div className="pt-2 border-t border-slate-800">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Wire Transfer Reference Number (رقم الحوالة)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TRX-88421098"
                      value={bankWireRef}
                      onChange={(e) => setBankWireRef(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Verification and Pay Action Button */}
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSimulatePayment}
                disabled={isVerifyingPayment}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer disabled:opacity-50"
              >
                {isVerifyingPayment ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                    <span>Verifying Enterprise Payment...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    <span>Verify Payment & Unlock Enterprise</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantRegistrationView;
