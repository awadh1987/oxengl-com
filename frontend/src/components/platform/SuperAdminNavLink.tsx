import React from 'react';

/**
 * Super Admin cross-module navigation.
 *
 * The Super Admin modules (Tenants Grid, Audit Logs, Velocity Analytics, Admin Hub) exist both as
 * standalone SPA routes (/admin/*) and as tabs embedded inside the Super Admin Cockpit. Views accept
 * an optional `onNavigate` callback: when embedded, the cockpit passes one so the header buttons
 * switch cockpit tabs in place; when standalone, we fall back to client-side routing (pushState +
 * popstate, which App.tsx listens to) instead of a full page reload.
 */
export type SuperAdminNavTarget = 'hub' | 'tenants' | 'logs' | 'analytics';

export const SUPER_ADMIN_ROUTES: Record<SuperAdminNavTarget, string> = {
  hub: '/admin',
  tenants: '/admin/tenants',
  logs: '/admin/logs',
  analytics: '/admin/analytics',
};

export function navigateSuperAdmin(target: SuperAdminNavTarget, onNavigate?: (target: SuperAdminNavTarget) => void): void {
  if (onNavigate) {
    onNavigate(target);
    return;
  }
  if (typeof window === 'undefined') return;
  const path = SUPER_ADMIN_ROUTES[target];
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

interface SuperAdminNavLinkProps {
  target: SuperAdminNavTarget;
  onNavigate?: (target: SuperAdminNavTarget) => void;
  id: string;
  className: string;
  children: React.ReactNode;
}

/** Real <a href> (middle-click / open-in-new-tab still work) with in-app navigation on plain click. */
export const SuperAdminNavLink: React.FC<SuperAdminNavLinkProps> = ({ target, onNavigate, id, className, children }) => (
  <a
    id={id}
    href={SUPER_ADMIN_ROUTES[target]}
    className={className}
    onClick={(event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateSuperAdmin(target, onNavigate);
    }}
  >
    {children}
  </a>
);
