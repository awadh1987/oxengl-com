import React, { useEffect, useState } from 'react';
import { DynamicFieldRenderer } from './DynamicFieldRenderer';
import { erpApi } from '../services/api';

interface Props {
  isAr: boolean;
  companyId?: string;
  employee: { id: string; nameAr: string; nameEn: string; roleEn: string; departmentEn: string; baseSalary: number };
  onClose: () => void;
  onSaved: () => void;
}

export const EmployeeProfileModal: React.FC<Props> = ({ isAr, companyId, employee, onClose, onSaved }) => {
  const [department, setDepartment] = useState(employee.departmentEn);
  const [jobTitle, setJobTitle] = useState(employee.roleEn);
  const [baseSalary, setBaseSalary] = useState(String(employee.baseSalary));
  const [customAttributes, setCustomAttributes] = useState<Record<string, any>>({});
  const [allowances, setAllowances] = useState<any[]>([]);
  const [alType, setAlType] = useState('');
  const [alAmount, setAlAmount] = useState('0');
  const [alAttributes, setAlAttributes] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white';

  const loadAllowances = async () => {
    try {
      setAllowances(await erpApi.getEmployeeAllowances(employee.id, companyId));
    } catch {
      setAllowances([]);
    }
  };

  useEffect(() => {
    loadAllowances();
    erpApi.getHrmsEmployees(companyId).then((rows: any) => {
      const row = Array.isArray(rows) ? rows.find((r: any) => r.id === employee.id) : null;
      if (row?.custom_attributes) setCustomAttributes(row.custom_attributes);
    }).catch(() => undefined);
  }, [employee.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await erpApi.updateHrmsEmployee(employee.id, {
        department: department.trim() || undefined,
        job_title: jobTitle.trim() || undefined,
        base_salary: Number(baseSalary) || undefined,
        custom_attributes: customAttributes,
      }, companyId);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.detail || err?.message || (isAr ? 'تعذر حفظ الملف' : 'Failed to save profile'));
    } finally {
      setBusy(false);
    }
  };

  const addAllowance = async () => {
    if (!alType.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await erpApi.createEmployeeAllowance(employee.id, {
        allowance_type: alType.trim(),
        amount: Number(alAmount) || 0,
        custom_attributes: alAttributes,
      }, companyId);
      setAlType('');
      setAlAmount('0');
      setAlAttributes({});
      await loadAllowances();
    } catch (err: any) {
      setError(err?.detail || err?.message || (isAr ? 'تعذر إضافة البدل' : 'Failed to add allowance'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-white">{isAr ? employee.nameAr : employee.nameEn}</h3>
        <form onSubmit={save} className="space-y-3">
          <input className={input} placeholder={isAr ? 'القسم' : 'Department'} value={department} onChange={(e) => setDepartment(e.target.value)} />
          <input className={input} placeholder={isAr ? 'المسمى الوظيفي' : 'Job title'} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          <input className={input} type="number" min="0" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
          <DynamicFieldRenderer entity="employee" values={customAttributes} onChange={setCustomAttributes} isAr={isAr} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300">{isAr ? 'إغلاق' : 'Close'}</button>
            <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{isAr ? 'حفظ' : 'Save'}</button>
          </div>
        </form>
        <div className="space-y-2 border-t border-slate-700 pt-3">
          <h4 className="text-xs font-bold text-slate-300">{isAr ? 'البدلات' : 'Allowances'}</h4>
          {allowances.map((a) => (
            <div key={a.id} className="flex justify-between text-xs text-slate-300">
              <span>{a.allowance_type}</span>
              <span>{Number(a.amount).toLocaleString()}</span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder={isAr ? 'نوع البدل' : 'Allowance type'} value={alType} onChange={(e) => setAlType(e.target.value)} />
            <input className={input} type="number" min="0" value={alAmount} onChange={(e) => setAlAmount(e.target.value)} />
          </div>
          <DynamicFieldRenderer entity="payroll_allowance" values={alAttributes} onChange={setAlAttributes} isAr={isAr} />
          <button type="button" onClick={addAllowance} disabled={busy} className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{isAr ? 'إضافة بدل' : 'Add allowance'}</button>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
};
