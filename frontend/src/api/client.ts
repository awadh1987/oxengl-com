import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import {
  setAuthCookie,
  getAuthCookie,
  clearAuthCookie,
  getSubdomain,
  isCustomDomain,
  getEffectiveDomainIdentifier,
} from '../utils/subdomain';

// ==============================================================================
// Storage Keys & Constants
// ==============================================================================

export const AUTH_STORAGE_KEYS = {
  TENANT_ACCESS_TOKEN: 'tenant_access_token',
  ACCESS_TOKEN: 'access_token',
  OXENGL_AUTH_JWT: 'oxengl_auth_jwt',
  TOKEN: 'token',
  OXENGL_ACCESS_TOKEN: 'oxengl_access_token',
  AUTH_TIER: 'oxengl_auth_tier',
  TENANT_SLUG: 'oxengl_tenant_slug',
  TENANT_ID: 'oxengl_tenant_id',
  SESSION_ACTIVE: 'oxengl_session_active',
} as const;

export const TOKEN_STORAGE_KEYS = [
  AUTH_STORAGE_KEYS.TENANT_ACCESS_TOKEN,
  AUTH_STORAGE_KEYS.ACCESS_TOKEN,
  AUTH_STORAGE_KEYS.OXENGL_AUTH_JWT,
  AUTH_STORAGE_KEYS.TOKEN,
  AUTH_STORAGE_KEYS.OXENGL_ACCESS_TOKEN,
] as const;

export const OXENGL_AUTH_TOKEN_KEY = AUTH_STORAGE_KEYS.OXENGL_AUTH_JWT;
export const OXENGL_AUTH_TIER_KEY = AUTH_STORAGE_KEYS.AUTH_TIER;
export const OXENGL_TENANT_SLUG_KEY = AUTH_STORAGE_KEYS.TENANT_SLUG;
export const OXENGL_TENANT_ID_KEY = AUTH_STORAGE_KEYS.TENANT_ID;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(val: any): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

/**
 * Safely decodes JWT claims from a token string without external dependencies.
 */
export function decodeJwtClaims(token: string | null): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const jsonStr = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// ==============================================================================
// Token Retrieval & Storage Lifecycle
// ==============================================================================

/**
 * Checks all storage locations (localStorage, sessionStorage, cookies) for the active JWT token.
 * Automatically synchronizes across all consistent keys when found in any location.
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  // 1. Check localStorage keys in order of precedence
  for (const key of TOKEN_STORAGE_KEYS) {
    const val = localStorage.getItem(key);
    if (val && typeof val === 'string' && val.trim().length > 10) {
      // Synchronize across all other keys if missing
      syncTokenToAllStores(val.trim());
      return val.trim();
    }
  }

  // 2. Check sessionStorage keys
  for (const key of TOKEN_STORAGE_KEYS) {
    try {
      const val = sessionStorage.getItem(key);
      if (val && typeof val === 'string' && val.trim().length > 10) {
        syncTokenToAllStores(val.trim());
        return val.trim();
      }
    } catch {}
  }

  // 3. Check cookies
  const cookieToken = getAuthCookie();
  if (cookieToken && cookieToken.trim().length > 10) {
    syncTokenToAllStores(cookieToken.trim());
    return cookieToken.trim();
  }

  return null;
}

/**
 * Helper to ensure a valid token is present in all expected keys in localStorage and sessionStorage.
 */
function syncTokenToAllStores(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    for (const key of TOKEN_STORAGE_KEYS) {
      if (localStorage.getItem(key) !== token) {
        localStorage.setItem(key, token);
      }
      try {
        if (sessionStorage.getItem(key) !== token) {
          sessionStorage.setItem(key, token);
        }
      } catch {}
    }
  } catch {}
}

