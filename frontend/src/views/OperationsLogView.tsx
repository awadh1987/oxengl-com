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
  Upload,
  Database,
  Paperclip,
} from 'lucide-react';
import { formatCurrency, formatDate, formatTonnage } from '../utils/formatters';
import { exportOperationsToExcel } from '../utils/excelExporter';
import { DailyOperationsModal } from '../components/DailyOperationsModal';
import { EntityQuickAdd } from '../components/EntityQuickAdd';
import { ScaleTicketViewerModal } from '../components/ScaleTicketViewerModal';
import { MultiAttachmentModal } from '../components/MultiAttachmentModal';
import { ExportPrintModal } from '../components/ExportPrintModal';
import { BulkImportModal } from '../components/BulkImportModal';
import { ImportSystemResourceModal } from '../components/ImportSystemResourceModal';
import { HoverIcon } from '../components/common/HoverIcon';
import { ActionsMenu } from '../components/ActionsMenu';
import { InlineApprovalActionBadge } from '../components/approvals/InlineApprovalActionBadge';
import {
  ColumnDrilldownModal,
  OxenActiveFiltersBar,
  OxenColumnDef,
  OxenColumnHeader,
  useOxenColumnFilter,
} from '../components/common/ColumnDrilldownModal';

export const OperationsLogView: React.FC = () => {
  const {
    accessibleOperations,
    deleteOperation,
    refreshOperations,
    refreshPartners,
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
  const [selectedDate, setSelectedDate] = useState('');
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

  // Base filtered dataset (toolbar filters)
  const baseFilteredOperations = useMemo(() => {
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
      if (selectedDate && (op.loading_date || '').slice(0, 10) !== selectedDate) return false;
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
    selectedDate,
    selectedMonth,
    filterExcessLoss,
  ]);

  const formatDisplayTripId = (op: OperationRecord) =>
    op.id.startsWith('TRP-')
      ? op.id
      : `TRP-${op.id.replace(/[^0-9]/g, '').slice(-4) || '1001'}`;

  const operationColumns = useMemo<OxenColumnDef<OperationRecord>[]>(
    () => [
      {
        key: 'trip_id',
        label: isAr ? 'رقم الرحلة' : 'Trip ID',
        type: 'categorical',
        getValue: (op) => formatDisplayTripId(op),
        getTonnage: (op) => op.qty_delivered || 0,
        getRevenue: (op) => op.sales_amount || 0,
      },
      {
        key: 'date',
        label: isAr ? 'تاريخ التحميل' : 'Date',
        type: 'date',
        getValue: (op) => (op.loading_date || '').slice(0, 10),
        getTonnage: (op) => op.qty_delivered || 0,
        getRevenue: (op) => op.sales_amount || 0,
      },
      {
        key: 'truck_no',
        label: isAr ? 'رقم الشاحنة' : 'Truck #',
        type: 'categorical',
        getValue: (op) => op.truck_no,
        getTonnage: (op) => op.qty_delivered || 0,
        getRevenue: (op) => op.sales_amount || 0,
      },
      {
        key: 'service_supplier',
        label: isAr ? 'مزود الخدمة اللوجستية' : 'Service Supplier',
        type: 'categorical',
        getValue: (op) => op.transporter_name,
        getTonnage: (op) => op.qty_delivered || 0,
        getRevenue: (op) => op.sales_amount || 0,
      },
      {
        key: 'origin',
        label: isAr ? 'منشأة الإرسال' : 'Origin / Dispatch Facility',
        type: 'categorical',
        getValue: (op) => op.loading_source,
        getTonnage: (op) => op.qty_delivered || 0,
        getRevenue: (op) => op.sales_amount || 0,
      },
      {
        key: 'destination',
        label: isAr ? 'العميل المستلم' : 'Destination Client',
        type: 'categorical',
        getValue: (op) => op.destination_customer,
        getTonnage: (op) => op.qty_delivered || 0,
        getRevenue: (op) => op.sales_amount || 0,
      },
      {
        key: 'material',
        label: isAr ? 'نوع المادة' : 'Material',
        type: 'categorical',
        getValue: (op) => op.material_type,
        getTonnage: (op) => op.qty_delivered || 0,
        getRevenue: (op) => op.sales_amount || 0,
      },
      {
        key: 'loaded_qty',
        label: isAr ? 'الكمية المحملة' : 'Loaded Qty',
        type: 'numeric',
        align: 'center',
        unit: 'MT',
        getValue: (op) => op.qty_loaded,
        getNumericValue: (op) => Number(op.qty_loaded || 0),
      },
      {
        key: 'delivered_qty',
        label: isAr ? 'الكمية المستلمة' : 'Delivered Qty',
        type: 'numeric',
        align: 'center',
        unit: 'MT',
        getValue: (op) => op.qty_delivered,
        getNumericValue: (op) => Number(op.qty_delivered || 0),
      },
      {
        key: 'wastage_pct',
        label: isAr ? 'الفاقد / الهدر (%)' : 'Wastage (%)',
        type: 'numeric',
        align: 'center',
        unit: '%',
        getValue: (op) => op.wastage_percentage,
        getNumericValue: (op) => Number(op.wastage_percentage || 0),
      },
      {
        key: 'sales_excl_vat',
        label: isAr ? 'المبيعات بدون ضريبة' : 'Sales Excl. VAT',
        type: 'numeric',
        unit: 'SAR',
        getValue: (op) => op.sales_amount,
        getNumericValue: (op) => Number(op.sales_amount || 0),
      },
      {
        key: 'purchase_cost',
        label: isAr ? 'تكلفة الشراء' : 'Purchase Cost',
        type: 'numeric',
        unit: 'SAR',
        getValue: (op) => op.purchases_cost,
        getNumericValue: (op) => Number(op.purchases_cost || 0),
      },
      {
        key: 'paid_to_supplier',
        label: isAr ? 'المسدد لمورد المواد الخام' : 'Paid to Raw Materials Supplier',
        type: 'numeric',
        unit: 'SAR',
        getValue: (op) => op.crusher_payment ?? 0,
        getNumericValue: (op) => Number(op.crusher_payment ?? 0),
      },
      {
        key: 'net_profit',
        label: isAr ? 'صافي الربح' : 'Net Profit',
        type: 'numeric',
        unit: 'SAR',
        getValue: (op) => op.net_profit,
        getNumericValue: (op) => Number(op.net_profit || 0),
      },
      {
        key: 'scale_ticket',
        label: isAr ? 'تذكرة الميزان' : 'Scale Ticket',
        type: 'categorical',
        align: 'center',
        getValue: (op) => op.scale_ticket_no,
        getTonnage: (op) => op.qty_delivered || 0,
        getRevenue: (op) => op.sales_amount || 0,
      },
      {
        key: 'actions',
        label: isAr ? 'إجراءات' : 'Actions',
        type: 'actions',
        align: 'center',
        getValue: (op) => op.id,
        getActionFlags: (op) => ({
          hasAttachment: Boolean(
            (op.attachments && op.attachments.length > 0) || op.scale_ticket_no
          ),
          recordState:
            (op.wastage_percentage || 0) > 2.0 ? 'High Loss (>2%)' : 'Within Tolerance',
          approvalStatus:
            op.approval_status === 'PENDING_APPROVAL'
              ? 'Pending Approval'
              : op.approval_status === 'REJECTED'
              ? 'Rejected'
              : (op.crusher_payment ?? 0) > 0
              ? 'Supplier Settled'
              : 'Pending Settlement',
        }),
      },
    ],
    [isAr]
  );

  const {
    columnFilters,
    filteredData: filteredOperations,
    activeDrilldownColumn,
    openDrilldown,
    closeDrilldown,
    setColumnFilter,
    clearAllColumnFilters,
    isColumnFiltered,
    getColumnDef,
  } = useOxenColumnFilter(baseFilteredOperations, operationColumns, () => setCurrentPage(1));

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
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg sm:flex-row sm:items-center">
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

          {canEditOperations && (
            <>
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
                <span>{isAr ? 'تسجيل رحلة جديدة' : 'Add Trip'}</span>
              </button>

              <button
                id="quick-add-operation-list-btn"
                onClick={() => setIsBulkImportOpen(true)}
                className="group flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-300 shadow-xs hover:bg-emerald-500/20 transition-colors"
                title={isAr ? 'إضافة قائمة عمليات من ملف CSV أو Excel' : 'Quickly add an operations list from CSV or Excel'}
              >
                <HoverIcon className="h-4 w-4">
                  <Upload className="h-full w-full text-emerald-400" />
                </HoverIcon>
                <span>{isAr ? 'إضافة قائمة سريعة' : 'Quick Add List'}</span>
              </button>
            </>
          )}

          {canEditOperations && (
            <EntityQuickAdd
              actions={[{ type: 'customer', labelAr: 'إضافة عميل جديد', labelEn: 'Add New Customer' }]}
              quickAddMenuLabel={{ ar: 'إضافة سريعة', en: 'Quick Add' }}
              quickAddMenuActions={[
                { type: 'customer', labelAr: 'إضافة عميل جديد', labelEn: 'Add New Customer' },
                { type: 'crusher', labelAr: 'إضافة مورد مواد', labelEn: 'Add Material Supplier' },
                { type: 'transporter', labelAr: 'إضافة مورد خدمة', labelEn: 'Add Service Supplier' },
                { type: 'material', labelAr: 'إضافة صنف مادة', labelEn: 'Add New Material Item' },
              ]}
              onCreated={refreshPartners}
            />
          )}

          <ActionsMenu
            isArabic={isAr}
            isDark
            items={[
              { id: 'export-json-snapshot-btn', label: isAr ? 'لقطة بيانات JSON' : 'JSON Snapshot', icon: Download, onSelect: handleExportJSONSnapshot },
              { id: 'operations-export-print-action', label: isAr ? 'معاينة وطباعة' : 'Export & Print', icon: Printer, onSelect: () => setIsPrintModalOpen(true) },
              { id: 'bulk-import-operations-btn', label: isAr ? 'استيراد جماعي (CSV/Excel)' : 'Bulk Import (CSV/Excel)', icon: Upload, onSelect: () => setIsBulkImportOpen(true) },
              { id: 'import-system-resource-btn', label: isAr ? 'استيراد موارد النظام (.xlsx)' : 'Import System Resource (.xlsx)', icon: Database, onSelect: () => setIsLegacyImportOpen(true) },
              { id: 'operations-export-excel-action', label: isAr ? 'تصدير Excel' : 'Export Excel', icon: FileSpreadsheet, onSelect: handleExportExcel },
            ]}
          />
        </div>
      </div>

      {/* Summary KPI Mini-Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
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

        {/* Second row filters: Month, Operational Date & Excess Wastage Toggle */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
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

            <div className="flex items-center gap-2">
              <label htmlFor="operations-date-filter" className="font-semibold text-slate-400 whitespace-nowrap">
                {isAr ? 'تاريخ العملية:' : 'Operation Date:'}
              </label>
              <input
                id="operations-date-filter"
                type="date"
                placeholder="YYYY-MM-DD"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-100 focus:border-orange-500 focus:outline-none"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate('');
                    setCurrentPage(1);
                  }}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  {isAr ? 'مسح' : 'Clear'}
                </button>
              )}
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

      {/* Active Column Filters Bar */}
      <OxenActiveFiltersBar
        columns={operationColumns}
        columnFilters={columnFilters}
        onOpenColumn={openDrilldown}
        onClearColumn={(key) => setColumnFilter(key, null)}
        onClearAll={clearAllColumnFilters}
        totalCount={baseFilteredOperations.length}
        filteredCount={filteredOperations.length}
      />

      {/* Main Operations Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-white font-bold">
                <OxenColumnHeader
                  column={getColumnDef('trip_id')}
                  className="py-3.5 px-3 whitespace-nowrap"
                  isFiltered={isColumnFiltered('trip_id')}
                  onOpen={() => openDrilldown('trip_id')}
                  onClear={() => setColumnFilter('trip_id', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('date')}
                  className="py-3.5 px-3 whitespace-nowrap"
                  isFiltered={isColumnFiltered('date')}
                  onOpen={() => openDrilldown('date')}
                  onClear={() => setColumnFilter('date', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('truck_no')}
                  className="py-3.5 px-3 whitespace-nowrap"
                  isFiltered={isColumnFiltered('truck_no')}
                  onOpen={() => openDrilldown('truck_no')}
                  onClear={() => setColumnFilter('truck_no', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('service_supplier')}
                  className="py-3.5 px-3 whitespace-nowrap"
                  isFiltered={isColumnFiltered('service_supplier')}
                  onOpen={() => openDrilldown('service_supplier')}
                  onClear={() => setColumnFilter('service_supplier', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('origin')}
                  className="py-3.5 px-3 whitespace-nowrap"
                  isFiltered={isColumnFiltered('origin')}
                  onOpen={() => openDrilldown('origin')}
                  onClear={() => setColumnFilter('origin', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('destination')}
                  className="py-3.5 px-3 whitespace-nowrap"
                  isFiltered={isColumnFiltered('destination')}
                  onOpen={() => openDrilldown('destination')}
                  onClear={() => setColumnFilter('destination', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('material')}
                  className="py-3.5 px-3 whitespace-nowrap"
                  isFiltered={isColumnFiltered('material')}
                  onOpen={() => openDrilldown('material')}
                  onClear={() => setColumnFilter('material', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('loaded_qty')}
                  align="center"
                  className="py-3.5 px-3 text-center whitespace-nowrap"
                  isFiltered={isColumnFiltered('loaded_qty')}
                  onOpen={() => openDrilldown('loaded_qty')}
                  onClear={() => setColumnFilter('loaded_qty', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('delivered_qty')}
                  align="center"
                  className="py-3.5 px-3 text-center whitespace-nowrap"
                  isFiltered={isColumnFiltered('delivered_qty')}
                  onOpen={() => openDrilldown('delivered_qty')}
                  onClear={() => setColumnFilter('delivered_qty', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('wastage_pct')}
                  align="center"
                  className="py-3.5 px-3 text-center whitespace-nowrap"
                  isFiltered={isColumnFiltered('wastage_pct')}
                  onOpen={() => openDrilldown('wastage_pct')}
                  onClear={() => setColumnFilter('wastage_pct', null)}
                />
                {canAccessFinancials && (
                  <>
                    <OxenColumnHeader
                      column={getColumnDef('sales_excl_vat')}
                      className="py-3.5 px-3 whitespace-nowrap"
                      isFiltered={isColumnFiltered('sales_excl_vat')}
                      onOpen={() => openDrilldown('sales_excl_vat')}
                      onClear={() => setColumnFilter('sales_excl_vat', null)}
                    />
                    <OxenColumnHeader
                      column={getColumnDef('purchase_cost')}
                      className="py-3.5 px-3 whitespace-nowrap"
                      isFiltered={isColumnFiltered('purchase_cost')}
                      onOpen={() => openDrilldown('purchase_cost')}
                      onClear={() => setColumnFilter('purchase_cost', null)}
                    />
                    <OxenColumnHeader
                      column={getColumnDef('paid_to_supplier')}
                      className="py-3.5 px-3 whitespace-nowrap"
                      isFiltered={isColumnFiltered('paid_to_supplier')}
                      onOpen={() => openDrilldown('paid_to_supplier')}
                      onClear={() => setColumnFilter('paid_to_supplier', null)}
                    />
                    <OxenColumnHeader
                      column={getColumnDef('net_profit')}
                      className="py-3.5 px-3 whitespace-nowrap"
                      isFiltered={isColumnFiltered('net_profit')}
                      onOpen={() => openDrilldown('net_profit')}
                      onClear={() => setColumnFilter('net_profit', null)}
                    />
                  </>
                )}
                <OxenColumnHeader
                  column={getColumnDef('scale_ticket')}
                  align="center"
                  className="py-3.5 px-3 text-center whitespace-nowrap"
                  isFiltered={isColumnFiltered('scale_ticket')}
                  onOpen={() => openDrilldown('scale_ticket')}
                  onClear={() => setColumnFilter('scale_ticket', null)}
                />
                <OxenColumnHeader
                  column={getColumnDef('actions')}
                  align="center"
                  className="py-3.5 px-3 text-center whitespace-nowrap"
                  isFiltered={isColumnFiltered('actions')}
                  onOpen={() => openDrilldown('actions')}
                  onClear={() => setColumnFilter('actions', null)}
                />
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
                          <InlineApprovalActionBadge
                            documentId={op.id}
                            workflowInstanceId={op.workflow_instance_id}
                            approvalStatus={op.approval_status}
                          />
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

      {/* Interactive Column Drill-Down & Analytics Modal (Phase 3) */}
      <ColumnDrilldownModal
        isOpen={Boolean(activeDrilldownColumn)}
        column={activeDrilldownColumn}
        data={baseFilteredOperations}
        currentFilter={
          activeDrilldownColumn ? columnFilters[activeDrilldownColumn.key] : null
        }
        onApply={setColumnFilter}
        onClose={closeDrilldown}
      />
    </div>
  );
};
