import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Building2,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  Search,
  Filter,
  Check,
  ShieldAlert,
  ShieldCheck,
  Database,
  Globe2,
  Sliders,
  ExternalLink,
  Users,
  Copy,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  erpApi,
  SuperAdminBillingSummaryDto,
  SaaSInvoiceDto,
} from '../services/api';

export const SuperAdminFinancialHubView: React.FC = () => {
  const { companies } = useApp();

  const [summary, setSummary] = useState<SuperAdminBillingSummaryDto | null>(null);
  const [invoices, setInvoices] = useState<SaaSInvoiceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter state for invoices
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Wire Verification Modal
  const [verifyingInvoice, setVerifyingInvoice] = useState<SaaSInvoiceDto | null>(null);
  const [wireRef, setWireRef] = useState('');
  const [wireNotes, setWireNotes] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);

  // Custom Contractual Limits Modal
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [customLimits, setCustomLimits] = useState({
    allow_external_database: false,
    allow_custom_domain: false,
    allow_dedicated_ssl: false,
    max_seats: 20,
  });
  const [savingLimits, setSavingLimits] = useState(false);

  const fetchFinancialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, invRes] = await Promise.all([
        erpApi.getSuperAdminBillingSummary().catch((err) => {
          console.warn('SuperAdmin summary fetch warning:', err);
          return null;
        }),
        erpApi.getSuperAdminInvoices().catch((err) => {
          console.warn('SuperAdmin invoices fetch warning:', err);
          return [];
        }),
      ]);

      if (sumRes) setSummary(sumRes);
      if (Array.isArray(invRes)) setInvoices(invRes);
    } catch (err: any) {
      setError(err?.message || 'Failed to load central billing telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const handleVerifyWire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyingInvoice) return;
    setVerifySubmitting(true);
    setError(null);

    try {
      await erpApi.verifyAndSettleInvoice(verifyingInvoice.id, {
        payment_reference: wireRef || `WIRE-VERIFIED-${Date.now()}`,
        notes: wireNotes || 'Corporate bank wire receipt verified by SuperAdmin.',
      });

      setSuccessMsg(`Bank wire settled successfully for Invoice #${verifyingInvoice.invoice_number}! Enterprise features unlocked.`);
      setVerifyingInvoice(null);
      setWireRef('');
      setWireNotes('');
      await fetchFinancialData();
    } catch (err: any) {
      setError(err?.message || 'Failed to verify and settle bank wire invoice.');
    } finally {
      setVerifySubmitting(false);
    }
  };

  const handleSaveCustomLimits = async () => {
    if (!selectedTenantId) return;
    setSavingLimits(true);
    setError(null);

    try {
      await erpApi.updateTenantCustomLimits(selectedTenantId, customLimits);
      setSuccessMsg(`Contractual limits updated successfully for tenant ${selectedTenantId}!`);
      await fetchFinancialData();
    } catch (err: any) {
      setError(err?.message || 'Failed to update custom limits.');
    } finally {
      setSavingLimits(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (methodFilter !== 'all' && inv.payment_method !== methodFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchInv = inv.invoice_number?.toLowerCase().includes(q);
      const matchTenant = inv.tenant_slug?.toLowerCase().includes(q) || inv.tenant_name?.toLowerCase().includes(q);
      const matchPo = inv.po_number?.toLowerCase().includes(q);
      const matchRef = inv.payment_reference?.toLowerCase().includes(q);
      if (!matchInv && !matchTenant && !matchPo && !matchRef) return false;
    }
    return true;
  });

  const pendingWireInvoices = invoices.filter(
    (inv) => inv.payment_method === 'bank_transfer' && inv.status === 'pending'
  );

  return (
    <div className="space-y-6 p-6">
      {/* Top Banner */}
      <div className="rounded-3xl border border-blue-900/40 bg-gradient-to-r from-[#0B132B] via-blue-950/60 to-slate-950 p-6 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/25">
              <CreditCard className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white">Central Financial Hub & SaaS Invoicing</h1>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-0.5 text-xs font-black text-emerald-300">
                  REAL-TIME CONTROL
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Manage recurring revenue (MRR/ARR), verify offline bank wire transfers, and apply contractual quota overrides across all tenants.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchFinancialData}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 px-4 py-2 text-xs font-bold text-blue-300 transition-all shadow-xs"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync Ledgers</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-bold text-rose-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-bold text-emerald-400 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Global Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B132B]/90 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly Recurring Revenue</span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono text-2xl font-black text-white">
              {Number(summary?.mrr_sar || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
              <span className="text-xs font-normal text-slate-400">SAR</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-400 font-bold flex items-center gap-1">
              <span>● Active normalized monthly run</span>
            </p>
          </div>
        </div>

        {/* ARR Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B132B]/90 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Annual Run Rate (ARR)</span>
            <div className="h-8 w-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-indigo-400" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono text-2xl font-black text-indigo-400">
              {Number(summary?.arr_sar || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
              <span className="text-xs font-normal text-slate-400">SAR</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Contractual annualized subscription run
            </p>
          </div>
        </div>

        {/* Active Subscribers Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B132B]/90 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Paid Tenants</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono text-2xl font-black text-emerald-400">
              {summary?.total_active_subscriptions ?? 0}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
              <span>Free: {summary?.subscribers_by_tier?.FREE ?? 0}</span>
              <span>•</span>
              <span className="text-blue-400 font-bold">Pro: {summary?.subscribers_by_tier?.PROFESSIONAL ?? 0}</span>
              <span>•</span>
              <span className="text-purple-400 font-bold">Ent: {summary?.subscribers_by_tier?.ENTERPRISE ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Pending Bank Wire Queue Card */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Pending Wire Settlement</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-amber-400" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono text-2xl font-black text-amber-300">
              {summary?.pending_wire_invoices_count ?? pendingWireInvoices.length}{' '}
              <span className="text-xs font-normal text-slate-400">Invoices</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-amber-400">
              Vol: {Number(summary?.pending_wire_volume_sar || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
            </p>
          </div>
        </div>
      </div>

      {/* Pending Bank Wire Verification Queue (Priority Operational Section) */}
      <div className="rounded-3xl border border-amber-500/40 bg-[#0B132B] p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>Corporate Bank Wire Verification Queue</span>
                {pendingWireInvoices.length > 0 && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-slate-950">
                    {pendingWireInvoices.length} PENDING
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Tenants waiting for manual SuperAdmin wire verification to activate Enterprise Grade 3 features.
              </p>
            </div>
          </div>
        </div>

        {pendingWireInvoices.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-8 text-center text-xs text-slate-400">
            <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
            <span>All bank wire invoices are settled! No pending corporate quotes in queue.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-black uppercase text-slate-400">
                  <th className="py-3 px-3">Invoice #</th>
                  <th className="py-3 px-3">Tenant Slug / Name</th>
                  <th className="py-3 px-3">Grade Tier</th>
                  <th className="py-3 px-3">PO Number</th>
                  <th className="py-3 px-3">Amount (inc. VAT)</th>
                  <th className="py-3 px-3">Wire Memo Ref</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pendingWireInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-amber-400">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-white">{inv.tenant_name || inv.tenant_slug}</span>
                      <span className="block font-mono text-[10px] text-slate-400">{inv.tenant_slug}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="rounded-md bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-300 uppercase whitespace-nowrap shrink-0">
                        {inv.plan_display_name || inv.plan_name || 'Enterprise'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {inv.po_number || '—'}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-white">
                      {Number(inv.grand_total_sar || inv.amount_sar).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
                    </td>
                    <td className="py-3 px-3 font-mono text-amber-300 font-bold">
                      {inv.payment_reference || '—'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => {
                          setVerifyingInvoice(inv);
                          setWireRef(inv.payment_reference || `ALINMA-TX-${Date.now()}`);
                        }}
                        className="rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950 transition-all shadow-md shadow-amber-500/20"
                      >
                        Verify & Settle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Contractual Custom Limits & Architectural Overrides Drawer/Panel */}
      <div className="rounded-3xl border border-slate-800 bg-[#0B132B] p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Sliders className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Contractual Custom Limits & Feature Overrides</h2>
              <p className="text-xs text-slate-400">
                Grant custom contractual exceptions to specific tenants without changing their standard tier definition.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-400">
              Select Tenant Entity:
            </label>
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs font-bold text-white focus:ring-2 focus:ring-purple-500"
            >
              <option value="">-- Choose Tenant Workspace --</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id.substring(0, 8)})
                </option>
              ))}
            </select>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Overrides configured here take immediate effect in entitlement enforcement middleware and bypass standard tier restrictions.
            </p>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* External DB Override */}
              <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 cursor-pointer hover:border-slate-700">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-purple-400" />
                  <div>
                    <span className="block text-xs font-bold text-white">Allow External Database</span>
                    <span className="text-[10px] text-slate-400">Unlock private PostgreSQL hosting</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={customLimits.allow_external_database}
                  onChange={(e) =>
                    setCustomLimits({ ...customLimits, allow_external_database: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                />
              </label>

              {/* Custom Domain Override */}
              <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 cursor-pointer hover:border-slate-700">
                <div className="flex items-center gap-3">
                  <Globe2 className="h-5 w-5 text-blue-400" />
                  <div>
                    <span className="block text-xs font-bold text-white">Allow Custom Domain</span>
                    <span className="text-[10px] text-slate-400">Unlock zero-slug domain routing</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={customLimits.allow_custom_domain}
                  onChange={(e) =>
                    setCustomLimits({ ...customLimits, allow_custom_domain: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500"
                />
              </label>

              {/* Dynamic SSL Override */}
              <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 cursor-pointer hover:border-slate-700">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <div>
                    <span className="block text-xs font-bold text-white">Allow Dedicated SSL</span>
                    <span className="text-[10px] text-slate-400">Caddy dynamic on-demand TLS</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={customLimits.allow_dedicated_ssl}
                  onChange={(e) =>
                    setCustomLimits({ ...customLimits, allow_dedicated_ssl: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
              </label>

              {/* Max Seats Custom Quota */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-400" />
                    Custom Seat Limit:
                  </span>
                  <span className="font-mono text-xs font-black text-indigo-400">
                    {customLimits.max_seats === -1 ? 'Unlimited' : customLimits.max_seats}
                  </span>
                </div>
                <input
                  type="number"
                  min="-1"
                  max="10000"
                  value={customLimits.max_seats}
                  onChange={(e) =>
                    setCustomLimits({ ...customLimits, max_seats: parseInt(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs font-mono text-white"
                />
                <span className="text-[9px] text-slate-500 block mt-1">Set to -1 for unlimited corporate seats</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveCustomLimits}
                disabled={!selectedTenantId || savingLimits}
                className="flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-purple-600/30 transition-all"
              >
                {savingLimits && <RefreshCw className="h-4 w-4 animate-spin" />}
                <span>Save Contractual Overrides</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Complete Financial Audit Ledger */}
      <div className="rounded-3xl border border-slate-800 bg-[#0B132B] p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div>
            <h2 className="text-base font-black text-white">Central SaaS Invoices & Revenue Ledger</h2>
            <p className="text-xs text-slate-400">
              Cross-tenant chronological log of all platform billing events and tax documents.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoice, slug, PO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>

            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
            >
              <option value="all">All Rails</option>
              <option value="stripe">Stripe Card</option>
              <option value="bank_transfer">Bank Wire</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-black uppercase text-slate-400">
                <th className="py-3 px-3">Invoice #</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Tenant Slug</th>
                <th className="py-3 px-3">Tier & Cycle</th>
                <th className="py-3 px-3">Payment Method</th>
                <th className="py-3 px-3">Subtotal</th>
                <th className="py-3 px-3">15% VAT</th>
                <th className="py-3 px-3">Grand Total</th>
                <th className="py-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                    No matching invoices found in central ledger.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-blue-400">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono">
                      {new Date(inv.issued_date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-white">{inv.tenant_slug || inv.tenant_name || '—'}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold uppercase text-slate-300">{inv.plan_display_name || inv.plan_name || 'Enterprise'}</span>
                      <span className="block text-[10px] text-slate-500 capitalize">{inv.billing_cycle}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${
                          inv.payment_method === 'bank_transfer'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}
                      >
                        {inv.payment_method === 'bank_transfer' ? 'Bank Wire / PO' : 'Stripe Card'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {Number(inv.amount_sar).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400">
                      {Number(inv.vat_amount_sar).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 font-mono font-black text-white">
                      {Number(inv.grand_total_sar || inv.amount_sar).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                          inv.status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : inv.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verification & Settlement Modal */}
      {verifyingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-[#0B132B] p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black text-white">Verify Corporate Bank Wire Receipt</h3>
                <p className="font-mono text-xs text-amber-400">{verifyingInvoice.invoice_number}</p>
              </div>
              <button
                onClick={() => setVerifyingInvoice(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVerifyWire} className="mt-4 space-y-4 text-xs">
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tenant Entity:</span>
                  <span className="font-bold text-white">{verifyingInvoice.tenant_slug}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Grade Tier:</span>
                  <span className="font-bold text-purple-400 uppercase">
                    {verifyingInvoice.plan_display_name || verifyingInvoice.plan_name || 'Enterprise'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Settlement Due:</span>
                  <span className="font-mono font-black text-emerald-400">
                    {Number(verifyingInvoice.grand_total_sar || verifyingInvoice.amount_sar).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    SAR
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Bank Transaction Reference / Wire Receipt ID:
                </label>
                <input
                  type="text"
                  required
                  placeholder="ALINMA-TX-9928174"
                  value={wireRef}
                  onChange={(e) => setWireRef(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 font-mono text-xs text-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Settlement & Audit Notes:
                </label>
                <textarea
                  rows={2}
                  placeholder="Confirmed receipt on Alinma corporate statement..."
                  value={wireNotes}
                  onChange={(e) => setWireNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-[11px] text-emerald-300">
                <p>
                  <strong>Instant Effect:</strong> Confirming settlement marks this invoice PAID, sets the tenant's subscription to ACTIVE Enterprise Grade 3, and immediately unlocks external private database migration and zero-slug custom domain routes.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setVerifyingInvoice(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifySubmitting}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-black text-white shadow-lg shadow-emerald-600/30 transition-all"
                >
                  {verifySubmitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>Confirm Settlement & Unlock Tier</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