export function getAuthTier(): 'master' | 'tenant' | null {
  if (typeof window === 'undefined') return null;
  const tier = (localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TIER) as 'master' | 'tenant');
  if (tier) return tier;
  if (getSubdomain() || isCustomDomain() || localStorage.getItem('tenant_slug') || localStorage.getItem(AUTH_STORAGE_KEYS.TENANT_SLUG)) {
    return 'tenant';
  }
  if (localStorage.getItem('role') === 'Super_Admin') return 'master';
  return null;
}

export function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const effectiveDomain = getEffectiveDomainIdentifier();
  if (effectiveDomain) return effectiveDomain;
  const stored = localStorage.getItem(AUTH_STORAGE_KEYS.TENANT_SLUG) || localStorage.getItem('tenant_slug');
  if (stored) return stored;
  const token = getAuthToken();
  const claims = decodeJwtClaims(token);
  return claims?.tenant_slug || claims?.domain_slug || null;
}

export function getActiveCompanyId(explicitId?: string): string | null {
  if (isValidUUID(explicitId)) {
    return explicitId.trim();
  }

  if (typeof window === 'undefined') return null;

  const effectiveDomain = getEffectiveDomainIdentifier();

  if (effectiveDomain) {
    const rawCompany = localStorage.getItem('oxengl_current_company');
    if (rawCompany) {
      try {
        const c = JSON.parse(rawCompany);
        const matchesDomain =
          c?.slug?.toLowerCase() === effectiveDomain.toLowerCase() ||
          c?.custom_domain?.toLowerCase() === effectiveDomain.toLowerCase() ||
          c?.domain_slug?.toLowerCase() === effectiveDomain.toLowerCase();
        if (matchesDomain && isValidUUID(c?.id)) {
          return c.id.trim();
        }
      } catch {}
    }

    const token = getAuthToken();
    if (token) {
      const claims = decodeJwtClaims(token);
      if (claims) {
        const matchesDomain =
          claims.tenant_slug?.toLowerCase() === effectiveDomain.toLowerCase() ||
          claims.domain_slug?.toLowerCase() === effectiveDomain.toLowerCase();
        const cand = claims.company_id || claims.tenant_id || claims.companyId || claims.tenantId;
        if (matchesDomain && isValidUUID(cand)) {
          return cand.trim();
        }
      }
    }

    const rawUser = localStorage.getItem('oxengl_user') || localStorage.getItem('currentUser');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        const matchesDomain =
          u?.tenant_slug?.toLowerCase() === effectiveDomain.toLowerCase() ||
          u?.domain_slug?.toLowerCase() === effectiveDomain.toLowerCase();
        const cand = u?.company_id || u?.companyId || u?.tenant_id || u?.tenantId || u?.company?.id;
        if (matchesDomain && isValidUUID(cand)) {
          return cand.trim();
        }
      } catch {}
    }

    const storedSlug = localStorage.getItem(AUTH_STORAGE_KEYS.TENANT_SLUG) || localStorage.getItem('tenant_slug');
    if (storedSlug && storedSlug.toLowerCase() === effectiveDomain.toLowerCase()) {
      const directKeys = [AUTH_STORAGE_KEYS.TENANT_ID, 'tenant_id', 'company_id', 'oxengl_tenant_uuid', 'active_company_id'];
      for (const key of directKeys) {
        const val = localStorage.getItem(key);
        if (isValidUUID(val)) {
          return val.trim();
        }
      }
    }

    return null;
  }

  const rawCompany = localStorage.getItem('oxengl_current_company');
  if (rawCompany) {
    try {
      const c = JSON.parse(rawCompany);
      const candidates = [c?.id, c?.company_id, c?.tenant_id, c?.uuid];
      for (const cand of candidates) {
        if (isValidUUID(cand)) {
          return cand.trim();
        }
      }
    } catch {}
  }

  const directKeys = [
    AUTH_STORAGE_KEYS.TENANT_ID,
    'tenant_id',
    'company_id',
    'oxengl_tenant_uuid',
    'active_company_id',
  ];
  for (const key of directKeys) {
    const val = localStorage.getItem(key);
    if (isValidUUID(val)) {
      return val.trim();
    }
  }

  const token = getAuthToken();
  if (token) {
    const claims = decodeJwtClaims(token);
    if (claims) {
      const candidates = [
        claims.company_id,
        claims.tenant_id,
        claims.companyId,
        claims.tenantId,
      ];
      for (const cand of candidates) {
        if (isValidUUID(cand)) {
          try {
            localStorage.setItem(AUTH_STORAGE_KEYS.TENANT_ID, cand.trim());
            localStorage.setItem('tenant_id', cand.trim());
            localStorage.setItem('company_id', cand.trim());
          } catch {}
          return cand.trim();
        }
      }
    }
  }

  const userKeys = ['oxengl_user', 'meayon_user', 'currentUser'];
  for (const key of userKeys) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const u = JSON.parse(raw);
        const candidates = [
          u?.company_id,
          u?.companyId,
          u?.tenant_id,
          u?.tenantId,
          u?.company?.id,
        ];
        for (const cand of candidates) {
          if (isValidUUID(cand)) {
            return cand.trim();
          }
        }
      } catch {}
    }
  }

  return null;
}

