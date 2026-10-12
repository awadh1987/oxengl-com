import React from 'react';
import { BrandWordmark } from './BrandWordmark';
import { SiteSettings } from '../../hooks/useSiteSettings';
import { FooterCmsContent } from '../../hooks/useLandingContent';

export interface LandingFooterProps {
  settings?: Partial<SiteSettings> & {
    enable_sovereignty_badge?: boolean;
    sovereignty_badge_title?: string;
    sovereignty_badge_text?: string;
    support_email?: string;
  };
  cmsFooter?: Partial<FooterCmsContent>;
  cmsContent?: {
    footer?: Partial<FooterCmsContent>;
  };
}

export const LandingFooter: React.FC<LandingFooterProps> = ({
  settings,
  cmsFooter,
  cmsContent,
}) => {
  const content = cmsContent?.footer || cmsFooter;

  const emailStr =
    content?.contact_email ||
    settings?.contact_email ||
    settings?.support_email ||
    'ops@oxengl.me';

  const phoneStr =
    content?.contact_phone ||
    content?.phone ||
    settings?.contact_phone ||
    '+967 736735733';

  const locationStr =
    content?.contact_location ||
    content?.location_text ||
    content?.contact_address ||
    settings?.contact_address ||
    "Sana'a, Yemen";

  const cleanPhone = (phoneStr || '').replace(/\D/g, '');

  return (
    <footer className="main-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <div className="nav-brand" style={{ marginBottom: '12px' }}>
            <BrandWordmark height={24} logoUrl={settings?.site_logo} siteName={settings?.site_name} />
          </div>
          <p className="footer-desc">
            {settings?.site_description ||
              settings?.site_tagline ||
              'Sovereign Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.'}
          </p>

          {/* User-Configured Sovereignty & Compliance Policy Callout */}
          {settings?.enable_sovereignty_badge !== false && (
            <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 my-3 max-w-md">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>{settings?.sovereignty_badge_title || "Data Sovereignty & Infrastructure Policy"}</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {settings?.sovereignty_badge_text || "All tenant customer schemas, cryptographic keys, and telemetry logs are strictly persisted on sovereign infrastructure."}
              </p>
            </div>
          )}

          <div className="compliance-badges">
            <span className="badge-tag">ENTERPRISE ISOLATION</span>
            <span className="badge-tag">CRYPTOGRAPHIC COMPLIANCE</span>
            <span className="badge-tag">SOVEREIGN ARCHITECTURE</span>
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
            <li><a href="#modules">General Ledger</a></li>
            <li><a href="#modules">Weighbridge Logistics</a></li>
            <li><a href="#modules">HRMS &amp; Payroll</a></li>
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
          
          <h4 style={{ marginTop: '16px' }}>Contact</h4>
          <ul>
            {emailStr && (
              <li>
                <a
                  href={`mailto:${emailStr}`}
                  className="hover:text-amber-400 transition-colors"
                  title="Direct Operations Email"
                >
                  {emailStr}
                </a>
              </li>
            )}
            {phoneStr && (
              <li>
                <a
                  href={`https://wa.me/${cleanPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-500 hover:text-amber-400 font-mono transition-colors flex items-center gap-2"
                  title="Contact via WhatsApp"
                >
                  <span>{phoneStr}</span>
                </a>
              </li>
            )}
            {locationStr && (
              <li className="text-slate-400 text-xs">
                {locationStr}
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <span>
          {content?.copyright ||
            `© 2026 ${settings?.site_name || 'OxenGL'} ERP Platform. Sovereign Multi-Tenant Architecture. All rights reserved.`}
        </span>
        <span className="font-mono text-dim" style={{ fontSize: '11px' }}>
          SOVEREIGN CONTROL PLANE // BARE-METAL POSTGRESQL 16
        </span>
      </div>
    </footer>
  );
};

export default LandingFooter;
