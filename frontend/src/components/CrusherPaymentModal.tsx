import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, CreditCard, Building2, Calendar, FileText, CheckCircle2, Sparkles, Printer } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { tafqeetArabic } from '../utils/tafqeet';
import { FinancialVoucher } from '../types';

interface CrusherPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCrusherName?: string;
  onVoucherCreated?: (voucher: FinancialVoucher) => void;
}

export const CrusherPaymentModal: React.FC<CrusherPaymentModalProps> = ({
  isOpen,
  onClose,
  defaultCrusherName,
  onVoucherCreated,
}) => {
  const { crushers, addCrusherPayment, autoGenerateVoucherFromPayment, language, showToast } = useApp();
  const isAr = language === 'ar';

  const [selectedCrusherId, setSelectedCrusherId] = useState<string>(() => {
    if (defaultCrusherName) {
      const found = crushers.find((c) => c.crusherName === defaultCrusherName);
      if (found) return found.id;
    }
    return crushers[0]?.id || '';
  });

  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState<number | ''>(25000);
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'Cheque' | 'Cash' | 'Credit Memo'>('Bank Transfer');
  const [referenceNo, setReferenceNo] = useState(`TR-SA-${Math.floor(100000 + Math.random() * 900000)}`);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPaymentDate('');
    }
  }, [isOpen]);

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

  const amountInWordsAr = useMemo(() => {
    return tafqeetArabic(Number(amount) || 0);
  }, [amount]);

  if (!isOpen) return null;

  const currentCrusher = crushers.find((c) => c.id === selectedCrusherId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentDate || !amount || amount <= 0 || !currentCrusher) {
      showToast(isAr ? 'يرجى تحديد تاريخ السداد وإدخال مبلغ صحيح واختيار الكسارة' : 'Please select a payment date, enter a valid amount, and choose a crusher', 'warning');
      return;
    }

    const d = new Date(paymentDate);
    const paymentEntry = {
      crusher_id: currentCrusher.id,
      crusher_name: currentCrusher.crusherName,
      payment_date: paymentDate,
      amount: Number(amount),
      payment_method: paymentMethod,
      reference_no: referenceNo,
      notes: notes,
      month: d.getMonth() + 1,
      year: d.getFullYear(),
    };

    addCrusherPayment(paymentEntry);

    // Auto generate the official financial voucher
    const voucher = autoGenerateVoucherFromPayment(paymentEntry as any);

    if (onVoucherCreated) {
      onVoucherCreated(voucher);
    }

    showToast(isAr ? 'تم تسجيل واعتماد سند الصرف بنجاح' : 'Payment voucher recorded successfully', 'success');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="crusher-payment-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
    >
      <div
        id="crusher-payment-modal"
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl transition-colors"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 id="crusher-payment-title" className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'تسجيل سند صرف / سداد دفعة للكسارة' : 'Record Crusher Payment Voucher'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isAr ? 'إدراج قيد مدين لتسوية رصيد المورد' : 'Debit entry to reconcile supplier ledger'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
              {isAr ? 'الكسارة المستفيدة *' : 'Beneficiary Crusher *'}
            </label>
            <select
              value={selectedCrusherId}
              onChange={(e) => setSelectedCrusherId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
            >
              {crushers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.crusherName}
                </option>
              ))}
            </select>
            {currentCrusher && (
              <div className="mt-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 p-2 text-[11px] text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
                {currentCrusher.bankDetails}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'تاريخ السداد *' : 'Payment Date *'}
              </label>
              <input
                type="date"
                required
                placeholder="YYYY-MM-DD"
                value={paymentDate || ''}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/90 px-3 py-2 text-xs text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'المبلغ المسدد (ر.س) *' : 'Amount (SAR) *'}
              </label>
              <input
                type="number"
                step="100"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/90 px-3 py-2 text-xs font-bold text-blue-900 dark:text-blue-300 font-mono"
              />
            </div>
          </div>

          {/* Tafqeet Preview */}
          <div className="rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20 p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-950 dark:text-orange-300">
              <Sparkles className="h-3 w-3 text-orange-600 dark:text-orange-400" />
              <span>{isAr ? 'التفقيط الآلي لسند الصرف:' : 'Auto Tafqeet:'}</span>
            </div>
            <p className="mt-0.5 text-xs font-bold text-neutral-950 dark:text-slate-100 font-serif">
              {amountInWordsAr}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'طريقة السداد *' : 'Payment Method *'}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/90 px-3 py-2 text-xs text-slate-800 dark:text-slate-100"
              >
                <option value="Bank Transfer">{isAr ? 'تحويل بنكي (Bank Transfer)' : 'Bank Transfer'}</option>
                <option value="Cheque">{isAr ? 'شيك مصدق (Cheque)' : 'Cheque'}</option>
                <option value="Cash">{isAr ? 'نقداً (Cash)' : 'Cash'}</option>
                <option value="Credit Memo">{isAr ? 'إشعار دائن (Credit Memo)' : 'Credit Memo'}</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'رقم المرجع / الشيك' : 'Reference / Cheque #'}
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/90 px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
              {isAr ? 'ملاحظات وبيان السند' : 'Voucher Remarks'}
            </label>
            <textarea
              rows={2}
              value={notes}
              placeholder={isAr ? 'سداد دفعة مقابل توريدات رمل وحصى...' : 'Payment for supplies...'}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/90 p-2.5 text-xs text-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-200 dark:shadow-none transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isAr ? 'اعتماد سند الصرف' : 'Confirm Voucher'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

