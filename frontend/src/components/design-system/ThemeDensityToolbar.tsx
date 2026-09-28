import React, { useState } from 'react';
import {
  Palette,
  Sun,
  Moon,
  Rows3,
  Rows4,
  Check,
  ChevronDown,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TENANT_PALETTES, TenantColorTheme } from '../../theme/designTokens';
import { HoverIcon } from '../common/HoverIcon';

export const ThemeDensityToolbar: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const {
    tenantTheme,
    setTenantTheme,
    densityMode,
    setDensityMode,
    themeMode,
    setThemeMode,
    isolationTelemetry,
  } = useApp();

  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);
  const isDark = themeMode === 'dark';
  const activePalette = TENANT_PALETTES[tenantTheme] || TENANT_PALETTES.orange;

  const paletteList = Object.values(TENANT_PALETTES);

  return (
    <div className="relative inline-flex items-center gap-1.5 sm:gap-2">
      {/* Telemetry pill (hidden on small mobile) */}
      <span
        className={`hidden items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold md:inline-flex ${
          isDark
            ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
            : 'border-emerald-300 bg-emerald-50 text-emerald-800'
        }`}
        title="Active Multi-Tenant Isolation Layer"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="font-mono">{isolationTelemetry.cloudLatencyMs}ms</span>
        <span className="opacity-50">|</span>
        <ShieldCheck className="h-3 w-3 text-emerald-400" />
        <span>RLS L3</span>
      </span>

      {/* Density Switcher Toggle */}
      <button
        type="button"
        onClick={() => setDensityMode(densityMode === 'comfortable' ? 'compact' : 'comfortable')}
        className={`group inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all ${
          isDark
            ? 'border-slate-800 bg-slate-900/90 text-slate-300 hover:border-slate-700 hover:text-white'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 shadow-xs'
        }`}
        title={`Current Density: ${densityMode === 'comfortable' ? 'Comfortable' : 'Compact'}. Click to toggle.`}
      >
        {densityMode === 'comfortable' ? (
          <>
            <HoverIcon className="h-3.5 w-3.5">
              <Rows3 className="h-full w-full text-indigo-400" />
            </HoverIcon>
            <span className="hidden sm:inline">Comfortable</span>
          </>
        ) : (
          <>
            <HoverIcon className="h-3.5 w-3.5">
              <Rows4 className="h-full w-full text-amber-400" />
            </HoverIcon>
            <span className="hidden sm:inline">Compact Grid</span>
          </>
        )}
      </button>

      {/* Dark / Light High-Contrast Mode Toggle */}
      <button
        type="button"
        onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
        className={`group inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
          isDark
            ? 'border-slate-800 bg-slate-900/90 text-amber-400 hover:border-slate-700 hover:text-amber-300'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 shadow-xs'
        }`}
        title={isDark ? 'Switch to Light Mode' : 'Switch to OxenGL Dark Enterprise Mode'}
      >
        <HoverIcon className="h-4 w-4">
          {isDark ? <Sun className="h-full w-full" /> : <Moon className="h-full w-full" />}
        </HoverIcon>
      </button>

      {/* Tenant Color Theme Switcher Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPaletteMenuOpen(!paletteMenuOpen)}
          style={{ borderColor: `${activePalette.primary}80` }}
          className={`group inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all ${
            isDark
              ? 'bg-slate-900/90 text-slate-200 hover:brightness-110'
              : 'bg-white text-slate-800 shadow-xs hover:border-slate-300'
          }`}
          title="Switch Tenant White-Labeling Theme"
        >
          <span
            className="h-3 w-3 rounded-full shadow-sm"
            style={{ backgroundColor: activePalette.primary }}
          />
          <span className="hidden lg:inline">{activePalette.nameEn}</span>
          <HoverIcon className="h-3.5 w-3.5 opacity-60">
            <ChevronDown className="h-full w-full" />
          </HoverIcon>
        </button>

        {paletteMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setPaletteMenuOpen(false)}
            />
            <div
              className={`absolute right-0 top-full z-50 mt-2 w-72 origin-top-right rounded-2xl border p-2 shadow-2xl backdrop-blur-xl ${
                isDark
                  ? 'border-slate-800 bg-slate-900/98 text-slate-200 shadow-black/80'
                  : 'border-slate-200 bg-white/95 text-slate-800 shadow-slate-400/20'
              }`}
            >
              <div className="border-b border-slate-700/40 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Palette className="h-4 w-4 text-orange-400" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    Tenant White-Labeling Themes
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Select brand accent palette for this workspace
                </p>
              </div>

              <div className="mt-1.5 max-h-72 space-y-1 overflow-y-auto pr-1">
                {paletteList.map((palette) => {
                  const isSelected = tenantTheme === palette.id;
                  return (
                    <button
                      key={palette.id}
                      type="button"
                      onClick={() => {
                        setTenantTheme(palette.id);
                        setPaletteMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                        isSelected
                          ? isDark
                            ? 'bg-slate-800/90 font-bold text-white'
                            : 'bg-slate-100 font-bold text-slate-900'
                          : isDark
                          ? 'hover:bg-slate-800/50 text-slate-300'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20 shadow-xs"
                          style={{ backgroundColor: palette.primary }}
                        />
                        <div className="truncate">
                          <p className="truncate text-xs font-bold">{palette.nameEn}</p>
                          <p className="truncate text-[10px] text-slate-400">{palette.nameAr}</p>
                        </div>
                      </div>
                      {isSelected && (
                        <Check
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: palette.primary }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
