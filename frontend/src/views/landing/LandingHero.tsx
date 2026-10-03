import React from 'react';

interface LandingHeroProps {
  onRestoreWindow: (winId: string) => void;
  openWindows: Record<string, boolean>;
  activeWindow: string;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onRestoreWindow,
  openWindows,
  activeWindow,
}) => {
  return (
    <section className="hero-section">
      <div className="hero-content">
        <div className="hero-badge">
          <span className="badge-pulse" />
          <span>PRODUCTION-PROVEN SAUDI ARABIA ERP BACKBONE</span>
        </div>
        
        <h1 className="hero-title">
          Sovereign Multi-Tenant ERP Architecture for the <span className="highlight-text">Kingdom of Saudi Arabia</span>
        </h1>
        
        <p className="hero-subtitle">
          Sub-millisecond query isolation, cryptographic ZATCA Phase 2 compliance, and raw quarry logistics orchestration—engineered on bare-metal PostgreSQL 16 and FastAPI.
        </p>

        <div className="hero-cta-group">
          <a href="#provision" className="btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }}>
            Provision Workspace
          </a>
          <a href="#modules" className="btn-secondary" style={{ padding: '12px 28px', fontSize: '15px' }}>
            Inspect Architecture
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
