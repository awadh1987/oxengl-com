// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TenantRegistrationView } from './TenantRegistrationView';
import { TenantBillingView } from './TenantBillingView';

const mockShowToast = vi.fn();
const mockSetLanguage = vi.fn();
const STABLE_COMPANY = { id: 1, name: 'Myon Contracting', taxId: '300123456700003' };

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    language: 'en',
    themeMode: 'dark',
    setLanguage: mockSetLanguage,
    showToast: mockShowToast,
    currentCompany: STABLE_COMPANY,
    currentUser: { id: 'u1', fullName: 'Moath Admin', role: 'admin', email: 'moath@myon-contract.cloud' },
  }),
}));

vi.mock('../hooks/usePricingPlans', () => ({
  usePricingPlans: () => ({
    plans: [
      {
        id: 'tier-free',
        name: 'FREE',
        display_name: 'Starter',
        monthly_price: 0,
        annual_price: 0,
        max_users: 2,
        max_trips: 50,
        features: ['Core Ledger'],
      },
      {
        id: 'tier-ent',
        name: 'ENTERPRISE',
        display_name: 'Enterprise',
        monthly_price: 1499,
        annual_price: 14990,
        max_users: 999,
        max_trips: 99999,
        features: ['Custom Domain', 'Dedicated DB'],
      },
    ],
    loading: false,
  }),
}));

const mockFetchPublicBillingGateways = vi.fn();

vi.mock('../services/billingSettingsService', () => ({
  fetchPublicBillingGateways: (...args: any[]) => mockFetchPublicBillingGateways(...args),
}));

const mockGetTenantSubscription = vi.fn();
const mockGetSubscriptionPlans = vi.fn();
const mockGetTenantInvoices = vi.fn();
const mockGetTenantBillingGateways = vi.fn();

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    erpApi: {
      ...actual.erpApi,
      getTenantSubscription: (...args: any[]) => mockGetTenantSubscription(...args),
      getSubscriptionPlans: (...args: any[]) => mockGetSubscriptionPlans(...args),
      getTenantInvoices: (...args: any[]) => mockGetTenantInvoices(...args),
      getTenantBillingGateways: (...args: any[]) => mockGetTenantBillingGateways(...args),
    },
  };
});

describe('Phase 2: Multi-Tenant Registration & Billing Systems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPublicBillingGateways.mockResolvedValue({
      is_stripe_enabled: true,
      stripe_mode: 'test',
      stripe_publishable_key: 'pk_test_123',
      is_moyasar_enabled: true,
      moyasar_mode: 'test',
      moyasar_publishable_key: 'pk_test_moyasar_456',
      local_bank_instructions: [
        {
          id: 'bank-1',
          bank_name: 'Al Rajhi Corporate Bank',
          account_name: 'OxenGL Cloud Technologies LLC',
          iban: 'SA9980000000123456789012',
          swift: 'RJHISARI',
          currency: 'SAR',
          notes: 'Include subdomain in reference',
          is_active: true,
        },
      ],
      digital_wallet_instructions: [
        {
          id: 'wallet-1',
          provider: 'STC Pay Corporate',
          wallet_number: '966500009999',
          account_name: 'OxenGL Cloud LLC',
          qr_code_url: '',
          notes: 'Send transfer receipt',
          is_active: true,
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders TenantRegistrationView with OxenGL dark theme (bg-slate-950 / bg-slate-900) and connects to dynamic Billing Gateway settings', async () => {
    const { container } = render(<TenantRegistrationView />);

    // Verify unified OxenGL dark theme classes on root wrapper
    const rootDiv = container.firstElementChild as HTMLElement;
    expect(rootDiv.className).toContain('bg-slate-950');

    // Wait for dynamic gateways to load
    await waitFor(() => {
      expect(mockFetchPublicBillingGateways).toHaveBeenCalled();
    });

    // Click on Upgrade to Unlock button to open the dynamic gateway payment modal
    const upgradeBtns = screen.getAllByRole('button', { name: /Upgrade to Unlock/i });
    fireEvent.click(upgradeBtns[0]);

    // Verify dynamic payment modal opens with Card, Regional Wallet, and Bank Wire tabs
    expect(await screen.findByText('Enterprise Grade Subscription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mada \/ Credit Card/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Regional Wallet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Saudi Bank Wire/i })).toBeInTheDocument();

    // Switch to Bank Wire tab and verify dynamic bank details from Billing Gateway Settings
    fireEvent.click(screen.getByRole('button', { name: /Saudi Bank Wire/i }));
    expect(await screen.findByText('Al Rajhi Corporate Bank')).toBeInTheDocument();
    expect(screen.getByText('SA9980000000123456789012')).toBeInTheDocument();

    // Switch to Regional Wallet tab and verify dynamic wallet details
    fireEvent.click(screen.getByRole('button', { name: /Regional Wallet/i }));
    expect(await screen.findByText('STC Pay Corporate')).toBeInTheDocument();
    expect(screen.getByText('966500009999')).toBeInTheDocument();
  });

  it('renders TenantBillingView with active subscription and dynamic gateway bank details without 403 error', async () => {
    mockGetTenantSubscription.mockResolvedValue({
      id: 'sub-1',
      tenant_id: 'tenant-1',
      plan_name: 'FREE',
      status: 'ACTIVE',
      billing_cycle: 'monthly',
      current_period_start: '2026-10-01T00:00:00Z',
      current_period_end: '2026-11-01T00:00:00Z',
      cancel_at_period_end: false,
      current_users: 1,
      max_users: 2,
      current_trips: 5,
      max_trips: 50,
    });
    mockGetSubscriptionPlans.mockResolvedValue([
      {
        id: 'plan-free',
        name: 'FREE',
        display_name: 'Starter',
        monthly_price: 0,
        annual_price: 0,
        max_users: 2,
        max_trips: 50,
        features: ['Core Ledger'],
      },
    ]);
    mockGetTenantInvoices.mockResolvedValue([]);
    mockGetTenantBillingGateways.mockResolvedValue({
      is_stripe_enabled: true,
      stripe_mode: 'test',
      stripe_publishable_key: 'pk_test_123',
      is_moyasar_enabled: true,
      moyasar_mode: 'test',
      moyasar_publishable_key: 'pk_test_456',
      local_bank_instructions: [
        {
          id: 'bank-1',
          bank_name: 'Al Rajhi Corporate Bank',
          account_name: 'OxenGL Cloud Technologies LLC',
          iban: 'SA9980000000123456789012',
          swift: 'RJHISARI',
          currency: 'SAR',
          is_active: true,
        },
      ],
      digital_wallet_instructions: [],
    });

    render(<TenantBillingView />);

    await waitFor(() => {
      expect(mockGetTenantSubscription).toHaveBeenCalled();
      expect(mockGetTenantBillingGateways).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Multi-Grade SaaS Subscription & Billing/i)).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-billing-activation-banner')).not.toBeInTheDocument();
  });

  it('renders graceful workspace billing activation banner if subscription record is initially null', async () => {
    mockGetTenantSubscription.mockResolvedValue(null);
    mockGetSubscriptionPlans.mockResolvedValue([]);
    mockGetTenantInvoices.mockResolvedValue([]);
    mockGetTenantBillingGateways.mockResolvedValue(null);

    render(<TenantBillingView />);

    const banner = await screen.findByTestId('workspace-billing-activation-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Initialize Workspace Billing/i })).toBeInTheDocument();
  });
});
