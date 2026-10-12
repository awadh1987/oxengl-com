import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../context/AppContext';
import { CustomerInvoice, InvoiceItem, OperationRecord, DocumentAttachment } from '../types';
import { erpApi, ApiCustomerInvoice, ApiJournalEntry } from '../services/api';
import {
  FileText,
  Printer,
  Download,
  Calendar,
  Building,
  CheckCircle2,
  Share2,
  FileSpreadsheet,
  QrCode,
  Layers,
  ArrowRight,
  Send,
  MessageCircle,
  Mail,
  ShieldCheck,
  Paperclip,
  Check,
  Clock,
  AlertCircle,
  AlertTriangle,
  Save,
  RefreshCw,
  BookOpen,
  ExternalLink,
  Archive,
  Upload,
  Link2,
} from 'lucide-react';
import { formatCurrency, formatDate, formatNumber, formatTonnage, getMonthName, generateZatcaQR, roundHalala, calculateVatBreakdown } from '../utils/formatters';
import { tafqeetArabic, tafqeetEnglish } from '../utils/tafqeet';
import { exportInvoiceToExcel } from '../utils/excelExporter';
import { BrandLogo } from '../components/BrandLogo';
import { DynamicEmailLauncherModal } from '../components/DynamicEmailLauncherModal';
import { MultiAttachmentModal } from '../components/MultiAttachmentModal';
import { InvoiceExportShareModal } from '../components/InvoiceExportShareModal';
import { ExportPrintModal } from '../components/ExportPrintModal';
import { OfficialLetterheadHeader } from '../components/OfficialLetterheadHeader';
import { DynamicFieldRenderer } from '../components/DynamicFieldRenderer';
import { BulkImportModal } from '../components/BulkImportModal';
import { OfficialLetterheadFooter } from '../components/OfficialLetterheadFooter';
import { HoverIcon } from '../components/common/HoverIcon';
import { ActionsMenu } from '../components/ActionsMenu';

