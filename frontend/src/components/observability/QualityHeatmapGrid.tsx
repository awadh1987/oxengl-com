import React, { useMemo } from 'react';
import { Info } from 'lucide-react';

export interface HeatmapRow {
  domain: string;
  domain_label: string;
  quality_score: number;
  completeness: number;
  null_rate_inv: number;
  flag_density: number;
  coverage: number;
}

interface QualityHeatmapGridProps {
  rows: HeatmapRow[];
  className?: string;
}

const METRICS = [
  { key: 'quality_score', label: 'Quality Score' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'null_rate_inv', label: 'Null Health' },
  { key: 'flag_density', label: 'Flag Density' },
  { key: 'coverage', label: 'Coverage' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

/**
 * Returns a Tailwind-friendly HSL-ish colour for a 0-100 value.
 * Uses smooth interpolation across rose → amber → emerald.
 */
function scoreToColor(value: number): { bg: string; text: string } {
  if (value >= 80) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
  if (value >= 60) return { bg: 'bg-emerald-500/10', text: 'text-emerald-500/70' };
  if (value >= 40) return { bg: 'bg-amber-500/15', text: 'text-amber-400' };
  if (value >= 20) return { bg: 'bg-rose-500/10', text: 'text-rose-400/70' };
  return { bg: 'bg-rose-500/20', text: 'text-rose-400' };
}

/**
 * Domain × Metric quality heatmap.
 * Each cell is colour-coded by its normalised 0-100 score.
 */
export const QualityHeatmapGrid: React.FC<QualityHeatmapGridProps> = ({ rows, className = '' }) => {
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.quality_score - a.quality_score),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        No heatmap data available. Run a quality scan first.
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left px-3 py-2.5 font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[11px] whitespace-nowrap">
              Domain
            </th>
            {METRICS.map((m) => (
              <th
                key={m.key}
                className="px-3 py-2.5 text-center font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[11px] whitespace-nowrap"
              >
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {sortedRows.map((row) => (
            <tr key={row.domain} className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
              <td className="px-3 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                    backgroundColor: row.quality_score >= 80 ? '#10b981' : row.quality_score >= 50 ? '#f59e0b' : '#ef4444',
                  }} />
                  {row.domain_label}
                </div>
              </td>
              {METRICS.map((m) => {
                const val = row[m.key as MetricKey];
                const { bg, text } = scoreToColor(val);
                return (
                  <td key={m.key} className="px-2 py-2">
                    <div
                      className={`relative mx-auto w-full max-w-[72px] rounded-lg px-2 py-1.5 text-center font-mono font-bold transition-all duration-200 group-hover:scale-105 ${bg} ${text}`}
                      title={`${m.label}: ${val}%`}
                    >
                      {val}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-3 text-[10px] text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-1.5">
          <Info className="w-3 h-3" />
          <span>Scale: 0-100 (higher = healthier)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-2.5 rounded-sm bg-rose-500/20" /> &lt;40
          <span className="inline-block w-3 h-2.5 rounded-sm bg-amber-500/15" /> 40-79
          <span className="inline-block w-3 h-2.5 rounded-sm bg-emerald-500/20" /> ≥80
        </div>
      </div>
    </div>
  );
};
