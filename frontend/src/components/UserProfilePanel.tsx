import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Save, UserRound, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';

interface UserProfilePanelProps {
  onClose: () => void;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export const UserProfilePanel: React.FC<UserProfilePanelProps> = ({ onClose }) => {
  const { currentUser, setCurrentUser, language } = useApp();
  const isArabic = language === 'ar';
  const [fullName, setFullName] = useState(currentUser.fullName || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [syncReferenceId, setSyncReferenceId] = useState(currentUser.syncReferenceId || '');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    erpApi.getMyProfile()
      .then((profile) => {
        if (cancelled) return;
        setFullName(profile.full_name || '');
        setPhone(profile.phone || '');
        setSyncReferenceId(profile.sync_reference_id || '');
        setCurrentUser({
          ...currentUser,
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          fullNameAr: profile.full_name,
          phone: profile.phone || '',
          syncReferenceId: profile.sync_reference_id || null,
          companyId: profile.company_id || currentUser.companyId,
          iamRole: profile.iam_role || currentUser.iamRole,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProfileError(error instanceof Error
            ? error.message
            : (isArabic ? 'تعذر تحميل بيانات الملف الشخصي.' : 'Could not load profile details.'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileError('');
    setProfileNotice('');
    const cleanName = fullName.trim();
    if (!cleanName) {
      setProfileError(isArabic ? 'الاسم الكامل مطلوب.' : 'Full name is required.');
      return;
    }
    setIsSavingProfile(true);
    try {
      const profile = await erpApi.updateMyProfile({
        full_name: cleanName,
        phone: phone.trim() || null,
      });
      setFullName(profile.full_name);
      setPhone(profile.phone || '');
      setSyncReferenceId(profile.sync_reference_id || '');
      setCurrentUser({
        ...currentUser,
        fullName: profile.full_name,
        fullNameAr: profile.full_name,
        phone: profile.phone || '',
        syncReferenceId: profile.sync_reference_id || null,
      });
      setProfileNotice(isArabic ? 'تم تحديث بياناتك الشخصية.' : 'Your personal details were updated.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : (isArabic ? 'تعذر حفظ التغييرات.' : 'Could not save profile changes.'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordNotice('');
    if (newPassword.length < 10) {
      setPasswordError(isArabic ? 'يجب أن تتكون كلمة المرور من 10 أحرف على الأقل.' : 'Use at least 10 characters for your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(isArabic ? 'كلمتا المرور غير متطابقتين.' : 'The new passwords do not match.');
      return;
    }
    setIsChangingPassword(true);
    try {
      const result = await erpApi.changeMyPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice(result.message || (isArabic ? 'تم تغيير كلمة المرور. سجّل الدخول مجدداً.' : 'Password changed. Please sign in again.'));
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : (isArabic ? 'تعذر تغيير كلمة المرور.' : 'Could not change password.'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-title"
        dir={isArabic ? 'rtl' : 'ltr'}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#090f1c]"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-[#090f1c]/95">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-orange-600" />
            <div>
              <h2 id="user-profile-title" className="text-sm font-black text-slate-900 dark:text-slate-100">
                {isArabic ? 'الملف الشخصي' : 'My profile'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{currentUser.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isArabic ? 'إغلاق' : 'Close'}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <form onSubmit={saveProfile} className="space-y-3">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">
              {isArabic ? 'البيانات الشخصية' : 'Personal details'}
            </h3>
            <label className="block space-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>{isArabic ? 'الاسم الكامل' : 'Full name'}</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                maxLength={255}
                required
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>{isArabic ? 'رقم الهاتف' : 'Mobile phone'}</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                maxLength={64}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>{isArabic ? 'البريد الإلكتروني (للتواصل)' : 'Email address (contact)'}</span>
              <input value={currentUser.email} readOnly className={`${inputClass} cursor-not-allowed opacity-70`} />
              <span className="block font-normal text-slate-400">
                {isArabic ? 'لا يمكن تغيير البريد من هنا؛ يتطلب ذلك مسار تحقق مستقل.' : 'Email changes require a separate verification flow and are not enabled here.'}
              </span>
            </label>
            <label className="block space-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>{isArabic ? 'مرجع المزامنة' : 'Sync reference ID'}</span>
              <input
                value={syncReferenceId || (isArabic ? 'غير مرتبط' : 'Not linked')}
                readOnly
                className={`${inputClass} cursor-not-allowed font-mono opacity-70`}
              />
            </label>
            {profileError && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{profileError}</p>}
            {profileNotice && <p role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{profileNotice}</p>}
            <button
              type="submit"
              disabled={isLoading || isSavingProfile}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {isSavingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{isArabic ? 'حفظ البيانات' : 'Save details'}</span>
            </button>
          </form>

          <form onSubmit={changePassword} className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800 md:border-s-0 md:border-t-0 md:border-s md:pt-0 md:ps-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-orange-600" />
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">
                {isArabic ? 'تغيير كلمة المرور' : 'Change password'}
              </h3>
            </div>
            <label className="block space-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>{isArabic ? 'كلمة المرور الحالية' : 'Current password'}</span>
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required className={inputClass} />
            </label>
            <label className="block space-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>{isArabic ? 'كلمة المرور الجديدة' : 'New password'}</span>
              <input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required className={inputClass} />
            </label>
            <label className="block space-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>{isArabic ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password'}</span>
              <input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className={inputClass} />
            </label>
            <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
              {isArabic
                ? 'يتم التحقق من كلمة المرور الحالية وتجزئة الجديدة على الخادم. سيؤدي التغيير إلى إبطال الجلسات النشطة.'
                : 'Your current password is verified and the new password is hashed on the server. Active sessions are revoked after the change.'}
            </p>
            {passwordError && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{passwordError}</p>}
            {passwordNotice && <p role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{passwordNotice}</p>}
            <button
              type="submit"
              disabled={isChangingPassword}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isChangingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              <span>{isArabic ? 'تحديث كلمة المرور' : 'Update password'}</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};
