import React, { useState } from 'react';
import { DynamicFieldRenderer } from './DynamicFieldRenderer';
import { erpApi } from '../services/api';

interface Props {
  isAr: boolean;
  companyId?: string;
  onClose: () => void;
  onCreated: (pr: any) => void;
}

export const NewRequisitionModal: React.FC<Props> = ({ isAr, companyId, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [justification, setJustification] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [customAttributes, setCustomAttributes] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !department.trim() || !itemDescription.trim()) {
      setError(isAr ? 'العنوان والقسم ووصف الصنف مطلوبة' : 'Title, department and item description are required');
      return;
    }
    const qty = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;
    setSaving(true);
    setError(null);
    try {
      const created = await erpApi.createPurchaseRequisition({
        title: title.trim(),
        department: department.trim(),
        currency,
        justification: justification.trim() || null,
        lines: [{ item_description: itemDescription.trim(), quantity: qty, unit_price: price, line_total: qty * price }],
        custom_attributes: customAttributes,
      }, companyId);
      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err?.detail || err?.message || (isAr ? 'تعذر حفظ الطلب' : 'Failed to save requisition'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <form onSubmit={submit} className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-white">{isAr ? 'طلب شراء جديد' : 'New Purchase Requisition'}</h3>
        <input className={input} placeholder={isAr ? 'العنوان' : 'Title'} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={input} placeholder={isAr ? 'القسم' : 'Department'} value={department} onChange={(e) => setDepartment(e.target.value)} />
        <input className={input} placeholder={isAr ? 'وصف الصنف' : 'Item description'} value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <input className={input} type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={isAr ? 'الكمية' : 'Qty'} />
          <input className={input} type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder={isAr ? 'سعر الوحدة' : 'Unit price'} />
          <input className={input} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} />
        </div>
        <textarea className={input} rows={2} placeholder={isAr ? 'المبررات' : 'Justification'} value={justification} onChange={(e) => setJustification(e.target.value)} />
        <DynamicFieldRenderer entity="purchase_order" values={customAttributes} onChange={setCustomAttributes} isAr={isAr} />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? '...' : isAr ? 'حفظ' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
};
