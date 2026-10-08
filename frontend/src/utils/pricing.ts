/**
 * Pricing helpers shared by every pricing view (landing page, tenant billing,
 * Super Admin console). All prices come from the unified catalog endpoint
 * (/api/v1/pricing/plans, backed by the subscription_plans table); nothing here
 * hard-codes a price.
 */
import type { SubscriptionPlanDto } from '../services/api';

/** Limits at or above this value are rendered as "Unlimited". */
export const UNLIMITED_THRESHOLD = 999999;

/** Saudi VAT (ZATCA) applied on top of catalog list prices. */
export const VAT_RATE = 0.15;

export const formatSar = (value: number | string | null | undefined, decimals = 0): string =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export const isUnlimited = (value?: number | null): boolean =>
  typeof value === 'number' && value >= UNLIMITED_THRESHOLD;

export const isFreePlan = (plan: SubscriptionPlanDto): boolean =>
  Number(plan.monthly_price) === 0 && Number(plan.annual_price) === 0;

/** Annual price expressed per month. */
export const annualMonthlyEquivalent = (plan: SubscriptionPlanDto): number => Number(plan.annual_price) / 12;

/** Percentage saved by paying annually instead of 12 x monthly (0 when not applicable). */
export const annualSavingsPercent = (plan: SubscriptionPlanDto): number => {
  const monthly = Number(plan.monthly_price);
  const annual = Number(plan.annual_price);
  if (!monthly || !annual) return 0;
  return Math.max(0, Math.round((1 - annual / (monthly * 12)) * 100));
};

/** Label for an annual-billing toggle, e.g. "Save 17%" or "Save up to 20%" (null if no saving). */
export const annualSavingsLabel = (plans: SubscriptionPlanDto[]): string | null => {
  const savings = plans.map(annualSavingsPercent).filter((value) => value > 0);
  if (!savings.length) return null;
  const max = Math.max(...savings);
  return savings.every((value) => value === max) ? `Save ${max}%` : `Save up to ${max}%`;
};

export const sortPlans = (plans: SubscriptionPlanDto[]): SubscriptionPlanDto[] =>
  [...plans].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.monthly_price) - Number(b.monthly_price),
  );

/** Mirrors backend billing_service.LEGACY_TIER_ALIASES (unknown tiers resolve to FREE). */
const TIER_ALIASES: Record<string, string> = {
  trial: 'FREE',
  starter: 'FREE',
  free: 'FREE',
  basic: 'FREE',
  standard: 'PROFESSIONAL',
  growth: 'PROFESSIONAL',
  pro: 'PROFESSIONAL',
  professional: 'PROFESSIONAL',
  enterprise: 'ENTERPRISE',
  sovereign: 'ENTERPRISE',
};

/** Normalises legacy/mixed tier labels (BASIC, standard, growth...) to catalog plan codes. */
export const normalizeTierCode = (tier?: string | null): string =>
  TIER_ALIASES[(tier || '').trim().toLowerCase()] ?? 'FREE';