export function getTenantId(): string | null {
  return getActiveCompanyId();
}

/**
 * Stores the authenticated session across all consistent keys in localStorage, sessionStorage, and cookies.
 */
export function setAuthSession(
  token: string,
  tier: 'master' | 'tenant',
  tenantSlug?: string | null,
  tenantId?: string | null
): void {
  if (typeof window === 'undefined') return;

  // 1. Set multi-cookie
  setAuthCookie(token);

  // 2. Set all token keys in localStorage
  for (const key of TOKEN_STORAGE_KEYS) {
    localStorage.setItem(key, token);
  }

  // 3. Set all token keys in sessionStorage
  try {
    for (const key of TOKEN_STORAGE_KEYS) {
      sessionStorage.setItem(key, token);
    }
  } catch {}

  // 4. Set auth tier and session active flag
  localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TIER, tier);
  localStorage.setItem(AUTH_STORAGE_KEYS.SESSION_ACTIVE, 'true');

  // 5. Set tenant slug
  const effectiveSlug = tenantSlug || getEffectiveDomainIdentifier();
  if (effectiveSlug) {
    localStorage.setItem(AUTH_STORAGE_KEYS.TENANT_SLUG, effectiveSlug);
    localStorage.setItem('tenant_slug', effectiveSlug);
    try {
      sessionStorage.setItem(AUTH_STORAGE_KEYS.TENANT_SLUG, effectiveSlug);
      sessionStorage.setItem('tenant_slug', effectiveSlug);
    } catch {}
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEYS.TENANT_SLUG);
    localStorage.removeItem('tenant_slug');
    try {
      sessionStorage.removeItem(AUTH_STORAGE_KEYS.TENANT_SLUG);
      sessionStorage.removeItem('tenant_slug');
    } catch {}
  }

  // 6. Set tenant ID (UUID resolution)
  let validTenantId: string | null = null;
  if (isValidUUID(tenantId)) {
    validTenantId = tenantId.trim();
  } else {
    const claims = decodeJwtClaims(token);
    const candidate = claims?.company_id || claims?.tenant_id || claims?.companyId || claims?.tenantId;
    if (isValidUUID(candidate)) {
      validTenantId = candidate.trim();
    }
  }

  if (validTenantId) {
    localStorage.setItem(AUTH_STORAGE_KEYS.TENANT_ID, validTenantId);
    localStorage.setItem('tenant_id', validTenantId);
    localStorage.setItem('company_id', validTenantId);
    try {
      sessionStorage.setItem(AUTH_STORAGE_KEYS.TENANT_ID, validTenantId);
      sessionStorage.setItem('tenant_id', validTenantId);
      sessionStorage.setItem('company_id', validTenantId);
    } catch {}
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEYS.TENANT_ID);
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('company_id');
    try {
      sessionStorage.removeItem(AUTH_STORAGE_KEYS.TENANT_ID);
      sessionStorage.removeItem('tenant_id');
      sessionStorage.removeItem('company_id');
    } catch {}
  }
}

