import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Building2,
  Check,
  CheckCircle,
  ChevronRight,
  Edit2,
  Eye,
  EyeOff,
  Filter,
  Globe,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
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
  TENANT_INVITE_ROLES,
  iamRoleLabel,
} from '../constants/iamRoles';

interface PlatformAdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  iam_role?: string | null;
  is_superuser: boolean;
  is_active: boolean;
  company_id?: string | null;
  company_name?: string | null;
  assigned_tenants: Array<{ tenant_id: string; tenant_name?: string | null; role: string }>;
  created_at: string;
}

interface CompanyOption {
  id: string;
  name: string;
  slug?: string;
}

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
  if (role === 'Super_Admin') return isAr ? 'صلاحيات تنفيذية كاملة عبر المنظومة' : 'Full executive authority across the platform';
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
  const { users, refreshUsers, currentUser, language, authTier, currentCompany } = useApp();
  const isAr = language === 'ar';
  const iamRoles = useIamRoles();

  // Access context resolution
  const isPlatformSuperAdmin = authTier === 'master' || currentUser?.role === 'Super_Admin';
  const currentRoles = [currentUser?.role, currentUser?.iamRole].map((role) =>
    String(role || '').trim().toLowerCase(),
  );
  const isAdminOrOwner = currentRoles.some((role) => ['owner', 'admin'].includes(role));
  const canManageIam = isPlatformSuperAdmin || isAdminOrOwner || currentRoles.some((role) => {
    return ['super_admin', 'ceo'].includes(role) ||
      PRIVILEGED_IAM_ROLES.some((privilegedRole) => privilegedRole.toLowerCase() === role);
  });

  // Active view mode for Platform Super Admin
  const [activeAdminMode, setActiveAdminMode] = useState<'platform' | 'tenant'>(() =>
    isPlatformSuperAdmin ? 'platform' : 'tenant'
  );

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Platform admin user state
  const [platformUsers, setPlatformUsers] = useState<PlatformAdminUser[]>([]);
  const [availableCompanies, setAvailableCompanies] = useState<CompanyOption[]>([]);
  const [isLoadingPlatformUsers, setIsLoadingPlatformUsers] = useState(false);

  // Create User Slide-out state
  const [isCreateSlideoutOpen, setIsCreateSlideoutOpen] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createRole, setCreateRole] = useState('Admin');
  const [createSelectedTenants, setCreateSelectedTenants] = useState<string[]>([]);
  const [createPrimaryTenant, setCreatePrimaryTenant] = useState<string>('');
  const [createIsSuperuser, setCreateIsSuperuser] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Modals & Action State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteChannel, setInviteChannel] = useState<'email' | 'sms' | 'manual'>('email');
  const [inviteRole, setInviteRole] = useState<string>('Member');
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

  // Load platform users and available companies
  const fetchPlatformData = async () => {
    if (!isPlatformSuperAdmin) return;
    setIsLoadingPlatformUsers(true);
    try {
      const [adminUsersData, companiesData] = await Promise.all([
        erpApi.getAdminUsers(),
        erpApi.getCompanies().catch(() => []),
      ]);
      setPlatformUsers(adminUsersData);
      setAvailableCompanies(
        companiesData.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        }))
      );
    } catch (err) {
      console.error('Failed to load platform users:', err);
    } finally {
      setIsLoadingPlatformUsers(false);
    }
  };

  useEffect(() => {
    refreshUsers();
    if (isPlatformSuperAdmin) {
      fetchPlatformData();
    }
  }, [isPlatformSuperAdmin]);

  // Filtered active users for Tenant mode
  const activeTenantUsers = useMemo(() => {
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

  // Filtered users for Platform Admin mode
  const activePlatformUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return platformUsers.filter((u) => {
      if (query && ![
        u.full_name,
        u.email,
        u.role,
        u.company_name,
        ...u.assigned_tenants.map((t) => t.tenant_name || ''),
      ].some((val) => String(val || '').toLowerCase().includes(query))) {
        return false;
      }
      return quickFilter === 'all' || (u.iam_role || u.role) === quickFilter;
    });
  }, [platformUsers, searchQuery, quickFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshUsers(),
        isPlatformSuperAdmin ? fetchPlatformData() : Promise.resolve(),
      ]);
    } catch (error) {
      console.error('Could not refresh users:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Open Create User slide-out with role defaults
  const openCreateSlideout = () => {
    setCreateError(null);
    setCreateFullName('');
    setCreateEmail('');
    setCreatePassword('');
    setShowPassword(false);
    if (isPlatformSuperAdmin && activeAdminMode === 'platform') {
      setCreateRole('Admin');
      setCreateSelectedTenants(currentCompany?.id ? [currentCompany.id] : []);
      setCreatePrimaryTenant(currentCompany?.id || '');
      setCreateIsSuperuser(false);
    } else {
      setCreateRole('Member');
      setCreateSelectedTenants([]);
      setCreatePrimaryTenant('');
      setCreateIsSuperuser(false);
    }
    setIsCreateSlideoutOpen(true);
  };

  // Submit Create User
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!createEmail.trim() || !createFullName.trim() || !createPassword.trim()) {
      setCreateError(isAr ? 'يرجى تعبئة كافة الحقول المطلوبة.' : 'Please fill all required fields.');
      return;
    }
    if (createPassword.length < 6) {
      setCreateError(isAr ? 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.' : 'Password must be at least 6 characters.');
      return;
    }

    setIsCreatingUser(true);
    try {
      if (isPlatformSuperAdmin && activeAdminMode === 'platform') {
        await erpApi.createAdminUser({
          email: createEmail.trim(),
          full_name: createFullName.trim(),
          password: createPassword,
          role: createRole,
          company_id: createPrimaryTenant || undefined,
          tenant_ids: createSelectedTenants,
          is_superuser: createIsSuperuser || createRole === 'Super_Admin',
        });
        setIamNotice(
          isAr
            ? `تم إنشاء المستخدم العام (${createEmail}) وتعيينه للمستأجرين المحددين بنجاح!`
            : `Platform user (${createEmail}) created and assigned to selected tenants successfully!`
        );
        await fetchPlatformData();
      } else {
        await erpApi.createTenantUserScoped({
          email: createEmail.trim(),
          full_name: createFullName.trim(),
          password: createPassword,
          role: createRole,
        });
        setIamNotice(
          isAr
            ? `تم إنشاء مستخدم مساحة العمل (${createEmail}) بنجاح!`
            : `Workspace user (${createEmail}) created successfully!`
        );
        await refreshUsers();
      }

      setIsCreateSlideoutOpen(false);
      setTimeout(() => setIamNotice(null), 6000);
    } catch (err: unknown) {
      console.error('Create user error:', err);
      const msg = err instanceof Error ? err.message : (isAr ? 'فشلت عملية إنشاء المستخدم' : 'Failed to create user');
      setCreateError(msg);
    } finally {
      setIsCreatingUser(false);
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

  const isPlatformView = isPlatformSuperAdmin && activeAdminMode === 'platform';

  return (
    <div id="master-data-view" className="mx-auto w-full max-w-7xl space-y-4 px-3 sm:px-4 md:px-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Top Banner / Breadcrumb & Header */}
      <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            {isPlatformView ? (
              <Globe className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            )}
            <h1 className="text-base font-black text-slate-900 dark:text-white">
              {isPlatformView
                ? (isAr ? 'إدارة المنصة: مصفوفة المستخدمين المركزية' : 'Platform Administration: Global User Matrix')
                : (isAr ? 'مصفوفة المستخدمين والأدوار لمساحة العمل' : 'Workspace Users & Permissions Matrix')}
            </h1>
            {isPlatformSuperAdmin && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                Super Admin
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isPlatformView
              ? (isAr ? 'إدارة المستخدمين عبر كافة المنشآت المستأجرة وتعيين الصلاحيات المركزية.' : 'Manage users across all tenant workspaces and configure centralized assignments.')
              : (isAr ? 'إدارة مستخدمي مساحة العمل الحالية وضوابط الوصول المعزولة.' : 'Manage current workspace members and isolated tenant access controls.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Platform Admin View Mode Switcher */}
          {isPlatformSuperAdmin && (
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setActiveAdminMode('platform')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeAdminMode === 'platform'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {isAr ? 'نطاق المنصة العامة' : 'Platform Wide'}
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminMode('tenant')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeAdminMode === 'tenant'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {isAr ? 'نطاق المستأجر الحالي' : 'Tenant Workspace'}
              </button>
            </div>
          )}

          {/* Create User Primary Button */}
          <button
            type="button"
            onClick={openCreateSlideout}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-orange-700"
          >
            <UserPlus className="h-4 w-4" />
            <span>{isAr ? 'إنشاء مستخدم جديد' : 'Create User'}</span>
          </button>

          {/* Invite User Button (Tenant Context) */}
          {!isPlatformView && (
            <button
              type="button"
              onClick={() => {
                setInviteResult(null);
                setInviteError(null);
                setInviteRole('Member');
                setInviteChannel('email');
                setIsInviteModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5 text-purple-600" />
              <span>{isAr ? 'دعوة مستخدم' : 'Invite User'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Global Notice Banner */}
      {iamNotice && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>{iamNotice}</span>
          </div>
          <button type="button" onClick={() => setIamNotice(null)} className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters & Search Control Bar */}
      <section className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-md flex-1">
            <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={isPlatformView ? (isAr ? 'بحث بالاسم، البريد، أو المستأجر...' : 'Search name, email, or tenant...') : (isAr ? 'بحث بالاسم أو البريد أو الهاتف...' : 'Search name, email, or phone...')}
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
              {(isPlatformView
                ? [...iamRoles.roles, ...iamRoles.externalRoles.filter((role) => !iamRoles.roles.includes(role))]
                : [...iamRoles.roles, ...iamRoles.externalRoles.filter((role) => !iamRoles.roles.includes(role))].filter((role) => !['Super_Admin', 'super_admin'].includes(role))
              ).map((role) => (
                <option key={role} value={role}>{iamRoleLabel(role, isAr)}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing || isLoadingPlatformUsers}
          title={isAr ? 'تحديث البيانات' : 'Refresh Data'}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${isRefreshing || isLoadingPlatformUsers ? 'animate-spin' : ''}`} />
          <span>{isAr ? (isRefreshing ? 'جارِ التحديث...' : 'تحديث') : (isRefreshing ? 'Refreshing...' : 'Refresh')}</span>
        </button>
      </section>

      {/* Main Standard User Panel (Table) */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users className={`h-4 w-4 ${isPlatformView ? 'text-indigo-500' : 'text-purple-500'}`} />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isPlatformView
                ? (isAr ? 'سجل المستخدمين المركزي' : 'Global Users Directory')
                : (isAr ? 'مستخدمو مساحة العمل المعتمدون' : 'Active Workspace Users')}
            </h2>
          </div>
          <span className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
            {isPlatformView ? activePlatformUsers.length : activeTenantUsers.length} {isAr ? 'مستخدمين' : 'Users'}
          </span>
        </div>

        {!canManageIam && !isPlatformSuperAdmin && (
          <p className="mx-3 mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {isAr ? 'إجراءات الوصول متاحة لمدراء مساحة العمل فقط.' : 'Access actions are available to workspace administrators only.'}
          </p>
        )}

        {/* Data Table */}
        <div className="responsive-table-wrapper overflow-x-auto p-2">
          {isPlatformView ? (
            /* Platform Admin Table */
            <table className="neo-grid-table w-full text-start">
              <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="text-start">{isAr ? 'الاسم' : 'Name'}</th>
                  <th className="text-start">{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                  <th className="text-start">{isAr ? 'الدور العام' : 'Global Role'}</th>
                  <th className="text-start">{isAr ? 'المستأجرون المعينون' : 'Assigned Tenants'}</th>
                  <th className="text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="text-center">{isAr ? 'الصلاحيات' : 'Authority'}</th>
                </tr>
              </thead>
              <tbody>
                {activePlatformUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                      {isAr ? 'لا يوجد مستخدمون مطابقون في قاعدة البيانات.' : 'No users found matching query.'}
                    </td>
                  </tr>
                ) : (
                  activePlatformUsers.map((u) => {
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="font-bold text-slate-900 dark:text-slate-100">
                          {u.full_name}
                          {u.is_superuser && (
                            <span className="ms-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              SUPERUSER
                            </span>
                          )}
                        </td>
                        <td className="font-mono text-xs text-slate-600 dark:text-slate-300">{u.email}</td>
                        <td>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${iamRoleBadgeClass(u.role)}`}>
                            {iamRoleLabel(u.role, isAr)}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1">
                            {u.assigned_tenants && u.assigned_tenants.length > 0 ? (
                              u.assigned_tenants.map((t) => (
                                <span
                                  key={t.tenant_id}
                                  className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                                >
                                  <Building2 className="h-3 w-3 shrink-0" />
                                  <span>{t.tenant_name || t.tenant_id.slice(0, 8)}</span>
                                </span>
                              ))
                            ) : u.company_name ? (
                              <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <Building2 className="h-3 w-3 shrink-0" />
                                <span>{u.company_name}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">{isAr ? 'منظومة عامة (غير مقيد)' : 'Global Unbound'}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            u.is_active
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                              : 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400'
                          }`}>
                            {u.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معلق' : 'Inactive')}
                          </span>
                        </td>
                        <td className="text-center text-xs text-slate-500 dark:text-slate-400">
                          {u.is_superuser ? (isAr ? 'وصول شامل' : 'Root Access') : (isAr ? 'مستأجر مقيد' : 'Tenant Scoped')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* Tenant Standard User Table */
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
                {activeTenantUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                      {isAr ? 'لا يوجد مستخدمون مطابقون للبحث أو التصفية.' : 'No users match the active query.'}
                    </td>
                  </tr>
                ) : (
                  activeTenantUsers.map((user) => {
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
                          {user.phone || user.email}
                          <span className="ms-1 text-[10px] text-slate-400">(@{user.username})</span>
                        </td>
                        <td>
                          <span className={`rounded px-1.5 py-1 text-[10px] font-bold ${iamRoleBadgeClass(role)}`} title={role}>
                            {iamRoleLabel(role, isAr)}
                          </span>
                          {isSuspended && (
                            <span className="ms-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-1 text-[10px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400">
                              {isAr ? 'معلّق' : 'Suspended'}
                            </span>
                          )}
                          {user.mustChangePassword && !isSuspended && (
                            <span className="ms-1 rounded border border-orange-300 bg-orange-50 px-1.5 py-1 text-[10px] font-bold text-orange-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400">
                              {isAr ? 'بانتظار القبول' : 'Pending Acceptance'}
                            </span>
                          )}
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
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPasswordResetUser(user)}
                              disabled={actionsDisabled}
                              className="neo-action-btn disabled:cursor-not-allowed disabled:opacity-40"
                              title={!canManageIam ? (isAr ? 'للمدراء فقط' : 'Administrators only') : (isAr ? 'فرض إعادة تعيين كلمة المرور' : 'Force Password Reset')}
                              aria-label={isAr ? 'فرض إعادة تعيين كلمة المرور' : 'Force Password Reset'}
                            >
                              {isBusy && passwordResetUser?.id === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setLifecycleAction({ user, action: isSuspended ? 'reactivate' : 'suspend' })}
                              disabled={actionsDisabled || isSelf}
                              className="neo-action-btn neo-btn-delete disabled:cursor-not-allowed disabled:opacity-40"
                              title={!canManageIam ? (isAr ? 'للمدراء فقط' : 'Administrators only') : isSuspended ? (isAr ? 'إعادة تفعيل الحساب' : 'Reactivate Account') : (isAr ? 'تعليق الحساب' : 'Suspend Account')}
                              aria-label={isSuspended ? (isAr ? 'إعادة تفعيل الحساب' : 'Reactivate Account') : (isAr ? 'تعليق الحساب' : 'Suspend Account')}
                            >
                              {isBusy && lifecycleAction?.user.id === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : isSuspended ? <CheckCircle className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                            </button>
                          </div>
                          {rowError && <p role="alert" className="mt-1 text-start text-[10px] font-bold text-rose-600 dark:text-rose-400">{rowError}</p>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* "Create User" Slide-out / Modal Form (Adaptive Platform vs Tenant)       */}
      {/* ========================================================================= */}
      {isCreateSlideoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity">
          <div
            className="flex h-full w-full max-w-lg flex-col border-s border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#090f1c]"
            dir={isAr ? 'rtl' : 'ltr'}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className={`rounded-xl p-2 ${isPlatformView ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400' : 'bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400'}`}>
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">
                    {isPlatformView
                      ? (isAr ? 'إنشاء مستخدم عام للنظام' : 'Create System User (Platform Admin)')
                      : (isAr ? 'إنشاء مستخدم لمساحة العمل' : 'Create Workspace User (Tenant Admin)')}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isPlatformView
                      ? (isAr ? 'إنشاء حساب وتعيينه لأحد أو عدة منشآت مستأجرة' : 'Create global account and map tenant workspace memberships')
                      : (isAr ? 'إنشاء حساب مستخدم معزول ضمن المستأجر الحالي' : 'Create isolated user strictly bound to current workspace')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateSlideoutOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={isAr ? 'إغلاق' : 'Close'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateUserSubmit} className="flex flex-1 flex-col justify-between overflow-y-auto p-5">
              <div className="space-y-4">
                {/* Warning notice if in Tenant mode */}
                {!isPlatformView && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-[11px] font-bold leading-relaxed">
                      {isAr ? HR_REGISTRATION_WARNING_AR : HR_REGISTRATION_WARNING_EN}
                    </p>
                  </div>
                )}

                {/* Error Banner */}
                {createError && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                    {createError}
                  </div>
                )}

                {/* Full Name */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'الاسم الكامل *' : 'Full Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={createFullName}
                    onChange={(e) => setCreateFullName(e.target.value)}
                    placeholder={isAr ? 'مثال: عبد الله السعيد' : 'e.g. Abdullah Al-Saeed'}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'البريد الإلكتروني *' : 'Email Address *'}
                  </label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="user@oxengl.me"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* Password with Visibility Toggle */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {isAr ? 'كلمة المرور *' : 'Password *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const random = Math.random().toString(36).slice(-8) + 'Aa1!';
                        setCreatePassword(random);
                      }}
                      className="text-[10px] font-bold text-orange-600 hover:underline dark:text-orange-400"
                    >
                      {isAr ? 'توليد كلمة سر آمنة' : 'Generate Strong'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pe-10 ps-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'يتم تشفير كلمة المرور وتأمينها تلقائياً باستخدام خوارزميات التجزئة الآمنة.' : 'Stored securely using memory-hard cryptographic hashing.'}
                  </p>
                </div>

                {/* Role Field */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isPlatformView ? (isAr ? 'الدور الوظيفي العام (Global Role) *' : 'Global Role *') : (isAr ? 'الدور الوظيفي لمساحة العمل *' : 'Tenant Role *')}
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {isPlatformView ? (
                      <>
                        <option value="Admin">Admin - مدير النظام</option>
                        <option value="Super_Admin">Super_Admin - مدير المنصة العام</option>
                        {iamRoles.roles.filter((r) => !['Admin', 'Super_Admin'].includes(r)).map((r) => (
                          <option key={r} value={r}>{iamRoleLabel(r, isAr)}</option>
                        ))}
                      </>
                    ) : (
                      <>
                        {TENANT_INVITE_ROLES.map((role) => (
                          <option key={role} value={role}>{iamRoleLabel(role, isAr)}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {/* Platform Admin specific fields: Multi-select Tenant Assignment */}
                {isPlatformView && (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-900 dark:text-white">
                        {isAr ? 'تعيين المستأجرين (Tenant Assignment)' : 'Tenant Workspace Assignments'}
                      </label>
                      <span className="text-[10px] text-slate-500">
                        {createSelectedTenants.length} {isAr ? 'محدد' : 'selected'}
                      </span>
                    </div>

                    {availableCompanies.length === 0 ? (
                      <p className="text-[11px] text-slate-400">
                        {isAr ? 'لا توجد منشآت مستأجرة متاحة حالياً.' : 'No tenant workspaces found.'}
                      </p>
                    ) : (
                      <div className="max-h-40 space-y-1.5 overflow-y-auto pe-1">
                        {availableCompanies.map((c) => {
                          const isSelected = createSelectedTenants.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setCreateSelectedTenants(createSelectedTenants.filter((id) => id !== c.id));
                                  if (createPrimaryTenant === c.id) setCreatePrimaryTenant('');
                                } else {
                                  setCreateSelectedTenants([...createSelectedTenants, c.id]);
                                  if (!createPrimaryTenant) setCreatePrimaryTenant(c.id);
                                }
                              }}
                              className={`flex w-full items-center justify-between rounded-xl border p-2 text-start text-xs transition-colors ${
                                isSelected
                                  ? 'border-indigo-300 bg-indigo-50/80 font-bold text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200'
                                  : 'border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                <span>{c.name}</span>
                                {c.slug && <span className="font-mono text-[10px] text-slate-400">({c.slug})</span>}
                              </div>
                              <div className={`flex h-4 w-4 items-center justify-center rounded-md border ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                                {isSelected && <Check className="h-3 w-3" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Primary Tenant Selection */}
                    {createSelectedTenants.length > 0 && (
                      <div className="pt-2">
                        <label className="mb-1 block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {isAr ? 'المستأجر الافتراضي / الأساسي' : 'Primary Active Tenant'}
                        </label>
                        <select
                          value={createPrimaryTenant}
                          onChange={(e) => setCreatePrimaryTenant(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">{isAr ? 'بدون مستأجر أساسي (حساب مركزي)' : 'None (Unbound Global)'}</option>
                          {createSelectedTenants.map((id) => {
                            const name = availableCompanies.find((c) => c.id === id)?.name || id;
                            return <option key={id} value={id}>{name}</option>;
                          })}
                        </select>
                      </div>
                    )}

                    {/* Superuser Flag Toggle */}
                    <label className="mt-2 flex cursor-pointer items-center gap-2 pt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={createIsSuperuser || createRole === 'Super_Admin'}
                        onChange={(e) => setCreateIsSuperuser(e.target.checked)}
                        disabled={createRole === 'Super_Admin'}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{isAr ? 'منح صلاحيات Superuser على مستوى قاعدة البيانات' : 'Grant Database-Level Superuser Privileges'}</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateSlideoutOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-orange-700 disabled:opacity-50"
                >
                  {isCreatingUser ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{isAr ? 'جارِ الحفظ...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4" />
                      <span>{isAr ? 'إنشاء وتأكيد الحساب' : 'Create & Confirm Account'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite External Identity Modal (Email / SMS Out-of-band delivery) */}
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
                <p className="text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                  {isAr ? 'اختر الدور التشغيلي للمستخدم. سيُطلب منه تعيين كلمة مرور جديدة عند أول تسجيل دخول.' : 'Select the operational role for this user. They will be prompted to set a new password upon first login.'}
                </p>
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
                    {TENANT_INVITE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {iamRoleLabel(role, isAr)}
                      </option>
                    ))}
                  </select>
                </div>
                {inviteError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{inviteError}</p>}
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button type="button" onClick={() => setIsInviteModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800">{isAr ? 'إلغاء' : 'Cancel'}</button>
                  <button type="submit" disabled={inviteLoading} className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                    {inviteLoading ? (isAr ? 'جارِ الإرسال...' : 'Inviting...') : <><UserPlus className="h-4 w-4" /><span>{isAr ? 'إرسال الدعوة' : 'Send Invitation'}</span></>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
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

      {/* Lifecycle Action Modal */}
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

      {/* Entity CRUD Modal for user edit */}
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

export const MasterDataSettings = MasterDataView;
export default MasterDataView;
