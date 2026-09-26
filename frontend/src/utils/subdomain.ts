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

export function redirectToTenantSubdomain(tenantSlug: string, path = '/'): boolean {
  if (typeof window === 'undefined') return false;
  if (isLocalhost()) {
    if (path !== window.location.pathname) {
      window.location.href = path;
      return true;
    }
    return false;
  }
  const cleanSlug = tenantSlug.toLowerCase().trim();
  const rootDomain = getRootDomain();
  const targetHost = `${cleanSlug}.${rootDomain}`;

  if (window.location.hostname !== targetHost) {
    window.location.href = `https://${targetHost}${path}`;
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
