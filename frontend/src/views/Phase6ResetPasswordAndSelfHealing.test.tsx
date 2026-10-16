// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ResetPassword } from './auth/ResetPassword';
import { ForgotPassword } from './auth/ForgotPassword';

let mockLanguage: 'en' | 'ar' = 'en';
const mockSetLanguage = vi.fn((lang: 'en' | 'ar') => {
  mockLanguage = lang;
});

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    language: mockLanguage,
    setLanguage: mockSetLanguage,
    theme: 'dark',
    setTheme: vi.fn(),
  }),
}));

describe('Phase 6 — Point 7: Reset Password Form UI/Dark Theme & Dynamic Cross-Portal Communications', () => {
  beforeEach(() => {
    mockLanguage = 'en';
    vi.clearAllMocks();
    window.history.pushState({}, '', '/reset-password?email=admin%40myon-contract.cloud&slug=myon');
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Enforces OxenGL Unified Dark Theme (bg-slate-950, bg-slate-900/90, border-slate-800) and RTL/LTR switching on ResetPassword & ForgotPassword', () => {
    const { unmount } = render(<ResetPassword />);

    const resetContainer = screen.getByTestId('reset-password-view');
    expect(resetContainer.getAttribute('data-theme-mode')).toBe('dark');
    expect(resetContainer.getAttribute('dir')).toBe('ltr');
    expect(resetContainer.className).toContain('bg-slate-950');
    expect(resetContainer.className).toContain('platform-dark');

    const resetCard = screen.getByTestId('reset-password-card');
    expect(resetCard.className).toContain('bg-slate-900/90');
    expect(resetCard.className).toContain('border-slate-800');

    const langToggle = screen.getByTestId('reset-lang-toggle');
    fireEvent.click(langToggle);
    expect(mockSetLanguage).toHaveBeenCalledWith('ar');
    unmount();

    // Render in Arabic RTL mode
    mockLanguage = 'ar';
    const { unmount: unmountAr } = render(<ResetPassword />);
    const rtlContainer = screen.getByTestId('reset-password-view');
    expect(rtlContainer.getAttribute('dir')).toBe('rtl');
    unmountAr();

    // Verify ForgotPassword view Dark Theme & RTL
    const { unmount: unmountForgot } = render(<ForgotPassword />);
    const forgotContainer = screen.getByTestId('forgot-password-view');
    expect(forgotContainer.getAttribute('data-theme-mode')).toBe('dark');
    expect(forgotContainer.getAttribute('dir')).toBe('rtl');
    expect(forgotContainer.className).toContain('bg-slate-950');
    const forgotCard = screen.getByTestId('forgot-password-card');
    expect(forgotCard.className).toContain('bg-slate-900/90');
    expect(forgotCard.className).toContain('border-slate-800');
    unmountForgot();
  });

  it('2. Supports 6-Digit OTP auto-advance, backspace navigation, and full 6-digit clipboard paste across all 6 boxes', () => {
    render(<ResetPassword />);

    const input0 = screen.getByTestId('otp-input-0') as HTMLInputElement;
    const input1 = screen.getByTestId('otp-input-1') as HTMLInputElement;
    const input2 = screen.getByTestId('otp-input-2') as HTMLInputElement;
    const input5 = screen.getByTestId('otp-input-5') as HTMLInputElement;

    // Enter single digit in box 0 -> auto-advances focus to box 1
    fireEvent.change(input0, { target: { value: '4' } });
    expect(input0.value).toBe('4');
    expect(document.activeElement).toBe(input1);

    // Enter digit in box 1 -> auto-advances focus to box 2
    fireEvent.change(input1, { target: { value: '8' } });
    expect(input1.value).toBe('8');
    expect(document.activeElement).toBe(input2);

    // Backspace on empty box 2 -> clears box 1 and moves focus back to box 1
    fireEvent.keyDown(input2, { key: 'Backspace' });
    expect(input1.value).toBe('');
    expect(document.activeElement).toBe(input1);

    // Full 6-digit paste on ANY box (e.g. box 2) distributes digits across all 6 boxes and focuses box 5
    fireEvent.paste(input2, {
      clipboardData: {
        getData: () => '917352',
      },
    });

    expect((screen.getByTestId('otp-input-0') as HTMLInputElement).value).toBe('9');
    expect((screen.getByTestId('otp-input-1') as HTMLInputElement).value).toBe('1');
    expect((screen.getByTestId('otp-input-2') as HTMLInputElement).value).toBe('7');
    expect((screen.getByTestId('otp-input-3') as HTMLInputElement).value).toBe('3');
    expect((screen.getByTestId('otp-input-4') as HTMLInputElement).value).toBe('5');
    expect(input5.value).toBe('2');
    expect(document.activeElement).toBe(input5);
  });

  it('3. Triggers dynamic Resend Code endpoint with X-Tenant-Domain header, starts 60s cooldown timer, and displays toast feedback', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        message: 'A new 6-digit verification code has been dispatched to your email.',
        otp_code: '654321',
      }),
    } as Response);

    render(<ResetPassword />);

    const resendBtn = screen.getByTestId('resend-otp-btn') as HTMLButtonElement;
    expect(resendBtn.disabled).toBe(false);

    fireEvent.click(resendBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/auth/forgot-password');
    expect((options?.headers as Record<string, string>)['X-Tenant-Domain']).toBe('myon');
    const parsedBody = JSON.parse(options?.body as string);
    expect(parsedBody.email).toBe('admin@myon-contract.cloud');
    expect(parsedBody.workspace_slug).toBe('myon');

    // Verify toast feedback banner and 60s cooldown state
    const toastBanner = await screen.findByTestId('resend-toast-banner');
    expect(toastBanner.textContent).toContain('654321');
    expect(resendBtn.disabled).toBe(true);
    expect(resendBtn.textContent).toContain('Resend in 60s');

    // Verify auto-populated OTP digits from dev/fallback response
    expect((screen.getByTestId('otp-input-0') as HTMLInputElement).value).toBe('6');
    expect((screen.getByTestId('otp-input-5') as HTMLInputElement).value).toBe('1');

    fetchSpy.mockRestore();
  });

  it('4. Supports Dual Recovery Mode switching between Redis 6-Digit OTP and Legacy Cryptographic Token recovery', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        message: 'Password has been successfully reset.',
        synchronized_targets: ['master_users', 'tenant_users', 'public.res_users'],
      }),
    } as Response);

    render(<ResetPassword />);

    // Initially in 6-Digit OTP mode
    expect(screen.getByTestId('otp-boxes-container')).toBeTruthy();

    // Switch to Legacy Cryptographic Token mode
    const switchToLegacyBtn = screen.getByTestId('switch-to-legacy-token-btn');
    fireEvent.click(switchToLegacyBtn);

    const legacyInput = screen.getByTestId('legacy-token-input') as HTMLInputElement;
    expect(legacyInput).toBeTruthy();

    fireEvent.change(legacyInput, { target: { value: 'legacy-jwt-reset-token-xyz' } });
    fireEvent.change(screen.getByTestId('new-password-input'), {
      target: { value: 'StrongNewPass!2026' },
    });
    fireEvent.change(screen.getByTestId('confirm-password-input'), {
      target: { value: 'StrongNewPass!2026' },
    });

    fireEvent.click(screen.getByTestId('submit-reset-password-btn'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/auth/reset-password');
    const payload = JSON.parse(options?.body as string);
    expect(payload.token).toBe('legacy-jwt-reset-token-xyz');
    expect(payload.new_password).toBe('StrongNewPass!2026');
    expect(payload.workspace_slug).toBe('myon');

    fetchSpy.mockRestore();
  });

  it('5. Submits 6-Digit OTP recovery payload with X-Tenant-Domain and cross-portal workspace_slug', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'SUCCESS',
        message: 'Password has been successfully reset.',
        records_updated: 3,
      }),
    } as Response);

    render(<ResetPassword />);

    fireEvent.paste(screen.getByTestId('otp-input-0'), {
      clipboardData: {
        getData: () => '384920',
      },
    });

    fireEvent.change(screen.getByTestId('new-password-input'), {
      target: { value: 'UnifiedPortalPass!2026' },
    });
    fireEvent.change(screen.getByTestId('confirm-password-input'), {
      target: { value: 'UnifiedPortalPass!2026' },
    });

    fireEvent.click(screen.getByTestId('submit-reset-password-btn'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/auth/reset-password');
    expect((options?.headers as Record<string, string>)['X-Tenant-Domain']).toBe('myon');
    const payload = JSON.parse(options?.body as string);
    expect(payload.identifier).toBe('admin@myon-contract.cloud');
    expect(payload.otp_code).toBe('384920');
    expect(payload.new_password).toBe('UnifiedPortalPass!2026');
    expect(payload.workspace_slug).toBe('myon');

    fetchSpy.mockRestore();
  });
});
