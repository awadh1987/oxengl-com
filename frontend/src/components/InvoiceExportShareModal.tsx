import React, { useState, useRef, useEffect } from 'react';
import { CustomerInvoice, OperationRecord, BrandConfig } from '../types';
import { useApp } from '../context/AppContext';
import {
  FileText,
  Download,
  Archive,
  Share2,
  MessageCircle,
  Mail,
  CheckCircle2,
  ExternalLink,
  Layers,
  X,
  Copy,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Paperclip,
  ArrowDownToLine,
  Loader2,
  Check,
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import {
  generateSingleMergedInvoicePdf,
  generateInvoiceZipArchive,
  downloadBlob,
} from '../utils/pdfGenerator';
import { PrintableSupportingTicket } from './PrintableSupportingTicket';

interface InvoiceExportShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: CustomerInvoice;
  matchingTrips: OperationRecord[];
  brandConfig: BrandConfig;
  customerPhone?: string;
  customerEmail?: string;
  language: 'ar' | 'en';
  invoiceElementRef?: React.RefObject<HTMLDivElement | null>;
}

export const InvoiceExportShareModal: React.FC<InvoiceExportShareModalProps> = ({
  isOpen,
  onClose,
  invoice,
  matchingTrips,
  brandConfig,
  customerPhone,
  customerEmail,
  language,
  invoiceElementRef,
}) => {
  const { showToast } = useApp();
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

  // Selection of trips to bundle
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>(() =>
    matchingTrips.map((t) => t.id)
  );

  // Bundling mode: 'merged-pdf' or 'zip-archive'
  const [bundleFormat, setBundleFormat] = useState<'merged-pdf' | 'zip-archive'>('merged-pdf');

  // Loading & Progress state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');

  // Drag & drop toast notification state
  const [showDragDropToast, setShowDragDropToast] = useState<boolean>(false);
  const [toastDetails, setToastDetails] = useState<{
    channel: 'whatsapp' | 'email' | 'download';
    filename: string;
  }>({
    channel: 'whatsapp',
    filename: '',
  });

  // Copied link indicator
  const [copiedLink, setCopiedLink] = useState(false);

  // Hidden references container for printable ticket pages
  const ticketsContainerRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  // Filter selected trips
  const activeTrips = matchingTrips.filter((t) => selectedTripIds.includes(t.id));

  // Generate secure link for the invoice viewer
  const secureToken = invoice.signatureData?.verificationHash || `MYN-AUTH-${invoice.invoiceNumber}`;
  const origin = window.location.origin || 'https://meayon.sa';
  const secureShareUrl = `${origin}/?shared_invoice=${encodeURIComponent(
    invoice.invoiceNumber
  )}&token=${encodeURIComponent(secureToken)}`;

  // Toggle single trip
  const toggleTrip = (tripId: string) => {
    setSelectedTripIds((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]
    );
  };

  // Toggle all trips
  const toggleAllTrips = () => {
    if (selectedTripIds.length === matchingTrips.length) {
      setSelectedTripIds([]);
    } else {
      setSelectedTripIds(matchingTrips.map((t) => t.id));
    }
  };

  // Copy secure link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(secureShareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Get ticket DOM elements
  const getTicketDomElements = (): { element: HTMLElement; trip: OperationRecord }[] => {
    if (!ticketsContainerRef.current) return [];
    const elements: { element: HTMLElement; trip: OperationRecord }[] = [];
    activeTrips.forEach((trip) => {
      const el = ticketsContainerRef.current?.querySelector(
        `#printable-scale-ticket-${trip.id}`
      ) as HTMLElement;
      if (el) {
        elements.push({ element: el, trip });
      }
    });
    return elements;
  };

  // Primary Execution: Download Merged PDF
  const handleDownloadMergedPdf = async (): Promise<Blob | null> => {
    const invoiceEl = invoiceElementRef?.current || document.getElementById('customer-tax-invoice-printable');
    if (!invoiceEl) {
      showToast(isAr ? 'لم يتم العثور على حاوية الفاتورة الضريبية.' : 'Invoice container not found.', 'error');
      return null;
    }

    try {
      setIsProcessing(true);
      setProgressPercent(10);
      setProgressMessage(isAr ? 'جاري تهيئة محرك دمج المستندات...' : 'Initializing PDF engine...');

      const ticketItems = getTicketDomElements() || [];
      const ticketEls = (ticketItems || [])
        .map((item) => item?.element)
        .filter((el): el is HTMLElement => Boolean(el));

      const mergedPdfBlob = await generateSingleMergedInvoicePdf(
        invoiceEl,
        ticketEls,
        invoice,
        (progress, msg) => {
          setProgressPercent(progress);
          setProgressMessage(msg);
        }
      );

      const filename = `${invoice.invoiceNumber}_Official_Merged_Tax_Invoice.pdf`;
      downloadBlob(mergedPdfBlob, filename);
      showToast(isAr ? 'تم تصدير وتحميل ملف PDF المدمج بنجاح' : 'Merged PDF exported successfully', 'success');

      return mergedPdfBlob;
    } catch (err) {
      console.error('Error generating merged PDF:', err);
      showToast(isAr ? 'حدث خطأ أثناء توليد ملف PDF المدمج.' : 'Error generating merged PDF.', 'error');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  // Primary Execution: Download ZIP Archive
  const handleDownloadZipArchive = async (): Promise<Blob | null> => {
    const invoiceEl = invoiceElementRef?.current || document.getElementById('customer-tax-invoice-printable');
    if (!invoiceEl) {
      showToast(isAr ? 'لم يتم العثور على حاوية الفاتورة الضريبية.' : 'Invoice container not found.', 'error');
      return null;
    }

    try {
      setIsProcessing(true);
      setProgressPercent(10);
      setProgressMessage(isAr ? 'جاري تجهيز أرشيف ZIP...' : 'Preparing ZIP archive...');

      const ticketItems = (getTicketDomElements() || []).filter(
        (item) => item && item.element && item.trip
      );

      const zipBlob = await generateInvoiceZipArchive(
        invoiceEl,
        ticketItems,
        invoice,
        (progress, msg) => {
          setProgressPercent(progress);
          setProgressMessage(msg);
        }
      );

      const filename = `${invoice.invoiceNumber}_Complete_Invoice_Bundle.zip`;
      downloadBlob(zipBlob, filename);
      showToast(isAr ? 'تم تجهيز وتحميل أرشيف ZIP بنجاح' : 'ZIP archive downloaded successfully', 'success');

      return zipBlob;
    } catch (err) {
      console.error('Error generating ZIP:', err);
      showToast(isAr ? 'حدث خطأ أثناء إنشاء الأرشيف المضغوط.' : 'Error generating ZIP archive.', 'error');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  // Hybrid Dispatch: WhatsApp Share
  const handleShareViaWhatsApp = async () => {
    const filename = `${invoice.invoiceNumber}_Official_Merged_Tax_Invoice.pdf`;

    // 1. Await PDF Blob generation BEFORE showing success toast or opening links
    const generatedBlob = bundleFormat === 'merged-pdf'
      ? await handleDownloadMergedPdf()
      : await handleDownloadZipArchive();

    // If PDF/ZIP generation failed or returned null, abort immediately
    if (!generatedBlob) {
      return;
    }

    // 2. Prepare pre-filled WhatsApp text with the secure read-only URL
    const phoneClean = customerPhone?.replace(/[^0-9]/g, '') || '966501234567';

    const messageAr = `السادة / ${invoice.customerName} المحترمين،
تحية طيبة وبعد،

نرفق لكم الفاتورة الضريبية المعتمدة ومستندات وتذاكر الميزان الداعمة رقم (${invoice.invoiceNumber}) لشهر ${invoice.billingMonth}/${invoice.billingYear}:

• إجمالي عدد الرحلات: ${invoice.totalTrips} رحلة
• الوزن الصافي المستلم: ${invoice.totalDeliveredWeight.toLocaleString()} طن
• إجمالي المبلغ المستحق: ${formatCurrency(invoice.grandTotal, 'ar')}
• حالة الاعتماد: معتمدة وموقعة رسمياً من الإدارة العامة (CEO Approved)

🔗 للاطلاع والتحقق الفوري من الفاتورة وتذاكر الميزان المدمجة عبر الرابط الآمن:
${secureShareUrl}

حساب التحويل البنكي المعتمد:
${brandConfig.bankNameAr} | IBAN: ${brandConfig.iban}

شركة ميون الاقتصادية للمقاولات المحدودة`;

    const textEncoded = encodeURIComponent(messageAr);
    const waUrl = `https://wa.me/${phoneClean}?text=${textEncoded}`;

    // 3. Open WhatsApp in new tab only after PDF is successfully generated
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // 4. Show Drag-and-Drop Guidance Toast only after successful generation
    setToastDetails({ channel: 'whatsapp', filename });
    setShowDragDropToast(true);
  };

  // Hybrid Dispatch: Email Share
  const handleShareViaEmail = async () => {
    const filename = `${invoice.invoiceNumber}_Official_Merged_Tax_Invoice.pdf`;

    // 1. Await PDF Blob generation BEFORE showing success toast or opening mail client
    const generatedBlob = bundleFormat === 'merged-pdf'
      ? await handleDownloadMergedPdf()
      : await handleDownloadZipArchive();

    // If PDF/ZIP generation failed or returned null, abort immediately
    if (!generatedBlob) {
      return;
    }

    // 2. Prepare email body
    const emailTo = customerEmail || 'billing@customer.com';
    const subject = isAr
      ? `الفاتورة الضريبية المعتمدة رقم ${invoice.invoiceNumber} ومرفقاتها - شركة ميون للمقاولات المحدودة`
      : `Approved Tax Invoice #${invoice.invoiceNumber} and Supporting Documents - Myon Co.`;

    const bodyAr = `السادة / ${invoice.customerName} المحترمين،
تحية طيبة وبعد،

نرفق لكم تفاصيل الفاتورة الضريبية الشهرية المعتمدة رقم (${invoice.invoiceNumber}) الخاصة بتوريدات المواد الإنشائية لشهر ${invoice.billingMonth}/${invoice.billingYear}.

ملخص الفاتورة والمرفقات:
- رقم الفاتورة: ${invoice.invoiceNumber}
- إجمالي عدد الرحلات المرفقة: ${invoice.totalTrips} رحلة
- إجمالي الوزن الصافي المستلم: ${invoice.totalDeliveredWeight.toLocaleString()} طن
- المبلغ الخاضع للضريبة: ${formatCurrency(invoice.subtotal, 'ar')}
- ضريبة القيمة المضافة (15%): ${formatCurrency(invoice.vatAmount, 'ar')}
- إجمالي المبلغ المستحق النهائي: ${formatCurrency(invoice.grandTotal, 'ar')}
- حالة الاعتماد: معتمدة وموقعة رسمياً من الإدارة العامة (CEO Approved)

رابط الاطلاع والتحقق الآمن المباشر من الفاتورة وكافة تذاكر الميزان المدمجة:
${secureShareUrl}

الحساب البنكي المعتمد للتحويل:
${brandConfig.bankNameAr}
IBAN: ${brandConfig.iban}

شاكرين لكم حسن تعاونكم الدائم.
شركة ميون الاقتصادية للمقاولات المحدودة
هاتف: ${brandConfig.phone} | ${brandConfig.email}`;

    const mailtoUrl = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(bodyAr)}`;

    window.location.href = mailtoUrl;

    // 3. Show Drag-and-Drop Guidance Toast only after successful generation
    setToastDetails({ channel: 'email', filename });
    setShowDragDropToast(true);
  };

  return (
    <div
      id="invoice-export-share-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-export-share-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="invoice-export-share-modal"
        className="relative my-8 w-full max-w-4xl overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 transition-colors"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-900 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-md shadow-orange-600/30">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="invoice-export-share-title" className="text-base font-black">
                  {isAr ? 'حزمة التصدير والمشاركة المعتمدة للفاتورة' : 'Export & Share Approved Invoice Bundle'}
                </h2>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black text-emerald-300 border border-emerald-500/30">
                  {isAr ? 'معتمدة وموقعة' : 'Approved & Signed'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {invoice.invoiceNumber} • {invoice.customerName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Main Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* 1. Bundling Format Selection Box */}
          <div>
            <label className="mb-2 block text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              {isAr ? '١. اختيار صيغة تجميع ودمج المستندات *' : '1. Select Document Bundling Format *'}
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option A: Single Merged PDF */}
              <div
                onClick={() => setBundleFormat('merged-pdf')}
                className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                  bundleFormat === 'merged-pdf'
                    ? 'border-orange-600 bg-orange-50/50 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        bundleFormat === 'merged-pdf'
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">
                        {isAr ? 'ملف PDF موحد وشامل (Single Merged PDF)' : 'Single Merged PDF Document'}
                      </h4>
                      <span className="text-[10px] font-bold text-orange-700">
                        {isAr ? 'الصيغة الموصى بها للعميل' : 'Recommended for Clients'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    checked={bundleFormat === 'merged-pdf'}
                    onChange={() => setBundleFormat('merged-pdf')}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500"
                  />
                </div>
                <p className="mt-2.5 text-[11px] text-slate-600 leading-relaxed">
                  {isAr
                    ? 'يتم دمج الفاتورة الضريبية المعتمدة (الصفحة الأولى) مع كافة تذاكر الميزان وإثباتات الرحلات (الصفحات اللاحقة) في ملف PDF رقمي واحد عالي الدقة.'
                    : 'Concatenates the approved invoice (Page 1) with all verified scale tickets (subsequent pages) into one unified multi-page PDF.'}
                </p>
              </div>

              {/* Option B: Separate PDFs in ZIP Archive */}
              <div
                onClick={() => setBundleFormat('zip-archive')}
                className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                  bundleFormat === 'zip-archive'
                    ? 'border-orange-600 bg-orange-50/50 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        bundleFormat === 'zip-archive'
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Archive className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">
                        {isAr ? 'أرشيف مضغوط (ZIP Archive Bundle)' : 'ZIP Archive (Separate PDFs)'}
                      </h4>
                      <span className="text-[10px] font-bold text-slate-500">
                        {isAr ? 'ملفات منفصلة ومجلدات' : 'Individual Files & Folders'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    checked={bundleFormat === 'zip-archive'}
                    onChange={() => setBundleFormat('zip-archive')}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500"
                  />
                </div>
                <p className="mt-2.5 text-[11px] text-slate-600 leading-relaxed">
                  {isAr
                    ? 'يتم إنشاء أرشيف مضغوط (.zip) يحتوي على ملف الفاتورة المعتمدة ومجلد فرعي يحوي تذاكر الميزان كملفات PDF منفصلة لكل رحلة.'
                    : 'Bundles the main invoice PDF and separate scale ticket PDFs into a structured single .zip archive.'}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Supporting Trips & Scale Tickets Checklist */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-orange-600" />
                <h3 className="text-xs font-bold text-slate-900">
                  {isAr ? '٢. تذاكر الميزان والرحلات المشمولة في الحزمة:' : '2. Included Scale Tickets & Trips:'}
                </h3>
                <span className="text-[11px] font-mono text-orange-700 font-bold">
                  ({selectedTripIds.length} / {matchingTrips.length} {isAr ? 'محددة' : 'selected'})
                </span>
              </div>

              <button
                type="button"
                onClick={toggleAllTrips}
                className="text-[11px] font-bold text-orange-600 hover:text-orange-800 hover:underline"
              >
                {selectedTripIds.length === matchingTrips.length
                  ? isAr
                    ? 'إلغاء تحديد الكل'
                    : 'Deselect All'
                  : isAr
                  ? 'تحديد جميع الرحلات'
                  : 'Select All'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
              {matchingTrips.map((trip) => {
                const isChecked = selectedTripIds.includes(trip.id);
                return (
                  <div
                    key={trip.id}
                    onClick={() => toggleTrip(trip.id)}
                    className={`flex items-center justify-between rounded-xl border p-2.5 cursor-pointer transition text-xs ${
                      isChecked
                        ? 'border-orange-300 bg-white shadow-2xs text-slate-900'
                        : 'border-slate-200 bg-slate-100/60 text-slate-500 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="h-3.5 w-3.5 rounded text-orange-600 focus:ring-orange-500"
                      />
                      <div>
                        <div className="font-bold font-mono text-[11px]">
                          {trip.scale_ticket_no}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {trip.truck_no} • {trip.qty_delivered.toFixed(1)} طن • {trip.material_type}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {trip.loading_date}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Secure Link Method Preview */}
          <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-950">
                <ShieldCheck className="h-4 w-4 text-orange-700" />
                <span>{isAr ? 'الرابط الآمن المعتمد للاطلاع المباشر (The Secure Link Method):' : 'Secure Read-Only Link (Public Auditor URL):'}</span>
              </div>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1 text-[11px] font-bold text-orange-700 hover:text-orange-950 bg-white px-2 py-0.5 rounded-md border border-orange-200 shadow-2xs"
              >
                {copiedLink ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                <span>{copiedLink ? (isAr ? 'تم النسخ!' : 'Copied!') : isAr ? 'نسخ الرابط' : 'Copy Link'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-600 mb-2">
              {isAr
                ? 'يتم حقن هذا الرابط تلقائياً في رسائل الواتساب والبريد الإلكتروني لتمكين العميل من التحقق الفوري وعرض الفاتورة وتذاكر الميزان بدون تسجيل دخول.'
                : 'Automatically injected into WhatsApp and Email messages for client inspection and audit verification.'}
            </p>

            <div className="flex items-center rounded-xl bg-white border border-orange-200/80 px-3 py-2 text-xs font-mono text-orange-950 truncate shadow-inner">
              <ExternalLink className="h-3.5 w-3.5 text-orange-400 shrink-0 ml-2" />
              <span className="truncate">{secureShareUrl}</span>
            </div>
          </div>

          {/* Progress Bar (Visible during PDF / ZIP generation) */}
          {isProcessing && (
            <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4 animate-pulse">
              <div className="flex items-center justify-between text-xs font-bold text-orange-950 mb-1.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                  <span>{progressMessage}</span>
                </div>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-orange-200">
                <div
                  className="h-full bg-orange-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* 4. Action Buttons Grid */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {isAr ? '٣. إجراءات الإرسال والتنزيل الفوري:' : '3. Dispatch & Download Actions:'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Action 1: Direct File Download */}
              <button
                disabled={isProcessing}
                onClick={bundleFormat === 'merged-pdf' ? handleDownloadMergedPdf : handleDownloadZipArchive}
                className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-xs font-black text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
              >
                <Download className="h-4 w-4 text-orange-400" />
                <span>
                  {bundleFormat === 'merged-pdf'
                    ? isAr
                      ? 'تنزيل ملف PDF المدمج'
                      : 'Download Merged PDF'
                    : isAr
                    ? 'تنزيل أرشيف ZIP الكامل'
                    : 'Download ZIP Archive'}
                </span>
              </button>

              {/* Action 2: WhatsApp Dispatch with Hybrid Drag-and-Drop */}
              <button
                disabled={isProcessing}
                onClick={handleShareViaWhatsApp}
                className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-xs font-black text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-700 transition disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" />
                <span>{isAr ? 'إرسال عبر واتساب (WhatsApp)' : 'Share via WhatsApp'}</span>
              </button>

              {/* Action 3: Email Dispatch */}
              <button
                disabled={isProcessing}
                onClick={handleShareViaEmail}
                className="flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-4 py-3.5 text-xs font-black text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 transition disabled:opacity-50"
              >
                <Mail className="h-4 w-4" />
                <span>{isAr ? 'إرسال بريد رسمي (Email)' : 'Share via Email'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drag & Drop Toast Reminders Notification */}
        {showDragDropToast && (
          <div className="border-t-2 border-amber-400 bg-amber-50 p-4 text-xs text-amber-950 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-black text-amber-900 block text-xs">
                  {isAr
                    ? 'تنبيه إرفاق الملف (Drag & Drop Reminder):'
                    : 'File Attachment Reminder (Drag & Drop):'}
                </strong>
                <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                  {isAr
                    ? `تم تنزيل ملف PDF المدمج (${toastDetails.filename}) تلقائياً إلى مجلد التنزيلات بجهازك. يرجى سحب الملف وإفلاته في نافذة ${
                        toastDetails.channel === 'whatsapp' ? 'واتساب' : 'البريد الإلكتروني'
                      } التي تم فتحها للتو.`
                    : `The merged PDF (${toastDetails.filename}) has been automatically downloaded to your device. Please drag and drop it into the ${
                        toastDetails.channel === 'whatsapp' ? 'WhatsApp' : 'Email'
                      } window that just opened.`}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowDragDropToast(false)}
              className="rounded-lg bg-amber-200/60 p-1 text-amber-900 hover:bg-amber-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Hidden Printable Supporting Tickets Container for High-Resolution PDF Capture */}
        <div
          ref={ticketsContainerRef}
          className="absolute -left-[9999px] top-0 pointer-events-none w-[900px]"
          aria-hidden="true"
        >
          {activeTrips.map((trip, idx) => (
            <PrintableSupportingTicket
              key={trip.id}
              trip={trip}
              invoiceNumber={invoice.invoiceNumber}
              brandConfig={brandConfig}
              pageIndex={idx + 2}
              totalPages={activeTrips.length + 1}
              isAr={isAr}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
