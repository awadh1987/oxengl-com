import React, { useState } from 'react';
import { DynamicFieldRenderer } from './DynamicFieldRenderer';
import { erpApi } from '../services/api';

interface Props {
  isAr: boolean;
  companyId?: string;
  contract?: any;
  onClose: () => void;
  onSaved: (contract: any) => void;
}

export const SupplierContractModal: React.FC<Props> = ({ isAr, companyId, contract, onClose, onSaved }) => {
  const [supplierName, setSupplierName] = useState(contract?.supplier_name || '');
  const [title, setTitle] = useState(contract?.title || '');
  const [contractValue, setContractValue] = useState(String(contract?.contract_value ?? '0'));
  const [currency, setCurrency] = useState(contract?.currency || 'SAR');
  const [paymentTerms, setPaymentTerms] = useState(contract?.payment_terms || '');
  const [customAttributes, setCustomAttributes] = useState<Record<string, any>>(contract?.custom_attributes || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || !title.trim()) {
      setError(isAr ? 'المورد والعنوان مطلوبان' : 'Supplier and title are required');
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      supplier_name: supplierName.trim(),
      title: title.trim(),
      contract_value: Number(contractValue) || 0,
      currency,
      payment_terms: paymentTerms.trim() || null,
      custom_attributes: customAttributes,
    };
    try {
      const saved = contract?.id
        ? await erpApi.updateSupplierContract(contract.id, body, companyId)
        : await erpApi.createSupplierContract(body, companyId);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err?.detail || err?.message || (isAr ? 'تعذر حفظ العقد' : 'Failed to save contract'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <form onSubmit={submit} className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-white">{contract?.id ? (isAr ? 'تعديل عقد مورد' : 'Edit Supplier Contract') : (isAr ? 'عقد مورد جديد' : 'New Supplier Contract')}</h3>
        <input className={input} placeholder={isAr ? 'اسم المورد' : 'Supplier name'} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        <input className={input} placeholder={isAr ? 'عنوان العقد' : 'Contract title'} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className={input} type="number" min="0" step="0.01" value={contractValue} onChange={(e) => setContractValue(e.target.value)} />
          <input className={input} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} />
        </div>
        <input className={input} placeholder={isAr ? 'شروط الدفع' : 'Payment terms'} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
        <DynamicFieldRenderer entity="supplier_contract" values={customAttributes} onChange={setCustomAttributes} isAr={isAr} />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? '...' : isAr ? 'حفظ' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
};
