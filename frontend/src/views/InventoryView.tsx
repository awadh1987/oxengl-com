import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Package,
  Building2,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Filter,
  AlertCircle,
  RefreshCw,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  DollarSign,
  Receipt,
  Layers,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/formatters';
import {
  erpApi,
  ApiInventoryMovement,
  ApiWarehouse,
  ApiProduct,
  ApiJournalEntry,
} from '../services/api';

export const InventoryView: React.FC = () => {
  const { language, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  // State
  const [movements, setMovements] = useState<ApiInventoryMovement[]>([]);
  const [warehouses, setWarehouses] = useState<ApiWarehouse[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'pending' | 'posted'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('ALL');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    warehouse_id: '',
    product_id: '',
    movement_type: 'ADJUSTMENT',
    quantity: 10,
    unit_cost: 150,
    reason: isAr ? 'تسوية جرد دوري' : 'Periodic physical inventory adjustment',
    reference: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [movData, whData, prodData] = await Promise.all([
        erpApi.getInventoryMovements().catch(() => [] as ApiInventoryMovement[]),
        erpApi.getInventoryWarehouses().catch(() => [] as ApiWarehouse[]),
        erpApi.getInventoryProducts().catch(() => [] as ApiProduct[]),
      ]);

      setMovements(movData);
      setWarehouses(whData);
      setProducts(prodData);

      if (whData.length > 0 && !formData.warehouse_id) {
        setFormData((prev) => ({ ...prev, warehouse_id: whData[0].id }));
      }
      if (prodData.length > 0 && !formData.product_id) {
        setFormData((prev) => ({ ...prev, product_id: prodData[0].id }));
      }
    } catch (err: any) {
      console.error('Failed to load inventory data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePostToLedger = async (movementId: string) => {
    setPostingId(movementId);
    try {
      const entry: ApiJournalEntry = await erpApi.postInventoryMovementToLedger(movementId);
      setMovements((prev) =>
        prev.map((m) =>
          m.id === movementId
            ? { ...m, is_posted: true, status: 'POSTED', journal_entry_id: entry.id }
            : m
        )
      );

      const drText = formatCurrency(entry.total_debit, language);
      const crText = formatCurrency(entry.total_credit, language);
      setNotification({
        type: 'success',
        message: isAr
          ? `تم ترحيل قيد التسوية بنجاح إلى دفتر الأستاذ العام (سند رقم: ${entry.entry_number}) - مدين: ${drText} / دائن: ${crText}`
          : `Successfully posted adjustment to General Ledger (Voucher #${entry.entry_number}) - Debit: ${drText} / Credit: ${crText}`,
      });
      setTimeout(() => setNotification(null), 8000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message:
          err?.message ||
          (isAr ? 'فشل ترحيل قيد المخزون إلى دفتر الأستاذ' : 'Failed to post inventory movement to general ledger'),
      });
      setTimeout(() => setNotification(null), 8000);
    } finally {
      setPostingId(null);
    }
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.warehouse_id) {
      setNotification({
        type: 'error',
        message: isAr ? 'يرجى اختيار المستودع' : 'Please select a warehouse',
      });
      return;
    }

    setCreating(true);
    try {
      const totalCost = Math.abs(Number(formData.quantity) * Number(formData.unit_cost));
      const created = await erpApi.createInventoryMovement({
        warehouse_id: formData.warehouse_id,
        product_id: formData.product_id || undefined,
        movement_type: formData.movement_type,
        quantity: Number(formData.quantity),
        unit_cost: Number(formData.unit_cost),
        total_cost: totalCost,
        reason: formData.reason,
        reference: formData.reference || `ADJ-${Date.now().toString().slice(-4)}`,
      });

      setMovements((prev) => [created, ...prev]);
      setIsModalOpen(false);
      setNotification({
        type: 'success',
        message: isAr
          ? `تم إنشاء حركة تسوية المخزون بنجاح: ${created.movement_number}`
          : `Inventory movement created successfully: ${created.movement_number}`,
      });
      setTimeout(() => setNotification(null), 6000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.message || (isAr ? 'فشل إنشاء حركة المخزون' : 'Failed to create inventory movement'),
      });
    } finally {
      setCreating(false);
    }
  };

  // KPIs
  const totalValuation = movements.reduce((acc, m) => acc + (Number(m.total_cost) || 0), 0);
  const postedCount = movements.filter((m) => m.is_posted).length;
  const pendingCount = movements.filter((m) => !m.is_posted).length;

  // Filtered movements
  const filteredMovements = movements.filter((m) => {
    if (activeFilterTab === 'pending' && m.is_posted) return false;
    if (activeFilterTab === 'posted' && !m.is_posted) return false;
    if (selectedWarehouse !== 'ALL' && m.warehouse_id !== selectedWarehouse) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const numMatch = m.movement_number?.toLowerCase().includes(q);
      const prodMatch = m.product_name?.toLowerCase().includes(q);
      const reasonMatch = m.reason?.toLowerCase().includes(q);
      const whMatch = m.warehouse_name?.toLowerCase().includes(q);
      return numMatch || prodMatch || reasonMatch || whMatch;
    }
    return true;
  });

  return (
    <div className="space-y-6 px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto" id="inventory-view">
      {/* Top Notification Banner */}
      {notification && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-3">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <p className="text-sm font-medium">{notification.message}</p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs hover:underline opacity-80"
          >
            {isAr ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
                {isAr ? 'إدارة المخزون والتقييم المالي' : 'Inventory Management & Valuation'}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                  {isAr ? 'المرحلة 8: دفتر الأستاذ' : 'Phase 8: Double-Entry GL'}
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {isAr
                  ? 'تسوية أرصدة المستودعات وترحيل القيود المحاسبية المزدوجة المتوازنة آلياً'
                  : 'Track warehouse balances, perpetual stock adjustments, and balanced GL postings.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium border border-slate-700 transition"
            title={isAr ? 'تحديث البيانات' : 'Refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>
          <button
            id="new-stock-adjustment-btn"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>{isAr ? 'تسوية مخزون جديدة' : 'New Stock Adjustment'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Total Valuation */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 relative overflow-hidden backdrop-blur-md">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium text-slate-400">
              {isAr ? 'إجمالي قيمة التسويات' : 'Total Adjustments Value'}
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {formatCurrency(totalValuation, language)}
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <span className="text-emerald-400 font-semibold">{movements.length}</span>{' '}
            {isAr ? 'حركة مسجلة' : 'movements recorded'}
          </p>
        </div>

        {/* Posted to Ledger */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 relative overflow-hidden backdrop-blur-md">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium text-slate-400">
              {isAr ? 'القيود المرحلة للدفتر' : 'Posted to General Ledger'}
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">
            {postedCount}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {isAr ? 'قيود متوازنة ومرحلة بنجاح' : 'Balanced double-entry vouchers'}
          </p>
        </div>

        {/* Pending Ledger Posting */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 relative overflow-hidden backdrop-blur-md">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium text-slate-400">
              {isAr ? 'بانتظار الترحيل المحاسبي' : 'Pending Ledger Posting'}
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-400 tracking-tight">
            {pendingCount}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {isAr ? 'بحاجة للترحيل لدفتر الأستاذ' : 'Awaiting general ledger posting'}
          </p>
        </div>

        {/* Active Warehouses */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 relative overflow-hidden backdrop-blur-md">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-medium text-slate-400">
              {isAr ? 'المستودعات النشطة' : 'Active Warehouses'}
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {warehouses.length || 1}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {isAr ? 'مستودعات مسجلة في النظام' : 'Registered storage facilities'}
          </p>
        </div>
      </div>

      {/* Filter Ribbon & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-3 rounded-2xl">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-800/60 p-1 rounded-xl">
          <button
            onClick={() => setActiveFilterTab('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeFilterTab === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {isAr ? 'جميع الحركات' : 'All Movements'} ({movements.length})
          </button>
          <button
            onClick={() => setActiveFilterTab('pending')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeFilterTab === 'pending'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>{isAr ? 'بانتظار الترحيل' : 'Pending Posting'}</span>
            {pendingCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeFilterTab === 'pending' ? 'bg-slate-950 text-amber-300' : 'bg-amber-500/20 text-amber-400'}`}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveFilterTab('posted')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeFilterTab === 'posted'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {isAr ? 'المرحلة محاسبياً' : 'Posted (GL)'} ({postedCount})
          </button>
        </div>

        {/* Search & Warehouse Filter */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative min-w-[200px]">
            <Search className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              id="inventory-search-input"
              name="inventory_search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث برقم الحركة، الصنف...' : 'Search by #, item...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 ps-9 pe-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              id="warehouse-filter-select"
              name="warehouse_filter"
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-amber-500 transition"
            >
              <option value="ALL">{isAr ? 'كافة المستودعات' : 'All Warehouses'}</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 uppercase tracking-wider text-[11px] text-slate-400 font-semibold">
              <tr>
                <th className="py-3.5 px-4 text-start">{isAr ? 'رقم الحركة' : 'Movement #'}</th>
                <th className="py-3.5 px-4 text-start">{isAr ? 'الصنف / المنتج' : 'Item / Product'}</th>
                <th className="py-3.5 px-4 text-start">{isAr ? 'المستودع' : 'Warehouse'}</th>
                <th className="py-3.5 px-4 text-start">{isAr ? 'نوع الحركة' : 'Type'}</th>
                <th className="py-3.5 px-4 text-end">{isAr ? 'الكمية' : 'Quantity'}</th>
                <th className="py-3.5 px-4 text-end">{isAr ? 'تكلفة الوحدة' : 'Unit Cost'}</th>
                <th className="py-3.5 px-4 text-end">{isAr ? 'إجمالي القيمة' : 'Total Value'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'حالة القيد' : 'Ledger Status'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'الإجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`inv-skel-${idx}`} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-800 rounded w-36" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-800 rounded w-28" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                    <td className="py-3.5 px-4 text-end"><div className="h-4 bg-slate-800 rounded w-16 ms-auto" /></td>
                    <td className="py-3.5 px-4 text-end"><div className="h-4 bg-slate-800 rounded w-16 ms-auto" /></td>
                    <td className="py-3.5 px-4 text-end"><div className="h-4 bg-slate-800 rounded w-20 ms-auto" /></td>
                    <td className="py-3.5 px-4 text-center"><div className="h-4 bg-slate-800 rounded w-20 mx-auto" /></td>
                    <td className="py-3.5 px-4 text-center"><div className="h-4 bg-slate-800 rounded w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <Boxes className="w-10 h-10 mx-auto text-slate-600 mb-2 opacity-60" />
                    <p className="font-medium text-sm">
                      {isAr ? 'لا توجد حركات مخزون مطابقة' : 'No inventory movements found'}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      {isAr ? 'اضغط على تسوية مخزون جديدة لإنشاء حركة' : 'Click "New Stock Adjustment" to record a movement.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredMovements.map((movement) => {
                  const isPos = Number(movement.quantity) >= 0;
                  return (
                    <tr
                      key={movement.id}
                      className="hover:bg-slate-850/50 transition group"
                    >
                      {/* Movement Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{movement.movement_number}</span>
                      </td>

                      {/* Item */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{movement.product_name}</div>
                        {movement.reason && (
                          <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                            {movement.reason}
                          </div>
                        )}
                      </td>

                      {/* Warehouse */}
                      <td className="py-3.5 px-4 text-slate-300">
                        {movement.warehouse_name}
                      </td>

                      {/* Movement Type */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            movement.movement_type === 'ADJUSTMENT'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : movement.movement_type === 'SCRAP'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : movement.movement_type === 'INBOUND'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {movement.movement_type}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="py-3.5 px-4 text-end font-mono">
                        <span className={isPos ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          <span dir="ltr" className="inline-block unicode-bidi-isolate">{isPos ? `+${movement.quantity}` : movement.quantity}</span>
                        </span>
                      </td>

                      {/* Unit Cost */}
                      <td className="py-3.5 px-4 text-end font-mono text-slate-300">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(movement.unit_cost, language)}</span>
                      </td>

                      {/* Total Value */}
                      <td className="py-3.5 px-4 text-end font-mono font-bold text-white">
                        <span dir="ltr" className="inline-block unicode-bidi-isolate">{formatCurrency(movement.total_cost, language)}</span>
                      </td>

                      {/* Ledger Status */}
                      <td className="py-3.5 px-4 text-center">
                        {movement.is_posted ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{isAr ? 'مرحل للدفتر' : 'Posted (GL)'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 whitespace-nowrap shrink-0">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{isAr ? 'مسودة' : 'Unposted'}</span>
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center">
                        {movement.is_posted ? (
                          <div className="flex flex-wrap items-center justify-center gap-1 text-[11px] text-slate-500">
                            <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="font-mono text-[10px] text-emerald-500 font-medium whitespace-nowrap">
                              {movement.journal_entry_id ? `#${movement.journal_entry_id.slice(0, 8)}` : 'VOUCHER'}
                            </span>
                          </div>
                        ) : (
                          <button
                            id={`post-ledger-btn-${movement.id}`}
                            onClick={() => handlePostToLedger(movement.id)}
                            disabled={postingId === movement.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-xs border border-amber-500/30 transition shadow-sm active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            {postingId === movement.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>{isAr ? 'جاري الترحيل...' : 'Posting...'}</span>
                              </>
                            ) : (
                              <>
                                <Receipt className="w-3.5 h-3.5" />
                                <span>{isAr ? 'ترحيل القيد' : 'Post to Ledger'}</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Stock Adjustment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Boxes className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  {isAr ? 'تسجيل تسوية مخزون جديدة' : 'Record Stock Adjustment'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdjustment} className="space-y-4">
              {/* Warehouse */}
              <div>
                <label htmlFor="adj-warehouse-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {isAr ? 'المستودع المستهدف' : 'Target Warehouse'} *
                </label>
                <select
                  id="adj-warehouse-select"
                  name="warehouse_id"
                  value={formData.warehouse_id}
                  onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                >
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Product */}
              <div>
                <label htmlFor="adj-product-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {isAr ? 'الصنف / المادة' : 'Product / Material'}
                </label>
                <select
                  id="adj-product-select"
                  name="product_id"
                  value={formData.product_id}
                  onChange={(e) => {
                    const sel = products.find((p) => p.id === e.target.value);
                    setFormData({
                      ...formData,
                      product_id: e.target.value,
                      unit_cost: sel ? Number(sel.standard_cost) || 150 : formData.unit_cost,
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">{isAr ? 'صنف عام / مادة قياسية' : 'Standard Stock Item'}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              {/* Movement Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adj-movement-type-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isAr ? 'نوع الحركة' : 'Movement Type'}
                  </label>
                  <select
                    id="adj-movement-type-select"
                    name="movement_type"
                    value={formData.movement_type}
                    onChange={(e) => setFormData({ ...formData, movement_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="ADJUSTMENT">{isAr ? 'تسوية جردية (ADJUSTMENT)' : 'Adjustment'}</option>
                    <option value="INBOUND">{isAr ? 'استلام إضافي (INBOUND)' : 'Inbound Receipt'}</option>
                    <option value="OUTBOUND">{isAr ? 'صرف مخزني (OUTBOUND)' : 'Outbound Issue'}</option>
                    <option value="SCRAP">{isAr ? 'إتلاف وتالف (SCRAP)' : 'Scrap / Loss'}</option>
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label htmlFor="adj-quantity-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isAr ? 'الكمية (+ أو -)' : 'Quantity (+ / -)'} *
                  </label>
                  <input
                    id="adj-quantity-input"
                    name="quantity"
                    type="number"
                    step="any"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              {/* Unit Cost & Total Value Preview */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adj-unit-cost-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isAr ? 'تكلفة الوحدة (SAR)' : 'Unit Cost (SAR)'} *
                  </label>
                  <input
                    id="adj-unit-cost-input"
                    name="unit_cost"
                    type="number"
                    step="0.01"
                    value={formData.unit_cost}
                    onChange={(e) => setFormData({ ...formData, unit_cost: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isAr ? 'إجمالي التقييم التقديري' : 'Calculated Valuation'}
                  </label>
                  <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2 px-3 text-xs font-mono font-bold text-amber-400">
                    {formatCurrency(Math.abs(formData.quantity * formData.unit_cost), language)}
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label htmlFor="adj-reason-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {isAr ? 'السبب / الملاحظات' : 'Reason / Justification'}
                </label>
                <input
                  id="adj-reason-input"
                  name="reason"
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder={isAr ? 'سبب إجراء التسوية المخزنية...' : 'Reason for stock adjustment...'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
                >
                  {creating ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ التسوية' : 'Save Adjustment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
