import React, { useState } from 'react';
import {
  KeyRound,
  Mail,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Globe2,
  Sparkles,
  AlertCircle,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ForgotPasswordProps {
  onSuccessRedirect?: (email: string, slug?: string) => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onSuccessRedirect }) => {
  const { language, setLanguage } = useApp();
  const isAr = language === 'ar';

  const [email, setEmail] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('slug');
      return param ? param.trim().toLowerCase() : '';
    }
    return '';
  });
  const [channel, setChannel] = useState<'auto' | 'email' | 'sms'>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError(isAr ? 'يرجى إدخال البريد الإلكتروني المسجل.' : 'Please enter your registered email address or mobile number.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: cleanEmail,
          workspace_slug: workspaceSlug.trim() || 'master',
          channel,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            (isAr
              ? 'تعذر العثور على الحساب أو فشل إرسال رمز التحقق.'
              : 'Failed to find account or dispatch verification code.')
        );
      }

      const redirectSlug = workspaceSlug.trim() || 'master';
      const targetUrl = `/reset-password?email=${encodeURIComponent(cleanEmail)}&slug=${encodeURIComponent(redirectSlug)}`;

      if (onSuccessRedirect) {
        onSuccessRedirect(cleanEmail, redirectSlug);
      } else {
        navigateTo(targetUrl);
      }
    } catch (err: any) {
      setError(err?.message || (isAr ? 'حدث خطأ أثناء معالجة الطلب.' : 'An error occurred while dispatching recovery request.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-dvh erp-viewport-root w-full bg-[#0a0d17] text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden selection:bg-indigo-500 selection:text-white"
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
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 mx-auto w-full max-w-5xl flex items-center justify-between py-3">
        <button
          type="button"
          onClick={() => navigateTo('/login')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          {isAr ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          <span>{isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign-In'}</span>
        </button>

        <button
          type="button"
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition shadow-sm"
        >
          <Globe2 className="h-3.5 w-3.5 text-indigo-400" />
          <span>{language === 'ar' ? 'English' : 'العربية'}</span>
        </button>
      </header>

      {/* Main Card */}
      <main className="relative z-10 mx-auto w-full max-w-md my-auto py-6">
        <div className="relative rounded-3xl border border-slate-800/90 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl overflow-hidden ring-1 ring-white/5">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-amber-500" />

          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <KeyRound className="h-6 w-6" />
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-3 py-1 text-[11px] font-black text-indigo-300">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>{isAr ? 'خدمة استعادة كلمة المرور' : 'Password Recovery Service'}</span>
            </div>
            <h1 className="mt-3 text-xl font-black text-white sm:text-2xl">
              {isAr ? 'نسيت كلمة المرور؟' : 'Forgot Your Password?'}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              {isAr
                ? 'أدخل بريدك الإلكتروني المسجل لإرسال رمز تحقق OTP مكون من 6 أرقام'
                : 'Enter your registered email or mobile number to receive a 6-digit Redis verification OTP'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-300">
                {isAr ? 'البريد الإلكتروني المسجل' : 'Registered Email Address'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="text" inputMode="email" autoComplete="username"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isAr ? 'admin@oxengl.com' : 'admin@oxengl.com'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                />
              </div>
            </div>

            {/* Workspace Slug */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-300">
                <span>{isAr ? 'معرف مساحة العمل (Workspace Slug)' : 'Tenant Workspace Slug'}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {isAr ? 'اختياري (افتراضي: master)' : 'Optional (default: master)'}
                </span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                  <Building2 className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={workspaceSlug}
                  onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase())}
                  placeholder={isAr ? 'معرف المنشأة' : 'master'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-2.5 font-mono text-xs text-indigo-300 placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 font-medium">{error}</div>
              </div>
            )}

            {/* Submit Button */}
            <div>
              <label htmlFor="otp-channel" className="mb-1 block text-xs font-semibold text-slate-300">
                {isAr ? 'طريقة استلام الرمز' : 'Send code via'}
              </label>
              <select
                id="otp-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as 'auto' | 'email' | 'sms')}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100"
              >
                <option value="auto">{isAr ? 'تلقائي (البريد + الرسائل إن توفر الجوال)' : 'Automatic (email, plus SMS if a phone is on file)'}</option>
                <option value="email">{isAr ? 'البريد الإلكتروني' : 'Email'}</option>
                <option value="sms">{isAr ? 'رسالة نصية SMS (للرقم المسجل)' : 'SMS (to the phone on file)'}</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-600/30 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <KeyRound className="h-4 w-4 text-white" />
              )}
              <span>
                {loading
                  ? (isAr ? 'جاري التحقق وإرسال الرمز...' : 'Dispatching 6-Digit OTP...')
                  : (isAr ? 'إرسال رمز التحقق (OTP)' : 'Send Verification OTP')}
              </span>
            </button>

            {/* Already have OTP */}
            <div className="pt-3 border-t border-slate-800/80 text-center">
              <button
                type="button"
                onClick={() => navigateTo(email.trim() ? `/reset-password?email=${encodeURIComponent(email.trim())}` : '/reset-password')}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition font-medium"
              >
                {isAr ? 'لديك رمز تحقق بالفعل؟ إدخال الرمز وإعادة التعيين' : 'Already have an OTP? Enter code and reset'}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer Note */}
      <footer className="relative z-10 text-center text-[11px] text-slate-600 py-3">
        OxenGL Cloud Monolith Engine &bull; Zero-Trust Tenant Isolation Architecture
      </footer>
    </div>
  );
};

export default ForgotPassword;
