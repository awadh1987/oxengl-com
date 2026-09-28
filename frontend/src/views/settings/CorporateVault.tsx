import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileCheck2,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Download,
  Printer,
  Upload,
  Plus,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Trash2,
  Edit3,
  Calendar,
  Building2,
  ExternalLink,
  ChevronRight,
  Info,
  Layers,
  Award,
  BadgeCheck,
  Check,
  X,
  FileCode,
  Eye,
  Truck,
  Landmark,
  HardHat,
} from 'lucide-react';
import { HoverIcon } from '../../components/common/HoverIcon';
import { useApp } from '../../context/AppContext';
import {
  erpApi,
  TenantDocumentRecord,
  CreateTenantDocumentPayload,
  UpdateTenantDocumentPayload,
  getAuthToken,
  getActiveCompanyId,
  getTenantSlug,
} from '../../services/api';

// Canonical Document Types matching Enterprise / Global Prequalification Standard
const DOCUMENT_TYPES = [
  // Pillar 1: Legal Documents
  { value: 'CR', labelEn: 'Commercial Registration (CR)', labelAr: 'السجل التجاري' },
  { value: 'TAX_VAT', labelEn: 'ZATCA Tax / VAT Certificate', labelAr: 'شهادة ضريبة القيمة المضافة (زكاة)' },
  { value: 'GOSI', labelEn: 'GOSI Saudization Certificate', labelAr: 'شهادة التأمينات الاجتماعية ونسب التوطين' },
  { value: 'CHAMBER_COMMERCE', labelEn: 'Chamber of Commerce Membership', labelAr: 'اشتراك الغرفة التجارية' },
  { value: 'MUNICIPAL_LICENSE', labelEn: 'Municipal Operating License', labelAr: 'رخصة البلدية التشغيلية' },
  { value: 'CIVIL_DEFENSE', labelEn: 'Civil Defense Safety License', labelAr: 'رخصة السلامة من الدفاع المدني' },
  { value: 'ARTICLES_OF_ASSOCIATION', labelEn: 'Articles of Association & Bylaws', labelAr: 'عقد التأسيس والملفات القانونية' },
  // Pillar 4: Quality Requirements
  { value: 'ISO_9001', labelEn: 'ISO 9001:2015 Quality System', labelAr: 'شهادة الجودة آيزو 9001' },
  { value: 'QA_QC_PROCEDURES', labelEn: 'QA/QC Manual & Inspection Procedures', labelAr: 'إجراءات وضوابط ضبط الجودة (QA/QC)' },
  // Pillar 5: HSE Requirements
  { value: 'ISO_45001', labelEn: 'ISO 45001 Health & Safety System', labelAr: 'شهادة السلامة والصحة المهنية آيزو 45001' },
  { value: 'ISO_14001', labelEn: 'ISO 14001 Environmental Management', labelAr: 'شهادة الإدارة البيئية آيزو 14001' },
  { value: 'HSE_MANUAL', labelEn: 'Corporate HSE Manual & Emergency Plan', labelAr: 'دليل السلامة والصحة المهنية والبيئة (HSE)' },
  { value: 'HSE_STATISTICS', labelEn: 'HSE Incident & Safety Statistics (LTIFR)', labelAr: 'إحصائيات وسجلات السلامة المهنية' },
  // Pillar 6: Financial Requirements
  { value: 'AUDITED_FINANCIALS', labelEn: 'Audited Financial Statement (CPA)', labelAr: 'القوائم المالية المدققة' },
  { value: 'BANK_REFERENCE', labelEn: 'Bank Reference & Solvency Letter', labelAr: 'شهادة الملاءة والخطاب البنكي' },
  { value: 'INSURANCE_POLICY', labelEn: 'Corporate Comprehensive Insurance', labelAr: 'وثيقة التأمين الشامل للمنشأة' },
  { value: 'OTHER', labelEn: 'Other Supporting Document', labelAr: 'وثيقة نظامية داعمة أخرى' },
];

