import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { FinancialVoucher, VoucherType, VoucherCategory } from '../types';
import { tafqeetArabic, tafqeetEnglish } from '../utils/tafqeet';
import { X, CreditCard, Building, FileText, CheckCircle2, DollarSign, Sparkles } from 'lucide-react';
import { HoverIcon } from './common/HoverIcon';

interface CreateVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: VoucherType;
  initialCategory?: VoucherCategory;
  initialPartyType?: 'Crusher' | 'Transporter' | 'Customer' | 'Other';
  initialPartyId?: string;
  initialPartyName?: string;
  initialAmount?: number;
  initialLinkedRef?: string;
  initialPurpose?: string;
  onSuccess?: (createdVoucher: FinancialVoucher) => void;
}

export const CreateVoucherModal: React.FC<CreateVoucherModalProps> = ({
  isOpen,
  onClose,
  initialType = 'Payment',
  initialCategory = 'Crusher_Settlement',
  initialPartyType = 'Crusher',
  initialPartyId = '',
  initialPartyName = '',
  initialAmount = 0,
  initialLinkedRef = '',
  initialPurpose = '',
  onSuccess,
}) => {
  const {
    language,
    crushers,
    transporters,
    customers,
    currentUser,
    brandConfig,
    createVoucher,
    isAdmin,
    isCOO,
    showToast,
  } = useApp();

  const isAr = language === 'ar';

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [type, setType] = useState<VoucherType>(initialType);
  const [category, setCategory] = useState<VoucherCategory>(initialCategory);
  const [partyType, setPartyType] = useState<'Crusher' | 'Transporter' | 'Customer' | 'Other'>(initialPartyType);
  const [partyId, setPartyId] = useState<string>(initialPartyId);
  const [partyName, setPartyName] = useState<string>(initialPartyName);
  const [partyTaxNumber, setPartyTaxNumber] = useState<string>('');
  const [amount, setAmount] = useState<number | string>(initialAmount || '');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'Cash' | 'Cheque' | 'Credit Memo'>('Bank Transfer');
  const [bankName, setBankName] = useState<string>(brandConfig.bankNameAr || 'مصرف الراجحي');
  const [transferRefNumber, setTransferRefNumber] = useState<string>('');
  const [checkNumber, setCheckNumber] = useState<string>('');
  const [linkedReferenceNo, setLinkedReferenceNo] = useState<string>(initialLinkedRef);
  const [purpose, setPurpose] = useState<string>(initialPurpose);
  const [notes, setNotes] = useState<string>('');
  const [receivedBy, setReceivedBy] = useState<string>('');
  const [autoApprove, setAutoApprove] = useState<boolean>(isAdmin);

  // Sync initial props whenever modal opens with new pre-fill
  useEffect(() => {
    if (isOpen) {
      setType(initialType);
      setCategory(initialCategory);
      setPartyType(initialPartyType);
      setPartyId(initialPartyId);
      setPartyName(initialPartyName);
      setAmount(initialAmount ? String(initialAmount) : '');
      setLinkedReferenceNo(initialLinkedRef);
      setPurpose(initialPurpose);
      setAutoApprove(isAdmin);

      // Auto resolve party tax number if partyId matches
      if (initialPartyType === 'Crusher' && initialPartyId) {
        const found = crushers.find((c) => c.id === initialPartyId);
        if (found) setPartyTaxNumber(found.taxNumber || '');
      } else if (initialPartyType === 'Customer' && initialPartyId) {
        const found = customers.find((c) => c.id === initialPartyId);
        if (found) setPartyTaxNumber(found.taxNumber || '');
      }
    }
  }, [isOpen, initialType, initialCategory, initialPartyType, initialPartyId, initialPartyName, initialAmount, initialLinkedRef, initialPurpose, isAdmin, crushers, customers]);

  const numericAmount = useMemo(() => {
    const val = typeof amount === 'number' ? amount : parseFloat(String(amount));
    return isNaN(val) ? 0 : val;
  }, [amount]);

  // Live Tafqeet
  const amountInWordsAr = useMemo(() => {
    return tafqeetArabic(numericAmount);
  }, [numericAmount]);

  const amountInWordsEn = useMemo(() => {
    return tafqeetEnglish(numericAmount);
  }, [numericAmount]);

  if (!isOpen) return null;

  // Handle party selection change
  const handlePartySelect = (selectedId: string) => {
    setPartyId(selectedId);
    if (partyType === 'Crusher') {
      const crush = crushers.find((c) => c.id === selectedId);
      if (crush) {
        const cName = crush.crusherName || crush.name || '';
        setPartyName(cName);
        setPartyTaxNumber(crush.taxNumber || '');
        if (!purpose) {
          setPurpose(`سداد مستحقات توريد مواد حصوية لـ (${cName})`);
        }
      }
    } else if (partyType === 'Transporter') {
      const trans = transporters.find((t) => t.id === selectedId);
      if (trans) {
        const tName = trans.transporterName || trans.name || '';
        setPartyName(tName);
        setPartyTaxNumber(trans.taxNumber || '');
        if (!purpose) {
          setPurpose(`سداد أجور نقل وتوريد لشاحنات أسطول (${tName})`);
        }
      }
    } else if (partyType === 'Customer') {
      const cust = customers.find((c) => c.id === selectedId);
      if (cust) {
        const custName = cust.customerName || (cust as any).name || '';
        setPartyName(custName);
        setPartyTaxNumber(cust.taxNumber || '');
        if (!purpose) {
          setPurpose(`استلام دفعة سداد فواتير توريد من عميل (${custName})`);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount));
    if (!partyName.trim()) {
      showToast(isAr ? 'يرجى إدخال اسم المستفيد / المستلم منه' : 'Please provide party name', 'warning');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast(isAr ? 'يرجى إدخال مبلغ صحيح أكبر من الصفر' : 'Please enter a valid amount greater than 0', 'warning');
      return;
    }

    const created = await createVoucher({
      voucherNumber: '',
      type,
      category,
      date,
      amount: numAmount,
      partyType,
      partyId: partyId || undefined,
      partyName: partyName.trim(),
      partyTaxNumber: partyTaxNumber || undefined,
      paymentMethod,
      bankName: paymentMethod === 'Cash' ? undefined : bankName,
      transferRefNumber: paymentMethod === 'Bank Transfer' ? transferRefNumber : undefined,
      checkNumber: paymentMethod === 'Cheque' ? checkNumber : undefined,
      linkedReferenceNo: linkedReferenceNo || undefined,
      purpose: purpose.trim() || (isAr ? `سند ${type === 'Payment' ? 'صرف' : 'قبض'} رسمي` : `Official ${type} Voucher`),
      notes: notes.trim() || undefined,
      month: new Date(date).getMonth() + 1,
      year: new Date(date).getFullYear(),
      preparedBy: currentUser.fullNameAr || currentUser.fullName,
      reviewedBy: 'عبدالمجيد أحمد (المدير المالي والتشغيلي COO)',
      receivedBy: receivedBy.trim() || undefined,
      isApproved: autoApprove && (isAdmin || isCOO),
      status: autoApprove && (isAdmin || isCOO) ? 'Approved' : 'Pending_Approval',
      approvedBy: autoApprove && (isAdmin || isCOO) ? (currentUser.fullNameAr || currentUser.fullName) : undefined,
      approvedAt: autoApprove && (isAdmin || isCOO) ? new Date().toISOString() : undefined,
    });

    if (onSuccess) {
      onSuccess(created);
    }
    showToast(isAr ? 'تم حفظ وإصدار السند المالي بنجاح' : 'Financial voucher issued successfully', 'success');
    onClose();
  };

  return (
    <div
      id="create-voucher-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-voucher-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-900 via-neutral-950 to-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-black text-sm ${type === 'Payment' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
              {type === 'Payment' ? 'صرف' : 'قبض'}
            </div>
            <div>
              <h2 id="create-voucher-title" className="text-base font-black sm:text-lg">
                {isAr
                  ? type === 'Payment' ? 'إنشاء سند صـرف مالي جديد' : 'إنشاء سند قـبض مالي جديد'
                  : type === 'Payment' ? 'Create Payment Voucher' : 'Create Receipt Voucher'}
              </h2>
              <p className="text-xs text-slate-300">
                {isAr ? 'توثيق الحركات البنكية والنقدية بتفقيط آلي واعتمادات تنفيذية' : 'Financial documentation with automatic tafqeet'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="group flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <HoverIcon className="h-5 w-5">
              <X className="h-full w-full" />
            </HoverIcon>
          </button>
        </div>

        {/* Modal Form Body */}
        <form noValidate onSubmit={handleSubmit} className="max-h-[82vh] overflow-y-auto p-6 space-y-5">
          {/* Voucher Type & Category Switchers */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-300">
                {isAr ? 'نوع السند المالي:' : 'Voucher Type:'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setType('Payment');
                    if (category === 'Customer_Collection') setCategory('Crusher_Settlement');
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-black transition-all ${
                    type === 'Payment'
                      ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  <span>{isAr ? 'سند صـرف (Payment)' : 'Payment Voucher'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('Receipt');
                    if (category === 'Crusher_Settlement' || category === 'Transporter_Payout') setCategory('Customer_Collection');
                    setPartyType('Customer');
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-black transition-all ${
                    type === 'Receipt'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  <span>{isAr ? 'سند قـبض (Receipt)' : 'Receipt Voucher'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-300">
                {isAr ? 'تصنيف السند المحاسبي:' : 'Voucher Category:'}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as VoucherCategory)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
              >
                {type === 'Payment' ? (
                  <>
                    <option value="Crusher_Settlement" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'سداد مستحقات كسارة ومواد خام' : 'Crusher Settlement'}</option>
                    <option value="Transporter_Payout" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'صرف مستحقات مقاولي النقل' : 'Transporter Payout'}</option>
                    <option value="Operational_Expense" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'مصروفات تشغيلية ومحروقات' : 'Operational Expense'}</option>
                    <option value="Administrative_Expense" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'مصروفات إدارية وعمومية' : 'Administrative Expense'}</option>
                    <option value="Equipment_Maintenance" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'صيانة معدات وشاحنات' : 'Equipment Maintenance'}</option>
                    <option value="Other_Payment" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'مدفوعات أخرى' : 'Other Payment'}</option>
                  </>
                ) : (
                  <>
                    <option value="Customer_Collection" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'تحصيل من عميل' : 'Customer Collection'}</option>
                    <option value="Other_Receipt" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'مقبوضات أخرى' : 'Other Receipt'}</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Amount & Real-Time Tafqeet Box */}
          <div className="rounded-2xl border-2 border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/20 p-4 space-y-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-black text-neutral-950 dark:text-slate-100">
                  {isAr ? 'المبلغ بالريال السعودي (SAR):' : 'Amount (SAR):'} *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={isAr ? '0.00' : '0.00'}
                    className="w-full rounded-xl border border-orange-300 dark:border-orange-900/60 bg-white dark:bg-slate-900 px-3 py-2.5 text-base font-black font-mono text-slate-900 dark:text-slate-100 focus:border-orange-600 focus:ring-2 focus:ring-orange-500/20 focus:outline-hidden"
                  />
                  <span className="absolute left-3 top-2.5 rounded-md bg-orange-100 dark:bg-orange-900/60 px-2 py-0.5 text-xs font-bold text-orange-800 dark:text-orange-300">
                    SAR
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-300">
                  {isAr ? 'تاريخ المعاملة:' : 'Posting Date:'} *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Live Tafqeet Banner */}
            <div className="rounded-xl border border-orange-300/80 dark:border-orange-900/50 bg-white dark:bg-slate-900 p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-950 dark:text-orange-400 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                <span>{isAr ? 'المبلغ كتابة بالحروف (تفقيط آلي فوري):' : 'Amount in Words (Auto-Tafqeet):'}</span>
              </div>
              <p className="text-xs font-black text-neutral-950 dark:text-slate-100 font-serif leading-relaxed">
                {amountInWordsAr}
              </p>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                {amountInWordsEn}
              </p>
            </div>
          </div>

          {/* Beneficiary / Payer Information */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900 dark:text-slate-100">
              {isAr
                ? type === 'Payment' ? 'بيانات المستفيد (Payee)' : 'بيانات الدافع / المستلم منه (Payer)'
                : 'Party Details'}
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  {isAr ? 'نوع الجهة:' : 'Party Type:'}
                </label>
                <select
                  value={partyType}
                  onChange={(e) => {
                    const p = e.target.value as any;
                    setPartyType(p);
                    setPartyId('');
                    setPartyName('');
                    setPartyTaxNumber('');
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  <option value="Crusher" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'كسارة' : 'Crusher'}</option>
                  <option value="Transporter" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'ناقل' : 'Transporter'}</option>
                  <option value="Customer" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'عميل' : 'Customer'}</option>
                  <option value="Other" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'أخرى / مورد' : 'Other'}</option>
                </select>
              </div>

              {/* Quick Dropdown if Crusher/Transporter/Customer */}
              {partyType !== 'Other' && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    {isAr ? 'اختر من السجلات:' : 'Select from Directory:'}
                  </label>
                  <select
                    value={partyId}
                    onChange={(e) => handlePartySelect(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                  >
                    <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? '-- اختر --' : '-- Select --'}</option>
                    {partyType === 'Crusher' &&
                      crushers.map((c) => (
                        <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                          {c.crusherName || c.name}
                        </option>
                      ))}
                    {partyType === 'Transporter' &&
                      transporters.map((t) => (
                        <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                          {t.transporterName || t.name}
                        </option>
                      ))}
                    {partyType === 'Customer' &&
                      customers.map((c) => (
                        <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                          {c.customerName || (c as any).name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className={partyType === 'Other' ? 'sm:col-span-2' : ''}>
                <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  {isAr ? 'اسم المستفيد / الجهة الصريح:' : 'Beneficiary / Entity Name:'} *
                </label>
                <input
                  type="text"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  placeholder={isAr ? 'مثال: شركة ركاز للمقاولات' : 'e.g. Rikaz Contracting'}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Payment Method & Bank Coordinates */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900 dark:text-slate-100">
              {isAr ? 'طريقة الدفع والتفاصيل المصرفية' : 'Payment Method & Banking'}
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  {isAr ? 'طريقة السداد:' : 'Payment Method:'}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  <option value="Bank Transfer" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  <option value="Cheque" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'شيك مصرفي' : 'Cheque'}</option>
                  <option value="Cash" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'نقداً (صندوق)' : 'Cash'}</option>
                  <option value="Credit Memo" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{isAr ? 'تسوية قيد / مقاصة' : 'Credit Memo'}</option>
                </select>
              </div>

              {paymentMethod !== 'Cash' && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    {isAr ? 'البنك المنفذ:' : 'Bank Name:'}
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder={isAr ? 'مثال: مصرف الراجحي' : 'e.g. Al Rajhi Bank'}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              )}

              {paymentMethod === 'Bank Transfer' && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    {isAr ? 'رقم الحوالة / المرجع البنكي:' : 'Transfer Reference No:'}
                  </label>
                  <input
                    type="text"
                    value={transferRefNumber}
                    onChange={(e) => setTransferRefNumber(e.target.value)}
                    placeholder={isAr ? 'TRF-88401923' : 'TRF-88401923'}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              )}

              {paymentMethod === 'Cheque' && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    {isAr ? 'رقم الشيك:' : 'Cheque Number:'}
                  </label>
                  <input
                    type="text"
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                    placeholder={isAr ? 'CHQ-001924' : 'CHQ-001924'}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Purpose & References */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-300">
                {isAr ? 'الغرض من الصرف / القبض (Purpose):' : 'Payment Purpose:'} *
              </label>
              <textarea
                rows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={isAr ? 'وصف تفصيلي للدفعة، نوع المواد، أو رقم الشهر المالي' : 'Detailed description of the transaction'}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  {isAr ? 'رقم الفاتورة أو العقد المرتبط:' : 'Linked Invoice / Ref No:'}
                </label>
                <input
                  type="text"
                  value={linkedReferenceNo}
                  onChange={(e) => setLinkedReferenceNo(e.target.value)}
                  placeholder={isAr ? 'INV-2026-08-1048' : 'INV-2026-08-1048'}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  {isAr ? 'اسم المستلم / الوكيل (Received By):' : 'Received By Name:'}
                </label>
                <input
                  type="text"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder={isAr ? 'اسم المندوب أو أمين الصندوق' : 'Receiver / Agent name'}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                {isAr ? 'ملاحظات إضافية للمحاسبة:' : 'Additional Accounting Notes:'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isAr ? 'أي شروط أو ملحوظات تدقيق' : 'Optional internal notes'}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* CEO / Executive Direct Approval Switch if user is Admin or COO */}
          {(isAdmin || isCOO) && (
            <div className="flex items-center justify-between rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/70 dark:bg-orange-950/20 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-orange-700 dark:text-orange-400" />
                <div>
                  <span className="text-xs font-black text-neutral-950 dark:text-slate-100">
                    {isAr ? 'اعتماد وختم السند فورياً (صلاحيات المدير العام CEO)' : 'Instant Executive Approval & Stamp'}
                  </span>
                  <p className="text-[10px] text-orange-700 dark:text-orange-400">
                    {isAr ? 'تطبيق الختم والتوقيع الإلكتروني دون الحاجة لتمرير السند لقائمة الانتظار' : 'Stamp digital signature immediately'}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="h-4 w-4 rounded-sm border-slate-300 text-orange-600 focus:ring-orange-500"
              />
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="group flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 transition-colors"
            >
              <HoverIcon className="h-4 w-4">
                <CheckCircle2 className="h-full w-full" />
              </HoverIcon>
              <span>
                {isAr
                  ? type === 'Payment' ? 'إصدار سند الصرف' : 'إصدار سند القبض'
                  : `Issue ${type} Voucher`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
