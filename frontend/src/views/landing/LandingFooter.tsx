import React from 'react';
import { BrandWordmark } from './BrandWordmark';

export const LandingFooter: React.FC = () => {
  return (
    <footer className="main-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <div className="nav-brand" style={{ marginBottom: '12px' }}>
            <BrandWordmark height={24} />
          </div>
          <p className="footer-desc">
            Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.
          </p>
          <div className="compliance-badges">
            <span className="badge-tag">ISO 27001 COMPLIANT</span>
            <span className="badge-tag">ZATCA PHASE 2 QUALIFIED</span>
            <span className="badge-tag">NDMO REGULATORY ALIGNED</span>
          </div>
        </div>

        <div className="footer-col">
          <h4>Architecture</h4>
          <ul>
            <li><a href="#workspace-stage">Interactive Stage</a></li>
            <li><a href="#proof-metrics">Postgres Benchmarks</a></li>
            <li><a href="#modules">FastAPI Endpoints</a></li>
            <li><a href="/docs" target="_blank" rel="noopener noreferrer">Interactive OpenAPI</a></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Sovereign ERP</h4>
          <ul>
            <li><a href="#modules">General Ledger &amp; ZATCA</a></li>
            <li><a href="#modules">Weighbridge Logistics</a></li>
            <li><a href="#modules">HRMS &amp; WPS Payroll</a></li>
            <li><a href="#pricing">Pricing Plans</a></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Control Plane</h4>
          <ul>
            <li><a href="/tenant/login">Tenant Workspace Login</a></li>
            <li><a href="#provision">Reserve Namespace</a></li>
            <li><a href="/health">Cluster Health Radar</a></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 OxenGL ERP Platform. Sovereign Multi-Tenant Architecture. All rights reserved.</span>
        <span className="font-mono text-dim" style={{ fontSize: '11px' }}>
          NODE: KSA-CENTRAL-01 // POSTGRESQL 16.4 BARE-METAL
        </span>
      </div>
    </footer>
  );
};
