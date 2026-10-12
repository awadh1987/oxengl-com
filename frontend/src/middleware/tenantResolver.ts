import { Request, Response, NextFunction } from 'express';

export interface TenantContext {
  id: string;
  tenant_id?: string;
  slug: string;
  name: string;
  customDomain?: string | null;
  tier: 'starter' | 'standard' | 'growth' | 'enterprise';
  isActive: boolean;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    themeMode: 'LIGHT' | 'DARK' | 'CUSTOM';
    logoUrl?: string | null;
  };
  rlsSchema: string;
}

export type ExecutionPlane = 'master' | 'tenant' | 'root' | 'unknown';

export interface ExtendedRequest extends Request {
  plane?: ExecutionPlane;
  tenant?: TenantContext | null;
  [key: string]: any;
}

// ==============================================================================
// SAFEGUARD 1: Redis Cache Invalidation & High-Throughput Tenant Cache
// ==============================================================================
export interface RedisClientInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  flushdb?(): Promise<string>;
}

export class TenantResolutionCache {
  private memoryCache = new Map<string, { tenant: TenantContext | null; expiresAt: number }>();
  private readonly ttlMs: number;
  private redisClient: RedisClientInterface | null = null;
  private isRedisActive = false;

  constructor(ttlMinutes = 5) {
    this.ttlMs = ttlMinutes * 60 * 1000;
    this.initRedisClient();
  }

  private initRedisClient(): void {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        console.log(`[TenantResolutionCache] Initializing Redis connection to ${redisUrl}...`);
        // If external redis is available, bind here
      } catch (err) {
        console.warn('[TenantResolutionCache] Redis connection failed, utilizing high-performance in-memory cache fallback.');
      }
    }
  }

  public setRedisClient(client: RedisClientInterface): void {
    this.redisClient = client;
    this.isRedisActive = true;
    console.log('[TenantResolutionCache] External Redis client attached successfully.');
  }

  public isRedisEnabled(): boolean {
    return this.isRedisActive;
  }

  get(host: string): TenantContext | null | undefined {
    const cleanHost = host.toLowerCase().trim();
    const entry = this.memoryCache.get(cleanHost);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(cleanHost);
      return undefined;
    }
    return entry.tenant;
  }

  set(host: string, tenant: TenantContext | null): void {
    const cleanHost = host.toLowerCase().trim();
    this.memoryCache.set(cleanHost, {
      tenant,
      expiresAt: Date.now() + this.ttlMs,
    });

    if (this.isRedisActive && this.redisClient) {
      const redisKey = `oxengl:tenant:host:${cleanHost}`;
      this.redisClient.set(redisKey, JSON.stringify(tenant), 'EX', Math.floor(this.ttlMs / 1000)).catch((err) => {
        console.warn(`[TenantResolutionCache] Failed writing key ${redisKey} to Redis:`, err);
      });
    }
  }

  /**
   * Safeguard 1: Immediately flush or evict Redis cache entries and in-memory cache
   * whenever a tenant's host or custom domain is modified to eliminate stale lookups.
   */
  invalidate(hostOrDomain: string): void {
    const cleanHost = hostOrDomain.toLowerCase().trim();
    const deleted = this.memoryCache.delete(cleanHost);
    
    // Also remove with port variations if present
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(cleanHost + ':')) {
        this.memoryCache.delete(key);
      }
    }

    if (this.isRedisActive && this.redisClient) {
      const redisKeys = [
        `oxengl:tenant:host:${cleanHost}`,
        `oxengl:tenant:domain:${cleanHost}`
      ];
      this.redisClient.del(...redisKeys).catch((err) => {
        console.warn(`[TenantResolutionCache] Redis DEL error for ${cleanHost}:`, err);
      });
    }

    console.log(`[REDIS CACHE INVALIDATION] Evicted host/domain '${cleanHost}' from routing cache (memory=${deleted}, redis=${this.isRedisActive}).`);
  }

  /**
   * Immediately purge all cache keys linked to a tenant's slug and custom domains.
   */
  invalidateTenant(slug: string, domains: (string | null | undefined)[] = []): void {
    const cleanSlug = slug.toLowerCase().trim();
    const hostsToPurge = [
      cleanSlug,
      `${cleanSlug}.oxengl.me`,
      `${cleanSlug}.localhost`,
      ...domains.filter((d): d is string => Boolean(d)).map((d) => d.toLowerCase().trim())
    ];

    for (const host of hostsToPurge) {
      this.invalidate(host);
    }

    // Invalidate any cache entries referencing this tenant slug
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.tenant && value.tenant.slug.toLowerCase() === cleanSlug) {
        this.memoryCache.delete(key);
      }
    }

    console.log(`[REDIS CACHE INVALIDATION] Purged all resolution keys for tenant '${cleanSlug}' (domains: ${hostsToPurge.join(', ')}).`);
  }

  flush(): void {
    const count = this.memoryCache.size;
    this.memoryCache.clear();
    if (this.isRedisActive && this.redisClient && this.redisClient.flushdb) {
      this.redisClient.flushdb().catch((err) => {
        console.warn('[TenantResolutionCache] Redis flushdb error:', err);
      });
    }
    console.log(`[REDIS CACHE INVALIDATION] Flushed all tenant cache entries (${count} in-memory evicted).`);
  }

  clear(): void {
    this.flush();
  }
}

