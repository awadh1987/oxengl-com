import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Filter,
  Search,
  Calendar,
  Hash,
  Layers,
  CheckSquare,
  Square,
  RotateCcw,
  Check,
  SlidersHorizontal,
  Paperclip,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  ArrowUpDown,
} from 'lucide-react';

export type OxenColumnType = 'categorical' | 'date' | 'numeric' | 'actions';

export type NumericOperator = 'between' | 'gt' | 'lt' | 'eq' | 'gte' | 'lte';

export interface ActionFlags {
  hasAttachment?: boolean;
  recordState?: string;
  approvalStatus?: string;
}

export interface OxenColumnDef<T = any> {
  key: string;
  label: string;
  type: OxenColumnType;
  align?: 'left' | 'center' | 'right';
  headerClassName?: string;
  unit?: string;
  getValue: (row: T) => string | number | null | undefined;
  getNumericValue?: (row: T) => number;
  getTonnage?: (row: T) => number;
  getRevenue?: (row: T) => number;
  getActionFlags?: (row: T) => ActionFlags;
  formatValue?: (val: number) => string;
}

export interface ColumnFilterState {
  // Categorical
  selectedValues?: string[];
  // Date (strictly blank "" by default per Phase 1 Zero-Default-Date rule)
  dateFrom?: string;
  dateTo?: string;
  // Numeric
  numericOperator?: NumericOperator;
  numericMin?: string;
  numericMax?: string;
  // Actions
  attachmentFilter?: 'all' | 'has_attachment' | 'missing_attachment';
  selectedStates?: string[];
  selectedApprovals?: string[];
}

export function isFilterActive(filter?: ColumnFilterState | null): boolean {
  if (!filter) return false;
  if (filter.selectedValues && filter.selectedValues.length > 0) return true;
  if (filter.dateFrom && filter.dateFrom.trim() !== '') return true;
  if (filter.dateTo && filter.dateTo.trim() !== '') return true;
  if (filter.numericMin !== undefined && filter.numericMin.trim() !== '') return true;
  if (
    filter.numericOperator === 'between' &&
    filter.numericMax !== undefined &&
    filter.numericMax.trim() !== ''
  ) {
    return true;
  }
  if (filter.attachmentFilter && filter.attachmentFilter !== 'all') return true;
  if (filter.selectedStates && filter.selectedStates.length > 0) return true;
  if (filter.selectedApprovals && filter.selectedApprovals.length > 0) return true;
  return false;
}

export function evaluateRowAgainstColumnFilter<T>(
  row: T,
  col: OxenColumnDef<T>,
  filter?: ColumnFilterState | null
): boolean {
  if (!filter || !isFilterActive(filter)) return true;

  if (col.type === 'categorical') {
    if (!filter.selectedValues || filter.selectedValues.length === 0) return true;
    const rawVal = col.getValue(row);
    const normalized =
      rawVal === null || rawVal === undefined || String(rawVal).trim() === ''
        ? '(Blank / Unassigned)'
        : String(rawVal).trim();
    return filter.selectedValues.includes(normalized);
  }

  if (col.type === 'date') {
    const rawVal = String(col.getValue(row) ?? '').trim().slice(0, 10);
    if (!rawVal) return false;
    if (filter.dateFrom && filter.dateFrom.trim() !== '' && rawVal < filter.dateFrom.trim()) {
      return false;
    }
    if (filter.dateTo && filter.dateTo.trim() !== '' && rawVal > filter.dateTo.trim()) {
      return false;
    }
    return true;
  }

  if (col.type === 'numeric') {
    const numVal =
      col.getNumericValue !== undefined
        ? col.getNumericValue(row)
        : Number(col.getValue(row) ?? 0);
    const safeNum = Number.isFinite(numVal) ? numVal : 0;
    const op = filter.numericOperator || 'between';
    const minStr = (filter.numericMin ?? '').trim();
    const maxStr = (filter.numericMax ?? '').trim();
    const minVal = minStr !== '' ? Number(minStr) : null;
    const maxVal = maxStr !== '' ? Number(maxStr) : null;

    if (op === 'between') {
      if (minVal !== null && !Number.isNaN(minVal) && safeNum < minVal) return false;
      if (maxVal !== null && !Number.isNaN(maxVal) && safeNum > maxVal) return false;
      return true;
    }
    if (minVal === null || Number.isNaN(minVal)) return true;
    if (op === 'gt') return safeNum > minVal;
    if (op === 'gte') return safeNum >= minVal;
    if (op === 'lt') return safeNum < minVal;
    if (op === 'lte') return safeNum <= minVal;
    if (op === 'eq') return Math.abs(safeNum - minVal) < 0.0001;
    return true;
  }

  if (col.type === 'actions') {
    const flags = col.getActionFlags ? col.getActionFlags(row) : {};
    if (filter.attachmentFilter === 'has_attachment' && !flags.hasAttachment) {
      return false;
    }
    if (filter.attachmentFilter === 'missing_attachment' && flags.hasAttachment) {
      return false;
    }
    if (filter.selectedStates && filter.selectedStates.length > 0) {
      const stateVal = flags.recordState || 'Standard';
      if (!filter.selectedStates.includes(stateVal)) return false;
    }
    if (filter.selectedApprovals && filter.selectedApprovals.length > 0) {
      const approvalVal = flags.approvalStatus || 'Pending';
      if (!filter.selectedApprovals.includes(approvalVal)) return false;
    }
    return true;
  }

  return true;
}

