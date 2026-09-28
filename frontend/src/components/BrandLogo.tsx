import React from 'react';
import { useApp } from '../context/AppContext';
import { isApexDomain } from '../utils/subdomain';
import { extractTenantMonogram } from '../utils/monogram';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'hero';
  showText?: boolean;
  theme?: 'light' | 'dark' | 'glass';
  className?: string;
  horizontal?: boolean;
  customLogoUrl?: string;
  companyNameAr?: string;
  companyNameEn?: string;
  primaryColor?: string;
  secondaryColor?: string;
  forcePlatformLogo?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = true,
  theme = 'light',
  className = '',
  horizontal = false,
  customLogoUrl: propCustomLogoUrl,
  companyNameAr: propCompanyNameAr,
  companyNameEn: propCompanyNameEn,
  primaryColor: propPrimaryColor,
  secondaryColor: propSecondaryColor,
  forcePlatformLogo = false,
}) => {
  let appBrandConfig: any = null;
  let currentCompany: any = null;
  let authTier: string | null = null;
  let tenantId: string | null = null;
  let isTenantScoped = false;
  try {
    const appContext = useApp();
    appBrandConfig = appContext?.brandConfig;
    currentCompany = appContext?.currentCompany;
    authTier = appContext?.authTier ?? null;
    tenantId = appContext?.tenantId ?? null;
    const isApex = isApexDomain();
    isTenantScoped = Boolean((authTier === 'tenant' || tenantId || !isApex) && authTier !== 'master');
  } catch {
    // Graceful fallback if rendered outside AppProvider
  }

  // Check if current route is apex root portal /
  const isApex = typeof window !== 'undefined' ? isApexDomain() : true;
  const isApexRootPortal = isApex && typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '');

  // Allow custom tenant logos when explicitly passed via props, or when authenticated inside a tenant-scoped session or route,
  // or on a tenant subdomain, provided forcePlatformLogo is NOT set.
  const hasExplicitTenantProps = Boolean(propCustomLogoUrl || propCompanyNameAr || propCompanyNameEn);
  const allowTenantLogo = !forcePlatformLogo && (hasExplicitTenantProps || (!isApexRootPortal && (isTenantScoped || !isApex)));

  const envPlatformLogo = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_PLATFORM_LOGO_URL : undefined;
  const platformLogoUrl =
    (envPlatformLogo && typeof envPlatformLogo === 'string' && envPlatformLogo.trim() !== '')
      ? envPlatformLogo.trim()
      : (appBrandConfig?.platformLogoUrl && typeof appBrandConfig.platformLogoUrl === 'string' && appBrandConfig.platformLogoUrl.trim() !== '')
      ? appBrandConfig.platformLogoUrl.trim()
      : null;

  const rawLogoUrl = allowTenantLogo
    ? (propCustomLogoUrl ?? currentCompany?.logo_url ?? currentCompany?.uiLogoUrl ?? appBrandConfig?.customLogoUrl)
    : (propCustomLogoUrl ?? platformLogoUrl);

  const effectiveLogoUrl = (rawLogoUrl && rawLogoUrl !== '/oxengl-logo.svg') ? rawLogoUrl : null;
  const effectiveNameAr = allowTenantLogo
    ? (propCompanyNameAr ?? currentCompany?.name_ar ?? currentCompany?.company_name_ar ?? currentCompany?.name ?? appBrandConfig?.companyNameAr ?? 'أوكسين جي إل')
    : (propCompanyNameAr ?? 'أوكسين جي إل');
  const effectiveNameEn = allowTenantLogo
    ? (propCompanyNameEn ?? currentCompany?.company_name ?? currentCompany?.name ?? appBrandConfig?.companyNameEn ?? 'OxenGL Enterprise')
    : (propCompanyNameEn ?? 'OxenGL Enterprise');
  const effectivePrimaryColor = allowTenantLogo
    ? (propPrimaryColor ?? currentCompany?.uiPrimaryColor ?? appBrandConfig?.primaryColor ?? '#F05627')
    : (propPrimaryColor ?? '#F05627');
  const effectiveSecondaryColor = allowTenantLogo
    ? (propSecondaryColor ?? currentCompany?.uiSecondaryColor ?? appBrandConfig?.secondaryColor ?? '#1A1A1A')
    : (propSecondaryColor ?? '#1A1A1A');
  const useTenantFallback = allowTenantLogo && Boolean(
    propCompanyNameEn ||
    propCompanyNameAr ||
    propPrimaryColor ||
    propSecondaryColor ||
    currentCompany?.name ||
    appBrandConfig?.companyNameEn
  );

  const sizeMap = {
    sm: { icon: 32, textAr: 'text-xs', textEn: 'text-[9px]' },
    md: { icon: 44, textAr: 'text-sm font-bold', textEn: 'text-[10px]' },
    lg: { icon: 64, textAr: 'text-base font-bold', textEn: 'text-xs' },
    xl: { icon: 88, textAr: 'text-xl font-bold', textEn: 'text-sm' },
    '2xl': { icon: 120, textAr: 'text-2xl font-black', textEn: 'text-base' },
    hero: { icon: 160, textAr: 'text-3xl font-black', textEn: 'text-lg' },
  };

  const currentSize = sizeMap[size];
  const isDark = theme === 'dark';

  // Precision spiral pattern with 3 rings of rounded capsule rays
  const renderSpiralPills = () => {
    const pills = [];
    const rings = [
      { count: 18, radius: 24, length: 14, width: 6, rotOffset: 25 },
      { count: 24, radius: 46, length: 20, width: 8, rotOffset: 50 },
      { count: 28, radius: 72, length: 28, width: 11, rotOffset: 75 },
    ];

    let key = 0;
    rings.forEach((ring) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i * 360) / ring.count + ring.rotOffset;
        const rad = (angle * Math.PI) / 180;
        const cosAngle = Math.cos(rad);
        const sinAngle = Math.sin(rad);
        const x = 110 + ring.radius * cosAngle * 1.05;
        const y = 100 + ring.radius * sinAngle * 0.85;

        const colorRatio = (i / ring.count + ring.rotOffset / 360) % 1;
        const fillId = colorRatio < 0.35 ? 'orangeGrad' : colorRatio < 0.7 ? 'brandDarkGrad' : 'amberOrangeGrad';

        pills.push(
          <rect
            key={`pill-${key++}`}
            x={x - ring.width / 2}
            y={y - ring.length / 2}
            width={ring.width}
            height={ring.length}
            rx={ring.width / 2}
            transform={`rotate(${angle + 40}, ${x}, ${y})`}
            fill={`url(#${fillId})`}
            opacity={0.92 + (i % 3) * 0.03}
          />
        );
      }
    });

    return pills;
  };

  return (
    <div
      className={`inline-flex ${
        horizontal ? 'flex-row items-center gap-3' : 'flex-col items-center justify-center gap-2'
      } ${className}`}
      id="brand-logo-container"
    >
      {effectiveLogoUrl ? (
        <div
          style={{ width: currentSize.icon, height: currentSize.icon }}
          className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-xs ring-1 ring-neutral-900/15 shrink-0"
        >
          <img
            src={effectiveLogoUrl}
            alt={effectiveNameEn}
            className="h-full w-full rounded-[0.85rem] object-cover object-center"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          <span style={{ background: `linear-gradient(135deg, ${effectivePrimaryColor}, ${effectiveSecondaryColor})` }} className="hidden h-full w-full items-center justify-center rounded-[0.85rem] text-sm font-black text-white">
            {extractTenantMonogram(effectiveNameEn || effectiveNameAr)}
          </span>
        </div>
      ) : useTenantFallback ? (
        <div style={{ width: currentSize.icon, height: currentSize.icon, background: `linear-gradient(135deg, ${effectivePrimaryColor}, ${effectiveSecondaryColor})` }} className="flex shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white shadow-xs ring-1 ring-neutral-900/15">
          {extractTenantMonogram(effectiveNameEn || effectiveNameAr)}
        </div>
      ) : (
        <svg
          width={currentSize.icon}
          height={currentSize.icon}
          viewBox="0 0 220 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0 transition-transform duration-300 hover:scale-105"
        >
          <defs>
            <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F97316" />
              <stop offset="100%" stopColor="#F05627" />
            </linearGradient>
            <linearGradient id="brandDarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2A2A2A" />
              <stop offset="50%" stopColor="#1A1A1A" />
              <stop offset="100%" stopColor="#F05627" />
            </linearGradient>
            <linearGradient id="amberOrangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FB923C" />
              <stop offset="50%" stopColor="#F05627" />
              <stop offset="100%" stopColor="#C2410C" />
            </linearGradient>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F05627" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#F05627" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx="110" cy="100" r="85" fill="url(#centerGlow)" />
          <g id="vortex-spiral-group">{renderSpiralPills()}</g>
        </svg>
      )}

      {showText && (
        <div
          className={`flex flex-col ${
            horizontal ? 'items-start text-right' : 'items-center text-center'
          } leading-tight`}
        >
          <span
            className={`${currentSize.textAr} font-bold tracking-tight ${
              isDark ? 'text-orange-200' : 'text-neutral-900'
            }`}
            style={{ fontFamily: "'Noto Kufi Arabic', 'Tajawal', sans-serif" }}
          >
            {effectiveNameAr}
          </span>
          <span
            className={`${currentSize.textEn} tracking-widest uppercase font-semibold ${
              isDark ? 'text-orange-400' : 'text-[#F05627]'
            }`}
            style={{ letterSpacing: '0.12em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {effectiveNameEn}
          </span>
        </div>
      )}
    </div>
  );
};
