import React, { useEffect, useRef } from 'react';
import axios from 'axios';

declare global {
  interface Window {
    Moyasar?: any;
  }
}

export interface MoyasarInvoicePaymentModalProps {
  invoiceId: number | string;
  amount: number;
  isOpen?: boolean;
  onClose?: () => void;
  onPaymentSuccess?: () => void;
}

export const MoyasarInvoicePaymentModal: React.FC<MoyasarInvoicePaymentModalProps> = ({
  invoiceId,
  amount,
  isOpen = true,
  onClose,
  onPaymentSuccess,
}) => {
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const amountInHalalas = Math.round(amount * 100);

    const checkMoyasarLoaded = setInterval(() => {
      if (window.Moyasar && formRef.current) {
        clearInterval(checkMoyasarLoaded);
        formRef.current.innerHTML = '';
        window.Moyasar.init({
          element: formRef.current,
          amount: amountInHalalas,
          currency: 'SAR',
          description: `Invoice #${invoiceId} Settlement`,
          publishable_api_key: (import.meta as any).env?.VITE_MOYASAR_PUBLISHABLE_KEY || '',
          callback_url: window.location.href,
          methods: ['creditcard', 'stcpay'],
          on_completed: async (payment: any) => {
            try {
              const res = await axios.post(`/api/finance/payments/moyasar/verify/${invoiceId}`, {
                id: payment.id,
              });
              if (res.data?.status === 'paid') {
                if (onPaymentSuccess) {
                  onPaymentSuccess();
                }
                if (onClose) {
                  onClose();
                }
              }
            } catch (err) {
              console.error('Verification failed', err);
            }
          },
        });
      }
    }, 100);

    return () => clearInterval(checkMoyasarLoaded);
  }, [isOpen, invoiceId, amount, onClose, onPaymentSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 w-full max-w-lg rounded-2xl p-6 relative border border-slate-800 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
        <h3 className="text-lg font-semibold text-white mb-1">
          Settlement for Invoice #{invoiceId}
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Total Amount: <span className="font-bold text-white">{amount} SAR</span>
        </p>
        <div ref={formRef} className="mysr-form mt-4"></div>
      </div>
    </div>
  );
};

export default MoyasarInvoicePaymentModal;
