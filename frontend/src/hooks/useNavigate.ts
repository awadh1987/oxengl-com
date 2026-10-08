import { useCallback } from 'react';
import { getSubdomain, getRootDomain, isLocalhost } from '../utils/subdomain';

export type NavigateOptions = {
  replace?: boolean;
};

export function useNavigate() {
  return useCallback((to: string | number, options?: NavigateOptions) => {
    if (typeof window === 'undefined') return;

    if (typeof to === 'number') {
      window.history.go(to);
      return;
    }

    const path = to;

    // If navigating to root / Neutral Hub ('/') while on a tenant subdomain,
    // route the user back to the global tenant selector / Neutral Hub on the root apex domain.
    if ((path === '/' || path === '') && getSubdomain()) {
      if (!isLocalhost()) {
        const rootDomain = getRootDomain();
        window.location.href = `${window.location.protocol}//${rootDomain}/`;
        return;
      }
    }

    if (options?.replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);
}

export default useNavigate;
