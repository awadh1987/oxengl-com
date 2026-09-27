import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Boxes,
  FileCheck2,
  ShieldCheck,
  Search,
  Plus,
  CheckCircle2,
  AlertCircle,
  Building2,
  DollarSign,
  ArrowUpDown,
  Filter,
  Upload,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Receipt,
  FileText,
  Lock,
  Unlock,
  Award,
  Layers,
  Clock,
  Eye,
  Send,
  Check,
  X,
  Trash2,
  Download,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/formatters';
import { BulkImportModal } from '../components/BulkImportModal';
import { NewPurchaseOrderModal, PurchaseOrderRecord } from '../components/NewPurchaseOrderModal';
import { erpApi, ApiProcurementBill, ApiProcurementTender, ApiProcurementBid } from '../services/api';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { BulkActionBar, BulkActionItem } from '../components/platform/BulkActionBar';

export const ProcurementView: React.FC = () => {
  const { language, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const [activeTab, setActiveTab] = useState<'orders' | 'matching' | 'tenders'>('matching');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isNewPoOpen, setIsNewPoOpen] = useState(false);

  // Tenders & eSourcing State (Phase 10)
  const [tenders, setTenders] = useState<ApiProcurementTender[]>([]);
  const [loadingTenders, setLoadingTenders] = useState<boolean>(false);
  const [selectedTenderBids, setSelectedTenderBids] = useState<ApiProcurementBid[]>([]);
  const [bidsModalTender, setBidsModalTender] = useState<ApiProcurementTender | null>(null);
  const [loadingSelectedBids, setLoadingSelectedBids] = useState<boolean>(false);
  const [unsealingTenderId, setUnsealingTenderId] = useState<string | null>(null);
  const [awardingBidId, setAwardingBidId] = useState<string | null>(null);
  const [isNewTenderOpen, setIsNewTenderOpen] = useState<boolean>(false);

  // Procurement Bills & Ledger Posting State
  const [procurementBills, setProcurementBills] = useState<ApiProcurementBill[]>([]);
  const [loadingBills, setLoadingBills] = useState<boolean>(false);
  const [postingBillId, setPostingBillId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([
    {
      id: 'po-101',
      poNumber: 'PO-2026-0089',
      vendorName: isAr ? 'مورد الصخور والركام العربي' : 'Arabian Aggregates Co.',
      category: isAr ? 'مواد خام' : 'Raw Materials',
      totalAmount: 185000,
      currency: 'SAR',
      status: 'MATCHED',
      issueDate: '2026-09-02',
      deliveryDate: '2026-09-15',
    },
    {
      id: 'po-102',
      poNumber: 'PO-2026-0094',
      vendorName: isAr ? 'شركة خدمات الصيانة الثقيلة' : 'Heavy Fleet Services Ltd.',
      category: isAr ? 'قطع غيار وصيانة' : 'Maintenance & Parts',
      totalAmount: 42800,
      currency: 'SAR',
      status: 'APPROVED',
      issueDate: '2026-09-08',
      deliveryDate: '2026-09-20',
    },
    {
      id: 'po-103',
      poNumber: 'PO-2026-0099',
      vendorName: isAr ? 'مؤسسة إمدادات السلامة الميدانية' : 'Field Safety Supplies Est.',
      category: isAr ? 'مهمات السلامة والمستهلكات' : 'Safety Consumables',
      totalAmount: 16500,
      currency: 'SAR',
      status: 'PENDING',
      issueDate: '2026-09-18',
      deliveryDate: '2026-09-25',
    },
  ]);

  const fetchBills = () => {
    setLoadingBills(true);
    erpApi
      .getProcurementBills()
      .then((bills) => {
        if (Array.isArray(bills) && bills.length > 0) {
          setProcurementBills(bills);
        }
      })
      .catch((err) => {
        console.error('Failed to load procurement bills', err);
      })
      .finally(() => setLoadingBills(false));
  };

  const fetchTenders = () => {
    setLoadingTenders(true);
    erpApi
      .getProcurementTenders()
      .then((data) => {
        if (Array.isArray(data)) {
          setTenders(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load tenders', err);
      })
      .finally(() => setLoadingTenders(false));
  };

  const handleOpenBidsModal = async (tender: ApiProcurementTender) => {
    setBidsModalTender(tender);
    setLoadingSelectedBids(true);
    try {
      const bids = await erpApi.getTenderBids(tender.id);
      setSelectedTenderBids(Array.isArray(bids) ? bids : []);
    } catch (err: any) {
      console.error('Failed to get tender bids', err);
    } finally {
      setLoadingSelectedBids(false);
    }
  };

  const handleUnsealBids = async (tenderId: string) => {
    setUnsealingTenderId(tenderId);
    try {
      const res = await erpApi.unsealTenderBids(tenderId);
      setSelectedTenderBids(res.bids);
      setTenders((prev) =>
        prev.map((t) =>
          t.id === tenderId ? { ...t, bids_unsealed: true, status: 'UNSEALED' } : t
        )
      );
      if (bidsModalTender && bidsModalTender.id === tenderId) {
        setBidsModalTender({ ...bidsModalTender, bids_unsealed: true, status: 'UNSEALED' });
      }
      setNotification({
        type: 'success',
        message: isAr
          ? `تم فض المظاريف بنجاح! تم كشف وتصنيف ${res.bids_unsealed_count} عطاءات بحسب السعر الأقل.`
          : `Unsealing ceremony complete! ${res.bids_unsealed_count} bids unsealed and ranked by lowest price.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || (isAr ? 'فشل فتح المظاريف' : 'Failed to unseal bids'),
      });
    } finally {
      setUnsealingTenderId(null);
    }
  };

  const handleAwardBid = async (tenderId: string, bidId: string) => {
    setAwardingBidId(bidId);
    try {
      const res = await erpApi.awardTenderBid(tenderId, { winning_bid_id: bidId });
      setNotification({
        type: 'success',
        message: isAr
          ? `تمت ترسية المناقصة بنجاح وتوليد أمر الشراء رقم ${res.purchase_order_number} للمورد ${res.awarded_vendor_name}!`
          : `Tender awarded! Purchase Order ${res.purchase_order_number} generated for ${res.awarded_vendor_name}!`,
      });
      fetchTenders();
      setBidsModalTender(null);
      erpApi.getPurchaseOrders().then((data) => {
        if (Array.isArray(data)) {
          setPurchaseOrders(data);
        }
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || (isAr ? 'فشل ترسية المناقصة' : 'Failed to award tender'),
      });
    } finally {
      setAwardingBidId(null);
    }
  };

  useEffect(() => {
    erpApi
      .getPurchaseOrders()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPurchaseOrders((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const existingNos = new Set(prev.map((p) => p.poNumber));
            const formatted: PurchaseOrderRecord[] = data
              .filter((d: any) => !existingIds.has(d.id) && !existingNos.has(d.poNumber || d.po_number))
              .map((d: any) => ({
                id: d.id,
                poNumber: d.poNumber || d.po_number || 'PO-2026-0000',
                vendorName: d.vendorName || d.vendor_name || 'Vendor',
                category: d.category || 'General Supplies',
                totalAmount: d.totalAmount || d.total_amount || 0,
                currency: d.currency || 'SAR',
                status: (d.status === 'MATCHED' ? 'MATCHED' : d.status === 'APPROVED' ? 'APPROVED' : 'PENDING') as
                  | 'MATCHED'
                  | 'APPROVED'
                  | 'PENDING',
                issueDate: d.issueDate || '',
                deliveryDate: d.deliveryDate || '',
              }));
            return [...formatted, ...prev];
          });
        }
      })
      .catch(() => {});

    fetchBills();
    fetchTenders();
  }, []);

  const handlePostToLedger = async (billId: string) => {
    setPostingBillId(billId);
    try {
      const entry = await erpApi.postProcurementBillToLedger(billId);
      setProcurementBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, is_posted: true, match_status: 'MATCHED', journal_entry_id: entry.id }
            : b
        )
      );
      setNotification({
        type: 'success',
        message: isAr
          ? `تم ترحيل الفاتورة بنجاح إلى دفتر الأستاذ العام (قيد رقم: ${entry.entry_number}) - مدين: ${formatCurrency(entry.total_debit, language)} / دائن: ${formatCurrency(entry.total_credit, language)}`
          : `Successfully posted bill to General Ledger (Voucher #${entry.entry_number}) - Dr: ${formatCurrency(entry.total_debit, language)} / Cr: ${formatCurrency(entry.total_credit, language)}`,
      });
      setTimeout(() => setNotification(null), 8000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message:
          err?.message ||
          (isAr ? 'فشل ترحيل الفاتورة إلى دفتر الأستاذ' : 'Failed to post bill to general ledger'),
      });
      setTimeout(() => setNotification(null), 8000);
    } finally {
      setPostingBillId(null);
    }
  };

  const filteredOrders = purchaseOrders.filter((po) => {
    if (!po) return false;
    const q = (searchTerm || '').trim().toLowerCase();
    return (
      (po.poNumber || '').toLowerCase().includes(q) ||
      (po.vendorName || '').toLowerCase().includes(q)
    );
  });

  const filteredBills = procurementBills.filter((bill) => {
    if (!bill) return false;
    const q = (searchTerm || '').trim().toLowerCase();
    return (
      (bill.invoice_number || '').toLowerCase().includes(q) ||
      (bill.vendor_name || '').toLowerCase().includes(q) ||
      (bill.purchase_order_number || '').toLowerCase().includes(q)
    );
  });

  const billsBulk = useBulkSelection(filteredBills);

  const bulkBillActions: BulkActionItem[] = [
    {
      id: 'bulk-post-gl',
      label: isAr ? 'ترحيل جماعي لدفتر الأستاذ' : 'Batch Post to GL',
      icon: <BookOpen className="h-4 w-4" />,
      variant: 'primary',
      requiresConfirmation: true,
      confirmTitle: isAr ? 'ترحيل الفواتير المحددة لدفتر الأستاذ' : 'Batch Post Bills to General Ledger',
      confirmMessage: isAr
        ? `هل أنت متأكد من ترحيل ${billsBulk.selectedCount} فواتير محددة لدفتر الأستاذ العام وتوليد القيود المحاسبية دفعة واحدة؟`
        : `Are you sure you want to post all ${billsBulk.selectedCount} selected bills to the General Ledger and generate accounting journal entries atomically?`,
      onClick: async (selectedIds) => {
        try {
          const res = await erpApi.bulkProcurementStatus({ ids: selectedIds, entity: 'procurement_bills', status: 'MATCHED' });
          if (res?.success) {
            setProcurementBills((prev) =>
              prev.map((b) => (selectedIds.includes(b.id) ? { ...b, is_posted: true, match_status: 'MATCHED' } : b))
            );
            billsBulk.clearSelection();
            setNotification({
              type: 'success',
              message: isAr
                ? `تم ترحيل ${res.affected_count || selectedIds.length} فواتير بنجاح لدفتر الأستاذ`
                : `Successfully posted ${res.affected_count || selectedIds.length} bills to General Ledger.`,
            });
            setTimeout(() => setNotification(null), 8000);
          }
        } catch (err: any) {
          setNotification({
            type: 'error',
            message: err?.message || (isAr ? 'فشل الترحيل الجماعي' : 'Batch posting failed.'),
          });
          setTimeout(() => setNotification(null), 8000);
        }
      },
    },
    {
      id: 'bulk-export-bills',
      label: isAr ? 'تصدير الفواتير المحددة' : 'Export Selected Bills',
      icon: <Download className="h-4 w-4" />,
      variant: 'default',
      onClick: async (selectedIds) => {
        try {
          const selected = procurementBills.filter((b) => selectedIds.includes(b.id));
          const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `procurement-bills-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setNotification({
            type: 'success',
            message: isAr ? `تم تصدير ${selectedIds.length} فواتير بنجاح` : `Exported ${selectedIds.length} bills successfully.`,
          });
          setTimeout(() => setNotification(null), 5000);
        } catch (err: any) {
          setNotification({
            type: 'error',
            message: isAr ? 'فشل تصدير الفواتير' : 'Export failed.',
          });
          setTimeout(() => setNotification(null), 5000);
        }
      },
    },
    {
      id: 'bulk-delete-bills',
      label: isAr ? 'حذف الفواتير المحددة' : 'Delete Selected Bills',
      icon: <Trash2 className="h-4 w-4" />,
      variant: 'danger',
      requiresConfirmation: true,
      confirmTitle: isAr ? 'تأكيد حذف الفواتير' : 'Confirm Deleting Bills',
      confirmMessage: isAr
        ? `سيتم حذف ${billsBulk.selectedCount} فواتير محددة نهائياً من سجلات المشتريات. هل تريد المتابعة؟`
        : `This will permanently delete ${billsBulk.selectedCount} selected bills. Are you sure you want to proceed?`,
      onClick: async (selectedIds) => {
        try {
          const res = await erpApi.bulkProcurementDelete({ ids: selectedIds, entity: 'procurement_bills', hard_delete: true });
          if (res?.success) {
            setProcurementBills((prev) => prev.filter((b) => !selectedIds.includes(b.id)));
            billsBulk.clearSelection();
            setNotification({
              type: 'success',
              message: isAr
                ? `تم حذف ${res.affected_count || selectedIds.length} فواتير بنجاح`
                : `Successfully deleted ${res.affected_count || selectedIds.length} bills.`,
            });
            setTimeout(() => setNotification(null), 8000);
          }
        } catch (err: any) {
          setNotification({
            type: 'error',
            message: err?.message || (isAr ? 'فشل حذف الفواتير' : 'Batch delete failed.'),
          });
          setTimeout(() => setNotification(null), 8000);
        }
      },
    },
  ];

  const postedBillsCount = procurementBills.filter((b) => b.is_posted).length;
  const totalBillsAmount = procurementBills.reduce((acc, b) => acc + (Number(b.total_billed) || 0), 0);

  return (
    <div className="space-y-6 px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto" id="procurement-view">
      {/* Toast Alert Banner */}
      {notification && (
        <div
          className={`flex items-center justify-between gap-3 p-4 rounded-2xl border shadow-sm transition-all ${
            notification.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <p className="text-xs font-bold">{notification.message}</p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div
        className={`flex flex-col justify-between gap-4 rounded-3xl border p-6 shadow-xs transition-colors sm:flex-row sm:items-center ${
          isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/10 text-[#F05627]">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                {isAr ? 'المشتريات وسلسلة التوريد (Procurement & S2P)' : 'Procurement & S2P Management'}
              </h1>
              <span className="rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-[10px] font-black text-[#F05627]">
                Double-Entry Ledger Active
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'إدارة أوامر الشراء، فواتير الموردين، المطابقة الثلاثية (3-Way Matching)، والترحيل التلقائي لدفتر الأستاذ'
                : 'Manage Purchase Orders, Vendor Invoices, 3-Way Matching, and Automated Balanced Ledger Postings'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Universal Bulk Import Button (REM-P7) */}
          <button
            id="bulk-import-procurement-btn"
            type="button"
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3.5 py-2.5 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-100 transition-colors"
            title={isAr ? 'استيراد أوامر الشراء وقاعدة البيانات الشاملة (CSV / Excel)' : 'Bulk Import (CSV/Excel)'}
          >
            <Upload className="h-4 w-4 text-emerald-700" />
            <span>{isAr ? 'استيراد بيانات / Bulk Import' : 'Bulk Import'}</span>
          </button>

          <button
            id="new-po-btn"
            type="button"
            onClick={() => setIsNewPoOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-orange-500/20 hover:bg-orange-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'أمر شراء جديد' : 'New Purchase Order'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500">
            {isAr ? 'إجمالي المشتريات المعتمدة' : 'Total Approved POs'}
          </span>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-1 text-lg font-black text-slate-900 dark:text-white">
            {formatCurrency(244300, language)}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500">
            {isAr ? 'فواتير الموردين المسجلة' : 'Vendor Bills Total'}
          </span>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-1 text-lg font-black text-blue-600">
            {formatCurrency(totalBillsAmount > 0 ? totalBillsAmount : 227800, language)}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500">
            {isAr ? 'الفواتير المرحلة لدفتر الأستاذ' : 'Posted to General Ledger'}
          </span>
          <p className="mt-1 text-lg font-black text-emerald-600">
            <span dir="ltr" className="inline-block unicode-bidi-isolate">{postedBillsCount} / {procurementBills.length || 2}</span> {isAr ? 'فاتورة مرحلة' : 'Bills Posted'}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500">
            {isAr ? 'الموردين المعتمدين' : 'Active Vendors'}
          </span>
          <p className="mt-1 text-lg font-black text-orange-600">18 {isAr ? 'مورد نشط' : 'Vendors'}</p>
        </div>
      </div>

      {/* Filter and Tab Bar */}
      <div
        className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between ${
          isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('matching')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'matching'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Receipt className="h-4 w-4 shrink-0" />
            <span>{isAr ? 'فواتير الموردين والترحيل المالي (Vendor Bills & Ledger)' : 'Vendor Bills & Ledger Posting'}</span>
            {procurementBills.some((b) => !b.is_posted) && (
              <span className="rounded-full bg-white text-orange-600 text-[10px] px-1.5 py-0.2 font-black ml-1 whitespace-nowrap shrink-0">
                {procurementBills.filter((b) => !b.is_posted).length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'orders'
                ? 'bg-slate-900 text-white dark:bg-orange-500'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Boxes className="h-4 w-4 shrink-0" />
            <span>{isAr ? 'أوامر الشراء (POs)' : 'Purchase Orders'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tenders')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'tenders'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Lock className="h-4 w-4 shrink-0" />
            <span>{isAr ? 'المناقصات والمظاريف المغلقة (eSourcing)' : 'eSourcing & Tenders'}</span>
            {tenders.length > 0 && (
              <span className="rounded-full bg-white text-amber-600 text-[10px] px-1.5 py-0.2 font-black ml-1 whitespace-nowrap shrink-0">
                {tenders.length}
              </span>
            )}
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 rtl:right-3.5 rtl:left-auto ltr:left-3.5 ltr:right-auto" />
          <input
            id="procurement-search-input"
            name="procurement_search"
            type="text"
            placeholder={
              activeTab === 'matching'
                ? isAr
                  ? 'بحث برقم الفاتورة أو المورد...'
                  : 'Search invoice # or vendor...'
                : isAr
                ? 'بحث برقم الأمر أو المورد...'
                : 'Search PO number or vendor...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 px-9 text-xs text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'matching' ? (
        /* Vendor Bills & Ledger Posting Table */
        <div
          className={`rounded-3xl border shadow-xs overflow-hidden ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr
                  ? 'فواتير الموردين الخاضعة للمطابقة والترحيل لدفتر الأستاذ العام'
                  : 'Vendor Bills - 3-Way Matched & Double-Entry General Ledger Postings'}
              </h2>
            </div>
            <button
              onClick={fetchBills}
              className="text-xs font-bold text-slate-500 hover:text-orange-500 transition-colors"
            >
              {isAr ? 'تحديث القائمة ⟳' : 'Refresh ⟳'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr
                  className={`border-b font-black ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/60 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label={isAr ? 'تحديد الكل' : 'Select all'}
                      checked={billsBulk.isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = billsBulk.isIndeterminate;
                      }}
                      onChange={billsBulk.toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">{isAr ? 'رقم الفاتورة' : 'Invoice Number'}</th>
                  <th className="py-3 px-4">{isAr ? 'المورد' : 'Vendor'}</th>
                  <th className="py-3 px-4">{isAr ? 'مرجع أمر الشراء' : 'PO Reference'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'المبلغ الصافي' : 'Subtotal'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الضريبة (15%)' : 'Tax (VAT)'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجمالي المستحق' : 'Total Billed'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'المطابقة الثلاثية' : '3-Way Match'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'دفتر الأستاذ (GL)' : 'Ledger Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجراء المالي' : 'Ledger Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loadingBills ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={`bill-skel-${idx}`} className="animate-pulse">
                      <td className="py-3.5 px-4 text-center"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-4 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-28" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-36" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                      <td className="py-3.5 px-4 text-end"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16 ms-auto" /></td>
                      <td className="py-3.5 px-4 text-end"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16 ms-auto" /></td>
                      <td className="py-3.5 px-4 text-end"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20 ms-auto" /></td>
                      <td className="py-3.5 px-4 text-center"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20 mx-auto" /></td>
                      <td className="py-3.5 px-4 text-center"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20 mx-auto" /></td>
                      <td className="py-3.5 px-4 text-center"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      {isAr ? 'لا توجد فواتير موردين مطابقة' : 'No vendor bills found.'}
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((bill) => (
                    <tr
                      key={bill.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        billsBulk.isSelected(bill.id) ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select bill ${bill.invoice_number}`}
                          checked={billsBulk.isSelected(bill.id)}
                          onChange={() => billsBulk.toggleSelect(bill.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-slate-400" />
                          <span>{bill.invoice_number}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                        {bill.vendor_name || (isAr ? 'مورد معتمد' : 'Authorized Vendor')}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {bill.purchase_order_number || 'PO-2026-0089'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        {formatCurrency(Number(bill.amount) || 0, language)}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-500">
                        {formatCurrency(Number(bill.tax_amount) || 0, language)}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-black text-emerald-600">
                        {formatCurrency(Number(bill.total_billed) || 0, language)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                            bill.match_status === 'MATCHED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}
                        >
                          {bill.match_status === 'MATCHED' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                          {bill.match_status || 'MATCHED'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                            bill.is_posted
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {bill.is_posted ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              <span>{isAr ? 'مرحل لدفتر الأستاذ' : 'POSTED'}</span>
                            </>
                          ) : (
                            <span>{isAr ? 'مسودة غير مرحلة' : 'UNPOSTED'}</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {bill.is_posted ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0"
                            title={bill.journal_entry_id ? `Journal Entry ID: ${bill.journal_entry_id}` : 'Posted'}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span>{isAr ? 'مرحل بنجاح' : 'Posted to GL'}</span>
                          </span>
                        ) : (
                          <button
                            id={`post-ledger-btn-${bill.id}`}
                            type="button"
                            onClick={() => handlePostToLedger(bill.id)}
                            disabled={postingBillId === bill.id}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>
                              {postingBillId === bill.id
                                ? isAr
                                  ? 'جاري الترحيل...'
                                  : 'Posting...'
                                : isAr
                                ? 'ترحيل لدفتر الأستاذ'
                                : 'Post to Ledger'}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Floating Bulk Action Bar for Vendor Bills */}
          <BulkActionBar
            selectedIds={billsBulk.selectedIds}
            onClearSelection={billsBulk.clearSelection}
            actions={bulkBillActions}
            itemLabel={isAr ? 'فاتورة' : 'bills'}
            isRTL={isAr}
          />
        </div>
      ) : (
        /* Purchase Orders Table */
        <div
          className={`rounded-3xl border shadow-xs overflow-hidden ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr
                  className={`border-b font-black ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/60 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <th className="py-3 px-4">{isAr ? 'رقم أمر الشراء' : 'PO Number'}</th>
                  <th className="py-3 px-4">{isAr ? 'المورد' : 'Vendor'}</th>
                  <th className="py-3 px-4">{isAr ? 'التصنيف' : 'Category'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'القيمة الإجمالية' : 'Total Amount'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'حالة المطابقة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.map((po) => (
                  <tr
                    key={po.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {po.poNumber}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                      {po.vendorName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">{po.category}</td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-600">
                      {formatCurrency(po.totalAmount, language)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-slate-500">{po.issueDate}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                          po.status === 'MATCHED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : po.status === 'APPROVED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400'
                            : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                        }`}
                      >
                        {po.status === 'MATCHED' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                        {po.status === 'PENDING' && <AlertCircle className="h-3 w-3 shrink-0" />}
                        {po.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tenders & eSourcing RFQ View (Phase 10) */}
      {activeTab === 'tenders' && (
        <div
          className={`rounded-2xl border shadow-xs overflow-hidden ${
            isDark ? 'border-slate-800 bg-[#141726]' : 'border-slate-200/80 bg-white'
          }`}
        >
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>{isAr ? 'مناقصات المنظمات الشرائية والمظاريف المغلقة' : 'Purchasing Organizations eSourcing & Tenders'}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'محرك المناقصات المشفرة: المظاريف محجوبة ومحمية بتشفير SHA-256 لمنع الاطلاع المسبق حتى مراسم الجلسة الرسمية.'
                  : 'Encrypted eSourcing Engine: Sealed quotes remain concealed until the official unsealing ceremony.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchTenders}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {isAr ? 'تحديث' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => setIsNewTenderOpen(true)}
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'طرح مناقصة جديدة' : 'New Tender'}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs rtl:text-right">
              <thead
                className={`border-b text-[11px] font-black uppercase tracking-wider ${
                  isDark
                    ? 'border-slate-800 bg-slate-900/60 text-slate-400'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                <tr>
                  <th className="py-3 px-4">{isAr ? 'رقم المناقصة / RFQ' : 'Tender / RFQ #'}</th>
                  <th className="py-3 px-4">{isAr ? 'عنوان المناقصة' : 'Title'}</th>
                  <th className="py-3 px-4">{isAr ? 'المنظمة الشرائية' : 'Purchasing Org'}</th>
                  <th className="py-3 px-4">{isAr ? 'الموعد النهائي' : 'Submission Deadline'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'تاريخ الجلسة' : 'Opening Date'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'المظاريف المقدمة' : 'Bids'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loadingTenders ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
                      {isAr ? 'جاري تحميل المناقصات...' : 'Loading tenders...'}
                    </td>
                  </tr>
                ) : tenders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      {isAr ? 'لا توجد مناقصات نشطة حالياً. اضغط "طرح مناقصة جديدة" للبدء.' : 'No active tenders found.'}
                    </td>
                  </tr>
                ) : (
                  tenders.map((t) => {
                    const isPassed = new Date(t.submission_deadline) < new Date();
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-500">
                          {t.tender_number}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {t.title}
                          <span className="block text-[10px] text-slate-400 font-normal">{t.category}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                            <Building2 className="w-3 h-3 text-amber-500" />
                            {t.purchasing_org_name || 'Central Purchasing Org'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-rose-500 font-semibold">
                          {new Date(t.submission_deadline).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-600 dark:text-slate-400">
                          {new Date(t.bid_opening_date).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 whitespace-nowrap shrink-0">
                            <Lock className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                            {t.bids_count}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                              t.status === 'AWARDED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : t.bids_unsealed
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400'
                                : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                            }`}
                          >
                            {t.status === 'AWARDED' ? (
                              <Award className="h-3 w-3 shrink-0" />
                            ) : t.bids_unsealed ? (
                              <Unlock className="h-3 w-3 shrink-0" />
                            ) : (
                              <Lock className="h-3 w-3 shrink-0" />
                            )}
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenBidsModal(t)}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3 text-slate-500" />
                              <span>{isAr ? 'المظاريف' : 'Bids'}</span>
                            </button>
                            {!t.bids_unsealed && t.status !== 'AWARDED' && (
                              <button
                                type="button"
                                disabled={unsealingTenderId === t.id}
                                onClick={() => handleUnsealBids(t.id)}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1 shadow-xs disabled:opacity-50"
                              >
                                {unsealingTenderId === t.id ? (
                                  <div className="w-2.5 h-2.5 border border-white border-t-transparent animate-spin rounded-full" />
                                ) : (
                                  <Unlock className="w-3 h-3" />
                                )}
                                <span>{isAr ? 'فض المظاريف' : 'Unseal'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bids Modal & Evaluation Ceremony */}
      {bidsModalTender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="font-mono text-xs font-bold text-amber-500">
                  {bidsModalTender.tender_number}
                </span>
                <h3 className="text-base font-black">
                  {isAr ? 'سجل المظاريف والعطاءات المقدمة' : 'Sealed Quotations & Bids Register'}
                </h3>
                <p className="text-xs text-slate-500">{bidsModalTender.title}</p>
              </div>
              <button
                onClick={() => setBidsModalTender(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Unsealing Ceremony Banner */}
            {!bidsModalTender.bids_unsealed ? (
              <div className="my-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-500 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  <Lock className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <span className="font-bold block">
                      {isAr ? 'المظاريف مغلقة ومحجوبة الأسعار' : 'Bids Currently Sealed & Masked'}
                    </span>
                    <span className="text-slate-400">
                      {isAr
                        ? 'الأسعار مشفرة بهوية SHA-256. يجب إجراء مراسم فتح المظاريف الرسمية لإزالة الحجب والترتيب المالي.'
                        : 'Prices concealed. Execute official unsealing ceremony to reveal quotations.'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={unsealingTenderId === bidsModalTender.id}
                  onClick={() => handleUnsealBids(bidsModalTender.id)}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {unsealingTenderId === bidsModalTender.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                  <span>{isAr ? 'فض المظاريف الرسمية' : 'Conduct Ceremony'}</span>
                </button>
              </div>
            ) : (
              <div className="my-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 flex items-center gap-3 text-xs">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <div>
                  <span className="font-bold block">
                    {isAr ? 'تم فتح المظاريف واعتماد الترتيب المالي' : 'Unsealing Ceremony Completed'}
                  </span>
                  <span className="text-slate-400">
                    {isAr
                      ? 'العطاءات مرتبة تلقائياً من الأقل سعراً. يمكنك ترسية المناقصة لتوليد أمر الشراء (PO) فورياً.'
                      : 'Bids sorted lowest-to-highest. Click Award to immediately generate a Purchase Order.'}
                  </span>
                </div>
              </div>
            )}

            {/* Bids List */}
            <div className="space-y-3 mt-4">
              {loadingSelectedBids ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent animate-spin rounded-full mx-auto mb-2" />
                  {isAr ? 'جاري تحميل المظاريف...' : 'Loading bids...'}
                </div>
              ) : selectedTenderBids.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs border border-dashed rounded-xl">
                  {isAr ? 'لم يقم أي مورد بتقديم مظروف حتى الآن.' : 'No bids submitted for this tender yet.'}
                </div>
              ) : (
                selectedTenderBids.map((bid, idx) => (
                  <div
                    key={bid.id}
                    className={`p-4 rounded-xl border transition ${
                      isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500">#{idx + 1}</span>
                        <span className="font-mono text-xs font-bold text-amber-500">{bid.bid_number}</span>
                        {bid.vendor_name && (
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                            - {bid.vendor_name}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            bid.status === 'AWARDED'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-slate-500/10 text-slate-500'
                          }`}
                        >
                          {bid.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right rtl:text-left">
                          <span className="text-[10px] text-slate-400 block font-semibold">
                            {isAr ? 'قيمة العطاء المالي' : 'Quoted Amount'}
                          </span>
                          <span className="text-sm font-mono font-black text-amber-500">
                            {bid.total_amount != null
                              ? formatCurrency(bid.total_amount, (language as 'ar' | 'en') || 'ar')
                              : '•••••••• SAR (مشفر)'}
                          </span>
                        </div>

                        {bidsModalTender.bids_unsealed && bidsModalTender.status !== 'AWARDED' && (
                          <button
                            type="button"
                            disabled={awardingBidId === bid.id}
                            onClick={() => handleAwardBid(bidsModalTender.id, bid.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition flex items-center gap-1 disabled:opacity-50"
                          >
                            {awardingBidId === bid.id ? (
                              <div className="w-3 h-3 border border-white border-t-transparent animate-spin rounded-full" />
                            ) : (
                              <Award className="w-3.5 h-3.5" />
                            )}
                            <span>{isAr ? 'ترسية المناقصة (PO)' : 'Award PO'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div>
                        <span>{isAr ? 'مدة التوريد:' : 'Lead Time:'}</span>{' '}
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {bid.delivery_lead_time_days} {isAr ? 'أيام' : 'days'}
                        </span>
                      </div>
                      <div>
                        <span>{isAr ? 'صلاحية العرض:' : 'Validity:'}</span>{' '}
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {bid.validity_period_days} {isAr ? 'يوم' : 'days'}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate">
                        SHA256: {bid.sealed_quote_hash?.slice(0, 16)}...
                      </div>
                    </div>

                    {bid.technical_proposal && (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 italic">
                        "{bid.technical_proposal}"
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Tender RFQ Creation Modal */}
      {isNewTenderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black">
                  {isAr ? 'طرح مناقصة وتوريد تنافسي جديد (RFQ)' : 'Create New eSourcing Tender RFQ'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr ? 'ربط مباشر بالمنظمة الشرائية ونظام المظاريف المغلقة' : 'Direct Purchasing Organization Binding'}
                </p>
              </div>
              <button
                onClick={() => setIsNewTenderOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                const title = fd.get('title') as string;
                const category = fd.get('category') as string;
                const days = Number(fd.get('duration_days')) || 7;
                const budget = Number(fd.get('budget')) || undefined;
                const itemCode = fd.get('item_code') as string || 'MAT-001';
                const itemDesc = fd.get('item_desc') as string || title;
                const itemQty = Number(fd.get('item_qty')) || 1000;
                const itemUom = fd.get('item_uom') as string || 'TON';

                const now = new Date();
                const deadline = new Date(now.getTime() + days * 86400000).toISOString();
                const opening = new Date(now.getTime() + (days + 1) * 86400000).toISOString();

                try {
                  const newTender = await erpApi.createProcurementTender({
                    company_id: '1fa3b69a-f9a1-4ab9-bd6a-c3af99b27c11',
                    purchasing_organization_id: 'c8f5636f-c097-4557-8f6d-d1a895ad1ca0',
                    title,
                    category,
                    submission_deadline: deadline,
                    bid_opening_date: opening,
                    estimated_budget: budget,
                    is_sealed_bid: true,
                    lines: [
                      {
                        item_code: itemCode,
                        description: itemDesc,
                        quantity: itemQty,
                        uom: itemUom,
                      },
                    ],
                  });

                  setTenders((prev) => [newTender, ...prev]);
                  setIsNewTenderOpen(false);
                  setNotification({
                    type: 'success',
                    message: isAr
                      ? `تم طرح المناقصة بنجاح برقم ${newTender.tender_number}!`
                      : `Tender ${newTender.tender_number} published successfully!`,
                  });
                } catch (err: any) {
                  alert(err.message || 'Failed to create tender');
                }
              }}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold mb-1">
                  {isAr ? 'عنوان المناقصة / الغرض' : 'Tender Title'}
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="توريد خرسانة إسفلتية ساخنة للمشروع الجنوبي"
                  className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">
                    {isAr ? 'التصنيف' : 'Category'}
                  </label>
                  <select
                    name="category"
                    className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent border-slate-300 dark:border-slate-700"
                  >
                    <option value="Raw Materials">{isAr ? 'مواد خام وركام' : 'Raw Materials'}</option>
                    <option value="Spare Parts">{isAr ? 'قطع غيار ومعدات' : 'Spare Parts'}</option>
                    <option value="Logistics">{isAr ? 'خدمات نقل ولوجستيات' : 'Logistics'}</option>
                    <option value="Consumables">{isAr ? 'مهمات ومستهلكات' : 'Consumables'}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">
                    {isAr ? 'فترة التقديم (أيام)' : 'Submission Period (Days)'}
                  </label>
                  <input
                    type="number"
                    name="duration_days"
                    defaultValue={10}
                    min={1}
                    className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-2">
                <span className="font-bold text-[11px] text-amber-500 block">
                  {isAr ? 'بند المواصفة الرئيسي' : 'Primary Specification Line Item'}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    name="item_code"
                    defaultValue="MAT-ASPH-01"
                    placeholder="رمز المادة / Item Code"
                    className="px-2.5 py-1.5 text-xs rounded border bg-transparent border-slate-300 dark:border-slate-700"
                  />
                  <input
                    type="text"
                    name="item_desc"
                    defaultValue="خلطة إسفلتية مطابقة للمواصفات"
                    placeholder="الوصف / Description"
                    className="px-2.5 py-1.5 text-xs rounded border bg-transparent border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    name="item_qty"
                    defaultValue={2000}
                    placeholder="الكمية / Quantity"
                    className="px-2.5 py-1.5 text-xs rounded border bg-transparent border-slate-300 dark:border-slate-700"
                  />
                  <input
                    type="text"
                    name="item_uom"
                    defaultValue="TON"
                    placeholder="الوحدة / UOM"
                    className="px-2.5 py-1.5 text-xs rounded border bg-transparent border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTenderOpen(false)}
                  className="px-4 py-2 font-bold rounded-lg border border-slate-300 dark:border-slate-700"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition"
                >
                  {isAr ? 'طرح المناقصة فورياً' : 'Publish Tender RFQ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Bulk Import Modal (REM-P7) */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        defaultCategory="operations"
      />

      {/* New Purchase Order Modal with Direct Backend Persistence & Optimistic Update */}
      <NewPurchaseOrderModal
        isOpen={isNewPoOpen}
        onClose={() => setIsNewPoOpen(false)}
        onPurchaseOrderCreated={(newPo) => {
          setPurchaseOrders((prev) => [newPo, ...prev]);
        }}
      />
    </div>
  );
};
