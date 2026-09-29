import React, { useState } from 'react';
import { KeyRound, Lock, Mail, Phone, ShieldCheck, X, AlertCircle, Loader2, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface PasswordRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlane?: 'master' | 'tenant';
  initialTenantSlug?: string;
  onSuccess?: () => void;
}

export const PasswordRecoveryModal: React.FC<PasswordRecoveryModalProps> = ({
  isOpen,
  onClose,
  initialPlane = 'tenant',
  initialTenantSlug = '',
  onSuccess,
}) => {
  const { language, recoverUserPassword, resetUserPassword } = useApp();
  const isAr = language === 'ar';

  const [step, setStep] = useState<1 | 2>(1);
  const [plane, setPlane] = useState<'master' | 'tenant'>(initialPlane);
  const [workspaceSlug, setWorkspaceSlug] = useState(initialTenantSlug);
  const [identity, setIdentity] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [deliveryChannel, setDeliveryChannel] = useState<string | null>(null);

  // Step 2 fields
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  if (!isOpen) return null;

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanIdentity = identity.trim();
    if (!cleanIdentity) {
      setError(isAr ? 'يرجى إدخال البريد الإلكتروني أو رقم الجوال' : 'Please enter your email or mobile');
      return;
    }
    if (plane === 'tenant' && !workspaceSlug.trim()) {
      setError(isAr ? 'يرجى إدخال رمز مساحة عمل المنشأة' : 'Please specify the tenant workspace slug');
      return;
    }

    setLoading(true);
    try {
      const res = await recoverUserPassword({
        plane,
        workspace_slug: plane === 'tenant' ? workspaceSlug.trim().toLowerCase() : undefined,
        identity: cleanIdentity,
      });

      if (res?.reset_token) {
        setResetToken(res.reset_token);
      }
      if (res?.delivery_channel) {
        setDeliveryChannel(res.delivery_channel);
      }
      setStep(2);
    } catch (err: any) {
      const msg = err?.message || (isAr ? 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقاً.' : 'Failed to dispatch verification code.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length < 4) {
      setError(isAr ? 'يرجى إدخال رمز التحقق المكون من 6 أرقام' : 'Please enter the 6-digit verification code');
      return;
    }
    if (newPassword.length < 10) {
      setError(isAr ? 'يجب أن لا تقل كلمة المرور الجديدة عن 10 خانات' : 'New password must be at least 10 characters');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError(isAr ? 'كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم' : 'Password must contain uppercase, lowercase, and numeric digits');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await resetUserPassword({
        plane,
        workspace_slug: plane === 'tenant' ? workspaceSlug.trim().toLowerCase() : undefined,
        reset_token: resetToken || undefined,
        otp_code: cleanOtp,
        identity: identity.trim(),
        new_password: newPassword,
      });

      setIsCompleted(true);
      window.setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1800);
    } catch (err: any) {
      const msg = err?.message || (isAr ? 'رمز التحقق غير صحيح أو منتهي الصلاحية.' : 'Invalid or expired verification code.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <button
          onClick={onClose}
          className="absolute end-4 top-4 rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
        >
          <X className="h-5 w-5" />
        </button>

        {isCompleted ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-4 ring-emerald-500/10">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-black text-white">
              {isAr ? 'تم تحديث كلمة المرور بنجاح' : 'Password Successfully Updated'}
            </h3>
            <p className="mt-2 text-xs text-slate-300">
              {isAr
                ? 'تم تشفير كلمة المرور الجديدة وتحديثها في قاعدة البيانات. يمكنك الآن تسجيل الدخول.'
                : 'Your new password has been securely saved. You can now proceed to sign in.'}
            </p>
          </div>
        ) : step === 1 ? (
          <div>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-600/20 text-indigo-400">
                <KeyRound className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-black text-white">
                {isAr ? 'استعادة كلمة المرور' : 'Account Recovery'}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {isAr
                  ? 'أدخل البريد الإلكتروني أو رقم الجوال لاستلام رمز التحقق الآمن (OTP)'
                  : 'Enter your verified email or mobile to receive a secure OTP code'}
              </p>
            </div>

            <form onSubmit={handleRequestOtp} className="space-y-4">
              {/* Plane selector */}
              <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => setPlane('tenant')}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                    plane === 'tenant'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isAr ? 'مستأجر (منشأة)' : 'Tenant Workspace'}
                </button>
                <button
                  type="button"
                  onClick={() => setPlane('master')}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                    plane === 'master'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isAr ? 'مشرف عام (Master)' : 'Master Control Plane'}
                </button>
              </div>

              {plane === 'tenant' && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-300">
                    {isAr ? 'معرف مساحة العمل (Slug)' : 'Workspace Slug'}
                  </label>
                  <input
                    type="text"
                    required
                    value={workspaceSlug}
                    onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase())}
                    placeholder={isAr ? 'meayon-logistics' : 'meayon-logistics'}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-xs text-indigo-300 outline-none transition focus:border-indigo-400"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'البريد الإلكتروني أو رقم الجوال' : 'Email or Mobile Number'}
                </label>
                <div className="relative">
                  <Mail className="absolute start-3 top-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                    placeholder={isAr ? 'user@example.com أو 05XXXXXXXX' : 'user@example.com or 05XXXXXXXX'}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 ps-9 pe-3 py-2.5 text-xs text-white outline-none transition focus:border-indigo-400"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-600/30 transition-all hover:brightness-110 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                <span>{loading ? (isAr ? 'جاري إرسال الرمز...' : 'Sending Code...') : (isAr ? 'إرسال رمز التحقق (OTP)' : 'Send Verification OTP')}</span>
              </button>
            </form>
          </div>
        ) : (
          <div>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-600/20 text-emerald-400">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-black text-white">
                {isAr ? 'إدخال رمز التحقق وكلمة المرور' : 'Verify & Set New Password'}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {isAr
                  ? `تم إرسال رمز التحقق إلى ${identity}. يرجى إدخال الرمز المكون من 6 أرقام.`
                  : `Verification code was sent to ${identity}. Enter the 6-digit code.`}
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'رمز التحقق (OTP)' : 'Verification Code (OTP)'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder={isAr ? 'رمز التحقق: 123456' : 'Code: 123456'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 text-center font-mono text-base font-black tracking-widest text-emerald-400 outline-none transition focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'كلمة المرور الجديدة' : 'New Password (min 10 chars)'}
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={isAr ? '••••••••••••' : '••••••••••••'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none transition focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={isAr ? '••••••••••••' : '••••••••••••'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none transition focus:border-indigo-400"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-slate-800 px-3 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition"
                >
                  {isAr ? 'الرجوع' : 'Back'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-600/20 transition-all hover:brightness-110 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>{loading ? (isAr ? 'جاري التحديث...' : 'Updating...') : (isAr ? 'تحديث كلمة المرور' : 'Update Password')}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
