import React, { useState } from 'react';
import { useSiteSettings } from '../../hooks/useSiteSettings';

/** Intrinsic aspect ratio of default /oxengl-wordmark.svg (viewBox 371 x 73). */
const WORDMARK_RATIO = 371 / 73;

/** OxenGL luxury navy: brand tile behind the wordmark and the favicon set. */
export const BRAND_NAVY = '#0B1F3A';

/** OxenGL accent yellow used for the "GL" letters (wordmark + favicon monogram). */
export const BRAND_YELLOW = '#FFC107';

export interface BrandWordmarkProps {
  /** Rendered height of the lettering/logo in px. */
  height?: number;
  className?: string;
  /** Explicit logo URL override. If omitted, dynamically reads from useSiteSettings(). */
  logoUrl?: string;
  /** Explicit platform title override. If omitted, dynamically reads from useSiteSettings(). */
  siteName?: string;
}

/**
 * Dynamic Platform Brand Wordmark & Logo Component:
 * Renders the platform logo dynamically from database-driven SiteSettings,
 * falling back to the official OxenGL SVG wordmark.
 */
export const BrandWordmark: React.FC<BrandWordmarkProps> = ({
  height = 26,
  className = '',
  logoUrl: propLogoUrl,
  siteName: propSiteName,
}) => {
  const { settings } = useSiteSettings();
  const [loadError, setLoadError] = useState(false);

  const effectiveLogo = (propLogoUrl || settings.site_logo || '/oxengl-wordmark.svg').trim();
  const effectiveName = (propSiteName || settings.site_name || 'OxenGL').trim();
  const isDefaultWordmarkSvg = effectiveLogo === '/oxengl-wordmark.svg';

  return (
    <span
      className={`brand-wordmark-tile ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: BRAND_NAVY,
        padding: `${Math.round(height * 0.3)}px ${Math.round(height * 0.5)}px`,
        borderRadius: Math.round(height * 0.38),
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 24px -10px rgba(11, 31, 58, 0.9)',
        lineHeight: 0,
        maxHeight: `${Math.round(height * 1.8)}px`,
      }}
    >
      {!loadError ? (
        <img
          src={effectiveLogo}
          alt={effectiveName}
          width={isDefaultWordmarkSvg ? Math.round(height * WORDMARK_RATIO) : undefined}
          height={height}
          style={{
            height: `${height}px`,
            width: isDefaultWordmarkSvg ? `${Math.round(height * WORDMARK_RATIO)}px` : 'auto',
            maxHeight: `${height}px`,
            maxWidth: '240px',
            objectFit: 'contain',
            display: 'block',
          }}
          className="brand-wordmark"
          draggable={false}
          onError={() => setLoadError(true)}
        />
      ) : (
        <span
          style={{
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: `${Math.round(height * 0.65)}px`,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {effectiveName}
        </span>
      )}
    </span>
  );
};

/**
 * Compact square OxenGL mark (yellow "GL" on the navy tile), identical to the favicon.
 * For collapsed rails and other spots too narrow for the full wordmark.
 */
export const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 28, className = '' }) => (
  <img
    src="/favicon.svg"
    alt="OxenGL"
    width={size}
    height={size}
    className={`brand-mark ${className}`.trim()}
    style={{ borderRadius: Math.round(size * 0.22), boxShadow: '0 6px 18px -8px rgba(11, 31, 58, 0.9)' }}
    draggable={false}
  />
);

export default BrandWordmark;
