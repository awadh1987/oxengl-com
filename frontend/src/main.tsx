import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n.ts';

// Global Localization & Safe Reference Initializer
if (typeof window !== 'undefined') {
  (window as any).isAr = Boolean(
    (typeof localStorage !== 'undefined' && (
      localStorage.getItem('oxengl_language') === 'ar' ||
      localStorage.getItem('i18nextLng')?.startsWith('ar')
    )) ||
    (typeof document !== 'undefined' && (
      document.documentElement.lang?.startsWith('ar') ||
      document.documentElement.dir === 'rtl'
    ))
  );
}

// Dynamic Chunk Loading Error Auto-Recovery (Stale Bundle Hash Protection)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[OxenGL] Vite preload error detected, reloading to fetch latest bundle:', event);
  window.location.reload();
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message || event.reason || '');
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Unable to preload CSS')
  ) {
    console.warn('[OxenGL] Dynamic chunk import failed due to outdated hash. Purging caches and reloading...');
    if ('caches' in window) {
      caches.keys().then((keys) => {
        return Promise.all(keys.map((k) => caches.delete(k)));
      }).then(() => {
        window.location.reload();
      }).catch(() => {
        window.location.reload();
      });
    } else {
      (window as Window).location.reload();
    }
  }
});

// Explicitly unregister and bypass Service Worker caching during development/maintenance phase
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log('[OxenGL SW] Unregistered legacy service worker:', registration.scope);
        }
      });
    }
  }).catch((err) => {
    console.warn('[OxenGL SW] Error unregistering service workers:', err);
  });
}

if (typeof window !== 'undefined' && 'caches' in window) {
  caches.keys().then((keys) => {
    return Promise.all(
      keys.map((key) => {
        console.log('[OxenGL Cache] Purging cache:', key);
        return caches.delete(key);
      })
    );
  }).catch((err) => {
    console.warn('[OxenGL Cache] Error clearing caches:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


