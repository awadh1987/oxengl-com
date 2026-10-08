import React from 'react';
import { FinancialVoucher, BrandConfig } from '../types';
import { OfficialLetterheadHeader } from './OfficialLetterheadHeader';
import { OfficialLetterheadFooter } from './OfficialLetterheadFooter';
import { ShieldCheck, CheckCircle2, Clock, FileText, CreditCard, Building, UserCheck } from 'lucide-react';

interface OfficialVoucherDocumentProps {
  voucher: FinancialVoucher;
  brandConfig: BrandConfig;
  isAr?: boolean;
}

export const OfficialVoucherDocument: React.FC<OfficialVoucherDocumentProps> = ({
  voucher,
  brandConfig,
  isAr = true,
}) => {
  const isPayment = voucher.type === 'Payment';
  const typeAr = isPayment ? 'سند صرف رسمي' : 'سند قبض رسمي';
  const typeEn = isPayment ? 'OFFICIAL PAYMENT VOUCHER' : 'OFFICIAL RECEIPT VOUCHER';

  return (
    <div
      id={`voucher-printable-${voucher.id}`}
      className="relative overflow-hidden rounded-3xl border border-slate-300 bg-white p-6 sm:p-10 shadow-xl text-slate-900 printable-ticket-page print:p-2 print:border-none print:shadow-none print:rounded-none avoid-page-break"
    >
      {/* Pre-Approval / Draft Watermark if not approved */}
      {voucher.status !== 'Approved' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none overflow-hidden z-10">
          <div className="rotate-[-25deg] rounded-3xl border-8 border-dashed border-amber-400/25 px-12 py-6 text-center text-3xl font-black tracking-widest text-amber-500/25 uppercase sm:text-5xl">
            {voucher.status === 'Pending_Approval'
              ? isAr ? 'قيد مراجعة واعتماد الإدارة' : 'PENDING CEO APPROVAL'
              : isAr ? 'مسودة سند غير معتمدة' : 'DRAFT VOUCHER'}
          </div>
        </div>
      )}

      {/* Official Corporate Letterhead Header */}
      <OfficialLetterheadHeader
        brandConfig={brandConfig}
        documentTypeAr={typeAr}
        documentTypeEn={typeEn}
        documentNumber={voucher.voucherNumber}
        issueDate={voucher.date}
        isAr={isAr}
      />

      {/* Voucher Type Title Bar */}
      <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-6 py-3.5 text-white shadow-sm print:my-2 print:px-4 print:py-2">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-black text-sm ${isPayment ? 'bg-rose-600' : 'bg-emerald-600'}`}>
            {isPayment ? 'صرف' : 'قبض'}
          </div>
          <div>
            <h2 className="text-base font-black tracking-wide sm:text-lg">
              {isPayment ? 'سند صـرف مالـي' : 'سند قـبض مالـي'}
            </h2>
            <p className="text-[11px] text-slate-300 uppercase tracking-widest font-mono">
              {isPayment ? 'PAYMENT VOUCHER' : 'RECEIPT VOUCHER'} • NO: <span dir="ltr" className="inline-block unicode-bidi-isolate">{voucher.voucherNumber}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-right sm:text-left">
            <span className="text-slate-400 block text-[10px]">{isAr ? 'التاريخ المالي:' : 'Posting Date:'}</span>
            <strong className="font-mono text-sm"><span dir="ltr" className="inline-block unicode-bidi-isolate">{voucher.date}</span></strong>
          </div>
          <div className="text-right sm:text-left">
            <span className="text-slate-400 block text-[10px]">{isAr ? 'حالة السند:' : 'Status:'}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 font-bold text-xs ${
                voucher.status === 'Approved'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {voucher.status === 'Approved' ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {isAr ? 'معتمد رسمياً' : 'Approved'}
                </>
              ) : (
                <>
                  <Clock className="h-3.5 w-3.5" />
                  {isAr ? 'معلق للاعتماد' : 'Pending'}
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Main Amount & Tafqeet Section */}
      <div className="mb-6 rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50/80 via-white to-slate-50 p-5 shadow-xs print:mb-2 print:p-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:gap-2">
          <div className="space-y-1">
            <span className="text-xs font-bold text-orange-950 uppercase tracking-wider print:text-[10px]">
              {isPayment
                ? isAr ? 'المبلغ المصروف رقماً:' : 'Amount Paid (Numeric):'
                : isAr ? 'المبلغ المقبوض رقماً:' : 'Amount Received (Numeric):'}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-slate-950 sm:text-4xl print:text-2xl">
                <span dir="ltr" className="inline-block unicode-bidi-isolate">{voucher.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
              <span className="rounded-lg bg-orange-700 px-2 py-0.5 text-xs font-black text-white print:text-[10px]">
                {isAr ? 'ريال سعودي (SAR)' : 'SAR'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-orange-200 bg-white p-3 text-xs sm:max-w-md shadow-xs print:p-2">
            <span className="font-bold text-slate-500 block text-[10px] mb-0.5">
              {isAr ? 'طريقة السداد / التحصيل:' : 'Payment Method:'}
            </span>
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <CreditCard className="h-4 w-4 text-orange-600 print:h-3 print:w-3" />
              <span>
                {voucher.paymentMethod === 'Bank Transfer' ? (isAr ? 'تحويل بنكي رسمي' : 'Bank Transfer') :
                 voucher.paymentMethod === 'Cheque' ? (isAr ? 'شيك مصرفي' : 'Bank Cheque') :
                 voucher.paymentMethod === 'Cash' ? (isAr ? 'نقداً من الصندوق' : 'Cash') :
                 (isAr ? 'تسوية قيد / إشعار دائن' : 'Credit Memo')}
              </span>
            </div>
            {voucher.bankName && (
              <p className="text-[11px] text-slate-600 mt-1 print:text-[10px] print:mt-0.5">
                {isAr ? 'البنك:' : 'Bank:'} <strong>{voucher.bankName}</strong>
              </p>
            )}
            {(voucher.transferRefNumber || voucher.checkNumber) && (
              <p className="text-[11px] text-slate-600 print:text-[10px]">
                {voucher.checkNumber ? (isAr ? 'رقم الشيك:' : 'Cheque No:') : (isAr ? 'مرجع التحويل:' : 'Ref No:')}{' '}
                <strong className="font-mono text-orange-950">
                  <span dir="ltr" className="inline-block unicode-bidi-isolate">{voucher.checkNumber || voucher.transferRefNumber}</span>
                </strong>
              </p>
            )}
          </div>
        </div>

        {/* Tafqeet (تفقيط المبلغ بالحروف العربية والإنجليزية) */}
        <div className="mt-4 rounded-xl border border-orange-300/80 bg-orange-100/50 p-3.5 text-slate-900 print:mt-1.5 print:p-2">
          <div className="flex items-start gap-2">
            <span className="shrink-0 rounded-md bg-orange-950 px-2 py-0.5 text-[10px] font-bold text-white">
              {isAr ? 'تفقيط المبلغ' : 'In Words'}
            </span>
            <div className="space-y-0.5">
              <p className="text-xs font-bold sm:text-sm text-neutral-950 font-serif leading-relaxed print:text-xs">
                {voucher.amountInWordsAr}
              </p>
              {voucher.amountInWordsEn && (
                <p className="text-[11px] font-medium text-slate-600 font-mono print:text-[9px]">
                  {voucher.amountInWordsEn}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Beneficiary / Payer & Details Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 print:mb-2 print:gap-2">
        {/* Party Details Card */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 print:p-2.5 print:space-y-1">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 print:pb-1">
            <Building className="h-4 w-4 text-orange-600 print:h-3 print:w-3" />
            <span className="text-xs font-black text-slate-900">
              {isPayment
                ? isAr ? 'يُصرف لأمر المستفيد (Payee):' : 'Paid To (Beneficiary):'
                : isAr ? 'استلمنا من السيد/السادة (Received From):' : 'Received From:'}
            </span>
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-950 print:text-xs">{voucher.partyName}</h3>
            <p className="text-[11px] text-slate-600 print:text-[10px]">
              {isAr ? 'تصنيف الجهة:' : 'Party Category:'}{' '}
              <strong className="text-orange-950">
                {voucher.partyType === 'Crusher' ? (isAr ? 'كسارة موردة' : 'Crusher Supplier') :
                 voucher.partyType === 'Transporter' ? (isAr ? 'ناقل معتمد' : 'Transporter Fleet') :
                 voucher.partyType === 'Customer' ? (isAr ? 'عميل / مشترٍ' : 'Customer') :
                 (isAr ? 'جهة أخرى / مورد' : 'Other Vendor')}
              </strong>
            </p>
            {voucher.partyTaxNumber && (
              <p className="text-[11px] text-slate-600 print:text-[10px]">
                {isAr ? 'الرقم الضريبي:' : 'VAT No:'}{' '}
                <span className="font-mono font-bold text-slate-900"><span dir="ltr" className="inline-block unicode-bidi-isolate">{voucher.partyTaxNumber}</span></span>
              </p>
            )}
          </div>
        </div>

        {/* Purpose & Reference Link Card */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 print:p-2.5 print:space-y-1">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 print:pb-1">
            <FileText className="h-4 w-4 text-orange-600 print:h-3 print:w-3" />
            <span className="text-xs font-black text-slate-900">
              {isAr ? 'بيان الغرض والمرجع المالي (Purpose):' : 'Payment Purpose & Ref:'}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-800 leading-relaxed print:text-[11px]">
              {voucher.purpose}
            </p>
            {voucher.linkedReferenceNo && (
              <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-200 print:text-[10px] print:pt-0.5">
                {isAr ? 'رقم الفاتورة / المرجع المرتبط:' : 'Linked Invoice/Ref:'}{' '}
                <strong className="font-mono text-orange-950">{voucher.linkedReferenceNo}</strong>
              </p>
            )}
            {voucher.notes && (
              <p className="text-[10px] text-slate-500 italic print:text-[9px]">
                {isAr ? 'ملاحظات:' : 'Notes:'} {voucher.notes}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Official 4-Block Signatures Section (إعداد، مراجعة، استلام، واعتماد CEO) */}
      <div className="mt-8 rounded-2xl border border-slate-300 bg-slate-50/50 p-5 avoid-page-break print:mt-2 print:p-2.5">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2 print:mb-2 print:pb-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-700 print:h-3 print:w-3" />
            <span className="text-xs font-black text-slate-900 uppercase print:text-[10px]">
              {isAr ? 'دورة التواقيع والاعتمادات المالية الرسمية' : 'OFFICIAL FINANCIAL SIGNATURES & APPROVAL'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono print:text-[8px]">
            {isAr ? 'وفق اللائحة المالية للشركة' : 'Financial Policy Compliance'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:gap-2">
          {/* 1. Prepared By (المحاسب) */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 text-center min-h-[130px] print:min-h-[75px] print:p-2">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase print:text-[8px]">
                {isAr ? '1. إعداد المحاسب' : '1. Prepared By'}
              </span>
              <p className="mt-1 text-xs font-black text-slate-800 print:text-[10px]">
                {voucher.preparedBy || 'ياسر العتيبي'}
              </p>
              <p className="text-[9px] text-slate-500 print:text-[8px]">{isAr ? 'محاسب مالي' : 'Accountant'}</p>
            </div>
            <div className="mt-2 border-t border-dashed border-slate-200 pt-1 text-[9px] text-emerald-600 font-bold flex items-center justify-center gap-1 print:mt-1 print:text-[8px]">
              <CheckCircle2 className="h-3 w-3" />
              <span>{isAr ? 'مُوقع بالنظام' : 'Signed'}</span>
            </div>
          </div>

          {/* 2. Reviewed By (الإدارة المالية / COO) */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 text-center min-h-[130px] print:min-h-[75px] print:p-2">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase print:text-[8px]">
                {isAr ? '2. تدقيق ومراجعة' : '2. Reviewed By'}
              </span>
              <p className="mt-1 text-xs font-black text-slate-800 print:text-[10px]">
                {voucher.reviewedBy || 'عبدالمجيد أحمد'}
              </p>
              <p className="text-[9px] text-slate-500 print:text-[8px]">{isAr ? 'المدير المالي والتشغيلي' : 'Finance / COO'}</p>
            </div>
            <div className="mt-2 border-t border-dashed border-slate-200 pt-1 text-[9px] text-orange-600 font-bold flex items-center justify-center gap-1 print:mt-1 print:text-[8px]">
              <CheckCircle2 className="h-3 w-3" />
              <span>{isAr ? 'تم التدقيق' : 'Audited'}</span>
            </div>
          </div>

          {/* 3. Received By (المستلم / المستفيد) */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 text-center min-h-[130px] print:min-h-[75px] print:p-2">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase print:text-[8px]">
                {isAr ? '3. توقيع المستلم/المستفيد' : '3. Received By'}
              </span>
              <p className="mt-1 text-xs font-bold text-slate-800 truncate print:text-[10px]">
                {voucher.receivedBy || (isAr ? 'المستفيد / الوكيل' : 'Beneficiary')}
              </p>
              <p className="text-[9px] text-slate-400 print:text-[8px]">{isAr ? 'التوقيع / الختم' : 'Signature / Stamp'}</p>
            </div>
            <div className="mt-2 border-t border-dashed border-slate-200 pt-1 text-[9px] text-slate-400 font-mono print:mt-1 print:text-[8px]">
              ..........................
            </div>
          </div>

          {/* 4. CEO Approval & Official Stamp */}
          <div className={`flex flex-col justify-between rounded-xl border p-3 text-center min-h-[130px] print:min-h-[75px] print:p-2 relative overflow-hidden ${
            voucher.status === 'Approved' ? 'border-orange-300 bg-orange-50/50' : 'border-slate-200 bg-white'
          }`}>
            <div>
              <span className="block text-[10px] font-bold text-orange-950 uppercase print:text-[8px]">
                {isAr ? '4. اعتماد المدير التنفيذي (CEO)' : '4. CEO Approval'}
              </span>
              <p className="mt-1 text-xs font-black text-slate-900 print:text-[10px]">
                {brandConfig.ceoNameAr || 'معاذ صالح'}
              </p>
              <p className="text-[9px] text-orange-700 font-semibold print:text-[8px]">
                {brandConfig.ceoTitleAr || 'المدير التنفيذي العام'}
              </p>
            </div>

            {voucher.status === 'Approved' ? (
              <div className="mt-2 border-t border-orange-200 pt-1 flex flex-col items-center print:mt-1">
                {/* Official Digital Seal & Stamp Image/Icon */}
                <div className="flex items-center gap-1 text-[9px] font-black text-orange-950 bg-orange-100/80 px-2 py-0.5 rounded-md border border-orange-200 print:text-[7px]">
                  <ShieldCheck className="h-3 w-3 text-orange-700" />
                  <span>{isAr ? 'معتمد بالختم الرسمي' : 'Approved & Sealed'}</span>
                </div>
                {voucher.approvedAt && (
                  <span className="text-[8px] font-mono text-slate-500 mt-0.5 print:text-[7px]">
                    {new Date(voucher.approvedAt).toLocaleDateString('en-GB')}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-2 border-t border-dashed border-slate-200 pt-1 text-[9px] text-amber-600 font-bold print:mt-1 print:text-[8px]">
                {isAr ? 'بانتظار الاعتماد' : 'Pending'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Official Corporate Letterhead Footer */}
      <OfficialLetterheadFooter brandConfig={brandConfig} isAr={isAr} />
    </div>
  );
};
