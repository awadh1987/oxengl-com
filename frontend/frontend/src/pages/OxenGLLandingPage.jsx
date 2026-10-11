import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// DEFAULT SOVEREIGN FALLBACK PAYLOAD (Zero-CLS & Offline Resilience)
// ============================================================================
const DEFAULT_FALLBACK_PAYLOAD = {
  platform_settings: {
    platform_name: "OxenGL Sovereign Enterprise",
    platform_tagline: "National Heavy Industry, Quarry Logistics & Sovereign ERP Architecture",
    logo_light_url: "https://oxengl.me/logo.png",
    logo_dark_url: "https://oxengl.me/logo.png",
    primary_color: "#ea580c",
    secondary_color: "#020617",
    support_email: "superadmin@oxengl.com",
    legal_terms_url: "/terms",
    privacy_policy_url: "/privacy",
    custom_css: null,
    enable_sovereignty_badge: true,
    sovereignty_badge_title: "Sovereign Infrastructure Policy",
    sovereignty_badge_text: "Customer schemas, cryptographic keys, and telemetry logs are persisted on sovereign bare-metal infrastructure."
  },
  sections_map: {
    hero: {
      id: "sec-hero",
      section_key: "hero",
      title: "Sovereign Multi-Tenant ERP Architecture for the Republic of Yemen",
      subtitle: "Sub-millisecond query isolation, cryptographic compliance, and heavy industrial logistics orchestration—engineered on bare-metal PostgreSQL 16 and FastAPI.",
      content_data: {
        badge_text: "v5.0 SOVEREIGN ARCHITECTURE",
        telemetry_node_label: "YEM-SANAA-01 [ONLINE]",
        telemetry_db_label: "PostgreSQL 16.4 • Uptime: 99.999%",
        headline: "Sovereign Multi-Tenant ERP Architecture for the Republic of Yemen",
        subheadline: "National heavy industry, quarry logistics, and sovereign enterprise resource planning—engineered with military-grade tenant isolation and sub-millisecond telemetry.",
        primary_cta_label: "Deploy Sovereign Workspace",
        primary_cta_url: "/register",
        secondary_cta_label: "Direct Console Access",
        secondary_cta_url: "/login",
        stats: [
          { label: "Query Latency", value: "< 0.8ms", note: "p99 benchmark" },
          { label: "ZATCA Clearance", value: "100%", note: "Cryptographic Phase 2" },
          { label: "Fleet Radar", value: "Real-Time", note: "Gross-tare-net telemetry" },
          { label: "Tenant Isolation", value: "Row-Level RLS", note: "Zero cross-leakage" }
        ]
      }
    },
    features: {
      id: "sec-features",
      section_key: "features",
      title: "Engineered for Mission-Critical Heavy Industry",
      subtitle: "Autonomous operational modules purpose-built for quarries, concrete batching, heavy transport, and sovereign compliance.",
      content_data: {
        items: [
          {
            id: "zatca",
            title: "Cryptographic Tax & E-Invoice Clearance",
            description: "Automated UBL 2.1 XML generation, ECDSA secp256k1 cryptographic signatures, and direct authority clearance.",
            badge: "Fiscal Compliance",
            metric: "0.12s signed"
          },
          {
            id: "weighbridge",
            title: "Quarry & Automated Weighbridge Radar",
            description: "Digital scale gross-tare-net telemetry, plate recognition, automatic delivery ticket generation, and geofencing.",
            badge: "Logistics",
            metric: "Sub-second weighing"
          },
          {
            id: "ledger",
            title: "Sub-Millisecond Multi-Branch Ledger",
            description: "Autonomous double-entry accounting engine, real-time trial balances, automated bank reconciliation, and multi-currency audits.",
            badge: "Financial Core",
            metric: "10k txns/sec"
          },
          {
            id: "sovereignty",
            title: "Bare-Metal Data Sovereignty & RLS",
            description: "Guaranteed geographical persistence within national borders. Isolated schemas, physical segregation, and hardware security modules.",
            badge: "Security",
            metric: "Air-gapped ready"
          }
        ]
      }
    },
    pricing_matrix: {
      id: "sec-pricing",
      section_key: "pricing_matrix",
      title: "Sovereign Licensing & Subscriptions",
      subtitle: "Predictable, transparent subscription tiers synced directly from the Portal Admin Engine. All prices quoted in SAR.",
      content_data: {
        tiers: [
          {
            id: "free",
            name: "Free Evaluation Tier",
            plan_name: "Free Evaluation Tier",
            tagline: "Sandbox environment for architectural pilot validation",
            price: "0",
            price_monthly: "0",
            currency: "SAR",
            badge: "Sandbox",
            is_popular: false,
            highlighted: false,
            seats: "2 user seats",
            vehicles: "5 fleet vehicles",
            storage: "5 GB vault storage",
            txns: "100 transactions/mo",
            features: [
              "2 user seats with role-based access",
              "Up to 5 fleet vehicles & delivery dispatch",
              "5 GB encrypted document vault storage",
              "100 transactions & tickets per month",
              "Standard API & Webhook access"
            ],
            cta: { label: "Initialize Sandbox", url: "/register?plan=free" }
          },
          {
            id: "pro",
            name: "Pro Logistics Fleet e9296a",
            plan_name: "Pro Logistics Fleet e9296a",
            tagline: "High-throughput operational core for active fleets and mining hubs",
            price: "2,499",
            price_monthly: "2,499",
            currency: "SAR",
            badge: "Most Popular",
            is_popular: true,
            highlighted: true,
            seats: "20 user seats",
            vehicles: "50 fleet trucks",
            storage: "50 GB vault storage",
            txns: "10,000 transactions/mo",
            features: [
              "Up to 25 Heavy Fleet Trucks & Telemetry",
              "ZATCA Phase 2 Real-Time Clearance & Stamps",
              "Automated Weighbridge Scales Integration",
              "20 user seats with granular RBAC isolation",
              "Priority 24/7 SLA Operations Support"
            ],
            cta: { label: "Deploy Pro Fleet", url: "/register?plan=pro" }
          },
          {
            id: "enterprise",
            name: "Sovereign Dedicated bdfd22",
            plan_name: "Sovereign Dedicated bdfd22",
            tagline: "Dedicated PostgreSQL 16 cluster for conglomerates & governments",
            price: "6,999",
            price_monthly: "6,999",
            currency: "SAR",
            badge: "Sovereign Master",
            is_popular: false,
            highlighted: false,
            seats: "Unlimited seats",
            vehicles: "Unlimited vehicles",
            storage: "1 TB dedicated vault",
            txns: "Unlimited volume",
            features: [
              "Unlimited user seats & heavy transport units",
              "1 TB (1,000 GB) dedicated encrypted vault",
              "Private external database hosting / on-premise",
              "Custom ERP core module extensions & APIs",
              "24/7 dedicated NOC with 15-minute SLA"
            ],
            cta: { label: "Request Sovereign Cluster", url: "/register?plan=enterprise" }
          }
        ]
      }
    },
    footer: {
      id: "sec-footer",
      section_key: "footer",
      title: "OxenGL Sovereign Platform",
      subtitle: "National Sovereign Multi-Tenant ERP Architecture.",
      content_data: {
        title: "OxenGL Sovereign Platform",
        tagline: "Next-generation ERP backbone for quarry logistics, fiscal compliance, and heavy industry orchestration.",
        whatsapp: "+967 736735733",
        contact_phone: "+967 736735733",
        email: "superadmin@oxengl.com",
        contact_email: "superadmin@oxengl.com",
        location: "Sana'a, Republic of Yemen",
        contact_location: "Sana'a, Republic of Yemen",
        copyright: "© 2026 OxenGL Sovereign Enterprise. All rights reserved. Sovereign multi-tenant architecture.",
        links: [
          { label: "Admin Console", url: "/admin" },
          { label: "Tenant Workspace", url: "/login" },
          { label: "Security & Sovereignty", url: "/security" },
          { label: "Developer Docs", url: "/docs" }
        ]
      }
    }
  }
};

