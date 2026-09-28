import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OperationRecord, DocumentAttachment, UOMType, SUPPORTED_UOMS } from '../types';
import {
  X,
  Plus,
  Scale,
  Calendar,
  Truck,
  Building,
  UserCheck,
  Package,
  Receipt,
  FileText,
  UploadCloud,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Paperclip,
  Calculator,
  Hash,
  Coins,
  TrendingUp,
} from 'lucide-react';
import { formatCurrency, formatTonnage, getMonthName } from '../utils/formatters';
import { QuickAddEntityModal, QuickAddEntityType } from './QuickAddEntityModal';
import { MultiAttachmentModal } from './MultiAttachmentModal';

interface DailyOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: OperationRecord | null;
}

export const DailyOperationsModal: React.FC<DailyOperationsModalProps> = ({
  isOpen,
  onClose,
  initialData,
}) => {
  const {
    operations,
    customers,
    crushers,
    transporters,
    materials,
    addOperation,
    updateOperation,
    language,
    currentUser,
    canAccessFinancials,
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

  // 1. User Input Fields State
  const [loadingDate, setLoadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [truckNo, setTruckNo] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [loadingSource, setLoadingSource] = useState('');
  const [loadingInvoiceNo, setLoadingInvoiceNo] = useState('');
  const [destinationCustomer, setDestinationCustomer] = useState('');
  const [receiptInvoiceNo, setReceiptInvoiceNo] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [uom, setUom] = useState<UOMType>((initialData?.uom as UOMType) || 'MT طن');
  const [qtyLoaded, setQtyLoaded] = useState<number | ''>(42.5);
  const [qtyDelivered, setQtyDelivered] = useState<number | ''>(42.0);
  const [scaleTicketNo, setScaleTicketNo] = useState('');
  const [salesAmountInput, setSalesAmountInput] = useState<number | ''>(1848.0);
  const [crusherPurchaseCostInput, setCrusherPurchaseCostInput] = useState<number | ''>(1062.5);
  const [crusherPaymentInput, setCrusherPaymentInput] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);
  const [scaleTicketAttachment, setScaleTicketAttachment] = useState('');

  // Unit prices helpers for smart auto-filling
  const [sellingUnitPrice, setSellingUnitPrice] = useState<number>(44);
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState<number>(25);

  // Quick Add Modal State
  const [quickAddType, setQuickAddType] = useState<QuickAddEntityType | null>(null);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);

  // Trip ID (Auto-incremented unique reference)
  const tripId = useMemo(() => {
    if (initialData) return initialData.id;
    const nextSeq = 1001 + operations.length;
    return `TRP-${nextSeq}`;
  }, [initialData, operations.length]);

  // Pre-fill defaults or edit data
  useEffect(() => {
    if (initialData) {
      setLoadingDate(initialData.loading_date);
      setTruckNo(initialData.truck_no);
      setTransporterName(initialData.transporter_name);
      setLoadingSource(initialData.loading_source);
      setLoadingInvoiceNo(initialData.loading_invoice_no);
      setDestinationCustomer(initialData.destination_customer);
      setReceiptInvoiceNo(initialData.receipt_invoice_no);
      setMaterialType(initialData.material_type);
      if (initialData.uom) {
        setUom(initialData.uom as UOMType);
      }
      setQtyLoaded(initialData.qty_loaded);
      setQtyDelivered(initialData.qty_delivered);
      setScaleTicketNo(initialData.scale_ticket_no);
      setSalesAmountInput(initialData.sales_amount);
      setCrusherPurchaseCostInput(initialData.purchases_cost);
      setCrusherPaymentInput(initialData.crusher_payment ?? 0);
      setNotes(initialData.notes || '');
      setScaleTicketAttachment(initialData.scale_ticket_attachment || '');
      setAttachments(initialData.attachments || []);
    } else {
      // Set sensible initial defaults
      if (customers.length > 0) setDestinationCustomer(customers[0].customerName);
      if (crushers.length > 0) setLoadingSource(crushers[0].crusherName);
      if (transporters.length > 0) {
        setTransporterName(transporters[0].transporterName);
        if (transporters[0].defaultTruckNo) setTruckNo(transporters[0].defaultTruckNo);
      }
      if (materials.length > 0) {
        setMaterialType(materials[0].nameAr);
        setSellingUnitPrice(materials[0].defaultSellingPrice);
        setPurchaseUnitPrice(materials[0].defaultPurchasePrice);
        const initLoaded = 42.5;
        const initDelivered = 42.0;
        setQtyLoaded(initLoaded);
        setQtyDelivered(initDelivered);
        setSalesAmountInput(Number((initDelivered * materials[0].defaultSellingPrice).toFixed(2)));
        setCrusherPurchaseCostInput(Number((initLoaded * materials[0].defaultPurchasePrice).toFixed(2)));
      }
      const randomTicket = `ST-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      const randomCR = `CR-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const randomREC = `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      setScaleTicketNo(randomTicket);
      setLoadingInvoiceNo(randomCR);
      setReceiptInvoiceNo(randomREC);
      setCrusherPaymentInput(0);
      setScaleTicketAttachment('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&auto=format&fit=crop&q=80');
      setAttachments([
        {
          id: 'att-init-1',
          fileName: 'Scale_Ticket_Scan.pdf',
          fileSize: '1.2 MB',
          fileType: 'application/pdf',
          docCategory: 'Scale Ticket',
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser?.fullName || 'Admin',
          fileData: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&auto=format&fit=crop&q=80',
        },
      ]);
    }
  }, [initialData, isOpen, customers, crushers, transporters, materials, currentUser]);

  // Sync unit prices and auto-calculate default amounts when material changes
  const handleMaterialChange = (matName: string) => {
    setMaterialType(matName);
    const found = materials.find((m) => m.nameAr === matName || m.nameEn === matName);
    if (found) {
      setSellingUnitPrice(found.defaultSellingPrice);
      setPurchaseUnitPrice(found.defaultPurchasePrice);
      const del = Number(qtyDelivered) || 0;
      const load = Number(qtyLoaded) || 0;
      setSalesAmountInput(Number((del * found.defaultSellingPrice).toFixed(2)));
      setCrusherPurchaseCostInput(Number((load * found.defaultPurchasePrice).toFixed(2)));
    }
  };

  // Sync default truck when transporter changes
  const handleTransporterChange = (tName: string) => {
    setTransporterName(tName);
    const found = transporters.find((t) => t.transporterName === tName);
    if (found && found.defaultTruckNo) {
      setTruckNo(found.defaultTruckNo);
    }
  };

  // Handle Quick Add Success
  const handleQuickAddSuccess = (createdName: string, id: string) => {
    if (quickAddType === 'Customer') {
      setDestinationCustomer(createdName);
    } else if (quickAddType === 'Crusher') {
      setLoadingSource(createdName);
    } else if (quickAddType === 'Transporter') {
      setTransporterName(createdName);
    } else if (quickAddType === 'Material') {
      handleMaterialChange(createdName);
    }
  };

  // 2. Real-Time Dynamic Auto-Calculated Fields
  const numLoaded = Number(qtyLoaded) || 0;
  const numDelivered = Number(qtyDelivered) || 0;

  // الفاقد - طن = Loaded Weight - Received Weight (if > 0, else 0)
  const qtyWastage = Number(Math.max(0, numLoaded - numDelivered).toFixed(2));

  // نسبة الفاقد % = (Wastage Tonnage / Loaded Weight) * 100
  const wastagePercentage = numLoaded > 0 ? Number(((qtyWastage / numLoaded) * 100).toFixed(2)) : 0;

  // قيمة المبيعات بدون ضريبة
  const salesAmount = Number(salesAmountInput) || 0;

  // ضريبة القيمة المضافة 15% = Sales Amount * 0.15
  const vatAmount = Number((salesAmount * 0.15).toFixed(2));

  // إجمالي المبيعات = Sales Amount + VAT
  const totalSales = Number((salesAmount + vatAmount).toFixed(2));

  // Cost of raw materials sourced from the supplier.
  const purchasesCost = Number(crusherPurchaseCostInput) || 0;

  // صافي الربح التشغيلي = Sales Amount - Crusher Purchase Cost
  const netProfit = Number((salesAmount - purchasesCost).toFixed(2));

  // المسدد للكسارة
  const paidToCrusher = Number(crusherPaymentInput) || 0;

  // الشهر: Extracted automatically from Loading Date
  const dateObj = useMemo(() => new Date(loadingDate || new Date().toISOString().slice(0, 10)), [loadingDate]);
  const opMonth = dateObj.getMonth() + 1;
  const opYear = dateObj.getFullYear();
  const monthLabel = getMonthName(opMonth, language);

  const isExcessLoss = wastagePercentage > 2.0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!truckNo || !transporterName || !destinationCustomer || !loadingSource) {
      showToast(isAr ? 'يرجى تعبئة كافة الحقول الإلزامية المطلوبة' : 'Please fill all required fields', 'warning');
      return;
    }

    const payload = {
      loading_date: loadingDate,
      truck_no: truckNo,
      transporter_name: transporterName,
      loading_source: loadingSource,
      loading_invoice_no: loadingInvoiceNo.trim() || undefined,
      destination_customer: destinationCustomer,
      receipt_invoice_no: receiptInvoiceNo.trim() || undefined,
      material_type: materialType,
      uom: uom,
      qty_loaded: numLoaded,
      qty_delivered: numDelivered,
      qty_wastage: qtyWastage,
      wastage_percentage: wastagePercentage,
      scale_ticket_no: scaleTicketNo.trim() || undefined,
      sales_amount: salesAmount,
      vat_amount: vatAmount,
      total_sales: totalSales,
      purchases_cost: purchasesCost,
      crusher_payment: paidToCrusher,
      net_profit: netProfit,
      operation_month: opMonth,
      operation_year: opYear,
      notes: notes,
      scale_ticket_attachment: scaleTicketAttachment,
      attachments: attachments,
    };

    if (initialData) {
      updateOperation(initialData.id, payload);
      showToast(isAr ? 'تم تحديث قيد العملية بنجاح' : 'Trip operation updated successfully', 'success');
    } else {
      try {
        await addOperation(payload);
        showToast(isAr ? 'تم تسجيل وقيد الرحلة بنجاح' : 'Trip operation registered successfully', 'success');
      } catch (error) {
        console.error('Could not create the weighbridge operation:', error);
        showToast(isAr ? 'تعذر حفظ تذكرة الميزان في الخادم. يرجى المحاولة مجدداً.' : 'The weighbridge ticket could not be saved to the server. Please try again.', 'error');
        return;
      }
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-operations-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="daily-operations-modal"
        className="relative my-6 w-full max-w-4xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl transition-all"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-md shadow-orange-200 dark:shadow-none">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="daily-operations-title" className="text-base font-black text-slate-900 dark:text-white">
                  {initialData
                    ? isAr
                      ? 'تعديل قيد عملية تشغيلية'
                      : 'Edit Daily Operation Entry'
                    : isAr
                    ? 'تسجيل رحلة جديدة (قيد العمليات اليومية)'
                    : 'Add New Trip (Daily Operations Entry)'}
                </h2>
                <span className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 font-mono text-[11px] font-black text-orange-700 dark:text-orange-300">
                  {tripId}
                </span>
                <span className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? `شهر ${opMonth} (${monthLabel})` : `Month: ${monthLabel}`}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'بوابة إدخال ومطابقة بيانات النقل اليومية، أوزان البسكول، واحتساب الفاقد وهوامش الربح آلياً'
                  : 'Daily haulage data entry portal mirroring official operations log with live calculations'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Live Auto-Calculated Metrics Bar (Real-Time Summary) */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl border border-orange-200/60 dark:border-slate-800 bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-slate-50 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 p-3 sm:grid-cols-5">
          <div className="rounded-xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-2 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
              {isAr ? `الفاقد (${uom})` : `Wastage (${uom})`}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-xs font-black ${qtyWastage > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                {qtyWastage.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{uom}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-2 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
              {isAr ? 'نسبة الفاقد %' : 'Wastage %'}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-xs font-black ${isExcessLoss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {wastagePercentage}%
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-2 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
              {isAr ? 'ضريبة القيمة المضافة 15%' : 'VAT 15%'}
            </span>
            <div className="text-xs font-black text-orange-950 dark:text-orange-400 font-mono mt-0.5">
              {formatCurrency(vatAmount, language)}
            </div>
          </div>

          <div className="rounded-xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-2 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
              {isAr ? 'إجمالي المبيعات' : 'Total Sales'}
            </span>
            <div className="text-xs font-black text-neutral-950 dark:text-slate-100 font-mono mt-0.5">
              {formatCurrency(totalSales, language)}
            </div>
          </div>

          <div className="rounded-xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-2 shadow-2xs col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
              {isAr ? 'صافي الربح التشغيلي' : 'Operating Profit'}
            </span>
            <div className={`text-xs font-black font-mono mt-0.5 ${netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
              {formatCurrency(netProfit, language)}
            </div>
          </div>
        </div>

        {/* Main Form Body */}
        <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Group 1: Logistics & Identification */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 p-3.5 space-y-3">
            <div className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              <span>{isAr ? 'بيانات الشاحنة ومزود الخدمة وتاريخ التحميل' : 'Logistics, Service Supplier & Date'}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 1. تاريخ التحميل */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'تاريخ التحميل *' : 'Loading Date *'}
                </label>
                <input
                  type="date"
                  value={loadingDate}
                  onChange={(e) => setLoadingDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* 2. رقم الشاحنة */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'رقم الشاحنة *' : 'Truck Number *'}
                </label>
                <input
                  type="text"
                  placeholder="مثال: 7842-ق أ د"
                  value={truckNo}
                  onChange={(e) => setTruckNo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold font-mono text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* 3. اسم الناقل - المقاول */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'اسم مزود الخدمة اللوجستية *' : 'Service Supplier Name *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuickAddType('Transporter')}
                    title={isAr ? 'إضافة مزود خدمة جديد سريعاً' : 'Quick add service supplier'}
                    className="flex items-center gap-1 rounded-md bg-orange-50 dark:bg-orange-950/40 border border-orange-200/50 dark:border-orange-800/40 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/60 transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    <span>{isAr ? 'جديد' : 'New'}</span>
                  </button>
                </div>
                <select
                  value={transporterName}
                  onChange={(e) => handleTransporterChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  {transporters.map((t) => (
                    <option key={t.id} value={t.transporterName} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {t.transporterName} ({t.driverName})
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. رقم تذكرة الميزان */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'رقم تذكرة الميزان' : 'Scale Ticket Number'}
                  <span className="text-[10px] font-normal text-slate-400 ms-1">({isAr ? 'توليد تلقائي' : 'Auto'})</span>
                </label>
                <input
                  type="text"
                  disabled={true}
                  placeholder={isAr ? 'يتم التوليد تلقائياً عند الحفظ' : 'Auto-generated upon save'}
                  value={scaleTicketNo}
                  onChange={(e) => setScaleTicketNo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 px-3 py-2 text-xs font-mono font-bold text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-75 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Group 2: Dispatch Origin, Invoices & Customer Consignee */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 p-3.5 space-y-3">
            <div className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              <span>{isAr ? 'أطراف العملية وفواتير التحميل والاستلام' : 'Parties & Commercial Invoices'}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 5. مصدر التحميل - الكسارة */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'منشأة الإرسال / مصدر التحميل *' : 'Origin / Dispatch Facility *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuickAddType('Crusher')}
                    title={isAr ? 'إضافة مورد مواد خام سريعاً' : 'Quick add raw materials supplier'}
                    className="flex items-center gap-1 rounded-md bg-orange-50 dark:bg-orange-950/40 border border-orange-200/50 dark:border-orange-800/40 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/60 transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    <span>{isAr ? 'جديد' : 'New'}</span>
                  </button>
                </div>
                <select
                  required
                  value={loadingSource}
                  onChange={(e) => setLoadingSource(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  {crushers.map((c) => (
                    <option key={c.id} value={c.crusherName} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {c.crusherName}
                    </option>
                  ))}
                </select>
              </div>

              {/* 6. رقم فاتورة التحميل */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'رقم فاتورة التحميل' : 'Loading Invoice Number'}
                  <span className="text-[10px] font-normal text-slate-400 ms-1">({isAr ? 'توليد تلقائي' : 'Auto'})</span>
                </label>
                <input
                  type="text"
                  disabled={true}
                  placeholder={isAr ? 'يتم التوليد تلقائياً عند الحفظ' : 'Auto-generated upon save'}
                  value={loadingInvoiceNo}
                  onChange={(e) => setLoadingInvoiceNo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 px-3 py-2 text-xs font-mono text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-75 focus:outline-none"
                />
              </div>

              {/* 7. العميل المستلم */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'العميل المستلم *' : 'Receiving Customer *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuickAddType('Customer')}
                    title={isAr ? 'إضافة عميل جديد سريعاً' : 'Quick add client'}
                    className="flex items-center gap-1 rounded-md bg-orange-50 dark:bg-orange-950/40 border border-orange-200/50 dark:border-orange-800/40 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/60 transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    <span>{isAr ? 'جديد' : 'New'}</span>
                  </button>
                </div>
                <select
                  value={destinationCustomer}
                  onChange={(e) => setDestinationCustomer(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  {customers.map((cust) => (
                    <option key={cust.id} value={cust.customerName} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {cust.customerName}
                    </option>
                  ))}
                </select>
              </div>

              {/* 8. رقم فاتورة الاستلام */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'رقم فاتورة الاستلام' : 'Receipt Invoice Number'}
                  <span className="text-[10px] font-normal text-slate-400 ms-1">({isAr ? 'توليد تلقائي' : 'Auto'})</span>
                </label>
                <input
                  type="text"
                  disabled={true}
                  placeholder={isAr ? 'يتم التوليد تلقائياً عند الحفظ' : 'Auto-generated upon save'}
                  value={receiptInvoiceNo}
                  onChange={(e) => setReceiptInvoiceNo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 px-3 py-2 text-xs font-mono text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-75 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Group 3: Material & Scale Weights */}
          <div className="rounded-2xl border border-orange-200/60 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/20 p-3.5 space-y-3">
            <div className="text-xs font-black text-orange-950 dark:text-orange-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                <span>{isAr ? `نوع المادة ووحدة القياس وأوزان الميزان (${uom})` : `Material, UOM & Scale Weights (${uom})`}</span>
              </div>
              <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50 px-2 py-0.5 rounded-md border border-orange-300/40 dark:border-orange-800/50">
                {isAr ? 'حساب الفاقد ونسبته آلياً' : 'Auto Wastage Calculation'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {/* 9. نوع المادة */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'نوع المادة *' : 'Material Type *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuickAddType('Material')}
                    title={isAr ? 'إضافة مادة جديدة' : 'Quick add material'}
                    className="flex items-center gap-1 rounded-md bg-orange-100 dark:bg-orange-900/40 border border-orange-300/40 dark:border-orange-800/50 px-1.5 py-0.5 text-[10px] font-bold text-orange-800 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/60 transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    <span>{isAr ? 'جديد' : 'New'}</span>
                  </button>
                </div>
                <select
                  value={materialType}
                  onChange={(e) => handleMaterialChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.nameAr} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {m.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* وحدة القياس (UOM) */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'وحدة القياس (UOM) *' : 'Unit of Measure (UOM) *'}
                </label>
                <select
                  value={uom}
                  onChange={(e) => setUom(e.target.value as UOMType)}
                  className="w-full rounded-xl border border-orange-300 dark:border-orange-900/50 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-orange-950 dark:text-orange-300 focus:border-orange-500 focus:outline-none"
                >
                  {SUPPORTED_UOMS.map((u) => (
                    <option key={u.value} value={u.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {isAr ? u.labelAr : u.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* 10. الوزن المحمل */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? `الوزن المحمل (${uom}) *` : `Loaded Weight (${uom}) *`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={qtyLoaded}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setQtyLoaded(val);
                    if (val !== '' && purchaseUnitPrice > 0) {
                      setCrusherPurchaseCostInput(Number((val * purchaseUnitPrice).toFixed(2)));
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* 11. الوزن المستلم */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? `الوزن المستلم (${uom}) *` : `Received Weight (${uom}) *`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={qtyDelivered}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setQtyDelivered(val);
                    if (val !== '' && sellingUnitPrice > 0) {
                      setSalesAmountInput(Number((val * sellingUnitPrice).toFixed(2)));
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Group 4: Financial Valuation (Sales, Purchase Cost & Paid to Crusher) */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 p-3.5 space-y-3">
            <div className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                <span>{isAr ? 'القيم المالية، التكاليف والمبيعات' : 'Financial Values & Costs'}</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                {isAr ? 'سعر الطن الافتراضي بيع/شراء: ' : 'Rates: '}
                <span className="font-bold text-slate-700 dark:text-slate-300">{sellingUnitPrice} / {purchaseUnitPrice} ر.س</span>
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* 12. قيمة المبيعات بدون ضريبة */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'قيمة المبيعات بدون ضريبة (ر.س) *' : 'Sales Amount Excl. VAT (SAR) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={salesAmountInput}
                  onChange={(e) => setSalesAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-orange-950 dark:text-orange-300 focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* 13. تكلفة الشراء من الكسارة */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'تكلفة الشراء من مورد المواد الخام (ر.س) *' : 'Raw Materials Supplier Cost (SAR) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={crusherPurchaseCostInput}
                  onChange={(e) => setCrusherPurchaseCostInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* 14. المسدد للكسارة */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'المسدد لمورد المواد الخام (ر.س)' : 'Paid to Raw Materials Supplier (SAR)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={crusherPaymentInput}
                  onChange={(e) => setCrusherPaymentInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Group 5: 15. ملاحظات (Notes) & Attachments */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'ملاحظات وتفاصيل إضافية' : 'Notes & Additional Remarks'}
              </label>
              <textarea
                rows={3}
                placeholder={isAr ? 'أدخل أي ملاحظات خاصة بالسائق أو جودة المادة أو موقع التفريغ...' : 'Enter any notes about driver, material quality, or site conditions...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-800 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'المستندات والمرفقات الثبوتية' : 'Supporting Attachments'}
                </span>
                <span className="rounded-md bg-orange-50 dark:bg-orange-950/40 border border-orange-200/50 dark:border-orange-800/40 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-400">
                  {attachments.length} {isAr ? 'مرفق' : 'files'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {isAr
                  ? 'إرفاق صورة تذكرة الميزان، بوليصة الشحن، أو إشعار الاستلام المعتمد'
                  : 'Attach weighbridge scale slip, bill of lading, or receipt stamp'}
              </p>
              <button
                type="button"
                onClick={() => setIsAttachmentModalOpen(true)}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-orange-200/80 dark:border-orange-900/60 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-orange-700 dark:text-orange-400 shadow-2xs hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span>{isAr ? 'إدارة المرفقات والمسح الضوئي' : 'Manage Attachments'}</span>
              </button>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-2 text-xs font-black text-white shadow-md shadow-orange-950/20 hover:opacity-95 transition-opacity"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {initialData
                  ? isAr
                    ? 'حفظ التعديلات'
                    : 'Save Changes'
                  : isAr
                  ? 'تسجيل وقيد الرحلة'
                  : 'Register Trip Entry'}
              </span>
            </button>
          </div>
        </form>

        {/* Quick Add Sub-Modal */}
        <QuickAddEntityModal
          isOpen={!!quickAddType}
          onClose={() => setQuickAddType(null)}
          entityType={quickAddType}
          onSuccess={handleQuickAddSuccess}
        />

        {/* Multi-Attachment Sub-Modal */}
        <MultiAttachmentModal
          isOpen={isAttachmentModalOpen}
          onClose={() => setIsAttachmentModalOpen(false)}
          recordTitle={truckNo ? `${isAr ? 'الشاحنة' : 'Truck'} ${truckNo}` : isAr ? 'رحلة جديدة' : 'New Trip'}
          recordCategory={isAr ? 'تذكرة ميزان وقيد عمليات' : 'Scale & Haulage Record'}
          attachments={attachments}
          onAddAttachment={(newAtt) => setAttachments((prev) => [...prev, newAtt])}
          onDeleteAttachment={(attId) => setAttachments((prev) => prev.filter((a) => a.id !== attId))}
        />
      </div>
    </div>
  );
};
