/**
 * Dynamic Tenant Avatar & Monogram Badge Component
 * File: frontend/src/components/TenantAvatar.tsx
 *
 * Implements Phase 3 dynamic tenant branding:
 * - Monogram Avatars: Displays 1-2 letter monogram extracted from tenant's company name
 *   inside a sleek, circular colored badge.
 * - Logo Integration: Fetches and displays custom tenant logo from `branding_context` or `tenant`.
 * - Fallback Logic: Strictly renders the logo if present and valid; automatically
 *   and gracefully falls back to the dynamic Monogram Avatar badge if null/empty or on image load error.
 */

import React, { useState, useEffect } from 'react';
import { Company, TenantBrandingContext } from '../types';
import { extractTenantMonogram, getTenantAvatarGradient } from '../utils/monogram';

export interface TenantAvatarProps {
  tenant?: Partial<Company> | null;
  brandingContext?: TenantBrandingContext | null;
  logoUrl?: string | null;
  name?: string | null;
  primaryColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  imgClassName?: string;
  alt?: string;
  showGlow?: boolean;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const sizeConfig: Record<
  'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl',
  { container: string; text: string; glow: string }
> = {
  xs: {
    container: 'h-6 w-6 text-[10px]',
    text: 'text-[10px] tracking-tight',
    glow: 'hover:shadow-[0_0_8px_rgba(240,86,39,0.35)]',
  },
  sm: {
    container: 'h-7 w-7 text-xs',
    text: 'text-[11px] tracking-tight font-black',
    glow: 'hover:shadow-[0_0_10px_rgba(240,86,39,0.4)]',
  },
  md: {
    container: 'h-9 w-9 text-sm',
    text: 'text-xs tracking-tight font-black',
    glow: 'hover:shadow-[0_0_14px_rgba(240,86,39,0.45)]',
  },
  lg: {
    container: 'h-11 w-11 text-base',
    text: 'text-sm tracking-wide font-black',
    glow: 'hover:shadow-[0_0_16px_rgba(240,86,39,0.5)]',
  },
  xl: {
    container: 'h-14 w-14 text-xl',
    text: 'text-base tracking-wider font-black',
    glow: 'hover:shadow-[0_0_20px_rgba(240,86,39,0.55)]',
  },
  '2xl': {
    container: 'h-20 w-20 text-2xl',
    text: 'text-xl tracking-wider font-black',
    glow: 'hover:shadow-[0_0_25px_rgba(240,86,39,0.6)]',
  },
};

export const TenantAvatar: React.FC<TenantAvatarProps> = ({
  tenant,
  brandingContext,
  logoUrl,
  name,
  primaryColor,
  size = 'md',
  className = '',
  imgClassName = '',
  alt,
  showGlow = false,
  title,
  onClick,
}) => {
  // Resolve effective branding properties
  const resolvedLogo =
    brandingContext?.logo_url ??
    tenant?.branding_context?.logo_url ??
    logoUrl ??
    tenant?.logo_url ??
    tenant?.uiLogoUrl ??
    tenant?.ui_logo_url ??
    null;

  const effectiveLogoUrl =
    resolvedLogo && typeof resolvedLogo === 'string' && resolvedLogo.trim() !== '' && resolvedLogo !== '/oxengl-logo.svg'
      ? resolvedLogo.trim()
      : null;

  const resolvedName =
    (brandingContext as any)?.name ||
    tenant?.name ||
    tenant?.company_name ||
    (tenant as any)?.companyName ||
    name ||
    'Tenant Workspace';

  const resolvedPrimaryColor =
    brandingContext?.primary_color ||
    tenant?.branding_context?.primary_color ||
    primaryColor ||
    tenant?.uiPrimaryColor ||
    tenant?.ui_primary_color ||
    '#F05627';

  const [imageError, setImageError] = useState(false);

  // Reset image error state whenever effectiveLogoUrl changes
  useEffect(() => {
    setImageError(false);
  }, [effectiveLogoUrl]);

  const config = sizeConfig[size] || sizeConfig.md;
  const monogram = extractTenantMonogram(resolvedName);
  const displayTitle = title || resolvedName;

  // STRICT FALLBACK LOGIC:
  // If logo exists and has not encountered a loading error, render the logo inside a circular container.
  if (effectiveLogoUrl && !imageError) {
    return (
      <div
        className={`relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden border border-slate-700/80 bg-slate-900 shadow-md transition-all duration-300 ${
          config.container
        } ${showGlow ? config.glow : ''} ${className}`}
        title={displayTitle}
        onClick={onClick}
      >
        <img
          src={effectiveLogoUrl}
          alt={alt || `${resolvedName} Logo`}
          className={`h-full w-full rounded-full object-cover p-0.5 ${imgClassName}`}
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // FALLBACK: Sleek, circular colored badge with 1-2 letter monogram
  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full border border-white/20 text-white shadow-md select-none transition-all duration-300 ${
        config.container
      } ${showGlow ? config.glow : ''} ${className}`}
      style={{
        background: getTenantAvatarGradient(resolvedPrimaryColor, '#0f172a'),
      }}
      title={displayTitle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className={`${config.text} drop-shadow-sm`}>{monogram}</span>
    </div>
  );
};

export default TenantAvatar;
