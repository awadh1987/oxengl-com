import React from 'react';
import { renderHighlighted } from '../../utils/highlightText';
import { SiteSettings } from '../../hooks/useSiteSettings';

interface LandingHeroProps {
  onRestoreWindow: (winId: string) => void;
  openWindows: Record<string, boolean>;
  activeWindow: string;
  settings: Partial<SiteSettings>;
  loading: boolean;
  cmsHero?: {
    title: string;
    subtitle: string;
    badge: string;
    ctaPrimary: { label: string; url: string };
    ctaSecondary: { label: string; url: string };
  };
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onRestoreWindow,
  openWindows,
  activeWindow,
  settings,
  loading,
  cmsHero,
}) => {
  const headline = cmsHero?.title || settings.landing_headline || 'Next-Generation Heavy Logistics & Industrial Accounting Platform';
  const subheadline = cmsHero?.subtitle ?? settings.landing_subheadline ?? 'Unifying weighbridge automation, fleet dispatch, multi-branch general ledgers, and automated ZATCA Phase 2 compliance into one sovereign engine.';
  const badgeText = cmsHero?.badge || 'PRODUCTION-PROVEN SAUDI ARABIA ERP BACKBONE';
  const ctaPrimary = cmsHero?.ctaPrimary || { label: 'Provision Workspace', url: '#provision' };
  const ctaSecondary = cmsHero?.ctaSecondary || { label: 'Inspect Architecture', url: '#modules' };

  return (
    <section className="hero-section">
      <div className="hero-content">
        <div className="hero-badge">
          <span className="badge-pulse" />
          <span>{badgeText}</span>
        </div>
        
        <h1 className="hero-title" aria-busy={loading}>
          {renderHighlighted(headline)}
        </h1>
        
        <p className="hero-subtitle" aria-busy={loading}>
          {subheadline}
        </p>

        <div className="hero-cta-group">
          <a href={ctaPrimary.url} className="btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }}>
            {ctaPrimary.label}
          </a>
          <a href={ctaSecondary.url} className="btn-secondary" style={{ padding: '12px 28px', fontSize: '15px' }}>
            {ctaSecondary.label}
          </a>
        </div>
      </div>

      {/* Interactive Dock Tray for Stage Windows */}
      <div className="stage-dock-bar">
        <span className="dock-label">Active Workspaces:</span>
        <div className="dock-tray" id="dock-tray">
          <button
            type="button"
            id="dock-win-finance"
            className={`dock-tab ${openWindows['win-finance'] ? 'active' : ''} ${activeWindow === 'win-finance' ? 'focused' : ''}`}
            onClick={() => onRestoreWindow('win-finance')}
          >
            <span className="dock-dot" style={{ backgroundColor: '#10b981' }} />
            <span>GL Voucher &amp; ZATCA Phase 2</span>
          </button>
          
          <button
            type="button"
            id="dock-win-telemetry"
            className={`dock-tab ${openWindows['win-telemetry'] ? 'active' : ''} ${activeWindow === 'win-telemetry' ? 'focused' : ''}`}
            onClick={() => onRestoreWindow('win-telemetry')}
          >
            <span className="dock-dot" style={{ backgroundColor: '#38bdf8' }} />
            <span>PostgreSQL 16 Telemetry Radar</span>
          </button>
          
          <button
            type="button"
            id="dock-win-weighbridge"
            className={`dock-tab ${openWindows['win-weighbridge'] ? 'active' : ''} ${activeWindow === 'win-weighbridge' ? 'focused' : ''}`}
            onClick={() => onRestoreWindow('win-weighbridge')}
          >
            <span className="dock-dot" style={{ backgroundColor: '#f97316' }} />
            <span>Weighbridge Logistics Stream</span>
          </button>
        </div>
      </div>
    </section>
  );
};
