import React from 'react';
import { PricingSection, PricingSectionProps } from './PricingSection';

export const LandingPricing: React.FC<PricingSectionProps> = (props) => {
  return <PricingSection {...props} />;
};

export default LandingPricing;
export * from './PricingSection';
