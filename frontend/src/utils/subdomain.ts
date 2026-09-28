/**
 * Subdomain and cross-subdomain authentication utilities for OxenGL Enterprise Cloud
 */

export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname.includes('localhost') || hostname.includes('127.0.0.1');
}

export function getRootDomain(): string {
  if (typeof window === 'undefined') return 'oxengl.me';
  const hostname = window.location.hostname;
  if (isLocalhost()) {
    return 'localhost';
  }
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

export function getSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  if (isLocalhost()) {
    return null;
  }
  const parts = hostname.split('.');
  // e.g. tenant.oxengl.me => parts: ['tenant', 'oxengl', 'me'], length: 3
  if (parts.length >= 3) {
    const sub = parts[0].toLowerCase().trim();
    if (sub !== 'www' && sub !== 'app') {
      return sub;
    }
  }
  return null;
}

export function isPlatformDomain(): boolean {
  if (typeof window === 'undefined') return true;
  const hostname = window.location.hostname.toLowerCase();
  if (isLocalhost()) return true;
  return (
    hostname === 'oxengl.me' ||
    hostname.endsWith('.oxengl.me') ||
    hostname === 'oxengl.com' ||
    hostname.endsWith('.oxengl.com')
  );
}

export function getCustomDomain(): string | null {
  if (typeof window === 'undefined') return null;
  if (isLocalhost() || isPlatformDomain()) return null;
  return window.location.hostname.toLowerCase().trim();
}

export function isCustomDomain(): boolean {
  return getCustomDomain() !== null;
}

export function getEffectiveDomainIdentifier(): string | null {
  return getCustomDomain() || getSubdomain();
}

export function isApexDomain(): boolean {
  return getSubdomain() === null && !isCustomDomain();
}

export function getBasePlatformDomain(): string {
  if (typeof window === 'undefined') return 'oxengl.me';
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.includes('oxengl.com')) return 'oxengl.com';
  if (hostname.includes('oxengl.me')) return 'oxengl.me';
  if (isLocalhost()) return 'localhost';

  const parts = hostname.split('.');
  if (parts.length >= 2 && !/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return parts.slice(-2).join('.');
  }
  return 'oxengl.me';
}

export interface TenantRedirectTarget {
  slug?: string | null;
  tenant_slug?: string | null;
  custom_domain?: string | null;
  domain?: string | null;
  target?: string | null;
  path?: string;
}

export function buildTenantAbsoluteUrl(
  tenantData?: TenantRedirectTarget | string | null,
  fallbackPath = '/operations/daily'
): string {
  if (typeof window === 'undefined') return fallbackPath;

  const data: TenantRedirectTarget = typeof tenantData === 'string'
    ? { slug: tenantData }
    : (tenantData || {});

  const targetPath = data.path || fallbackPath;
  const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;

  // 1. CUSTOM DOMAIN ROUTING:
  // If the tenant payload contains a configured custom_domain or domain,
  // redirect absolutely to https://<custom_domain>/operations/daily (or their dashboard home).
  const rawCustomDomain = (data.custom_domain || data.domain || '').trim().toLowerCase();
  if (
    rawCustomDomain &&
    !rawCustomDomain.includes('oxengl.me') &&
    !rawCustomDomain.includes('oxengl.com') &&
    !rawCustomDomain.includes('localhost') &&
    !rawCustomDomain.includes('127.0.0.1')
  ) {
    const cleanDomain = rawCustomDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `https://${cleanDomain}${cleanPath}`;
  }

  // 2. SUBDOMAIN FALLBACK ROUTING:
  // If no custom domain is present, extract the base platform domain (e.g., oxengl.me)
  // and redirect absolutely to https://<slug>.<base_domain>/operations/daily
  const slug = (data.slug || data.tenant_slug || '').trim().toLowerCase();
  const currentHost = window.location.hostname.toLowerCase();
  const isLocal = isLocalhost();

  if (isLocal) {
    const port = window.location.port ? `:${window.location.port}` : '';
    const protocol = window.location.protocol || 'http:';
    if (slug && !currentHost.startsWith(`${slug}.`)) {
      return `${protocol}//${slug}.localhost${port}${cleanPath}`;
    }
    return `${protocol}//${window.location.host}${cleanPath}`;
  }

  const baseDomain = getBasePlatformDomain();
  if (slug) {
    return `https://${slug}.${baseDomain}${cleanPath}`;
  }

  return `https://${baseDomain}${cleanPath}`;
}

export function redirectToTenantWorkspace(
  tenantData?: TenantRedirectTarget | string | null,
  fallbackPath = '/operations/daily'
): void {
  if (typeof window === 'undefined') return;
  const targetUrl = buildTenantAbsoluteUrl(tenantData, fallbackPath);
  window.location.href = targetUrl;
}

export function redirectToTenantSubdomain(tenantSlug: string, path = '/operations/daily'): boolean {
  if (typeof window === 'undefined') return false;
  const targetUrl = buildTenantAbsoluteUrl({ slug: tenantSlug, path });
  if (window.location.href !== targetUrl) {
    window.location.href = targetUrl;
    return true;
  }
  return false;
}


export function setAuthCookie(token: string): void {
  if (typeof document === 'undefined') return;
  if (isLocalhost()) {
    document.cookie = `oxengl_token=${token}; path=/; samesite=lax`;
  } else {
    const rootDomain = getRootDomain();
    document.cookie = `oxengl_token=${token}; domain=.${rootDomain}; path=/; secure; samesite=lax`;
  }
}

export function getAuthCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)oxengl_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearAuthCookie(): void {
  if (typeof document === 'undefined') return;
  if (isLocalhost()) {
    document.cookie = 'oxengl_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax';
  } else {
    const rootDomain = getRootDomain();
    document.cookie = `oxengl_token=; domain=.${rootDomain}; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; secure; samesite=lax`;
  }
}
