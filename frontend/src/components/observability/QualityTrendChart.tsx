import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface TrendPoint {
  scan_index: number;
  timestamp: string;
  quality_score: number;
  tables_scanned: number;
  critical_flags: number;
  warning_flags: number;
}

interface QualityTrendChartProps {
  data: TrendPoint[];
  className?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TrendPoint;
  return (
    <div className="bg-white/95 dark:bg-[#0c0c0f]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 shadow-xl text-xs space-y-1.5 min-w-[180px] z-50">
      <div className="font-semibold text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-800/80 pb-1.5">
        {d.timestamp}
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500">Quality Score</span>
        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{d.quality_score}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500">Tables Scanned</span>
        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{d.tables_scanned}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500">Critical Flags</span>
        <span className="font-mono font-bold text-rose-400">{d.critical_flags}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500">Warning Flags</span>
        <span className="font-mono font-bold text-amber-400">{d.warning_flags}</span>
      </div>
    </div>
  );
};

/**
 * Area chart visualising quality score trajectory across scan snapshots.
 * Gradient fill shifts based on score range, with a 90% target reference line.
 */
export const QualityTrendChart: React.FC<QualityTrendChartProps> = ({ data, className = '' }) => {
  if (!data.length) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">No trend data available.</div>
    );
  }

  // Calculate delta between first and last points
  const first = data[0].quality_score;
  const last = data[data.length - 1].quality_score;
  const delta = last - first;
  const trendIcon = delta > 0.5 ? <TrendingUp className="w-3.5 h-3.5" /> : delta < -0.5 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />;
  const trendColor = delta > 0.5 ? 'text-emerald-400' : delta < -0.5 ? 'text-rose-400' : 'text-zinc-400';
  const trendText = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);

  return (
    <div className={`${className}`}>
      {/* Header with trend badge */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
            Quality Score Trend
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Score trajectory across the last {data.length} profiling scans
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
          delta > 0.5 ? 'bg-emerald-500/10 text-emerald-400' : delta < -0.5 ? 'bg-rose-500/10 text-rose-400' : 'bg-zinc-500/10 text-zinc-400'
        }`}>
          {trendIcon}
          <span className="font-mono">{trendText}%</span>
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="timestamp"
              stroke="#71717a"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#71717a"
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={90}
              stroke="#10b981"
              strokeDasharray="6 4"
              strokeOpacity={0.4}
              label={{ value: 'Target: 90%', position: 'insideTopRight', fontSize: 10, fill: '#10b981' }}
            />
            <Area
              type="monotone"
              dataKey="quality_score"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#qualityGradient)"
              dot={{ r: 3.5, fill: '#3b82f6', strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2, fill: '#0c0c0f' }}
              animationDuration={1200}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
