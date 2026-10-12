import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  Layers,
  RefreshCw,
  Building2,
  Database,
  Truck,
  Package,
  Calendar,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';
import { HoverIcon } from './common/HoverIcon';

export type BulkImportCategory = 'operations' | 'partners';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: BulkImportCategory;
  onImportSuccess?: () => void;
}

interface ParsedOperationRow {
  loading_date?: string;
  truck_no?: string;
  service_supplier?: string;
  material_supplier?: string;
  customer?: string;
  material_type?: string;
  qty_loaded?: number;
  qty_delivered?: number;
  qty_wastage?: number;
  wastage_percentage?: number;
  scale_ticket_no?: string;
  sales_amount?: number;
  vat_amount?: number;
  total_sales?: number;
  purchases_cost?: number;
  crusher_payment?: number;
  net_profit?: number;
  notes?: string;
  _raw: Record<string, any>;
}

// Helper to normalize header text for fuzzy matching
function normalizeHeaderKey(key: string): string {
  if (!key) return '';
  let k = String(key).trim().toLowerCase();
  k = k.replace(/[\u064B-\u065F\u0670]/g, ''); // diacritics
  k = k.replace(/[إأآا]/g, 'ا');
  k = k.replace(/[ة]/g, 'ه');
  k = k.replace(/[ى]/g, 'ي');
  k = k.replace(/[^\w\s]/g, ' ');
  return k.replace(/\s+/g, ' ').trim();
}

