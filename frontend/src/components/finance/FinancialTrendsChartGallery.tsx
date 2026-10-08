import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  Calendar,
  Layers,
  ShieldCheck,
  TrendingUp,
  Clock,
  Info,
  DollarSign,
  ArrowUpRight,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface AgingBucketItem {
  period: string;
  arAmount: number;
  apAmount: number;
  netWorkingCapital: number;
  dsoRate: number;
}

export interface ZatcaComplianceTrendItem {
  date: string;
  clearedCount: number;
  reportedCount: number;
  rejectedCount: number;
  avgLatencyMs: number;
  clearanceRatePct: number;
}

interface FinancialTrendsChartGalleryProps {
  agingData: AgingBucketItem[];
  zatcaTrends: ZatcaComplianceTrendItem[];
  timeframe: '7d' | '30d' | '90d' | '1y';
  onTimeframeChange: (tf: '7d' | '30d' | '90d' | '1y') => void;
}

const CustomDarkTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 dark:bg-[#0c0c0f]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 shadow-xl text-xs space-y-1.5 min-w-[200px] z-50">
        <div className="font-semibold text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-800/80 pb-1.5">
          {label}
        </div>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: entry.color }}
              />
              <span>{entry.name}:</span>
            </div>
            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
              {typeof entry.value === 'number'
                ? entry.value >= 1000
                  ? formatCurrency(entry.value, 'en')
                  : entry.unit
                  ? `${entry.value} ${entry.unit}`
                  : entry.value.toLocaleString()
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const FinancialTrendsChartGallery: React.FC<FinancialTrendsChartGalleryProps> = ({
  agingData,
  zatcaTrends,
  timeframe,
  onTimeframeChange,
}) => {
  const [agingMetric, setAgingMetric] = useState<'nominal' | 'net'>('nominal');
  const [zatcaViewMode, setZatcaViewMode] = useState<'volume' | 'latency'>('volume');

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Chart 1: AP / AR Aging & Working Capital Run Rate */}
      <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
                AP / AR Aging & Net Working Capital Run Rate
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                1-Chart Per Row Standard
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Accounts Receivable vs. Accounts Payable liquidity maturity curve across dynamic aging buckets
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {/* View Mode Pill */}
            <div className="bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg flex items-center gap-1 border border-zinc-200/80 dark:border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setAgingMetric('nominal')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  agingMetric === 'nominal'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                AR vs. AP
              </button>
              <button
                type="button"
                onClick={() => setAgingMetric('net')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  agingMetric === 'net'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Net Capital
              </button>
            </div>

            {/* Timeframe Selector */}
            <div className="bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg flex items-center gap-1 border border-zinc-200/80 dark:border-zinc-800 text-xs">
              {(['7d', '30d', '90d', '1y'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-2.5 py-1 rounded-md font-medium uppercase transition-all ${
                    timeframe === tf
                      ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {agingMetric === 'nominal' ? (
              <BarChart data={agingData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46', opacity: 0.3 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46', opacity: 0.3 }}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomDarkTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  iconType="circle"
                />
                <Bar
                  dataKey="arAmount"
                  name="Accounts Receivable (AR)"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
                <Bar
                  dataKey="apAmount"
                  name="Accounts Payable (AP)"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            ) : (
              <AreaChart data={agingData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="netWorkingCapitalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46', opacity: 0.3 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46', opacity: 0.3 }}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomDarkTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} iconType="circle" />
                <Area
                  type="monotone"
                  dataKey="netWorkingCapital"
                  name="Net Working Capital"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#netWorkingCapitalGrad)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: ZATCA Phase-2 Clearance Success & Cryptographic Verification Latency */}
      <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 md:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
                ZATCA Phase-2 Clearance Velocity & Cryptographic Stamp Latency
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">
                Compliance Stream
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Hourly and daily clearance rate verification, XML reporting status, and API round-trip latency
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg flex items-center gap-1 border border-zinc-200/80 dark:border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setZatcaViewMode('volume')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  zatcaViewMode === 'volume'
                    ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Clearance Volume
              </button>
              <button
                type="button"
                onClick={() => setZatcaViewMode('latency')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  zatcaViewMode === 'latency'
                    ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                Stamp Latency (ms)
              </button>
            </div>
          </div>
        </div>

        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {zatcaViewMode === 'volume' ? (
              <AreaChart data={zatcaTrends} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="clearedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="reportedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46', opacity: 0.3 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46', opacity: 0.3 }}
                />
                <Tooltip content={<CustomDarkTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} iconType="circle" />
                <Area
                  type="monotone"
                  dataKey="clearedCount"
                  name="Standard Invoices Cleared"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#clearedGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="reportedCount"
                  name="Simplified Invoices Reported"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#reportedGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="rejectedCount"
                  name="Rejected / Warning"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#ef4444' }}
                />
              </AreaChart>
            ) : (
              <LineChart data={zatcaTrends} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46', opacity: 0.3 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#3f3f46', opacity: 0.3 }}
                  unit="ms"
                />
                <Tooltip content={<CustomDarkTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} iconType="circle" />
                <Line
                  type="monotone"
                  dataKey="avgLatencyMs"
                  name="Avg Response Latency"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#06b6d4' }}
                  unit="ms"
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
