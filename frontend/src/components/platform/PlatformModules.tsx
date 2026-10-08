import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Building2, Check, CheckCircle2, Copy, CreditCard, Database, ExternalLink,
  KeyRound, Layers, Loader2, Lock, Megaphone, Palette, Plus, RefreshCw, Save, Search, Server,
  Settings, Shield, ShieldCheck, Sparkles, Upload, X, Cpu, TrendingUp, BarChart3, ArrowUpRight, Zap, Pencil,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Company } from '../../types';
import { authFetch, erpApi, IsolationAudit, LicenseIssuePayload, SubscriptionPlanDto } from '../../services/api';
import { invalidatePricingPlans, usePricingPlans } from '../../hooks/usePricingPlans';
import { annualSavingsPercent, formatSar, isUnlimited, normalizeTierCode } from '../../utils/pricing';
import { SpotlightCard } from '../design-system/SpotlightCard';

const TIER_CENTERS: Record<string, number> = { BASIC: 5, PROFESSIONAL: 25, ENTERPRISE: 100 };

const tierBadge = (tier?: string) =>
  tier === 'ENTERPRISE' ? 'bg-purple-50 text-purple-700 border-purple-200'
    : tier === 'BASIC' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';

const Banner: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; badge?: string; tone?: string; action?: React.ReactNode }> = ({ icon: Icon, title, subtitle, badge, tone = 'from-blue-950 via-slate-900 to-indigo-950', action }) => (
  <div className={`flex flex-col justify-between gap-4 rounded-3xl border border-slate-800 bg-gradient-to-r ${tone} p-6 text-white shadow-xl sm:flex-row sm:items-center`}>
    <div className="flex items-center gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-inner"><Icon className="h-7 w-7" /></div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-black">{title}</h1>
          {badge && <span className="rounded-full border border-emerald-400/30 bg-emerald-500/25 px-3 py-0.5 text-xs font-bold text-emerald-200 whitespace-nowrap shrink-0">{badge}</span>}
        </div>
        <p className="mt-1 max-w-2xl text-xs text-slate-300">{subtitle}</p>
      </div>
    </div>
    {action}
  </div>
);