export function formatFilterSummary(
  col: OxenColumnDef<any>,
  filter?: ColumnFilterState | null
): string {
  if (!filter || !isFilterActive(filter)) return '';
  if (col.type === 'categorical' && filter.selectedValues?.length) {
    if (filter.selectedValues.length <= 2) return filter.selectedValues.join(', ');
    return `${filter.selectedValues.length} selected`;
  }
  if (col.type === 'date') {
    const from = filter.dateFrom?.trim() || '...';
    const to = filter.dateTo?.trim() || '...';
    return `${from} → ${to}`;
  }
  if (col.type === 'numeric') {
    const op = filter.numericOperator || 'between';
    const min = filter.numericMin?.trim() || '';
    const max = filter.numericMax?.trim() || '';
    if (op === 'between') return `${min || 'Min'} – ${max || 'Max'}`;
    const symbolMap: Record<NumericOperator, string> = {
      between: '↔',
      gt: '>',
      gte: '≥',
      lt: '<',
      lte: '≤',
      eq: '=',
    };
    return `${symbolMap[op]} ${min}`;
  }
  if (col.type === 'actions') {
    const parts: string[] = [];
    if (filter.attachmentFilter === 'has_attachment') parts.push('Has Attachment');
    if (filter.attachmentFilter === 'missing_attachment') parts.push('No Attachment');
    if (filter.selectedStates?.length) parts.push(`${filter.selectedStates.length} state(s)`);
    if (filter.selectedApprovals?.length) parts.push(`${filter.selectedApprovals.length} approval(s)`);
    return parts.join(' • ');
  }
  return 'Filtered';
}

export function useOxenColumnFilter<T>(
  data: T[],
  columns: OxenColumnDef<T>[],
  onFilterChange?: () => void
) {
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  const [activeDrilldownKey, setActiveDrilldownKey] = useState<string | null>(null);

  const columnMap = useMemo(() => {
    const map: Record<string, OxenColumnDef<T>> = {};
    columns.forEach((c) => {
      map[c.key] = c;
    });
    return map;
  }, [columns]);

  const filteredData = useMemo(() => {
    const activeEntries = Object.entries(columnFilters).filter(([key, f]) => {
      return Boolean(columnMap[key]) && isFilterActive(f);
    });
    if (activeEntries.length === 0) return data;

    return data.filter((row) =>
      activeEntries.every(([key, filter]) =>
        evaluateRowAgainstColumnFilter(row, columnMap[key], filter)
      )
    );
  }, [data, columnFilters, columnMap]);

  const setColumnFilter = (key: string, filter: ColumnFilterState | null) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!filter || !isFilterActive(filter)) {
        delete next[key];
      } else {
        next[key] = filter;
      }
      return next;
    });
    if (onFilterChange) onFilterChange();
  };

  const clearAllColumnFilters = () => {
    setColumnFilters({});
    if (onFilterChange) onFilterChange();
  };

  const isColumnFiltered = (key: string): boolean => isFilterActive(columnFilters[key]);

  const activeFilterKeys = useMemo(
    () => Object.keys(columnFilters).filter((k) => isFilterActive(columnFilters[k])),
    [columnFilters]
  );

  const activeDrilldownColumn = activeDrilldownKey ? columnMap[activeDrilldownKey] || null : null;

  return {
    columnFilters,
    filteredData,
    activeDrilldownKey,
    activeDrilldownColumn,
    activeFilterKeys,
    activeFilterCount: activeFilterKeys.length,
    openDrilldown: (key: string) => setActiveDrilldownKey(key),
    closeDrilldown: () => setActiveDrilldownKey(null),
    setColumnFilter,
    clearAllColumnFilters,
    isColumnFiltered,
    getColumnDef: (key: string) => columnMap[key],
  };
}

