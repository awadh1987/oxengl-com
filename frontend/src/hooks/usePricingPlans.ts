import { useCallback, useEffect, useState } from 'react';
import { erpApi, SubscriptionPlanDto } from '../services/api';
import { sortPlans } from '../utils/pricing';

/*
 * Shared client for the unified pricing catalog (/api/v1/pricing/plans).
 * One in-memory cache per page load so every pricing view renders the same data,
 * and the Super Admin console can push fresh prices to mounted views after an edit.
 */
let cache: SubscriptionPlanDto[] | null = null;
let inflight: Promise<SubscriptionPlanDto[]> | null = null;
const listeners = new Set<(plans: SubscriptionPlanDto[]) => void>();

const loadPlans = (force = false): Promise<SubscriptionPlanDto[]> => {
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inflight) return inflight;
  inflight = erpApi
    .getPricingPlans()
    .then((plans) => {
      const next = sortPlans(Array.isArray(plans) ? plans : []);
      cache = next;
      listeners.forEach((listener) => listener(next));
      return next;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

/** Re-fetch the catalog and update every mounted usePricingPlans() consumer. */
export const invalidatePricingPlans = (): Promise<SubscriptionPlanDto[]> => loadPlans(true);

export function usePricingPlans() {
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>(cache ?? []);
  const [loading, setLoading] = useState<boolean>(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const listener = (next: SubscriptionPlanDto[]) => {
      if (active) setPlans(next);
    };
    listeners.add(listener);
    if (!cache) {
      loadPlans()
        .then(() => active && setError(null))
        .catch((err) => active && setError(err instanceof Error ? err.message : 'Unable to load pricing.'))
        .finally(() => active && setLoading(false));
    }
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return loadPlans(true)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load pricing.'))
      .finally(() => setLoading(false));
  }, []);

  return { plans, loading, error, reload };
}
