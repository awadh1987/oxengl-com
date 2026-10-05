import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';
import { UserAvatar } from './UserAvatar';

interface UserProfilePanelProps {
  onClose: () => void;
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-950';
const acceptedAvatarTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxAvatarBytes = 5 * 1024 * 1024;

export const UserProfilePanel: React.FC<UserProfilePanelProps> = ({ onClose }) => {
  const { currentUser, setCurrentUser, language } = useApp();
  const isArabic = language === 'ar';
  const avatarInput = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(currentUser.fullName || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [syncReferenceId, setSyncReferenceId] = useState(currentUser.syncReferenceId || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || currentUser.avatar || '');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [avatarError, setAvatarError] = useState('');
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
        setAvatarUrl(profile.avatar_url || '');
        setCurrentUser((previousUser) => ({
          ...previousUser,
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          fullNameAr: profile.full_name,
          phone: profile.phone || '',
          syncReferenceId: profile.sync_reference_id || null,
          avatar_url: profile.avatar_url || undefined,
          companyId: profile.company_id || previousUser.companyId,
          iamRole: profile.iam_role || previousUser.iamRole,
        }));
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
      setAvatarUrl(profile.avatar_url || avatarUrl);
      setCurrentUser((previousUser) => ({
        ...previousUser,
        fullName: profile.full_name,
        fullNameAr: profile.full_name,
        phone: profile.phone || '',
        syncReferenceId: profile.sync_reference_id || null,
        avatar_url: profile.avatar_url || avatarUrl || undefined,
      }));
      setProfileNotice(isArabic ? 'تم تحديث بياناتك الشخصية.' : 'Your personal details were updated.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : (isArabic ? 'تعذر حفظ التغييرات.' : 'Could not save profile changes.'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarError('');
    setProfileNotice('');
    if (!acceptedAvatarTypes.includes(file.type)) {
      setAvatarError(isArabic ? 'اختر صورة JPEG أو PNG أو WebP.' : 'Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size <= 0 || file.size > maxAvatarBytes) {
      setAvatarError(isArabic ? 'يجب ألا يتجاوز حجم الصورة 5 ميغابايت.' : 'The image must be no larger than 5 MB.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const profile = await erpApi.uploadMyAvatar(file);
      const newAvatarUrl = profile.avatar_url || '';
      setAvatarUrl(newAvatarUrl);
      setCurrentUser((previousUser) => ({
        ...previousUser,
        avatar_url: newAvatarUrl || undefined,
      }));
      setProfileNotice(isArabic ? 'تم تحديث الصورة الشخصية.' : 'Your profile photo was updated.');
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : (isArabic ? 'تعذر رفع الصورة.' : 'Could not upload the image.'));
    } finally {
      setIsUploadingAvatar(false);
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-title"
        dir={isArabic ? 'rtl' : 'ltr'}
        className="erp-modal-shell w-full max-w-4xl rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950"
      >
        <header className="erp-modal-header flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-100 p-2.5 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <h2 id="user-profile-title" className="text-base font-black text-slate-900 dark:text-white">
                {isArabic ? 'ملفي الشخصي' : 'My profile'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isArabic ? 'إدارة هويتك وتفضيلات أمان الحساب' : 'Manage your identity and account security'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isArabic ? 'إغلاق' : 'Close'}
            className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/20 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="erp-modal-body grid gap-5 p-4 sm:p-7 lg:grid-cols-2">
          <form onSubmit={saveProfile} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <UserRound className="h-4 w-4 text-orange-600" />
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {isArabic ? 'الهوية الشخصية' : 'Profile identity'}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {isArabic ? 'حدّث صورتك ومعلومات التواصل' : 'Update your photo and contact details'}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 py-1">
              <input
                ref={avatarInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label={isArabic ? 'اختر صورة شخصية' : 'Choose a profile photo'}
                onChange={uploadAvatar}
              />
              <button
                type="button"
                onClick={() => avatarInput.current?.click()}
                disabled={isUploadingAvatar || isLoading}
                aria-label={isArabic ? 'تغيير الصورة الشخصية' : 'Change profile photo'}
                className="group relative h-28 w-28 overflow-hidden rounded-full bg-gradient-to-br from-orange-500 to-rose-600 text-3xl font-black text-white shadow-lg shadow-orange-900/15 ring-4 ring-white transition focus:outline-none focus-visible:ring-orange-400 dark:ring-slate-900"
              >
                <UserAvatar
                  user={{ fullName, username: currentUser.username, avatar_url: avatarUrl || undefined }}
                  sizeClassName="h-full w-full text-3xl"
                  shape="circle"
                  className="bg-transparent shadow-none ring-0"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {isUploadingAvatar ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                </span>
              </button>
              <div className="text-center">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {isUploadingAvatar
                    ? (isArabic ? 'جارٍ رفع الصورة...' : 'Uploading photo...')
                    : (isArabic ? 'انقر لتغيير الصورة' : 'Click to change photo')}
                </p>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  {isArabic ? 'JPEG أو PNG أو WebP، بحد أقصى 5 ميغابايت' : 'JPEG, PNG, or WebP · up to 5 MB'}
                </p>
              </div>
              {avatarError && <p role="alert" className="text-center text-xs font-semibold text-rose-600 dark:text-rose-400">{avatarError}</p>}
            </div>

            <label className="block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>{isArabic ? 'الاسم الكامل' : 'Full name'}</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                maxLength={255}
                required
                placeholder={isArabic ? 'أدخل اسمك الكامل' : 'Enter your full name'}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>{isArabic ? 'رقم الهاتف' : 'Mobile phone'}</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                maxLength={64}
                placeholder="+966 5X XXX XXXX"
                className={inputClass}
              />
            </label>
            {profileError && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{profileError}</p>}
            {profileNotice && <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Check className="h-4 w-4" />{profileNotice}</p>}
            <button
              type="submit"
              disabled={isLoading || isSavingProfile}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{isArabic ? 'حفظ بيانات الهوية' : 'Save identity details'}</span>
            </button>
          </form>

          <div className="space-y-5">
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-6">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {isArabic ? 'أمان الحساب' : 'Account security'}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {isArabic ? 'بيانات الحساب ومعرّفات الربط' : 'Account details and linked identifiers'}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" />{isArabic ? 'البريد الإلكتروني' : 'Email address'}</span>
                  <input value={currentUser.email} readOnly className={`${inputClass} cursor-not-allowed opacity-70`} />
                </label>
                <label className="block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5 text-slate-400" />{isArabic ? 'مرجع المزامنة' : 'Sync reference'}</span>
                  <input
                    value={syncReferenceId || (isArabic ? 'غير مرتبط' : 'Not linked')}
                    readOnly
                    className={`${inputClass} cursor-not-allowed font-mono opacity-70`}
                  />
                </label>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {isArabic
                  ? 'البريد الإلكتروني ومرجع المزامنة للعرض فقط. يتطلب تغيير البريد التحقق من الهوية.'
                  : 'Email and sync reference are read-only. Changing your email requires a separate identity verification flow.'}
              </p>
            </section>

            <form onSubmit={changePassword} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-6">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                <KeyRound className="h-4 w-4 text-orange-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {isArabic ? 'تغيير كلمة المرور' : 'Change password'}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {isArabic ? 'استخدم كلمة مرور فريدة لا تقل عن 10 أحرف' : 'Choose a unique password with at least 10 characters'}
                  </p>
                </div>
              </div>
              <label className="block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>{isArabic ? 'كلمة المرور الحالية' : 'Current password'}</span>
                <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required className={inputClass} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>{isArabic ? 'كلمة المرور الجديدة' : 'New password'}</span>
                  <input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required className={inputClass} />
                </label>
                <label className="block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>{isArabic ? 'تأكيد كلمة المرور' : 'Confirm password'}</span>
                  <input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className={inputClass} />
                </label>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {isArabic
                  ? 'يتم التحقق من كلمة المرور الحالية وتجزئة الجديدة على الخادم. سيؤدي التغيير إلى إبطال الجلسات النشطة.'
                  : 'Your current password is verified and the new password is securely hashed on the server. Active sessions are revoked after the change.'}
              </p>
              {passwordError && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{passwordError}</p>}
              {passwordNotice && <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Check className="h-4 w-4" />{passwordNotice}</p>}
              <button
                type="submit"
                disabled={isChangingPassword}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {isChangingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                <span>{isArabic ? 'تحديث كلمة المرور' : 'Update password'}</span>
              </button>
            </form>
          </div>
        </div>
        <footer className="erp-modal-footer border-t border-slate-200 bg-slate-50 px-5 py-3 text-end dark:border-slate-800 dark:bg-slate-950 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            {isArabic ? 'إغلاق الملف الشخصي' : 'Close profile'}
          </button>
        </footer>
      </section>
    </div>
  );
};