interface OxenColumnHeaderProps<T = any> {
  column?: OxenColumnDef<T>;
  label?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  isFiltered?: boolean;
  onOpen: () => void;
  onClear?: () => void;
}

export const OxenColumnHeader: React.FC<OxenColumnHeaderProps> = ({
  column,
  label,
  align,
  className = '',
  isFiltered = false,
  onOpen,
  onClear,
}) => {
  const resolvedLabel = label ?? column?.label ?? '';
  const resolvedAlign = align ?? column?.align ?? 'left';
  const resolvedClass = className || column?.headerClassName || 'px-4 py-3.5';

  const justifyClass =
    resolvedAlign === 'right'
      ? 'justify-end text-right'
      : resolvedAlign === 'center'
      ? 'justify-center text-center'
      : 'justify-start text-left';

  return (
    <th
      scope="col"
      className={`${resolvedClass} select-none transition-colors ${
        isFiltered ? 'bg-orange-500/10 text-orange-300' : ''
      }`}
    >
      <div className={`inline-flex items-center gap-1.5 w-full ${justifyClass}`}>
        <button
          type="button"
          onClick={onOpen}
          title={`Click to drill down & filter by ${resolvedLabel}`}
          className={`group inline-flex items-center gap-1.5 font-semibold tracking-wider uppercase text-[11px] transition-colors cursor-pointer focus:outline-none ${
            isFiltered
              ? 'text-orange-400 hover:text-orange-300'
              : 'text-slate-300 hover:text-cyan-400'
          }`}
        >
          <span>{resolvedLabel}</span>
          <span
            className={`inline-flex items-center justify-center rounded p-0.5 transition-all ${
              isFiltered
                ? 'bg-orange-500/20 text-orange-400'
                : 'text-slate-500 opacity-75 group-hover:opacity-100 group-hover:text-cyan-400 group-hover:bg-slate-800'
            }`}
          >
            <Filter className="w-3 h-3" />
          </span>
        </button>
        {isFiltered && onClear && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            title={`Clear ${resolvedLabel} filter`}
            className="text-orange-400/80 hover:text-orange-200 p-0.5 rounded hover:bg-orange-500/20 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </th>
  );
};

interface OxenActiveFiltersBarProps<T = any> {
  columns: OxenColumnDef<T>[];
  columnFilters: Record<string, ColumnFilterState>;
  onOpenColumn: (key: string) => void;
  onClearColumn: (key: string) => void;
  onClearAll: () => void;
  totalCount: number;
  filteredCount: number;
}

export const OxenActiveFiltersBar: React.FC<OxenActiveFiltersBarProps> = ({
  columns,
  columnFilters,
  onOpenColumn,
  onClearColumn,
  onClearAll,
  totalCount,
  filteredCount,
}) => {
  const activeCols = columns.filter((c) => isFilterActive(columnFilters[c.key]));
  if (activeCols.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/90 border border-orange-500/30 rounded-xl text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-orange-400 font-semibold uppercase tracking-wider text-[11px]">
          <Filter className="w-3.5 h-3.5" />
          Active Column Filters ({activeCols.length}):
        </span>
        {activeCols.map((col) => {
          const summary = formatFilterSummary(col, columnFilters[col.key]);
          return (
            <span
              key={col.key}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
            >
              <button
                type="button"
                onClick={() => onOpenColumn(col.key)}
                className="hover:text-cyan-400 transition-colors font-medium"
              >
                <span className="text-slate-400">{col.label}:</span>{' '}
                <span className="text-orange-300 font-semibold">{summary}</span>
              </button>
              <button
                type="button"
                onClick={() => onClearColumn(col.key)}
                title={`Remove ${col.label} filter`}
                className="text-slate-400 hover:text-rose-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-400 font-mono text-[11px]">
          Showing <strong className="text-white">{filteredCount}</strong> of{' '}
          <strong className="text-slate-300">{totalCount}</strong> records
        </span>
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 font-medium transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Clear All
        </button>
      </div>
    </div>
  );
};

interface ColumnDrilldownModalProps<T = any> {
  isOpen: boolean;
  column: OxenColumnDef<T> | null;
  data: T[];
  currentFilter?: ColumnFilterState | null;
  onApply: (key: string, filter: ColumnFilterState | null) => void;
  onClose: () => void;
}

export const ColumnDrilldownModal = <T extends Record<string, any>>({
  isOpen,
  column,
  data,
  currentFilter,
  onApply,
  onClose,
}: ColumnDrilldownModalProps<T>) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  // Date states strictly default to "" (blank) per Phase 1 Zero-Default-Date rule
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  // Numeric states
  const [numericOperator, setNumericOperator] = useState<NumericOperator>('between');
  const [numericMin, setNumericMin] = useState<string>('');
  const [numericMax, setNumericMax] = useState<string>('');
  // Actions states
  const [attachmentFilter, setAttachmentFilter] = useState<
    'all' | 'has_attachment' | 'missing_attachment'
  >('all');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedApprovals, setSelectedApprovals] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'count' | 'tonnage' | 'revenue' | 'label'>('count');

  useEffect(() => {
    if (!column || !isOpen) return;
    setSearchQuery('');
    setSelectedValues(currentFilter?.selectedValues ?? []);
    setDateFrom(currentFilter?.dateFrom ?? '');
    setDateTo(currentFilter?.dateTo ?? '');
    setNumericOperator(currentFilter?.numericOperator ?? 'between');
    setNumericMin(currentFilter?.numericMin ?? '');
    setNumericMax(currentFilter?.numericMax ?? '');
    setAttachmentFilter(currentFilter?.attachmentFilter ?? 'all');
    setSelectedStates(currentFilter?.selectedStates ?? []);
    setSelectedApprovals(currentFilter?.selectedApprovals ?? []);
  }, [column, isOpen, currentFilter]);

  const extractRowTonnage = (row: T): number => {
    if (column?.getTonnage) return column.getTonnage(row);
    const candidate =
      row.qty_delivered ??
      row.qty_loaded ??
      row.deliveredWeight ??
      row.loadedWeight ??
      row.deliveredMt ??
      row.loadedMt ??
      row.quantity ??
      0;
    const n = Number(candidate);
    return Number.isFinite(n) ? n : 0;
  };

  const extractRowRevenue = (row: T): number => {
    if (column?.getRevenue) return column.getRevenue(row);
    const candidate =
      row.sales_amount ??
      row.totalSalesAmount ??
      row.amount ??
      row.totalAmount ??
      row.purchases_cost ??
      row.cost ??
      row.estimatedBudget ??
      0;
    const n = Number(candidate);
    return Number.isFinite(n) ? n : 0;
  };

  // 1. Categorical Analytics Breakdown
  const categoricalStats = useMemo(() => {
    if (!column || column.type !== 'categorical') return [];
    const groups = new Map<
      string,
      { label: string; count: number; tonnage: number; revenue: number }
    >();

    data.forEach((row) => {
      const raw = column.getValue(row);
      const label =
        raw === null || raw === undefined || String(raw).trim() === ''
          ? '(Blank / Unassigned)'
          : String(raw).trim();
      const existing = groups.get(label) || { label, count: 0, tonnage: 0, revenue: 0 };
      existing.count += 1;
      existing.tonnage += extractRowTonnage(row);
      existing.revenue += extractRowRevenue(row);
      groups.set(label, existing);
    });

    const list = Array.from(groups.values());
    list.sort((a, b) => {
      if (sortBy === 'tonnage') return b.tonnage - a.tonnage;
      if (sortBy === 'revenue') return b.revenue - a.revenue;
      if (sortBy === 'label') return a.label.localeCompare(b.label);
      return b.count - a.count;
    });
    return list;
  }, [column, data, sortBy]);

  const filteredCategoricalStats = useMemo(() => {
    if (!searchQuery.trim()) return categoricalStats;
    const q = searchQuery.toLowerCase();
    return categoricalStats.filter((item) => item.label.toLowerCase().includes(q));
  }, [categoricalStats, searchQuery]);

  // 2. Date Daily Volume Breakdown
  const dateBreakdown = useMemo(() => {
    if (!column || column.type !== 'date') return [];
    const groups = new Map<
      string,
      { date: string; count: number; tonnage: number; revenue: number }
    >();

    data.forEach((row) => {
      const raw = String(column.getValue(row) ?? '').trim().slice(0, 10);
      if (!raw) return;
      const existing = groups.get(raw) || { date: raw, count: 0, tonnage: 0, revenue: 0 };
      existing.count += 1;
      existing.tonnage += extractRowTonnage(row);
      existing.revenue += extractRowRevenue(row);
      groups.set(raw, existing);
    });

    return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [column, data]);

  // 3. Numeric Column Aggregations (Sum, Average, Min, Max)
  const numericAggregations = useMemo(() => {
    if (!column || column.type !== 'numeric') {
      return { sum: 0, avg: 0, min: 0, max: 0, count: 0 };
    }
    const draftFilter: ColumnFilterState = {
      numericOperator,
      numericMin,
      numericMax,
    };
    const matchingRows = data.filter((r) =>
      evaluateRowAgainstColumnFilter(r, column, draftFilter)
    );
    if (matchingRows.length === 0) {
      return { sum: 0, avg: 0, min: 0, max: 0, count: 0 };
    }
    const values = matchingRows.map((r) => {
      const v =
        column.getNumericValue !== undefined
          ? column.getNumericValue(r)
          : Number(column.getValue(r) ?? 0);
      return Number.isFinite(v) ? v : 0;
    });
    const sum = values.reduce((acc, v) => acc + v, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = sum / values.length;
    return { sum, avg, min, max, count: values.length };
  }, [column, data, numericOperator, numericMin, numericMax]);

  // 4. Actions Column Breakdown
  const actionBreakdown = useMemo(() => {
    if (!column || column.type !== 'actions') {
      return {
        withAttachment: 0,
        withoutAttachment: 0,
        states: [] as { label: string; count: number }[],
        approvals: [] as { label: string; count: number }[],
      };
    }
    let withAttachment = 0;
    let withoutAttachment = 0;
    const stateCounts = new Map<string, number>();
    const approvalCounts = new Map<string, number>();

    data.forEach((row) => {
      const flags = column.getActionFlags ? column.getActionFlags(row) : {};
      if (flags.hasAttachment) withAttachment += 1;
      else withoutAttachment += 1;

      const st = flags.recordState || 'Standard';
      stateCounts.set(st, (stateCounts.get(st) || 0) + 1);

      const ap = flags.approvalStatus || 'Verified';
      approvalCounts.set(ap, (approvalCounts.get(ap) || 0) + 1);
    });

    return {
      withAttachment,
      withoutAttachment,
      states: Array.from(stateCounts.entries()).map(([label, count]) => ({ label, count })),
      approvals: Array.from(approvalCounts.entries()).map(([label, count]) => ({ label, count })),
    };
  }, [column, data]);

  if (!isOpen || !column) return null;

  const draftFilterState: ColumnFilterState = {
    selectedValues: column.type === 'categorical' ? selectedValues : undefined,
    dateFrom: column.type === 'date' ? dateFrom : undefined,
    dateTo: column.type === 'date' ? dateTo : undefined,
    numericOperator: column.type === 'numeric' ? numericOperator : undefined,
    numericMin: column.type === 'numeric' ? numericMin : undefined,
    numericMax: column.type === 'numeric' ? numericMax : undefined,
    attachmentFilter: column.type === 'actions' ? attachmentFilter : undefined,
    selectedStates: column.type === 'actions' ? selectedStates : undefined,
    selectedApprovals: column.type === 'actions' ? selectedApprovals : undefined,
  };

  const previewCount = data.filter((r) =>
    evaluateRowAgainstColumnFilter(r, column, draftFilterState)
  ).length;

  const handleApply = () => {
    if (!isFilterActive(draftFilterState)) {
      onApply(column.key, null);
    } else {
      onApply(column.key, draftFilterState);
    }
    onClose();
  };

  const handleReset = () => {
    setSelectedValues([]);
    setDateFrom('');
    setDateTo('');
    setNumericOperator('between');
    setNumericMin('');
    setNumericMax('');
    setAttachmentFilter('all');
    setSelectedStates([]);
    setSelectedApprovals([]);
    onApply(column.key, null);
    onClose();
  };

  const toggleCategoricalValue = (val: string) => {
    setSelectedValues((prev) =>
      prev.includes(val) ? prev.filter((item) => item !== val) : [...prev, val]
    );
  };

  const applyDatePreset = (daysBack: number | 'month' | 'quarter') => {
    const now = new Date();
    const toStr = now.toISOString().slice(0, 10);
    const start = new Date(now);
    if (daysBack === 'month') {
      start.setDate(1);
    } else if (daysBack === 'quarter') {
      start.setMonth(start.getMonth() - 3);
    } else {
      start.setDate(start.getDate() - daysBack);
    }
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(toStr);
  };

  const formatMetric = (n: number) => {
    if (column.formatValue) return column.formatValue(n);
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${column.label} Column Drill-Down & Filter`}
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/70 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
              {column.type === 'categorical' && <Layers className="w-5 h-5" />}
              {column.type === 'date' && <Calendar className="w-5 h-5" />}
              {column.type === 'numeric' && <Hash className="w-5 h-5" />}
              {column.type === 'actions' && <SlidersHorizontal className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {column.label} — Drill-Down & Filter
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-slate-800 text-cyan-400 border border-slate-700">
                  {column.type}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Interactive column analytics, distinct entity breakdown, and instant filtering
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drill-down modal"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* CATEGORICAL / ENTITY DRILL-DOWN */}
          {column.type === 'categorical' && (
            <div className="space-y-4">
              {/* Top summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Distinct Values
                  </div>
                  <div className="text-lg font-bold text-white mt-0.5 font-mono">
                    {categoricalStats.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Selected Entities
                  </div>
                  <div className="text-lg font-bold text-orange-400 mt-0.5 font-mono">
                    {selectedValues.length === 0 ? 'All' : selectedValues.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Matching Records
                  </div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5 font-mono">
                    {previewCount} / {data.length}
                  </div>
                </div>
              </div>

              {/* Search & Sort Controls */}
              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search distinct ${column.label.toLowerCase()} values...`}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedValues(filteredCategoricalStats.map((item) => item.label))
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedValues([])}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSortBy((prev) =>
                        prev === 'count' ? 'revenue' : prev === 'revenue' ? 'tonnage' : 'count'
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-cyan-400 hover:border-cyan-500/40"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    Sort: {sortBy.toUpperCase()}
                  </button>
                </div>
              </div>

              {/* Distinct Values Table with Occurrences, Tonnage, and SAR summary */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70">
                  <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-400 sticky top-0 z-10">
                    <div className="col-span-5">Distinct Value</div>
                    <div className="col-span-2 text-right">Records</div>
                    <div className="col-span-2 text-right">Total MT</div>
                    <div className="col-span-3 text-right">Total SAR</div>
                  </div>
                  {filteredCategoricalStats.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">
                      No matching values found for "{searchQuery}".
                    </div>
                  ) : (
                    filteredCategoricalStats.map((item) => {
                      const isChecked = selectedValues.includes(item.label);
                      return (
                        <div
                          key={item.label}
                          onClick={() => toggleCategoricalValue(item.label)}
                          className={`grid grid-cols-12 items-center px-4 py-2.5 text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-orange-500/10 text-white'
                              : 'hover:bg-slate-900/80 text-slate-300'
                          }`}
                        >
                          <div className="col-span-5 flex items-center gap-2.5 pr-2 truncate">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-orange-400 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600 shrink-0" />
                            )}
                            <span className="truncate font-medium" title={item.label}>
                              {item.label}
                            </span>
                          </div>
                          <div className="col-span-2 text-right font-mono text-slate-300">
                            {item.count}
                          </div>
                          <div className="col-span-2 text-right font-mono text-cyan-400">
                            {item.tonnage > 0 ? item.tonnage.toFixed(2) : '—'}
                          </div>
                          <div className="col-span-3 text-right font-mono text-emerald-400">
                            {item.revenue > 0
                              ? item.revenue.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              : '—'}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DATE COLUMN DRILL-DOWN */}
          {column.type === 'date' && (
            <div className="space-y-4">
              {/* Explicit Date Range Picker (Initialized Blank per Phase 1 Zero-Default-Date Rule) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    From Date
                  </label>
                  <input
                    type="date"
                    aria-label="From Date"
                    placeholder="YYYY-MM-DD"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    To Date
                  </label>
                  <input
                    type="date"
                    aria-label="To Date"
                    placeholder="YYYY-MM-DD"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Quick Period Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-medium mr-1">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => applyDatePreset(7)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset(30)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('month')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('quarter')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                >
                  Last 90 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-300 border border-rose-500/20 transition-colors"
                >
                  Clear Dates
                </button>
              </div>

              {/* Daily Volume Breakdown */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                    Daily Volume Breakdown ({dateBreakdown.length} active days)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Click any date row to isolate that day
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/70">
                  <div className="grid grid-cols-12 px-4 py-2 bg-slate-950/90 text-[10px] font-bold uppercase tracking-wider text-slate-400 sticky top-0">
                    <div className="col-span-4">Date</div>
                    <div className="col-span-2 text-right">Records</div>
                    <div className="col-span-3 text-right">Volume (MT)</div>
                    <div className="col-span-3 text-right">Amount (SAR)</div>
                  </div>
                  {dateBreakdown.map((day) => {
                    const isIsolated = dateFrom === day.date && dateTo === day.date;
                    return (
                      <div
                        key={day.date}
                        onClick={() => {
                          setDateFrom(day.date);
                          setDateTo(day.date);
                        }}
                        className={`grid grid-cols-12 items-center px-4 py-2.5 text-xs cursor-pointer transition-colors ${
                          isIsolated
                            ? 'bg-orange-500/15 text-orange-300 font-semibold'
                            : 'hover:bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="col-span-4 font-mono">{day.date}</div>
                        <div className="col-span-2 text-right font-mono">{day.count}</div>
                        <div className="col-span-3 text-right font-mono text-cyan-400">
                          {day.tonnage > 0 ? day.tonnage.toFixed(2) : '—'}
                        </div>
                        <div className="col-span-3 text-right font-mono text-emerald-400">
                          {day.revenue > 0
                            ? day.revenue.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* NUMERIC / FINANCIAL COLUMN DRILL-DOWN */}
          {column.type === 'numeric' && (
            <div className="space-y-5">
              {/* Instant Column Aggregations (Sum, Average, Min, Max) */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Instant Column Aggregations ({numericAggregations.count} records)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Sum Total {column.unit ? `(${column.unit})` : ''}
                    </div>
                    <div
                      data-testid="drilldown-agg-sum"
                      className="text-base font-bold text-emerald-400 font-mono mt-1"
                    >
                      {formatMetric(numericAggregations.sum)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Average {column.unit ? `(${column.unit})` : ''}
                    </div>
                    <div
                      data-testid="drilldown-agg-avg"
                      className="text-base font-bold text-cyan-400 font-mono mt-1"
                    >
                      {formatMetric(numericAggregations.avg)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Minimum
                    </div>
                    <div
                      data-testid="drilldown-agg-min"
                      className="text-base font-bold text-slate-200 font-mono mt-1"
                    >
                      {formatMetric(numericAggregations.min)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Maximum
                    </div>
                    <div
                      data-testid="drilldown-agg-max"
                      className="text-base font-bold text-orange-400 font-mono mt-1"
                    >
                      {formatMetric(numericAggregations.max)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Operator & Range Filter Controls */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Comparison Operator
                  </label>
                  <select
                    aria-label="Comparison Operator"
                    value={numericOperator}
                    onChange={(e) => setNumericOperator(e.target.value as NumericOperator)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="between">Between (Min & Max Range)</option>
                    <option value="gt">Greater Than (&gt;)</option>
                    <option value="gte">Greater Than or Equal (&ge;)</option>
                    <option value="lt">Less Than (&lt;)</option>
                    <option value="lte">Less Than or Equal (&le;)</option>
                    <option value="eq">Equals (=)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {numericOperator === 'between' ? 'Minimum Value' : 'Target Threshold Value'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      aria-label={
                        numericOperator === 'between' ? 'Minimum Value' : 'Target Threshold Value'
                      }
                      value={numericMin}
                      onChange={(e) => setNumericMin(e.target.value)}
                      placeholder={
                        numericOperator === 'between'
                          ? `Min (${formatMetric(numericAggregations.min)})`
                          : 'Enter value...'
                      }
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  {numericOperator === 'between' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Maximum Value
                      </label>
                      <input
                        type="number"
                        step="any"
                        aria-label="Maximum Value"
                        value={numericMax}
                        onChange={(e) => setNumericMax(e.target.value)}
                        placeholder={`Max (${formatMetric(numericAggregations.max)})`}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  )}
                </div>

                {/* Quick numeric filter chips */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400">Quick Thresholds:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNumericOperator('gt');
                      setNumericMin('0');
                      setNumericMax('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                  >
                    &gt; 0 (Positive Only)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNumericOperator('gt');
                      setNumericMin(numericAggregations.avg.toFixed(2));
                      setNumericMax('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                  >
                    Above Average (&gt; {formatMetric(numericAggregations.avg)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNumericOperator('lt');
                      setNumericMin('0');
                      setNumericMax('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-rose-300"
                  >
                    &lt; 0 (Negative / Deficit)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ACTIONS COLUMN DRILL-DOWN */}
          {column.type === 'actions' && (
            <div className="space-y-4">
              {/* Attachment / Scale Ticket Presence */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-cyan-400" />
                  Document / Attachment Presence
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAttachmentFilter('all')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      attachmentFilter === 'all'
                        ? 'bg-orange-500/15 border-orange-500/50 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">All Records</div>
                    <div className="text-sm font-mono mt-1 text-slate-300">{data.length}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttachmentFilter('has_attachment')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      attachmentFilter === 'has_attachment'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">Has Attachment</div>
                    <div className="text-sm font-mono mt-1 text-emerald-400">
                      {actionBreakdown.withAttachment}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttachmentFilter('missing_attachment')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      attachmentFilter === 'missing_attachment'
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">Missing Attachment</div>
                    <div className="text-sm font-mono mt-1 text-amber-400">
                      {actionBreakdown.withoutAttachment}
                    </div>
                  </button>
                </div>
              </div>

              {/* Record State & Approval Status Multi-Select */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Record Operational State
                  </div>
                  <div className="space-y-1.5">
                    {actionBreakdown.states.map((st) => {
                      const checked = selectedStates.includes(st.label);
                      return (
                        <button
                          key={st.label}
                          type="button"
                          onClick={() =>
                            setSelectedStates((prev) =>
                              prev.includes(st.label)
                                ? prev.filter((x) => x !== st.label)
                                : [...prev, st.label]
                            )
                          }
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition-colors ${
                            checked
                              ? 'bg-orange-500/15 border-orange-500/40 text-white'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {checked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-orange-400" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-600" />
                            )}
                            {st.label}
                          </span>
                          <span className="font-mono text-slate-400">{st.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-cyan-400" />
                    Settlement / Approval Status
                  </div>
                  <div className="space-y-1.5">
                    {actionBreakdown.approvals.map((ap) => {
                      const checked = selectedApprovals.includes(ap.label);
                      return (
                        <button
                          key={ap.label}
                          type="button"
                          onClick={() =>
                            setSelectedApprovals((prev) =>
                              prev.includes(ap.label)
                                ? prev.filter((x) => x !== ap.label)
                                : [...prev, ap.label]
                            )
                          }
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition-colors ${
                            checked
                              ? 'bg-orange-500/15 border-orange-500/40 text-white'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {checked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-orange-400" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-600" />
                            )}
                            {ap.label}
                          </span>
                          <span className="font-mono text-slate-400">{ap.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/90 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            Filter matches <strong className="text-white font-mono">{previewCount}</strong> of{' '}
            <span className="font-mono">{data.length}</span> records
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Column
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-xs font-bold text-slate-950 shadow-lg shadow-orange-500/20 transition-all"
            >
              <Check className="w-4 h-4" />
              Apply Filter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
