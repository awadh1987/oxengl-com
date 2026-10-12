import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { MoyasarInvoicePaymentModal } from '../components/MoyasarInvoicePaymentModal';
import {
  Receipt,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Building2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

export interface PublicInvoiceData {
  id: number | string;
  invoice_number: string;
  total_amount: number;
  currency: string;
  payment_status: string;
  paid_at?: string | null;
  payment_method?: string | null;
}

export interface PublicInvoiceViewProps {
  token?: string;
}

export const PublicInvoiceView: React.FC<PublicInvoiceViewProps> = ({ token: propToken }) => {
  let routerToken: string | undefined;
  try {
    const params = useParams<{ token?: string }>();
    routerToken = params?.token;
  } catch {
    // Graceful fallback if component is mounted outside react-router context
  }

  const token =
    propToken ||
    routerToken ||
    (typeof window !== 'undefined'
      ? window.location.pathname.split('/shared/invoice/')[1]?.split('/')[0]?.split('?')[0]
      : '');

  const [invoice, setInvoice] = useState<PublicInvoiceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(true);

  const fetchInvoice = useCallback(async () => {
    if (!token) {
      setError('Invoice token is missing from the URL.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await axios.get<PublicInvoiceData>(`/api/finance/invoices/public/${token}`);
      setInvoice(res.data);
      // Auto-open modal if invoice is pending payment
      if (res.data.payment_status === 'pending') {
        setIsPaymentModalOpen(true);
      }
    } catch (err: any) {
      console.error('Error fetching public invoice:', err);
      const errorDetail =
        err.response?.data?.detail ||
        'Unable to load invoice details. Please verify your link or contact support.';
      setError(errorDetail);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  const handlePaymentSuccess = () => {
    setInvoice((prev) => (prev ? { ...prev, payment_status: 'paid' } : null));
    setIsPaymentModalOpen(false);
    // Refresh from public endpoint to get latest verified transaction details
    fetchInvoice();
  };

  return (
    <div className="min-h-dvh erp-viewport-root bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-orange-500/30 selection:text-orange-200">
      {/* Top Banner Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white block">OxenGL</span>
              <span className="text-[11px] text-slate-400 font-medium tracking-wide uppercase">
                Secure Client Checkout Portal
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-800/60 border border-slate-700/50 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>256-Bit Encrypted</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12 flex flex-col justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500 mb-4 animate-pulse">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent" />
            </div>
            <h3 className="text-lg font-semibold text-white">Loading Invoice Details...</h3>
            <p className="text-sm text-slate-400 mt-1">Retrieving secure transaction payload.</p>
          </div>
        ) : error ? (
          <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-8 text-center max-w-lg mx-auto shadow-2xl backdrop-blur-sm">
            <div className="h-12 w-12 rounded-full bg-red-900/60 text-red-400 mx-auto flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Invoice Not Found or Expired</h3>
            <p className="text-sm text-slate-300 mb-6">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        ) : invoice ? (
          <div className="max-w-xl mx-auto w-full">
            {/* Invoice Summary Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-500" />

              <div className="flex items-start justify-between mb-8">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                    Invoice Details
                  </span>
                  <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Receipt className="w-6 h-6 text-orange-400" />
                    {invoice.invoice_number}
                  </h1>
                </div>

                <div>
                  {invoice.payment_status === 'paid' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Paid
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Payment
                    </span>
                  )}
                </div>
              </div>

              {/* Price / Total Amount Presentation */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6 mb-8 text-center">
                <span className="text-xs uppercase font-medium tracking-wider text-slate-400 block mb-1">
                  Total Payable
                </span>
                <div className="text-4xl font-extrabold text-white tracking-tight flex items-baseline justify-center gap-2">
                  <span>{invoice.total_amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-lg font-semibold text-orange-400">{invoice.currency || 'SAR'}</span>
                </div>
                {invoice.payment_status === 'paid' && invoice.paid_at && (
                  <p className="text-xs text-slate-400 mt-2">
                    Settled on {new Date(invoice.paid_at).toLocaleDateString()} at{' '}
                    {new Date(invoice.paid_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>

              {/* Status Breakdown & Details */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Invoice Number</span>
                  <span className="font-mono font-medium text-slate-200">{invoice.invoice_number}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Currency</span>
                  <span className="font-medium text-slate-200">{invoice.currency || 'SAR'}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Payment Status</span>
                  <span className={`font-semibold capitalize ${invoice.payment_status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {invoice.payment_status}
                  </span>
                </div>
                {invoice.payment_method && (
                  <div className="flex justify-between items-center text-sm py-2 border-b border-slate-800/60">
                    <span className="text-slate-400">Payment Method</span>
                    <span className="font-mono text-slate-200 uppercase">{invoice.payment_method}</span>
                  </div>
                )}
              </div>

              {/* Primary Action Button */}
              {invoice.payment_status === 'pending' ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold text-sm shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    <CreditCard className="w-4 h-4" />
                    Pay Now with Moyasar (Mada / Visa / STC Pay)
                  </button>
                  <p className="text-center text-[11px] text-slate-400">
                    Compliant with Saudi Central Bank (SAMA) & local KSA settlement networks.
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-emerald-200">Payment Completed</h4>
                  <p className="text-xs text-emerald-300/80 mt-0.5">
                    This invoice has been settled and verified. No further payment is required.
                  </p>
                </div>
              )}
            </div>

            {/* Render existing MoyasarInvoicePaymentModal if status is pending */}
            {invoice.payment_status === 'pending' && (
              <MoyasarInvoicePaymentModal
                invoiceId={invoice.id}
                amount={invoice.total_amount}
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                onPaymentSuccess={handlePaymentSuccess}
              />
            )}
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} OxenGL Enterprise Platform. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Powered by Moyasar Payments</span>
            <span>•</span>
            <span>SAMA Certified</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicInvoiceView;
