import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  Edit3,
  Sliders,
  Palette,
  FileCheck2,
  Table,
  RotateCcw,
  Search,
  Filter,
  Download,
  Trash2,
  Eye,
  AlertTriangle,
  Sparkles,
  Save,
  Check,
  FileSpreadsheet,
  Building,
  Lock,
  Stamp,
  Signature,
  FileText,
  RefreshCw,
  Database,
} from 'lucide-react';
import { formatCurrency, formatDate, formatNumber, formatTonnage } from '../utils/formatters';
import { UserRole, EditApprovalRequest, UserApprovalRequest, BrandConfig } from '../types';
import { ImportSystemResourceModal } from '../components/ImportSystemResourceModal';

export const ExecutiveAdminView: React.FC = () => {
  const {
    currentUser,
    isAdmin,
    operations,
    activeOperations,
    softDeletedOperations,
    customers,
    crushers,
    transporters,
    materials,
    users,
    editRequests,
    approveEditRequest,
    rejectEditRequest,
    userRequests,
    approveUserRequest,
    rejectUserRequest,
    brandConfig,
    updateBrandConfig,
    resetBrandConfig,
    auditLogs,
    clearAuditLogs,
    overrideOperationRecord,
    bulkOverrideOperations,
    restoreOperation,
    restoreCustomer,
    restoreCrusher,
    restoreTransporter,
    restoreMaterial,
    restoreUser,
    language,
    isCOO,
  } = useApp();

  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<
    'approvals' | 'global-grid' | 'branding' | 'audit-trail' | 'recycle-bin'
  >('approvals');

  // Approvals tab sub-filter
  const [approvalsSubTab, setApprovalsSubTab] = useState<'edits' | 'users' | 'signatures'>('edits');
  const [selectedUserRoles, setSelectedUserRoles] = useState<Record<string, UserRole>>({});
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // Global Grid states
  const [gridSearch, setGridSearch] = useState('');
  const [gridMonthFilter, setGridMonthFilter] = useState<number>(0);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [cellValue, setCellValue] = useState<any>('');
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkField, setBulkField] = useState<string>('destination_customer');
  const [bulkValue, setBulkValue] = useState<string>('');

  // Branding states
  const [brandForm, setBrandForm] = useState<BrandConfig>(brandConfig);
  const [brandSavedToast, setBrandSavedToast] = useState(false);
  const [brandingSubSection, setBrandingSubSection] = useState<'general' | 'logo' | 'homepage' | 'contact' | 'bank'>('general');
  const [isLegacyImportOpen, setIsLegacyImportOpen] = useState(false);

  React.useEffect(() => {
    setBrandForm(brandConfig);
  }, [brandConfig]);

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setBrandForm((prev) => ({
            ...prev,
            customLogoUrl: event.target?.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setBrandForm((prev) => ({
            ...prev,
            ceoSignatureUrl: event.target?.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStampFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setBrandForm((prev) => ({
            ...prev,
            companyStampUrl: event.target?.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Audit Trail states
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [auditEntityFilter, setAuditEntityFilter] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Recycle bin category
  const [recycleCategory, setRecycleCategory] = useState<'operations' | 'customers' | 'crushers' | 'transporters' | 'materials' | 'users'>('operations');

  // Security gate check (Executive Admin: Admin/CEO & COO)
  if (!isAdmin && !isCOO) {
    return (
      <div className="flex min-h-[500px] flex-col items-center justify-center rounded-3xl border border-rose-200 bg-rose-50/50 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-lg font-black text-rose-900">
          {isAr ? 'منطقة محظورة - مخصصة للإدارة التنفيذية فقط' : 'Restricted Area - Executive Admin Only'}
        </h2>
        <p className="mt-2 max-w-md text-xs text-rose-700">
          {isAr
            ? 'هذه اللوحة مخصصة للإدارة التنفيذية (CEO & COO) لاعتماد التعديلات، مراجعة سجلات التدقيق، والتحكم في سير العمليات.'
            : 'This console is strictly reserved for the Chief Executive Officer and Chief Operating Officer.'}
        </p>
      </div>
    );
  }

  // Pending counts
  const pendingEditsCount = editRequests.filter((r) => r.status === 'Pending').length;
  const pendingUsersCount = userRequests.filter((r) => r.status === 'Pending').length;

  // Filtered Grid rows
  const filteredGridRows = useMemo(() => {
    return activeOperations.filter((op) => {
      if (!op) return false;
      const q = (gridSearch || '').trim().toLowerCase();
      const matchSearch =
        !gridSearch ||
        (op.truck_no || '').toLowerCase().includes(q) ||
        (op.destination_customer || '').toLowerCase().includes(q) ||
        (op.loading_source || '').toLowerCase().includes(q) ||
        (op.transporter_name || '').toLowerCase().includes(q) ||
        (op.scale_ticket_no || '').toLowerCase().includes(q) ||
        (op.driver_name || '').toLowerCase().includes(q);

      const matchMonth = gridMonthFilter === 0 || op.operation_month === gridMonthFilter;
      return matchSearch && matchMonth;
    });
  }, [activeOperations, gridSearch, gridMonthFilter]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (!log) return false;
      const q = (auditSearch || '').trim().toLowerCase();
      const matchSearch =
        !auditSearch ||
        (log.summary || '').toLowerCase().includes(q) ||
        (log.userName || '').toLowerCase().includes(q) ||
        (log.entityId || '').toLowerCase().includes(q);

      const matchAction = auditActionFilter === 'ALL' || log.action === auditActionFilter;
      const matchEntity = auditEntityFilter === 'ALL' || log.entityType === auditEntityFilter;

      return matchSearch && matchAction && matchEntity;
    });
  }, [auditLogs, auditSearch, auditActionFilter, auditEntityFilter]);

  // Handle cell edit save
  const handleSaveCell = (id: string, field: string) => {
    overrideOperationRecord(id, { [field]: cellValue });
    setEditingCell(null);
    setCellValue('');
  };

  // Handle bulk override
  const handleApplyBulk = () => {
    if (selectedRowIds.length === 0 || !bulkValue) return;
    bulkOverrideOperations(selectedRowIds, { [bulkField]: bulkValue });
    setSelectedRowIds([]);
    setBulkValue('');
  };

  // Handle brand save
  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    updateBrandConfig(brandForm);
    setBrandSavedToast(true);
    setTimeout(() => setBrandSavedToast(false), 3000);
  };

  // Soft deleted lists
  const softDeletedCustomers = customers.filter((c) => !!c.is_deleted);
  const softDeletedCrushers = crushers.filter((c) => !!c.is_deleted);
  const softDeletedTransporters = transporters.filter((t) => !!t.is_deleted);
  const softDeletedMaterials = materials.filter((m) => !!m.is_deleted);
  const softDeletedUsers = users.filter((u) => !!u.is_deleted);

  return (
    <div className="space-y-6" id="executive-admin-view">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-neutral-950 to-slate-900 p-6 text-white shadow-xl sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-300 border border-orange-400/30 backdrop-blur-xs">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black">
                {isAr ? 'لوحة الإدارة التنفيذية والتحكم الشامل' : 'Executive Admin Console & Control Panel'}
              </h1>
              <span className="rounded-full bg-orange-500/30 px-2.5 py-0.5 text-[10px] font-bold text-orange-200 border border-orange-400/30">
                {isAr ? 'صلاحيات المدير العام' : 'CEO Clearance'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {isAr
                ? 'إدارة محرك الاعتمادات والتوقيع الرقمي، محرّر قاعدة البيانات المباشر، وتخصيص الهوية البصرية للشركة'
                : 'Approval workflows, digital signing, live database overrides, and white-label customization'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Legacy System Resource Bridge Button (Sprint 7) */}
          <button
            id="admin-import-system-resource-btn"
            onClick={() => setIsLegacyImportOpen(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-orange-500/20 hover:bg-orange-500/30 px-3.5 py-2 border border-orange-400/40 text-orange-200 text-xs font-bold transition-all shadow-xs"
            title={isAr ? 'استيراد وامتصاص ملف قاعدة البيانات التاريخية System Resource.xlsx' : 'Import Legacy System Resource Excel (.xlsx)'}
          >
            <Database className="h-4 w-4 text-orange-400" />
            <span>{isAr ? 'جسر البيانات التاريخية (System Resource)' : 'Import System Resource (.xlsx)'}</span>
          </button>

          {pendingEditsCount + pendingUsersCount > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-amber-500/20 px-3.5 py-2 border border-amber-400/30 text-amber-200 text-xs font-bold">
              <Clock className="h-4 w-4 text-amber-400 animate-spin" />
              <span>
                {pendingEditsCount + pendingUsersCount} {isAr ? 'طلبات بانتظار الاعتماد' : 'Pending Approvals'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Top Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          {
            id: 'approvals',
            labelAr: `محرك الاعتمادات والموافقات (${pendingEditsCount + pendingUsersCount})`,
            labelEn: `Approvals Engine (${pendingEditsCount + pendingUsersCount})`,
            icon: CheckCircle2,
            badge: pendingEditsCount + pendingUsersCount > 0,
          },
          {
            id: 'global-grid',
            labelAr: 'المحرّر المباشر لقاعدة البيانات (Global Data Grid)',
            labelEn: 'Global Data Grid Override',
            icon: Table,
          },
          {
            id: 'branding',
            labelAr: 'الهوية البصرية وتخصيص العلامة (White-Labeling)',
            labelEn: 'Brand Configuration',
            icon: Palette,
          },
          {
            id: 'audit-trail',
            labelAr: `سجل التدقيق الشامل والامتثال (${auditLogs.length})`,
            labelEn: `Audit Trail Logs (${auditLogs.length})`,
            icon: FileCheck2,
          },
          {
            id: 'recycle-bin',
            labelAr: `سلة المحذوفات والمؤرشفات (${softDeletedOperations.length + softDeletedCustomers.length + softDeletedCrushers.length})`,
            labelEn: 'Recycle Bin & Archives',
            icon: Trash2,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all ${
                isActive
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{isAr ? tab.labelAr : tab.labelEn}</span>
              {tab.badge && (
                <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* TAB 1: APPROVAL WORKFLOW ENGINE                          */}
      {/* ======================================================== */}
      {activeTab === 'approvals' && (
        <div className="space-y-6">
          {/* Sub Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setApprovalsSubTab('edits')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                approvalsSubTab === 'edits'
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>{isAr ? 'طلبات تعديل البيانات والرحلات' : 'Data Edit Requests'}</span>
              <span className="rounded-full bg-orange-200 px-1.5 py-0.2 text-[10px] text-orange-950">
                {pendingEditsCount}
              </span>
            </button>

            <button
              onClick={() => setApprovalsSubTab('users')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                approvalsSubTab === 'users'
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>{isAr ? 'طلبات تسجيل الموظفين والمستخدمين' : 'User Registration Requests'}</span>
              <span className="rounded-full bg-orange-200 px-1.5 py-0.2 text-[10px] text-orange-950">
                {pendingUsersCount}
              </span>
            </button>

            <button
              onClick={() => setApprovalsSubTab('signatures')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                approvalsSubTab === 'signatures'
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Stamp className="h-3.5 w-3.5" />
              <span>{isAr ? 'إدارة التوقيع والختم الرقمي' : 'Digital Signature & Stamp'}</span>
            </button>
          </div>

          {/* Sub-tab 1.1: Data Edit Requests (Side-by-side diff) */}
          {approvalsSubTab === 'edits' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {isAr ? 'طلبات تغيير وتعديل السجلات المالية والتشغيلية (Change Management)' : 'Data Edit Approval Requests'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr
                      ? 'مراجعة الفروقات بين القيم القديمة والجديدة واعتماد تطبيقها فوراً على قاعدة البيانات'
                      : 'Review side-by-side diffs of proposed changes before committing them to records'}
                  </p>
                </div>
              </div>

              {editRequests.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 text-xs font-bold text-slate-700">
                    {isAr ? 'لا توجد طلبات تعديل بانتظار المراجعة' : 'No edit approval requests'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {editRequests.map((req) => (
                    <div
                      key={req.id}
                      className={`rounded-3xl border p-5 shadow-xs transition-all ${
                        req.status === 'Pending'
                          ? 'border-amber-200 bg-amber-50/20'
                          : req.status === 'Approved'
                          ? 'border-emerald-200 bg-emerald-50/10'
                          : 'border-rose-200 bg-rose-50/10'
                      }`}
                    >
                      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                              req.status === 'Pending'
                                ? 'bg-amber-100 text-amber-700'
                                : req.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            <Edit3 className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-black text-slate-900">
                                {isAr ? 'طلب تعديل سجل:' : 'Record Edit:'} <span className="font-mono text-orange-950">{req.recordId}</span>
                              </h4>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  req.status === 'Pending'
                                    ? 'bg-amber-100 text-amber-800'
                                    : req.status === 'Approved'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {req.status === 'Pending' ? (isAr ? 'قيد المراجعة' : 'Pending') : req.status === 'Approved' ? (isAr ? 'معتمد' : 'Approved') : (isAr ? 'مرفوض' : 'Rejected')}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {isAr ? 'مقدم الطلب:' : 'Requested by:'} <strong>{req.requestedBy}</strong> ({req.requestedByRole}) - {formatDate(req.requestedAt)}
                            </p>
                          </div>
                        </div>

                        {req.status === 'Pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                              className="flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-50"
                            >
                              <XCircle className="h-4 w-4" />
                              <span>{isAr ? 'رفض' : 'Reject'}</span>
                            </button>
                            <button
                              onClick={() => approveEditRequest(req.id)}
                              className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{isAr ? 'اعتماد وتطبيق فوري' : 'Approve & Apply'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Diff Summary */}
                      <p className="my-3 text-xs font-bold text-slate-800 bg-white p-3 rounded-xl border border-slate-100">
                        {req.diffSummary}
                      </p>

                      {/* Side-by-Side Diff Table */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Old Values */}
                        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3">
                          <span className="text-[10px] font-bold text-rose-800 uppercase">
                            {isAr ? 'البيانات الحالية (قبل التعديل)' : 'Old Values'}
                          </span>
                          <div className="mt-2 space-y-1 text-xs">
                            {Object.entries(req.oldValues).map(([key, val]) => (
                              <div key={key} className="flex justify-between border-b border-rose-100/60 pb-1">
                                <span className="text-slate-500 font-mono text-[11px]">{key}:</span>
                                <strong className="text-rose-900 font-mono">{String(val)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* New Values */}
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
                          <span className="text-[10px] font-bold text-emerald-800 uppercase">
                            {isAr ? 'البيانات المقترحة (الجديدة)' : 'Proposed New Values'}
                          </span>
                          <div className="mt-2 space-y-1 text-xs">
                            {Object.entries(req.newValues).map(([key, val]) => (
                              <div key={key} className="flex justify-between border-b border-emerald-100/60 pb-1">
                                <span className="text-slate-500 font-mono text-[11px]">{key}:</span>
                                <strong className="text-emerald-900 font-mono">{String(val)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Rejection Note Form */}
                      {rejectingId === req.id && (
                        <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-4 space-y-2">
                          <label className="block text-xs font-bold text-rose-900">
                            {isAr ? 'سبب رفض الطلب (سيتم إخطار مدخل البيانات):' : 'Rejection Reason:'}
                          </label>
                          <input
                            type="text"
                            placeholder={isAr ? 'مثال: الوزن غير مطابق لتذكرة الميزان المرفقة' : 'Reason for rejection'}
                            value={rejectionNotes[req.id] || ''}
                            onChange={(e) =>
                              setRejectionNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setRejectingId(null)}
                              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                            >
                              {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                              onClick={() => {
                                rejectEditRequest(req.id, rejectionNotes[req.id]);
                                setRejectingId(null);
                              }}
                              className="rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                            >
                              {isAr ? 'تأكيد الرفض' : 'Confirm Reject'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-tab 1.2: User Sign-up Approvals */}
          {approvalsSubTab === 'users' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {isAr ? 'طلبات تسجيل الحسابات والموظفين الجدد' : 'Staff Account Registration Queue'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'تعيين الصلاحيات والأدوار واعتماد دخول الموظفين للوحة التحكم'
                    : 'Assign security roles and approve new staff access'}
                </p>
              </div>

              {userRequests.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs">
                  <UserCheck className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 text-xs font-bold text-slate-700">
                    {isAr ? 'لا توجد طلبات تسجيل موظفين بانتظار الاعتماد' : 'No pending user registrations'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  {userRequests.map((usrReq) => (
                    <div key={usrReq.id} className="p-5 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 font-black">
                            {usrReq.fullName.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-black text-slate-900">{usrReq.fullNameAr || usrReq.fullName}</h4>
                              <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 font-mono">
                                @{usrReq.username}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {usrReq.email} - {usrReq.phone} - {formatDate(usrReq.requestedAt)}
                            </p>
                            {usrReq.notes && <p className="text-[11px] text-orange-800 mt-1 font-medium">{usrReq.notes}</p>}
                          </div>
                        </div>

                        {usrReq.status === 'Pending' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-bold text-slate-700">{isAr ? 'تعيين الصلاحية:' : 'Assign Role:'}</label>
                              <select
                                value={selectedUserRoles[usrReq.id] || usrReq.requestedRole}
                                onChange={(e) =>
                                  setSelectedUserRoles((prev) => ({
                                    ...prev,
                                    [usrReq.id]: e.target.value as UserRole,
                                  }))
                                }
                                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-orange-950 focus:outline-none"
                              >
                                <option value="Owner">Owner (مالك المنشأة)</option>
                                <option value="Admin">Admin (مدير عام)</option>
                                <option value="Accountant">Accountant (محاسب)</option>
                                <option value="Data_Entry">Data Entry (مدخل بيانات)</option>
                                <option value="Guest">Guest (عميل)</option>
                              </select>
                            </div>

                            <button
                              onClick={() => rejectUserRequest(usrReq.id)}
                              className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-50"
                            >
                              {isAr ? 'رفض' : 'Reject'}
                            </button>
                            <button
                              onClick={() =>
                                approveUserRequest(
                                  usrReq.id,
                                  selectedUserRoles[usrReq.id] || usrReq.requestedRole
                                )
                              }
                              className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{isAr ? 'اعتماد الحساب وتفعيله' : 'Approve & Activate'}</span>
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              usrReq.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {usrReq.status === 'Approved' ? (isAr ? 'تم تفعيل الحساب' : 'Activated') : (isAr ? 'مرفوض' : 'Rejected')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-tab 1.3: Digital Signature & Stamping Manager */}
          {approvalsSubTab === 'signatures' && (
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {isAr ? 'إدارة التوقيع الإلكتروني والختم الرسمي للشركة' : 'Digital Signatures & Company Seal Manager'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'تخصيص توقيع المدير التنفيذي وختم الشركة الذي يتم حرقه وتثبيته على الفواتير الضريبية وسندات التصفية'
                    : 'Configure official CEO signature and transparent stamp for one-click invoice signing'}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* CEO Signature Card */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                      <Signature className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">
                        {isAr ? 'توقيع المدير التنفيذي المعتمد' : 'CEO Official Signature'}
                      </h4>
                      <p className="text-[11px] text-slate-500">{brandConfig.ceoNameAr} ({brandConfig.ceoTitleAr})</p>
                    </div>
                  </div>

                  <div className="h-28 rounded-xl border border-dashed border-slate-300 bg-white p-3 flex items-center justify-center">
                    {brandConfig.ceoSignatureUrl ? (
                      <img src={brandConfig.ceoSignatureUrl} alt="CEO Signature" className="max-h-20 object-contain" />
                    ) : (
                      <p className="font-serif italic text-2xl text-slate-800 font-bold">
                        Eng. Mansour Al-Ghamdi
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {isAr ? 'رابط صورة التوقيع (PNG شفاف):' : 'Signature Image URL (Transparent PNG):'}
                    </label>
                    <input
                      type="text"
                      value={brandConfig.ceoSignatureUrl || ''}
                      onChange={(e) => updateBrandConfig({ ceoSignatureUrl: e.target.value })}
                      placeholder={isAr ? 'https://example.com/signature.png' : 'https://example.com/signature.png'}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Company Official Seal */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-purple-700">
                      <Stamp className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">
                        {isAr ? 'ختم الشركة الرسمي المعتمد' : 'Official Corporate Seal'}
                      </h4>
                      <p className="text-[11px] text-slate-500">{brandConfig.companyNameAr}</p>
                    </div>
                  </div>

                  <div className="h-28 rounded-xl border border-dashed border-slate-300 bg-white p-3 flex items-center justify-center">
                    {brandConfig.companyStampUrl ? (
                      <img src={brandConfig.companyStampUrl} alt="Seal" className="max-h-20 object-contain" />
                    ) : (
                      <div className="h-20 w-20 rounded-full border-2 border-orange-700/60 border-dashed flex flex-col items-center justify-center text-center p-1">
                        <span className="text-[8px] font-black text-orange-950">شركة ميون للمقاولات</span>
                        <span className="text-[7px] font-bold text-orange-600">معتمد ورسمي</span>
                        <span className="text-[7px] font-mono text-slate-500">س.ت: {brandConfig.crNumber}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {isAr ? 'رابط صورة الختم الرسمي (PNG شفاف):' : 'Stamp Image URL (Transparent PNG):'}
                    </label>
                    <input
                      type="text"
                      value={brandConfig.companyStampUrl || ''}
                      onChange={(e) => updateBrandConfig({ companyStampUrl: e.target.value })}
                      placeholder={isAr ? 'https://example.com/stamp.png' : 'https://example.com/stamp.png'}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: GLOBAL MASTER DATA GRID (Inline DB Override)       */}
      {/* ======================================================== */}
      {activeTab === 'global-grid' && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">
                  {isAr ? 'محرّر قاعدة البيانات المباشر (Global Data Grid Override)' : 'Global Operations Grid Override'}
                </h2>
                <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                  {isAr ? 'صلاحيات تعديل فورية' : 'Inline Editing Enabled'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'انقر نقراً مزدوجاً أو انقر على أي خلية لتعديل الأوزان والأسعار والعملاء والكسارات مباشرة مع توثيق التدقيق'
                  : 'Double-click any cell to directly edit values with automatic audit trail logging'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-400 rtl:right-3 rtl:left-auto" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث عن شاحنة أو عميل...' : 'Search grid...'}
                  value={gridSearch}
                  onChange={(e) => setGridSearch(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Month */}
              <select
                value={gridMonthFilter}
                onChange={(e) => setGridMonthFilter(Number(e.target.value))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none"
              >
                <option value={0}>{isAr ? 'كافة الشهور' : 'All Months'}</option>
                <option value={8}>{isAr ? 'أغسطس 2026' : 'August 2026'}</option>
                <option value={7}>{isAr ? 'يوليو 2026' : 'July 2026'}</option>
                <option value={6}>{isAr ? 'يونيو 2026' : 'June 2026'}</option>
              </select>
            </div>
          </div>

          {/* Bulk Update Controls (If rows selected) */}
          {selectedRowIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-orange-50/80 p-3.5 border border-orange-200 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-orange-950">
                  {isAr ? `تم تحديد (${selectedRowIds.length}) سجل` : `${selectedRowIds.length} rows selected`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={bulkField}
                  onChange={(e) => setBulkField(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
                >
                  <option value="destination_customer">{isAr ? 'تغيير العميل المستلم' : 'Change Customer'}</option>
                  <option value="loading_source">{isAr ? 'تغيير الكسارة الموردة' : 'Change Crusher'}</option>
                  <option value="transporter_name">{isAr ? 'تغيير مقاول النقل' : 'Change Transporter'}</option>
                  <option value="material_type">{isAr ? 'تغيير صنف المادة' : 'Change Material'}</option>
                </select>

                <input
                  type="text"
                  placeholder={isAr ? 'القيمة الجديدة...' : 'New value...'}
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
                />

                <button
                  onClick={handleApplyBulk}
                  className="rounded-xl bg-orange-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-700 shadow-xs"
                >
                  {isAr ? 'تطبيق التعديل الجماعي' : 'Apply Bulk'}
                </button>
                <button
                  onClick={() => setSelectedRowIds([])}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  {isAr ? 'إلغاء التحديد' : 'Deselect'}
                </button>
              </div>
            </div>
          )}

          {/* Grid Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-black text-slate-800">
                  <th className="py-2.5 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.length === filteredGridRows.length && filteredGridRows.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRowIds(filteredGridRows.map((r) => r.id));
                        } else {
                          setSelectedRowIds([]);
                        }
                      }}
                      className="rounded"
                    />
                  </th>
                  <th className="py-2.5 px-3">{isAr ? 'رقم التذكرة' : 'Ticket #'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'رقم الشاحنة' : 'Truck #'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'الناقل' : 'Transporter'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'المصدر (الكسارة)' : 'Crusher'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'العميل المستلم' : 'Customer'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'المادة' : 'Material'}</th>
                  <th className="py-2.5 px-3 text-center">{isAr ? 'المحمل (MT طن)' : 'Loaded (MT)'}</th>
                  <th className="py-2.5 px-3 text-center">{isAr ? 'المستلم (MT طن)' : 'Delivered (MT)'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'المبيعات' : 'Sales'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'التكلفة' : 'Cost'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'الربح الصافي' : 'Net Profit'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGridRows.map((row) => {
                  const isSelected = selectedRowIds.includes(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-orange-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRowIds((prev) => [...prev, row.id]);
                            } else {
                              setSelectedRowIds((prev) => prev.filter((id) => id !== row.id));
                            }
                          }}
                          className="rounded"
                        />
                      </td>

                      {/* Ticket # */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {row.scale_ticket_no}
                      </td>

                      {/* Date (Editable) */}
                      <td
                        onDoubleClick={() => {
                          setEditingCell({ id: row.id, field: 'loading_date' });
                          setCellValue(row.loading_date);
                        }}
                        className="py-2.5 px-3 font-mono cursor-pointer hover:bg-orange-50"
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'loading_date' ? (
                          <input
                            type="date"
                            autoFocus
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => handleSaveCell(row.id, 'loading_date')}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row.id, 'loading_date')}
                            className="rounded border border-orange-500 bg-white px-1 py-0.5 text-xs"
                          />
                        ) : (
                          row.loading_date
                        )}
                      </td>

                      {/* Truck # (Editable) */}
                      <td
                        onDoubleClick={() => {
                          setEditingCell({ id: row.id, field: 'truck_no' });
                          setCellValue(row.truck_no);
                        }}
                        className="py-2.5 px-3 font-bold text-slate-900 cursor-pointer hover:bg-orange-50"
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'truck_no' ? (
                          <input
                            type="text"
                            autoFocus
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => handleSaveCell(row.id, 'truck_no')}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row.id, 'truck_no')}
                            className="rounded border border-orange-500 bg-white px-1 py-0.5 text-xs font-bold"
                          />
                        ) : (
                          row.truck_no
                        )}
                      </td>

                      {/* Transporter */}
                      <td className="py-2.5 px-3 text-slate-700 truncate max-w-[120px]">
                        {row.transporter_name}
                      </td>

                      {/* Crusher (Editable) */}
                      <td
                        onDoubleClick={() => {
                          setEditingCell({ id: row.id, field: 'loading_source' });
                          setCellValue(row.loading_source);
                        }}
                        className="py-2.5 px-3 text-slate-800 cursor-pointer hover:bg-orange-50 truncate max-w-[130px]"
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'loading_source' ? (
                          <input
                            type="text"
                            autoFocus
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => handleSaveCell(row.id, 'loading_source')}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row.id, 'loading_source')}
                            className="rounded border border-orange-500 bg-white px-1 py-0.5 text-xs font-bold"
                          />
                        ) : (
                          row.loading_source
                        )}
                      </td>

                      {/* Customer (Editable) */}
                      <td
                        onDoubleClick={() => {
                          setEditingCell({ id: row.id, field: 'destination_customer' });
                          setCellValue(row.destination_customer);
                        }}
                        className="py-2.5 px-3 font-bold text-neutral-950 cursor-pointer hover:bg-orange-50 truncate max-w-[140px]"
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'destination_customer' ? (
                          <input
                            type="text"
                            autoFocus
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => handleSaveCell(row.id, 'destination_customer')}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row.id, 'destination_customer')}
                            className="rounded border border-orange-500 bg-white px-1 py-0.5 text-xs font-bold"
                          />
                        ) : (
                          row.destination_customer
                        )}
                      </td>

                      {/* Material */}
                      <td className="py-2.5 px-3 text-slate-700 text-[11px] truncate max-w-[110px]">
                        {row.material_type}
                      </td>

                      {/* Loaded Weight (Editable) */}
                      <td
                        onDoubleClick={() => {
                          setEditingCell({ id: row.id, field: 'qty_loaded' });
                          setCellValue(row.qty_loaded);
                        }}
                        className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 cursor-pointer hover:bg-orange-50"
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'qty_loaded' ? (
                          <input
                            type="number"
                            step="0.1"
                            autoFocus
                            value={cellValue}
                            onChange={(e) => setCellValue(Number(e.target.value))}
                            onBlur={() => handleSaveCell(row.id, 'qty_loaded')}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row.id, 'qty_loaded')}
                            className="w-16 rounded border border-orange-500 bg-white px-1 py-0.5 text-xs font-mono font-bold"
                          />
                        ) : (
                          row.qty_loaded
                        )}
                      </td>

                      {/* Delivered Weight (Editable) */}
                      <td
                        onDoubleClick={() => {
                          setEditingCell({ id: row.id, field: 'qty_delivered' });
                          setCellValue(row.qty_delivered);
                        }}
                        className="py-2.5 px-3 text-center font-mono font-black text-orange-950 cursor-pointer hover:bg-orange-50"
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'qty_delivered' ? (
                          <input
                            type="number"
                            step="0.1"
                            autoFocus
                            value={cellValue}
                            onChange={(e) => setCellValue(Number(e.target.value))}
                            onBlur={() => handleSaveCell(row.id, 'qty_delivered')}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row.id, 'qty_delivered')}
                            className="w-16 rounded border border-orange-500 bg-white px-1 py-0.5 text-xs font-mono font-bold"
                          />
                        ) : (
                          row.qty_delivered
                        )}
                      </td>

                      {/* Sales (Editable) */}
                      <td
                        onDoubleClick={() => {
                          setEditingCell({ id: row.id, field: 'sales_amount' });
                          setCellValue(row.sales_amount);
                        }}
                        className="py-2.5 px-3 font-semibold text-slate-900 cursor-pointer hover:bg-orange-50"
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'sales_amount' ? (
                          <input
                            type="number"
                            step="1"
                            autoFocus
                            value={cellValue}
                            onChange={(e) => setCellValue(Number(e.target.value))}
                            onBlur={() => handleSaveCell(row.id, 'sales_amount')}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row.id, 'sales_amount')}
                            className="w-20 rounded border border-orange-500 bg-white px-1 py-0.5 text-xs font-mono"
                          />
                        ) : (
                          formatCurrency(row.sales_amount, language)
                        )}
                      </td>

                      {/* Cost (Editable) */}
                      <td
                        onDoubleClick={() => {
                          setEditingCell({ id: row.id, field: 'purchases_cost' });
                          setCellValue(row.purchases_cost);
                        }}
                        className="py-2.5 px-3 text-slate-600 cursor-pointer hover:bg-orange-50"
                      >
                        {editingCell?.id === row.id && editingCell?.field === 'purchases_cost' ? (
                          <input
                            type="number"
                            step="1"
                            autoFocus
                            value={cellValue}
                            onChange={(e) => setCellValue(Number(e.target.value))}
                            onBlur={() => handleSaveCell(row.id, 'purchases_cost')}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row.id, 'purchases_cost')}
                            className="w-20 rounded border border-orange-500 bg-white px-1 py-0.5 text-xs font-mono"
                          />
                        ) : (
                          formatCurrency(row.purchases_cost, language)
                        )}
                      </td>

                      {/* Net Profit */}
                      <td className="py-2.5 px-3 font-black text-emerald-700">
                        {formatCurrency(row.net_profit, language)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: DYNAMIC WHITE-LABELING & HOMEPAGE CUSTOMIZATION    */}
      {/* ======================================================== */}
      {activeTab === 'branding' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Customizer Form (2 Cols) */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-900">
                    {isAr ? 'إعدادات الهوية البصرية والصفحة الرئيسية' : 'White-Label Branding & Homepage Editor'}
                  </h2>
                  <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                    Live Customizer
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAr
                    ? 'تخصيص اسم الشركة، الشعار، نصوص الصفحة الرئيسية، الألوان، وأرقام التواصل'
                    : 'Customize company identity, logo, homepage copy, brand colors, and contact info'}
                </p>
              </div>

              {/* Sub-section tabs */}
              <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                {[
                  { id: 'general', labelAr: 'البيانات الرسمية', labelEn: 'Company' },
                  { id: 'logo', labelAr: 'الشعار والألوان', labelEn: 'Logo & Colors' },
                  { id: 'homepage', labelAr: 'الصفحة الرئيسية', labelEn: 'Homepage' },
                  { id: 'contact', labelAr: 'التواصل والعناوين', labelEn: 'Contact' },
                  { id: 'bank', labelAr: 'البنك والتوقيع', labelEn: 'Bank & Signature' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setBrandingSubSection(st.id as any)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      brandingSubSection === st.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isAr ? st.labelAr : st.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {brandSavedToast && (
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 border border-emerald-200 text-emerald-800 text-xs font-bold animate-in fade-in duration-150">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>
                  {isAr
                    ? 'تم حفظ وتطبيق التعديلات بنجاح على الصفحة الرئيسية وكامل النظام!'
                    : 'Branding & homepage changes updated and applied live!'}
                </span>
              </div>
            )}

            <form onSubmit={handleSaveBranding} className="space-y-6">
              {/* SUBSECTION 1: GENERAL & COMPANY NAME */}
              {brandingSubSection === 'general' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80">
                    <h3 className="text-xs font-black text-slate-800 mb-1">
                      {isAr ? 'الاسم التجاري والبيانات الضريبية' : 'Official Trade Name & Tax Details'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {isAr
                        ? 'يظهر هذا الاسم في ترويسة الموقع، الفواتير المعتمدة، وسندات القبض والصرف'
                        : 'Appears in website header, tax invoices, and payment receipts'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'اسم الشركة الرسمي (عربي) *' : 'Company Name (AR) *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={brandForm.companyNameAr}
                        onChange={(e) => setBrandForm({ ...brandForm, companyNameAr: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'اسم الشركة الرسمي (إنجليزي) *' : 'Company Name (EN) *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={brandForm.companyNameEn}
                        onChange={(e) => setBrandForm({ ...brandForm, companyNameEn: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'الرقم الضريبي VAT (15 رقم) *' : 'VAT Registration Number *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={brandForm.taxNumber}
                        onChange={(e) => setBrandForm({ ...brandForm, taxNumber: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'رقم السجل التجاري (CR Number) *' : 'CR Number *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={brandForm.crNumber}
                        onChange={(e) => setBrandForm({ ...brandForm, crNumber: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'الشعار اللفظي / السلوجان (عربي)' : 'Company Slogan (AR)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.sloganAr || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, sloganAr: e.target.value })}
                        placeholder={isAr ? 'الريادة في توريد المواد الإنشائية وأسطول النقل الثقيل' : 'Pioneering Heavy Transport & Quarry Supply'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'الشعار اللفظي / السلوجان (إنجليزي)' : 'Company Slogan (EN)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.sloganEn || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, sloganEn: e.target.value })}
                        placeholder={isAr ? 'الريادة في توريد المواد الإنشائية' : 'Pioneering Heavy Transport & Quarry Supply'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SUBSECTION 2: LOGO & COLORS */}
              {brandingSubSection === 'logo' && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80">
                    <h3 className="text-xs font-black text-slate-800 mb-1">
                      {isAr ? 'شعار الشركة المخصص والألوان' : 'Custom Corporate Logo & Palette'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {isAr
                        ? 'يمكنك رفع شعار شركتك من جهازك مباشرة أو إدخال رابط الصورة (PNG شفاف)'
                        : 'Upload custom company logo directly or provide an image link'}
                    </p>
                  </div>

                  {/* Logo Upload Box */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center rounded-2xl border border-slate-200 p-4 bg-white">
                    <div className="flex flex-col items-center justify-center p-3 bg-slate-900 rounded-2xl border border-slate-800 text-center">
                      <p className="text-[10px] font-bold text-slate-400 mb-2">
                        {isAr ? 'معاينة الشعار في الوضع الداكن' : 'Dark Mode Preview'}
                      </p>
                      {brandForm.customLogoUrl ? (
                        <img
                          src={brandForm.customLogoUrl}
                          alt="Custom Logo"
                          className="h-12 w-auto max-w-[140px] object-contain"
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-white">
                          <div
                            className="h-9 w-9 rounded-xl flex items-center justify-center font-black text-white"
                            style={{ backgroundColor: brandForm.primaryColor }}
                          >
                            M
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-black">{brandForm.companyNameAr}</div>
                            <div className="text-[9px] text-orange-400 font-bold">{brandForm.companyNameEn}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-2 space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">
                          {isAr ? 'رفع صورة الشعار من الجهاز (PNG / SVG / JPG):' : 'Upload Logo File (PNG / SVG / JPG):'}
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFileUpload}
                          className="block w-full text-xs text-slate-500 file:me-3 file:rounded-xl file:border-0 file:bg-orange-50 file:px-3.5 file:py-2 file:text-xs file:font-bold file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">
                          {isAr ? 'أو إدخال رابط الشعار المباشر:' : 'Or Enter Image URL:'}
                        </label>
                        <input
                          type="text"
                          value={brandForm.customLogoUrl || ''}
                          onChange={(e) => setBrandForm({ ...brandForm, customLogoUrl: e.target.value })}
                          placeholder={isAr ? 'https://example.com/logo.png' : 'https://example.com/logo.png'}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none"
                        />
                      </div>

                      {brandForm.customLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setBrandForm({ ...brandForm, customLogoUrl: '' })}
                          className="text-[11px] font-bold text-rose-600 hover:underline"
                        >
                          {isAr ? 'إزالة الشعار المخصص واستعادة الافتراضي' : 'Clear custom logo'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Primary Color */}
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {isAr ? 'اللون الرئيسي للواجهة والتطبيقات (Primary Brand Color)' : 'Primary Brand Color'}
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      {[
                        { name: 'Indigo Corporate', hex: '#4f46e5' },
                        { name: 'Deep Navy', hex: '#1e3a8a' },
                        { name: 'Emerald Green', hex: '#0f766e' },
                        { name: 'Amber Gold', hex: '#b45309' },
                        { name: 'Slate Luxury', hex: '#334155' },
                      ].map((color) => (
                        <button
                          key={color.hex}
                          type="button"
                          onClick={() => setBrandForm({ ...brandForm, primaryColor: color.hex })}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                            brandForm.primaryColor === color.hex
                              ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color.hex }} />
                          <span>{color.name}</span>
                        </button>
                      ))}
                      <input
                        type="color"
                        value={brandForm.primaryColor}
                        onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })}
                        className="h-8 w-10 cursor-pointer rounded-lg border border-slate-300 p-0.5"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SUBSECTION 3: HOMEPAGE TEXT & STATS */}
              {brandingSubSection === 'homepage' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80">
                    <h3 className="text-xs font-black text-slate-800 mb-1">
                      {isAr ? 'محتوى الصفحة الرئيسية والواجهة الترويجية' : 'Homepage Content & Hero Banner'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {isAr
                        ? 'تخصيص العناوين البارزة، شارة الترحيب، النص التعريفي، وأرقام الثقة في الصفحة العامة للموقع'
                        : 'Configure hero headlines, badge text, company description, and trust stats on landing page'}
                    </p>
                  </div>

                  {/* Badge Text */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'نص شارة الترحيب العلوية (عربي)' : 'Hero Badge Text (AR)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.homepageBadgeAr || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, homepageBadgeAr: e.target.value })}
                        placeholder={isAr ? 'المنظومة الرقمية الرائدة في توريد المواد الإنشائية' : 'Premier Heavy Transport & Quarry ERP'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'نص شارة الترحيب العلوية (إنجليزي)' : 'Hero Badge Text (EN)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.homepageBadgeEn || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, homepageBadgeEn: e.target.value })}
                        placeholder={isAr ? 'المنظومة الرقمية الرائدة' : 'Premier Heavy Transport & Quarry ERP'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Hero Title */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'العنوان الرئيسي للصفحة (عربي)' : 'Hero Main Headline (AR)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.homepageHeroTitleAr || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, homepageHeroTitleAr: e.target.value })}
                        placeholder={isAr ? 'الريادة في أسطول النقل الثقيل وتوريدات الكسارات والمشاريع' : 'Pioneering Heavy Transport Fleet & Quarry Material Supply'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'العنوان الرئيسي للصفحة (إنجليزي)' : 'Hero Main Headline (EN)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.homepageHeroTitleEn || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, homepageHeroTitleEn: e.target.value })}
                        placeholder={isAr ? 'الريادة في النقل الثقيل وتوريد المحاجر' : 'Pioneering Heavy Transport Fleet & Quarry Material Supply'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Hero Subtitle */}
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {isAr ? 'الوصف التعريفي للصفحة الرئيسية (عربي)' : 'Hero Subtitle Description (AR)'}
                    </label>
                    <textarea
                      rows={2}
                      value={brandForm.homepageHeroSubtitleAr || ''}
                      onChange={(e) => setBrandForm({ ...brandForm, homepageHeroSubtitleAr: e.target.value })}
                      placeholder={isAr ? 'تدير شركة ميون للمقاولات المحدودة دورة لوجستية متكاملة تشمل توريد الركام والدفان والبحص...' : 'Meayon Economic Contracting Co. Ltd. manages a complete end-to-end operational lifecycle...'}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {isAr ? 'الوصف التعريفي للصفحة الرئيسية (إنجليزي)' : 'Hero Subtitle Description (EN)'}
                    </label>
                    <textarea
                      rows={2}
                      value={brandForm.homepageHeroSubtitleEn || ''}
                      onChange={(e) => setBrandForm({ ...brandForm, homepageHeroSubtitleEn: e.target.value })}
                      placeholder={isAr ? 'تدير شركة ميون دورة لوجستية متكاملة...' : 'Meayon Economic Contracting Co. Ltd. manages a complete end-to-end operational lifecycle...'}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:bg-white focus:outline-none"
                    />
                  </div>

                  {/* Trust Stats Numbers */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'طن توريدات سنوياً (إحصائية)' : 'Annual Tonnage Metric'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.homepageAnnualTonnage || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, homepageAnnualTonnage: e.target.value })}
                        placeholder={isAr ? '+500,000' : '+500,000'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'عدد شاحنات الأسطول (إحصائية)' : 'Fleet Trucks Metric'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.homepageFleetCount || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, homepageFleetCount: e.target.value })}
                        placeholder={isAr ? '+120' : '+120'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'عدد الكسارات الشريكة (إحصائية)' : 'Partner Crushers Metric'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.homepageCrushersCount || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, homepageCrushersCount: e.target.value })}
                        placeholder={isAr ? '+25' : '+25'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* About / Vision 2030 section */}
                  <div className="pt-2 border-t border-slate-200/80">
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {isAr ? 'عنوان قسم الرؤية والحوكمة (عربي)' : 'Vision & Governance Title (AR)'}
                    </label>
                    <input
                      type="text"
                      value={brandForm.homepageAboutTitleAr || ''}
                      onChange={(e) => setBrandForm({ ...brandForm, homepageAboutTitleAr: e.target.value })}
                      placeholder={isAr ? 'حوكمة تشغيلية وأمان مالي رقمي بمقاييس عالمية' : 'Operational governance & digital financial security'}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {isAr ? 'نص قسم الرؤية والحوكمة (عربي)' : 'Vision & Governance Description (AR)'}
                    </label>
                    <textarea
                      rows={2}
                      value={brandForm.homepageAboutDescriptionAr || ''}
                      onChange={(e) => setBrandForm({ ...brandForm, homepageAboutDescriptionAr: e.target.value })}
                      placeholder={isAr ? 'تلتزم شركة ميون للمقاولات المحدودة بأعلى معايير الرقابة والشفافية عبر نظام سجلات التدقيق الشامل...' : 'Meayon adheres to the highest standards of governance and transparency via comprehensive audit logs...'}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* SUBSECTION 4: CONTACT & WORKING HOURS */}
              {brandingSubSection === 'contact' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80">
                    <h3 className="text-xs font-black text-slate-800 mb-1">
                      {isAr ? 'معلومات التواصل، العناوين، ومواعيد العمل' : 'Contact Details, Address & Hours'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {isAr
                        ? 'تظهر في تذييل الموقع، الفواتير الضريبية، ومستندات المطابقة'
                        : 'Displayed in footer, tax invoices, and verification documents'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'رقم الهاتف / الجوال المعتمد *' : 'Official Phone Number *'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.phone}
                        onChange={(e) => setBrandForm({ ...brandForm, phone: e.target.value })}
                        placeholder={isAr ? '+966 55 588 3321' : '+966 55 588 3321'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'البريد الإلكتروني الرسمي *' : 'Official Email Address *'}
                      </label>
                      <input
                        type="email"
                        value={brandForm.email}
                        onChange={(e) => setBrandForm({ ...brandForm, email: e.target.value })}
                        placeholder={isAr ? 'info@meayon.com' : 'info@meayon.com'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'العنوان الوطني / المقر الرئيسي (عربي)' : 'Headquarters Address (AR)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.addressAr}
                        onChange={(e) => setBrandForm({ ...brandForm, addressAr: e.target.value })}
                        placeholder={isAr ? 'الرياض - طريق الملك فهد - حي العليا' : 'Riyadh, King Fahd Rd, Olaya District'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'العنوان الوطني / المقر الرئيسي (إنجليزي)' : 'Headquarters Address (EN)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.addressEn}
                        onChange={(e) => setBrandForm({ ...brandForm, addressEn: e.target.value })}
                        placeholder={isAr ? 'الرياض - حي العليا' : 'Riyadh, King Fahd Rd, Olaya District'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'أوقات وساعات العمل (عربي)' : 'Working Hours (AR)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.workingHoursAr || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, workingHoursAr: e.target.value })}
                        placeholder={isAr ? 'السبت - الخميس: 7:00 ص - 6:00 م' : 'Sat - Thu: 7:00 AM - 6:00 PM'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'أوقات وساعات العمل (إنجليزي)' : 'Working Hours (EN)'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.workingHoursEn || ''}
                        onChange={(e) => setBrandForm({ ...brandForm, workingHoursEn: e.target.value })}
                        placeholder={isAr ? 'السبت - الخميس' : 'Sat - Thu: 7:00 AM - 6:00 PM'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SUBSECTION 5: BANKING & EXECUTIVE SIGNATURES */}
              {brandingSubSection === 'bank' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80">
                    <h3 className="text-xs font-black text-slate-800 mb-1">
                      {isAr ? 'الحساب البنكي، الختم الرسمي، والتوقيع المعتمد' : 'Banking, Seal & CEO Signature'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {isAr
                        ? 'تثبيت التوقيع والختم والحساب البنكي على الفواتير المعتمدة وسندات الصرف'
                        : 'Embed signatures, seals and IBAN on certified invoices'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'اسم البنك المعتمد' : 'Bank Name'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.bankNameAr}
                        onChange={(e) => setBrandForm({ ...brandForm, bankNameAr: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'الآيبان البنكي (IBAN)' : 'IBAN'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.iban}
                        onChange={(e) => setBrandForm({ ...brandForm, iban: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'اسم المدير التنفيذي (للتوقيع الرسمي)' : 'CEO Name'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.ceoNameAr}
                        onChange={(e) => setBrandForm({ ...brandForm, ceoNameAr: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        {isAr ? 'المسمى الوظيفي' : 'CEO Title'}
                      </label>
                      <input
                        type="text"
                        value={brandForm.ceoTitleAr}
                        onChange={(e) => setBrandForm({ ...brandForm, ceoTitleAr: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Signatures & Stamp Uploaders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="rounded-2xl border border-slate-200 p-3 bg-white space-y-2">
                      <label className="block text-xs font-bold text-slate-800">
                        {isAr ? 'رفع توقيع المدير التنفيذي (PNG شفاف):' : 'CEO Signature (Transparent PNG):'}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSignatureFileUpload}
                        className="block w-full text-[11px] text-slate-500 file:me-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:font-bold file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-3 bg-white space-y-2">
                      <label className="block text-xs font-bold text-slate-800">
                        {isAr ? 'رفع ختم الشركة الرسمي (PNG شفاف):' : 'Company Seal / Stamp (Transparent PNG):'}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleStampFileUpload}
                        className="block w-full text-[11px] text-slate-500 file:me-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:font-bold file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    resetBrandConfig();
                    setBrandForm(brandConfig);
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{isAr ? 'استعادة الهوية الافتراضية' : 'Reset to Default'}</span>
                </button>

                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-slate-800 transition-colors"
                >
                  <Save className="h-4 w-4 text-emerald-400" />
                  <span>{isAr ? 'حفظ وتطبيق الهوية فوراً' : 'Save & Apply Brand'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Live Document & Branding Preview Simulator (1 Col) */}
          <div className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {isAr ? 'معاينة حية للهوية وترويسة الفاتورة' : 'Live Brand & Invoice Header Preview'}
            </h3>

            {/* Simulated Live Invoice Header */}
            <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h4 className="text-xs font-black text-slate-900">{brandForm.companyNameAr}</h4>
                  <p className="text-[10px] font-bold text-orange-700 uppercase">{brandForm.companyNameEn}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">س.ت: {brandForm.crNumber} | الرقم الضريبي: {brandForm.taxNumber}</p>
                </div>
                {brandForm.customLogoUrl ? (
                  <img
                    src={brandForm.customLogoUrl}
                    alt="Logo"
                    className="h-10 w-auto max-w-[80px] object-contain"
                  />
                ) : (
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-xs"
                    style={{ backgroundColor: brandForm.primaryColor }}
                  >
                    M
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-slate-50 p-2.5 text-[10px] space-y-1">
                <p>
                  <span className="text-slate-500">{isAr ? 'الحساب البنكي:' : 'Bank:'}</span> {brandForm.bankNameAr}
                </p>
                <p className="font-mono text-slate-800 font-bold">{brandForm.iban}</p>
                <p className="text-slate-500">{brandForm.phone} • {brandForm.email}</p>
              </div>

              <div className="border-t pt-2 flex items-center justify-between text-[10px] text-slate-600">
                <span>{brandForm.ceoNameAr} ({brandForm.ceoTitleAr})</span>
                <span className="font-bold text-orange-950">{isAr ? 'معتمد ورسمي' : 'Official'}</span>
              </div>
            </div>

            {/* Homepage Live Badge & Hero Preview Box */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-xs text-white space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-orange-400">
                {isAr ? 'معاينة الواجهة الرئيسية' : 'Homepage Live Snippet'}
              </div>
              <div className="inline-block rounded-full bg-neutral-950 border border-orange-500/30 px-2 py-0.5 text-[9px] text-orange-300 font-bold">
                {brandForm.homepageBadgeAr || 'المنظومة الرقمية الرائدة'}
              </div>
              <div className="text-xs font-black text-white line-clamp-2">
                {brandForm.homepageHeroTitleAr || brandForm.companyNameAr}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center text-[10px]">
                <div>
                  <div className="font-mono font-black text-white">{brandForm.homepageAnnualTonnage || '+500k'}</div>
                  <div className="text-[8px] text-slate-400">{isAr ? 'طن' : 'Tons'}</div>
                </div>
                <div>
                  <div className="font-mono font-black text-orange-400">{brandForm.homepageFleetCount || '+120'}</div>
                  <div className="text-[8px] text-slate-400">{isAr ? 'شاحنة' : 'Fleet'}</div>
                </div>
                <div>
                  <div className="font-mono font-black text-emerald-400">{brandForm.homepageCrushersCount || '+25'}</div>
                  <div className="text-[8px] text-slate-400">{isAr ? 'كسارة' : 'Crushers'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: AUDIT TRAIL LOGS                                  */}
      {/* ======================================================== */}
      {activeTab === 'audit-trail' && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-black text-slate-900">
                {isAr ? 'سجل التدقيق الشامل والامتثال (Comprehensive Audit Trail)' : 'Comprehensive Audit Trail'}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'سجل غير قابل للتعديل يوثق كافة حركات الإنشاء، التعديل، الحذف، التوقيع، ومحاولات تجاوز قاعدة البيانات'
                  : 'Immutable ledger logging every system event, signature, and database override with user and IP tagging'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-400 rtl:right-3 rtl:left-auto" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث في السجل...' : 'Search logs...'}
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>

              {/* Action Filter */}
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none"
              >
                <option value="ALL">{isAr ? 'كافة العمليات' : 'All Actions'}</option>
                <option value="CREATE">CREATE (إنشاء)</option>
                <option value="UPDATE">UPDATE (تعديل)</option>
                <option value="APPROVE">APPROVE (اعتماد)</option>
                <option value="REJECT">REJECT (رفض)</option>
                <option value="SIGN">SIGN (توقيع)</option>
                <option value="OVERRIDE_DB">OVERRIDE (تجاوز)</option>
                <option value="SOFT_DELETE">SOFT_DELETE (أرشفة)</option>
                <option value="RESTORE">RESTORE (استعادة)</option>
              </select>

              <button
                onClick={clearAuditLogs}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{isAr ? 'مسح السجلات' : 'Clear Logs'}</span>
              </button>
            </div>
          </div>

          {/* Audit Logs List */}
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {filteredAuditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                {isAr ? 'لا توجد سجلات تطابق معايير البحث' : 'No audit records match filters'}
              </div>
            ) : (
              filteredAuditLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-slate-50/80 transition-colors">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-mono font-bold ${
                          log.action === 'CREATE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : log.action === 'SIGN'
                            ? 'bg-amber-50 text-purple-700 border border-amber-200'
                            : log.action === 'OVERRIDE_DB'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : log.action === 'APPROVE'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {log.action}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{log.summary}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {log.userName} ({log.userRole}) - {formatDate(log.timestamp)} - <span className="font-mono">{log.ipAddress}</span>
                        </p>
                      </div>
                    </div>

                    {(log.oldData || log.newData) && (
                      <button
                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                        className="text-xs font-bold text-orange-600 hover:underline shrink-0"
                      >
                        {expandedLogId === log.id ? (isAr ? 'إخفاء التفاصيل' : 'Hide Diff') : (isAr ? 'عرض الفروقات' : 'View Diff')}
                      </button>
                    )}
                  </div>

                  {expandedLogId === log.id && (
                    <div className="mt-3 rounded-xl bg-slate-900 p-3 text-[11px] font-mono text-slate-200 overflow-x-auto">
                      <pre>{JSON.stringify({ old: log.oldData, new: log.newData }, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: RECYCLE BIN & SOFT-DELETED ARCHIVE                */}
      {/* ======================================================== */}
      {activeTab === 'recycle-bin' && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-black text-slate-900">
                {isAr ? 'سلة المحذوفات والمحفوظات المؤرشفة (Soft-Delete Archive)' : 'Recycle Bin & Soft-Deleted Records'}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'السجلات المحذوفة تظل محفوظة بأمان ولا يتم فقدانها، ويمكن استعادتها بضغطة زر واحدة'
                  : 'Soft-deleted records are safely preserved and can be restored at any time'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'operations', labelAr: `تذاكر الميزان (${softDeletedOperations.length})`, labelEn: `Operations (${softDeletedOperations.length})` },
                { id: 'customers', labelAr: `العملاء (${softDeletedCustomers.length})`, labelEn: `Clients (${softDeletedCustomers.length})` },
                { id: 'crushers', labelAr: `الكسارات (${softDeletedCrushers.length})`, labelEn: `Crushers (${softDeletedCrushers.length})` },
                { id: 'transporters', labelAr: `الناقلين (${softDeletedTransporters.length})`, labelEn: `Transporters (${softDeletedTransporters.length})` },
                { id: 'materials', labelAr: `المواد (${softDeletedMaterials.length})`, labelEn: `Materials (${softDeletedMaterials.length})` },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setRecycleCategory(cat.id as any)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    recycleCategory === cat.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {isAr ? cat.labelAr : cat.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Render Active Category List */}
          {recycleCategory === 'operations' && (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {softDeletedOperations.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {isAr ? 'سلة محذوفات العمليات فارغة' : 'No deleted operations'}
                </div>
              ) : (
                softDeletedOperations.map((op) => (
                  <div key={op.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{op.scale_ticket_no}</span>
                        <span className="text-xs font-bold text-slate-700">({op.truck_no})</span>
                        <span className="text-xs text-slate-500">{op.destination_customer}</span>
                      </div>
                      <p className="text-[11px] text-rose-600 mt-0.5">
                        {isAr ? 'تم الحذف في:' : 'Deleted at:'} {formatDate(op.deleted_at || '')} - {op.deleted_by}
                      </p>
                    </div>

                    <button
                      onClick={() => restoreOperation(op.id)}
                      className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 shadow-2xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{isAr ? 'استعادة السجل' : 'Restore'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {recycleCategory === 'customers' && (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {softDeletedCustomers.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {isAr ? 'سلة محذوفات العملاء فارغة' : 'No deleted customers'}
                </div>
              ) : (
                softDeletedCustomers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{c.customerName}</h4>
                      <p className="text-[11px] text-slate-500">{c.taxNumber} - {c.phone}</p>
                    </div>
                    <button
                      onClick={() => restoreCustomer(c.id)}
                      className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{isAr ? 'استعادة العميل' : 'Restore'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {recycleCategory === 'crushers' && (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {softDeletedCrushers.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {isAr ? 'سلة محذوفات الكسارات فارغة' : 'No deleted crushers'}
                </div>
              ) : (
                softDeletedCrushers.map((cr) => (
                  <div key={cr.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{cr.crusherName}</h4>
                      <p className="text-[11px] text-slate-500">{cr.location}</p>
                    </div>
                    <button
                      onClick={() => restoreCrusher(cr.id)}
                      className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{isAr ? 'استعادة الكسارة' : 'Restore'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {recycleCategory === 'transporters' && (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {softDeletedTransporters.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {isAr ? 'سلة محذوفات الناقلين فارغة' : 'No deleted transporters'}
                </div>
              ) : (
                softDeletedTransporters.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{t.transporterName}</h4>
                      <p className="text-[11px] text-slate-500">{t.driverName} ({t.defaultTruckNo})</p>
                    </div>
                    <button
                      onClick={() => restoreTransporter(t.id)}
                      className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{isAr ? 'استعادة الناقل' : 'Restore'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {recycleCategory === 'materials' && (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {softDeletedMaterials.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {isAr ? 'سلة محذوفات المواد فارغة' : 'No deleted materials'}
                </div>
              ) : (
                softDeletedMaterials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{m.nameAr}</h4>
                      <p className="text-[11px] text-slate-500">{m.category}</p>
                    </div>
                    <button
                      onClick={() => restoreMaterial(m.id)}
                      className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{isAr ? 'استعادة المادة' : 'Restore'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Legacy System Resource Data Bridge Modal (Sprint 7) */}
      <ImportSystemResourceModal
        isOpen={isLegacyImportOpen}
        onClose={() => setIsLegacyImportOpen(false)}
      />
    </div>
  );
};
