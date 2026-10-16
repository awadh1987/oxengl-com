import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Search,
  Check,
  X,
  ArrowUpRight,
  Sliders,
  Inbox,
} from 'lucide-react';

import { useApp } from '../context/AppContext';
import { getAuthToken, getTenantId } from '../services/api';
import { EnterpriseApprovalEnginePanel } from '../components/approvals/EnterpriseApprovalEnginePanel';

export interface ApprovalItem {
  id: string;
  step_id: string;
  instance_id: string;
  document_type: string;
  document_id: string;
  document_number: string;
  requester_name: string;
  department: string;
  amount: number;
  currency: string;
  sequence_order: number;
  total_steps: number;
  required_role: string;
  created_at: string;
  description: string;
}

const MODULE_FILTER_TABS = [
  { id: 'ALL', label: 'All Documents' },
  { id: 'OPERATIONS', label: 'Operations' },
  { id: 'PURCHASE_REQUISITION', label: 'Requisitions' },
  { id: 'PURCHASE_ORDER', label: 'Orders' },
  { id: 'VENDOR_BILL', label: 'Vendor Bills' },
  { id: 'FINANCIAL_VOUCHER', label: 'Vouchers' },
  { id: 'CRUSHER_PAYMENT', label: 'Crusher Settlements' },
  { id: 'FLEET_WORK_ORDER', label: 'Fleet Work Orders' },
  { id: 'HRMS', label: 'HRMS & Payroll' },
];

