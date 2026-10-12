import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  Fuel,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Truck,
  FileText,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  Calendar,
  Layers,
  Radio,
  Download,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';
import { FleetTracker } from '../components/FleetTracker';
import { ActionsMenu } from '../components/ActionsMenu';
import { VehicleVitals, MaintenanceWorkOrder } from '../types';
import { Upload as BulkUploadIcon } from 'lucide-react';
import { BulkImportModal } from '../components/BulkImportModal';

type Vehicle = VehicleVitals;
type MaintenanceOrder = MaintenanceWorkOrder;

interface FuelLog {
  id: string;
  transaction_number: string;
  vehicle_id: string;
  driver_id?: string;
  trip_id?: string;
  transaction_date: string;
  liters: number;
  price_per_liter: number;
  total_amount: number;
  odometer_reading?: number;
  fuel_type: string;
  fuel_station?: string;
  invoice_number?: string;
}

interface InspectionLog {
  id: string;
  trip_id?: string;
  vehicle_id: string;
  driver_id?: string;
  inspection_type: string;
  odometer_reading: number;
  is_safe_to_operate: boolean;
  notes?: string;
  inspected_at: string;
}

export const FleetMaintenanceView: React.FC = () => {
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const { currentCompany, language, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  const [activeTab, setActiveTab] = useState<'telemetry' | 'maintenance' | 'fuel' | 'inspections'>('telemetry');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [inspections, setInspections] = useState<InspectionLog[]>([]);
  const [trips, setTrips] = useState<any[]>([]);

  // Modals
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showFuelModal, setShowFuelModal] = useState(false);

  // Forms
  const [orderForm, setOrderForm] = useState({
    vehicle_id: '',
    order_type: 'preventive',
    priority: 'medium',
    description: '',
    parts_cost: 0,
    labor_cost: 0,
    scheduled_date: new Date().toISOString().split('T')[0],
  });

  const [fuelForm, setFuelForm] = useState({
    vehicle_id: '',
    trip_id: '',
    liters: 100,
    price_per_liter: 2.35,
    fuel_station: 'SASCO Al-Kharj Highway',
    odometer_reading: 128450,
  });

  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    try {
      const [vRes, mRes, fRes, iRes, tRes] = await Promise.all([
        erpApi.getVehicles(currentCompany.id).catch(() => []),
        erpApi.getMaintenanceOrders(currentCompany.id).catch(() => []),
        erpApi.getFuelTransactions(currentCompany.id).catch(() => []),
        erpApi.getInspectionLogs(currentCompany.id).catch(() => []),
        erpApi.getMobileTrips(currentCompany.id).catch(() => []),
      ]);
      const fallbackVehicles = [
        { id: 'v-101', name: 'Mercedes Actros 3340', license_plate: '7842-KAD', model: 'Actros 3340', vehicle_type: 'truck', status: 'active', odometer_km: 128450 },
        { id: 'v-102', name: 'Volvo FMX 460', license_plate: '5120-RBD', model: 'FMX 460', vehicle_type: 'truck', status: 'active', odometer_km: 94200 },
        { id: 'v-103', name: 'MAN TGS 33.400', license_plate: '3981-SAD', model: 'TGS 33.400', vehicle_type: 'truck', status: 'active', odometer_km: 162100 },
        { id: 'v-104', name: 'Mercedes Actros 4048', license_plate: '9012-HAD', model: 'Actros 4048', vehicle_type: 'truck', status: 'active', odometer_km: 78300 },
      ];
      const resolvedVehicles = Array.isArray(vRes) && vRes.length > 0 ? vRes : fallbackVehicles;
      setVehicles(resolvedVehicles);
      setOrders(Array.isArray(mRes) ? mRes : []);
      setFuelLogs(Array.isArray(fRes) ? fRes : []);
      setInspections(Array.isArray(iRes) ? iRes : []);
      setTrips(Array.isArray(tRes) ? tRes : []);

      if (resolvedVehicles.length > 0) {
        setOrderForm((prev) => (prev.vehicle_id ? prev : { ...prev, vehicle_id: resolvedVehicles[0].id }));
        setFuelForm((prev) => (prev.vehicle_id ? prev : { ...prev, vehicle_id: resolvedVehicles[0].id }));
      }
    } catch (err: any) {
      console.error('Error fetching fleet maintenance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentCompany?.id]);

  // Vehicle Map for fast lookup
  const vehicleMap = useMemo(() => {
    const map = new Map<string, Vehicle>();
    vehicles.forEach((v) => map.set(v.id, v));
    return map;
  }, [vehicles]);

  // Trip Map
  const tripMap = useMemo(() => {
    const map = new Map<string, any>();
    trips.forEach((t) => map.set(t.id, t));
    return map;
  }, [trips]);

  // Stats
  const totalMaintenanceCost = orders.reduce((sum, o) => sum + Number(o.total_cost || 0), 0);
  const totalFuelLiters = fuelLogs.reduce((sum, f) => sum + Number(f.liters || 0), 0);
  const totalFuelCost = fuelLogs.reduce((sum, f) => sum + Number(f.total_amount || 0), 0);
  const avgFuelPrice = totalFuelLiters > 0 ? (totalFuelCost / totalFuelLiters).toFixed(2) : '0.00';

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany?.id || !orderForm.vehicle_id) return;
    try {
      const parts = Number(orderForm.parts_cost) || 0;
      const labor = Number(orderForm.labor_cost) || 0;
      await erpApi.createMaintenanceOrder(currentCompany.id, {
        vehicle_id: orderForm.vehicle_id,
        order_type: orderForm.order_type,
        priority: orderForm.priority,
        description: orderForm.description,
        parts_cost: parts,
        labor_cost: labor,
        scheduled_date: orderForm.scheduled_date ? new Date(orderForm.scheduled_date).toISOString() : undefined,
      });
      setShowOrderModal(false);
      setStatusNotice({ type: 'success', message: isAr ? 'تم إنشاء أمر الصيانة بنجاح' : 'Work order created successfully' });
      fetchData();
    } catch (err: any) {
      setStatusNotice({ type: 'error', message: err?.message || 'Failed to create work order' });
    }
  };

  const handleCreateFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany?.id || !fuelForm.vehicle_id) return;
    try {
      const liters = Number(fuelForm.liters);
      const price = Number(fuelForm.price_per_liter);
      await erpApi.createFuelTransaction(currentCompany.id, {
        vehicle_id: fuelForm.vehicle_id,
        trip_id: fuelForm.trip_id || undefined,
        liters,
        price_per_liter: price,
        total_amount: Number((liters * price).toFixed(4)),
        odometer_reading: Number(fuelForm.odometer_reading),
        fuel_station: fuelForm.fuel_station,
        transaction_date: new Date().toISOString(),
      });
      setShowFuelModal(false);
      setStatusNotice({ type: 'success', message: isAr ? 'تم تسجيل تعبئة الوقود بنجاح' : 'Fuel transaction logged successfully' });
      fetchData();
    } catch (err: any) {
      setStatusNotice({ type: 'error', message: err?.message || 'Failed to log fuel transaction' });
    }
  };

  const handleExportJSONSnapshot = () => {
    const dataStr = JSON.stringify(
      {
        company: currentCompany?.name,
        activeTab,
        totalOrders: orders.length,
        totalFuelLogs: fuelLogs.length,
        orders,
        fuelLogs,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OxenGL_Fleet_Maintenance_Snapshot_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (activeTab === 'fuel') {
      const headers = ['Tx #', 'Vehicle', 'Linked Trip', 'Liters', 'Price/L', 'Total (SAR)', 'Odometer', 'Fuel Station'];
      const rowsCsv = fuelLogs.map((f) => {
        const veh = vehicleMap.get(f.vehicle_id);
        const trp = f.trip_id ? tripMap.get(f.trip_id) : null;
        return [
          f.transaction_number,
          veh ? `"${veh.license_plate} (${veh.name})"` : f.vehicle_id,
          trp ? trp.trip_number : f.trip_id || '',
          f.liters,
          f.price_per_liter,
          f.total_amount,
          f.odometer_reading || '',
          `"${f.fuel_station || ''}"`,
        ].join(',');
      });
      const csvContent = '\uFEFF' + [headers.join(','), ...rowsCsv].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OxenGL_Fuel_Telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['Order #', 'Vehicle', 'Type', 'Priority', 'Description', 'Parts Cost', 'Labor Cost', 'Total Cost', 'Status'];
      const rowsCsv = orders.map((o) => {
        const veh = vehicleMap.get(o.vehicle_id);
        return [
          o.order_number,
          veh ? `"${veh.license_plate} (${veh.name})"` : o.vehicle_id,
          o.order_type,
          o.priority,
          `"${o.description || ''}"`,
          o.parts_cost,
          o.labor_cost,
          o.total_cost,
          o.status,
        ].join(',');
      });
      const csvContent = '\uFEFF' + [headers.join(','), ...rowsCsv].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OxenGL_Maintenance_Orders_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-6 min-h-dvh erp-viewport-root px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto ${isDark ? 'text-slate-100' : 'text-slate-900'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className={`rounded-3xl border p-6 shadow-xl relative overflow-visible ${
        isDark
          ? 'border-slate-800 bg-gradient-to-r from-slate-900 via-zinc-900 to-slate-900'
          : 'border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Wrench className="h-7 w-7 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white">
                  {isAr ? 'إدارة صيانة الأسطول ومصروفات الوقود' : 'Fleet Maintenance & Fuel Operations'}
                </h1>
                <span className="rounded-full bg-orange-500/20 border border-orange-400/30 px-3 py-0.5 text-xs font-bold text-orange-300">
                  {vehicles.length} {isAr ? 'مركبة' : 'Vehicles'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                {isAr
                  ? 'أوامر الصيانة الدورية والطارئة، تكاليف القطع والعمالة، وسجلات تعبئة الوقود المرتبطة بالرحلات'
                  : 'Preventive/corrective work orders, labor/parts cost breakdown, and trip-linked fuel telemetry'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowOrderModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors"
            >
              <Plus className="h-4 w-4" />
              {isAr ? 'أمر صيانة جديد' : 'New Order'}
            </button>
            <button
              onClick={() => setShowFuelModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors"
            >
              <Fuel className="h-4 w-4" />
              {isAr ? 'تسجيل وقود' : 'Log Fuel'}
            </button>
            <ActionsMenu
              isArabic={isAr}
              isDark
              items={[
                { id: 'bulk-import-btn', label: isAr ? 'استيراد جماعي (.xlsx)' : 'Bulk Import (.xlsx)', icon: BulkUploadIcon, onSelect: () => setIsBulkImportOpen(true) },
                { id: 'export-fleet-json-btn', label: isAr ? 'لقطة JSON' : 'JSON Snapshot', icon: Download, onSelect: handleExportJSONSnapshot },
                { id: 'export-fleet-excel-btn', label: isAr ? 'تصدير Excel' : 'Export Excel', icon: FileSpreadsheet, onSelect: handleExportExcel },
                { id: 'print-fleet-btn', label: isAr ? 'طباعة التقرير' : 'Export & Print', icon: Printer, onSelect: handlePrint },
              ]}
            />
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors"
              title={isAr ? 'تحديث' : 'Refresh'}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {statusNotice && (
        <div className={`rounded-2xl border p-4 text-xs font-bold flex items-center justify-between ${
          statusNotice.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
        }`}>
          <span>{statusNotice.message}</span>
          <button onClick={() => setStatusNotice(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className={`rounded-2xl border p-5 ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">{isAr ? 'أوامر الصيانة' : 'Work Orders'}</span>
            <div className="h-8 w-8 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-mono text-2xl font-black">{orders.length}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {orders.filter((o) => o.status === 'in_progress').length} {isAr ? 'قيد التنفيذ' : 'in progress'}
          </p>
        </div>

        <div className={`rounded-2xl border p-5 ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">{isAr ? 'إجمالي تكلفة الصيانة' : 'Maintenance Spend'}</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-3 font-mono text-2xl font-black text-amber-500">
            {totalMaintenanceCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs font-bold">SAR</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{isAr ? 'قطع غيار وعمالة ورش' : 'Parts & labor combined'}</p>
        </div>

        <div className={`rounded-2xl border p-5 ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">{isAr ? 'استهلاك الوقود' : 'Fuel Consumed'}</span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Fuel className="h-4 w-4" />
            </div>
          </div>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-3 font-mono text-2xl font-black text-blue-500">
            {totalFuelLiters.toLocaleString('en-US', { minimumFractionDigits: 1 })} <span className="text-xs font-bold">L</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold">{totalFuelCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR</span> {isAr ? 'مصروف الوقود' : 'spent'}
          </p>
        </div>

        <div className={`rounded-2xl border p-5 ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">{isAr ? 'فحوصات السلامة الميدانية' : 'Driver Safety Audits'}</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <p dir="ltr" className="inline-block unicode-bidi-isolate mt-3 font-mono text-2xl font-black text-emerald-500">{inspections.length}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {inspections.filter((i) => i.is_safe_to_operate).length} {isAr ? 'فحص مطابق وآمن' : 'verified safe'}
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 md:gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black whitespace-nowrap shrink-0 transition-all ${
            activeTab === 'telemetry'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radio className="h-4 w-4 shrink-0" />
          {isAr ? 'تتبع الأسطول المباشر (GPS)' : 'Live GPS Telemetry'}
        </button>

        <button
          onClick={() => setActiveTab('maintenance')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black whitespace-nowrap shrink-0 transition-all ${
            activeTab === 'maintenance'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wrench className="h-4 w-4 shrink-0" />
          {isAr ? 'أوامر الصيانة والخدمة' : 'Work Orders'} ({orders.length})
        </button>

        <button
          onClick={() => setActiveTab('fuel')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black whitespace-nowrap shrink-0 transition-all ${
            activeTab === 'fuel'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Fuel className="h-4 w-4 shrink-0" />
          {isAr ? 'سجلات الوقود والكفاءة' : 'Fuel Telemetry'} ({fuelLogs.length})
        </button>

        <button
          onClick={() => setActiveTab('inspections')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black whitespace-nowrap shrink-0 transition-all ${
            activeTab === 'inspections'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {isAr ? 'فحوصات السلامة قبل الرحلة' : 'Pre-Trip Inspections'} ({inspections.length})
        </button>
      </div>

      {/* TAB 0: Live GPS Telemetry */}
      {activeTab === 'telemetry' && (
        <FleetTracker />
      )}

      {/* TAB 1: Work Orders */}
      {activeTab === 'maintenance' && (
        <div className={`rounded-3xl border p-6 shadow-xs ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}>
          <div className="w-full overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className={`border-b ${isDark ? 'border-slate-800 bg-slate-900/80 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                <tr>
                  <th className="p-3.5 font-bold">{isAr ? 'رقم الأمر' : 'Order #'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'المركبة' : 'Vehicle'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'الأولوية' : 'Priority'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'الوصف' : 'Description'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'قطع الغيار (ر.س)' : 'Parts (SAR)'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'العمالة (ر.س)' : 'Labor (SAR)'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'الإجمالي (ر.س)' : 'Total (SAR)'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      {isAr ? 'لا توجد أوامر صيانة مسجلة حتى الآن' : 'No maintenance orders found.'}
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const veh = vehicleMap.get(o.vehicle_id);
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-orange-500">{o.order_number}</span></td>
                        <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                          {veh ? <span dir="ltr" className="inline-block unicode-bidi-isolate">{veh.license_plate} ({veh.name})</span> : <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{o.vehicle_id.slice(0, 8)}</span>}
                        </td>
                        <td className="p-3.5 uppercase font-medium text-slate-600 dark:text-slate-400">
                          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px]">
                            {o.order_type}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            o.priority === 'critical' || o.priority === 'high'
                              ? 'bg-rose-500/10 text-rose-500'
                              : 'bg-blue-500/10 text-blue-500'
                          }`}>
                            {o.priority}
                          </span>
                        </td>
                        <td className="p-3.5 max-w-xs truncate text-slate-600 dark:text-slate-300">{o.description}</td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{Number(o.parts_cost).toFixed(2)}</span></td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{Number(o.labor_cost).toFixed(2)}</span></td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-black text-slate-900 dark:text-white">
                          {Number(o.total_cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span></td>
                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                            o.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : o.status === 'in_progress'
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-slate-500/10 text-slate-400'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Fuel Telemetry */}
      {activeTab === 'fuel' && (
        <div className={`rounded-3xl border p-6 shadow-xs ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}>
          <div className="w-full overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className={`border-b ${isDark ? 'border-slate-800 bg-slate-900/80 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                <tr>
                  <th className="p-3.5 font-bold">{isAr ? 'رقم الإيصال' : 'Tx #'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'المركبة' : 'Vehicle'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'الرحلة المرتبطة' : 'Linked Trip'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'الكمية (لتر)' : 'Liters'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'سعر اللتر' : 'Price / L'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'الإجمالي (ر.س)' : 'Total (SAR)'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'العداد (كم)' : 'Odometer (km)'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'محطة الوقود' : 'Fuel Station'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fuelLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      {isAr ? 'لا توجد حركات وقود مسجلة حتى الآن' : 'No fuel transactions recorded.'}
                    </td>
                  </tr>
                ) : (
                  fuelLogs.map((f) => {
                    const veh = vehicleMap.get(f.vehicle_id);
                    const trp = f.trip_id ? tripMap.get(f.trip_id) : null;
                    return (
                      <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold text-blue-500">{f.transaction_number}</span></td>
                        <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                          {veh ? <span dir="ltr" className="inline-block unicode-bidi-isolate">{veh.license_plate} ({veh.name})</span> : <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{f.vehicle_id.slice(0, 8)}</span>}
                        </td>
                        <td className="p-3.5">
                          {f.trip_id ? (
                            <span dir="ltr" className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 text-[10px] font-mono font-bold unicode-bidi-isolate whitespace-nowrap shrink-0">
                              <Truck className="h-3 w-3 shrink-0" />
                              {trp ? trp.trip_number : f.trip_id.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold">{Number(f.liters).toFixed(2)} L</span></td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{Number(f.price_per_liter).toFixed(2)} SAR</span></td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-black text-slate-900 dark:text-white">
                          {Number(f.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span></td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-slate-500">
                          {f.odometer_reading ? Number(f.odometer_reading).toLocaleString('en-US') + ' km' : '—'}
                        </span></td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">{f.fuel_station || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Inspections */}
      {activeTab === 'inspections' && (
        <div className={`rounded-3xl border p-6 shadow-xs ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}>
          <div className="w-full overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className={`border-b ${isDark ? 'border-slate-800 bg-slate-900/80 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                <tr>
                  <th className="p-3.5 font-bold">{isAr ? 'المركبة' : 'Vehicle'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'نوع الفحص' : 'Type'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'قراءة العداد' : 'Odometer (km)'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'جاهزية التشغيل' : 'Safe to Operate'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'ملاحظات الفحص' : 'Checklist Notes'}</th>
                  <th className="p-3.5 font-bold">{isAr ? 'تاريخ الفحص' : 'Inspected At'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {inspections.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      {isAr ? 'لا توجد فحوصات سلامة مسجلة' : 'No inspection records found.'}
                    </td>
                  </tr>
                ) : (
                  inspections.map((insp) => {
                    const veh = vehicleMap.get(insp.vehicle_id);
                    return (
                      <tr key={insp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                          {veh ? <span dir="ltr" className="inline-block unicode-bidi-isolate">{veh.license_plate} ({veh.name})</span> : <span dir="ltr" className="inline-block unicode-bidi-isolate font-mono">{insp.vehicle_id.slice(0, 8)}</span>}
                        </td>
                        <td className="p-3.5 uppercase font-medium">{insp.inspection_type}</td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono font-bold">
                          {insp.odometer_reading ? Number(insp.odometer_reading).toLocaleString('en-US') + ' km' : '—'}
                        </span></td>
                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black whitespace-nowrap shrink-0 ${
                            insp.is_safe_to_operate
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          }`}>
                            {insp.is_safe_to_operate ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
                            {insp.is_safe_to_operate ? (isAr ? 'آمن ومطابق' : 'Safe to Operate') : (isAr ? 'غير آمن' : 'Unsafe / Flagged')}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300 max-w-sm truncate">{insp.notes || '—'}</td>
                        <td className="p-3.5"><span dir="ltr" className="inline-block unicode-bidi-isolate font-mono text-slate-500">
                          {insp.inspected_at ? new Date(insp.inspected_at).toLocaleString('en-GB') : '—'}
                        </span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Work Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleCreateOrder}
            className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {isAr ? 'إنشاء أمر صيانة لمركبة' : 'Create Vehicle Maintenance Order'}
              </h3>
              <button type="button" onClick={() => setShowOrderModal(false)} className="text-slate-400">✕</button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'المركبة المستهدفة *' : 'Target Vehicle *'}
              </label>
              <select
                required
                value={orderForm.vehicle_id}
                onChange={(e) => setOrderForm({ ...orderForm, vehicle_id: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.license_plate} — {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'نوع الصيانة' : 'Order Type'}
                </label>
                <select
                  value={orderForm.order_type}
                  onChange={(e) => setOrderForm({ ...orderForm, order_type: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none"
                >
                  <option value="preventive">{isAr ? 'وقائية دورية' : 'Preventive'}</option>
                  <option value="corrective">{isAr ? 'تصحيحية / إصلاح' : 'Corrective'}</option>
                  <option value="emergency">{isAr ? 'طارئة' : 'Emergency'}</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'الأولوية' : 'Priority'}
                </label>
                <select
                  value={orderForm.priority}
                  onChange={(e) => setOrderForm({ ...orderForm, priority: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'وصف الصيانة والأعمال المطلوبة *' : 'Description & Scope *'}
              </label>
              <textarea
                required
                rows={2}
                value={orderForm.description}
                onChange={(e) => setOrderForm({ ...orderForm, description: e.target.value })}
                placeholder={isAr ? 'صيانة دورية، تبديل تيل فرامل، تغيير زيت...' : 'Routine service, brake shoe replacement, oil change...'}
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'تكلفة قطع الغيار (ر.س)' : 'Parts Cost (SAR)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderForm.parts_cost}
                  onChange={(e) => setOrderForm({ ...orderForm, parts_cost: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'تكلفة العمالة (ر.س)' : 'Labor Cost (SAR)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderForm.labor_cost}
                  onChange={(e) => setOrderForm({ ...orderForm, labor_cost: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 text-xs font-bold shadow-xs"
              >
                {isAr ? 'حفظ أمر الصيانة' : 'Save Order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Log Fuel Transaction Modal */}
      {showFuelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleCreateFuel}
            className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {isAr ? 'تسجيل تعبئة وقود' : 'Log Fuel Fill-Up'}
              </h3>
              <button type="button" onClick={() => setShowFuelModal(false)} className="text-slate-400">✕</button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'المركبة *' : 'Vehicle *'}
              </label>
              <select
                required
                value={fuelForm.vehicle_id}
                onChange={(e) => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.license_plate} — {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'ربط بالرحلة (اختياري)' : 'Link to Trip (Optional)'}
              </label>
              <select
                value={fuelForm.trip_id}
                onChange={(e) => setFuelForm({ ...fuelForm, trip_id: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none font-mono"
              >
                <option value="">{isAr ? '— بدون ربط برحلة محددة —' : '— No specific trip —'}</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.trip_number} ({t.origin_location} → {t.destination_location})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'الكمية (لتر) *' : 'Liters *'}
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  step="0.1"
                  value={fuelForm.liters}
                  onChange={(e) => setFuelForm({ ...fuelForm, liters: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'سعر اللتر (ر.س) *' : 'Price per Liter (SAR) *'}
                </label>
                <input
                  required
                  type="number"
                  min="0.1"
                  step="0.01"
                  value={fuelForm.price_per_liter}
                  onChange={(e) => setFuelForm({ ...fuelForm, price_per_liter: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'قراءة العداد (كم)' : 'Odometer (km)'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={fuelForm.odometer_reading}
                  onChange={(e) => setFuelForm({ ...fuelForm, odometer_reading: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'اسم محطة الوقود' : 'Fuel Station'}
                </label>
                <input
                  type="text"
                  value={fuelForm.fuel_station}
                  onChange={(e) => setFuelForm({ ...fuelForm, fuel_station: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none"
                />
              </div>
            </div>

            <div className="rounded-xl bg-blue-500/10 p-3 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-bold">{isAr ? 'المجموع التقديري:' : 'Estimated Total:'}</span>
              <span className="font-mono text-sm font-black text-blue-500">
                {(fuelForm.liters * fuelForm.price_per_liter).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
              </span>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowFuelModal(false)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold shadow-xs"
              >
                {isAr ? 'حفظ حركة الوقود' : 'Save Fuel Log'}
              </button>
            </div>
          </form>
        </div>
      )}
      <BulkImportModal isOpen={isBulkImportOpen} onClose={() => setIsBulkImportOpen(false)} defaultCategory="operations" />
    </div>
  );
};
