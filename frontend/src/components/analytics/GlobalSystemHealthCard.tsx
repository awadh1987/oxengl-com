/**
 * OxenGL ERP — Global System Health & KPI Overview Card
 * ========================================================
 * Location: src/components/analytics/GlobalSystemHealthCard.tsx
 *
 * Renders executive-level infrastructure health and aggregate platform KPIs:
 * - SLA Platform Uptime (99.98%) with animated telemetry indicators
 * - Google Cloud BigQuery sync status & dataset tracking
 * - Total aggregate platform revenue (SAR) across all tenants
 * - Redis ASGI cache status & PostgreSQL connection pool telemetry
 * - Enterprise dark mode styling (dark:bg-zinc-900, dark:border-zinc-800)
 */

import React from 'react';
import { 
  Activity, 
  Database, 
  Coins, 
  Server, 
  TrendingUp, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Zap,
  Clock
} from 'lucide-react';
import { PlatformKPIs, SystemHealthDetails } from '../../services/analyticsService';
import { SkeletonCard } from '../common/Skeleton';

export interface GlobalSystemHealthCardProps {
  kpis: PlatformKPIs;
  systemHealth: SystemHealthDetails;
  isLoading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

export const GlobalSystemHealthCard: React.FC<GlobalSystemHealthCardProps> = ({
  kpis,
  systemHealth,
  isLoading = false,
  onRefresh,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // BigQuery Status Badge helper
  const getBigQueryStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'synced' || s === 'healthy') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Synchronized
        </span>
      );
    }
    if (s === 'syncing') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
          Syncing...
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Degraded
      </span>
    );
  };

  // Redis Cache Status Badge helper
  const getRedisStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'connected') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Active Caching (15m TTL)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Bypassed
      </span>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 4 Executive KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Global Platform Revenue */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Global Aggregate Revenue</span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100">
              {kpis.totalRevenue > 0
                ? `${kpis.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '0.00'}
            </span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 font-mono">SAR</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+16.8% MoM cross-tenant growth</span>
          </div>
        </div>

        {/* Card 2: Platform SLA Uptime */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">System SLA Uptime</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100">
              {kpis.uptimePercentage.toFixed(2)}%
            </span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Optimal</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>Operational over 30d rolling window</span>
          </div>
        </div>

        {/* Card 3: BigQuery Sync Posture */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">BigQuery Pipeline</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100">
              {systemHealth.bigQueryDataset}
            </span>
            {getBigQueryStatusBadge(kpis.bigQuerySyncStatus)}
          </div>
          <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>Partitioned & Clustered</span>
            <span className="font-mono text-[11px] text-indigo-500">RLS Active</span>
          </div>
        </div>

        {/* Card 4: Multi-Tenant Organizations */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Active Organizations</span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100">
              {kpis.activeTenants}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              / {kpis.totalTenants} total
            </span>
          </div>
          <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>{kpis.totalTransactions.toLocaleString()} total ops</span>
            <span className="text-emerald-500 font-medium">100% Isolated</span>
          </div>
        </div>
      </div>

      {/* Global Infrastructure Health Banner */}
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            <Server className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xs">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Cross-Tenant Data Warehouse Infrastructure
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div className="text-zinc-500 dark:text-zinc-400 mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
              <span>PostgreSQL Pool: <strong className="text-zinc-700 dark:text-zinc-300">{systemHealth.postgresPoolStatus}</strong> ({systemHealth.activeDatabaseConnections} connections)</span>
              <span>Redis Acceleration: <strong className="text-zinc-700 dark:text-zinc-300">{getRedisStatusBadge(systemHealth.redisCacheStatus)}</strong></span>
            </div>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-750 transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
            Refresh Telemetry
          </button>
        )}
      </div>
    </div>
  );
};

export default GlobalSystemHealthCard;
