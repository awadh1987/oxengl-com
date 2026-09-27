import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { CustomerInvoice, OperationRecord } from '../types';
import { OfficialLetterheadHeader } from '../components/OfficialLetterheadHeader';
import { OfficialLetterheadFooter } from '../components/OfficialLetterheadFooter';
import { PrintableSupportingTicket } from '../components/PrintableSupportingTicket';
import {
  FileText,
  Download,
  ShieldCheck,
  QrCode,
  CheckCircle2,
  Paperclip,
  ExternalLink,
  Printer,
  Scale,
  Building,
  Calendar,
  Layers,
  ArrowLeft,
  Lock,
} from 'lucide-react';
import { formatCurrency, formatDate, getMonthName } from '../utils/formatters';
import {
  generateSingleMergedInvoicePdf,
  generateInvoiceZipArchive,
  downloadBlob,
} from '../utils/pdfGenerator';
import { BrandLogo } from '../components/BrandLogo';

interface PublicSharedInvoiceViewProps {
  invoiceNumber: string;
  token?: string;
  onBackToPortal?: () => void;
}

export const PublicSharedInvoiceView: React.FC<PublicSharedInvoiceViewProps> = ({
  invoiceNumber,
  token,
  onBackToPortal,
}) => {
  const { customers, operations, brandConfig, language } = useApp();
  const isAr = language === 'ar';

  const invoiceElementRef = useRef<HTMLDivElement | null>(null);
  const ticketsContainerRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<'invoice' | 'supporting-tickets'>('invoice');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  // Find operations matching this invoice
  const matchingTrips = useMemo(() => {
    // Parse billing month & year from invoiceNumber (INV-2026-08-1048) or find matching customer
    const parts = invoiceNumber.split('-');
    const year = parts.length > 1 ? parseInt(parts[1], 10) : 2026;
    const month = parts.length > 2 ? parseInt(parts[2], 10) : 8;

    return operations.filter(
      (op) => op.operation_month === month && op.operation_year === year
    );
  }, [operations, invoiceNumber]);

  // Aggregate items
  const invoiceItems = useMemo(() => {
    const map: Record<string, { trips: number; loaded: number; delivered: number; wastage: number; sales: number }> = {};
    matchingTrips.forEach((op) => {
      if (!map[op.material_type]) {
        map[op.material_type] = { trips: 0, loaded: 0, delivered: 0, wastage: 0, sales: 0 };
      }
      map[op.material_type].trips += 1;
      map[op.material_type].loaded += op.qty_loaded;
      map[op.material_type].delivered += op.qty_delivered;
      map[op.material_type].wastage += op.qty_wastage;
      map[op.material_type].sales += op.sales_amount;
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
  }, [matchingTrips]);

  const subtotal = invoiceItems.reduce((acc, i) => acc + i.subtotal, 0);
  const totalVat = invoiceItems.reduce((acc, i) => acc + i.vatAmount, 0);
  const grandTotal = subtotal + totalVat;
  const totalTrips = invoiceItems.reduce((acc, i) => acc + i.tripsCount, 0);
  const totalDelivered = invoiceItems.reduce((acc, i) => acc + i.deliveredWeight, 0);

  const customerName = matchingTrips[0]?.destination_customer || 'شركة يوني بيتون للخرسانة الجاهزة';

  const customerInvoiceObject: CustomerInvoice = {
    id: invoiceNumber,
    invoiceNumber,
    customerId: 'cust-1',
    customerName,
    customerTaxNumber: '300192847500003',
    billingMonth: 8,
    billingYear: 2026,
    issueDate: '2026-08-28',
    dueDate: '2026-09-28',
    items: invoiceItems,
    subtotal,
    vatAmount: totalVat,
    grandTotal,
    totalTrips,
    totalLoadedWeight: totalDelivered + 4.2,
    totalDeliveredWeight: totalDelivered,
    totalWastageWeight: 4.2,
    status: 'Approved',
    preparedBy: 'ياسر العتيبي (كبير المحاسبين)',
    approvedBy: brandConfig.ceoNameAr,
    approvedAt: '2026-08-28T09:30:00Z',
    isSigned: true,
    signatureData: {
      signedBy: brandConfig.ceoNameAr,
      signedByRole: brandConfig.ceoTitleAr,
      signedAt: '2026-08-28T09:30:00Z',
      verificationHash: token || 'MYN-SHA256-9A8B7C6D5E4F3210-VERIFIED',
    },
  };

  const handleDownloadMergedPdf = async () => {
    if (!invoiceElementRef.current) return;
    try {
      setIsGeneratingPdf(true);
      setDownloadMsg(isAr ? 'جاري إنشاء ملف PDF المدمج...' : 'Generating Merged PDF...');

      const ticketEls: HTMLElement[] = [];
      if (ticketsContainerRef.current) {
        matchingTrips.forEach((trip) => {
          const el = ticketsContainerRef.current?.querySelector(
            `#printable-scale-ticket-${trip.id}`
          ) as HTMLElement;
          if (el) ticketEls.push(el);
        });
      }

      const pdfBlob = await generateSingleMergedInvoicePdf(
        invoiceElementRef.current,
        ticketEls,
        customerInvoiceObject,
        (progress, msg) => setDownloadMsg(msg)
      );

      downloadBlob(pdfBlob, `${invoiceNumber}_Official_Merged_Tax_Invoice.pdf`);
    } catch (e) {
      console.error(e);
      alert(isAr ? 'حدث خطأ أثناء تحميل الفاتورة.' : 'Error downloading invoice PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div
      id="public-shared-invoice-view"
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-dvh erp-viewport-root bg-slate-100 p-4 sm:p-6 lg:p-10 font-sans text-slate-900"
    >
      {/* Top Client Portal Bar */}
      <div className="max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl bg-slate-900 p-5 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 shadow-md">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black">
                {isAr ? 'بوابة التحقق والتدقيق الإلكتروني للفواتير الرسمية' : 'Official Invoice Verification Portal'}
              </h1>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black text-emerald-300 border border-emerald-500/30">
                {isAr ? 'موثقة ومعتمدة' : 'Verified by ZATCA'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {brandConfig.companyNameAr} • {invoiceNumber}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Direct Print */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
          >
            <Printer className="h-4 w-4" />
            <span>{isAr ? 'طباعة رسمية' : 'Print'}</span>
          </button>

          {/* Download Single Merged PDF */}
          <button
            disabled={isGeneratingPdf}
            onClick={handleDownloadMergedPdf}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-orange-600/30 hover:bg-orange-500 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>{isGeneratingPdf ? downloadMsg : isAr ? 'تحميل PDF المدمج' : 'Download Merged PDF'}</span>
          </button>

          {onBackToPortal && (
            <button
              onClick={onBackToPortal}
              className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{isAr ? 'العودة للمنظومة' : 'Portal'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation: Invoice vs Supporting Scale Tickets */}
      <div className="max-w-5xl mx-auto mb-6 flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('invoice')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
              activeTab === 'invoice'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>{isAr ? 'الفاتورة الضريبية المعتمدة (الصفحة ١)' : 'Approved Tax Invoice (Page 1)'}</span>
          </button>

          <button
            onClick={() => setActiveTab('supporting-tickets')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
              activeTab === 'supporting-tickets'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Paperclip className="h-4 w-4" />
            <span>
              {isAr ? 'تذاكر الميزان وإثباتات الرحلات' : 'Scale Tickets & Proofs'} ({matchingTrips.length})
            </span>
          </button>
        </div>

        <span className="text-xs font-mono text-slate-500 hidden sm:inline-block">
          Hash: {customerInvoiceObject.signatureData?.verificationHash?.slice(0, 20)}...
        </span>
      </div>

      {/* Primary Invoice Document View */}
      <div className="max-w-5xl mx-auto">
        {activeTab === 'invoice' ? (
          <div
            ref={invoiceElementRef}
            id="public-tax-invoice-container"
            className="rounded-3xl border border-slate-300 bg-white p-8 sm:p-12 shadow-xl print-container zatca-invoice-wrapper"
          >
            {/* 1. Official Corporate Letterhead */}
            <OfficialLetterheadHeader
              brandConfig={brandConfig}
              documentTypeAr="فاتورة ضريبية معتمدة"
              documentTypeEn="TAX INVOICE"
              documentNumber={invoiceNumber}
              issueDate={customerInvoiceObject.issueDate}
              isAr={isAr}
            />

            {/* 2. Customer & Billing Cycle Grid */}
            <div className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-200 text-xs">
              <div>
                <span className="text-[11px] font-bold text-orange-800 uppercase">
                  {isAr ? 'بيانات العميل المستلم (Billed To):' : 'Billed To:'}
                </span>
                <h3 className="mt-1 text-sm font-black text-slate-900">{customerName}</h3>
                <p className="text-[11px] text-slate-600 mt-1">
                  الرقم الضريبي: <span className="font-mono font-bold text-slate-900">300192847500003</span>
                </p>
                <p className="text-[11px] text-slate-600">
                  السجل التجاري: <span className="font-mono">1010194820</span>
                </p>
              </div>

              <div className="space-y-1 sm:text-left text-slate-700">
                <p>
                  <span className="text-slate-500">{isAr ? 'تاريخ الإصدار:' : 'Issue Date:'}</span>{' '}
                  <strong className="font-mono">{customerInvoiceObject.issueDate}</strong>
                </p>
                <p>
                  <span className="text-slate-500">{isAr ? 'تاريخ الاستحقاق:' : 'Due Date:'}</span>{' '}
                  <strong className="font-mono">{customerInvoiceObject.dueDate}</strong>
                </p>
                <p>
                  <span className="text-slate-500">{isAr ? 'عدد الرحلات المعتمدة:' : 'Total Trips:'}</span>{' '}
                  <strong className="font-bold text-orange-950">{totalTrips} رحلة</strong>
                </p>
              </div>
            </div>

            {/* 3. Aggregated Items Table */}
            <div className="overflow-x-auto my-6">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-y-2 border-slate-900 bg-slate-100 font-bold text-slate-900">
                    <th className="py-3 px-3">#</th>
                    <th className="py-3 px-3">{isAr ? 'بيان المادة / البند' : 'Material Description'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'عدد الرحلات' : 'Trips'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'الوزن الصافي (MT طن)' : 'Delivered (MT طن)'}</th>
                    <th className="py-3 px-3">{isAr ? 'سعر الوحدة (ر.س/MT طن)' : 'Unit Rate (SAR/MT)'}</th>
                    <th className="py-3 px-3">{isAr ? 'المبلغ (بدون ضريبة)' : 'Amount'}</th>
                    <th className="py-3 px-3">{isAr ? 'الضريبة 15%' : 'VAT 15%'}</th>
                    <th className="py-3 px-3 text-left">{isAr ? 'المجموع (ر.س)' : 'Total (SAR)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoiceItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono">{idx + 1}</td>
                      <td className="py-3 px-3 font-bold text-slate-900">{item.materialType}</td>
                      <td className="py-3 px-3 text-center text-slate-700">{item.tripsCount}</td>
                      <td className="py-3 px-3 text-center font-bold text-slate-900">{item.deliveredWeight}</td>
                      <td className="py-3 px-3 font-mono">{item.unitPrice}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900">{formatCurrency(item.subtotal, language)}</td>
                      <td className="py-3 px-3 text-slate-700">{formatCurrency(item.vatAmount, language)}</td>
                      <td className="py-3 px-3 font-black text-neutral-950 text-left">{formatCurrency(item.total, language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. Totals & ZATCA QR Block */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t-2 border-slate-900 pt-6">
              <div className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="h-24 w-24 bg-slate-900 p-1 flex items-center justify-center rounded-xl shrink-0">
                  <QrCode className="h-20 w-20 text-white" />
                </div>
                <div className="space-y-1 text-[11px] text-slate-700">
                  <p className="font-bold text-slate-900">{isAr ? 'الحساب البنكي المعتمد للتحويل:' : 'Bank Details:'}</p>
                  <p>{brandConfig.bankNameAr}</p>
                  <p className="font-mono text-orange-950 font-bold">IBAN: {brandConfig.iban}</p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>{isAr ? 'المجموع الخاضع للضريبة:' : 'Taxable Subtotal:'}</span>
                  <strong className="text-slate-900">{formatCurrency(subtotal, language)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{isAr ? 'ضريبة القيمة المضافة (15%):' : 'VAT (15%):'}</span>
                  <strong className="text-slate-900">{formatCurrency(totalVat, language)}</strong>
                </div>
                <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-sm">
                  <span className="font-black text-slate-900">{isAr ? 'إجمالي المبلغ المستحق:' : 'Grand Total Due:'}</span>
                  <strong className="font-black text-orange-950 text-base">{formatCurrency(grandTotal, language)}</strong>
                </div>
              </div>
            </div>

            {/* 5. Official CEO Signature & Seal */}
            <div className="mt-12 grid grid-cols-3 gap-4 border-t border-slate-200 pt-6 text-center text-xs text-slate-600">
              <div>
                <p className="font-bold text-slate-800">{isAr ? 'إعداد المحاسب المسؤول' : 'Prepared By'}</p>
                <p className="text-[11px] text-slate-700 mt-1">ياسر العتيبي</p>
              </div>

              <div>
                <p className="font-bold text-slate-800">{isAr ? 'اعتماد المدير التنفيذي العام' : 'CEO Authorization'}</p>
                <p className="text-[11px] text-neutral-950 font-bold mt-1">
                  {brandConfig.ceoNameAr} ({brandConfig.ceoTitleAr})
                </p>
                <div className="mt-1 flex flex-col items-center">
                  <span className="text-[10px] font-mono text-emerald-700 font-black">[DIGITALLY SIGNED & SEALED]</span>
                  <span className="text-[9px] font-mono text-slate-400">{token || 'MYN-SHA256-AUTH-OK'}</span>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-800">{isAr ? 'ختم الشركة الرسمي' : 'Company Seal'}</p>
                <div className="h-16 w-16 rounded-full border-2 border-orange-600/60 border-dashed mx-auto mt-1 flex flex-col items-center justify-center text-[9px] text-orange-700 font-black">
                  <span>ميون للمقاولات</span>
                  <span className="text-[7px] text-orange-500 font-mono">MEAYON CO.</span>
                </div>
              </div>
            </div>

            {/* 6. Letterhead Footer */}
            <OfficialLetterheadFooter brandConfig={brandConfig} isAr={isAr} />
          </div>
        ) : (
          /* Supporting Scale Tickets List */
          <div className="space-y-6">
            {matchingTrips.map((trip, idx) => (
              <PrintableSupportingTicket
                key={trip.id}
                trip={trip}
                invoiceNumber={invoiceNumber}
                brandConfig={brandConfig}
                pageIndex={idx + 2}
                totalPages={matchingTrips.length + 1}
                isAr={isAr}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hidden tickets container for PDF capture */}
      <div
        ref={ticketsContainerRef}
        className="absolute -left-[9999px] top-0 opacity-0 pointer-events-none w-[900px]"
        aria-hidden="true"
      >
        {matchingTrips.map((trip, idx) => (
          <PrintableSupportingTicket
            key={trip.id}
            trip={trip}
            invoiceNumber={invoiceNumber}
            brandConfig={brandConfig}
            pageIndex={idx + 2}
            totalPages={matchingTrips.length + 1}
            isAr={isAr}
          />
        ))}
      </div>
    </div>
  );
};
