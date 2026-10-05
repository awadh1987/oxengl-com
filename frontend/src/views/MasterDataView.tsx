import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle,
  Edit2,
  Filter,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { User } from '../types';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';
import { EntityCRUDModal } from '../components/EntityCRUDModal';
import { PasswordResetModal } from '../components/PasswordResetModal';
import { UserLifecycleModal } from '../components/UserLifecycleModal';
import { useIamRoles } from '../hooks/useIamRoles';
import {
  HR_REGISTRATION_WARNING_AR,
  HR_REGISTRATION_WARNING_EN,
  PRIVILEGED_IAM_ROLES,
  iamRoleLabel,
} from '../constants/iamRoles';

function iamRoleBadgeClass(role: string): string {
  if (role === 'Super_Admin' || role.endsWith('_Admin') || role === 'Admin' || role === 'Owner' || role === 'CEO') {
    return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-400';
  }
  if (role.endsWith('_Manager') || role === 'COO') {
    return 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-400';
  }
  if (role.endsWith('_Editor') || role === 'Accountant' || role === 'IT_Support') {
    return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:border-purple-800 dark:text-purple-400';
  }
  if (role === 'Data_Entry' || role.endsWith('_Operator')) {
    return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-400';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300';
}

function rolePermissionSummary(role: string, isAr: boolean): string {
  if (role === 'Super_Admin') return isAr ? 'صلاحيات تنفيذية كاملة داخل مساحة العمل' : 'Full executive authority within this workspace';
  if (role.endsWith('_Admin')) return isAr ? 'إدارة كاملة للوحدة المعنية' : 'Full administration of the module area';
  if (role.endsWith('_Manager')) return isAr ? 'إدارة واعتماد داخل نطاق الإدارة' : 'Management and approvals within the department';
  if (role.endsWith('_Editor')) return isAr ? 'إنشاء وتعديل السجلات داخل النطاق' : 'Create and edit records within scope';
  if (role.endsWith('_Operator') || role === 'Data_Entry') return isAr ? 'إدخال بيانات ومهام تشغيلية يومية' : 'Daily operational and data-entry tasks';
  if (role === 'Admin_Viewer') return isAr ? 'عرض إداري للقراءة فقط' : 'Read-only administrative view';
  if (role === 'IT_Support') return isAr ? 'دعم فني وحل المشكلات' : 'Technical support and troubleshooting';
  if (role === 'Employee_Self_Serve') return isAr ? 'خدمات الموظف الذاتية فقط' : 'Employee self-service only';
  if (role === 'External_Auditor') return isAr ? 'قراءة فقط ضمن نطاق التدقيق (هوية خارجية)' : 'Read-only, audit scope (external identity)';
  if (role === 'Guest') return isAr ? 'قراءة ومراجعة فقط (هوية خارجية)' : 'Read-only (external identity)';
  return role;
}

export const MasterDataView: React.FC = () => {
  const { users, refreshUsers, currentUser, language } = useApp();
  const isAr = language === 'ar';
  const iamRoles = useIamRoles();
  const currentRoles = [currentUser?.role, currentUser?.iamRole].map((role) =>
    String(role || '').trim().toLowerCase(),
  );
  const isAdminOrOwner = currentRoles.some((role) => ['owner', 'admin'].includes(role));
  const canManageIam = isAdminOrOwner || currentRoles.some((role) => {
    return ['super_admin', 'ceo'].includes(role) ||
      PRIVILEGED_IAM_ROLES.some((privilegedRole) => privilegedRole.toLowerCase() === role);
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteChannel, setInviteChannel] = useState<'email' | 'sms' | 'manual'>('email');
  const [inviteRole, setInviteRole] = useState<string>('Guest');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    email: string;
    phone: string;
    channel: 'email' | 'sms' | 'manual';
    role: string;
    temporaryPassword?: string;
  } | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<{
    user: User;
    action: 'suspend' | 'reactivate' | 'soft-delete';
  } | null>(null);
  const [iamBusyId, setIamBusyId] = useState<string | null>(null);
  const [iamRowErrors, setIamRowErrors] = useState<Record<string, string>>({});
  const [iamNotice, setIamNotice] = useState<string | null>(null);

  useEffect(() => {
    refreshUsers();
  }, []);

  const activeUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users
      .filter((user) => !user.is_deleted)
      .filter((user) => {
        if (query && ![
          user.fullName,
          user.fullNameAr,
          user.username,
          user.email,
          user.phone,
          user.syncReferenceId,
        ].some((value) => String(value || '').toLowerCase().includes(query))) return false;
        return quickFilter === 'all' || (user.iamRole || user.role) === quickFilter;
      });
  }, [users, searchQuery, quickFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUsers();
    } catch (error) {
      console.error('Could not refresh IAM users:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInviteUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inviteChannel === 'manual' && !inviteEmail.trim() && !invitePhone.trim()) {
      setInviteError(isAr ? 'أدخل البريد الإلكتروني أو رقم الهاتف لتعريف الحساب.' : 'Enter an email address or phone number to identify the account.');
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const result = await erpApi.inviteUser({
        channel: inviteChannel,
        email: inviteChannel !== 'sms' ? inviteEmail.trim() || undefined : undefined,
        phone: inviteChannel !== 'email' ? invitePhone.trim() || undefined : undefined,
        role: inviteRole,
        full_name: inviteFullName.trim() || undefined,
      });
      setInviteResult({
        email: result.email || '',
        phone: result.phone || '',
        channel: result.channel,
        role: result.role,
        temporaryPassword: result.channel === 'manual' ? result.temporary_password || undefined : undefined,
      });
      await refreshUsers();
      setInviteEmail('');
      setInvitePhone('');
      setInviteFullName('');
    } catch (error) {
      console.error('Invite user failed:', error);
      setInviteError(error instanceof Error ? error.message : (isAr ? 'فشلت دعوة المستخدم' : 'Failed to invite user'));
    } finally {
      setInviteLoading(false);
    }
  };

  const runPasswordReset = async (requirePasswordChange: boolean) => {
    if (!passwordResetUser) return;
    const user = passwordResetUser;
    const contact = user.phone || user.email;
    setIamBusyId(user.id);
    setIamRowErrors((previous) => {
      const next = { ...previous };
      delete next[user.id];
      return next;
    });
    try {
      const result = await erpApi.forcePasswordReset(user.id, requirePasswordChange);
      setIamNotice(result.message || (
        result.reset_dispatched
          ? isAr ? `تم إبطال بيانات الدخول وإرسال تعليمات الاستعادة إلى ${contact}.` : `Credentials invalidated and reset instructions sent to ${contact}.`
          : isAr ? `تم إبطال بيانات الدخول لـ ${contact}.` : `Credentials invalidated for ${contact}.`
      ));
      setPasswordResetUser(null);
      await refreshUsers();
      setTimeout(() => setIamNotice(null), 6000);
    } catch (error) {
      setIamRowErrors((previous) => ({
        ...previous,
        [user.id]: error instanceof Error ? error.message : (isAr ? 'فشلت العملية' : 'Action failed'),
      }));
    } finally {
      setIamBusyId(null);
    }
  };

  const runLifecycleAction = async (action: 'suspend' | 'reactivate' | 'soft-delete') => {
    if (!lifecycleAction) return;
    const { user } = lifecycleAction;
    setLifecycleAction({ user, action });
    const contact = user.phone || user.email;
    setIamBusyId(user.id);
    setIamRowErrors((previous) => {
      const next = { ...previous };
      delete next[user.id];
      return next;
    });
    try {
      if (action === 'suspend') {
        await erpApi.suspendUser(user.id);
        setIamNotice(isAr ? `تم تعليق حساب ${contact} وإنهاء جلساته.` : `Account ${contact} suspended and sessions revoked.`);
      } else if (action === 'reactivate') {
        await erpApi.reactivateUser(user.id);
        setIamNotice(isAr ? `تمت إعادة تفعيل حساب ${contact}.` : `Account ${contact} reactivated.`);
      } else {
        await erpApi.softDeleteUser(user.id);
        setIamNotice(isAr ? `تم حذف حساب ${contact} من القائمة النشطة مع الاحتفاظ بسجله.` : `Account ${contact} was hidden from active users; its record was retained.`);
      }
      setLifecycleAction(null);
      await refreshUsers();
      setTimeout(() => setIamNotice(null), 6000);
    } catch (error) {
      setIamRowErrors((previous) => ({
        ...previous,
        [user.id]: error instanceof Error ? error.message : (isAr ? 'فشلت العملية' : 'Action failed'),
      }));
    } finally {
      setIamBusyId(null);
    }
  };

  return (
    <div id="master-data-view" className="mx-auto w-full max-w-7xl space-y-3 px-3 sm:px-4 md:px-6" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <h1 className="text-base font-black text-slate-900 dark:text-white">
              {isAr ? 'مصفوفة المستخدمين والأدوار والصلاحيات' : 'Users, Roles & Permissions Matrix'}
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'إدارة مستخدمي مساحة العمل وأدوار IAM وإجراءات الوصول المدققة.' : 'Manage workspace users, IAM roles, and audited access actions.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setInviteResult(null);
            setInviteError(null);
            setInviteRole('Guest');
            setInviteChannel('email');
            setIsInviteModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-orange-700"
        >
          <UserPlus className="h-4 w-4" />
          <span>{isAr ? 'دعوة مستخدم خارجي' : 'Invite External User'}</span>
        </button>
      </header>

      <section className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] max-w-sm flex-1">
            <Search className="absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={isAr ? 'بحث بالاسم أو البريد أو اسم المستخدم...' : 'Search name, email, or username...'}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pe-3 ps-8 text-xs text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={quickFilter}
              onChange={(event) => setQuickFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">{isAr ? 'كافة الأدوار' : 'All Roles'}</option>
              {[...iamRoles.roles, ...iamRoles.externalRoles.filter((role) => !iamRoles.roles.includes(role))].map((role) => (
                <option key={role} value={role}>{iamRoleLabel(role, isAr)}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title={isAr ? 'تحديث المستخدمين' : 'Refresh users'}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isAr ? (isRefreshing ? 'جارِ التحديث...' : 'تحديث') : (isRefreshing ? 'Refreshing...' : 'Refresh')}</span>
        </button>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? 'مصفوفة المستخدمين والأدوار والصلاحيات' : 'Users, Roles & Permissions Matrix'}
            </h2>
          </div>
          <span className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
            {activeUsers.length} {isAr ? 'مستخدمين' : 'Users'}
          </span>
        </div>

        {!canManageIam && (
          <p className="mx-3 mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {isAr ? 'إجراءات الوصول متاحة لمدراء مساحة العمل فقط.' : 'Access actions are available to workspace administrators only.'}
          </p>
        )}
        {iamNotice && <p role="status" className="mx-3 mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{iamNotice}</p>}

        <div className="responsive-table-wrapper overflow-x-auto p-2">
          <table className="neo-grid-table w-full text-start">
            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="text-start">{isAr ? 'الاسم الكامل' : 'Full Name'}</th>
                <th className="text-start">{isAr ? 'اسم المستخدم / البريد / الهاتف' : 'Username / Email / Phone'}</th>
                <th className="text-start">{isAr ? 'الدور الوظيفي' : 'Role'}</th>
                <th className="text-start">{isAr ? 'الصلاحيات المتاحة' : 'Permissions'}</th>
                <th className="text-start">{isAr ? 'مرجع المزامنة' : 'Sync reference'}</th>
                <th className="text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {activeUsers.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-xs text-slate-400">{isAr ? 'لا يوجد مستخدمون مطابقون للبحث أو التصفية.' : 'No users match the active query.'}</td></tr>
              ) : activeUsers.map((user) => {
                const role = user.iamRole || user.role;
                const isSelf = user.id === currentUser?.id;
                const isBusy = iamBusyId === user.id;
                const isSuspended = user.status === 'Suspended';
                const rowError = iamRowErrors[user.id];
                const actionsDisabled = isBusy || (!canManageIam && !isAdminOrOwner);
                return (
                  <tr key={user.id}>
                    <td className="font-bold text-slate-900 dark:text-slate-100">{isAr ? user.fullNameAr : user.fullName}</td>
                    <td className="text-slate-600 dark:text-slate-400">
                      {user.phone || user.email}<span className="ms-1 text-[10px] text-slate-400">(@{user.username})</span>
                    </td>
                    <td>
                      <span className={`rounded px-1.5 py-1 text-[10px] font-bold ${iamRoleBadgeClass(role)}`} title={role}>{iamRoleLabel(role, isAr)}</span>
                      {isSuspended && <span className="ms-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-1 text-[10px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400">{isAr ? 'معلّق' : 'Suspended'}</span>}
                      {user.mustChangePassword && !isSuspended && <span className="ms-1 rounded border border-orange-300 bg-orange-50 px-1.5 py-1 text-[10px] font-bold text-orange-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400">{isAr ? 'بانتظار القبول' : 'Pending Acceptance'}</span>}
                    </td>
                    <td className="max-w-sm text-xs text-slate-600 dark:text-slate-400">{rolePermissionSummary(role, isAr)}</td>
                    <td>
                      {user.syncReferenceId ? (
                        <span
                          title={user.syncReferenceId}
                          className="inline-flex max-w-48 items-center gap-1.5 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                        >
                          <Link2 className="h-3 w-3 shrink-0" />
                          <span className="truncate font-mono">{user.syncReferenceId}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">{isAr ? 'محلي' : 'Local'}</span>
                      )}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedUser(user)}
                          disabled={actionsDisabled}
                          className="neo-action-btn neo-btn-edit disabled:cursor-not-allowed disabled:opacity-40"
                          title={!canManageIam ? (isAr ? 'للمدراء فقط' : 'Administrators only') : (isAr ? 'تعديل الصلاحيات' : 'Edit Access')}
                          aria-label={isAr ? 'تعديل الصلاحيات' : 'Edit Access'}
                        ><Edit2 className="h-3 w-3" /></button>
                        <button
                          type="button"
                          onClick={() => setPasswordResetUser(user)}
                          disabled={actionsDisabled}
                          className="neo-action-btn disabled:cursor-not-allowed disabled:opacity-40"
                          title={!canManageIam ? (isAr ? 'للمدراء فقط' : 'Administrators only') : (isAr ? 'فرض إعادة تعيين كلمة المرور' : 'Force Password Reset')}
                          aria-label={isAr ? 'فرض إعادة تعيين كلمة المرور' : 'Force Password Reset'}
                        >{isBusy && passwordResetUser?.id === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}</button>
                        <button
                          type="button"
                          onClick={() => setLifecycleAction({ user, action: isSuspended ? 'reactivate' : 'suspend' })}
                          disabled={actionsDisabled || isSelf}
                          className="neo-action-btn neo-btn-delete disabled:cursor-not-allowed disabled:opacity-40"
                          title={!canManageIam ? (isAr ? 'للمدراء فقط' : 'Administrators only') : isSuspended ? (isAr ? 'إعادة تفعيل الحساب' : 'Reactivate Account') : (isAr ? 'تعليق الحساب' : 'Suspend Account')}
                          aria-label={isSuspended ? (isAr ? 'إعادة تفعيل الحساب' : 'Reactivate Account') : (isAr ? 'تعليق الحساب' : 'Suspend Account')}
                        >{isBusy && lifecycleAction?.user.id === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : isSuspended ? <CheckCircle className="h-3 w-3" /> : <Ban className="h-3 w-3" />}</button>
                      </div>
                      {rowError && <p role="alert" className="mt-1 text-start text-[10px] font-bold text-rose-600 dark:text-rose-400">{rowError}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#090f1c]" dir={isAr ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-orange-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{isAr ? 'دعوة مستخدم جديد للمنظومة' : 'Invite New Workspace User'}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{isAr ? 'دعوة هوية خارجية (ضيف / مدقق خارجي) إلى مساحة العمل الحالية' : 'Invite an external identity (Guest / External Auditor) to the current workspace'}</p>
                </div>
              </div>
              <button type="button" onClick={() => { setIsInviteModalOpen(false); setInviteResult(null); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={isAr ? 'إغلاق' : 'Close'}><X className="h-4 w-4" /></button>
            </div>

            {inviteResult ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <div className="flex items-center gap-2 text-xs font-black"><CheckCircle className="h-4 w-4 text-emerald-600" /><span>{isAr ? 'تم إنشاء حساب المستخدم بنجاح!' : 'User created successfully!'}</span></div>
                  <p className="mt-2 text-xs leading-relaxed">
                    {isAr
                      ? `تم ربط المستخدم (${inviteResult.email || inviteResult.phone}) بدور (${iamRoleLabel(inviteResult.role, true)}). ${inviteResult.channel === 'manual' ? 'لم تُرسل أي رسالة؛ سلّم كلمة المرور المؤقتة يدوياً' : `أُرسلت بيانات الدخول المؤقتة عبر ${inviteResult.channel.toUpperCase()}`} ويجب تغيير كلمة المرور عند أول تسجيل دخول.`
                      : `User (${inviteResult.email || inviteResult.phone}) created with role (${iamRoleLabel(inviteResult.role, false)}). ${inviteResult.channel === 'manual' ? 'No message was sent; hand over the temporary password manually' : `Temporary credentials were sent by ${inviteResult.channel.toUpperCase()}`}; a password change is required on first login.`}
                  </p>
                  {inviteResult.temporaryPassword && (
                    <div role="status" className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <p className="text-[11px] font-black">{isAr ? 'كلمة المرور المؤقتة — تظهر مرة واحدة فقط. انسخها الآن وسلّمها للمستخدم بشكل آمن.' : 'Temporary password — shown once only. Copy it now and hand it over securely.'}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code dir="ltr" className="flex-1 select-all break-all rounded-lg bg-white px-3 py-2 font-mono text-sm font-black text-slate-900 dark:bg-slate-900 dark:text-slate-100">{inviteResult.temporaryPassword}</code>
                        <button type="button" onClick={() => { void navigator.clipboard?.writeText(inviteResult.temporaryPassword || ''); }} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">{isAr ? 'نسخ' : 'Copy'}</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end"><button type="button" onClick={() => { setIsInviteModalOpen(false); setInviteResult(null); }} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800">{isAr ? 'إغلاق ومتابعة' : 'Close'}</button></div>
              </div>
            ) : (
              <form onSubmit={handleInviteUser} className="space-y-4">
                <div role="alert" className="flex items-start gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <p className="text-xs font-black leading-relaxed">{isAr ? HR_REGISTRATION_WARNING_AR : HR_REGISTRATION_WARNING_EN}</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? 'قناة إرسال بيانات الدخول *' : 'Credential Delivery Channel *'}</label>
                  <select value={inviteChannel} onChange={(event) => setInviteChannel(event.target.value as 'email' | 'sms' | 'manual')} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="manual">{isAr ? 'يدوي / نسخ كلمة المرور' : 'Manual / Copy Password'}</option>
                  </select>
                </div>
                {inviteChannel !== 'sms' && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? 'البريد الإلكتروني للمدعو *' : 'Invitee Email Address *'}</label>
                    <input type="email" required={inviteChannel === 'email'} placeholder="name@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                )}
                {inviteChannel !== 'email' && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? 'رقم الهاتف المحمول *' : 'Mobile Phone Number *'}</label>
                    <input type="tel" inputMode="tel" required={inviteChannel === 'sms'} placeholder="+966 5X XXX XXXX (or 05X XXX XXXX)" value={invitePhone} onChange={(event) => setInvitePhone(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" />
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{isAr ? 'استخدم تنسيق E.164؛ يقبل رقم السعودية المحلي 05 ويحوّله تلقائياً إلى +966.' : 'Use E.164 format; Saudi local 05 numbers are accepted and normalized to +966.'}</p>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? 'الاسم الكامل (اختياري)' : 'Full Name (Optional)'}</label>
                  <input type="text" placeholder={isAr ? 'مثال: أحمد محمد' : 'e.g. Ahmed Mohamed'} value={inviteFullName} onChange={(event) => setInviteFullName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? 'الدور ومستوى الصلاحيات (RBAC Role) *' : 'Assigned Role & Permissions *'}</label>
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                    {iamRoles.externalRoles.map((role) => <option key={role} value={role}>{role === 'Guest' ? (isAr ? 'Guest - ضيف (قراءة فقط)' : 'Guest - Read-only access') : role === 'External_Auditor' ? (isAr ? 'External Auditor - مدقق خارجي (قراءة فقط، نطاق التدقيق)' : 'External Auditor - Read-only, audit scope') : iamRoleLabel(role, isAr)}</option>)}
                  </select>
                </div>
                {inviteError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{inviteError}</p>}
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button type="button" onClick={() => setIsInviteModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800">{isAr ? 'إلغاء' : 'Cancel'}</button>
                  <button type="submit" disabled={inviteLoading} className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                    {inviteLoading ? (isAr ? 'جارِ الإرسال...' : 'Inviting...') : <><UserPlus className="h-4 w-4" /><span>{isAr ? 'دعوة الهوية الخارجية' : 'Invite External User'}</span></>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {passwordResetUser && (
        <PasswordResetModal
          user={passwordResetUser}
          isOpen
          isArabic={isAr}
          isBusy={iamBusyId === passwordResetUser.id}
          onClose={() => setPasswordResetUser(null)}
          onConfirm={runPasswordReset}
        />
      )}

      {lifecycleAction && (
        <UserLifecycleModal
          user={lifecycleAction.user}
          action={lifecycleAction.action}
          isOpen
          isArabic={isAr}
          isBusy={iamBusyId === lifecycleAction.user.id}
          onClose={() => setLifecycleAction(null)}
          onConfirm={runLifecycleAction}
        />
      )}

      {selectedUser && (
        <EntityCRUDModal
          isOpen
          onClose={() => setSelectedUser(null)}
          entityType="user"
          initialData={selectedUser}
        />
      )}
    </div>
  );
};

export default MasterDataView;
