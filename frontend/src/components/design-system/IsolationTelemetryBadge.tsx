import React from 'react';
import { ShieldCheck, Cpu, CheckCircle2, Lock, Activity } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface IsolationTelemetryBadgeProps {
  variant?: 'compact' | 'full' | 'banner' | 'pill';
  className?: string;
}

export const IsolationTelemetryBadge: React.FC<IsolationTelemetryBadgeProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { isolationTelemetry, currentCompany, themeMode } = useApp();
  const isDark = themeMode === 'dark';

  if (variant === 'pill') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 ${
          isDark
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-emerald-300 bg-emerald-50 text-emerald-700'
        } ${className}`}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shrink-0" />
        <ShieldCheck className="h-3 w-3 shrink-0" />
        <span dir="ltr" className="inline-block unicode-bidi-isolate">Schema RLS L3</span>
      </span>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        className={`relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-xs ${
          isDark
            ? 'border-indigo-500/20 bg-gradient-to-r from-[#0b1022] via-[#0e172e] to-[#0b1022] text-slate-300'
            : 'border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 text-slate-700'
        } ${className}`}
      >
        {/* Glow corner */}
        <div className="pointer-events-none absolute -left-10 -top-10 h-24 w-24 rounded-full bg-indigo-500/10 blur-xl" />

        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-[11px] font-black tracking-tight text-white whitespace-nowrap">
              {currentCompany?.name || 'TENANT ISOLATION HUD'}
            </span>
          </div>

          <div className="hidden sm:block h-3.5 w-px bg-slate-700/50" />

          <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span className="text-slate-400">Security Barrier:</span>
            <b dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-blue-300">{isolationTelemetry.schemaIsolationTier}</b>
          </div>

          <div className="hidden items-center gap-1.5 text-[11px] sm:flex whitespace-nowrap">
            <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-400">ZATCA Stage-2:</span>
            <b dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-amber-300">Cryptographic Active</b>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap">
            <Cpu className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-400">Cloud Latency:</span>
            <b dir="ltr" className="inline-block unicode-bidi-isolate font-black text-emerald-400">{isolationTelemetry.cloudLatencyMs} ms</b>
          </div>

          <span dir="ltr" className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-300 unicode-bidi-isolate whitespace-nowrap shrink-0">
            <Lock className="h-2.5 w-2.5 shrink-0" />
            BOUNDARY LOCKED
          </span>
        </div>
      </div>
    );
  }

  // Full / Bento Telemetry Card
  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${className}`}
    >
      <div
        className={`rounded-xl border p-3 ${
          isDark
            ? 'border-indigo-500/20 bg-slate-900/60 text-slate-200'
            : 'border-slate-200 bg-white text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="h-4 w-4 text-blue-400" />
          <span>Data Isolation</span>
        </div>
        <p dir="ltr" className="inline-block unicode-bidi-isolate mt-1 font-mono text-base font-black text-blue-400">
          {isolationTelemetry.schemaIsolationTier}
        </p>
        <span dir="ltr" className="inline-block unicode-bidi-isolate text-[10px] text-slate-400">
          {isolationTelemetry.isolatedTablesCount} Tables Strict RLS
        </span>
      </div>

      <div
        className={`rounded-xl border p-3 ${
          isDark
            ? 'border-emerald-500/20 bg-slate-900/60 text-slate-200'
            : 'border-slate-200 bg-white text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Cpu className="h-4 w-4 text-emerald-400" />
          <span>Cloud Latency</span>
        </div>
        <p dir="ltr" className="inline-block unicode-bidi-isolate mt-1 font-mono text-base font-black text-emerald-400">
          {isolationTelemetry.cloudLatencyMs} ms
        </p>
        <span dir="ltr" className="inline-block unicode-bidi-isolate text-[10px] text-emerald-400/80">KSA-Riyadh Fast Edge</span>
      </div>

      <div
        className={`rounded-xl border p-3 ${
          isDark
            ? 'border-amber-500/20 bg-slate-900/60 text-slate-200'
            : 'border-slate-200 bg-white text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <CheckCircle2 className="h-4 w-4 text-amber-400" />
          <span>ZATCA Compliance</span>
        </div>
        <p dir="ltr" className="inline-block unicode-bidi-isolate mt-1 font-mono text-base font-black text-amber-400">Stage-2 Ready</p>
        <span dir="ltr" className="inline-block unicode-bidi-isolate text-[10px] text-slate-400">Cryptographic E-Invoice</span>
      </div>

      <div
        className={`rounded-xl border p-3 ${
          isDark
            ? 'border-purple-500/20 bg-slate-900/60 text-slate-200'
            : 'border-slate-200 bg-white text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Activity className="h-4 w-4 text-purple-400" />
          <span>Isolation Score</span>
        </div>
        <p dir="ltr" className="inline-block unicode-bidi-isolate mt-1 font-mono text-base font-black text-purple-400">
          {isolationTelemetry.isolationScorePercent}%
        </p>
        <span dir="ltr" className="inline-block unicode-bidi-isolate text-[10px] text-purple-400/80">Boundary Verified</span>
      </div>
    </div>
  );
};
