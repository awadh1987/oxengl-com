import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ar from './locales/ar.json';

export const LOCALE_STORAGE_KEY = 'oxengl_locale';

export const getInitialLocale = (): 'ar' | 'en' => {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) || localStorage.getItem('oxengl_language');
  if (stored === 'en' || stored === 'ar') return stored;
  return 'ar';
};

export const syncHtmlDirectionAndLanguage = (locale: string) => {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('data-direction', dir);
    document.documentElement.style.direction = dir;
  }
};

const initialLocale = getInitialLocale();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: initialLocale,
    fallbackLng: 'ar',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

syncHtmlDirectionAndLanguage(initialLocale);

i18n.on('languageChanged', (lng) => {
  const normalizedLng = lng === 'en' ? 'en' : 'ar';
  localStorage.setItem(LOCALE_STORAGE_KEY, normalizedLng);
  localStorage.setItem('oxengl_language', normalizedLng);
  syncHtmlDirectionAndLanguage(normalizedLng);
});

export default i18n;
