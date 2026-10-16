import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Users,
  HardDrive,
  Calendar,
  Download,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowUpRight,
  FileText,
  RefreshCw,
  Sparkles,
  Building2,
  Database,
  Globe2,
  Lock,
  Check,
  Copy,
  Receipt,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  erpApi,
  SubscriptionPlanDto,
  TenantSubscriptionDto,
  SaaSInvoiceDto,
  EnterpriseQuoteResponse,
  PublicPaymentGatewayDto,
} from '../services/api';
import { annualMonthlyEquivalent, annualSavingsPercent, formatSar, isFreePlan, VAT_RATE } from '../utils/pricing';

const SAUDI_BANK_DETAILS = {
  bankName: 'مصرف الإنماء (Alinma Bank)',
  accountName: 'شركة منصة أوكسن للخدمات اللوجستية (Oxen Logistics Platform Co.)',
  iban: 'SA4405000068201234567890',
  swift: 'INMASARI',
};

export const TenantBillingView: React.FC = () => {
  const { currentCompany, language, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const [subscription, setSubscription] = useState<TenantSubscriptionDto | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([]);
  const [invoices, setInvoices] = useState<SaaSInvoiceDto[]>([]);
  const [gateways, setGateways] = useState<PublicPaymentGatewayDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Billing Cycle Toggle
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Checkout & PO Modals
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [showPOModal, setShowPOModal] = useState(false);
  const [poForm, setPoForm] = useState({
    poNumber: '',
    taxId: (currentCompany as any)?.tax_id || currentCompany?.taxId || '',
    billingAddress: '',
    contactEmail: '',
    notes: '',
  });
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [quoteResult, setQuoteResult] = useState<EnterpriseQuoteResponse | null>(null);

  // Selected Invoice Modal
  const [selectedInvoice, setSelectedInvoice] = useState<SaaSInvoiceDto | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const activeBankDetails = React.useMemo(() => {
    const firstBank = gateways?.local_bank_instructions?.find((b) => b.is_active !== false);
    if (firstBank) {
      return {
        bankName: firstBank.bank_name || SAUDI_BANK_DETAILS.bankName,
        accountName: firstBank.account_name || SAUDI_BANK_DETAILS.accountName,
        iban: firstBank.iban || SAUDI_BANK_DETAILS.iban,
        swift: firstBank.swift || SAUDI_BANK_DETAILS.swift,
      };
    }
    return SAUDI_BANK_DETAILS;
  }, [gateways]);

  const activeWallets = React.useMemo(
    () => (gateways?.digital_wallet_instructions || []).filter((w) => w.is_active !== false),
    [gateways]
  );

  const fetchBillingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, plansRes, invRes, gwRes] = await Promise.all([
        erpApi.getTenantSubscription(currentCompany?.id).catch(() => null),
        erpApi.getSubscriptionPlans().catch(() => []),
        erpApi.getTenantInvoices(currentCompany?.id).catch(() => []),
        erpApi.getTenantBillingGateways(currentCompany?.id).catch(() => null),
      ]);

      if (subRes) setSubscription(subRes);
      if (Array.isArray(plansRes) && plansRes.length > 0) {
        setPlans(plansRes);
      }
      if (Array.isArray(invRes)) {
        setInvoices(invRes);
      }
      if (gwRes) {
        setGateways(gwRes);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load cloud billing configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, [currentCompany?.id]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleStripeCheckout = async (planName: string) => {
    setCheckoutLoading(planName);
    setError(null);
    try {
      const successUrl = `${window.location.origin}/dashboard?billing=success&plan=${planName}`;
      const cancelUrl = `${window.location.origin}/dashboard?billing=canceled`;

      const res = await erpApi.createStripeCheckout(
        {
          plan_name: planName,
          billing_cycle: billingCycle,
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        currentCompany?.id
      );

      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        throw new Error('No checkout redirection URL provided.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate card checkout session.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleEnterprisePOSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPoSubmitting(true);
    setError(null);
    try {
      const result = await erpApi.createEnterpriseQuote(
        {
          plan_name: 'ENTERPRISE',
          billing_cycle: billingCycle,
          po_number: poForm.poNumber || undefined,
          company_tax_id: poForm.taxId || undefined,
          billing_address: poForm.billingAddress || undefined,
          contact_email: poForm.contactEmail || undefined,
          notes: poForm.notes || undefined,
        },
        currentCompany?.id
      );

      setQuoteResult(result);
      setActionSuccess(
        isAr
          ? 'تم إنشاء أمر الشراء وفاتورة التحويل البنكي للمؤسسات بنجاح!'
          : 'Corporate Purchase Order invoice issued successfully with bank wire instructions!'
      );
      fetchBillingData();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate corporate PO invoice.');
    } finally {
      setPoSubmitting(false);
    }
  };

  const activePlanName = subscription?.plan?.name?.toUpperCase() || 'FREE';

  // Catalog-derived pricing (no hard-coded prices: everything comes from /api/v1/pricing/plans)
  const annualSavings = plans.reduce((max, plan) => Math.max(max, annualSavingsPercent(plan)), 0);
  const enterprisePlan = plans.find((plan) => plan.name.toUpperCase() === 'ENTERPRISE');
  const poSubtotal = enterprisePlan
    ? Number(billingCycle === 'annual' ? enterprisePlan.annual_price : enterprisePlan.monthly_price)
    : 0;
  const poVat = Math.round(poSubtotal * VAT_RATE * 100) / 100;
  const poTotal = poSubtotal + poVat;

  // Quota Calculations
  const seatsUsed = subscription?.meters?.current_seats_used ?? 1;
  const maxSeats = subscription?.meters?.max_seats ?? 2;
  const isSeatsUnlimited = maxSeats < 0;
  const seatsPercent = isSeatsUnlimited
    ? 15
    : maxSeats > 0
    ? Math.min(100, Math.round((seatsUsed / maxSeats) * 100))
    : 100;

  const vehiclesUsed = subscription?.meters?.current_vehicles_used ?? 0;
  const maxVehicles = subscription?.meters?.max_vehicles ?? 5;
  const isVehiclesUnlimited = maxVehicles < 0;
  const vehiclesPercent = isVehiclesUnlimited
    ? 20
    : maxVehicles > 0
    ? Math.min(100, Math.round((vehiclesUsed / maxVehicles) * 100))
    : 0;

  const storageUsedMb = subscription?.meters?.current_storage_mb_used ?? 50;
  const storageUsedGb = (storageUsedMb / 1024).toFixed(2);
  const maxStorageGb = subscription?.meters?.max_storage_gb ?? 5;
  const storagePercent = maxStorageGb > 0
    ? Math.min(100, Math.round(((storageUsedMb / 1024) / maxStorageGb) * 100))
    : 0;

  return (
    <div className={`space-y-6 min-h-dvh erp-viewport-root px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto ${isDark ? 'text-slate-100' : 'text-slate-900'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Platform Header Banner */}
      <div
        className={`rounded-3xl border p-6 shadow-xl relative overflow-hidden ${
          isDark
            ? 'border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900'
            : 'border-slate-200 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <CreditCard className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white">
                  {isAr ? 'الاشتراك السحابي والفوترة للمؤسسات' : 'Multi-Grade SaaS Subscription & Billing'}
                </h1>
                <span
                  className={`rounded-full px-3 py-0.5 text-xs font-black uppercase tracking-wider border ${
                    activePlanName === 'ENTERPRISE'
                      ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                      : activePlanName === 'PROFESSIONAL'
                      ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                      : 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  }`}
                >
                  Grade {activePlanName === 'ENTERPRISE' ? '3' : activePlanName === 'PROFESSIONAL' ? '2' : '1'}: {activePlanName}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                {isAr
                  ? `إدارة خطط الاشتراك، الحصص اللوجستية، والميزات المعمارية المقفلة لمستأجر: ${currentCompany?.name || 'Workspace'}`
                  : `Manage plan tiers, operational quotas, and architectural gates for tenant: ${currentCompany?.name || 'Workspace'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchBillingData}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 text-xs font-bold text-white transition-all shadow-xs"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {isAr ? 'تحديث البيانات' : 'Refresh Telemetry'}
            </button>
          </div>
        </div>
      </div>

      {/* Action Alerts */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-bold text-rose-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-bold text-emerald-400 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-300 hover:text-white">✕</button>
        </div>
      )}

      {!loading && !subscription && (
        <div
          data-testid="workspace-billing-activation-banner"
          className="rounded-2xl border border-blue-500/30 bg-slate-900/90 p-4 text-xs text-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-400 shrink-0" />
            <div>
              <p className="font-bold text-white">
                {isAr ? 'مساحة العمل جاهزة لتفعيل ملف الفوترة السحابية' : 'Workspace Billing Profile Ready for Activation'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isAr
                  ? 'تم ربط مساحة العمل بالوضع القياسي (FREE). يمكنك مزامنة حالة الاشتراك أو الترقية إلى باقة أعلى في أي وقت.'
                  : 'Your tenant workspace is operating on the standard starter profile. Sync telemetry or select a plan below to upgrade.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchBillingData}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shrink-0 transition-colors"
          >
            {isAr ? 'مزامنة ملف الفوترة' : 'Initialize Workspace Billing'}
          </button>
        </div>
      )}

      {/* Live Operational Meters & Quotas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Active Plan Card */}
        <div
          className={`rounded-2xl border p-5 transition-all ${
            isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              {isAr ? 'الخطة النشطة حالياً' : 'Active Subscription'}
            </span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-blue-500" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-black text-blue-600 dark:text-blue-400">
              {subscription?.plan?.display_name || activePlanName}
            </h3>
            <p className="mt-1 font-mono text-xl font-bold">
              <span dir="ltr" className="inline-block unicode-bidi-isolate">
                {subscription?.plan?.monthly_price !== undefined
                  ? Number(subscription.plan.monthly_price).toLocaleString('en-US')
                  : '0'}
              </span>{' '}
              <span className="text-xs font-normal text-slate-400">SAR / month</span>
            </p>
            <p className="mt-2 text-[11px] text-slate-400">
              {isAr ? 'حالة الاشتراك:' : 'Status:'}{' '}
              <span className="font-bold uppercase text-emerald-500">{subscription?.status || 'Active'}</span>
              {subscription?.current_period_end && (
                <span className="block mt-0.5 text-[10px] text-slate-500">
                  {isAr ? 'التجديد في:' : 'Renews:'} {new Date(subscription.current_period_end).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* User Seats Quota Meter */}
        <div
          className={`rounded-2xl border p-5 transition-all ${
            isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              {isAr ? 'المقاعد والمستخدمون' : 'User Seats Quota'}
            </span>
            <div className="h-8 w-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-indigo-500" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-bold">
                <span dir="ltr" className="inline-block unicode-bidi-isolate">{seatsUsed}</span>{' '}
                <span className="text-xs font-normal text-slate-400">
                  / {isSeatsUnlimited ? (isAr ? 'غير محدود (∞)' : 'Unlimited (∞)') : maxSeats}
                </span>
              </span>
              {!isSeatsUnlimited && (
                <span
                  className={`text-xs font-bold ${
                    seatsPercent >= 90 ? 'text-rose-500' : seatsPercent >= 75 ? 'text-amber-500' : 'text-slate-400'
                  }`}
                >
                  {seatsPercent}%
                </span>
              )}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isSeatsUnlimited
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500'
                    : seatsPercent >= 90
                    ? 'bg-rose-500'
                    : seatsPercent >= 75
                    ? 'bg-amber-500'
                    : 'bg-indigo-500'
                }`}
                style={{ width: `${isSeatsUnlimited ? 100 : seatsPercent}%` }}
              />
            </div>
            {seatsPercent >= 90 && !isSeatsUnlimited ? (
              <p className="mt-2 text-[10px] text-rose-500 font-bold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {isAr ? 'اقتربت من الحد الأقصى للمقاعد!' : 'Seat limit nearly reached! Upgrade to expand.'}
              </p>
            ) : (
              <p className="mt-2 text-[10px] text-slate-400">
                {isSeatsUnlimited
                  ? isAr ? 'سعة مقاعد غير محدودة للمؤسسات' : 'Unlimited enterprise team capacity'
                  : isAr ? `${maxSeats - seatsUsed} مقاعد متبقية` : `${Math.max(0, maxSeats - seatsUsed)} seat(s) remaining`}
              </p>
            )}
          </div>
        </div>

        {/* Fleet Assets Quota Meter */}
        <div
          className={`rounded-2xl border p-5 transition-all ${
            isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              {isAr ? 'أسطول المركبات' : 'Fleet & Truck Quota'}
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-amber-500" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-bold">
                <span dir="ltr" className="inline-block unicode-bidi-isolate">{vehiclesUsed}</span>{' '}
                <span className="text-xs font-normal text-slate-400">
                  / {isVehiclesUnlimited ? (isAr ? 'غير محدود (∞)' : 'Unlimited (∞)') : maxVehicles}
                </span>
              </span>
              {!isVehiclesUnlimited && (
                <span className="text-xs font-bold text-slate-400">{vehiclesPercent}%</span>
              )}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isVehiclesUnlimited ? 'bg-gradient-to-r from-purple-500 to-amber-500' : 'bg-amber-500'
                }`}
                style={{ width: `${isVehiclesUnlimited ? 100 : Math.max(5, vehiclesPercent)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              {isVehiclesUnlimited
                ? isAr ? 'أسطول غير محدود للشاحنات' : 'Unlimited fleet trucks & haulers'
                : isAr ? 'مركبات مسموح بربطها بالمنصة' : 'Authorized logistics vehicles'}
            </p>
          </div>
        </div>

        {/* Cloud Storage Meter */}
        <div
          className={`rounded-2xl border p-5 transition-all ${
            isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              {isAr ? 'المساحة السحابية' : 'Cloud Storage'}
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <HardDrive className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-bold">
                {storageUsedGb} <span className="text-xs font-normal text-slate-400">/ {maxStorageGb} GB</span>
              </span>
              <span className="text-xs font-bold text-slate-400">{storagePercent}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.max(5, storagePercent)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              {isAr ? 'للوثائق ومرفقات التذاكر والمستندات' : 'Document vault & scale attachments'}
            </p>
          </div>
        </div>
      </div>

      {/* Architectural Capabilities Status Bar */}
      <div
        className={`rounded-2xl border p-4 ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3 mb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              {isAr ? 'الميزات المعمارية المفعلة لمؤسستك' : 'Enterprise Architectural Feature Entitlements'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr
                ? 'يتم تفعيل استضافة قواعد البيانات المستقلة وتوجيه النطاقات الخاصة تلقائياً عند الترقية إلى باقة المؤسسات.'
                : 'Private PostgreSQL hosting and custom zero-slug domain routing unlock dynamically on Grade 3 Enterprise.'}
            </p>
          </div>
          {activePlanName !== 'ENTERPRISE' && (
            <button
              onClick={() => setShowPOModal(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline"
            >
              <span>{isAr ? 'فتح جميع الميزات المعمارية' : 'Unlock All Enterprise Features'}</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* External Database Hosting */}
          <div
            className={`rounded-xl border p-3 flex items-center justify-between ${
              subscription?.entitlements?.allow_external_database
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 opacity-75'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Database
                className={`h-4 w-4 ${
                  subscription?.entitlements?.allow_external_database ? 'text-emerald-500' : 'text-slate-400'
                }`}
              />
              <div>
                <p className="text-xs font-bold">
                  {isAr ? 'قاعدة بيانات خاصة مستقلة' : 'Private External Database'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {subscription?.entitlements?.allow_external_database
                    ? isAr ? 'مفعل ومتاح للترحيل' : 'Unlocked & Active'
                    : isAr ? 'مقفل (يتطلب Enterprise)' : 'Gated (Requires Enterprise)'}
                </p>
              </div>
            </div>
            {subscription?.entitlements?.allow_external_database ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Lock className="h-4 w-4 text-slate-400" />
            )}
          </div>

          {/* Custom Domain Zero-Slug Routing */}
          <div
            className={`rounded-xl border p-3 flex items-center justify-between ${
              subscription?.entitlements?.allow_custom_domain
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 opacity-75'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Globe2
                className={`h-4 w-4 ${
                  subscription?.entitlements?.allow_custom_domain ? 'text-emerald-500' : 'text-slate-400'
                }`}
              />
              <div>
                <p className="text-xs font-bold">
                  {isAr ? 'توجيه النطاق المخصص (Zero-Slug)' : 'Custom Domain Zero-Slug'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {subscription?.entitlements?.allow_custom_domain
                    ? isAr ? 'مفعل ومتاح للربط' : 'Unlocked & Active'
                    : isAr ? 'مقفل (يتطلب Enterprise)' : 'Gated (Requires Enterprise)'}
                </p>
              </div>
            </div>
            {subscription?.entitlements?.allow_custom_domain ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Lock className="h-4 w-4 text-slate-400" />
            )}
          </div>

          {/* Dedicated Dynamic Caddy SSL */}
          <div
            className={`rounded-xl border p-3 flex items-center justify-between ${
              subscription?.entitlements?.allow_dedicated_ssl
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 opacity-75'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck
                className={`h-4 w-4 ${
                  subscription?.entitlements?.allow_dedicated_ssl ? 'text-emerald-500' : 'text-slate-400'
                }`}
              />
              <div>
                <p className="text-xs font-bold">
                  {isAr ? 'شهادات SSL تلقائية (Caddy Dynamic)' : 'Automated Caddy TLS/SSL'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {subscription?.entitlements?.allow_dedicated_ssl
                    ? isAr ? 'إصدار تلقائي On-Demand' : 'On-Demand TLS Active'
                    : isAr ? 'مقفل (يتطلب Enterprise)' : 'Gated (Requires Enterprise)'}
                </p>
              </div>
            </div>
            {subscription?.entitlements?.allow_dedicated_ssl ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Lock className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      {/* Plan Catalog & Multi-Grade Upgrade Matrix */}
      <div
        className={`rounded-3xl border p-6 shadow-sm ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              {isAr ? 'مستويات الاشتراك والترقية السحابية' : 'Multi-Grade Commercial Subscription Catalog'}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'اختر الخطة المناسبة لحجم أعمالك. تتوفر الدفعات عبر البطاقات الائتمانية أو أوامر الشراء والتحويل البنكي للمؤسسات.'
                : 'Flexible payment rails: Instant self-service card checkout via Stripe or corporate bank wire transfer with official VAT invoices.'}
            </p>
          </div>

          {/* Monthly / Annual Billing Toggle */}
          <div className="flex items-center rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isAr ? 'شهري' : 'Monthly'}
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
                billingCycle === 'annual'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{isAr ? 'سنوي' : 'Annual'}</span>
              {annualSavings > 0 && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                  {isAr ? `وفر ${annualSavings}%` : `Save ~${annualSavings}%`}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Plan cards: rendered from the unified pricing catalog (subscription_plans) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.length === 0 && (
            <div className="lg:col-span-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500">
              {loading
                ? isAr ? 'جارٍ تحميل الباقات...' : 'Loading the live plan catalog...'
                : isAr ? 'تعذر تحميل الباقات حالياً.' : 'The plan catalog is temporarily unavailable.'}
            </div>
          )}
          {plans.map((plan, index) => {
            const code = plan.name.toUpperCase();
            const isActive = activePlanName === code;
            const isEnterprise = code === 'ENTERPRISE';
            const free = isFreePlan(plan);
            const price = billingCycle === 'annual' ? plan.annual_price : plan.monthly_price;
            const accent = isEnterprise ? 'purple' : plan.is_featured ? 'blue' : 'slate';
            const cardClass = isActive
              ? accent === 'purple'
                ? 'border-purple-500 bg-purple-500/5 ring-2 ring-purple-500/20'
                : 'border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20'
              : accent === 'purple'
              ? 'border-purple-500/50 bg-gradient-to-b from-purple-500/10 via-slate-900/40 to-slate-900/60 shadow-xl'
              : accent === 'blue'
              ? 'border-blue-500/40 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent shadow-md'
              : isDark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-50/50';
            const accentText = accent === 'purple' ? 'text-purple-400' : accent === 'blue' ? 'text-blue-500' : 'text-slate-400';
            const priceColor =
              accent === 'purple' ? 'text-purple-600 dark:text-purple-400' : accent === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white';
            return (
              <div key={plan.id} id={`tenant-plan-${code.toLowerCase()}`} className={`relative rounded-3xl border p-6 flex flex-col justify-between transition-all ${cardClass}`}>
                {plan.is_featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-0.5 text-[10px] font-black text-white shadow-xs whitespace-nowrap">
                    {isAr ? 'الأكثر انتشاراً (Most Popular)' : 'Most Popular'}
                  </span>
                )}
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black uppercase tracking-wider ${accentText}`}>Grade {index + 1}</span>
                    {isActive && (
                      <span className={`rounded-full ${accent === 'purple' ? 'bg-purple-600' : 'bg-blue-600'} px-2.5 py-0.5 text-[10px] font-black text-white whitespace-nowrap shrink-0`}>
                        {isAr ? 'الخطة النشطة' : 'Current Plan'}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white">{plan.display_name}</h3>
                  {plan.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plan.description}</p>}

                  <div className="mt-5 flex flex-wrap items-baseline gap-1 border-b border-slate-200 dark:border-slate-800 pb-5">
                    <span className={`font-mono text-3xl font-black ${priceColor}`}>{formatSar(price)}</span>
                    <span className="text-xs font-bold text-slate-500">
                      SAR / {billingCycle === 'annual' ? (isAr ? 'سنة' : 'year') : (isAr ? 'شهر' : 'month')}
                    </span>
                    {billingCycle === 'annual' && !free && (
                      <span className="text-[10px] text-emerald-500 font-bold ml-1">
                        (~{formatSar(Math.round(annualMonthlyEquivalent(plan)))} SAR/{isAr ? 'شهر' : 'mo'})
                      </span>
                    )}
                  </div>

                  <ul className="mt-5 space-y-2.5 text-xs">
                    {(plan.display_features ?? []).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${accent === 'purple' ? 'text-purple-500' : 'text-emerald-500'}`} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8">
                  {isEnterprise ? (
                    <button
                      onClick={() => setShowPOModal(true)}
                      className="w-full rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/25 transition-all"
                    >
                      <FileText className="h-4 w-4" />
                      <span>
                        {isActive
                          ? isAr ? 'طلب تجديد أمر شراء / حوالة' : 'Request PO / Wire Renewal'
                          : isAr ? 'طلب أمر شراء وفاتورة بنكية (PO)' : 'Request Corporate PO & Wire Quote'}
                      </span>
                    </button>
                  ) : free ? (
                    <button
                      disabled={isActive}
                      className={`w-full rounded-xl py-2.5 text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {isActive ? (isAr ? 'الخطة الحالية' : 'Active Plan') : (isAr ? 'الرجوع للمجانية' : 'Downgrade to Free')}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStripeCheckout(code)}
                      disabled={isActive || checkoutLoading !== null}
                      className={`w-full rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        isActive
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25'
                      }`}
                    >
                      {checkoutLoading === code ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      <span>
                        {isActive
                          ? isAr ? 'الخطة الحالية النشطة' : 'Active Plan'
                          : isAr ? 'ترقية فورية عبر البطاقة (Stripe)' : 'Instant Card Checkout (Stripe)'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chronological SaaS Invoices Table */}
      <div
        className={`rounded-3xl border p-6 shadow-sm ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              {isAr ? 'سجل الفواتير وعمليات السداد السحابية' : 'SaaS Invoices & Payment History'}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'فواتير الاشتراك الرسمية المتوافقة مع ضريبة القيمة المضافة وحالة تسوية الحوالات البنكية'
                : 'ZATCA-compliant platform subscription invoices, bank wire audit status, and payment receipts'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" dir={isAr ? 'rtl' : 'ltr'}>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase text-slate-400">
                <th className="py-3 px-3">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                <th className="py-3 px-3">{isAr ? 'التاريخ' : 'Issued Date'}</th>
                <th className="py-3 px-3">{isAr ? 'الباقة والدورة' : 'Plan & Cycle'}</th>
                <th className="py-3 px-3">{isAr ? 'طريقة السداد' : 'Payment Rail'}</th>
                <th className="py-3 px-3">{isAr ? 'المبلغ الإجمالي (شامل الضريبة)' : 'Grand Total (SAR)'}</th>
                <th className="py-3 px-3">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-3 text-right">{isAr ? 'الإجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>{isAr ? 'جاري تحميل الفواتير...' : 'Loading invoices...'}</span>
                      </div>
                    ) : (
                      isAr ? 'لا توجد فواتير اشتراك مسجلة حالياً.' : 'No SaaS invoices issued yet.'
                    )}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono">
                      {new Date(inv.issued_date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold uppercase">{inv.plan_display_name || inv.plan_name || 'Enterprise'}</span>
                      <span className="block text-[10px] text-slate-400 capitalize">{inv.billing_cycle}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                          inv.payment_method === 'bank_transfer'
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                        }`}
                      >
                        {inv.payment_method === 'bank_transfer' ? (
                          <>
                            <FileText className="h-3 w-3 shrink-0" />
                            <span>{isAr ? 'حوالة بنكية / PO' : 'Bank Wire / PO'}</span>
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-3 w-3 shrink-0" />
                            <span>Stripe Card</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold whitespace-nowrap">
                      {Number(inv.grand_total_sar || inv.amount_sar).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      <span className="text-[10px] font-normal text-slate-400">SAR</span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase whitespace-nowrap shrink-0 inline-block ${
                          inv.status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                            : inv.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30 animate-pulse'
                            : 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        {isAr ? 'عرض التفاصيل' : 'View Details'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Corporate Purchase Order & Bank Wire Modal */}
      {showPOModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl rounded-3xl border p-6 shadow-2xl overflow-y-auto max-h-[90vh] ${
              isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {isAr ? 'طلب أمر شراء وفاتورة بنكية للمؤسسات' : 'Corporate Purchase Order & Bank Wire Request'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isAr ? 'باقة المؤسسات الكبرى (Grade 3: ENTERPRISE)' : 'Enterprise Grade 3 Unlimited Package'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPOModal(false);
                  setQuoteResult(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {!quoteResult ? (
              <form onSubmit={handleEnterprisePOSubmit} className="mt-4 space-y-4 text-xs">
                {/* Financial Summary Preview */}
                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{isAr ? 'الخطة المختارة' : 'Selected Plan'}:</span>
                    <span className="font-bold text-purple-500">{enterprisePlan?.display_name ?? 'ENTERPRISE'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{isAr ? 'دورة الفوترة' : 'Billing Cycle'}:</span>
                    <span className="font-bold capitalize">{billingCycle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{isAr ? 'المبلغ الأساسي' : 'Subtotal'}:</span>
                    <span className="font-mono font-bold">
                      {formatSar(poSubtotal, 2)} SAR
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{isAr ? 'ضريبة القيمة المضافة (15% ZATCA VAT)' : '15% Saudi VAT'}:</span>
                    <span className="font-mono font-bold">
                      {formatSar(poVat, 2)} SAR
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-purple-500/20 text-sm font-black text-purple-600 dark:text-purple-300">
                    <span>{isAr ? 'الإجمالي المستحق للتحويل' : 'Grand Total Due'}:</span>
                    <span className="font-mono">
                      {formatSar(poTotal, 2)} SAR
                    </span>
                  </div>
                </div>

                {/* Form Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      {isAr ? 'رقم أمر الشراء الداخلي (PO Number)' : 'Corporate PO Reference #'}
                    </label>
                    <input
                      type="text"
                      placeholder={isAr ? 'PO-2026-OXEN-01' : 'PO-2026-OXEN-01'}
                      value={poForm.poNumber}
                      onChange={(e) => setPoForm({ ...poForm, poNumber: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2.5 text-xs focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      {isAr ? 'الرقم الضريبي للمنشأة (15 رقماً)' : 'ZATCA 15-Digit VAT Number'}
                    </label>
                    <input
                      type="text"
                      placeholder={isAr ? 'الرقم الضريبي: 300000000000003' : 'VAT: 300000000000003'}
                      value={poForm.taxId}
                      onChange={(e) => setPoForm({ ...poForm, taxId: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2.5 text-xs focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    {isAr ? 'بريد قسم الحسابات / المشتريات' : 'Finance / Accounts Payable Email'}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={isAr ? 'finance@company.com' : 'finance@company.com'}
                    value={poForm.contactEmail}
                    onChange={(e) => setPoForm({ ...poForm, contactEmail: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2.5 text-xs focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    {isAr ? 'العنوان الوطني / عنوان الفوترة' : 'Corporate Billing Address'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={isAr ? 'الرياض، المملكة العربية السعودية' : 'Riyadh, Kingdom of Saudi Arabia'}
                    value={poForm.billingAddress}
                    onChange={(e) => setPoForm({ ...poForm, billingAddress: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2.5 text-xs focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    {isAr ? 'ملاحظات أو متطلبات تعاقدية خاصة' : 'Procurement Notes or Special Terms'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={isAr ? 'ملاحظات خاصة بفترة السداد أو التحويل البنكي...' : 'Special notes or bank transfer memo info...'}
                    value={poForm.notes}
                    onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2.5 text-xs focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowPOModal(false)}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={poSubmitting}
                    className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-md shadow-purple-600/30"
                  >
                    {poSubmitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                    <span>{isAr ? 'تأكيد وإصدار الفاتورة الرسمية' : 'Issue Official PO Invoice'}</span>
                  </button>
                </div>
              </form>
            ) : (
              /* Success Wire Instructions View */
              <div className="mt-4 space-y-4 text-xs">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle2 className="h-5 w-5" />
                    <span>{isAr ? 'تم إصدار الفاتورة الرسمية وأمر الشراء بنجاح!' : 'Invoice Issued Successfully!'}</span>
                  </div>
                  <p className="mt-1 text-slate-300">
                    {isAr
                      ? `رقم الفاتورة: ${quoteResult.invoice_number} بمبلغ إجمالي ${quoteResult.grand_total_sar.toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال سعودي.`
                      : `Invoice #${quoteResult.invoice_number} issued for total amount ${quoteResult.grand_total_sar.toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR.`}
                  </p>
                </div>

                {/* Bank Wire Details Box */}
                <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 p-5 space-y-3">
                  <h4 className="font-black text-sm text-purple-600 dark:text-purple-400 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {isAr ? `بيانات التحويل البنكي الرسمي (${activeBankDetails.bankName})` : 'Official Saudi Bank Wire Transfer Details'}
                  </h4>

                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{isAr ? 'اسم المستفيد' : 'Beneficiary'}:</span>
                      <span className="font-bold">{activeBankDetails.accountName}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{isAr ? 'اسم البنك' : 'Bank Name'}:</span>
                      <span className="font-bold">{activeBankDetails.bankName}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{isAr ? 'رقم الآيبان (IBAN)' : 'IBAN'}:</span>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                        <span>{activeBankDetails.iban}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(activeBankDetails.iban, 'iban')}
                          className="p-1 hover:text-white"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{isAr ? 'رمز السويفت (SWIFT/BIC)' : 'SWIFT Code'}:</span>
                      <span className="font-mono font-bold">{activeBankDetails.swift}</span>
                    </div>

                    <div className="flex items-center justify-between bg-purple-500/10 p-2.5 rounded-xl border border-purple-500/20">
                      <span className="font-black text-purple-600 dark:text-purple-300">
                        {isAr ? 'رمز الحوالة المرجعي الإلزامي' : 'Mandatory Wire Transfer Reference'}:
                      </span>
                      <div className="flex items-center gap-1.5 font-mono font-black text-purple-600 dark:text-purple-300">
                        <span>{quoteResult.bank_details?.payment_reference || quoteResult.invoice_number}</span>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              quoteResult.bank_details?.payment_reference || quoteResult.invoice_number,
                              'ref'
                            )
                          }
                          className="p-1 hover:text-white"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {activeWallets.length > 0 && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="text-[11px] font-bold text-slate-400">
                        {isAr ? 'المحافظ الرقمية الإقليمية المعتمدة:' : 'Approved Regional Digital Wallets:'}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activeWallets.map((w, idx) => (
                          <div key={w.id || idx} className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-[11px]">
                            <div className="font-bold text-white">{w.provider}</div>
                            <div className="font-mono text-blue-400">{w.wallet_number}</div>
                            <div className="text-slate-400 text-[10px]">{w.account_name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {copiedField && (
                    <p className="text-[10px] text-emerald-400 font-bold text-center">
                      ✓ {isAr ? 'تم نسخ البيانات إلى الحافظة' : `Copied ${copiedField} to clipboard!`}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-[11px] text-blue-300">
                  <p>
                    <strong>{isAr ? 'الخطوة التالية:' : 'Next Step:'}</strong>{' '}
                    {isAr
                      ? 'يرجى إتمام التحويل البنكي وتدوين رمز المرجع في تفاصيل الحوالة. فور استلام الإشعار، سيقوم مشرف المنصة (SuperAdmin) بتسوية الفاتورة وتفعيل مميزات المؤسسات فورياً.'
                      : 'Initiate bank wire transfer with the payment reference code. SuperAdmin will verify receipt in the central financial console to immediately unlock enterprise capabilities.'}
                  </p>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setShowPOModal(false);
                      setQuoteResult(null);
                    }}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    {isAr ? 'تم وفهمت' : 'Understood & Done'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Single Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div
            className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${
              isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {isAr ? 'فاتورة اشتراك المنصة الرسمية' : 'Official SaaS Subscription Invoice'}
                </h3>
                <p className="font-mono text-xs text-blue-500 font-bold"><span dir="ltr" className="inline-block unicode-bidi-isolate">{selectedInvoice.invoice_number}</span></p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{isAr ? 'الشركة المستأجرة' : 'Tenant Entity'}:</span>
                <span className="font-bold">{currentCompany?.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{isAr ? 'الباقة المختارة' : 'Subscription Tier'}:</span>
                <span className="font-bold uppercase">{selectedInvoice.plan_display_name || selectedInvoice.plan_name || 'Enterprise'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{isAr ? 'دورة الفوترة' : 'Billing Cycle'}:</span>
                <span className="capitalize font-mono">{selectedInvoice.billing_cycle}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{isAr ? 'طريقة السداد' : 'Payment Rail'}:</span>
                <span className="font-bold uppercase">{selectedInvoice.payment_method.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{isAr ? 'المبلغ قبل الضريبة' : 'Subtotal'}:</span>
                <span className="font-mono font-bold">
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">{Number(selectedInvoice.amount_sar).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> SAR
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">{isAr ? 'ضريبة القيمة المضافة (15% ZATCA VAT)' : '15% Saudi VAT'}:</span>
                <span className="font-mono font-bold">
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">{Number(selectedInvoice.vat_amount_sar).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> SAR
                </span>
              </div>
              <div className="flex justify-between py-2 text-sm bg-blue-500/10 rounded-xl px-3 font-black text-blue-600 dark:text-blue-400">
                <span>{isAr ? 'الإجمالي المستحق' : 'Grand Total'}:</span>
                <span className="font-mono">
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">
                    {Number(selectedInvoice.grand_total_sar || selectedInvoice.amount_sar).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
                  </span>{' '}
                  SAR
                </span>
              </div>

              {selectedInvoice.payment_method === 'bank_transfer' && (
                <div className="rounded-xl bg-slate-800/60 p-3 border border-slate-700 space-y-1">
                  <p className="font-bold text-[11px] text-amber-400">{isAr ? 'بيانات التحويل البنكي:' : 'Wire Memo Reference:'}</p>
                  <p className="font-mono text-[10px] text-slate-300">
                    IBAN: {activeBankDetails.iban} | SWIFT: {activeBankDetails.swift}
                  </p>
                  {selectedInvoice.payment_reference && (
                    <p className="font-mono text-[10px] text-amber-300 font-bold">
                      Ref: {selectedInvoice.payment_reference}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
