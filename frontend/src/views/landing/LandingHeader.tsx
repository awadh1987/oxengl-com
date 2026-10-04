import React, { useState } from 'react';
import { BrandWordmark } from './BrandWordmark';

interface LandingHeaderProps {
  onLoginClick?: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({ onLoginClick }) => {
  const [domainType, setDomainType] = useState<'me' | 'com'>('me');

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* 1. Global System Telemetry Bar */}
      <div className="system-bar">
        <div className="status-indicator">
          <span className="pulsing-dot" />
          <span>KSA-RIYADH-01 [ONLINE] • PostgreSQL 16.4 • Uptime: 99.984%</span>
        </div>
        
        <div className="domain-switch-container">
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginRight: '6px' }}>Domain Routing:</span>
          <button 
            type="button"
            id="btn-domain-me" 
            className={`domain-btn ${domainType === 'me' ? 'active' : ''}`}
            onClick={() => setDomainType('me')}
          >
            .me (Production)
          </button>
          <button 
            type="button"
            id="btn-domain-com" 
            className={`domain-btn ${domainType === 'com' ? 'active' : ''}`}
            onClick={() => setDomainType('com')}
          >
            .com (Global CDN)
          </button>
        </div>
      </div>

      {/* 2. Top Application Navigation */}
      <header className="main-nav">
        <a href="#workspace-stage" onClick={scrollToSection('workspace-stage')} className="nav-brand" aria-label="OxenGL home">
          <BrandWordmark height={26} />
        </a>

        <nav className="nav-links">
          <a href="#workspace-stage" onClick={scrollToSection('workspace-stage')}>Stage</a>
          <a href="#proof-metrics" onClick={scrollToSection('proof-metrics')}>Benchmarks</a>
          <a href="#modules" onClick={scrollToSection('modules')}>Architecture</a>
          <a href="#pricing" onClick={scrollToSection('pricing')}>Pricing</a>
          <a href="#provision" onClick={scrollToSection('provision')}>Provisioning</a>
        </nav>

        <div className="nav-actions">
          <a href="/admin" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }}>
            SuperAdmin Portal
          </a>
          <button 
            type="button" 
            onClick={onLoginClick || (() => { window.location.href = '/login'; })}
            className="btn-primary" 
            style={{ padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}
          >
            Tenant Login
          </button>
        </div>
      </header>
    </>
  );
};
