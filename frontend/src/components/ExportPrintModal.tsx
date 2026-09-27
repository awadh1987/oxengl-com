import React, { useState, useMemo, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../context/AppContext';
import {
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
  X,
  Check,
  Calendar,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Eye,
  ShieldCheck,
  Building,
  Truck,
  TrendingDown,
  Sparkles,
  ExternalLink,
  Copy,
  Receipt,
  DollarSign,
  Maximize2,
} from 'lucide-react';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatTonnage,
  getMonthName,
  generateZatcaQR,
} from '../utils/formatters';
import { tafqeetArabic, tafqeetEnglish } from '../utils/tafqeet';
import { exportOperationsToExcel, exportInvoiceToExcel } from '../utils/excelExporter';
import {
  generateSingleMergedInvoicePdf,
  captureElementToPng,
  captureElementWithStaging,
  downloadBlob,
  base64DataUrlToUint8Array,
} from '../utils/pdfGenerator';
import { OfficialLetterheadHeader } from './OfficialLetterheadHeader';
import { OfficialLetterheadFooter } from './OfficialLetterheadFooter';
import { BrandLogo } from './BrandLogo';
import { PDFDocument } from 'pdf-lib';
import { BrandConfig } from '../types';

export type ExportDocType =
  | 'vat-invoice'
  | 'daily-operations'
  | 'crusher-statement'
  | 'transporter-shrinkage'
  | 'financial-vouchers';

interface ExportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDocType?: ExportDocType;
  initialCustomerId?: string;
  initialCrusherId?: string;
  initialTransporterId?: string;
  initialMonth?: number;
  initialYear?: number;
  initialOrientation?: 'portrait' | 'landscape';
}