export const CustomerInvoicingView: React.FC = () => {
  const {
    currentCompany,
    customers,
    accessibleOperations,
    language,
    currentUser,
    isAdmin,
    canApproveInvoices,
    isGuestUser,
    brandConfig,
    logAuditAction,
    addAttachmentToRecord,
    removeAttachmentFromRecord,
    showToast,
  } = useApp();
  const isAr = language === 'ar';

  const invoiceContainerRef = useRef<HTMLDivElement | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // August
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // Backend sync state
  const [backendInvoices, setBackendInvoices] = useState<ApiCustomerInvoice[]>([]);
  const [currentBackendInvoice, setCurrentBackendInvoice] = useState<ApiCustomerInvoice | null>(null);
  const [isLoadingBackend, setIsLoadingBackend] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // State-machine approval status
  const [invoiceStatus, setInvoiceStatus] = useState<'Draft' | 'Pending_Approval' | 'Approved' | 'Paid'>('Draft');
  const [isSigned, setIsSigned] = useState<boolean>(false);
  const [approvalDetails, setApprovalDetails] = useState<{
    approvedBy?: string;
    approvedAt?: string;
    verificationHash?: string;
  }>({});

  // Modals state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);
  const [isExportShareModalOpen, setIsExportShareModalOpen] = useState(false);
  const [isExportPrintModalOpen, setIsExportPrintModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [invoiceCustomAttributes, setInvoiceCustomAttributes] = useState<Record<string, any>>({});
  useEffect(() => {
    setInvoiceCustomAttributes(currentBackendInvoice?.custom_attributes || {});
  }, [currentBackendInvoice?.id]);
  const [invoiceAttachments, setInvoiceAttachments] = useState<DocumentAttachment[]>([]);

  // Deep-link URL parameter synchronization
  useEffect(() => {
    const handleUrlInvoiceParams = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const partner = params.get('partner');
      const action = params.get('action');

      if (partner && customers.length > 0) {
        const found = customers.find(
          (c) =>
            (c?.id || '').toLowerCase() === partner.toLowerCase() ||
            (c?.customerName || '').toLowerCase().includes(partner.toLowerCase()) ||
            ((c?.customerNameEn || '').toLowerCase().includes(partner.toLowerCase()))
        );
        if (found) {
          setSelectedCustomerId(found.id);
        }
      }

      if (action === 'draft-batch') {
        setIsExportPrintModalOpen(true);
      }
    };

    handleUrlInvoiceParams();
    window.addEventListener('popstate', handleUrlInvoiceParams);
    return () => window.removeEventListener('popstate', handleUrlInvoiceParams);
  }, [customers]);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c?.id === selectedCustomerId) || customers[0] || null;
  }, [customers, selectedCustomerId]);

  // Filter matching trips for this customer & billing cycle
  const matchingTrips = useMemo(() => {
    if (!selectedCustomer) return [];
    const custName = selectedCustomer?.customerName || '';
    const custNameEn = selectedCustomer?.customerNameEn || '';

    return accessibleOperations.filter((op) => {
      const destCustomer = op?.destination_customer || '';
      const matchCustomer =
        (custName && destCustomer.includes(custName)) ||
        (custNameEn && destCustomer.includes(custNameEn));
      const matchMonth = op?.operation_month === selectedMonth && op?.operation_year === selectedYear;
      return Boolean(matchCustomer && matchMonth);
    });
  }, [accessibleOperations, selectedCustomer, selectedMonth, selectedYear]);

  // Auto-aggregate by material_type
  const invoiceItems: InvoiceItem[] = useMemo(() => {
    const map: Record<string, { trips: number; loaded: number; delivered: number; wastage: number; sales: number }> = {};

    matchingTrips.forEach((op) => {
      const matType = op?.material_type || 'General Material';
      if (!map[matType]) {
        map[matType] = { trips: 0, loaded: 0, delivered: 0, wastage: 0, sales: 0 };
      }
      map[matType].trips += 1;
      map[matType].loaded += Number(op?.qty_loaded || 0);
      map[matType].delivered += Number(op?.qty_delivered || 0);
      map[matType].wastage += Number(op?.qty_wastage || 0);
      map[matType].sales += Number(op?.sales_amount || 0);
    });

    return Object.entries(map).map(([materialType, data]) => {
      const unitPrice = data.delivered > 0 ? roundHalala(data.sales / data.delivered) : 44;
      const breakdown = calculateVatBreakdown(data.sales, 0.15);
      const subtotal = breakdown.subtotal;
      const vatAmount = breakdown.vatAmount;
      const total = breakdown.grandTotal;

      return {
        materialType,
        tripsCount: data.trips,
        loadedWeight: roundHalala(data.loaded),
        deliveredWeight: roundHalala(data.delivered),
        wastageWeight: roundHalala(data.wastage),
        unitPrice,
        subtotal,
        vatAmount,
        total,
      };
    });
  }, [matchingTrips]);

  const subtotal = roundHalala(invoiceItems.reduce((acc, item) => acc + item.subtotal, 0));
  const totalVat = roundHalala(invoiceItems.reduce((acc, item) => acc + item.vatAmount, 0));
  const grandTotal = roundHalala(subtotal + totalVat);
  const totalTrips = invoiceItems.reduce((acc, item) => acc + item.tripsCount, 0);
  const totalLoaded = invoiceItems.reduce((acc, item) => acc + item.loadedWeight, 0);
  const totalDelivered = invoiceItems.reduce((acc, item) => acc + item.deliveredWeight, 0);
  const totalWastage = invoiceItems.reduce((acc, item) => acc + item.wastageWeight, 0);

  // Financial balance validation rule (BR-001)
  const isUnbalanced = useMemo(() => {
    if (invoiceItems.length === 0) return false;
    return Math.abs(subtotal + totalVat - grandTotal) > 0.01;
  }, [subtotal, totalVat, grandTotal, invoiceItems.length]);

  const invoiceNumber = currentBackendInvoice?.invoice_number || `INV-${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${selectedCustomer?.crNumber?.slice(-4) || '1048'}`;
  const issueDate = currentBackendInvoice?.issue_date?.slice(0, 10) || `2026-${String(selectedMonth).padStart(2, '0')}-28`;
  const dueDate = currentBackendInvoice?.due_date?.slice(0, 10) || `2026-${String(selectedMonth + 1 > 12 ? 1 : selectedMonth + 1).padStart(2, '0')}-28`;

  // ZATCA Cryptographic QR Code Base64 (Phase 1 TLV compliant)
  const zatcaQrBase64 = useMemo(() => {
    return generateZatcaQR(
      brandConfig.companyNameAr,
      brandConfig.taxNumber,
      `${issueDate}T12:00:00Z`,
      grandTotal,
      totalVat
    );
  }, [brandConfig, issueDate, grandTotal, totalVat]);

  // Arabic Legal Tafqeet Wording
  const amountInWordsAr = useMemo(() => {
    return tafqeetArabic(grandTotal, 'ريال سعودي', 'هللة');
  }, [grandTotal]);

  const amountInWordsEn = useMemo(() => {
    return tafqeetEnglish(grandTotal, 'Saudi Riyals', 'Halalas');
  }, [grandTotal]);

  // Backend synchronization
  const loadBackendInvoices = useCallback(async () => {
    if (!currentCompany?.id) return;
    setIsLoadingBackend(true);
    try {
      const list = await erpApi.getCustomerInvoices(currentCompany.id);
      setBackendInvoices(list);
      const match = list.find(
        (inv) =>
          inv.invoice_number === invoiceNumber ||
          (inv.partner_id === selectedCustomerId &&
            inv.issue_date &&
            inv.issue_date.startsWith(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}`))
      );
      if (match) {
        setCurrentBackendInvoice(match);
        const st = match.status as 'Draft' | 'Approved' | 'Issued';
        setInvoiceStatus(st === 'Issued' ? 'Paid' : st);
        if (st === 'Approved' || st === 'Issued') {
          setIsSigned(true);
          setApprovalDetails({
            approvedBy: match.approved_by || brandConfig.ceoNameAr,
            approvedAt: match.approved_at || match.created_at,
            verificationHash: `OXEN-${match.status.toUpperCase()}-${match.invoice_number}`,
          });
        } else {
          setIsSigned(false);
          setApprovalDetails({});
        }
      } else {
        setCurrentBackendInvoice(null);
        setInvoiceStatus('Draft');
        setIsSigned(false);
        setApprovalDetails({});
      }
    } catch (err: any) {
      console.error('Failed to load customer invoices from backend:', err);
    } finally {
      setIsLoadingBackend(false);
    }
  }, [currentCompany?.id, invoiceNumber, selectedCustomerId, selectedMonth, selectedYear, brandConfig.ceoNameAr]);

  useEffect(() => {
    loadBackendInvoices();
  }, [loadBackendInvoices]);

  const customerInvoiceObject: CustomerInvoice = {
    id: invoiceNumber,
    invoiceNumber,
    customerId: selectedCustomer?.id || '',
    customerName: selectedCustomer?.customerName || '',
    customerTaxNumber: selectedCustomer?.taxNumber || '',
    billingMonth: selectedMonth,
    billingYear: selectedYear,
    issueDate,
    dueDate,
    items: invoiceItems,
    subtotal,
    vatAmount: totalVat,
    grandTotal,
    totalTrips,
    totalLoadedWeight: totalLoaded,
    totalDeliveredWeight: totalDelivered,
    totalWastageWeight: totalWastage,
    status: invoiceStatus,
    preparedBy: currentUser.fullNameAr || currentUser.fullName,
    preparedByRole: currentUser.role,
    approvedBy: approvalDetails.approvedBy,
    approvedAt: approvalDetails.approvedAt,
    isSigned,
    signatureData: isSigned
      ? {
          signedBy: approvalDetails.approvedBy || brandConfig.ceoNameAr,
          signedByRole: brandConfig.ceoTitleAr,
          signedAt: approvalDetails.approvedAt || new Date().toISOString(),
          verificationHash: approvalDetails.verificationHash || 'MYN-SHA256-9A8B7C6D5E4F3210',
          signatureImageUrl: brandConfig.ceoSignatureUrl,
          stampImageUrl: brandConfig.companyStampUrl,
        }
      : undefined,
    attachments: invoiceAttachments,
    public_token: currentBackendInvoice?.public_token || undefined,
    publicToken: currentBackendInvoice?.public_token || undefined,
  };

  const copyMagicLink = (publicToken?: string) => {
    if (!publicToken) {
      alert("This invoice does not have a public token yet.");
      return;
    }
    const magicLink = `${window.location.origin}/shared/invoice/${publicToken}`;
    navigator.clipboard.writeText(magicLink)
      .then(() => alert("Magic Link copied to clipboard!"))
      .catch((err) => console.error("Failed to copy link: ", err));
  };

  const handlePrint = () => {
    document.body.classList.add('printing-invoice');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-invoice');
    }, 1000);
  };

  const handleExcelExport = () => {
    exportInvoiceToExcel(customerInvoiceObject, matchingTrips);
  };

  const handleExportJSONSnapshot = () => {
    const dataStr = JSON.stringify(
      {
        invoiceNumber,
        customer: selectedCustomer?.customerName,
        period: `${getMonthName(selectedMonth, language)} ${selectedYear}`,
        totals: { subtotal, vatAmount: totalVat, grandTotal },
        items: invoiceItems,
        tripsCount: matchingTrips.length,
        status: currentBackendInvoice?.status || 'Draft',
        zatcaQrBase64,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OxenGL_Invoice_Snapshot_${invoiceNumber}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Step 1: Save Draft to Backend
  const handleSaveDraft = async () => {
    if (!currentCompany?.id) return;
    if (isUnbalanced) {
      setFeedback({
        type: 'error',
        message: isAr
          ? 'خطأ توازن محاسبي: مجموع البنود والضريبة لا يطابق الإجمالي النهائي. يرجى مراجعة وتصحيح الحسابات.'
          : 'Unbalanced invoice error: subtotal + VAT must equal grand total.',
      });
      return;
    }
    setActionLoading(true);
    setFeedback(null);
    try {
      const cycleYearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const existingInvoice = currentBackendInvoice || backendInvoices.find(
        (inv) =>
          inv.invoice_number === invoiceNumber ||
          (inv.partner_id === selectedCustomerId &&
            inv.issue_date &&
            inv.issue_date.startsWith(cycleYearMonth))
      );

      if (existingInvoice) {
        const updated = await erpApi.updateCustomerInvoice(currentCompany.id, existingInvoice.id, {
          customer_name: selectedCustomer?.customerName || 'Customer',
          customer_tax_number: selectedCustomer?.taxNumber || null,
          partner_id: selectedCustomer?.id || null,
          issue_date: issueDate,
          due_date: dueDate,
          custom_attributes: invoiceCustomAttributes,
        });
        setCurrentBackendInvoice(updated);
        setInvoiceStatus((updated.status as any) || 'Draft');
      } else {
        const created = await erpApi.createCustomerInvoice(currentCompany.id, {
          invoice_number: invoiceNumber,
          customer_name: selectedCustomer?.customerName || 'Customer',
          customer_tax_number: selectedCustomer?.taxNumber || null,
          partner_id: selectedCustomer?.id || null,
          issue_date: issueDate,
          due_date: dueDate,
          custom_attributes: invoiceCustomAttributes,
          subtotal: 0,
          vat_amount: 0,
          grand_total: 0,
        });
        setCurrentBackendInvoice(created);
        setInvoiceStatus('Draft');
      }
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم حفظ المسودة في الخادم المركزي بنجاح برقم (${invoiceNumber})`
          : `Draft invoice ${invoiceNumber} saved successfully to backend.`,
      });
      await loadBackendInvoices();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || (isAr ? 'فشل حفظ المسودة في الخادم' : 'Failed to save draft invoice.'),
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Step 2: CEO Review & Authorization ("Approve & Sign")
  const handleCeoApproveAndSign = async () => {
    if (!currentCompany?.id) return;
    if (isUnbalanced) {
      setFeedback({
        type: 'error',
        message: isAr ? 'لا يمكن اعتماد فاتورة غير متوازنة مالياً (BR-001).' : 'Cannot approve an unbalanced invoice (BR-001).',
      });
      return;
    }
    setActionLoading(true);
    setFeedback(null);
    try {
      const cycleYearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const existingInvoice = currentBackendInvoice || backendInvoices.find(
        (inv) =>
          inv.invoice_number === invoiceNumber ||
          (inv.partner_id === selectedCustomerId &&
            inv.issue_date &&
            inv.issue_date.startsWith(cycleYearMonth))
      );

      let approved: ApiCustomerInvoice;
      if (existingInvoice) {
        // If an invoice already exists for this cycle, clicking approve MUST send a PUT or PATCH request
        // to update the status to 'Approved', it must NEVER send a POST.
        approved = await erpApi.updateCustomerInvoice(currentCompany.id, existingInvoice.id, {
          status: 'Approved',
          customer_name: selectedCustomer?.customerName || 'Customer',
          customer_tax_number: selectedCustomer?.taxNumber || null,
          partner_id: selectedCustomer?.id || null,
          issue_date: issueDate,
          due_date: dueDate,
          custom_attributes: invoiceCustomAttributes,
        });
      } else {
        const created = await erpApi.createCustomerInvoice(currentCompany.id, {
          invoice_number: invoiceNumber,
          customer_name: selectedCustomer?.customerName || 'Customer',
          customer_tax_number: selectedCustomer?.taxNumber || null,
          partner_id: selectedCustomer?.id || null,
          issue_date: issueDate,
          due_date: dueDate,
          custom_attributes: invoiceCustomAttributes,
          subtotal: 0,
          vat_amount: 0,
          grand_total: 0,
        });
        approved = await erpApi.updateCustomerInvoice(currentCompany.id, created.id, {
          status: 'Approved',
        });
      }

      setCurrentBackendInvoice(approved);
      setInvoiceStatus('Approved');
      setIsSigned(true);
      const hash = `OXEN-AUTH-${Date.now().toString(16).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      setApprovalDetails({
        approvedBy: approved.approved_by || currentUser.fullNameAr || currentUser.fullName,
        approvedAt: approved.approved_at || new Date().toISOString(),
        verificationHash: hash,
      });
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم اعتماد وتوقيع الفاتورة رسمياً من المدير التنفيذي (${approved.invoice_number})`
          : `Invoice ${approved.invoice_number} officially approved and signed by CEO.`,
      });
      logAuditAction({
        userId: currentUser.id,
        userName: currentUser.fullNameAr || currentUser.fullName,
        userRole: currentUser.role,
        action: 'APPROVE',
        entityType: 'Invoice',
        entityId: approved.invoice_number || invoiceNumber,
        summary: `اعتماد وتوقيع الفاتورة الضريبية رقم (${approved.invoice_number || invoiceNumber}) وإلغاء علامة المسودة المائية`,
        newData: {
          invoiceNumber: approved.invoice_number || invoiceNumber,
          grandTotal: approved.grand_total,
          verificationHash: hash,
        },
      });
      await loadBackendInvoices();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || (isAr ? 'فشل اعتماد وتوقيع الفاتورة' : 'Failed to approve invoice.'),
      });
    } finally {
      setActionLoading(false);
    }
  };

  const isFinalized = useMemo(() => {
    return (
      invoiceStatus === 'Approved' ||
      invoiceStatus === 'Paid' ||
      currentBackendInvoice?.status === 'Approved' ||
      currentBackendInvoice?.status === 'Issued'
    );
  }, [invoiceStatus, currentBackendInvoice?.status]);

  const isPostedToLedger = useMemo(() => {
    return Boolean(
      currentBackendInvoice?.is_posted || currentBackendInvoice?.journal_entry_id
    );
  }, [currentBackendInvoice?.is_posted, currentBackendInvoice?.journal_entry_id]);

  // Step 3: Issue Invoice and Post Balanced Double-Entry to General Ledger
  const handleIssueToGeneralLedger = async () => {
    if (!currentCompany?.id || !currentBackendInvoice?.id) return;
    if (isUnbalanced) {
      const msg = isAr ? 'لا يمكن ترحيل قيد غير متوازن لدفتر الأستاذ العام' : 'Cannot post unbalanced entry to GL.';
      setFeedback({
        type: 'error',
        message: msg,
      });
      showToast(msg, 'error');
      return;
    }
    setActionLoading(true);
    setFeedback(null);
    try {
      const issued = await erpApi.issueCustomerInvoice(currentCompany.id, currentBackendInvoice.id);
      setCurrentBackendInvoice(issued);
      setInvoiceStatus('Paid');

      // Post to double-entry general ledger
      try {
        const ledgerEntry = await erpApi.postInvoiceToLedger(issued.id, currentCompany.id);
        if (ledgerEntry) {
          issued.is_posted = true;
          issued.journal_entry_id = ledgerEntry.id;
        }
      } catch (ledgerErr) {
        console.warn('Post invoice to ledger notice:', ledgerErr);
      }

      // Trigger backend ZATCA compliance processing
      try {
        await erpApi.processZatcaInvoice(currentCompany.id, issued.id);
      } catch (zatcaErr) {
        console.warn('Backend ZATCA compliance trigger notice:', zatcaErr);
      }

      const successMsg = isAr
        ? `تم إصدار الفاتورة وترحيل القيد المحاسبي المزدوج آلياً إلى دفتر الأستاذ العام وتوثيق الامتثال لـ ZATCA بنجاح! رقم القيد: ${issued.move_id || 'POSTED'}`
        : `Invoice issued, posted to General Ledger, and ZATCA compliance logged! GL Move: ${issued.move_id || 'POSTED'}`;
      setFeedback({
        type: 'success',
        message: successMsg,
      });
      showToast(successMsg, 'success');

      logAuditAction({
        userId: currentUser.id,
        userName: currentUser.fullNameAr || currentUser.fullName,
        userRole: currentUser.role,
        action: 'ISSUE',
        entityType: 'Invoice',
        entityId: invoiceNumber,
        summary: `إصدار الفاتورة وترحيل القيود المالية (${invoiceNumber})`,
        newData: { invoiceNumber, moveId: issued.move_id },
      });
      await loadBackendInvoices();
    } catch (err: any) {
      const errMsg = err.message || (isAr ? 'فشل إصدار الفاتورة وترحيل القيد' : 'Failed to issue invoice to ledger.');
      setFeedback({
        type: 'error',
        message: errMsg,
      });
      showToast(errMsg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 4: Post Finalized Customer Invoice directly to Double-Entry General Ledger (AR & Revenue)
  const handlePostToLedger = async () => {
    const targetInvoice = currentBackendInvoice || backendInvoices.find((b) => b.invoice_number === invoiceNumber);
    const invoiceIdToPost = targetInvoice?.id || invoiceNumber;

    if (!invoiceIdToPost) {
      showToast(isAr ? 'تعذر العثور على الفاتورة لترحيلها إلى دفتر الأستاذ' : 'Cannot find invoice to post to ledger', 'error');
      return;
    }

    if (isUnbalanced) {
      const msg = isAr ? 'لا يمكن ترحيل قيد غير متوازن لدفتر الأستاذ العام' : 'Cannot post unbalanced entry to GL.';
      setFeedback({ type: 'error', message: msg });
      showToast(msg, 'error');
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const entry: ApiJournalEntry = await erpApi.postInvoiceToLedger(String(invoiceIdToPost), currentCompany?.id);

      if (currentBackendInvoice) {
        setCurrentBackendInvoice({
          ...currentBackendInvoice,
          is_posted: true,
          journal_entry_id: entry.id,
        });
      }
      setBackendInvoices((prev) =>
        prev.map((inv) =>
          inv.id === targetInvoice?.id || inv.invoice_number === invoiceNumber
            ? { ...inv, is_posted: true, journal_entry_id: entry.id }
            : inv
        )
      );

      const drText = formatCurrency(entry.total_debit, language);
      const crText = formatCurrency(entry.total_credit, language);
      const successMsg = isAr
        ? `تم ترحيل الفاتورة بنجاح إلى دفتر الأستاذ العام (سند رقم: ${entry.entry_number}) - مدين (AR): ${drText} / دائن (Revenue): ${crText}`
        : `Successfully posted invoice to General Ledger (Voucher #${entry.entry_number}) - Debit (AR): ${drText} / Credit (Revenue): ${crText}`;

      setFeedback({ type: 'success', message: successMsg });
      showToast(successMsg, 'success');

      logAuditAction({
        userId: currentUser.id,
        userName: currentUser.fullNameAr || currentUser.fullName,
        userRole: currentUser.role,
        action: 'POST_LEDGER',
        entityType: 'Invoice',
        entityId: invoiceNumber,
        summary: `ترحيل مبيعات الفاتورة لدفتر الأستاذ (${invoiceNumber})`,
        newData: { invoiceNumber, journalEntryId: entry.id, entryNumber: entry.entry_number },
      });

      await loadBackendInvoices();
    } catch (err: any) {
      const errMsg = err?.message || (isAr ? 'فشل ترحيل الفاتورة إلى دفتر الأستاذ العام' : 'Failed to post invoice to ledger.');
      setFeedback({ type: 'error', message: errMsg });
      showToast(errMsg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Multi-Channel WhatsApp Link Handler
  const handleLaunchWhatsApp = () => {
    const phoneRaw = selectedCustomer?.phone?.replace(/[^0-9]/g, '') || '966501234567';
    const messageAr = `السادة / ${selectedCustomer?.customerName} المحترمين،
نرفق لكم الفاتورة الضريبية المعتمدة رقم (${invoiceNumber}) لشهر ${selectedMonth}/${selectedYear}.
- إجمالي الرحلات: ${totalTrips} رحلة
- الوزن الصافي المستلم: ${totalDelivered.toLocaleString()} MT طن
- المبلغ الإجمالي المستحق: ${formatCurrency(grandTotal, 'ar')}
- حالة الاعتماد: معتمدة وموقعة رسمياً من الإدارة العامة
حساب التحويل: مصرف الراجحي | IBAN: SA4280000123608010123456
شركة ميون للمقاولات المحدودة`;

    const messageEn = `Dear ${selectedCustomer?.customerNameEn || selectedCustomer?.customerName},
Attached is the approved Tax Invoice #${invoiceNumber} for ${selectedMonth}/${selectedYear}.
- Total Trips: ${totalTrips}
- Delivered Weight: ${totalDelivered.toLocaleString()} Tons
- Total Due: ${formatCurrency(grandTotal, 'en')}
- Status: Officially Approved & Signed by CEO
Bank: Al Rajhi Bank | IBAN: SA4280000123608010123456
Myon Economic Contracting Co. Ltd.`;

    const text = encodeURIComponent(isAr ? messageAr : messageEn);
    const waUrl = `https://wa.me/${phoneRaw}?text=${text}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6 px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto" id="customer-invoicing-view">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs sm:flex-row sm:items-center no-print">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">
              {isAr ? 'محرك الفواتير والمطالبات الشهرية للعملاء' : 'Dynamic Customer Invoicing Engine'}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black whitespace-nowrap shrink-0 ${
                currentBackendInvoice?.status === 'Issued' || invoiceStatus === 'Paid'
                  ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
                  : invoiceStatus === 'Approved'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                  : invoiceStatus === 'Pending_Approval'
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {currentBackendInvoice?.status === 'Issued' || invoiceStatus === 'Paid'
                ? isAr
                  ? 'مصدرة ومرحلة لدفتر الأستاذ (Issued & Posted)'
                  : 'Issued & Posted to GL'
                : invoiceStatus === 'Approved'
                ? isAr
                  ? 'معتمدة وموقعة رسمياً'
                  : 'Approved & Signed'
                : invoiceStatus === 'Pending_Approval'
                ? isAr
                  ? 'مسودة - بانتظار اعتماد الإدارة'
                  : 'Pending Approval'
                : isAr
                ? 'مسودة أولية'
                : 'Draft'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'تجميع رحلات التوريد، احتساب ضريبة القيمة المضافة 15%، وإدارة سير الاعتماد والتوقيع الرقمي للمدير التنفيذي مع الترحيل المالي لدفتر الأستاذ العام'
              : 'Auto-aggregate monthly deliveries, compute 15% VAT, manage CEO approvals, and post double-entry GL vouchers'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Backend Status */}
          <button
            onClick={loadBackendInvoices}
            disabled={isLoadingBackend}
            className="group flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
            title={isAr ? 'تحديث حالة الفاتورة من الخادم' : 'Sync status with backend'}
          >
            <HoverIcon className="h-3.5 w-3.5">
              <RefreshCw className={`h-full w-full text-slate-500 dark:text-slate-400 ${isLoadingBackend ? 'animate-spin' : ''}`} />
            </HoverIcon>
            <span>{isAr ? 'مزامنة' : 'Sync'}</span>
          </button>

          {/* Attachments Trigger */}
          <button
            onClick={() => setIsAttachmentModalOpen(true)}
            className="group flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <HoverIcon className="h-4 w-4">
              <Paperclip className="h-full w-full text-orange-600 dark:text-orange-400" />
            </HoverIcon>
            <span>
              {isAr ? 'المرفقات وتذاكر الميزان' : 'Attachments'} ({invoiceAttachments.length})
            </span>
          </button>

          {/* Copy Magic Link */}
          <button
            id="copy-invoice-magic-link-top-btn"
            onClick={() => copyMagicLink(currentBackendInvoice?.public_token || undefined)}
            className="group flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/40 px-3 py-2 text-xs font-bold text-indigo-900 dark:text-indigo-300 shadow-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
            title={isAr ? 'نسخ رابط الدفع المباشر السحري (Magic Link)' : 'Copy Public Magic Link'}
          >
            <HoverIcon className="h-3.5 w-3.5">
              <Link2 className="h-full w-full text-indigo-700 dark:text-indigo-400" />
            </HoverIcon>
            <span>{isAr ? 'الرابط السحري' : 'Magic Link'}</span>
          </button>

          <ActionsMenu
            isArabic={isAr}
            items={[
              { id: 'bulk-import-invoicing-btn', label: isAr ? 'استيراد جماعي (CSV/Excel)' : 'Bulk Import (CSV/Excel)', icon: Upload, onSelect: () => setIsBulkImportOpen(true) },
              { id: 'export-invoice-json-btn', label: isAr ? 'لقطة JSON' : 'JSON Snapshot', icon: Download, onSelect: handleExportJSONSnapshot },
              { id: 'invoicing-export-excel-action', label: isAr ? 'تصدير كشف Excel' : 'Export Excel', icon: FileSpreadsheet, onSelect: handleExcelExport },
              { id: 'invoicing-export-print-action', label: isAr ? 'معاينة وطباعة' : 'Export & Print', icon: Printer, onSelect: () => setIsExportPrintModalOpen(true) },
            ]}
          />
        </div>
      </div>

      {/* Dynamic Alert & Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-2xl p-4 text-xs font-bold transition-all no-print ${
            feedback.type === 'error'
              ? 'border border-rose-200 bg-rose-50 text-rose-900'
              : feedback.type === 'warning'
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            ) : feedback.type === 'warning' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] font-bold underline opacity-75 hover:opacity-100"
          >
            {isAr ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Financial Engine Balance Alert (BR-001) */}
      {isUnbalanced && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/90 p-4 text-xs font-bold text-rose-950 shadow-sm no-print">
          <AlertTriangle className="h-6 w-6 shrink-0 text-rose-600" />
          <div className="flex-1">
            <h4 className="font-black text-rose-900">
              {isAr ? 'تنبيه عدم التوازن المالي (Atomic Posting Rule BR-001 Violation)' : 'Financial Balance Rule Violation (BR-001)'}
            </h4>
            <p className="mt-0.5 text-[11px] font-normal text-rose-800">
              {isAr
                ? `المجموع الفرعي (${formatCurrency(subtotal, 'ar')}) + ضريبة القيمة المضافة (${formatCurrency(totalVat, 'ar')}) لا يطابق الإجمالي النهائي (${formatCurrency(grandTotal, 'ar')}). يمنع محرك القيود المزدوجة ترحيل أي مستند مالي غير متوازن لمنع اختلال ميزان المراجعة.`
                : `Subtotal + VAT must exactly balance Grand Total. The double-entry financial engine rejects unbalanced journal postings.`}
            </p>
          </div>
        </div>
      )}

      {/* 2. State-Machine Approval Workflow & Submission Banner */}
      <div
        className={`rounded-3xl border p-5 transition-all no-print ${
          currentBackendInvoice?.status === 'Issued' || invoiceStatus === 'Paid'
            ? 'border-blue-200 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 text-blue-950 dark:text-blue-200'
            : invoiceStatus === 'Approved'
            ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200'
            : 'border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200'
        }`}
      >
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                currentBackendInvoice?.status === 'Issued' || invoiceStatus === 'Paid'
                  ? 'bg-blue-600 text-white'
                  : invoiceStatus === 'Approved'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {currentBackendInvoice?.status === 'Issued' || invoiceStatus === 'Paid' ? (
                <BookOpen className="h-6 w-6" />
              ) : invoiceStatus === 'Approved' ? (
                <ShieldCheck className="h-6 w-6" />
              ) : (
                <Clock className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black">
                  {currentBackendInvoice?.status === 'Issued' || invoiceStatus === 'Paid'
                    ? isAr
                      ? 'الفاتورة مصدرة ومرحلة لدفتر الأستاذ العام (Posted to GL)'
                      : 'Invoice Issued & Posted to General Ledger'
                    : invoiceStatus === 'Approved'
                    ? isAr
                      ? 'الفاتورة معتمدة وموقعة رسمياً من المدير التنفيذي'
                      : 'Invoice Officially Approved & Signed by CEO'
                    : isAr
                    ? 'مسودة مطالبة مالية قيد الاعتماد (Draft - Awaiting CEO Approval)'
                    : 'Draft Invoice Awaiting CEO Authorization'}
                </h3>
              </div>
              <p className="mt-1 text-xs opacity-85">
                {currentBackendInvoice?.status === 'Issued' || invoiceStatus === 'Paid'
                  ? isAr
                    ? `تم الترحيل بالكامل إلى الحسابات المدينة والإيرادات وضريبة القيمة المضافة. تم قفل الفاتورة نهائياً.`
                    : `Double-entry posting completed in General Ledger. Invoice is permanently locked.`
                  : invoiceStatus === 'Approved'
                  ? isAr
                    ? `تم اعتمادها بواسطة ${approvalDetails.approvedBy || brandConfig.ceoNameAr} بتاريخ ${approvalDetails.approvedAt?.slice(0, 10) || '2026-08-28'} | التوقيع الرقمي والختم الرسمي مفعلان بالكامل.`
                    : `Approved by ${approvalDetails.approvedBy || brandConfig.ceoNameEn}. Digital signature and company seal are permanently attached.`
                  : isAr
                  ? `مُعد الفاتورة: ${currentUser.fullNameAr || currentUser.fullName} (${currentUser.role}). تتضمن الفاتورة حالياً علامة مائية (DRAFT) حتى اعتمادها.`
                  : `Prepared by: ${currentUser.fullName} (${currentUser.role}). A "DRAFT" watermark is active until authorized.`}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {currentBackendInvoice?.move_id && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800/60 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-mono font-bold text-blue-900 dark:text-blue-300 shadow-xs">
                    <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{isAr ? 'معرف القيد المالي:' : 'GL Move ID:'} <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{currentBackendInvoice.move_id}</span></span>
                  </div>
                )}
                {currentBackendInvoice?.journal_entry_id && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-800/60 bg-violet-50/90 dark:bg-violet-950/40 px-2.5 py-1 text-[11px] font-mono font-bold text-violet-900 dark:text-violet-300 shadow-xs">
                    <BookOpen className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                    <span>{isAr ? 'سند دفتر الأستاذ:' : 'GL Ledger Voucher:'} <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{String(currentBackendInvoice.journal_entry_id).slice(0, 8)}...</span></span>
                  </div>
                )}
                {currentBackendInvoice?.public_token && (
                  <button
                    type="button"
                    onClick={() => copyMagicLink(currentBackendInvoice.public_token || undefined)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/40 px-2.5 py-1 text-[11px] font-mono font-bold text-indigo-900 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors shadow-xs"
                    title={isAr ? 'انقر لنسخ الرابط السحري' : 'Click to copy magic link'}
                  >
                    <Link2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>{isAr ? 'الرابط السحري:' : 'Magic Link:'} <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{currentBackendInvoice.public_token.slice(0, 8)}...</span></span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {invoiceStatus === 'Draft' && !isGuestUser && (
            <DynamicFieldRenderer entity="invoice" values={invoiceCustomAttributes} onChange={setInvoiceCustomAttributes} isAr={isAr} />
          )}

          {/* Action buttons based on state machine & role */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Draft Stage: Save Draft and Approve */}
            {invoiceStatus === 'Draft' && !isGuestUser && (
              <>
                <button
                  disabled={actionLoading || isUnbalanced}
                  onClick={handleSaveDraft}
                  className="group flex items-center gap-1.5 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  <HoverIcon className="h-4 w-4">
                    {actionLoading ? <RefreshCw className="h-full w-full animate-spin text-slate-600 dark:text-slate-400" /> : <Save className="h-full w-full text-slate-600 dark:text-slate-400" />}
                  </HoverIcon>
                  <span>{isAr ? 'حفظ كمسودة (Save Draft)' : 'Save Draft'}</span>
                </button>

                {(isAdmin || canApproveInvoices) && (
                  <button
                    disabled={actionLoading || isUnbalanced}
                    onClick={handleCeoApproveAndSign}
                    className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-600/30 hover:opacity-95 disabled:opacity-50 transition-all"
                  >
                    <HoverIcon className="h-4 w-4">
                      {actionLoading ? <RefreshCw className="h-full w-full animate-spin" /> : <Check className="h-full w-full" />}
                    </HoverIcon>
                    <span>{isAr ? 'اعتماد وتوقيع الفاتورة (Approve & Sign)' : 'Approve & Sign (CEO)'}</span>
                  </button>
                )}
              </>
            )}

            {/* Approved Stage: Issue to General Ledger */}
            {invoiceStatus === 'Approved' && (
              <>
                {!isGuestUser && (isAdmin || canApproveInvoices) && (
                  <button
                    disabled={actionLoading || isUnbalanced}
                    onClick={handleIssueToGeneralLedger}
                    className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-blue-600/30 hover:opacity-95 disabled:opacity-50 transition-all"
                  >
                    <HoverIcon className="h-4 w-4">
                      {actionLoading ? <RefreshCw className="h-full w-full animate-spin" /> : <BookOpen className="h-full w-full" />}
                    </HoverIcon>
                    <span>{isAr ? 'إصدار وترحيل لدفتر الأستاذ (Post to GL)' : 'Issue & Post to GL'}</span>
                  </button>
                )}

                <button
                  onClick={() => setIsExportShareModalOpen(true)}
                  className="group flex items-center gap-1.5 rounded-2xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 transition-colors"
                >
                  <HoverIcon className="h-4 w-4">
                    <Share2 className="h-full w-full" />
                  </HoverIcon>
                  <span>{isAr ? 'تصدير ومشاركة الحزمة' : 'Export & Share Bundle'}</span>
                </button>
              </>
            )}

            {/* Finalized Invoices: Post to Ledger Action */}
            {isFinalized && !isPostedToLedger && !isGuestUser && (isAdmin || canApproveInvoices) && (
              <button
                id="workflow-post-to-ledger-btn"
                disabled={actionLoading || isUnbalanced}
                onClick={handlePostToLedger}
                className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-600/30 hover:opacity-95 disabled:opacity-50 transition-all"
                title={isAr ? 'ترحيل قيود المبيعات والذمم المدينة لدفتر الأستاذ العام' : 'Post AR and Sales Revenue to General Ledger'}
              >
                <HoverIcon className="h-4 w-4">
                  {actionLoading ? <RefreshCw className="h-full w-full animate-spin" /> : <BookOpen className="h-full w-full" />}
                </HoverIcon>
                <span>{isAr ? 'ترحيل إلى دفتر الأستاذ (Post to Ledger)' : 'Post to Ledger'}</span>
              </button>
            )}

            {/* Finalized Invoices: Posted to Ledger Badge */}
            {isFinalized && isPostedToLedger && (
              <div
                id="workflow-posted-ledger-badge"
                className="flex items-center gap-1.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/50 px-4 py-2.5 text-xs font-black text-emerald-700 dark:text-emerald-400 shadow-xs"
                title={isAr ? 'تم ترحيل هذه الفاتورة إلى دفتر الأستاذ العام بنجاح' : 'Invoice is posted to General Ledger'}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {isAr ? 'مُرحل لدفتر الأستاذ' : 'Posted to Ledger'}
                  {currentBackendInvoice?.journal_entry_id && (
                    <span className="ml-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                      (#{String(currentBackendInvoice.journal_entry_id).slice(0, 8)})
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Issued / Paid Stage: Share actions */}
            {(invoiceStatus === 'Paid' || currentBackendInvoice?.status === 'Issued') && (
              <>
                <button
                  id="workflow-copy-magic-link-btn"
                  onClick={() => copyMagicLink(currentBackendInvoice?.public_token || undefined)}
                  className="flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-700 transition-colors"
                  title={isAr ? 'نسخ رابط الدفع المباشر السحري (Magic Link)' : 'Copy Public Magic Link'}
                >
                  <Link2 className="h-4 w-4" />
                  <span>{isAr ? 'نسخ الرابط السحري' : 'Copy Magic Link'}</span>
                </button>

                <button
                  onClick={() => setIsExportShareModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-2xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-orange-600/30 hover:bg-orange-700 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  <span>{isAr ? 'تصدير ومشاركة الحزمة' : 'Export & Share Bundle'}</span>
                </button>

                <button
                  onClick={handleLaunchWhatsApp}
                  className="flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                </button>

                <button
                  onClick={() => setIsEmailModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-2xl bg-slate-900 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  <span>{isAr ? 'بريد إلكتروني' : 'Email'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. Invoice Generator Controls Bar */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div>
            <label htmlFor="invoicing-customer-select" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? 'اختيار العميل المطلوب محاسبته *' : 'Select Customer *'}
            </label>
            <select
              id="invoicing-customer-select"
              name="customer_id"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="invoicing-month-select" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? 'الشهر المالي *' : 'Billing Month *'}
            </label>
            <select
              id="invoicing-month-select"
              name="billing_month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {getMonthName(m, language)} {selectedYear}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="invoicing-year-select" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? 'السنة المالية' : 'Year'}
            </label>
            <select
              id="invoicing-year-select"
              name="billing_year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          <div>
            <label htmlFor="invoicing-workflow-select" className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? 'حالة الاعتماد وسير العمل' : 'Workflow Stage'}
            </label>
            <select
              id="invoicing-workflow-select"
              name="workflow_stage"
              value={invoiceStatus}
              onChange={(e) => {
                const val = e.target.value as any;
                setInvoiceStatus(val);
                if (val === 'Approved') setIsSigned(true);
                else setIsSigned(false);
              }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-orange-950 dark:text-orange-300 focus:border-orange-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              <option value="Draft">{isAr ? 'مسودة أولية (Draft)' : 'Draft'}</option>
              <option value="Pending_Approval">{isAr ? 'قيد المراجعة والاعتماد (Pending)' : 'Pending Approval'}</option>
              <option value="Approved">{isAr ? 'معتمدة وموقعة (Approved & Signed)' : 'Approved & Signed'}</option>
              <option value="Paid">{isAr ? 'مسددة بالكامل (Paid)' : 'Paid'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading Indicator Banner */}
      {isLoadingBackend && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-orange-200 bg-orange-50/80 p-3.5 text-xs font-bold text-orange-900 shadow-xs animate-pulse no-print">
          <RefreshCw className="h-4 w-4 animate-spin text-orange-600 shrink-0" />
          <span>
            {isAr
              ? 'جاري تجميع حركات التوريد وتذاكر الميزان من قاعدة البيانات لحساب الفاتورة...'
              : 'Aggregating operational trips and scale tickets from backend database...'}
          </span>
        </div>
      )}

      {/* 4. Official Saudi ZATCA Tax Invoice Document (فاتورة ضريبية رسمية) */}
      <div
        ref={invoiceContainerRef}
        id="customer-tax-invoice-printable"
        className="relative overflow-hidden rounded-3xl border border-slate-300 bg-white p-8 sm:p-10 shadow-xl text-slate-900 print-container zatca-invoice-wrapper"
      >
        {/* Pre-Approval Watermark (Shown when status is Draft or Pending_Approval) */}
        {invoiceStatus !== 'Approved' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none overflow-hidden z-10">
            <div className="rotate-[-28deg] border-4 border-dashed border-rose-500/20 bg-rose-500/5 px-12 py-6 rounded-3xl text-center shadow-lg">
              <span className="text-3xl sm:text-5xl font-black text-rose-500/30 uppercase tracking-widest block font-mono">
                DRAFT / PENDING APPROVAL
              </span>
              <span className="text-xl sm:text-3xl font-black text-rose-500/30 block mt-2">
                مسودة - قيد الاعتماد والمراجعة
              </span>
            </div>
          </div>
        )}

        {/* Invoice Top Header with Official Letterhead */}
        <OfficialLetterheadHeader
          brandConfig={brandConfig}
          documentTypeAr="فاتورة ضريبية معتمدة"
          documentTypeEn="TAX INVOICE"
          documentNumber={invoiceNumber}
          issueDate={issueDate}
          isAr={isAr}
        />

        {/* Customer Information Block */}
        <div className="my-6 grid grid-cols-1 gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-200 sm:grid-cols-2">
          <div>
            <span className="text-[11px] font-bold text-orange-800 uppercase">
              {isAr ? 'بيانات العميل المستلم (Billed To):' : 'Billed To:'}
            </span>
            <h3 className="mt-1 text-sm font-black text-slate-900">
              {selectedCustomer?.customerName}
            </h3>
            <p className="text-xs text-slate-600">{selectedCustomer?.customerNameEn}</p>
            <p className="mt-1 text-xs text-slate-700">
              {isAr ? 'العنوان:' : 'Address:'} {selectedCustomer?.address || 'المملكة العربية السعودية'}
            </p>
          </div>

          <div className="space-y-1 text-xs">
            <p>
              <span className="text-slate-500">{isAr ? 'الرقم الضريبي للعميل:' : 'Customer VAT:'}</span>{' '}
              <strong className="font-mono text-slate-900" dir="ltr"><span className="inline-block unicode-bidi-isolate">{selectedCustomer?.taxNumber}</span></strong>
            </p>
            <p>
              <span className="text-slate-500">{isAr ? 'رقم السجل التجاري:' : 'CR Number:'}</span>{' '}
              <strong className="font-mono text-slate-900" dir="ltr"><span className="inline-block unicode-bidi-isolate">{selectedCustomer?.crNumber || '1010XXXXXX'}</span></strong>
            </p>
            <p>
              <span className="text-slate-500">{isAr ? 'الشخص المسؤول:' : 'Contact Person:'}</span>{' '}
              <strong>{selectedCustomer?.contactPerson}</strong> ({selectedCustomer?.phone})
            </p>
            <p>
              <span className="text-slate-500">{isAr ? 'دورة التوريد:' : 'Supply Cycle:'}</span>{' '}
              <strong className="text-orange-950">{getMonthName(selectedMonth, language)} {selectedYear}</strong>
            </p>
          </div>
        </div>

        {/* Aggregate Items Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="border-y-2 border-slate-900 bg-slate-100 font-bold text-slate-900">
                <th className="py-3 px-3 text-start">#</th>
                <th className="py-3 px-3 text-start">{isAr ? 'نوع المادة / البند' : 'Material Description'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'عدد الرحلات' : 'Trips'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'الوزن المحمل (MT طن)' : 'Loaded (MT)'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'الوزن الصافي (MT طن)' : 'Delivered (MT)'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'الفاقد (MT طن)' : 'Loss (MT)'}</th>
                <th className="py-3 px-3 text-end">{isAr ? 'سعر الوحدة (ر.س/MT طن)' : 'Rate / MT'}</th>
                <th className="py-3 px-3 text-end">{isAr ? 'المبلغ (بدون ضريبة)' : 'Amount'}</th>
                <th className="py-3 px-3 text-end">{isAr ? 'الضريبة 15%' : 'VAT 15%'}</th>
                <th className="py-3 px-3 text-end">{isAr ? 'الإجمالي (ر.س)' : 'Total (SAR)'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoadingBackend ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={`inv-skel-${idx}`} className="animate-pulse">
                    <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-4" /></td>
                    <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-36" /></td>
                    <td className="py-3 px-3 text-center"><div className="h-4 bg-slate-200 rounded w-10 mx-auto" /></td>
                    <td className="py-3 px-3 text-center"><div className="h-4 bg-slate-200 rounded w-14 mx-auto" /></td>
                    <td className="py-3 px-3 text-center"><div className="h-4 bg-slate-200 rounded w-14 mx-auto" /></td>
                    <td className="py-3 px-3 text-center"><div className="h-4 bg-slate-200 rounded w-10 mx-auto" /></td>
                    <td className="py-3 px-3 text-end"><div className="h-4 bg-slate-200 rounded w-16 ms-auto" /></td>
                    <td className="py-3 px-3 text-end"><div className="h-4 bg-slate-200 rounded w-20 ms-auto" /></td>
                    <td className="py-3 px-3 text-end"><div className="h-4 bg-slate-200 rounded w-16 ms-auto" /></td>
                    <td className="py-3 px-3 text-end"><div className="h-4 bg-slate-200 rounded w-24 ms-auto" /></td>
                  </tr>
                ))
              ) : invoiceItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    {isAr ? 'لا توجد رحلات مسجلة لهذا العميل في الشهر المحدد' : 'No trips found for this customer and month'}
                  </td>
                </tr>
              ) : (
                invoiceItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-mono">{idx + 1}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">{item.materialType}</td>
                    <td className="py-3 px-3 text-center text-slate-700">{item.tripsCount}</td>
                    <td className="py-3 px-3 text-center text-slate-600">{item.loadedWeight}</td>
                    <td className="py-3 px-3 text-center font-bold text-slate-900">{item.deliveredWeight}</td>
                    <td className="py-3 px-3 text-center text-rose-600 font-semibold">{item.wastageWeight}</td>
                    <td className="py-3 px-3 text-end font-mono">{item.unitPrice}</td>
                    <td className="py-3 px-3 text-end font-semibold text-slate-900">{formatCurrency(item.subtotal, language)}</td>
                    <td className="py-3 px-3 text-end text-slate-700">{formatCurrency(item.vatAmount, language)}</td>
                    <td className="py-3 px-3 text-end font-black text-neutral-950">{formatCurrency(item.total, language)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Invoice Summary & ZATCA QR Code Block */}
        <div className="mt-8 grid grid-cols-1 gap-6 border-t-2 border-slate-900 pt-6 sm:grid-cols-2">
          {/* ZATCA QR Code & Bank Accounts */}
          <div className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-2 border border-slate-300">
              <QRCodeSVG
                value={zatcaQrBase64}
                size={80}
                level="M"
                includeMargin={false}
                className="h-20 w-20 object-contain rounded"
              />
              <span className="mt-1 text-[9px] font-mono text-slate-500 font-bold">ZATCA e-Invoice QR</span>
            </div>

            <div className="space-y-1 text-[11px] text-slate-700">
              <p className="font-bold text-slate-900">{isAr ? 'الحساب البنكي المعتمد للتحويل:' : 'Approved Bank Account:'}</p>
              <p>{brandConfig.bankNameAr} ({brandConfig.bankNameEn})</p>
              <p className="font-mono text-orange-950 font-bold" dir="ltr"><span className="inline-block unicode-bidi-isolate">IBAN: {brandConfig.iban}</span></p>
              <p className="text-[10px] text-slate-500 pt-1">
                {isAr
                  ? 'ملاحظة: يرجى تضمين رقم الفاتورة في وصف التحويل البنكي.'
                  : 'Please include invoice number in bank transfer description.'}
              </p>
            </div>
          </div>

          {/* Grand Totals Calculation */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>{isAr ? 'المجموع الخاضع للضريبة (الإجمالي الفرعي):' : 'Total Taxable Amount (Subtotal):'}</span>
              <strong className="text-slate-900">{formatCurrency(subtotal, language)}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>{isAr ? 'ضريبة القيمة المضافة (15%):' : 'Value Added Tax (15%):'}</span>
              <strong className="text-slate-900">{formatCurrency(totalVat, language)}</strong>
            </div>
            <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-sm">
              <span className="font-black text-slate-900">{isAr ? 'إجمالي المبلغ المستحق:' : 'Total Amount Due:'}</span>
              <strong className="font-black text-orange-950 text-base">{formatCurrency(grandTotal, language)}</strong>
            </div>

            {/* Arabic Legal Tafqeet Wording */}
            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/80 p-3 text-xs">
              <span className="font-bold text-orange-950 block text-[10px] uppercase mb-0.5">
                {isAr ? 'المبلغ كتابةً (Tafqeet):' : 'Amount in Legal Words:'}
              </span>
              <p className="font-black text-slate-950 text-xs sm:text-sm font-serif leading-relaxed">
                {amountInWordsAr}
              </p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                {amountInWordsEn}
              </p>
            </div>
          </div>
        </div>

        {/* Official Digital Signatures & Corporate Stamp Area */}
        <div className="mt-12 grid grid-cols-3 gap-4 border-t border-slate-200 pt-6 text-center text-xs text-slate-600">
          {/* Prepared by */}
          <div>
            <p className="font-bold text-slate-800">{isAr ? 'إعداد المحاسب المسؤول' : 'Prepared By'}</p>
            <p className="text-[11px] text-slate-700 font-medium mt-1">
              {customerInvoiceObject.preparedBy || 'ياسر العتيبي'}
            </p>
            <div className="mt-2 text-[10px] text-slate-400 font-mono">
              {issueDate} 09:30 AM
            </div>
          </div>

          {/* CEO Approval & Digital Signature */}
          <div>
            <p className="font-bold text-slate-800">{isAr ? 'اعتماد المدير التنفيذي العام' : 'CEO Authorization'}</p>
            <p className="text-[11px] text-neutral-950 font-bold mt-1">
              {brandConfig.ceoNameAr} ({brandConfig.ceoTitleAr})
            </p>
            {isSigned ? (
              <div className="mt-1 flex flex-col items-center">
                <span className="text-[10px] font-mono text-emerald-700 font-black">
                  [DIGITALLY SIGNED & VERIFIED]
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  {approvalDetails.verificationHash || 'MYN-SHA256-7A8B9C0D'}
                </span>
              </div>
            ) : (
              <div className="h-10 border-b border-dashed border-amber-300 mx-auto w-32 mt-2 flex items-center justify-center text-[10px] text-amber-600">
                {isAr ? 'بانتظار الاعتماد' : 'Pending'}
              </div>
            )}
          </div>

          {/* Official Stamp */}
          <div>
            <p className="font-bold text-slate-800">{isAr ? 'ختم الشركة الرسمي' : 'Official Seal'}</p>
            <div className="h-16 w-16 rounded-full border-2 border-orange-600/60 border-dashed mx-auto mt-1 flex flex-col items-center justify-center text-[9px] text-orange-700 font-black shadow-xs">
              <span>ميون للمقاولات</span>
              <span className="text-[7px] text-orange-500 font-mono">MEAYON CO.</span>
            </div>
          </div>
        </div>

        {/* Official Corporate Letterhead Footer */}
        <OfficialLetterheadFooter brandConfig={brandConfig} isAr={isAr} />
      </div>

      {/* Advanced PDF & Bundled Attachments Export/Share Modal */}
      <InvoiceExportShareModal
        isOpen={isExportShareModalOpen}
        onClose={() => setIsExportShareModalOpen(false)}
        invoice={customerInvoiceObject}
        matchingTrips={matchingTrips}
        brandConfig={brandConfig}
        customerPhone={selectedCustomer?.phone}
        customerEmail={selectedCustomer?.email}
        language={language}
        invoiceElementRef={invoiceContainerRef}
      />

      {/* Dynamic Email Client Launcher Modal */}
      <DynamicEmailLauncherModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        invoice={customerInvoiceObject}
        customerEmail={selectedCustomer?.email || 'procurement@unibeton.sa'}
        customerName={selectedCustomer?.customerName || ''}
        language={language}
      />

      {/* Multi-Attachment Modal */}
      <MultiAttachmentModal
        isOpen={isAttachmentModalOpen}
        onClose={() => setIsAttachmentModalOpen(false)}
        recordTitle={isAr ? `مرفقات الفاتورة ${invoiceNumber}` : `Attachments for ${invoiceNumber}`}
        recordType="Invoice"
        recordId={invoiceNumber}
        existingAttachments={invoiceAttachments}
        onAddAttachment={(att) => {
          const newAtt: DocumentAttachment = {
            ...att,
            id: `att-${Date.now()}`,
            uploadedAt: new Date().toISOString(),
            uploadedBy: currentUser.fullNameAr || currentUser.fullName,
          };
          setInvoiceAttachments((prev) => [...prev, newAtt]);
        }}
        onDeleteAttachment={(attId) => {
          setInvoiceAttachments((prev) => prev.filter((a) => a.id !== attId));
        }}
      />

      {/* Live Print Preview & Export Studio Modal */}
      <ExportPrintModal
        isOpen={isExportPrintModalOpen}
        onClose={() => setIsExportPrintModalOpen(false)}
        initialDocType="vat-invoice"
        initialCustomerId={selectedCustomerId}
        initialMonth={selectedMonth}
        initialYear={selectedYear}
      />

      {/* Universal Bulk Import Modal (REM-P7) */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        defaultCategory="operations"
      />
    </div>
  );
};
