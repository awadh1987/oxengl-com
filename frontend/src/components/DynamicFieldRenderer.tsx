import React, { useEffect, useState } from 'react';
import { erpApi, CustomFieldDefinition } from '../services/api';

export type DynamicEntity = 'partner' | 'weighbridge_ticket' | 'fleet_trip' | 'invoice' | 'voucher' | 'purchase_order' | 'inventory_item' | 'employee' | 'supplier_contract' | 'stock_adjustment' | 'payroll_allowance';

interface DynamicFieldRendererProps {
  entity: DynamicEntity;
  values: Record<string, any> | undefined | null;
  onChange: (next: Record<string, any>) => void;
  isAr?: boolean;
}

const schemaCache = new Map<string, Promise<CustomFieldDefinition[]>>();

/** Cached per-tab; invalidate after schema edits (e.g. Design Studio) or tenant switches. */
export function invalidateFormSchemaCache(): void {
  schemaCache.clear();
}

function loadSchema(entity: string): Promise<CustomFieldDefinition[]> {
  let pending = schemaCache.get(entity);
  if (!pending) {
    pending = erpApi.getFormSchema(entity).catch(() => {
      schemaCache.delete(entity);
      return [] as CustomFieldDefinition[];
    });
    schemaCache.set(entity, pending);
  }
  return pending;
}

const inputClass =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none';

/**
 * Renders the tenant's configured custom fields for an entity and writes edits into
 * the entity's `custom_attributes` dictionary. Renders nothing when no fields exist.
 */
export const DynamicFieldRenderer: React.FC<DynamicFieldRendererProps> = ({ entity, values, onChange, isAr }) => {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);

  useEffect(() => {
    let active = true;
    loadSchema(entity).then((defs) => {
      if (active) setFields(defs.filter((f) => f.is_visible).sort((a, b) => a.sort_order - b.sort_order));
    });
    return () => {
      active = false;
    };
  }, [entity]);

  if (fields.length === 0) return null;

  const current = values || {};
  const setValue = (key: string, value: any) => onChange({ ...current, [key]: value });

  return (
    <div data-testid="dynamic-fields" className="space-y-2">
      <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {isAr ? 'حقول مخصصة' : 'Custom Fields'}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const label = (isAr && f.label_ar) || f.label;
          const id = `dyn-${entity}-${f.field_key}`;
          const value = current[f.field_key];
          let control: React.ReactNode;
          if (f.data_type === 'boolean') {
            control = (
              <input
                id={id}
                type="checkbox"
                checked={value === true || value === 'true'}
                onChange={(e) => setValue(f.field_key, e.target.checked)}
              />
            );
          } else if (f.data_type === 'select') {
            control = (
              <select id={id} value={value ?? ''} onChange={(e) => setValue(f.field_key, e.target.value)} className={inputClass}>
                <option value="" />
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          } else {
            control = (
              <input
                id={id}
                type={f.data_type === 'number' ? 'number' : f.data_type === 'date' ? 'date' : 'text'}
                required={f.is_required}
                placeholder={f.data_type === 'date' ? 'YYYY-MM-DD' : undefined}
                value={value ?? ''}
                onChange={(e) =>
                  setValue(f.field_key, f.data_type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)
                }
                className={inputClass}
              />
            );
          }
          return (
            <div key={f.id}>
              <label htmlFor={id} className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {label}
                {f.is_required ? ' *' : ''}
              </label>
              {control}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DynamicFieldRenderer;
