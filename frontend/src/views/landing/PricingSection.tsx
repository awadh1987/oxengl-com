import React, { useState } from 'react';
import { usePricingPlans } from '../../hooks/usePricingPlans';
import { annualMonthlyEquivalent, annualSavingsLabel, formatSar, isFreePlan } from '../../utils/pricing';

interface PricingSectionProps {
  onSelectTier?: (tier: string) => void;
}

/** Public pricing grid, rendered live from the unified catalog (subscription_plans). */
export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectTier }) => {
  const [billingCycle, setBillingCycle] = useState<'m' | 'y'>('m');
  const { plans, loading, error, reload } = usePricingPlans();

  const handleSelect = (tier: string) => {
    if (onSelectTier) {
      onSelectTier(tier);
    } else {
      const el = document.getElementById('provision');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isAnnual = billingCycle === 'y';
  const savingsLabel = annualSavingsLabel(plans);

  return (
    <section className="pricing-section" id="pricing">
      <div className="section-header">
        <span className="section-pill">DEPLOYMENT TIERS</span>
        <h2 className="section-title">Transparent Enterprise Licensing</h2>
        <p className="section-subtitle">Predictable SaaS and sovereign infrastructure tiers for Saudi contracting, logistics, and enterprise syndicates. All prices in SAR, excluding 15% VAT.</p>

        <div className="pricing-toggle">
          <button
            type="button"
            id="pricing-cycle-monthly"
            className={`toggle-btn ${!isAnnual ? 'active' : ''}`}
            onClick={() => setBillingCycle('m')}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            id="pricing-cycle-annual"
            className={`toggle-btn ${isAnnual ? 'active' : ''}`}
            onClick={() => setBillingCycle('y')}
          >
            Annual Billing {savingsLabel && <span className="discount-tag">{savingsLabel}</span>}
          </button>
        </div>
      </div>

      <div className="pricing-grid">
        {loading && plans.length === 0 &&
          [0, 1, 2].map((key) => <div key={key} className="pricing-card pricing-card--loading" aria-hidden="true" />)}

        {!loading && plans.length === 0 && (
          <div className="pricing-status" role="status">
            {error ? 'Live pricing is temporarily unavailable.' : 'No subscription plans are published yet.'}
            <button type="button" className="btn-secondary" onClick={() => reload()}>Retry</button>
          </div>
        )}

        {plans.map((plan) => {
          const free = isFreePlan(plan);
          const amount = isAnnual ? plan.annual_price : plan.monthly_price;
          const code = plan.name.toLowerCase();
          return (
            <div key={plan.id} id={`pricing-plan-${code}`} className={`pricing-card ${plan.is_featured ? 'featured' : ''}`}>
              {plan.is_featured && <div className="featured-badge">MOST POPULAR</div>}
              <div className="pricing-header">
                <h3 className="tier-name">{plan.display_name}</h3>
                {plan.description && <p className="tier-desc">{plan.description}</p>}
                <div className="tier-price font-mono">
                  {free ? (
                    <span>Free</span>
                  ) : (
                    <>
                      <span className="currency">SAR</span>
                      <span>{formatSar(amount)}</span>
                      <span className="period">{isAnnual ? '/year' : '/month'}</span>
                    </>
                  )}
                </div>
                {isAnnual && !free && (
                  <p className="tier-price-note">≈ SAR {formatSar(Math.round(annualMonthlyEquivalent(plan)))} / month, billed annually</p>
                )}
              </div>
              <ul className="tier-features">
                {(plan.display_features ?? []).map((feature) => (
                  <li key={feature}><span>✓</span> {feature}</li>
                ))}
              </ul>
              <button
                type="button"
                id={`pricing-select-${code}`}
                className={plan.is_featured ? 'btn-primary' : 'btn-secondary'}
                style={{ width: '100%' }}
                onClick={() => handleSelect(plan.name)}
              >
                {free ? 'Start Free Evaluation' : `Select ${plan.display_name}`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