export const ExportPrintModal: React.FC<ExportPrintModalProps> = ({
  isOpen,
  onClose,
  initialDocType = 'vat-invoice',
  initialCustomerId,
  initialCrusherId,
  initialTransporterId,
  initialMonth = 8,
  initialYear = 2026,
  initialOrientation = 'portrait',
}) => {
  const {
    accessibleOperations,
    customers,
    crushers,
    transporters,
    vouchers,
    brandConfig,
    currentUser,
    language,
  } = useApp();
  const isAr = language === 'ar';

  // Defensive array and object defaults to prevent crashes on API 500 or null responses
  const safeOperations = useMemo(() => (Array.isArray(accessibleOperations) ? accessibleOperations : []), [accessibleOperations]);
  const safeCustomers = useMemo(() => (Array.isArray(customers) ? customers : []), [customers]);
  const safeCrushers = useMemo(() => (Array.isArray(crushers) ? crushers : []), [crushers]);
  const safeTransporters = useMemo(() => (Array.isArray(transporters) ? transporters : []), [transporters]);
  const safeVouchers = useMemo(() => (Array.isArray(vouchers) ? vouchers : []), [vouchers]);
  const safeBrandConfig = useMemo(() => (brandConfig || {
    companyNameAr: 'شركة أوكسن للخدمات اللوجستية',
    companyNameEn: 'Oxen General Logistics',
    taxNumber: '300000000000003',
    crNumber: '1010000000',
    commercialRegistration: '1010000000',
    ceoNameAr: 'الرئيس التنفيذي',
    ceoTitleAr: 'المدير التنفيذي',
    bankNameAr: 'مصرف الراجحي',
    bankAccountNumber: '123456789012345',
    bankIban: 'SA0000000000000000000000',
    iban: 'SA0000000000000000000000',
  }) as BrandConfig, [brandConfig]);

  // Document Configuration State
  const [docType, setDocType] = useState<ExportDocType>(initialDocType);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    initialDocType === 'daily-operations' ? 'landscape' : initialOrientation
  );
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Filters State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomerId || safeCustomers[0]?.id || ''
  );
  const [selectedCrusherId, setSelectedCrusherId] = useState<string>(
    initialCrusherId || safeCrushers[0]?.id || ''
  );
  const [selectedTransporterId, setSelectedTransporterId] = useState<string>(
    initialTransporterId || safeTransporters[0]?.id || ''
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [dateFilterMode, setDateFilterMode] = useState<'month' | 'all-year' | 'all-time'>('month');

  // Display Option Toggles
  const [showLetterhead, setShowLetterhead] = useState(true);
  const [showZatcaQR, setShowZatcaQR] = useState(true);
  const [showStampSignature, setShowStampSignature] = useState(true);
  const [showTafqeet, setShowTafqeet] = useState(true);
  const [showKpiSummary, setShowKpiSummary] = useState(true);
  const [showBankDetails, setShowBankDetails] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  const [showLossWarningBadge, setShowLossWarningBadge] = useState(true);

  // Custom notes state
  const [customNotes, setCustomNotes] = useState<string>('');

  // Processing & Copy state
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedAlert, setCopiedAlert] = useState(false);

  // Target printable container ref
  const printPreviewRef = useRef<HTMLDivElement | null>(null);

  // Reset defaults when opening with props
  React.useEffect(() => {
    if (isOpen) {
      if (initialDocType) {
        setDocType(initialDocType);
        if (initialDocType === 'daily-operations') {
          setOrientation('landscape');
        } else {
          setOrientation(initialOrientation || 'portrait');
        }
      }
      if (initialCustomerId) setSelectedCustomerId(initialCustomerId);
      if (initialCrusherId) setSelectedCrusherId(initialCrusherId);
      if (initialTransporterId) setSelectedTransporterId(initialTransporterId);
      if (initialMonth) setSelectedMonth(initialMonth);
      if (initialYear) setSelectedYear(initialYear);
    }
  }, [isOpen, initialDocType, initialCustomerId, initialCrusherId, initialTransporterId, initialMonth, initialYear, initialOrientation]);

  // Selected Entities
  const selectedCustomer = useMemo(
    () => safeCustomers.find((c) => c?.id === selectedCustomerId) || safeCustomers[0] || null,
    [safeCustomers, selectedCustomerId]
  );
  const selectedCrusher = useMemo(
    () => safeCrushers.find((c) => c?.id === selectedCrusherId) || safeCrushers[0] || null,
    [safeCrushers, selectedCrusherId]
  );
  const selectedTransporter = useMemo(
    () => safeTransporters.find((t) => t?.id === selectedTransporterId) || safeTransporters[0] || null,
    [safeTransporters, selectedTransporterId]
  );

  // Filtered Operations based on context and active document type
  const filteredOperations = useMemo(() => {
    return safeOperations.filter((op) => {
      if (!op) return false;
      // Date filter
      if (dateFilterMode === 'month') {
        if (op.operation_month !== selectedMonth || op.operation_year !== selectedYear) return false;
      } else if (dateFilterMode === 'all-year') {
        if (op.operation_year !== selectedYear) return false;
      }

      // Entity filters based on active document type
      if (docType === 'vat-invoice' && selectedCustomer) {
        const dest = op.destination_customer || (op as any).destination_customer_name || '';
        const matchName =
          (selectedCustomer.customerName && dest.includes(selectedCustomer.customerName)) ||
          (selectedCustomer.customerNameEn && dest.includes(selectedCustomer.customerNameEn));
        if (!matchName) return false;
      } else if (docType === 'crusher-statement' && selectedCrusher) {
        const src = op.loading_source || (op as any).material_supplier_name || '';
        const matchCrusher =
          (selectedCrusher.crusherName && src.includes(selectedCrusher.crusherName)) ||
          (selectedCrusher.crusherNameEn && src.includes(selectedCrusher.crusherNameEn));
        if (!matchCrusher) return false;
      } else if (docType === 'transporter-shrinkage' && selectedTransporter) {
        const trans = op.transporter_name || (op as any).service_supplier_name || '';
        const matchTrans =
          (selectedTransporter.transporterName && trans.includes(selectedTransporter.transporterName)) ||
          (selectedTransporter.transporterNameEn && trans.includes(selectedTransporter.transporterNameEn));
        if (!matchTrans) return false;
      }

      return true;
    });
  }, [safeOperations, dateFilterMode, selectedMonth, selectedYear, docType, selectedCustomer, selectedCrusher, selectedTransporter]);

  // Aggregated Invoicing Items (for VAT Invoice mode)
  const invoiceItems = useMemo(() => {
    const map: Record<string, { trips: number; loaded: number; delivered: number; wastage: number; sales: number }> = {};

    filteredOperations.forEach((op) => {
      const matType = op?.material_type || (op as any)?.product_name || (isAr ? 'مواد عامة' : 'General Material');
      if (!map[matType]) {
        map[matType] = { trips: 0, loaded: 0, delivered: 0, wastage: 0, sales: 0 };
      }
      map[matType].trips += 1;
      map[matType].loaded += Number(op?.qty_loaded || (op as any)?.net_weight || 0);
      map[matType].delivered += Number(op?.qty_delivered || (op as any)?.net_weight || 0);
      map[matType].wastage += Number(op?.qty_wastage || 0);
      map[matType].sales += Number(op?.sales_amount || 0);
    });

    return Object.entries(map).map(([materialType, data]) => {
      const unitPrice = data.delivered > 0 ? Number((data.sales / data.delivered).toFixed(2)) : 44;
      const subtotal = Number(data.sales.toFixed(2));
      const vatAmount = Number((subtotal * 0.15).toFixed(2));
      const total = Number((subtotal + vatAmount).toFixed(2));

      return {
        materialType,
        tripsCount: data.trips,
        loadedWeight: Number(data.loaded.toFixed(2)),
        deliveredWeight: Number(data.delivered.toFixed(2)),
        wastageWeight: Number(data.wastage.toFixed(2)),
        unitPrice,
        subtotal,
        vatAmount,
        total,
      };
    });
  }, [filteredOperations, isAr]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalLoaded = filteredOperations.reduce((acc, op) => acc + Number(op?.qty_loaded || (op as any)?.net_weight || 0), 0);
    const totalDelivered = filteredOperations.reduce((acc, op) => acc + Number(op?.qty_delivered || (op as any)?.net_weight || 0), 0);
    const totalWastage = filteredOperations.reduce((acc, op) => acc + Number(op?.qty_wastage || 0), 0);
    const totalSales = filteredOperations.reduce((acc, op) => acc + Number(op?.sales_amount || 0), 0);
    const totalVat = totalSales * 0.15;
    const grandTotal = totalSales + totalVat;
    const totalPurchases = filteredOperations.reduce((acc, op) => acc + Number(op?.purchases_cost || 0), 0);
    const totalProfit = totalSales - totalPurchases;
    const overallWastageRate = totalLoaded > 0 ? (totalWastage / totalLoaded) * 100 : 0;

    return {
      totalTrips: filteredOperations.length,
      totalLoaded,
      totalDelivered,
      totalWastage,
      overallWastageRate,
      totalSales,
      totalVat,
      grandTotal,
      totalPurchases,
      totalProfit,
    };
  }, [filteredOperations]);

  // Voucher Metrics for financial-vouchers docType
  const voucherMetrics = useMemo(() => {
    const totalCount = safeVouchers.length;
    const paymentTotal = safeVouchers
      .filter((v) => v?.type === 'Payment')
      .reduce((acc, v) => acc + Number(v?.amount || 0), 0);
    const receiptTotal = safeVouchers
      .filter((v) => v?.type === 'Receipt')
      .reduce((acc, v) => acc + Number(v?.amount || 0), 0);
    const netFlow = receiptTotal - paymentTotal;
    return { totalCount, paymentTotal, receiptTotal, netFlow };
  }, [safeVouchers]);

  // Dynamic Metadata
  const docRefNumber = useMemo(() => {
    const prefixMap: Record<ExportDocType, string> = {
      'vat-invoice': 'TAX-INV',
      'daily-operations': 'DLY-OPS',
      'crusher-statement': 'CRUSH-STMT',
      'transporter-shrinkage': 'TRN-LOSS',
      'financial-vouchers': 'FIN-VCH',
    };
    const entityTag =
      docType === 'vat-invoice'
        ? selectedCustomer?.crNumber?.slice(-4) || 'CUST'
        : docType === 'crusher-statement'
        ? selectedCrusher?.id?.slice(-3) || 'CRSH'
        : 'ALL';
    return `${prefixMap[docType] || 'DOC'}-${selectedYear}${String(selectedMonth).padStart(2, '0')}-${entityTag}`;
  }, [docType, selectedYear, selectedMonth, selectedCustomer, selectedCrusher]);

  const docIssueDate = `2026-${String(selectedMonth).padStart(2, '0')}-28`;

  // ZATCA Cryptographic QR Code Base64
  const zatcaQrBase64 = useMemo(() => {
    return generateZatcaQR(
      safeBrandConfig.companyNameAr || 'OxenGL',
      safeBrandConfig.taxNumber || '300000000000003',
      `${docIssueDate}T12:00:00Z`,
      summaryMetrics.grandTotal || 0,
      summaryMetrics.totalVat || 0
    );
  }, [safeBrandConfig, docIssueDate, summaryMetrics.grandTotal, summaryMetrics.totalVat]);

  // Tafqeet String
  const amountInWordsAr = useMemo(() => {
    return tafqeetArabic(summaryMetrics.grandTotal || 0, 'ريال سعودي', 'هللة');
  }, [summaryMetrics.grandTotal]);

  const amountInWordsEn = useMemo(() => {
    return tafqeetEnglish(summaryMetrics.grandTotal || 0, 'Saudi Riyals', 'Halalas');
  }, [summaryMetrics.grandTotal]);

  // Escape key handler - must be before any conditional early returns
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Actions
  const handleSystemPrint = () => {
    // Inject dynamic print styling for orientation
    const existingStyle = document.getElementById('dynamic-print-page-style');
    if (existingStyle) existingStyle.remove();

    const style = document.createElement('style');
    style.id = 'dynamic-print-page-style';
    style.innerHTML = `
      @media print {
        @page {
          size: A4 ${orientation};
          margin: 10mm 12mm 12mm 12mm;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.classList.add('printing-export-modal');

    window.print();

    setTimeout(() => {
      document.body.classList.remove('printing-export-modal');
      const s = document.getElementById('dynamic-print-page-style');
      if (s?.parentNode) s.parentNode.removeChild(s);
    }, 1000);
  };

  const handleDownloadPdf = async () => {
    // Robust ref and DOM fallback resolution
    const targetElement =
      printPreviewRef.current ||
      (document.getElementById('export-print-preview-content') as HTMLElement) ||
      (document.querySelector('.print-container') as HTMLElement) ||
      (document.getElementById('customer-tax-invoice-printable') as HTMLElement);

    if (!targetElement) {
      console.error('Target printable element not found in DOM.');
      alert(isAr ? 'لم يتم العثور على محتوى المستند للطباعة.' : 'Failed to generate PDF document: target element not found.');
      return;
    }

    try {
      setIsExportingPdf(true);
      const targetWidth = orientation === 'landscape' ? 1100 : 850;
      const pngDataUrl = await captureElementWithStaging(targetElement, 2, targetWidth);
      const pdfDoc = await PDFDocument.create();

      // A4 dimensions in points: portrait 595.28 x 841.89, landscape 841.89 x 595.28
      const a4Width = orientation === 'portrait' ? 595.28 : 841.89;
      const a4Height = orientation === 'portrait' ? 841.89 : 595.28;

      // Safe in-memory decoding that avoids fetch() data URL security restrictions
      const imageBytes = base64DataUrlToUint8Array(pngDataUrl);
      const pngImage = await pdfDoc.embedPng(imageBytes);

      const imgDims = pngImage.scaleToFit(a4Width - 30, a4Height - 30);
      const page = pdfDoc.addPage([a4Width, a4Height]);

      const x = (a4Width - imgDims.width) / 2;
      const y = a4Height - imgDims.height - 15;

      page.drawImage(pngImage, {
        x,
        y,
        width: imgDims.width,
        height: imgDims.height,
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      downloadBlob(blob, `OxenGL_${docType}_${docRefNumber}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      alert(isAr ? 'حدث خطأ أثناء إنشاء ملف PDF.' : 'Failed to generate PDF document.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = () => {
    if (docType === 'vat-invoice' && selectedCustomer) {
      const mockInvoice = {
        id: docRefNumber,
        invoiceNumber: docRefNumber,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.customerName,
        customerTaxNumber: selectedCustomer.taxNumber,
        billingMonth: selectedMonth,
        billingYear: selectedYear,
        issueDate: docIssueDate,
        dueDate: `2026-${String(selectedMonth + 1).padStart(2, '0')}-28`,
        items: invoiceItems,
        subtotal: summaryMetrics.totalSales,
        vatAmount: summaryMetrics.totalVat,
        grandTotal: summaryMetrics.grandTotal,
        totalTrips: summaryMetrics.totalTrips,
        totalLoadedWeight: summaryMetrics.totalLoaded,
        totalDeliveredWeight: summaryMetrics.totalDelivered,
        totalWastageWeight: summaryMetrics.totalWastage,
        status: 'Approved' as const,
        preparedBy: currentUser?.fullNameAr || currentUser?.fullName || 'Operator',
        preparedByRole: currentUser?.role || 'Admin',
      };
      exportInvoiceToExcel(mockInvoice, matchingTripsForInvoice());
    } else {
      exportOperationsToExcel(filteredOperations, `Meayon_${docType}`);
    }
  };

  const matchingTripsForInvoice = () => {
    return filteredOperations;
  };

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}/?preview_doc=${encodeURIComponent(
      docRefNumber
    )}&type=${docType}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };



  return (
    <div
      id="export-print-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 backdrop-blur-md transition-all overflow-hidden"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isAr ? 'مركز المعاينة الحية والطباعة والتصدير' : 'Live Print & Export Studio'}
        className="flex h-[96vh] w-full max-w-[1440px] flex-col rounded-3xl border border-slate-700/80 bg-slate-900 shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/90 px-5 py-3.5 gap-3 shrink-0 no-print export-modal-header">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-600/30 text-orange-400 border border-orange-500/30 shadow-inner">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-white">
                  {isAr ? 'مركز المعاينة الحية والطباعة والتصدير' : 'Live Print & Export Studio'}
                </h2>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  {isAr ? 'معايير ZATCA والفوترة المعتمدة' : 'ZATCA Standard Compliant'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'معاينة حية للمستند قبل إرساله إلى الطابعة، متوافق مع الفاتورة الضريبية وسجلات العمليات وكشوف الحساب'
                  : 'Live WYSIWYG paper preview before printing to system printer or exporting PDF'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 rounded-xl bg-slate-800 p-1 border border-slate-700 text-xs">
              <button
                onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300"
                title={isAr ? 'تصغير' : 'Zoom Out'}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 font-mono text-[11px] text-slate-300 min-w-[42px] text-center font-bold">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300"
                title={isAr ? 'تكبير' : 'Zoom In'}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="px-1.5 py-1 text-[10px] font-bold rounded-lg hover:bg-slate-700 text-orange-300"
              >
                100%
              </button>
            </div>

            {/* Excel Export */}
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              <span className="hidden md:inline">{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
            </button>

            {/* Download PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 rounded-xl border border-orange-500/40 bg-neutral-950/60 px-3.5 py-2 text-xs font-bold text-orange-200 hover:bg-orange-950 transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4 text-orange-400" />
              <span>{isExportingPdf ? (isAr ? 'جاري التحميل...' : 'Generating...') : (isAr ? 'تحميل PDF' : 'Download PDF')}</span>
            </button>

            {/* Print Directly */}
            <button
              id="export-modal-print-btn"
              onClick={handleSystemPrint}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-emerald-950/50 hover:opacity-95 transition-all"
            >
              <Printer className="h-4 w-4" />
              <span>{isAr ? 'إرسال إلى الطابعة (Print)' : 'Send to Printer'}</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors ml-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Main Content Area: Sidebar Controls + Live Preview Canvas */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left / Right Settings Sidebar */}
          <div
            id="export-modal-sidebar"
            className="w-80 sm:w-88 shrink-0 border-e border-slate-800 bg-slate-900/95 p-4 overflow-y-auto space-y-5 text-xs no-print"
          >
            {/* 1. Document Type Selector */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                {isAr ? 'نوع المستند المطلوب طباعته:' : 'Select Document Template:'}
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  {
                    id: 'vat-invoice' as ExportDocType,
                    labelAr: 'فاتورة ضريبية معتمدة (ZATCA VAT)',
                    labelEn: 'Standard Saudi Tax Invoice',
                    icon: Receipt,
                    defaultOrientation: 'portrait',
                  },
                  {
                    id: 'daily-operations' as ExportDocType,
                    labelAr: 'قيد العمليات وتذاكر الميزان (Log)',
                    labelEn: 'Daily Operations & Scale Register',
                    icon: Layers,
                    defaultOrientation: 'landscape',
                  },
                  {
                    id: 'crusher-statement' as ExportDocType,
                    labelAr: 'كشف حساب ومطابقة موردي المواد',
                    labelEn: 'Material Supplier Statement',
                    icon: Building,
                    defaultOrientation: 'portrait',
                  },
                  {
                    id: 'transporter-shrinkage' as ExportDocType,
                    labelAr: 'تقرير فاقد الوزن وأداء موردي الخدمات',
                    labelEn: 'Service Supplier Shrinkage Audit',
                    icon: TrendingDown,
                    defaultOrientation: 'portrait',
                  },
                  {
                    id: 'financial-vouchers' as ExportDocType,
                    labelAr: 'سندات الصرف والقبض الرسمية',
                    labelEn: 'Official Financial Vouchers',
                    icon: DollarSign,
                    defaultOrientation: 'portrait',
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = docType === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setDocType(item.id);
                        setOrientation(item.defaultOrientation as 'portrait' | 'landscape');
                      }}
                      className={`flex items-center gap-2.5 rounded-xl p-2.5 text-right transition-all font-bold ${
                        isActive
                          ? 'bg-orange-600 text-white shadow-md shadow-neutral-950'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-orange-400'}`} />
                      <span className="flex-1 truncate">{isAr ? item.labelAr : item.labelEn}</span>
                      {isActive && <Check className="h-3.5 w-3.5 text-white shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Paper Layout Orientation */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                {isAr ? 'اتجاه الصفحة (A4 Orientation):' : 'Page Layout:'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 font-bold transition-all ${
                    orientation === 'portrait'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  <RotateCw className="h-3.5 w-3.5 rotate-90" />
                  <span>{isAr ? 'رأسي (Portrait)' : 'Portrait'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 font-bold transition-all ${
                    orientation === 'landscape'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>{isAr ? 'أفقي (Landscape)' : 'Landscape'}</span>
                </button>
              </div>
            </div>

            {/* 3. Entity Context Filters */}
            <div className="space-y-3 rounded-2xl bg-slate-800/60 p-3.5 border border-slate-700/60">
              <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">
                {isAr ? 'تصفية البيانات والجهات:' : 'Scope & Filters:'}
              </span>

              {/* Customer selector for Invoices */}
              {docType === 'vat-invoice' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    {isAr ? 'العميل المستلم:' : 'Customer:'}
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                  >
                    {safeCustomers.map((c) => (
                      <option key={c?.id || Math.random()} value={c?.id}>
                        {c?.customerName || (isAr ? 'عميل' : 'Customer')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Crusher selector for Crusher statement */}
              {docType === 'crusher-statement' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    {isAr ? 'الكسارة / المورد:' : 'Crusher:'}
                  </label>
                  <select
                    value={selectedCrusherId}
                    onChange={(e) => setSelectedCrusherId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                  >
                    {safeCrushers.map((cr) => (
                      <option key={cr?.id || Math.random()} value={cr?.id}>
                        {cr?.crusherName || (isAr ? 'كسارة' : 'Crusher')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Transporter selector for Transporter loss */}
              {docType === 'transporter-shrinkage' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    {isAr ? 'الناقل / المقاول:' : 'Transporter:'}
                  </label>
                  <select
                    value={selectedTransporterId}
                    onChange={(e) => setSelectedTransporterId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                  >
                    {safeTransporters.map((tr) => (
                      <option key={tr?.id || Math.random()} value={tr?.id}>
                        {tr?.transporterName || (isAr ? 'ناقل' : 'Transporter')} {tr?.driverName ? `(${tr.driverName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Month / Period Filter */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    {isAr ? 'الشهر:' : 'Month:'}
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>
                        {getMonthName(m, language)} ({m})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    {isAr ? 'السنة:' : 'Year:'}
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 4. Display Toggles (Mandatory elements for official printing) */}
            <div className="space-y-2 rounded-2xl bg-slate-800/60 p-3.5 border border-slate-700/60">
              <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
                {isAr ? 'عناصر الطباعة الرسمية:' : 'Print Elements:'}
              </span>

              {[
                {
                  labelAr: 'الترويسة الرسمية (الشعار، السجل، الضريبة)',
                  labelEn: 'Official Letterhead Header',
                  state: showLetterhead,
                  setState: setShowLetterhead,
                },
                {
                  labelAr: 'رمز الاستجابة السريعة (ZATCA QR Code)',
                  labelEn: 'ZATCA Phase-2 QR Code',
                  state: showZatcaQR,
                  setState: setShowZatcaQR,
                },
                {
                  labelAr: 'الختم الرقمي والتوقيع المعتمد للرئيس',
                  labelEn: 'Official Stamp & Digital Signature',
                  state: showStampSignature,
                  setState: setShowStampSignature,
                },
                {
                  labelAr: 'التفقيط المالي (المبلغ كتابةً)',
                  labelEn: 'Tafqeet (Amount in words)',
                  state: showTafqeet,
                  setState: setShowTafqeet,
                },
                {
                  labelAr: 'بطاقات ملخص الأوزان والمؤشرات',
                  labelEn: 'Summary Metrics & Totals Bar',
                  state: showKpiSummary,
                  setState: setShowKpiSummary,
                },
                {
                  labelAr: 'الحسابات البنكية وملاحظات السداد',
                  labelEn: 'Bank Account & Wire Instructions',
                  state: showBankDetails,
                  setState: setShowBankDetails,
                },
                {
                  labelAr: 'تذييل التوثيق وإخلاء المسؤولية',
                  labelEn: 'Official Legal Footer',
                  state: showFooter,
                  setState: setShowFooter,
                },
              ].map((toggle, idx) => (
                <label
                  key={idx}
                  className="flex items-center justify-between gap-2 cursor-pointer py-1 text-slate-300 hover:text-white"
                >
                  <span className="text-[11px] font-medium">{isAr ? toggle.labelAr : toggle.labelEn}</span>
                  <input
                    type="checkbox"
                    checked={toggle.state}
                    onChange={(e) => toggle.setState(e.target.checked)}
                    className="h-4 w-4 rounded accent-orange-600 focus:ring-0"
                  />
                </label>
              ))}
            </div>

            {/* 5. Custom Notes Editor */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                {isAr ? 'ملاحظات أو شروط إضافية تظهر في التقرير:' : 'Custom Print Notes / Terms:'}
              </label>
              <textarea
                rows={2}
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder={
                  isAr
                    ? 'مثال: تخضع هذه المطابقة للمراجعة النهائية خلال 15 يوماً من تاريخ الإصدار...'
                    : 'Additional notes or terms printed on document...'
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Right Live Preview Canvas Area */}
          <div className="flex-1 overflow-y-auto bg-slate-950/60 p-4 sm:p-8 flex justify-center items-start">
            <div
              style={{
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-in-out',
              }}
              className="w-full max-w-[1000px]"
            >
              {/* Paper Preview Sheet Container */}
              <div
                id="export-print-preview-content"
                ref={printPreviewRef}
                dir={isAr ? 'rtl' : 'ltr'}
                className={`mx-auto bg-white text-slate-900 shadow-2xl rounded-2xl border border-slate-200 p-6 sm:p-10 font-sans transition-all print-container zatca-invoice-wrapper ${
                  orientation === 'landscape' ? 'max-w-[1100px]' : 'max-w-[850px]'
                }`}
              >
                {/* 1. Official Header */}
                {showLetterhead && (
                  <OfficialLetterheadHeader
                    brandConfig={safeBrandConfig}
                    documentTypeAr={
                      docType === 'vat-invoice'
                        ? 'فاتورة ضريبية معتمدة'
                        : docType === 'daily-operations'
                        ? 'سجل العمليات اليومية ومطابقة الحمولات'
                        : docType === 'crusher-statement'
                        ? 'كشف حساب ومطابقة موردي المواد'
                        : docType === 'transporter-shrinkage'
                        ? 'تقرير فاقد الوزن وأداء موردي الخدمات'
                        : 'سند مالي معتمد'
                    }
                    documentTypeEn={
                      docType === 'vat-invoice'
                        ? 'TAX INVOICE'
                        : docType === 'daily-operations'
                        ? 'DAILY DISPATCH & SCALE LOG'
                        : docType === 'crusher-statement'
                        ? 'MATERIAL SUPPLIER STATEMENT'
                        : docType === 'transporter-shrinkage'
                        ? 'SERVICE SUPPLIER LOSS AUDIT'
                        : 'FINANCIAL VOUCHER'
                    }
                    documentNumber={docRefNumber}
                    issueDate={docIssueDate}
                    isAr={isAr}
                  />
                )}

                {/* 2. Customer / Party Information Details (VAT Invoice Mode) */}
                {docType === 'vat-invoice' && selectedCustomer && (
                  <div className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 block mb-1">
                        {isAr ? 'بيانات العميل المستلم (Billed To):' : 'Billed To (Customer):'}
                      </span>
                      <h3 className="text-sm font-black text-slate-900">{selectedCustomer.customerName}</h3>
                      {selectedCustomer.customerNameEn && (
                        <p className="text-[11px] font-semibold text-slate-600 uppercase">
                          {selectedCustomer.customerNameEn}
                        </p>
                      )}
                      <div className="mt-2 space-y-0.5 text-slate-700">
                        <p>
                          {isAr ? 'الرقم الضريبي (VAT):' : 'VAT Number:'}{' '}
                          <strong className="font-mono text-slate-950 font-bold">
                            {selectedCustomer.taxNumber || '31099882200003'}
                          </strong>
                        </p>
                        {selectedCustomer.crNumber && (
                          <p>
                            {isAr ? 'السجل التجاري (CR):' : 'CR Number:'}{' '}
                            <strong className="font-mono text-slate-950">{selectedCustomer.crNumber}</strong>
                          </p>
                        )}
                        {selectedCustomer.address && (
                          <p>
                            {isAr ? 'العنوان الوطني:' : 'Address:'} {selectedCustomer.address}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col justify-between sm:text-left sm:items-end">
                      <div className="space-y-1 text-slate-700">
                        <p>
                          <span className="font-bold text-slate-500">{isAr ? 'رقم الفاتورة:' : 'Invoice No:'}</span>{' '}
                          <span className="font-mono font-bold text-orange-950">{docRefNumber}</span>
                        </p>
                        <p>
                          <span className="font-bold text-slate-500">{isAr ? 'تاريخ التوريد:' : 'Supply Date:'}</span>{' '}
                          <span>{docIssueDate}</span>
                        </p>
                        <p>
                          <span className="font-bold text-slate-500">{isAr ? 'تاريخ الاستحقاق:' : 'Due Date:'}</span>{' '}
                          <span>2026-09-28</span>
                        </p>
                        <p>
                          <span className="font-bold text-slate-500">{isAr ? 'دورة المطابقة:' : 'Billing Period:'}</span>{' '}
                          <span>
                            {getMonthName(selectedMonth, language)} {selectedYear}
                          </span>
                        </p>
                      </div>

                      {showZatcaQR && (
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-2 border border-slate-200 shadow-xs">
                          <QRCodeSVG
                            value={zatcaQrBase64}
                            size={64}
                            level="M"
                            includeMargin={false}
                            className="h-16 w-16"
                          />
                          <div className="text-[10px] text-slate-500 leading-tight">
                            <strong className="text-slate-800 block">ZATCA QR</strong>
                            <span>{isAr ? 'مشفر ومعتمد' : 'Verified QR'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Summary KPI Cards */}
                {showKpiSummary && (
                  <div className="my-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {isAr ? 'إجمالي الرحلات' : 'Total Trips'}
                      </span>
                      <span className="text-sm font-black text-slate-900">{summaryMetrics.totalTrips}</span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {isAr ? 'الوزن المستلم' : 'Delivered Weight'}
                      </span>
                      <span className="text-sm font-black text-orange-700">
                        {formatTonnage(summaryMetrics.totalDelivered, language)}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {isAr ? 'نسبة الفاقد' : 'Wastage Rate'}
                      </span>
                      <span
                        className={`text-sm font-black ${
                          summaryMetrics.overallWastageRate > 1.5 ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {formatNumber(summaryMetrics.overallWastageRate, language, 2)}%
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {isAr ? 'الإجمالي مع الضريبة' : 'Grand Total (VAT)'}
                      </span>
                      <span className="text-sm font-black text-emerald-700">
                        {formatCurrency(summaryMetrics.grandTotal, language)}
                      </span>
                    </div>
                  </div>
                )}

                {/* 4. Table Layout Based on Document Type */}
                {docType === 'vat-invoice' && (
                  <div className="my-5 overflow-hidden rounded-xl border border-slate-300">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold">
                          <th className="p-3 text-center">#</th>
                          <th className="p-3">{isAr ? 'الصنف والمادة' : 'Material Description'}</th>
                          <th className="p-3 text-center">{isAr ? 'عدد الردود' : 'Trips'}</th>
                          <th className="p-3 text-center">{isAr ? 'الكمية (MT طن)' : 'Qty (MT طن)'}</th>
                          <th className="p-3 text-center">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                          <th className="p-3 text-center">{isAr ? 'المبلغ بدون ضريبة' : 'Subtotal'}</th>
                          <th className="p-3 text-center">{isAr ? 'ضريبة (15%)' : 'VAT (15%)'}</th>
                          <th className="p-3 text-center">{isAr ? 'الإجمالي' : 'Total (SAR)'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {invoiceItems.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                              {isAr ? 'لا توجد بيانات عمليات مسجلة لهذه الفترة' : 'No recorded operations found for this period'}
                            </td>
                          </tr>
                        ) : (
                          invoiceItems.map((item, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                              <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                              <td className="p-3 font-bold text-slate-900">{item.materialType}</td>
                              <td className="p-3 text-center font-mono">{item.tripsCount}</td>
                              <td className="p-3 text-center font-mono font-bold">
                                {formatNumber(item.deliveredWeight, language, 2)}
                              </td>
                              <td className="p-3 text-center font-mono">
                                {formatCurrency(item.unitPrice, language)}
                              </td>
                              <td className="p-3 text-center font-mono">
                                {formatCurrency(item.subtotal, language)}
                              </td>
                              <td className="p-3 text-center font-mono">
                                {formatCurrency(item.vatAmount, language)}
                              </td>
                              <td className="p-3 text-center font-mono font-black text-neutral-950">
                                {formatCurrency(item.total, language)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tabular Layout for Daily Operations Log */}
                {docType === 'daily-operations' && (
                  <div className="my-5 overflow-x-auto rounded-xl border border-slate-300">
                    <table className="w-full text-right text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold">
                          <th className="p-2 text-center">#</th>
                          <th className="p-2">{isAr ? 'التاريخ' : 'Date'}</th>
                          <th className="p-2">{isAr ? 'الشاحنة' : 'Truck'}</th>
                          <th className="p-2">{isAr ? 'الناقل' : 'Transporter'}</th>
                          <th className="p-2">{isAr ? 'الكسارة' : 'Crusher'}</th>
                          <th className="p-2">{isAr ? 'العميل' : 'Customer'}</th>
                          <th className="p-2">{isAr ? 'المادة' : 'Material'}</th>
                          <th className="p-2 text-center">{isAr ? 'محمل (MT طن)' : 'Loaded (MT طن)'}</th>
                          <th className="p-2 text-center">{isAr ? 'مستلم (MT طن)' : 'Delivered (MT طن)'}</th>
                          <th className="p-2 text-center">{isAr ? 'الفاقد (MT طن)' : 'Loss (MT طن)'}</th>
                          <th className="p-2 text-center">{isAr ? 'تذكرة ميزان' : 'Ticket #'}</th>
                          <th className="p-2 text-center">{isAr ? 'المبيعات' : 'Sales'}</th>
                          <th className="p-2 text-center">{isAr ? 'الضريبة' : 'VAT'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredOperations.length === 0 ? (
                          <tr>
                            <td colSpan={13} className="p-8 text-center text-slate-500 font-medium">
                              {isAr ? 'لا توجد عمليات تطابق معايير التصفية المحددة' : 'No operations matching the selected filter criteria'}
                            </td>
                          </tr>
                        ) : (
                          filteredOperations.map((op, idx) => (
                            <tr key={op?.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="p-2 text-center font-bold text-slate-500">{idx + 1}</td>
                              <td className="p-2 font-mono whitespace-nowrap">{op?.loading_date || (op as any)?.weighed_in_at?.slice(0, 10) || '-'}</td>
                              <td className="p-2 font-mono font-bold text-slate-900">{op?.truck_no || (op as any)?.truck_number || '-'}</td>
                              <td className="p-2 truncate max-w-[120px]">{op?.transporter_name || (op as any)?.partner_name || '-'}</td>
                              <td className="p-2 truncate max-w-[100px]">{op?.loading_source || (op as any)?.source_location_name || '-'}</td>
                              <td className="p-2 truncate max-w-[120px] font-semibold">{op?.destination_customer || (op as any)?.dest_location_name || '-'}</td>
                              <td className="p-2">{op?.material_type || (op as any)?.product_name || '-'}</td>
                              <td className="p-2 text-center font-mono">{formatNumber(op?.qty_loaded || (op as any)?.net_weight || 0, language, 2)}</td>
                              <td className="p-2 text-center font-mono font-bold text-orange-950">
                                {formatNumber(op?.qty_delivered || (op as any)?.net_weight || 0, language, 2)}
                              </td>
                              <td
                                className={`p-2 text-center font-mono font-bold ${
                                  (op?.wastage_percentage || 0) > 1.5 ? 'text-rose-600' : 'text-slate-600'
                                }`}
                              >
                                {formatNumber(op?.qty_wastage || 0, language, 2)} ({formatNumber(op?.wastage_percentage || 0, language, 1)}%)
                              </td>
                              <td className="p-2 text-center font-mono text-[10px] text-slate-500">
                                {op?.scale_ticket_no || (op as any)?.ticket_number || '-'}
                              </td>
                              <td className="p-2 text-center font-mono">{formatCurrency(op?.sales_amount || 0, language)}</td>
                              <td className="p-2 text-center font-mono text-slate-500">
                                {formatCurrency(op?.vat_amount || 0, language)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tabular Layout for Crusher Statement */}
                {docType === 'crusher-statement' && (
                  <div className="my-5 space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-xs font-bold text-slate-900">
                        {isAr ? 'كشف حساب توريدات الكسارة:' : 'Crusher Statement of Supply:'}{' '}
                        <strong className="text-orange-950">{selectedCrusher?.crusherName}</strong>
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        {isAr ? 'الموقع:' : 'Location:'} {selectedCrusher?.location} | {isAr ? 'الحساب البنكي:' : 'Bank:'}{' '}
                        {selectedCrusher?.bankDetails}
                      </p>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-300">
                      <table className="w-full text-right text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-white font-bold">
                            <th className="p-2.5 text-center">#</th>
                            <th className="p-2.5">{isAr ? 'التاريخ' : 'Date'}</th>
                            <th className="p-2.5">{isAr ? 'رقم فاتورة التحميل' : 'Crusher Inv #'}</th>
                            <th className="p-2.5">{isAr ? 'الشاحنة' : 'Truck'}</th>
                            <th className="p-2.5">{isAr ? 'الناقل' : 'Transporter'}</th>
                            <th className="p-2.5">{isAr ? 'المادة' : 'Material'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'الوزن (MT طن)' : 'Weight (MT طن)'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'تكلفة الشراء' : 'Purchases Cost'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'المسدد للكسارة' : 'Paid Amount'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredOperations.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                                {isAr ? 'لا توجد توريدات مسجلة لهذه الكسارة خلال الفترة' : 'No supplies recorded for this crusher during this period'}
                              </td>
                            </tr>
                          ) : (
                            filteredOperations.map((op, idx) => (
                              <tr key={op?.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="p-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                                <td className="p-2.5 font-mono">{op?.loading_date || '-'}</td>
                                <td className="p-2.5 font-mono font-bold text-slate-800">{op?.loading_invoice_no || '-'}</td>
                                <td className="p-2.5 font-mono">{op?.truck_no || (op as any)?.truck_number || '-'}</td>
                                <td className="p-2.5">{op?.transporter_name || '-'}</td>
                                <td className="p-2.5">{op?.material_type || '-'}</td>
                                <td className="p-2.5 text-center font-mono font-bold">{formatNumber(op?.qty_loaded || 0, language, 2)}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-rose-700">
                                  {formatCurrency(op?.purchases_cost || 0, language)}
                                </td>
                                <td className="p-2.5 text-center font-mono text-emerald-700">
                                  {formatCurrency(op?.crusher_payment || 0, language)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tabular Layout for Transporter Shrinkage */}
                {docType === 'transporter-shrinkage' && (
                  <div className="my-5 space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-xs font-bold text-slate-900">
                        {isAr ? 'كشف حساب وفاقد الناقل:' : 'Transporter Statement & Transit Loss:'}{' '}
                        <strong className="text-orange-950">{selectedTransporter?.transporterName || (isAr ? 'الناقل' : 'Transporter')}</strong>
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        {isAr ? 'جهة النقل:' : 'Carrier:'} {selectedTransporter?.transporterName || '-'} | {isAr ? 'الأسطول:' : 'Fleet:'}{' '}
                        {selectedTransporter?.trucksCount || 0} {isAr ? 'شاحنة' : 'trucks'}
                      </p>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-300">
                      <table className="w-full text-right text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-white font-bold">
                            <th className="p-2.5 text-center">#</th>
                            <th className="p-2.5">{isAr ? 'التاريخ' : 'Date'}</th>
                            <th className="p-2.5">{isAr ? 'الشاحنة' : 'Truck'}</th>
                            <th className="p-2.5">{isAr ? 'السائق' : 'Driver'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'المحمّل' : 'Loaded'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'المسلّم' : 'Delivered'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'الفاقد' : 'Loss'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'النولون' : 'Freight'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'الخصم' : 'Deduction'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredOperations.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                                {isAr ? 'لا توجد رحلات مسجلة لهذا الناقل خلال الفترة' : 'No trips recorded for this transporter during this period'}
                              </td>
                            </tr>
                          ) : (
                            filteredOperations.map((op, idx) => (
                              <tr key={op?.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="p-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                                <td className="p-2.5 font-mono">{op?.loading_date || '-'}</td>
                                <td className="p-2.5 font-mono font-bold text-slate-800">{op?.truck_no || (op as any)?.truck_number || '-'}</td>
                                <td className="p-2.5">{op?.driver_name || '-'}</td>
                                <td className="p-2.5 text-center font-mono">{formatNumber(op?.qty_loaded || 0, language, 2)}</td>
                                <td className="p-2.5 text-center font-mono">{formatNumber(op?.qty_delivered || 0, language, 2)}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-rose-600">{formatNumber(op?.qty_wastage || 0, language, 2)}</td>
                                <td className="p-2.5 text-center font-mono">{formatCurrency(op?.freight_fee || 0, language)}</td>
                                <td className="p-2.5 text-center font-mono text-rose-700">{formatCurrency(op?.penalty_fee || 0, language)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tabular Layout for Financial Vouchers */}
                {docType === 'financial-vouchers' && (
                  <div className="my-5 space-y-4">
                    <div className="overflow-x-auto rounded-xl border border-slate-300">
                      <table className="w-full text-right text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-white font-bold">
                            <th className="p-2.5 text-center">#</th>
                            <th className="p-2.5">{isAr ? 'رقم السند' : 'Voucher #'}</th>
                            <th className="p-2.5">{isAr ? 'التاريخ' : 'Date'}</th>
                            <th className="p-2.5">{isAr ? 'النوع' : 'Type'}</th>
                            <th className="p-2.5">{isAr ? 'المستفيد / الدافع' : 'Party'}</th>
                            <th className="p-2.5">{isAr ? 'البيان والغرض' : 'Purpose'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'المبلغ (SAR)' : 'Amount (SAR)'}</th>
                            <th className="p-2.5 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {safeVouchers.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                                {isAr ? 'لا توجد سندات مالية مسجلة' : 'No financial vouchers recorded'}
                              </td>
                            </tr>
                          ) : (
                            safeVouchers.map((v, idx) => (
                              <tr key={v?.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="p-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                                <td className="p-2.5 font-mono font-bold text-slate-800">{v?.voucherNumber || '-'}</td>
                                <td className="p-2.5 font-mono">{v?.date || '-'}</td>
                                <td className="p-2.5 font-bold">
                                  <span className={`px-2 py-0.5 rounded text-[10px] ${v?.type === 'Payment' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                    {v?.type === 'Payment' ? (isAr ? 'صرف' : 'Payment') : (isAr ? 'قبض' : 'Receipt')}
                                  </span>
                                </td>
                                <td className="p-2.5 font-bold">{v?.partyName || '-'}</td>
                                <td className="p-2.5 max-w-[200px] truncate">{v?.purpose || '-'}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-slate-900">{formatCurrency(v?.amount || 0, language)}</td>
                                <td className="p-2.5 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] ${v?.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {v?.status === 'Approved' ? (isAr ? 'معتمد' : 'Approved') : (isAr ? 'بانتظار الاعتماد' : 'Pending')}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. Financial Totals & Tafqeet Block */}
                <div className="my-6 border-t-2 border-slate-900 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    {/* Arabic & English Tafqeet */}
                    {showTafqeet && (
                      <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3.5 space-y-1">
                        <span className="text-[10px] font-bold text-orange-950 uppercase tracking-wider block">
                          {isAr ? 'المبلغ كتابةً والتفقيط المالي المعتمد:' : 'Amount in Legal Words:'}
                        </span>
                        <p className="text-xs font-black text-neutral-950 leading-relaxed">{amountInWordsAr}</p>
                        <p className="text-[10px] font-semibold text-slate-600 font-sans">{amountInWordsEn}</p>
                      </div>
                    )}

                    {/* Financial Summary Breakdown */}
                    <div className="space-y-1.5 text-xs text-right sm:pr-4">
                      {docType === 'financial-vouchers' ? (
                        <>
                          <div className="flex justify-between py-1 border-b border-slate-200">
                            <span className="text-slate-600 font-medium">
                              {isAr ? 'إجمالي سندات القبض (Receipts):' : 'Total Receipts:'}
                            </span>
                            <span className="font-mono font-bold text-emerald-700">
                              {formatCurrency(voucherMetrics.receiptTotal, language)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-200">
                            <span className="text-slate-600 font-medium">
                              {isAr ? 'إجمالي سندات الصرف (Payments):' : 'Total Payments:'}
                            </span>
                            <span className="font-mono font-bold text-rose-700">
                              {formatCurrency(voucherMetrics.paymentTotal, language)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1.5 font-black text-sm bg-slate-900 text-white rounded-lg px-3">
                            <span>{isAr ? 'صافي حركة السيولة (Net Flow):' : 'Net Flow (SAR):'}</span>
                            <span className={`font-mono ${voucherMetrics.netFlow >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {formatCurrency(voucherMetrics.netFlow, language)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between py-1 border-b border-slate-200">
                            <span className="text-slate-600 font-medium">
                              {isAr ? 'المجموع بدون ضريبة (Subtotal Excl. VAT):' : 'Subtotal Excl. VAT:'}
                            </span>
                            <span className="font-mono font-bold text-slate-900">
                              {formatCurrency(summaryMetrics.totalSales, language)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-200">
                            <span className="text-slate-600 font-medium">
                              {isAr ? 'ضريبة القيمة المضافة (VAT 15%):' : 'Value Added Tax (15%):'}
                            </span>
                            <span className="font-mono font-bold text-slate-900">
                              {formatCurrency(summaryMetrics.totalVat, language)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1.5 font-black text-sm bg-slate-900 text-white rounded-lg px-3">
                            <span>{isAr ? 'الإجمالي النهائي المستحق (Grand Total):' : 'Grand Total (SAR):'}</span>
                            <span className="font-mono text-emerald-300">
                              {formatCurrency(summaryMetrics.grandTotal, language)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 6. Bank Accounts & Wire Instructions */}
                {showBankDetails && (
                  <div className="my-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-1 text-slate-700">
                    <span className="font-bold text-slate-900 block mb-1">
                      {isAr ? 'تعليمات السداد والتحويل البنكي المعتمد:' : 'Wire & Bank Payment Details:'}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      <p>
                        {isAr ? 'اسم المستفيد:' : 'Beneficiary:'}{' '}
                        <strong className="text-slate-900">{safeBrandConfig.companyNameAr}</strong>
                      </p>
                      <p>
                        {isAr ? 'البنك:' : 'Bank:'} <strong className="text-slate-900">{safeBrandConfig.bankNameAr}</strong>
                      </p>
                      <p>
                        {isAr ? 'رقم الحساب:' : 'Account #:'}{' '}
                        <strong className="font-mono text-slate-900">{safeBrandConfig.bankAccountNumber}</strong>
                      </p>
                      <p>
                        {isAr ? 'الآيبان الدولي (IBAN):' : 'IBAN:'}{' '}
                        <strong className="font-mono text-orange-950 font-bold">{safeBrandConfig.bankIban}</strong>
                      </p>
                    </div>
                  </div>
                )}

                {/* Custom Notes Added by User */}
                {customNotes && (
                  <div className="my-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-950">
                    <span className="font-bold block mb-0.5">{isAr ? 'شروط وملاحظات إضافية:' : 'Additional Terms:'}</span>
                    <p className="leading-relaxed">{customNotes}</p>
                  </div>
                )}

                {/* 7. Official Signatures & Digital Stamp */}
                {showStampSignature && (
                  <div className="my-8 pt-4 border-t border-slate-200 grid grid-cols-3 gap-4 text-center text-xs">
                    <div>
                      <span className="text-slate-500 font-bold block mb-1">
                        {isAr ? 'إعداد ومطابقة (Data Entry)' : 'Prepared by'}
                      </span>
                      <p className="font-bold text-slate-900">{currentUser?.fullNameAr || currentUser?.fullName || (isAr ? 'المستخدم الحالي' : 'Current User')}</p>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{docIssueDate}</span>
                    </div>

                    <div className="flex flex-col items-center justify-center">
                      <span className="text-slate-500 font-bold block mb-1">
                        {isAr ? 'الختم الرسمي المعتمد' : 'Official Corporate Stamp'}
                      </span>
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-orange-400 bg-orange-50/40 p-1">
                        <BrandLogo size="sm" showText={false} />
                      </div>
                      <span className="text-[9px] font-mono text-orange-700 font-bold mt-1">ZATCA-AUTH-STAMP</span>
                    </div>

                    <div>
                      <span className="text-slate-500 font-bold block mb-1">
                        {isAr ? 'الاعتماد المالي والمدير التنفيذي' : 'Approved & Authorized by'}
                      </span>
                      <p className="font-bold text-slate-900">{safeBrandConfig.ceoNameAr || (isAr ? 'الرئيس التنفيذي' : 'Chief Executive Officer')}</p>
                      <span className="text-[10px] text-orange-700 font-bold block mt-0.5">
                        {safeBrandConfig.ceoTitleAr || (isAr ? 'المدير التنفيذي' : 'General Director')}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400 block mt-1">MYN-SEC-SIGN-2026</span>
                    </div>
                  </div>
                )}

                {/* 8. Legal Footer */}
                {showFooter && <OfficialLetterheadFooter brandConfig={safeBrandConfig} isAr={isAr} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
