import { useEffect, useState } from 'react';

export interface SiteSettings {
  landing_headline: string;
  landing_subheadline: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
}

export const SITE_SETTING_KEYS: (keyof SiteSettings)[] = [
  'landing_headline', 'landing_subheadline', 'contact_email', 'contact_phone', 'contact_address',
];

export async function fetchPublicSiteSettings(): Promise<Partial<SiteSettings>> {
  const res = await fetch('/api/settings/public', { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load site settings (${res.status})`);
  return res.json();
}

/** Loads public site settings on mount; `settings` stays empty until loaded so callers can fall back. */
export function useSiteSettings() {
  const [settings, setSettings] = useState<Partial<SiteSettings>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPublicSiteSettings()
      .then((data) => { if (!cancelled) setSettings(data); })
      .catch(() => { /* keep fallbacks */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { settings, loading };
}