export const tenantCache = new TenantResolutionCache(5);

// Pre-seeded multi-tenant registry for standard dev & test environments
export const registeredTenants: Record<string, TenantContext> = {
  'horizon-logistics': {
    id: '6ab52593-ab47-4eee-8779-0cdfbb2762da',
    slug: 'horizon-logistics',
    name: 'شركة هورايزون للخدمات اللوجستية (Horizon Logistics)',
    customDomain: 'transport.horizon.sa',
    tier: 'enterprise',
    isActive: true,
    theme: {
      primaryColor: '#F05627',
      secondaryColor: '#1E3A8A',
      themeMode: 'CUSTOM',
      logoUrl: '/logo.png',
    },
    rlsSchema: 'tenant_horizon_logistics',
  },
  'meayon-transport': {
    id: '317f6c7c-7842-4db1-a464-ea9d5f924e22',
    slug: 'meayon-transport',
    name: 'شركة ميون للنقل والخدمات اللوجستية',
    customDomain: 'fleet.meayon.com',
    tier: 'growth',
    isActive: true,
    theme: {
      primaryColor: '#F59E0B',
      secondaryColor: '#10B981',
      themeMode: 'LIGHT',
      logoUrl: '/logo.png',
    },
    rlsSchema: 'tenant_meayon_transport',
  },
  'riyadh-aggregates': {
    id: '8a3e9c12-5b6d-4f7e-9123-0c4b6e8f1a23',
    slug: 'riyadh-aggregates',
    name: 'مؤسسة الرياض لتجارة ونقل البحص والرمل',
    customDomain: 'portal.riyadh-aggregates.sa',
    tier: 'standard',
    isActive: true,
    theme: {
      primaryColor: '#8B5CF6',
      secondaryColor: '#06B6D4',
      themeMode: 'DARK',
      logoUrl: '/logo.png',
    },
    rlsSchema: 'tenant_riyadh_aggregates',
  },
};

// Map of Custom Domains -> Tenant Slugs
export const customDomainRegistry: Record<string, string> = {
  'transport.horizon.sa': 'horizon-logistics',
  'fleet.meayon.com': 'meayon-transport',
  'portal.riyadh-aggregates.sa': 'riyadh-aggregates',
  'custom-client-domain.com': 'horizon-logistics',
};

// Standard platform root domains
const ROOT_DOMAINS = ['localhost', '127.0.0.1'];
const MASTER_SUBDOMAINS = ['admin.localhost'];

/**
 * Express Middleware: Intercepts request, extracts Host header,
 * resolves subdomain or custom domain, and attaches req.tenant.
 */
