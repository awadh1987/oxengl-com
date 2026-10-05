import React from 'react';
import { Ban, CheckCircle2, Loader2, X } from 'lucide-react';
import type { User } from '../types';

interface UserLifecycleModalProps {
  user: User;
  action: 'suspend' | 'reactivate' | 'soft-delete';
  isOpen: boolean;
  isArabic: boolean;
  isBusy?: boolean;
  onClose: () => void;
  onConfirm: (action: 'suspend' | 'reactivate' | 'soft-delete') => void;
}

export const UserLifecycleModal: React.FC<UserLifecycleModalProps> = ({
  user,
  action,
  isOpen,
  isArabic,
  isBusy = false,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;
  const isSuspend = action === 'suspend';
  const isSoftDelete = action === 'soft-delete';
  const Icon = isSuspend ? Ban : isSoftDelete ? X : CheckCircle2;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="user-lifecycle-title"
        dir={isArabic ? 'rtl' : 'ltr'}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-[#090f1c]"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className={`mt-0.5 rounded-lg p-2 ${isSuspend || isSoftDelete ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <h2 id="user-lifecycle-title" className="text-sm font-black text-slate-900 dark:text-slate-100">
                {isSuspend
                  ? (isArabic ? 'تعليق الحساب' : 'Suspend account')
                  : isSoftDelete
                    ? (isArabic ? 'حذف المستخدم من القائمة' : 'Soft-delete user')
                    : (isArabic ? 'إعادة تفعيل الحساب' : 'Reactivate account')}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{user.email || user.phone}</p>
            </div>
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
          {isSuspend
            ? isArabic
              ? 'سيُمنع هذا المستخدم من تسجيل الدخول وتُنهى جلساته النشطة. يمكن للمدير إعادة تفعيل الحساب لاحقاً.'
              : 'This user will be blocked from signing in and active sessions will be revoked. An administrator can reactivate the account later.'
            : isSoftDelete
              ? isArabic
                ? 'سيتم تعطيل الحساب وإخفاؤه من قوائم المستخدمين النشطة. سيبقى السجل محفوظاً ولن تُحذف بياناته.'
                : 'The account will be disabled and hidden from active user lists. Its record and related history will be retained.'
              : isArabic
              ? 'سيُسمح لهذا المستخدم بتسجيل الدخول مجدداً.'
              : 'This user will be allowed to sign in again.'}
        </p>
        {isSuspend && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
            {isArabic
              ? 'هذا الإجراء قابل للعكس ولا يحذف بيانات المستخدم.'
              : 'Suspension is reversible and does not delete the user or their data.'}
          </p>
        )}
        <p className="text-[10px] text-slate-400">
          {isArabic ? 'سيتم تسجيل القرار في سجل التدقيق.' : 'This access decision is recorded in the audit log.'}
        </p>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {isSuspend && (
            <button
              type="button"
              onClick={() => onConfirm('soft-delete')}
              disabled={isBusy}
              className="me-auto rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/50"
            >
              {isArabic ? 'حذف ناعم' : 'Soft delete'}
            </button>
          )}
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
            onClick={() => onConfirm(action)}
            disabled={isBusy}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${isSuspend || isSoftDelete ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            <span>
              {isSuspend
                ? (isArabic ? 'تعليق الحساب' : 'Suspend account')
                : isSoftDelete
                  ? (isArabic ? 'تأكيد الحذف الناعم' : 'Confirm soft delete')
                  : (isArabic ? 'إعادة التفعيل' : 'Reactivate account')}
            </span>
          </button>
        </footer>
      </section>
    </div>
  );
};
