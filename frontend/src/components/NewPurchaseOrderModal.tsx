import React, { useState } from 'react';
import {
  ShoppingCart,
  X,
  AlertCircle,
  Building2,
  Calendar,
  Hash,
  DollarSign,
  Tag,
  FileText,
} from 'lucide-react';
import { HoverIcon } from './common/HoverIcon';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';

export interface PurchaseOrderRecord {
  id: string;
  poNumber: string;
  vendorName: string;
  category: string;
  totalAmount: number;
  currency: string;
  status: 'MATCHED' | 'APPROVED' | 'PENDING';
  issueDate: string;
  deliveryDate: string;
}

interface NewPurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseOrderCreated: (po: PurchaseOrderRecord) => void;
}

export const NewPurchaseOrderModal: React.FC<NewPurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  onPurchaseOrderCreated,
}) => {
  const { language, themeMode, showToast } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const defaultPoNumber = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  const [poNumber, setPoNumber] = useState(defaultPoNumber);
  const [vendorName, setVendorName] = useState('');
  const [category, setCategory] = useState(isAr ? 'مواد أولية وكسارات' : 'Raw Materials & Aggregates');
  const [totalAmount, setTotalAmount] = useState('25000');
  const [currency] = useState('SAR');
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vendorName.trim()) {
      setError(isAr ? 'يرجى إدخال اسم المورد أو الشريك التجاري' : 'Vendor / Partner name is required');
      return;
    }

    const amountNum = parseFloat(totalAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError(isAr ? 'يرجى إدخال مبلغ إجمالي صالح لأمر الشراء' : 'Please enter a valid total amount');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        po_number: poNumber.trim() || undefined,
        poNumber: poNumber.trim() || undefined,
        vendor_name: vendorName.trim(),
        vendorName: vendorName.trim(),
        category: category.trim(),
        total_amount: amountNum,
        totalAmount: amountNum,
        currency,
        delivery_date: deliveryDate,
        deliveryDate,
        notes: notes.trim(),
        status: 'draft',
      };

      const response = await erpApi.createPurchaseOrder(payload);

      const newRecord: PurchaseOrderRecord = {
        id: response.id || response.po_id || `po-${Date.now()}`,
        poNumber: response.poNumber || response.po_number || payload.po_number,
        vendorName: response.vendorName || response.vendor_name || payload.vendor_name,
        category: response.category || payload.category,
        totalAmount: response.totalAmount || response.total_amount || payload.total_amount,
        currency: response.currency || payload.currency,
        status: (response.status || 'PENDING') as 'MATCHED' | 'APPROVED' | 'PENDING',
        issueDate: response.issueDate || new Date().toISOString().split('T')[0],
        deliveryDate: response.deliveryDate || payload.delivery_date,
      };

      onPurchaseOrderCreated(newRecord);
      showToast(
        isAr ? 'تم إنشاء أمر الشراء بنجاح وتوثيقه في السجل المالي' : 'Purchase order successfully created and persisted',
        'success'
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || (isAr ? 'فشل إنشاء أمر الشراء، يرجى المحاولة ثانية' : 'Failed to create purchase order'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-xl rounded-3xl border shadow-2xl transition-all ${
          isDark ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/10 text-[#F05627]">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                {isAr ? 'إنشاء أمر شراء جديد' : 'New Purchase Order'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'إصدار أمر شراء وربطه آلياً بمطابقة الفواتير الثلاثية (3-Way Match)'
                  : 'Issue purchase order and register with 3-way matching engine'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="group rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <HoverIcon className="h-5 w-5">
              <X className="h-full w-full" />
            </HoverIcon>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* PO Number */}
            <div>
              <label htmlFor="po-number-input" className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3 text-slate-400" />
                  {isAr ? 'رقم أمر الشراء' : 'PO Number'}
                  <span className="text-[10px] font-normal text-slate-400">({isAr ? 'توليد تلقائي' : 'Auto'})</span>
                </span>
              </label>
              <input
                id="po-number-input"
                name="po_number"
                type="text"
                disabled={true}
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder={isAr ? 'يتم التوليد تلقائياً عند الحفظ' : 'Auto-generated upon save'}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-mono font-medium cursor-not-allowed opacity-75 ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/40 text-slate-400 placeholder-slate-500'
                    : 'border-slate-200 bg-slate-100 text-slate-500 placeholder-slate-400'
                }`}
              />
            </div>

            {/* Vendor / Supplier */}
            <div>
              <label htmlFor="po-vendor-name-input" className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-slate-400" />
                  {isAr ? 'اسم المورد / الشريك *' : 'Vendor / Partner *'}
                </span>
              </label>
              <input
                id="po-vendor-name-input"
                name="vendor_name"
                type="text"
                required
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder={isAr ? 'شركة أسمنت اليمامة أو المقاول العام' : 'Al-Yamama Cement Co.'}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white placeholder-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Category */}
            <div>
              <label htmlFor="po-category-select" className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3 text-slate-400" />
                  {isAr ? 'تصنيف المشتريات' : 'Category'}
                </span>
              </label>
              <select
                id="po-category-select"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-900'
                }`}
              >
                <option value={isAr ? 'مواد أولية وكسارات' : 'Raw Materials & Aggregates'}>
                  {isAr ? 'مواد أولية وكسارات' : 'Raw Materials & Aggregates'}
                </option>
                <option value={isAr ? 'قطع غيار وصيانة' : 'Maintenance & Parts'}>
                  {isAr ? 'قطع غيار وصيانة' : 'Maintenance & Parts'}
                </option>
                <option value={isAr ? 'مهمات السلامة والمستهلكات' : 'Safety Consumables'}>
                  {isAr ? 'مهمات السلامة والمستهلكات' : 'Safety Consumables'}
                </option>
                <option value={isAr ? 'محروقات وديزل الأسطول' : 'Fleet Fuel & Diesel'}>
                  {isAr ? 'محروقات وديزل الأسطول' : 'Fleet Fuel & Diesel'}
                </option>
              </select>
            </div>

            {/* Total Amount */}
            <div>
              <label htmlFor="po-total-amount-input" className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-slate-400" />
                  {isAr ? 'القيمة الإجمالية (ريال سعودي) *' : 'Total Amount (SAR) *'}
                </span>
              </label>
              <input
                id="po-total-amount-input"
                name="total_amount"
                type="number"
                required
                min="1"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-mono font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Delivery Date */}
            <div>
              <label htmlFor="po-delivery-date-input" className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  {isAr ? 'تاريخ التوريد المتوقع *' : 'Expected Delivery Date *'}
                </span>
              </label>
              <input
                id="po-delivery-date-input"
                name="delivery_date"
                type="date"
                required
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-900'
                }`}
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="po-notes-input" className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3 text-slate-400" />
                  {isAr ? 'ملاحظات أمر الشراء' : 'Purchase Order Notes'}
                </span>
              </label>
              <input
                id="po-notes-input"
                name="notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isAr ? 'توريد عاجل - موقع مشروع القدية' : 'Urgent delivery - Qiddiya Site'}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-[#F05627] ${
                  isDark
                    ? 'border-slate-700 bg-slate-900/60 text-white placeholder-slate-500'
                    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="group flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-orange-500/20 hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              <HoverIcon className="h-4 w-4">
                <ShoppingCart className="h-full w-full" />
              </HoverIcon>
              <span>
                {submitting
                  ? (isAr ? 'جاري الإصدار...' : 'Creating...')
                  : (isAr ? 'إصدار أمر الشراء' : 'Issue Purchase Order')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
