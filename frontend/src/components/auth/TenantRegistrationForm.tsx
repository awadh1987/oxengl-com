import React, { useState } from 'react';
import { Building2, Check, CheckCircle2, CreditCard, Loader2, Lock, Mail, Phone, ShieldCheck, User, X, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface TenantRegistrationFormProps {
  onSuccess?: (tenantSlug: string) => void;
  onCancel?: () => void;
}

export const TenantRegistrationForm: React.FC<TenantRegistrationFormProps> = ({
  onSuccess,
  onCancel,
}) => {
  const { language, registerTenantAccount } = useApp();
  const isAr = language === 'ar';

  const [form, setForm] = useState({
    companyName: '',
    slug: '',
    crNumber: '',
    vatNumber: '',
    adminName: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Auto-generate slug from English characters
  const handleNameChange = (name: string) => {
    const autoSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setForm((prev) => ({
      ...prev,
      companyName: name,
      slug: prev.slug === '' || prev.slug === autoSlug.slice(0, prev.slug.length) ? autoSlug : prev.slug,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!form.companyName.trim()) {
      setError(isAr ? 'يرجى إدخال اسم المنشأة' : 'Company name is required');
      return;
    }
    const cleanSlug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSlug || cleanSlug.length < 3) {
      setError(isAr ? 'يجب أن يتكون رمز المنشأة من 3 أحرف إنجليزية على الأقل' : 'Tenant slug must be at least 3 alphanumeric characters');
      return;
    }
    if (form.crNumber && !/^\d{10}$/.test(form.crNumber.trim())) {
      setError(isAr ? 'رقم السجل التجاري يجب أن يتكون من 10 أرقام' : 'Commercial Registration (CR) must be exactly 10 digits');
      return;
    }
    if (form.vatNumber && !/^\d{15}$/.test(form.vatNumber.trim())) {
      setError(isAr ? 'الرقم الضريبي يجب أن يتكون من 15 رقماً' : 'VAT / Tax ID must be exactly 15 digits');
      return;
    }
    if (!form.adminEmail.trim()) {
      setError(isAr ? 'يرجى إدخال البريد الإلكتروني للمدير' : 'Admin email is required');
      return;
    }
    if (!form.adminPhone.trim()) {
      setError(isAr ? 'يرجى إدخال رقم جوال المدير' : 'Admin phone number is required');
      return;
    }
    if (form.adminPassword.length < 10) {
      setError(isAr ? 'كلمة المرور يجب أن لا تقل عن 10 خانات' : 'Password must be at least 10 characters');
      return;
    }
    if (!/[A-Z]/.test(form.adminPassword) || !/[a-z]/.test(form.adminPassword) || !/[0-9]/.test(form.adminPassword)) {
      setError(isAr ? 'كلمة المرور يجب أن تحتوي على حرف كبير، حرف صغير ورقم واحد على الأقل' : 'Password must contain uppercase, lowercase, and a number');
      return;
    }
    if (form.adminPassword !== form.confirmPassword) {
      setError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await registerTenantAccount({
        company_name: form.companyName.trim(),
        owner_full_name: form.adminName.trim() || form.companyName.trim(),
        email: form.adminEmail.trim().toLowerCase(),
        mobile_number: form.adminPhone.trim(),
        password: form.adminPassword,
        tenant_slug: cleanSlug,
        commercial_registration: form.crNumber.trim() || undefined,
        tax_id: form.vatNumber.trim() || undefined,
      });

      setIsSuccess(true);
      window.setTimeout(() => {
        onSuccess?.(cleanSlug);
      }, 1500);
    } catch (err: any) {
      const msg = err?.message || (isAr ? 'فشل تسجيل المنشأة. يرجى مراجعة البيانات.' : 'Tenant registration failed. Please verify inputs.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="rounded-3xl border border-emerald-500/30 bg-slate-900/90 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-4 ring-emerald-500/10">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h3 className="text-2xl font-black text-white">
          {isAr ? 'تم تسجيل المنشأة وإنشاء قاعدة البيانات بنجاح!' : 'Enterprise Tenant Provisioned Successfully!'}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {isAr
            ? `تم تخصيص قاعدة البيانات المعزولة الخاصة بالمنشأة بنجاح (${form.slug}). جاري نقلك إلى شاشة تسجيل الدخول...`
            : `Dedicated isolated database has been provisioned (${form.slug}). Redirecting to workspace sign-in...`}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-2 text-xs font-mono font-bold text-emerald-300">
          <ShieldCheck className="h-4 w-4" />
          <span>PostgreSQL Isolated Schema Active</span>
        </div>
      </div>
    );
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="w-full max-w-2xl mx-auto rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-3 py-1 text-[11px] font-black text-indigo-300">
            <Building2 className="h-3.5 w-3.5" />
            <span>{isAr ? 'تسجيل منشأة جديدة في السحابة' : 'New Enterprise Onboarding'}</span>
          </div>
          <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
            {isAr ? 'إنشاء حساب منشأة وقاعدة بيانات معزولة' : 'Register New Tenant Organization'}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {isAr
              ? 'إنشاء فوري لقاعدة بيانات مخصصة معزولة بالكامل وفق نظام Database-per-Tenant'
              : 'Instant multi-tenant provisioning with strict database-per-tenant isolation'}
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Company Name */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-300">
              {isAr ? 'اسم المنشأة / الشركة' : 'Company / Enterprise Name'} <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.companyName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={isAr ? 'شركة ميون للمقاولات اللوجستية' : 'Meayon Logistics & Contracting'}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>

          {/* Tenant Slug */}
          <div className="sm:col-span-2">
            <label className="mb-1 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>{isAr ? 'معرّف مساحة العمل (Tenant Slug)' : 'Workspace URL Slug'} <span className="text-rose-400">*</span></span>
              <span className="font-mono text-[10px] text-indigo-400">lowercase-hyphens-only</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder={isAr ? 'meayon-logistics' : 'meayon-logistics'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-xs text-indigo-300 placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
          </div>

          {/* CR Number */}
          <div>
            <label className="mb-1 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>{isAr ? 'رقم السجل التجاري (CR)' : 'Commercial Reg. (10 digits)'}</span>
              <span className="font-mono text-[10px] text-slate-500">10 digits</span>
            </label>
            <input
              type="text"
              maxLength={10}
              value={form.crNumber}
              onChange={(e) => setForm({ ...form, crNumber: e.target.value.replace(/\D/g, '') })}
              placeholder={isAr ? 'رقم السجل التجاري: 1010998877' : 'CR No: 1010998877'}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>

          {/* VAT Number */}
          <div>
            <label className="mb-1 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>{isAr ? 'الرقم الضريبي (VAT ID)' : 'VAT ID (15 digits)'}</span>
              <span className="font-mono text-[10px] text-slate-500">15 digits</span>
            </label>
            <input
              type="text"
              maxLength={15}
              value={form.vatNumber}
              onChange={(e) => setForm({ ...form, vatNumber: e.target.value.replace(/\D/g, '') })}
              placeholder={isAr ? 'الرقم الضريبي: 300998877600003' : 'VAT: 300998877600003'}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>

          {/* Admin Name */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              {isAr ? 'اسم المدير المسؤول' : 'Admin Full Name'} <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <User className="absolute start-3 top-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              <input
                type="text"
                required
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                placeholder={isAr ? 'سعد محمد الحربي' : 'Saad Al-Harbi'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 ps-9 pe-3 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
          </div>

          {/* Admin Phone */}
          <div>
            <label className="mb-1 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>{isAr ? 'رقم الجوال (السعودية)' : 'Admin Mobile'} <span className="text-rose-400">*</span></span>
              <span className="font-mono text-[10px] text-slate-500">05XXXXXXXX</span>
            </label>
            <div className="relative">
              <Phone className="absolute start-3 top-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              <input
                type="tel"
                required
                value={form.adminPhone}
                onChange={(e) => setForm({ ...form, adminPhone: e.target.value })}
                placeholder={isAr ? '0551234567' : '0551234567'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 ps-9 pe-3 py-2.5 font-mono text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
          </div>

          {/* Admin Email */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-300">
              {isAr ? 'البريد الإلكتروني للإدارة' : 'Admin Email Address'} <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute start-3 top-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              <input
                type="email"
                required
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                placeholder={isAr ? 'admin@company.com' : 'admin@company.com'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 ps-9 pe-3 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
          </div>

          {/* Admin Password */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              {isAr ? 'كلمة المرور' : 'Password'} <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute start-3 top-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              <input
                type="password"
                required
                minLength={10}
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                placeholder={isAr ? '••••••••••••' : '••••••••••••'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 ps-9 pe-3 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-300">
              {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'} <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute start-3 top-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              <input
                type="password"
                required
                minLength={10}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder={isAr ? '••••••••••••' : '••••••••••••'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 ps-9 pe-3 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-800">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto rounded-xl border border-slate-800 px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-600/30 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            <span>{loading ? (isAr ? 'جاري تهيئة مساحة العمل وقاعدة البيانات...' : 'Provisioning Tenant Database...') : (isAr ? 'تسجيل المنشأة وتفعيل النظام' : 'Register & Provision Organization')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
