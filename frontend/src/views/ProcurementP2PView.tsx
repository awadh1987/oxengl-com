import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileCheck2,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Shield,
  TrendingUp,
  DollarSign,
  Package,
  XCircle,
  ArrowRight,
  BarChart3,
  Sparkles,
  AlertCircle,
  ArrowUpDown,
  Filter,
  Boxes,
  Layers,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type {
  P2PMatchResult,
  P2PMatchLineDetail,
  P2PDiscrepancyFlag,
} from '../services/api';

// ==============================================================================
// Demo Data Seeds (Frontend-Autonomous mode when API is unavailable)
// ==============================================================================
const DEMO_MATCH_RESULTS: P2PMatchResult[] = [
  {
    match_id: 'M3W-A1B2C3D4E5',
    po_number: 'PO-2026-09-QID001',
    po_id: 'po-qid-001',
    grn_number: 'GRN-2026-09-QID001',
    grn_id: 'grn-qid-001',
    invoice_number: 'INV-QID-2026-0091',
    vendor_name: 'Qiddiya Material Suppliers Co.',
    vendor_id: 'VND-QID-001',
    overall_status: 'HOLD_DISCREPANCY',
    match_confidence: 90,
    currency: 'SAR',
    po_total: 496000.00,
    grn_received_value: 490500.00,
    invoice_total: 496000.00,
    tax_amount: 74400.00,
    total_billed: 570400.00,
    total_qty_ordered: 950,
    total_qty_received: 948,
    total_qty_invoiced: 950,
    qty_fill_rate: 99.8,
    price_variance_sar: 0.00,
    price_variance_pct: 0.00,
    qty_variance_units: -2,
    price_tolerance_pct: 2.0,
    qty_tolerance_pct: 0.0,
    line_matches: [
      { line_number: 1, description: 'Crushed Basalt Aggregate 20mm', po_qty: 500, po_unit_price: 42.00, po_line_total: 21000.00, grn_qty_received: 500, invoice_qty: 500, invoice_unit_price: 42.00, invoice_line_total: 21000.00, qty_variance: 0, price_variance: 0, price_variance_pct: 0, status: 'MATCHED' },
      { line_number: 2, description: 'SRC Type V Portland Cement', po_qty: 300, po_unit_price: 210.00, po_line_total: 63000.00, grn_qty_received: 300, invoice_qty: 300, invoice_unit_price: 210.00, invoice_line_total: 63000.00, qty_variance: 0, price_variance: 0, price_variance_pct: 0, status: 'MATCHED' },
      { line_number: 3, description: 'Steel Rebar 16mm Grade 60', po_qty: 150, po_unit_price: 2750.00, po_line_total: 412500.00, grn_qty_received: 148, invoice_qty: 150, invoice_unit_price: 2750.00, invoice_line_total: 412500.00, qty_variance: -2, price_variance: 0, price_variance_pct: 0, status: 'QTY_SHORT' },
    ],
    discrepancy_flags: [
      { flag_id: 'QTY-3', severity: 'WARNING', category: 'QTY_SHORT', description: 'Line 3: Steel Rebar 16mm Grade 60 — short-shipped', expected_value: '150.00 units', actual_value: '148.00 units', variance: '-2.00 units (1.3%)', recommendation: 'Hold for vendor confirmation or accept partial delivery' },
    ],
    matched_by: 'P2P_ENGINE',
    matched_at: '2026-09-29T05:00:00Z',
    narrative: '',
    resolution_action: 'MANUAL_REVIEW',
  },
  {
    match_id: 'M3W-F6G7H8I9J0',
    po_number: 'PO-2026-09-KHJ002',
    po_id: 'po-khj-002',
    grn_number: 'GRN-2026-09-KHJ002',
    grn_id: 'grn-khj-002',
    invoice_number: 'INV-KHJ-2026-0042',
    vendor_name: 'Al-Kharj Industrial Suppliers',
    vendor_id: 'VND-KHJ-002',
    overall_status: 'MATCHED',
    match_confidence: 100,
    currency: 'SAR',
    po_total: 401200.00,
    grn_received_value: 401200.00,
    invoice_total: 401200.00,
    tax_amount: 60180.00,
    total_billed: 461380.00,
    total_qty_ordered: 280,
    total_qty_received: 280,
    total_qty_invoiced: 280,
    qty_fill_rate: 100,
    price_variance_sar: 0,
    price_variance_pct: 0,
    qty_variance_units: 0,
    price_tolerance_pct: 2.0,
    qty_tolerance_pct: 0.0,
    line_matches: [
      { line_number: 1, description: 'Bitumen 60/70 Road Paving', po_qty: 200, po_unit_price: 1650.00, po_line_total: 330000.00, grn_qty_received: 200, invoice_qty: 200, invoice_unit_price: 1650.00, invoice_line_total: 330000.00, qty_variance: 0, price_variance: 0, price_variance_pct: 0, status: 'MATCHED' },
      { line_number: 2, description: 'Polycarboxylate Concrete Admixture', po_qty: 80, po_unit_price: 890.00, po_line_total: 71200.00, grn_qty_received: 80, invoice_qty: 80, invoice_unit_price: 890.00, invoice_line_total: 71200.00, qty_variance: 0, price_variance: 0, price_variance_pct: 0, status: 'MATCHED' },
    ],
    discrepancy_flags: [],
    matched_by: 'P2P_ENGINE',
    matched_at: '2026-09-29T05:00:00Z',
    narrative: '',
    resolution_action: 'AUTO_APPROVED',
  },
  {
    match_id: 'M3W-K1L2M3N4O5',
    po_number: 'PO-2026-09-NEO003',
    po_id: 'po-neo-003',
    grn_number: 'GRN-2026-09-NEO003',
    grn_id: 'grn-neo-003',
    invoice_number: 'INV-NEO-2026-0118',
    vendor_name: 'NEOM Logistics & Heavy Equipment',
    vendor_id: 'VND-NEO-003',
    overall_status: 'HOLD_DISCREPANCY',
    match_confidence: 50,
    currency: 'SAR',
    po_total: 56750.00,
    grn_received_value: 56280.00,
    invoice_total: 58750.00,
    tax_amount: 8812.50,
    total_billed: 67562.50,
    total_qty_ordered: 5001,
    total_qty_received: 4801,
    total_qty_invoiced: 5001,
    qty_fill_rate: 96.0,
    price_variance_sar: 2000.00,
    price_variance_pct: 3.52,
    qty_variance_units: -200,
    price_tolerance_pct: 2.0,
    qty_tolerance_pct: 0.0,
    line_matches: [
      { line_number: 1, description: 'Excavator Rental (Monthly)', po_qty: 1, po_unit_price: 45000.00, po_line_total: 45000.00, grn_qty_received: 1, invoice_qty: 1, invoice_unit_price: 46500.00, invoice_line_total: 46500.00, qty_variance: 0, price_variance: 1500, price_variance_pct: 3.33, status: 'PRICE_OVER' },
      { line_number: 2, description: 'Fuel Diesel - Bulk Tanker', po_qty: 5000, po_unit_price: 2.35, po_line_total: 11750.00, grn_qty_received: 4800, invoice_qty: 5000, invoice_unit_price: 2.45, invoice_line_total: 12250.00, qty_variance: -200, price_variance: 0.10, price_variance_pct: 4.26, status: 'HOLD' },
    ],
    discrepancy_flags: [
      { flag_id: 'PRC-1', severity: 'CRITICAL', category: 'PRICE_OVER', description: 'Line 1: Excavator Rental — invoice price exceeds PO', expected_value: '45,000.00 SAR/unit', actual_value: '46,500.00 SAR/unit', variance: '+1,500.00 SAR/unit (3.3%)', recommendation: 'Request credit note or revised invoice from vendor' },
      { flag_id: 'QTY-2', severity: 'WARNING', category: 'QTY_SHORT', description: 'Line 2: Fuel Diesel — short-shipped', expected_value: '5,000.00 units', actual_value: '4,800.00 units', variance: '-200.00 units (4.0%)', recommendation: 'Hold for vendor confirmation or accept partial delivery' },
      { flag_id: 'PRC-2', severity: 'CRITICAL', category: 'PRICE_OVER', description: 'Line 2: Fuel Diesel — invoice price exceeds PO', expected_value: '2.35 SAR/unit', actual_value: '2.45 SAR/unit', variance: '+0.10 SAR/unit (4.3%)', recommendation: 'Request credit note or revised invoice from vendor' },
    ],
    matched_by: 'P2P_ENGINE',
    matched_at: '2026-09-29T05:00:00Z',
    narrative: '',
    resolution_action: 'MANUAL_REVIEW',
  },
  {
    match_id: 'M3W-P6Q7R8S9T0',
    po_number: 'PO-2026-08-RYD004',
    po_id: 'po-ryd-004',
    grn_number: 'GRN-2026-08-RYD004',
    grn_id: 'grn-ryd-004',
    invoice_number: 'INV-RYD-2026-0203',
    vendor_name: 'Riyadh Ready-Mix Concrete',
    vendor_id: 'VND-RYD-004',
    overall_status: 'MATCHED',
    match_confidence: 100,
    currency: 'SAR',
    po_total: 128000.00,
    grn_received_value: 128000.00,
    invoice_total: 128000.00,
    tax_amount: 19200.00,
    total_billed: 147200.00,
    total_qty_ordered: 400,
    total_qty_received: 400,
    total_qty_invoiced: 400,
    qty_fill_rate: 100,
    price_variance_sar: 0,
    price_variance_pct: 0,
    qty_variance_units: 0,
    price_tolerance_pct: 2.0,
    qty_tolerance_pct: 0.0,
    line_matches: [
      { line_number: 1, description: 'Ready-Mix C40 Grade Concrete', po_qty: 400, po_unit_price: 320.00, po_line_total: 128000.00, grn_qty_received: 400, invoice_qty: 400, invoice_unit_price: 320.00, invoice_line_total: 128000.00, qty_variance: 0, price_variance: 0, price_variance_pct: 0, status: 'MATCHED' },
    ],
    discrepancy_flags: [],
    matched_by: 'P2P_ENGINE',
    matched_at: '2026-09-29T05:00:00Z',
    narrative: '',
    resolution_action: 'AUTO_APPROVED',
  },
  {
    match_id: 'M3W-U1V2W3X4Y5',
    po_number: 'PO-2026-09-JED005',
    po_id: 'po-jed-005',
    grn_number: 'GRN-2026-09-JED005',
    grn_id: 'grn-jed-005',
    invoice_number: 'INV-JED-2026-0077',
    vendor_name: 'Jeddah Steel & Fabrication Works',
    vendor_id: 'VND-JED-005',
    overall_status: 'HOLD_DISCREPANCY',
    match_confidence: 65,
    currency: 'SAR',
    po_total: 332000.00,
    grn_received_value: 311000.00,
    invoice_total: 343500.00,
    tax_amount: 51525.00,
    total_billed: 395025.00,
    total_qty_ordered: 275,
    total_qty_received: 270,
    total_qty_invoiced: 275,
    qty_fill_rate: 98.2,
    price_variance_sar: 11500.00,
    price_variance_pct: 3.46,
    qty_variance_units: -5,
    price_tolerance_pct: 2.0,
    qty_tolerance_pct: 0.0,
    line_matches: [
      { line_number: 1, description: 'Structural Steel H-Beam 300x300', po_qty: 75, po_unit_price: 4200.00, po_line_total: 315000.00, grn_qty_received: 70, invoice_qty: 75, invoice_unit_price: 4350.00, invoice_line_total: 326250.00, qty_variance: -5, price_variance: 150, price_variance_pct: 3.57, status: 'HOLD' },
      { line_number: 2, description: 'Welding Rods 3.2mm (Box)', po_qty: 200, po_unit_price: 85.00, po_line_total: 17000.00, grn_qty_received: 200, invoice_qty: 200, invoice_unit_price: 85.00, invoice_line_total: 17000.00, qty_variance: 0, price_variance: 0, price_variance_pct: 0, status: 'MATCHED' },
    ],
    discrepancy_flags: [
      { flag_id: 'QTY-1', severity: 'CRITICAL', category: 'QTY_SHORT', description: 'Line 1: Steel H-Beam 300x300 — short-shipped', expected_value: '75.00 units', actual_value: '70.00 units', variance: '-5.00 units (6.7%)', recommendation: 'Hold for vendor confirmation or accept partial delivery' },
      { flag_id: 'PRC-1', severity: 'CRITICAL', category: 'PRICE_OVER', description: 'Line 1: Steel H-Beam 300x300 — invoice price exceeds PO', expected_value: '4,200.00 SAR/unit', actual_value: '4,350.00 SAR/unit', variance: '+150.00 SAR/unit (3.6%)', recommendation: 'Request credit note or revised invoice from vendor' },
    ],
    matched_by: 'P2P_ENGINE',
    matched_at: '2026-09-29T05:00:00Z',
    narrative: '',
    resolution_action: 'MANUAL_REVIEW',
  },
];


