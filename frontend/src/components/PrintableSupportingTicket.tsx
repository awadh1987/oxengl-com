import React from 'react';
import { OperationRecord, BrandConfig } from '../types';
import { OfficialLetterheadHeader } from './OfficialLetterheadHeader';
import { OfficialLetterheadFooter } from './OfficialLetterheadFooter';
import { formatCurrency, formatTonnage } from '../utils/formatters';
import { Scale, Truck, MapPin, CheckCircle2, ShieldCheck, QrCode } from 'lucide-react';

interface PrintableSupportingTicketProps {
  trip: OperationRecord;
  invoiceNumber: string;
  brandConfig: BrandConfig;
  pageIndex: number;
  totalPages: number;
  isAr?: boolean;
}

export const PrintableSupportingTicket: React.FC<PrintableSupportingTicketProps> = ({
  trip,
  invoiceNumber,
  brandConfig,
  pageIndex,
  totalPages,
  isAr = true,
}) => {
  return (
    <div
      id={`printable-scale-ticket-${trip.id}`}
      className="printable-ticket-page relative bg-white p-8 sm:p-10 text-slate-900 border border-slate-200 rounded-3xl shadow-sm my-4 avoid-page-break"
      style={{ minHeight: '900px' }}
    >
      {/* Official OxenGL header and registration information */}
      <OfficialLetterheadHeader
        brandConfig={brandConfig}
        documentTypeAr="مستند داعم: تذكرة ميزان رسمية"
        documentTypeEn="SUPPORTING SCALE TICKET"
        documentNumber={trip.scale_ticket_no}
        issueDate={trip.loading_date}
        isAr={isAr}
      />

      {/* Invoice Link Reference Ribbon */}
      <div className="my-4 flex items-center justify-between rounded-xl bg-orange-50/80 px-4 py-2 text-xs border border-orange-200/70">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-orange-700" />
          <span className="font-bold text-neutral-950">
            {isAr ? 'مستند إثبات رسمي مرتبط بالفاتورة الضريبية:' : 'Supporting Evidence for Tax Invoice:'}{' '}
            <strong className="font-mono text-orange-700">{invoiceNumber}</strong>
          </span>
        </div>
        <span className="font-mono text-[11px] font-bold text-orange-950">
          Trip Ref: {trip.id}
        </span>
      </div>

      {/* Primary Scale Ticket Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5 text-xs">
        {/* Box 1: Trip & Truck Details */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-slate-900 font-bold">
            <Truck className="h-4 w-4 text-orange-600" />
            <span>{isAr ? 'بيانات الشاحنة ومزود الخدمة' : 'Truck & Service Supplier Details'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500 block">{isAr ? 'رقم لوحة الشاحنة:' : 'Truck Plate:'}</span>
              <strong className="text-slate-900 font-mono text-xs">{trip.truck_no}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'مزود الخدمة / السائق:' : 'Service Supplier:'}</span>
              <strong className="text-slate-900">{trip.transporter_name}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'تاريخ ووقت التحميل:' : 'Loading Date:'}</span>
              <strong className="text-slate-900 font-mono">{trip.loading_date} 07:45 AM</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'بوليصة استلام العميل:' : 'Receipt No:'}</span>
              <strong className="text-slate-900 font-mono">{trip.receipt_invoice_no}</strong>
            </div>
          </div>
        </div>

        {/* Box 2: Origin / Dispatch Facility & Customer / Consignee */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-slate-900 font-bold">
            <MapPin className="h-4 w-4 text-emerald-600" />
            <span>{isAr ? 'مسار التوريد ومنشأة الإرسال' : 'Supply Route & Origin Facility'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500 block">{isAr ? 'منشأة الإرسال:' : 'Origin / Dispatch Facility:'}</span>
              <strong className="text-slate-900">{trip.loading_source}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'العميل المستلم:' : 'Destination Client:'}</span>
              <strong className="text-slate-900">{trip.destination_customer}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'رقم فاتورة مورد المواد الخام:' : 'Raw Materials Supplier Invoice No:'}</span>
              <strong className="text-slate-900 font-mono">{trip.loading_invoice_no}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isAr ? 'المادة الموردة:' : 'Material Type:'}</span>
              <strong className="text-neutral-950 font-bold">{trip.material_type}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Certified Scale Weights Summary Table */}
      <div className="my-5 rounded-2xl border border-slate-300 overflow-hidden">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-bold">
              <th className="py-2.5 px-4">{isAr ? 'بيان الوزن المعتمد' : 'Scale Measurement Item'}</th>
              <th className="py-2.5 px-4 text-center">{isAr ? 'الوزن (MT طن)' : 'Weight (MT طن)'}</th>
              <th className="py-2.5 px-4 text-center">{isAr ? 'سعر الوحدة (ر.س / MT طن)' : 'Rate (SAR / MT طن)'}</th>
              <th className="py-2.5 px-4">{isAr ? 'الإجمالي الفرعي' : 'Subtotal'}</th>
              <th className="py-2.5 px-4">{isAr ? 'الضريبة 15%' : 'VAT (15%)'}</th>
              <th className="py-2.5 px-4 text-left">{isAr ? 'المطالبة الإجمالية' : 'Total Amount'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            <tr>
              <td className="py-3 px-4 font-bold text-slate-800">
                {isAr ? 'الوزن القائم عند التحميل (Gross Loaded)' : 'Gross Loaded Weight'}
              </td>
              <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                {formatTonnage(trip.qty_loaded, isAr ? 'ar' : 'en', trip.uom || 'MT طن')}
              </td>
              <td className="py-3 px-4 text-center text-slate-400">-</td>
              <td className="py-3 px-4 text-slate-400">-</td>
              <td className="py-3 px-4 text-slate-400">-</td>
              <td className="py-3 px-4 text-left text-slate-400">-</td>
            </tr>
            <tr className="bg-emerald-50/50">
              <td className="py-3 px-4 font-bold text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{isAr ? 'الوزن الصافي المستلم المعتمد للفوترة (Net Delivered)' : 'Net Delivered Billable Weight'}</span>
              </td>
              <td className="py-3 px-4 text-center font-mono font-black text-emerald-900 text-sm">
                {formatTonnage(trip.qty_delivered, isAr ? 'ar' : 'en', trip.uom || 'MT طن')}
              </td>
              <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                {(trip.sales_amount / (trip.qty_delivered || 1)).toFixed(2)} ر.س
              </td>
              <td className="py-3 px-4 font-bold text-slate-900">
                {formatCurrency(trip.sales_amount, 'ar')}
              </td>
              <td className="py-3 px-4 text-slate-700">
                {formatCurrency(trip.vat_amount, 'ar')}
              </td>
              <td className="py-3 px-4 font-black text-neutral-950 text-left">
                {formatCurrency(trip.total_sales, 'ar')}
              </td>
            </tr>
            {trip.qty_wastage > 0 && (
              <tr className="text-slate-500 text-[11px] bg-slate-50">
                <td className="py-2 px-4">
                  {isAr ? 'فرق الميزان / الفاقد المرصود (Wastage Variance):' : 'Scale Variance:'}
                </td>
                <td className="py-2 px-4 text-center font-mono text-rose-600 font-bold">
                  {formatTonnage(trip.qty_wastage, isAr ? 'ar' : 'en', trip.uom || 'MT طن')} ({trip.wastage_percentage}%)
                </td>
                <td colSpan={4} className="py-2 px-4 text-slate-500">
                  {trip.notes || 'ضمن النسبة المسموح بها نظاماً'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Scanned Scale Ticket Digital Proof / Visual Stamp */}
      <div className="my-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-orange-600" />
            {isAr ? 'صورة إشعار الميزان الأصلي والختم الضريبي:' : 'Original Physical Scale Ticket Attachment:'}
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Certified Ref: MYN-{trip.id.slice(0, 8).toUpperCase()}-VERIFIED
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
          <div className="h-36 w-full sm:w-60 overflow-hidden rounded-lg border border-slate-300 bg-slate-100 flex items-center justify-center shrink-0">
            {trip.scale_ticket_attachment ? (
              <img
                src={trip.scale_ticket_attachment}
                alt="Scale Ticket Attachment"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-center p-4 text-slate-400">
                <Scale className="h-8 w-8 mx-auto mb-1 opacity-50" />
                <span className="text-[10px] block font-mono">Scale Ticket #{trip.scale_ticket_no}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-[11px] text-slate-600 flex-1">
            <p className="font-bold text-slate-900">
              {isAr ? 'بيانات التوثيق والتدقيق الإلكتروني:' : 'Audit Verification Metadata:'}
            </p>
            <p>
              • {isAr ? 'تمت مطابقة قراءة الميزان بواسطة محطة الوزن الإلكترونية' : 'Electronic scale terminal readings verified'}
            </p>
            <p>
              • {isAr ? 'معتمد من نظام إدارة الأسطول الميداني OxenGL' : 'Verified by OxenGL Fleet Management Gateway'}
            </p>
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-1 text-emerald-700 font-bold">
                <CheckCircle2 className="h-4 w-4" />
                <span>{isAr ? 'مطابق وموثق رسمياً' : 'Officially Matched & Audited'}</span>
              </div>
              <div className="h-10 w-24 border border-dashed border-orange-400 rounded flex items-center justify-center text-[9px] text-orange-700 font-bold">
                ختم الميزان المعتمد
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Official Footer with Page Number */}
      <OfficialLetterheadFooter
        brandConfig={brandConfig}
        isAr={isAr}
        pageNumberText={`صفحة المرفقات ${pageIndex} من ${totalPages} • الفاتورة ${invoiceNumber}`}
      />
    </div>
  );
};
