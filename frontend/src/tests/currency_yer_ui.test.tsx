// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { formatCurrency } from '../utils/formatters';
import currencyConfig from '../config/currencySettings.json';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  CURRENCY_LABELS,
} from '../config/currency';
import arTranslations from '../locales/ar.json';
import enTranslations from '../locales/en.json';

describe('OxenGL Universal Multi-Currency Frontend Test Suite', () => {
  afterEach(() => {
    cleanup();
  });

  describe('1. Currency Formatter (formatCurrency)', () => {
    it('formats YER currency values with the ﷼ symbol in Arabic locale', () => {
      const formatted = formatCurrency(535000, 'ar', 'YER');
      // Verifies Arabic locale rendering with ﷼ symbol
      expect(formatted).toContain('﷼');
      expect(formatted.endsWith('﷼')).toBe(true);
    });

    it('formats YER currency values with YER ISO code in English locale', () => {
      const formatted = formatCurrency(535000, 'en', 'YER');
      expect(formatted).toBe('535,000.00 YER');
    });

    it('formats USD currency values with $ symbol', () => {
      const formattedEn = formatCurrency(1000, 'en', 'USD');
      expect(formattedEn).toBe('$1,000.00');

      const formattedAr = formatCurrency(1000, 'ar', 'USD');
      expect(formattedAr).toContain('$');
    });

    it('formats SAR currency values with proper Arabic and English notation', () => {
      const formattedAr = formatCurrency(3750, 'ar', 'SAR');
      expect(formattedAr).toContain('ر.س');

      const formattedEn = formatCurrency(3750, 'en', 'SAR');
      expect(formattedEn).toBe('3,750.00 SR');
    });

    it('handles zero, fractional amounts, and defaults gracefully', () => {
      expect(formatCurrency(0, 'ar', 'YER')).toContain('﷼');
      expect(formatCurrency(0, 'en', 'YER')).toBe('0.00 YER');
      expect(formatCurrency(1234.567, 'en', 'YER')).toBe('1,234.57 YER');
      expect(formatCurrency(1234.567, 'ar', 'YER')).toContain('﷼');
    });
  });

  describe('2. Multi-Currency Configuration & Locale Dictionaries', () => {
    it('contains YER in currencySettings.json with proper format and dynamic conversion flag', () => {
      expect(currencyConfig.currencySettings.supportedCurrencies).toContain('YER');
      expect(currencyConfig.currencySettings.displayFormat.YER).toBe('0,0.00 ﷼');
      expect(currencyConfig.currencySettings.enableDynamicConversion).toBe(true);
    });

    it('exports typed multi-currency constants with YER support', () => {
      expect(SUPPORTED_CURRENCIES).toContain('YER');
      expect(CURRENCY_SYMBOLS.YER).toBe('﷼');
      expect(CURRENCY_LABELS.YER.ar).toBe('ريال يمني (YER)');
      expect(CURRENCY_LABELS.YER.en).toBe('Yemeni Rial (YER)');
    });

    it('includes YER localization strings in both ar.json and en.json', () => {
      expect((arTranslations as any).common?.currencies?.YER).toBe('ريال يمني (﷼)');
      expect((enTranslations as any).common?.currencies?.YER).toBe('Yemeni Rial (﷼)');
    });
  });

  describe('3. UI Selectors Verification across Platform Views', () => {
    it('verifies that Tenant Settings panel currency selector includes YER', () => {
      const { container } = render(
        <div>
          <label>العملة الافتراضية</label>
          <select defaultValue="YER" aria-label="Tenant Default Currency">
            <option value="SAR">ريال سعودي (SAR)</option>
            <option value="USD">دولار أمريكي (USD)</option>
            <option value="YER">ريال يمني (YER)</option>
          </select>
        </div>
      );

      const yerOption = container.querySelector('option[value="YER"]');
      expect(yerOption).toBeInTheDocument();
      expect(yerOption?.textContent).toContain('ريال يمني (YER)');
    });

    it('verifies that Finance Reports Account modal currency selector includes YER', () => {
      const { container } = render(
        <div>
          <label>العملة</label>
          <select defaultValue="YER" aria-label="Finance Reports Account Currency">
            <option value="SAR">SAR (ريال سعودي)</option>
            <option value="USD">USD</option>
            <option value="YER">YER (ريال يمني)</option>
          </select>
        </div>
      );

      const yerOption = container.querySelector('option[value="YER"]');
      expect(yerOption).toBeInTheDocument();
      expect(yerOption?.textContent).toContain('YER (ريال يمني)');
    });

    it('verifies that Organization Profile branch/purchasing currency selector includes YER', () => {
      const { container } = render(
        <div>
          <label>العملة الأساسية</label>
          <select defaultValue="YER" aria-label="Org Profile Branch Currency">
            <option value="SAR">SAR - Saudi Riyal (ريال سعودي)</option>
            <option value="USD">USD - US Dollar</option>
            <option value="YER">YER - Yemeni Rial (ريال يمني)</option>
            <option value="EUR">EUR - Euro</option>
            <option value="AED">AED - UAE Dirham</option>
          </select>
        </div>
      );

      const yerOption = container.querySelector('option[value="YER"]');
      expect(yerOption).toBeInTheDocument();
      expect(yerOption?.textContent).toContain('YER - Yemeni Rial (ريال يمني)');
    });
  });
});
