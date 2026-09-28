import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { OperationRecord } from '../types';
import {
  Plus,
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  Trash2,
  Edit,
  Eye,
  Scale,
  Calendar,
  Truck,
  Building,
  AlertTriangle,
  FileText,
  RefreshCw,
  CheckCircle2,
  Printer,
} from 'lucide-react';
import { formatCurrency, formatDate, formatTonnage } from '../utils/formatters';
import { exportOperationsToExcel } from '../utils/excelExporter';
import { DailyOperationsModal } from '../components/DailyOperationsModal';
import { ScaleTicketViewerModal } from '../components/ScaleTicketViewerModal';
import { MultiAttachmentModal } from '../components/MultiAttachmentModal';
import { ExportPrintModal } from '../components/ExportPrintModal';
import { BulkImportModal } from '../components/BulkImportModal';
import { ImportSystemResourceModal } from '../components/ImportSystemResourceModal';
import { Paperclip, Upload, Database } from 'lucide-react';
import { HoverIcon } from '../components/common/HoverIcon';

export const OperationsLogView: React.FC = () => {
  const {
    accessibleOperations,
    deleteOperation,
    refreshOperations,
    language,
    currentUser,
    canEditOperations,
    canDeleteRecords,
    canAccessFinancials,
    customers,
    crushers,
    transporters,
    materials,
    isDriverMode,
    exportDailyOperationsSnapshotJSON,
  } = useApp();

  const isAr = language === 'ar';
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters state
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('search') || '';
    }
    return '';
  });

  useEffect(() => {
    const handleUrlSearch = () => {
      const params = new URLSearchParams(window.location.search);
      const querySearch = params.get('search');
      if (querySearch !== null) {
        setSearchTerm(querySearch);
      }
    };
    window.addEventListener('popstate', handleUrlSearch);
    return () => window.removeEventListener('popstate', handleUrlSearch);
  }, []);

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedCrusher, setSelectedCrusher] = useState('');
  const [selectedTransporter, setSelectedTransporter] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [filterExcessLoss, setFilterExcessLoss] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingOperation, setEditingOperation] = useState<OperationRecord | null>(null);
  const [previewTicketOperation, setPreviewTicketOperation] = useState<OperationRecord | null>(null);
  const [attachmentViewingOp, setAttachmentViewingOp] = useState<OperationRecord | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isLegacyImportOpen, setIsLegacyImportOpen] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  // Dynamic Month Tabs Generation
  const availableMonths = useMemo(() => {
    const currentMonth = new Date().getMonth() + 1;
    const opMonths = accessibleOperations
      .map((op) => op.operation_month)
      .filter((m): m is number => typeof m === 'number' && m >= 1 && m <= 12);
    const maxMonth = Math.max(currentMonth, ...opMonths, 8);
    const months: string[] = ['ALL'];
    for (let m = maxMonth; m >= 1; m--) {
      months.push(String(m));
    }
    return months;
  }, [accessibleOperations]);

  // Filtered dataset
  const filteredOperations = useMemo(() => {
    return accessibleOperations.filter((op) => {
      if (!op) return false;

      // Search term
      if (searchTerm) {
        const q = (searchTerm || '').trim().toLowerCase();
        const matches =
          (op.truck_no || '').toLowerCase().includes(q) ||
          (op.scale_ticket_no || '').toLowerCase().includes(q) ||
          (op.loading_invoice_no || '').toLowerCase().includes(q) ||
          (op.receipt_invoice_no || '').toLowerCase().includes(q) ||
          (op.destination_customer || '').toLowerCase().includes(q) ||
          (op.transporter_name || '').toLowerCase().includes(q) ||
          (op.loading_source || '').toLowerCase().includes(q) ||
          (op.driver_name || '').toLowerCase().includes(q) ||
          ((op as any).driverName || '').toLowerCase().includes(q) ||
          (op.material_type || '').toLowerCase().includes(q) ||
          (op.notes || '').toLowerCase().includes(q) ||
          String(op.qty_loaded || '').includes(q) ||
          String(op.qty_delivered || '').includes(q) ||
          String(op.sales_amount || '').includes(q);
        if (!matches) return false;
      }

      if (selectedCustomer && !(op.destination_customer || '').includes(selectedCustomer)) return false;
      if (selectedCrusher && !(op.loading_source || '').includes(selectedCrusher)) return false;
      if (selectedTransporter && !(op.transporter_name || '').includes(selectedTransporter)) return false;
      if (selectedMaterial && (op.material_type || '') !== selectedMaterial) return false;
      if (selectedMonth !== 'ALL' && op.operation_month !== Number(selectedMonth)) return false;
      if (filterExcessLoss && (op.wastage_percentage || 0) <= 2.0) return false;

      return true;
    });
  }, [
    accessibleOperations,
    searchTerm,
    selectedCustomer,
    selectedCrusher,
    selectedTransporter,
    selectedMaterial,
    selectedMonth,
    filterExcessLoss,
  ]);

  const totalPages = Math.ceil(filteredOperations.length / pageSize) || 1;
  const paginatedOperations = filteredOperations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Aggregate statistics for current view
  const currentTotalLoaded = filteredOperations.reduce((acc, c) => acc + (c?.qty_loaded || 0), 0);
  const currentTotalDelivered = filteredOperations.reduce((acc, c) => acc + (c?.qty_delivered || 0), 0);
  const currentTotalWastage = filteredOperations.reduce((acc, c) => acc + (c?.qty_wastage || 0), 0);
  const currentTotalSales = filteredOperations.reduce((acc, c) => acc + (c?.sales_amount || 0), 0);

  const handleDelete = (id: string) => {
    if (confirm(isAr ? 'هل أنت متأكد من رغبتك في حذف هذا السجل التشغيلي؟' : 'Delete this haulage record?')) {
      deleteOperation(id);
    }
  };

  const handleExportExcel = () => {
    exportOperationsToExcel(filteredOperations, `OxenGL_Operations_Log_${selectedMonth}`);
  };

  const handleExportJSONSnapshot = () => {
    exportDailyOperationsSnapshotJSON();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshOperations();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-5 px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto" id="operations-log-view">
      {/* Top Header & Actions */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-[#090f1c] p-5 shadow-lg sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <h1 className="text-xl font-black text-slate-100">
              {isAr ? 'قيد العمليات اليومية' : 'Daily Operations Entry Portal'}
            </h1>
            <span className="rounded-md bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 text-xs font-bold text-orange-400 whitespace-nowrap shrink-0">
              {filteredOperations.length} {isAr ? 'رحلة مسجلة' : 'trips'}
            </span>
            {isDriverMode && (
              <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-black text-amber-300 flex items-center gap-1 whitespace-nowrap shrink-0">
                <Truck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>{isAr ? 'وضع السائقين نشط' : 'Driver View Active'}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isAr
              ? 'بوابة تسجيل ومطابقة الحمولات اليومية، أوزان تذاكر الميزان (بسكول)، وحساب الفاقد وهوامش الربحية آلياً'
              : 'Official daily operations log mirroring Excel dispatch sheets, weighbridge verification, and live margin calculation'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live Server Refresh Button */}
          <button
            id="refresh-operations-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="group flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-xs hover:bg-slate-700 disabled:opacity-50 transition-colors"
            title={isAr ? 'تحديث العمليات مباشرة من خادم PostgreSQL' : 'Refresh Operations Live from Server'}
          >
            <HoverIcon className="h-4 w-4">
              <RefreshCw className={`h-full w-full text-orange-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </HoverIcon>
            <span>{isAr ? (isRefreshing ? 'جارِ التحديث...' : 'تحديث السجل') : (isRefreshing ? 'Refreshing...' : 'Refresh')}</span>
          </button>

          {/* JSON Data Snapshot Export Button */}
          <button
            id="export-json-snapshot-btn"
            onClick={handleExportJSONSnapshot}
            className="group flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-300 shadow-xs hover:bg-amber-500/20 transition-colors"
            title={isAr ? 'تصدير لقطة بيانات JSON لعمليات اليوم للتدقيق والمطابقة' : 'Export Today JSON Snapshot for Local Audit'}
          >
            <HoverIcon className="h-4 w-4">
              <Download className="h-full w-full text-amber-400" />
            </HoverIcon>
            <span>{isAr ? 'لقطة بيانات JSON' : 'JSON Snapshot'}</span>
          </button>

          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="group flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3.5 py-2 text-xs font-bold text-orange-400 shadow-xs hover:bg-orange-500/20 transition-colors"
            title={isAr ? 'معاينة وطباعة سجل العمليات اليومية' : 'Live Print Preview & Export'}
          >
            <HoverIcon className="h-4 w-4">
              <Printer className="h-full w-full text-orange-400" />
            </HoverIcon>
            <span>{isAr ? 'معاينة وطباعة (Print)' : 'Export & Print'}</span>
          </button>

          {/* Universal Bulk Import Button (REM-P7) */}
          <button
            id="bulk-import-operations-btn"
            onClick={() => setIsBulkImportOpen(true)}
            className="group flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-400 shadow-xs hover:bg-emerald-500/20 transition-colors"
            title={isAr ? 'استيراد عمليات وقاعدة البيانات الشاملة من ملف Excel أو CSV' : 'Bulk Import Operations & Comprehensive Log from Excel/CSV'}
          >
            <HoverIcon className="h-4 w-4">
              <Upload className="h-full w-full text-emerald-400" />
            </HoverIcon>
            <span>{isAr ? 'استيراد بيانات / Bulk Import (CSV/Excel)' : 'Bulk Import (CSV/Excel)'}</span>
          </button>

          {/* Legacy System Resource Bridge Button (Sprint 7) */}
          <button
            id="import-system-resource-btn"
            onClick={() => setIsLegacyImportOpen(true)}
            className="group flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3.5 py-2 text-xs font-bold text-orange-400 shadow-xs hover:bg-orange-500/20 transition-colors"
            title={isAr ? 'استيراد وامتصاص ملف قاعدة البيانات التاريخية System Resource.xlsx' : 'Import Legacy System Resource Excel (.xlsx)'}
          >
            <HoverIcon className="h-4 w-4">
              <Database className="h-full w-full text-orange-400" />
            </HoverIcon>
            <span>{isAr ? 'جسر البيانات التاريخية (System Resource)' : 'Import System Resource (.xlsx)'}</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="group flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-xs hover:bg-slate-700 transition-colors"
            title={isAr ? 'تصدير جدول العمليات إلى Excel' : 'Export to Excel'}
          >
            <HoverIcon className="h-4 w-4">
              <FileSpreadsheet className="h-full w-full text-emerald-400" />
            </HoverIcon>
            <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
          </button>

          {canEditOperations && (
            <button
              id="new-operation-btn"
              onClick={() => {
                setEditingOperation(null);
                setIsNewModalOpen(true);
              }}
              className="group flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-orange-500/20 hover:opacity-95 transition-opacity"
            >
              <HoverIcon className="h-4 w-4">
                <Plus className="h-full w-full" />
              </HoverIcon>
              <span>{isAr ? 'تسجيل رحلة جديدة' : 'Add New Trip'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Mini-Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 rounded-2xl border border-slate-800 bg-[#0e1424] p-4 shadow-lg">
        <div>
          <span className="text-[11px] font-semibold text-slate-400">{isAr ? 'عدد الرحلات المفلترة' : 'Filtered Trips'}</span>
          <p className="text-lg font-black text-slate-100"><span dir="ltr" className="inline-block unicode-bidi-isolate">{filteredOperations.length}</span> {isAr ? 'رحلة' : 'trips'}</p>
        </div>
        <div>
          <span className="text-[11px] font-semibold text-slate-400">{isAr ? 'إجمالي الكميات المحملة' : 'Total Loaded Qty'}</span>
          <p className="text-lg font-black text-slate-100"><span dir="ltr" className="inline-block unicode-bidi-isolate">{formatTonnage(currentTotalLoaded, language)}</span></p>
        </div>
        <div>
          <span className="text-[11px] font-semibold text-slate-400">{isAr ? 'إجمالي الكميات المستلمة' : 'Net Delivered Qty'}</span>
          <p className="text-lg font-black text-orange-400"><span dir="ltr" className="inline-block unicode-bidi-isolate">{formatTonnage(currentTotalDelivered, language)}</span></p>
        </div>
        <div>
          <span className="text-[11px] font-semibold text-slate-400">{isAr ? 'إجمالي كمية الفاقد' : 'Total Wastage Loss'}</span>
          <p className="text-lg font-black text-rose-400"><span dir="ltr" className="inline-block unicode-bidi-isolate">{formatTonnage(currentTotalWastage, language)}</span></p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-slate-800 bg-[#090f1c] p-4 shadow-lg">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {/* Search Box */}
          <div className="relative lg:col-span-2">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={isAr ? 'بحث برقم الشاحنة، التذكرة، العميل، مورد المواد...' : 'Search truck, ticket, customer, supplier...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2 pr-9 pl-3 text-xs text-slate-100 placeholder-slate-400 focus:border-orange-500 focus:bg-slate-800 focus:outline-none"
            />
          </div>

          {/* Customer filter */}
          <div>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-slate-100 focus:border-orange-500 focus:bg-slate-800 focus:outline-none"
            >
              <option className="bg-slate-800 text-slate-100" value="">{isAr ? 'كافة العملاء' : 'All Customers'}</option>
              {customers.map((c) => (
                <option className="bg-slate-800 text-slate-100" key={c.id} value={c.customerName}>
                  {c.customerName}
                </option>
              ))}
            </select>
          </div>

          {/* Crusher filter */}
          <div>
            <select
              value={selectedCrusher}
              onChange={(e) => setSelectedCrusher(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-slate-100 focus:border-orange-500 focus:bg-slate-800 focus:outline-none"
            >
              <option className="bg-slate-800 text-slate-100" value="">{isAr ? 'كافة موردي المواد' : 'All Material Suppliers'}</option>
              {crushers.map((c) => (
                <option className="bg-slate-800 text-slate-100" key={c.id} value={c.crusherName}>
                  {c.crusherName}
                </option>
              ))}
            </select>
          </div>

          {/* Transporter filter */}
          <div>
            <select
              value={selectedTransporter}
              onChange={(e) => setSelectedTransporter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-slate-100 focus:border-orange-500 focus:bg-slate-800 focus:outline-none"
            >
              <option className="bg-slate-800 text-slate-100" value="">{isAr ? 'كافة موردي الخدمات' : 'All Service Suppliers'}</option>
              {transporters.map((t) => (
                <option className="bg-slate-800 text-slate-100" key={t.id} value={t.transporterName}>
                  {t.transporterName}
                </option>
              ))}
            </select>
          </div>

          {/* Material filter */}
          <div>
            <select
              value={selectedMaterial}
              onChange={(e) => setSelectedMaterial(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-slate-100 focus:border-orange-500 focus:bg-slate-800 focus:outline-none"
            >
              <option className="bg-slate-800 text-slate-100" value="">{isAr ? 'كافة المواد' : 'All Materials'}</option>
              {materials.map((m) => (
                <option className="bg-slate-800 text-slate-100" key={m.id} value={m.nameAr}>
                  {m.nameAr}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Second row filters: Month & Excess Wastage Toggle */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-400 whitespace-nowrap">{isAr ? 'الشهر المالي:' : 'Month:'}</span>
            <div className="flex flex-wrap gap-1">
              {availableMonths.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                    selectedMonth === m
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {m === 'ALL' ? (isAr ? 'الكل' : 'All') : `${m}/${new Date().getFullYear()}`}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-rose-900/40 bg-rose-950/30 px-3 py-1 text-xs font-bold text-rose-300">
            <input
              type="checkbox"
              checked={filterExcessLoss}
              onChange={(e) => setFilterExcessLoss(e.target.checked)}
              className="rounded text-rose-500 focus:ring-rose-500 bg-slate-800 border-slate-700"
            />
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            <span>{isAr ? 'عرض فاقد الوزن المرتفع فقط (>2%)' : 'High Loss Only (>2%)'}</span>
          </label>
        </div>
      </div>

      {/* Main Operations Table */}
      <div className="rounded-2xl border border-slate-800 bg-[#090f1c] shadow-lg overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-white font-bold">
                <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'رقم الرحلة' : 'Trip ID'}</th>
                <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'تاريخ التحميل' : 'Date'}</th>
                <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'رقم الشاحنة' : 'Truck #'}</th>
                <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'مزود الخدمة اللوجستية' : 'Service Supplier'}</th>
                <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'منشأة الإرسال' : 'Origin / Dispatch Facility'}</th>
                <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'العميل المستلم' : 'Destination Client'}</th>
                <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'نوع المادة' : 'Material'}</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">{isAr ? 'الكمية المحملة' : 'Loaded Qty'}</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">{isAr ? 'الكمية المستلمة' : 'Delivered Qty'}</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">{isAr ? 'الفاقد / الهدر (%)' : 'Wastage (%)'}</th>
                {canAccessFinancials && (
                  <>
                    <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'المبيعات بدون ضريبة' : 'Sales Excl. VAT'}</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'تكلفة الشراء' : 'Purchase Cost'}</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'المسدد لمورد المواد الخام' : 'Paid to Raw Materials Supplier'}</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">{isAr ? 'صافي الربح' : 'Net Profit'}</th>
                  </>
                )}
                <th className="py-3.5 px-3 text-center whitespace-nowrap">{isAr ? 'تذكرة الميزان' : 'Scale Ticket'}</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">{isAr ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {paginatedOperations.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-slate-400">
                    {isAr ? 'لا توجد سجلات مطابقة لمعايير البحث الحالية' : 'No records found matching filters'}
                  </td>
                </tr>
              ) : (
                paginatedOperations.map((op) => {
                  const isHighLoss = op.wastage_percentage > 2.0;
                  const displayTripId = op.id.startsWith('TRP-')
                    ? op.id
                    : `TRP-${op.id.replace(/[^0-9]/g, '').slice(-4) || '1001'}`;
                  const rowUom = op.uom ? (op.uom === 'MT طن' ? (isAr ? 'MT طن' : 'MT') : op.uom) : (isAr ? 'MT طن' : 'MT');

                  return (
                    <tr key={op.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-orange-400 whitespace-nowrap">
                        <span className="rounded-md bg-orange-500/10 px-1.5 py-0.5 border border-orange-500/20">
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{displayTripId}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-300 whitespace-nowrap">
                        {formatDate(op.loading_date, language)}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-100 whitespace-nowrap font-mono">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{op.truck_no}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        {op.transporter_name}
                      </td>
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        <div>{op.loading_source}</div>
                        {op.loading_invoice_no && (
                          <div className="text-[10px] text-slate-400 font-mono"><span dir="ltr" className="inline-block unicode-bidi-isolate">{op.loading_invoice_no}</span></div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-200 whitespace-nowrap">
                        <div>{op.destination_customer}</div>
                        {op.receipt_invoice_no && (
                          <div className="text-[10px] text-slate-400 font-mono"><span dir="ltr" className="inline-block unicode-bidi-isolate">{op.receipt_invoice_no}</span></div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-300 whitespace-nowrap shrink-0">
                          {op.material_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-semibold text-slate-200">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{op.qty_loaded} {rowUom}</span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-100">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{op.qty_delivered} {rowUom}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold whitespace-nowrap shrink-0 ${
                            isHighLoss ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{op.qty_wastage} {rowUom} ({op.wastage_percentage}%)</span>
                        </span>
                      </td>
                      {canAccessFinancials && (
                        <>
                          <td className="py-3 px-3 font-semibold text-slate-100 whitespace-nowrap font-mono">
                            <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(op.sales_amount, language)}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap font-mono">
                            <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(op.purchases_cost, language)}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-400 whitespace-nowrap font-mono">
                            <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(op.crusher_payment ?? 0, language)}</span>
                          </td>
                          <td className="py-3 px-3 font-bold text-emerald-400 whitespace-nowrap font-mono">
                            <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(op.net_profit, language)}</span>
                          </td>
                        </>
                      )}
                      <td className="py-3 px-3 text-center whitespace-nowrap font-mono">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <span className="text-[11px] text-slate-300 font-semibold whitespace-nowrap"><span dir="ltr" className="inline-block unicode-bidi-isolate">{op.scale_ticket_no}</span></span>
                          <button
                            onClick={() => setPreviewTicketOperation(op)}
                            className="group rounded-lg p-1 text-orange-400 hover:bg-orange-950/40 shrink-0 transition-colors"
                            title={isAr ? 'عرض تذكرة الميزان الرسمية' : 'View scale ticket'}
                          >
                            <HoverIcon className="h-3.5 w-3.5">
                              <Eye className="h-full w-full" />
                            </HoverIcon>
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <button
                            onClick={() => setAttachmentViewingOp(op)}
                            className="group relative rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-orange-400 transition-colors"
                            title={isAr ? 'إدارة المرفقات والمستندات' : 'Manage attachments'}
                          >
                            <HoverIcon className="h-3.5 w-3.5">
                              <Paperclip className="h-full w-full" />
                            </HoverIcon>
                            {op.attachments && op.attachments.length > 0 && (
                              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-600 text-[9px] font-bold text-white">
                                {op.attachments.length}
                              </span>
                            )}
                          </button>
                          {canEditOperations && (
                            <button
                              onClick={() => {
                                setEditingOperation(op);
                                setIsNewModalOpen(true);
                              }}
                              className="group rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-orange-400 transition-colors"
                              title={isAr ? 'تعديل' : 'Edit'}
                            >
                              <HoverIcon className="h-3.5 w-3.5">
                                <Edit className="h-full w-full" />
                              </HoverIcon>
                            </button>
                          )}
                          {canDeleteRecords && (
                            <button
                              onClick={() => handleDelete(op.id)}
                              className="group rounded-lg p-1 text-slate-400 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
                              title={isAr ? 'حذف' : 'Delete'}
                            >
                              <HoverIcon className="h-3.5 w-3.5">
                                <Trash2 className="h-full w-full" />
                              </HoverIcon>
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

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-slate-800 p-4 text-xs text-slate-400">
          <div>
            {isAr
              ? `عرض ${paginatedOperations.length} من أصل ${filteredOperations.length} سجل`
              : `Showing ${paginatedOperations.length} of ${filteredOperations.length} records`}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-1 hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {isAr ? 'السابق' : 'Previous'}
            </button>
            <span className="font-bold text-slate-200">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="rounded-lg border border-slate-700 bg-slate-800 text-slate-200 px-3 py-1 hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {isAr ? 'التالي' : 'Next'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Dialogs */}
      <DailyOperationsModal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setEditingOperation(null);
        }}
        initialData={editingOperation}
      />

      <ScaleTicketViewerModal
        operation={previewTicketOperation}
        onClose={() => setPreviewTicketOperation(null)}
        lang={language}
      />

      {attachmentViewingOp && (
        <MultiAttachmentModal
          isOpen={!!attachmentViewingOp}
          onClose={() => setAttachmentViewingOp(null)}
          title={`${attachmentViewingOp.scale_ticket_no} - ${attachmentViewingOp.truck_no}`}
          recordType="Operation"
          recordId={attachmentViewingOp.id}
          existingAttachments={attachmentViewingOp.attachments || []}
        />
      )}

      {/* Live Print Preview & Export Studio Modal */}
      <ExportPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        initialDocType="daily-operations"
        initialOrientation="landscape"
      />

      {/* Universal Bulk Import Engine Modal (REM-P7) */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        defaultCategory="operations"
      />

      {/* Legacy System Resource Data Bridge Modal (Sprint 7) */}
      <ImportSystemResourceModal
        isOpen={isLegacyImportOpen}
        onClose={() => setIsLegacyImportOpen(false)}
      />
    </div>
  );
};
