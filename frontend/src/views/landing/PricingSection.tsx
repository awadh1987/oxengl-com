import React, { useState } from 'react';

interface PricingSectionProps {
  onSelectTier?: (tier: string) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectTier }) => {
  const [billingCycle, setBillingCycle] = useState<'m' | 'y'>('m');

  const handleSelect = (tier: string) => {
    if (onSelectTier) {
      onSelectTier(tier);
    } else {
      const el = document.getElementById('provision');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isAnnual = billingCycle === 'y';

  return (
    <section className="pricing-section" id="pricing">
      <div className="section-header">
        <span className="section-pill">DEPLOYMENT TIERS</span>
        <h2 className="section-title">Transparent Enterprise Licensing</h2>
        <p className="section-subtitle">Predictable SaaS and sovereign infrastructure tiers for Saudi contracting, logistics, and enterprise syndicates.</p>
        
        <div className="pricing-toggle">
          <button
            type="button"
            className={`toggle-btn ${!isAnnual ? 'active' : ''}`}
            onClick={() => setBillingCycle('m')}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            className={`toggle-btn ${isAnnual ? 'active' : ''}`}
            onClick={() => setBillingCycle('y')}
          >
            Annual Billing <span className="discount-tag">Save 20%</span>
          </button>
        </div>
      </div>

      <div className="pricing-grid">
        {/* Tier 1: Growth Workspace */}
        <div className="pricing-card">
          <div className="pricing-header">
            <h3 className="tier-name">Growth Workspace</h3>
            <p className="tier-desc">Designed for scaling contractors, quarries, and multi-branch suppliers in KSA.</p>
            <div className="tier-price font-mono">
              <span className="currency">SAR</span>
              <span>{isAnnual ? '3,000' : '3,750'}</span>
              <span className="period">/month</span>
            </div>
          </div>
          <ul className="tier-features">
            <li><span>✓</span> Up to 5 Isolated Entity Branches</li>
            <li><span>✓</span> Full ZATCA Phase 2 E-Invoicing Engine</li>
            <li><span>✓</span> Dual Weighbridge IoT Stream Integration</li>
            <li><span>✓</span> Automated WPS SIF Payroll Exports</li>
            <li><span>✓</span> Standard Multi-Tenant PostgreSQL RLS</li>
          </ul>
          <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => handleSelect('Growth Workspace')}>
            Select Growth Tier
          </button>
        </div>

        {/* Tier 2: Enterprise Syndicate (Featured) */}
        <div className="pricing-card featured">
          <div className="featured-badge">MOST POPULAR</div>
          <div className="pricing-header">
            <h3 className="tier-name">Enterprise Syndicate</h3>
            <p className="tier-desc">For heavy mining groups, national logistics fleets, and multi-company holdings.</p>
            <div className="tier-price font-mono">
              <span className="currency">SAR</span>
              <span>{isAnnual ? '7,120' : '8,900'}</span>
              <span className="period">/month</span>
            </div>
          </div>
          <ul className="tier-features">
            <li><span>✓</span> Unlimited Branches &amp; Cost Centers</li>
            <li><span>✓</span> Multi-Fleet Weighbridge Queueing &amp; GPS</li>
            <li><span>✓</span> 5-Level Chart of Accounts with Multi-Currency</li>
            <li><span>✓</span> Priority ZATCA Cryptographic Sandbox</li>
            <li><span>✓</span> Dedicated PgBouncer Database Connection Pool</li>
            <li><span>✓</span> 99.98% Service-Level Agreement (SLA)</li>
          </ul>
          <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={() => handleSelect('Enterprise Syndicate')}>
            Deploy Enterprise Tier
          </button>
        </div>

        {/* Tier 3: Sovereign Dedicated */}
        <div className="pricing-card">
          <div className="pricing-header">
            <h3 className="tier-name">Sovereign Dedicated</h3>
            <p className="tier-desc">Isolated physical database clusters running on KSA bare-metal with air-gapped encryption.</p>
            <div className="tier-price font-mono">
              <span style={{ fontSize: '26px' }}>Custom Node</span>
            </div>
          </div>
          <ul className="tier-features">
            <li><span>✓</span> Completely Air-Gapped Dedicated PostgreSQL 16 DB</li>
            <li><span>✓</span> Custom Subdomain or Enterprise apex domain SSL</li>
            <li><span>✓</span> On-Premise / Local KSA Cloud (STC, Mobily, Oracle)</li>
            <li><span>✓</span> Custom SOCPA / GAZT Integration Pipelines</li>
            <li><span>✓</span> 24/7 Dedicated Infrastructure DevOps Support</li>
          </ul>
          <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => handleSelect('Sovereign Dedicated')}>
            Consult Enterprise Architect
          </button>
        </div>
      </div>
    </section>
  );
};
