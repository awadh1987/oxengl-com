import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';

export interface ColumnMetricForChart {
  name: string;
  null_rate_pct: number;
  null_count: number;
  distinct_count: number;
  inferred_type: string;
}

interface ColumnDistributionChartProps {
  columns: ColumnMetricForChart[];
  totalRows: number;
  className?: string;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ColumnMetricForChart;
  return (
    <div className="bg-white/95 dark:bg-[#0c0c0f]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-xl text-xs space-y-1.5 min-w-[180px] z-50">
      <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-800/80 pb-1.5">
        {d.name}
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500">Null Rate</span>
        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{d.null_rate_pct}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500">Null Count</span>
        <span className="font-mono text-zinc-400">{d.null_count.toLocaleString()}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500">Distinct</span>
        <span className="font-mono text-zinc-400">{d.distinct_count.toLocaleString()}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500">Type</span>
        <span className="font-mono text-blue-400">{d.inferred_type}</span>
      </div>
    </div>
  );
};

function getNullColor(rate: number): string {
  if (rate > 80) return '#ef4444';  // rose
  if (rate > 50) return '#f97316';  // orange
  if (rate > 30) return '#f59e0b';  // amber
  if (rate > 10) return '#eab308';  // yellow
  if (rate > 0)  return '#84cc16';  // lime
  return '#10b981';                  // emerald
}

/**
 * Horizontal bar chart showing null rates for each column in a selected table.
 * Sorted by severity (highest null rate first). Colour-coded by threshold.
 */
export const ColumnDistributionChart: React.FC<ColumnDistributionChartProps> = ({
  columns,
  totalRows,
  className = '',
}) => {
  // Sort by null rate descending, cap at 20 columns
  const chartData = [...columns]
    .sort((a, b) => b.null_rate_pct - a.null_rate_pct)
    .slice(0, 20);

  if (chartData.length === 0) {
    return <div className="py-4 text-center text-xs text-zinc-500">No column data.</div>;
  }

  const barHeight = 22;
  const chartHeight = Math.max(140, chartData.length * barHeight + 40);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Column Null Rate Distribution
        </h4>
        <span className="text-[10px] font-mono text-zinc-400">
          {totalRows.toLocaleString()} rows
        </span>
      </div>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              unit="%"
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 9, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar
              dataKey="null_rate_pct"
              name="Null Rate"
              radius={[0, 3, 3, 0]}
              barSize={14}
              animationDuration={600}
            >
              {chartData.map((col, idx) => (
                <Cell key={`col-${idx}`} fill={getNullColor(col.null_rate_pct)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