/**
 * Clears all authentication credentials and session tokens from localStorage, sessionStorage, and cookies.
 */
export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;

  // 1. Clear cookies
  clearAuthCookie();

  // 2. Clear token keys from localStorage
  for (const key of TOKEN_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }

  // 3. Clear token keys from sessionStorage
  try {
    for (const key of TOKEN_STORAGE_KEYS) {
      sessionStorage.removeItem(key);
    }
  } catch {}

  // 4. Clear other session/tenant metadata
  const metadataKeys = [
    AUTH_STORAGE_KEYS.AUTH_TIER,
    AUTH_STORAGE_KEYS.TENANT_SLUG,
    'tenant_slug',
    AUTH_STORAGE_KEYS.TENANT_ID,
    'tenant_id',
    'company_id',
    'oxengl_tenant_uuid',
    'active_company_id',
    'oxengl_current_company',
    'oxengl_user',
    'meayon_user',
    'currentUser',
    'role',
    AUTH_STORAGE_KEYS.SESSION_ACTIVE,
  ];

  for (const key of metadataKeys) {
    localStorage.removeItem(key);
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
}

// ==============================================================================
// Route Filtering: Public/Auth vs Tenant-Scoped Data Routes
// ==============================================================================

export const PUBLIC_AUTH_ROUTES: (string | RegExp)[] = [
  /^\/api\/auth\/tenant\/login\/?$/,
  /^\/api\/auth\/master\/login\/?$/,
  /^\/api\/auth\/register-tenant\/?$/,
  /^\/api\/auth\/recover-password\/?$/,
  /^\/api\/auth\/reset-password\/?$/,
  /^\/api\/auth\/verify\/?$/,
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/public\//,
  /^\/api\/v1\/ssl\//,
  /^\/api\/v1\/tenant\/resolve-domain\/?$/,
  /^\/api\/v1\/health\/?$/,
  /^\/api\/health\/?$/,
  /^\/api\/finance\/invoices\/public\//,
  /^\/auth\/2fa\/verify\/?$/,
  /^\/api\/auth\/2fa\/verify\/?$/,
  /^\/2fa\/verify\/?$/,
  /^\/api\/v1\/procurement\/vendor-portal\/login\/?$/,
  /^\/api\/v1\/procurement\/vendor-portal\/register\/?$/,
];

/**
 * Checks whether an endpoint URL is an unauthenticated public or auth-handshake route.
 * Public and auth routes bypass Bearer token injection to avoid sending stale tokens.
 */
export function isPublicOrAuthRoute(url?: string): boolean {
  if (!url) return false;
  let cleanUrl = url;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      cleanUrl = new URL(url).pathname;
    }
  } catch {}
  const path = cleanUrl.split('?')[0].replace(/\/+$/, '') || '/';
  return PUBLIC_AUTH_ROUTES.some((route) =>
    typeof route === 'string' ? path === route : route.test(path)
  );
}

// ==============================================================================
// Session Dropout & Clean Redirect Handlers
// ==============================================================================

let _redirectTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedules a clean redirect to login without leaving dangling promise rejections.
 */
export function scheduleRedirectToLogin(delayMs = 150): void {
  if (typeof window === 'undefined') return;
  if (_redirectTimer) return;
  _redirectTimer = setTimeout(() => {
    _redirectTimer = null;
    const currentPath = window.location.pathname;
    if (
      currentPath.includes('/login') ||
      currentPath.includes('/register') ||
      currentPath === '/' ||
      currentPath === '/landing-nextgen'
    ) {
      return;
    }
    const isMaster = localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TIER) === 'master' || currentPath.startsWith('/admin');
    window.location.replace(isMaster ? '/admin' : '/tenant/login');
  }, delayMs);
}

