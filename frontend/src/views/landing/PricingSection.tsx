import React, { useState } from 'react';
import {
  PricingCmsContent,
  PricingTierCms,
  DEFAULT_PRICING_TIERS,
} from '../../hooks/useLandingContent';

export interface PricingSectionProps {
  onSelectTier?: (tier: string) => void;
  cmsPricing?: Partial<PricingCmsContent>;
  cmsContent?: {
    pricing?: Partial<PricingCmsContent>;
  };
}

interface ParsedPrice {
  isNumber: boolean;
  currency: string;
  amount: string;
  period: string;
  rawAmount: number;
  displayText?: string;
}

function parseTierPrice(
  val: string | number | undefined,
  cycle: 'm' | 'y'
): ParsedPrice {
  if (val === undefined || val === null || val === '') {
    return {
      isNumber: false,
      currency: '',
      amount: '',
      period: '',
      rawAmount: 0,
      displayText: 'Custom Quote',
    };
  }

  if (typeof val === 'number') {
    if (val === 0) {
      return {
        isNumber: false,
        currency: '',
        amount: '',
        period: '',
        rawAmount: 0,
        displayText: 'Free',
      };
    }
    return {
      isNumber: true,
      currency: 'SAR',
      amount: val.toLocaleString('en-US'),
      period: cycle === 'y' ? '/year' : '/month',
      rawAmount: val,
    };
  }

  const str = String(val).trim();
  const lower = str.toLowerCase();
  if (
    lower.includes('custom') ||
    lower.includes('contact') ||
    lower.includes('free') ||
    lower.includes('quote')
  ) {
    return {
      isNumber: false,
      currency: '',
      amount: '',
      period: '',
      rawAmount: 0,
      displayText: str,
    };
  }

  const numStr = str.replace(/[^0-9.]/g, '');
  const num = parseFloat(numStr);
  if (!isNaN(num) && num > 0) {
    return {
      isNumber: true,
      currency: 'SAR',
      amount: num.toLocaleString('en-US'),
      period: cycle === 'y' ? '/year' : '/month',
      rawAmount: num,
    };
  }

  return {
    isNumber: false,
    currency: '',
    amount: '',
    period: '',
    rawAmount: 0,
    displayText: str,
  };
}

/**
 * Dynamic Landing Pricing Grid, rendered live from Landing CMS Studio tiers.
 */
