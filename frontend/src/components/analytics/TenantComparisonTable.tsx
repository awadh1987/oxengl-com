/**
 * OxenGL ERP — Cross-Tenant Comparison & Telemetry Table
 * ========================================================
 * Location: src/components/analytics/TenantComparisonTable.tsx
 *
 * Renders an executive cross-tenant matrix for Platform Super Administrators:
 * - Active vs suspended tenant posture
 * - BigQuery transaction volume & row counts
 * - Data health score and ZATCA compliance rate with visual risk highlighting
 * - Enterprise dark mode styling (dark:bg-zinc-900, dark:border-zinc-800)
 */

import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Search, 
  ArrowUpDown, 
  ShieldAlert, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  Database,
  Coins
} from 'lucide-react';
import { TenantUsageData } from '../../services/analyticsService';
import { SkeletonTable } from '../common/Skeleton';

export interface TenantComparisonTableProps {
  tenants: TenantUsageData[];
  isLoading?: boolean;
  onSelectTenant?: (tenant: TenantUsageData) => void;
  className?: string;
}

type SortField = 'tenantName' | 'dataHealthScore' | 'transactionCount' | 'rowCount' | 'revenue' | 'zatcaComplianceRate';
type SortDirection = 'asc' | 'desc';

export const TenantComparisonTable: React.FC<TenantComparisonTableProps> = ({
  tenants,
  isLoading = false,
  onSelectTenant,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [sortField, setSortField] = useState<SortField>('transactionCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Handle Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filtered & Sorted Data
  const filteredTenants = useMemo(() => {
    return tenants
      .filter((t) => {
        const matchesSearch =
          t.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.tenantId.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus =
          statusFilter === 'ALL' || t.status.toUpperCase() === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (typeof valA === 'string') {
          return sortDirection === 'asc'
            ? (valA as string).localeCompare(valB as string)
            : (valB as string).localeCompare(valA as string);
        }

        const numA = Number(valA) || 0;
        const numB = Number(valB) || 0;
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      });
  }, [tenants, searchQuery, statusFilter, sortField, sortDirection]);

  // Visual Health Indicator helper
  const getHealthBadge = (score: number) => {
    if (score < 90) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
          <AlertTriangle className="w-3.5 h-3.5" />
          {score.toFixed(1)}% Critical
        </span>
      );
    }
    if (score < 97) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
          <AlertTriangle className="w-3.5 h-3.5" />
          {score.toFixed(1)}% Warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {score.toFixed(1)}% Healthy
      </span>
    );
  };

  // ZATCA Compliance Badge helper
  const getZatcaBadge = (rate: number) => {
    if (rate < 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
          <ShieldAlert className="w-3 h-3 text-amber-500" />
          {rate.toFixed(0)}% Flagged
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
        <ShieldCheck className="w-3 h-3 text-emerald-500" />
        100% Compliant
      </span>
    );
  };

  // Subscription Plan Badge helper
  const getPlanBadge = (plan: string) => {
    const p = plan.toUpperCase();
    if (p === 'ENTERPRISE') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
          Enterprise
        </span>
      );
    }
    if (p === 'PROFESSIONAL') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
          Professional
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        Basic
      </span>
    );
  };

  if (isLoading) {
    return <SkeletonTable rows={6} cols={7} />;
  }

  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm ${className}`}>
      {/* Header Controls */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-500" />
            Cross-Tenant Telemetry & Data Health Matrix
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Real-time monitoring across {tenants.length} provisioned ERP organizations
          </p>
        </div>

        {/* Search & Filter Pills */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tenant or slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Status Filter */}
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-800 p-0.5 text-xs">
            {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-950/60 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <th 
                className="py-3 px-4 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200"
                onClick={() => handleSort('tenantName')}
              >
                <div className="flex items-center gap-1.5">
                  Tenant Identity
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4">Plan & Status</th>
              <th 
                className="py-3 px-4 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200"
                onClick={() => handleSort('dataHealthScore')}
              >
                <div className="flex items-center gap-1.5">
                  Data Quality
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-3 px-4 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200"
                onClick={() => handleSort('zatcaComplianceRate')}
              >
                <div className="flex items-center gap-1.5">
                  ZATCA Status
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-3 px-4 text-right cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200"
                onClick={() => handleSort('transactionCount')}
              >
                <div className="flex items-center justify-end gap-1.5">
                  Transactions
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-3 px-4 text-right cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200"
                onClick={() => handleSort('rowCount')}
              >
                <div className="flex items-center justify-end gap-1.5">
                  BigQuery Rows
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-3 px-4 text-right cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200"
                onClick={() => handleSort('revenue')}
              >
                <div className="flex items-center justify-end gap-1.5">
                  Revenue (SAR)
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60 text-xs">
            {filteredTenants.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500 dark:text-zinc-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Database className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                    <p className="font-medium">No tenants match the current filters</p>
                    <p className="text-[11px] text-zinc-400">Try adjusting your search criteria</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredTenants.map((t) => (
                <tr
                  key={t.tenantId}
                  onClick={() => onSelectTenant?.(t)}
                  className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors ${
                    onSelectTenant ? 'cursor-pointer' : ''
                  }`}
                >
                  {/* Tenant Identity */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-bold text-xs text-indigo-600 dark:text-indigo-400">
                        {t.tenantName.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {t.tenantName}
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                          {t.slug || t.tenantId.substring(0, 8)}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Plan & Status */}
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col gap-1 items-start">
                      {getPlanBadge(t.plan)}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                        t.status === 'ACTIVE' 
                          ? 'text-emerald-600 dark:text-emerald-400' 
                          : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          t.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'
                        }`} />
                        {t.status}
                      </span>
                    </div>
                  </td>

                  {/* Data Quality Health Score */}
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col gap-1.5 max-w-[130px]">
                      {getHealthBadge(t.dataHealthScore)}
                      {/* Visual Progress Bar */}
                      <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            t.dataHealthScore < 90
                              ? 'bg-rose-500'
                              : t.dataHealthScore < 97
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(t.dataHealthScore, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* ZATCA Compliance */}
                  <td className="py-3.5 px-4">
                    {getZatcaBadge(t.zatcaComplianceRate)}
                  </td>

                  {/* Transactions */}
                  <td className="py-3.5 px-4 text-right">
                    <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                      {t.transactionCount.toLocaleString()}
                    </span>
                  </td>

                  {/* BigQuery Rows */}
                  <td className="py-3.5 px-4 text-right">
                    <span className="font-mono text-zinc-600 dark:text-zinc-400">
                      {t.rowCount.toLocaleString()}
                    </span>
                  </td>

                  {/* Revenue */}
                  <td className="py-3.5 px-4 text-right">
                    <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {t.revenue > 0 ? (
                        `${t.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>Showing {filteredTenants.length} of {tenants.length} total organizations</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Healthy &ge; 98%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Warning &lt; 97%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Critical &lt; 90%
          </span>
        </div>
      </div>
    </div>
  );
};

export default TenantComparisonTable;
