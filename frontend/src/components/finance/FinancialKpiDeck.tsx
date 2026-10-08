import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldCheck,
  Scale,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface FinancialKpiData {
  totalRevenueSar: number;
  revenueGrowthPct: number;
  zatcaClearanceRatePct: number;
  zatcaClearanceTrendPct: number;
  glBalanceVarianceSar: number;
  unbalancedJournalsCount: number;
  workingCapitalRatio: number;
  dsoDays: number;
  dpoDays: number;
}

interface FinancialKpiDeckProps {
  data: FinancialKpiData;
  isLoading?: boolean;
}

export const FinancialKpiDeck: React.FC<FinancialKpiDeckProps> = ({ data, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-pulse bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3" />
              <div className="h-8 w-8 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            </div>
            <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-2/3 mb-2" />
            <div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  const kpis = [
    {
      id: 'revenue',
      title: 'Total Revenue & Billing',
      titleAr: 'إجمالي الإيرادات والفواتير',
      value: formatCurrency(data.totalRevenueSar, 'en'),
      trendPct: data.revenueGrowthPct,
      trendPositive: data.revenueGrowthPct >= 0,
      trendLabel: 'vs last quarter',
      sublabel: 'ZATCA Phase-2 Tax Invoices Included',
      icon: DollarSign,
      iconColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200/50 dark:border-blue-800/40',
    },
    {
      id: 'zatca',
      title: 'ZATCA Clearance Rate',
      titleAr: 'نسبة اعتماد الفواتير بهيئة الزكاة',
      value: `${data.zatcaClearanceRatePct.toFixed(1)}%`,
      trendPct: data.zatcaClearanceTrendPct,
      trendPositive: data.zatcaClearanceTrendPct >= 0,
      trendLabel: 'p.p. vs target',
      sublabel: 'Cryptographic XML Stamp Validated',
      icon: ShieldCheck,
      iconColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/50 dark:border-emerald-800/40',
    },
    {
      id: 'gl_integrity',
      title: 'General Ledger Balancing',
      titleAr: 'توازن دفتر الأستاذ العام',
      value: data.glBalanceVarianceSar === 0 ? '0.00 SAR' : `${data.glBalanceVarianceSar.toFixed(2)} SAR`,
      trendPct: 0.0,
      trendPositive: data.glBalanceVarianceSar === 0,
      trendLabel: data.glBalanceVarianceSar === 0 ? 'Balanced' : 'Variance Detected',
      sublabel: `${data.unbalancedJournalsCount} Unbalanced Entries`,
      icon: Scale,
      iconColor: data.glBalanceVarianceSar === 0
        ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 border-teal-200/50 dark:border-teal-800/40'
        : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200/50 dark:border-rose-800/40',
    },
    {
      id: 'working_capital',
      title: 'Working Capital & DSO',
      titleAr: 'رأس المال العامل وسرعة التحصيل',
      value: `${data.workingCapitalRatio.toFixed(2)}x`,
      trendPct: 4.2,
      trendPositive: true,
      trendLabel: `DSO: ${data.dsoDays}d | DPO: ${data.dpoDays}d`,
      sublabel: 'Cash Conversion Velocity',
      icon: Activity,
      iconColor: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/50 dark:border-indigo-800/40',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.id}
            className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-tight">
                {kpi.title}
              </span>
              <div className={`p-2 rounded-lg border ${kpi.iconColor}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="my-1">
              <div className="text-2xl font-bold font-mono text-zinc-950 dark:text-zinc-50 tracking-tight">
                {kpi.value}
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/70 text-xs">
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                  kpi.trendPositive
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400'
                }`}
              >
                {kpi.trendPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                <span>
                  {kpi.trendPct > 0 ? `+${kpi.trendPct}%` : kpi.trendPct < 0 ? `${kpi.trendPct}%` : kpi.trendLabel}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]">
                {kpi.sublabel}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