function handleGlobalErrorNotifications(status: number, errorData: any): void {
  if (typeof window === 'undefined') return;
  let toastMsg = '';
  let errorDetail = '';

  if (typeof errorData?.detail === 'string') {
    errorDetail = errorData.detail;
  } else if (Array.isArray(errorData?.detail)) {
    errorDetail = errorData.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
  } else if (errorData?.message) {
    errorDetail = errorData.message;
  } else if (errorData?.error) {
    errorDetail = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
  }

  if (status === 403) {
    toastMsg = errorDetail || 'Access forbidden: You do not have permission for this resource (403).';
  } else if (status === 422) {
    toastMsg = errorDetail ? `Validation error: ${errorDetail}` : 'Unprocessable Entity: Form validation failed (422).';
  } else if (status >= 500) {
    toastMsg = errorDetail ? `Server error: ${errorDetail}` : `Internal server error (${status}). Please try again later.`;
  }

  if (toastMsg) {
    window.dispatchEvent(
      new CustomEvent('oxengl-toast', {
        detail: { message: toastMsg, type: 'error' },
      })
    );
  }
}

// ==============================================================================
// Axios API Client Instance & Interceptors
// ==============================================================================

export const apiClient: AxiosInstance = axios.create({
  baseURL: typeof window === 'undefined' ? '' : window.location.origin,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request Interceptor: Injects Bearer token & tenant headers for authenticated routes;
// strictly bypasses token injection for public and auth endpoints.
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const url = config.url || '';

    if (isPublicOrAuthRoute(url)) {
      // Public/auth route: strip any stale Authorization header
      if (config.headers && config.headers.Authorization) {
        delete config.headers.Authorization;
      }
      return config;
    }

    // Tenant-scoped / Authenticated route: inject Bearer token
    const token = getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Inject tenant routing and isolation headers
    const activeTenantSlug = getTenantSlug();
    if (activeTenantSlug && config.headers && !config.headers['X-Tenant-Slug']) {
      config.headers['X-Tenant-Slug'] = activeTenantSlug;
    }

    const activeCompanyId = getActiveCompanyId();
    if (activeCompanyId && config.headers) {
      if (!config.headers['X-Company-ID']) {
        config.headers['X-Company-ID'] = activeCompanyId;
      }
      if (!config.headers['X-Tenant-ID']) {
        config.headers['X-Tenant-ID'] = activeCompanyId;
      }
    }

    return config;
  },
  (error: any) => Promise.reject(error)
);

// Response Interceptor: Handles 401 Unauthorized, single retry, session clearing, and clean redirection.
const _retryingAxiosUrls = new Set<string>();

let _pending401ClearTimer: ReturnType<typeof setTimeout> | null = null;
let _is401SessionClearScheduled = false;

export function scheduleDebouncedSessionClear(delayMs = 1500): void {
  if (_is401SessionClearScheduled) return;
  _is401SessionClearScheduled = true;
  _pending401ClearTimer = setTimeout(() => {
    _pending401ClearTimer = null;
    _is401SessionClearScheduled = false;
    clearAuthSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('oxengl-auth-error', {
          detail: {
            status: 401,
            message: 'Authentication session is required or has expired.',
          },
        })
      );
      scheduleRedirectToLogin();
    }
  }, delayMs);
}

