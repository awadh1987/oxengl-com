import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Eye,
  EyeOff,
  Globe2,
  Sparkles,
  LogIn,
  RotateCw,
  Hash,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ResetPasswordProps {
  onSuccessRedirect?: () => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({ onSuccessRedirect }) => {
  const { language, setLanguage } = useApp();
  const isAr = language === 'ar';

  // Read URL query params
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialEmail = searchParams?.get('email') || '';
  const initialOtp = searchParams?.get('otp') || searchParams?.get('otp_code') || searchParams?.get('code') || '';
  const initialToken = searchParams?.get('token') || '';
  const initialSlug = searchParams?.get('slug') || searchParams?.get('workspace_slug') || 'master';

  const [email, setEmail] = useState(initialEmail);
  const [workspaceSlug, setWorkspaceSlug] = useState(initialSlug);

  // 6-digit OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(() => {
    if (initialOtp && initialOtp.length === 6 && /^\d{6}$/.test(initialOtp)) {
      return initialOtp.split('');
    }
    return ['', '', '', '', '', ''];
  });

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Legacy cryptographic token fallback
  const [legacyToken, setLegacyToken] = useState(initialToken);
  const [showLegacyTokenMode, setShowLegacyTokenMode] = useState(Boolean(initialToken && !initialOtp));

  // State
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [countdown, setCountdown] = useState(3);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // Cooldown countdown effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Success redirect countdown effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (success && countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    } else if (success && countdown === 0) {
      if (onSuccessRedirect) {
        onSuccessRedirect();
      } else {
        navigateTo('/login');
      }
    }
    return () => clearTimeout(timer);
  }, [success, countdown, onSuccessRedirect]);

  // OTP Box Change Handler
  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const updated = [...otpDigits];
      updated[index] = '';
      setOtpDigits(updated);
      return;
    }

    if (clean.length > 1) {
      // Pasted multiple digits
      handlePastedCode(clean);
      return;
    }

    const updated = [...otpDigits];
    updated[index] = clean;
    setOtpDigits(updated);

    // Auto advance to next input
    if (index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // Handle keyboard backspace and arrows
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        // Move back and clear previous
        const updated = [...otpDigits];
        updated[index - 1] = '';
        setOtpDigits(updated);
        otpInputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (isAr) {
        if (index < 5) otpInputsRef.current[index + 1]?.focus();
      } else {
        if (index > 0) otpInputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (isAr) {
        if (index > 0) otpInputsRef.current[index - 1]?.focus();
      } else {
        if (index < 5) otpInputsRef.current[index + 1]?.focus();
      }
    }
  };

  // Handle Paste
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    handlePastedCode(pasteData);
  };

  const handlePastedCode = (code: string) => {
    const digitsOnly = code.replace(/\D/g, '').slice(0, 6);
    if (!digitsOnly) return;
    const updated = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      updated[i] = digitsOnly[i] || '';
    }
    setOtpDigits(updated);
    const targetIdx = Math.min(digitsOnly.length, 5);
    otpInputsRef.current[targetIdx]?.focus();
  };

  // Resend OTP Code
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError(isAr ? 'يرجى إدخال البريد الإلكتروني لإعادة إرسال رمز التحقق.' : 'Please enter your email to resend OTP.');
      return;
    }

    setResending(true);
    setError(null);
    setResendMessage(null);

    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          workspace_slug: workspaceSlug.trim() || 'master',
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            (isAr ? 'تعذر إعادة إرسال رمز التحقق. يرجى المحاولة لاحقاً.' : 'Failed to resend verification OTP.')
        );
      }

      setResendCooldown(60);
      setResendMessage(
        isAr
          ? 'تم إرسال رمز تحقق جديد بنجاح إلى بريدك الإلكتروني.'
          : 'A new 6-digit OTP code has been dispatched to your email.'
      );
    } catch (err: any) {
      setError(err?.message || (isAr ? 'حدث خطأ أثناء إعادة الإرسال.' : 'Failed to resend verification code.'));
    } finally {
      setResending(false);
    }
  };

  // Submit Password Reset
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otpDigits.join('').trim();
    const cleanToken = legacyToken.trim();

    if (!showLegacyTokenMode) {
      if (!cleanEmail) {
        setError(isAr ? 'يرجى إدخال البريد الإلكتروني.' : 'Email is required.');
        return;
      }
      if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
        setError(
          isAr
            ? 'يرجى إدخال رمز التحقق المكون من 6 أرقام بالكامل.'
            : 'Please enter the complete 6-digit verification code.'
        );
        return;
      }
    } else {
      if (!cleanToken) {
        setError(isAr ? 'رمز الأمان (Token) مفقود.' : 'Cryptographic reset token is required.');
        return;
      }
    }

    if (newPassword.length < 8) {
      setError(isAr ? 'يجب ألا تقل كلمة المرور عن 8 خانات.' : 'Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(isAr ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        new_password: newPassword,
      };

      if (showLegacyTokenMode) {
        payload.token = cleanToken;
      } else {
        payload.email = cleanEmail;
        payload.otp_code = cleanOtp;
        if (workspaceSlug) {
          payload.workspace_slug = workspaceSlug;
        }
      }

      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            (isAr
              ? 'تعذر إعادة تعيين كلمة المرور. الرمز غير صحيح أو منتهي الصلاحية.'
              : 'Failed to reset password. The verification code or token is invalid or expired.')
        );
      }

      setSuccess(true);
      setSuccessMessage(
        data?.message ||
          (isAr
            ? 'تم إعادة تعيين كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول ببياناتك الجديدة.'
            : 'Password reset completed successfully. You may now sign in with your new credentials.')
      );
    } catch (err: any) {
      setError(err?.message || (isAr ? 'حدث خطأ أثناء معالجة الطلب.' : 'An error occurred during password reset.'));
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
              <span>{isAr ? 'التحقق برمز OTP وإعادة التعيين' : 'Redis OTP Password Recovery'}</span>
            </div>
            <h1 className="mt-3 text-xl font-black text-white sm:text-2xl">
              {isAr ? 'تعيين كلمة مرور جديدة' : 'Reset Account Password'}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              {isAr
                ? 'أدخل رمز التحقق المكون من 6 أرقام المستلم مع كلمة المرور الجديدة'
                : 'Enter your 6-digit OTP verification code along with your new password'}
            </p>
          </div>

          {/* SUCCESS BANNER */}
          {success ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-5 text-center shadow-lg shadow-emerald-900/20">
                <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-emerald-200">
                  {isAr ? 'اكتملت العملية بنجاح' : 'Reset Successful!'}
                </h3>
                <p className="mt-1.5 text-xs text-emerald-300/80 leading-relaxed">
                  {successMessage}
                </p>
                <div className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-400 font-mono">
                  <span>{isAr ? 'جاري التحويل تلقائياً خلال' : 'Redirecting to sign-in in'}</span>
                  <span className="font-bold text-emerald-400">{countdown}</span>
                  <span>{isAr ? 'ثوان...' : 'seconds...'}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onSuccessRedirect) {
                    onSuccessRedirect();
                  } else {
                    navigateTo('/login');
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-600/30 transition hover:brightness-110"
              >
                <LogIn className="h-4 w-4" />
                <span>{isAr ? 'الانتقال لتسجيل الدخول الآن' : 'Proceed to Sign-In Now'}</span>
              </button>
            </div>
          ) : (
            /* RESET FORM */
            <form onSubmit={handleSubmit} className="space-y-4">
              {!showLegacyTokenMode ? (
                <>
                  {/* Email Input */}
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-300">
                      {isAr ? 'البريد الإلكتروني للحساب' : 'Account Email'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={isAr ? 'admin@oxengl.com' : 'admin@oxengl.com'}
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                      />
                    </div>
                  </div>

                  {/* 6-Digit Dynamic OTP Input */}
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>{isAr ? 'رمز التحقق (6 أرقام)' : '6-Digit Verification Code'}</span>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCooldown > 0 || resending}
                        className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 disabled:text-slate-500 transition"
                      >
                        {resending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCw className="h-3 w-3" />
                        )}
                        <span>
                          {resendCooldown > 0
                            ? `${isAr ? 'إعادة الإرسال بعد' : 'Resend in'} ${resendCooldown}s`
                            : isAr
                            ? 'إعادة إرسال الرمز'
                            : 'Resend Code'}
                        </span>
                      </button>
                    </div>

                    {/* 6 Segmented Inputs */}
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2" dir="ltr">
                      {otpDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            otpInputsRef.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleDigitChange(idx, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(idx, e)}
                          onPaste={idx === 0 ? handlePaste : undefined}
                          className="h-12 w-full max-w-[48px] rounded-xl border border-slate-800 bg-slate-950 text-center font-mono text-lg font-black text-emerald-400 shadow-inner outline-none transition focus:border-indigo-500 focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20"
                        />
                      ))}
                    </div>

                    {resendMessage && (
                      <p className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>{resendMessage}</span>
                      </p>
                    )}
                  </div>
                </>
              ) : (
                /* Legacy Cryptographic Token Input */
                <div>
                  <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>{isAr ? 'رمز الأمان المشفر (Reset Token)' : 'Cryptographic Reset Token'}</span>
                    <button
                      type="button"
                      onClick={() => setShowLegacyTokenMode(false)}
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      {isAr ? 'التبديل إلى رمز 6 أرقام' : 'Switch to 6-digit OTP'}
                    </button>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                      <Hash className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={legacyToken}
                      onChange={(e) => setLegacyToken(e.target.value)}
                      placeholder={isAr ? 'رمز إعادة التعيين (32 حرف)' : '32-byte cryptographic token'}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-4 py-2.5 font-mono text-xs text-indigo-200 placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                    />
                  </div>
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>{isAr ? 'كلمة المرور الآمنة الجديدة' : 'New Secure Password'}</span>
                  <span className="text-[10px] text-slate-500">{isAr ? 'الحد الأدنى 8 خانات' : 'Min 8 chars'}</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={isAr ? '••••••••••••' : '••••••••••••'}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-10 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400 hover:text-white transition"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">
                  {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={isAr ? '••••••••••••' : '••••••••••••'}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/90 ps-10 pe-10 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400 hover:text-white transition"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Toggle to Legacy Token */}
              {!showLegacyTokenMode && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowLegacyTokenMode(true)}
                    className="text-[11px] text-slate-500 hover:text-slate-400 transition"
                  >
                    {isAr ? 'استخدام رمز التشفير القديم (Token)' : 'Use legacy cryptographic token'}
                  </button>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  <div className="flex-1 font-medium">{error}</div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-600/30 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-white" />
                )}
                <span>
                  {loading
                    ? (isAr ? 'جاري التحقق وتحديث كلمة المرور...' : 'Verifying OTP & Updating Password...')
                    : (isAr ? 'تأكيد إعادة تعيين كلمة المرور' : 'Confirm Password Reset')}
                </span>
              </button>

              {/* Back Link */}
              <div className="pt-3 border-t border-slate-800/80 text-center">
                <button
                  type="button"
                  onClick={() => navigateTo('/login')}
                  className="text-xs text-slate-400 hover:text-indigo-300 transition"
                >
                  {isAr ? 'تذكرت كلمة المرور؟ العودة لتسجيل الدخول' : 'Remembered your password? Back to Sign-In'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer Note */}
      <footer className="relative z-10 text-center text-[11px] text-slate-600 py-3">
        OxenGL Cloud Monolith Engine &bull; Zero-Trust Tenant Isolation Architecture
      </footer>
    </div>
  );
};

export default ResetPassword;
