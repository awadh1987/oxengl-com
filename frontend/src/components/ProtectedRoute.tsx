import React from 'react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import {
  ShieldAlert,
  Clock,
  LogOut,
  Mail,
  Phone,
  CheckCircle2,
  RefreshCw,
  Lock,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  isLoggedIn?: boolean;
  onRequireLogin?: () => void;
  onNavigateHome?: () => void;
  tier?: 'master' | 'tenant';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  isLoggedIn,
  onRequireLogin,
  onNavigateHome,
  tier,
}) => {
  const { currentUser, language, brandConfig, users, setCurrentUser, authTier, isAuthReady } = useApp();
  const isAr = language === 'ar';

  // Safeguard: Wait for user auth context initialization
  if (!isAuthReady) {
    return (
      <div className="flex min-h-[50vh] w-full flex-col items-center justify-center p-8 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent mb-3" />
        <p className="text-xs font-bold text-slate-500">
          {isAr ? 'جاري التحقق من الجلسة والصلاحيات...' : 'Initializing security context...'}
        </p>
      </div>
    );
  }

  const authenticated = isLoggedIn !== undefined ? isLoggedIn : Boolean(
    localStorage.getItem('oxengl_session_active') === 'true' ||
    localStorage.getItem('oxengl_auth_jwt') ||
    localStorage.getItem('token') ||
    localStorage.getItem('access_token')
  );

  const handleRequireLogin = onRequireLogin || (() => {
    if (typeof window !== 'undefined') {
      window.location.href = tier === 'master' ? '/admin' : '/login';
    }
  });

  // 1. Check Authentication Status
  if (!authenticated || !currentUser) {
    return (
      <div
        id="protected-route-unauthenticated"
        className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-200">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-black text-neutral-900 dark:text-white">
          {isAr ? 'جلسة العمل غير نشطة' : 'Authentication Required'}
        </h2>
        <p className="mt-2 max-w-md text-xs text-neutral-600 dark:text-neutral-400">
          {isAr
            ? 'يرجى تسجيل الدخول بحساب معتمد للوصول إلى بيانات المنظومة التشغيلية.'
            : 'Please sign in with verified credentials to access the ERP platform.'}
        </p>
        <button
          onClick={handleRequireLogin}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-700 hover:to-orange-600 transition-all"
        >
          <span>{isAr ? 'الانتقال إلى بوابة الدخول' : 'Go to Login Portal'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // 1.5. Two-Tier Plane Isolation Guard
  const effectiveTier = authTier || (currentUser?.role === 'Super_Admin' ? 'master' : 'tenant');
  if (tier && effectiveTier && effectiveTier !== tier) {
    const isMasterViolation = tier === 'master' && effectiveTier === 'tenant';
    return (
      <div
        id="cross-plane-isolation-violation"
        dir={isAr ? 'rtl' : 'ltr'}
        className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/30">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-400 border border-rose-500/20">
          <Lock className="h-3 w-3" />
          <span>{isAr ? 'انتهاك حاجز العزل الثنائي (Cross-Plane Isolation)' : 'Two-Tier Plane Isolation Violation'}</span>
        </div>
        <h2 className="mt-3 text-xl font-black text-neutral-900 dark:text-white">
          {isMasterViolation
            ? (isAr ? 'غير مصرح بالوصول إلى لوحة التحكم الرئيسية (Master Plane)' : 'Control Plane Access Denied')
            : (isAr ? 'غير مصرح بالوصول إلى مساحة عمل المستأجر (Tenant Plane)' : 'Tenant Workspace Access Restricted')}
        </h2>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          {isMasterViolation
            ? (isAr
                ? 'أنت مسجل الدخول حالياً برمز وصول مستأجر (Tenant Token). يمنع نظام الأمان الصارم وصول حسابات المستأجرين إلى لوحة تحكم المنصة المركزية.'
                : 'You are currently authenticated with a Tenant Token. Platform security strictly forbids tenant sessions from escalating into the Control Plane.')
            : (isAr
                ? 'أنت مسجل الدخول برمز تحكم رئيسي (Master Token). تتطلب وحدات ERP الميدانية للمستأجر جلسة عمل مخصصة بقاعدة بيانات المنشأة.'
                : 'You are authenticated with a Master token. Access to tenant ERP modules requires an authenticated tenant token to preserve database isolation.')}
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">
          <span className="font-semibold">{isAr ? 'الطبقة المطلوبة:' : 'Required Tier:'}</span>
          <span className="font-mono font-black uppercase text-orange-500">{tier}</span>
          <span className="text-neutral-400">|</span>
          <span className="font-semibold">{isAr ? 'طبقتك الحالية:' : 'Current Tier:'}</span>
          <span className="font-mono font-black uppercase text-rose-500">{authTier}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 dark:bg-neutral-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 dark:hover:bg-neutral-700 transition-all"
            >
              <span>{isAr ? 'العودة إلى لوحتي المصرح بها' : 'Return to Accessible View'}</span>
            </button>
          )}
          <button
            onClick={handleRequireLogin}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-700 hover:to-amber-700 transition-all"
          >
            <LogOut className="h-4 w-4" />
            <span>{isAr ? 'التبديل إلى الحساب المطلوب' : 'Sign in to Required Tier'}</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Check Pending Approval Status
  if (currentUser.status === 'Pending') {
    return (
      <div
        id="pending-approval-view"
        dir={isAr ? 'rtl' : 'ltr'}
        className="flex min-h-[80vh] flex-col items-center justify-center p-4 sm:p-8"
      >
        <div className="w-full max-w-lg rounded-3xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-xl shadow-neutral-900/5 text-center">
          {/* Brand & Badge */}
          <div className="mb-6 flex justify-center">
            <BrandLogo size="lg" horizontal={false} />
          </div>

          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-4 ring-amber-50">
            <Clock className="h-8 w-8 animate-pulse" />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-3 py-1 text-xs font-bold text-amber-800">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
            <span>{isAr ? 'طلب الحساب قيد المراجعة والاعتماد' : 'Account Pending Executive Approval'}</span>
          </div>

          <h2 className="mt-4 text-xl font-black text-neutral-900 sm:text-2xl">
            {isAr ? 'مرحباً بك' : 'Welcome'}, {currentUser.fullNameAr || currentUser.fullName}
          </h2>

          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            {isAr
              ? 'تم استلام طلب تسجيل حسابك بنجاح على بوابة ميون مقاولات ولوجستيات. الحساب حالياً في قائمة الانتظار للمراجعة والتدقيق من قِبل الإدارة التنفيذية (CEO / COO).'
              : 'Your registration request has been submitted. Your account is currently in the queue awaiting security review and role assignment by executive administration.'}
          </p>

          {/* Account Details Box */}
          <div className="mt-6 rounded-2xl bg-neutral-50 p-4 text-right border border-neutral-200/80 text-xs space-y-2">
            <div className="flex justify-between items-center text-neutral-600">
              <span className="font-bold">{isAr ? 'البريد الإلكتروني:' : 'Email:'}</span>
              <span className="font-mono text-neutral-900 font-semibold">{currentUser?.email ?? ''}</span>
            </div>
            <div className="flex justify-between items-center text-neutral-600">
              <span className="font-bold">{isAr ? 'الصلاحية المطلوبة:' : 'Requested Role:'}</span>
              <span className="font-semibold text-orange-600">{currentUser?.role ?? 'Guest'}</span>
            </div>
            <div className="flex justify-between items-center text-neutral-600">
              <span className="font-bold">{isAr ? 'حالة الحساب:' : 'Account Status:'}</span>
              <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                <Clock className="h-3.5 w-3.5" />
                {isAr ? 'قيد التدقيق (Pending)' : 'Pending Review'}
              </span>
            </div>
          </div>

          {/* Quick Support Contact */}
          <div className="mt-6 border-t border-neutral-100 pt-4 text-xs text-neutral-500 space-y-1">
            <p className="font-bold text-neutral-700">
              {isAr ? 'للتنسيق العاجل أو الاستفسار عن التفعيل:' : 'For urgent activation inquiry:'}
            </p>
            <p className="font-mono text-neutral-600 flex items-center justify-center gap-2">
              <Mail className="h-3.5 w-3.5 text-orange-500" />
              <span>support@oxengl.me</span>
              <span className="text-neutral-300">|</span>
              <Phone className="h-3.5 w-3.5 text-orange-500" />
              <span dir="ltr">+966 11 482 9900</span>
            </p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-all shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{isAr ? 'تحديث حالة الاعتماد' : 'Refresh Status'}</span>
            </button>

            <button
              onClick={handleRequireLogin}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition-all shadow-xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{isAr ? 'تسجيل الخروج والتبديل' : 'Sign Out / Switch'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Check Suspended Status
  if (currentUser?.status === 'Suspended') {
    return (
      <div
        id="suspended-account-view"
        dir={isAr ? 'rtl' : 'ltr'}
        className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-black text-neutral-900">
          {isAr ? 'تم إيقاف هذا الحساب مؤقتاً' : 'Account Temporarily Suspended'}
        </h2>
        <p className="mt-2 max-w-md text-xs text-neutral-600">
          {isAr
            ? 'تم تعليق الوصول إلى هذا الحساب بناءً على سياسات التدقيق والأمان. يرجى مراجعة إدارة تقنية المعلومات.'
            : 'Access for this user has been suspended. Please contact ERP Administration.'}
        </p>
        <button
          onClick={handleRequireLogin}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 transition-all"
        >
          <LogOut className="h-4 w-4" />
          <span>{isAr ? 'العودة لتسجيل الدخول' : 'Back to Login'}</span>
        </button>
      </div>
    );
  }

  // 4. Role-Based Access Control (RBAC) Guard
  const activeUserRole: UserRole = currentUser?.role ?? 'Guest';
  const isAuthorizedRole =
    allowedRoles?.includes(activeUserRole) ||
    activeUserRole === 'Super_Admin' ||
    (activeUserRole === 'Owner' && (allowedRoles?.includes('Admin') || allowedRoles?.includes('Owner') || allowedRoles?.includes('COO')));

  if (allowedRoles && allowedRoles.length > 0 && !isAuthorizedRole) {
    return (
      <div
        id="unauthorized-rbac-view"
        dir={isAr ? 'rtl' : 'ltr'}
        className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-200">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-black text-neutral-900">
          {isAr ? 'غير مصرح بالوصول إلى هذا القسم' : 'Access Restricted by Role'}
        </h2>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-neutral-600">
          {isAr
            ? `صلاحية حسابك الحالية (${activeUserRole}) لا تخولك لعرض هذا القسم الإداري أو تعديل بياناته وفق مصفوفة الأمان التشغيلية.`
            : `Your current assigned role (${activeUserRole}) does not have permission to view this section according to company security matrix.`}
        </p>

        <div className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600">
          <ShieldCheck className="h-4 w-4 text-orange-600" />
          <span>
            {isAr ? 'الصلاحيات المسموح لها:' : 'Authorized Roles:'}{' '}
            <strong className="font-mono text-neutral-900 font-bold">{allowedRoles.join(', ')}</strong>
          </span>
        </div>

        {onNavigateHome && (
          <div className="mt-6">
            <button
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-700 hover:to-orange-600 transition-all"
            >
              <span>{isAr ? 'العودة إلى لوحة العمليات المسموحة' : 'Return to Accessible Dashboard'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // 5. Authorized Access - Render Protected Component
  return <>{children}</>;
};
