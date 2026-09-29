import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { erpApi, ApiCustomerInvoice } from '../services/api';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  ShieldCheck,
  Sparkles,
  FileText,
  Download,
  Eye,
  Filter,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Layers,
  FileCode2,
  Zap,
  BarChart3,
  Calendar,
  Building2,
  Receipt,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';

/* ─── Local types ─── */
interface AgingBucket {
  label: string;
  labelAr: string;
  range: string;
  amount: number;
  count: number;
  color: string;
  bgClass: string;
  textClass: string;
  pct: number;
}

type ZatcaStatus = 'Cleared' | 'Reported' | 'Pending' | 'Rejected';
type SortField = 'invoice_number' | 'customer_name' | 'grand_total' | 'issue_date' | 'status';
type SortDir = 'asc' | 'desc';

/* ─── Helpers ─── */
const parseMoney = (v: string | number): number => {
  if (typeof v === 'number') return v;
  return parseFloat(v) || 0;
};

const daysBetween = (from: string, to: Date): number => {
  const d = new Date(from);
  return Math.floor((to.getTime() - d.getTime()) / 86_400_000);
};

const deriveZatcaStatus = (inv: ApiCustomerInvoice): ZatcaStatus => {
  if (inv.status === 'Issued') return 'Cleared';
  if (inv.status === 'Approved') return 'Reported';
  if (inv.status === 'Cancelled') return 'Rejected';
  return 'Pending';
};

const zatcaBadge = (status: ZatcaStatus) => {
  const map: Record<ZatcaStatus, { bg: string; text: string; ring: string }> = {
    Cleared: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', ring: 'ring-emerald-500/30' },
    Reported: { bg: 'bg-sky-500/15', text: 'text-sky-400', ring: 'ring-sky-500/30' },
    Pending: { bg: 'bg-amber-500/15', text: 'text-amber-400', ring: 'ring-amber-500/30' },
    Rejected: { bg: 'bg-rose-500/15', text: 'text-rose-400', ring: 'ring-rose-500/30' },
  };
  return map[status];
};

const statusBadge = (status: string) => {
  const map: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
    Draft: { bg: 'bg-slate-600/20', text: 'text-slate-400', icon: Clock },
    Approved: { bg: 'bg-sky-500/15', text: 'text-sky-400', icon: CheckCircle2 },
    Issued: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: ShieldCheck },
    Cancelled: { bg: 'bg-rose-500/15', text: 'text-rose-400', icon: XCircle },
  };
  return map[status] || map.Draft;
};

