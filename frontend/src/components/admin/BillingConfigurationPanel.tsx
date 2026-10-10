/**
 * OxenGL Platform Admin — Dynamic Billing & Payment Gateway Configuration
 * Location: src/components/admin/BillingConfigurationPanel.tsx
 *
 * Provides Super Administrators with full control over:
 * 1. Global Card Processing (Stripe: Secret Key, Publishable Key, Webhook Secret, Toggle)
 * 2. Regional Card & Wallet Processing (Moyasar: API Key, Publishable Key, Toggle)
 * 3. Local Receiving Bank Accounts (Dynamic multi-currency accounts: Kuraimi, Tadhamon, CAC, etc.)
 * 4. Local & Regional Digital Wallets (Dynamic list: ONE Cash, Jawali, Floosak, with QR code upload)
 *
 * Features:
 * - At-rest encryption indication (Fernet symmetric encryption)
 * - Optimistic concurrency control (409 conflict detection via version)
 * - Dirty state tracking with unsaved changes bar
 * - Light and dark mode support
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CreditCard,
  Building2,
  Wallet,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Upload,
  Eye,
  EyeOff,
  ShieldCheck,
  QrCode,
  Globe,
  HelpCircle,
  FileText,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  PaymentGatewaySettingsAdminView,
  PaymentGatewaySettingsUpdatePayload,
  BankAccountInstruction,
  DigitalWalletInstruction,
  fetchBillingSettings,
  saveBillingSettings,
  uploadWalletQrCode,
} from '../../services/billingSettingsService';

export const BillingConfigurationPanel: React.FC = () => {
  const { showToast } = useApp();

  // Settings state from backend
  const [initialData, setInitialData] = useState<PaymentGatewaySettingsAdminView | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form edit state
  const [isStripeEnabled, setIsStripeEnabled] = useState<boolean>(false);
  const [stripeSecretKeyInput, setStripeSecretKeyInput] = useState<string>('');
  const [stripePublishableKeyInput, setStripePublishableKeyInput] = useState<string>('');
  const [stripeWebhookSecretInput, setStripeWebhookSecretInput] = useState<string>('');

  const [isMoyasarEnabled, setIsMoyasarEnabled] = useState<boolean>(false);
  const [moyasarApiKeyInput, setMoyasarApiKeyInput] = useState<string>('');
  const [moyasarPublishableKeyInput, setMoyasarPublishableKeyInput] = useState<string>('');

  const [bankAccounts, setBankAccounts] = useState<BankAccountInstruction[]>([]);
  const [wallets, setWallets] = useState<DigitalWalletInstruction[]>([]);

  // Secret visibility toggle
  const [showStripeSecret, setShowStripeSecret] = useState<boolean>(false);
  const [showStripeWebhook, setShowStripeWebhook] = useState<boolean>(false);
  const [showMoyasarSecret, setShowMoyasarSecret] = useState<boolean>(false);

  // QR upload loading state per wallet index
  const [uploadingWalletIndex, setUploadingWalletIndex] = useState<number | null>(null);

  // ─── 1. Load Data ─────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await fetchBillingSettings();
      setInitialData(data);

      setIsStripeEnabled(data.is_stripe_enabled);
      setStripeSecretKeyInput('');
      setStripePublishableKeyInput(data.stripe_publishable_key || '');
      setStripeWebhookSecretInput('');

      setIsMoyasarEnabled(data.is_moyasar_enabled);
      setMoyasarApiKeyInput('');
      setMoyasarPublishableKeyInput(data.moyasar_publishable_key || '');

      setBankAccounts(JSON.parse(JSON.stringify(data.local_bank_instructions || [])));
      setWallets(JSON.parse(JSON.stringify(data.digital_wallet_instructions || [])));
    } catch (err: any) {
      console.error('[BillingConfiguration] Load error:', err);
      setFetchError(err.message || 'Failed to load billing configuration.');
      showToast(err.message || 'Failed to load billing configuration.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ─── 2. Dirty State Calculation ───────────────────────────────────────────
  const isDirty = Boolean(
    initialData && (
      isStripeEnabled !== initialData.is_stripe_enabled ||
      stripeSecretKeyInput.trim() !== '' ||
      stripePublishableKeyInput.trim() !== (initialData.stripe_publishable_key || '') ||
      stripeWebhookSecretInput.trim() !== '' ||
      isMoyasarEnabled !== initialData.is_moyasar_enabled ||
      moyasarApiKeyInput.trim() !== '' ||
      moyasarPublishableKeyInput.trim() !== (initialData.moyasar_publishable_key || '') ||
      JSON.stringify(bankAccounts) !== JSON.stringify(initialData.local_bank_instructions || []) ||
      JSON.stringify(wallets) !== JSON.stringify(initialData.digital_wallet_instructions || [])
    )
  );

  // ─── 3. Save Handler ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!initialData) return;

    setIsSaving(true);
    try {
      const payload: PaymentGatewaySettingsUpdatePayload = {
        expected_version: initialData.version,
        is_stripe_enabled: isStripeEnabled,
        stripe_publishable_key: stripePublishableKeyInput.trim() || null,
        is_moyasar_enabled: isMoyasarEnabled,
        moyasar_publishable_key: moyasarPublishableKeyInput.trim() || null,
        local_bank_instructions: bankAccounts,
        digital_wallet_instructions: wallets,
      };

      // Only send secret keys if user explicitly entered a new value
      if (stripeSecretKeyInput.trim() !== '') {
        payload.stripe_secret_key = stripeSecretKeyInput.trim();
      }
      if (stripeWebhookSecretInput.trim() !== '') {
        payload.stripe_webhook_secret = stripeWebhookSecretInput.trim();
      }
      if (moyasarApiKeyInput.trim() !== '') {
        payload.moyasar_api_key = moyasarApiKeyInput.trim();
      }

      const updated = await saveBillingSettings(payload);
      setInitialData(updated);

      // Reset write-only input buffers
      setStripeSecretKeyInput('');
      setStripeWebhookSecretInput('');
      setMoyasarApiKeyInput('');

      setBankAccounts(JSON.parse(JSON.stringify(updated.local_bank_instructions || [])));
      setWallets(JSON.parse(JSON.stringify(updated.digital_wallet_instructions || [])));

      showToast('Billing settings saved successfully.', 'success');
    } catch (err: any) {
      console.error('[BillingConfiguration] Save error:', err);
      if (err.status === 409) {
        showToast(
          'Concurrent Modification Conflict: Another Super Admin modified billing settings. Please reload.',
          'error'
        );
      } else {
        showToast(err.message || 'Failed to update billing settings.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ─── 4. Dynamic Bank Accounts Operations ──────────────────────────────────
  const handleAddBankAccount = () => {
    const newAccount: BankAccountInstruction = {
      id: `bank-${Date.now()}`,
      bank_name: '',
      account_name: '',
      account_number: '',
      iban: '',
      swift: '',
      branch: '',
      currency: 'SAR',
      is_active: true,
    };
    setBankAccounts([...bankAccounts, newAccount]);
  };

  const handleUpdateBankAccount = (index: number, updates: Partial<BankAccountInstruction>) => {
    setBankAccounts(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const handleRemoveBankAccount = (index: number) => {
    setBankAccounts(prev => prev.filter((_, i) => i !== index));
  };

  // ─── 5. Dynamic Wallets Operations & QR Upload ───────────────────────────
  const handleAddWallet = () => {
    const newWallet: DigitalWalletInstruction = {
      id: `wallet-${Date.now()}`,
      provider: '',
      wallet_number: '',
      account_name: '',
      qr_code_url: '',
      is_active: true,
    };
    setWallets([...wallets, newWallet]);
  };

  const handleUpdateWallet = (index: number, updates: Partial<DigitalWalletInstruction>) => {
    setWallets(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const handleRemoveWallet = (index: number) => {
    setWallets(prev => prev.filter((_, i) => i !== index));
  };

  const handleQrFileUpload = async (index: number, file: File) => {
    // Client-side quick size check
    if (file.size > 1024 * 1024) {
      showToast('QR code image exceeds maximum size of 1 MB.', 'error');
      return;
    }

    setUploadingWalletIndex(index);
    try {
      const result = await uploadWalletQrCode(file);
      handleUpdateWallet(index, { qr_code_url: result.qr_code_url });
      showToast('Wallet QR code uploaded successfully.', 'success');
    } catch (err: any) {
      console.error('[BillingConfiguration] QR upload failed:', err);
      showToast(err.message || 'Failed to upload QR code image.', 'error');
    } finally {
      setUploadingWalletIndex(null);
    }
  };

  // ─── 6. Loading & Error States ────────────────────────────────────────────
  if (isLoading && !initialData) {
    return (
      <div className="p-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-1/3" />
          <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-1/2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
            <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (fetchError && !initialData) {
    return (
      <div className="p-8">
        <div className="p-6 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm">Failed to Load Billing Configuration</h4>
              <p className="text-xs text-rose-600 dark:text-rose-300 mt-0.5">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={loadSettings}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* ─── Top Control Header & Dirty Indicator ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
              <CreditCard className="w-4 h-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Platform Gateways & Payouts
            </span>
            {initialData?.encryption_configured && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                <Lock className="w-3 h-3 text-emerald-500" />
                Fernet Encrypted at Rest
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Billing Gateway Settings
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl">
            Configure how OxenGL collects tenant subscription fees across automated card processing, regional wallets, and manual bank wires.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSettings}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Reload
          </button>

          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Floating Unsaved Changes Warning Bar */}
      {isDirty && (
        <div className="sticky top-4 z-40 p-3.5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-medium">
              You have unsaved changes in billing configuration.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadSettings}
              disabled={isSaving}
              className="px-3 py-1 rounded-lg text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-2xs"
            >
              {isSaving ? 'Saving...' : 'Save Now'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Cards Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ─── Card 1: Global Card Processing (Stripe) ─────────────────────── */}
        <section className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Global Card Processing (Stripe)
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Visa, Mastercard, Amex checkout sessions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {initialData?.stripe_mode && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  initialData.stripe_mode === 'live'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                }`}>
                  {initialData.stripe_mode} Mode
                </span>
              )}

              {/* Enable Toggle Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isStripeEnabled}
                  onChange={e => setIsStripeEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-hidden rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-emerald-600" />
              </label>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* Publishable Key */}
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                Publishable Key <span className="font-mono text-zinc-400 text-[11px]">(pk_live_... / pk_test_...)</span>
              </label>
              <input
                type="text"
                value={stripePublishableKeyInput}
                onChange={e => setStripePublishableKeyInput(e.target.value)}
                placeholder="pk_test_..."
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            {/* Secret Key */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  Secret Key
                  {initialData?.stripe_secret_key.is_set ? (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                      (Configured: {initialData.stripe_secret_key.hint})
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">(Not Configured)</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setShowStripeSecret(!showStripeSecret)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showStripeSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <input
                type={showStripeSecret ? 'text' : 'password'}
                value={stripeSecretKeyInput}
                onChange={e => setStripeSecretKeyInput(e.target.value)}
                placeholder={initialData?.stripe_secret_key.is_set ? 'Leave blank to keep existing secret key' : 'sk_test_...'}
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            {/* Webhook Secret */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  Webhook Signing Secret
                  {initialData?.stripe_webhook_secret.is_set ? (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                      (Configured: {initialData.stripe_webhook_secret.hint})
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">(Not Configured)</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setShowStripeWebhook(!showStripeWebhook)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showStripeWebhook ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <input
                type={showStripeWebhook ? 'text' : 'password'}
                value={stripeWebhookSecretInput}
                onChange={e => setStripeWebhookSecretInput(e.target.value)}
                placeholder={initialData?.stripe_webhook_secret.is_set ? 'Leave blank to keep existing secret' : 'whsec_...'}
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>
          </div>
        </section>

        {/* ─── Card 2: Regional Card & Wallet Processing (Moyasar) ───────────── */}
        <section className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Regional Gateway (Moyasar)
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Mada, STC Pay, Apple Pay & Visa/Mastercard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {initialData?.moyasar_mode && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  initialData.moyasar_mode === 'live'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                }`}>
                  {initialData.moyasar_mode} Mode
                </span>
              )}

              {/* Enable Toggle Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMoyasarEnabled}
                  onChange={e => setIsMoyasarEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-hidden rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-emerald-600" />
              </label>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* Publishable Key */}
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                Publishable API Key <span className="font-mono text-zinc-400 text-[11px]">(pk_live_... / pk_test_...)</span>
              </label>
              <input
                type="text"
                value={moyasarPublishableKeyInput}
                onChange={e => setMoyasarPublishableKeyInput(e.target.value)}
                placeholder="pk_test_..."
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            {/* Secret API Key */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  Secret API Key
                  {initialData?.moyasar_api_key.is_set ? (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                      (Configured: {initialData.moyasar_api_key.hint})
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">(Not Configured)</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setShowMoyasarSecret(!showMoyasarSecret)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showMoyasarSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <input
                type={showMoyasarSecret ? 'text' : 'password'}
                value={moyasarApiKeyInput}
                onChange={e => setMoyasarApiKeyInput(e.target.value)}
                placeholder={initialData?.moyasar_api_key.is_set ? 'Leave blank to keep existing key' : 'sk_test_...'}
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                Moyasar covers Saudi National Mada debit cards, Apple Pay on iOS/macOS, and STC Pay direct debits.
              </span>
            </div>
          </div>
        </section>

      </div>

      {/* ─── Card 3: Local Receiving Bank Accounts ─────────────────────────── */}
      <section className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Local Receiving Bank Accounts
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  {bankAccounts.length} Accounts
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Direct wire transfer destinations displayed to tenants during subscription checkout
              </p>
            </div>
          </div>

          <button
            onClick={handleAddBankAccount}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-2xs self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Bank Account
          </button>
        </div>

        {bankAccounts.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
            <Building2 className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No bank accounts configured. Click "Add Bank Account" to configure manual wire instructions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bankAccounts.map((account, index) => (
              <div
                key={account.id || index}
                className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-4 relative"
              >
                <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-700/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      #{index + 1} {account.bank_name || 'New Bank Account'}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      ({account.currency || 'SAR'})
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={account.is_active}
                        onChange={e => handleUpdateBankAccount(index, { is_active: e.target.checked })}
                        className="rounded-sm border-zinc-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Active</span>
                    </label>

                    <button
                      onClick={() => handleRemoveBankAccount(index)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      title="Remove Account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-zinc-500 dark:text-zinc-400 font-medium">Bank Name *</label>
                    <input
                      type="text"
                      value={account.bank_name}
                      onChange={e => handleUpdateBankAccount(index, { bank_name: e.target.value })}
                      placeholder="e.g. Al Kuraimi Bank / Al Rajhi"
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-500 dark:text-zinc-400 font-medium">Account Name *</label>
                    <input
                      type="text"
                      value={account.account_name}
                      onChange={e => handleUpdateBankAccount(index, { account_name: e.target.value })}
                      placeholder="e.g. OxenGL Logistics LLC"
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-500 dark:text-zinc-400 font-medium">Currency</label>
                    <select
                      value={account.currency || 'SAR'}
                      onChange={e => handleUpdateBankAccount(index, { currency: e.target.value })}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    >
                      <option value="SAR">SAR — Saudi Riyal</option>
                      <option value="YER">YER — Yemeni Rial</option>
                      <option value="USD">USD — US Dollar</option>
                      <option value="AED">AED — UAE Dirham</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-500 dark:text-zinc-400 font-medium">IBAN</label>
                    <input
                      type="text"
                      value={account.iban || ''}
                      onChange={e => handleUpdateBankAccount(index, { iban: e.target.value.toUpperCase() })}
                      placeholder="e.g. SA0380000000..."
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-500 dark:text-zinc-400 font-medium">Account Number</label>
                    <input
                      type="text"
                      value={account.account_number || ''}
                      onChange={e => handleUpdateBankAccount(index, { account_number: e.target.value })}
                      placeholder="Local account number"
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-500 dark:text-zinc-400 font-medium">SWIFT / BIC</label>
                    <input
                      type="text"
                      value={account.swift || ''}
                      onChange={e => handleUpdateBankAccount(index, { swift: e.target.value.toUpperCase() })}
                      placeholder="e.g. RJHISARI"
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="text-zinc-500 dark:text-zinc-400 font-medium">Branch / Notes</label>
                    <input
                      type="text"
                      value={account.branch || ''}
                      onChange={e => handleUpdateBankAccount(index, { branch: e.target.value })}
                      placeholder="e.g. Main Branch, Olaya Street, Riyadh"
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Card 4: Local & Regional Digital Wallets ───────────────────────── */}
      <section className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Local & Regional Digital Wallets
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                  {wallets.length} Wallets
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Mobile wallets e.g. ONE Cash, Jawali, Floosak, Kuraimi mFloos with barcode / QR upload
              </p>
            </div>
          </div>

          <button
            onClick={handleAddWallet}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-2xs self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Digital Wallet
          </button>
        </div>

        {wallets.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
            <Wallet className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No digital wallets configured. Click "Add Digital Wallet" to add ONE Cash, Jawali, or other mobile wallets.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {wallets.map((wallet, index) => (
              <div
                key={wallet.id || index}
                className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-700/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      #{index + 1} {wallet.provider || 'New Wallet'}
                    </span>
                    {wallet.wallet_number && (
                      <span className="text-[11px] font-mono text-zinc-400">
                        ({wallet.wallet_number})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wallet.is_active}
                        onChange={e => handleUpdateWallet(index, { is_active: e.target.checked })}
                        className="rounded-sm border-zinc-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span>Active</span>
                    </label>

                    <button
                      onClick={() => handleRemoveWallet(index)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      title="Remove Wallet"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Left Column: Wallet Meta */}
                  <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-zinc-500 dark:text-zinc-400 font-medium">Wallet Provider Name *</label>
                      <input
                        type="text"
                        value={wallet.provider}
                        onChange={e => handleUpdateWallet(index, { provider: e.target.value })}
                        placeholder="e.g. ONE Cash / Jawali / Floosak"
                        className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="text-zinc-500 dark:text-zinc-400 font-medium">Wallet Number / Phone *</label>
                      <input
                        type="text"
                        value={wallet.wallet_number}
                        onChange={e => handleUpdateWallet(index, { wallet_number: e.target.value })}
                        placeholder="e.g. +967 777 123 456"
                        className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-zinc-500 dark:text-zinc-400 font-medium">Account Name *</label>
                      <input
                        type="text"
                        value={wallet.account_name}
                        onChange={e => handleUpdateWallet(index, { account_name: e.target.value })}
                        placeholder="e.g. OxenGL Digital Wallets"
                        className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                  </div>

                  {/* Right Column: QR Code Upload & Preview */}
                  <div className="space-y-2">
                    <label className="text-zinc-500 dark:text-zinc-400 font-medium block">
                      Wallet QR Code (PNG, JPG, WebP &le; 1MB)
                    </label>

                    {wallet.qr_code_url ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                        <img
                          src={wallet.qr_code_url}
                          alt={`${wallet.provider} QR`}
                          className="w-16 h-16 object-contain rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white shrink-0"
                        />
                        <div className="space-y-1 min-w-0 flex-1">
                          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate block">
                            {wallet.qr_code_url}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateWallet(index, { qr_code_url: '' })}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                          >
                            <X className="w-3 h-3" />
                            Remove QR
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-purple-500 dark:hover:border-purple-400 bg-white dark:bg-zinc-800 cursor-pointer transition-colors ${
                        uploadingWalletIndex === index ? 'opacity-50 pointer-events-none' : ''
                      }`}>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleQrFileUpload(index, file);
                          }}
                        />
                        {uploadingWalletIndex === index ? (
                          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span className="text-xs font-semibold">Uploading QR...</span>
                          </div>
                        ) : (
                          <>
                            <QrCode className="w-6 h-6 text-zinc-400 mb-1" />
                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                              Upload QR Code
                            </span>
                            <span className="text-[10px] text-zinc-400">Drag or click (max 1 MB)</span>
                          </>
                        )}
                      </label>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
};

export default BillingConfigurationPanel;
