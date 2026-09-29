import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { BalancedJournalLineItem, BalancedJournalVoucher } from '../../types';
import {
  Calculator,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Scale,
  FileSpreadsheet,
  Clock,
  ShieldCheck,
  Sparkles,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';

interface BalancedVoucherGridProps {
  onVoucherPosted?: (voucher: BalancedJournalVoucher) => void;
}

const COMMON_ACCOUNTS = [
  { code: '511000', nameAr: 'رواتب وأجور الموظفين الأساسية', nameEn: 'Gross Salaries Expense', type: 'EXPENSE' },
  { code: '512000', nameAr: 'بدلات ومكافآت العمل الإضافي', nameEn: 'Overtime & Allowances', type: 'EXPENSE' },
  { code: '111101', nameAr: 'الحساب البنكي الجاري الرئيسي (الأصول)', nameEn: 'Main Operating Bank Account', type: 'ASSET' },
  { code: '211200', nameAr: 'استقطاعات وتأمينات مستحقة (الخصوم)', nameEn: 'Payroll Withholding Accruals', type: 'LIABILITY' },
  { code: '120001', nameAr: 'ذمم عملاء توريد المواد والكسارات', nameEn: 'Accounts Receivable', type: 'ASSET' },
  { code: '210001', nameAr: 'ذمم مقاولي النقل والناقلين', nameEn: 'Transporters Payable', type: 'LIABILITY' },
  { code: '520001', nameAr: 'مصاريف تشغيل وصيانة الأسطول', nameEn: 'Fleet Maintenance Expense', type: 'EXPENSE' },
  { code: '410001', nameAr: 'إيرادات توريد المواد الإنشائية', nameEn: 'Aggregate Sales Revenue', type: 'REVENUE' },
];

export const BalancedVoucherGrid: React.FC<BalancedVoucherGridProps> = ({ onVoucherPosted }) => {
  const { language, showToast, currentCompany } = useApp();
  const isAr = language === 'ar';

  const [description, setDescription] = useState(
    isAr ? 'تسوية مسيرات الرواتب الشهرية والبدلات - HRMS' : 'Monthly Biometric HRMS Payroll Settlement'
  );
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [referenceNo, setReferenceNo] = useState('HRMS-2026-09');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postedVouchers, setPostedVouchers] = useState<BalancedJournalVoucher[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Initial balanced line items (Default to a realistic HRMS payroll journal entry)
  const [lines, setLines] = useState<BalancedJournalLineItem[]>([
    {
      account_code: '511000',
      account_name: isAr ? 'رواتب وأجور الموظفين الأساسية' : 'Gross Salaries Expense',
      description: isAr ? 'رواتب أساسية معتمدة' : 'Base salaries',
      debit: 15000,
      credit: 0,
    },
    {
      account_code: '512000',
      account_name: isAr ? 'بدلات ومكافآت العمل الإضافي' : 'Overtime & Allowances',
      description: isAr ? 'بدلات ساعات عمل إضافية' : 'Overtime bonuses',
      debit: 2500,
      credit: 0,
    },
    {
      account_code: '111101',
      account_name: isAr ? 'الحساب البنكي الجاري الرئيسي' : 'Main Operating Bank Account',
      description: isAr ? 'صافي المسير المحول بنكياً' : 'Net pay bank transfer',
      debit: 0,
      credit: 16000,
    },
    {
      account_code: '211200',
      account_name: isAr ? 'استقطاعات وتأمينات مستحقة' : 'Payroll Withholding Accruals',
      description: isAr ? 'استقطاع غيابات وتأمينات' : 'Deductions withholding',
      debit: 0,
      credit: 1500,
    },
  ]);

  // Real-time double-entry calculations
  const { totalDebit, totalCredit, discrepancy, isBalanced, isPositive } = useMemo(() => {
    let debits = 0;
    let credits = 0;

    lines.forEach((line) => {
      debits += Number(line.debit) || 0;
      credits += Number(line.credit) || 0;
    });

    const disc = Math.abs(debits - credits);
    const balanced = disc < 0.0001 && debits > 0;

    return {
      totalDebit: debits,
      totalCredit: credits,
      discrepancy: disc,
      isBalanced: balanced,
      isPositive: debits > 0 && credits > 0,
    };
  }, [lines]);

  // Load historical balanced vouchers
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const token = localStorage.getItem('oxengl_auth_jwt') || localStorage.getItem('token');
      const activeTenantId = currentCompany?.id || localStorage.getItem('oxengl_tenant_id') || localStorage.getItem('tenant_id') || '';
      const resp = await fetch('/api/v1/finance/vouchers/balanced', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Tenant-ID': activeTenantId } : {}),
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        setPostedVouchers(data);
      }
    } catch (e) {
      console.error('Failed to fetch balanced vouchers history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [currentCompany]);

  const handleLineChange = (index: number, field: keyof BalancedJournalLineItem, value: any) => {
    setLines((prev) => {
      const updated = [...prev];
      const target = { ...updated[index] };

      if (field === 'debit') {
        const num = parseFloat(value) || 0;
        target.debit = num;
        if (num > 0) target.credit = 0; // Single-side rule
      } else if (field === 'credit') {
        const num = parseFloat(value) || 0;
        target.credit = num;
        if (num > 0) target.debit = 0; // Single-side rule
      } else if (field === 'account_code') {
        target.account_code = value;
        const matched = COMMON_ACCOUNTS.find((a) => a.code === value);
        if (matched) {
          target.account_name = isAr ? matched.nameAr : matched.nameEn;
        }
      } else {
        (target as any)[field] = value;
      }

      updated[index] = target;
      return updated;
    });
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        account_code: '111101',
        account_name: isAr ? 'الحساب البنكي الجاري الرئيسي' : 'Main Operating Bank Account',
        description: description,
        debit: 0,
        credit: 0,
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) {
      if (showToast) {
        showToast(
          isAr ? 'يتطلب القيد المحاسبي المزدوج سطرين على الأقل' : 'Double-entry requires at least two lines',
          'warning'
        );
      }
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const applyPayrollTemplate = () => {
    setLines([
      {
        account_code: '511000',
        account_name: isAr ? 'رواتب وأجور الموظفين الأساسية' : 'Gross Salaries Expense',
        description: isAr ? 'رواتب أساسية معتمدة' : 'Base salaries',
        debit: 18000,
        credit: 0,
      },
      {
        account_code: '512000',
        account_name: isAr ? 'بدلات ومكافآت العمل الإضافي' : 'Overtime & Allowances',
        description: isAr ? 'بدلات ساعات عمل إضافية' : 'Overtime bonuses',
        debit: 3200,
        credit: 0,
      },
      {
        account_code: '111101',
        account_name: isAr ? 'الحساب البنكي الجاري الرئيسي' : 'Main Operating Bank Account',
        description: isAr ? 'صافي المسير المحول بنكياً' : 'Net pay bank transfer',
        debit: 0,
        credit: 19500,
      },
      {
        account_code: '211200',
        account_name: isAr ? 'استقطاعات وتأمينات مستحقة' : 'Payroll Withholding Accruals',
        description: isAr ? 'استقطاع غيابات وتأمينات' : 'Deductions withholding',
        debit: 0,
        credit: 1700,
      },
    ]);
  };

  const applyVendorSettlementTemplate = () => {
    setLines([
      {
        account_code: '210001',
        account_name: isAr ? 'ذمم مقاولي النقل والناقلين' : 'Transporters Payable',
        description: isAr ? 'سداد مستحقات رحلات النقل' : 'Transporter freight clearance',
        debit: 24500,
        credit: 0,
      },
      {
        account_code: '111101',
        account_name: isAr ? 'الحساب البنكي الجاري الرئيسي' : 'Main Operating Bank Account',
        description: isAr ? 'تحويل بنكي صادر' : 'Outbound bank wire',
        debit: 0,
        credit: 24500,
      },
    ]);
  };

  const handlePostVoucher = async () => {
    if (!isBalanced) {
      if (showToast) {
        showToast(
          isAr
            ? `القيد غير متوازن رياضياً! الفارق: ${discrepancy.toFixed(2)} ريال`
            : `Unbalanced entry! Discrepancy: SAR ${discrepancy.toFixed(2)}`,
          'error'
        );
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        description: description,
        entry_date: entryDate,
        lines: lines.map((l) => ({
          account_code: l.account_code,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
        })),
      };

      const token = localStorage.getItem('oxengl_auth_jwt') || localStorage.getItem('token');
      const activeTenantId = currentCompany?.id || localStorage.getItem('oxengl_tenant_id') || localStorage.getItem('tenant_id') || '';
      const resp = await fetch('/api/v1/finance/vouchers/balanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Tenant-ID': activeTenantId } : {}),
        },
        body: JSON.stringify(payload),
      });

      const resJson = await resp.json();

      if (!resp.ok) {
        throw new Error(resJson.detail || 'Failed to post voucher');
      }

      if (showToast) {
        showToast(
          isAr
            ? `تم ترحيل السند المالي بنجاح برقم: ${resJson.entry_number}`
            : `Voucher posted successfully: ${resJson.entry_number}`,
          'success'
        );
      }

      if (onVoucherPosted) {
        onVoucherPosted(resJson);
      }

      await loadHistory();
    } catch (err: any) {
      if (showToast) {
        showToast(err.message || 'Error posting voucher', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Card with Title & Quick Templates */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 shadow-xs">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">
                  {isAr ? 'مصفوفة ترحيل القيود المتوازنة (Double-Entry Matrix)' : 'Double-Entry Balanced Voucher Matrix'}
                </h2>
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-black text-indigo-700">
                  Strict Σ Dr == Σ Cr
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'نموذج إدخال القيود المالية مع فحص فوري للتطابق الرياضي وحظر الترحيل غير المتوازن'
                  : 'Interactive financial ledger voucher entry with zero-tolerance mathematical balance validation'}
              </p>
            </div>
          </div>

          {/* Quick Preset Templates */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400">{isAr ? 'قوالب سريعة:' : 'Presets:'}</span>
            <button
              type="button"
              onClick={applyPayrollTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              <span>{isAr ? 'مسير رواتب HRMS' : 'HRMS Payroll'}</span>
            </button>
            <button
              type="button"
              onClick={applyVendorSettlementTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50"
            >
              <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600" />
              <span>{isAr ? 'تسوية ناقلين' : 'Freight Clearance'}</span>
            </button>
          </div>
        </div>

        {/* Voucher Meta Inputs */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {isAr ? 'تاريخ القيد المحاسبي' : 'Posting Date'}
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {isAr ? 'المرجع أو رقم المسير' : 'Reference / Tracking Code'}
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder={isAr ? 'مثال: HRMS-2026-09' : 'e.g. HRMS-2026-09'}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {isAr ? 'البيان العام للقيد' : 'General Voucher Description'}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* 2. Interactive Line Items Data Grid */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-black text-slate-900">
              {isAr ? 'بنود القيد المحاسبي (مدين / دائن)' : 'Journal Voucher Line Items (Debit / Credit)'}
            </h3>
            <span className="text-xs text-slate-400">({lines.length} {isAr ? 'أسطر' : 'lines'})</span>
          </div>

          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAr ? 'إضافة سطر قيد' : 'Add Line Item'}</span>
          </button>
        </div>

        {/* Data Grid Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-3 text-start font-bold">#</th>
                <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'الحساب المالي (الشجرة)' : 'Account'}</th>
                <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'البيان والوصف' : 'Description'}</th>
                <th className="py-2.5 px-3 text-end font-bold text-indigo-700">{isAr ? 'مدين (Debit SAR)' : 'Debit (SAR)'}</th>
                <th className="py-2.5 px-3 text-end font-bold text-emerald-700">{isAr ? 'دائن (Credit SAR)' : 'Credit (SAR)'}</th>
                <th className="py-2.5 px-3 text-center font-bold">{isAr ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-3 min-w-[220px]">
                    <select
                      value={line.account_code}
                      onChange={(e) => handleLineChange(idx, 'account_code', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                    >
                      {COMMON_ACCOUNTS.map((acc) => (
                        <option key={acc.code} value={acc.code}>
                          {acc.code} - {isAr ? acc.nameAr : acc.nameEn}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-3 min-w-[200px]">
                    <input
                      type="text"
                      value={line.description || ''}
                      onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                      placeholder={isAr ? 'شرح المعاملة...' : 'Memo...'}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                    />
                  </td>
                  <td className="py-3 px-3 min-w-[130px] text-end">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.debit === 0 ? '' : line.debit}
                      onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                      placeholder={isAr ? '0.00' : '0.00'}
                      className="w-full text-end font-mono font-bold text-indigo-700 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-hidden"
                    />
                  </td>
                  <td className="py-3 px-3 min-w-[130px] text-end">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.credit === 0 ? '' : line.credit}
                      onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                      placeholder={isAr ? '0.00' : '0.00'}
                      className="w-full text-end font-mono font-bold text-emerald-700 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-hidden"
                    />
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 2}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      title={isAr ? 'حذف السطر' : 'Remove Line'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 3. REAL-TIME BALANCE CALCULATION BAR & ERROR BADGE */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Totals Summary */}
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="text-[11px] font-bold text-slate-500 block">
                  {isAr ? 'إجمالي المدين (Total Debits)' : 'Total Debits'}
                </span>
                <span className="text-lg font-black font-mono text-indigo-700">
                  {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </span>
              </div>

              <div className="hidden sm:block text-slate-300 font-black text-xl">=</div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 block">
                  {isAr ? 'إجمالي الدائن (Total Credits)' : 'Total Credits'}
                </span>
                <span className="text-lg font-black font-mono text-emerald-700">
                  {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </span>
              </div>

              <div className="hidden sm:block text-slate-300 font-black text-xl">|</div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 block">
                  {isAr ? 'الفارق الرياضي (Discrepancy)' : 'Discrepancy'}
                </span>
                <span
                  className={`text-lg font-black font-mono ${
                    discrepancy < 0.0001 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {discrepancy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </span>
              </div>
            </div>

            {/* Visual Dynamic Verification Badge */}
            <div>
              {isBalanced ? (
                <div
                  id="balanced-status-badge"
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-800 shadow-xs"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>
                    {isAr
                      ? 'قيد متوازن هندسياً ومحكم رياضياً (Σ Debits == Σ Credits)'
                      : 'Mathematically Balanced (Debits == Credits)'}
                  </span>
                </div>
              ) : (
                <div
                  id="unbalanced-error-badge"
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-800 shadow-xs animate-pulse"
                >
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span>
                    {isAr
                      ? `حظر الترحيل: القيد غير متوازن! الفارق (${discrepancy.toFixed(2)} ريال)`
                      : `Isolation Guard: Unbalanced Entry! Discrepancy: SAR ${discrepancy.toFixed(2)}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Action Posting Button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={!isBalanced || isSubmitting}
            onClick={handlePostVoucher}
            className={`flex items-center gap-2.5 rounded-2xl px-6 py-3 text-xs font-black text-white shadow-lg transition-all ${
              isBalanced && !isSubmitting
                ? 'bg-indigo-600 shadow-indigo-600/30 hover:bg-indigo-700 cursor-pointer'
                : 'bg-slate-300 shadow-none cursor-not-allowed text-slate-500'
            }`}
          >
            <Send className="h-4 w-4" />
            <span>
              {isSubmitting
                ? isAr ? 'جارِ التحقق والترحيل...' : 'Validating & Posting...'
                : isBalanced
                ? isAr ? 'ترحيل السند إلى دفتر الأستاذ العام (Post to GL)' : 'Post Voucher to General Ledger'
                : isAr ? 'حظر الترحيل (القيد غير متوازن)' : 'Posting Blocked (Unbalanced)'}
            </span>
          </button>
        </div>
      </div>

      {/* 5. Historical Posted Balanced Vouchers */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-black text-slate-900">
              {isAr ? 'سجل القيود المتوازنة المرحلة حديثاً' : 'Recently Posted Balanced Journal Vouchers'}
            </h3>
          </div>
          <button
            onClick={loadHistory}
            className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            <RefreshCw className={`h-3 w-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>

        {postedVouchers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
            {isLoadingHistory
              ? isAr ? 'جارِ تحميل القيود...' : 'Loading vouchers...'
              : isAr ? 'لم يتم ترحيل أي قيود متوازنة حتى الآن' : 'No balanced vouchers posted yet'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'رقم القيد' : 'Voucher No'}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'البيان' : 'Description'}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="py-2.5 px-3 text-end font-bold text-indigo-700">{isAr ? 'إجمالي المدين' : 'Total Debit'}</th>
                  <th className="py-2.5 px-3 text-end font-bold text-emerald-700">{isAr ? 'إجمالي الدائن' : 'Total Credit'}</th>
                  <th className="py-2.5 px-3 text-center font-bold">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {postedVouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-indigo-900">{v.entry_number}</td>
                    <td className="py-3 px-3 text-slate-800">{v.description}</td>
                    <td className="py-3 px-3 text-slate-500 font-mono">{v.entry_date ? v.entry_date.split('T')[0] : '—'}</td>
                    <td className="py-3 px-3 text-end font-mono font-bold text-indigo-700">
                      {v.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                    </td>
                    <td className="py-3 px-3 text-end font-mono font-bold text-emerald-700">
                      {v.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>{v.status || 'POSTED'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
