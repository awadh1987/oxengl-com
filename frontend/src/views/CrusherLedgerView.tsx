import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CreditCard, MapPin, RefreshCw, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ApiAccountMove, ApiSettlement, erpApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { CreateVoucherModal } from '../components/CreateVoucherModal';

type Partner = { id: string; name: string; partner_type: string; tax_number?: string | null };

export const CrusherLedgerView: React.FC = () => {
  const { currentCompany, language, crushers, accessibleOperations, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';
  const [partners, setPartners] = useState<Partner[]>([]);
  const [moves, setMoves] = useState<ApiAccountMove[]>([]);
  const [settlements, setSettlements] = useState<ApiSettlement[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);

  const fetchLedgerData = async () => {
    if (!currentCompany) return;
    setIsRefreshing(true);
    try {
      const [records, ledgerMoves, ledgerSettlements] = await Promise.all([
        erpApi.getPartners(currentCompany.id),
        erpApi.getAccountingMoves(currentCompany.id),
        erpApi.getSettlements(currentCompany.id),
      ]);
      setPartners(records);
      setMoves(ledgerMoves);
      setSettlements(ledgerSettlements);
    } catch (error) {
      console.warn('Sourcing ledger API unavailable; using operational fallback:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLedgerData();
  }, [currentCompany]);

  const suppliers = useMemo(() => {
    const apiSuppliers = (partners || []).filter((partner) =>
      ['raw_materials_supplier', 'supplier'].includes(partner?.partner_type || '')
    );
    return apiSuppliers.length
      ? apiSuppliers.map((partner) => ({
          id: partner.id,
          name: partner.name || '',
          location: isAr ? 'منطقة توريد المستأجر' : 'Tenant sourcing region',
          tax: partner.tax_number,
        }))
      : (crushers || []).map((supplier) => ({
          id: supplier.id,
          name: supplier.crusherName || '',
          location: supplier.location || '',
          tax: supplier.taxNumber,
        }));
  }, [partners, crushers, isAr]);

  const selected = suppliers.find((supplier) => supplier.id === selectedId) || suppliers[0];

  const purchaseFor = (id: string, name: string) => {
    const settlement = (settlements || []).filter((item) => item?.partner_id === id);
    if (settlement.length) return settlement.reduce((total, item) => total + Number(item?.total_gross_amount || 0), 0);
    return (accessibleOperations || [])
      .filter((item) => (item?.loading_source || '').includes(name || ''))
      .reduce((total, item) => total + (item?.purchases_cost || 0), 0);
  };

  const paymentFor = (id: string) =>
    (settlements || [])
      .filter((item) => item?.partner_id === id && item?.state === 'paid')
      .reduce((total, item) => total + Number(item?.net_payable || 0), 0);

  const purchases = selected ? purchaseFor(selected.id, selected.name) : 0;
  const payments = selected ? paymentFor(selected.id) : 0;
  const outstanding = purchases - payments;
  const supplierMoves = selected ? (moves || []).filter((move) => move?.partner_id === selected.id) : [];

  const handleExportJSONSnapshot = () => {
    const dataStr = JSON.stringify(
      {
        tenant: currentCompany?.name,
        supplier: selected,
        purchases,
        payments,
        outstanding,
        moves: supplierMoves,
        exportDate: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OxenGL_Crusher_Ledger_${selected?.name || 'Supplier'}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const headers = isAr
      ? ['التاريخ', 'رقم القيد', 'المرجع', 'الحالة', 'اسم المورد', 'المبلغ المستحق']
      : ['Date', 'Move', 'Reference', 'State', 'Supplier', 'Amount'];
    const rowsCsv = supplierMoves.map((m) => {
      const settlement = (settlements || []).find((item) => item?.move_id === m?.id);
      return [
        (m?.date || '').slice(0, 10),
        m?.name || '',
        m?.ref || '',
        m?.state || '',
        `"${selected?.name || ''}"`,
        settlement ? Number(settlement.net_payable || 0) : 0,
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rowsCsv].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OxenGL_Crusher_Ledger_${selected?.name || 'Supplier'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5 px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto" id="crusher-ledger-view">
      {/* Header Banner & Action Bar */}
      <header
        className={`flex flex-col gap-4 rounded-2xl border p-5 shadow-xs transition-colors sm:flex-row sm:items-center sm:justify-between ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-500">
            {isAr ? 'دفتر توريد المواد الخام' : 'Sourcing Ledger'}
          </p>
          <h1 className="mt-1 text-xl font-black text-slate-900 dark:text-white">
            {isAr ? 'حسابات موردي المواد' : 'Material Suppliers Ledger'}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'متابعة مشتريات المواد، سندات الصرف الدائنة، ومطابقة الأرصدة المستحقة للموردين.'
              : 'Track material purchases, supplier debit vouchers, and outstanding balances.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Button */}
          <button
            id="refresh-crushers-btn"
            onClick={fetchLedgerData}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            title={isAr ? 'تحديث البيانات من الخادم' : 'Refresh from Server'}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isAr ? (isRefreshing ? 'تحديث...' : 'تحديث') : (isRefreshing ? 'Refreshing...' : 'Refresh')}</span>
          </button>

          {/* JSON Snapshot Button */}
          <button
            id="export-crushers-json-btn"
            onClick={handleExportJSONSnapshot}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs font-bold text-amber-900 shadow-xs hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40 transition-colors"
            title={isAr ? 'تصدير لقطة بيانات JSON للكشف' : 'Export JSON Snapshot'}
          >
            <Download className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
            <span>{isAr ? 'لقطة JSON' : 'JSON Snapshot'}</span>
          </button>

          {/* Export Excel / CSV Button */}
          <button
            id="export-crushers-excel-btn"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
            title={isAr ? 'تصدير إلى Excel' : 'Export to Excel'}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
          </button>

          {/* Print Button */}
          <button
            id="print-crushers-btn"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
            title={isAr ? 'طباعة كشف الحساب' : 'Print Statement'}
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{isAr ? 'معاينة وطباعة' : 'Export & Print'}</span>
          </button>
        </div>
      </header>

      {/* Sourcing Supplier Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {suppliers.map((supplier) => {
          const suppPurchases = purchaseFor(supplier.id, supplier.name);
          const suppOutstanding = suppPurchases - paymentFor(supplier.id);
          const active = selected?.id === supplier.id;
          return (
            <button
              key={supplier.id}
              onClick={() => setSelectedId(supplier.id)}
              className={`rounded-2xl border p-5 text-start shadow-xs transition-all ${
                active
                  ? isDark
                    ? 'border-orange-500 bg-orange-950/30 ring-1 ring-orange-500/50'
                    : 'border-orange-400 bg-orange-50/60 ring-1 ring-orange-300'
                  : isDark
                  ? 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-800 text-orange-400">
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  {isAr ? 'مورد خام' : 'Raw Materials'}
                </span>
              </div>
              <h2 className="mt-4 text-sm font-black text-slate-900 dark:text-slate-100">{supplier.name}</h2>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <MapPin className="h-3 w-3 shrink-0" />
                <span>{supplier.location}</span>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">{isAr ? 'المشتريات:' : 'Purchases:'}</span>
                  <strong className="mt-1 block font-mono text-slate-900 dark:text-slate-100">
                    {formatCurrency(suppPurchases, language)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">{isAr ? 'الرصيد القائم:' : 'Outstanding:'}</span>
                  <strong className="mt-1 block font-mono text-rose-600 dark:text-rose-400">
                    {formatCurrency(suppOutstanding, language)}
                  </strong>
                </div>
              </div>
            </button>
          );
        })}
        {!suppliers.length && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
            {isAr ? 'لا يوجد موردي مواد مسجلين لهذا المستأجر.' : 'No material suppliers are available for this tenant.'}
          </div>
        )}
      </section>

      {/* Detailed Supplier Statement */}
      {selected && (
        <section
          className={`rounded-2xl border shadow-xs transition-colors ${
            isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                {isAr ? 'كشف حساب مورد معتمد' : 'Verified Supplier Statement'}
              </span>
              <h2 className="mt-1.5 text-base font-black text-slate-900 dark:text-white">{selected.name}</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {selected.location} · {selected.tax || (isAr ? 'الرقم الضريبي قيد التوثيق' : 'Tax number pending')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsVoucherModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" />
                {isAr ? 'إصدار سند صرف للمورد' : 'Issue Payment Voucher'}
              </button>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {supplierMoves.length} {isAr ? 'حركة مالية ومحاسبية' : 'accounting moves'}
              </span>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-100 dark:border-slate-800 p-5 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي المشتريات (دائن)' : 'Total Purchases (Credit)'}
              </span>
              <strong className="mt-2 block font-mono text-xl font-black text-slate-900 dark:text-white">
                {formatCurrency(purchases, language)}
              </strong>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'إجمالي السدادات (مدين)' : 'Total Payments (Debit)'}
              </span>
              <strong className="mt-2 block font-mono text-xl font-black text-emerald-700 dark:text-emerald-400">
                {formatCurrency(payments, language)}
              </strong>
            </div>
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 p-4">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
                {isAr ? 'صافي الرصيد المستحق (مطلوب)' : 'Net Outstanding Balance'}
              </span>
              <strong className="mt-2 block font-mono text-xl font-black text-rose-700 dark:text-rose-400">
                {formatCurrency(outstanding, language)}
              </strong>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="min-w-[720px] w-full text-start text-xs">
              <thead className="bg-slate-900 dark:bg-slate-950 text-white">
                <tr>
                  {(isAr
                    ? ['التاريخ', 'رقم القيد', 'المرجع', 'الحالة', 'اسم المورد', 'المبلغ المستحق']
                    : ['Date', 'Move', 'Reference', 'State', 'Supplier', 'Amount']
                  ).map((label) => (
                    <th key={label} className="px-4 py-3 font-bold text-start">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {supplierMoves.map((move) => {
                  const settlement = settlements.find((item) => item.move_id === move.id);
                  return (
                    <tr
                      key={move.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-slate-800 dark:text-slate-200"
                    >
                      <td className="px-4 py-3"><span dir="ltr" className="inline-block unicode-bidi-isolate">{move.date.slice(0, 10)}</span></td>
                      <td className="px-4 py-3 font-mono font-bold text-orange-600 dark:text-orange-400">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{move.name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400"><span dir="ltr" className="inline-block unicode-bidi-isolate">{move.ref || '-'}</span></td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                            move.state === 'posted'
                              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {move.state === 'posted' ? (isAr ? 'معتمد' : 'Posted') : (isAr ? 'مسودة' : 'Draft')}
                        </span>
                      </td>
                      <td className="px-4 py-3">{selected.name}</td>
                      <td className="px-4 py-3 font-mono font-bold">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{settlement ? formatCurrency(Number(settlement.net_payable), language) : '-'}</span>
                      </td>
                    </tr>
                  );
                })}
                {!supplierMoves.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      {isAr
                        ? 'لا توجد حركات محاسبية مسجلة لهذا المورد حالياً.'
                        : 'No accounting movements are available for this supplier.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected && (
        <CreateVoucherModal
          isOpen={isVoucherModalOpen}
          onClose={() => setIsVoucherModalOpen(false)}
          initialType="Payment"
          initialCategory="Crusher_Settlement"
          initialPartyType="Crusher"
          initialPartyId={selected.id}
          initialPartyName={selected.name}
          initialAmount={outstanding > 0 ? outstanding : 0}
          initialPurpose={
            isAr
              ? `سداد مستحقات توريد مواد - ${selected.name}`
              : `Crusher materials settlement - ${selected.name}`
          }
          onSuccess={() => {
            setIsVoucherModalOpen(false);
            fetchLedgerData();
          }}
        />
      )}
    </div>
  );
};


