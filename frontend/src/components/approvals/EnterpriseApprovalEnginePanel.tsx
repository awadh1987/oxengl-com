import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Sliders,
  FileCheck2,
  Search,
  Plus,
  Trash2,
  Edit3,
  ArrowUpRight,
  Shield,
  Layers,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Truck,
  ShoppingCart,
  Receipt,
  Landmark,
  Wrench,
  Users,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  ApprovalModuleType,
  TenantApprovalRule,
  WorkflowApprovalRequest,
  WorkflowApprovalStep,
} from '../../types';
import { formatDate } from '../../utils/formatters';

export interface EnterpriseApprovalEnginePanelProps {
  initialSubTab?: 'inbox' | 'matrix' | 'audit';
  showHeader?: boolean;
}

export const MODULE_METADATA: Record<
  ApprovalModuleType,
  { labelEn: string; labelAr: string; deptEn: string; deptAr: string; colorClass: string }
> = {
  OPERATIONS: {
    labelEn: 'Daily Operations & Trips',
    labelAr: 'العمليات اليومية والرحلات',
    deptEn: 'Fleet & Dispatch Operations',
    deptAr: 'إدارة التشغيل والأسطول',
    colorClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  PURCHASE_ORDER: {
    labelEn: 'Procurement Purchase Orders',
    labelAr: 'أوامر الشراء والتوريد (PO)',
    deptEn: 'Procurement & Supply Chain',
    deptAr: 'المشتريات وسلاسل الإمداد',
    colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  VENDOR_BILL: {
    labelEn: 'Vendor Bills & AP Invoices',
    labelAr: 'فواتير الموردين والذمم الدائنة',
    deptEn: 'Accounts Payable',
    deptAr: 'حسابات الموردين والمطابقة',
    colorClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  PURCHASE_REQUISITION: {
    labelEn: 'Purchase Requisitions',
    labelAr: 'طلبات الشراء الداخلية (PR)',
    deptEn: 'Internal Requisitions',
    deptAr: 'طلبات الاحتياج الداخلي',
    colorClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  },
  FINANCIAL_VOUCHER: {
    labelEn: 'Financial Vouchers (Receipt/Payment)',
    labelAr: 'سندات القبض والصرف المالية',
    deptEn: 'Corporate Treasury & GL',
    deptAr: 'الخزينة العامة والمحاسبة',
    colorClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  CRUSHER_PAYMENT: {
    labelEn: 'Crusher & Quarry Settlements',
    labelAr: 'دفعات وتسويات الكسارات',
    deptEn: 'Quarry & Supplier Clearing',
    deptAr: 'تسويات الكسارات والمحاجر',
    colorClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  },
  FLEET_WORK_ORDER: {
    labelEn: 'Fleet Maintenance Work Orders',
    labelAr: 'أوامر عمل صيانة الأسطول',
    deptEn: 'Fleet Workshop & CapEx',
    deptAr: 'ورشة الصيانة والتشغيل',
    colorClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  HRMS: {
    labelEn: 'HRMS Payroll & Settlements',
    labelAr: 'مسير الرواتب والموارد البشرية',
    deptEn: 'Human Capital & Payroll',
    deptAr: 'الموارد البشرية والرواتب',
    colorClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
};

export const ALL_APPROVAL_MODULES: ApprovalModuleType[] = [
  'OPERATIONS',
  'PURCHASE_ORDER',
  'VENDOR_BILL',
  'PURCHASE_REQUISITION',
  'FINANCIAL_VOUCHER',
  'CRUSHER_PAYMENT',
  'FLEET_WORK_ORDER',
  'HRMS',
];

export const AVAILABLE_APPROVER_ROLES = [
  'OPERATIONS_MANAGER',
  'PROCUREMENT_MANAGER',
  'DEPARTMENT_SUPERVISOR',
  'FLEET_MANAGER',
  'HR_MANAGER',
  'ACCOUNTANT',
  'FINANCE_MANAGER',
  'COO',
  'EXECUTIVE_DIRECTOR',
  'CEO',
];

export const EnterpriseApprovalEnginePanel: React.FC<EnterpriseApprovalEnginePanelProps> = ({
  initialSubTab = 'inbox',
  showHeader = false,
}) => {
  const {
    language,
    users,
    approvalRules,
    workflowRequests,
    approvalAuditLogs,
    refreshApprovalMatrix,
    addApprovalRule,
    updateApprovalRule,
    deleteApprovalRule,
    toggleModuleApproval,
    approveWorkflowRequest,
    rejectWorkflowRequest,
    escalateWorkflowRequest,
  } = useApp();

  const isAr = language === 'ar';

  const [subTab, setSubTab] = useState<'inbox' | 'matrix' | 'audit'>(initialSubTab);

  // Inbox filters
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<
    'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ALL'
  >('PENDING_APPROVAL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Action modal state (Approve / Reject / Escalate)
  const [activeActionModal, setActiveActionModal] = useState<{
    request: WorkflowApprovalRequest;
    step: WorkflowApprovalStep;
    action: 'APPROVE' | 'REJECT' | 'ESCALATE';
  } | null>(null);
  const [actionRemarks, setActionRemarks] = useState<string>('');
  const [escalateTargetRole, setEscalateTargetRole] = useState<string>('EXECUTIVE_DIRECTOR');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

  // Matrix rule editor state
  const [matrixModuleFilter, setMatrixModuleFilter] = useState<string>('ALL');
  const [isRuleModalOpen, setIsRuleModalOpen] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<{
    document_type: ApprovalModuleType;
    rule_name: string;
    min_amount: string;
    max_amount: string;
    required_role: string;
    approver_user_id: string;
    sequence_order: string;
    is_active: boolean;
  }>({
    document_type: 'OPERATIONS',
    rule_name: '',
    min_amount: '10000',
    max_amount: '',
    required_role: 'FINANCE_MANAGER',
    approver_user_id: '',
    sequence_order: '1',
    is_active: true,
  });

  // Audit filters
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');

  const pendingWorkflowCount = useMemo(
    () => workflowRequests.filter((r) => r.status === 'PENDING_APPROVAL').length,
    [workflowRequests]
  );

  // Filtered Workflow Requests
  const filteredRequests = useMemo(() => {
    return workflowRequests.filter((req) => {
      if (!req) return false;
      const matchesModule =
        selectedModuleFilter === 'ALL' || req.document_type === selectedModuleFilter;
      const matchesStatus =
        selectedStatusFilter === 'ALL' || req.status === selectedStatusFilter;
      const q = (searchQuery || '').trim().toLowerCase();
      const matchesSearch =
        !q ||
        (req.document_ref || '').toLowerCase().includes(q) ||
        (req.title || '').toLowerCase().includes(q) ||
        (req.requester_name || '').toLowerCase().includes(q) ||
        (req.department || '').toLowerCase().includes(q) ||
        (req.document_type || '').toLowerCase().includes(q);
      return matchesModule && matchesStatus && matchesSearch;
    });
  }, [workflowRequests, selectedModuleFilter, selectedStatusFilter, searchQuery]);

  // Filtered Matrix Rules
  const filteredMatrixRules = useMemo(() => {
    return approvalRules
      .filter(
        (r) => matrixModuleFilter === 'ALL' || r.document_type === matrixModuleFilter
      )
      .sort((a, b) => {
        if (a.document_type !== b.document_type) {
          return a.document_type.localeCompare(b.document_type);
        }
        if (a.sequence_order !== b.sequence_order) {
          return a.sequence_order - b.sequence_order;
        }
        return a.min_amount - b.min_amount;
      });
  }, [approvalRules, matrixModuleFilter]);

  // Module summary stats for Matrix Toggles
  const moduleMatrixStats = useMemo(() => {
    return ALL_APPROVAL_MODULES.map((mod) => {
      const rulesForMod = approvalRules.filter((r) => r.document_type === mod);
      const activeCount = rulesForMod.filter((r) => r.is_active).length;
      const pendingForMod = workflowRequests.filter(
        (w) => w.document_type === mod && w.status === 'PENDING_APPROVAL'
      ).length;
      return {
        moduleType: mod,
        totalRules: rulesForMod.length,
        activeRules: activeCount,
        isEnabled: activeCount > 0,
        pendingCount: pendingForMod,
        meta: MODULE_METADATA[mod],
      };
    });
  }, [approvalRules, workflowRequests]);

  // Filtered Audit Trail
  const filteredAuditLogs = useMemo(() => {
    return approvalAuditLogs.filter((entry) => {
      const matchesAction =
        auditActionFilter === 'ALL' || entry.action === auditActionFilter;
      const q = (auditSearch || '').trim().toLowerCase();
      const matchesSearch =
        !q ||
        (entry.document_ref || '').toLowerCase().includes(q) ||
        (entry.actor_name || '').toLowerCase().includes(q) ||
        (entry.remarks || '').toLowerCase().includes(q) ||
        (entry.document_type || '').toLowerCase().includes(q);
      return matchesAction && matchesSearch;
    });
  }, [approvalAuditLogs, auditActionFilter, auditSearch]);

  const showBanner = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleOpenDecisionModal = (
    request: WorkflowApprovalRequest,
    action: 'APPROVE' | 'REJECT' | 'ESCALATE'
  ) => {
    const activeStep =
      request.steps.find(
        (s) => s.status === 'PENDING' && s.sequence_order === request.current_step_sequence
      ) ||
      request.steps.find((s) => s.status === 'PENDING') ||
      request.steps[0];
    if (!activeStep) return;
    setActiveActionModal({ request, step: activeStep, action });
    setActionRemarks('');
    setEscalateTargetRole('EXECUTIVE_DIRECTOR');
  };

  const handleConfirmDecision = async () => {
    if (!activeActionModal) return;
    const { request, step, action } = activeActionModal;

    if (action === 'REJECT' && !actionRemarks.trim()) {
      return;
    }

    setIsSubmittingAction(true);
    try {
      if (action === 'APPROVE') {
        await approveWorkflowRequest(
          step.id,
          actionRemarks.trim() ||
            (isAr ? 'تم الاعتماد من محرك الموافقات' : 'Approved via Enterprise Approvals Engine')
        );
        showBanner(
          isAr
            ? `تم اعتماد الخطوة #${step.sequence_order} للمستند ${request.document_ref} بنجاح`
            : `Approved Step #${step.sequence_order} for document ${request.document_ref}`
        );
      } else if (action === 'REJECT') {
        await rejectWorkflowRequest(step.id, actionRemarks.trim());
        showBanner(
          isAr
            ? `تم رفض المستند ${request.document_ref} وتحديث حالته إلى مرفوض`
            : `Rejected document ${request.document_ref} and blocked posting`
        );
      } else if (action === 'ESCALATE') {
        await escalateWorkflowRequest(
          step.id,
          escalateTargetRole,
          actionRemarks.trim() ||
            (isAr
              ? `تم تصعيد الطلب إلى ${escalateTargetRole}`
              : `Escalated to ${escalateTargetRole} for executive review`)
        );
        showBanner(
          isAr
            ? `تم تصعيد المستند ${request.document_ref} إلى ${escalateTargetRole}`
            : `Escalated document ${request.document_ref} to ${escalateTargetRole}`
        );
      }
      setActiveActionModal(null);
      setActionRemarks('');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleOpenCreateRule = (defaultModule?: ApprovalModuleType) => {
    setEditingRuleId(null);
    setRuleForm({
      document_type: defaultModule || 'OPERATIONS',
      rule_name: '',
      min_amount: '10000',
      max_amount: '',
      required_role: 'FINANCE_MANAGER',
      approver_user_id: '',
      sequence_order: '1',
      is_active: true,
    });
    setIsRuleModalOpen(true);
  };

  const handleOpenEditRule = (rule: TenantApprovalRule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      document_type: rule.document_type,
      rule_name: rule.rule_name || '',
      min_amount: String(rule.min_amount ?? 0),
      max_amount: rule.max_amount !== null && rule.max_amount !== undefined ? String(rule.max_amount) : '',
      required_role: rule.required_role,
      approver_user_id: rule.approver_user_id || '',
      sequence_order: String(rule.sequence_order ?? 1),
      is_active: rule.is_active,
    });
    setIsRuleModalOpen(true);
  };

  const handleSaveRuleForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const minVal = Math.max(0, Number(ruleForm.min_amount) || 0);
    const maxVal =
      ruleForm.max_amount.trim() !== '' ? Math.max(minVal, Number(ruleForm.max_amount)) : null;
    const seqVal = Math.max(1, Number(ruleForm.sequence_order) || 1);

    const payload = {
      document_type: ruleForm.document_type,
      rule_name:
        ruleForm.rule_name.trim() ||
        `${MODULE_METADATA[ruleForm.document_type].labelEn} >= ${minVal.toLocaleString()} SAR`,
      min_amount: minVal,
      max_amount: maxVal,
      required_role: ruleForm.required_role,
      approver_user_id: ruleForm.approver_user_id.trim() || null,
      sequence_order: seqVal,
      is_active: ruleForm.is_active,
    };

    if (editingRuleId) {
      await updateApprovalRule(editingRuleId, payload);
      showBanner(
        isAr ? 'تم تحديث قاعدة الاعتماد بنجاح' : 'Approval threshold rule updated successfully'
      );
    } else {
      await addApprovalRule(payload);
      showBanner(
        isAr ? 'تم إضافة قاعدة الاعتماد الجديدة بنجاح' : 'New approval threshold rule created'
      );
    }
    setIsRuleModalOpen(false);
  };

  return (
    <div className="space-y-6 text-slate-100" data-testid="enterprise-approval-engine">
      {showHeader && (
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:flex-row sm:items-center shadow-lg">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">
                {isAr
                  ? 'محرك الاعتمادات والحوكمة المؤسسية الشامل'
                  : 'Enterprise Approvals & Governance Engine'}
              </h2>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'إدارة مصفوفة الصلاحيات والحدود المالية، صندوق الاعتمادات الموحد، وسجل التدقيق'
                  : 'Multi-step threshold rules, module interceptors, unified approval inbox, and audit trail'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshApprovalMatrix()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
              <span>{isAr ? 'تحديث المصفوفة' : 'Sync Matrix'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="approvals-subtab-inbox"
            onClick={() => setSubTab('inbox')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              subTab === 'inbox'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <Clock className="h-4 w-4 text-amber-400" />
            <span>
              {isAr ? 'صندوق الاعتمادات الموحد' : 'Unified Approval Inbox'}
            </span>
            <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-200">
              {pendingWorkflowCount}
            </span>
          </button>

          <button
            type="button"
            data-testid="approvals-subtab-matrix"
            onClick={() => setSubTab('matrix')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              subTab === 'matrix'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-4 w-4 text-sky-400" />
            <span>
              {isAr
                ? 'مصفوفة الصلاحيات والحدود المالية'
                : 'Approval Matrix & Threshold Rules'}
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
              {approvalRules.length}
            </span>
          </button>

          <button
            type="button"
            data-testid="approvals-subtab-audit"
            onClick={() => setSubTab('audit')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              subTab === 'audit'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
            }`}
          >
            <FileCheck2 className="h-4 w-4 text-emerald-400" />
            <span>
              {isAr ? 'سجل تدقيق الاعتمادات' : 'Approval Governance Audit Log'}
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
              {approvalAuditLogs.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 pr-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
            <Shield className="h-3.5 w-3.5 text-emerald-400" />
            <span>{isAr ? 'عزل RLS مفعل' : 'Tenant RLS Isolated'}</span>
          </span>
        </div>
      </div>

      {actionFeedback && (
        <div
          data-testid="approval-action-feedback"
          className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-bold text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 1: UNIFIED APPROVAL INBOX & QUEUE                           */}
      {/* =================================================================== */}
      {subTab === 'inbox' && (
        <div className="space-y-5">
          {/* Filter Controls */}
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 lg:flex-row lg:items-center">
            {/* Search & Status */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  data-testid="approval-inbox-search"
                  placeholder={
                    isAr
                      ? 'بحث برقم المستند، القسم، أو مقدم الطلب...'
                      : 'Search doc #, title, requester...'
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 py-2 text-xs font-medium text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1">
                {(
                  [
                    { id: 'PENDING_APPROVAL', labelEn: 'Pending', labelAr: 'بانتظار الاعتماد' },
                    { id: 'APPROVED', labelEn: 'Approved', labelAr: 'معتمد' },
                    { id: 'REJECTED', labelEn: 'Rejected', labelAr: 'مرفوض' },
                    { id: 'ALL', labelEn: 'All', labelAr: 'الكل' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    data-testid={`inbox-status-filter-${st.id}`}
                    onClick={() => setSelectedStatusFilter(st.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                      selectedStatusFilter === st.id
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isAr ? st.labelAr : st.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* Module Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedModuleFilter('ALL')}
                className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all ${
                  selectedModuleFilter === 'ALL'
                    ? 'bg-slate-100 text-slate-950'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                {isAr ? 'جميع الوحدات' : 'All Modules'}
              </button>
              {ALL_APPROVAL_MODULES.map((mod) => {
                const count = workflowRequests.filter(
                  (r) =>
                    r.document_type === mod &&
                    (selectedStatusFilter === 'ALL' || r.status === selectedStatusFilter)
                ).length;
                return (
                  <button
                    key={mod}
                    type="button"
                    data-testid={`inbox-module-filter-${mod}`}
                    onClick={() => setSelectedModuleFilter(mod)}
                    className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                      selectedModuleFilter === mod
                        ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span>{mod.replace(/_/g, ' ')}</span>
                    {count > 0 && (
                      <span className="rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] text-amber-300">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Queue Cards */}
          {filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/70 mb-3" />
              <h3 className="text-sm font-black text-slate-200">
                {isAr
                  ? 'لا توجد طلبات اعتماد مطابقة للفلتر المحدد'
                  : 'No Approval Requests Match Current Filter'}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {isAr
                  ? 'جميع المعاملات ضمن الحدود المعتمدة أو تم البت فيها مسبقاً'
                  : 'All transactions are either within auto-approval thresholds or already processed.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filteredRequests.map((req) => {
                const modMeta =
                  MODULE_METADATA[req.document_type] || MODULE_METADATA.OPERATIONS;
                const activeStep =
                  req.steps.find(
                    (s) =>
                      s.status === 'PENDING' &&
                      s.sequence_order === req.current_step_sequence
                  ) || req.steps.find((s) => s.status === 'PENDING');

                return (
                  <div
                    key={req.id}
                    data-testid={`workflow-request-card-${req.document_ref}`}
                    className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg hover:border-slate-700 transition-all"
                  >
                    <div className="space-y-4">
                      {/* Top row: Module Badge + Status Badge */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${modMeta.colorClass}`}
                        >
                          <Layers className="h-3.5 w-3.5" />
                          <span>{isAr ? modMeta.labelAr : modMeta.labelEn}</span>
                        </span>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-400">
                            {isAr
                              ? `الخطوة ${req.current_step_sequence} من ${req.total_steps}`
                              : `Step ${req.current_step_sequence} of ${req.total_steps}`}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                              req.status === 'PENDING_APPROVAL'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : req.status === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {req.status === 'PENDING_APPROVAL'
                              ? isAr
                                ? 'بانتظار الاعتماد'
                                : 'PENDING APPROVAL'
                              : req.status === 'APPROVED'
                              ? isAr
                                ? 'معتمد'
                                : 'APPROVED'
                              : isAr
                              ? 'مرفوض'
                              : 'REJECTED'}
                          </span>
                        </div>
                      </div>

                      {/* Title & Ref */}
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-black text-white font-mono">
                            {req.document_ref}
                          </h3>
                          <span className="text-sm font-black text-emerald-400 font-mono">
                            {req.amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}{' '}
                            {req.currency}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-300">{req.title}</p>
                      </div>

                      {/* Metadata box */}
                      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 text-xs">
                        <div>
                          <span className="text-slate-500 block text-[10px]">
                            {isAr ? 'مقدم الطلب:' : 'Requester:'}
                          </span>
                          <span className="font-bold text-slate-200">
                            {req.requester_name}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">
                            {isAr ? 'الإدارة / القسم:' : 'Department:'}
                          </span>
                          <span className="font-bold text-slate-200">
                            {req.department}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">
                            {isAr ? 'الدور المطلوب للاعتماد:' : 'Required Approver Role:'}
                          </span>
                          <span className="inline-block mt-0.5 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                            {activeStep ? activeStep.required_role : req.steps[req.steps.length - 1]?.required_role}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">
                            {isAr ? 'تاريخ الإنشاء:' : 'Created At:'}
                          </span>
                          <span className="font-mono text-[11px] text-slate-300">
                            {formatDate(req.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Multi-step pipeline visualization */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {isAr ? 'مسار خطوات الاعتماد المتسلسل' : 'Approval Routing Chain'}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {req.steps.map((st) => (
                            <div
                              key={st.id}
                              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                                st.status === 'APPROVED'
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                  : st.status === 'REJECTED'
                                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                                  : st.sequence_order === req.current_step_sequence &&
                                    req.status === 'PENDING_APPROVAL'
                                  ? 'border-amber-500/40 bg-amber-500/20 text-amber-200'
                                  : 'border-slate-800 bg-slate-950 text-slate-500'
                              }`}
                            >
                              <span className="font-mono text-[10px]">
                                #{st.sequence_order}
                              </span>
                              <span>{st.required_role}</span>
                              {st.status === 'APPROVED' && (
                                <Check className="h-3 w-3 text-emerald-400" />
                              )}
                              {st.status === 'REJECTED' && (
                                <X className="h-3 w-3 text-rose-400" />
                              )}
                              {st.escalated_to_role && (
                                <span className="text-[9px] text-sky-300">
                                  (Escalated)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons for Pending Requests */}
                    {req.status === 'PENDING_APPROVAL' && activeStep && (
                      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3.5">
                        <button
                          type="button"
                          data-testid={`approve-btn-${req.document_ref}`}
                          onClick={() => handleOpenDecisionModal(req, 'APPROVE')}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition-all"
                        >
                          <Check className="h-4 w-4 text-emerald-400" />
                          <span>{isAr ? 'اعتماد' : 'Approve'}</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`escalate-btn-${req.document_ref}`}
                          onClick={() => handleOpenDecisionModal(req, 'ESCALATE')}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-600/20 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-sky-600/30 transition-all"
                        >
                          <ArrowUpRight className="h-4 w-4 text-sky-400" />
                          <span>{isAr ? 'تصعيد' : 'Escalate'}</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`reject-btn-${req.document_ref}`}
                          onClick={() => handleOpenDecisionModal(req, 'REJECT')}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-600/20 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-600/30 transition-all"
                        >
                          <X className="h-4 w-4 text-rose-400" />
                          <span>{isAr ? 'رفض' : 'Reject'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 2: APPROVAL MATRIX & THRESHOLD RULES CONFIGURATION          */}
      {/* =================================================================== */}
      {subTab === 'matrix' && (
        <div className="space-y-6">
          {/* Section A: Module-Level Governance Interceptors (Toggles) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-black text-white">
                  {isAr
                    ? 'تفعيل وتعطيل محرك الاعتمادات حسب الوحدة (Module Interceptors)'
                    : 'Module-Level Approval Interceptors & Toggles'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isAr
                    ? 'عند تفعيل أي وحدة، يتم اعتراض المعاملات التي تتجاوز الحد المالي وتحويلها إلى حالة بانتظار الاعتماد قبل الترحيل للأستاذ العام'
                    : 'When enabled, mutations exceeding configured SAR thresholds transition to PENDING_APPROVAL and block GL posting / settlement until approved'}
                </p>
              </div>
              <button
                type="button"
                data-testid="open-add-rule-modal-btn"
                onClick={() => handleOpenCreateRule()}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-400 transition-all shadow-md shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>{isAr ? 'إضافة قاعدة حد مالي' : 'Add Threshold Rule'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {moduleMatrixStats.map((stat) => (
                <div
                  key={stat.moduleType}
                  data-testid={`module-toggle-card-${stat.moduleType}`}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                    stat.isEnabled
                      ? 'border-slate-700 bg-slate-950/90'
                      : 'border-slate-800/60 bg-slate-950/40 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${stat.meta.colorClass}`}
                      >
                        {stat.moduleType.replace(/_/g, ' ')}
                      </span>
                      <h4 className="mt-2 text-xs font-bold text-slate-100">
                        {isAr ? stat.meta.labelAr : stat.meta.labelEn}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isAr
                          ? `${stat.activeRules} قواعد نشطة • ${stat.pendingCount} معلق`
                          : `${stat.activeRules} active rules • ${stat.pendingCount} pending`}
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={stat.isEnabled}
                      data-testid={`toggle-module-${stat.moduleType}`}
                      onClick={() =>
                        toggleModuleApproval(stat.moduleType, !stat.isEnabled)
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        stat.isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                          stat.isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px]">
                    <span
                      className={
                        stat.isEnabled
                          ? 'text-emerald-400 font-bold'
                          : 'text-slate-500'
                      }
                    >
                      {stat.isEnabled
                        ? isAr
                          ? 'الاعتراض التلقائي مفعل'
                          : 'Interceptor Active'
                        : isAr
                        ? 'الاعتراض التلقائي معطل'
                        : 'Bypassed / Disabled'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenCreateRule(stat.moduleType)}
                      className="text-amber-400 hover:underline font-bold"
                    >
                      + {isAr ? 'قاعدة' : 'Rule'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section B: Multi-Step Threshold Rules Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-black text-white">
                  {isAr
                    ? 'جدول قواعد الحدود المالية وتعدد المستويات (Multi-Step Threshold Matrix)'
                    : 'Configured Multi-Step Threshold Rules'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isAr
                    ? 'ترتيب تسلسلي للموافقات حسب المبلغ بالريال السعودي والدور الوظيفي أو المستخدم المحدد'
                    : 'Sequential approval routing rules evaluated by SAR transaction amount and required role/user'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMatrixModuleFilter('ALL')}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    matrixModuleFilter === 'ALL'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}
                >
                  {isAr ? 'الكل' : 'All'} ({approvalRules.length})
                </button>
                {ALL_APPROVAL_MODULES.map((mod) => (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => setMatrixModuleFilter(mod)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                      matrixModuleFilter === mod
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {mod.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-bold">
                    <th className="py-3 px-4">{isAr ? 'الوحدة' : 'Module'}</th>
                    <th className="py-3 px-4">{isAr ? 'اسم القاعدة' : 'Rule Name'}</th>
                    <th className="py-3 px-4">{isAr ? 'الخطوة' : 'Step #'}</th>
                    <th className="py-3 px-4">
                      {isAr ? 'الحد الأدنى (SAR)' : 'Min Threshold (SAR)'}
                    </th>
                    <th className="py-3 px-4">
                      {isAr ? 'الحد الأعلى (SAR)' : 'Max Threshold (SAR)'}
                    </th>
                    <th className="py-3 px-4">
                      {isAr ? 'الدور الوظيفي المعتمد' : 'Required Role'}
                    </th>
                    <th className="py-3 px-4">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-4 text-right">
                      {isAr ? 'إجراءات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                  {filteredMatrixRules.map((rule) => {
                    const meta =
                      MODULE_METADATA[rule.document_type] ||
                      MODULE_METADATA.OPERATIONS;
                    return (
                      <tr
                        key={rule.id}
                        data-testid={`matrix-rule-row-${rule.id}`}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${meta.colorClass}`}
                          >
                            {rule.document_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-200">
                          {rule.rule_name || `${rule.document_type} Rule`}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-300">
                          Tier #{rule.sequence_order}
                        </td>
                        <td className="py-3 px-4 font-mono text-emerald-400 font-bold">
                          {rule.min_amount.toLocaleString()} SAR
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {rule.max_amount !== null && rule.max_amount !== undefined
                            ? `${rule.max_amount.toLocaleString()} SAR`
                            : isAr
                            ? 'بلا سقف أعلى (∞)'
                            : 'No Upper Limit (∞)'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                            {rule.required_role}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              updateApprovalRule(rule.id, {
                                is_active: !rule.is_active,
                              })
                            }
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              rule.is_active
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                            }`}
                          >
                            {rule.is_active
                              ? isAr
                                ? 'نشط'
                                : 'Active'
                              : isAr
                              ? 'متوقف'
                              : 'Paused'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditRule(rule)}
                              className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white"
                              title="Edit Rule"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              data-testid={`delete-rule-${rule.id}`}
                              onClick={() => deleteApprovalRule(rule.id)}
                              className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
                              title="Delete Rule"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 3: APPROVAL GOVERNANCE AUDIT LOG                            */}
      {/* =================================================================== */}
      {subTab === 'audit' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-black text-white">
                {isAr
                  ? 'سجل التدقيق الزمني لقرارات الاعتماد والرفض والتصعيد'
                  : 'Immutable Approval Governance Audit Trail'}
              </h3>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'يوثق اسم المعتمد، الدور الوظيفي، التوقيت الدقيق، والملاحظات لكل خطوة'
                  : 'Tracks who approved, rejected, or escalated every workflow step with timestamps and remarks'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث في سجل الاعتمادات...' : 'Search audit trail...'}
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>

              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-200 focus:outline-none"
              >
                <option value="ALL">{isAr ? 'كل القرارات' : 'All Decisions'}</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="ESCALATED">ESCALATED</option>
                <option value="SUBMITTED">SUBMITTED</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/60">
            {filteredAuditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {isAr ? 'لا توجد سجلات مطابقة' : 'No approval audit entries match filters'}
              </div>
            ) : (
              filteredAuditLogs.map((log) => (
                <div
                  key={log.id}
                  data-testid={`approval-audit-item-${log.id}`}
                  className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center hover:bg-slate-900/60"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 rounded-lg border px-2 py-0.5 font-mono text-[10px] font-black ${
                        log.action === 'APPROVED'
                          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                          : log.action === 'REJECTED'
                          ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                          : log.action === 'ESCALATED'
                          ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                          : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {log.action}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-black text-white">
                          {log.document_ref}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          ({log.document_type} • Step #{log.step_sequence})
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">{log.remarks}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {isAr ? 'بواسطة:' : 'By:'}{' '}
                        <strong className="text-slate-300">{log.actor_name}</strong> (
                        <span className="font-mono text-amber-300">{log.actor_role}</span>)
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-slate-400 shrink-0">
                    {formatDate(log.timestamp)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: APPROVE / REJECT / ESCALATE DECISION MODAL                 */}
      {/* =================================================================== */}
      {activeActionModal && (
        <div
          data-testid="approval-decision-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                    activeActionModal.action === 'APPROVE'
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                      : activeActionModal.action === 'ESCALATE'
                      ? 'border-sky-500/30 bg-sky-500/15 text-sky-400'
                      : 'border-rose-500/30 bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {activeActionModal.action === 'APPROVE' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : activeActionModal.action === 'ESCALATE' ? (
                    <ArrowUpRight className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    {activeActionModal.action === 'APPROVE'
                      ? isAr
                        ? 'تأكيد اعتماد المستند'
                        : 'Authorize & Approve Step'
                      : activeActionModal.action === 'ESCALATE'
                      ? isAr
                        ? 'تصعيد المستند للمستوى الأعلى'
                        : 'Escalate Approval Step'
                      : isAr
                      ? 'رفض المستند وإيقاف الترحيل'
                      : 'Reject Document & Block Posting'}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {activeActionModal.request.document_ref} •{' '}
                    {activeActionModal.request.amount.toLocaleString()}{' '}
                    {activeActionModal.request.currency}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveActionModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {activeActionModal.action === 'ESCALATE' && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">
                  {isAr ? 'تصعيد إلى الدور الوظيفي:' : 'Escalate to Target Role:'}
                </label>
                <select
                  data-testid="escalate-target-role-select"
                  value={escalateTargetRole}
                  onChange={(e) => setEscalateTargetRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white focus:border-sky-500 focus:outline-none"
                >
                  {AVAILABLE_APPROVER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-300">
                {activeActionModal.action === 'REJECT'
                  ? isAr
                    ? 'سبب الرفض (إلزامي لسجل التدقيق) *'
                    : 'Rejection Justification (Mandatory) *'
                  : isAr
                  ? 'ملاحظات الاعتماد / التصعيد (تظهر في سجل التدقيق)'
                  : 'Audit Remarks / Notes'}
              </label>
              <textarea
                rows={3}
                data-testid="approval-decision-remarks"
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                placeholder={
                  activeActionModal.action === 'REJECT'
                    ? isAr
                      ? 'أدخل سبب الرفض بدقة...'
                      : 'Specify reason for rejection...'
                    : isAr
                    ? 'ملاحظات إضافية (اختياري)...'
                    : 'Enter approval/escalation remarks...'
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setActiveActionModal(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                data-testid="confirm-approval-decision-btn"
                disabled={
                  isSubmittingAction ||
                  (activeActionModal.action === 'REJECT' && !actionRemarks.trim())
                }
                onClick={handleConfirmDecision}
                className={`rounded-xl px-5 py-2 text-xs font-black text-white shadow-lg transition-all disabled:opacity-50 ${
                  activeActionModal.action === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : activeActionModal.action === 'ESCALATE'
                    ? 'bg-sky-600 hover:bg-sky-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {isSubmittingAction
                  ? isAr
                    ? 'جاري التنفيذ...'
                    : 'Processing...'
                  : activeActionModal.action === 'APPROVE'
                  ? isAr
                    ? 'تأكيد الاعتماد'
                    : 'Confirm Approval'
                  : activeActionModal.action === 'ESCALATE'
                  ? isAr
                    ? 'تأكيد التصعيد'
                    : 'Confirm Escalation'
                  : isAr
                  ? 'تأكيد الرفض'
                  : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: CREATE / EDIT THRESHOLD RULE MODAL                         */}
      {/* =================================================================== */}
      {isRuleModalOpen && (
        <div
          data-testid="approval-rule-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
        >
          <form
            onSubmit={handleSaveRuleForm}
            className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white">
                {editingRuleId
                  ? isAr
                    ? 'تعديل قاعدة الاعتماد المالي'
                    : 'Edit Approval Threshold Rule'
                  : isAr
                  ? 'إضافة قاعدة حد مالي جديدة'
                  : 'Create Approval Threshold Rule'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'الوحدة / نوع المستند *' : 'Target Module *'}
                </label>
                <select
                  data-testid="rule-form-module"
                  value={ruleForm.document_type}
                  onChange={(e) =>
                    setRuleForm({
                      ...ruleForm,
                      document_type: e.target.value as ApprovalModuleType,
                    })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                >
                  {ALL_APPROVAL_MODULES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'ترتيب الخطوة (Step Sequence) *' : 'Step Sequence Order *'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  data-testid="rule-form-sequence"
                  value={ruleForm.sequence_order}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, sequence_order: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-300">
                {isAr ? 'وصف القاعدة' : 'Rule Name / Label'}
              </label>
              <input
                type="text"
                data-testid="rule-form-name"
                value={ruleForm.rule_name}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, rule_name: e.target.value })
                }
                placeholder={
                  isAr
                    ? 'مثال: اعتماد المدير المالي للرحلات فوق 25,000 ريال'
                    : 'e.g., High-Value Dispatch Finance Approval'
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'الحد الأدنى للمبلغ (SAR) *' : 'Min Amount Threshold (SAR) *'}
                </label>
                <input
                  type="number"
                  min={0}
                  step="100"
                  required
                  data-testid="rule-form-min-amount"
                  value={ruleForm.min_amount}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, min_amount: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-emerald-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'الحد الأعلى (SAR - اتركه فارغاً لبلا سقف)' : 'Max Amount (Blank = Unlimited)'}
                </label>
                <input
                  type="number"
                  min={0}
                  step="100"
                  data-testid="rule-form-max-amount"
                  value={ruleForm.max_amount}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, max_amount: e.target.value })
                  }
                  placeholder="Unlimited"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'الدور الوظيفي المعتمد *' : 'Required Approver Role *'}
                </label>
                <select
                  data-testid="rule-form-role"
                  value={ruleForm.required_role}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, required_role: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-amber-300"
                >
                  {AVAILABLE_APPROVER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">
                  {isAr ? 'مستخدم محدد (اختياري)' : 'Specific Approver User (Optional)'}
                </label>
                <select
                  value={ruleForm.approver_user_id}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, approver_user_id: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                >
                  <option value="">
                    {isAr ? 'أي مستخدم يحمل الدور' : 'Any user with role'}
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                data-testid="save-rule-form-btn"
                className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-black text-slate-950 hover:bg-amber-400"
              >
                {editingRuleId
                  ? isAr
                    ? 'حفظ التعديلات'
                    : 'Update Rule'
                  : isAr
                  ? 'إضافة القاعدة'
                  : 'Create Rule'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
