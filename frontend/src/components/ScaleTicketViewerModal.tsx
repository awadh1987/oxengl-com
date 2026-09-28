import React, { useEffect } from 'react';
import { OperationRecord } from '../types';
import { X, Printer, Download, CheckCircle, Scale, Building, Truck, FileText } from 'lucide-react';
import { formatCurrency, formatDate, formatTonnage } from '../utils/formatters';
import { BrandLogo } from './BrandLogo';

interface ScaleTicketViewerModalProps {
  operation: OperationRecord | null;
  onClose: () => void;
  lang: 'ar' | 'en';
}

export const ScaleTicketViewerModal: React.FC<ScaleTicketViewerModalProps> = ({
  operation,
  onClose,
  lang,
}) => {
  const isAr = lang === 'ar';

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && operation) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [operation, onClose]);

  if (!operation) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scale-ticket-viewer-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
    >
      <div
        id="scale-ticket-viewer"
        className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl transition-colors"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 id="scale-ticket-viewer-title" className="text-xs font-bold text-orange-950 dark:text-orange-300">
            {isAr ? 'معاينة تذكرة ميزان البسكول الرسمية' : 'Official Weighbridge Scale Ticket'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Realistic Saudi Scale Ticket Design */}
        <div className="mt-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/70 p-5 font-mono text-xs text-slate-800 dark:text-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-300 dark:border-slate-700 pb-3 text-center">
            <BrandLogo size="sm" showText={false} />
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                شركة ميون للمقاولات المحدودة
              </p>
              <p className="text-[10px] text-slate-600 dark:text-slate-400">
                MYON ECONOMIC CONTRACTING CO. LTD.
              </p>
              <p className="text-[9px] text-orange-700 dark:text-orange-400 font-sans mt-0.5">
                تذكرة وزن ميزان شاحنات معتمد (Weighbridge Scale Ticket)
              </p>
            </div>
            <div className="text-right text-[10px] text-slate-500 dark:text-slate-400">
              <p>رقم السجل: 1010XXXXXX</p>
              <p>الرقم الضريبي: 300189452300003</p>
            </div>
          </div>

          {/* Ticket Metadata */}
          <div className="my-3 grid grid-cols-2 gap-2 border-b border-slate-200 dark:border-slate-700 pb-3 text-[11px]">
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isAr ? 'رقم التذكرة:' : 'Ticket #:'}</span>{' '}
              <span className="font-bold text-orange-950 dark:text-orange-300">{operation.scale_ticket_no}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isAr ? 'التاريخ والوقت:' : 'Date & Time:'}</span>{' '}
              <span className="font-bold">{formatDate(operation.loading_date, lang)}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isAr ? 'رقم الشاحنة:' : 'Truck No:'}</span>{' '}
              <span className="font-bold text-slate-900 dark:text-white">{operation.truck_no}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isAr ? 'مزود الخدمة / السائق:' : 'Service Supplier:'}</span>{' '}
              <span className="font-bold">{operation.transporter_name}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isAr ? 'منشأة الإرسال:' : 'Origin / Dispatch Facility:'}</span>{' '}
              <span className="font-bold">{operation.loading_source}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{isAr ? 'العميل / الوجهة:' : 'Customer:'}</span>{' '}
              <span className="font-bold text-slate-900 dark:text-white">{operation.destination_customer}</span>
            </div>
          </div>

          {/* Scale Weight Measurements */}
          <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 pb-1 font-semibold">
              <span>{isAr ? 'نوع المادة المنقولة:' : 'Material:'}</span>
              <span className="text-orange-800 dark:text-orange-400 font-bold">{operation.material_type}</span>
            </div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span>{isAr ? `الكمية المحملة (${operation.uom || 'MT'}):` : `Loaded (${operation.uom || 'MT'}):`}</span>
              <span className="font-bold">{formatTonnage(operation.qty_loaded, lang, operation.uom || 'MT طن')}</span>
            </div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span>{isAr ? `الكمية المستلمة (${operation.uom || 'MT'}):` : `Delivered (${operation.uom || 'MT'}):`}</span>
              <span className="font-bold">{formatTonnage(operation.qty_delivered, lang, operation.uom || 'MT طن')}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 text-slate-900 dark:text-white font-bold">
              <span>{isAr ? `فرق الكمية / الفاقد (${operation.uom || 'MT'}):` : `Wastage Loss (${operation.uom || 'MT'}):`}</span>
              <span className={operation.qty_wastage > 1 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}>
                {formatTonnage(operation.qty_wastage, lang, operation.uom || 'MT طن')} ({operation.wastage_percentage}%)
              </span>
            </div>
          </div>

          {/* Ticket Barcode Simulation */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-300 dark:border-slate-700 pt-3 text-[10px] text-slate-500 dark:text-slate-400">
            <div>
              <p>{isAr ? 'توقيع مشغل الميزان' : 'Scale Operator Sign'}</p>
              <div className="h-6 w-24 border-b border-slate-400 dark:border-slate-500 mt-1" />
            </div>
            <div className="text-center font-mono">
              ||| | |||| | ||||| |||| ||| | |||
              <p className="text-[9px]">{operation.scale_ticket_no}</p>
            </div>
            <div className="text-right">
              <p>{isAr ? 'توقيع المستلم' : 'Receiver Sign'}</p>
              <div className="h-6 w-24 border-b border-slate-400 dark:border-slate-500 mt-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

