import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
} from 'recharts';

export interface DomainRadarItem {
  domain: string;
  domain_label: string;
  quality_score: number;
  completeness: number;
  null_rate_inv: number;
  flag_density: number;
  coverage: number;
}

interface DomainRadarChartProps {
  data: DomainRadarItem[];
  /** Which domains to highlight (max 3 for readability). If empty, top 3 by score. */
  selectedDomains?: string[];
  className?: string;
}

const DOMAIN_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // rose
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

const AXES = [
  { key: 'quality_score', label: 'Quality' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'null_rate_inv', label: 'Null Health' },
  { key: 'flag_density', label: 'Flag Density' },
  { key: 'coverage', label: 'Coverage' },
] as const;

type AxisKey = (typeof AXES)[number]['key'];

const CustomRadarTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 dark:bg-[#0c0c0f]/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-xl text-xs space-y-1 min-w-[140px]">
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span>{p.name}</span>
          </div>
          <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Multi-domain radar chart for comparing ERP domains across 5 quality axes.
 * Renders up to 3 overlaid radar polygons for easy visual comparison.
 */
export const DomainRadarChart: React.FC<DomainRadarChartProps> = ({
  data,
  selectedDomains,
  className = '',
}) => {
  // Select which domains to render (max 3)
  const domainKeys = useMemo(() => {
    if (selectedDomains && selectedDomains.length > 0) {
      return selectedDomains.slice(0, 3);
    }
    // Default: top 3 by quality score
    return [...data]
      .sort((a, b) => b.quality_score - a.quality_score)
      .slice(0, 3)
      .map((d) => d.domain);
  }, [data, selectedDomains]);

  // Reshape data: one row per axis, with domain values as separate keys
  const radarData = useMemo(() => {
    return AXES.map((axis) => {
      const row: Record<string, any> = { axis: axis.label };
      domainKeys.forEach((dk) => {
        const domainRow = data.find((d) => d.domain === dk);
        row[dk] = domainRow ? domainRow[axis.key as AxisKey] : 0;
      });
      return row;
    });
  }, [data, domainKeys]);

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">No domain data available.</div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">
            Domain Comparison Radar
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Multi-axis quality comparison across ERP domains
          </p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="#27272a" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fontSize: 10, fill: '#71717a' }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#52525b' }}
              axisLine={false}
              tickCount={4}
            />
            <Tooltip content={<CustomRadarTooltip />} />
            {domainKeys.map((dk, i) => {
              const domainRow = data.find((d) => d.domain === dk);
              const label = domainRow?.domain_label || dk;
              const color = DOMAIN_COLORS[i % DOMAIN_COLORS.length];
              return (
                <Radar
                  key={dk}
                  name={label}
                  dataKey={dk}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.12}
                  strokeWidth={2}
                  dot={{ r: 3, fill: color, strokeWidth: 0 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              );
            })}
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs">
        {domainKeys.map((dk, i) => {
          const domainRow = data.find((d) => d.domain === dk);
          return (
            <div key={dk} className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }}
              />
              <span className="font-medium">{domainRow?.domain_label || dk}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
