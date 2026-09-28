import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  Copy,
  ArrowRight,
  Database,
  Layers,
  HelpCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, Crusher, Transporter } from '../types';

export type CsvImportEntityType = 'customers' | 'crushers' | 'transporters';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEntityType?: CsvImportEntityType;
  onImportComplete?: (result: { entityType: CsvImportEntityType; addedCount: number; updatedCount: number }) => void;
}

interface ParsedRow {
  raw: Record<string, string>;
  mapped: any;
  status: 'valid' | 'warning' | 'error';
  messages: string[];
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  defaultEntityType = 'customers',
  onImportComplete,
}) => {
  const { language, batchAddCustomers, batchAddCrushers, batchAddTransporters, customers, crushers, transporters, showToast } =
    useApp();
  const isAr = language === 'ar';

  const [entityType, setEntityType] = useState<CsvImportEntityType>(defaultEntityType);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'preview'>('upload');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [updateExisting, setUpdateExisting] = useState(true);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSummary, setImportSummary] = useState<{ added: number; updated: number } | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'warning' | 'error'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  if (!isOpen) return null;

  // 1. Templates Definition
  const templates = {
    customers: {
      titleAr: 'سجل العملاء والمشاريع (Clients & Projects)',
      titleEn: 'Customers & Projects Master Data',
      filename: 'Customers_Import_Template_Meayon.csv',
      headers: [
        'customerName',
        'customerNameEn',
        'taxNumber',
        'crNumber',
        'contactPerson',
        'phone',
        'email',
        'address',
        'creditLimit',
        'openingBalance',
      ],
      headerLabelsAr: [
        'اسم العميل (عربي) *',
        'الاسم بالإنجليزي',
        'الرقم الضريبي (15 رقم)',
        'السجل التجاري',
        'مسؤول التواصل',
        'رقم الجوال',
        'البريد الإلكتروني',
        'العنوان وموقع المشروع',
        'الحد الائتماني (ر.س)',
        'الرصيد الافتتاحي (ر.س)',
      ],
      sampleRows: [
        [
          'شركة الأبراج الحديثة للخرسانة',
          'Modern Towers Concrete Co.',
          '300984512000003',
          '1010349281',
          'م. فيصل الغامدي',
          '+966 50 112 3344',
          'procurement@moderntowers.sa',
          'الرياض - طريق الثمامة',
          '800000',
          '50000',
        ],
        [
          'مؤسسة البنيان للمقاولات العامة',
          'Al Bunyan General Contracting',
          '310184729000003',
          '2050184920',
          'أ. ماجد العتيبي',
          '+966 55 998 7766',
          'info@bunyan-sa.com',
          'الدمام - المدينة الصناعية الأولى',
          '500000',
          '0',
        ],
      ],
    },
    crushers: {
      titleAr: 'سجل موردي المواد (Material Suppliers)',
      titleEn: 'Material Suppliers Master Data',
      filename: 'Crushers_Import_Template_Meayon.csv',
      headers: [
        'crusherName',
        'crusherNameEn',
        'location',
        'bankDetails',
        'openingBalance',
        'contactPerson',
        'phone',
        'taxNumber',
      ],
      headerLabelsAr: [
        'اسم الكسارة (عربي) *',
        'الاسم بالإنجليزي',
        'الموقع الجغرافي *',
        'تفاصيل البنك والآيبان',
        'الرصيد الافتتاحي (ر.س)',
        'مسؤول المبيعات/الميزان',
        'رقم الجوال',
        'الرقم الضريبي للكسارة',
      ],
      sampleRows: [
        [
          'كسارة نجد الكبرى للركام',
          'Najd Greater Aggregate Quarry',
          'الخرج - مخرج 11 طريق حرض',
          'مصرف الراجحي - SA4580000987654321098765',
          '85000',
          'أبو سلطان العنزي',
          '+966 50 776 5544',
          '300554129800003',
        ],
        [
          'مجمع كسارات الساحل الغربي',
          'West Coast Quarries Complex',
          'جدة - طريق عسفان كم 18',
          'البنك الأهلي السعودي - SA1210000456789012345678',
          '120000',
          'م. عادل بخش',
          '+966 56 332 1100',
          '310884920100003',
        ],
      ],
    },
    transporters: {
      titleAr: 'سجل مقاولي وأسطول النقل (Transporters & Fleet)',
      titleEn: 'Transporters & Fleet Master Data',
      filename: 'Transporters_Import_Template_Meayon.csv',
      headers: [
        'transporterName',
        'transporterNameEn',
        'contactPerson',
        'phone',
        'driverName',
        'truckNo',
        'capacityTons',
        'ratePerTon',
      ],
      headerLabelsAr: [
        'اسم مقاول النقل (عربي) *',
        'الاسم بالإنجليزي',
        'مسؤول التنسيق',
        'رقم الجوال',
        'اسم السائق الافتراضي',
        'رقم اللوحة / الشاحنة',
        'الحمولة بالطن',
        'سعر النقل للطن',
      ],
      sampleRows: [
        [
          'مؤسسة النقل السريع للخدمات اللوجستية',
          'Fast Cargo Logistics Est.',
          'أبو خالد الشمري',
          '+966 54 888 2211',
          'محمد إقبال',
          '4481-ل ح د',
          '45',
          '16',
        ],
      ],
    },
  };

  const currentTemplate = templates[entityType];

  // 2. Download CSV Template
  const handleDownloadTemplate = () => {
    // Generate UTF-8 CSV with BOM for proper Excel Arabic display
    const bom = '\uFEFF';
    const headerRow = currentTemplate.headerLabelsAr.join(',');
    const sampleRowsText = currentTemplate.sampleRows.map((r) => r.map((val) => `"${val}"`).join(',')).join('\n');
    const csvContent = `${bom}${headerRow}\n${sampleRowsText}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', currentTemplate.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Robust CSV Parser Helper
  const parseCSVText = (text: string) => {
    if (!text.trim()) return;

    // Remove BOM if present
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      showToast(isAr ? 'الملف لا يحتوي على بيانات كافية (مطلوب سطر الترويسة وسطر بيانات على الأقل)' : 'File has insufficient data', 'warning');
      return;
    }

    // Split headers - handle comma, semicolon, tab
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const rawHeaders = parseLine(firstLine);
    const rows = lines.slice(1).map((l) => parseLine(l));

    // Map rows based on entity type
    const parsed: ParsedRow[] = [];

    rows.forEach((rowValues) => {
      if (rowValues.every((v) => !v.trim())) return; // Skip empty line

      const rowObj: Record<string, string> = {};
      rawHeaders.forEach((h, idx) => {
        rowObj[h] = rowValues[idx] || '';
      });

      const messages: string[] = [];
      let status: 'valid' | 'warning' | 'error' = 'valid';
      let mappedData: any = {};

      if (entityType === 'customers') {
        const customerName = rowValues[0] || rowObj['customerName'] || rowObj['اسم العميل'] || '';
        const customerNameEn = rowValues[1] || rowObj['customerNameEn'] || '';
        const taxNumber = (rowValues[2] || rowObj['taxNumber'] || rowObj['الرقم الضريبي'] || '').replace(/\s+/g, '');
        const crNumber = rowValues[3] || rowObj['crNumber'] || rowObj['السجل التجاري'] || '';
        const contactPerson = rowValues[4] || rowObj['contactPerson'] || rowObj['مسؤول التواصل'] || '';
        const phone = rowValues[5] || rowObj['phone'] || rowObj['رقم الجوال'] || '';
        const email = rowValues[6] || rowObj['email'] || rowObj['البريد'] || '';
        const address = rowValues[7] || rowObj['address'] || rowObj['العنوان'] || '';
        const creditLimit = parseFloat(rowValues[8] || rowObj['creditLimit'] || '0') || 500000;
        const openingBalance = parseFloat(rowValues[9] || rowObj['openingBalance'] || '0') || 0;

        if (!customerName.trim()) {
          status = 'error';
          messages.push(isAr ? 'اسم العميل حقل إلزامي مفقود' : 'Customer Name is required');
        }

        if (taxNumber && taxNumber.length !== 15) {
          status = status === 'error' ? 'error' : 'warning';
          messages.push(isAr ? 'الرقم الضريبي يجب أن يتكون من 15 رقم (ZATCA VAT)' : 'Tax Number should be 15 digits');
        }

        // Duplicate check in existing
        const exists = customers.some(
          (c) =>
            c.customerName.trim().toLowerCase() === customerName.trim().toLowerCase() ||
            (taxNumber && c.taxNumber && c.taxNumber === taxNumber)
        );
        if (exists) {
          if (status !== 'error') status = 'warning';
          messages.push(isAr ? 'سجل متطابق مسبقاً (سيتم التحديث)' : 'Existing record matched (will update)');
        }

        mappedData = {
          customerName,
          customerNameEn: customerNameEn || customerName,
          taxNumber: taxNumber || '300000000000003',
          crNumber: crNumber || '1010000000',
          contactPerson: contactPerson || 'مسؤول التوريدات',
          phone: phone || '+966 50 000 0000',
          email: email || 'info@client.sa',
          address: address || 'المملكة العربية السعودية',
          creditLimit,
          openingBalance,
          is_deleted: false,
        };
      } else if (entityType === 'crushers') {
        const crusherName = rowValues[0] || rowObj['crusherName'] || rowObj['اسم الكسارة'] || '';
        const crusherNameEn = rowValues[1] || rowObj['crusherNameEn'] || '';
        const location = rowValues[2] || rowObj['location'] || rowObj['الموقع'] || '';
        const bankDetails = rowValues[3] || rowObj['bankDetails'] || rowObj['البنك'] || '';
        const openingBalance = parseFloat(rowValues[4] || rowObj['openingBalance'] || '0') || 0;
        const contactPerson = rowValues[5] || rowObj['contactPerson'] || rowObj['مسؤول التواصل'] || '';
        const phone = rowValues[6] || rowObj['phone'] || rowObj['الجوال'] || '';
        const taxNumber = (rowValues[7] || rowObj['taxNumber'] || '').replace(/\s+/g, '');

        if (!crusherName.trim()) {
          status = 'error';
          messages.push(isAr ? 'اسم الكسارة إلزامي' : 'Crusher Name is required');
        }

        if (!location.trim()) {
          status = status === 'error' ? 'error' : 'warning';
          messages.push(isAr ? 'الموقع الجغرافي يفضل تحديده' : 'Location recommended');
        }

        const exists = crushers.some(
          (c) =>
            c.crusherName.trim().toLowerCase() === crusherName.trim().toLowerCase() ||
            (taxNumber && c.taxNumber && c.taxNumber === taxNumber)
        );
        if (exists) {
          if (status !== 'error') status = 'warning';
          messages.push(isAr ? 'كسارة موجودة مسبقاً (سيتم التحديث)' : 'Existing crusher matched');
        }

        mappedData = {
          crusherName,
          crusherNameEn: crusherNameEn || crusherName,
          location: location || 'طريق الخرج - منطقة الكسارات',
          bankDetails: bankDetails || 'مصرف الراجحي - SA0000000000000000000000',
          openingBalance,
          contactPerson: contactPerson || 'إدارة المبيعات',
          phone: phone || '+966 50 000 0000',
          taxNumber: taxNumber || '300000000000003',
          is_deleted: false,
        };
      } else if (entityType === 'transporters') {
        const transporterName = rowValues[0] || rowObj['transporterName'] || rowObj['اسم الناقل'] || '';
        const transporterNameEn = rowValues[1] || rowObj['transporterNameEn'] || '';
        const contactPerson = rowValues[2] || rowObj['contactPerson'] || '';
        const phone = rowValues[3] || rowObj['phone'] || '';
        const driverName = rowValues[4] || rowObj['driverName'] || '';
        const truckNo = rowValues[5] || rowObj['truckNo'] || '';
        const capacityTons = parseFloat(rowValues[6] || '45') || 45;
        const ratePerTon = parseFloat(rowValues[7] || '16') || 16;

        if (!transporterName.trim()) {
          status = 'error';
          messages.push(isAr ? 'اسم مقاول النقل إلزامي' : 'Transporter Name is required');
        }

        mappedData = {
          transporterName,
          transporterNameEn: transporterNameEn || transporterName,
          contactPerson: contactPerson || 'مشرف الحركة',
          phone: phone || '+966 50 000 0000',
          driverName: driverName || 'سائق معتمد',
          truckNo: truckNo || '1000-أ ب ج',
          capacityTons,
          ratePerTon,
          is_deleted: false,
        };
      }

      parsed.push({
        raw: rowObj,
        mapped: mappedData,
        status,
        messages,
      });
    });

    setParsedRows(parsed);
    setActiveTab('preview');
  };

  // 4. File input handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      parseCSVText(content);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // 5. Commit Batch Upload
  const handleExecuteImport = () => {
    const validRows = parsedRows.filter((r) => r.status !== 'error').map((r) => r.mapped);
    if (validRows.length === 0) {
      showToast(isAr ? 'لا توجد سجلات صالحة للاستيراد' : 'No valid records to import', 'warning');
      return;
    }

    setIsProcessing(true);

    setTimeout(() => {
      let result = { addedCount: 0, updatedCount: 0 };
      if (entityType === 'customers') {
        result = batchAddCustomers(validRows, updateExisting);
      } else if (entityType === 'crushers') {
        result = batchAddCrushers(validRows, updateExisting);
      } else if (entityType === 'transporters') {
        result = batchAddTransporters(validRows, updateExisting);
      }

      setImportSummary({ added: result.addedCount, updated: result.updatedCount });
      setIsProcessing(false);
      showToast(
        isAr
          ? `تم استيراد ${result.addedCount} سجل جديد وتحديث ${result.updatedCount} سجل بنجاح`
          : `Successfully imported ${result.addedCount} new records and updated ${result.updatedCount}`,
        'success'
      );

      if (onImportComplete) {
        onImportComplete({
          entityType,
          addedCount: result.addedCount,
          updatedCount: result.updatedCount,
        });
      }
    }, 600);
  };

  const validCount = parsedRows.filter((r) => r.status === 'valid').length;
  const warningCount = parsedRows.filter((r) => r.status === 'warning').length;
  const errorCount = parsedRows.filter((r) => r.status === 'error').length;

  const filteredRows = parsedRows.filter((r) => {
    if (filterStatus === 'all') return true;
    return r.status === filterStatus;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#141726] shadow-2xl overflow-hidden transition-colors"
        id="csv-import-modal-container"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-orange-950 via-neutral-950 to-slate-900 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/30">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="csv-import-title" className="text-base font-black tracking-tight">
                  {isAr ? 'استيراد البيانات الجماعية عبر CSV / Excel' : 'Batch CSV / Excel Data Importer'}
                </h2>
                <span className="rounded-full bg-orange-500/30 px-2.5 py-0.5 text-[10px] font-bold text-orange-200 border border-orange-400/20">
                  Batch Engine v2.4
                </span>
              </div>
              <p className="text-xs text-orange-200/80">
                {isAr
                  ? 'رفع وتحديث سجلات العملاء وموردي المواد وموردي الخدمات دفعة واحدة مع التحقق التلقائي'
                  : 'Batch upload and sync master data with real-time ZATCA tax validation'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-6 py-2">
          <div className="flex gap-2">
            <div className="flex rounded-xl bg-slate-200/70 dark:bg-slate-800 p-1">
              <button
                onClick={() => {
                  setEntityType('customers');
                  setParsedRows([]);
                  setActiveTab('upload');
                }}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                  entityType === 'customers' ? 'bg-white dark:bg-slate-900 text-orange-950 dark:text-orange-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isAr ? 'العملاء (Customers)' : 'Customers'}
              </button>
              <button
                onClick={() => {
                  setEntityType('crushers');
                  setParsedRows([]);
                  setActiveTab('upload');
                }}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                  entityType === 'crushers' ? 'bg-white dark:bg-slate-900 text-orange-950 dark:text-orange-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isAr ? 'موردي المواد (Material Suppliers)' : 'Material Suppliers'}
              </button>
              <button
                onClick={() => {
                  setEntityType('transporters');
                  setParsedRows([]);
                  setActiveTab('upload');
                  setImportSummary(null);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                  entityType === 'transporters' ? 'bg-white dark:bg-slate-900 text-orange-950 dark:text-orange-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isAr ? 'موردي الخدمات (Service Suppliers)' : 'Service Suppliers'}
              </button>
            </div>
          </div>

          {/* Download Template button */}
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/40 px-3 py-1.5 text-xs font-bold text-orange-800 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/60 transition-colors shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isAr ? 'تحميل نموذج CSV الجاهز' : 'Download Sample CSV'}</span>
          </button>
        </div>

        {/* Success Banner if finished */}
        {importSummary && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black">
                  {isAr ? 'تم استيراد ومعالجة البيانات بنجاح!' : 'Batch Import Completed Successfully!'}
                </h4>
                <p className="text-xs text-emerald-700">
                  {isAr
                    ? `تمت إضافة (${importSummary.added}) سجل جديد، وتحديث (${importSummary.updated}) سجل موجود مسبقاً في قاعدة البيانات.`
                    : `Added ${importSummary.added} new records and updated ${importSummary.updated} existing records.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setParsedRows([]);
                setImportSummary(null);
                setActiveTab('upload');
              }}
              className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
            >
              {isAr ? 'استيراد ملف إضافي' : 'Import Another'}
            </button>
          </div>
        )}

        {/* Tab Navigation for Step */}
        <div className="flex border-b border-slate-200 px-6 pt-3">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'upload'
                ? 'border-orange-600 text-orange-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UploadCloud className="h-4 w-4" />
            <span>{isAr ? '1. رفع ملف (.csv)' : '1. Upload File'}</span>
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'paste'
                ? 'border-orange-600 text-orange-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Copy className="h-4 w-4" />
            <span>{isAr ? '2. لصق بيانات من Excel' : '2. Paste Raw Text'}</span>
          </button>
          <button
            onClick={() => parsedRows.length > 0 && setActiveTab('preview')}
            disabled={parsedRows.length === 0}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'preview'
                ? 'border-orange-600 text-orange-700'
                : parsedRows.length === 0
                ? 'border-transparent text-slate-300 cursor-not-allowed'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>
              {isAr ? `3. المعاينة والاعتماد (${parsedRows.length})` : `3. Preview & Commit (${parsedRows.length})`}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: FILE UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 p-10 text-center hover:border-orange-500 hover:bg-orange-50/30 dark:hover:bg-slate-800/40 transition-all cursor-pointer"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-sm font-black text-slate-900 dark:text-slate-100">
                  {isAr ? 'اسحب ملف CSV وأفلته هنا، أو انقر للاختيار' : 'Drag and drop your CSV file here, or browse'}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                  {isAr
                    ? 'يدعم ملفات CSV بترميز UTF-8 المستخرجة من Excel أو أنظمة ERP السابقة'
                    : 'Supports UTF-8 CSV exports from Excel, Google Sheets, or legacy ERP systems'}
                </p>
                {fileName && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-50 dark:bg-orange-950/60 px-3 py-1.5 text-xs font-bold text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/60">
                    <FileText className="h-4 w-4" />
                    <span>{fileName}</span>
                  </div>
                )}
              </div>

              {/* Instructions Callout */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                  <HelpCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <span>{isAr ? 'إرشادات استيراد البيانات:' : 'Import Guidelines:'}</span>
                </div>
                <ul className="list-disc list-inside text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <li>
                    {isAr
                      ? 'يجب أن يحتوي السطر الأول على أسماء الأعمدة مطابقة للنموذج المعتمد.'
                      : 'First row must contain the exact column headers from the template.'}
                  </li>
                  <li>
                    {isAr
                      ? 'الرقم الضريبي يجب أن يكون 15 خانة وفق معايير هيئة الزكاة والضريبة والجمارك (ZATCA).'
                      : 'Tax numbers should follow 15-digit ZATCA VAT formatting.'}
                  </li>
                  <li>
                    {isAr
                      ? 'يمكنك تعديل أي بيانات يدوياً من جدول المعاينة قبل الضغط على زر الحفظ النهائي.'
                      : 'You can review and edit parsed items in the preview table before final save.'}
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: PASTE RAW TEXT */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 block mb-1.5">
                  {isAr ? 'الصق الأعمدة المنسوخة من جدول Excel هنا مباشرة:' : 'Paste table data copied from Excel:'}
                </label>
                <textarea
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={
                    isAr
                      ? 'اسم العميل,الرقم الضريبي,السجل التجاري,مسؤول التواصل,رقم الجوال\nشركة المقاولات المتحدة,300184920100003,1010394821,أبو فهد,+966501112233'
                      : 'Paste CSV or Tab-separated rows here...'
                  }
                  className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => parseCSVText(rawText)}
                  disabled={!rawText.trim()}
                  className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-50 shadow-xs"
                >
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  <span>{isAr ? 'معالجة النص والانتقال للمعاينة' : 'Parse & Proceed to Preview'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: PREVIEW & VALIDATION TABLE */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              {/* Filter Badges & Summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{isAr ? 'تصفية السجلات:' : 'Filter rows:'}</span>
                  <button
                    onClick={() => setFilterStatus('all')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                      filterStatus === 'all' ? 'bg-orange-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isAr ? 'الكل' : 'All'} ({parsedRows.length})
                  </button>
                  <button
                    onClick={() => setFilterStatus('valid')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                      filterStatus === 'valid' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {isAr ? 'سليم' : 'Valid'} ({validCount})
                  </button>
                  {warningCount > 0 && (
                    <button
                      onClick={() => setFilterStatus('warning')}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                        filterStatus === 'warning' ? 'bg-amber-600 text-white' : 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {isAr ? 'تنبيهات' : 'Warnings'} ({warningCount})
                    </button>
                  )}
                  {errorCount > 0 && (
                    <button
                      onClick={() => setFilterStatus('error')}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                        filterStatus === 'error' ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {isAr ? 'أخطاء' : 'Errors'} ({errorCount})
                    </button>
                  )}
                </div>

                {/* Option: Update existing */}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="rounded text-orange-600 focus:ring-orange-500"
                  />
                  <span>
                    {isAr
                      ? 'تحديث بيانات السجل في حال وجوده مسبقاً'
                      : 'Update existing records if matching'}
                  </span>
                </label>
              </div>

              {/* Table */}
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 font-black text-slate-800 dark:text-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">{isAr ? 'الحالة' : 'Status'}</th>
                      <th className="py-2.5 px-3">
                        {entityType === 'customers'
                          ? isAr ? 'اسم العميل' : 'Customer Name'
                          : entityType === 'crushers'
                          ? isAr ? 'اسم الكسارة' : 'Crusher Name'
                          : isAr ? 'اسم الناقل' : 'Transporter Name'}
                      </th>
                      <th className="py-2.5 px-3">{isAr ? 'الرقم الضريبي / الموقع' : 'Tax # / Details'}</th>
                      <th className="py-2.5 px-3">{isAr ? 'مسؤول التواصل / الهاتف' : 'Contact / Phone'}</th>
                      <th className="py-2.5 px-3 text-center">{isAr ? 'الرصيد / الحد' : 'Balance / Limit'}</th>
                      <th className="py-2.5 px-3">{isAr ? 'الملاحظات' : 'Notes'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                          row.status === 'error'
                            ? 'bg-rose-50/40 dark:bg-rose-950/30'
                            : row.status === 'warning'
                            ? 'bg-amber-50/30 dark:bg-amber-950/30'
                            : ''
                        }`}
                      >
                        <td className="py-2 px-3 text-center font-mono text-slate-400 dark:text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3">
                          {row.status === 'valid' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              {isAr ? 'جاهز' : 'Valid'}
                            </span>
                          )}
                          {row.status === 'warning' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                              <AlertCircle className="h-3 w-3" />
                              {isAr ? 'تنبيه' : 'Warning'}
                            </span>
                          )}
                          {row.status === 'error' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/50 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:text-rose-300">
                              <AlertCircle className="h-3 w-3" />
                              {isAr ? 'خطأ' : 'Error'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                          {row.mapped.customerName || row.mapped.crusherName || row.mapped.transporterName || '-'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {row.mapped.taxNumber || row.mapped.location || row.mapped.truckNo || '-'}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                          <div>{row.mapped.contactPerson}</div>
                          <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{row.mapped.phone}</div>
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-orange-950 dark:text-orange-400">
                          {row.mapped.openingBalance !== undefined
                            ? `${row.mapped.openingBalance.toLocaleString()} ر.س`
                            : '-'}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-500 dark:text-slate-400">
                          {row.messages.length > 0 ? row.messages.join(' | ') : isAr ? 'بيانات سليمة' : 'All clear'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-6 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {parsedRows.length > 0 && (
              <span>
                {isAr
                  ? `إجمالي السجلات القابلة للاستيراد: (${validCount + warningCount}) من أصل (${parsedRows.length})`
                  : `Ready to import: ${validCount + warningCount} of ${parsedRows.length}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            {activeTab === 'preview' && (
              <button
                onClick={handleExecuteImport}
                disabled={isProcessing || validCount + warningCount === 0}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-orange-500/20 hover:opacity-95 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{isAr ? 'جاري الاستيراد والتخزين...' : 'Importing...'}</span>
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" />
                    <span>
                      {isAr
                        ? `تنفيذ الاستيراد الجماعي (${validCount + warningCount} سجل)`
                        : `Commit Import (${validCount + warningCount} rows)`}
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
