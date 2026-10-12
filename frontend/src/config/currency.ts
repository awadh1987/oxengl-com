/**
 * OxenGL Universal Multi-Currency Configuration (USD, SAR, YER).
 * Sourced from docs/oxengl_multi_currency_architecture.md
 */

import currencySettingsJson from './currencySettings.json';

export interface CurrencyConfig {
  baseCurrency: 'USD' | 'SAR' | 'YER';
  supportedCurrencies: Array<'USD' | 'SAR' | 'YER'>;
  displayFormat: {
    USD: string;
    SAR: string;
    YER: string;
  };
  enableDynamicConversion: boolean;
}

export const CURRENCY_SETTINGS: CurrencyConfig = currencySettingsJson.currencySettings as CurrencyConfig;

export const SUPPORTED_CURRENCIES = CURRENCY_SETTINGS.supportedCurrencies;
export const BASE_CURRENCY = CURRENCY_SETTINGS.baseCurrency;
export const DISPLAY_FORMATS = CURRENCY_SETTINGS.displayFormat;

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  SAR: 'SR',
  YER: '﷼',
};

export const CURRENCY_LABELS: Record<string, { en: string; ar: string }> = {
  USD: { en: 'US Dollar (USD)', ar: 'دولار أمريكي (USD)' },
  SAR: { en: 'Saudi Riyal (SAR)', ar: 'ريال سعودي (SAR)' },
  YER: { en: 'Yemeni Rial (YER)', ar: 'ريال يمني (YER)' },
};
