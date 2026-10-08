// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import TenantLoginForm from './TenantLoginForm';
import { AppProvider } from '../../context/AppContext';

// Mock the API client
vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    erpApi: {
      ...actual.erpApi,
      loginTenant: vi.fn(),
      tenantLogin: vi.fn(),
      verifyTwoFactor: vi.fn(),
    },
  };
});

import { erpApi } from '../../services/api';

describe('TenantLoginForm - 2FA Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('transitions to 2FA input view when backend requires two-factor authentication', async () => {
    // Mock primary login to return 2FA requirement
    vi.mocked(erpApi.loginTenant).mockResolvedValueOnce({
      status: '2FA_REQUIRED',
      two_factor_token: 'mock_temp_token_123',
    });

    render(
      <AppProvider>
        <TenantLoginForm />
      </AppProvider>
    );

    // Fill in credentials
    await userEvent.type(screen.getByLabelText(/Email or Username/i), 'muath.salaih@meayon.com');
    await userEvent.type(screen.getByLabelText(/Password/i), 'Meayon123!');

    // Submit primary form
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    // Assert that the view transitions to ask for the 2FA verification code
    await waitFor(() => {
      expect(screen.getByText(/Two-factor authentication required/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Enter 6-digit code/i)).toBeInTheDocument();
    });
  });

  it('completes login successfully upon submitting valid 2FA code', async () => {
    vi.mocked(erpApi.loginTenant).mockResolvedValueOnce({
      status: '2FA_REQUIRED',
      two_factor_token: 'mock_temp_token_123',
    });

    vi.mocked(erpApi.verifyTwoFactor).mockResolvedValueOnce({
      status: 'SUCCESS',
      access_token: 'mock_jwt_token',
      user: { id: '1', email: 'muath.salaih@meayon.com', role: 'Super Admin' },
    });

    render(
      <AppProvider>
        <TenantLoginForm />
      </AppProvider>
    );

    // Trigger 2FA prompt
    await userEvent.type(screen.getByLabelText(/Email or Username/i), 'muath.salaih@meayon.com');
    await userEvent.type(screen.getByLabelText(/Password/i), 'Meayon123!');
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    // Wait for OTP input to appear
    const otpInput = await screen.findByPlaceholderText(/Enter 6-digit code/i);
    
    // Enter 6-digit code and submit
    await userEvent.type(otpInput, '123456');
    fireEvent.click(screen.getByRole('button', { name: /Verify & Sign In/i }));

    // Verify API was called with proper token and code
    await waitFor(() => {
      expect(erpApi.verifyTwoFactor).toHaveBeenCalledWith(
        expect.objectContaining({
          two_factor_token: 'mock_temp_token_123',
          code: '123456',
        })
      );
    });
  });
});
