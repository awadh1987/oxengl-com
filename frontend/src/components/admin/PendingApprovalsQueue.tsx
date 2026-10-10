/**
 * OxenGL Platform Super Admin — Pending Subscriptions & Offline Payment Approvals Queue
 * Location: frontend/src/components/admin/PendingApprovalsQueue.tsx
 *
 * Provides Super Administrators with an approval workbench for:
 * 1. Reviewing pending offline bank wire & digital wallet subscriptions
 * 2. Inspecting uploaded payment receipts (PNG, JPEG, WebP, PDF) in a secure modal
 * 3. One-click subscription approval: extends subscription period and unlocks tenant capabilities
 * 4. Rejection with mandatory audit reason logging
 * 5. Dynamic optimistic queue eviction on action
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  RefreshCw,
  Eye,
  X,
  Building2,
  Clock,
  Ban,
  Check,
  Search,
  Inbox,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  DollarSign
} from 'lucide-react';
import {
  PendingInvoiceData,
  fetchPendingInvoices,
  approvePendingInvoice,
  rejectPendingInvoice,
} from '../../services/billingSettingsService';

export const PendingApprovalsQueue: React.FC = () => {
  const [invoices, setInvoices] = useState<PendingInvoiceData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modal / Receipt Inspection State
  const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoiceData | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [approvalReference, setApprovalReference] = useState<string>('');
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [showRejectionPrompt, setShowRejectionPrompt] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const loadPendingQueue = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setActionError(null);

    try {
      const data = await fetchPendingInvoices();
      setInvoices(data);
    } catch (err: any) {
      const msg = err.message || 'Failed to load pending approvals queue.';
      setToastMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPendingQueue();
  }, [loadPendingQueue]);

  // Handle Approve Action
  const handleApprove = async () => {
    if (!selectedInvoice) return;
    setIsApproving(true);
    setActionError(null);

    try {
      const res = await approvePendingInvoice(selectedInvoice.id, {
        payment_reference: approvalReference.trim() || undefined,
        notes: approvalNotes.trim() || undefined,
      });

      // Optimistically remove from state
      setInvoices((prev) => prev.filter((item) => item.id !== selectedInvoice.id));
      setSelectedInvoice(null);
      setApprovalReference('');
      setApprovalNotes('');

      const successMsg = `Invoice ${selectedInvoice.invoice_number} approved! Tenant subscription is now active.`;
      setToastMessage({ text: successMsg, type: 'success' });

      // Dispatch global toast event if listening
      window.dispatchEvent(
        new CustomEvent('oxengl-toast', {
          detail: { message: successMsg, type: 'success' },
        })
      );
    } catch (err: any) {
      const msg = err.message || 'Failed to approve invoice.';
      setActionError(msg);
    } finally {
      setIsApproving(false);
    }
  };

  // Handle Reject Action
  const handleReject = async () => {
    if (!selectedInvoice) return;
    if (!rejectionReason.trim()) {
      setActionError('Please provide a specific reason for rejecting this payment proof.');
      return;
    }

    setIsRejecting(true);
    setActionError(null);

    try {
      await rejectPendingInvoice(selectedInvoice.id, {
        reason: rejectionReason.trim(),
      });

      // Optimistically remove from state
      setInvoices((prev) => prev.filter((item) => item.id !== selectedInvoice.id));
      setSelectedInvoice(null);
      setShowRejectionPrompt(false);
      setRejectionReason('');

      const rejectMsg = `Invoice ${selectedInvoice.invoice_number} has been rejected.`;
      setToastMessage({ text: rejectMsg, type: 'success' });

      window.dispatchEvent(
        new CustomEvent('oxengl-toast', {
          detail: { message: rejectMsg, type: 'warning' },
        })
      );
    } catch (err: any) {
      const msg = err.message || 'Failed to reject invoice.';
      setActionError(msg);
    } finally {
      setIsRejecting(false);
    }
  };

  // Filter invoices by search term
  const filteredInvoices = invoices.filter((inv) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      inv.tenant_name.toLowerCase().includes(term) ||
      inv.tenant_email.toLowerCase().includes(term) ||
      inv.invoice_number.toLowerCase().includes(term) ||
      inv.plan_name.toLowerCase().includes(term) ||
      inv.plan_display_name.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 hover:opacity-75 focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Pending Subscription Approvals
            </h2>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              {invoices.length} Pending
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Review manual bank wire and digital wallet transfers uploaded by tenants to activate paid subscription tiers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tenant or invoice..."
              className="pl-9 pr-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={() => loadPendingQueue(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-500' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-16 flex flex-col items-center justify-center text-center">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
            Loading pending approvals queue...
          </p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        /* Zero Inbox / All Caught Up Empty State */
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center mb-4 text-emerald-600 dark:text-emerald-400">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Zero Inbox — All Caught Up!
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mt-1">
            {searchTerm
              ? `No pending approvals matched "${searchTerm}".`
              : 'There are no pending bank transfers or digital wallet payment receipts awaiting approval at this time.'}
          </p>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="mt-4 text-sm text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
            >
              Clear search filter
            </button>
          )}
        </div>
      ) : (
        /* Table of Pending Invoices */
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-4">Tenant / Organization</th>
                  <th scope="col" className="px-6 py-4">Plan & Cycle</th>
                  <th scope="col" className="px-6 py-4">Amount</th>
                  <th scope="col" className="px-6 py-4">Issue Date</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                {filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {/* Tenant Info */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 font-bold text-sm">
                          <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {inv.tenant_name}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                            <span>{inv.tenant_email}</span>
                            <span>•</span>
                            <span className="font-mono">{inv.invoice_number}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Plan & Cycle */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        {inv.plan_display_name}
                      </span>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 capitalize mt-1">
                        {inv.billing_cycle}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100">
                        {inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {inv.currency}
                      </div>
                      <div className="text-xs text-zinc-400 capitalize">
                        {inv.payment_method.replace(/_/g, ' ')}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 whitespace-nowrap text-zinc-600 dark:text-zinc-300 text-xs">
                      {inv.issued_date ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{new Date(inv.issued_date).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {inv.status === 'pending_verification' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Receipt Uploaded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          Awaiting Transfer
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setShowRejectionPrompt(false);
                          setActionError(null);
                          setApprovalReference(inv.payment_reference || '');
                          setApprovalNotes('');
                          setRejectionReason('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 shadow-sm transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipt Inspection Modal / Dialog */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-3xl w-full overflow-hidden transition-all animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                    Payment Review: {selectedInvoice.tenant_name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                    {selectedInvoice.invoice_number} • {selectedInvoice.plan_display_name} ({selectedInvoice.billing_cycle})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedInvoice(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Financial Snapshot Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs">
                <div>
                  <span className="text-zinc-400 block mb-0.5">Total Amount</span>
                  <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    {selectedInvoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedInvoice.currency}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">VAT Breakdown</span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Tax: {selectedInvoice.tax.toFixed(2)} {selectedInvoice.currency}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">Method</span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 capitalize">
                    {selectedInvoice.payment_method.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">Issued Date</span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {selectedInvoice.issued_date ? new Date(selectedInvoice.issued_date).toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>

              {/* Receipt Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                    Uploaded Payment Receipt Proof
                  </label>
                  {selectedInvoice.payment_proof_url && (
                    <a
                      href={selectedInvoice.payment_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      <span>Open Original</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 overflow-hidden flex items-center justify-center min-h-[260px] max-h-[380px] p-2">
                  {selectedInvoice.payment_proof_url ? (
                    selectedInvoice.payment_proof_url.toLowerCase().endsWith('.pdf') ? (
                      /* PDF File Preview fallback */
                      <div className="p-8 text-center space-y-3">
                        <FileText className="w-12 h-12 text-rose-500 mx-auto" />
                        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                          PDF Transfer Confirmation Document
                        </div>
                        <a
                          href={selectedInvoice.payment_proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium hover:bg-emerald-500 transition shadow"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>View PDF in New Tab</span>
                        </a>
                      </div>
                    ) : (
                      /* Image Receipt View */
                      <img
                        src={selectedInvoice.payment_proof_url}
                        alt="Tenant Transfer Receipt"
                        className="max-h-[360px] w-auto max-w-full rounded-xl object-contain shadow-sm"
                        onError={(e) => {
                          // Fallback placeholder if image fails to load
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )
                  ) : (
                    /* Missing Receipt Fallback */
                    <div className="p-8 text-center text-zinc-400 space-y-2">
                      <AlertTriangle className="w-10 h-10 mx-auto text-amber-500/80" />
                      <p className="text-xs font-medium">No payment receipt file uploaded yet.</p>
                      <p className="text-xs text-zinc-500">
                        The tenant has initiated the offline subscription order but has not attached a wire confirmation.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Error Banner */}
              {actionError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Rejection Prompt or Approval Form */}
              {showRejectionPrompt ? (
                <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-xs uppercase">
                    <Ban className="w-4 h-4" />
                    <span>Rejection Reason (Audit Trail Required)</span>
                  </div>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g., Transfer amount mismatch, expired receipt date, or unverified sender IBAN"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setShowRejectionPrompt(false)}
                      className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={isRejecting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      {isRejecting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Ban className="w-3.5 h-3.5" />
                      )}
                      <span>Confirm Rejection</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                        Bank Wire Reference (Optional)
                      </label>
                      <input
                        type="text"
                        value={approvalReference}
                        onChange={(e) => setApprovalReference(e.target.value)}
                        placeholder="e.g., RJHI-WIRE-20261011"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                        Audit Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        placeholder="e.g., Confirmed with corporate finance ledger"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Close
              </button>

              {!showRejectionPrompt && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRejectionPrompt(true);
                      setActionError(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-rose-300 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
                  >
                    {isApproving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Approve Subscription</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