export function cancelDebouncedSessionClear(): void {
  if (_pending401ClearTimer) {
    clearTimeout(_pending401ClearTimer);
    _pending401ClearTimer = null;
  }
  _is401SessionClearScheduled = false;
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // A successful response cancels any pending 401 session clear
    cancelDebouncedSessionClear();
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _isRetry?: boolean };
    const url = originalRequest?.url || '';
    const status = error.response?.status;

    // Public and auth endpoints (e.g. login failed with wrong password) must reject without wiping session
    if (isPublicOrAuthRoute(url)) {
      return Promise.reject(error);
    }

    // Authenticated endpoints failing with 401:
    if (status === 401) {
      const token = getAuthToken();

      // Attempt 1 retry if we have a token and haven't retried this URL yet
      if (token && originalRequest && !originalRequest._isRetry && !_retryingAxiosUrls.has(url)) {
        originalRequest._isRetry = true;
        _retryingAxiosUrls.add(url);
        try {
          await new Promise((resolve) => setTimeout(resolve, 150));
          const retryToken = getAuthToken();
          if (retryToken) {
            originalRequest.headers.Authorization = `Bearer ${retryToken}`;
            const activeCompanyId = getActiveCompanyId();
            if (activeCompanyId) {
              originalRequest.headers['X-Company-ID'] = activeCompanyId;
              originalRequest.headers['X-Tenant-ID'] = activeCompanyId;
            }
            const retryResponse = await axios(originalRequest);
            cancelDebouncedSessionClear();
            _retryingAxiosUrls.delete(url);
            return retryResponse;
          }
        } catch {
          // Retry failed, fall through to session dropout handling
        } finally {
          _retryingAxiosUrls.delete(url);
        }
      }

      // Session dropout handling:
      if (!token) {
        clearAuthSession();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('oxengl-auth-error', {
              detail: {
                status: 401,
                message: 'Authentication session is required.',
              },
            })
          );
          scheduleRedirectToLogin();
        }
      } else {
        // Debounce clearing to prevent cascading wipes during parallel requests
        scheduleDebouncedSessionClear();
      }

      const authError = new Error('Authentication session is required');
      (authError as any).status = 401;
      (authError as any).isAuthError = true;
      return Promise.reject(authError);
    }

    const method = (originalRequest?.method || 'GET').toUpperCase();
    const suppressToast =
      originalRequest?.headers?.['X-Suppress-Error-Toast'] === 'true' ||
      originalRequest?.headers?.['x-suppress-error-toast'] === 'true' ||
      (method === 'GET' && url.includes('/api/v1/planning/projects'));

    // Global notifications for 403, 422, 500
    if (typeof window !== 'undefined' && status && !suppressToast) {
      handleGlobalErrorNotifications(status, error.response?.data);
    }

    return Promise.reject(error);
  }
);

// ==============================================================================
// Unified Request Function (Used by ERP API Services)
// ==============================================================================

/**
 * Core type-safe request dispatcher backed by the configured Axios API client.
 * Supports path, companyId, and RequestInit-compatible options.
 */
export async function request<T>(path: string, companyId?: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        headers[key] = value;
      }
    } else if (typeof options.headers === 'object') {
      Object.assign(headers, options.headers);
    }
  }

  const activeCompanyId = getActiveCompanyId(companyId);
  if (activeCompanyId) {
    if (!headers['X-Company-ID']) headers['X-Company-ID'] = activeCompanyId;
    if (!headers['X-Tenant-ID']) headers['X-Tenant-ID'] = activeCompanyId;
  }

  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  if (isFormData) {
    delete headers['Content-Type'];
  }

  let data = options?.body;
  if (typeof data === 'string') {
    const contentType = headers['Content-Type'] || headers['content-type'];
    if (!contentType || contentType.includes('application/json')) {
      try {
        data = JSON.parse(data);
      } catch {
        // Pass string as raw data
      }
    }
  }

  try {
    const response = await apiClient.request<T>({
      url: path,
      method,
      headers,
      data,
      signal: options?.signal,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    return response.data;
  } catch (err: any) {
    let errorDetail = '';
    if (err?.response?.data) {
      const respData = err.response.data;
      if (typeof respData.detail === 'string') {
        errorDetail = respData.detail;
      } else if (Array.isArray(respData.detail)) {
        errorDetail = respData.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
      } else if (respData.message) {
        errorDetail = respData.message;
      } else if (respData.error) {
        errorDetail = typeof respData.error === 'string' ? respData.error : JSON.stringify(respData.error);
      }
    }
    if (!errorDetail && err?.message) {
      errorDetail = err.message;
    }
    throw new Error(errorDetail || `API request failed: ${err?.response?.status || 'network_error'}`);
  }
}

export default apiClient;
