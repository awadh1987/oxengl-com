import React from 'react';
import { Crown } from 'lucide-react';

interface BrandCrownProps {
  /** Tile edge length in px. */
  size?: number;
  className?: string;
}

/**
 * OxenGL "Crown" brand mark — the same tile used in the Master Central
 * Platform Owner Console (SuperAdminCockpitView): a blue → indigo → cyan
 * gradient square with an amber lucide Crown. Also mirrored by
 * /public/favicon.svg, so keep the two in sync.
 */
export const BrandCrown: React.FC<BrandCrownProps> = ({ size = 32, className = '' }) => (
  <span
    className={`brand-logo ${className}`.trim()}
    style={{ width: size, height: size, borderRadius: Math.round(size / 3) }}
    aria-hidden="true"
  >
    <Crown size={Math.round(size / 2)} strokeWidth={2.2} color="#fcd34d" />
  </span>
);

export default BrandCrown;
