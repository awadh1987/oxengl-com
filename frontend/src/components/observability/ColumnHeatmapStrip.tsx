import React from 'react';

export interface ColumnHeatmapItem {
  name: string;
  null_rate_pct: number;
  inferred_type: string;
}

interface ColumnHeatmapStripProps {
  columns: ColumnHeatmapItem[];
  className?: string;
}

function nullRateToHsl(rate: number): string {
  // Smooth interpolation: 0% = green (hue 140), 100% = red (hue 0)
  const hue = Math.round(140 * (1 - rate / 100));
  return `hsl(${hue}, 65%, 50%)`;
}

/**
 * Visual heatmap strip showing all column null rates as coloured cells.
 * Each cell maps to a column; colour intensity reflects null rate.
 * Hover reveals the exact column name, type, and null percentage.
 */
export const ColumnHeatmapStrip: React.FC<ColumnHeatmapStripProps> = ({
  columns,
  className = '',
}) => {
  if (columns.length === 0) return null;

  // Sort: worst first for visual impact
  const sorted = [...columns].sort((a, b) => b.null_rate_pct - a.null_rate_pct);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Column Health Strip
        </h4>
        <span className="text-[10px] text-zinc-500">{columns.length} columns</span>
      </div>

      {/* Heatmap cells */}
      <div className="flex flex-wrap gap-1">
        {sorted.map((col) => (
          <div
            key={col.name}
            className="group relative"
          >
            <div
              className="w-6 h-6 rounded-[4px] cursor-pointer transition-all duration-200 hover:scale-125 hover:ring-2 hover:ring-white/30 hover:z-10"
              style={{ backgroundColor: nullRateToHsl(col.null_rate_pct) }}
              title={`${col.name}: ${col.null_rate_pct}% null`}
            />
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-lg">
              <div className="font-mono font-bold text-zinc-100">{col.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="font-mono font-bold"
                  style={{ color: nullRateToHsl(col.null_rate_pct) }}
                >
                  {col.null_rate_pct}% null
                </span>
                <span className="text-zinc-500">{col.inferred_type}</span>
              </div>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-900 border-r border-b border-zinc-700 rotate-45 -mt-1" />
            </div>
          </div>
        ))}
      </div>

      {/* Gradient legend */}
      <div className="flex items-center gap-2 mt-2.5 text-[10px] text-zinc-500">
        <span>0% null</span>
        <div className="flex-1 h-2 rounded-full" style={{
          background: 'linear-gradient(to right, hsl(140,65%,50%), hsl(70,65%,50%), hsl(40,65%,50%), hsl(0,65%,50%))',
        }} />
        <span>100% null</span>
      </div>
    </div>
  );
};