export const PricingSection: React.FC<PricingSectionProps> = ({
  onSelectTier,
  cmsPricing,
  cmsContent,
}) => {
  const [billingCycle, setBillingCycle] = useState<'m' | 'y'>('m');

  const pricingSource = cmsPricing || cmsContent?.pricing;
  const isVisible = pricingSource?.isVisible !== false;

  if (!isVisible) {
    return null;
  }

  const title =
    pricingSource?.title || 'Transparent Enterprise Licensing';
  const subtitle =
    pricingSource?.subtitle ||
    'Predictable SaaS and sovereign infrastructure tiers for Saudi contracting, logistics, and enterprise syndicates. All prices in SAR, excluding 15% VAT.';

  const tiers: PricingTierCms[] =
    Array.isArray(pricingSource?.tiers) && pricingSource.tiers.length > 0
      ? pricingSource.tiers
      : DEFAULT_PRICING_TIERS;

  const isAnnual = billingCycle === 'y';

  return (
    <section className="pricing-section" id="pricing">
      <div className="section-header">
        <span className="section-pill">DEPLOYMENT TIERS</span>
        <h2 className="section-title">{title}</h2>
        <p className="section-subtitle">{subtitle}</p>

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
            Annual Billing <span className="discount-tag">SAVE ~17%</span>
          </button>
        </div>
      </div>

      <div className="pricing-grid">
        {tiers.map((tier, idx) => {
          const name = tier.name || tier.plan_name || tier.title || `Tier ${idx + 1}`;
          const code = (tier.id || name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const description = tier.tagline || tier.description || '';
          const isFeatured = Boolean(tier.is_featured ?? tier.featured ?? tier.highlighted);
          const badge = tier.badge || (isFeatured ? 'MOST POPULAR' : undefined);

          // Pricing calculation based on billing cycle
          const rawPrice = isAnnual
            ? tier.price_annual ||
              tier.annual_price ||
              tier.price_monthly ||
              tier.price ||
              tier.monthly_price
            : tier.price_monthly ||
              tier.price ||
              tier.monthly_price;

          const parsed = parseTierPrice(rawPrice, billingCycle);

          // Calculate equivalent monthly price note for annual billing
          let annualMonthlyNote: string | null = null;
          if (isAnnual && parsed.isNumber && parsed.rawAmount > 0) {
            const monthlyEquiv = Math.round(parsed.rawAmount / 12);
            annualMonthlyNote = `≈ SAR ${monthlyEquiv.toLocaleString('en-US')} / month, billed annually`;
          }

          // Features extraction
          const rawFeatures = tier.features ?? tier.display_features ?? [];
          let featureList: string[] = [];
          if (Array.isArray(rawFeatures)) {
            featureList = rawFeatures.map(String).map((f) => f.trim()).filter(Boolean);
          } else if (typeof rawFeatures === 'string') {
            featureList = rawFeatures.split('\n').map((f) => f.trim()).filter(Boolean);
          }

          // Call to Action
          const isFree = !parsed.isNumber && parsed.displayText?.toLowerCase() === 'free';
          const defaultCtaLabel = isFree
            ? 'Start Free Evaluation'
            : isFeatured
            ? 'Start Enterprise Pilot'
            : `Select ${name}`;
          const ctaLabel =
            tier.cta?.label ||
            tier.cta_label ||
            defaultCtaLabel;
          const ctaUrl =
            tier.cta?.url ||
            tier.cta_url ||
            `/register?plan=${code}`;

          const handleCtaClick = (e: React.MouseEvent) => {
            if (
              ctaUrl.startsWith('mailto:') ||
              ctaUrl.startsWith('http://') ||
              ctaUrl.startsWith('https://')
            ) {
              return;
            }

            if (onSelectTier) {
              e.preventDefault();
              onSelectTier(code);
            } else {
              const el =
                document.getElementById('namespace-slug') ||
                document.getElementById('provision');
              if (el) {
                e.preventDefault();
                el.scrollIntoView({ behavior: 'smooth' });
              }
            }
          };

          return (
            <div
              key={tier.id || idx}
              id={`pricing-plan-${code}`}
              className={`pricing-card ${isFeatured ? 'featured' : ''}`}
            >
              {badge && <div className="featured-badge">{badge}</div>}

              <div className="pricing-header">
                <h3 className="tier-name">{name}</h3>
                {description && <p className="tier-desc">{description}</p>}

                <div className="tier-price font-mono">
                  {parsed.isNumber ? (
                    <>
                      <span className="currency">{parsed.currency}</span>
                      <span>{parsed.amount}</span>
                      <span className="period">{parsed.period}</span>
                    </>
                  ) : (
                    <span>{parsed.displayText || 'Custom Quote'}</span>
                  )}
                </div>

                {annualMonthlyNote && (
                  <p className="tier-price-note">{annualMonthlyNote}</p>
                )}
              </div>

              <ul className="tier-features">
                {featureList.map((feat, fIdx) => (
                  <li key={fIdx}>
                    <span>✓</span> {feat}
                  </li>
                ))}
              </ul>

              <a
                href={ctaUrl}
                id={`pricing-select-${code}`}
                className={isFeatured ? 'btn-primary' : 'btn-secondary'}
                style={{
                  width: '100%',
                  textAlign: 'center',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                }}
                onClick={handleCtaClick}
              >
                {ctaLabel}
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default PricingSection;
