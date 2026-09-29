import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  Cloud,
  Cpu,
  CreditCard,
  Globe2,
  LockKeyhole,
  KeyRound,
  Layers,
  LogIn,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Company, User } from '../types';
import { erpApi } from '../services/api';
import { LoginButton } from '../components/LoginButton';
import { ThemeDensityToolbar } from '../components/design-system/ThemeDensityToolbar';
import { TenantLoginForm } from '../components/auth/TenantLoginForm';
import { TenantRegistrationForm } from '../components/auth/TenantRegistrationForm';
import { PasswordRecoveryModal } from '../components/auth/PasswordRecoveryModal';

interface OxenGLCloudPortalProps {
  onLoginSuccess: () => void;
}

type Tier = 'All' | 'Basic' | 'Pro' | 'Enterprise';
type RegistrationForm = {
  nameAr: string;
  nameEn: string;
  commercialRegistration: string;
  vatNumber: string;
  hqCity: string;
  tier: Exclude<Tier, 'All'>;
  adminEmail: string;
  phone: string;
  adminPassword: string;
};

const tierStyles: Record<Exclude<Tier, 'All'>, string> = {
  Basic: 'border-slate-500/50 bg-slate-400/10 text-slate-200',
  Pro: 'border-blue-400/40 bg-blue-400/10 text-blue-200',
  Enterprise: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
};

const defaultBlueprintCSS = `
  linear-gradient(rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.94)),
  linear-gradient(to right, rgba(6, 182, 212, 0.15) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(6, 182, 212, 0.15) 1px, transparent 1px),
  linear-gradient(to right, rgba(148, 163, 184, 0.04) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(148, 163, 184, 0.04) 1px, transparent 1px)
`;
const defaultBlueprintSize = "100% 100%, 100px 100px, 100px 100px, 20px 20px, 20px 20px";

