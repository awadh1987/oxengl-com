import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  erpApi,
  ApiTrialBalanceReport,
  ApiIncomeStatementReport,
  ApiBalanceSheetReport,
  ApiTrialBalanceAccount,
  ApiFinancialReportAccount,
  ApiFxGainLossReport,
  ApiMultiCurrencyTrialBalanceReport,
  ApiFxGainLossItem,
  ApiMultiCurrencyTrialBalanceAccount,
} from '../services/api';
import {
  Scale,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Building2,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  Calendar,
  PieChart,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Search,
  BookOpen,
  ArrowRightLeft,
  Coins,
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { Upload as BulkUploadIcon } from 'lucide-react';
import { BulkImportModal } from '../components/BulkImportModal';

export type FinancialReportType = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'fx-exposure';

interface FinancialReportsViewProps {
  initialReport?: FinancialReportType;
}

const TableSkeletonRows: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 7 }) => (
  <>
    {Array.from({ length: rows }).map((_, rIdx) => (
      <tr key={`skel-row-${rIdx}`} className="animate-pulse">
        {Array.from({ length: cols }).map((_, cIdx) => (
          <td key={`skel-col-${cIdx}`} className="py-3 px-4">
            <div
              className={`h-4 bg-slate-200/80 rounded ${
                cIdx === 1 ? 'w-48' : cIdx === 0 ? 'w-16' : 'w-24 ms-auto'
              }`}
            />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const KpiSkeletonCards: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
        <div className="h-3 bg-slate-200 rounded w-1/2" />
        <div className="h-7 bg-slate-200 rounded w-3/4" />
        <div className="h-2.5 bg-slate-100 rounded w-1/3" />
      </div>
    ))}
  </div>
);

export const FinancialReportsView: React.FC<FinancialReportsViewProps> = ({
  initialReport = 'trial-balance',
}) => {
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const { language, currentCompany, tenantId, brandConfig, showToast } = useApp();
  const isAr = language === 'ar';

  const [activeReport, setActiveReport] = useState<FinancialReportType>(initialReport);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Report Data States
  const [trialBalance, setTrialBalance] = useState<ApiTrialBalanceReport | null>(null);
  const [multiCurrencyTb, setMultiCurrencyTb] = useState<ApiMultiCurrencyTrialBalanceReport | null>(null);
  const [incomeStatement, setIncomeStatement] = useState<ApiIncomeStatementReport | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<ApiBalanceSheetReport | null>(null);
  const [fxExposureReport, setFxExposureReport] = useState<ApiFxGainLossReport | null>(null);

  // FX & Multi-Currency Controls
  const [trialBalanceViewMode, setTrialBalanceViewMode] = useState<'consolidated' | 'native'>('consolidated');
  const [isSyncingFx, setIsSyncingFx] = useState<boolean>(false);
  const [revalSubTab, setRevalSubTab] = useState<'ar' | 'ap'>('ar');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  const effectiveCompanyId = currentCompany?.id || tenantId || '';
  const companyDisplayName =
    currentCompany?.name ||
    (isAr ? brandConfig.companyNameAr || 'الشركة المعتمدة' : brandConfig.companyNameEn || 'Authorized Enterprise');

  // Load Active Report Data
  const fetchReportData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeReport === 'trial-balance') {
        const [data, mcData] = await Promise.all([
          erpApi.getAnalyticsTrialBalance({ companyId: effectiveCompanyId }),
          erpApi.getMultiCurrencyTrialBalance({ companyId: effectiveCompanyId }).catch(() => null),
        ]);
        setTrialBalance(data);
        if (mcData) setMultiCurrencyTb(mcData);
      } else if (activeReport === 'income-statement') {
        const data = await erpApi.getAnalyticsIncomeStatement({ companyId: effectiveCompanyId });
        setIncomeStatement(data);
      } else if (activeReport === 'balance-sheet') {
        const data = await erpApi.getAnalyticsBalanceSheet({ companyId: effectiveCompanyId });
        setBalanceSheet(data);
      } else if (activeReport === 'fx-exposure') {
        const data = await erpApi.getFxGainLossReport({ companyId: effectiveCompanyId });
        setFxExposureReport(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch financial report:', err);
      const msg = err?.message || (isAr ? 'فشل تحميل بيانات التقرير المالي من دفتر الأستاذ' : 'Failed to load report from general ledger');
      setError(msg);
      showToast?.(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerFxSync = async () => {
    setIsSyncingFx(true);
    try {
      const res = await erpApi.triggerFxSync(effectiveCompanyId);
      showToast?.(
        isAr
          ? `تم تحديث أسعار الصرف بنجاح وتطهير الذاكرة التخزينية (${res.synced_pairs} زوج عملات)`
          : `FX rates updated & cache purged successfully (${res.synced_pairs} pairs)`,
        'success'
      );
      await fetchReportData();
    } catch (err: any) {
      showToast?.(err?.message || (isAr ? 'فشل مزامنة أسعار الصرف' : 'Failed to sync FX rates'), 'error');
    } finally {
      setIsSyncingFx(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeReport, effectiveCompanyId]);

  // Export to CSV Helper
  const handleExportCSV = () => {
    let csvContent = '';
    const dateStr = new Date().toISOString().slice(0, 10);

    if (activeReport === 'trial-balance' && trialBalance) {
      csvContent = 'Account Code,Account Name,Type,Debit (SAR),Credit (SAR),Net Balance (SAR)\n';
      trialBalance.accounts.forEach((acc) => {
        csvContent += `"${acc.account_code}","${acc.account_name}","${acc.account_type}",${acc.total_debit},${acc.total_credit},${acc.net_balance}\n`;
      });
      csvContent += `Total,,,${trialBalance.total_debit},${trialBalance.total_credit},${trialBalance.discrepancy}\n`;
    } else if (activeReport === 'fx-exposure' && fxExposureReport) {
      csvContent = 'Type,Invoice Number,Partner,Currency,Outstanding,Booking Rate,Spot Rate,Original USD,Revalued USD,Unrealized Gain/Loss (USD),Status\n';
      fxExposureReport.ar_revaluation.forEach((item) => {
        csvContent += `"AR","${item.invoice_number}","${item.partner_name}","${item.currency}",${item.outstanding_amount},${item.original_rate_to_usd},${item.current_rate_to_usd},${item.original_usd},${item.current_usd},${item.unrealized_gain_loss_usd},"${item.revaluation_status}"\n`;
      });
      fxExposureReport.ap_revaluation.forEach((item) => {
        csvContent += `"AP","${item.invoice_number}","${item.partner_name}","${item.currency}",${item.outstanding_amount},${item.original_rate_to_usd},${item.current_rate_to_usd},${item.original_usd},${item.current_usd},${item.unrealized_gain_loss_usd},"${item.revaluation_status}"\n`;
      });
    } else if (activeReport === 'income-statement' && incomeStatement) {
      csvContent = 'Category,Account Code,Account Name,Amount (SAR)\n';
      incomeStatement.revenue_accounts.forEach((acc) => {
        csvContent += `"Revenue","${acc.account_code}","${acc.account_name}",${acc.amount}\n`;
      });
      incomeStatement.expense_accounts.forEach((acc) => {
        csvContent += `"Expense","${acc.account_code}","${acc.account_name}",${acc.amount}\n`;
      });
      csvContent += `Total Revenue,,,${incomeStatement.total_revenue}\n`;
      csvContent += `Total Expenses,,,${incomeStatement.total_expenses}\n`;
      csvContent += `Net Income,,,${incomeStatement.net_income}\n`;
    } else if (activeReport === 'balance-sheet' && balanceSheet) {
      csvContent = 'Category,Account Code,Account Name,Amount (SAR)\n';
      balanceSheet.asset_accounts.forEach((acc) => {
        csvContent += `"Asset","${acc.account_code}","${acc.account_name}",${acc.amount}\n`;
      });
      balanceSheet.liability_accounts.forEach((acc) => {
        csvContent += `"Liability","${acc.account_code}","${acc.account_name}",${acc.amount}\n`;
      });
      balanceSheet.equity_accounts.forEach((acc) => {
        csvContent += `"Equity","${acc.account_code}","${acc.account_name}",${acc.amount}\n`;
      });
      csvContent += `Total Assets,,,${balanceSheet.total_assets}\n`;
      csvContent += `Total Liabilities,,,${balanceSheet.total_liabilities}\n`;
      csvContent += `Total Equity,,,${balanceSheet.total_equity}\n`;
      csvContent += `Net Income (Current Period),,,${balanceSheet.current_period_net_income}\n`;
      csvContent += `Total Liabilities & Equity,,,${balanceSheet.total_liabilities_and_equity}\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeReport}-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Accounts for Trial Balance
  const filteredTrialBalanceAccounts = useMemo(() => {
    if (!trialBalance?.accounts) return [];
    return trialBalance.accounts.filter((acc) => {
      const matchesSearch =
        acc.account_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (acc.account_name_ar && acc.account_name_ar.includes(searchQuery));
      const matchesType =
        selectedTypeFilter === 'ALL' || acc.account_type === selectedTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [trialBalance, searchQuery, selectedTypeFilter]);

  // Filtered Accounts for Multi-Currency Trial Balance
  const filteredMultiCurrencyAccounts = useMemo(() => {
    if (!multiCurrencyTb?.accounts) return [];
    return multiCurrencyTb.accounts.filter((acc) => {
      const matchesSearch =
        acc.account_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (acc.account_name_ar && acc.account_name_ar.includes(searchQuery));
      const matchesType =
        selectedTypeFilter === 'ALL' || acc.account_type === selectedTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [multiCurrencyTb, searchQuery, selectedTypeFilter]);

  // Filtered Items for FX Exposure & Revaluation
  const filteredFxItems = useMemo(() => {
    if (!fxExposureReport) return [];
    const items = revalSubTab === 'ar' ? fxExposureReport.ar_revaluation : fxExposureReport.ap_revaluation;
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.invoice_number.toLowerCase().includes(q) ||
        item.partner_name.toLowerCase().includes(q) ||
        item.currency.toLowerCase().includes(q)
    );
  }, [fxExposureReport, revalSubTab, searchQuery]);

  return (
    <div className="space-y-6 px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      {/* 1. Header Card & Controls */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl relative overflow-hidden text-white no-print">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-amber-500" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 uppercase">
                {companyDisplayName} • GENERAL LEDGER ANALYTICS
              </span>
              <span className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                {isAr ? 'محرك التقارير المالية' : 'Financial Analytics Engine'}
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">
              {activeReport === 'trial-balance'
                ? isAr
                  ? 'ميزان المراجعة والأرصدة الختامية'
                  : 'General Ledger Trial Balance'
                : activeReport === 'income-statement'
                ? isAr
                  ? 'قائمة الدخل والأرباح والخسائر (P&L)'
                  : 'Income Statement (Profit & Loss)'
                : activeReport === 'balance-sheet'
                ? isAr
                  ? 'الميزانية العمومية وقائمة المركز المالي'
                  : 'Balance Sheet (Financial Position)'
                : isAr
                ? 'فروقات العملة وإعادة تقييم الصرف (FX Exposure & Revaluation)'
                : 'FX Exposure & Revaluation'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeReport === 'trial-balance'
                ? isAr
                  ? 'تجميع آلي فوري لحركات المدين والدائن من قيود دفتر الأستاذ الفعالة مع التحقق الصارم من التوازن'
                  : 'Real-time double-entry debit/credit ledger aggregation directly from active journal lines with strict parity validation.'
                : activeReport === 'income-statement'
                ? isAr
                  ? 'احتساب صافي الدخل التشغيلي وهامش الربحية من إجمالي الإيرادات والمصروفات المسجلة'
                  : 'Calculates operational net income, revenue recognition, and profit margins from posted revenues and expenses.'
                : activeReport === 'balance-sheet'
                ? isAr
                  ? 'بيان المركز المالي الشامل وتوازن معادلة المحاسبة: الأصول = الخصوم + حقوق الملكية + أرباح الفترة'
                  : 'Statement of financial position verifying double-entry equilibrium: Assets = Liabilities + Equity + Net Income.'
                : isAr
                ? 'تقرير تقييم الأرباح والخسائر غير المحققة للفواتير المفتوحة (ذمم مدينة/دائنة) بأسعار الصرف الحية مقارنة بأسعار الحجز'
                : 'Real-time unrealized FX gain and loss evaluation on open AP/AR invoices comparing booking spot rates vs live active market rates.'}
            </p>
          </div>

          {/* Quick Action Tools */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchReportData}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition cursor-pointer"
              title={isAr ? 'تحديث التقرير المالي' : 'Refresh report data'}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تحديث' : 'Refresh'}</span>
            </button>

<button
            type="button"
            id="bulk-import-btn"
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <BulkUploadIcon className="h-3.5 w-3.5" />
            <span>{isAr ? 'استيراد جماعي (.xlsx)' : 'Bulk Import (.xlsx)'}</span>
          </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
              title={isAr ? 'تصدير كملف CSV' : 'Export to CSV'}
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
              title={isAr ? 'طباعة التقرير المالي' : 'Print Financial Report'}
            >
              <Printer className="h-3.5 w-3.5 text-indigo-400" />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>
          </div>
        </div>

        {/* 2. Top Report Navigation Tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-4">
          <button
            onClick={() => setActiveReport('trial-balance')}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition cursor-pointer ${
              activeReport === 'trial-balance'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Scale className="h-4 w-4" />
            <span>{isAr ? 'ميزان المراجعة (Trial Balance)' : 'Trial Balance'}</span>
          </button>

          <button
            onClick={() => setActiveReport('income-statement')}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition cursor-pointer ${
              activeReport === 'income-statement'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>{isAr ? 'قائمة الدخل (Income Statement)' : 'Income Statement'}</span>
          </button>

          <button
            onClick={() => setActiveReport('balance-sheet')}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition cursor-pointer ${
              activeReport === 'balance-sheet'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>{isAr ? 'الميزانية العمومية (Balance Sheet)' : 'Balance Sheet'}</span>
          </button>

          <button
            onClick={() => setActiveReport('fx-exposure')}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition cursor-pointer ${
              activeReport === 'fx-exposure'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span>{isAr ? 'إعادة التقييم ومخاطر الصرف (FX Exposure & Revaluation)' : 'FX Exposure & Revaluation'}</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-4 text-xs font-bold text-rose-800 dark:text-rose-300 shadow-xs">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Indicator Banner */}
      {isLoading && (
        <div className="flex items-center gap-3 rounded-2xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/70 dark:bg-indigo-950/20 p-3.5 text-xs font-bold text-indigo-900 dark:text-indigo-200 shadow-xs animate-pulse">
          <RefreshCw className="h-4 w-4 animate-spin text-indigo-600 shrink-0" />
          <span>
            {isAr
              ? 'جاري تجميع وترحيل قيود دفتر الأستاذ العام وحساب الأرصدة التراكمية...'
              : 'Aggregating and calculating real-time general ledger balances...'}
          </span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* REPORT 1: TRIAL BALANCE VIEW                                         */}
      {/* ==================================================================== */}
      {activeReport === 'trial-balance' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي المدين (Debits)' : 'Total Debits'}
              </span>
              <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                {isLoading ? (
                  <div className="h-7 w-28 bg-slate-200 rounded animate-pulse my-0.5" />
                ) : (
                  formatCurrency(Number(trialBalance?.total_debit || 0), language)
                )}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {trialBalance?.accounts.length || 0} {isAr ? 'حساب نشط' : 'active accounts'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي الدائن (Credits)' : 'Total Credits'}
              </span>
              <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                {isLoading ? (
                  <div className="h-7 w-28 bg-slate-200 rounded animate-pulse my-0.5" />
                ) : (
                  formatCurrency(Number(trialBalance?.total_credit || 0), language)
                )}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {isAr ? 'مطابقة متوازنة' : 'Double-entry parity'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'فارق التوازن (Discrepancy)' : 'Ledger Discrepancy'}
              </span>
              <div
                className={`mt-2 text-2xl font-black ${
                  trialBalance?.is_balanced ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {isLoading ? (
                  <div className="h-7 w-28 bg-slate-200 rounded animate-pulse my-0.5" />
                ) : (
                  formatCurrency(Number(trialBalance?.discrepancy || 0), language)
                )}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {trialBalance?.is_balanced
                  ? isAr
                    ? '0.00 ر.س (متوازن بدقة)'
                    : 'Balanced Invariance (0.00)'
                  : isAr
                  ? 'يوجد خلل في التوازن'
                  : 'Out of balance'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'حالة التوازن المحاسبي' : 'Ledger Balance Status'}
              </span>
              <div className="mt-2 flex items-center gap-2">
                {trialBalance?.is_balanced ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? 'متوازن وموثق' : 'Balanced (Invariance Valid)'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                    <span>{isAr ? 'غير متوازن' : 'Unbalanced'}</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block mt-1">
                {isAr ? 'دفتر الأستاذ العام النشط' : 'Active General Ledger'}
              </span>
            </div>
          </div>

          {/* Filters Bar & View Mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs no-print">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                id="trial-balance-search"
                name="search_query"
                type="text"
                placeholder={isAr ? 'بحث برقم الحساب أو الاسم...' : 'Search by account code or name...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Currency View Mode Toggle */}
              <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  id="tb-toggle-consolidated"
                  onClick={() => setTrialBalanceViewMode('consolidated')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    trialBalanceViewMode === 'consolidated'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Coins className="h-3.5 w-3.5" />
                  <span>{isAr ? 'العملة الأساسية (USD)' : 'Consolidated Base (USD)'}</span>
                </button>
                <button
                  type="button"
                  id="tb-toggle-native"
                  onClick={() => setTrialBalanceViewMode('native')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    trialBalanceViewMode === 'native'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>{isAr ? 'العملات المتعددة الأصلية (USD/SAR/YER)' : 'Native Currency (USD, SAR, YER)'}</span>
                </button>
              </div>

              {/* Classification filter */}
              <div className="flex items-center gap-1">
                {['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTypeFilter(t)}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                      selectedTypeFilter === t
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {t === 'ALL'
                      ? isAr
                        ? 'الكل'
                        : 'All'
                      : t === 'ASSET'
                      ? isAr
                        ? 'أصول'
                        : 'Assets'
                      : t === 'LIABILITY'
                      ? isAr
                        ? 'خصوم'
                        : 'Liabilities'
                      : t === 'EQUITY'
                      ? isAr
                        ? 'حقوق ملكية'
                        : 'Equity'
                      : t === 'REVENUE'
                      ? isAr
                        ? 'إيرادات'
                        : 'Revenue'
                      : isAr
                      ? 'مصروفات'
                      : 'Expenses'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {trialBalanceViewMode === 'consolidated' ? (
            /* Consolidated Trial Balance Table */
            <div className="overflow-x-auto rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-600 dark:text-slate-300">
                    <th className="py-3.5 px-4 text-start">{isAr ? 'رمز الحساب' : 'Code'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'التصنيف' : 'Classification'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'إجمالي المدين' : 'Debit (USD)'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'إجمالي الدائن' : 'Credit (USD)'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'رصيد المدين' : 'Debit Balance'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'رصيد الدائن' : 'Credit Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {isLoading ? (
                    <TableSkeletonRows rows={6} cols={7} />
                  ) : filteredTrialBalanceAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-slate-500">
                        {isAr ? 'لا توجد حركات مالية مسجلة' : 'No general ledger entries found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredTrialBalanceAccounts.map((acc) => (
                      <tr key={acc.account_code} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {acc.account_code}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {isAr && acc.account_name_ar ? acc.account_name_ar : acc.account_name}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              acc.account_type === 'ASSET'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800'
                                : acc.account_type === 'LIABILITY'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
                                : acc.account_type === 'EQUITY'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800'
                                : acc.account_type === 'REVENUE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800'
                            }`}
                          >
                            {acc.account_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-end font-mono text-slate-800 dark:text-slate-200">
                          {formatCurrency(Number(acc.total_debit), language, 'USD')}
                        </td>
                        <td className="py-3 px-4 text-end font-mono text-slate-800 dark:text-slate-200">
                          {formatCurrency(Number(acc.total_credit), language, 'USD')}
                        </td>
                        <td className="py-3 px-4 text-end font-mono font-semibold text-blue-900 dark:text-blue-300">
                          {Number(acc.debit_balance) > 0 ? formatCurrency(Number(acc.debit_balance), language, 'USD') : '-'}
                        </td>
                        <td className="py-3 px-4 text-end font-mono font-semibold text-amber-900 dark:text-amber-300">
                          {Number(acc.credit_balance) > 0 ? formatCurrency(Number(acc.credit_balance), language, 'USD') : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 dark:border-slate-200 bg-slate-100/80 dark:bg-slate-800/80 font-black text-slate-900 dark:text-slate-100">
                    <td colSpan={3} className="py-4 px-4 text-start uppercase">
                      {isAr ? 'الإجمالي العام لميزان المراجعة (USD)' : 'Grand Total (USD)'}
                    </td>
                    <td className="py-4 px-4 text-end font-mono text-sm">
                      {formatCurrency(Number(trialBalance?.total_debit || 0), language, 'USD')}
                    </td>
                    <td className="py-4 px-4 text-end font-mono text-sm">
                      {formatCurrency(Number(trialBalance?.total_credit || 0), language, 'USD')}
                    </td>
                    <td colSpan={2} className="py-4 px-4 text-end">
                      {trialBalance?.is_balanced ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                          ✓ {isAr ? 'المدين = الدائن (متوازن)' : 'Debits = Credits (Balanced)'}
                        </span>
                      ) : (
                        <span className="text-rose-700 dark:text-rose-400 font-bold">
                          ✕ {isAr ? 'غير متوازن' : 'Out of Balance'}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            /* Multi-Currency Native Trial Balance Table */
            <div className="overflow-x-auto rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="bg-slate-50/80 dark:bg-slate-800/50 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {isAr ? 'تفصيل الأرصدة بالعملات الأصلية لكل حركة (USD, SAR, YER) مع المعادلة الموحدة (USD)' : 'Native Currency Ledger Breakdowns (USD, SAR, YER) & Base USD Consolidated Total'}
                </span>
                <span className="font-mono text-[11px] bg-slate-200/70 dark:bg-slate-700/60 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-300">
                  {isAr ? 'أسعار الصرف النشطة:' : 'Active Spot Rates:'} USD/SAR: {multiCurrencyTb?.active_rates?.SAR || 3.75} | USD/YER: {multiCurrencyTb?.active_rates?.YER || 535.0}
                </span>
              </div>
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                    <th className="py-3 px-3 text-start">{isAr ? 'رمز الحساب' : 'Code'}</th>
                    <th className="py-3 px-3 text-start">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                    <th className="py-3 px-2 text-start">{isAr ? 'النوع' : 'Type'}</th>
                    <th className="py-3 px-3 text-end border-s border-slate-200 dark:border-slate-700 bg-blue-50/40 dark:bg-blue-950/20">USD (Dr / Cr)</th>
                    <th className="py-3 px-3 text-end border-s border-slate-200 dark:border-slate-700 bg-emerald-50/40 dark:bg-emerald-950/20">SAR (Dr / Cr)</th>
                    <th className="py-3 px-3 text-end border-s border-slate-200 dark:border-slate-700 bg-purple-50/40 dark:bg-purple-950/20">YER (Dr / Cr)</th>
                    <th className="py-3 px-3 text-end border-s border-slate-200 dark:border-slate-700 bg-amber-50/40 dark:bg-amber-950/20">{isAr ? 'الموحد (USD)' : 'Consolidated (USD)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {isLoading ? (
                    <TableSkeletonRows rows={6} cols={7} />
                  ) : filteredMultiCurrencyAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-slate-500">
                        {isAr ? 'لا توجد حركات بالعملات المتعددة مسجلة' : 'No multi-currency ledger entries found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMultiCurrencyAccounts.map((acc) => {
                      const usd = acc.native_balances?.USD || { debit: 0, credit: 0, net_balance: 0 };
                      const sar = acc.native_balances?.SAR || { debit: 0, credit: 0, net_balance: 0 };
                      const yer = acc.native_balances?.YER || { debit: 0, credit: 0, net_balance: 0 };
                      const cons = acc.consolidated_usd || { total_debit: 0, total_credit: 0, net_balance: 0 };

                      return (
                        <tr key={acc.account_code} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {acc.account_code}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                            {isAr && acc.account_name_ar ? acc.account_name_ar : acc.account_name}
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {acc.account_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono border-s border-slate-100 dark:border-slate-800 bg-blue-50/20 dark:bg-blue-950/10">
                            <div className="text-slate-900 dark:text-slate-100">
                              {usd.debit > 0 || usd.credit > 0 ? (
                                <>
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{formatCurrency(usd.debit, language, 'USD')}</span>
                                  <span className="text-slate-400 mx-1">/</span>
                                  <span className="text-rose-700 dark:text-rose-400 font-semibold">{formatCurrency(usd.credit, language, 'USD')}</span>
                                </>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono border-s border-slate-100 dark:border-slate-800 bg-emerald-50/20 dark:bg-emerald-950/10">
                            <div className="text-slate-900 dark:text-slate-100">
                              {sar.debit > 0 || sar.credit > 0 ? (
                                <>
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{formatCurrency(sar.debit, language, 'SAR')}</span>
                                  <span className="text-slate-400 mx-1">/</span>
                                  <span className="text-rose-700 dark:text-rose-400 font-semibold">{formatCurrency(sar.credit, language, 'SAR')}</span>
                                </>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono border-s border-slate-100 dark:border-slate-800 bg-purple-50/20 dark:bg-purple-950/10">
                            <div className="text-slate-900 dark:text-slate-100">
                              {yer.debit > 0 || yer.credit > 0 ? (
                                <>
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{formatCurrency(yer.debit, language, 'YER')}</span>
                                  <span className="text-slate-400 mx-1">/</span>
                                  <span className="text-rose-700 dark:text-rose-400 font-semibold">{formatCurrency(yer.credit, language, 'YER')}</span>
                                </>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono font-bold border-s border-slate-100 dark:border-slate-800 bg-amber-50/20 dark:bg-amber-950/10">
                            <div className="text-slate-900 dark:text-slate-100">
                              {formatCurrency(cons.total_debit, language, 'USD')} / {formatCurrency(cons.total_credit, language, 'USD')}
                            </div>
                            <div className={`text-[10px] ${cons.net_balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              Net: {formatCurrency(cons.net_balance, language, 'USD')}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 dark:border-slate-100 bg-slate-100/80 dark:bg-slate-800 font-black text-slate-900 dark:text-slate-100">
                    <td colSpan={3} className="py-3.5 px-3 text-start uppercase">
                      {isAr ? 'الإجمالي الموحد الكلي' : 'Grand Consolidated Totals'}
                    </td>
                    <td className="py-3.5 px-3 text-end font-mono border-s border-slate-200 dark:border-slate-700">
                      {formatCurrency(multiCurrencyTb?.native_totals?.USD?.debit || 0, language, 'USD')} / {formatCurrency(multiCurrencyTb?.native_totals?.USD?.credit || 0, language, 'USD')}
                    </td>
                    <td className="py-3.5 px-3 text-end font-mono border-s border-slate-200 dark:border-slate-700">
                      {formatCurrency(multiCurrencyTb?.native_totals?.SAR?.debit || 0, language, 'SAR')} / {formatCurrency(multiCurrencyTb?.native_totals?.SAR?.credit || 0, language, 'SAR')}
                    </td>
                    <td className="py-3.5 px-3 text-end font-mono border-s border-slate-200 dark:border-slate-700">
                      {formatCurrency(multiCurrencyTb?.native_totals?.YER?.debit || 0, language, 'YER')} / {formatCurrency(multiCurrencyTb?.native_totals?.YER?.credit || 0, language, 'YER')}
                    </td>
                    <td className="py-3.5 px-3 text-end font-mono border-s border-slate-200 dark:border-slate-700 text-sm font-black text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(multiCurrencyTb?.consolidated_totals?.total_debit_usd || 0, language, 'USD')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* REPORT 2: INCOME STATEMENT (PROFIT & LOSS) VIEW                     */}
      {/* ==================================================================== */}
      {activeReport === 'income-statement' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي الإيرادات (Total Revenue)' : 'Total Revenue'}
              </span>
              <div className="mt-2 text-2xl font-black text-emerald-600">
                {formatCurrency(Number(incomeStatement?.total_revenue || 0), language)}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {incomeStatement?.revenue_accounts.length || 0} {isAr ? 'بند إيراد' : 'revenue line items'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي المصروفات (Expenses)' : 'Total Expenses'}
              </span>
              <div className="mt-2 text-2xl font-black text-rose-600">
                {formatCurrency(Number(incomeStatement?.total_expenses || 0), language)}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {incomeStatement?.expense_accounts.length || 0} {isAr ? 'بند مصروف' : 'expense line items'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'صافي الدخل التشغيلي (Net Income)' : 'Net Operating Income'}
              </span>
              <div
                className={`mt-2 text-2xl font-black ${
                  Number(incomeStatement?.net_income || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatCurrency(Number(incomeStatement?.net_income || 0), language)}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {Number(incomeStatement?.net_income || 0) >= 0
                  ? isAr
                    ? 'أرباح صافية'
                    : 'Net Operating Profit'
                  : isAr
                  ? 'خسائر تشغيلية'
                  : 'Net Operating Loss'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'هامش الربحية التشغيلية' : 'Operating Profit Margin'}
              </span>
              <div className="mt-2 text-2xl font-black text-indigo-900">
                {incomeStatement?.operating_margin_percentage || 0}%
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {isAr ? 'نسبة صافي الربح إلى المبيعات' : 'Net Margin to Revenue Ratio'}
              </span>
            </div>
          </div>

          {/* Revenue Breakdown Section */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  {isAr ? '1. بنود الإيرادات والمبيعات التشغيلية (Operating Revenue)' : '1. Operating Revenue'}
                </h3>
              </div>
              <span className="font-mono text-sm font-black text-emerald-600">
                {formatCurrency(Number(incomeStatement?.total_revenue || 0), language)}
              </span>
            </div>

            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                  <th className="py-2 text-start font-bold">{isAr ? 'رمز الحساب' : 'Code'}</th>
                  <th className="py-2 text-start font-bold">{isAr ? 'البيان' : 'Description'}</th>
                  <th className="py-2 text-end font-bold">{isAr ? 'المبلغ' : 'Amount (SAR)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {isLoading ? (
                  <TableSkeletonRows rows={3} cols={3} />
                ) : (
                  incomeStatement?.revenue_accounts.map((acc) => (
                    <tr key={acc.account_code}>
                      <td className="py-2.5 font-mono text-slate-700 dark:text-slate-300">{acc.account_code}</td>
                      <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">
                        {isAr && acc.account_name_ar ? acc.account_name_ar : acc.account_name}
                      </td>
                      <td className="py-2.5 text-end font-mono font-bold text-emerald-700">
                        {formatCurrency(Number(acc.amount), language)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Expense Breakdown Section */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-rose-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  {isAr ? '2. بنود المصروفات والتكاليف التشغيلية (Operating Expenses)' : '2. Operating Expenses'}
                </h3>
              </div>
              <span className="font-mono text-sm font-black text-rose-600">
                {formatCurrency(Number(incomeStatement?.total_expenses || 0), language)}
              </span>
            </div>

            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                  <th className="py-2 text-start font-bold">{isAr ? 'رمز الحساب' : 'Code'}</th>
                  <th className="py-2 text-start font-bold">{isAr ? 'البيان' : 'Description'}</th>
                  <th className="py-2 text-end font-bold">{isAr ? 'المبلغ' : 'Amount (SAR)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {isLoading ? (
                  <TableSkeletonRows rows={4} cols={3} />
                ) : (
                  incomeStatement?.expense_accounts.map((acc) => (
                    <tr key={acc.account_code}>
                      <td className="py-2.5 font-mono text-slate-700 dark:text-slate-300">{acc.account_code}</td>
                      <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">
                        {isAr && acc.account_name_ar ? acc.account_name_ar : acc.account_name}
                      </td>
                      <td className="py-2.5 text-end font-mono font-bold text-rose-700">
                        {formatCurrency(Number(acc.amount), language)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Net Income Summary Card */}
          <div className="rounded-3xl border border-slate-900 bg-slate-900 p-6 text-white shadow-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase">
                {isAr ? 'النتيجة الختامية' : 'Summary Result'}
              </span>
              <h4 className="text-xl font-black mt-1">
                {isAr ? 'صافي الدخل التشغيلي للفترة' : 'Net Operating Income'}
              </h4>
            </div>
            <div className="text-end">
              <span className="text-3xl font-black font-mono text-emerald-400">
                {formatCurrency(Number(incomeStatement?.net_income || 0), language)}
              </span>
              <span className="block text-[11px] text-slate-400 mt-1">
                {isAr ? 'الإيرادات - المصروفات' : 'Total Revenue - Total Expenses'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* REPORT 3: BALANCE SHEET (FINANCIAL POSITION) VIEW                    */}
      {/* ==================================================================== */}
      {activeReport === 'balance-sheet' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي الأصول (Total Assets)' : 'Total Assets'}
              </span>
              <div className="mt-2 text-2xl font-black text-blue-900">
                {formatCurrency(Number(balanceSheet?.total_assets || 0), language)}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {balanceSheet?.asset_accounts.length || 0} {isAr ? 'بند أصول' : 'asset accounts'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي الخصوم (Total Liabilities)' : 'Total Liabilities'}
              </span>
              <div className="mt-2 text-2xl font-black text-amber-900">
                {formatCurrency(Number(balanceSheet?.total_liabilities || 0), language)}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {balanceSheet?.liability_accounts.length || 0} {isAr ? 'بند خصوم' : 'liability accounts'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'حقوق الملكية والأرباح (Equity & Earnings)' : 'Equity & Earnings'}
              </span>
              <div className="mt-2 text-2xl font-black text-purple-900">
                {formatCurrency(
                  Number(balanceSheet?.total_equity || 0) +
                    Number(balanceSheet?.current_period_net_income || 0),
                  language
                )}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {isAr ? 'متضمن أرباح الفترة النشطة' : 'Includes current period net income'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'توازن معادلة المحاسبة' : 'Accounting Equilibrium'}
              </span>
              <div className="mt-2 flex items-center gap-2">
                {balanceSheet?.is_balanced ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? 'الأصول = الخصوم + الملكية' : 'Assets = Liab + Equity'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                    <span>{isAr ? 'عدم توازن' : 'Out of Balance'}</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block mt-1">
                {isAr ? 'فارق التوازن: 0.00 ر.س' : 'Discrepancy: 0.00 SAR'}
              </span>
            </div>
          </div>

          {/* Two-Column Assets vs Liabilities/Equity Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left Column: Assets */}
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  {isAr ? 'الأصول والموجودات (Assets)' : 'Assets'}
                </h3>
                <span className="font-mono text-sm font-black text-blue-900">
                  {formatCurrency(Number(balanceSheet?.total_assets || 0), language)}
                </span>
              </div>

              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                    <th className="py-2 text-start font-bold">{isAr ? 'رمز الحساب' : 'Code'}</th>
                    <th className="py-2 text-start font-bold">{isAr ? 'اسم الأصل' : 'Asset Name'}</th>
                    <th className="py-2 text-end font-bold">{isAr ? 'الرصيد' : 'Balance (SAR)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {isLoading ? (
                    <TableSkeletonRows rows={4} cols={3} />
                  ) : (
                    balanceSheet?.asset_accounts.map((acc) => (
                      <tr key={acc.account_code}>
                        <td className="py-2.5 font-mono text-slate-700 dark:text-slate-300">{acc.account_code}</td>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-slate-100">
                          {isAr && acc.account_name_ar ? acc.account_name_ar : acc.account_name}
                        </td>
                        <td className="py-2.5 text-end font-mono font-bold text-blue-900">
                          {formatCurrency(Number(acc.amount), language)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 dark:border-slate-200 font-black text-slate-900 dark:text-slate-100">
                    <td colSpan={2} className="py-3 text-start uppercase">
                      {isAr ? 'إجمالي الأصول' : 'Total Assets'}
                    </td>
                    <td className="py-3 text-end font-mono text-sm text-blue-900">
                      {formatCurrency(Number(balanceSheet?.total_assets || 0), language)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Right Column: Liabilities & Equity */}
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  {isAr ? 'الالتزامات وحقوق الملكية (Liabilities & Equity)' : 'Liabilities & Equity'}
                </h3>
                <span className="font-mono text-sm font-black text-slate-900">
                  {formatCurrency(Number(balanceSheet?.total_liabilities_and_equity || 0), language)}
                </span>
              </div>

              {/* Liabilities Subsection */}
              <div>
                <span className="text-xs font-black text-amber-900 dark:text-amber-300 uppercase block mb-2">
                  {isAr ? 'الخصوم والالتزامات (Liabilities)' : 'Liabilities'}
                </span>
                <table className="w-full text-start text-xs mb-4">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {isLoading ? (
                      <TableSkeletonRows rows={3} cols={3} />
                    ) : (
                      balanceSheet?.liability_accounts.map((acc) => (
                        <tr key={acc.account_code}>
                          <td className="py-2 font-mono text-slate-700 w-24">{acc.account_code}</td>
                          <td className="py-2 font-bold text-slate-900 dark:text-slate-100">
                            {isAr && acc.account_name_ar ? acc.account_name_ar : acc.account_name}
                          </td>
                          <td className="py-2 text-end font-mono font-bold text-amber-900">
                            {formatCurrency(Number(acc.amount), language)}
                          </td>
                        </tr>
                      ))
                    )}
                    <tr className="border-t border-slate-200 dark:border-slate-800 font-black">
                      <td colSpan={2} className="py-2 text-slate-600">
                        {isAr ? 'مجموع الخصوم' : 'Total Liabilities'}
                      </td>
                      <td className="py-2 text-end font-mono text-amber-900">
                        {formatCurrency(Number(balanceSheet?.total_liabilities || 0), language)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Equity Subsection */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <span className="text-xs font-black text-purple-900 dark:text-purple-300 uppercase block mb-2">
                  {isAr ? 'حقوق الملكية والأرباح (Equity & Retained Earnings)' : 'Equity & Retained Earnings'}
                </span>
                <table className="w-full text-start text-xs">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {isLoading ? (
                      <TableSkeletonRows rows={3} cols={3} />
                    ) : (
                      balanceSheet?.equity_accounts.map((acc) => (
                        <tr key={acc.account_code}>
                          <td className="py-2 font-mono text-slate-700 w-24">{acc.account_code}</td>
                          <td className="py-2 font-bold text-slate-900 dark:text-slate-100">
                            {isAr && acc.account_name_ar ? acc.account_name_ar : acc.account_name}
                          </td>
                          <td className="py-2 text-end font-mono font-bold text-purple-900">
                            {formatCurrency(Number(acc.amount), language)}
                          </td>
                        </tr>
                      ))
                    )}
                    {/* Current Period Net Income integration */}
                    <tr className="bg-purple-50/50 dark:bg-purple-950/20">
                      <td className="py-2 font-mono text-purple-700 dark:text-purple-400 w-24">P&L-NET</td>
                      <td className="py-2 font-black text-purple-950 dark:text-purple-200">
                        {isAr ? 'أرباح / (خسائر) الفترة الحالية' : 'Current Period Net Income'}
                      </td>
                      <td className="py-2 text-end font-mono font-black text-purple-900">
                        {formatCurrency(Number(balanceSheet?.current_period_net_income || 0), language)}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200 dark:border-slate-800 font-black">
                      <td colSpan={2} className="py-2 text-slate-600">
                        {isAr ? 'مجموع حقوق الملكية' : 'Total Equity'}
                      </td>
                      <td className="py-2 text-end font-mono text-purple-900">
                        {formatCurrency(
                          Number(balanceSheet?.total_equity || 0) +
                            Number(balanceSheet?.current_period_net_income || 0),
                          language
                        )}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-900 dark:border-slate-200 font-black text-slate-900 dark:text-slate-100">
                      <td colSpan={2} className="py-3 text-start uppercase">
                        {isAr ? 'مجموع الخصوم وحقوق الملكية' : 'Total Liabilities & Equity'}
                      </td>
                      <td className="py-3 text-end font-mono text-sm text-slate-900">
                        {formatCurrency(Number(balanceSheet?.total_liabilities_and_equity || 0), language)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* REPORT 4: FX EXPOSURE & REVALUATION VIEW                            */}
      {/* ==================================================================== */}
      {activeReport === 'fx-exposure' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {/* Card 1: Net Unrealized FX Gain / Loss */}
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {isAr ? 'صافي أرباح/(خسائر) الصرف غير المحققة' : 'Net Unrealized FX Gain/Loss'}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    (fxExposureReport?.summary?.net_unrealized_gain_loss_usd || 0) >= 0
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  }`}
                >
                  {(fxExposureReport?.summary?.net_unrealized_gain_loss_usd || 0) >= 0
                    ? isAr
                      ? 'ربح صرف'
                      : 'GAIN'
                    : isAr
                    ? 'خسارة صرف'
                    : 'LOSS'}
                </span>
              </div>
              <div
                className={`mt-2 text-2xl font-black ${
                  isLoading
                    ? 'text-slate-300'
                    : (fxExposureReport?.summary?.net_unrealized_gain_loss_usd || 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {isLoading ? (
                  <div className="h-7 w-28 bg-slate-200 rounded animate-pulse my-0.5" />
                ) : (
                  formatCurrency(fxExposureReport?.summary?.net_unrealized_gain_loss_usd || 0, language, 'USD')
                )}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block mt-1">
                {isAr ? 'صافي فارق تقييم فواتير الذمم المدينة والدائنة' : 'Net variance between AR & AP revaluations'}
              </span>
            </div>

            {/* Card 2: Open AR Exposure */}
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي الذمم المدينة المكشوفة (AR)' : 'Open AR Exposure (Receivables)'}
              </span>
              <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                {isLoading ? (
                  <div className="h-7 w-28 bg-slate-200 rounded animate-pulse my-0.5" />
                ) : (
                  formatCurrency(fxExposureReport?.summary?.total_open_ar_usd || 0, language, 'USD')
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                <span>
                  {fxExposureReport?.summary?.ar_count || 0} {isAr ? 'فاتورة عميل مفتوحة' : 'open invoices'}
                </span>
                <span
                  className={
                    (fxExposureReport?.summary?.total_ar_gain_loss_usd || 0) >= 0
                      ? 'text-emerald-600 font-bold'
                      : 'text-rose-600 font-bold'
                  }
                >
                  FX: {formatCurrency(fxExposureReport?.summary?.total_ar_gain_loss_usd || 0, language, 'USD')}
                </span>
              </div>
            </div>

            {/* Card 3: Open AP Exposure */}
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي الذمم الدائنة المكشوفة (AP)' : 'Open AP Exposure (Payables)'}
              </span>
              <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                {isLoading ? (
                  <div className="h-7 w-28 bg-slate-200 rounded animate-pulse my-0.5" />
                ) : (
                  formatCurrency(fxExposureReport?.summary?.total_open_ap_usd || 0, language, 'USD')
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                <span>
                  {fxExposureReport?.summary?.ap_count || 0} {isAr ? 'فاتورة مورد مفتوحة' : 'open vendor bills'}
                </span>
                <span
                  className={
                    (fxExposureReport?.summary?.total_ap_gain_loss_usd || 0) >= 0
                      ? 'text-emerald-600 font-bold'
                      : 'text-rose-600 font-bold'
                  }
                >
                  FX: {formatCurrency(fxExposureReport?.summary?.total_ap_gain_loss_usd || 0, language, 'USD')}
                </span>
              </div>
            </div>

            {/* Card 4: Active Spot Rates & Sync Trigger */}
            <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {isAr ? 'أسعار الصرف اللحظية الفعالة' : 'Active Spot Exchange Rates'}
                </span>
                <div className="mt-1 flex items-center gap-2 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5">
                    USD/SAR: {fxExposureReport?.active_rates?.SAR || 3.75}
                  </span>
                  <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5">
                    USD/YER: {fxExposureReport?.active_rates?.YER || 535.0}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  id="sync-live-fx-btn"
                  onClick={handleTriggerFxSync}
                  disabled={isSyncingFx}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-3 py-1.5 text-xs font-black shadow-xs transition cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncingFx ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncingFx
                      ? isAr
                        ? 'جاري التحديث والتطهير...'
                        : 'Syncing & Purging...'
                      : isAr
                      ? 'مزامنة أسعار الصرف الحية'
                      : 'Sync Live FX Rates'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Sub-tabs & Search Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs no-print">
            {/* AR vs AP Sub-Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
              <button
                type="button"
                id="tab-fx-ar"
                onClick={() => setRevalSubTab('ar')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  revalSubTab === 'ar'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
                <span>{isAr ? 'فواتير العملاء والذمم المدينة (AR)' : 'Accounts Receivable (AR)'}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  revalSubTab === 'ar' ? 'bg-purple-800 text-purple-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  {fxExposureReport?.ar_revaluation?.length || 0}
                </span>
              </button>
              <button
                type="button"
                id="tab-fx-ap"
                onClick={() => setRevalSubTab('ap')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  revalSubTab === 'ap'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ArrowDownRight className="h-4 w-4" />
                <span>{isAr ? 'فواتير الموردين والذمم الدائنة (AP)' : 'Accounts Payable (AP)'}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  revalSubTab === 'ap' ? 'bg-purple-800 text-purple-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  {fxExposureReport?.ap_revaluation?.length || 0}
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                id="fx-exposure-search"
                name="fx_search"
                type="text"
                placeholder={isAr ? 'بحث برقم الفاتورة أو الطرف أو العملة...' : 'Search by invoice #, partner, currency...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-purple-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Revaluation Table */}
          <div className="overflow-x-auto rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <div className="bg-slate-50/80 dark:bg-slate-800/50 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {revalSubTab === 'ar'
                  ? isAr
                    ? 'إعادة تقييم الذمم المدينة (ارتفاع العملة الأجنبية يولد ربح صرف غير محقق)'
                    : 'AR Revaluation: Appreciation of foreign currency against USD produces unrealized gain'
                  : isAr
                  ? 'إعادة تقييم الذمم الدائنة (انخفاض العملة الأجنبية يولد ربح صرف غير محقق)'
                  : 'AP Revaluation: Depreciation of foreign currency against USD produces unrealized gain'}
              </span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {isAr ? 'تاريخ التقييم:' : 'As of:'} {fxExposureReport?.as_of_date || new Date().toISOString().slice(0, 10)}
              </span>
            </div>
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                  <th className="py-3 px-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                  <th className="py-3 px-3 text-start">{revalSubTab === 'ar' ? (isAr ? 'العميل' : 'Customer') : (isAr ? 'المورد' : 'Vendor')}</th>
                  <th className="py-3 px-2 text-start">{isAr ? 'التاريخ' : 'Issue Date'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'الرصيد المستحق (العملة)' : 'Outstanding (Native)'}</th>
                  <th className="py-3 px-2 text-end font-mono">{isAr ? 'سعر الحجز' : 'Booking Rate'}</th>
                  <th className="py-3 px-2 text-end font-mono">{isAr ? 'السعر الحالي' : 'Spot Rate'}</th>
                  <th className="py-3 px-3 text-end font-mono">{isAr ? 'القيمة الأصلية (USD)' : 'Original USD'}</th>
                  <th className="py-3 px-3 text-end font-mono">{isAr ? 'القيمة المعاد تقييمها (USD)' : 'Revalued USD'}</th>
                  <th className="py-3 px-3 text-end font-mono">{isAr ? 'الفارق غير المحقق (USD)' : 'Unrealized Gain/Loss'}</th>
                  <th className="py-3 px-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {isLoading ? (
                  <TableSkeletonRows rows={5} cols={10} />
                ) : filteredFxItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400 dark:text-slate-500">
                      {isAr
                        ? 'لا توجد فواتير مكشوفة أو مطابقة لشروط البحث حالياً'
                        : 'No open exposed invoices found matching the criteria.'}
                    </td>
                  </tr>
                ) : (
                  filteredFxItems.map((item) => (
                    <tr key={`${revalSubTab}-${item.invoice_number}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {item.invoice_number}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                        {item.partner_name}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-[11px] text-slate-500">
                        {item.issue_date}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(item.outstanding_amount, language, item.currency)}
                      </td>
                      <td className="py-2.5 px-2 text-end font-mono text-slate-600 dark:text-slate-400">
                        {Number(item.original_rate_to_usd).toFixed(4)}
                      </td>
                      <td className="py-2.5 px-2 text-end font-mono text-purple-700 dark:text-purple-400 font-semibold">
                        {Number(item.current_rate_to_usd).toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono text-slate-600 dark:text-slate-400">
                        {formatCurrency(item.original_usd, language, 'USD')}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(item.current_usd, language, 'USD')}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono font-black">
                        <span
                          className={
                            item.unrealized_gain_loss_usd > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : item.unrealized_gain_loss_usd < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-500'
                          }
                        >
                          {item.unrealized_gain_loss_usd > 0 ? '+' : ''}
                          {formatCurrency(item.unrealized_gain_loss_usd, language, 'USD')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            item.revaluation_status === 'GAIN'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : item.revaluation_status === 'LOSS'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {item.revaluation_status === 'GAIN' ? (
                            <>
                              <ArrowUpRight className="h-3 w-3" />
                              <span>{isAr ? 'ربح' : 'GAIN'}</span>
                            </>
                          ) : item.revaluation_status === 'LOSS' ? (
                            <>
                              <ArrowDownRight className="h-3 w-3" />
                              <span>{isAr ? 'خسارة' : 'LOSS'}</span>
                            </>
                          ) : (
                            <span>{isAr ? 'حيادي' : 'NEUTRAL'}</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 dark:border-slate-100 bg-slate-100/80 dark:bg-slate-800 font-black text-slate-900 dark:text-slate-100">
                  <td colSpan={6} className="py-3.5 px-3 text-start uppercase">
                    {revalSubTab === 'ar'
                      ? isAr
                        ? 'إجمالي تقييم الذمم المدينة (AR Total)'
                        : 'Total AR Revaluation'
                      : isAr
                      ? 'إجمالي تقييم الذمم الدائنة (AP Total)'
                      : 'Total AP Revaluation'}
                  </td>
                  <td className="py-3.5 px-3 text-end font-mono">
                    {formatCurrency(
                      filteredFxItems.reduce((acc, curr) => acc + curr.original_usd, 0),
                      language,
                      'USD'
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-end font-mono">
                    {formatCurrency(
                      filteredFxItems.reduce((acc, curr) => acc + curr.current_usd, 0),
                      language,
                      'USD'
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-end font-mono text-sm font-black">
                    {(() => {
                      const totalDiff = filteredFxItems.reduce(
                        (acc, curr) => acc + curr.unrealized_gain_loss_usd,
                        0
                      );
                      return (
                        <span className={totalDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {totalDiff >= 0 ? '+' : ''}
                          {formatCurrency(totalDiff, language, 'USD')}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {filteredFxItems.length} {isAr ? 'بند' : 'items'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      <BulkImportModal isOpen={isBulkImportOpen} onClose={() => setIsBulkImportOpen(false)} defaultCategory="operations" />
    </div>
  );
};
