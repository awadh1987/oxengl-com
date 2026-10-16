import React, { useState, useRef } from 'react';
import { Building2, KeyRound, Loader2, Lock, Mail, Phone, AlertCircle, ArrowRight, Sparkles, LogIn, CheckCircle2, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Company } from '../../types';
import { erpApi, setAuthSession } from '../../services/api';
import { redirectToTenantSubdomain, redirectToTenantWorkspace } from '../../utils/subdomain';


interface TenantLoginFormProps {
  initialTenantSlug?: string;
  selectedCompany?: Company | null;
  onSuccess?: () => void;
  onForgotPassword?: (slug?: string) => void;
  onRegisterNew?: () => void;
}

export const TenantLoginForm: React.FC<TenantLoginFormProps> = ({
  initialTenantSlug = '',
  selectedCompany,
  onSuccess,
  onForgotPassword,
  onRegisterNew,
}) => {
  const { language, loginTenant, companies, setCurrentUser } = useApp();
  const isAr = language === 'ar';

  const [viewMode, setViewMode] = useState<'login' | 'forgot'>('login');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [verifyingTwoFactor, setVerifyingTwoFactor] = useState(false);
  const isVerifyingRef = useRef(false);

  const [tenantSlug, setTenantSlug] = useState(() => {
    return initialTenantSlug || selectedCompany?.slug || (companies.length > 0 ? companies[0].slug : '');
  });
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  React.useEffect(() => {
    if (initialTenantSlug) {
      setTenantSlug(initialTenantSlug);
    } else if (selectedCompany?.slug) {
      setTenantSlug(selectedCompany.slug);
    } else if (!tenantSlug && companies.length > 0 && companies[0].slug) {
      setTenantSlug(companies[0].slug);
    }
  }, [initialTenantSlug, selectedCompany, companies]);

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation?.();
    }
    if (loading || isSubmittingRef.current) return;
    setError(null);

    const cleanIdentity = identity.trim();
    const inferredDomainSlug = cleanIdentity.includes('@')
      ? cleanIdentity.split('@')[1]?.split('.')[0]?.trim().toLowerCase()
      : '';
    const cleanSlug = tenantSlug.trim().toLowerCase() || inferredDomainSlug;

    if (!cleanSlug) {
      setError(isAr ? 'يرجى إدخال أو تحديد معرف المنشأة (Workspace Slug)' : 'Please enter or select a workspace slug');
      return;
    }
    if (!cleanIdentity) {
      setError(isAr ? 'يرجى إدخال البريد الإلكتروني أو رقم الجوال' : 'Please enter your email or mobile number');
      return;
    }
    if (!password) {
      setError(isAr ? 'يرجى إدخال كلمة المرور' : 'Please enter your password');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const res = await loginTenant({
        tenant_slug: cleanSlug,
        identity: cleanIdentity,
        password,
      });

        // Check if 2FA verification is required (case-insensitive and flexible)
        const status = res?.status?.toUpperCase?.();
        if (status?.includes('2FA') || (!res?.access_token && res?.two_factor_token)) {
        setTwoFactorToken(res?.two_factor_token || '');
        setRequiresTwoFactor(true);
        setError(null);
        return;
      }

      if (res?.access_token) {
        setAuthSession(res.access_token, 'tenant', res.tenant_slug || cleanSlug, res.tenant_id);
        localStorage.setItem('role', res.role || res.user?.role || 'admin');
        onSuccess?.();

        const effectiveSlug = res.tenant_slug || cleanSlug;
        const customDomain = (res as any)?.custom_domain || (res as any)?.domain || selectedCompany?.custom_domain;

        // Strictly enforce absolute URL redirect upon login success
        redirectToTenantWorkspace({
          slug: effectiveSlug,
          custom_domain: customDomain,
        }, '/operations/daily');
        return;
      } else {

        const failureMessage = res?.message || (isAr ? 'بيانات الاعتماد غير صالحة لمساحة العمل هذه.' : 'Invalid credentials for this workspace.');
        setError(failureMessage);
      }
    } catch (err: any) {
      const msg = err?.message || (isAr ? 'بيانات الاعتماد غير صالحة لمساحة العمل هذه.' : 'Invalid credentials for this workspace.');
      setError(msg);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleVerifyTwoFactor = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation?.();
    }
    if (verifyingTwoFactor || isVerifyingRef.current) return;
    setError(null);

    const cleanCode = twoFactorCode.trim().replace(/\s+/g, '');
    if (!cleanCode || cleanCode.length < 6) {
      setError(
        isAr
          ? 'يرجى إدخال رمز التحقق المكون من 6 أرقام'
          : 'Please enter the complete 6-digit verification code'
      );
      return;
    }

    const cleanIdentity = identity.trim();
    const inferredDomainSlug = cleanIdentity.includes('@')
      ? cleanIdentity.split('@')[1]?.split('.')[0]?.trim().toLowerCase()
      : '';
    const cleanSlug = tenantSlug.trim().toLowerCase() || inferredDomainSlug;

    isVerifyingRef.current = true;
    setVerifyingTwoFactor(true);
    try {
      let data: any;
      if (typeof erpApi?.verifyTwoFactor === 'function') {
        data = await erpApi.verifyTwoFactor({
          two_factor_token: twoFactorToken,
          code: cleanCode,
          tenant: cleanSlug,
          tenant_slug: cleanSlug,
          workspace_slug: cleanSlug,
          email: cleanIdentity,
        });
      } else {
        const response = await fetch('/auth/2fa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            two_factor_token: twoFactorToken,
            code: cleanCode,
            tenant: cleanSlug,
            workspace_slug: cleanSlug,
            email: cleanIdentity,
          }),
        });
        data = await response.json();
      }

      if (!data || (data.status !== 'SUCCESS' && !data.access_token)) {
        throw new Error(
          data?.detail ||
            data?.message ||
            (isAr
              ? 'رمز التحقق غير صحيح أو منتهي الصلاحية'
              : 'Invalid or expired verification code')
        );
      }

      if (data.access_token) {
        setAuthSession(data.access_token, 'tenant', data.tenant_slug || cleanSlug, data.tenant_id);
        localStorage.setItem('role', data.role || data.user?.role || 'admin');

        if (data.user) {
          const verifiedUser = {
            id: data.user.id,
            username: data.user.email ? data.user.email.split('@')[0] : 'user',
            fullName: data.user.fullName || `${cleanSlug.toUpperCase()} Admin`,
            fullNameAr: data.user.fullNameAr || `مسؤول ${cleanSlug}`,
            email: data.user.email || cleanIdentity,
            role: (data.role || data.user.role || 'Admin') as any,
            status: 'Active',
            companyId: data.tenant_id,
          };
          localStorage.setItem('oxengl_user', JSON.stringify(verifiedUser));
          setCurrentUser(verifiedUser as any);
        }

        onSuccess?.();

        const effectiveSlug = data.tenant_slug || cleanSlug;
        const customDomain = data.custom_domain || data.domain || selectedCompany?.custom_domain;

        // Strictly enforce absolute URL redirect upon 2FA success
        redirectToTenantWorkspace({
          slug: effectiveSlug,
          custom_domain: customDomain,
        }, '/operations/daily');
        return;
      } else {

        throw new Error(
          isAr
            ? 'فشل استلام رمز الدخول من الخادم'
            : 'Access token was not granted by the authentication authority.'
        );
      }
    } catch (err: any) {
      setError(
        err?.message ||
          (isAr ? 'فشل التحقق من رمز 2FA' : 'Failed to verify two-factor authentication code')
      );
    } finally {
      isVerifyingRef.current = false;
      setVerifyingTwoFactor(false);
    }
  };

  const handleBackToCredentials = () => {
    setRequiresTwoFactor(false);
    setTwoFactorCode('');
    setError(null);
  };

  const handleForgotPassword = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation?.();
    }
    if (recoveryLoading) return;
    setError(null);
    setRecoverySuccess(null);

    const cleanSlug = tenantSlug.trim().toLowerCase();
    const cleanEmail = (recoveryEmail || identity).trim().toLowerCase();

    if (!cleanSlug) {
      setError(isAr ? 'يرجى إدخال أو تحديد رمز المنشأة' : 'Please enter or select a workspace slug');
      return;
    }
    if (!cleanEmail) {
      setError(isAr ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email address');
      return;
    }

    setRecoveryLoading(true);
    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, workspace_slug: cleanSlug }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || (isAr ? 'فشل إرسال رابط استعادة كلمة المرور' : 'Failed to send recovery link'));
      }
      setRecoverySuccess(
        data?.message || (isAr ? 'تم إرسال رابط استعادة كلمة المرور بنجاح. يرجى التحقق من بريدك الإلكتروني أو سجلات النظام.' : 'Password recovery link has been dispatched successfully.')
      );
    } catch (err: any) {
      setError(err?.message || (isAr ? 'حدث خطأ أثناء معالجة الطلب' : 'An error occurred while dispatching recovery request.'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const isPhone = /^\+?[0-9\s-]{7,15}$/.test(identity.trim());

  if (requiresTwoFactor) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="w-full">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-[11px] font-black text-emerald-300">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>{isAr ? 'التحقق بخطوتين (2FA)' : 'Two-Factor Authentication'}</span>
          </div>
          <h2 className="mt-3 text-xl font-black text-white sm:text-2xl">
            {isAr ? 'التحقق بخطوتين (2FA)' : 'Two-factor authentication required'}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            <span className="sr-only">Two-factor authentication required</span>
            {isAr
              ? 'مطلوب رمز التحقق الثنائي (2FA). أدخل رمز التحقق المكون من 6 أرقام من تطبيق المصادقة الخاص بك'
              : 'Two-factor authentication required. Enter the 6-digit verification code from your authenticator application'}
          </p>
        </div>

        {/* Workspace & Identity Context Pill */}
        <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-400" />
            <span className="font-mono font-bold text-indigo-200">{tenantSlug}</span>
          </div>
          <span className="font-mono text-slate-400 text-[11px]">{identity}</span>
        </div>

        <form noValidate onSubmit={handleVerifyTwoFactor} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-300">
              {isAr ? 'رمز التحقق (TOTP Code)' : 'Verification Code (TOTP)'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                <KeyRound className="h-4 w-4" />
              </div>
              <input
                id="otp-code-input"
                aria-label="Two-factor verification code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={isAr ? 'أدخل رمز التحقق المكون من 6 أرقام (Enter 6-digit code)' : 'Enter 6-digit code'}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-3 font-mono text-center text-lg tracking-[0.4em] text-emerald-300 placeholder-slate-600 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">
              {isAr
                ? 'يتم تحديث الرمز كل 30 ثانية في تطبيق Google Authenticator أو ما شابه'
                : 'The 6-digit rolling code updates every 30 seconds in your authenticator app'}
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          <button
            type="submit"
            aria-label="Verify & Sign In"
            disabled={verifyingTwoFactor || twoFactorCode.length < 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-600/30 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {verifyingTwoFactor ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-white" />
            )}
            <span>
              {verifyingTwoFactor
                ? (isAr ? 'جاري التحقق من الرمز...' : 'Verifying Security Code...')
                : (isAr ? 'تأكيد الرمز وإكمال الدخول' : 'Verify & Sign In')}
            </span>
          </button>

          <div className="flex items-center justify-center pt-3 border-t border-slate-800/80 text-xs text-slate-400">
            <button
              type="button"
              onClick={handleBackToCredentials}
              className="text-indigo-300 hover:text-white transition font-medium flex items-center gap-1.5"
            >
              {isAr ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
              <span>{isAr ? 'العودة إلى إدخال كلمة المرور' : 'Back to Credentials'}</span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="w-full">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/30">
          {viewMode === 'forgot' ? <KeyRound className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-3 py-1 text-[11px] font-black text-indigo-300">
          {viewMode === 'forgot' ? (
            <>
              <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
              <span>{isAr ? 'استعادة كلمة المرور' : 'Password Recovery'}</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>{isAr ? 'تسجيل دخول مساحة عمل المنشأة' : 'Tenant Workspace Sign-In'}</span>
            </>
          )}
        </div>
        <h2 className="mt-3 text-xl font-black text-white sm:text-2xl">
          {viewMode === 'forgot'
            ? (isAr ? 'طلب رابط إعادة التعيين' : 'Reset Account Password')
            : (selectedCompany?.name || (isAr ? 'دخول منظومة الأعمال' : 'Access Dedicated ERP'))}
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {viewMode === 'forgot'
            ? (isAr ? 'أدخل رمز المنشأة وبريدك الإلكتروني لاستلام رابط آمن لإعادة التعيين' : 'Enter your workspace slug and email to receive a secure recovery link')
            : (isAr ? 'سجل الدخول باستخدام بريدك المعتمد أو رقم الجوال السعودي' : 'Sign in using your authorized company email or Saudi mobile')}
        </p>
      </div>

      <form
        noValidate
        onSubmit={viewMode === 'forgot' ? handleForgotPassword : handleSubmit}
        className="space-y-4"
      >
        {/* Workspace Slug Selector / Input */}
        <div>
          <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-300">
            <span>{isAr ? 'رمز المنشأة (Workspace Slug)' : 'Tenant Workspace Slug'}</span>
            <span className="text-[10px] text-indigo-300 font-mono">e.g. meayon-logistics</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
              <Building2 className="h-4 w-4" />
            </div>
            <input
              type="text"
              required
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder={isAr ? 'meayon-logistics' : 'meayon-logistics'}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-2.5 font-mono text-xs text-indigo-200 placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>

          {/* Quick Slug Switcher if multiple companies */}
          {companies.length > 0 && !selectedCompany && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-500">{isAr ? 'منشآت سريعة:' : 'Quick select:'}</span>
              {companies.slice(0, 3).map((comp) => (
                <button
                  type="button"
                  key={comp.id}
                  onClick={() => setTenantSlug(comp.slug)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-mono font-semibold transition ${
                    tenantSlug === comp.slug
                      ? 'border border-indigo-400 bg-indigo-600/30 text-indigo-200'
                      : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {comp.slug}
                </button>
              ))}
            </div>
          )}
        </div>

        {viewMode === 'forgot' ? (
          /* Forgot Password Mode: Single Email Box Field */
          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>{isAr ? 'البريد الإلكتروني المسجل' : 'Registered Account Email'}</span>
              <span className="text-[10px] text-indigo-300 font-mono">user@company.com</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                required
                autoFocus
                value={recoveryEmail || identity}
                onChange={(e) => {
                  setRecoveryEmail(e.target.value);
                  setIdentity(e.target.value);
                }}
                placeholder={isAr ? 'admin@company.com' : 'admin@company.com'}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
          </div>
        ) : (
          /* Login Mode: Identity + Password */
          <>
            {/* Identity Input (Email or Mobile) */}
            <div>
              <label htmlFor="tenant-identity-input" className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-300">
                <span>{isAr ? 'البريد الإلكتروني أو اسم المستخدم' : 'Email or Username'}</span>
                <span className="text-[10px] text-indigo-300 font-mono">05XXXXXXXX / +966</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                  {isPhone ? <Phone className="h-4 w-4 text-emerald-400" /> : <Mail className="h-4 w-4" />}
                </div>
                <input
                  id="tenant-identity-input"
                  aria-label="Email or Username"
                  type="text"
                  required
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder={isAr ? 'admin@company.com أو 0551234567' : 'admin@company.com or 0551234567'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="tenant-password-input" className="text-xs font-bold text-slate-300">
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('forgot');
                    setError(null);
                    setRecoverySuccess(null);
                    if (identity && !recoveryEmail) setRecoveryEmail(identity);
                    onForgotPassword?.(tenantSlug);
                  }}
                  className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 transition"
                >
                  {isAr ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="tenant-password-input"
                  aria-label="Password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isAr ? '••••••••••••' : '••••••••••••'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                />
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {recoverySuccess && (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <div className="flex-1 font-medium">{recoverySuccess}</div>
          </div>
        )}

        {viewMode === 'forgot' ? (
          <button
            type="submit"
            onClick={handleForgotPassword}
            disabled={recoveryLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-600/30 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {recoveryLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <KeyRound className="h-4 w-4 text-white" />
            )}
            <span>
              {recoveryLoading
                ? (isAr ? 'جاري إرسال رابط الاستعادة...' : 'Sending Recovery Link...')
                : (isAr ? 'إرسال رابط استعادة كلمة المرور' : 'Send Recovery Link')}
            </span>
          </button>
        ) : (
          <button
            type="submit"
            aria-label={loading ? (isAr ? 'جاري التحقق...' : 'Authenticating...') : (isAr ? 'تسجيل الدخول إلى المنظومة (Sign In)' : 'Sign In to Workspace')}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-600/30 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <LogIn className="h-4 w-4 text-white" />
            )}
            <span>
              {loading
                ? (isAr ? 'جاري التحقق...' : 'Authenticating...')
                : (isAr ? 'تسجيل الدخول إلى المنظومة' : 'Sign In to Workspace')}
            </span>
          </button>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
          {viewMode === 'forgot' ? (
            <button
              type="button"
              onClick={() => {
                setViewMode('login');
                setError(null);
                setRecoverySuccess(null);
              }}
              className="text-indigo-300 hover:text-white transition font-medium flex items-center gap-1.5"
            >
              {isAr ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
              <span>{isAr ? 'العودة إلى تسجيل الدخول' : 'Back to Login'}</span>
            </button>
          ) : (
            onRegisterNew && (
              <button
                type="button"
                onClick={onRegisterNew}
                className="text-indigo-300 hover:text-white transition font-medium"
              >
                {isAr ? 'تسجيل منشأة جديدة (حساب جديد)' : 'Register New Enterprise'}
              </button>
            )
          )}
        </div>
      </form>
    </div>
  );
};

export default TenantLoginForm;