// ============================================================================
// CMS API DATA FETCHING & NORMALIZATION LAYER
// ============================================================================
async function fetchLandingCmsData() {
  const endpoints = [
    '/api/v1/public/landing',
    '/api/v1/public/content/landing',
    '/api/portal/settings',
    '/api/v1/portal/settings'
  ];

  let rawData = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (response.ok) {
        rawData = await response.json();
        break;
      }
    } catch {
      // Continue to next endpoint fallback
    }
  }

  if (!rawData) {
    return DEFAULT_FALLBACK_PAYLOAD;
  }

  // Normalize shape: handles both PublicLandingResponse and flat portal admin settings
  const platformSettings = rawData.platform_settings || rawData.brand || rawData.settings || {};
  const sectionsMap = rawData.sections_map || {};

  // Extract or synthesize Hero
  const heroSection = sectionsMap.hero || {
    content_data: rawData.hero || {}
  };
  const heroContent = heroSection.content_data || {};

  // Extract or synthesize Pricing
  const pricingSection = sectionsMap.pricing_matrix || sectionsMap.pricing || {
    content_data: { tiers: rawData.pricing || [] }
  };
  const pricingTiers = pricingSection.content_data?.tiers || rawData.pricing || DEFAULT_FALLBACK_PAYLOAD.sections_map.pricing_matrix.content_data.tiers;

  // Extract or synthesize Footer
  const footerSection = sectionsMap.footer || {
    content_data: rawData.footer || {}
  };
  const footerContent = footerSection.content_data || {};

  return {
    platform_settings: {
      platform_name: platformSettings.platform_name || platformSettings.title || DEFAULT_FALLBACK_PAYLOAD.platform_settings.platform_name,
      platform_tagline: platformSettings.platform_tagline || DEFAULT_FALLBACK_PAYLOAD.platform_settings.platform_tagline,
      logo_light_url: platformSettings.logo_light_url || platformSettings.logoUrl || DEFAULT_FALLBACK_PAYLOAD.platform_settings.logo_light_url,
      logo_dark_url: platformSettings.logo_dark_url || platformSettings.logoUrl || DEFAULT_FALLBACK_PAYLOAD.platform_settings.logo_dark_url,
      primary_color: platformSettings.primary_color || platformSettings.primaryColor || "#ea580c",
      secondary_color: platformSettings.secondary_color || platformSettings.secondaryColor || "#020617",
      support_email: platformSettings.support_email || platformSettings.email || DEFAULT_FALLBACK_PAYLOAD.platform_settings.support_email,
      legal_terms_url: platformSettings.legal_terms_url || "/terms",
      privacy_policy_url: platformSettings.privacy_policy_url || "/privacy",
      enable_sovereignty_badge: platformSettings.enable_sovereignty_badge ?? true,
      sovereignty_badge_title: platformSettings.sovereignty_badge_title || DEFAULT_FALLBACK_PAYLOAD.platform_settings.sovereignty_badge_title,
      sovereignty_badge_text: platformSettings.sovereignty_badge_text || DEFAULT_FALLBACK_PAYLOAD.platform_settings.sovereignty_badge_text
    },
    sections_map: {
      hero: {
        id: heroSection.id || "sec-hero",
        section_key: "hero",
        title: heroContent.headline || heroContent.mainHeadline || heroSection.title || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.title,
        subtitle: heroContent.subheadline || heroContent.subHeadline || heroSection.subtitle || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.subtitle,
        content_data: {
          badge_text: heroContent.badge_text || heroContent.badgeText || heroContent.badge || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data.badge_text,
          telemetry_node_label: heroContent.telemetry_node_label || heroContent.nodeLabel || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data.telemetry_node_label,
          telemetry_db_label: heroContent.telemetry_db_label || heroContent.uptimeLabel || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data.telemetry_db_label,
          headline: heroContent.headline || heroContent.mainHeadline || heroSection.title || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data.headline,
          subheadline: heroContent.subheadline || heroContent.subHeadline || heroSection.subtitle || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data.subheadline,
          primary_cta_label: heroContent.primary_cta_label || heroContent.primaryCta || heroContent.cta_primary?.label || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data.primary_cta_label,
          primary_cta_url: heroContent.primary_cta_url || heroContent.cta_primary?.url || "/register",
          secondary_cta_label: heroContent.secondary_cta_label || heroContent.secondaryCta || heroContent.cta_secondary?.label || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data.secondary_cta_label,
          secondary_cta_url: heroContent.secondary_cta_url || heroContent.cta_secondary?.url || "/login",
          stats: heroContent.stats || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data.stats
        }
      },
      features: sectionsMap.features || DEFAULT_FALLBACK_PAYLOAD.sections_map.features,
      pricing_matrix: {
        id: pricingSection.id || "sec-pricing",
        section_key: "pricing_matrix",
        title: pricingSection.title || DEFAULT_FALLBACK_PAYLOAD.sections_map.pricing_matrix.title,
        subtitle: pricingSection.subtitle || DEFAULT_FALLBACK_PAYLOAD.sections_map.pricing_matrix.subtitle,
        content_data: {
          tiers: pricingTiers.map((t, idx) => ({
            id: t.id || `tier-${idx}`,
            name: t.name || t.plan_name || t.title || "Subscription Tier",
            tagline: t.tagline || t.description || "",
            price: t.price || t.price_monthly || (t.monthly_price !== undefined ? String(t.monthly_price) : "0"),
            currency: t.currency || "SAR",
            badge: t.badge || (t.is_popular || t.isPopular || t.highlighted ? "Most Popular" : null),
            is_popular: Boolean(t.is_popular ?? t.isPopular ?? t.highlighted),
            seats: t.seats || (t.max_seats ? `${t.max_seats} user seats` : null),
            vehicles: t.vehicles || (t.max_vehicles ? `${t.max_vehicles} fleet vehicles` : null),
            storage: t.storage || (t.max_storage_gb ? `${t.max_storage_gb} GB vault` : null),
            txns: t.txns || (t.max_monthly_transactions ? `${t.max_monthly_transactions} txns/mo` : null),
            features: Array.isArray(t.features) ? t.features : Array.isArray(t.display_features) ? t.display_features : [],
            cta: t.cta || { label: `Deploy ${t.name?.split(' ')[0] || 'Tier'}`, url: `/register?plan=${t.id || 'standard'}` }
          }))
        }
      },
      footer: {
        id: footerSection.id || "sec-footer",
        section_key: "footer",
        content_data: {
          title: footerContent.title || platformSettings.platform_name || DEFAULT_FALLBACK_PAYLOAD.sections_map.footer.content_data.title,
          tagline: footerContent.tagline || platformSettings.platform_tagline || DEFAULT_FALLBACK_PAYLOAD.sections_map.footer.content_data.tagline,
          whatsapp: footerContent.whatsapp || footerContent.contact_phone || footerContent.phone || "+967 736735733",
          email: footerContent.email || footerContent.contact_email || platformSettings.support_email || "superadmin@oxengl.com",
          location: footerContent.location || footerContent.contact_location || footerContent.location_text || "Sana'a, Yemen",
          copyright: footerContent.copyright || DEFAULT_FALLBACK_PAYLOAD.sections_map.footer.content_data.copyright,
          links: footerContent.links || DEFAULT_FALLBACK_PAYLOAD.sections_map.footer.content_data.links
        }
      }
    }
  };
}