// ==============================================================================
// Component
// ==============================================================================

export const ProcurementP2PView: React.FC = () => {
  const { language, themeMode } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';

  // State
  const [matchResults, setMatchResults] = useState<P2PMatchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'matched' | 'hold'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [priceTolerance, setPriceTolerance] = useState(2.0);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Load data
  const loadP2PData = useCallback(async () => {
    setLoading(true);
    try {
      // Try API first, fallback to demo
      const response = await fetch('/api/v1/procurement/p2p/summary', {
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        setMatchResults(data.match_results || []);
      } else {
        setMatchResults(DEMO_MATCH_RESULTS);
      }
    } catch {
      setMatchResults(DEMO_MATCH_RESULTS);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadP2PData(); }, [loadP2PData]);

  // Run P2P Match
  const runP2PMatch = useCallback(async () => {
    setIsRunning(true);
    setNotification({ type: 'info', message: isAr ? 'جاري تنفيذ المطابقة الثلاثية...' : 'Executing autonomous three-way matching...' });
    try {
      const response = await fetch('/api/v1/procurement/p2p/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          po_reference: 'ALL',
          price_tolerance_pct: priceTolerance,
          qty_tolerance_pct: 0.0,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setMatchResults(data.match_results || []);
        const summary = data.summary || {};
        setNotification({
          type: 'success',
          message: isAr
            ? `✅ تم تدقيق ${summary.total_orders || 0} أوامر شراء — ${summary.matched || 0} مطابقة، ${summary.on_hold || 0} معلقة`
            : `✅ Audited ${summary.total_orders || 0} POs — ${summary.matched || 0} matched, ${summary.on_hold || 0} on hold`,
        });
      } else {
        // Use demo data with fresh execution
        setMatchResults(DEMO_MATCH_RESULTS);
        setNotification({ type: 'success', message: isAr ? '✅ تم تنفيذ المطابقة (وضع العرض التوضيحي)' : '✅ P2P match executed (Demo mode)' });
      }
    } catch {
      setMatchResults(DEMO_MATCH_RESULTS);
      setNotification({ type: 'success', message: isAr ? '✅ تم تنفيذ المطابقة (وضع العرض التوضيحي)' : '✅ P2P match executed (Demo mode)' });
    }
    setIsRunning(false);
    setTimeout(() => setNotification(null), 5000);
  }, [priceTolerance, isAr]);

  // KPI calculations
  const kpis = useMemo(() => {
    const total = matchResults.length;
    const matched = matchResults.filter(r => r.overall_status === 'MATCHED').length;
    const onHold = matchResults.filter(r => r.overall_status === 'HOLD_DISCREPANCY').length;
    const totalPO = matchResults.reduce((s, r) => s + r.po_total, 0);
    const totalInv = matchResults.reduce((s, r) => s + r.invoice_total, 0);
    const totalFlags = matchResults.reduce((s, r) => s + r.discrepancy_flags.length, 0);
    const avgConf = total > 0 ? matchResults.reduce((s, r) => s + r.match_confidence, 0) / total : 0;
    const matchRate = total > 0 ? (matched / total) * 100 : 0;
    return { total, matched, onHold, totalPO, totalInv, totalFlags, avgConf, matchRate };
  }, [matchResults]);

  // Filtering
  const filteredResults = useMemo(() => {
    let results = matchResults;
    if (activeFilter === 'matched') results = results.filter(r => r.overall_status === 'MATCHED');
    if (activeFilter === 'hold') results = results.filter(r => r.overall_status === 'HOLD_DISCREPANCY');
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      results = results.filter(r =>
        r.po_number.toLowerCase().includes(q) ||
        r.vendor_name.toLowerCase().includes(q) ||
        r.invoice_number.toLowerCase().includes(q)
      );
    }
    return results;
  }, [matchResults, activeFilter, searchTerm]);

  const fmtCurrency = (v: number) => new Intl.NumberFormat('en-SA', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> {isAr ? 'مطابق' : 'Matched'}
          </span>
        );
      case 'HOLD_DISCREPANCY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> {isAr ? 'معلق - تباين' : 'Hold - Discrepancy'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <Clock className="w-3 h-3" /> {isAr ? 'قيد الانتظار' : 'Pending'}
          </span>
        );
    }
  };

  const getLineStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      MATCHED: { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400', label: isAr ? 'مطابق' : 'OK' },
      QTY_SHORT: { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400', label: isAr ? 'نقص' : 'Short' },
      PRICE_OVER: { bg: 'bg-red-500/15 border-red-500/30', text: 'text-red-400', label: isAr ? 'سعر زائد' : 'Over' },
      HOLD: { bg: 'bg-rose-500/15 border-rose-500/30', text: 'text-rose-400', label: isAr ? 'حجز' : 'Hold' },
    };
    const s = map[status] || map['MATCHED'];
    return <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'CRITICAL') return 'text-red-400 bg-red-500/10 border-red-500/30';
    if (severity === 'WARNING') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 90) return 'text-emerald-400';
    if (conf >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  // ==============================================================================
  // Render
  // ==============================================================================
  return (
    <div className={`min-h-dvh-safe p-4 md:p-6 transition-colors ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-md px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-5 ${
          notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
          notification.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
          'bg-blue-500/10 border-blue-500/30 text-blue-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> :
           notification.type === 'error' ? <XCircle className="w-5 h-5 shrink-0" /> :
           <Sparkles className="w-5 h-5 shrink-0 animate-pulse" />}
          <span className="text-sm font-medium">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-auto opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <FileCheck2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                {isAr ? 'محرك المطابقة الثلاثية (P2P)' : 'Procurement-to-Pay (P2P) Engine'}
              </h1>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {isAr ? 'تدقيق أوتوماتيكي لأوامر الشراء ← سندات الاستلام ← فواتير الموردين' : 'Autonomous PO → GRN → Vendor Invoice Matching & Audit'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Tolerance Slider */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
            <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isAr ? 'تفاوت السعر' : 'Price Tol.'}</span>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={priceTolerance}
              onChange={(e) => setPriceTolerance(parseFloat(e.target.value))}
              className="w-20 h-1.5 accent-violet-500"
            />
            <span className="text-xs font-bold text-violet-400">{priceTolerance}%</span>
          </div>
          <button
            onClick={runP2PMatch}
            disabled={isRunning}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm shadow-lg transition-all ${
              isRunning
                ? 'bg-slate-700 text-slate-400 cursor-wait'
                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isAr ? 'تنفيذ المطابقة' : 'Execute Match'}
          </button>
          <button
            onClick={loadP2PData}
            className={`p-2.5 rounded-xl border ${isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'} transition-all`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: isAr ? 'إجمالي الأوامر' : 'Total POs Audited',
            value: kpis.total.toString(),
            icon: ShoppingCart,
            color: 'from-violet-500/20 to-violet-600/10',
            iconColor: 'text-violet-400',
            borderColor: 'border-violet-500/20',
          },
          {
            label: isAr ? 'معدل المطابقة' : 'Match Rate',
            value: `${kpis.matchRate.toFixed(0)}%`,
            icon: CheckCircle2,
            color: 'from-emerald-500/20 to-emerald-600/10',
            iconColor: 'text-emerald-400',
            borderColor: 'border-emerald-500/20',
            sub: `${kpis.matched} / ${kpis.total}`,
          },
          {
            label: isAr ? 'أوامر معلقة' : 'On Hold',
            value: kpis.onHold.toString(),
            icon: AlertTriangle,
            color: 'from-amber-500/20 to-amber-600/10',
            iconColor: 'text-amber-400',
            borderColor: 'border-amber-500/20',
            sub: `${kpis.totalFlags} ${isAr ? 'تنبيه' : 'flags'}`,
          },
          {
            label: isAr ? 'إجمالي قيمة الأوامر' : 'Total PO Value',
            value: `${fmtCurrency(kpis.totalPO)}`,
            icon: DollarSign,
            color: 'from-cyan-500/20 to-cyan-600/10',
            iconColor: 'text-cyan-400',
            borderColor: 'border-cyan-500/20',
            sub: 'SAR',
          },
        ].map((kpi, idx) => (
          <div
            key={idx}
            className={`relative overflow-hidden rounded-xl border p-4 transition-all hover:scale-[1.02] ${isDark ? `bg-gradient-to-br ${kpi.color} ${kpi.borderColor} border` : 'bg-white border-slate-200 shadow-sm'}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{kpi.label}</p>
                <p className="text-xl font-bold tracking-tight">{kpi.value}</p>
                {kpi.sub && <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{kpi.sub}</p>}
              </div>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <kpi.icon className={`w-4.5 h-4.5 ${kpi.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Confidence & Variance Summary Bar */}
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 mb-6`}>
        <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-violet-400" />
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAr ? 'متوسط ثقة المطابقة' : 'Avg Match Confidence'}</span>
          </div>
          <div className="flex items-end gap-2">
            <span className={`text-2xl font-bold ${getConfidenceColor(kpis.avgConf)}`}>{kpis.avgConf.toFixed(0)}%</span>
            <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${kpis.avgConf >= 90 ? 'bg-emerald-500' : kpis.avgConf >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${kpis.avgConf}%` }}
              />
            </div>
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAr ? 'فرق الفواتير' : 'Invoice Variance'}</span>
          </div>
          <div className="flex items-end gap-2">
            <span className={`text-2xl font-bold ${(kpis.totalInv - kpis.totalPO) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {(kpis.totalInv - kpis.totalPO) >= 0 ? '+' : ''}{fmtCurrency(kpis.totalInv - kpis.totalPO)}
            </span>
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>SAR</span>
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-fuchsia-400" />
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAr ? 'إجمالي الفوترة' : 'Total Billed (incl. VAT)'}</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-fuchsia-400">{fmtCurrency(matchResults.reduce((s, r) => s + r.total_billed, 0))}</span>
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>SAR</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className={`flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-4`}>
        <div className={`flex items-center rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
          {(['all', 'matched', 'hold'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-4 py-2 text-xs font-semibold transition-all ${
                activeFilter === tab
                  ? 'bg-violet-500/20 text-violet-400 border-b-2 border-violet-500'
                  : isDark ? 'text-slate-400 hover:bg-slate-700/50' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab === 'all' ? (isAr ? 'الكل' : 'All') : tab === 'matched' ? (isAr ? 'مطابق' : 'Matched') : (isAr ? 'معلق' : 'On Hold')}
              <span className="ml-1.5 text-[10px] opacity-60">
                ({tab === 'all' ? kpis.total : tab === 'matched' ? kpis.matched : kpis.onHold})
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className={`relative ${isDark ? '' : ''}`}>
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <input
            type="text"
            placeholder={isAr ? 'بحث PO / مورد / فاتورة...' : 'Search PO / Vendor / Invoice...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`pl-10 pr-4 py-2.5 rounded-xl border text-sm w-full md:w-72 ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-200 placeholder-slate-500 focus:border-violet-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-violet-500'} outline-none transition-colors`}
          />
        </div>
      </div>

      {/* Match Results Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
          <span className={`ml-3 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isAr ? 'جاري تحميل بيانات المطابقة...' : 'Loading P2P match data...'}</span>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-20 rounded-xl border ${isDark ? 'bg-slate-900/30 border-slate-800' : 'bg-white border-slate-200'}`}>
          <Package className="w-12 h-12 text-slate-600 mb-3" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isAr ? 'لا توجد نتائج مطابقة' : 'No matching results found'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResults.map((result) => {
            const isExpanded = expandedRow === result.match_id;
            return (
              <div
                key={result.match_id}
                className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-slate-300'} ${
                  isExpanded ? (isDark ? 'border-violet-500/40 shadow-lg shadow-violet-500/5' : 'border-violet-400 shadow-lg') : ''
                }`}
              >
                {/* Summary Row */}
                <button
                  onClick={() => setExpandedRow(isExpanded ? null : result.match_id)}
                  className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-all ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex-1 grid grid-cols-12 gap-3 items-center">
                    {/* PO Number */}
                    <div className="col-span-2">
                      <p className="text-xs font-mono font-bold text-violet-400">{result.po_number}</p>
                      <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{result.invoice_number}</p>
                    </div>
                    {/* Vendor */}
                    <div className="col-span-3">
                      <p className={`text-sm font-medium truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{result.vendor_name}</p>
                      <p className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{result.vendor_id}</p>
                    </div>
                    {/* Status */}
                    <div className="col-span-2">
                      {getStatusBadge(result.overall_status)}
                    </div>
                    {/* PO Total */}
                    <div className="col-span-2 text-right">
                      <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtCurrency(result.po_total)}</p>
                      <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>SAR</p>
                    </div>
                    {/* Confidence */}
                    <div className="col-span-2 flex items-center gap-2">
                      <div className="flex-1">
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${result.match_confidence >= 90 ? 'bg-emerald-500' : result.match_confidence >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${result.match_confidence}%` }}
                          />
                        </div>
                      </div>
                      <span className={`text-xs font-bold ${getConfidenceColor(result.match_confidence)}`}>{result.match_confidence}%</span>
                    </div>
                    {/* Flags */}
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      {result.discrepancy_flags.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                          <AlertCircle className="w-3 h-3" /> {result.discrepancy_flags.length}
                        </span>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className={`border-t ${isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-100 bg-slate-50'}`}>
                    {/* Meta Bar */}
                    <div className={`grid grid-cols-2 md:grid-cols-5 gap-3 px-4 py-3 border-b ${isDark ? 'border-slate-800/50' : 'border-slate-100'}`}>
                      {[
                        { label: isAr ? 'قيمة PO' : 'PO Value', value: `${fmtCurrency(result.po_total)} SAR` },
                        { label: isAr ? 'قيمة الفاتورة' : 'Invoice Value', value: `${fmtCurrency(result.invoice_total)} SAR` },
                        { label: isAr ? 'ضريبة القيمة المضافة' : 'VAT', value: `${fmtCurrency(result.tax_amount)} SAR` },
                        { label: isAr ? 'معدل التعبئة' : 'Qty Fill Rate', value: `${result.qty_fill_rate}%` },
                        { label: isAr ? 'الإجراء' : 'Resolution', value: result.resolution_action.replace(/_/g, ' ') },
                      ].map((m, i) => (
                        <div key={i}>
                          <p className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{m.label}</p>
                          <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{m.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Line-Level Match Table */}
                    <div className="px-4 py-3">
                      <h4 className={`text-xs font-bold mb-2 flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <Layers className="w-3.5 h-3.5 text-violet-400" />
                        {isAr ? 'مطابقة على مستوى البنود' : 'Line-Level Match Detail'}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className={`${isDark ? 'text-slate-500' : 'text-slate-400'} border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                              <th className="text-left py-2 px-2 font-medium">#</th>
                              <th className="text-left py-2 px-2 font-medium">{isAr ? 'الصنف' : 'Item'}</th>
                              <th className="text-right py-2 px-2 font-medium">{isAr ? 'كمية PO' : 'PO Qty'}</th>
                              <th className="text-right py-2 px-2 font-medium">{isAr ? 'كمية GRN' : 'GRN Qty'}</th>
                              <th className="text-right py-2 px-2 font-medium">{isAr ? 'سعر PO' : 'PO Price'}</th>
                              <th className="text-right py-2 px-2 font-medium">{isAr ? 'سعر الفاتورة' : 'Inv Price'}</th>
                              <th className="text-right py-2 px-2 font-medium">{isAr ? 'فرق السعر' : 'Δ Price'}</th>
                              <th className="text-center py-2 px-2 font-medium">{isAr ? 'الحالة' : 'Status'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.line_matches.map((line) => (
                              <tr key={line.line_number} className={`border-b ${isDark ? 'border-slate-800/50 hover:bg-slate-800/30' : 'border-slate-100 hover:bg-slate-100/50'} transition-colors`}>
                                <td className="py-2 px-2 font-mono text-slate-500">{line.line_number}</td>
                                <td className={`py-2 px-2 font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{line.description}</td>
                                <td className="py-2 px-2 text-right font-mono">{line.po_qty.toLocaleString()}</td>
                                <td className={`py-2 px-2 text-right font-mono ${line.grn_qty_received < line.po_qty ? 'text-amber-400' : ''}`}>
                                  {line.grn_qty_received.toLocaleString()}
                                </td>
                                <td className="py-2 px-2 text-right font-mono">{fmtCurrency(line.po_unit_price)}</td>
                                <td className={`py-2 px-2 text-right font-mono ${line.price_variance > 0 ? 'text-red-400' : ''}`}>
                                  {fmtCurrency(line.invoice_unit_price)}
                                </td>
                                <td className={`py-2 px-2 text-right font-mono ${line.price_variance > 0 ? 'text-red-400' : line.price_variance < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                  {line.price_variance > 0 ? '+' : ''}{fmtCurrency(line.price_variance)} ({line.price_variance_pct.toFixed(1)}%)
                                </td>
                                <td className="py-2 px-2 text-center">{getLineStatusBadge(line.status)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Discrepancy Flags */}
                    {result.discrepancy_flags.length > 0 && (
                      <div className={`px-4 py-3 border-t ${isDark ? 'border-slate-800/50' : 'border-slate-100'}`}>
                        <h4 className={`text-xs font-bold mb-2 flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          {isAr ? 'تنبيهات التباين' : 'Discrepancy Flags'}
                        </h4>
                        <div className="space-y-2">
                          {result.discrepancy_flags.map((flag, fi) => (
                            <div key={fi} className={`rounded-lg border p-3 ${getSeverityColor(flag.severity)}`}>
                              <div className="flex items-start gap-2">
                                {flag.severity === 'CRITICAL' ? <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{flag.severity}</span>
                                    <span className="text-[10px] font-mono opacity-60">{flag.flag_id}</span>
                                  </div>
                                  <p className="text-xs font-semibold mb-1">{flag.description}</p>
                                  <div className="grid grid-cols-3 gap-2 text-[10px] mb-1">
                                    <div><span className="opacity-60">{isAr ? 'المتوقع:' : 'Expected:'}</span> {flag.expected_value}</div>
                                    <div><span className="opacity-60">{isAr ? 'الفعلي:' : 'Actual:'}</span> {flag.actual_value}</div>
                                    <div><span className="opacity-60">{isAr ? 'الفرق:' : 'Variance:'}</span> {flag.variance}</div>
                                  </div>
                                  <p className="text-[10px] italic opacity-70">{isAr ? 'التوصية:' : '→'} {flag.recommendation}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className={`flex items-center justify-end gap-2 px-4 py-3 border-t ${isDark ? 'border-slate-800/50' : 'border-slate-100'}`}>
                      {result.overall_status === 'HOLD_DISCREPANCY' ? (
                        <>
                          <button className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${isDark ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> {isAr ? 'قبول وترحيل' : 'Accept & Post'}
                          </button>
                          <button className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${isDark ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-amber-300 text-amber-600 hover:bg-amber-50'}`}>
                            <ArrowRight className="w-3.5 h-3.5" /> {isAr ? 'إرسال للمراجعة' : 'Send to Review'}
                          </button>
                          <button className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${isDark ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-red-300 text-red-600 hover:bg-red-50'}`}>
                            <XCircle className="w-3.5 h-3.5" /> {isAr ? 'رفض' : 'Reject'}
                          </button>
                        </>
                      ) : (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {isAr ? 'تمت الموافقة تلقائياً' : 'Auto-Approved'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Engine Info */}
      <div className={`mt-6 flex items-center justify-between px-4 py-3 rounded-xl border ${isDark ? 'bg-slate-900/30 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className={`text-[10px] font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {isAr ? 'محرك P2P — مطابقة ثلاثية آلية' : 'P2P Engine — Autonomous 3-Way Match v2.0'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
            {isAr ? `تفاوت السعر: ${priceTolerance}%` : `Price Tolerance: ${priceTolerance}%`}
          </span>
          <span className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
            {isAr ? 'تدقيق: LangGraph AI' : 'Audit: LangGraph AI Pipeline'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProcurementP2PView;
