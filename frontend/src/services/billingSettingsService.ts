/**
 * OxenGL Platform Super Admin — Billing Configuration & Payment Gateways Service
 * Location: frontend/src/services/billingSettingsService.ts
 */

import { authFetch } from './api';

export interface SecretFieldStatus {
  is_set: boolean;
  hint: string | null;
  decryption_error: boolean;
}

export interface BankAccountInstruction {
  id?: string;
  bank_name: string;
  account_name: string;
  account_number?: string | null;
  iban?: string | null;
  swift?: string | null;
  branch?: string | null;
  currency?: string | null;
  is_active: boolean;
}

export interface DigitalWalletInstruction {
  id?: string;
  provider: string;
  wallet_number: string;
  account_name: string;
  qr_code_url?: string | null;
  is_active: boolean;
}

export interface PaymentGatewaySettingsAdminView {
  is_stripe_enabled: boolean;
  stripe_mode: 'live' | 'test' | null;
  stripe_secret_key: SecretFieldStatus;
  stripe_publishable_key: string | null;
  stripe_webhook_secret: SecretFieldStatus;

  is_moyasar_enabled: boolean;
  moyasar_mode: 'live' | 'test' | null;
  moyasar_api_key: SecretFieldStatus;
  moyasar_publishable_key: string | null;

  local_bank_instructions: BankAccountInstruction[];
  digital_wallet_instructions: DigitalWalletInstruction[];

  version: number;
  updated_by: string | null;
  updated_at: string | null;
  encryption_configured: boolean;
}

export interface PaymentGatewaySettingsUpdatePayload {
  stripe_secret_key?: string | null;
  stripe_publishable_key?: string | null;
  stripe_webhook_secret?: string | null;
  is_stripe_enabled?: boolean | null;

  moyasar_api_key?: string | null;
  moyasar_publishable_key?: string | null;
  is_moyasar_enabled?: boolean | null;

  local_bank_instructions?: BankAccountInstruction[] | null;
  digital_wallet_instructions?: DigitalWalletInstruction[] | null;

  expected_version?: number | null;
}

export interface WalletQRUploadResponse {
  qr_code_url: string;
}

/**
 * Fetch current billing and payment gateway settings (masked view).
 */
export async function fetchBillingSettings(): Promise<PaymentGatewaySettingsAdminView> {
  const res = await authFetch('/api/v1/admin/settings/billing', {
    method: 'GET',
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const detail = errorBody?.detail || `Failed to fetch billing settings (${res.status})`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  return res.json();
}

/**
 * Update payment gateway configuration.
 */
export async function saveBillingSettings(
  payload: PaymentGatewaySettingsUpdatePayload
): Promise<PaymentGatewaySettingsAdminView> {
  const res = await authFetch('/api/v1/admin/settings/billing', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const detail = errorBody?.detail || `Failed to save billing settings (${res.status})`;
    const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    (error as any).status = res.status;
    throw error;
  }

  return res.json();
}

/**
 * Upload a digital wallet QR code image (PNG, JPEG, or WebP up to 1 MB).
 */
export async function uploadWalletQrCode(file: File): Promise<WalletQRUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await authFetch('/api/v1/admin/settings/billing/wallet-qr', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const detail = errorBody?.detail || `Failed to upload wallet QR code (${res.status})`;
    const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    (error as any).status = res.status;
    throw error;
  }

  return res.json();
}
