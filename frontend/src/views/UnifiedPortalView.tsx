import React from 'react';
import { LandingPageView } from './LandingPageView';
import { redirectToTenantSubdomain } from '../utils/subdomain';

export const handleTenantRedirection = (tenantSlug: string, path = '/'): boolean => {
  return redirectToTenantSubdomain(tenantSlug, path);
};

export const UnifiedPortalView: React.FC = () => {
  return <LandingPageView />;
};

export { LandingPageView };
export default UnifiedPortalView;