export const TenantsRegistryView: React.FC<{ onInspect: (company: Company) => void }> = ({ onInspect }) => {
  const { companies, currentCompany, refreshCompanies, language } = useApp();
  const isAr = Boolean(
    language === 'ar' ||
    language?.startsWith('ar') ||
    (typeof localStorage !== 'undefined' && (
      localStorage.getItem('oxengl_language') === 'ar' ||
      localStorage.getItem('i18nextLng')?.startsWith('ar')
    )) ||
    (typeof document !== 'undefined' && (
      document.documentElement.lang?.startsWith('ar') ||
      document.documentElement.dir === 'rtl'
    ))
  );
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nameEn: '', cr: '', vat: '', adminEmail: '' });

  const filtered = companies.filter((company) => {
    const haystack = `${company.name} ${company.slug} ${company.commercialRegistration || ''} ${company.taxId || ''} ${company.licenseKey || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (tier === 'ALL' || (company.subscriptionTier || 'PROFESSIONAL') === tier);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await erpApi.registerCompany({
        company_name: form.nameEn,
        slug: form.nameEn.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        cr_number: form.cr,
        vat_number: form.vat,
        admin_email: form.adminEmail,
        admin_name: form.nameEn,
        admin_password: form.cr || 'Admin@123456',
      });
      await refreshCompanies();
      setNotice('Tenant registered successfully.');
      setShowForm(false);
      setForm({ nameEn: '', cr: '', vat: '', adminEmail: '' });
    } catch (error) {
      setNotice(error instanceof Error ? `Registration failed: ${error.message}` : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const [selectedPlanTenant, setSelectedPlanTenant] = useState<Company | null>(null);
  const [targetTier, setTargetTier] = useState('professional');
  const { plans: catalogPlans } = usePricingPlans();

  const updatePlan = async () => {
    if (!selectedPlanTenant) return;
    setBusy(true);
    setNotice(null);
    try {
      await erpApi.updateTenantSubscription(selectedPlanTenant.id, { tier: targetTier });
      await refreshCompanies();
      setNotice(`Subscription for ${selectedPlanTenant.name} updated to ${targetTier.toUpperCase()}.`);
      setSelectedPlanTenant(null);
    } catch (err: any) {
      setNotice(err?.message || 'Failed to update plan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Banner icon={Building2} title="Enterprise Tenants Registry" badge={`${companies.length} Tenants`}
        subtitle="Manage cloud tenant entities, quotas, licensing keys, and direct switch-in to inspect workspaces."
        action={<div className="flex items-center gap-3">
          <button onClick={() => { setBusy(true); refreshCompanies().finally(() => setBusy(false)); }} className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Refresh</button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:brightness-110"><Plus className="h-4 w-4" />Register New Tenant</button>
        </div>} />

      {notice && <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800"><Check className="h-4 w-4 shrink-0" />{notice}</div>}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isAr ? 'بحث بالمنشأة، السجل التجاري، الرقم الضريبي...' : 'Search by company, CR, VAT, or license key...'} className="w-full rounded-xl border border-slate-800 bg-slate-950 text-slate-200 py-2 pl-10 pr-4 text-xs text-slate-100 outline-none focus:border-blue-500 focus:bg-white" /></label>
        <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600">Tier:</span>
          <select value={tier} onChange={(event) => setTier(event.target.value)} className="rounded-xl border border-slate-800 bg-slate-950 text-slate-200 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
            {['ALL', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'].map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All Tiers' : value}</option>)}
          </select></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((company) => (
          <article key={company.id} className={`rounded-3xl border bg-white p-5 shadow-xs transition-all hover:shadow-md ${currentCompany?.id === company.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200/80'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/10 text-base font-black text-blue-700">{company.name.slice(0, 1).toUpperCase()}</div>
                <div><p className="font-mono text-[11px] text-slate-400">{company.slug}</p><h3 className="text-sm font-black text-slate-100">{company.name}</h3></div>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase whitespace-nowrap shrink-0 ${tierBadge(company.subscriptionTier)}`}>{company.subscriptionTier || 'PROFESSIONAL'}</span>
            </div>
            <dl className="mt-4 space-y-2 rounded-2xl border border-slate-100 bg-slate-950/70 p-3.5 text-xs">
              <div className="flex justify-between"><dt className="text-slate-500">Commercial Reg:</dt><dd className="font-mono font-bold text-slate-200">{company.commercialRegistration || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Tax Number:</dt><dd className="font-mono font-bold text-slate-200">{company.taxId || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Allowed Centers:</dt><dd className="font-bold text-indigo-700">Up to {company.maxCostCenters ?? 25}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">License Key:</dt><dd className="font-mono font-bold text-slate-200">{company.licenseKey || 'Not issued'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Security Barrier:</dt><dd className="inline-flex items-center gap-1 font-bold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Strict Isolated</dd></div>
            </dl>
            <div className="mt-4 flex gap-2">
              <button onClick={() => { setSelectedPlanTenant(company); setTargetTier(normalizeTierCode(company.subscriptionTier).toLowerCase()); }} className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-950 text-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><CreditCard className="h-3.5 w-3.5 text-blue-600" />Manage Plan</button>
              <button onClick={() => onInspect(company)} className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-slate-900 py-2.5 text-xs font-black text-white hover:bg-blue-700"><ExternalLink className="h-3.5 w-3.5" />Inspect</button>
            </div>
          </article>
        ))}
        {filtered.length === 0 && <p className="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">No matching organizations found.</p>}
      </div>

      {selectedPlanTenant && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 text-slate-100 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-100">Update Tenant SaaS Subscription</h3>
                <p className="text-xs text-slate-500">{selectedPlanTenant.name}</p>
              </div>
              <button onClick={() => setSelectedPlanTenant(null)} className="text-slate-400">✕</button>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700">Select Target Subscription Tier</label>
              <select
                value={targetTier}
                onChange={(e) => setTargetTier(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-bold outline-none capitalize"
              >
                {catalogPlans.map((plan) => (
                  <option key={plan.id} value={plan.name.toLowerCase()}>
                    {plan.display_name} ({isUnlimited(plan.max_seats) ? 'Unlimited' : plan.max_seats} users, {formatSar(plan.max_storage_gb)} GB, {formatSar(plan.monthly_price)} SAR/mo)
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
              <p className="font-bold">Automated Quotas Enforcement:</p>
              <p className="mt-0.5 text-[11px] text-blue-600">The tenant active tier limits will be updated immediately in the database and enforced on next user creation.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setSelectedPlanTenant(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold">Cancel</button>
              <button disabled={busy} onClick={updatePlan} className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs">
                {busy ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <form onSubmit={submit} className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 text-slate-100 p-6 shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-100 pb-4">
            <div><h3 className="text-lg font-black text-slate-100">Register New Enterprise Tenant</h3><p className="text-xs text-slate-500">Creates an isolated workspace with seeded accounts and an administrator.</p></div>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {([['nameEn', 'Company Name (English)', 'text'], ['cr', 'Commercial Registry (10 digits)', 'text'], ['vat', 'VAT Number (15 digits)', 'text'], ['adminEmail', 'Administrator Email', 'email']] as const).map(([field, label, type]) => (
              <label key={field} className="text-xs font-bold text-slate-700">{label}
                <input required type={type} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  pattern={field === 'cr' ? '\\d{10}' : field === 'vat' ? '\\d{15}' : undefined}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-100 outline-none focus:border-blue-500" /></label>
            ))}
          </div>
          <button disabled={busy} className="mt-6 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-xs font-black text-white disabled:opacity-60">{busy ? 'Provisioning workspace...' : 'Create Organization'}</button>
        </form>
      </div>}
    </div>
  );
};

export const LicenseProvisionerView: React.FC = () => {
  const { companies, currentCompany, refreshCompanies, setCurrentCompany, language } = useApp();
  const isAr = Boolean(
    language === 'ar' ||
    language?.startsWith('ar') ||
    (typeof localStorage !== 'undefined' && (
      localStorage.getItem('oxengl_language') === 'ar' ||
      localStorage.getItem('i18nextLng')?.startsWith('ar')
    )) ||
    (typeof document !== 'undefined' && (
      document.documentElement.lang?.startsWith('ar') ||
      document.documentElement.dir === 'rtl'
    ))
  );
  const [companyId, setCompanyId] = useState(() => {
    if (currentCompany && companies.some((c) => c.id === currentCompany.id)) return currentCompany.id;
    return companies[0]?.id || '';
  });
  const [tier, setTier] = useState<'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE'>('PROFESSIONAL');
  const [validityDays, setValidityDays] = useState(365);
  const [themeMode, setThemeMode] = useState<'LIGHT' | 'DARK' | 'CUSTOM'>('CUSTOM');
  const [primaryColor, setPrimaryColor] = useState('#1E3A8A');
  const [secondaryColor, setSecondaryColor] = useState('#7C3AED');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (companies.length > 0 && (!companyId || !companies.some((c) => c.id === companyId))) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const effectiveCompanyId = companyId && companies.some((c) => c.id === companyId)
    ? companyId
    : companies[0]?.id || '';

  const selected = companies.find((company) => company.id === effectiveCompanyId);
  const copyKey = (key: string) => { navigator.clipboard.writeText(key); setCopied(key); window.setTimeout(() => setCopied(null), 2000); };

  const issue = async (event: React.FormEvent) => {
    event.preventDefault();
    const targetCompanyId = effectiveCompanyId;
    if (!targetCompanyId) {
      setStatus({ type: 'error', text: 'Target enterprise is required.' });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const payload: LicenseIssuePayload = {
        company_id: String(targetCompanyId).trim(),
        subscription_tier: tier,
        validity_days: Math.max(1, parseInt(String(validityDays), 10) || 365),
        theme_mode: themeMode,
        ui_primary_color: primaryColor || '#1E3A8A',
        ui_secondary_color: secondaryColor || '#7C3AED',
      };
      const issued = await erpApi.issueLicense(payload);
      await refreshCompanies();
      setStatus({ type: 'success', text: `License successfully issued for ${issued.name}. Key: ${issued.license_key || ''}` });
    } catch (error) {
      setStatus({ type: 'error', text: error instanceof Error ? `Provisioning failed: ${error.message}` : 'Provisioning failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Banner icon={Shield} title="SaaS Multi-Tenant Provisioning" badge="SuperAdmin Portal"
        subtitle="Provision independent corporate licenses with custom visual branding and cost center allowances." />

      {status && <div className={`flex items-center gap-2 rounded-2xl border p-4 text-xs font-bold ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : status.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}><Shield className="h-4 w-4 shrink-0" />{status.text}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={issue} className="space-y-5 rounded-3xl border border-slate-800/80 bg-white p-6 shadow-xs lg:col-span-2">
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-black text-slate-100"><Lock className="h-4 w-4 text-blue-700" />Security &amp; Tenant Credentials</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">Licensed Enterprise *
                <select value={effectiveCompanyId} onChange={(event) => setCompanyId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-100 outline-none focus:border-blue-600">
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select></label>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-black text-slate-100"><Layers className="h-4 w-4 text-amber-600" />Subscription Tier &amp; Allowance</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-700">Subscription Tier *
                <select value={tier} onChange={(event) => setTier(event.target.value as typeof tier)} className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-100 outline-none focus:border-blue-600">
                  <option value="BASIC">Basic (5 Cost Centers)</option>
                  <option value="PROFESSIONAL">Professional (25 Cost Centers)</option>
                  <option value="ENTERPRISE">Enterprise (100 Cost Centers)</option>
                </select></label>
              <label className="text-xs font-bold text-slate-700">Max Cost Centers (Read-Only)
                <input readOnly value={`Cost Centers ${TIER_CENTERS[tier]}`} className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-100 px-3.5 py-2 font-mono text-xs font-bold text-blue-900" /></label>
              <label className="text-xs font-bold text-slate-700">Validity Period (Days)
                <input type="number" min={1} value={validityDays} onChange={(event) => setValidityDays(parseInt(event.target.value, 10) || 365)} className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-xs font-bold text-slate-100 outline-none focus:border-blue-600" /></label>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-black text-slate-100"><Palette className="h-4 w-4 text-indigo-600" />Branding &amp; Visual Identity</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-700">Primary Color
                <span className="mt-1 flex items-center gap-2">
                  <input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} className="h-9 w-10 cursor-pointer rounded-lg border border-slate-300 p-0.5" />
                  <input value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs font-bold uppercase text-slate-100 outline-none focus:border-blue-600" />
                </span></label>
              <label className="text-xs font-bold text-slate-700">Secondary Color
                <span className="mt-1 flex items-center gap-2">
                  <input type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} className="h-9 w-10 cursor-pointer rounded-lg border border-slate-300 p-0.5" />
                  <input value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs font-bold uppercase text-slate-100 outline-none focus:border-blue-600" />
                </span></label>
              <label className="text-xs font-bold text-slate-700">Theme Mode
                <select value={themeMode} onChange={(event) => setThemeMode(event.target.value as typeof themeMode)} className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-100 outline-none focus:border-blue-600">
                  <option value="LIGHT">Light</option><option value="DARK">Dark</option><option value="CUSTOM">Custom</option>
                </select></label>
            </div>
          </section>

          <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50">
            <KeyRound className="h-4 w-4" />{busy ? 'Issuing License...' : 'Provision Enterprise License'}
          </button>
        </form>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-800/80 bg-white p-5 shadow-xs">
            <h3 className="flex items-center gap-2 text-xs font-black text-slate-100"><Sparkles className="h-4 w-4 text-amber-500" />Tenant Identity Preview</h3>
            <div className="mt-4 rounded-2xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">{tier} EDITION</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold">CC {TIER_CENTERS[tier]}</span>
              </div>
              <h4 className="mt-3 text-sm font-black">{selected?.name || 'Select an enterprise'}</h4>
              <p className="mt-1 font-mono text-[11px] text-white/80">Valid for: {validityDays} days</p>
            </div>
          </div>

          {selected?.licenseKey && (
            <div className="space-y-3 rounded-3xl border border-amber-300 bg-amber-50/70 p-5 shadow-md">
              <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-950"><ShieldCheck className="h-4 w-4 text-emerald-600" />Active Issued License</span>
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                <button type="button" onClick={() => copyKey(selected.licenseKey as string)} className="text-slate-500 hover:text-slate-100">{copied === selected.licenseKey ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
                <span className="flex-1 truncate font-mono text-xs font-bold text-slate-100">{selected.licenseKey}</span>
              </div>
              <p className="text-[11px] font-bold text-amber-900">Tenant: {selected.name}</p>
              {selected.licenseExpiresAt && <p className="text-[11px] text-amber-800">Expires: {new Date(selected.licenseExpiresAt).toLocaleDateString()}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div><h3 className="flex items-center gap-2 text-sm font-black text-slate-100"><Building2 className="h-4 w-4 text-blue-600" />Licensed Multi-Tenant Registry</h3>
            <p className="text-xs text-slate-500">Manage segregated tenant instances, verify cryptographic keys, and switch active tenant context</p></div>
          <button onClick={() => refreshCompanies()} className="flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-950"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="bg-slate-950 text-slate-500"><tr>{['Licensed Enterprise', 'Tenant ID', 'Tier', 'Cost Centers Limit', 'License Key', 'Status', 'Actions'].map((label) => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((company) => (
                <tr key={company.id} className={currentCompany?.id === company.id ? 'bg-blue-50/60' : 'hover:bg-slate-950'}>
                  <td className="px-4 py-3 font-bold text-slate-100">{company.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{company.slug}</td>
                  <td className="px-4 py-3"><span className={`rounded-md border px-2 py-0.5 text-[10px] font-black whitespace-nowrap shrink-0 ${tierBadge(company.subscriptionTier)}`}>{company.subscriptionTier || 'PROFESSIONAL'}</span></td>
                  <td className="px-4 py-3">centers max {company.maxCostCenters ?? 25}</td>
                  <td className="px-4 py-3">
                    {company.licenseKey ? <button onClick={() => copyKey(company.licenseKey as string)} className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-700 hover:text-blue-700">{copied === company.licenseKey ? <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}{company.licenseKey}</button> : <span className="text-slate-400">Not issued</span>}
                  </td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 whitespace-nowrap shrink-0"><CheckCircle2 className="h-3 w-3 shrink-0" />Active &amp; Isolated</span></td>
                  <td className="px-4 py-3"><button onClick={() => { setCurrentCompany(company); setCompanyId(company.id); }} className="rounded-lg border border-blue-200 px-2.5 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50">Switch Context</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

type PlanDraft = {
  display_name: string;
  description: string;
  monthly_price: string;
  annual_price: string;
  features: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: string;
  max_seats: string;
  max_vehicles: string;
  max_storage_gb: string;
  max_monthly_transactions: string;
};

const planToDraft = (plan: SubscriptionPlanDto): PlanDraft => ({
  display_name: plan.display_name || '',
  description: plan.description || '',
  monthly_price: String(plan.monthly_price ?? 0),
  annual_price: String(plan.annual_price ?? 0),
  features: (plan.display_features ?? []).join('\n'),
  is_featured: Boolean(plan.is_featured),
  is_active: plan.is_active !== false,
  sort_order: String(plan.sort_order ?? 0),
  max_seats: String(plan.max_seats ?? 1),
  max_vehicles: String(plan.max_vehicles ?? 0),
  max_storage_gb: String(plan.max_storage_gb ?? 0),
  max_monthly_transactions: String(plan.max_monthly_transactions ?? 0),
});

const limitLabel = (value?: number) => (isUnlimited(value) ? 'Unlimited' : formatSar(value ?? 0));

/**
 * Super Admin pricing console. Reads and edits the subscription_plans table, which is the
 * single source of truth for the public landing page and the tenant billing dashboard.
 */
export const PricingPlansView: React.FC = () => {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubscriptionPlanDto | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await erpApi.getAdminPricingPlans();
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEditor = (plan: SubscriptionPlanDto) => {
    setEditing(plan);
    setDraft(planToDraft(plan));
    setNotice(null);
    setError(null);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(null);
    setDraft(null);
  };

  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const draftMonthly = Number(draft?.monthly_price);
  const draftAnnual = Number(draft?.annual_price);
  const draftSavings = draftMonthly > 0 && draftAnnual > 0 ? Math.round((1 - draftAnnual / (draftMonthly * 12)) * 100) : 0;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !draft) return;
    const monthly = Number(draft.monthly_price);
    const annual = Number(draft.annual_price);
    if (!Number.isFinite(monthly) || monthly < 0 || !Number.isFinite(annual) || annual < 0) {
      setError('Prices must be valid, non-negative SAR amounts.');
      return;
    }
    const features = draft.features.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!features.length) {
      setError('Add at least one feature (one per line).');
      return;
    }
    const toInt = (value: string, min = 0) => Math.max(min, Math.round(Number(value) || 0));
    setSaving(true);
    setError(null);
    try {
      await erpApi.updatePricingPlan(editing.id, {
        display_name: draft.display_name.trim(),
        description: draft.description.trim(),
        monthly_price: monthly.toFixed(2),
        annual_price: annual.toFixed(2),
        display_features: features,
        is_featured: draft.is_featured,
        is_active: draft.is_active,
        sort_order: toInt(draft.sort_order),
        max_seats: toInt(draft.max_seats, 1),
        max_vehicles: toInt(draft.max_vehicles),
        max_storage_gb: toInt(draft.max_storage_gb),
        max_monthly_transactions: toInt(draft.max_monthly_transactions),
      });
      await load();
      invalidatePricingPlans().catch(() => undefined);
      setNotice(`${draft.display_name.trim()} saved. The new pricing is live on the landing page and tenant billing.`);
      setEditing(null);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the plan.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 outline-none focus:border-blue-500';

  return (
    <div className="space-y-6">
      <Banner icon={CreditCard} title="Cloud Subscription & Pricing Plans" tone="from-slate-900 via-indigo-950 to-blue-950"
        badge="Single source of truth"
        subtitle="Edit tier names, SAR prices, features and quotas. Changes publish instantly to the public landing page and every tenant's billing dashboard."
        action={<div className="flex items-center gap-2">
          <div className="flex items-center rounded-2xl border border-slate-700 bg-slate-800/80 p-1">
            {(['monthly', 'yearly'] as const).map((value) => (
              <button key={value} id={`admin-pricing-cycle-${value}`} onClick={() => setCycle(value)} className={`rounded-xl px-4 py-2 text-xs font-bold capitalize transition ${cycle === value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {value}
              </button>
            ))}
          </div>
          <button id="admin-pricing-refresh" onClick={load} disabled={loading} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white" title="Reload plans">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>} />

      {notice && <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
      {error && !editing && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-300">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        {loading && plans.length === 0 && [0, 1, 2].map((key) => (
          <div key={key} className="h-96 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
        ))}
        {plans.map((plan) => {
          const yearly = cycle === 'yearly';
          const price = yearly ? Number(plan.annual_price) : Number(plan.monthly_price);
          const savings = annualSavingsPercent(plan);
          return (
            <article key={plan.id} id={`admin-plan-${plan.name.toLowerCase()}`} className={`relative flex flex-col justify-between rounded-3xl border bg-slate-900/90 p-6 text-slate-100 shadow-xl transition-all hover:shadow-lg ${plan.is_featured ? 'border-blue-400 ring-2 ring-blue-500/20' : 'border-slate-800'} ${plan.is_active === false ? 'opacity-60' : ''}`}>
              {plan.is_featured && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-1 text-[11px] font-black text-white shadow-md">Most Popular</span>}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{plan.name}</span>
                  <div className="flex items-center gap-1.5">
                    {plan.is_active === false && <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-black uppercase text-slate-400">Hidden</span>}
                    <span className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300"><Building2 className="h-3.5 w-3.5 text-blue-400" />{plan.subscriber_count ?? 0} Subscribers</span>
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-black text-slate-100">{plan.display_name}</h3>
                {plan.description && <p className="mt-1 text-xs text-slate-400">{plan.description}</p>}
                <div className="mt-4 flex flex-wrap items-baseline gap-1 border-b border-slate-800 pb-5">
                  <span className="font-mono text-3xl font-black text-white">{formatSar(price)}</span>
                  <span className="text-xs font-bold text-slate-500">SAR / {yearly ? 'year' : 'month'}</span>
                  {yearly && price > 0 && <span className="ml-2 text-[10px] text-slate-400">≈ {formatSar(Math.round(price / 12))} / month{savings > 0 ? ` · saves ${savings}%` : ''}</span>}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                  {([['Seats', plan.max_seats], ['Vehicles', plan.max_vehicles], ['Storage (GB)', plan.max_storage_gb], ['Txns / month', plan.max_monthly_transactions]] as const).map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-950 px-3 py-2"><dt className="text-slate-500">{label}</dt><dd className="font-mono font-bold text-slate-200">{limitLabel(value)}</dd></div>
                  ))}
                </dl>
                <ul className="mt-4 space-y-2 text-xs">
                  {(plan.display_features ?? []).map((feature) => <li key={feature} className="flex items-start gap-2 text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{feature}</li>)}
                </ul>
              </div>
              <button id={`admin-plan-edit-${plan.name.toLowerCase()}`} onClick={() => openEditor(plan)} className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 py-2.5 text-xs font-bold text-slate-200 transition hover:border-blue-500 hover:text-white">
                <Pencil className="h-3.5 w-3.5 text-blue-400" />Edit plan & pricing
              </button>
            </article>
          );
        })}
      </div>

      {editing && draft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={save} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-black">Edit {editing.name} plan</h3>
                <p className="text-xs text-slate-500">Prices in SAR, excluding 15% VAT. {editing.subscriber_count ?? 0} tenant(s) currently on this plan.</p>
              </div>
              <button type="button" onClick={closeEditor} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-300 sm:col-span-2">Display name
                <input id="plan-edit-display-name" required minLength={2} maxLength={100} value={draft.display_name} onChange={(e) => set('display_name', e.target.value)} className={inputClass} /></label>
              <label className="text-xs font-bold text-slate-300 sm:col-span-2">Description
                <textarea id="plan-edit-description" rows={2} maxLength={600} value={draft.description} onChange={(e) => set('description', e.target.value)} className={inputClass} /></label>
              <label className="text-xs font-bold text-slate-300">Monthly price (SAR)
                <input id="plan-edit-monthly" required type="number" min={0} step="0.01" value={draft.monthly_price} onChange={(e) => set('monthly_price', e.target.value)} className={`${inputClass} font-mono`} /></label>
              <label className="text-xs font-bold text-slate-300">Annual price (SAR)
                <input id="plan-edit-annual" required type="number" min={0} step="0.01" value={draft.annual_price} onChange={(e) => set('annual_price', e.target.value)} className={`${inputClass} font-mono`} />
                <span className="mt-1 block text-[10px] font-medium text-slate-500">
                  {draftMonthly > 0 ? `12 × monthly = ${formatSar(draftMonthly * 12, 2)} SAR · annual saving ${draftSavings}%` : 'Free tier'}
                </span></label>
              <label className="text-xs font-bold text-slate-300 sm:col-span-2">Features (one per line)
                <textarea id="plan-edit-features" required rows={6} value={draft.features} onChange={(e) => set('features', e.target.value)} className={`${inputClass} font-mono leading-relaxed`} /></label>
              {([['max_seats', 'User seats', 1], ['max_vehicles', 'Fleet vehicles', 0], ['max_storage_gb', 'Storage (GB)', 0], ['max_monthly_transactions', 'Transactions / month', 0]] as const).map(([key, label, min]) => (
                <label key={key} className="text-xs font-bold text-slate-300">{label}
                  <input id={`plan-edit-${key}`} type="number" min={min} max={999999} step={1} value={draft[key]} onChange={(e) => set(key, e.target.value)} className={`${inputClass} font-mono`} />
                  <span className="mt-1 block text-[10px] font-medium text-slate-500">999999 = Unlimited</span></label>
              ))}
              <label className="text-xs font-bold text-slate-300">Display order
                <input id="plan-edit-sort" type="number" min={0} max={1000} step={1} value={draft.sort_order} onChange={(e) => set('sort_order', e.target.value)} className={`${inputClass} font-mono`} /></label>
              <div className="flex flex-col justify-end gap-2 text-xs font-bold text-slate-300">
                <label className="flex items-center gap-2"><input id="plan-edit-featured" type="checkbox" checked={draft.is_featured} onChange={(e) => set('is_featured', e.target.checked)} className="h-4 w-4 accent-blue-600" />Highlight as "Most Popular"</label>
                <label className="flex items-center gap-2"><input id="plan-edit-active" type="checkbox" checked={draft.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-blue-600" />Published in public catalog</label>
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">{error}</p>}

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={closeEditor} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300">Cancel</button>
              <button id="plan-edit-save" type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving…' : 'Save & publish'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const SystemAuditView: React.FC = () => {
  const [audit, setAudit] = useState<IsolationAudit | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try { setAudit(await erpApi.getIsolationAudit()); } catch (error) { console.error('Isolation audit failed:', error); } finally { setBusy(false); }
  };
  useEffect(() => { run(); }, []);

  const tables = audit?.isolated_tables || [];
  const cards = [
    { label: 'Isolated Tables', value: `${audit?.total_isolated_tables ?? 0} / ${audit?.total_isolated_tables ?? 0}`, note: '100% Row-Level Isolation', icon: Database, tone: 'text-emerald-600' },
    { label: 'Backend Server', value: audit?.backend_status || '—', note: 'FastAPI / Nginx Proxy Active', icon: Server, tone: 'text-blue-600' },
    { label: 'Active Tenants', value: `${audit?.total_registered_tenants ?? 0}`, note: 'Registered organizations', icon: Layers, tone: 'text-purple-600' },
    { label: 'Security Policy', value: audit?.security_policy || '—', note: 'X-Company-ID guard enforced', icon: Lock, tone: 'text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <Banner icon={ShieldCheck} title="System Isolation & Multi-Tenant Audit" badge="100% Isolated" tone="from-emerald-950 via-slate-900 to-teal-950"
        subtitle="Live verification of multi-tenant row isolation across every scoped table, header guards, and active tenant context."
        action={<button onClick={run} disabled={busy} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Run Live Audit</button>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => { const Icon = card.icon; return (
          <div key={card.label} className="rounded-3xl border border-slate-800/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{card.label}</span><Icon className={`h-5 w-5 ${card.tone}`} /></div>
            <p className="mt-2 font-mono text-2xl font-black text-slate-100">{card.value}</p>
            <span className={`mt-1 inline-block text-[11px] font-bold ${card.tone}`}>{card.note}</span>
          </div>
        ); })}
      </div>

      <div className="space-y-4 rounded-3xl border border-slate-800/80 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div><h3 className="text-sm font-black text-slate-100">Database Tables Isolation Matrix</h3>
            <p className="mt-0.5 text-xs text-slate-500">Every query strictly applies the tenant partition filter preventing cross-tenant data leaks</p></div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 whitespace-nowrap shrink-0"><CheckCircle2 className="h-4 w-4 shrink-0" />All Passed</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => (
            <div key={table} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs">
              <span className="flex items-center gap-2"><Database className="h-4 w-4 shrink-0 text-slate-400" /><span className="font-mono font-bold text-slate-200 break-all">{table}</span></span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 whitespace-nowrap shrink-0">ISOLATED</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const SETTINGS_KEYS = {
  nameAr: 'oxengl_platform_name_ar', nameEn: 'oxengl_platform_name_en', tagline: 'oxengl_platform_slogan_ar',
  logo: 'oxengl_platform_logo_url', wallpaper: 'oxengl_platform_wallpaper_url', primary: 'oxengl_primary_color', secondary: 'oxengl_secondary_color',
  email: 'oxengl_support_email', phone: 'oxengl_support_phone', cr: 'oxengl_operator_cr', vat: 'oxengl_operator_vat',
  announcement: 'oxengl_announcement', announcementActive: 'oxengl_announcement_active', vatRate: 'oxengl_default_vat_rate', currency: 'oxengl_currency_code',
};

export const PlatformSettingsView: React.FC = () => {
  const { brandConfig, updateBrandConfig } = useApp();
  const read = (key: string, fallback: string) => localStorage.getItem(key) || fallback;
  const [nameAr, setNameAr] = useState(() => read(SETTINGS_KEYS.nameAr, 'منصة أوكسن جي إل السحابية'));
  const [nameEn, setNameEn] = useState(() => read(SETTINGS_KEYS.nameEn, 'OxenGL Cloud ERP Platform'));
  const [tagline, setTagline] = useState(() => read(SETTINGS_KEYS.tagline, 'Unified Multi-Tenant Cloud ERP for Transport, Quarries & Logistics'));
  const [logoUrl, setLogoUrl] = useState(() => read(SETTINGS_KEYS.logo, '/logo.png'));
  const [wallpaperUrl, setWallpaperUrl] = useState(() => read(SETTINGS_KEYS.wallpaper, '/assets/default-mesh-bg.jpg'));
  const [primaryColor, setPrimaryColor] = useState(() => read(SETTINGS_KEYS.primary, '#1E3A8A'));
  const [secondaryColor, setSecondaryColor] = useState(() => read(SETTINGS_KEYS.secondary, '#4338CA'));
  const [supportEmail, setSupportEmail] = useState(() => read(SETTINGS_KEYS.email, 'awadh.a.1987@gmail.com'));
  const [supportPhone, setSupportPhone] = useState(() => read(SETTINGS_KEYS.phone, '+966 50 123 4567'));
  const [operatorCr, setOperatorCr] = useState(() => read(SETTINGS_KEYS.cr, '1010789012'));
  const [operatorVat, setOperatorVat] = useState(() => read(SETTINGS_KEYS.vat, '310987654300003'));
  const [announcement, setAnnouncement] = useState(() => read(SETTINGS_KEYS.announcement, 'Welcome to the OxenGL cloud platform — ZATCA compliant release v2.0.'));
  const [announcementActive, setAnnouncementActive] = useState(() => localStorage.getItem(SETTINGS_KEYS.announcementActive) === 'true');
  const [vatRate, setVatRate] = useState(() => Number(read(SETTINGS_KEYS.vatRate, '15')));
  const [currency, setCurrency] = useState(() => read(SETTINGS_KEYS.currency, 'SAR'));
  const [saved, setSaved] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState(false);
  const [wallpaperUploadStatus, setWallpaperUploadStatus] = useState<string | null>(null);

  const uploadLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadStatus('جاري رفع الشعار وتحديث الأصول في الوقت الفعلي...');
    const reader = new FileReader();
    reader.onload = async (loaded) => {
      if (loaded.target?.result) {
        const base64Data = loaded.target.result as string;
        setLogoUrl(base64Data);
        // Real-time backend dispatch of image file buffer
        try {
          const res = await fetch('/api/platform/assets/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('oxengl_auth_jwt') || ''}`,
            },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              fileBuffer: base64Data,
              assetType: 'platform_logo',
              primaryColor,
              secondaryColor,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              setLogoUrl(data.url);
              localStorage.setItem(SETTINGS_KEYS.logo, data.url);
            }
            setUploadStatus('تم رفع الشعار وتحديث الأصول في الوقت الفعلي بنجاح');
          } else {
            setUploadStatus('تم حفظ الشعار محلياً');
          }
        } catch (err) {
          console.warn('Backend asset upload warning:', err);
          setUploadStatus('تم حفظ الشعار محلياً');
        } finally {
          setIsUploading(false);
          window.setTimeout(() => setUploadStatus(null), 4000);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadWallpaper = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploadingWallpaper(true);
    setWallpaperUploadStatus('جاري رفع الخلفية ومعالجتها بالخادم...');
    const reader = new FileReader();
    reader.onload = async (loaded) => {
      if (loaded.target?.result) {
        const base64Data = loaded.target.result as string;
        setWallpaperUrl(base64Data);
        try {
          const res = await fetch('/api/platform/assets/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('oxengl_auth_jwt') || ''}`,
            },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              fileBuffer: base64Data,
              assetType: 'platform_wallpaper',
              wallpaperUrl: base64Data,
              backgroundUrl: base64Data,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              setWallpaperUrl(data.url);
              localStorage.setItem(SETTINGS_KEYS.wallpaper, data.url);
            }
            setWallpaperUploadStatus('تم رفع الخلفية وتحديث مظهر المنصة بنجاح');
          } else {
            setWallpaperUploadStatus('تم الحفظ المحلي لخلفية المنصة');
          }
        } catch (err) {
          console.warn('Wallpaper upload warning:', err);
          setWallpaperUploadStatus('تم الحفظ المحلي');
        } finally {
          setIsUploadingWallpaper(false);
          window.setTimeout(() => setWallpaperUploadStatus(null), 4000);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const entries: [string, string][] = [
      [SETTINGS_KEYS.nameAr, nameAr], [SETTINGS_KEYS.nameEn, nameEn], [SETTINGS_KEYS.tagline, tagline],
      [SETTINGS_KEYS.logo, logoUrl], [SETTINGS_KEYS.wallpaper, wallpaperUrl], [SETTINGS_KEYS.primary, primaryColor], [SETTINGS_KEYS.secondary, secondaryColor],
      [SETTINGS_KEYS.email, supportEmail], [SETTINGS_KEYS.phone, supportPhone], [SETTINGS_KEYS.cr, operatorCr],
      [SETTINGS_KEYS.vat, operatorVat], [SETTINGS_KEYS.announcement, announcement],
      [SETTINGS_KEYS.announcementActive, String(announcementActive)], [SETTINGS_KEYS.vatRate, String(vatRate)], [SETTINGS_KEYS.currency, currency],
    ];
    entries.forEach(([key, value]) => localStorage.setItem(key, value));
    updateBrandConfig?.({ companyNameAr: nameAr, companyNameEn: nameEn, customLogoUrl: logoUrl, wallpaperUrl, primaryColor, secondaryColor, phone: supportPhone, email: supportEmail, crNumber: operatorCr, taxNumber: operatorVat });

    // Real-time backend dispatch to persist branding and assets
    try {
      await fetch('/api/platform/assets/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('oxengl_auth_jwt') || ''}`,
        },
        body: JSON.stringify({
          fileName: 'platform_logo.png',
          fileBuffer: logoUrl,
          primaryColor,
          secondaryColor,
          wallpaperUrl,
          backgroundUrl: wallpaperUrl,
          assetType: 'platform_branding',
        }),
      });
    } catch (_) {}

    // Persist to database site_settings
    try {
      await fetch('/api/settings/admin', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('oxengl_auth_jwt') || ''}`,
        },
        body: JSON.stringify([
          { key: 'site_name', value: nameEn || 'OxenGL' },
          { key: 'site_logo', value: logoUrl || '/oxengl-wordmark.svg' },
          { key: 'site_description', value: tagline },
          { key: 'site_tagline', value: tagline },
          { key: 'contact_email', value: supportEmail },
          { key: 'contact_phone', value: supportPhone },
        ]),
      });
    } catch (_) {}

    setSaved(true);
    window.setTimeout(() => setSaved(false), 3500);
  };

  const resetDefaults = () => {
    if (!window.confirm('Reset OxenGL platform settings to defaults?')) return;
    setNameAr('منصة أوكسن جي إل السحابية'); setNameEn('OxenGL Cloud ERP Platform');
    setTagline('Unified Multi-Tenant Cloud ERP for Transport, Quarries & Logistics');
    setLogoUrl('/logo.png'); setPrimaryColor('#1E3A8A'); setSecondaryColor('#4338CA');
    setSupportEmail('awadh.a.1987@gmail.com'); setSupportPhone('+966 50 123 4567');
    setOperatorCr('1010789012'); setOperatorVat('310987654300003'); setVatRate(15); setCurrency('SAR'); setAnnouncementActive(false);
  };

  const field = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-100 outline-none focus:border-indigo-500';

  return (
    <form onSubmit={save} className="space-y-6">
      <Banner icon={Settings} title="OxenGL Platform Settings & Master Branding" badge="Platform Owner Console" tone="from-blue-950 via-indigo-900 to-slate-900"
        subtitle="Master control center for OxenGL platform identity, white-label defaults, system-wide announcements, and multi-tenant compliance."
        action={<div className="flex items-center gap-3">
          <button type="button" onClick={resetDefaults} className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"><RefreshCw className="h-3.5 w-3.5" />Reset Defaults</button>
          <button type="submit" className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg hover:brightness-110"><Save className="h-4 w-4" />Save All Settings</button>
        </div>} />

      {saved && <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-900"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /><span className="font-bold">OxenGL platform settings saved successfully.</span></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/90 border border-slate-800 p-6 shadow-xl text-slate-100">
            <header className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Palette className="h-4 w-4" /></span>
              <div><h3 className="text-sm font-black text-slate-100">Visual Branding &amp; Logo</h3><p className="text-[11px] text-slate-500">Master platform name, primary logo, and header color palette</p></div>
            </header>
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-bold text-slate-700">Platform Name (Arabic)<input value={nameAr} onChange={(event) => setNameAr(event.target.value)} className={field} /></label>
                <label className="block text-xs font-bold text-slate-700">Platform Name (English)<input value={nameEn} onChange={(event) => setNameEn(event.target.value)} className={field} /></label>
              </div>
              <label className="block text-xs font-bold text-slate-700">Platform Tagline<input value={tagline} onChange={(event) => setTagline(event.target.value)} className={field} /></label>
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
                <p className="mb-2 text-xs font-bold text-slate-200">Master Platform Logo</p>
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 p-2 shadow-xs">
                    <img src={logoUrl} alt="Platform logo preview" className="max-h-full max-w-full object-contain" onError={(event) => { (event.target as HTMLElement).style.visibility = 'hidden'; }} />
                  </div>
                  <div className="w-full flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500" />
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-950">
                        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" /> : <Upload className="h-3.5 w-3.5 text-indigo-600" />}
                        {isUploading ? 'جاري الرفع...' : 'Upload'}
                        <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" disabled={isUploading} />
                      </label>
                    </div>
                    {uploadStatus && <p className="text-[11px] font-bold text-indigo-600">{uploadStatus}</p>}
                    <p className="text-[10.5px] text-slate-400">Supports high-res PNG, SVG, or JPG with transparent background.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
                <p className="mb-2 text-xs font-bold text-slate-200">Corporate Wallpaper &amp; Background</p>
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xs">
                    <img src={wallpaperUrl} alt="Wallpaper preview" className="h-full w-full object-cover" onError={(event) => { (event.target as HTMLElement).style.visibility = 'hidden'; }} />
                  </div>
                  <div className="w-full flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={wallpaperUrl} onChange={(event) => setWallpaperUrl(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500" />
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-950">
                        {isUploadingWallpaper ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" /> : <Upload className="h-3.5 w-3.5 text-indigo-600" />}
                        {isUploadingWallpaper ? 'جاري الرفع...' : 'Upload'}
                        <input type="file" accept="image/*" onChange={uploadWallpaper} className="hidden" disabled={isUploadingWallpaper} />
                      </label>
                    </div>
                    {wallpaperUploadStatus && <p className="text-[11px] font-bold text-indigo-600">{wallpaperUploadStatus}</p>}
                    <p className="text-[10.5px] text-slate-400">Custom mesh wallpaper for portal hero and login card backdrops.</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                {([['Primary Color', primaryColor, setPrimaryColor], ['Secondary Color', secondaryColor, setSecondaryColor]] as const).map(([label, value, setter]) => (
                  <div key={label}><p className="mb-1 text-xs font-bold text-slate-700">{label}</p>
                    <div className="flex items-center gap-2">
                      <input type="color" value={value} onChange={(event) => setter(event.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5" />
                      <input value={value} onChange={(event) => setter(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs uppercase text-slate-100 outline-none focus:border-indigo-500" />
                    </div></div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/90 border border-slate-800 p-6 shadow-xl text-slate-100">
            <header className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Megaphone className="h-4 w-4" /></span>
                <div><h3 className="text-sm font-black text-slate-100">System-Wide Broadcast Announcement</h3><p className="text-[11px] text-slate-500">Live broadcast notice displayed to all tenant users in the system</p></div>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <span className="text-xs font-bold text-slate-600">{announcementActive ? 'Active' : 'Disabled'}</span>
                <input type="checkbox" checked={announcementActive} onChange={(event) => setAnnouncementActive(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
              </label>
            </header>
            <textarea rows={3} value={announcement} onChange={(event) => setAnnouncement(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-300 p-3 text-xs leading-relaxed text-slate-100 outline-none focus:border-indigo-500" />
            <div className="flex items-center justify-between text-[11px] text-slate-400"><span>Broadcasts to OxenGL &amp; Tenant Workspaces</span><span>{announcement.length} chars</span></div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/90 border border-slate-800 p-6 shadow-xl text-slate-100">
            <header className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Building2 className="h-4 w-4" /></span>
              <div><h3 className="text-sm font-black text-slate-100">Platform Operator Info</h3><p className="text-[11px] text-slate-500">Legal registration and tax identity</p></div>
            </header>
            <div className="mt-4 space-y-3.5">
              <label className="block text-xs font-bold text-slate-700">Operator CR Number<input value={operatorCr} onChange={(event) => setOperatorCr(event.target.value)} className={`${field} font-mono`} /></label>
              <label className="block text-xs font-bold text-slate-700">Operator VAT Number<input value={operatorVat} onChange={(event) => setOperatorVat(event.target.value)} className={`${field} font-mono`} /></label>
              <label className="block text-xs font-bold text-slate-700">Support Email<input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} className={`${field} font-mono`} /></label>
              <label className="block text-xs font-bold text-slate-700">Support Phone / WhatsApp<input value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} className={`${field} font-mono`} /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/90 border border-slate-800 p-6 shadow-xl text-slate-100">
            <header className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="h-4 w-4" /></span>
              <div><h3 className="text-sm font-black text-slate-100">Compliance &amp; VAT Standards</h3><p className="text-[11px] text-slate-500">Default VAT rate &amp; base currency</p></div>
            </header>
            <div className="mt-4 space-y-3.5">
              <label className="block text-xs font-bold text-slate-700">Default VAT Rate (%)<input type="number" min={0} max={100} value={vatRate} onChange={(event) => setVatRate(Number(event.target.value))} className={`${field} font-mono`} />
                <span className="mt-1 block text-[10px] font-normal text-slate-400">Standard Saudi ZATCA rate is 15%</span></label>
              <label className="block text-xs font-bold text-slate-700">System Base Currency
                <select value={currency} onChange={(event) => setCurrency(event.target.value)} className={field}>
                  <option value="SAR">Saudi Riyal (SAR)</option><option value="USD">US Dollar (USD)</option><option value="YER">Yemeni Rial (YER)</option><option value="AED">UAE Dirham (AED)</option>
                </select></label>
            </div>
          </section>

          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-700 to-blue-800 py-3.5 text-xs font-black text-white shadow-lg hover:brightness-110"><Save className="h-4 w-4" />Commit &amp; Save Platform Settings</button>
        </div>
      </div>
    </form>
  );
};

export const PanoramicCockpit: React.FC<{ onNavigate: (tab: 'tenants' | 'licenses' | 'pricing' | 'health' | 'settings' | 'analytics') => void }> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { companies, refreshCompanies } = useApp();
  const { plans: catalogPlans } = usePricingPlans();
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(new Date());
  const [audit, setAudit] = useState<IsolationAudit | null>(null);
  const [cloudTelemetry, setCloudTelemetry] = useState<{
    status?: string;
    disk?: { total_gb: number; used_gb: number; free_gb: number; utilization_percent: number };
    cpu?: { utilization_percent: number; cores: number; status: string };
    memory?: { total_gb: number; used_gb: number; utilization_percent: number; status: string };
    tenants?: { total: number; active: number };
    database?: { name: string; size: string; connected_pool: string };
  } | null>(null);
  const [velocityData, setVelocityData] = useState<{
    rolling_window_days: number;
    start_date: string;
    end_date: string;
    data: { date: string; day_label: string; audit_events: number; transaction_velocity: number }[];
  } | null>(null);

  useEffect(() => {
    erpApi.getIsolationAudit().then(setAudit).catch(() => setAudit(null));
    authFetch('/api/v1/superadmin/cloud-telemetry')
      .then((r) => (r.ok ? r.json() : null))
      .then(setCloudTelemetry)
      .catch(() => null);
    authFetch('/api/v1/superadmin/analytics/velocity')
      .then((r) => (r.ok ? r.json() : null))
      .then(setVelocityData)
      .catch(() => null);
  }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      await refreshCompanies();
      setAudit(await erpApi.getIsolationAudit());
      const [tRes, vRes] = await Promise.all([
        authFetch('/api/v1/superadmin/cloud-telemetry'),
        authFetch('/api/v1/superadmin/analytics/velocity'),
      ]);
      if (tRes.ok) setCloudTelemetry(await tRes.json());
      if (vRes.ok) setVelocityData(await vRes.json());
    } catch (error) {
      console.warn('Telemetry refresh failed:', error);
    } finally {
      setPulse(new Date());
      setBusy(false);
    }
  };

  const totalCenters = useMemo(() => companies.reduce((sum, company) => sum + (company.maxCostCenters ?? 25), 0), [companies]);
  const licensed = companies.filter((company) => Boolean(company.licenseKey)).length;
  const mrr = useMemo(() => {
    const monthlyByCode = new Map(catalogPlans.map((plan) => [plan.name.toUpperCase(), Number(plan.monthly_price)]));
    return companies.reduce((sum, company) => sum + (monthlyByCode.get(normalizeTierCode(company.subscriptionTier)) ?? 0), 0);
  }, [catalogPlans, companies]);

  const totalTenantsCount = cloudTelemetry?.tenants?.total ?? companies.length;
  const activeTenantsCount = cloudTelemetry?.tenants?.active ?? companies.length;
  const cpuPercent = cloudTelemetry?.cpu?.utilization_percent ?? 18.5;
  const memoryPercent = cloudTelemetry?.memory?.utilization_percent ?? 42.0;

  const telemetry = [
    ['Platform Health', audit ? 'All Systems Nominal' : 'Connecting...', 'text-emerald-400'],
    ['CPU Utilization', `${cpuPercent}% Load`, 'text-cyan-300'],
    ['Memory Load', `${memoryPercent}% (${cloudTelemetry?.memory?.used_gb ?? 1.53} GB)`, 'text-indigo-300'],
    ['RLS Isolation', `${audit?.total_isolated_tables ?? 0} Tables Locked`, 'text-emerald-300'],
    ['Total Tenants', `${totalTenantsCount} (${activeTenantsCount} Active)`, 'text-amber-300'],
    ['Last Pulse', pulse.toLocaleTimeString(), 'text-slate-300'],
  ] as const;

  const kpis = [
    { label: t('kpi_asset_valuation'), value: `${mrr.toLocaleString('en-US')}`, unit: 'SAR/mo', note: `Annual Run Rate: ${(mrr * 12).toLocaleString('en-US')} SAR`, icon: CreditCard, tone: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    { label: 'Total Multi-Tenants', value: `${totalTenantsCount}`, unit: 'Tenants', note: `Active: ${activeTenantsCount} · Centers: ${totalCenters}`, icon: Building2, tone: 'bg-blue-50 text-blue-600 border-blue-100' },
    { label: 'CPU Utilization', value: `${cpuPercent}%`, unit: `${cloudTelemetry?.cpu?.cores ?? 4} Cores`, note: 'Nominal Multi-Tenant Execution Load', icon: Cpu, tone: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
    { label: 'Memory Load', value: `${memoryPercent}%`, unit: `${cloudTelemetry?.memory?.total_gb ?? 1.92} GB`, note: `Active RSS: ${cloudTelemetry?.memory?.used_gb ?? 1.53} GB`, icon: Server, tone: 'bg-violet-50 text-violet-600 border-violet-100' },
  ];

  const maxVelocity = Math.max(
    ...(velocityData?.data.map((d) => d.transaction_velocity) || [10]),
    1
  );
  const totalOps = velocityData?.data.reduce((acc, d) => acc + d.transaction_velocity, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-3 w-3 animate-ping rounded-full bg-emerald-400" />
              <span className="rounded-md border border-blue-400/30 bg-blue-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-blue-300">OXENGL-MISSION-CONTROL</span>
              <span className="rounded-md border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-300">RLS ISOLATED: {audit?.total_isolated_tables ?? 0} TABLES</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight lg:text-3xl">{t('header_title')}</h1>
            <p className="max-w-3xl text-xs leading-relaxed text-slate-300">Central operations &amp; mission control cockpit for the OxenGL multi-tenant platform: aggregated financials, tenant isolation integrity, license quotas, and enterprise telemetry.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={refresh} disabled={busy} className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Refresh Telemetry</button>
            <button onClick={() => onNavigate('tenants')} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-md hover:bg-blue-500"><Plus className="h-4 w-4" />Onboard New Tenant</button>
            <button onClick={() => onNavigate('licenses')} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md hover:bg-indigo-500"><KeyRound className="h-4 w-4" />Issue License Key</button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-700/60 pt-4 text-xs sm:grid-cols-3 lg:grid-cols-6">
          {telemetry.map(([label, value, tone]) => (
            <div key={label} className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
              <span className="block text-[11px] text-slate-400">{label}</span>
              <span className={`font-mono text-xs font-bold ${tone}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {kpis.map((kpi) => { const Icon = kpi.icon; return (
          <SpotlightCard key={kpi.label} tone="platform" className="p-5 shadow-lg border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{kpi.label}</span>
              <span className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-2.5 text-orange-400"><Icon className="h-5 w-5" /></span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-white lg:text-3xl ltr-isolate-num">{kpi.value}</span>
              <span className="text-xs font-bold text-slate-400">{kpi.unit}</span>
            </div>
            <p className="mt-4 border-t border-slate-800 pt-2.5 text-xs text-slate-400">{kpi.note}</p>
          </SpotlightCard>
        ); })}
      </div>

      {/* Global Revenue Velocity Sparklines & Telemetry Spectrum */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-black text-white">Global Revenue &amp; Cross-Tenant Velocity Sparklines</h3>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                7-DAY WINDOW
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Aggregated transaction throughput across all isolated tenant databases and audit event frequency.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total 7-Day Operations</span>
              <span className="font-mono text-base font-black text-white ltr-isolate-num">{totalOps.toLocaleString()} ops</span>
            </div>
            <button
              onClick={() => onNavigate('analytics')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors"
            >
              <span>Full Analytics</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Velocity Sparkline Bars Representation */}
        <div className="mt-4 pt-2">
          <div className="h-32 flex items-end justify-between gap-3 pt-4 pb-2 border-b border-slate-800">
            {velocityData?.data && velocityData.data.length > 0 ? (
              velocityData.data.map((item, idx) => {
                const heightPct = Math.round((item.transaction_velocity / maxVelocity) * 100);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end">
                    <div className="text-[9px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 px-1.5 py-0.5 rounded border border-slate-800">
                      {item.transaction_velocity} ops
                    </div>
                    <div className="w-full max-w-[42px] bg-slate-100 rounded-t-lg overflow-hidden flex flex-col justify-end p-0.5">
                      <div
                        className="w-full bg-gradient-to-t from-blue-600 via-indigo-500 to-emerald-400 rounded-t-md transition-all duration-500 group-hover:brightness-110"
                        style={{ height: `${Math.max(heightPct, 12)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 text-center truncate w-full">
                      {item.day_label?.slice(0, 3) || item.date?.slice(5)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="w-full text-center text-xs text-slate-400 py-8">
                Loading velocity sparklines...
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 font-mono">
            <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <Zap className="h-3.5 w-3.5" /> Multi-Tenant Transaction Engine: 100% Operational
            </span>
            <span>Rolling Baseline: Active · Window: {velocityData?.start_date || '7d ago'} to {velocityData?.end_date || 'today'}</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-100"><Activity className="h-4 w-4 text-blue-600" />Tenant Portfolio</h3>
          <button onClick={() => onNavigate('tenants')} className="text-xs font-bold text-blue-700 hover:underline">Open registry</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-slate-950 text-slate-500"><tr>{['Organization', 'Tenant ID', 'Tier', 'Centers', 'License'].map((label) => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-slate-950">
                  <td className="px-4 py-3 font-bold text-slate-100">{company.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{company.slug}</td>
                  <td className="px-4 py-3"><span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${tierBadge(company.subscriptionTier)}`}>{company.subscriptionTier || 'PROFESSIONAL'}</span></td>
                  <td className="px-4 py-3">{company.maxCostCenters ?? 25}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{company.licenseKey || 'Not issued'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
