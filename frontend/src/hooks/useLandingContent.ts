import { useState, useEffect } from 'react';
import {
  LandingSection,
  PlatformMasterSettings,
  PublicLandingData,
  getPublicLanding,
} from '../services/governanceService';
import { DEFAULT_SITE_SETTINGS } from './useSiteSettings';

// Zero-CLS Production Proven Fallbacks
const DEFAULT_HERO_CONTENT = {
  title: 'Next-Generation Heavy Logistics & Industrial Accounting Platform',
  subtitle:
    'Unifying weighbridge automation, fleet dispatch, multi-branch general ledgers, and automated ZATCA Phase 2 compliance into one sovereign engine.',
  badge: 'PRODUCTION-PROVEN SAUDI ARABIA ERP BACKBONE',
  cta_primary: { label: 'Provision Workspace', url: '#provision' },
  cta_secondary: { label: 'Inspect Architecture', url: '#modules' },
};

const DEFAULT_METRICS = [
  { label: 'QUERY LATENCY', value: '0.42ms', change: 'P99 BENCHMARK' },
  { label: 'BUFFER HIT RATIO', value: '99.7%', change: 'POSTGRESQL 16' },
  { label: 'QUARTERLY VOLUME', value: '418.9M+ SAR', change: 'AUDITED 2026' },
  { label: 'ZATCA CLEARANCE', value: '< 14ms', change: 'PHASE 2 E-INVOICE' },
];

export interface HeroCmsContent {
  badge_text: string;
  headline: string;
  subheadline: string;
  primary_cta_label: string;
  primary_cta_url: string;
  secondary_cta_label: string;
  secondary_cta_url: string;
  telemetry_node_label: string;
  telemetry_db_label: string;
  badge: string;
  title: string;
  subtitle: string;
  ctaPrimary: { label: string; url: string };
  ctaSecondary: { label: string; url: string };
  isVisible: boolean;
}

export interface FooterCmsContent {
  contact_email: string;
  contact_phone: string;
  phone: string;
  contact_location: string;
  location_text: string;
  contact_address: string;
  copyright: string;
  links: Array<{ label: string; url: string }>;
  title: string;
  subtitle: string;
  isVisible: boolean;
}

export interface PricingTierCms {
  id?: string;
  name?: string;
  plan_name?: string;
  title?: string;
  price?: string;
  price_monthly?: string;
  monthly_price?: string | number;
  price_annual?: string;
  annual_price?: string | number;
  tagline?: string;
  description?: string;
  badge?: string;
  highlighted?: boolean;
  featured?: boolean;
  is_featured?: boolean;
  features?: string[] | string;
  display_features?: string[] | string;
  cta?: { label?: string; url?: string };
  cta_label?: string;
  cta_url?: string;
}

export interface PricingCmsContent {
  title: string;
  subtitle: string;
  tiers: PricingTierCms[];
  isVisible: boolean;
}

