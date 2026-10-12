// ============================================================================
// OxenGL Enterprise Multi-Tenant SaaS ERP Design System Tokens
// ============================================================================

export type TenantColorTheme =
  | 'gray'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'violet'
  | 'blue'
  | 'green'
  | 'cyan'
  | 'system';

export type DensityMode = 'comfortable' | 'compact';
export type ThemeMode = 'dark' | 'light';

export interface TenantThemePalette {
  id: TenantColorTheme;
  nameEn: string;
  nameAr: string;
  description: string;
  primary: string;       // main brand accent
  primaryHover: string;
  primaryLight: string;  // light mode tint
  secondary: string;     // complementary accent
  glow: string;          // neon box-shadow glow
  surfaceAccent: string; // card header/badge tint
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
}

export const TENANT_PALETTES: Record<TenantColorTheme, TenantThemePalette> = {
  orange: {
    id: 'orange',
    nameEn: 'OxenGL Orange',
    nameAr: 'برتقالي أوكسن الصناعي',
    description: 'Signature Industrial Fleet & Heavy Logistics Flame',
    primary: '#f97316',
    primaryHover: '#ea580c',
    primaryLight: '#fff7ed',
    secondary: '#f59e0b',
    glow: 'rgba(249, 115, 22, 0.45)',
    surfaceAccent: 'rgba(249, 115, 22, 0.12)',
    badgeBg: 'rgba(249, 115, 22, 0.15)',
    badgeBorder: 'rgba(249, 115, 22, 0.35)',
    badgeText: '#fb923c',
  },
  yellow: {
    id: 'yellow',
    nameEn: 'Solar Gold',
    nameAr: 'ذهبي الطاقة والمحاجر',
    description: 'Luminous Solar Amber & Quarry Mining Gold',
    primary: '#eab308',
    primaryHover: '#ca8a04',
    primaryLight: '#fefce8',
    secondary: '#f59e0b',
    glow: 'rgba(234, 179, 8, 0.4)',
    surfaceAccent: 'rgba(234, 179, 8, 0.12)',
    badgeBg: 'rgba(234, 179, 8, 0.15)',
    badgeBorder: 'rgba(234, 179, 8, 0.35)',
    badgeText: '#fde047',
  },
  blue: {
    id: 'blue',
    nameEn: 'Cobalt Cloud',
    nameAr: 'أزرق سحابي مؤسسي',
    description: 'Deep Cobalt & Enterprise Cloud Conglomerate',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    primaryLight: '#eff6ff',
    secondary: '#06b6d4',
    glow: 'rgba(59, 130, 246, 0.4)',
    surfaceAccent: 'rgba(59, 130, 246, 0.12)',
    badgeBg: 'rgba(59, 130, 246, 0.15)',
    badgeBorder: 'rgba(59, 130, 246, 0.35)',
    badgeText: '#60a5fa',
  },
  cyan: {
    id: 'cyan',
    nameEn: 'Quantum Cyan',
    nameAr: 'سماوي تيليمتري كوانتوم',
    description: 'High-Tech Telemetry & Weighbridge Digital Grid',
    primary: '#06b6d4',
    primaryHover: '#0891b2',
    primaryLight: '#ecfeff',
    secondary: '#3b82f6',
    glow: 'rgba(6, 182, 212, 0.4)',
    surfaceAccent: 'rgba(6, 182, 212, 0.12)',
    badgeBg: 'rgba(6, 182, 212, 0.15)',
    badgeBorder: 'rgba(6, 182, 212, 0.35)',
    badgeText: '#22d3ee',
  },
  green: {
    id: 'green',
    nameEn: 'Neon Emerald',
    nameAr: 'أخضر زمردي تنفيذي',
    description: 'Operational Compliance & ZATCA Clearance Emerald',
    primary: '#10b981',
    primaryHover: '#059669',
    primaryLight: '#ecfdf5',
    secondary: '#14b8a6',
    glow: 'rgba(16, 185, 129, 0.4)',
    surfaceAccent: 'rgba(16, 185, 129, 0.12)',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeBorder: 'rgba(16, 185, 129, 0.35)',
    badgeText: '#34d399',
  },
  violet: {
    id: 'violet',
    nameEn: 'Electric Violet',
    nameAr: 'بنفسجي كهربائي فائق',
    description: 'Deep Data Isolation & Cryptographic Engine Violet',
    primary: '#8b5cf6',
    primaryHover: '#7c3aed',
    primaryLight: '#f5f3ff',
    secondary: '#a855f7',
    glow: 'rgba(139, 92, 246, 0.45)',
    surfaceAccent: 'rgba(139, 92, 246, 0.12)',
    badgeBg: 'rgba(139, 92, 246, 0.15)',
    badgeBorder: 'rgba(139, 92, 246, 0.35)',
    badgeText: '#a78bfa',
  },
  purple: {
    id: 'purple',
    nameEn: 'Royal Purple',
    nameAr: 'أرجواني ملكي فاخر',
    description: 'Executive Governance & Holding Group Identity',
    primary: '#a855f7',
    primaryHover: '#9333ea',
    primaryLight: '#faf5ff',
    secondary: '#ec4899',
    glow: 'rgba(168, 85, 247, 0.4)',
    surfaceAccent: 'rgba(168, 85, 247, 0.12)',
    badgeBg: 'rgba(168, 85, 247, 0.15)',
    badgeBorder: 'rgba(168, 85, 247, 0.35)',
    badgeText: '#c084fc',
  },
  pink: {
    id: 'pink',
    nameEn: 'Rose Magenta',
    nameAr: 'وردي ماجنتا عصري',
    description: 'Modern Commercial Trading & Retail Distribution',
    primary: '#ec4899',
    primaryHover: '#db2777',
    primaryLight: '#fdf2f8',
    secondary: '#f43f5e',
    glow: 'rgba(236, 72, 153, 0.4)',
    surfaceAccent: 'rgba(236, 72, 153, 0.12)',
    badgeBg: 'rgba(236, 72, 153, 0.15)',
    badgeBorder: 'rgba(236, 72, 153, 0.35)',
    badgeText: '#f472b6',
  },
  red: {
    id: 'red',
    nameEn: 'Crimson Alert',
    nameAr: 'أحمر قرمزي قيادي',
    description: 'High-Visibility Operations & Rapid Dispatch Command',
    primary: '#ef4444',
    primaryHover: '#dc2626',
    primaryLight: '#fef2f2',
    secondary: '#f97316',
    glow: 'rgba(239, 68, 68, 0.4)',
    surfaceAccent: 'rgba(239, 68, 68, 0.12)',
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    badgeBorder: 'rgba(239, 68, 68, 0.35)',
    badgeText: '#f87171',
  },
  gray: {
    id: 'gray',
    nameEn: 'Titanium Slate',
    nameAr: 'رمادي تيتانيوم رصين',
    description: 'Ultra-Minimal High-Contrast Monochromatic Slate',
    primary: '#64748b',
    primaryHover: '#475569',
    primaryLight: '#f8fafc',
    secondary: '#94a3b8',
    glow: 'rgba(148, 163, 184, 0.35)',
    surfaceAccent: 'rgba(148, 163, 184, 0.1)',
    badgeBg: 'rgba(148, 163, 184, 0.15)',
    badgeBorder: 'rgba(148, 163, 184, 0.3)',
    badgeText: '#cbd5e1',
  },
  system: {
    id: 'system',
    nameEn: 'Dynamic System',
    nameAr: 'تلقائي حسب المؤسسة',
    description: 'Auto-adapts to Tenant Profile Settings or Host OS',
    primary: '#f97316',
    primaryHover: '#ea580c',
    primaryLight: '#fff7ed',
    secondary: '#8b5cf6',
    glow: 'rgba(249, 115, 22, 0.45)',
    surfaceAccent: 'rgba(249, 115, 22, 0.12)',
    badgeBg: 'rgba(249, 115, 22, 0.15)',
    badgeBorder: 'rgba(249, 115, 22, 0.35)',
    badgeText: '#fb923c',
  },
};

