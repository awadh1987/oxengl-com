// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SuperAdminCockpitView } from './SuperAdminCockpitView';
import {
  TenantsRegistryView,
  LicenseProvisionerView,
  SystemAuditView,
  PlatformSettingsView,
  PanoramicCockpit,
} from '../components/platform/PlatformModules';

// Mock i18n with dynamic language support
let currentLang = 'en';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: {
      get language() {
        return currentLang;
      },
      changeLanguage: vi.fn((lang: string) => {
        currentLang = lang;
      }),
    },
  }),
}));

// Mock AppContext
vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    companies: [
      {
        id: 'oxen',
        name: 'Oxen Transport',
        slug: 'oxen',
        subscriptionTier: 'ENTERPRISE',
        maxCostCenters: 50,
        licenseKey: 'OXEN-ENT-2026',
        currency: 'SAR',
      },
    ],
    activeCompany: {
      id: 'oxen',
      name: 'Oxen Transport',
      slug: 'oxen',
      subscriptionTier: 'ENTERPRISE',
      maxCostCenters: 50,
    },
    refreshCompanies: vi.fn(),
    addCompany: vi.fn(),
    deleteCompany: vi.fn(),
    setActiveCompanyId: vi.fn(),
    brandConfig: {
      companyNameAr: 'منصة أوكسن جي إل السحابية',
      companyNameEn: 'OxenGL Cloud ERP Platform',
      primaryColor: '#1E3A8A',
      secondaryColor: '#4338CA',
    },
    currentUser: {
      id: 'owner-1',
      fullName: 'Ahmed Awadh',
      email: 'awadh.a.1987@gmail.com',
      role: 'SUPER_ADMIN',
    },
    logout: vi.fn(),
    updateBrandConfig: vi.fn(),
  }),
}));

// Mock usePricingPlans
vi.mock('../hooks/usePricingPlans', () => ({
  usePricingPlans: () => ({
    plans: [
      {
        id: 1,
        name: 'ENTERPRISE',
        name_ar: 'المؤسسات',
        monthly_price: 2500,
        annual_price: 25000,
        max_users: 100,
        max_trucks: 150,
      },
    ],
    loading: false,
    refreshPlans: vi.fn(),
  }),
}));

// Mock erpApi & authFetch
vi.mock('../api/erpApi', () => ({
  erpApi: {
    getIsolationAudit: vi.fn().mockResolvedValue({
      total_isolated_tables: 34,
      backend_status: 'ONLINE',
      total_registered_tenants: 4,
      security_policy: 'RLS_STRICT',
      isolated_tables: ['operations', 'journal_entries', 'approval_requests', 'tenant_subscriptions'],
    }),
    updateSubscription: vi.fn().mockResolvedValue({}),
    generateLicense: vi.fn().mockResolvedValue({ license_key: 'OXEN-TEST-KEY' }),
  },
  authFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'healthy',
      tenants: { total: 4, active: 4 },
      cpu: { utilization_percent: 14.2, cores: 8, status: 'nominal' },
      memory: { total_gb: 16, used_gb: 5.4, utilization_percent: 33.7, status: 'nominal' },
      data: [
        { date: '2026-10-15', day_label: 'Thu', audit_events: 12, transaction_velocity: 48 },
      ],
    }),
  }),
  getAuthToken: () => 'test-superadmin-token',
}));

describe('Phase 5 — Admin Portal Sidebar Collision Fix, Responsive Drawer & Platform-Wide Dark Theme', () => {
  beforeEach(() => {
    currentLang = 'en';
    localStorage.clear();
  });

  it('renders SuperAdminCockpitView with non-overlapping flex layout, desktop collapse toggle, mobile drawer, and dark theme attributes', () => {
    const { container } = render(
      <MemoryRouter>
        <SuperAdminCockpitView />
      </MemoryRouter>
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('data-theme-mode')).toBe('dark');
    expect(root.getAttribute('dir')).toBe('ltr');
    expect(root.className).toContain('platform-dark');
    expect(root.className).toContain('dark');

    // Verify main content container prevents horizontal clipping
    const main = container.querySelector('main');
    expect(main).toBeTruthy();
    expect(main?.className).toContain('min-w-0');
    expect(main?.className).toContain('overflow-x-hidden');

    // Verify sidebar starts visible on desktop (lg:static) and off-canvas on mobile (-translate-x-full in LTR)
    const aside = container.querySelector('aside');
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain('lg:static');
    expect(aside?.className).toContain('-translate-x-full');

    // Toggle desktop sidebar collapse button
    const desktopToggle = screen.getByLabelText('Toggle desktop sidebar');
    fireEvent.click(desktopToggle);
    expect(aside?.className).toContain('lg:hidden');
    expect(localStorage.getItem('oxengl_superadmin_sidebar_open')).toBe('false');

    // Toggle back open
    fireEvent.click(desktopToggle);
    expect(aside?.className).toContain('lg:static');
    expect(localStorage.getItem('oxengl_superadmin_sidebar_open')).toBe('true');

    // Toggle mobile drawer button
    const mobileOpenBtn = screen.getByLabelText('Open navigation menu');
    fireEvent.click(mobileOpenBtn);
    expect(aside?.className).toContain('translate-x-0');
  });

  it('supports RTL direction and logical translation in SuperAdminCockpitView when Arabic is active', () => {
    currentLang = 'ar';
    localStorage.setItem('oxengl_language', 'ar');
    const { container } = render(
      <MemoryRouter>
        <SuperAdminCockpitView />
      </MemoryRouter>
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('dir')).toBe('rtl');

    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('start-0');
    expect(aside?.className).toContain('border-e');
    expect(aside?.className).toContain('translate-x-full');
  });

  it('renders PlatformModules (TenantsRegistryView, LicenseProvisionerView, SystemAuditView, PlatformSettingsView, PanoramicCockpit) in OxenGL Dark Theme without bg-white card artifacts', () => {
    const { container: tenantsContainer } = render(<TenantsRegistryView />);
    expect(tenantsContainer.querySelector('.bg-white')).toBeNull();

    const { container: licenseContainer } = render(<LicenseProvisionerView />);
    expect(licenseContainer.querySelector('.bg-white')).toBeNull();

    const { container: auditContainer } = render(<SystemAuditView />);
    expect(auditContainer.querySelector('.bg-white')).toBeNull();

    const { container: settingsContainer } = render(<PlatformSettingsView />);
    expect(settingsContainer.querySelector('.bg-white')).toBeNull();

    const { container: cockpitContainer } = render(<PanoramicCockpit onNavigate={vi.fn()} />);
    expect(cockpitContainer.querySelector('.bg-white')).toBeNull();
  });
});