// ============================================================================
// MAIN NEXT-GENERATION LANDING PAGE COMPONENT
// ============================================================================
export default function OxenGLLandingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'
  const [activeTab, setActiveTab] = useState('all');

  // Load CMS Data & Inject Dynamic Brand CSS Variables
  useEffect(() => {
    let isMounted = true;
    fetchLandingCmsData()
      .then((payload) => {
        if (!isMounted) return;
        setData(payload);
        setLoading(false);

        // Dynamically inject root brand CSS variables
        const primary = payload.platform_settings?.primary_color || '#ea580c';
        const secondary = payload.platform_settings?.secondary_color || '#020617';

        document.documentElement.style.setProperty('--brand-primary', primary);
        document.documentElement.style.setProperty('--brand-secondary', secondary);
      })
      .catch((err) => {
        console.warn('OxenGL CMS Ingestion notice:', err);
        if (isMounted) {
          setData(DEFAULT_FALLBACK_PAYLOAD);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Safe destructuring of live CMS data
  const brand = data?.platform_settings || DEFAULT_FALLBACK_PAYLOAD.platform_settings;
  const hero = data?.sections_map?.hero?.content_data || DEFAULT_FALLBACK_PAYLOAD.sections_map.hero.content_data;
  const features = data?.sections_map?.features?.content_data?.items || DEFAULT_FALLBACK_PAYLOAD.sections_map.features.content_data.items;
  const pricingTiers = data?.sections_map?.pricing_matrix?.content_data?.tiers || DEFAULT_FALLBACK_PAYLOAD.sections_map.pricing_matrix.content_data.tiers;
  const footer = data?.sections_map?.footer?.content_data || DEFAULT_FALLBACK_PAYLOAD.sections_map.footer.content_data;

  // Clean WhatsApp phone number for wa.me direct link format
  const sanitizedWhatsApp = useMemo(() => {
    const raw = footer.whatsapp || "+967 736735733";
    return raw.replace(/[^0-9]/g, '');
  }, [footer.whatsapp]);

  // Primary brand dynamic style helper
  const primaryBrandColor = brand.primary_color || "#ea580c";

  // ==========================================================================
  // PREMIUM HIGH-TECH LOADING STATE
  // ==========================================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center relative overflow-hidden text-white select-none">
        {/* Dynamic Flooding Radial Glow */}
        <div 
          className="absolute w-[600px] h-[600px] rounded-full blur-[140px] opacity-20 pointer-events-none animate-pulse"
          style={{ background: primaryBrandColor }}
        />
        
        {/* Animated Cyber Core Rings */}
        <div className="relative w-28 h-28 flex items-center justify-center mb-8">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-dashed border-white/20"
          />
          <motion.div 
            animate={{ rotate: -360 }} 
            transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
            className="absolute inset-2 rounded-full border-2 border-t-transparent border-b-transparent"
            style={{ borderColor: `${primaryBrandColor} transparent` }}
          />
          <motion.div
            animate={{ scale: [0.95, 1.15, 0.95], opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
            className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs tracking-wider shadow-[0_0_30px_rgba(234,88,12,0.4)]"
            style={{ background: `linear-gradient(135deg, ${primaryBrandColor}, #9a3412)` }}
          >
            GL
          </motion.div>
        </div>

        {/* Telemetry Loader Text */}
        <div className="flex flex-col items-center gap-2 z-10 font-mono text-center px-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            <span>CONNECTING SOVEREIGN CONTROL PLANE</span>
          </div>
          <p className="text-[11px] text-slate-500">Decrypting schema policies • Telemetry node handshake</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-orange-500 selection:text-white relative overflow-x-hidden">
      
      {/* ======================================================================
          BACKGROUND FLOODING & AMBIENT ATMOSPHERE (Desktop & Mobile)
          ====================================================================== */}
      <div 
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] rounded-full blur-[160px] opacity-[0.14] pointer-events-none transition-all duration-1000 z-0"
        style={{ background: primaryBrandColor }}
      />
      <div className="fixed top-1/3 -right-40 w-[600px] h-[600px] bg-teal-500/10 blur-[180px] rounded-full pointer-events-none z-0" />
      <div className="fixed -bottom-40 -left-40 w-[700px] h-[700px] bg-indigo-600/10 blur-[180px] rounded-full pointer-events-none z-0" />
      
      {/* Fine Sovereign Grid Texture */}
      <div className="fixed inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:32px_32px] pointer-events-none z-0 opacity-80" />

      {/* ======================================================================
          TOP NAVIGATION BAR (Glassmorphism & Live Telemetry Indicator)
          ====================================================================== */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#020617]/75 backdrop-blur-xl border-b border-white/[0.08] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Brand Logo & Title with Image Fallback */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }} 
            className="flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="relative">
              {brand.logo_light_url ? (
                <img 
                  src={brand.logo_light_url} 
                  alt={brand.platform_name} 
                  className="w-10 h-10 object-contain rounded-xl p-1 bg-white/5 border border-white/10 shadow-sm"
                  onError={(e) => {
                    // Graceful fallback to branded avatar glyph if image fails
                    e.currentTarget.style.display = 'none';
                    const fallbackEl = document.getElementById('logo-fallback-badge');
                    if (fallbackEl) fallbackEl.style.display = 'flex';
                  }}
                />
              ) : null}
              <div 
                id="logo-fallback-badge" 
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm shadow-md transition-transform group-hover:scale-105 ${brand.logo_light_url ? 'hidden' : 'flex'}`}
                style={{ background: `linear-gradient(135deg, ${primaryBrandColor}, #9a3412)` }}
              >
                GL
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            </div>

            <div>
              <div className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-2">
                <span>{brand.platform_name}</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-white/10 text-slate-300 border border-white/10 hidden md:inline-block">
                  Sovereign
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono tracking-wide hidden sm:block">
                {hero.telemetry_node_label}
              </p>
            </div>
          </motion.div>

          {/* Quick Nav Anchors (Desktop) */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
            <a href="#pricing" className="hover:text-white transition-colors">Licensing</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </nav>

          {/* Header Action Button (Console Access) */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <a
              href={hero.secondary_cta_url || "/login"}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all backdrop-blur-md flex items-center gap-2 shadow-sm"
            >
              <span>{hero.secondary_cta_label || "Console Login"}</span>
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </motion.div>
        </div>
      </header>

      {/* ======================================================================
          MAIN HERO SECTION (Telemetry Badges, Copy & Micro-interactions)
          ====================================================================== */}
      <main className="pt-32 sm:pt-40 pb-20 relative z-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        <div className="text-center max-w-4xl mx-auto mb-20 sm:mb-28">
          
          {/* Floating Telemetry Badges Pill Cluster */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mb-8 p-1.5 rounded-full bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.5)]"
          >
            <div 
              className="px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-mono font-bold tracking-wider flex items-center gap-2 border"
              style={{
                backgroundColor: `${primaryBrandColor}15`,
                borderColor: `${primaryBrandColor}40`,
                color: primaryBrandColor
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: primaryBrandColor }} />
              {hero.badge_text}
            </div>

            <div className="px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-mono text-teal-300 bg-teal-500/10 border border-teal-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              {hero.telemetry_node_label}
            </div>

            <div className="hidden lg:flex px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-mono text-slate-400 bg-white/5 border border-white/5 items-center gap-1.5">
              <span>⚡</span>
              {hero.telemetry_db_label}
            </div>
          </motion.div>

          {/* Main Headline with Staggered Framer Motion & Gradient */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight leading-[1.08] mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-100 to-slate-400"
          >
            {hero.headline}
          </motion.h1>

          {/* Subheadline Copy */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-base sm:text-xl text-slate-300/90 leading-relaxed max-w-3xl mx-auto mb-10 font-normal"
          >
            {hero.subheadline}
          </motion.p>

          {/* Desktop Call To Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5"
          >
            <a
              href={hero.primary_cta_url || "/register"}
              className="w-full sm:w-auto px-9 py-4 rounded-2xl font-bold text-white text-base shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 relative group overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${primaryBrandColor}, #c2410c)`,
                boxShadow: `0 10px 40px -10px ${primaryBrandColor}80`
              }}
            >
              {/* Shimmer sweep */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
              <span>{hero.primary_cta_label}</span>
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>

            <a
              href={hero.secondary_cta_url || "/login"}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl font-semibold text-slate-200 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all backdrop-blur-xl flex items-center justify-center gap-2"
            >
              <span>{hero.secondary_cta_label}</span>
            </a>
          </motion.div>

          {/* Live Telemetry Radar Strip */}
          {hero.stats && hero.stats.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-16 max-w-4xl mx-auto"
            >
              {hero.stats.map((stat, idx) => (
                <div 
                  key={idx}
                  className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 text-center backdrop-blur-md relative overflow-hidden group hover:border-white/20 transition-all"
                >
                  <div className="text-xl sm:text-2xl font-black text-white mb-0.5 tracking-tight font-mono">
                    {stat.value}
                  </div>
                  <div className="text-xs font-semibold text-slate-300">{stat.label}</div>
                  {stat.note && (
                    <div className="text-[10px] text-slate-500 font-mono mt-1">{stat.note}</div>
                  )}
                  {/* Subtle top indicator */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity" 
                    style={{ background: primaryBrandColor }}
                  />
                </div>
              ))}
            </motion.div>
          )}

        </div>

        {/* ====================================================================
            FEATURES & CAPABILITIES SECTION
            ==================================================================== */}
        <section id="features" className="mb-32 pt-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-mono uppercase tracking-widest text-orange-400 mb-3">
              Engineered Resilience
            </h2>
            <h3 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
              Mission-Critical Heavy Industry Systems
            </h3>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Designed to endure harsh industrial environments, extreme weighbridge throughput, and sovereign cryptographic compliance audits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((item, index) => (
              <motion.div
                key={item.id || index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -6 }}
                className="group relative bg-[#0f172a]/50 border border-white/[0.08] hover:border-white/20 rounded-3xl p-6 sm:p-7 backdrop-blur-xl transition-all duration-300 flex flex-col justify-between"
              >
                {/* Floating ambient corner glow */}
                <div 
                  className="absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none"
                  style={{ background: primaryBrandColor }}
                />

                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
                      {item.badge || "Core Module"}
                    </span>
                    {item.metric && (
                      <span className="text-[11px] font-mono text-emerald-400">
                        {item.metric}
                      </span>
                    )}
                  </div>
                  <h4 className="text-lg font-bold text-white mb-2 group-hover:text-orange-400 transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-4">
                    {item.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/5 flex items-center text-xs font-mono text-slate-400 group-hover:text-white transition-colors">
                  <span>Isolated Subsystem</span>
                  <span className="ml-auto text-orange-400 font-bold">→</span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ====================================================================
            PRICING & SUBSCRIPTION PLANS (Flooding Animated Cards)
            ==================================================================== */}
        <section id="pricing" className="relative mb-32 pt-8">
          
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div 
              className="inline-block px-3.5 py-1 rounded-full text-[11px] font-mono font-bold tracking-widest uppercase mb-4 border"
              style={{
                backgroundColor: `${primaryBrandColor}15`,
                borderColor: `${primaryBrandColor}30`,
                color: primaryBrandColor
              }}
            >
              Portal Admin Synced
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
              Sovereign Enterprise Licensing
            </h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mb-8">
              Real-time dynamic pricing loaded directly from the OxenGL Headless CMS. Predictable operational expenditures with zero surprise add-ons.
            </p>

            {/* Monthly / Annual Billing Toggle Switch */}
            <div className="inline-flex items-center p-1 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all ${
                  billingCycle === 'annual'
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Annual Commit</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* Flooding Cards Grid with whileInView */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch max-w-7xl mx-auto">
            {pricingTiers.map((tier, idx) => {
              const isPopular = tier.is_popular;
              
              // Calculate annual pricing approximation if selected
              const displayPrice = billingCycle === 'annual' && tier.price !== "0" && !isNaN(Number(tier.price.replace(/,/g, '')))
                ? Math.round(Number(tier.price.replace(/,/g, '')) * 0.8).toLocaleString()
                : tier.price;

              return (
                <motion.div
                  key={tier.id || idx}
                  initial={{ opacity: 0, y: 60 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: idx * 0.18 }}
                  whileHover={{ y: -12 }}
                  className={`relative rounded-3xl p-8 sm:p-9 backdrop-blur-2xl transition-all duration-300 flex flex-col justify-between group ${
                    isPopular 
                      ? 'bg-[#0f172a]/80 border-2 shadow-2xl'
                      : 'bg-[#0f172a]/50 border border-white/[0.08] hover:border-white/20'
                  }`}
                  style={{
                    borderColor: isPopular ? primaryBrandColor : undefined,
                    boxShadow: isPopular ? `0 0 50px -15px ${primaryBrandColor}50` : undefined
                  }}
                >
                  {/* "Most Popular" Flooding Pill Header */}
                  {isPopular && (
                    <div 
                      className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest text-white shadow-lg flex items-center gap-1.5"
                      style={{ background: `linear-gradient(135deg, ${primaryBrandColor}, #c2410c)` }}
                    >
                      <span>★</span>
                      <span>{tier.badge || "Most Popular"}</span>
                    </div>
                  )}

                  {/* Dynamic Hover Glow Flood */}
                  <div 
                    className={`absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${
                      isPopular 
                        ? 'bg-gradient-to-b from-orange-500/10 via-transparent to-transparent' 
                        : 'bg-gradient-to-b from-white/5 via-transparent to-transparent'
                    }`} 
                  />

                  <div className="relative z-10">
                    {/* Header Details */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                        {tier.name}
                      </h3>
                      {!isPopular && tier.badge && (
                        <span className="text-[10px] font-mono uppercase px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
                          {tier.badge}
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-slate-400 mb-6 min-h-[40px] leading-relaxed">
                      {tier.tagline}
                    </p>

                    {/* Price in SAR */}
                    <div className="mb-8 p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-slate-400 font-mono">
                        {tier.currency || "SAR"}
                      </span>
                      <span className="text-4xl sm:text-5xl font-black text-white tracking-tight font-mono">
                        {displayPrice}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        /{billingCycle === 'annual' ? 'mo (billed annually)' : 'mo'}
                      </span>
                    </div>

                    {/* Hardware & Quotas Grid */}
                    {(tier.seats || tier.vehicles || tier.storage || tier.txns) && (
                      <div className="grid grid-cols-2 gap-2 mb-8 text-[11px] font-mono text-slate-300">
                        {tier.seats && (
                          <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center gap-1.5">
                            <span className="text-slate-400">👤</span>
                            <span className="truncate">{tier.seats}</span>
                          </div>
                        )}
                        {tier.vehicles && (
                          <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center gap-1.5">
                            <span className="text-slate-400">🚛</span>
                            <span className="truncate">{tier.vehicles}</span>
                          </div>
                        )}
                        {tier.storage && (
                          <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center gap-1.5">
                            <span className="text-slate-400">🗄️</span>
                            <span className="truncate">{tier.storage}</span>
                          </div>
                        )}
                        {tier.txns && (
                          <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center gap-1.5">
                            <span className="text-slate-400">⚡</span>
                            <span className="truncate">{tier.txns}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Features Checklist */}
                    <div className="space-y-3.5 mb-10 text-xs sm:text-sm text-slate-300">
                      {tier.features?.map((feat, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div 
                            className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 border"
                            style={{
                              backgroundColor: `${primaryBrandColor}20`,
                              borderColor: `${primaryBrandColor}50`
                            }}
                          >
                            <svg className="w-2.5 h-2.5" style={{ color: primaryBrandColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <span className="leading-snug text-slate-300">{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tier Action Button */}
                  <div className="relative z-10 pt-4">
                    <a
                      href={tier.cta?.url || "/register"}
                      className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2 ${
                        isPopular
                          ? 'text-white shadow-xl hover:scale-102 active:scale-98'
                          : 'bg-white/5 text-white border border-white/10 hover:bg-white/15 hover:border-white/20 active:scale-98'
                      }`}
                      style={{
                        background: isPopular ? `linear-gradient(135deg, ${primaryBrandColor}, #c2410c)` : undefined,
                        boxShadow: isPopular ? `0 8px 30px -5px ${primaryBrandColor}70` : undefined
                      }}
                    >
                      <span>{tier.cta?.label || `Deploy ${tier.name.split(' ')[0]}`}</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ====================================================================
            SOVEREIGNTY & BARE-METAL COMPLIANCE BANNER
            ==================================================================== */}
        {brand.enable_sovereignty_badge && (
          <div className="mb-28 p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-slate-900/90 via-[#0f172a]/80 to-slate-900/90 border border-white/10 backdrop-blur-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div 
                className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-2xl shrink-0 shadow-lg"
                style={{ background: `linear-gradient(135deg, ${primaryBrandColor}, #9a3412)` }}
              >
                🛡️
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-1">
                  {brand.sovereignty_badge_title}
                </h4>
                <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
                  {brand.sovereignty_badge_text}
                </p>
              </div>
            </div>
            <a
              href="/security"
              className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono font-bold hover:bg-white/10 transition-all shrink-0"
            >
              INSPECT AUDIT SPECS →
            </a>
          </div>
        )}

      </main>

      {/* ======================================================================
          FOOTER & OPERATIONS CONTACTS
          ====================================================================== */}
      <footer id="contact" className="relative z-10 border-t border-white/[0.08] bg-[#020617]/90 backdrop-blur-2xl pt-16 pb-32 lg:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 text-sm text-slate-400 mb-12">
          
          {/* Brand Info */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white text-xs shadow-md"
                style={{ background: `linear-gradient(135deg, ${primaryBrandColor}, #9a3412)` }}
              >
                GL
              </div>
              <span className="text-white font-extrabold text-xl tracking-tight">
                {footer.title || brand.platform_name}
              </span>
            </div>
            
            <p className="mb-6 max-w-md text-slate-400 leading-relaxed text-sm">
              {footer.tagline || brand.platform_tagline}
            </p>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>Sovereign Operation: KSA & Yemen Industrial Node Grid</span>
            </div>
          </div>

          {/* Direct Operations Contacts */}
          <div>
            <h4 className="text-white font-bold mb-5 tracking-wide text-sm font-mono uppercase">
              Operations & Support
            </h4>
            <ul className="space-y-3.5 text-xs sm:text-sm">
              {/* WhatsApp Direct Link */}
              <li>
                <a 
                  href={`https://wa.me/${sanitizedWhatsApp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-all flex items-center gap-2.5 group"
                >
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xs group-hover:scale-110 transition-transform">
                    ✆
                  </span>
                  <span>WhatsApp: {footer.whatsapp}</span>
                </a>
              </li>

              {/* Support Email Mailto */}
              <li>
                <a 
                  href={`mailto:${footer.email}`}
                  className="hover:text-white transition-all flex items-center gap-2.5 group"
                >
                  <span className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center text-xs group-hover:scale-110 transition-transform">
                    ✉
                  </span>
                  <span>{footer.email}</span>
                </a>
              </li>

              {/* Location Pin */}
              <li className="flex items-center gap-2.5 text-slate-400">
                <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center text-xs">
                  ⚲
                </span>
                <span>{footer.location}</span>
              </li>
            </ul>
          </div>

          {/* Quick Platform Links */}
          <div>
            <h4 className="text-white font-bold mb-5 tracking-wide text-sm font-mono uppercase">
              Control Plane Links
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm">
              {footer.links?.map((link, idx) => (
                <li key={idx}>
                  <a 
                    href={link.url}
                    className="hover:text-white hover:underline transition-all block"
                    style={{ textDecorationColor: primaryBrandColor }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Copyright & Regulatory Sub-bar */}
        <div className="max-w-7xl mx-auto pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-400 text-center sm:text-left">
          <p>{footer.copyright}</p>
          <div className="flex items-center gap-4">
            <a href="/terms" className="hover:text-slate-300 transition-colors">Terms</a>
            <span>•</span>
            <a href="/privacy" className="hover:text-slate-300 transition-colors">Privacy</a>
            <span>•</span>
            <span className="text-emerald-400">PostgreSQL 16.4 RLS Protected</span>
          </div>
        </div>
      </footer>

      {/* ======================================================================
          NATIVE MOBILE APP-LIKE STICKY BOTTOM ACTION BAR (Phones / Tablets)
          ====================================================================== */}
      <aside aria-label="Mobile Navigation" className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 bg-[#020617]/90 backdrop-blur-2xl border-t border-white/10 lg:hidden shadow-[0_-10px_30px_rgba(0,0,0,0.6)]">
        <div className="max-w-md mx-auto flex items-center gap-3">
          
          {/* Quick WhatsApp Native Touch Action */}
          <a
            href={`https://wa.me/${sanitizedWhatsApp}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Direct WhatsApp Operations Support"
            className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 active:scale-95 transition-all flex items-center justify-center shrink-0"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 012.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.08l-.29-.17-3.02.79.81-2.94-.19-.3a8.21 8.21 0 01-1.26-4.37c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.49-1.39-1.74-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z"/>
            </svg>
          </a>

          {/* Primary CTA Locked to Screen Bottom */}
          <a
            href={hero.primary_cta_url || "/register"}
            className="flex-1 py-3.5 px-6 rounded-2xl font-bold text-white text-sm shadow-xl active:scale-98 transition-all flex items-center justify-center gap-2 border border-white/20 text-center truncate"
            style={{
              background: `linear-gradient(135deg, ${primaryBrandColor}, #c2410c)`,
              boxShadow: `0 8px 25px -5px ${primaryBrandColor}90`
            }}
          >
            <span className="truncate">{hero.primary_cta_label}</span>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>

        </div>
      </aside>

    </div>
  );
}