export const CorporateVault: React.FC = () => {
  const { language, themeMode, currentCompany, currentUser, showToast } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const isSuperAdmin = currentUser?.role === 'Super_Admin';
  const isAdmin = currentUser?.role === 'Admin' || isSuperAdmin;
  const canMutate = isAdmin || currentUser?.role === 'COO' || currentUser?.role === 'Accountant' || currentUser?.role === 'Data_Entry';

  // State
  const [documents, setDocuments] = useState<TenantDocumentRecord[]>([]);
  const [cvPayload, setCvPayload] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [includeBranches, setIncludeBranches] = useState<boolean>(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [pillarFilter, setPillarFilter] = useState<'ALL' | 'LEGAL' | 'COMPANY' | 'TECHNICAL' | 'QUALITY' | 'HSE' | 'FINANCIAL'>('ALL');

  // Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [editingDoc, setEditingDoc] = useState<TenantDocumentRecord | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<TenantDocumentRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State for Upload
  const [uploadForm, setUploadForm] = useState<CreateTenantDocumentPayload>({
    document_type: 'CR',
    title: '',
    file_path: '',
    file_name: '',
    file_size_bytes: 0,
    mime_type: 'application/pdf',
    issuing_authority: '',
    document_number: '',
    issue_date: '',
    expiry_date: '',
    notes: '',
  });

  // Form State for Edit
  const [editForm, setEditForm] = useState<UpdateTenantDocumentPayload>({
    title: '',
    document_type: '',
    document_number: '',
    issuing_authority: '',
    issue_date: '',
    expiry_date: '',
    verification_status: 'UNVERIFIED',
    notes: '',
  });

  // Selected file preview for upload
  const [stagedFile, setStagedFile] = useState<File | null>(null);

  // 1. Fetch Corporate CV payload and documents
  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const activeCid = currentCompany?.id;
      const [docsResponse, payloadResponse] = await Promise.all([
        erpApi.getCorporateDocuments({ companyId: activeCid }, activeCid),
        erpApi.getCorporateCvPayload(activeCid, includeBranches),
      ]);

      setDocuments(docsResponse || []);
      setCvPayload(payloadResponse || null);
    } catch (err: any) {
      console.error('Failed to load corporate vault telemetry:', err);
      showToast(
        isAr ? `فشل تحميل وثائق الامتثال: ${err.message}` : `Failed to load corporate documents: ${err.message}`,
        'error'
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentCompany?.id, includeBranches, isAr, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. Generate and Download / Preview Enterprise Profile PDF
  const handleGeneratePdf = async (preview: boolean = true) => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    try {
      const token = getAuthToken();
      const activeTenantSlug = getTenantSlug();
      const activeCompanyId = getActiveCompanyId(currentCompany?.id);

      const queryParams = new URLSearchParams({
        include_branches: String(includeBranches),
        preview: String(preview),
      });
      if (activeCompanyId) {
        queryParams.append('company_id', activeCompanyId);
      }

      const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(activeTenantSlug ? { 'X-Tenant-Slug': activeTenantSlug } : {}),
        ...(activeCompanyId ? { 'X-Company-ID': activeCompanyId, 'X-Tenant-ID': activeCompanyId } : {}),
      };

      const url = `/api/v1/corporate/cv-download?${queryParams.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        let errText = '';
        try {
          const errJson = await response.json();
          errText = errJson.detail || errJson.message || response.statusText;
        } catch {
          errText = `HTTP ${response.status} ${response.statusText}`;
        }
        throw new Error(errText);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      if (preview) {
        // Open PDF viewer in new browser tab
        window.open(blobUrl, '_blank');
        showToast(
          isAr ? 'تم إنشاء الملف المؤسسي الموحد (Enterprise Profile) بنجاح!' : 'Enterprise Profile PDF generated successfully!',
          'success'
        );
      } else {
        // Download directly to disk
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `Corporate_Profile_${currentCompany?.name || 'Company'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(
          isAr ? 'تم بدء تنزيل الملف المطبوع بنجاح.' : 'File download started.',
          'success'
        );
      }

      // Cleanup blob url after 60 seconds
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err: any) {
      console.error('Failed to generate corporate CV PDF:', err);
      showToast(
        isAr ? `فشل تصدير الملف المؤسسي: ${err.message}` : `Failed to generate Enterprise Profile PDF: ${err.message}`,
        'error'
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 3. File staging handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setStagedFile(file);
      setUploadForm((prev) => ({
        ...prev,
        file_name: file.name,
        file_path: `vault/${currentCompany?.id || 'default'}/${Date.now()}_${file.name}`,
        file_size_bytes: file.size,
        mime_type: file.type || 'application/pdf',
        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
      }));
    }
  };

  // 4. Submit new document to vault
  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.title || !uploadForm.document_type) {
      showToast(isAr ? 'يرجى إدخال عنوان الوثيقة وتصنيفها.' : 'Please enter document title and category.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateTenantDocumentPayload = {
        ...uploadForm,
        file_name: uploadForm.file_name || 'document.pdf',
        file_path: uploadForm.file_path || `vault/${currentCompany?.id || 'default'}/${Date.now()}_doc.pdf`,
        company_id: currentCompany?.id,
        issue_date: uploadForm.issue_date ? new Date(uploadForm.issue_date).toISOString() : null,
        expiry_date: uploadForm.expiry_date ? new Date(uploadForm.expiry_date).toISOString() : null,
      };

      await erpApi.createCorporateDocument(payload, currentCompany?.id);
      showToast(isAr ? 'تمت إضافة الوثيقة إلى الخزينة بنجاح!' : 'Document registered in vault successfully!', 'success');
      setIsUploadModalOpen(false);
      setStagedFile(null);
      setUploadForm({
        document_type: 'CR',
        title: '',
        file_path: '',
        file_name: '',
        file_size_bytes: 0,
        mime_type: 'application/pdf',
        issuing_authority: '',
        document_number: '',
        issue_date: '',
        expiry_date: '',
        notes: '',
      });
      loadData(true);
    } catch (err: any) {
      showToast(isAr ? `فشل حفظ الوثيقة: ${err.message}` : `Failed to save document: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Open Edit modal
  const openEditModal = (doc: TenantDocumentRecord) => {
    setEditingDoc(doc);
    setEditForm({
      title: doc.title,
      document_type: doc.document_type,
      document_number: doc.document_number || '',
      issuing_authority: doc.issuing_authority || '',
      issue_date: doc.issue_date ? doc.issue_date.split('T')[0] : '',
      expiry_date: doc.expiry_date ? doc.expiry_date.split('T')[0] : '',
      verification_status: doc.verification_status,
      notes: doc.notes || '',
    });
  };

  // 6. Submit Update
  const handleUpdateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;

    setIsSubmitting(true);
    try {
      const payload: UpdateTenantDocumentPayload = {
        ...editForm,
        issue_date: editForm.issue_date ? new Date(editForm.issue_date).toISOString() : null,
        expiry_date: editForm.expiry_date ? new Date(editForm.expiry_date).toISOString() : null,
      };

      await erpApi.updateCorporateDocument(editingDoc.id, payload, currentCompany?.id);
      showToast(isAr ? 'تم تحديث بيانات الوثيقة بنجاح.' : 'Document updated successfully.', 'success');
      setEditingDoc(null);
      loadData(true);
    } catch (err: any) {
      showToast(isAr ? `فشل تعديل الوثيقة: ${err.message}` : `Failed to update document: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. Quick Verify Toggle
  const handleQuickVerify = async (doc: TenantDocumentRecord, newStatus: 'VERIFIED' | 'UNVERIFIED' | 'REJECTED') => {
    if (!isAdmin) {
      showToast(isAr ? 'تتطلب هذه العملية صلاحيات إدارية.' : 'Administrative privileges required.', 'warning');
      return;
    }

    try {
      await erpApi.updateCorporateDocument(doc.id, { verification_status: newStatus }, currentCompany?.id);
      showToast(
        isAr ? `تم تحديث حالة الوثيقة إلى ${newStatus}` : `Document status updated to ${newStatus}`,
        'success'
      );
      loadData(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 8. Delete document
  const handleDeleteDocument = async () => {
    if (!deletingDoc) return;

    setIsSubmitting(true);
    try {
      await erpApi.deleteCorporateDocument(deletingDoc.id, currentCompany?.id);
      showToast(isAr ? 'تم حذف الوثيقة من الخزينة.' : 'Document deleted from vault.', 'success');
      setDeletingDoc(null);
      loadData(true);
    } catch (err: any) {
      showToast(isAr ? `فشل الحذف: ${err.message}` : `Deletion failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered documents calculation
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        !searchTerm ||
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc.document_number && doc.document_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (doc.issuing_authority && doc.issuing_authority.toLowerCase().includes(searchTerm.toLowerCase())) ||
        doc.document_type.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = typeFilter === 'ALL' || doc.document_type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || doc.verification_status === statusFilter;

      let matchesPillar = true;
      if (pillarFilter !== 'ALL') {
        const type = doc.document_type.toUpperCase();
        if (pillarFilter === 'LEGAL') {
          matchesPillar = ['CR', 'COMMERCIAL_REGISTRATION', 'TRADE_LICENSE', 'TAX_VAT', 'VAT_CERTIFICATE', 'ZATCA', 'GOSI', 'SAUDIZATION', 'CHAMBER_COMMERCE', 'MUNICIPAL_LICENSE', 'CIVIL_DEFENSE', 'ARTICLES_OF_ASSOCIATION'].includes(type);
        } else if (pillarFilter === 'COMPANY') {
          matchesPillar = ['ARTICLES_OF_ASSOCIATION', 'COMPANY_BYLAWS', 'LEGAL_DEED', 'OTHER'].includes(type);
        } else if (pillarFilter === 'TECHNICAL') {
          matchesPillar = ['FLEET', 'EQUIPMENT', 'TECHNICAL', 'CALIBRATION'].includes(type);
        } else if (pillarFilter === 'QUALITY') {
          matchesPillar = ['ISO_9001', 'QA_QC_PROCEDURES', 'QUALITY_MANUAL', 'QUALITY_POLICY'].includes(type) || type.startsWith('ISO');
        } else if (pillarFilter === 'HSE') {
          matchesPillar = ['ISO_45001', 'ISO_14001', 'HSE_MANUAL', 'SAFETY_MANUAL', 'HSE_STATISTICS', 'SAFETY_STATISTICS'].includes(type);
        } else if (pillarFilter === 'FINANCIAL') {
          matchesPillar = ['AUDITED_FINANCIALS', 'AUDITED_STATEMENTS', 'BANK_REFERENCE', 'SOLVENCY_LETTER', 'INSURANCE_POLICY'].includes(type);
        }
      }

      return matchesSearch && matchesType && matchesStatus && matchesPillar;
    });
  }, [documents, searchTerm, typeFilter, statusFilter, pillarFilter]);

  // Statistics
  const totalCount = documents.length;
  const verifiedCount = documents.filter((d) => d.verification_status === 'VERIFIED').length;
  const unverifiedCount = documents.filter((d) => d.verification_status === 'UNVERIFIED').length;
  const expiredCount = documents.filter((d) => {
    if (d.verification_status === 'EXPIRED') return true;
    if (d.expiry_date) {
      return new Date(d.expiry_date) < new Date();
    }
    return false;
  }).length;

  const readinessScore = cvPayload?.meta?.compliance_score_percent ?? (totalCount > 0 ? Math.round((verifiedCount / Math.max(5, totalCount)) * 100) : 0);
  const complianceRating = cvPayload?.meta?.compliance_rating ?? (readinessScore >= 80 ? 'COMPLIANT' : readinessScore >= 40 ? 'PARTIAL' : 'ACTION_REQUIRED');

  // Mandatory Checklist Matrix
  const mandatoryChecklist = cvPayload?.compliance_vault?.mandatory_checklist || {
    commercial_registration: {
      verified: Boolean(currentCompany?.commercialRegistration || (currentCompany as any)?.commercial_registration),
      present: Boolean(currentCompany?.commercialRegistration || (currentCompany as any)?.commercial_registration),
    },
    zatca_tax_vat: {
      verified: Boolean(currentCompany?.taxId || (currentCompany as any)?.tax_id),
      present: Boolean(currentCompany?.taxId || (currentCompany as any)?.tax_id),
    },
    gosi_saudization: { verified: documents.some((d) => (d.document_type === 'GOSI' || d.document_type === 'SAUDIZATION') && d.verification_status === 'VERIFIED') },
    chamber_of_commerce: { verified: documents.some((d) => d.document_type === 'CHAMBER_COMMERCE' && d.verification_status === 'VERIFIED') },
    municipal_civil_defense: { verified: documents.some((d) => (d.document_type === 'MUNICIPAL_LICENSE' || d.document_type === 'CIVIL_DEFENSE') && d.verification_status === 'VERIFIED') },
    articles_of_association: { verified: documents.some((d) => (d.document_type === 'ARTICLES_OF_ASSOCIATION' || d.document_type === 'COMPANY_BYLAWS') && d.verification_status === 'VERIFIED') },
    iso_certifications: { verified: documents.some((d) => d.document_type.startsWith('ISO') && d.verification_status === 'VERIFIED') },
    iso_9001: { verified: documents.some((d) => (d.document_type === 'ISO_9001' || d.document_type === 'QA_QC_PROCEDURES') && d.verification_status === 'VERIFIED') },
    qa_qc_procedures: { verified: documents.some((d) => (d.document_type === 'QA_QC_PROCEDURES' || d.document_type === 'QUALITY_MANUAL') && d.verification_status === 'VERIFIED') },
    iso_45001: { verified: documents.some((d) => (d.document_type === 'ISO_45001' || d.document_type === 'HSE_MANUAL') && d.verification_status === 'VERIFIED') },
    hse_manual: { verified: documents.some((d) => (d.document_type === 'HSE_MANUAL' || d.document_type === 'SAFETY_MANUAL') && d.verification_status === 'VERIFIED') },
    hse_statistics: { verified: documents.some((d) => (d.document_type === 'HSE_STATISTICS' || d.document_type === 'SAFETY_STATISTICS') && d.verification_status === 'VERIFIED') },
    audited_financials: { verified: documents.some((d) => (d.document_type === 'AUDITED_FINANCIALS' || d.document_type === 'AUDITED_STATEMENTS') && d.verification_status === 'VERIFIED') },
    bank_reference: { verified: documents.some((d) => (d.document_type === 'BANK_REFERENCE' || d.document_type === 'SOLVENCY_LETTER') && d.verification_status === 'VERIFIED') },
  };

  return (
    <div className={`px-3 sm:px-4 md:px-6 py-2 md:py-3 space-y-2 w-full max-w-7xl mx-auto font-sans min-h-dvh erp-viewport-root ${isAr ? 'text-right' : 'text-left'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* ==================================================================== */}
      {/* TOP HERO & PROMINENT ENTERPRISE CV ACTION BANNER */}
      {/* ==================================================================== */}
      <div className={`rounded-xl border p-2.5 md:p-3 relative overflow-hidden shadow-xs ${
        isDark
          ? 'bg-gradient-to-br from-slate-900 via-slate-900/90 to-sky-950/40 border-slate-800'
          : 'bg-gradient-to-br from-white via-sky-50/50 to-blue-50/30 border-sky-200'
      }`}>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="space-y-1 max-w-3xl">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20 whitespace-nowrap shrink-0">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                {isAr ? 'معيار التأهيل المعتمد / GLOBAL-STD-2026.1 / ISO-21500' : 'Enterprise Prequalification Standard / GLOBAL-STD-2026.1 / ISO-21500'}
              </span>

              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shrink-0 ${
                complianceRating === 'COMPLIANT'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : complianceRating === 'PARTIAL'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  complianceRating === 'COMPLIANT' ? 'bg-emerald-400 animate-pulse' : complianceRating === 'PARTIAL' ? 'bg-amber-400' : 'bg-rose-400'
                }`} />
                <span>
                  {isAr
                    ? complianceRating === 'COMPLIANT' ? 'مطابق ومؤهل للمناقصات' : complianceRating === 'PARTIAL' ? 'مؤهل جزئياً' : 'يتطلب إجراءات نظامية'
                    : complianceRating}
                </span>
              </span>

              <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                {isAr ? `جاهزية التأهيل: ${readinessScore}%` : `Readiness: ${readinessScore}%`}
              </span>
            </div>

            <h1 className={`text-base md:text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {isAr ? 'ملف المنشأة وخزينة وثائق الامتثال المعتمدة' : 'Corporate Profile & Document Vault (Enterprise Standard)'}
            </h1>

            <p className={`text-[11px] leading-relaxed line-clamp-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {isAr
                ? 'مركز إدارة الوثائق القانونية والتراخيص وتوليد السيرة الذاتية المؤسسية للمناقصات والمشتريات الدولية بصيغة PDF.'
                : 'Central repository for statutory licenses, regulatory filings, and compilation of official Corporate CV dossier.'}
            </p>

            {/* Multi-Branch Aggregation Switch */}
            <div className="pt-0.5 flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-[10.5px] font-medium text-slate-400 hover:text-slate-300">
                <input
                  type="checkbox"
                  checked={includeBranches}
                  onChange={(e) => setIncludeBranches(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
                />
                <Layers className="w-3 h-3 text-sky-400" />
                <span>
                  {isAr
                    ? 'تضمين بيانات الفروع والمعدات والمواقع في التقرير الموحد'
                    : 'Aggregate all subsidiary branches, fleet units & regional sites'}
                </span>
              </label>
            </div>
          </div>

          {/* Action Buttons with PROMINENT CORPORATE CV BUTTON */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Primary Generate PDF Button */}
            <button
              onClick={() => handleGeneratePdf(true)}
              disabled={isGeneratingPdf}
              className={`relative group overflow-hidden px-3.5 py-1.5 rounded-lg font-bold text-xs tracking-wide text-white transition-all shadow-sm flex items-center justify-center gap-2 ${
                isGeneratingPdf
                  ? 'bg-slate-700 cursor-not-allowed opacity-80'
                  : 'bg-gradient-to-r from-sky-600 to-indigo-700 hover:from-sky-500 hover:to-indigo-600 shadow-sky-600/20 active:scale-[0.98]'
              }`}
              title={isAr ? 'عرض وتحميل الملف المؤسسي بصيغة PDF' : 'Open Corporate Profile PDF'}
            >
              {isGeneratingPdf ? (
                <>
                  <HoverIcon className="w-3.5 h-3.5">
                    <RefreshCw className="h-full w-full animate-spin" />
                  </HoverIcon>
                  <span>{isAr ? 'جاري التجميع...' : 'Compiling...'}</span>
                </>
              ) : (
                <>
                  <HoverIcon className="w-3.5 h-3.5">
                    <Award className="h-full w-full text-amber-300" />
                  </HoverIcon>
                  <span>{isAr ? 'توليد الملف المؤسسي (Enterprise Profile)' : 'Generate Corporate Profile (Enterprise)'}</span>
                  <HoverIcon className="w-3 h-3 opacity-70 group-hover:opacity-100">
                    <Download className="h-full w-full" />
                  </HoverIcon>
                </>
              )}
            </button>

            {/* Direct Download Option */}
            <button
              onClick={() => handleGeneratePdf(false)}
              disabled={isGeneratingPdf}
              className={`group p-1.5 rounded-lg border transition-all flex items-center justify-center ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-300 hover:text-white'
                  : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
              }`}
              title={isAr ? 'تحميل مباشر كملف PDF' : 'Download file directly'}
            >
              <HoverIcon className="w-3.5 h-3.5">
                <FileText className="h-full w-full" />
              </HoverIcon>
            </button>

            {/* Register Document Button */}
            {canMutate && (
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="group px-2.5 py-1.5 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <HoverIcon className="w-3.5 h-3.5">
                  <Plus className="h-full w-full" />
                </HoverIcon>
                <span>{isAr ? 'تسجيل وثيقة' : 'Register Document'}</span>
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className={`group p-1.5 rounded-lg border transition-all ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-300'
                  : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
              }`}
              title={isAr ? 'تحديث البيانات' : 'Refresh'}
            >
              <HoverIcon className="w-3.5 h-3.5">
                <RefreshCw className={`h-full w-full ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
              </HoverIcon>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* COMPLIANCE TELEMETRY KPI METRICS CARDS */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
        {/* Total Documents */}
        <div className={`p-2 rounded-lg border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">{isAr ? 'إجمالي الوثائق' : 'Total Documents'}</span>
            <FileText className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-lg font-black text-slate-100 font-mono">
            {isLoading ? '...' : totalCount}
          </div>
          <div className="text-[9.5px] text-slate-500">
            {isAr ? 'في الخزينة المؤسسية' : 'Stored in secure vault'}
          </div>
        </div>

        {/* Verified Documents */}
        <div className={`p-2 rounded-lg border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">{isAr ? 'وثائق معتمدة' : 'Verified Documents'}</span>
            <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-black text-emerald-400 font-mono">
            {isLoading ? '...' : verifiedCount}
          </div>
          <div className="text-[9.5px] text-emerald-500/80">
            {totalCount > 0 ? `${Math.round((verifiedCount / totalCount) * 100)}% ${isAr ? 'معدل الاعتماد' : 'Verified'}` : '0%'}
          </div>
        </div>

        {/* Unverified / Pending */}
        <div className={`p-2 rounded-lg border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">{isAr ? 'قيد المراجعة' : 'Pending Review'}</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-black text-amber-400 font-mono">
            {isLoading ? '...' : unverifiedCount}
          </div>
          <div className="text-[9.5px] text-amber-500/80">
            {isAr ? 'بانتظار تدقيق المسؤول' : 'Awaiting check'}
          </div>
        </div>

        {/* Readiness Score */}
        <div className={`p-2 rounded-lg border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">{isAr ? 'جاهزية التأهيل المؤسسي' : 'Enterprise Readiness'}</span>
            <Award className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-lg font-black text-sky-400 font-mono">
            {readinessScore}%
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                readinessScore >= 80 ? 'bg-emerald-500' : readinessScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, readinessScore)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* STANDARDIZED PREQUALIFICATION CHECKLIST MATRIX (6-Pillar High-Density Strip) */}
      {/* ==================================================================== */}
      <div className={`p-2 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'}`}>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
            <h2 className="text-xs font-bold text-slate-200">
              {isAr ? 'مصفوفة ركائز التأهيل المسبق المعتمدة (6 ركائز)' : 'Standard Prequalification Dossier Matrix (6 Pillars)'}
            </h2>
            {pillarFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setPillarFilter('ALL')}
                className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition-colors"
              >
                {isAr ? 'عرض الكل' : 'Clear Filter'}
              </button>
            )}
          </div>
          <span className="text-[10px] text-slate-400">
            {isAr ? 'انقر على أي ركيزة لتصفية الوثائق المرتبطة بها' : 'Click any pillar to filter associated compliance documents'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
          {/* 1. Legal Documents */}
          <button
            type="button"
            onClick={() => setPillarFilter(pillarFilter === 'LEGAL' ? 'ALL' : 'LEGAL')}
            className={`p-1.5 px-2 rounded-lg border flex items-center justify-between text-left transition-all ${
              pillarFilter === 'LEGAL' ? 'ring-2 ring-sky-500' : ''
            } ${
              mandatoryChecklist.commercial_registration?.verified && mandatoryChecklist.zatca_tax_vat?.verified
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-slate-800/40 border-slate-700/60'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Building2 className={`w-3.5 h-3.5 shrink-0 ${mandatoryChecklist.commercial_registration?.verified && mandatoryChecklist.zatca_tax_vat?.verified ? 'text-emerald-400' : 'text-slate-400'}`} />
              <div className="truncate">
                <div className="text-[10.5px] font-bold text-slate-200 truncate">{isAr ? '١. الوثائق النظامية' : '1. Legal Documents'}</div>
                <div className="text-[9.5px] text-slate-400 truncate">{isAr ? 'السجل والضريبة والتأمينات' : 'CR, VAT, GOSI, Chamber'}</div>
              </div>
            </div>
            {mandatoryChecklist.commercial_registration?.verified && mandatoryChecklist.zatca_tax_vat?.verified ? (
              <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                {isAr ? 'معتمد' : 'VERIFIED'}
              </span>
            ) : (
              <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                {isAr ? 'مطلوب' : 'REQ'}
              </span>
            )}
          </button>

          {/* 2. Company Information */}
          <button
            type="button"
            onClick={() => setPillarFilter(pillarFilter === 'COMPANY' ? 'ALL' : 'COMPANY')}
            className={`p-1.5 px-2 rounded-lg border flex items-center justify-between text-left transition-all ${
              pillarFilter === 'COMPANY' ? 'ring-2 ring-sky-500' : ''
            } bg-emerald-500/5 border-emerald-500/30`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <FileText className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <div className="truncate">
                <div className="text-[10.5px] font-bold text-slate-200 truncate">{isAr ? '٢. بيانات المنشأة' : '2. Company Info'}</div>
                <div className="text-[9.5px] text-slate-400 truncate">{currentCompany?.name || (isAr ? 'المركز الرئيسي' : 'HQ Entity')} ({cvPayload?.operating_regions?.facilities_count || 1})</div>
              </div>
            </div>
            <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
              {isAr ? 'معتمد' : 'VERIFIED'}
            </span>
          </button>

          {/* 3. Technical Requirements */}
          <button
            type="button"
            onClick={() => setPillarFilter(pillarFilter === 'TECHNICAL' ? 'ALL' : 'TECHNICAL')}
            className={`p-1.5 px-2 rounded-lg border flex items-center justify-between text-left transition-all ${
              pillarFilter === 'TECHNICAL' ? 'ring-2 ring-sky-500' : ''
            } ${
              (cvPayload?.fleet_capacity?.total_units || 0) > 0 || (cvPayload?.executed_projects?.total_executed_count || 0) > 0
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-slate-800/40 border-slate-700/60'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Truck className={`w-3.5 h-3.5 shrink-0 ${(cvPayload?.fleet_capacity?.total_units || 0) > 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
              <div className="truncate">
                <div className="text-[10.5px] font-bold text-slate-200 truncate">{isAr ? '٣. المتطلبات الفنية' : '3. Technical & Fleet'}</div>
                <div className="text-[9.5px] text-slate-400 truncate">{cvPayload?.fleet_capacity?.total_units || 0} {isAr ? 'مركبة' : 'Units'} · {cvPayload?.executed_projects?.total_executed_count || 0} {isAr ? 'مشروع' : 'Projects'}</div>
              </div>
            </div>
            <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
              {isAr ? 'جاهز' : 'READY'}
            </span>
          </button>

          {/* 4. Quality Requirements (ISO 9001, QA/QC) */}
          <button
            type="button"
            onClick={() => setPillarFilter(pillarFilter === 'QUALITY' ? 'ALL' : 'QUALITY')}
            className={`p-1.5 px-2 rounded-lg border flex items-center justify-between text-left transition-all ${
              pillarFilter === 'QUALITY' ? 'ring-2 ring-sky-500' : ''
            } ${
              mandatoryChecklist.iso_certifications?.verified || mandatoryChecklist.iso_9001?.verified || mandatoryChecklist.qa_qc_procedures?.verified
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-slate-800/40 border-slate-700/60'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Award className={`w-3.5 h-3.5 shrink-0 ${mandatoryChecklist.iso_certifications?.verified || mandatoryChecklist.iso_9001?.verified ? 'text-emerald-400' : 'text-slate-400'}`} />
              <div className="truncate">
                <div className="text-[10.5px] font-bold text-slate-200 truncate">{isAr ? '٤. الجودة (9001)' : '4. Quality (ISO 9001)'}</div>
                <div className="text-[9.5px] text-slate-400 truncate">{isAr ? 'نظام وإجراءات الجودة QA/QC' : 'ISO 9001 & QA/QC Manual'}</div>
              </div>
            </div>
            {mandatoryChecklist.iso_certifications?.verified || mandatoryChecklist.iso_9001?.verified || mandatoryChecklist.qa_qc_procedures?.verified ? (
              <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                {isAr ? 'معتمد' : 'VERIFIED'}
              </span>
            ) : (
              <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                {isAr ? 'مطلوب' : 'REQ'}
              </span>
            )}
          </button>

          {/* 5. HSE Requirements (ISO 45001, Stats) */}
          <button
            type="button"
            onClick={() => setPillarFilter(pillarFilter === 'HSE' ? 'ALL' : 'HSE')}
            className={`p-1.5 px-2 rounded-lg border flex items-center justify-between text-left transition-all ${
              pillarFilter === 'HSE' ? 'ring-2 ring-sky-500' : ''
            } ${
              mandatoryChecklist.iso_45001?.verified || mandatoryChecklist.hse_manual?.verified || mandatoryChecklist.hse_statistics?.verified
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-slate-800/40 border-slate-700/60'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${mandatoryChecklist.iso_45001?.verified || mandatoryChecklist.hse_manual?.verified ? 'text-emerald-400' : 'text-slate-400'}`} />
              <div className="truncate">
                <div className="text-[10.5px] font-bold text-slate-200 truncate">{isAr ? '٥. السلامة (45001)' : '5. HSE (ISO 45001)'}</div>
                <div className="text-[9.5px] text-slate-400 truncate">{isAr ? 'دليل HSE وصفر إصابات' : 'ISO 45001 & Stats'}</div>
              </div>
            </div>
            {mandatoryChecklist.iso_45001?.verified || mandatoryChecklist.hse_manual?.verified || mandatoryChecklist.hse_statistics?.verified ? (
              <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                {isAr ? 'معتمد' : 'VERIFIED'}
              </span>
            ) : (
              <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                {isAr ? 'مطلوب' : 'REQ'}
              </span>
            )}
          </button>

          {/* 6. Financial Requirements (Audited Statements, Bank Reference) */}
          <button
            type="button"
            onClick={() => setPillarFilter(pillarFilter === 'FINANCIAL' ? 'ALL' : 'FINANCIAL')}
            className={`p-1.5 px-2 rounded-lg border flex items-center justify-between text-left transition-all ${
              pillarFilter === 'FINANCIAL' ? 'ring-2 ring-sky-500' : ''
            } ${
              mandatoryChecklist.audited_financials?.verified || mandatoryChecklist.bank_reference?.verified
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-slate-800/40 border-slate-700/60'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Landmark className={`w-3.5 h-3.5 shrink-0 ${mandatoryChecklist.audited_financials?.verified || mandatoryChecklist.bank_reference?.verified ? 'text-emerald-400' : 'text-slate-400'}`} />
              <div className="truncate">
                <div className="text-[10.5px] font-bold text-slate-200 truncate">{isAr ? '٦. المتطلبات المالية' : '6. Financial & Bank'}</div>
                <div className="text-[9.5px] text-slate-400 truncate">{isAr ? 'القوائم والخطاب البنكي' : 'Audited Stmts & Bank'}</div>
              </div>
            </div>
            {mandatoryChecklist.audited_financials?.verified || mandatoryChecklist.bank_reference?.verified ? (
              <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                {isAr ? 'معتمد' : 'VERIFIED'}
              </span>
            ) : (
              <span className="px-1 py-0.2 text-[8.5px] font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                {isAr ? 'مطلوب' : 'REQ'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* DOCUMENT VAULT DATA GRID & CONTROLS */}
      {/* ==================================================================== */}
      <div className={`neo-compact-panel rounded-lg border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'}`}>
        {/* Table Filters Ribbon (High Density) */}
        <div className={`p-1.5 px-2 border-b flex flex-col md:flex-row items-stretch md:items-center justify-between gap-1.5 ${
          isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/70'
        }`}>
          {/* Search Bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className={`w-3 h-3 absolute top-1/2 -translate-y-1/2 ${isAr ? 'right-2' : 'left-2'} text-slate-400`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'البحث عن وثيقة، رقم السجل، الجهة المصدرة...' : 'Search by title, number, authority...'}
              className={`w-full py-1 rounded text-xs border outline-none transition-all ${
                isAr ? 'pr-7 pl-2' : 'pl-7 pr-2'
              } ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-sky-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500'
              }`}
            />
          </div>

          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Category Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`py-1 px-2 rounded text-[11px] font-bold border outline-none cursor-pointer ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">{isAr ? 'جميع التصنيفات' : 'All Document Types'}</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {isAr ? t.labelAr : t.labelEn}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`py-1 px-2 rounded text-[11px] font-bold border outline-none cursor-pointer ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="VERIFIED">{isAr ? 'معتمد' : 'Verified'}</option>
              <option value="UNVERIFIED">{isAr ? 'غير معتمد' : 'Unverified'}</option>
              <option value="EXPIRED">{isAr ? 'منتهي الصلاحية' : 'Expired'}</option>
              <option value="REJECTED">{isAr ? 'مرفوض' : 'Rejected'}</option>
            </select>
          </div>
        </div>

        {/* High-Density Data Table Viewport */}
        <div className="neo-data-viewport responsive-table-wrapper rounded-b-lg">
          <table className="neo-grid-table w-full text-start">
            <thead className={`sticky top-0 z-10 text-[10px] uppercase font-bold tracking-wider ${
              isDark ? 'bg-slate-950 text-slate-400 border-b border-slate-800' : 'bg-slate-100 text-slate-600 border-b border-slate-200'
            }`}>
              <tr>
                <th className={`py-1 px-2 ${isAr ? 'text-right' : 'text-left'}`}>{isAr ? 'الوثيقة والمسمى' : 'Document Title'}</th>
                <th className={`py-1 px-2 ${isAr ? 'text-right' : 'text-left'}`}>{isAr ? 'التصنيف النظامي' : 'Category'}</th>
                <th className={`py-1 px-2 ${isAr ? 'text-right' : 'text-left'}`}>{isAr ? 'رقم الوثيقة / الجهة' : 'Doc No. & Authority'}</th>
                <th className={`py-1 px-2 ${isAr ? 'text-right' : 'text-left'}`}>{isAr ? 'تاريخ الصلاحية' : 'Expiry Date'}</th>
                <th className={`py-1 px-2 ${isAr ? 'text-right' : 'text-left'}`}>{isAr ? 'حالة الاعتماد' : 'Verification Status'}</th>
                <th className={`py-1 px-2 text-center`}>{isAr ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-800/80 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-sky-400" />
                    <span className="text-xs">{isAr ? 'جاري تحميل وثائق الخزينة...' : 'Loading compliance vault...'}</span>
                  </td>
                </tr>
              ) : filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    <FileText className="w-6 h-6 mx-auto mb-1 text-slate-600" />
                    <p className="font-bold text-xs text-slate-400">
                      {isAr ? 'لا توجد وثائق تطابق معايير البحث.' : 'No compliance documents found.'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {isAr ? 'اضغط على "تسجيل وثيقة" لإيداع التراخيص والشهادات.' : 'Click "Register Document" to add licenses, certificates, and audits.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => {
                  const isExpired = doc.expiry_date ? new Date(doc.expiry_date) < new Date() : false;
                  const isNearExpiry = doc.expiry_date && !isExpired
                    ? (new Date(doc.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24) < 60
                    : false;

                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-amber-500/10 dark:hover:bg-amber-500/10 transition-colors border-b border-slate-200/60 dark:border-slate-800"
                    >
                      {/* Document Title & File Info */}
                      <td className="py-0.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <FileCheck2 className={`w-3 h-3 shrink-0 ${
                            doc.verification_status === 'VERIFIED' ? 'text-emerald-400' : 'text-sky-400'
                          }`} />
                          <div className="truncate">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-[10.5px]">{doc.title}</span>
                            <span className="text-[9px] text-slate-400 ml-1.5">({doc.file_name})</span>
                          </div>
                        </div>
                      </td>

                      {/* Document Type Badge */}
                      <td className="py-0.5 px-2">
                        <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-slate-200 dark:border-slate-700">
                          {doc.document_type}
                        </span>
                      </td>

                      {/* Number & Authority */}
                      <td className="py-0.5 px-2">
                        <span className="neo-cell-mono font-bold text-slate-800 dark:text-slate-200 text-[10.5px]">{doc.document_number || '—'}</span>
                        {doc.issuing_authority && <span className="text-[9.5px] text-slate-500 dark:text-slate-400 ml-1.5">({doc.issuing_authority})</span>}
                      </td>

                      {/* Expiry Date */}
                      <td className="py-0.5 px-2">
                        {doc.expiry_date ? (
                          <div className="flex items-center gap-1">
                            <span className={`neo-cell-mono text-[10.5px] ${
                              isExpired ? 'text-rose-500 dark:text-rose-400 font-bold' : isNearExpiry ? 'text-amber-500 dark:text-amber-400 font-bold' : 'text-slate-700 dark:text-slate-300'
                            }`}>
                              {doc.expiry_date.split('T')[0]}
                            </span>
                            {isExpired && (
                              <span className="px-1 py-0.2 text-[8px] font-bold rounded bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30">
                                {isAr ? 'منتهية' : 'EXP'}
                              </span>
                            )}
                            {isNearExpiry && (
                              <span className="px-1 py-0.2 text-[8px] font-bold rounded bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/30">
                                {isAr ? 'قاربت' : '<60d'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">{isAr ? 'دائم' : 'None'}</span>
                        )}
                      </td>

                      {/* Status & Quick Action */}
                      <td className="py-0.5 px-2">
                        <div className="flex items-center gap-1">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[8.5px] font-bold uppercase tracking-wider ${
                            doc.verification_status === 'VERIFIED'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : doc.verification_status === 'UNVERIFIED'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                              : doc.verification_status === 'EXPIRED'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${
                              doc.verification_status === 'VERIFIED' ? 'bg-emerald-500' : doc.verification_status === 'UNVERIFIED' ? 'bg-amber-500' : 'bg-rose-500'
                            }`} />
                            {doc.verification_status}
                          </span>

                          {/* Quick Admin Verification Toggle */}
                          {isAdmin && doc.verification_status !== 'VERIFIED' && (
                            <button
                              onClick={() => handleQuickVerify(doc, 'VERIFIED')}
                              className="group neo-action-btn neo-btn-verify"
                              title={isAr ? 'اعتماد الوثيقة فورياً' : 'Approve & Verify'}
                            >
                              <HoverIcon className="w-2.5 h-2.5">
                                <Check className="h-full w-full" />
                              </HoverIcon>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-0.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canMutate && (
                            <button
                              onClick={() => openEditModal(doc)}
                              className="group neo-action-btn neo-btn-edit"
                              title={isAr ? 'تعديل البيانات' : 'Edit details'}
                            >
                              <HoverIcon className="w-2.5 h-2.5">
                                <Edit3 className="h-full w-full" />
                              </HoverIcon>
                            </button>
                          )}

                          {canMutate && (
                            <button
                              onClick={() => setDeletingDoc(doc)}
                              className="group neo-action-btn neo-btn-delete"
                              title={isAr ? 'حذف الوثيقة' : 'Delete'}
                            >
                              <HoverIcon className="w-2.5 h-2.5">
                                <Trash2 className="h-full w-full" />
                              </HoverIcon>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: UPLOAD / REGISTER COMPLIANCE DOCUMENT */}
      {/* ==================================================================== */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`w-full max-w-xl rounded-3xl border shadow-2xl p-6 md:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between border-b pb-4 border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {isAr ? 'تسجيل وثيقة امتثال في الخزينة' : 'Register Compliance Document'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isAr ? 'إيداع الوثائق النظامية والتراخيص لملف التأهيل المؤسسي' : 'Deposit statutory filings into your enterprise vault'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="group p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title={isAr ? 'إغلاق' : 'Close'}
              >
                <HoverIcon className="w-4 h-4">
                  <X className="h-full w-full" />
                </HoverIcon>
              </button>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-4">
              {/* File Dropzone / Picker */}
              <div className="border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-950/40 relative">
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                />
                <Upload className="w-8 h-8 text-sky-400 mx-auto mb-2" />
                {stagedFile ? (
                  <div>
                    <div className="font-bold text-slate-200 text-xs">{stagedFile.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {Math.round(stagedFile.size / 1024)} KB • {stagedFile.type || 'Document'}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-bold text-slate-300">
                      {isAr ? 'اسحب وأفلت الملف هنا، أو انقر للاختيار' : 'Drag and drop file here, or click to browse'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {isAr ? 'يدعم ملفات PDF، الصور، والمستندات (الحد الأقصى 25MB)' : 'Supports PDF, JPG, PNG, DOCX up to 25MB'}
                    </div>
                  </div>
                )}
              </div>

              {/* Document Category & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'تصنيف الوثيقة *' : 'Document Type *'}
                  </label>
                  <select
                    value={uploadForm.document_type}
                    onChange={(e) => setUploadForm({ ...uploadForm, document_type: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                    required
                  >
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {isAr ? t.labelAr : t.labelEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'عنوان ومسمى الوثيقة *' : 'Document Title *'}
                  </label>
                  <input
                    type="text"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                    placeholder={isAr ? 'مثال: السجل التجاري الموحد' : 'e.g. Commercial Registration Certificate'}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                    required
                  />
                </div>
              </div>

              {/* Document Number & Authority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'رقم الوثيقة / الترخيص' : 'Document / License No.'}
                  </label>
                  <input
                    type="text"
                    value={uploadForm.document_number || ''}
                    onChange={(e) => setUploadForm({ ...uploadForm, document_number: e.target.value })}
                    placeholder={isAr ? 'مثال: 1010998877' : 'e.g. 1010998877'}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'الجهة المصدرة' : 'Issuing Authority'}
                  </label>
                  <input
                    type="text"
                    value={uploadForm.issuing_authority || ''}
                    onChange={(e) => setUploadForm({ ...uploadForm, issuing_authority: e.target.value })}
                    placeholder={isAr ? 'مثال: وزارة التجارة / هيئة الزكاة والضريبة' : 'e.g. Ministry of Commerce / ZATCA'}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'تاريخ الإصدار' : 'Issue Date'}
                  </label>
                  <input
                    type="date"
                    value={uploadForm.issue_date || ''}
                    onChange={(e) => setUploadForm({ ...uploadForm, issue_date: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'تاريخ الانتهاء' : 'Expiry Date'}
                  </label>
                  <input
                    type="date"
                    value={uploadForm.expiry_date || ''}
                    onChange={(e) => setUploadForm({ ...uploadForm, expiry_date: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  {isAr ? 'ملاحظات وتفاصيل إضافية' : 'Audit Notes / Remarks'}
                </label>
                <textarea
                  value={uploadForm.notes || ''}
                  onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })}
                  placeholder={isAr ? 'ملاحظات حول سريان الوثيقة أو كود التحقق...' : 'Additional context or verification code...'}
                  rows={2}
                  className="w-full py-2 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/30 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <span>{isAr ? 'حفظ وإيداع الوثيقة' : 'Deposit Document'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDIT DOCUMENT & STATUS */}
      {/* ==================================================================== */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`w-full max-w-xl rounded-3xl border shadow-2xl p-6 md:p-8 space-y-6 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between border-b pb-4 border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {isAr ? 'تعديل بيانات وثيقة الامتثال' : 'Edit Compliance Document'}
                  </h3>
                  <p className="text-xs text-slate-400">{editingDoc.title}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingDoc(null)}
                className="group p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title={isAr ? 'إغلاق' : 'Close'}
              >
                <HoverIcon className="w-4 h-4">
                  <X className="h-full w-full" />
                </HoverIcon>
              </button>
            </div>

            <form onSubmit={handleUpdateDocument} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  {isAr ? 'عنوان الوثيقة *' : 'Document Title *'}
                </label>
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'حالة الاعتماد' : 'Verification Status'}
                  </label>
                  <select
                    value={editForm.verification_status}
                    onChange={(e) => setEditForm({ ...editForm, verification_status: e.target.value as any })}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                    disabled={!isAdmin}
                  >
                    <option value="UNVERIFIED">{isAr ? 'غير معتمد (UNVERIFIED)' : 'UNVERIFIED'}</option>
                    <option value="VERIFIED">{isAr ? 'معتمد رسمياً (VERIFIED)' : 'VERIFIED'}</option>
                    <option value="EXPIRED">{isAr ? 'منتهي الصلاحية (EXPIRED)' : 'EXPIRED'}</option>
                    <option value="REJECTED">{isAr ? 'مرفوض (REJECTED)' : 'REJECTED'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'رقم الوثيقة' : 'Document Number'}
                  </label>
                  <input
                    type="text"
                    value={editForm.document_number || ''}
                    onChange={(e) => setEditForm({ ...editForm, document_number: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'الجهة المصدرة' : 'Issuing Authority'}
                  </label>
                  <input
                    type="text"
                    value={editForm.issuing_authority || ''}
                    onChange={(e) => setEditForm({ ...editForm, issuing_authority: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {isAr ? 'تاريخ الانتهاء' : 'Expiry Date'}
                  </label>
                  <input
                    type="date"
                    value={editForm.expiry_date || ''}
                    onChange={(e) => setEditForm({ ...editForm, expiry_date: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  {isAr ? 'ملاحظات التدقيق' : 'Audit Notes'}
                </label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                  className="w-full py-2 px-3 rounded-xl text-xs bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-sky-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ==================================================================== */}
      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-4 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 rounded-2xl bg-rose-500/10">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  {isAr ? 'تأكيد حذف الوثيقة' : 'Confirm Document Deletion'}
                </h3>
                <p className="text-xs text-slate-400">{isAr ? 'إجراء لا يمكن التراجع عنه' : 'Irreversible Action'}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {isAr
                ? `هل أنت متأكد من رغبتك في حذف الوثيقة "${deletingDoc.title}" من الخزينة؟ سيؤثر ذلك على نسبة جاهزية ملف المنشأة في المناقصات.`
                : `Are you sure you want to remove "${deletingDoc.title}" from the corporate vault? This will affect your enterprise qualification score.`}
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isAr ? 'جاري الحذف...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <span>{isAr ? 'نعم، حذف نهائي' : 'Yes, Delete'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CorporateVault;
