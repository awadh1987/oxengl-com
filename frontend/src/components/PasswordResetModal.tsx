import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import type { User } from '../types';

interface PasswordResetModalProps {
  user: User;
  isOpen: boolean;
  isArabic: boolean;
  isBusy?: boolean;
  onClose: () => void;
  onConfirm: (requirePasswordChange: boolean) => void;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  user,
  isOpen,
  isArabic,
  isBusy = false,
  onClose,
  onConfirm,
}) => {
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);

  useEffect(() => {
    if (isOpen) setRequirePasswordChange(true);
  }, [isOpen, user.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-reset-title"
        dir={isArabic ? 'rtl' : 'ltr'}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-[#090f1c]"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="password-reset-title" className="text-sm font-black text-slate-900 dark:text-slate-100">
              {isArabic ? 'إعادة تعيين كلمة المرور' : 'Reset password'}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{user.email || user.phone}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label={isArabic ? 'إغلاق' : 'Close'}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {isArabic
            ? 'سيتم إبطال بيانات الاعتماد الحالية وإرسال إرشادات إعادة التعيين إلى قناة الاتصال المسجلة. لا يتم عرض كلمة المرور أو رمز الاستعادة في هذه الشاشة.'
            : 'The current credential will be invalidated and reset instructions sent through the registered channel. No password or recovery code is displayed here.'}
        </p>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
          <input
            type="checkbox"
            checked={requirePasswordChange}
            onChange={(event) => setRequirePasswordChange(event.target.checked)}
            disabled={isBusy}
            className="mt-0.5 accent-orange-600"
          />
          <span>
            <span className="block font-bold text-slate-800 dark:text-slate-100">
              {isArabic ? 'إلزام المستخدم بتغيير كلمة المرور عند الدخول التالي' : 'Require a password change at next sign-in'}
            </span>
            <span className="mt-1 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {isArabic
                ? 'يؤثر هذا الخيار على بيانات الدخول المؤقتة عبر SMS. إعادة التعيين عبر البريد تتطلب دائماً إنشاء كلمة مرور جديدة باستخدام رمز الاستعادة.'
                : 'This setting applies to temporary SMS credentials. Email recovery always requires the user to create a new password with the recovery code.'}
            </span>
          </span>
        </label>

        <p className="text-[10px] text-slate-400">
          {isArabic ? 'سيتم تسجيل الإجراء وقرار الإلزام في سجل التدقيق.' : 'The reset and this requirement choice are recorded in the audit log.'}
        </p>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isArabic ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(requirePasswordChange)}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            <span>{isArabic ? 'إرسال تعليمات الاستعادة' : 'Send reset instructions'}</span>
          </button>
        </footer>
      </section>
    </div>
  );
};
