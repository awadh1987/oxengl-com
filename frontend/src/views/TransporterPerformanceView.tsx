import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BanknoteArrowUp,
  CircleCheck,
  ReceiptText,
  Truck,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Printer,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ApiSettlement, erpApi } from '../services/api';
import { formatCurrency, formatTonnage } from '../utils/formatters';
import { CreateVoucherModal } from '../components/CreateVoucherModal';

type Partner = { id: string; name: string; partner_type: string };

export const TransporterPerformanceView: React.FC = () => {
  const { currentCompany, language, accessibleOperations, transporters, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';
  const [serverSettlements, setServerSettlements] = useState<ApiSettlement[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const [voucherModalState, setVoucherModalState] = useState<{
    isOpen: boolean;
    partnerId?: string;
    partnerName?: string;
    amount?: number;
  }>({ isOpen: false });

  const fetchData = async () => {
    if (!currentCompany) return;
    setIsRefreshing(true);
    try {
      const [settlements, records] = await Promise.all([
        erpApi.getSettlements(currentCompany.id),
        erpApi.getPartners(currentCompany.id),
      ]);
      setServerSettlements(settlements);
      setPartners(records);
    } catch (error) {
      console.warn('Settlement ledger unavailable; displaying operational fallback:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentCompany]);

  useEffect(() => {
    const handleOpenVoucherModal = (e: Event) => {
      const customEvent = e as CustomEvent<{
        partnerId?: string;
        partnerName?: string;
        amount?: number;
      }>;
      if (customEvent.detail) {
        setVoucherModalState({
          isOpen: true,
          partnerId: customEvent.detail.partnerId,
          partnerName: customEvent.detail.partnerName,
          amount: customEvent.detail.amount,
        });
      }
    };
    window.addEventListener('oxengl-open-voucher-modal', handleOpenVoucherModal);
    return () => window.removeEventListener('oxengl-open-voucher-modal', handleOpenVoucherModal);
  }, []);

  const rows = useMemo(() => {
    const serviceSuppliers = partners.filter((partner) =>
      ['service_supplier', 'transporter'].includes(partner.partner_type)
    );
    const source = serviceSuppliers.length
      ? serviceSuppliers.map((partner) => {
          const settlement = serverSettlements.find((item) => item.partner_id === partner.id);
          const operations = accessibleOperations.filter((item) => item.transporter_name.includes(partner.name));
          const loaded = operations.reduce((total, item) => total + item.qty_loaded, 0);
          const delivered = operations.reduce((total, item) => total + item.qty_delivered, 0);
          const wastage = loaded - delivered;
          const gross = settlement ? Number(settlement.total_gross_amount) : delivered * 18;
          const penalties = settlement ? Number(settlement.total_penalties_loss) : Math.max(0, wastage) * 44;
          return {
            id: partner.id,
            name: partner.name,
            trips: operations.length,
            loaded,
            delivered,
            wastage,
            loss: loaded ? (wastage / loaded) * 100 : 0,
            gross,
            penalties,
            payout: settlement ? Number(settlement.net_payable) : Math.max(0, gross - penalties),
            voucher: settlement?.move_id,
            compliance: wastage / (loaded || 1) > 0.02 ? 'Warning' : 'Excellent',
          };
        })
      : transporters.map((supplier) => {
          const operations = accessibleOperations.filter((item) => item.transporter_name.includes(supplier.transporterName));
          const loaded = operations.reduce((total, item) => total + item.qty_loaded, 0);
          const delivered = operations.reduce((total, item) => total + item.qty_delivered, 0);
          const wastage = loaded - delivered;
          const gross = delivered * (supplier.ratePerTon || 18);
          const penalties = Math.max(0, wastage) * 44;
          return {
            id: supplier.id,
            name: supplier.transporterName,
            trips: operations.length,
            loaded,
            delivered,
            wastage,
            loss: loaded ? (wastage / loaded) * 100 : 0,
            gross,
            penalties,
            payout: Math.max(0, gross - penalties),
            voucher: undefined,
            compliance: wastage / (loaded || 1) > 0.02 ? 'Warning' : 'Excellent',
          };
        });
    return source;
  }, [accessibleOperations, partners, serverSettlements, transporters]);

  const totals = rows.reduce(
    (all, row) => ({
      loss: all.loss + row.wastage,
      gross: all.gross + row.gross,
      penalties: all.penalties + row.penalties,
      payout: all.payout + row.payout,
    }),
    { loss: 0, gross: 0, penalties: 0, payout: 0 }
  );

  const totalPages = Math.ceil(rows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    return rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [rows, currentPage, pageSize]);

  const handleExportJSONSnapshot = () => {
    const dataStr = JSON.stringify(
      {
        company: currentCompany?.name,
        totals,
        carriers: rows,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OxenGL_Transporter_Settlement_Snapshot_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const headers = isAr
      ? ['#', 'اسم الناقل', 'الرحلات', 'المحمّل (MT طن)', 'المسلّم (MT طن)', 'الهدر (MT طن)', 'نسبة الفقد %', 'النولون (ر.س)', 'الجزاءات (ر.س)', 'الصافي (ر.س)', 'الامتثال']
      : ['#', 'Carrier Name', 'Trips', 'Loaded (MT طن)', 'Delivered (MT طن)', 'Wastage (MT طن)', 'Loss %', 'Gross Fee (SAR)', 'Penalties (SAR)', 'Net Payout (SAR)', 'Compliance'];
    const rowsCsv = rows.map((r, idx) => [
      idx + 1,
      `"${r.name}"`,
      r.trips,
      r.loaded.toFixed(2),
      r.delivered.toFixed(2),
      r.wastage.toFixed(2),
      `${r.loss.toFixed(2)}%`,
      r.gross.toFixed(2),
      r.penalties.toFixed(2),
      r.payout.toFixed(2),
      r.compliance,
    ].join(','));
    const csvContent = '\uFEFF' + [headers.join(','), ...rowsCsv].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OxenGL_Transporter_Settlements_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const cards = [
    {
      title: isAr ? 'إجمالي الفاقد أثناء النقل (MT طن)' : 'Total Route Loss (MT طن)',
      value: formatTonnage(totals.loss, language),
      tone: 'text-rose-600 dark:text-rose-400',
      icon: AlertTriangle,
    },
    {
      title: isAr ? 'إجمالي مستحقات النولون' : 'Gross Freight Fees',
      value: formatCurrency(totals.gross, language),
      tone: 'text-slate-900 dark:text-slate-100',
      icon: Truck,
    },
    {
      title: isAr ? 'خصومات الهدر والجزاءات' : 'Wastage Deductions',
      value: formatCurrency(totals.penalties, language),
      tone: 'text-orange-600 dark:text-orange-400',
      icon: BanknoteArrowUp,
    },
    {
      title: isAr ? 'صافي مستحق السداد لموردي الخدمات' : 'Net Freight Payable',
      value: formatCurrency(totals.payout, language),
      tone: 'text-emerald-600 dark:text-emerald-400',
      icon: ReceiptText,
    },
  ];

  const tableHeaders = isAr
    ? ['#', 'اسم مورد الخدمة / الناقل', 'الرحلات', 'المحمّل (MT طن)', 'المسلّم (MT طن)', 'الهدر والفاقد (MT طن)', 'نسبة الفقد', 'إجمالي النولون', 'الخصومات والجزاءات', 'الصافي المستحق', 'حالة الامتثال', 'الإجراء']
    : ['#', 'Service Supplier / Carrier', 'Trips', 'Loaded (MT طن)', 'Delivered (MT طن)', 'Wastage (MT طن)', 'Loss %', 'Freight Fee', 'Penalties', 'Net Payout', 'Compliance', 'Action'];

  return (
    <div className="space-y-5" id="transporter-performance-view">
      {/* Header Banner & Action Bar */}
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#141726] p-5 shadow-xs transition-colors sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
            {isAr ? 'دفتر العمليات التشغيلية' : 'Operational ledger'}
          </p>
          <h1 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
            {isAr ? 'فاقد النقل وتسويات موردي الخدمات اللوجستية' : 'Service Supplier Loss & Freight Settlements'}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'تدقيق فروقات موازين القبان بين التحميل والتفريغ، احتساب نسب الهدر وتطبيق الجزاءات وإصدار سندات الصرف.'
              : 'Audit transit material losses, flag abnormal weighbridge variance, apply deductions, and settle freight fees.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Button */}
          <button
            id="refresh-transporters-btn"
            onClick={fetchData}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            title={isAr ? 'تحديث البيانات من الخادم' : 'Refresh Data'}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isAr ? (isRefreshing ? 'تحديث...' : 'تحديث') : (isRefreshing ? 'Refreshing...' : 'Refresh')}</span>
          </button>

          {/* JSON Snapshot Button */}
          <button
            id="export-transporters-json-btn"
            onClick={handleExportJSONSnapshot}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs font-bold text-amber-900 shadow-xs hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40 transition-colors"
            title={isAr ? 'تصدير لقطة بيانات JSON' : 'Export JSON Snapshot'}
          >
            <Download className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
            <span>{isAr ? 'لقطة JSON' : 'JSON Snapshot'}</span>
          </button>

          {/* Export Excel Button */}
          <button
            id="export-transporters-excel-btn"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
            title={isAr ? 'تصدير كشف Excel' : 'Export Excel'}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
          </button>

          {/* Print Button */}
          <button
            id="print-transporters-btn"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
            title={isAr ? 'معاينة وطباعة التقرير' : 'Print Report'}
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{isAr ? 'معاينة وطباعة' : 'Export & Print'}</span>
          </button>
        </div>
      </header>

      {/* Metric Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#141726] p-4 shadow-xs transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{card.title}</span>
                <Icon className={`h-4 w-4 ${card.tone}`} />
              </div>
              <strong dir="ltr" className={`mt-3 block text-xl font-black unicode-bidi-isolate ${card.tone}`}>{card.value}</strong>
            </article>
          );
        })}
      </section>

      {/* Table Section with Enclosed w-full overflow-x-auto container and Pagination */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#141726] shadow-xs transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? 'كشف تسوية المقاولين ومؤشرات الالتزام' : 'Subcontractor Freight Settlement & Compliance'}
            </h2>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {isAr ? 'بيانات التسوية الحية للمنشأة · ' : 'Live tenant settlement data · '}
              {currentCompany?.name || (isAr ? 'لا توجد منشأة نشطة' : 'No active company')}
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {rows.length} {isAr ? 'ناقل / مورد' : 'suppliers'}
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="min-w-[1160px] w-full text-right text-xs">
            <thead className="bg-slate-900 dark:bg-slate-950 text-white">
              <tr>
                {tableHeaders.map((label) => (
                  <th key={label} className="px-3 py-3 text-center font-bold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedRows.map((row, index) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-400">
                    {(currentPage - 1) * pageSize + index + 1}
                  </td>
                  <td className="px-3 py-3 font-bold text-slate-900 dark:text-slate-100">{row.name}</td>
                  <td className="px-3 py-3 text-center text-slate-700 dark:text-slate-300">{row.trips}</td>
                  <td className="px-3 py-3 text-center text-slate-700 dark:text-slate-300">{formatTonnage(row.loaded, language)}</td>
                  <td className="px-3 py-3 text-center font-bold text-slate-900 dark:text-slate-100">
                    {formatTonnage(row.delivered, language)}
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-rose-600 dark:text-rose-400">
                    {formatTonnage(row.wastage, language)}
                  </td>
                  <td className="px-3 py-3 text-center"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-slate-700 dark:text-slate-300">{row.loss.toFixed(2)}%</span></td>
                  <td className="px-3 py-3 text-slate-800 dark:text-slate-200">{formatCurrency(row.gross, language)}</td>
                  <td className="px-3 py-3 font-bold text-orange-600 dark:text-orange-400">
                    {formatCurrency(row.penalties, language)}
                  </td>
                  <td className="px-3 py-3 font-black text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(row.payout, language)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                        row.compliance === 'Excellent'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      <CircleCheck className="h-3 w-3 shrink-0" />
                      <span>{row.compliance === 'Excellent' ? (isAr ? 'ممتاز' : 'Excellent') : (isAr ? 'تحذير هدر' : 'Warning')}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.voucher ? (
                      <button className="border border-orange-300 dark:border-orange-700 px-2 py-1 text-[10px] font-bold text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors whitespace-nowrap shrink-0">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">PV-2026-{row.voucher.slice(0, 5)}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setVoucherModalState({
                            isOpen: true,
                            partnerId: row.id,
                            partnerName: row.name,
                            amount: row.payout,
                          });
                        }}
                        className="bg-orange-600 hover:bg-orange-700 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm transition-colors rounded-lg"
                      >
                        {isAr ? 'إصدار سند صرف' : 'Issue Voucher'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                    {isAr ? 'لا يوجد ناقلون أو تسويات مسجلة لهذه المنشأة.' : 'No service suppliers or settlements found for this company.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Bar */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            {isAr
              ? `عرض ${paginatedRows.length} من أصل ${rows.length} ناقل`
              : `Showing ${paginatedRows.length} of ${rows.length} carriers`}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              {isAr ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              <span>{isAr ? 'السابق' : 'Previous'}</span>
            </button>
            <span className="font-mono font-bold text-slate-900 dark:text-white px-2">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <span>{isAr ? 'التالي' : 'Next'}</span>
              {isAr ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </section>

      {/* Financial Voucher Issuance Modal */}
      <CreateVoucherModal
        isOpen={voucherModalState.isOpen}
        onClose={() => setVoucherModalState({ isOpen: false })}
        initialType="Payment"
        initialCategory="Transporter_Payment"
        initialPartyType="Transporter"
        initialPartyId={voucherModalState.partnerId}
        initialPartyName={voucherModalState.partnerName}
        initialAmount={voucherModalState.amount}
        initialPurpose={
          isAr
            ? `تسوية مستحقات نقل - ${voucherModalState.partnerName || ''}`
            : `Freight settlement payout - ${voucherModalState.partnerName || ''}`
        }
        onSuccess={() => {
          setVoucherModalState({ isOpen: false });
          fetchData();
        }}
      />
    </div>
  );
};
