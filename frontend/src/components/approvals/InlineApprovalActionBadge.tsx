import React, { useState } from 'react';
import { Check, X, ArrowUpRight, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ApprovalModuleType } from '../../types';

export interface InlineApprovalActionBadgeProps {
  documentId: string;
  documentRef?: string;
  documentType: ApprovalModuleType;
  status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'Approved' | 'Pending_Approval' | 'Rejected' | string;
  workflowInstanceId?: string;
  compact?: boolean;
  onApproved?: () => void;
  onRejected?: () => void;
  onStatusChanged?: () => void;
}

export const InlineApprovalActionBadge: React.FC<InlineApprovalActionBadgeProps> = ({
  documentId,
  documentRef,
  documentType,
  status,
  workflowInstanceId,
  compact = true,
  onApproved,
  onRejected,
  onStatusChanged,
}) => {
  const effectiveRef = documentRef || documentId;
  const {
    language,
    workflowRequests,
    approveWorkflowRequest,
    rejectWorkflowRequest,
    escalateWorkflowRequest,
  } = useApp();
  const isAr = language === 'ar';

  const [isHandling, setIsHandling] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [remarks, setRemarks] = useState('');

  // Locate matching workflow request in AppContext
  const matchingReq = workflowRequests.find(
    (w) =>
      (workflowInstanceId && w.id === workflowInstanceId) ||
      w.document_id === documentId ||
      w.document_ref === effectiveRef
  );

  const normalizedStatus = (() => {
    if (matchingReq) return matchingReq.status;
    const raw = (status || '').toUpperCase();
    if (raw.includes('PENDING')) return 'PENDING_APPROVAL';
    if (raw.includes('REJECT')) return 'REJECTED';
    return 'APPROVED';
  })();

  const activeStep = matchingReq
    ? matchingReq.steps.find(
        (s) => s.status === 'PENDING' && s.sequence_order === matchingReq.current_step_sequence
      ) || matchingReq.steps.find((s) => s.status === 'PENDING')
    : null;

  const handleQuickApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsHandling(true);
    try {
      if (activeStep) {
        await approveWorkflowRequest(
          activeStep.id,
          isAr ? `اعتماد مباشر للمستند ${effectiveRef}` : `Inline approval for ${effectiveRef}`
        );
      }
      onApproved?.();
      onStatusChanged?.();
    } finally {
      setIsHandling(false);
    }
  };

  const handleQuickEscalate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeStep) return;
    setIsHandling(true);
    try {
      await escalateWorkflowRequest(
        activeStep.id,
        'EXECUTIVE_DIRECTOR',
        isAr ? `تصعيد مباشر للمستند ${effectiveRef}` : `Inline escalation for ${effectiveRef}`
      );
      onStatusChanged?.();
    } finally {
      setIsHandling(false);
    }
  };

  const handleQuickReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const reason =
      remarks.trim() ||
      (isAr ? `تم الرفض من جدول ${documentType}` : `Rejected inline from ${documentType} module`);
    setIsHandling(true);
    try {
      if (activeStep) {
        await rejectWorkflowRequest(activeStep.id, reason);
      }
      setShowRejectInput(false);
      setRemarks('');
      onRejected?.();
      onStatusChanged?.();
    } finally {
      setIsHandling(false);
    }
  };

  if (normalizedStatus === 'APPROVED') {
    return (
      <span
        data-testid={`approval-badge-${effectiveRef}`}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 whitespace-nowrap"
      >
        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
        <span>{isAr ? 'معتمد' : 'Approved'}</span>
      </span>
    );
  }

  if (normalizedStatus === 'REJECTED') {
    return (
      <span
        data-testid={`approval-badge-${effectiveRef}`}
        className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300 whitespace-nowrap"
      >
        <XCircle className="h-3 w-3 text-rose-400" />
        <span>{isAr ? 'مرفوض (موقوف)' : 'Rejected'}</span>
      </span>
    );
  }

  return (
    <div
      data-testid={`approval-badge-${effectiveRef}`}
      className="inline-flex flex-wrap items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 whitespace-nowrap">
        <Clock className="h-3 w-3 text-amber-400" />
        <span>
          {isAr ? 'بانتظار الاعتماد' : 'Pending Approval'}
          {matchingReq ? ` (${matchingReq.current_step_sequence}/${matchingReq.total_steps})` : ''}
        </span>
      </span>

      {!showRejectInput ? (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={isHandling}
            data-testid={`inline-approve-${effectiveRef}`}
            onClick={handleQuickApprove}
            title={isAr ? 'اعتماد فوري' : 'Approve'}
            className="inline-flex items-center gap-0.5 rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-600/35"
          >
            <Check className="h-3 w-3" />
            {!compact && <span>{isAr ? 'اعتماد' : 'Approve'}</span>}
          </button>

          {activeStep && (
            <button
              type="button"
              disabled={isHandling}
              data-testid={`inline-escalate-${effectiveRef}`}
              onClick={handleQuickEscalate}
              title={isAr ? 'تصعيد للمدير التنفيذي' : 'Escalate'}
              className="inline-flex items-center gap-0.5 rounded-lg border border-sky-500/40 bg-sky-600/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300 hover:bg-sky-600/35"
            >
              <ArrowUpRight className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            disabled={isHandling}
            data-testid={`inline-reject-open-${effectiveRef}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowRejectInput(true);
            }}
            title={isAr ? 'رفض المستند' : 'Reject'}
            className="inline-flex items-center gap-0.5 rounded-lg border border-rose-500/40 bg-rose-600/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-600/35"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-slate-950 p-1">
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={isAr ? 'سبب الرفض...' : 'Reason...'}
            className="w-24 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white focus:outline-none"
          />
          <button
            type="button"
            data-testid={`inline-reject-confirm-${effectiveRef}`}
            onClick={handleQuickReject}
            className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
          >
            {isAr ? 'رفض' : 'Reject'}
          </button>
          <button
            type="button"
            onClick={() => setShowRejectInput(false)}
            className="text-[10px] text-slate-400 px-1"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