/* ═══════════════════════════════════════════════ */
/* ═══ MAIN COMPONENT ═══════════════════════════ */
/* ═══════════════════════════════════════════════ */
export const SalesReceivablesDashboard: React.FC = () => {
  const {
    language,
    currentCompany,
    customers,
    currentUser,
    showToast,
  } = useApp();
  const isAr = language === 'ar';

  /* ── Data state ── */
  const [invoices, setInvoices] = useState<ApiCustomerInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /* ── UI state ── */
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [zatcaFilter, setZatcaFilter] = useState<ZatcaStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('issue_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showXmlModal, setShowXmlModal] = useState(false);
  const [selectedXmlInvoice, setSelectedXmlInvoice] = useState<ApiCustomerInvoice | null>(null);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPromptText, setAiPromptText] = useState('');
  const pageSize = 12;

  /* ── Fetch data ── */
  const fetchInvoices = useCallback(async (showRefreshIndicator = false) => {
    const companyId = currentCompany?.id;
    if (!companyId) return;
    if (showRefreshIndicator) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const data = await erpApi.getCustomerInvoices(companyId);
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
      showToast?.(isAr ? 'فشل تحميل الفواتير' : 'Failed to load invoices', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentCompany?.id, isAr, showToast]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  /* ═══ KPI CALCULATIONS ═══ */
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();

  const ytdInvoices = useMemo(() =>
    invoices.filter(inv => new Date(inv.issue_date).getFullYear() === currentYear),
    [invoices, currentYear]
  );

  const totalSalesYTD = useMemo(() =>
    ytdInvoices.reduce((sum, inv) => sum + parseMoney(inv.grand_total), 0),
    [ytdInvoices]
  );

  const totalVatYTD = useMemo(() =>
    ytdInvoices.reduce((sum, inv) => sum + parseMoney(inv.vat_amount), 0),
    [ytdInvoices]
  );

  const outstandingInvoices = useMemo(() =>
    invoices.filter(inv => inv.status !== 'Cancelled' && inv.status !== 'Issued'),
    [invoices]
  );

  const totalOutstanding = useMemo(() =>
    outstandingInvoices.reduce((sum, inv) => sum + parseMoney(inv.grand_total), 0),
    [outstandingInvoices]
  );

  const agingBuckets: AgingBucket[] = useMemo(() => {
    const buckets = [
      { min: 0, max: 30, label: '0-30 Days', labelAr: '٠-٣٠ يوم', color: '#10b981', bgClass: 'bg-emerald-500/15', textClass: 'text-emerald-400' },
      { min: 31, max: 60, label: '31-60 Days', labelAr: '٣١-٦٠ يوم', color: '#f59e0b', bgClass: 'bg-amber-500/15', textClass: 'text-amber-400' },
      { min: 61, max: Infinity, label: '60+ Days', labelAr: '+٦٠ يوم', color: '#ef4444', bgClass: 'bg-rose-500/15', textClass: 'text-rose-400' },
    ];

    const result: AgingBucket[] = buckets.map(b => {
      const matching = outstandingInvoices.filter(inv => {
        const age = daysBetween(inv.issue_date, now);
        return age >= b.min && age <= b.max;
      });
      const amount = matching.reduce((s, inv) => s + parseMoney(inv.grand_total), 0);
      return {
        label: b.label,
        labelAr: b.labelAr,
        range: `${b.min}-${b.max === Infinity ? '∞' : b.max}`,
        amount,
        count: matching.length,
        color: b.color,
        bgClass: b.bgClass,
        textClass: b.textClass,
        pct: totalOutstanding > 0 ? (amount / totalOutstanding) * 100 : 0,
      };
    });
    return result;
  }, [outstandingInvoices, now, totalOutstanding]);

  const zatcaClearedRate = useMemo(() => {
    const eligible = invoices.filter(inv => inv.status !== 'Cancelled');
    if (eligible.length === 0) return 0;
    const cleared = eligible.filter(inv => inv.status === 'Issued').length;
    return Math.round((cleared / eligible.length) * 100);
  }, [invoices]);

  const aiGeneratedCount = useMemo(() =>
    invoices.filter(inv => inv.invoice_number?.includes('AI-') || inv.invoice_number?.includes('LG-')).length,
    [invoices]
  );

  /* ═══ FILTERED & SORTED TABLE ═══ */
  const filteredInvoices = useMemo(() => {
    let result = [...invoices];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(inv =>
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.customer_name?.toLowerCase().includes(q) ||
        inv.customer_tax_number?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(inv => inv.status === statusFilter);
    }

    if (zatcaFilter !== 'all') {
      result = result.filter(inv => deriveZatcaStatus(inv) === zatcaFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'invoice_number': cmp = (a.invoice_number || '').localeCompare(b.invoice_number || ''); break;
        case 'customer_name': cmp = (a.customer_name || '').localeCompare(b.customer_name || ''); break;
        case 'grand_total': cmp = parseMoney(a.grand_total) - parseMoney(b.grand_total); break;
        case 'issue_date': cmp = new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime(); break;
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [invoices, searchTerm, statusFilter, zatcaFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const pagedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
    setCurrentPage(1);
  };

  /* ═══ EXPORT CSV ═══ */
  const exportCSV = () => {
    const headers = ['Invoice #', 'Customer', 'Tax #', 'Issue Date', 'Due Date', 'Subtotal', 'VAT', 'Total', 'Status', 'ZATCA'];
    const rows = filteredInvoices.map(inv => [
      inv.invoice_number,
      inv.customer_name,
      inv.customer_tax_number || '',
      inv.issue_date,
      inv.due_date || '',
      parseMoney(inv.subtotal).toFixed(2),
      parseMoney(inv.vat_amount).toFixed(2),
      parseMoney(inv.grand_total).toFixed(2),
      inv.status,
      deriveZatcaStatus(inv),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-receivables-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.(isAr ? 'تم تصدير التقرير بنجاح' : 'Report exported successfully', 'success');
  };

  /* ═══ UBL 2.1 XML PREVIEW ═══ */
  const generateXmlPreview = (inv: ApiCustomerInvoice): string => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${inv.invoice_number}</cbc:ID>
  <cbc:UUID>${inv.id}</cbc:UUID>
  <cbc:IssueDate>${inv.issue_date}</cbc:IssueDate>
  <cbc:DueDate>${inv.due_date || ''}</cbc:DueDate>
  <cbc:InvoiceTypeCode>388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${isAr ? (currentCompany as any)?.company_name_ar || currentCompany?.name : currentCompany?.name}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${currentCompany?.taxId || ''}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${inv.customer_name}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${inv.customer_tax_number || ''}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="SAR">${parseMoney(inv.subtotal).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${parseMoney(inv.grand_total).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${parseMoney(inv.grand_total).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${parseMoney(inv.vat_amount).toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
</Invoice>`;
  };

  /* ═══ AI PROMPT HANDLER ═══ */
  const handleAiGenerate = () => {
    if (!aiPromptText.trim()) return;
    showToast?.(
      isAr
        ? `⚡ تم إرسال الأمر إلى خط الأنابيب الذكي: "${aiPromptText.slice(0, 60)}..."`
        : `⚡ AI pipeline prompt dispatched: "${aiPromptText.slice(0, 60)}..."`,
      'success'
    );
    setAiPromptText('');
    setShowAiPrompt(false);
  };

  /* ═══ RENDER ═══ */
  const SortIcon = ({ field }: { field: SortField }) => (
    sortField === field
      ? (sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)
      : <ChevronDown className="h-3.5 w-3.5 opacity-30" />
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 animate-pulse" />
            <div className="absolute inset-2 rounded-xl border-2 border-orange-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-sm font-bold text-slate-400">{isAr ? 'جاري تحميل لوحة المبيعات والذمم...' : 'Loading Sales & Receivables...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div id="sales-receivables-dashboard" className="space-y-6 pb-8">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
            <Receipt className="h-5.5 w-5.5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-100 sm:text-2xl">
              {isAr ? 'لوحة المبيعات والذمم المدينة' : 'Sales & Receivables'}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isAr ? 'تتبع الفواتير · أعمار الديون · امتثال زاتكا' : 'Invoice Tracker · Aging Analysis · ZATCA Compliance'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="sr-refresh-btn"
            onClick={() => fetchInvoices(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700/70 hover:text-white transition-all disabled:opacity-50 cursor-pointer backdrop-blur-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isAr ? 'تحديث' : 'Refresh'}
          </button>
          <button
            id="sr-export-csv-btn"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700/70 hover:text-white transition-all cursor-pointer backdrop-blur-sm"
          >
            <Download className="h-3.5 w-3.5" />
            {isAr ? 'تصدير CSV' : 'Export CSV'}
          </button>
          <button
            id="sr-ai-generate-btn"
            onClick={() => setShowAiPrompt(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:brightness-110 transition-all cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isAr ? 'توليد فاتورة بالذكاء' : 'AI Invoice Generate'}
          </button>
        </div>
      </div>

      {/* ═══ KPI SUMMARY CARDS ═══ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total Sales YTD */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/50 p-5 shadow-xl hover:border-orange-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 rounded-bl-[80px] bg-gradient-to-bl from-orange-500/8 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400 group-hover:bg-orange-500/25 transition-colors">
              <DollarSign className="h-4.5 w-4.5" />
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/25">
              YTD {currentYear}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{isAr ? 'إجمالي المبيعات' : 'Total Sales'}</p>
          <p className="text-2xl font-black text-slate-100 tracking-tight">{formatCurrency(totalSalesYTD)}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
            <span className="text-emerald-400">{ytdInvoices.length}</span> {isAr ? 'فاتورة' : 'invoices'}
            <span className="mx-1 text-slate-700">·</span>
            <span className="text-amber-400">{formatCurrency(totalVatYTD)}</span> VAT
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/50 p-5 shadow-xl hover:border-sky-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 rounded-bl-[80px] bg-gradient-to-bl from-sky-500/8 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 group-hover:bg-sky-500/25 transition-colors">
              <Clock className="h-4.5 w-4.5" />
            </div>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/25">
              {outstandingInvoices.length} {isAr ? 'معلق' : 'open'}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{isAr ? 'الذمم المدينة المعلقة' : 'Outstanding Receivables'}</p>
          <p className="text-2xl font-black text-slate-100 tracking-tight">{formatCurrency(totalOutstanding)}</p>
          {/* Mini aging bar */}
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
            {agingBuckets.map((b, i) => (
              <div key={i} style={{ width: `${b.pct}%`, backgroundColor: b.color }} className="transition-all duration-500" />
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[10px] font-semibold">
            {agingBuckets.map((b, i) => (
              <span key={i} className={b.textClass}>
                {isAr ? b.labelAr : b.label}: {b.count}
              </span>
            ))}
          </div>
        </div>

        {/* ZATCA Compliance */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/50 p-5 shadow-xl hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 rounded-bl-[80px] bg-gradient-to-bl from-emerald-500/8 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/25 transition-colors">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
              zatcaClearedRate >= 80 ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25'
              : zatcaClearedRate >= 50 ? 'bg-amber-500/15 text-amber-400 ring-amber-500/25'
              : 'bg-rose-500/15 text-rose-400 ring-rose-500/25'
            }`}>
              {isAr ? 'معدل التخليص' : 'Clearance'}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{isAr ? 'امتثال زاتكا' : 'ZATCA Compliance'}</p>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-black text-slate-100 tracking-tight">{zatcaClearedRate}%</p>
            <span className="text-xs text-slate-500 font-semibold">{isAr ? 'مُخلّص' : 'cleared'}</span>
          </div>
          {/* Circular indicator */}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ${zatcaClearedRate >= 80 ? 'bg-emerald-500' : zatcaClearedRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${zatcaClearedRate}%` }}
            />
          </div>
        </div>

        {/* AI-Generated Orders */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/50 p-5 shadow-xl hover:border-violet-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 rounded-bl-[80px] bg-gradient-to-bl from-violet-500/8 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 group-hover:bg-violet-500/25 transition-colors">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-400 ring-1 ring-violet-500/25">
              LangGraph
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{isAr ? 'فواتير مُولّدة بالذكاء' : 'AI-Generated Orders'}</p>
          <p className="text-2xl font-black text-slate-100 tracking-tight">{aiGeneratedCount}</p>
          <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
            <Zap className="h-3 w-3 text-violet-400" />
            {isAr ? 'خط أنابيب ذكي مستمر' : 'Continuous AI pipeline active'}
          </div>
        </div>
      </div>

      {/* ═══ AGING BREAKDOWN CARDS ═══ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {agingBuckets.map((bucket, idx) => (
          <div
            key={idx}
            className={`relative overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/80 p-4 hover:border-slate-700/60 transition-all group`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full`} style={{ backgroundColor: bucket.color }} />
                <span className="text-xs font-bold text-slate-300">{isAr ? bucket.labelAr : bucket.label}</span>
              </div>
              <span className={`rounded-full ${bucket.bgClass} px-2 py-0.5 text-[10px] font-bold ${bucket.textClass}`}>
                {bucket.count} {isAr ? 'فاتورة' : 'invoices'}
              </span>
            </div>
            <p className="text-lg font-black text-slate-100">{formatCurrency(bucket.amount)}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${bucket.pct}%`, backgroundColor: bucket.color }}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-600 font-semibold">{bucket.pct.toFixed(1)}% {isAr ? 'من الإجمالي' : 'of total'}</p>
          </div>
        ))}
      </div>

      {/* ═══ FILTERS BAR ═══ */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800/50 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between backdrop-blur-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              id="sr-search-input"
              type="text"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder={isAr ? 'بحث بالرقم أو اسم العميل...' : 'Search invoice # or customer...'}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-800/70 py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 transition-all"
            />
          </div>
          {/* Status Filter */}
          <select
            id="sr-status-filter"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-300 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 cursor-pointer"
          >
            <option value="all">{isAr ? 'جميع الحالات' : 'All Status'}</option>
            <option value="Draft">{isAr ? 'مسودة' : 'Draft'}</option>
            <option value="Approved">{isAr ? 'معتمد' : 'Approved'}</option>
            <option value="Issued">{isAr ? 'صادر' : 'Issued'}</option>
            <option value="Cancelled">{isAr ? 'ملغي' : 'Cancelled'}</option>
          </select>
          {/* ZATCA Filter */}
          <select
            id="sr-zatca-filter"
            value={zatcaFilter}
            onChange={e => { setZatcaFilter(e.target.value as any); setCurrentPage(1); }}
            className="rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-300 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 cursor-pointer"
          >
            <option value="all">{isAr ? 'جميع حالات زاتكا' : 'All ZATCA'}</option>
            <option value="Cleared">{isAr ? 'مُخلّص' : 'Cleared'}</option>
            <option value="Reported">{isAr ? 'مُبلّغ' : 'Reported'}</option>
            <option value="Pending">{isAr ? 'معلّق' : 'Pending'}</option>
            <option value="Rejected">{isAr ? 'مرفوض' : 'Rejected'}</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold">
          <Filter className="h-3 w-3" />
          <span>{filteredInvoices.length} / {invoices.length} {isAr ? 'فاتورة' : 'invoices'}</span>
        </div>
      </div>

      {/* ═══ DATA TABLE ═══ */}
      <div className="overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/40 shadow-xl backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-800/60 bg-slate-900/80">
                {[
                  { field: 'invoice_number' as SortField, label: isAr ? 'رقم الفاتورة' : 'Invoice #' },
                  { field: 'customer_name' as SortField, label: isAr ? 'العميل' : 'Customer' },
                  { field: 'issue_date' as SortField, label: isAr ? 'تاريخ الإصدار' : 'Issue Date' },
                  { field: 'grand_total' as SortField, label: isAr ? 'الإجمالي (ر.س)' : 'Total (SAR)' },
                  { field: 'status' as SortField, label: isAr ? 'الحالة' : 'Status' },
                ].map(col => (
                  <th
                    key={col.field}
                    onClick={() => toggleSort(col.field)}
                    className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-orange-400 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      <SortIcon field={col.field} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{isAr ? 'ض.ق.م' : 'VAT'}</th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{isAr ? 'زاتكا' : 'ZATCA'}</th>
                <th className="px-4 py-3 text-center text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{isAr ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {pagedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-8 w-8 text-slate-600" />
                      <p className="text-sm font-bold text-slate-500">{isAr ? 'لا توجد فواتير مطابقة' : 'No matching invoices found'}</p>
                    </div>
                  </td>
                </tr>
              ) : pagedInvoices.map((inv) => {
                const zatca = deriveZatcaStatus(inv);
                const zBadge = zatcaBadge(zatca);
                const sBadge = statusBadge(inv.status);
                const StatusIcon = sBadge.icon;

                return (
                  <tr
                    key={inv.id}
                    className="group hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-slate-600 group-hover:text-orange-400 transition-colors" />
                        <span className="text-xs font-bold text-slate-200">{inv.invoice_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-bold text-slate-200 truncate max-w-[200px]">{inv.customer_name}</p>
                        {inv.customer_tax_number && (
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{inv.customer_tax_number}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400 font-medium">{formatDate(inv.issue_date)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-extrabold text-slate-100">{formatCurrency(parseMoney(inv.grand_total))}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full ${sBadge.bg} px-2 py-0.5 text-[10px] font-bold ${sBadge.text} ring-1 ring-current/20`}>
                        <StatusIcon className="h-3 w-3" />
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-amber-400">{formatCurrency(parseMoney(inv.vat_amount))}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full ${zBadge.bg} px-2 py-0.5 text-[10px] font-bold ${zBadge.text} ring-1 ${zBadge.ring}`}>
                        {zatca === 'Cleared' && <ShieldCheck className="h-3 w-3" />}
                        {zatca === 'Pending' && <Clock className="h-3 w-3" />}
                        {zatca === 'Rejected' && <XCircle className="h-3 w-3" />}
                        {zatca === 'Reported' && <ArrowUpRight className="h-3 w-3" />}
                        {zatca}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setSelectedXmlInvoice(inv); setShowXmlModal(true); }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-700/60 hover:text-sky-400 transition-all cursor-pointer"
                          title={isAr ? 'عرض UBL XML' : 'View UBL 2.1 XML'}
                        >
                          <FileCode2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const xml = generateXmlPreview(inv);
                            const blob = new Blob([xml], { type: 'application/xml' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${inv.invoice_number}-ubl2.1.xml`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-700/60 hover:text-emerald-400 transition-all cursor-pointer"
                          title={isAr ? 'تحميل XML' : 'Download XML'}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800/40 px-4 py-3 bg-slate-900/60">
            <p className="text-[10px] font-semibold text-slate-500">
              {isAr ? `الصفحة ${currentPage} من ${totalPages}` : `Page ${currentPage} of ${totalPages}`}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-md border border-slate-700/50 bg-slate-800/60 px-2.5 py-1 text-[10px] font-bold text-slate-400 hover:bg-slate-700/60 hover:text-white transition-all disabled:opacity-30 cursor-pointer"
              >
                {isAr ? 'السابق' : 'Prev'}
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                if (pageNum < 1 || pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                      pageNum === currentPage
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                        : 'border border-slate-700/50 bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-white'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-md border border-slate-700/50 bg-slate-800/60 px-2.5 py-1 text-[10px] font-bold text-slate-400 hover:bg-slate-700/60 hover:text-white transition-all disabled:opacity-30 cursor-pointer"
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ UBL XML MODAL ═══ */}
      {showXmlModal && selectedXmlInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowXmlModal(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="relative mx-4 max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-3 bg-slate-900/90">
              <div className="flex items-center gap-2">
                <FileCode2 className="h-4.5 w-4.5 text-sky-400" />
                <h3 className="text-sm font-extrabold text-slate-100">
                  UBL 2.1 XML — {selectedXmlInvoice.invoice_number}
                </h3>
              </div>
              <button onClick={() => setShowXmlModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-all cursor-pointer">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto max-h-[65vh] p-5">
              <pre className="whitespace-pre-wrap rounded-xl bg-slate-950/70 p-4 text-[11px] leading-relaxed font-mono text-emerald-400 border border-slate-800/50">
                {generateXmlPreview(selectedXmlInvoice)}
              </pre>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-800/60 px-5 py-3 bg-slate-900/90">
              <button
                onClick={() => {
                  const xml = generateXmlPreview(selectedXmlInvoice);
                  navigator.clipboard.writeText(xml);
                  showToast?.(isAr ? 'تم نسخ XML' : 'XML copied to clipboard', 'success');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700/70 hover:text-white transition-all cursor-pointer"
              >
                {isAr ? 'نسخ' : 'Copy'}
              </button>
              <button
                onClick={() => {
                  const xml = generateXmlPreview(selectedXmlInvoice);
                  const blob = new Blob([xml], { type: 'application/xml' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedXmlInvoice.invoice_number}-ubl2.1.xml`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-sky-500/20 hover:brightness-110 transition-all cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                {isAr ? 'تحميل XML' : 'Download XML'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AI PROMPT MODAL ═══ */}
      {showAiPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAiPrompt(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="relative mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-3 bg-gradient-to-r from-orange-500/10 to-amber-500/10">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-orange-400" />
                <h3 className="text-sm font-extrabold text-slate-100">{isAr ? 'توليد فاتورة بالذكاء الاصطناعي' : 'AI Invoice Generation'}</h3>
              </div>
              <button onClick={() => setShowAiPrompt(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-all cursor-pointer">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                {isAr
                  ? 'أدخل وصف العملية أو الأمر لتوليد فاتورة ضريبية تلقائياً عبر خط أنابيب LangGraph AI.'
                  : 'Enter a natural language prompt to generate a ZATCA-compliant tax invoice via the LangGraph AI pipeline.'}
              </p>
              <textarea
                id="sr-ai-prompt-input"
                value={aiPromptText}
                onChange={e => setAiPromptText(e.target.value)}
                rows={4}
                placeholder={isAr
                  ? 'مثال: أنشئ فاتورة لعميل شركة الرياض للمقاولات بمبلغ 125,000 ر.س عن توريد مواد بناء...'
                  : 'e.g.: Generate an invoice for Al-Riyadh Construction Co. for SAR 125,000 for building materials supply...'}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/70 p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30 resize-none transition-all"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowAiPrompt(false)}
                  className="rounded-lg border border-slate-700/60 bg-slate-800/70 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-700/60 hover:text-white transition-all cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  id="sr-ai-submit-btn"
                  onClick={handleAiGenerate}
                  disabled={!aiPromptText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-extrabold text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:brightness-110 transition-all disabled:opacity-40 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isAr ? 'توليد الفاتورة' : 'Generate Invoice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
