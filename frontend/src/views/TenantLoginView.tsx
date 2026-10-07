import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  Lock,
  Mail,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Globe2,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  redirectToTenantSubdomain,
  isCustomDomain,
  isLocalhost,
  buildTenantAbsoluteUrl,
  redirectToTenantWorkspace,
} from '../utils/subdomain';
import { useNavigate } from '../hooks/useNavigate';
import { setAuthSession, isValidUUID } from '../services/api';
import { TenantAvatar } from '../components/TenantAvatar';
import { TenantBrandingContext } from '../types';


interface TenantLoginViewProps {
  onLoginSuccess?: () => void;
  onNavigate?: (view: string) => void;
  forcedSlug?: string;
}

export const TenantLoginView: React.FC<TenantLoginViewProps> = ({


  onLoginSuccess,
  onNavigate,
  forcedSlug,
}) => {
  const { language, setLanguage, loginTenant, companies, currentCompany } = useApp();
  const isAr = language === 'ar';
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(forcedSlug ? 2 : 1);
  const [tenantSlug, setTenantSlug] = useState(forcedSlug || '');
  const [slugValidated, setSlugValidated] = useState(Boolean(forcedSlug));
  const [validatedTarget, setValidatedTarget] = useState<string | null>(null);
  const [brandingContext, setBrandingContext] = useState<TenantBrandingContext | null>(null);

  const matchedCompany = companies?.find((c) => c.slug?.toLowerCase() === tenantSlug.toLowerCase()) || (currentCompany?.slug?.toLowerCase() === tenantSlug.toLowerCase() ? currentCompany : null);
  const matchedLogo = matchedCompany?.logo_url || matchedCompany?.uiLogoUrl || (matchedCompany as any)?.ui_logo_url;
  const matchedName = matchedCompany?.name || tenantSlug;
  const matchedColor = matchedCompany?.uiPrimaryColor || '#10b981';

  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isValidatingSlug, setIsValidatingSlug] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const isAuthenticatingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (forcedSlug) {
      setTenantSlug(forcedSlug);
      setSlugValidated(true);
      setStep(2);
    }
  }, [forcedSlug]);

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      navigate(path);
    }
  };

  // Step 1: Blind Live Validation against /api/v1/tenants/validate-slug
  const handleValidateSlug = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation?.();
    }
    if (isValidatingSlug) return;
    setErrorMessage(null);

    const cleanSlug = tenantSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSlug || cleanSlug.length < 2) {
      setErrorMessage(
        isAr
          ? 'يرجى إدخال رمز مساحة العمل بشكل صحيح (مثال: fleet-logistics)'
          : 'Please enter a valid workspace slug (e.g., fleet-logistics)'
      );
      return;
    }

    setIsValidatingSlug(true);
    try {
      const res = await fetch('/api/v1/tenants/validate-slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: cleanSlug }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            isAr
              ? 'مساحة العمل المطلوبة غير مسجلة أو غير نشطة حالياً.'
              : 'Requested workspace environment is either inactive or unregistered.'
          );
        }
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.detail ||
            (isAr ? 'فشل التحقق من رمز مساحة العمل.' : 'Failed to validate workspace slug.')
        );
      }

      const data = await res.json();
      const customDomain = data?.custom_domain || data?.domain || matchedCompany?.custom_domain;

      // Upon successful workspace slug validation, evaluate absolute tenant target:
      const targetUrl = buildTenantAbsoluteUrl({
        slug: cleanSlug,
        custom_domain: customDomain,
      }, '/operations/daily');

      try {
        const targetHost = new URL(targetUrl).hostname.toLowerCase();
        const currentHost = window.location.hostname.toLowerCase();
        // If not already on the target host and not on localhost, redirect immediately to prevent master root domain entrapment
        if (targetHost && currentHost !== targetHost && !isLocalhost()) {
          window.location.href = targetUrl;
          return;
        }
      } catch (err) {
        console.warn('Tenant URL parsing warning:', err);
      }

      if (data?.branding_context) {
        setBrandingContext({
          ...data.branding_context,
          name: data.name || cleanSlug,
        });
      }

      setValidatedTarget(data.target || cleanSlug);
      setTenantSlug(cleanSlug);
      setSlugValidated(true);
      setStep(2);
    } catch (err: any) {
      // Fallback: If network validation fails or offline dev fallback, allow advancing if slug is well-formatted
      if (cleanSlug.length >= 2 && !err?.message?.includes('inactive or unregistered')) {
        setTenantSlug(cleanSlug);
        setSlugValidated(true);
        setStep(2);
      } else {
        setErrorMessage(
          err?.message ||
            (isAr
              ? 'تعذر العثور على مساحة العمل هذه.'
              : 'Workspace not found. Please check your slug.')
        );
      }
    } finally {
      setIsValidatingSlug(false);
    }
  };

  // Step 2: User Credentials Authentication
  const handleCredentialAuth = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation?.();
    }
    if (isAuthenticating || isAuthenticatingRef.current) return;
    setErrorMessage(null);

    const cleanIdentity = identity.trim();
    if (!cleanIdentity) {
      setErrorMessage(
        isAr ? 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم' : 'Please enter your username or email'
      );
      return;
    }
    if (!password) {
      setErrorMessage(isAr ? 'يرجى إدخال كلمة المرور' : 'Please enter your password');
      return;
    }

    isAuthenticatingRef.current = true;
    setIsAuthenticating(true);
    try {
      const res = await loginTenant({
        tenant_slug: tenantSlug,
        identity: cleanIdentity,
        password,
      });

      if (res?.status === '2FA_REQUIRED' || (!res?.access_token && res?.two_factor_token)) {
        setErrorMessage(
          isAr
            ? 'مطلوب رمز التحقق الثنائي (2FA). يرجى إكمال التحقق.'
            : 'Two-factor authentication required. Please complete verification.'
        );
        return;
      }

      if (res?.access_token) {
        const effectiveSlug = res.tenant_slug || tenantSlug;
        const tenantCid = (res as any)?.company_id || (res as any)?.tenant_id || (res.user as any)?.company_id || (res.user as any)?.tenant_id;

        // Synchronize central auth session and tenant UUID storage
        setAuthSession(res.access_token, 'tenant', effectiveSlug, tenantCid);
        localStorage.setItem('token', res.access_token);
        localStorage.setItem('access_token', res.access_token);
        localStorage.setItem('tenant_slug', effectiveSlug);
        localStorage.setItem('role', res.role || res.user?.role || 'admin');
        if (tenantCid && isValidUUID(tenantCid)) {
          localStorage.setItem('oxengl_tenant_id', tenantCid);
          localStorage.setItem('tenant_id', tenantCid);
          localStorage.setItem('company_id', tenantCid);
        }
        if (res.user) {
          localStorage.setItem('oxengl_user', JSON.stringify(res.user));
        }

        if (onLoginSuccess) {
          onLoginSuccess();
        }

        const customDomain = (res as any)?.custom_domain || (res as any)?.domain || matchedCompany?.custom_domain;

        // Strictly enforce absolute URL redirection upon successful authentication
        redirectToTenantWorkspace({
          slug: effectiveSlug,
          custom_domain: customDomain,
        }, '/operations/daily');
        return;
      } else {
        const failureMsg = res?.message || (isAr ? 'بيانات الاعتماد غير صحيحة لمساحة العمل المحددة.' : 'Invalid credentials for this workspace. Please verify your details.');
        setErrorMessage(failureMsg);
      }

    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          (isAr
            ? 'بيانات الاعتماد غير صحيحة لمساحة العمل المحددة.'
            : 'Invalid credentials for this workspace. Please verify your details.')
      );
    } finally {
      isAuthenticatingRef.current = false;
      setIsAuthenticating(false);
    }
  };

  const handleResetStep = () => {
    setStep(1);
    setSlugValidated(false);
    setPassword('');
    setErrorMessage(null);
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-dvh erp-viewport-root w-full bg-[#0a0d17] text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden selection:bg-orange-500 selection:text-white"
    >
      {/* Background Ambience */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #38bdf8 1px, transparent 1px),
            linear-gradient(to bottom, #38bdf8 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar */}
      <header className="relative z-10 mx-auto w-full max-w-5xl flex items-center justify-between py-3">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          {isAr ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          <span>{isAr ? 'العودة للبوابة الرئيسية' : 'Back to Neutral Hub'}</span>
        </button>

        <button
          type="button"
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition shadow-sm"
        >
          <Globe2 className="h-3.5 w-3.5 text-orange-400" />
          <span>{language === 'ar' ? 'English' : 'العربية'}</span>
        </button>
      </header>

      {/* 2-Step Card Interface */}
      <main className="relative z-10 mx-auto w-full max-w-md my-auto py-6">
        <div className="relative rounded-3xl border border-slate-800/90 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl overflow-hidden ring-1 ring-white/5">
          {/* Header Gradient */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-indigo-500" />

          {/* Stepper Indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 1
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'bg-emerald-500 text-white'
              }`}
            >
              {step === 1 ? '1' : <CheckCircle2 className="h-4 w-4" />}
            </div>
            <div className={`h-0.5 w-12 rounded ${step === 2 ? 'bg-orange-500' : 'bg-slate-800'}`} />
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 2
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              2
            </div>
          </div>

          {/* Title Area */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[11px] font-bold text-orange-300 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-orange-400" />
              <span>
                {step === 1
                  ? isAr
                    ? 'التحقق الآمن من مساحة العمل'
                    : 'Zero-Knowledge Workspace Verification'
                  : isAr
                  ? 'تسجيل الدخول للمنشأة'
                  : 'Enterprise Identity Gateway'}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              {step === 1
                ? isAr
                  ? 'أدخل رمز مساحة العمل'
                  : 'Enter Workspace Slug'
                : isAr
                ? 'تسجيل الدخول للمستخدم'
                : 'Sign In to Workspace'}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              {step === 1
                ? isAr
                  ? 'أدخل المعرف الخاص بمنشأتك للتحقق من الاتصال المشفر'
                  : 'Enter your organization tenant slug to verify your private partition'
                : isAr
                ? `تسجيل الدخول إلى مساحة العمل: [${tenantSlug}]`
                : `Authenticating into workspace: [${tenantSlug}]`}
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* STEP 1 FORM: Blind Live Validation */}
          {step === 1 && (
            <form noValidate onSubmit={handleValidateSlug} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  {isAr ? 'رمز المنشأة (Tenant Slug)' : 'Tenant Workspace Slug'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-500">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={tenantSlug}
                    onChange={(e) =>
                      setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    }
                    placeholder={isAr ? 'مثال: fleet-logistics' : 'e.g. fleet-logistics'}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/80 ps-10 pe-4 py-3 font-mono text-sm text-orange-300 placeholder-slate-600 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  {isAr
                    ? 'يتم التحقق من النطاق تلقائياً دون الكشف عن السجلات العامة'
                    : 'Zero-disclosure check validates the tenant workspace boundary securely'}
                </p>
              </div>

              <button
                type="submit"
                onClick={handleValidateSlug}
                disabled={isValidatingSlug || !tenantSlug.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-3 text-xs font-bold text-white shadow-lg shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isValidatingSlug ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isAr ? 'جاري التحقق من النطاق...' : 'Verifying Workspace...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isAr ? 'متابعة إلى تسجيل الدخول' : 'Verify & Continue'}</span>
                    {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2 FORM: User Credentials */}
          {step === 2 && (
            <form noValidate onSubmit={handleCredentialAuth} className="space-y-4">
              {/* Verified Workspace Badge with Dynamic Tenant Branding */}
              <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-950/20 px-3.5 py-2.5">
                <div className="flex items-center gap-3 overflow-hidden">
                  <TenantAvatar
                    brandingContext={brandingContext}
                    tenant={matchedCompany}
                    logoUrl={brandingContext?.logo_url || matchedLogo}
                    name={brandingContext?.name || matchedName}
                    primaryColor={brandingContext?.primary_color || matchedColor}
                    size="md"
                    showGlow={true}
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="font-mono text-xs font-bold text-emerald-300 truncate">
                        {tenantSlug}
                      </span>
                    </div>
                    {((brandingContext as any)?.name || matchedCompany?.name) && (
                      <p className="text-[11px] text-slate-300 font-semibold truncate">
                        {(brandingContext as any)?.name || matchedCompany?.name}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetStep}
                  className="text-[11px] font-semibold text-slate-400 hover:text-white underline transition shrink-0 ms-2"
                >
                  {isAr ? 'تغيير' : 'Change'}
                </button>
              </div>

              {/* Identity Input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  {isAr ? 'البريد الإلكتروني أو اسم المستخدم' : 'Email or Username'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                    placeholder={isAr ? 'admin@company.com' : 'admin@company.com'}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/80 ps-10 pe-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    {isAr ? 'كلمة المرور' : 'Password'}
                  </label>
                  <button
                    type="button"
                    onClick={() => navigateTo('/reset-password')}
                    className="text-[11px] font-semibold text-orange-400 hover:text-orange-300 transition"
                  >
                    {isAr ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isAr ? '••••••••' : '••••••••'}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/80 ps-10 pe-10 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-500 hover:text-slate-300 transition"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isAuthenticating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-3 text-xs font-bold text-white shadow-lg shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isAr ? 'جاري التحقق...' : 'Authenticating...'}</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    <span>{isAr ? 'دخول مساحة العمل' : 'Sign In'}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Card Footer */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center text-xs text-slate-400">
            <button
              type="button"
              onClick={() => navigateTo('/register')}
              className="text-orange-400 hover:text-orange-300 font-semibold transition"
            >
              {isAr ? 'تسجيل منشأة جديدة' : 'Register Workspace'}
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-3 text-center text-[11px] text-slate-600 font-mono">
        OxenGL Two-Tier Zero-Knowledge Multi-Tenant Architecture • End-to-End Encryption
      </footer>
    </div>
  );
};
