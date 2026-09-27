import React, { useState, useEffect } from 'react';
import {
  Building2,
  FileCheck2,
  Lock,
  Unlock,
  ShieldCheck,
  Send,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  LogOut,
  Clock,
  Layers,
  FileText,
  UserCheck,
  Briefcase,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Eye,
  Hash,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { erpApi, ApiProcurementTender, ApiProcurementBid, ApiVendorPortalUser } from '../services/api';
import { formatCurrency } from '../utils/formatters';

export const VendorPortalView: React.FC = () => {
  const { language, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  // Vendor Session State
  const [vendorUser, setVendorUser] = useState<ApiVendorPortalUser | null>(() => {
    try {
      const stored = localStorage.getItem('oxengl_vendor_session');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Login Form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register Form
  const [regCompanyId, setRegCompanyId] = useState('');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regContactName, setRegContactName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regCr, setRegCr] = useState('');
  const [regVat, setRegVat] = useState('');

  // Tenders & Bids State
  const [activeTenders, setActiveTenders] = useState<ApiProcurementTender[]>([]);
  const [loadingTenders, setLoadingTenders] = useState(false);
  const [selectedTender, setSelectedTender] = useState<ApiProcurementTender | null>(null);
  const [tenderBids, setTenderBids] = useState<ApiProcurementBid[]>([]);
  const [loadingBids, setLoadingBids] = useState(false);

  // Bid Submission Form Modal State
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidProposal, setBidProposal] = useState('');
  const [bidCommercialTerms, setBidCommercialTerms] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState(7);
  const [validityDays, setValidityDays] = useState(60);
  const [lineQuotes, setLineQuotes] = useState<Record<string, { qty: number; unitPrice: number; notes: string }>>({});
  const [bidSuccessMessage, setBidSuccessMessage] = useState<string | null>(null);

  // Load Active Tenders
  const loadTenders = async () => {
    setLoadingTenders(true);
    try {
      const tenders = await erpApi.getProcurementTenders(vendorUser?.company_id);
      setActiveTenders(Array.isArray(tenders) ? tenders : []);
    } catch (err: any) {
      console.error('Failed to load tenders:', err);
    } finally {
      setLoadingTenders(false);
    }
  };

  useEffect(() => {
    loadTenders();
  }, [vendorUser]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await erpApi.vendorPortalLogin({
        email: loginEmail,
        password: loginPassword,
      });
      setVendorUser(res);
      localStorage.setItem('oxengl_vendor_session', JSON.stringify(res));
    } catch (err: any) {
      setAuthError(err.message || (isAr ? 'فشل تسجيل الدخول، تأكد من بيانات الاعتماد' : 'Invalid email or password'));
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      await erpApi.vendorPortalRegister({
        company_id: regCompanyId || '1fa3b69a-f9a1-4ab9-bd6a-c3af99b27c11', // default fallback
        email: regEmail,
        password: regPassword,
        contact_name: regContactName,
        company_name: regCompanyName,
        mobile_number: regMobile,
        commercial_registration: regCr,
        tax_id: regVat,
      });
      setAuthMode('login');
      setLoginEmail(regEmail);
      setAuthError(null);
      alert(isAr ? 'تم تسجيل الحساب بنجاح! يرجى تسجيل الدخول.' : 'Registration successful! Please login.');
    } catch (err: any) {
      setAuthError(err.message || (isAr ? 'فشل التسجيل، يرجى التحقق من البيانات' : 'Registration failed.'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('oxengl_vendor_session');
    setVendorUser(null);
  };

  // Open Bid Submission Form
  const handleOpenBidModal = async (tender: ApiProcurementTender) => {
    setSelectedTender(tender);
    setIsBidModalOpen(true);
    setBidSuccessMessage(null);

    // Initialize line quotes
    try {
      const fullTender = await erpApi.getProcurementTender(tender.id, vendorUser?.company_id);
      setSelectedTender(fullTender);
      const initialQuotes: Record<string, { qty: number; unitPrice: number; notes: string }> = {};
      fullTender.lines?.forEach((l) => {
        initialQuotes[l.id] = {
          qty: Number(l.quantity) || 1,
          unitPrice: Number(l.target_unit_price) || 100,
          notes: '',
        };
      });
      setLineQuotes(initialQuotes);
    } catch (err) {
      console.error('Failed to get tender details:', err);
    }
  };

  // Submit Sealed Bid
  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTender) return;

    setSubmittingBid(true);
    setBidSuccessMessage(null);

    try {
      const lines = Object.entries(lineQuotes).map(([tenderLineId, data]) => ({
        tender_line_id: tenderLineId,
        quoted_quantity: data.qty,
        unit_price: data.unitPrice,
        notes: data.notes || undefined,
        is_alternative: false,
      }));

      const payload = {
        tender_id: selectedTender.id,
        partner_id: vendorUser?.partner_id,
        technical_proposal: bidProposal,
        commercial_terms: bidCommercialTerms,
        delivery_lead_time_days: leadTimeDays,
        validity_period_days: validityDays,
        lines,
      };

      const res = await erpApi.submitTenderBid(selectedTender.id, payload, vendorUser?.company_id);
      setBidSuccessMessage(
        isAr
          ? `تم إيداع العرض المالي والفني بنجاح! رقم المظروف: ${res.bid_number} (مشفر برمز SHA-256)`
          : `Bid sealed & submitted successfully! Envelope: ${res.bid_number} (Encrypted SHA-256)`
      );
      loadTenders();
    } catch (err: any) {
      alert(err.message || (isAr ? 'فشل تقديم العرض' : 'Failed to submit bid.'));
    } finally {
      setSubmittingBid(false);
    }
  };

  // Render Authentication View if not logged in
  if (!vendorUser) {
    return (
      <div className={`min-h-dvh erp-viewport-root flex flex-col justify-center py-12 sm:px-6 lg:px-8 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`} dir={isAr ? 'rtl' : 'ltr'}>
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 mb-4 shadow-lg shadow-amber-500/5">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black tracking-tight">
            {isAr ? 'بوابة الموردين والمناقصات التنافسية' : 'OxenGL eSourcing & Vendor Portal'}
          </h2>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {isAr
              ? 'نظام تقديم العروض والمظاريف المغلقة المشفرة وفق اشتراطات المنظمات الشرائية'
              : 'Sealed Bid Submission & Purchasing Organization Compliance Platform'}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className={`py-8 px-6 shadow-2xl rounded-2xl border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'} backdrop-blur-xl sm:px-10`}>
            {/* Toggle Login / Register */}
            <div className="flex rounded-lg p-1 bg-slate-100 dark:bg-slate-800 mb-6">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                  authMode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isAr ? 'تسجيل دخول مورد' : 'Vendor Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                  authMode === 'register'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isAr ? 'تسجيل مورد جديد' : 'New Vendor Registration'}
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'البريد الإلكتروني' : 'Official Email'}
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="supplier@vendor.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'كلمة المرور' : 'Password'}
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {authLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>{isAr ? 'دخول آمن للبوابة' : 'Secure Vendor Login'}</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'اسم الشركة / المؤسسة' : 'Company / Legal Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={regCompanyName}
                    onChange={(e) => setRegCompanyName(e.target.value)}
                    placeholder="شركة الأفق للتوريدات"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'اسم مسؤول الاتصال' : 'Authorized Contact Person'}
                  </label>
                  <input
                    type="text"
                    required
                    value={regContactName}
                    onChange={(e) => setRegContactName(e.target.value)}
                    placeholder="م. أحمد السالم"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      {isAr ? 'السجل التجاري' : 'Commercial Reg (CR)'}
                    </label>
                    <input
                      type="text"
                      value={regCr}
                      onChange={(e) => setRegCr(e.target.value)}
                      placeholder="1010XXXXXX"
                      className="w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      {isAr ? 'الرقم الضريبي' : 'VAT / Tax ID'}
                    </label>
                    <input
                      type="text"
                      value={regVat}
                      onChange={(e) => setRegVat(e.target.value)}
                      placeholder="3000XXXXXXXX"
                      className="w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'البريد الإلكتروني الرسمي' : 'Official Corporate Email'}
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="rfq@vendor.com"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'رقم الهاتف / الجوال' : 'Mobile / Phone'}
                  </label>
                  <input
                    type="tel"
                    value={regMobile}
                    onChange={(e) => setRegMobile(e.target.value)}
                    placeholder="+966 50 XXX XXXX"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'كلمة المرور المشفرة' : 'Password'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent focus:ring-2 focus:ring-amber-500 outline-none border-slate-300 dark:border-slate-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {authLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>{isAr ? 'إنشاء حساب مورد معتمد' : 'Complete Vendor Registration'}</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Logged-in Vendor Portal Dashboard
  return (
    <div className={`min-h-dvh erp-viewport-root p-6 md:p-10 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header ribbon */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black">
                {vendorUser.company_name}
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <span>{vendorUser.contact_name} ({vendorUser.email})</span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-emerald-500 font-bold">{isAr ? 'مورد معتمد' : 'Verified Vendor'}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadTenders}
            className="px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {isAr ? 'تحديث المناقصات' : 'Refresh Tenders'}
          </button>
          <button
            onClick={handleLogout}
            className="px-3.5 py-2 text-xs font-bold rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isAr ? 'خروج' : 'Logout'}</span>
          </button>
        </div>
      </div>

      {/* Security Architecture Notice */}
      <div className="mt-6 p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 text-sky-500 text-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 flex-shrink-0" />
          <span>
            {isAr
              ? 'نظام المظاريف المغلقة مشفر تشفيراً كاملاً (SHA-256 Envelope). لا يمكن لموظفي المشتريات الاطلاع على الأسعار المقدمة حتى موعد جلسة فتح المظاريف الرسمية.'
              : 'End-to-End Cryptographic Envelope: Quotations remain masked and tamper-proof until the official public unsealing ceremony.'}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
          SECURE RFQ v10.4
        </span>
      </div>

      {/* Active Tenders List */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-500" />
            <span>{isAr ? 'المناقصات وطلبات عروض الأسعار المتاحة (Active RFQs)' : 'Active eSourcing Tenders & RFQs'}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-amber-500/10 text-amber-500 font-bold">
              {activeTenders.length}
            </span>
          </h2>
        </div>

        {loadingTenders ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
            {isAr ? 'جاري تحميل المناقصات...' : 'Loading active tenders...'}
          </div>
        ) : activeTenders.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500 text-xs">
            {isAr ? 'لا توجد مناقصات مفتوحة للتوريد حالياً.' : 'No active tenders currently open for bidding.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeTenders.map((tender) => {
              const isOpen = tender.status === 'OPEN';
              const isDeadlinePassed = new Date(tender.submission_deadline) < new Date();

              return (
                <div
                  key={tender.id}
                  className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                    isDark ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                      <span className="font-mono text-xs font-bold text-amber-500 whitespace-nowrap shrink-0">
                        {tender.tender_number}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap shrink-0 ${
                          tender.status === 'AWARDED'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : isOpen && !isDeadlinePassed
                            ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                            : 'bg-slate-500/10 text-slate-500'
                        }`}
                      >
                        {tender.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm mb-1">{tender.title}</h3>
                    {tender.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                        {tender.description}
                      </p>
                    )}

                    <div className="space-y-1.5 text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3 mb-4">
                      <div className="flex items-center justify-between">
                        <span>{isAr ? 'الجهة الطارحة:' : 'Purchasing Org:'}</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {tender.purchasing_org_name || 'Central Purchasing Org'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{isAr ? 'التصنيف:' : 'Category:'}</span>
                        <span className="font-semibold">{tender.category}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{isAr ? 'الموعد النهائي للتقديم:' : 'Submission Deadline:'}</span>
                        <span className="font-mono text-rose-500 font-bold">
                          {new Date(tender.submission_deadline).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{isAr ? 'تاريخ فتح المظاريف:' : 'Bid Opening Ceremony:'}</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          {new Date(tender.bid_opening_date).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Lock className="w-3 h-3 text-amber-500" />
                      {tender.is_sealed_bid ? (isAr ? 'مظروف سري مغلق' : 'Sealed Bid') : (isAr ? 'علني' : 'Open')}
                    </span>

                    <button
                      onClick={() => handleOpenBidModal(tender)}
                      disabled={!isOpen || isDeadlinePassed}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-slate-400 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isAr ? 'تقديم مظروف العطاء' : 'Submit Quotation'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sealed Bid Submission Modal */}
      {isBidModalOpen && selectedTender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="font-mono text-xs font-bold text-amber-500">
                  {selectedTender.tender_number}
                </span>
                <h3 className="text-base font-black">
                  {isAr ? 'تقديم عرض أسعار ومظروف مغلق' : 'Sealed Quotation Submission'}
                </h3>
              </div>
              <button
                onClick={() => setIsBidModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {bidSuccessMessage ? (
              <div className="my-6 p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-bold text-emerald-400">
                  {bidSuccessMessage}
                </h4>
                <p className="text-xs text-slate-400">
                  {isAr
                    ? 'سيتم تقييم العرض المالي والفني خلال جلسة فتح المظاريف وإخطاركم فور اعتماد الترسية.'
                    : 'Your bid will be evaluated upon official ceremony completion.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsBidModalOpen(false)}
                  className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitBid} className="mt-4 space-y-4">
                {/* Specifications & Line Items */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {isAr ? 'بنود المواصفات والكميات المطلوبة' : 'RFQ Required Line Items'}
                  </h4>
                  <div className="space-y-3">
                    {selectedTender.lines?.map((line) => {
                      const quote = lineQuotes[line.id] || { qty: Number(line.quantity), unitPrice: 0, notes: '' };
                      const lineTotal = (quote.qty || 0) * (quote.unitPrice || 0);

                      return (
                        <div
                          key={line.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50"
                        >
                          <div className="flex items-center justify-between text-xs font-bold mb-1">
                            <span className="font-mono text-amber-500">{line.item_code}</span>
                            <span>
                              {Number(line.quantity)} {line.uom}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mb-2">{line.description}</p>

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold mb-0.5">
                                {isAr ? 'الكمية المعروضة' : 'Quoted Qty'}
                              </label>
                              <input
                                type="number"
                                min={1}
                                required
                                value={quote.qty}
                                onChange={(e) =>
                                  setLineQuotes({
                                    ...lineQuotes,
                                    [line.id]: { ...quote, qty: Number(e.target.value) },
                                  })
                                }
                                className="w-full px-2.5 py-1.5 text-xs rounded border bg-transparent border-slate-300 dark:border-slate-700"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold mb-0.5">
                                {isAr ? `السعر الإفرادي (${selectedTender.currency})` : `Unit Price (${selectedTender.currency})`}
                              </label>
                              <input
                                type="number"
                                step="any"
                                min={0}
                                required
                                value={quote.unitPrice}
                                onChange={(e) =>
                                  setLineQuotes({
                                    ...lineQuotes,
                                    [line.id]: { ...quote, unitPrice: Number(e.target.value) },
                                  })
                                }
                                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded border bg-transparent border-slate-300 dark:border-slate-700 text-amber-500"
                              />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                              <label className="block text-[10px] text-slate-400 font-bold mb-0.5">
                                {isAr ? 'الإجمالي للبند' : 'Line Total'}
                              </label>
                              <div className="px-2.5 py-1.5 text-xs font-mono font-bold rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {formatCurrency(lineTotal, isAr ? 'ar' : 'en')}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Delivery and Validity */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      {isAr ? 'مدة التوريد (أيام)' : 'Delivery Lead Time (Days)'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={leadTimeDays}
                      onChange={(e) => setLeadTimeDays(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      {isAr ? 'صلاحية العرض (أيام)' : 'Quote Validity (Days)'}
                    </label>
                    <input
                      type="number"
                      min={15}
                      required
                      value={validityDays}
                      onChange={(e) => setValidityDays(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>

                {/* Technical Proposal */}
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'العرض الفني والمواصفات المعتمدة' : 'Technical Specifications & Compliance Proposal'}
                  </label>
                  <textarea
                    rows={2}
                    value={bidProposal}
                    onChange={(e) => setBidProposal(e.target.value)}
                    placeholder={isAr ? 'بيانات المطابقة للمواصفات القياسية، الشهادات، الفحوصات المخبرية...' : 'Specification conformance, lab certificates, quality checks...'}
                    className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent border-slate-300 dark:border-slate-700"
                  />
                </div>

                {/* Commercial Terms */}
                <div>
                  <label className="block text-xs font-bold mb-1">
                    {isAr ? 'الشروط التجارية وشروط الدفع' : 'Commercial & Payment Terms'}
                  </label>
                  <textarea
                    rows={2}
                    value={bidCommercialTerms}
                    onChange={(e) => setBidCommercialTerms(e.target.value)}
                    placeholder={isAr ? 'شروط الدفع (Net 30/60)، ضمان الدفعة المقدمة...' : 'Payment terms (Net 30/60), performance guarantee...'}
                    className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent border-slate-300 dark:border-slate-700"
                  />
                </div>

                {/* Submission CTA */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBidModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingBid}
                    className="px-5 py-2 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {submittingBid ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>{isAr ? 'تشفير وإيداع المظروف' : 'Encrypt & Submit Sealed Bid'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