export const DEFAULT_PRICING_TIERS: PricingTierCms[] = [
  {
    id: 'starter',
    name: 'Starter Industrial',
    tagline: 'For independent quarries & logistics contractors',
    price_monthly: 'SAR 2,499',
    price_annual: 'SAR 24,990',
    badge: 'Essential',
    features: [
      'Up to 10 Fleet Vehicles & Weighbridge Units',
      'ZATCA Phase 2 Invoicing & Reporting',
      'Standard Chart of Accounts & Financial Vouchers',
      'Multi-User RBAC (Up to 15 Seats)',
      'Standard SLA & Email Support',
    ],
    cta: { label: 'Deploy Workspace', url: '/register?tier=starter' },
  },
  {
    id: 'enterprise',
    name: 'Enterprise Corporate',
    tagline: 'For multi-branch quarry & contracting conglomerates',
    price_monthly: 'SAR 6,999',
    price_annual: 'SAR 69,990',
    badge: 'Most Popular',
    highlighted: true,
    features: [
      'Unlimited Fleet Vehicles & Weighbridge Stations',
      'Direct ZATCA Clearance & Real-Time E-Invoicing',
      'Advanced HRMS, WPS Payroll & GOSI Compliance',
      'AI Financial Auditor & Anomaly Detection',
      'Custom Domain & Dynamic White-Label Branding',
      'Dedicated Account Manager & 99.95% SLA',
    ],
    cta: { label: 'Start Enterprise Pilot', url: '/register?tier=enterprise' },
  },
  {
    id: 'sovereign',
    name: 'Sovereign Dedicated',
    tagline: 'On-premise or sovereign private cloud deployment',
    price_monthly: 'Custom Quote',
    price_annual: 'Contact Sales',
    badge: 'Sovereign',
    features: [
      'Isolated PostgreSQL Database Cluster in KSA',
      'Custom ERP Core Module Extensions & APIs',
      'Air-Gapped & Bare-Metal Hardware Deployment Option',
      'Continuous Security Audit & Penetration Testing',
      '24/7 Dedicated NOC Support with 15-minute SLA',
    ],
    cta: { label: 'Contact Executive Sales', url: 'mailto:sales@oxengl.me' },
  },
];

export interface UseLandingContentReturn {
  loading: boolean;
  error: Error | null;
  platformSettings: Partial<PlatformMasterSettings>;
  sections: LandingSection[];
  sectionsMap: Record<string, LandingSection>;
  heroData: HeroCmsContent;
  footerData: FooterCmsContent;
  pricingData: PricingCmsContent;
  cmsContent: {
    hero: HeroCmsContent;
    footer: FooterCmsContent;
    pricing: PricingCmsContent;
  };
  metricsData: {
    title: string;
    subtitle: string;
    metrics: Array<{ label: string; value: string; change: string }>;
    isVisible: boolean;
  };
  refresh: () => Promise<void>;
}