export const OxenGLCloudPortal: React.FC<OxenGLCloudPortalProps> = ({ onLoginSuccess }) => {
  const { companies, currentCompany, brandConfig, setCurrentCompany, language, setLanguage, refreshCompanies, setUsers, setCurrentUser, logAuditAction } = useApp();
  const isAr = language === 'ar';
  const activeTenant = useMemo(() => {
    const tenant = currentCompany || (companies && companies.length > 0 ? companies[0] : null);
    return {
      ...tenant,
      logo_url: (tenant as any)?.logo_url || (tenant as any)?.uiLogoUrl || brandConfig?.customLogoUrl,
      primary_color: (tenant as any)?.primary_color || (tenant as any)?.uiPrimaryColor || brandConfig?.primaryColor || '#F59E0B',
      background_url: (tenant as any)?.background_url || (tenant as any)?.uiBackgroundUrl || (tenant as any)?.wallpaper_url || brandConfig?.wallpaperUrl,
      wallpaper_url: (tenant as any)?.wallpaper_url || (tenant as any)?.background_url || (tenant as any)?.uiBackgroundUrl || brandConfig?.wallpaperUrl,
    };
  }, [currentCompany, companies, brandConfig]);

  const logoUrl = activeTenant?.logo_url || '/assets/default-crown.svg';

  const computedBackgroundStyle = useMemo(() => {
    if (activeTenant?.background_url || activeTenant?.wallpaper_url) {
      return {
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.80), rgba(15, 23, 42, 0.90)), url(${activeTenant.background_url || activeTenant.wallpaper_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      };
    }
    return {
      backgroundColor: '#0f172a',
      backgroundImage: defaultBlueprintCSS,
      backgroundSize: defaultBlueprintSize,
      backgroundPosition: 'center center'
    };
  }, [activeTenant]);

  const backgroundWallpaper = useMemo(() => {
    return activeTenant?.background_url || activeTenant?.wallpaper_url || '/assets/default-mesh-bg.jpg';
  }, [activeTenant]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [recoveryPlane, setRecoveryPlane] = useState<'master' | 'tenant'>('tenant');
  const [recoverySlug, setRecoverySlug] = useState<string>('');
  const forcedNavigationRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (forcedNavigationRef.current) window.clearTimeout(forcedNavigationRef.current);
  }, []);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Tier>('All');
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationBillingCycle, setRegistrationBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [form, setForm] = useState<RegistrationForm>({
    nameAr: '', nameEn: '', commercialRegistration: '', vatNumber: '', hqCity: 'Riyadh', tier: 'Pro', adminEmail: '', phone: '', adminPassword: '',
  });

  const onboardingPlans = [
    { tier: 'Basic', key: 'BASIC', name: 'Basic Logistics Tier', monthly: 2500, yearly: 25500, style: 'border-amber-300', highlight: false, features: ['Fleet management (up to 15 trucks)', 'Automated weighbridge tickets & wastage', '5 Cost Centers max', '5 User accounts', 'Standard 15% VAT invoicing'], excluded: ['ZATCA Phase 2 Live Integration', 'Custom multi-level chart of accounts'] },
    { tier: 'Pro', key: 'PROFESSIONAL', name: 'Professional ERP Tier', monthly: 6500, yearly: 66300, style: 'border-blue-400 ring-2 ring-blue-500/20 shadow-xl', highlight: true, features: ['Unlimited fleet & transporter haulage', 'Crusher ledgers & payment clearances', '25 Cost Centers with budgeting', '15 RBAC Users with dual approvals', 'White-labeling & branded letterheads'], excluded: ['Dedicated private cloud container'] },
    { tier: 'Enterprise', key: 'ENTERPRISE', name: 'Enterprise Conglomerate Tier', monthly: 14000, yearly: 142800, style: 'border-purple-300', highlight: false, features: ['All ERP features without limits', 'Unlimited Cost Centers & Branches', '50+ Users with executive workflow', 'ZATCA Phase 2 direct API connector', '24/7 Dedicated Support & 99.9% SLA'], excluded: [] },
  ] as const;

  const tierFor = (company: Company): Exclude<Tier, 'All'> => {
    const t = (company.subscriptionTier || '').toUpperCase();
    if (t === 'BASIC') return 'Basic';
    if (t === 'ENTERPRISE') return 'Enterprise';
    return 'Pro';
  };

  // The public portal only exposes tenants with a current issued license.
  const licensedCompanies = useMemo(() => {
    const now = Date.now();
    return companies.filter((company) => Boolean(company.licenseKey) && (!company.licenseExpiresAt || new Date(company.licenseExpiresAt).getTime() > now));
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    return licensedCompanies.filter((company) => {
      const matchesSearch = `${company.name} ${company.slug} ${company.commercialRegistration || ''}`.toLowerCase().includes(search.toLowerCase());
      return matchesSearch && (filter === 'All' || tierFor(company) === filter);
    });
  }, [licensedCompanies, search, filter]);

  const launchWorkspace = (company: Company) => {
    setCurrentCompany(company);
    setSelectedCompany(company);
  };

  const completeDirectAccess = async (scope: 'master' | 'tenant') => {
    if (scope === 'tenant' && !selectedCompany) return;
    const recoveryCode = window.prompt('Enter the Server Recovery Code:');
    if (recoveryCode === null || recoveryCode === '') return;
    setIsRecovering(true);
    setLoginError(null);
    try {
      const response = await erpApi.directWorkspaceAccess({
        scope,
        company_id: scope === 'tenant' ? selectedCompany?.id : undefined,
        recovery_code: recoveryCode,
      });
      const account = response?.user;
      if (!account || !account.role) throw new Error('Recovery response did not include a usable session account');

      const email = account.email || 'recovery@oxengl.local';
      const displayName = account.fullName || account.fullNameAr || email;
      const recoveredUser: User = {
        id: account.id || email,
        username: email.split('@')[0],
        email,
        fullName: displayName,
        fullNameAr: account.fullNameAr || displayName,
        role: account.role,
        status: 'Active',
        companyId: account.company_id || undefined,
      };

      const resolvedCompany = companies.find((company) => company.id === account.company_id) || selectedCompany;
      if (scope === 'tenant' && resolvedCompany) setCurrentCompany?.(resolvedCompany);

      // Persisted before the state swap so a remount or forced reload still boots into the session.
      localStorage.setItem('oxengl_user', JSON.stringify(recoveredUser));
      localStorage.setItem('oxengl_session_active', 'true');
      localStorage.setItem('oxengl_recovery_session', 'true');
      if (resolvedCompany) localStorage.setItem('oxengl_current_company', JSON.stringify(resolvedCompany));

      setUsers?.((current) => current.some((user) => user.id === recoveredUser.id) ? current.map((user) => user.id === recoveredUser.id ? recoveredUser : user) : [...current, recoveredUser]);
      setCurrentUser?.(recoveredUser);
      // Session must advance before optional bookkeeping so a logging failure cannot strand the login screen.
      onLoginSuccess?.();

      // Cleared on unmount; only fires if the state transition failed to leave the portal.
      forcedNavigationRef.current = window.setTimeout(() => window.location.assign(window.location.pathname), 300);

      try {
        logAuditAction?.({ userId: recoveredUser.id, userName: recoveredUser.fullName, userRole: recoveredUser.role, action: 'LOGIN', entityType: 'User', entityId: recoveredUser.id, summary: 'Server-verified direct workspace recovery session established' });
      } catch (auditError) {
        console.warn('Recovery session audit entry was not recorded:', auditError);
      }
    } catch (error) {
      console.error('Direct workspace access failed:', error);
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setLoginError(`Direct access could not be completed (${detail}). Check the recovery code or contact the platform administrator.`);
    } finally {
      setIsRecovering(false);
    }
  };

  const directAccessControls = (scope: 'master' | 'tenant') => <div dir="ltr" className="mt-3 border border-slate-700 bg-slate-950/55 p-3"><button type="button" onClick={() => completeDirectAccess(scope)} disabled={isRecovering} className="flex w-full items-center justify-center gap-2 border border-violet-400/45 bg-violet-500/10 px-4 py-2.5 text-xs font-black text-violet-100 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"><KeyRound className="h-4 w-4" />{isRecovering ? 'Opening session...' : scope === 'master' ? 'Instant Admin Session' : 'Direct Workspace Access'}</button></div>;

  const submitRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{10}$/.test(form.commercialRegistration) || !/^\d{15}$/.test(form.vatNumber) || !form.adminEmail.trim() || !form.phone.trim() || form.adminPassword.length < 8) return;
    setIsSubmitting(true);
    setRegistrationError(null);
    try {
      await erpApi.registerCompany({
        company_name: form.nameEn || form.nameAr,
        slug: form.nameEn.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        cr_number: form.commercialRegistration,
        vat_number: form.vatNumber,
        admin_email: form.adminEmail,
        admin_name: form.nameEn || form.nameAr,
        admin_phone: form.phone,
        admin_password: form.adminPassword,
      });
      await refreshCompanies();
      setRegistrationComplete(true);
      window.setTimeout(() => setShowRegistration(false), 1200);
    } catch (error) {
      console.error('Tenant registration failed:', error);
      setRegistrationError('Registration could not be completed. Verify the commercial, tax, and administrator details.');
    } finally {
      setIsSubmitting(false);
    }
  };


  if (selectedCompany) {
    return (
      <div className="min-h-dvh erp-viewport-root w-full flex items-center justify-center transition-all duration-300" style={computedBackgroundStyle}>
        <main dir={isAr ? 'rtl' : 'ltr'} className="relative flex min-h-dvh erp-viewport-root w-full flex-col justify-between overflow-hidden px-4 text-slate-100">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
          <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-indigo-600/30">
                <Building2 className="h-6 w-6 text-indigo-100" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <strong className="text-lg font-black">{selectedCompany.name}</strong>
                  <span className="rounded-md border border-indigo-500/30 bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-black text-indigo-300">Isolated Tenant</span>
                </div>
                <p className="font-mono text-[11px] text-slate-400">{selectedCompany.slug} · Dedicated Enterprise Workspace</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCompany(null)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-xs font-bold text-indigo-300 hover:bg-slate-800 hover:text-white"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{isAr ? 'العودة للبوابة' : 'Portal'}</span>
            </button>
          </header>

          <section className="relative z-10 mx-auto my-8 grid w-full max-w-xl flex-1 place-items-center">
            <div
              style={computedBackgroundStyle}
              className="w-full rounded-3xl border border-slate-800/80 bg-slate-900/80 p-7 shadow-2xl shadow-black/80 backdrop-blur-2xl sm:p-9"
            >
              <TenantLoginForm
                selectedCompany={selectedCompany}
                initialTenantSlug={selectedCompany.slug}
                onSuccess={onLoginSuccess}
                onForgotPassword={(slug) => {
                  setRecoveryPlane('tenant');
                  setRecoverySlug(slug || selectedCompany.slug);
                  setRecoveryModalOpen(true);
                }}
                onRegisterNew={() => {
                  setSelectedCompany(null);
                  setShowRegistration(true);
                }}
              />
              {directAccessControls('tenant')}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-5 border-t border-slate-800 pt-6 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-indigo-400" />Schema Isolation Active</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" />ZATCA Stage-2 Ready</span>
                <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-amber-400" />Dual-Plane Auth Barrier</span>
              </div>
            </div>
          </section>

          <footer className="relative z-10 py-4 text-center text-xs text-slate-500">
            {activeTenant?.name || (activeTenant as any)?.company_name || 'Enterprise Cloud Platform'} © 2026. All rights reserved.
          </footer>

          <PasswordRecoveryModal
            isOpen={recoveryModalOpen}
            onClose={() => setRecoveryModalOpen(false)}
            initialPlane={recoveryPlane}
            initialTenantSlug={recoverySlug}
            onSuccess={() => setRecoveryModalOpen(false)}
          />
        </main>
      </div>
    );
  }

  return (
    <main dir="ltr" className="flex min-h-dvh erp-viewport-root flex-col bg-slate-950 font-sans text-slate-100 selection:bg-indigo-500 selection:text-white">
      <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 px-4 py-3.5 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-indigo-800 p-1.5 shadow-lg shadow-indigo-600/30 ring-1 ring-white/20"><img src={logoUrl} alt="Platform Logo" className="h-6 w-6 object-contain" onError={(e) => { e.currentTarget.src = '/assets/default-crown.svg'; }} /></div><div><div className="flex items-center gap-2"><span className="text-lg font-black tracking-tight text-white">{(activeTenant as any)?.company_name || activeTenant?.name || 'Enterprise Portal'}</span><span className="rounded-md border border-indigo-500/30 bg-indigo-500/20 px-2 py-0.5 text-[10px] font-black text-indigo-300">CLOUD PORTAL</span></div><p className="text-xs text-slate-400">Multi-Tenant Operational Gateway</p></div></div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300 lg:inline-flex"><i className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /><b className="text-emerald-400">Cloud Nominal</b><span className="text-slate-600">|</span><span className="font-mono text-[11px] text-slate-400">KSA-Riyadh Node</span></span>
            <ThemeDensityToolbar />
            <button onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')} className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"><Globe2 className="h-3.5 w-3.5 text-indigo-400" />{language === 'ar' ? 'English' : 'Arabic'}</button>
            <div className="hidden items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 md:flex"><ShieldCheck className="h-4 w-4 text-indigo-400" /><p className="text-xs font-bold leading-none text-slate-200">Enterprise Isolation</p></div>
          </div>
        </div>
      </nav>

      <section
        style={computedBackgroundStyle}
        className="relative overflow-hidden border-b border-slate-800/80 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 px-3 sm:px-4 md:px-6 py-12"
      >
        <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl" /><div className="pointer-events-none absolute -bottom-24 left-1/4 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" /><div className="relative mx-auto max-w-7xl"><div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between"><div className="max-w-2xl space-y-4"><span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-bold text-indigo-300"><Sparkles className="h-3.5 w-3.5" />Advanced Multi-Tenant Organization Portal</span><h1 className="text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl"><span className="bg-gradient-to-r from-indigo-400 via-blue-400 to-indigo-200 bg-clip-text text-transparent">{(activeTenant as any)?.company_name || activeTenant?.name || 'Enterprise'}</span> Cloud Portal</h1><p className="text-sm leading-relaxed text-slate-300 sm:text-base">Select an enterprise organization workspace to launch its operational ERP, or register a new company tenant with instant schema isolation.</p></div><div className="flex flex-col gap-3 sm:flex-row"><button onClick={() => { setRegistrationComplete(false); setRegistrationError(null); setShowRegistration(true); }} style={{ backgroundColor: activeTenant?.primary_color || '#F59E0B', borderColor: activeTenant?.primary_color || '#F59E0B' }} className="inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-sm font-black text-white shadow-xl ring-1 ring-white/20 hover:brightness-110"><Plus className="h-5 w-5" />Register New Tenant</button></div></div><div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">{[{ label: 'Connected Tenants', value: `${licensedCompanies.length}`, note: 'All actively licensed', icon: Building2, tone: 'text-indigo-400' }, { label: 'Data Isolation', value: 'Schema RLS L3', note: '17 isolated database tables', icon: ShieldCheck, tone: 'text-blue-400' }, { label: 'ZATCA Compliance', value: 'Stage-2 Ready', note: 'Cryptographic e-invoicing', icon: CheckCircle2, tone: 'text-amber-400' }, { label: 'Cloud Latency', value: '12 ms', note: 'Optimized fast queries', icon: Cpu, tone: 'text-emerald-400' }].map((metric) => { const Icon = metric.icon; return <article key={metric.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm"><div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Icon className={`h-4 w-4 ${metric.tone}`} />{metric.label}</div><strong className="mt-2 block text-xl font-black text-white">{metric.value}</strong><p className={`mt-0.5 text-[11px] ${metric.tone}`}>{metric.note}</p></article>; })}</div></div></section>

      <section className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-3 sm:px-4 md:px-6 py-8">
        <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2.5 text-xl font-black text-white"><Layers className="h-5 w-5 text-indigo-400" />Available Organization Workspaces</h2>
            <p className="mt-0.5 text-xs text-slate-400">Click any organization to launch its dedicated operational workspace</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="relative min-w-52 flex-1 sm:flex-none"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isAr ? 'بحث بالاسم أو السجل التجاري...' : 'Search by name or CR...'} className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2 pl-4 pr-9 text-xs text-white outline-none placeholder:text-slate-500 focus:border-indigo-500" /></label>
            <div className="flex rounded-xl border border-slate-800 bg-slate-900/90 p-1">
              {(['All', 'Enterprise', 'Pro', 'Basic'] as const).map((tier) => (
                <button key={tier} onClick={() => setFilter(tier)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${filter === tier ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>{tier}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-white mb-1">
                {search ? 'No matching licensed organizations found' : 'No licensed organizations available'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                {search
                  ? 'Try adjusting your search criteria or tier filter.'
                  : 'Only enterprise organizations with an active license issued by the Super-Admin appear in the portal.'}
              </p>
              <button
                type="button"
                onClick={() => { setRegistrationComplete(false); setRegistrationError(null); setShowRegistration(true); }}
                style={{ backgroundColor: activeTenant?.primary_color || '#F59E0B' }}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition-all cursor-pointer hover:brightness-110"
              >
                <Plus className="h-4 w-4" />
                <span>Register New Tenant</span>
              </button>
            </div>
          ) : (
            filteredCompanies.map((company) => {
              const tier = tierFor(company);
              const primaryColor = company.uiPrimaryColor || '#1E3A8A';
              const secondaryColor = company.uiSecondaryColor || '#7C3AED';
              return (
                <article key={company.id} style={{ borderColor: primaryColor, boxShadow: `0 16px 38px ${primaryColor}33` }} className="group flex flex-col justify-between rounded-3xl border bg-gradient-to-b from-slate-900 to-slate-900/80 p-6 shadow-xl transition-all hover:brightness-110">
                  <div>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`, borderColor: secondaryColor }} className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border text-lg font-black text-white shadow-lg">
                          {company.uiLogoUrl ? <img src={company.uiLogoUrl} alt={`${company.name} logo`} className="h-full w-full object-contain bg-white p-1.5" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : company.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-mono text-xs font-bold text-slate-400">{company.slug}</p>
                          <h3 style={{ '--tenant-accent': secondaryColor } as React.CSSProperties} className="mt-0.5 text-base font-black text-white group-hover:text-[var(--tenant-accent)]">{company.name}</h3>
                        </div>
                      </div>
                      <span style={{ borderColor: secondaryColor, backgroundColor: `${secondaryColor}24`, color: secondaryColor }} className="rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide">{tier}</span>
                    </div>
                    <div className="mb-5 space-y-2 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Commercial Reg:</span>
                        <b className="font-mono text-slate-200">{company.commercialRegistration || 'Not configured'}</b>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Tax Number:</span>
                        <b className="font-mono text-slate-200">{company.taxId || 'Not configured'}</b>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Allowed Centers:</span>
                        <b style={{ color: secondaryColor }}>Up to {company.maxCostCenters ?? 25} Cost Centers</b>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Security Barrier:</span>
                        <b className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Strict Isolated</b>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <button onClick={() => launchWorkspace(company)} style={{ background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})`, boxShadow: `0 8px 20px ${primaryColor}66` }} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 p-3.5 text-xs font-black text-white transition-transform hover:scale-[1.01]">
                      Launch Workspace <ArrowRight className="h-4 w-4" />
                    </button>
                    <button onClick={() => launchWorkspace(company)} style={{ borderColor: `${primaryColor}88`, color: secondaryColor }} className="flex w-full items-center justify-center gap-2 rounded-xl border bg-slate-900/90 px-3 py-2 text-[11px] font-bold hover:bg-slate-800 hover:text-white">
                      <LogIn className="h-3.5 w-3.5" />Dedicated Tenant Login
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
      <footer className="w-full max-w-7xl mx-auto mt-16 pt-8 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-4 px-4 pb-8">
        <div>
          © 2026 {(activeTenant as any)?.company_name || activeTenant?.name || 'Enterprise Network'}. All structural boundaries isolated.
        </div>
        <div className="flex items-center gap-6">
          <a href="/login" className="hover:text-cyan-400 text-slate-400 transition-all font-semibold flex items-center gap-1">
            Enterprise Login Gate →
          </a>
          <span className="text-slate-800">|</span>
          <a href="/admin" className="hover:text-rose-400 transition-all text-slate-600">
            Control Plane Access [Admin]
          </a>
        </div>
      </footer>

      {showRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-md">
          <TenantRegistrationForm
            onCancel={() => setShowRegistration(false)}
            onSuccess={(slug) => {
              setShowRegistration(false);
              const found = companies.find((c) => c.slug === slug);
              if (found) {
                setSelectedCompany(found);
              }
            }}
          />
        </div>
      )}

      <PasswordRecoveryModal
        isOpen={recoveryModalOpen}
        onClose={() => setRecoveryModalOpen(false)}
        initialPlane={recoveryPlane}
        initialTenantSlug={recoverySlug}
        onSuccess={() => setRecoveryModalOpen(false)}
      />
    </main>
  );
};
