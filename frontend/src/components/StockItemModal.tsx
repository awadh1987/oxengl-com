import React, { useState } from 'react';
import { DynamicFieldRenderer } from './DynamicFieldRenderer';
import { erpApi } from '../services/api';

interface StockItemModalProps {
  isAr: boolean;
  products: { id: string; name?: string; sku?: string; default_code?: string }[];
  onClose: () => void;
  onCreated: (item: any) => void;
}

export const StockItemModal: React.FC<StockItemModalProps> = ({ isAr, products, onClose, onCreated }) => {
  const [productId, setProductId] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [baseUom, setBaseUom] = useState('kg');
  const [reorderPoint, setReorderPoint] = useState('0');
  const [customAttributes, setCustomAttributes] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || sku.trim().length < 2 || name.trim().length < 2) {
      setError(isAr ? 'المنتج والرمز والاسم مطلوبة' : 'Product, SKU and name are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await erpApi.createStockItem({
        product_id: productId,
        sku: sku.trim(),
        name: name.trim(),
        base_uom: baseUom.trim() || 'kg',
        reorder_point: Number(reorderPoint) || 0,
        custom_attributes: customAttributes,
      });
      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err?.message || (isAr ? 'تعذر الحفظ' : 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <h3 className="text-sm font-bold text-white">{isAr ? 'صنف مخزون جديد' : 'New Stock Item'}</h3>
        {error && <div role="alert" className="text-xs font-bold text-red-400">{error}</div>}
        <select aria-label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} className={input}>
          <option value="">{isAr ? 'اختر المنتج' : 'Select product'}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name || p.sku || p.default_code || p.id}</option>
          ))}
        </select>
        <input aria-label="SKU" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} className={input} />
        <input aria-label="Name" placeholder={isAr ? 'الاسم' : 'Name'} value={name} onChange={(e) => setName(e.target.value)} className={input} />
        <div className="grid grid-cols-2 gap-3">
          <input aria-label="Base UoM" placeholder="UoM" value={baseUom} onChange={(e) => setBaseUom(e.target.value)} className={input} />
          <input aria-label="Reorder point" type="number" min="0" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} className={input} />
        </div>
        <DynamicFieldRenderer entity="inventory_item" values={customAttributes} onChange={setCustomAttributes} isAr={isAr} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300">{isAr ? 'إلغاء' : 'Cancel'}</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">
            {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
          </button>
        </div>
      </form>
    </div>
  );
};
