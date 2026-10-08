import React, { useState, useEffect } from 'react';
import { CustomerInvoice } from '../types';
import { Mail, Send, CheckCircle2, ExternalLink, Globe, Copy, X } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface DynamicEmailLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: CustomerInvoice;
  customerEmail: string;
  customerName: string;
  language: 'ar' | 'en';
}

export const DynamicEmailLauncherModal: React.FC<DynamicEmailLauncherModalProps> = ({
  isOpen,
  onClose,
  invoice,
  customerEmail,
  customerName,
  language,
}) => {
  const isAr = language === 'ar';
  const [copied, setCopied] = useState(false);

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

  const subject = isAr
    ? `مطالبة وفاتورة ضريبية معتمدة رقم ${invoice.invoiceNumber} - شركة ميون للمقاولات المحدودة`
    : `Approved Tax Invoice #${invoice.invoiceNumber} - Myon Economic Contracting Co. Ltd.`;

  const emailBodyAr = `السادة / ${customerName} المحترمين،
تحية طيبة وبعد،

نرفق لكم تفاصيل الفاتورة الضريبية الشهرية المعتمدة رقم (${invoice.invoiceNumber}) الخاصة بتوريدات المواد الإنشائية وأعمال النقل الثقيل لشهر ${invoice.billingMonth}/${invoice.billingYear}.

ملخص الفاتورة:
- رقم الفاتورة: ${invoice.invoiceNumber}
- إجمالي عدد الرحلات: ${invoice.totalTrips} رحلة
- إجمالي الوزن الصافي المستلم: ${invoice.totalDeliveredWeight.toLocaleString()} طن
- المبلغ الإجمالي قبل الضريبة: ${formatCurrency(invoice.subtotal, 'ar')}
- ضريبة القيمة المضافة (15%): ${formatCurrency(invoice.vatAmount, 'ar')}
- إجمالي المبلغ المستحق النهائي: ${formatCurrency(invoice.grandTotal, 'ar')}
- حالة الاعتماد: معتمدة وموقعة إلكترونياً من الإدارة العامة

يرجى مراجعة التفاصيل وإجراء التحويل البنكي على حساب الشركة المعتمد في مصرف الراجحي:
IBAN: SA4280000123608010123456

شاكرين لكم حسن تعاونكم الدائم معنا.
شركة ميون للمقاولات المحدودة (قسم الإدارة المالية والمطالبات)
هاتف: +966 11 482 9900 | info@meayon.sa`;

  const emailBodyEn = `Dear ${customerName},

Greetings,

Please find the details for the approved monthly Tax Invoice #${invoice.invoiceNumber} for building material supply and heavy haulage operations for period ${invoice.billingMonth}/${invoice.billingYear}.

Invoice Summary:
- Invoice No: ${invoice.invoiceNumber}
- Total Trips: ${invoice.totalTrips} trips
- Net Delivered Weight: ${invoice.totalDeliveredWeight.toLocaleString()} Tons
- Total (Excl. VAT): ${formatCurrency(invoice.subtotal, 'en')}
- VAT Amount (15%): ${formatCurrency(invoice.vatAmount, 'en')}
- Grand Total: ${formatCurrency(invoice.grandTotal, 'en')}
- Status: Officially Approved & Digitally Stamped

Please review and process the wire transfer to our company account at Al Rajhi Bank:
IBAN: SA4280000123608010123456

Best regards,
Myon Economic Contracting Co. Ltd. (Financial & Billing Dept.)
Phone: +966 11 482 9900 | info@meayon.sa`;

  const finalBody = isAr ? emailBodyAr : emailBodyEn;

  const handleDefaultMailClient = () => {
    const mailtoUrl = `mailto:${encodeURIComponent(customerEmail || '')}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(finalBody)}`;
    window.location.href = mailtoUrl;
  };

  const handleGmailWeb = () => {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      customerEmail || ''
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOutlookWeb = () => {
    const outlookUrl = `https://outlook.live.com/owa/?path=/mail/action/compose&to=${encodeURIComponent(
      customerEmail || ''
    )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
    window.open(outlookUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyBody = async () => {
    try {
      await navigator.clipboard.writeText(finalBody);
      setCopied(true);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = finalBody;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
    }
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dynamic-email-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div
        id="dynamic-email-launcher-modal"
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-600 text-white">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 id="dynamic-email-title" className="text-sm font-black">
                {isAr ? 'إرسال الفاتورة عبر البريد الإلكتروني' : 'Launch Email Client for Invoice'}
              </h3>
              <p className="text-[11px] text-slate-300 font-mono">
                {invoice.invoiceNumber} → {customerEmail || 'customer@company.sa'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {isAr
              ? 'اختر تطبيق أو بوابة البريد الإلكتروني المفضلة لديك لفتح نافذة إرسال مجهزة تلقائياً بالبيانات الرسمية والمبالغ المعتمدة:'
              : 'Choose your preferred email client to launch a pre-populated message with official amounts and bank details:'}
          </p>

          {/* Email Clients Options Grid */}
          <div className="grid grid-cols-1 gap-3">
            {/* Option 1: Default Mail Client (Desktop Outlook / Apple Mail) */}
            <button
              onClick={handleDefaultMailClient}
              className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 text-right transition-all hover:border-orange-500 hover:bg-orange-50/50 dark:hover:bg-slate-800/80 hover:shadow-xs group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white group-hover:bg-orange-600">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-neutral-950 dark:group-hover:text-white">
                    {isAr ? 'تطبيق البريد الافتراضي (Outlook / Apple Mail)' : 'Default Email Client (Desktop)'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'يفتح برنامج الأوتلوك المكتبي أو بريد النظام ببروتوكول mailto' : 'Launches Outlook desktop application via mailto protocol'}
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-orange-600" />
            </button>

            {/* Option 2: Gmail Web */}
            <button
              onClick={handleGmailWeb}
              className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 text-right transition-all hover:border-red-500 hover:bg-red-50/40 dark:hover:bg-slate-800/80 hover:shadow-xs group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-red-950 dark:group-hover:text-white">
                    {isAr ? 'بريد جوجل ويب (Gmail Web)' : 'Google Gmail (Web Browser)'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'يفتح تبويب إنشاء رسالة جديدة مباشرة في Gmail' : 'Opens compose window directly in Google Workspace / Gmail'}
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-red-600" />
            </button>

            {/* Option 3: Outlook Web */}
            <button
              onClick={handleOutlookWeb}
              className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 text-right transition-all hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-slate-800/80 hover:shadow-xs group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-950 dark:group-hover:text-white">
                    {isAr ? 'أوتلوك ويب (Outlook / Office 365 Web)' : 'Outlook / Office 365 (Web)'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'يفتح نافذة إرسال سحابية في Outlook.com / O365' : 'Opens compose tab in Microsoft Outlook 365 Web'}
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
            </button>
          </div>

          {/* Quick Copy Text fallback */}
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'أو نسخ نص الرسالة يدوياً:' : 'Or copy message text manually:'}
              </span>
              <button
                onClick={handleCopyBody}
                className="flex items-center gap-1 text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-300">{isAr ? 'تم النسخ للحافظة!' : 'Copied!'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{isAr ? 'نسخ النص' : 'Copy Text'}</span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-500 line-clamp-2 font-mono">
              {finalBody}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 px-6 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