export function tenantResolverMiddleware(req: ExtendedRequest, res: Response, next: NextFunction): void {
  const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').toString();
  // Strip port if present (e.g., localhost:3000 -> localhost)
  const hostname = hostHeader.split(':')[0].toLowerCase();

  // 1. Check Master Platform Admin Domains
  if (MASTER_SUBDOMAINS.includes(hostname) || req.headers['x-admin-plane'] === 'true') {
    req.plane = 'master';
    req.tenant = null;
    res.setHeader('X-Platform-Plane', 'master');
    return next();
  }

  // 2. Check Cache
  const cached = tenantCache.get(hostname);
  if (cached !== undefined) {
    if (cached) {
      req.plane = 'tenant';
      req.tenant = cached;
      res.setHeader('X-Platform-Plane', 'tenant');
      res.setHeader('X-Tenant-ID', cached.id);
      res.setHeader('X-Tenant-Slug', cached.slug);
      return next();
    }
  }

  // 3. Check Explicit Header Overrides (useful for API clients and test suites)
  const explicitSlug = req.headers['x-tenant-slug'] as string;
  if (explicitSlug && registeredTenants[explicitSlug]) {
    const tenant = registeredTenants[explicitSlug];
    req.plane = 'tenant';
    req.tenant = tenant;
    tenantCache.set(hostname, tenant);
    res.setHeader('X-Platform-Plane', 'tenant');
    res.setHeader('X-Tenant-ID', tenant.id);
    res.setHeader('X-Tenant-Slug', tenant.slug);
    return next();
  }

  // 4. Check Custom Domains (e.g. transport.horizon.sa)
  if (customDomainRegistry[hostname]) {
    const slug = customDomainRegistry[hostname];
    const tenant = registeredTenants[slug];
    if (tenant && tenant.isActive) {
      req.plane = 'tenant';
      req.tenant = tenant;
      tenantCache.set(hostname, tenant);
      res.setHeader('X-Platform-Plane', 'tenant');
      res.setHeader('X-Tenant-ID', tenant.id);
      res.setHeader('X-Tenant-Slug', tenant.slug);
      return next();
    }
  }

  // 5. Check Wildcard Subdomains: {slug}.oxengl.me or {slug}.localhost
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    const potentialSlug = parts[0];
    if (potentialSlug !== 'www' && potentialSlug !== 'app' && potentialSlug !== 'admin') {
      const tenant = registeredTenants[potentialSlug];
      if (tenant && tenant.isActive) {
        req.plane = 'tenant';
        req.tenant = tenant;
        tenantCache.set(hostname, tenant);
        res.setHeader('X-Platform-Plane', 'tenant');
        res.setHeader('X-Tenant-ID', tenant.id);
        res.setHeader('X-Tenant-Slug', tenant.slug);
        return next();
      }
    }
  }

  // 6. Check Root Platform Domain (Landing Portal / Unified Login)
  if (ROOT_DOMAINS.includes(hostname) || hostname === 'localhost' || hostname === '127.0.0.1') {
    req.plane = 'root';
    req.tenant = null;
    res.setHeader('X-Platform-Plane', 'root');
    return next();
  }

  // 7. Unrecognized Domain
  req.plane = 'unknown';
  req.tenant = null;
  res.setHeader('X-Platform-Plane', 'unknown');
  next();
}

/**
 * Mutation Helpers with Automatic Redis Cache Invalidation Safeguards:
 * Eliminates stale lookups whenever tenant entities or custom domains are mutated.
 */
export function registerTenantRecord(tenant: TenantContext): void {
  registeredTenants[tenant.slug] = tenant;
  if (tenant.customDomain) {
    customDomainRegistry[tenant.customDomain] = tenant.slug;
  }
  tenantCache.invalidateTenant(tenant.slug, [tenant.customDomain]);
}

export function updateTenantRecord(slug: string, updates: Partial<TenantContext>): TenantContext | null {
  const existing = registeredTenants[slug];
  if (!existing) return null;
  const oldDomain = existing.customDomain;
  registeredTenants[slug] = { ...existing, ...updates };
  if (updates.customDomain !== undefined) {
    if (oldDomain && oldDomain !== updates.customDomain) {
      delete customDomainRegistry[oldDomain];
      tenantCache.invalidate(oldDomain);
    }
    if (updates.customDomain) {
      customDomainRegistry[updates.customDomain] = slug;
    }
  }
  tenantCache.invalidateTenant(slug, [oldDomain, updates.customDomain]);
  return registeredTenants[slug];
}

export function removeTenantRecord(slug: string): boolean {
  const existing = registeredTenants[slug];
  if (!existing) return false;
  const oldDomain = existing.customDomain;
  if (oldDomain) {
    delete customDomainRegistry[oldDomain];
  }
  delete registeredTenants[slug];
  tenantCache.invalidateTenant(slug, [oldDomain]);
  return true;
}

export function registerCustomDomainMapping(domain: string, slug: string): void {
  const cleanDomain = domain.toLowerCase().trim();
  customDomainRegistry[cleanDomain] = slug;
  if (registeredTenants[slug]) {
    registeredTenants[slug].customDomain = cleanDomain;
  }
  tenantCache.invalidate(cleanDomain);
  tenantCache.invalidateTenant(slug, [cleanDomain]);
}

export function removeCustomDomainMapping(domain: string): void {
  const cleanDomain = domain.toLowerCase().trim();
  const slug = customDomainRegistry[cleanDomain];
  delete customDomainRegistry[cleanDomain];
  if (slug && registeredTenants[slug] && registeredTenants[slug].customDomain === cleanDomain) {
    registeredTenants[slug].customDomain = null;
  }
  tenantCache.invalidate(cleanDomain);
  if (slug) {
    tenantCache.invalidateTenant(slug, [cleanDomain]);
  }
}

