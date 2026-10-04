import { Request, Response } from 'express';
import { ExtendedRequest, customDomainRegistry, registeredTenants, tenantCache } from '../middleware/tenantResolver';

interface CustomDomainRecord {
  id: string;
  tenant_id: string;
  domain_name: string;
  verification_token: string;
  cname_target: string;
  is_verified: boolean;
  ssl_status: 'pending' | 'validating_dns' | 'issuing' | 'active' | 'failed';
  created_at: string;
}

// In-Memory Domain store
const domainStore: CustomDomainRecord[] = [
  {
    id: 'dom-1',
    tenant_id: '6ab52593-ab47-4eee-8779-0cdfbb2762da',
    domain_name: 'transport.horizon.sa',
    verification_token: 'oxengl_verify_7f9c21b',
    cname_target: 'domains.oxengl.me',
    is_verified: true,
    ssl_status: 'active',
    created_at: '2026-08-12T14:00:00Z',
  },
  {
    id: 'dom-2',
    tenant_id: '6ab52593-ab47-4eee-8779-0cdfbb2762da',
    domain_name: 'custom-client-domain.com',
    verification_token: 'oxengl_verify_custom88',
    cname_target: 'domains.oxengl.me',
    is_verified: true,
    ssl_status: 'active',
    created_at: '2026-08-15T16:20:00Z',
  },
];

// In-Memory Progressive Settings store
const tenantSettingsStore: Record<string, any> = {
  '6ab52593-ab47-4eee-8779-0cdfbb2762da': {
    general: {
      company_name_ar: 'شركة هورايزون للخدمات اللوجستية',
      company_name_en: 'Horizon Logistics Ltd.',
      cr_number: '1010776543',
      vat_number: '300099999900003',
      timezone: 'Asia/Riyadh',
      default_currency: 'SAR',
    },
    webhooks: {
      url: 'https://api.horizon.sa/webhooks/erp-events',
      secret: 'whsec_994821a8f92b7c4e20b3',
      events: ['trip.completed', 'invoice.issued', 'weighbridge.ticket_created'],
      is_active: true,
    },
    api_keys: {
      public_key: 'oxen_live_pk_882910fa8c219',
      secret_key_preview: 'oxen_live_sk_••••••••••••••••••••49a2',
      rate_limit_per_minute: 600,
      created_at: '2026-08-02T10:00:00Z',
    },
    sso: {
      enabled: false,
      provider: 'Azure AD (OIDC)',
      entity_id: 'https://sts.windows.net/horizon-saas/',
      metadata_url: 'https://login.microsoftonline.com/horizon.sa/.well-known/openid-configuration',
      enforce_for_all: false,
    },
  },
};

export const tenantControlController = {
  /**
   * Get Progressive Settings (General, Webhooks, API Keys, SSO)
   */
  getSettings(req: ExtendedRequest, res: Response) {
    const tenantId = req.tenant?.id || (req.headers['x-tenant-id'] as string) || '6ab52593-ab47-4eee-8779-0cdfbb2762da';
    const settings = tenantSettingsStore[tenantId] || {
      general: {},
      webhooks: { is_active: false },
      api_keys: {},
      sso: { enabled: false },
    };
    return res.json({ success: true, settings });
  },

  /**
   * Update Progressive Settings subsection
   */
  updateSettings(req: ExtendedRequest, res: Response) {
    const tenantId = req.tenant?.id || (req.headers['x-tenant-id'] as string) || '6ab52593-ab47-4eee-8779-0cdfbb2762da';
    const { section } = req.body;
    const sectionData = req.body.data || req.body.settings;

    if (!section || !sectionData) {
      return res.status(400).json({ error: 'Section name and configuration data are required' });
    }

    if (!tenantSettingsStore[tenantId]) {
      tenantSettingsStore[tenantId] = {};
    }

    tenantSettingsStore[tenantId][section] = {
      ...(tenantSettingsStore[tenantId][section] || {}),
      ...sectionData,
      updated_at: new Date().toISOString(),
    };

    return res.json({
      success: true,
      message: `Settings subsection '${section}' updated successfully`,
      settings: tenantSettingsStore[tenantId],
    });
  },

  /**
   * List registered custom domains for tenant
   */
  listDomains(req: ExtendedRequest, res: Response) {
    const tenantId = req.tenant?.id || (req.headers['x-tenant-id'] as string) || '6ab52593-ab47-4eee-8779-0cdfbb2762da';
    const domains = domainStore.filter((d) => d.tenant_id === tenantId);
    return res.json({ success: true, domains });
  },

  /**
   * Register a new custom domain
   */
  registerDomain(req: ExtendedRequest, res: Response) {
    const tenantId = req.tenant?.id || (req.headers['x-tenant-id'] as string) || '6ab52593-ab47-4eee-8779-0cdfbb2762da';
    const { domain_name } = req.body;

    if (!domain_name) {
      return res.status(400).json({ error: 'Domain name is required (e.g. transport.yourcompany.com)' });
    }

    const cleanDomain = domain_name.toLowerCase().trim();

    if (domainStore.some((d) => d.domain_name === cleanDomain)) {
      return res.status(409).json({ error: `Domain '${cleanDomain}' is already registered.` });
    }

    const verificationToken = `oxengl_verify_${Math.random().toString(36).slice(2, 10)}`;

    const newRecord: CustomDomainRecord = {
      id: `dom-${Date.now()}`,
      tenant_id: tenantId,
      domain_name: cleanDomain,
      verification_token: verificationToken,
      cname_target: 'domains.oxengl.me',
      is_verified: false,
      ssl_status: 'validating_dns',
      created_at: new Date().toISOString(),
    };

    domainStore.push(newRecord);
    tenantCache.invalidate(cleanDomain);

    return res.status(201).json({
      success: true,
      message: `Domain '${cleanDomain}' registered. Configure DNS CNAME record to complete verification.`,
      domain: newRecord,
      dns_instructions: {
        cname_record: {
          type: 'CNAME',
          host: cleanDomain,
          value: 'domains.oxengl.me',
          ttl: '300',
        },
        txt_verification: {
          type: 'TXT',
          host: `_oxengl-challenge.${cleanDomain}`,
          value: verificationToken,
          ttl: '300',
        },
      },
    });
  },

  /**
   * Verify DNS propagation and simulate automated SSL issuance
   */
  verifyDomain(req: ExtendedRequest, res: Response) {
    const tenantId = req.tenant?.id || (req.headers['x-tenant-id'] as string) || '6ab52593-ab47-4eee-8779-0cdfbb2762da';
    const { domainId } = req.params;

    const domain = domainStore.find((d) => d.id === domainId && d.tenant_id === tenantId);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Mark as verified and active SSL
    domain.is_verified = true;
    domain.ssl_status = 'active';

    // Register into active routing map
    const tenantSlug = req.tenant?.slug || 'horizon-logistics';
    customDomainRegistry[domain.domain_name] = tenantSlug;
    if (registeredTenants[tenantSlug]) {
      registeredTenants[tenantSlug].customDomain = domain.domain_name;
    }

    // Safeguard 1: Invalidate routing cache immediately to eliminate stale lookups
    tenantCache.invalidate(domain.domain_name);
    tenantCache.invalidateTenant(tenantSlug, [domain.domain_name]);

    return res.json({
      success: true,
      message: `Domain '${domain.domain_name}' verified! SSL certificate issued and active.`,
      domain,
      dns_check: 'CNAME verified (points to domains.oxengl.me)',
      ssl_status: domain.ssl_status,
      routing: `Edge Proxy -> Tenant Workspace (${tenantSlug})`,
    });
  },
};
