import React from 'react';
import { SiteSettings } from '../../hooks/useSiteSettings';
import { HeroCmsContent } from '../../hooks/useLandingContent';

export interface LandingHeroProps {
  onRestoreWindow: (winId: string) => void;
  openWindows: Record<string, boolean>;
  activeWindow: string;
  settings?: Partial<SiteSettings>;
  loading?: boolean;
  cmsHero?: Partial<HeroCmsContent>;
  cmsContent?: {
    hero?: Partial<HeroCmsContent>;
  };
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onRestoreWindow,
  openWindows,
  activeWindow,
  settings,
  loading = false,
  cmsHero,
  cmsContent,
}) => {
  const content = cmsContent?.hero || cmsHero;

  return (
    <section className="hero-section">
      <div className="hero-content">
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <div className="hero-badge">
            <span className="badge-pulse" />
            <span>{content?.badge_text || "ENTERPRISE CONTROL PLANE"}</span>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-slate-700/60 bg-slate-900/90 text-[11px] font-mono text-emerald-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{content?.telemetry_node_label || "NODE [ONLINE]"}</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">{content?.telemetry_db_label || "PostgreSQL 16"}</span>
          </div>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-tight" aria-busy={loading}>
          {content?.headline || "Sovereign Multi-Tenant ERP Architecture"}
        </h1>
        
        {content?.subheadline && (
          <p className="hero-subtitle text-slate-300 max-w-3xl mx-auto mt-4 text-base md:text-lg leading-relaxed" aria-busy={loading}>
            {content.subheadline}
          </p>
        )}

        <div className="hero-cta-group">
          <a
            href={content?.primary_cta_url || "/register"}
            className="btn-primary"
            style={{ padding: '12px 28px', fontSize: '15px' }}
          >
            {content?.primary_cta_label || "Deploy Workspace"}
          </a>
          <a
            href={content?.secondary_cta_url || "/login"}
            className="btn-secondary"
            style={{ padding: '12px 28px', fontSize: '15px' }}
          >
            {content?.secondary_cta_label || "Console Sign In"}
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
            <span>GL Voucher &amp; Cryptographic Clearance</span>
          </button>
          
          <button
            type="button"
            id="dock-win-telemetry"
            className={`dock-tab ${openWindows['win-telemetry'] ? 'active' : ''} ${activeWindow === 'win-telemetry' ? 'focused' : ''}`}
            onClick={() => onRestoreWindow('win-telemetry')}
          >
            <span className="dock-dot" style={{ backgroundColor: '#38bdf8' }} />
            <span>Cluster Telemetry Radar</span>
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

export default LandingHero;