export const OXENGL_DARK_THEME = {
  bgGradient: 'linear-gradient(180deg, #020617 0%, #0f172a 100%)',
  bgSolid: '#020617',
  bgSurface: '#0f172a',
  bgSurfaceElevated: '#1e293b',
  bgCard: 'rgba(15, 23, 42, 0.75)',
  bgGlass: 'rgba(2, 6, 23, 0.65)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderHover: 'rgba(255, 255, 255, 0.16)',
  borderLuminous: 'rgba(99, 102, 241, 0.35)',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textHighlightAmber: '#fbbf24',
  textHighlightOrange: '#fb923c',
  textHighlightGreen: '#34d399',
};

export const OXENGL_LIGHT_THEME = {
  bgGradient: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
  bgSolid: '#f8fafc',
  bgSurface: '#ffffff',
  bgSurfaceElevated: '#ffffff',
  bgCard: '#ffffff',
  bgGlass: 'rgba(255, 255, 255, 0.85)',
  borderSubtle: '#e2e8f0',
  borderHover: '#cbd5e1',
  borderLuminous: 'rgba(249, 115, 22, 0.35)',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textHighlightAmber: '#b45309',
  textHighlightOrange: '#c2410c',
  textHighlightGreen: '#047857',
};

export interface DensityStyleConfig {
  cardPadding: string;
  gridGap: string;
  tableRowHeight: string;
  tableCellPadding: string;
  headerHeight: string;
  badgePadding: string;
  fontSizeSmall: string;
  fontSizeBase: string;
}

export const DENSITY_STYLES: Record<DensityMode, DensityStyleConfig> = {
  comfortable: {
    cardPadding: 'p-3 sm:p-4',
    gridGap: 'gap-2 sm:gap-2.5',
    tableRowHeight: 'h-6',
    tableCellPadding: 'px-2.5 py-1',
    headerHeight: 'h-11',
    badgePadding: 'px-2 py-0.5',
    fontSizeSmall: 'text-[11px]',
    fontSizeBase: 'text-xs',
  },
  compact: {
    cardPadding: 'p-2 sm:p-2.5',
    gridGap: 'gap-1.5 sm:gap-2',
    tableRowHeight: 'h-[18px]',
    tableCellPadding: 'px-1.5 py-0.5',
    headerHeight: 'h-9',
    badgePadding: 'px-1.5 py-0.2',
    fontSizeSmall: 'text-[10px]',
    fontSizeBase: 'text-[11px]',
  },
};

// Telemetry metrics for Strict Multi-Tenant Isolation
export interface IsolationTelemetry {
  schemaIsolationTier: 'Schema RLS L3';
  isolatedTablesCount: number;
  zatcaComplianceStage: 'Stage-2 Ready (Cryptographic)';
  cloudLatencyMs: number;
  tenantBoundaryLock: 'Enforced & Verified';
  isolationScorePercent: 100;
  tenantIdHash: string;
}

export const DEFAULT_ISOLATION_TELEMETRY: IsolationTelemetry = {
  schemaIsolationTier: 'Schema RLS L3',
  isolatedTablesCount: 17,
  zatcaComplianceStage: 'Stage-2 Ready (Cryptographic)',
  cloudLatencyMs: 12,
  tenantBoundaryLock: 'Enforced & Verified',
  isolationScorePercent: 100,
  tenantIdHash: 'RLS-SHA256-OXEN-L3',
};