export const ApprovalQueueView: React.FC = () => {
  const {
    language,
    workflowRequests,
    approveWorkflowRequest,
    rejectWorkflowRequest,
    escalateWorkflowRequest,
  } = useApp();
  const isAr = language === 'ar';
  const [viewMode, setViewMode] = useState<'QUEUE' | 'ENGINE'>('QUEUE');
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Modal states
  const [activeItem, setActiveItem] = useState<ApprovalItem | null>(null);
  const [modalAction, setModalAction] = useState<'APPROVE' | 'REJECT' | 'ESCALATE' | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [escalateRole, setEscalateRole] = useState<string>('EXECUTIVE_DIRECTOR');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchApprovalQueue();
  }, []);

  const fetchApprovalQueue = async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const activeTenantId = getTenantId() || '';
      const res = await fetch('/api/v1/procurement/approvals/queue', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Tenant-ID': activeTenantId } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      } else {
        setItems([
          {
            id: 'apr-001',
            step_id: 'step-001',
            instance_id: 'inst-001',
            document_type: 'PURCHASE_ORDER',
            document_id: 'po-1092',
            document_number: 'PO-2026-0842',
            requester_name: 'Tariq Al-Mansoor',
            department: 'Fleet Logistics & Maintenance',
            amount: 78500.0,
            currency: 'SAR',
            sequence_order: 2,
            total_steps: 3,
            required_role: 'FINANCE_MANAGER',
            created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            description: 'Scheduled prime mover engine overhaul spare parts batch procurement',
          },
          {
            id: 'apr-002',
            step_id: 'step-002',
            instance_id: 'inst-002',
            document_type: 'PURCHASE_REQUISITION',
            document_id: 'pr-5421',
            document_number: 'PR-2026-1190',
            requester_name: 'Sami Al-Ghamdi',
            department: 'Grain Silo Operations',
            amount: 14200.0,
            currency: 'SAR',
            sequence_order: 1,
            total_steps: 1,
            required_role: 'DEPARTMENT_SUPERVISOR',
            created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
            description: 'Quarterly conveyor belt lubrication consumables refill',
          },
          {
            id: 'apr-003',
            step_id: 'step-003',
            instance_id: 'inst-003',
            document_type: 'VENDOR_BILL',
            document_id: 'vb-9912',
            document_number: 'BILL-2026-4401',
            requester_name: 'Accounts Payable Clearing',
            department: 'Corporate Finance',
            amount: 125000.0,
            currency: 'SAR',
            sequence_order: 3,
            total_steps: 3,
            required_role: 'EXECUTIVE_DIRECTOR',
            created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
            description: 'Aramco bulk diesel station replenishment invoice match',
          },
        ]);
      }
    } catch (err) {
      console.warn('Could not fetch queue from server:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Merge live context workflowRequests that are PENDING_APPROVAL with server items
  const combinedItems = useMemo(() => {
    const map = new Map<string, ApprovalItem>();
    for (const item of items) {
      map.set(item.instance_id || item.step_id, item);
    }
    for (const wf of workflowRequests || []) {
      if (wf.status !== 'PENDING_APPROVAL') continue;
      if (map.has(wf.instance_id)) continue;
      const activeStep =
        wf.steps.find(s => s.sequence_order === wf.current_step_order && s.status === 'PENDING') ||
        wf.steps.find(s => s.status === 'PENDING');
      map.set(wf.instance_id, {
        id: wf.id,
        step_id: activeStep?.step_id || `step-${wf.id}`,
        instance_id: wf.instance_id,
        document_type: wf.document_type,
        document_id: wf.document_id,
        document_number: wf.document_number,
        requester_name: wf.requester_name,
        department: wf.department,
        amount: wf.amount,
        currency: wf.currency || 'SAR',
        sequence_order: wf.current_step_order,
        total_steps: wf.total_steps,
        required_role: activeStep?.required_role || 'FINANCE_MANAGER',
        created_at: wf.created_at,
        description: wf.description,
      });
    }
    return Array.from(map.values());
  }, [items, workflowRequests]);

  const handleOpenModal = (item: ApprovalItem, action: 'APPROVE' | 'REJECT' | 'ESCALATE') => {
    setActiveItem(item);
    setModalAction(action);
    setRejectionReason('');
    setEscalateRole('EXECUTIVE_DIRECTOR');
  };

  const handleCloseModal = () => {
    setActiveItem(null);
    setModalAction(null);
    setRejectionReason('');
  };

  const handleSubmitDecision = async () => {
    if (!activeItem || !modalAction) return;
    if ((modalAction === 'REJECT' || modalAction === 'ESCALATE') && !rejectionReason.trim()) {
      alert('A justification/reason is strictly mandatory for the platform audit trail.');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint =
        modalAction === 'APPROVE'
          ? `/api/v1/procurement/approvals/steps/${activeItem.step_id}/approve`
          : modalAction === 'REJECT'
          ? `/api/v1/procurement/approvals/steps/${activeItem.step_id}/reject`
          : `/api/v1/procurement/approvals/steps/${activeItem.step_id}/escalate`;

      const token = getAuthToken();
      const activeTenantId = getTenantId() || '';
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Tenant-ID': activeTenantId } : {}),
        },
        body: JSON.stringify({
          rejection_reason: rejectionReason,
          remarks: rejectionReason,
          escalate_to_role: escalateRole,
        }),
      });

      // Also sync in AppContext if present
      if (modalAction === 'APPROVE') {
        await approveWorkflowRequest(activeItem.instance_id, rejectionReason || 'Approved via Approval Queue');
      } else if (modalAction === 'REJECT') {
        await rejectWorkflowRequest(activeItem.instance_id, rejectionReason);
      } else if (modalAction === 'ESCALATE') {
        await escalateWorkflowRequest(activeItem.instance_id, rejectionReason, escalateRole);
      }

      if (modalAction === 'ESCALATE') {
        setItems(prev =>
          prev.map(i =>
            i.step_id === activeItem.step_id
              ? { ...i, required_role: escalateRole }
              : i
          )
        );
      } else {
        setItems(prev => prev.filter(i => i.step_id !== activeItem.step_id));
      }

      const verb =
        modalAction === 'APPROVE'
          ? 'approved'
          : modalAction === 'REJECT'
          ? 'rejected'
          : `escalated to ${escalateRole}`;
      setActionSuccess(`Successfully ${verb} document ${activeItem.document_number}`);
      setTimeout(() => setActionSuccess(null), 4000);
      handleCloseModal();
    } catch (err: any) {
      alert(err.message || 'Action failed to process');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = combinedItems.filter(item => {
    if (!item) return false;
    const q = (searchQuery || '').trim().toLowerCase();
    const matchesSearch =
      (item.document_number || '').toLowerCase().includes(q) ||
      (item.requester_name || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q);
    const matchesType = selectedType === 'ALL' || item.document_type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-dvh erp-viewport-root bg-slate-950 px-3 sm:px-4 md:px-6 py-4 sm:py-6 lg:py-8 w-full max-w-7xl mx-auto text-slate-100 font-sans">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Approval Queue Matrix</h1>
              <p className="text-sm text-slate-400">
                Multi-level threshold routing across Operations, Procurement, Finance, Crusher, Fleet & HRMS
              </p>
            </div>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 p-1">
          <button
            type="button"
            onClick={() => setViewMode('QUEUE')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'QUEUE'
                ? 'bg-orange-500 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>{isAr ? 'صندوق الاعتمادات' : 'Queue Cards'}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('ENGINE')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'ENGINE'
                ? 'bg-orange-500 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>{isAr ? 'مصفوفة القواعد وسجل التدقيق' : 'Matrix Rules & Audit Log'}</span>
          </button>
        </div>
      </div>

      {viewMode === 'ENGINE' ? (
        <EnterpriseApprovalEnginePanel initialSubTab="matrix" />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder={
                  isAr ? 'بحث برقم المستند أو مقدم الطلب...' : 'Search document #, requester...'
                }
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center rounded-xl bg-slate-900 border border-slate-800 p-1 gap-1">
              {MODULE_FILTER_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedType(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    selectedType === tab.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {actionSuccess && (
            <div className="mb-6 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Grid of Pending Items */}
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-slate-500">
              Loading approval pipeline...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-slate-600 mb-3" />
              <h3 className="text-lg font-semibold text-slate-300">All Queues Cleared</h3>
              <p className="mt-1 text-sm text-slate-500">
                You have no pending documents awaiting your role&apos;s validation tier.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {filteredItems.map(item => (
                <div
                  key={item.step_id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm hover:border-slate-700 transition-all shadow-lg"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 whitespace-nowrap shrink-0">
                        <FileText className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        {item.document_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
                        Tier {item.sequence_order} of {item.total_steps}
                      </span>
                    </div>

                    <div className="mt-4">
                      <h3 className="text-lg font-bold text-white tracking-tight break-all">
                        {item.document_number}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.description}</p>
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-950/60 p-3 border border-slate-800/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Requested Value:</span>
                        <span className="font-bold text-emerald-400 text-sm">
                          {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
                          {item.currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Department:</span>
                        <span className="font-medium text-slate-200">{item.department}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Requester:</span>
                        <span className="text-slate-300">{item.requester_name}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Target Role:</span>
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-300 border border-amber-500/20">
                          {item.required_role}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-5 flex gap-2 pt-2 border-t border-slate-800/60">
                    <button
                      onClick={() => handleOpenModal(item, 'APPROVE')}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 transition-all cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Authorize</span>
                    </button>
                    <button
                      onClick={() => handleOpenModal(item, 'ESCALATE')}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-amber-500/15 border border-amber-500/30 px-2.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 transition-all cursor-pointer"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5 text-amber-400" />
                      <span>Escalate</span>
                    </button>
                    <button
                      onClick={() => handleOpenModal(item, 'REJECT')}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-600/20 border border-red-500/30 px-2.5 py-2 text-xs font-semibold text-red-300 hover:bg-red-600/30 transition-all cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5 text-red-400" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Confirmation / Rejection / Escalation Modal */}
      {activeItem && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                    modalAction === 'APPROVE'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : modalAction === 'ESCALATE'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}
                >
                  {modalAction === 'APPROVE' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : modalAction === 'ESCALATE' ? (
                    <ArrowUpRight className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {modalAction === 'APPROVE'
                      ? 'Authorize Transaction'
                      : modalAction === 'ESCALATE'
                      ? 'Escalate Transaction'
                      : 'Reject Transaction'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Document #{activeItem.document_number} ({activeItem.amount.toLocaleString()}{' '}
                    {activeItem.currency})
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <p className="text-sm text-slate-300">
                {modalAction === 'APPROVE'
                  ? `Are you sure you want to approve this ${activeItem.document_type.replace(
                      /_/g,
                      ' '
                    )}? Your cryptographic signature will be recorded in the permanent audit trail.`
                  : modalAction === 'ESCALATE'
                  ? `Select the executive role to escalate this document to and provide escalation remarks.`
                  : `Please provide a clear justification for rejecting this document. The workflow instance will immediately terminate and notify the requester.`}
              </p>

              {modalAction === 'ESCALATE' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Target Escalation Role
                  </label>
                  <select
                    value={escalateRole}
                    onChange={e => setEscalateRole(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="FINANCE_MANAGER">FINANCE_MANAGER</option>
                    <option value="COO">COO</option>
                    <option value="EXECUTIVE_DIRECTOR">EXECUTIVE_DIRECTOR</option>
                    <option value="OWNER">OWNER</option>
                  </select>
                </div>
              )}

              {(modalAction === 'REJECT' || modalAction === 'ESCALATE' || modalAction === 'APPROVE') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {modalAction === 'REJECT'
                      ? 'Rejection Reason (Required)'
                      : modalAction === 'ESCALATE'
                      ? 'Escalation Justification (Required)'
                      : 'Approval Remarks (Optional)'}
                  </label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder={
                      isAr
                        ? 'أدخل الملاحظات أو سبب الإجراء...'
                        : 'Enter remarks or justification for audit trail...'
                    }
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={handleCloseModal}
                className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitDecision}
                disabled={
                  isSubmitting ||
                  ((modalAction === 'REJECT' || modalAction === 'ESCALATE') &&
                    !rejectionReason.trim())
                }
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-lg transition-all cursor-pointer ${
                  modalAction === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50'
                    : modalAction === 'ESCALATE'
                    ? 'bg-amber-600 hover:bg-amber-500 disabled:opacity-50'
                    : 'bg-red-600 hover:bg-red-500 disabled:opacity-50'
                }`}
              >
                {isSubmitting ? (
                  <span>Processing...</span>
                ) : (
                  <span>
                    Confirm{' '}
                    {modalAction === 'APPROVE'
                      ? 'Approval'
                      : modalAction === 'ESCALATE'
                      ? 'Escalation'
                      : 'Rejection'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
