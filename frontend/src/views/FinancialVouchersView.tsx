import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { FinancialVoucher, VoucherType, VoucherCategory } from '../types';
import { CreateVoucherModal } from '../components/CreateVoucherModal';
import { VoucherDetailModal } from '../components/VoucherDetailModal';
import { BalancedVoucherGrid } from '../components/finance/BalancedVoucherGrid';
import {
  FileText,
  Plus,
  Search,
  Filter,
  ShieldCheck,
  Clock,
  Printer,
  Eye,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Building,
  CheckCircle2,
  Trash2,
  Download,
  DollarSign,
  Scale,
  RefreshCw,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Network,
  Upload,
} from 'lucide-react';
import { BulkImportModal } from '../components/BulkImportModal';

export const FinancialVouchersView: React.FC = () => {
  const {
    vouchers,
    language,
    approveVoucher,
    deleteVoucher,
    isAdmin,
    canApproveVouchers,
    canDeleteRecords,
    canAccessFinancials,
  } = useApp();

  const isAr = language === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | VoucherType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | VoucherCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Approved' | 'Pending_Approval'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'vouchers' | 'balanced_grid'>('vouchers');

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [selectedVoucherForView, setSelectedVoucherForView] = useState<FinancialVoucher | null>(null);
  const [createModalPrefill, setCreateModalPrefill] = useState<{
    type?: VoucherType;
    category?: VoucherCategory;
    partyType?: 'Crusher' | 'Transporter' | 'Customer' | 'Other';
    partyName?: string;
    amount?: number;
    purpose?: string;
  }>({});

  useEffect(() => {
    const handleCheckPrefill = () => {
      let prefill: any = null;
      try {
        const stored = sessionStorage.getItem('oxengl_voucher_prefill');
        if (stored) {
          prefill = JSON.parse(stored);
          sessionStorage.removeItem('oxengl_voucher_prefill');
        }
      } catch (e) {
        console.warn('Failed to parse oxengl_voucher_prefill', e);
      }

      if (!prefill && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('type') === 'debit_note' || params.get('partner') || params.get('amount')) {
          prefill = {
            type: params.get('type'),
            partner: params.get('partner') || '',
            amount: parseFloat(params.get('amount') || '0'),
            memo: params.get('memo') || '',
          };
        }
      }

      if (prefill) {
        setCreateModalPrefill({
          type: 'Payment',
          category: 'Transporter_Payment',
          partyType: 'Transporter',
          partyName: prefill.partner || '',
          amount: Number(prefill.amount) || 0,
          purpose: prefill.memo || 'خصم فاقد رحلة شاحنة',
        });
        setIsCreateModalOpen(true);
      }
    };

    handleCheckPrefill();
    window.addEventListener('popstate', handleCheckPrefill);
    return () => window.removeEventListener('popstate', handleCheckPrefill);
  }, []);

  // Stats Calculations
  const stats = useMemo(() => {
    let totalPayments = 0;
    let totalReceipts = 0;
    let pendingCount = 0;
    let approvedCount = 0;

    vouchers.forEach((v) => {
      if (v.type === 'Payment') {
        totalPayments += v.amount;
      } else {
        totalReceipts += v.amount;
      }

      if (v.status === 'Approved') {
        approvedCount++;
      } else {
        pendingCount++;
      }
    });

    const netFlow = totalReceipts - totalPayments;

    return {
      totalPayments,
      totalReceipts,
      netFlow,
      pendingCount,
      approvedCount,
      totalCount: vouchers.length,
    };
  }, [vouchers]);

  // Filtered Vouchers
  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      if (typeFilter !== 'ALL' && v.type !== typeFilter) return false;
      if (categoryFilter !== 'ALL' && v.category !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;

      if (selectedMonth !== 'ALL') {
        const vMonth = String(v.month || new Date(v.date).getMonth() + 1);
        if (vMonth !== selectedMonth) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNo = v.voucherNumber.toLowerCase().includes(q);
        const matchesParty = v.partyName.toLowerCase().includes(q);
        const matchesPurpose = v.purpose.toLowerCase().includes(q);
        const matchesRef = (v.linkedReferenceNo || '').toLowerCase().includes(q);
        const matchesTransfer = (v.transferRefNumber || '').toLowerCase().includes(q);
        if (!matchesNo && !matchesParty && !matchesPurpose && !matchesRef && !matchesTransfer) {
          return false;
        }
      }

      return true;
    });
  }, [vouchers, typeFilter, categoryFilter, statusFilter, selectedMonth, searchQuery]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const totalPages = Math.ceil(filteredVouchers.length / pageSize) || 1;
  const paginatedVouchers = useMemo(() => {
    return filteredVouchers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredVouchers, currentPage, pageSize]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  const handleExportJSONSnapshot = () => {
    const dataStr = JSON.stringify(
      {
        totalVouchers: filteredVouchers.length,
        stats,
        vouchers: filteredVouchers,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OxenGL_Financial_Vouchers_Snapshot_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const headers = isAr
      ? ['رقم السند', 'النوع', 'التصنيف', 'التاريخ', 'المستفيد / الدافع', 'المبلغ بالريال', 'طريقة السداد', 'الغرض', 'المرجع', 'الحالة']
      : ['Voucher No', 'Type', 'Category', 'Date', 'Party Name', 'Amount (SAR)', 'Method', 'Purpose', 'Ref', 'Status'];
    const rowsCsv = filteredVouchers.map((v) =>
      [
        v.voucherNumber,
        v.type,
        v.category,
        v.date,
        `"${v.partyName}"`,
        v.amount.toFixed(2),
        v.paymentMethod,
        `"${v.purpose}"`,
        v.linkedReferenceNo || '',
        v.status,
      ].join(',')
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...rowsCsv].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OxenGL_Financial_Vouchers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="financial-vouchers-view" className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">
                {isAr ? 'سندات القبض والصرف الرسمية' : 'Financial Payment & Receipt Vouchers'}
              </h1>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'الدورة المستندية المالية الكاملة بتفقيط آلي بالريال واعتمادات المدير التنفيذي (CEO)'
                  : 'Official corporate financial vouchers with automatic Arabic Tafqeet and CEO approval workflows'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs and Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-2xl border border-slate-200 bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('vouchers')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition cursor-pointer ${
                activeTab === 'vouchers'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="h-4 w-4 text-orange-600" />
              <span>{isAr ? 'سندات القبض والصرف' : 'Cash Vouchers'}</span>
            </button>
            <button
              onClick={() => setActiveTab('balanced_grid')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition cursor-pointer ${
                activeTab === 'balanced_grid'
                  ? 'bg-white text-indigo-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scale className="h-4 w-4 text-indigo-600" />
              <span>{isAr ? 'مصفوفة قيود اليومية' : 'Balanced Journal'}</span>
              <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-black text-indigo-700">
                Σ Dr = Σ Cr
              </span>
            </button>
          </div>

          {/* Action Bar Controls: Refresh, Snapshot, Excel, Print */}
          <button
            id="refresh-vouchers-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors disabled:opacity-50"
            title={isAr ? 'تحديث السندات' : 'Refresh Vouchers'}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isAr ? (isRefreshing ? 'تحديث...' : 'تحديث') : (isRefreshing ? 'Refreshing...' : 'Refresh')}</span>
          </button>

          <button
            id="export-vouchers-json-btn"
            onClick={handleExportJSONSnapshot}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs font-bold text-amber-900 shadow-xs hover:bg-amber-100 transition-colors"
            title={isAr ? 'تصدير لقطة بيانات JSON' : 'Export JSON Snapshot'}
          >
            <Download className="h-3.5 w-3.5 text-amber-700" />
            <span>{isAr ? 'لقطة JSON' : 'JSON Snapshot'}</span>
          </button>

          <button
            id="export-vouchers-excel-btn"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
            title={isAr ? 'تصدير كشف Excel' : 'Export to Excel'}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
          </button>

          <button
            id="print-vouchers-btn"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-colors"
            title={isAr ? 'طباعة كشف السندات' : 'Print Vouchers'}
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{isAr ? 'معاينة وطباعة' : 'Export & Print'}</span>
          </button>

          {canAccessFinancials && (
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', '/finance/chart');
                  window.dispatchEvent(new Event('popstate'));
                }
              }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
              title={isAr ? 'دليل الحسابات' : 'Chart of Accounts'}
            >
              <Network className="h-3.5 w-3.5 text-orange-600" />
              <span>{isAr ? 'دليل الحسابات' : 'Chart of Accounts'}</span>
            </button>
          )}

          {/* Universal Bulk Import Button (REM-P7) */}
          <button
            id="bulk-import-vouchers-btn"
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3.5 py-2 text-xs font-bold text-emerald-900 shadow-xs hover:bg-emerald-100 transition-colors"
            title={isAr ? 'استيراد سندات وحسابات وقاعدة البيانات الشاملة (CSV / Excel)' : 'Bulk Import (CSV/Excel)'}
          >
            <Upload className="h-3.5 w-3.5 text-emerald-700" />
            <span>{isAr ? 'استيراد بيانات / Bulk Import (CSV/Excel)' : 'Bulk Import (CSV/Excel)'}</span>
          </button>

          {canAccessFinancials && activeTab === 'vouchers' && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-orange-600/30 transition-all hover:bg-orange-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? 'إنشاء سند مالي جديد' : 'New Voucher'}</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'balanced_grid' ? (
        <BalancedVoucherGrid />
      ) : (
        <>
          {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Payments */}
        <div className="rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50/70 via-white to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? 'إجمالي سندات الصرف' : 'Total Payments (Outflow)'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black font-mono text-rose-700">
            {stats.totalPayments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {isAr ? 'مدفوعات موردي المواد الخام ومزودي الخدمات والتشغيل' : 'Raw materials, service suppliers & operations'}
          </p>
        </div>

        {/* Total Receipts */}
        <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? 'إجمالي سندات القبض' : 'Total Receipts (Inflow)'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black font-mono text-emerald-700">
            {stats.totalReceipts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {isAr ? 'تحصيلات العملاء والمبيعات' : 'Customer collections & revenue'}
          </p>
        </div>

        {/* Net Flow */}
        <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50/70 via-white to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? 'صافي حركة الصندوق / البنك' : 'Net Documented Flow'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <p className={`mt-3 text-2xl font-black font-mono ${stats.netFlow >= 0 ? 'text-orange-950' : 'text-amber-700'}`}>
            {stats.netFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {isAr ? 'الفارق بين المقبوض والمصروف' : 'Net documented cash position'}
          </p>
        </div>

        {/* Approvals & Document Count */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? 'حالة الاعتمادات والتواقيع' : 'Approval & Sealing'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-2 sm:gap-3">
            <span className="text-2xl font-black font-mono text-slate-900 whitespace-nowrap">
              {stats.totalCount}
            </span>
            <span className="text-xs font-bold text-emerald-600 whitespace-nowrap">
              ({stats.approvedCount} {isAr ? 'معتمد' : 'approved'})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-amber-600 font-semibold">
            {stats.pendingCount > 0
              ? isAr ? `يوجد (${stats.pendingCount}) سند بانتظار اعتماد المدير العام` : `${stats.pendingCount} pending CEO approval`
              : isAr ? 'جميع السندات معتمدة ومختومة' : 'All vouchers fully approved'}
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isAr
                ? 'بحث برقم السند، اسم المستفيد/الدافع، الغرض، أو رقم المرجع...'
                : 'Search by voucher no, party name, purpose, ref...'
            }
            className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-4 pr-10 text-xs font-medium text-slate-900 focus:border-orange-500 focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            <option value="ALL">{isAr ? 'جميع الأنواع' : 'All Types'}</option>
            <option value="Payment">{isAr ? 'سندات صرف فقط' : 'Payment Only'}</option>
            <option value="Receipt">{isAr ? 'سندات قبض فقط' : 'Receipt Only'}</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            <option value="ALL">{isAr ? 'جميع التصنيفات' : 'All Categories'}</option>
            <option value="Crusher_Settlement">{isAr ? 'مستحقات موردي المواد الخام' : 'Raw Materials Suppliers'}</option>
            <option value="Transporter_Payment">{isAr ? 'مستحقات مزودي الخدمات' : 'Service Suppliers'}</option>
            <option value="Customer_Collection">{isAr ? 'تحصيلات عملاء' : 'Customers'}</option>
            <option value="Operational_Expense">{isAr ? 'مصروفات تشغيلية' : 'Ops Expenses'}</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            <option value="ALL">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="Approved">{isAr ? 'معتمد ومختوم' : 'Approved'}</option>
            <option value="Pending_Approval">{isAr ? 'قيد الاعتماد' : 'Pending Approval'}</option>
          </select>

          {/* Month Filter */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            <option value="ALL">{isAr ? 'جميع الأشهر' : 'All Months'}</option>
            <option value="8">{isAr ? 'أغسطس (August)' : 'August'}</option>
            <option value="7">{isAr ? 'يوليو (July)' : 'July'}</option>
            <option value="6">{isAr ? 'يونيو (June)' : 'June'}</option>
          </select>
        </div>
      </div>

      {/* Vouchers Data Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3.5">{isAr ? 'رقم السند' : 'Voucher No'}</th>
                <th className="px-4 py-3.5">{isAr ? 'النوع / التصنيف' : 'Type / Category'}</th>
                <th className="px-4 py-3.5">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="px-4 py-3.5">{isAr ? 'المستفيد / الدافع' : 'Beneficiary / Payer'}</th>
                <th className="px-4 py-3.5">{isAr ? 'المبلغ بالريال' : 'Amount (SAR)'}</th>
                <th className="px-4 py-3.5">{isAr ? 'طريقة السداد' : 'Method'}</th>
                <th className="px-4 py-3.5">{isAr ? 'الغرض والمرجع' : 'Purpose & Ref'}</th>
                <th className="px-4 py-3.5">{isAr ? 'الحالة والاعتماد' : 'Status'}</th>
                <th className="px-4 py-3.5 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <FileText className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="font-bold">{isAr ? 'لا توجد سندات مالية مطابقة' : 'No vouchers found'}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isAr ? 'يمكنك إنشاء سند صرف أو قبض جديد بسهولة' : 'Create a new voucher using the button above'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedVouchers.map((vch) => {
                  const isPayment = vch.type === 'Payment';
                  return (
                    <tr key={vch.id} className="transition-colors hover:bg-slate-50/80">
                      {/* Voucher No */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedVoucherForView(vch)}
                          className="font-mono font-black text-orange-700 hover:underline hover:text-orange-950"
                        >
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{vch.voucherNumber}</span>
                        </button>
                      </td>

                      {/* Type / Category */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center whitespace-nowrap shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black ${
                              isPayment
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isPayment ? (isAr ? 'صرف' : 'Payment') : (isAr ? 'قبض' : 'Receipt')}
                          </span>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            {vch.category === 'Crusher_Settlement' ? (isAr ? 'مورد مواد خام' : 'Raw Materials Supplier') :
                             vch.category === 'Transporter_Payment' ? (isAr ? 'مزود خدمة' : 'Service Supplier') :
                             vch.category === 'Customer_Collection' ? (isAr ? 'عميل' : 'Customer') :
                             (isAr ? 'تشغيل' : 'Ops')}
                          </span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-slate-600">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{vch.date}</span>
                      </td>

                      {/* Party Name */}
                      <td className="px-4 py-3.5">
                        <div className="max-w-[180px] truncate">
                          <span className="font-bold text-slate-900 block truncate">{vch.partyName}</span>
                          {vch.partyTaxNumber && (
                            <span className="font-mono text-[10px] text-slate-400">
                              VAT: <span dir="ltr" className="inline-block unicode-bidi-isolate">{vch.partyTaxNumber}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <span
                            className={`font-mono text-sm font-black ${
                              isPayment ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            <span dir="ltr" className="inline-block unicode-bidi-isolate">{vch.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </span>
                          <span className="text-[9px] text-slate-400 mr-1">SAR</span>
                          <p className="text-[10px] text-slate-500 truncate max-w-[180px] italic">
                            {vch.amountInWordsAr}
                          </p>
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="text-[11px] text-slate-700">
                          <span className="font-semibold block">
                            {vch.paymentMethod === 'Bank Transfer' ? (isAr ? 'تحويل بنكي' : 'Bank Transfer') :
                             vch.paymentMethod === 'Cheque' ? (isAr ? 'شيك مصرفي' : 'Cheque') :
                             vch.paymentMethod === 'Cash' ? (isAr ? 'نقداً' : 'Cash') :
                             (isAr ? 'مقاصة' : 'Credit Memo')}
                          </span>
                          {vch.bankName && (
                            <span className="text-[10px] text-slate-400">{vch.bankName}</span>
                          )}
                        </div>
                      </td>

                      {/* Purpose & Ref */}
                      <td className="px-4 py-3.5">
                        <div className="max-w-[200px]">
                          <p className="truncate text-[11px] text-slate-800 font-medium">{vch.purpose}</p>
                          {vch.linkedReferenceNo && (
                            <span className="font-mono text-[10px] text-orange-700 block">
                              Ref: {vch.linkedReferenceNo}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {vch.status === 'Approved' ? (
                            <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span>{isAr ? 'معتمد ومختوم' : 'Approved'}</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 border border-amber-200 whitespace-nowrap shrink-0">
                              <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span>{isAr ? 'قيد المراجعة' : 'Pending CEO'}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View & Print Document */}
                          <button
                            onClick={() => setSelectedVoucherForView(vch)}
                            className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 shadow-2xs hover:border-orange-300 hover:bg-orange-50 hover:text-orange-950"
                            title={isAr ? 'معاينة وطباعة رسمية' : 'View & Print'}
                          >
                            <Printer className="h-3.5 w-3.5 text-slate-500" />
                            <span className="hidden sm:inline">{isAr ? 'معاينة' : 'View'}</span>
                          </button>

                          {/* Quick CEO Approve if Pending */}
                          {vch.status !== 'Approved' && canApproveVouchers && (
                            <button
                              onClick={() => approveVoucher(vch.id, 'اعتماد سريع من جدول السندات المالية')}
                              className="flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
                              title={isAr ? 'اعتماد وختم السند فورياً' : 'Approve'}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">{isAr ? 'اعتماد' : 'Approve'}</span>
                            </button>
                          )}

                          {/* Delete if allowed */}
                          {canDeleteRecords && (
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    isAr
                                      ? `هل أنت متأكد من حذف السند (${vch.voucherNumber})؟`
                                      : `Delete voucher ${vch.voucherNumber}?`
                                  )
                                ) {
                                  deleteVoucher(vch.id);
                                }
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              title={isAr ? 'حذف السند' : 'Delete'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

        {/* Table Pagination Bar */}
        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs text-slate-500">
          <div>
            {isAr
              ? `عرض ${paginatedVouchers.length} من أصل ${filteredVouchers.length} سند مالي`
              : `Showing ${paginatedVouchers.length} of ${filteredVouchers.length} vouchers`}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              {isAr ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              <span>{isAr ? 'السابق' : 'Previous'}</span>
            </button>
            <span className="font-mono font-bold text-slate-900 px-2">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <span>{isAr ? 'التالي' : 'Next'}</span>
              {isAr ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      </>
      )}

      {/* Create Voucher Modal */}
      <CreateVoucherModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateModalPrefill({});
        }}
        initialType={createModalPrefill.type || 'Payment'}
        initialCategory={createModalPrefill.category || 'Transporter_Payment'}
        initialPartyType={createModalPrefill.partyType || 'Transporter'}
        initialPartyName={createModalPrefill.partyName || ''}
        initialAmount={createModalPrefill.amount || 0}
        initialPurpose={createModalPrefill.purpose || ''}
        onSuccess={(created) => {
          setSelectedVoucherForView(created);
        }}
      />

      {/* Voucher Detail & Print Modal */}
      <VoucherDetailModal
        voucher={selectedVoucherForView}
        isOpen={!!selectedVoucherForView}
        onClose={() => setSelectedVoucherForView(null)}
      />

      {/* Universal Bulk Import Modal (REM-P7) */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        defaultCategory="operations"
      />
    </div>
  );
};
