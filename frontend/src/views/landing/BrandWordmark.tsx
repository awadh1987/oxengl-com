import React from 'react';

/** Intrinsic aspect ratio of /oxengl-wordmark.svg (viewBox 371 x 73). */
const WORDMARK_RATIO = 371 / 73;

interface BrandWordmarkProps {
  /** Rendered height in px; width follows the wordmark's aspect ratio. */
  height?: number;
  className?: string;
}

/**
 * Official OxenGL wordmark: "Oxen" in white, "GL" in brand orange (#F97316).
 * Vector asset with outlined text, so it renders identically without the font.
 */
export const BrandWordmark: React.FC<BrandWordmarkProps> = ({ height = 26, className = '' }) => (
  <img
    src="/oxengl-wordmark.svg"
    alt="OxenGL"
    width={Math.round(height * WORDMARK_RATIO)}
    height={height}
    className={`brand-wordmark ${className}`.trim()}
    draggable={false}
  />
);

export default BrandWordmark;
