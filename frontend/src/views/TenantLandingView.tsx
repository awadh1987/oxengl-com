import React, { useMemo } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  Globe,
  LogIn,
  Receipt,
  Scale,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useDynamicBranding } from '../hooks/useDynamicBranding';
import { TenantAvatar } from '../components/TenantAvatar';
import { getSubdomain, isCustomDomain, getCustomDomain } from '../utils/subdomain';

/**
 * Phase 4 — Tenant Custom Landing Engine.
 *
 * Public landing page rendered on a tenant subdomain (`acme.oxengl.me`) or a mapped
 * custom domain (`erp.acme.com`). It intentionally does NOT use `.platform-dark`:
 * every colour, the logo and the light/dark preference come from the tenant's
 * `tenant_branding` record via `useDynamicBranding`.
 */

interface TenantLandingViewProps {
  onSignIn: () => void;
}

/** Convert #rgb / #rrggbb to rgba(); returns the input unchanged for other formats. */
const withAlpha = (color: string, alpha: number): string => {
  const hex = color?.trim().replace('#', '') || '';
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Only allow http(s) or same-origin relative URLs for tenant-configured CTA links. */
const safeCtaUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const CAPABILITIES = [
  { icon: Truck, title: 'Fleet & Haulage Operations', detail: 'Daily trip logs, dispatch and delivery tracking.' },
  { icon: Scale, title: 'Weighbridge Control', detail: 'Certified gross, tare and net weights per ticket.' },
  { icon: FileSpreadsheet, title: 'ZATCA Phase-2 Invoicing', detail: 'Compliant, cryptographically stamped tax invoices.' },
  { icon: Receipt, title: 'Finance & Vouchers', detail: 'Receipts, payments and a full general ledger.' },
];

export const TenantLandingView: React.FC<TenantLandingViewProps> = ({ onSignIn }) => {
  const { branding, isLoading } = useDynamicBranding();

  const isDark = branding.landing?.themeMode === 'dark';
  const primary = branding.primaryColor || '#f97316';
  const accent = branding.accentColor || '#0f172a';
  const brandName = branding.brandName || 'Workspace';

  const hostLabel = useMemo(() => {
    if (typeof window === 'undefined') return '';
    if (isCustomDomain()) return getCustomDomain() || window.location.hostname;
    const sub = getSubdomain();
    return sub ? `${sub}.oxengl.me` : window.location.hostname;
  }, []);

  const heroTitle = branding.landing?.heroTitle?.trim() || `Welcome to ${brandName}`;
  const heroSubtitle =
    branding.landing?.heroSubtitle?.trim() ||
    'Our secure operations and finance workspace. Sign in to manage logistics, invoicing and reporting in one place.';
  const ctaLabel = branding.landing?.ctaLabel?.trim() || 'Sign in to workspace';
  const ctaUrl = safeCtaUrl(branding.landing?.ctaUrl);

  const handleCta = () => {
    if (ctaUrl) {
      window.location.href = ctaUrl;
    } else {
      onSignIn();
    }
  };

  const surface = isDark ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900';
  const card = isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white';
  const muted = isDark ? 'text-slate-400' : 'text-slate-600';

  if (isLoading) {
    return (
      <div className={`flex min-h-dvh-safe items-center justify-center ${surface}`}>
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: primary, borderTopColor: 'transparent' }}
          aria-label="Loading workspace"
        />
      </div>
    );
  }

  return (
    <div
      className={`tenant-landing-root min-h-dvh-safe pt-safe pb-safe px-safe font-sans transition-colors ${surface}`}
      style={
        {
          '--tenant-primary': primary,
          '--tenant-accent': accent,
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          isDark ? 'border-slate-800/80 bg-slate-950/85' : 'border-slate-200 bg-white/85'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <TenantAvatar logoUrl={branding.logoUrl} name={brandName} primaryColor={primary} size="sm" />
            <span className="truncate text-sm font-bold sm:text-base">{brandName}</span>
          </div>
          <button
            id="tenant-landing-signin"
            type="button"
            onClick={onSignIn}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-95"
            style={{ backgroundColor: primary, boxShadow: `0 8px 20px -6px ${withAlpha(primary, 0.5)}` }}
          >
            <LogIn className="h-4 w-4" />
            <span>Sign in</span>
          </button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(60% 60% at 20% 0%, ${withAlpha(primary, isDark ? 0.22 : 0.14)} 0%, transparent 70%), radial-gradient(50% 50% at 90% 10%, ${withAlpha(accent, isDark ? 0.35 : 0.08)} 0%, transparent 70%)`,
            }}
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold"
                style={{ borderColor: withAlpha(primary, 0.4), backgroundColor: withAlpha(primary, 0.1), color: primary }}
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="ltr-isolate">{hostLabel}</span>
              </span>
              <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                {heroTitle}
              </h1>
              <p className={`mt-5 max-w-xl text-sm leading-relaxed sm:text-base ${muted}`}>{heroSubtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  id="tenant-landing-cta"
                  type="button"
                  onClick={handleCta}
                  className="group inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold text-white shadow-xl transition hover:brightness-110 active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, ${primary}, ${withAlpha(primary, 0.85)})`,
                    boxShadow: `0 14px 30px -10px ${withAlpha(primary, 0.6)}`,
                  }}
                >
                  <span>{ctaLabel}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                {ctaUrl && (
                  <button
                    id="tenant-landing-secondary-signin"
                    type="button"
                    onClick={onSignIn}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-6 py-3.5 text-sm font-bold transition ${
                      isDark ? 'border-slate-700 hover:border-slate-500' : 'border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Sign in</span>
                  </button>
                )}
              </div>
            </div>

            {/* Brand emblem card */}
            <div
              className={`relative mx-auto flex w-full max-w-sm flex-col items-center rounded-3xl border p-8 text-center shadow-2xl ${card}`}
              style={{ boxShadow: `0 30px 60px -30px ${withAlpha(primary, 0.45)}` }}
            >
              <TenantAvatar logoUrl={branding.logoUrl} name={brandName} primaryColor={primary} size="2xl" showGlow />
              <p className="mt-5 text-lg font-black">{brandName}</p>
              <p className={`mt-1 text-xs ${muted}`}>Secure tenant workspace</p>
              <div
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold"
                style={{ borderColor: withAlpha(primary, 0.3), color: primary }}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Isolated data · Encrypted in transit</span>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map(({ icon: Icon, title, detail }) => (
              <article
                key={title}
                className={`group rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 ${card}`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = withAlpha(primary, 0.55);
                  e.currentTarget.style.boxShadow = `0 12px 30px -16px ${withAlpha(primary, 0.6)}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: withAlpha(primary, 0.12), color: primary }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-sm font-bold">{title}</h2>
                <p className={`mt-1.5 text-xs leading-relaxed ${muted}`}>{detail}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className={`border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className={`mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6 ${muted}`}>
          <span>
            © {new Date().getFullYear()} {brandName}
          </span>
          <span className="ltr-isolate">Powered by OxenGL</span>
        </div>
      </footer>
    </div>
  );
};

export default TenantLandingView;