function parseRowData(raw: Record<string, any>): ParsedOperationRow {
  const result: ParsedOperationRow = { _raw: raw };

  for (const [colName, val] of Object.entries(raw)) {
    if (val === undefined || val === null) continue;
    const norm = normalizeHeaderKey(colName);
    const sVal = String(val).trim();
    const numVal = parseFloat(sVal.replace(/,/g, '').replace(/%/g, ''));

    // Service Supplier / Transporter (الناقل / المقاول)
    if (
      norm.includes('ناقل') ||
      norm.includes('مقاول') ||
      norm.includes('transporter') ||
      norm.includes('carrier') ||
      norm.includes('service supplier')
    ) {
      result.service_supplier = sVal;
    }
    // Material Supplier / Crusher (الكسارة / مصدر التحميل)
    else if (
      norm.includes('كسار') ||
      norm.includes('مصدر التحميل') ||
      norm.includes('crusher') ||
      norm.includes('loading source') ||
      norm.includes('quarry')
    ) {
      result.material_supplier = sVal;
    }
    // Destination Customer (العميل المستلم / العميل)
    else if (
      norm.includes('عميل') ||
      norm.includes('زبون') ||
      norm.includes('customer') ||
      norm.includes('client') ||
      norm.includes('buyer')
    ) {
      result.customer = sVal;
    }
    // Material Type (نوع المادة / الصنف)
    else if (
      norm.includes('ماده') ||
      norm.includes('نوع الماده') ||
      norm.includes('صنف') ||
      norm.includes('material') ||
      norm.includes('product')
    ) {
      result.material_type = sVal;
    }
    // Truck Number (رقم الشاحنة / اللوحة)
    else if (
      norm.includes('شاحن') ||
      norm.includes('لوح') ||
      norm.includes('truck') ||
      norm.includes('plate')
    ) {
      result.truck_no = sVal;
    }
    // Scale Ticket Number (رقم تذكرة الميزان)
    else if (
      norm.includes('تذكر') ||
      norm.includes('ميزان') ||
      norm.includes('ticket') ||
      norm.includes('scale')
    ) {
      result.scale_ticket_no = sVal;
    }
    // Loading Date (تاريخ التحميل / التاريخ)
    else if (
      norm.includes('تاريخ') ||
      norm.includes('date')
    ) {
      result.loading_date = sVal;
    }
    // Loaded Qty (الوزن المحمل)
    else if (
      norm.includes('محمل') ||
      norm.includes('loaded') ||
      norm.includes('gross')
    ) {
      if (!isNaN(numVal)) result.qty_loaded = numVal;
    }
    // Delivered Qty (الوزن المستلم)
    else if (
      norm.includes('مستلم') ||
      norm.includes('delivered') ||
      norm.includes('net weight')
    ) {
      if (!isNaN(numVal)) result.qty_delivered = numVal;
    }
    // Wastage Qty (الفاقد)
    else if (
      (norm.includes('فاقد') || norm.includes('هدر') || norm.includes('wastage') || norm.includes('loss')) &&
      !norm.includes('نسب') && !norm.includes('pct') && !norm.includes('%')
    ) {
      if (!isNaN(numVal)) result.qty_wastage = numVal;
    }
    // Wastage Percentage (نسبة الفاقد)
    else if (
      norm.includes('نسبه') ||
      norm.includes('نسبة') ||
      norm.includes('%') ||
      norm.includes('percentage') ||
      norm.includes('rate')
    ) {
      if (!isNaN(numVal)) result.wastage_percentage = numVal;
    }
    // Sales Amount (قيمة المبيعات بدون ضريبة)
    else if (
      (norm.includes('مبيعات') || norm.includes('sales')) &&
      (norm.includes('بدون') || norm.includes('subtotal') || norm.includes('excl'))
    ) {
      if (!isNaN(numVal)) result.sales_amount = numVal;
    }
    // Total Sales (إجمالي المبيعات مع الضريبة)
    else if (
      norm.includes('اجمالي المبيعات') ||
      norm.includes('إجمالي المبيعات') ||
      norm.includes('total sales') ||
      norm.includes('gross sales')
    ) {
      if (!isNaN(numVal)) result.total_sales = numVal;
    }
    // VAT Amount (ضريبة القيمة المضافة)
    else if (
      norm.includes('ضريب') ||
      norm.includes('vat') ||
      norm.includes('tax')
    ) {
      if (!isNaN(numVal)) result.vat_amount = numVal;
    }
    // Purchases Cost (تكلفة الشراء من الكسارة)
    else if (
      norm.includes('تكلف') ||
      norm.includes('مشتريات') ||
      norm.includes('cost') ||
      norm.includes('purchases')
    ) {
      if (!isNaN(numVal)) result.purchases_cost = numVal;
    }
    // Crusher Payment (المسدد للكسارة)
    else if (
      norm.includes('مسدد') ||
      norm.includes('مدفوع') ||
      norm.includes('paid') ||
      norm.includes('payment')
    ) {
      if (!isNaN(numVal)) result.crusher_payment = numVal;
    }
    // Net Profit (صافي الربح)
    else if (
      norm.includes('ربح') ||
      norm.includes('profit') ||
      norm.includes('margin')
    ) {
      if (!isNaN(numVal)) result.net_profit = numVal;
    }
    // Notes
    else if (
      norm.includes('ملاحظ') ||
      norm.includes('notes') ||
      norm.includes('remarks')
    ) {
      result.notes = sVal;
    }
  }

  // Derive calculations if omitted
  if (result.qty_loaded && result.qty_delivered && result.qty_wastage === undefined) {
    result.qty_wastage = Math.max(0, Number((result.qty_loaded - result.qty_delivered).toFixed(4)));
  }
  if (result.qty_loaded && result.qty_wastage && result.wastage_percentage === undefined) {
    result.wastage_percentage = Number(((result.qty_wastage / result.qty_loaded) * 100).toFixed(4));
  }
  if (result.sales_amount && !result.vat_amount) {
    result.vat_amount = Number((result.sales_amount * 0.15).toFixed(2));
  }
  if (result.sales_amount && !result.total_sales) {
    result.total_sales = Number(((result.sales_amount || 0) + (result.vat_amount || 0)).toFixed(2));
  }
  if (result.sales_amount && result.purchases_cost && !result.net_profit) {
    result.net_profit = Number((result.sales_amount - result.purchases_cost).toFixed(2));
  }

  return result;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  defaultCategory = 'operations',
  onImportSuccess,
}) => {
  const { language, currentCompany, refreshOperations, refreshPartners, showToast } = useApp();
  const isAr = language === 'ar';

  const [category, setCategory] = useState<BulkImportCategory>(defaultCategory);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'preview'>('upload');
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedOperationRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCategory(defaultCategory);
    setRawRows([]);
    setParsedRows([]);
    setSelectedFile(null);
    setImportSummary(null);
    setActiveTab('upload');
  }, [defaultCategory, isOpen]);

  // Handle escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Process File with XLSX
  const processFile = async (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setImportSummary(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

      if (!jsonRows || jsonRows.length === 0) {
        showToast(isAr ? 'الملف فارغ أو لا يحتوي على بيانات صالحة' : 'File is empty or contains no valid rows', 'warning');
        setIsProcessing(false);
        return;
      }

      setRawRows(jsonRows);
      const mapped = jsonRows.map(parseRowData);
      setParsedRows(mapped);
      setActiveTab('preview');
      showToast(
        isAr ? `تمت قراءة ${jsonRows.length} سجل بنجاح من الملف` : `Successfully read ${jsonRows.length} records from file`,
        'success'
      );
    } catch (err: any) {
      console.error('File parsing error:', err);
      showToast(isAr ? `فشل في قراءة الملف: ${err.message}` : `Failed to parse file: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handlePasteSubmit = () => {
    if (!rawText.trim()) return;
    try {
      setIsProcessing(true);
      const lines = rawText.trim().split(/\r?\n/);
      if (lines.length < 2) {
        showToast(isAr ? 'البيانات الملصقة يجب أن تحتوي على صف العناوين وسجل واحد على الأقل' : 'Pasted text must include a header row and at least one record', 'warning');
        setIsProcessing(false);
        return;
      }

      // Check delimiter (tab or comma)
      const delimiter = lines[0].includes('\t') ? '\t' : ',';
      const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
      const parsed: Record<string, any>[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
        const rowObj: Record<string, any> = {};
        headers.forEach((h, idx) => {
          rowObj[h] = values[idx] || '';
        });
        parsed.push(rowObj);
      }

      setRawRows(parsed);
      const mapped = parsed.map(parseRowData);
      setParsedRows(mapped);
      setActiveTab('preview');
      showToast(isAr ? `تمت معالجة ${parsed.length} سجل` : `Processed ${parsed.length} records`, 'success');
    } catch (err: any) {
      showToast(isAr ? `خطأ أثناء المعالجة: ${err.message}` : `Processing error: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Download Sample Template (Excel)
  const downloadTemplate = () => {
    if (category === 'operations') {
      const templateData = [
        {
          'تاريخ التحميل': '2026-09-20',
          'رقم الشاحنة': 'ق أ د 4521',
          'اسم الناقل (المقاول)': 'مؤسسة الرمال السريعة لنقل المواد',
          'مصدر التحميل (الكسارة)': 'كسارة الصمان للمواد الإنشائية',
          'رقم فاتورة التحميل': 'LD-2026-001',
          'العميل المستلم': 'شركة الخرسانة الجاهزة المتطورة',
          'رقم فاتورة الاستلام': 'REC-9941',
          'نوع المادة': 'حصى وركام مقاس 3/4',
          'الوزن المحمل (MT طن)': 32.5,
          'الوزن المستلم (MT طن)': 31.85,
          'الفاقد (MT طن)': 0.65,
          'نسبة الفاقد %': 2.0,
          'رقم تذكرة الميزان': 'TKT-2026-901',
          'قيمة المبيعات (بدون ضريبة)': 1500.0,
          'ضريبة القيمة المضافة 15%': 225.0,
          'إجمالي المبيعات (ر.س)': 1725.0,
          'تكلفة الشراء من الكسارة': 1100.0,
          'المسدد للكسارة': 1100.0,
          'صافي الربح التشغيلي': 400.0,
          'الشهر': 9,
          'ملاحظات': 'توريد موقع مشروع العليا',
        },
        {
          'تاريخ التحميل': '2026-09-20',
          'رقم الشاحنة': 'ب ح ر 8812',
          'اسم الناقل (المقاول)': 'أسطول نجد للنقليات الثقيلة',
          'مصدر التحميل (الكسارة)': 'كسارة الجبيل لطبقات الأساس',
          'رقم فاتورة التحميل': 'LD-2026-002',
          'العميل المستلم': 'مشاريع الرياض للإنشاءات',
          'رقم فاتورة الاستلام': 'REC-9942',
          'نوع المادة': 'رمل مغسول ناعم',
          'الوزن المحمل (MT طن)': 29.8,
          'الوزن المستلم (MT طن)': 29.4,
          'الفاقد (MT طن)': 0.4,
          'نسبة الفاقد %': 1.34,
          'رقم تذكرة الميزان': 'TKT-2026-902',
          'قيمة المبيعات (بدون ضريبة)': 1350.0,
          'ضريبة القيمة المضافة 15%': 202.5,
          'إجمالي المبيعات (ر.س)': 1552.5,
          'تكلفة الشراء من الكسارة': 950.0,
          'المسدد للكسارة': 950.0,
          'صافي الربح التشغيلي': 400.0,
          'الشهر': 9,
          'ملاحظات': 'سداد كامل ومطابقة تامة للميزان',
        },
      ];
      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'قاعدة البيانات الشاملة');
      XLSX.writeFile(wb, 'OxenGL_Comprehensive_Operations_Template.xlsx');
    } else {
      const templateData = [
        {
          'الاسم': 'شركة الخرسانة العالمية',
          'النوع': 'عميل',
          'الرقم الضريبي': '300123456700003',
          'السجل التجاري': '1010892341',
          'رقم الجوال': '0501234567',
          'البريد الإلكتروني': 'info@globalconcrete.sa',
        },
        {
          'الاسم': 'كسارة نجد للمواد الخام',
          'النوع': 'مورد مواد (كسارة)',
          'الرقم الضريبي': '300987654300003',
          'السجل التجاري': '1010776521',
          'رقم الجوال': '0559876543',
          'البريد الإلكتروني': 'sales@najdcrusher.com',
        },
        {
          'الاسم': 'مؤسسة الشاحنات السريعة',
          'النوع': 'مورد خدمة (ناقل)',
          'الرقم الضريبي': '300445566700003',
          'السجل التجاري': '1010332211',
          'رقم الجوال': '0543322110',
          'البريد الإلكتروني': 'fleet@fasttrucks.com',
        },
      ];
      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'دليل الشركاء');
      XLSX.writeFile(wb, 'OxenGL_Master_Partners_Template.xlsx');
    }
  };

  // Submit to Backend Universal Engine
  const executeImport = async () => {
    if (!currentCompany) {
      showToast(isAr ? 'لم يتم تحديد الشركة النشطة' : 'Active company not identified', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      if (category === 'operations') {
        let result: any;
        if (selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          result = await erpApi.bulkImportOperations(formData, currentCompany.id);
        } else {
          result = await erpApi.bulkImportOperations({ records: rawRows }, currentCompany.id);
        }

        setImportSummary({
          success: result.success,
          imported: result.imported_count || 0,
          skipped: result.skipped_count || 0,
          errors: result.errors || [],
        });

        if (result.success && (result.imported_count || 0) > 0) {
          showToast(
            isAr
              ? `تم استيراد ${result.imported_count} عملية بنجاح وحفظها في قاعدة البيانات!`
              : `Successfully imported ${result.imported_count} operations to ERP!`,
            'success'
          );
          await refreshOperations();
          if (onImportSuccess) onImportSuccess();
        } else if (result.skipped_count > 0 && result.imported_count === 0) {
          showToast(
            isAr ? `تم تخطي ${result.skipped_count} سجل (موجودة مسبقاً في النظام)` : `Skipped ${result.skipped_count} existing records`,
            'warning'
          );
        }
      } else {
        let result: any;
        if (selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          result = await erpApi.bulkImportPartners(formData, currentCompany.id);
        } else {
          result = await erpApi.bulkImportPartners({ records: rawRows }, currentCompany.id);
        }

        setImportSummary({
          success: result.success,
          imported: result.imported_count || 0,
          skipped: result.updated_count || 0,
          errors: result.errors || [],
        });

        if (result.success && ((result.imported_count || 0) > 0 || (result.updated_count || 0) > 0)) {
          showToast(
            isAr
              ? `تم استيراد ${result.imported_count || 0} شريك وتحديث ${result.updated_count || 0} بنجاح!`
              : `Successfully imported ${result.imported_count || 0} partners and updated ${result.updated_count || 0}!`,
            'success'
          );
          await refreshPartners();
          if (onImportSuccess) onImportSuccess();
        }
      }
    } catch (err: any) {
      console.error('Import execution error:', err);
      showToast(isAr ? `فشل الاستيراد: ${err.message}` : `Import failed: ${err.message}`, 'error');
      setImportSummary({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [err.message || 'Server error'],
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-4.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-md shadow-orange-600/30">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  {isAr ? 'المحرك الشامل لاستيراد البيانات (Universal Bulk Import Engine)' : 'Universal Bulk Import Engine'}
                </h2>
                <span className="rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-[10px] font-black text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-400">
                  Excel & CSV Superset
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'استيراد وتفكيك "قاعدة البيانات الشاملة" وربط الناقل والكسارة بموردي الخدمات والمواد تلقائياً'
                  : 'Absorb legacy comprehensive spreadsheets, mapping transporters and crushers to live ERP entities'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="group rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
          >
            <HoverIcon className="h-5 w-5">
              <X className="h-full w-full" />
            </HoverIcon>
          </button>
        </div>

        {/* Modal Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
          {/* Target Entity Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                setCategory('operations');
                setRawRows([]);
                setParsedRows([]);
              }}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer ${
                category === 'operations'
                  ? 'bg-white text-orange-600 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>{isAr ? 'العمليات وقاعدة البيانات الشاملة' : 'Operations & Comprehensive Log'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCategory('partners');
                setRawRows([]);
                setParsedRows([]);
              }}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer ${
                category === 'partners'
                  ? 'bg-white text-orange-600 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>{isAr ? 'دليل الشركاء (عملاء / كسارات / ناقلون)' : 'Partners & Entities Directory'}</span>
            </button>
          </div>

          {/* Action Tabs & Template Download */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors"
            >
              <HoverIcon className="h-3.5 w-3.5">
                <Download className="h-full w-full text-emerald-600" />
              </HoverIcon>
              <span>{isAr ? 'تحميل نموذج Excel' : 'Download Template (.xlsx)'}</span>
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`rounded-lg px-3 py-1 font-bold transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                {isAr ? 'رفع ملف' : 'Upload File'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`rounded-lg px-3 py-1 font-bold transition-all cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                {isAr ? 'لصق نصي' : 'Paste Text'}
              </button>
              {parsedRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`rounded-lg px-3 py-1 font-bold transition-all cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {isAr ? `معاينة (${parsedRows.length})` : `Preview (${parsedRows.length})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TAB 1: Upload File */}
          {activeTab === 'upload' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              className={`flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-10 text-center transition-all ${
                isDragOver
                  ? 'border-orange-500 bg-orange-500/5'
                  : 'border-slate-300 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-500/10 text-orange-600 mb-4 shadow-inner">
                <FileSpreadsheet className="h-8 w-8" />
              </div>

              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr ? 'اسحب وأسقط ملف الإكسل أو اضغط للاختيار' : 'Drag and drop your Excel / CSV file, or browse'}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md">
                {isAr
                  ? 'يدعم ملفات .xlsx و .xls و .csv مع معالجة ذكية للترميز العربي وقراءة كافة أعمدة قاعدة البيانات الشاملة'
                  : 'Supports .xlsx, .xls, and .csv files with automatic Arabic encoding detection and full superset absorption'}
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="mt-5 flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{isAr ? 'جاري قراءة الملف...' : 'Parsing file...'}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>{isAr ? 'اختيار ملف من جهازك' : 'Choose File from Device'}</span>
                  </>
                )}
              </button>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {isAr ? 'تفكيك الكسارات إلى موردين' : 'Auto-resolves Material Suppliers'}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {isAr ? 'تفكيك الناقلين إلى موردي خدمات' : 'Auto-resolves Service Suppliers'}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {isAr ? 'تسجيل فاقد النولون فورياً' : 'Automatic Transit Wastage Auditing'}
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: Paste Raw Text */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
                {isAr ? 'الصق البيانات المنسوخة من جدول Excel أو ملف CSV هنا:' : 'Paste tabular data copied from Excel or CSV here:'}
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={
                  isAr
                    ? 'تاريخ التحميل\tرقم الشاحنة\tاسم الناقل\tمصدر التحميل\tالعميل المستلم\tالوزن المحمل\tالوزن المستلم...\n2026-09-20\tق أ د 4521\tمؤسسة الرمال\tكسارة الصمان\tشركة الخرسانة\t32.5\t31.85...'
                    : 'Loading Date\tTruck No\tTransporter\tCrusher\tCustomer\tQty Loaded\tQty Delivered...\n2026-09-20\tTRK-101\tFast Hauler\tNorth Quarry\tReadyMix Co\t32.5\t31.85...'
                }
                rows={8}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 p-4 font-mono text-xs text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  disabled={!rawText.trim() || isProcessing}
                  className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'معالجة ومطابقة البيانات' : 'Process & Map Rows'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Preview Table & Column Mapping */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              {/* Mapping Status Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold">
                    <Layers className="h-3.5 w-3.5 text-orange-600" />
                    <span>{isAr ? 'إجمالي السجلات المكتشفة' : 'Detected Records'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{parsedRows.length}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold">
                    <Truck className="h-3.5 w-3.5 text-blue-600" />
                    <span>{isAr ? 'موردي الخدمات (الناقلين)' : 'Service Suppliers'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-blue-700 dark:text-blue-400">
                    {new Set(parsedRows.map((r) => r.service_supplier).filter(Boolean)).size}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold">
                    <Database className="h-3.5 w-3.5 text-amber-600" />
                    <span>{isAr ? 'موردي المواد (الكسارات)' : 'Material Suppliers'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-amber-700 dark:text-amber-400">
                    {new Set(parsedRows.map((r) => r.material_supplier).filter(Boolean)).size}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold">
                    <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{isAr ? 'العملاء المستلمون' : 'Target Customers'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-emerald-700 dark:text-emerald-400">
                    {new Set(parsedRows.map((r) => r.customer).filter(Boolean)).size}
                  </p>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 sticky top-0 z-10 font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3 text-start">#</th>
                        <th className="p-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="p-3 text-start">{isAr ? 'الشاحنة' : 'Truck'}</th>
                        <th className="p-3 text-start">{isAr ? 'مورد الخدمة (الناقل)' : 'Service Supplier (Carrier)'}</th>
                        <th className="p-3 text-start">{isAr ? 'مورد المادة (الكسارة)' : 'Material Supplier (Crusher)'}</th>
                        <th className="p-3 text-start">{isAr ? 'العميل المستلم' : 'Customer'}</th>
                        <th className="p-3 text-start">{isAr ? 'المادة' : 'Material'}</th>
                        <th className="p-3 text-end">{isAr ? 'المحمل (طن)' : 'Loaded (T)'}</th>
                        <th className="p-3 text-end">{isAr ? 'المستلم (طن)' : 'Delivered (T)'}</th>
                        <th className="p-3 text-end">{isAr ? 'الفاقد (طن)' : 'Loss (T)'}</th>
                        <th className="p-3 text-end">{isAr ? 'المبيعات (ر.س)' : 'Sales (SAR)'}</th>
                        <th className="p-3 text-end">{isAr ? 'التكلفة (ر.س)' : 'Cost (SAR)'}</th>
                        <th className="p-3 text-end">{isAr ? 'الربح (ر.س)' : 'Profit (SAR)'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                      {parsedRows.slice(0, 15).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                          <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-mono">{row.loading_date || '-'}</td>
                          <td className="p-3 font-black text-slate-900 dark:text-white">{row.truck_no || '-'}</td>
                          <td className="p-3 text-blue-700 dark:text-blue-400 font-bold">{row.service_supplier || '-'}</td>
                          <td className="p-3 text-amber-700 dark:text-amber-400 font-bold">{row.material_supplier || '-'}</td>
                          <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">{row.customer || '-'}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{row.material_type || '-'}</td>
                          <td className="p-3 text-end font-mono font-bold">{row.qty_loaded?.toFixed(2) || '-'}</td>
                          <td className="p-3 text-end font-mono font-bold">{row.qty_delivered?.toFixed(2) || '-'}</td>
                          <td className="p-3 text-end font-mono text-rose-600 font-bold">
                            {row.qty_wastage != null ? row.qty_wastage.toFixed(2) : '-'}
                          </td>
                          <td className="p-3 text-end font-mono">{row.total_sales?.toLocaleString() || '-'}</td>
                          <td className="p-3 text-end font-mono">{row.purchases_cost?.toLocaleString() || '-'}</td>
                          <td className="p-3 text-end font-mono font-black text-emerald-600">
                            {row.net_profit?.toLocaleString() || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 15 && (
                  <div className="bg-slate-50 px-4 py-2 text-center text-xs text-slate-500 border-t border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                    {isAr
                      ? `تم عرض أول 15 سجلاً فقط من إجمالي ${parsedRows.length} سجل ستتم معالجتها كاملة.`
                      : `Displaying first 15 of ${parsedRows.length} total records to be imported.`}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Import Summary Results */}
          {importSummary && (
            <div
              className={`rounded-2xl border p-4 ${
                importSummary.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {importSummary.success ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                )}
                <span className="font-black text-xs">
                  {importSummary.success
                    ? isAr
                      ? `اكتملت العملية: تم إدراج ${importSummary.imported} سجل جديد، وتخطي ${importSummary.skipped} سجل مكرر.`
                      : `Import completed: ${importSummary.imported} records inserted, ${importSummary.skipped} existing records skipped.`
                    : isAr
                    ? 'فشل في استكمال بعض السجلات'
                    : 'Some records failed to import'}
                </span>
              </div>
              {importSummary.errors.length > 0 && (
                <ul className="mt-2 text-[11px] space-y-1 font-mono text-rose-700 dark:text-rose-400">
                  {importSummary.errors.slice(0, 5).map((e, idx) => (
                    <li key={idx}>• {e}</li>
                  ))}
                  {importSummary.errors.length > 5 && (
                    <li>• ... {importSummary.errors.length - 5} {isAr ? 'أخطاء إضافية' : 'more errors'}</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          <div className="flex items-center gap-3">
            {parsedRows.length > 0 && (
              <button
                type="button"
                onClick={executeImport}
                disabled={isProcessing}
                className="group flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <HoverIcon className="h-4 w-4">
                      <RefreshCw className="h-full w-full animate-spin" />
                    </HoverIcon>
                    <span>{isAr ? 'جاري الاستيراد والتحديث...' : 'Importing & Syncing...'}</span>
                  </>
                ) : (
                  <>
                    <HoverIcon className="h-4 w-4">
                      <CheckCircle2 className="h-full w-full" />
                    </HoverIcon>
                    <span>
                      {isAr
                        ? `بدء استيراد ${parsedRows.length} سجل إلى النظام`
                        : `Start Importing ${parsedRows.length} Records`}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
