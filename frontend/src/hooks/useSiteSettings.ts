import { useEffect, useState } from 'react';

export interface SiteSettings {
  site_logo: string;
  site_name: string;
  site_description: string;
  site_tagline: string;
  landing_headline: string;
  landing_subheadline: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  site_name: 'OxenGL',
  site_logo: '/oxengl-wordmark.svg',
  site_description: 'Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.',
  site_tagline: 'Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.',
  landing_headline: 'Sovereign Multi-Tenant ERP Architecture for the Kingdom of Saudi Arabia',
  landing_subheadline: 'Sub-millisecond query isolation, cryptographic ZATCA Phase 2 compliance, and raw quarry logistics orchestration—engineered on bare-metal PostgreSQL 16 and FastAPI.',
  contact_email: 'ops@oxengl.me',
  contact_phone: '+966 11 000 0000',
  contact_address: 'Riyadh, Saudi Arabia',
};

export const SITE_SETTING_KEYS: (keyof SiteSettings)[] = [
  'site_name',
  'site_logo',
  'site_description',
  'site_tagline',
  'landing_headline',
  'landing_subheadline',
  'contact_email',
  'contact_phone',
  'contact_address',
];

// In-memory module cache to prevent duplicate fetches across components
let cachedSettings: SiteSettings = { ...DEFAULT_SITE_SETTINGS };
let hasLoadedOnce = false;
const listeners = new Set<(settings: SiteSettings) => void>();

export function notifySiteSettingsUpdated(updated: Partial<SiteSettings>) {
  cachedSettings = {
    ...cachedSettings,
    ...updated,
    site_tagline: updated.site_tagline || updated.site_description || cachedSettings.site_tagline,
    site_description: updated.site_description || updated.site_tagline || cachedSettings.site_description,
  };
  listeners.forEach((listener) => listener(cachedSettings));
}

export async function fetchPublicSiteSettings(): Promise<SiteSettings> {
  const res = await fetch('/api/settings/public', { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load site settings (${res.status})`);
  const data = await res.json();
  const merged: SiteSettings = {
    ...DEFAULT_SITE_SETTINGS,
    ...data,
    site_tagline: data.site_tagline || data.site_description || DEFAULT_SITE_SETTINGS.site_tagline,
    site_description: data.site_description || data.site_tagline || DEFAULT_SITE_SETTINGS.site_description,
  };
  cachedSettings = merged;
  hasLoadedOnce = true;
  listeners.forEach((listener) => listener(cachedSettings));
  return merged;
}

/** Loads public site settings; initialized with defaults so callers never render empty slots. */
export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(cachedSettings);
  const [loading, setLoading] = useState(!hasLoadedOnce);

  useEffect(() => {
    let cancelled = false;

    const listener = (newSettings: SiteSettings) => {
      if (!cancelled) setSettings(newSettings);
    };
    listeners.add(listener);

    fetchPublicSiteSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        /* retain fallback cache */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return { settings, loading };
}
