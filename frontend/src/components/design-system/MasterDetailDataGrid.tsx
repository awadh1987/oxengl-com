import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  X,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DENSITY_STYLES } from '../../theme/designTokens';
import { formatCurrency, formatTonnage } from '../../utils/formatters';

export interface GridColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
}

export interface MasterDetailDataGridProps<T extends { id: string }> {
  data: T[];
  columns: GridColumn<T>[];
  searchFields?: (keyof T)[];
  title?: string;
  subtitle?: string;
  detailRenderer?: (item: T, onClose: () => void) => React.ReactNode;
  actions?: React.ReactNode;
  emptyMessage?: string;
}

export function MasterDetailDataGrid<T extends { id: string }>({
  data,
  columns,
  searchFields,
  title = 'Enterprise Records Registry',
  subtitle = 'Master-Detail Telemetry Data Grid',
  detailRenderer,
  actions,
  emptyMessage = 'No records found matching criteria',
}: MasterDetailDataGridProps<T>) {
  const { densityMode, themeMode, language } = useApp();
  const isAr = language === 'ar';
  const isDark = themeMode === 'dark';
  const density = DENSITY_STYLES[densityMode];
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const query = search.toLowerCase();
    return data.filter((item) => {
      if (searchFields && searchFields.length > 0) {
        return searchFields.some((field) =>
          String(item[field] || '').toLowerCase().includes(query)
        );
      }
      return Object.values(item).some((val) =>
        String(val || '').toLowerCase().includes(query)
      );
    });
  }, [data, search, searchFields]);

  return (
    <div className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/40 shadow-xl backdrop-blur-md">
      {/* Grid Top Navigation & Search Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b ${
          isDark
            ? 'border-slate-800/90 bg-[#0f1426]/90'
            : 'border-slate-200 bg-slate-50/90'
        } ${densityMode === 'compact' ? 'px-3.5 py-2.5' : 'px-5 py-3.5'}`}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`font-black tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              } ${densityMode === 'compact' ? 'text-xs' : 'text-sm'}`}
            >
              {title}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-black whitespace-nowrap shrink-0 ${
                isDark
                  ? 'bg-slate-800 text-slate-300'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {filteredData.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] sm:min-w-[260px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? 'تصفية السجلات...' : 'Filter records...'}
              className={`w-full rounded-xl border pl-8 pr-3 text-xs outline-none transition-colors ${
                isDark
                  ? 'border-slate-800 bg-slate-900/80 text-white placeholder:text-slate-500 focus:border-indigo-500'
                  : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-500'
              } ${densityMode === 'compact' ? 'py-1.5' : 'py-2'}`}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {actions}
        </div>
      </div>

      {/* Main Container: Split-View with Side Sheet */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Master Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[680px]">
          <table className="w-full border-collapse text-left text-xs">
            {/* Sticky Table Header */}
            <thead
              className={`sticky top-0 z-10 border-b backdrop-blur-md ${
                isDark
                  ? 'border-slate-800 bg-[#0c1020]/95 text-slate-400'
                  : 'border-slate-200 bg-slate-100/95 text-slate-600'
              }`}
            >
              <tr>
                {columns.map((col, idx) => (
                  <th
                    key={String(col.key) || idx}
                    className={`border-r border-slate-800/40 font-black uppercase tracking-wider ${
                      density.tableCellPadding
                    } ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${densityMode === 'compact' ? 'text-[10px]' : 'text-[11px]'}`}
                    style={{ width: col.width }}
                  >
                    {col.header}
                  </th>
                ))}
                <th
                  className={`w-10 text-center ${density.tableCellPadding} ${
                    densityMode === 'compact' ? 'text-[10px]' : 'text-[11px]'
                  }`}
                >
                  Inspect
                </th>
              </tr>
            </thead>

            {/* Alternating Shaded Rows */}
            <tbody
              className={`divide-y ${
                isDark ? 'divide-slate-800/60' : 'divide-slate-200'
              }`}
            >
              {filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="py-12 text-center text-slate-400"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filteredData.map((item, rowIdx) => {
                  const isSelected = selectedItem?.id === item.id;
                  const isEven = rowIdx % 2 === 0;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? isDark
                            ? 'bg-indigo-950/40 border-l-2 border-indigo-400'
                            : 'bg-orange-50 border-l-2 border-orange-500'
                          : isEven
                          ? isDark
                            ? 'bg-slate-900/30 hover:bg-slate-800/50'
                            : 'bg-white hover:bg-slate-50'
                          : isDark
                          ? 'bg-slate-900/60 hover:bg-slate-800/50'
                          : 'bg-slate-50/70 hover:bg-slate-100'
                      }`}
                    >
                      {columns.map((col, idx) => (
                        <td
                          key={String(col.key) || idx}
                          className={`border-r ${
                            isDark
                              ? 'border-slate-800/40 text-slate-300'
                              : 'border-slate-200 text-slate-800'
                          } ${density.tableCellPadding} ${
                            col.align === 'right'
                              ? 'text-right'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          }`}
                        >
                          {col.render
                            ? col.render(item)
                            : String((item as any)[col.key] ?? '')}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">
                        <ChevronRight
                          className={`inline h-4 w-4 transition-transform ${
                            isSelected
                              ? 'translate-x-1 text-orange-400'
                              : 'opacity-40 group-hover:opacity-100'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Slide-out Side-Sheet Inspector Drawer */}
        {selectedItem && (
          <>
            <div
              className="erp-drawer-backdrop fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs md:hidden"
              onClick={() => setSelectedItem(null)}
              aria-hidden="true"
            />
            <aside
              className={`fixed inset-y-0 end-0 z-40 w-full max-w-md shrink-0 border-s md:border-l transition-all duration-300 sm:max-w-lg md:static md:z-auto erp-sidebar-drawer ${
                isDark
                  ? 'border-slate-800 bg-[#0d1222] text-slate-200 shadow-2xl'
                  : 'border-slate-200 bg-white text-slate-800 shadow-xl'
              }`}
            >
            <div
              className={`flex items-center justify-between border-b ${
                isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
              } px-5 py-3.5`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Record Deep-Dive Inspector
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Close Inspector"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="h-[calc(100%-53px)] overflow-y-auto p-5">
              {detailRenderer ? (
                detailRenderer(selectedItem, () => setSelectedItem(null))
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-[10px] font-mono uppercase text-slate-400">Entity Record ID</p>
                    <p className="font-mono text-sm font-bold text-white">{selectedItem.id}</p>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(selectedItem).map(([k, v]) => {
                      if (typeof v === 'object' && v !== null) return null;
                      return (
                        <div
                          key={k}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/40 py-2 text-xs"
                        >
                          <span className="text-slate-400 font-mono">{k}</span>
                          <span className="font-semibold text-slate-200 break-all">{String(v ?? '')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
      </div>
    </div>
  );
}
