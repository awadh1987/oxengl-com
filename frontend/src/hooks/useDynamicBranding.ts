/**
 * OxenGL Two-Tier Dynamic Branding & Asset Injection Hook.
 * File: frontend/src/hooks/useDynamicBranding.ts
 *
 * Implements architectural standard for:
 * 1. Global Platform Admin Portal Level (Default branding)
 * 2. Tenant Workspace Level (Subdomain / workspace custom branding)
 * 3. Dynamic CSS custom property injection (--color-primary, --color-accent)
 * 4. Dynamic title and favicon updating
 */

import { useState, useEffect, useCallback } from 'react';
import { erpApi, PlatformBrandingDto, TenantBrandingDto } from '../services/api';
import { getSubdomain, isApexDomain, isCustomDomain } from '../utils/subdomain';

export type DynamicBranding = {
  isTenant: boolean;
  tenantId?: number | string;
  brandName: string;
  platformName?: string;
  logoUrl: string;
  faviconUrl?: string;
  primaryColor: string;
  accentColor: string;
  customDomain?: string;
  companyNameAr?: string;
  companyNameEn?: string;
  supportEmail?: string;
  supportPhone?: string;
};

export const DEFAULT_PLATFORM_BRANDING: DynamicBranding = {
  isTenant: false,
  brandName: 'OxenGL Enterprise',
  platformName: 'OxenGL Enterprise',
  logoUrl: '/oxengl-logo.svg',
  faviconUrl: '/favicon.ico',
  primaryColor: '#f97316',
  accentColor: '#0f172a',
  companyNameAr: 'منظومة أوكسن السحابية',
  companyNameEn: 'OxenGL Enterprise Cloud',
  supportEmail: 'contact@oxengl.me',
  supportPhone: '+966 50 123 4567',
};

/**
 * Injects dynamic CSS variables and updates document title / favicon.
 */
export const applyBrandingToDOM = (branding: DynamicBranding) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // 1. Inject Standardized CSS custom properties
  root.style.setProperty('--color-primary', branding.primaryColor);
  root.style.setProperty('--color-accent', branding.accentColor);

  // 2. Inject Backward-Compatible custom properties
  root.style.setProperty('--primary-color', branding.primaryColor);
  root.style.setProperty('--secondary-color', branding.accentColor);
  root.style.setProperty('--brand-primary', branding.primaryColor);
  root.style.setProperty('--brand-secondary', branding.accentColor);
  root.style.setProperty('--tenant-primary', branding.primaryColor);
  root.style.setProperty('--tenant-secondary', branding.accentColor);

  // 3. Dynamic Document Title Updating
  if (branding.isTenant) {
    document.title = `${branding.brandName} | OxenGL Workspace`;
  } else {
    const titleBase = branding.platformName || branding.brandName || 'OxenGL Enterprise';
    document.title = `${titleBase} | Unified Logistics & Supply Chain Cloud`;
  }

  // 4. Dynamic Favicon Updating
  const faviconUrl = branding.faviconUrl || '/favicon.ico';
  let iconLink = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.rel = 'shortcut icon';
    document.getElementsByTagName('head')[0]?.appendChild(iconLink);
  }
  if (iconLink.href !== faviconUrl) {
    iconLink.href = faviconUrl;
  }
};

export function useDynamicBranding() {
  const [branding, setBranding] = useState<DynamicBranding>(DEFAULT_PLATFORM_BRANDING);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBranding = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const sub = typeof window !== 'undefined' ? getSubdomain() : null;
    const isApex = typeof window !== 'undefined' ? isApexDomain() : true;
    const isCustom = typeof window !== 'undefined' ? isCustomDomain() : false;

    const storedTenantId = typeof localStorage !== 'undefined' ? localStorage.getItem('oxengl_tenant_id') : null;
    const storedSlug = typeof localStorage !== 'undefined' ? localStorage.getItem('oxengl_tenant_slug') : null;
    const authTier = typeof localStorage !== 'undefined' ? localStorage.getItem('oxengl_auth_tier') : null;

    // A tenant workspace is active if on a tenant subdomain, custom domain, or authenticated in a tenant session
    const isTenantActive = Boolean(
      (sub && sub !== 'www' && sub !== 'app' && sub !== 'api' && sub !== 'admin') ||
      isCustom ||
      (!isApex && authTier !== 'master') ||
      (authTier === 'tenant' && (storedTenantId || storedSlug))
    );

    if (isTenantActive) {
      try {
        const tenantData: TenantBrandingDto = await erpApi.getTenantBranding(storedTenantId || storedSlug || undefined);
        const resolved: DynamicBranding = {
          isTenant: true,
          tenantId: tenantData.tenant_id,
          brandName: tenantData.brand_name || 'Tenant Workspace',
          logoUrl: tenantData.logo_url || '/oxengl-logo.svg',
          faviconUrl: tenantData.favicon_url || '/favicon.ico',
          primaryColor: tenantData.primary_color || '#f97316',
          accentColor: tenantData.accent_color || '#0f172a',
          customDomain: tenantData.custom_domain,
          companyNameAr: tenantData.brand_name,
          companyNameEn: tenantData.brand_name,
        };
        setBranding(resolved);
        applyBrandingToDOM(resolved);
        setIsLoading(false);
        return;
      } catch (err) {
        console.warn('[OxenGL Branding] Tenant branding fetch failed, falling back to global platform branding:', err);
      }
    }

    // Public / Apex Portal Level: Fetch Global Platform Branding
    try {
      const platformData: PlatformBrandingDto = await erpApi.getPlatformBranding();
      const resolved: DynamicBranding = {
        isTenant: false,
        brandName: platformData.brand_name || platformData.platform_name || 'OxenGL Enterprise',
        platformName: platformData.platform_name || 'OxenGL Enterprise',
        logoUrl: platformData.logo_url || platformData.default_logo || '/oxengl-logo.svg',
        faviconUrl: platformData.favicon_url || platformData.default_favicon || '/favicon.ico',
        primaryColor: platformData.primary_color || '#f97316',
        accentColor: platformData.accent_color || '#0f172a',
        companyNameAr: platformData.company_name_ar || 'منظومة أوكسن السحابية',
        companyNameEn: platformData.company_name_en || 'OxenGL Enterprise Cloud',
        supportEmail: platformData.support_email || 'contact@oxengl.me',
        supportPhone: platformData.support_phone || '+966 50 123 4567',
      };
      setBranding(resolved);
      applyBrandingToDOM(resolved);
    } catch (err: any) {
      console.warn('[OxenGL Branding] Platform branding fetch failed, applying baseline defaults:', err);
      setError(err?.message || 'Failed to load branding');
      applyBrandingToDOM(DEFAULT_PLATFORM_BRANDING);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();

    // Listen for workspace switch or popstate events
    const handlePopState = () => {
      fetchBranding();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fetchBranding]);

  return {
    branding,
    isTenant: branding.isTenant,
    isLoading,
    error,
    refreshBranding: fetchBranding,
  };
}