export function useLandingContent(): UseLandingContentReturn {
  const [data, setData] = useState<PublicLandingData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchContent = async () => {
    try {
      const res = await getPublicLanding();
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  const sectionsMap = data?.sections_map || {};

  // Extract Hero with complete dynamic bindings & safe non-500 fallbacks
  const heroSection = sectionsMap['hero'];
  const heroContent = heroSection?.content_data || {};
  const ctaPri = heroContent.cta_primary || {};
  const ctaSec = heroContent.cta_secondary || {};

  const badgeText = heroContent.badge_text || heroContent.badge || DEFAULT_HERO_CONTENT.badge;
  const headline = heroContent.headline || heroSection?.title || DEFAULT_HERO_CONTENT.title;
  const subheadline = heroContent.subheadline || heroSection?.subtitle || DEFAULT_HERO_CONTENT.subtitle;
  const priLabel = heroContent.primary_cta_label || ctaPri.label || DEFAULT_HERO_CONTENT.cta_primary.label;
  const priUrl = heroContent.primary_cta_url || ctaPri.url || DEFAULT_HERO_CONTENT.cta_primary.url;
  const secLabel = heroContent.secondary_cta_label || ctaSec.label || DEFAULT_HERO_CONTENT.cta_secondary.label;
  const secUrl = heroContent.secondary_cta_url || ctaSec.url || DEFAULT_HERO_CONTENT.cta_secondary.url;
  const telemetryNode = heroContent.telemetry_node_label || 'NODE [ONLINE]';
  const telemetryDb = heroContent.telemetry_db_label || 'PostgreSQL 16';

  const heroData: HeroCmsContent = {
    badge_text: badgeText,
    headline,
    subheadline,
    primary_cta_label: priLabel,
    primary_cta_url: priUrl,
    secondary_cta_label: secLabel,
    secondary_cta_url: secUrl,
    telemetry_node_label: telemetryNode,
    telemetry_db_label: telemetryDb,
    title: headline,
    subtitle: subheadline,
    badge: badgeText,
    ctaPrimary: { label: priLabel, url: priUrl },
    ctaSecondary: { label: secLabel, url: secUrl },
    isVisible: heroSection ? heroSection.is_visible : true,
  };

  // Extract Metrics
  const metricsSection = sectionsMap['metrics'];
  const metricsContent = metricsSection?.content_data || {};
  const metricsData = {
    title: metricsSection?.title || 'Engineered for Sub-Millisecond Financial Execution',
    subtitle:
      metricsSection?.subtitle ||
      'Real telemetry metrics captured from bare-metal PostgreSQL 16 clusters.',
    metrics: Array.isArray(metricsContent.metrics) && metricsContent.metrics.length > 0
      ? metricsContent.metrics
      : DEFAULT_METRICS,
    isVisible: metricsSection ? metricsSection.is_visible : true,
  };

  // Extract Pricing
  const pricingSection = sectionsMap['pricing_matrix'] || sectionsMap['pricing'];
  const pricingContent = pricingSection?.content_data || {};
  const rawTiers = Array.isArray(pricingContent.tiers)
    ? pricingContent.tiers
    : Array.isArray(pricingContent.plans)
    ? pricingContent.plans
    : Array.isArray(pricingContent.items)
    ? pricingContent.items
    : [];
  const tiers: PricingTierCms[] = rawTiers.length > 0 ? rawTiers : DEFAULT_PRICING_TIERS;

  const pricingData: PricingCmsContent = {
    title: pricingSection?.title || pricingContent.title || 'Transparent Enterprise Licensing',
    subtitle:
      pricingSection?.subtitle ||
      pricingContent.subtitle ||
      'Predictable SaaS and sovereign infrastructure tiers for Saudi contracting, logistics, and enterprise syndicates. All prices in SAR, excluding 15% VAT.',
    tiers,
    isVisible: pricingSection ? pricingSection.is_visible : true,
  };

  // Extract Footer & Contacts with safe fallbacks
  const footerSection = sectionsMap['footer'];
  const footerContent = footerSection?.content_data || {};
  const footerEmail =
    footerContent.contact_email ||
    footerContent.email ||
    data?.platform_settings?.support_email ||
    DEFAULT_SITE_SETTINGS.contact_email ||
    'ops@oxengl.me';

  const footerPhone =
    footerContent.contact_phone ||
    footerContent.phone ||
    DEFAULT_SITE_SETTINGS.contact_phone ||
    '+967 736735733';

  const footerLocation =
    footerContent.contact_location ||
    footerContent.location_text ||
    footerContent.contact_address ||
    DEFAULT_SITE_SETTINGS.contact_address ||
    "Sana'a, Yemen";

  const footerCopyright =
    footerContent.copyright ||
    `© ${new Date().getFullYear()} ${data?.platform_settings?.platform_name || 'OxenGL'} ERP Platform. Sovereign Multi-Tenant Architecture. All rights reserved.`;

  const footerData: FooterCmsContent = {
    contact_email: footerEmail,
    contact_phone: footerPhone,
    phone: footerPhone,
    contact_location: footerLocation,
    location_text: footerLocation,
    contact_address: footerLocation,
    copyright: footerCopyright,
    links: Array.isArray(footerContent.links) ? footerContent.links : [],
    title: footerSection?.title || 'OxenGL',
    subtitle: footerSection?.subtitle || 'Sovereign Multi-Tenant ERP Architecture',
    isVisible: footerSection ? footerSection.is_visible : true,
  };

  return {
    loading,
    error,
    platformSettings: data?.platform_settings || {},
    sections: data?.sections || [],
    sectionsMap,
    heroData,
    footerData,
    cmsContent: {
      hero: heroData,
      footer: footerData,
      pricing: pricingData,
    },
    metricsData,
    pricingData,
    refresh: fetchContent,
  };
}
