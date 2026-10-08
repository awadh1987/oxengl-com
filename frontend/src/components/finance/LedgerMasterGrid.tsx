import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  ShieldCheck,
  Scale,
  FileSpreadsheet,
  ArrowUpDown,
  Download,
  Calendar,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface LedgerEntryItem {
  id: string;
  entryNumber: string;
  date: string;
  journalCategory: 'sales' | 'purchases' | 'cash_bank' | 'general' | 'tax';
  description: string;
  totalDebitSar: number;
  totalCreditSar: number;
  varianceSar: number;
  isBalanced: boolean;
  zatcaStatus: 'cleared' | 'reported' | 'pending' | 'rejected' | 'exempt';
  complianceScorePct: number;
  referenceDoc?: string;
  sourceParty?: string;
  auditHash?: string;
  lineItemsCount: number;
}

interface LedgerMasterGridProps {
  entries: LedgerEntryItem[];
  selectedEntryId?: string | null;
  onSelectEntry: (entry: LedgerEntryItem) => void;
  isLoading?: boolean;
}

export const LedgerMasterGrid: React.FC<LedgerMasterGridProps> = ({
  entries,
  selectedEntryId,
  onSelectEntry,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'date' | 'totalDebitSar' | 'complianceScorePct'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Filter and Sort Logic (Preserving raw data)
  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      const matchSearch =
        searchTerm === '' ||
        item.entryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sourceParty && item.sourceParty.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.referenceDoc && item.referenceDoc.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory =
        categoryFilter === 'all' || item.journalCategory === categoryFilter;

      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'balanced' && item.isBalanced) ||
        (statusFilter === 'unbalanced' && !item.isBalanced) ||
        (statusFilter === 'zatca_cleared' && item.zatcaStatus === 'cleared') ||
        (statusFilter === 'zatca_rejected' && item.zatcaStatus === 'rejected');

      return matchSearch && matchCategory && matchStatus;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === 'totalDebitSar') {
        comparison = a.totalDebitSar - b.totalDebitSar;
      } else if (sortField === 'complianceScorePct') {
        comparison = a.complianceScorePct - b.complianceScorePct;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [entries, searchTerm, categoryFilter, statusFilter, sortField, sortDirection]);

  // Paginated Slices
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const currentEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  const handleSort = (field: 'date' | 'totalDebitSar' | 'complianceScorePct') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getZatcaBadge = (status: LedgerEntryItem['zatcaStatus']) => {
    switch (status) {
      case 'cleared':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400">
            <ShieldCheck className="w-3 h-3" /> Cleared
          </span>
        );
      case 'reported':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400">
            <CheckCircle2 className="w-3 h-3" /> Reported
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-400">
            <AlertTriangle className="w-3 h-3" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
    }
  };

  const getScoreTrackColor = (score: number) => {
    if (score >= 95) return 'bg-emerald-500';
    if (score >= 80) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs flex flex-col">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search voucher #, party, memo, hash..."
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all placeholder:text-zinc-400"
          />
        </div>

        {/* Dropdowns & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="relative z-30">
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
            >
              <option value="all">All Journals</option>
              <option value="sales">Sales Journal</option>
              <option value="purchases">Purchases Journal</option>
              <option value="cash_bank">Cash & Bank</option>
              <option value="tax">ZATCA Tax Journal</option>
              <option value="general">General Operations</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative z-30">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="balanced">Double-Entry Balanced</option>
              <option value="unbalanced">Variance Alert</option>
              <option value="zatca_cleared">ZATCA Cleared</option>
              <option value="zatca_rejected">ZATCA Rejected</option>
            </select>
          </div>

          <span className="text-xs text-zinc-500 dark:text-zinc-400 pl-2">
            Showing <strong className="text-zinc-900 dark:text-zinc-100">{filteredEntries.length}</strong> entries
          </span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
        <table className="w-full text-left border-collapse">
          {/* Sticky Header */}
          <thead className="sticky top-0 bg-zinc-100/90 dark:bg-zinc-900/90 backdrop-blur-sm z-10 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <tr>
              <th
                className="py-3 px-4 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1.5">
                  <span>Entry & Date</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="py-3 px-4">Journal & Party</th>
              <th
                className="py-3 px-4 text-right cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                onClick={() => handleSort('totalDebitSar')}
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Debit / Credit (SAR)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="py-3 px-4 text-center">GL Balancing</th>
              <th className="py-3 px-4">ZATCA Status</th>
              <th
                className="py-3 px-4 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                onClick={() => handleSort('complianceScorePct')}
              >
                <div className="flex items-center gap-1.5">
                  <span>Integrity Score</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 text-xs">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <tr key={`skel-${idx}`} className="animate-pulse">
                  <td className="py-3.5 px-4">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-24 mb-1" />
                    <div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-16" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-32 mb-1" />
                    <div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-20" />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-24 ml-auto" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-16 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-20" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : currentEntries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-zinc-500 dark:text-zinc-400">
                  <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
                  <p className="font-medium text-sm">No ledger entries matching criteria</p>
                  <p className="text-xs text-zinc-400 mt-1">Try relaxing filters or search keywords</p>
                </td>
              </tr>
            ) : (
              currentEntries.map((item) => {
                const isSelected = selectedEntryId === item.id;
                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectEntry(item)}
                    className={`cursor-pointer transition-colors duration-150 ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-l-4 border-l-blue-600 dark:border-l-blue-500 font-medium'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    {/* Entry & Date */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.entryNumber}
                      </div>
                      <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {item.date}
                      </div>
                    </td>

                    {/* Journal & Party */}
                    <td className="py-3.5 px-4 max-w-[220px]">
                      <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {item.description}
                      </div>
                      <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate flex items-center gap-1.5 mt-0.5">
                        <span className="capitalize">{item.journalCategory.replace('_', ' ')}</span>
                        {item.sourceParty && (
                          <>
                            <span>•</span>
                            <span className="truncate">{item.sourceParty}</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Debit / Credit Amount */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(item.totalDebitSar, 'en')}
                      </div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {item.lineItemsCount} lines
                      </div>
                    </td>

                    {/* GL Balancing */}
                    <td className="py-3.5 px-4 text-center">
                      {item.isBalanced ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Balanced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="w-3.5 h-3.5" /> Δ {item.varianceSar.toFixed(2)}
                        </span>
                      )}
                    </td>

                    {/* ZATCA Status */}
                    <td className="py-3.5 px-4">
                      {getZatcaBadge(item.zatcaStatus)}
                    </td>

                    {/* Integrity Score Sparkline */}
                    <td className="py-3.5 px-4 min-w-[120px]">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                          {item.complianceScorePct}%
                        </span>
                      </div>
                      <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${getScoreTrackColor(
                            item.complianceScorePct
                          )}`}
                          style={{ width: `${item.complianceScorePct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer - strictly icon-only buttons with disabled states */}
      <div className="p-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <div>
          Page <strong className="text-zinc-900 dark:text-zinc-100">{currentPage}</strong> of{' '}
          <strong className="text-zinc-900 dark:text-zinc-100">{totalPages}</strong>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="First Page"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(1)}
            className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Previous Page"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Next Page"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Last Page"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
