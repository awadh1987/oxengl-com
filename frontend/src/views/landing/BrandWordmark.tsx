import React from 'react';

/** Intrinsic aspect ratio of /oxengl-wordmark.svg (viewBox 371 x 73). */
const WORDMARK_RATIO = 371 / 73;

/** OxenGL luxury navy: brand tile behind the wordmark and the favicon set. */
export const BRAND_NAVY = '#0B1F3A';

/** OxenGL accent yellow used for the "GL" letters (wordmark + favicon monogram). */
export const BRAND_YELLOW = '#FFC107';

interface BrandWordmarkProps {
  /** Rendered height of the lettering in px; width follows the wordmark's aspect ratio. */
  height?: number;
  className?: string;
}

/**
 * Official OxenGL wordmark: "Oxen" in white, "GL" in brand yellow (#FFC107),
 * set on the navy brand tile. Vector asset with outlined text, so it renders
 * identically without the font.
 */
export const BrandWordmark: React.FC<BrandWordmarkProps> = ({ height = 26, className = '' }) => (
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
    }}
  >
    <img
      src="/oxengl-wordmark.svg"
      alt="OxenGL"
      width={Math.round(height * WORDMARK_RATIO)}
      height={height}
      className="brand-wordmark"
      draggable={false}
    />
  </span>
);

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
