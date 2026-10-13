import React, { useState } from 'react';
import {
  KeyRound,
  Lock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { erpApi, FirstLoginPasswordChangeResponse } from '../../services/api';

interface ForceChangePasswordModalProps {
  isOpen: boolean;
  email?: string;
  workspaceSlug?: string;
  onSuccess?: (res: FirstLoginPasswordChangeResponse) => void;
}

export const ForceChangePasswordModal: React.FC<ForceChangePasswordModalProps> = ({
  isOpen,
  email,
  workspaceSlug,
  onSuccess,
}) => {
  const { language, currentUser, setCurrentUser, showToast } = useApp();
  const isAr = language === 'ar';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const targetEmail = email || currentUser?.email || '';
  const targetSlug = workspaceSlug || localStorage.getItem('tenant_slug') || '';

  // Password Strength Calculations
  const hasMinLength = newPassword.length >= 8;
  const hasMixedCase = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const hasNumberOrSpecial = /[0-9!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isDifferentFromCurrent = currentPassword.length > 0 && newPassword !== currentPassword;

  const strengthScore = [
    hasMinLength,
    hasMixedCase,
    hasNumberOrSpecial,
    passwordsMatch,
    isDifferentFromCurrent,
  ].filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError(isAr ? 'يرجى إدخال كلمة المرور المؤقتة الحالية' : 'Please enter your current temporary password');
      return;
    }

    if (newPassword.length < 8) {
      setError(isAr ? 'يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل' : 'New password must be at least 8 characters long');
      return;
    }

    if (newPassword === currentPassword) {
      setError(isAr ? 'يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور المؤقتة' : 'New password must differ from your current temporary password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(isAr ? 'كلمتا المرور غير متطابقتين' : 'New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await erpApi.firstLoginPasswordChange({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
        email: targetEmail || undefined,
        tenant_slug: targetSlug || undefined,
        workspace_slug: targetSlug || undefined,
      });

      if (res?.status === 'success' || res?.access_token) {
        setSuccess(true);
        localStorage.removeItem('must_change_password');
        if (currentUser) {
          const updatedUser = {
            ...currentUser,
            mustChangePassword: false,
            status: 'Active' as const,
          };
          setCurrentUser(updatedUser);
          localStorage.setItem('oxengl_user', JSON.stringify(updatedUser));
        }

        showToast(
          isAr
            ? 'تم تحديث كلمة المرور بنجاح! تم تفعيل حسابك.'
            : 'Password updated successfully! Your account is now active.',
          'success'
        );

        setTimeout(() => {
          if (onSuccess) {
            onSuccess(res);
          } else {
            window.location.href = '/operations/daily';
          }
        }, 1200);
      } else {
        setError(res?.message || (isAr ? 'فشل تحديث كلمة المرور' : 'Failed to update password'));
      }
    } catch (err: any) {
      setError(
        err?.message ||
          (isAr
            ? 'حدث خطأ أثناء تحديث كلمة المرور. يرجى التحقق من كلمة المرور المؤقتة.'
            : 'Error updating password. Please verify your temporary password.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      dir={isAr ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700/60 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl sm:p-8">
        {/* Glow accent */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-teal-500/10 blur-3xl" />

        {/* Header Badge */}
        <div className="relative mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 shadow-inner">
            <ShieldAlert className="h-7 w-7 text-emerald-400 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {isAr ? 'تغيير كلمة المرور إلزامي' : 'Mandatory Password Setup'}
          </h2>
          <p className="mt-2 text-sm text-slate-300 max-w-md">
            {isAr
              ? 'تمت دعوتك إلى مساحة العمل بكلمة مرور مؤقتة. لحماية حسابك والبيانات المؤسسية، يجب تعيين كلمة مرور شخصية جديدة قبل المتابعة.'
              : 'You were invited with a temporary password. To protect your account and company data, you must choose a secure permanent password before accessing the workspace.'}
          </p>
          {targetEmail && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-xs text-slate-300 border border-slate-700/50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{targetEmail}</span>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-300">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

        {/* Success State */}
        {success ? (
          <div className="my-6 flex flex-col items-center text-center py-4">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              {isAr ? 'تم تحديث كلمة المرور وتفعيل الحساب!' : 'Password Updated & Account Activated!'}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {isAr ? 'جاري توجيهك إلى مساحة العمل...' : 'Redirecting to your workspace...'}
            </p>
            <Loader2 className="mt-4 h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current (Temporary) Password */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                {isAr ? 'كلمة المرور المؤقتة الحالية' : 'Current Temporary Password'}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400">
                  <KeyRound className="h-4 w-4" />
                </div>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={isAr ? 'أدخل كلمة المرور المستلمة بالبريد' : 'Enter received temporary password'}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-10 py-2.5 text-sm text-white placeholder-slate-400 transition-colors focus:border-emerald-500 focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                {isAr ? 'كلمة المرور الدائمة الجديدة' : 'New Permanent Password'}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-10 py-2.5 text-sm text-white placeholder-slate-400 transition-colors focus:border-emerald-500 focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNew(!showNew)}
                  className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength Meter Bar */}
              {newPassword.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`transition-all duration-300 ${
                        strengthScore <= 2
                          ? 'w-1/3 bg-rose-500'
                          : strengthScore <= 4
                          ? 'w-2/3 bg-amber-500'
                          : 'w-full bg-emerald-500'
                      }`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {strengthScore <= 2
                        ? isAr
                          ? 'ضعيفة'
                          : 'Weak'
                        : strengthScore <= 4
                        ? isAr
                          ? 'متوسطة'
                          : 'Good'
                        : isAr
                          ? 'قوية وموثوقة'
                          : 'Strong'}
                    </span>
                    <span className="flex items-center gap-1">
                      {hasMinLength ? (
                        <span className="text-emerald-400">✓ 8+ {isAr ? 'أحرف' : 'chars'}</span>
                      ) : (
                        <span>8+ {isAr ? 'أحرف مطلوبة' : 'chars needed'}</span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={isAr ? 'أعد كتابة كلمة المرور للتأكيد' : 'Re-enter to confirm'}
                  className={`w-full rounded-xl border px-10 py-2.5 text-sm text-white placeholder-slate-400 transition-colors focus:bg-slate-800 focus:outline-none focus:ring-1 ${
                    confirmPassword && !passwordsMatch
                      ? 'border-rose-500/60 bg-rose-950/20 focus:border-rose-500 focus:ring-rose-500'
                      : 'border-slate-700 bg-slate-800/80 focus:border-emerald-500 focus:ring-emerald-500'
                  }`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-rose-400">
                  {isAr ? 'كلمات المرور غير متطابقة' : 'Passwords do not match'}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !currentPassword || !hasMinLength || !passwordsMatch}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-400 hover:to-teal-500 hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isAr ? 'جاري الحفظ والتفعيل...' : 'Activating Account...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isAr ? 'تأكيد كلمة المرور وتفعيل الحساب' : 'Save Password & Enter Workspace'}</span>
                    {isAr ? (
                      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    ) : (
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    )}
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 border-t border-slate-800 pt-4 text-center text-xs text-slate-400">
          <span>{isAr ? 'مساحة عمل محمية بواسطة معايير OxenGL للأمن المؤسسي' : 'Protected by OxenGL Enterprise Security Framework'}</span>
        </div>
      </div>
    </div>
  );
};
