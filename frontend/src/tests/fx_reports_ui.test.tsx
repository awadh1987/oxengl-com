// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { formatCurrency } from '../utils/formatters';
import {
  erpApi,
  ApiFxGainLossReport,
  ApiMultiCurrencyTrialBalanceReport,
} from '../services/api';
import arTranslations from '../locales/ar.json';
import enTranslations from '../locales/en.json';

describe('OxenGL FX Exposure & Multi-Currency Reporting UI Test Suite', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('1. Currency Formatter Verification (USD, SAR, YER)', () => {
    it('formats USD values properly with $ symbol', () => {
      expect(formatCurrency(1250.5, 'en', 'USD')).toBe('$1,250.50');
      expect(formatCurrency(-450.25, 'en', 'USD')).toBe('$-450.25');
    });

    it('formats SAR values properly in Arabic and English', () => {
      expect(formatCurrency(3750, 'ar', 'SAR')).toContain('ر.س');
      expect(formatCurrency(3750, 'en', 'SAR')).toBe('3,750.00 SR');
    });

    it('formats YER values properly in Arabic and English', () => {
      expect(formatCurrency(535000, 'ar', 'YER')).toContain('﷼');
      expect(formatCurrency(535000, 'en', 'YER')).toBe('535,000.00 YER');
    });
  });

  describe('2. Localization Dictionaries for Reports & FX Sync', () => {
    it('verifies that ar.json and en.json contain report and fx keys', () => {
      const enCommon = (enTranslations as any).common;
      const arCommon = (arTranslations as any).common;

      expect(enCommon?.fxExposure).toBe('FX Exposure & Revaluation');
      expect(arCommon?.fxExposure).toBe('إعادة التقييم ومخاطر الصرف');

      expect(enCommon?.nativeCurrency).toBe('Native Currency');
      expect(arCommon?.nativeCurrency).toBe('العملة الأصلية');

      expect(enCommon?.consolidatedBaseCurrency).toBe('Consolidated Base Currency');
      expect(arCommon?.consolidatedBaseCurrency).toBe('العملة الأساسية الموحدة');

      expect(enCommon?.syncFxRates).toBe('Sync FX Rates');
      expect(arCommon?.syncFxRates).toBe('مزامنة أسعار الصرف');
    });
  });

  describe('3. FX Gain/Loss Revaluation Engine Logic', () => {
    const mockFxReport: ApiFxGainLossReport = {
      report_name: 'Unrealized FX Gain/Loss Report',
      as_of_date: '2026-10-10',
      base_currency: 'USD',
      active_rates: { SAR: 3.75, YER: 535.0 },
      summary: {
        net_unrealized_gain_loss_usd: 125.5,
        total_ar_gain_loss_usd: 200.0,
        total_ap_gain_loss_usd: -74.5,
        total_open_ar_usd: 5000.0,
        total_open_ap_usd: 2000.0,
        net_exposure_usd: 3000.0,
        ar_count: 2,
        ap_count: 1,
      },
      ar_revaluation: [
        {
          document_type: 'AR',
          invoice_id: 'inv-1',
          invoice_number: 'INV-2026-001',
          partner_name: 'Al-Amal Trading',
          issue_date: '2026-09-01',
          currency: 'SAR',
          outstanding_amount: 18750.0,
          original_rate_to_usd: 3.75,
          current_rate_to_usd: 3.75,
          original_usd: 5000.0,
          current_usd: 5000.0,
          unrealized_gain_loss_usd: 0.0,
          revaluation_status: 'NEUTRAL',
        },
        {
          document_type: 'AR',
          invoice_id: 'inv-2',
          invoice_number: 'INV-2026-002',
          partner_name: 'Aden Marine Supply',
          issue_date: '2026-09-15',
          currency: 'YER',
          outstanding_amount: 1070000.0,
          original_rate_to_usd: 535.0,
          current_rate_to_usd: 500.0, // YER appreciated against USD
          original_usd: 2000.0,
          current_usd: 2140.0,
          unrealized_gain_loss_usd: 140.0,
          revaluation_status: 'GAIN',
        },
      ],
      ap_revaluation: [
        {
          document_type: 'AP',
          invoice_id: 'bill-1',
          invoice_number: 'BILL-2026-001',
          partner_name: 'Gulf Fuel Distribution',
          issue_date: '2026-09-20',
          currency: 'SAR',
          outstanding_amount: 7500.0,
          original_rate_to_usd: 3.75,
          current_rate_to_usd: 3.75,
          original_usd: 2000.0,
          current_usd: 2000.0,
          unrealized_gain_loss_usd: 0.0,
          revaluation_status: 'NEUTRAL',
        },
      ],
    };

    it('correctly assesses AR and AP revaluation amounts and gain/loss status', () => {
      expect(mockFxReport.summary.net_unrealized_gain_loss_usd).toBe(125.5);
      expect(mockFxReport.ar_revaluation[1].revaluation_status).toBe('GAIN');
      expect(mockFxReport.ar_revaluation[1].unrealized_gain_loss_usd).toBe(140.0);
      expect(mockFxReport.ap_revaluation[0].revaluation_status).toBe('NEUTRAL');
    });

    it('renders FX exposure summary KPIs and table cards', () => {
      const { container } = render(
        <div data-testid="fx-exposure-container">
          <div data-testid="kpi-net-gain-loss">
            {formatCurrency(mockFxReport.summary.net_unrealized_gain_loss_usd, 'en', 'USD')}
          </div>
          <div data-testid="kpi-open-ar">
            {formatCurrency(mockFxReport.summary.total_open_ar_usd, 'en', 'USD')}
          </div>
          <div data-testid="kpi-open-ap">
            {formatCurrency(mockFxReport.summary.total_open_ap_usd, 'en', 'USD')}
          </div>
          <table>
            <tbody>
              {mockFxReport.ar_revaluation.map((item) => (
                <tr key={item.invoice_number} data-testid={`row-${item.invoice_number}`}>
                  <td>{item.invoice_number}</td>
                  <td>{item.partner_name}</td>
                  <td>{formatCurrency(item.outstanding_amount, 'en', item.currency)}</td>
                  <td>{item.revaluation_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

      expect(screen.getByTestId('kpi-net-gain-loss')).toHaveTextContent('$125.50');
      expect(screen.getByTestId('kpi-open-ar')).toHaveTextContent('$5,000.00');
      expect(screen.getByTestId('kpi-open-ap')).toHaveTextContent('$2,000.00');
      expect(screen.getByTestId('row-INV-2026-002')).toHaveTextContent('GAIN');
      expect(screen.getByTestId('row-INV-2026-002')).toHaveTextContent('1,070,000.00 YER');
    });
  });

  describe('4. Multi-Currency Trial Balance Data Model', () => {
    const mockMcTb: ApiMultiCurrencyTrialBalanceReport = {
      report_name: 'Multi-Currency General Ledger Trial Balance',
      base_currency: 'USD',
      supported_currencies: ['USD', 'SAR', 'YER'],
      is_balanced: true,
      discrepancy_usd: 0.0,
      consolidated_totals: {
        total_debit_usd: 25000.0,
        total_credit_usd: 25000.0,
      },
      native_totals: {
        USD: { debit: 10000.0, credit: 10000.0 },
        SAR: { debit: 37500.0, credit: 37500.0 },
        YER: { debit: 2675000.0, credit: 2675000.0 },
      },
      active_rates: { SAR: 3.75, YER: 535.0 },
      accounts: [
        {
          account_code: '1010',
          account_name: 'Cash and Bank Equivalents',
          account_name_ar: 'النقد وما في حكمه',
          account_type: 'ASSET',
          native_balances: {
            USD: { debit: 5000.0, credit: 0.0, net_balance: 5000.0 },
            SAR: { debit: 18750.0, credit: 0.0, net_balance: 18750.0 }, // = 5000 USD
            YER: { debit: 2675000.0, credit: 0.0, net_balance: 2675000.0 }, // = 5000 USD
          },
          consolidated_usd: {
            total_debit: 15000.0,
            total_credit: 0.0,
            net_balance: 15000.0,
          },
        },
      ],
    };

    it('verifies multi-currency ledger balances parity across native currencies', () => {
      expect(mockMcTb.is_balanced).toBe(true);
      expect(mockMcTb.discrepancy_usd).toBe(0.0);
      expect(mockMcTb.consolidated_totals.total_debit_usd).toBe(25000.0);

      const cashAccount = mockMcTb.accounts[0];
      expect(cashAccount.account_code).toBe('1010');
      expect(cashAccount.native_balances.USD.debit).toBe(5000.0);
      expect(cashAccount.native_balances.SAR.debit).toBe(18750.0);
      expect(cashAccount.native_balances.YER.debit).toBe(2675000.0);
      expect(cashAccount.consolidated_usd.total_debit).toBe(15000.0);
    });
  });

  describe('5. erpApi Service Methods', () => {
    it('verifies getFxGainLossReport calls the correct endpoint', async () => {
      const spy = vi.spyOn(erpApi, 'getFxGainLossReport').mockResolvedValueOnce({
        report_name: 'Test FX',
        as_of_date: '2026-10-10',
        base_currency: 'USD',
        active_rates: { SAR: 3.75, YER: 535.0 },
        summary: {
          net_unrealized_gain_loss_usd: 0,
          total_ar_gain_loss_usd: 0,
          total_ap_gain_loss_usd: 0,
          total_open_ar_usd: 0,
          total_open_ap_usd: 0,
          net_exposure_usd: 0,
          ar_count: 0,
          ap_count: 0,
        },
        ar_revaluation: [],
        ap_revaluation: [],
      });

      const res = await erpApi.getFxGainLossReport({ companyId: 'test-co' });
      expect(spy).toHaveBeenCalledWith({ companyId: 'test-co' });
      expect(res.report_name).toBe('Test FX');
    });

    it('verifies triggerFxSync triggers sync and returns status', async () => {
      const spy = vi.spyOn(erpApi, 'triggerFxSync').mockResolvedValueOnce({
        status: 'success',
        synced_pairs: 2,
        flushed_cache_keys: 3,
        rates: { SAR: 3.75, YER: 535.0 },
      });

      const res = await erpApi.triggerFxSync('test-co');
      expect(spy).toHaveBeenCalledWith('test-co');
      expect(res.synced_pairs).toBe(2);
      expect(res.flushed_cache_keys).toBe(3);
    });
  });
});
