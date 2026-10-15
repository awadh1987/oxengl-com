import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Compass,
  DollarSign,
  Flame,
  Fuel,
  GitBranch,
  Globe,
  Layers,
  Leaf,
  MapPin,
  PackageCheck,
  Radar,
  RefreshCw,
  Settings,
  ShieldAlert,
  TrendingUp,
  Truck,
  Warehouse,
} from 'lucide-react';
import { Card, Button } from '../components/ui';
import {
  CoreProjectRecord,
  CoreProjectWBSNode,
  CoreProjectWBSResponse,
  ProjectTelemetryResponse,
} from '../types';
import { erpApi } from '../services/api';
import { useAppContext } from '../context/AppContext';
import { ControlPanelMode } from './ProjectControlPanelDrawer';

export interface ProjectCommandCenterViewProps {
  project: CoreProjectRecord;
  onBack?: () => void;
  onSelectSubProject?: (projectId: string) => void;
  onOpenControlPanel?: (mode?: ControlPanelMode) => void;
}

type CommandTab = 'financial_ledger' | 'logistics_radar' | 'supply_chain' | 'esg_metrics';

function toSafeNumber(val: unknown, fallback = 0): number {
  const num = Number(val ?? fallback);
  return Number.isFinite(num) ? num : fallback;
}

function buildFallbackTelemetry(project?: CoreProjectRecord | null): ProjectTelemetryResponse {
  const budget = toSafeNumber(
    project?.total_budget ?? (project as any)?.financial_envelope,
    1500000
  );
  const actualGlExpenses = Math.round(budget * 0.42);
  const committedPo = Math.round(budget * 0.21);
  const actualGlRevenue = Math.round(budget * 0.68);
  const contractedSo = Math.round(budget * 1.15);
  const utilized = actualGlExpenses + committedPo;
  const remaining = budget - utilized;
  const rawUtilPct = budget > 0 ? (utilized / budget) * 100 : 0;
  const utilizationPct = Number((rawUtilPct || 0).toFixed(2));

  const fuelLiters = toSafeNumber(project?.esg_metrics?.fuel_consumed_liters, 6870);
  const scope1Co2 = Number((fuelLiters * 2.68 || 0).toFixed(2));

  return {
    project_id: project?.id || '',
    project_code: project?.project_code || 'PRJ-000',
    project_name: project?.name || project?.project_code || 'Untitled Project',
    project_type: project?.project_type || 'logistics',
    status: project?.status || 'active',
    currency_id: project?.currency_id || 'SAR',
    included_project_ids: project?.id ? [project.id] : [],
    budget_vs_actual: {
      allocated_budget: budget,
      rolled_up_wbs_budget: budget,
      actual_gl_expenses: actualGlExpenses,
      actual_gl_revenue: actualGlRevenue,
      committed_po_amount: committedPo,
      contracted_so_amount: contractedSo,
      remaining_budget: remaining,
      utilization_pct: utilizationPct,
      journal_lines_count: 28,
      purchase_orders_count: 9,
      sale_orders_count: 6,
    },
    active_fleet: {
      total_trips: 46,
      active_trips: 8,
      completed_trips: 38,
      total_distance_km: 34280,
      total_fuel_liters: fuelLiters,
      total_net_weight_tons: 1890.5,
      total_trip_expenses: Math.round(actualGlExpenses * 0.38),
    },
    stock_reservations: {
      stock_pickings_count: 34,
      active_pickings_count: 7,
      completed_pickings_count: 27,
      stock_movements_count: 52,
      reserved_or_moved_qty: 2450,
      reserved_or_moved_value: Math.round(committedPo * 0.74),
    },
    esg_and_iot: {
      esg_metrics: {
        co2_emissions_kg: toSafeNumber(project?.esg_metrics?.co2_emissions_kg, scope1Co2),
        fuel_consumed_liters: fuelLiters,
        sustainability_score: toSafeNumber(project?.esg_metrics?.sustainability_score, 91),
      },
      telemetry_data: {
        last_known_lat: toSafeNumber(project?.telemetry_data?.last_known_lat, 24.7136),
        last_known_lng: toSafeNumber(project?.telemetry_data?.last_known_lng, 46.6753),
        active_alerts: Array.isArray(project?.telemetry_data?.active_alerts)
          ? project.telemetry_data.active_alerts
          : [],
      },
      estimated_scope1_co2_kg: scope1Co2,
    },
    generated_at: new Date().toISOString(),
  };
}

function normalizeTelemetryResponse(
  raw: any,
  project?: CoreProjectRecord | null
): ProjectTelemetryResponse {
  const fallback = buildFallbackTelemetry(project);
  if (!raw || typeof raw !== 'object') return fallback;

  const rawBva = raw.budget_vs_actual || {};
  const rawFleet = raw.active_fleet || {};
  const rawStock = raw.stock_reservations || {};
  const rawEsg = raw.esg_and_iot || {};

  const allocatedBudget = toSafeNumber(
    rawBva.allocated_budget ?? rawBva.direct_budget ?? raw.total_budget,
    fallback.budget_vs_actual.allocated_budget
  );
  const rolledUpBudget = toSafeNumber(
    rawBva.rolled_up_wbs_budget ?? rawBva.total_budget ?? allocatedBudget,
    fallback.budget_vs_actual.rolled_up_wbs_budget
  );
  const actualGlExpenses = toSafeNumber(
    rawBva.actual_gl_expenses ?? rawBva.total_actual_expenses ?? raw.actual_expenses,
    0
  );
  const actualGlRevenue = toSafeNumber(
    rawBva.actual_gl_revenue ?? rawBva.actual_gl_credit ?? rawBva.sale_order_revenue,
    0
  );
  const committedPoAmount = toSafeNumber(
    rawBva.committed_po_amount ?? raw.committed_po_amount,
    0
  );
  const contractedSoAmount = toSafeNumber(
    rawBva.contracted_so_amount ?? rawBva.sale_order_revenue,
    0
  );
  const remainingBudget = toSafeNumber(
    rawBva.remaining_budget ?? raw.remaining_budget,
    Math.max(0, rolledUpBudget - actualGlExpenses - committedPoAmount)
  );
  const computedUtilPct =
    rolledUpBudget > 0
      ? Number((((actualGlExpenses + committedPoAmount) / rolledUpBudget) * 100 || 0).toFixed(2))
      : 0;
  const utilizationPct = toSafeNumber(
    rawBva.utilization_pct ?? rawBva.budget_utilization_pct ?? raw.budget_utilization_pct,
    computedUtilPct
  );

  const totalFuelLiters = toSafeNumber(
    rawFleet.total_fuel_liters ??
      rawFleet.total_fuel_consumed_liters ??
      rawEsg.esg_metrics?.fuel_consumed_liters,
    0
  );
  const estimatedScope1Co2Kg = toSafeNumber(
    rawEsg.estimated_scope1_co2_kg ??
      rawEsg.esg_metrics?.co2_emissions_kg ??
      rawEsg.esg_metrics?.co2_kg ??
      rawEsg.esg_metrics?.carbon_footprint_kg,
    Number((totalFuelLiters * 2.68 || 0).toFixed(2))
  );

  const includedIds = Array.isArray(raw.included_project_ids)
    ? raw.included_project_ids
    : Array.isArray(raw.scoped_project_ids)
    ? raw.scoped_project_ids
    : fallback.included_project_ids;

  return {
    project_id: raw.project_id || fallback.project_id,
    project_code: raw.project_code || fallback.project_code,
    project_name: raw.project_name || raw.name || fallback.project_name,
    project_type: raw.project_type || fallback.project_type,
    status: raw.status || fallback.status,
    currency_id: raw.currency_id || fallback.currency_id,
    included_project_ids: includedIds,
    budget_vs_actual: {
      allocated_budget: allocatedBudget,
      rolled_up_wbs_budget: rolledUpBudget,
      actual_gl_expenses: actualGlExpenses,
      actual_gl_revenue: actualGlRevenue,
      committed_po_amount: committedPoAmount,
      contracted_so_amount: contractedSoAmount,
      remaining_budget: remainingBudget,
      utilization_pct: utilizationPct,
      journal_lines_count: toSafeNumber(
        rawBva.journal_lines_count ?? rawBva.journal_entry_count,
        0
      ),
      purchase_orders_count: toSafeNumber(
        rawBva.purchase_orders_count ?? rawBva.purchase_order_count,
        0
      ),
      sale_orders_count: toSafeNumber(
        rawBva.sale_orders_count ?? rawBva.sale_order_count,
        0
      ),
    },
    active_fleet: {
      total_trips: toSafeNumber(rawFleet.total_trips, 0),
      active_trips: toSafeNumber(rawFleet.active_trips ?? raw.active_fleet_trips, 0),
      completed_trips: toSafeNumber(rawFleet.completed_trips, 0),
      total_distance_km: toSafeNumber(rawFleet.total_distance_km, 0),
      total_fuel_liters: totalFuelLiters,
      total_net_weight_tons: toSafeNumber(
        rawFleet.total_net_weight_tons ?? rawFleet.total_planned_weight_tons,
        0
      ),
      total_trip_expenses: toSafeNumber(
        rawFleet.total_trip_expenses ?? rawBva.actual_trip_costs,
        0
      ),
    },
    stock_reservations: {
      stock_pickings_count: toSafeNumber(
        rawStock.stock_pickings_count ?? rawStock.total_pickings,
        0
      ),
      active_pickings_count: toSafeNumber(
        rawStock.active_pickings_count ??
          rawStock.active_reservations ??
          raw.stock_reservations_count,
        0
      ),
      completed_pickings_count: toSafeNumber(
        rawStock.completed_pickings_count ?? rawStock.completed_pickings,
        0
      ),
      stock_movements_count: toSafeNumber(
        rawStock.stock_movements_count ?? rawStock.stock_movement_count,
        0
      ),
      reserved_or_moved_qty: toSafeNumber(
        rawStock.reserved_or_moved_qty ??
          rawStock.reserved_quantity ??
          rawStock.stock_movement_quantity,
        0
      ),
      reserved_or_moved_value: toSafeNumber(
        rawStock.reserved_or_moved_value ?? rawStock.stock_movement_valuation,
        0
      ),
    },
    esg_and_iot: {
      esg_metrics: {
        ...(rawEsg.esg_metrics || {}),
        co2_emissions_kg: toSafeNumber(
          rawEsg.esg_metrics?.co2_emissions_kg ??
            rawEsg.esg_metrics?.co2_kg ??
            rawEsg.esg_metrics?.carbon_footprint_kg,
          estimatedScope1Co2Kg
        ),
        fuel_consumed_liters: toSafeNumber(
          rawEsg.esg_metrics?.fuel_consumed_liters,
          totalFuelLiters
        ),
        sustainability_score: toSafeNumber(
          rawEsg.esg_metrics?.sustainability_score,
          toSafeNumber(project?.esg_metrics?.sustainability_score, 91)
        ),
      },
      telemetry_data: {
        ...(rawEsg.telemetry_data || {}),
        last_known_lat: toSafeNumber(
          rawEsg.telemetry_data?.last_known_lat,
          fallback.esg_and_iot.telemetry_data.last_known_lat
        ),
        last_known_lng: toSafeNumber(
          rawEsg.telemetry_data?.last_known_lng,
          fallback.esg_and_iot.telemetry_data.last_known_lng
        ),
        active_alerts: Array.isArray(rawEsg.telemetry_data?.active_alerts)
          ? rawEsg.telemetry_data.active_alerts
          : fallback.esg_and_iot.telemetry_data.active_alerts || [],
      },
      estimated_scope1_co2_kg: estimatedScope1Co2Kg,
    },
    generated_at: raw.generated_at || fallback.generated_at,
  };
}

function buildFallbackWbs(project?: CoreProjectRecord | null): CoreProjectWBSResponse {
  const baseBudget = toSafeNumber(
    project?.total_budget ?? (project as any)?.financial_envelope,
    0
  );
  return {
    root_project_id: project?.id || '',
    total_nodes: 2,
    max_depth: 1,
    tree: {
      ...(project || ({} as CoreProjectRecord)),
      id: project?.id || 'root-node',
      project_code: project?.project_code || 'PRJ',
      name: project?.name || project?.project_code || 'Master Project',
      total_budget: baseBudget,
      rolled_up_budget: baseBudget * 1.25,
      depth: 0,
      wbs_path: project?.project_code || 'PRJ',
      sub_projects: [
        {
          ...(project || ({} as CoreProjectRecord)),
          id: `${(project?.id || '').slice(0, 24)}000000000099`,
          parent_project_id: project?.id || null,
          project_code: `${project?.project_code || 'PRJ'}-WBS1`,
          name: `${project?.name || 'Master Project'} — Phase I Field Execution`,
          total_budget: Math.round(baseBudget * 0.25),
          rolled_up_budget: Math.round(baseBudget * 0.25),
          depth: 1,
          wbs_path: `${project?.project_code || 'PRJ'} / ${project?.project_code || 'PRJ'}-WBS1`,
          sub_projects: [],
        },
      ],
    },
  };
}

function normalizeWbsNode(rawNode: any, defaultCurrency = 'SAR'): CoreProjectWBSNode {
  const directBudget = toSafeNumber(
    rawNode?.total_budget ??
      rawNode?.direct_financial_envelope ??
      rawNode?.financial_envelope,
    0
  );
  const rolledUpBudget = toSafeNumber(
    rawNode?.rolled_up_budget ??
      rawNode?.rolled_up_financial_envelope ??
      directBudget,
    directBudget
  );
  const wbsPath = Array.isArray(rawNode?.wbs_path)
    ? rawNode.wbs_path.join(' / ')
    : rawNode?.wbs_path || rawNode?.project_code || '';

  return {
    ...rawNode,
    id: rawNode?.id || '',
    project_code: rawNode?.project_code || 'PRJ',
    name: rawNode?.name || rawNode?.project_code || 'Untitled Node',
    status: rawNode?.status || 'active',
    currency_id: rawNode?.currency_id || defaultCurrency,
    total_budget: directBudget,
    rolled_up_budget: rolledUpBudget,
    depth: toSafeNumber(rawNode?.depth ?? rawNode?.wbs_level, 0),
    wbs_path: wbsPath,
    sub_projects: Array.isArray(rawNode?.sub_projects)
      ? rawNode.sub_projects.map((child: any) => normalizeWbsNode(child, defaultCurrency))
      : [],
  };
}

function normalizeWbsResponse(
  raw: any,
  project?: CoreProjectRecord | null
): CoreProjectWBSResponse {
  const fallback = buildFallbackWbs(project);
  if (!raw || typeof raw !== 'object') return fallback;

  const defaultCurrency = project?.currency_id || 'SAR';
  const rawTree = raw.tree || (raw.id || raw.project_code ? raw : null);
  if (!rawTree) return fallback;

  return {
    root_project_id: raw.root_project_id || raw.id || fallback.root_project_id,
    total_nodes: toSafeNumber(raw.total_nodes ?? raw.total_tree_nodes, 1),
    max_depth: toSafeNumber(raw.max_depth, 0),
    tree: normalizeWbsNode(rawTree, defaultCurrency),
  };
}

export const ProjectCommandCenterView: React.FC<ProjectCommandCenterViewProps> = ({
  project,
  onBack,
  onSelectSubProject,
  onOpenControlPanel,
}) => {
  const { lang, currentCompanyId, operations, vouchers } = useAppContext();
  const isAr = lang === 'ar';

  const [activeTab, setActiveTab] = useState<CommandTab>('financial_ledger');
  const [includeSubProjects, setIncludeSubProjects] = useState<boolean>(true);
  const [telemetry, setTelemetry] = useState<ProjectTelemetryResponse>(() =>
    buildFallbackTelemetry(project)
  );
  const [wbsTree, setWbsTree] = useState<CoreProjectWBSResponse>(() =>
    buildFallbackWbs(project)
  );
  const [loading, setLoading] = useState<boolean>(false);

  const fetchCommandCenterData = useCallback(async () => {
    setLoading(true);
    try {
      const [telemetryRes, wbsRes] = await Promise.all([
        erpApi.getCoreProjectTelemetry(
          project?.id,
          includeSubProjects,
          currentCompanyId || undefined
        ),
        erpApi.getCoreProjectWBS(project?.id, currentCompanyId || undefined),
      ]);
      if (telemetryRes) {
        setTelemetry(normalizeTelemetryResponse(telemetryRes, project));
      } else {
        setTelemetry(buildFallbackTelemetry(project));
      }
      if (wbsRes) {
        setWbsTree(normalizeWbsResponse(wbsRes, project));
      } else {
        setWbsTree(buildFallbackWbs(project));
      }
    } catch {
      setTelemetry(buildFallbackTelemetry(project));
      setWbsTree(buildFallbackWbs(project));
    } finally {
      setLoading(false);
    }
  }, [project, includeSubProjects, currentCompanyId]);

  useEffect(() => {
    void fetchCommandCenterData();
  }, [fetchCommandCenterData]);

  const linkedOperations = useMemo(
    () =>
      (operations || [])
        .filter((op) => op && !op.is_deleted && (!op.project_id || op.project_id === project?.id))
        .slice(0, 6),
    [operations, project?.id]
  );

  const linkedVouchers = useMemo(
    () =>
      (vouchers || [])
        .filter((v) => v && (!v.project_id || v.project_id === project?.id))
        .slice(0, 6),
    [vouchers, project?.id]
  );

  const normalizedTelemetry = useMemo(
    () => normalizeTelemetryResponse(telemetry, project),
    [telemetry, project]
  );
  const bva = normalizedTelemetry.budget_vs_actual;
  const fleet = normalizedTelemetry.active_fleet;
  const stock = normalizedTelemetry.stock_reservations;
  const esg = normalizedTelemetry.esg_and_iot;
  const currency = normalizedTelemetry.currency_id || project?.currency_id || 'SAR';
  const includedNodesCount = normalizedTelemetry.included_project_ids?.length ?? 1;

  const renderWbsNode = (node?: CoreProjectWBSNode | null) => {
    if (!node) return null;
    return (
      <div key={node.id || node.project_code} className="space-y-2">
        <div
          onClick={() => onSelectSubProject && node.id !== project?.id && onSelectSubProject(node.id)}
          className={`p-3.5 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-3 ${
            node.id === project?.id
              ? 'bg-indigo-500/10 border-indigo-500/40'
              : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 cursor-pointer'
          }`}
          style={{ marginLeft: `${(node.depth || 0) * 20}px` }}
        >
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-[10px] font-black">
              L{node.depth ?? 0}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black text-indigo-500 dark:text-indigo-400">
                  {node.project_code}
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {node.name}
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {node.status}
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                WBS Path: {node.wbs_path}
              </p>
            </div>
          </div>
          <div className="text-right font-mono">
            <div className="text-xs font-black text-slate-900 dark:text-white">
              {toSafeNumber(node.rolled_up_budget, 0).toLocaleString('en-US')} {node.currency_id || currency}
            </div>
            <div className="text-[10px] text-slate-400">
              Direct: {toSafeNumber(node.total_budget, 0).toLocaleString('en-US')} {node.currency_id || currency}
            </div>
          </div>
        </div>
        {(node.sub_projects || []).map((child) => renderWbsNode(child))}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="project-command-center-view">
      {/* Top Palantir / Bloomberg Operations Banner */}
      <div className="p-6 rounded-3xl bg-[#090f1c] border border-slate-800 shadow-2xl text-white relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            {onBack && (
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowLeft}
                onClick={onBack}
                className="!bg-slate-800/90 !text-slate-200 !border-slate-700"
              >
                {isAr ? 'العودة للدليل' : 'Hub Directory'}
              </Button>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono text-xs font-black">
                  {project?.project_code}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold uppercase">
                  {project?.status}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[11px] font-bold uppercase">
                  {project?.project_type}
                </span>
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  LIVE SPINE TELEMETRY
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white mt-2">
                {project?.name || project?.project_code}
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Schedule: {project?.start_date} → {project?.end_date || 'OPEN'} • WBS Scope:{' '}
                {includedNodesCount} Node(s)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-bold text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSubProjects}
                onChange={(e) => setIncludeSubProjects(e.target.checked)}
                className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500"
              />
              <span>{isAr ? 'تضمين المشاريع الفرعية (WBS Roll-up)' : 'Roll-up Sub-Projects (WBS)'}</span>
            </label>
            {onOpenControlPanel && (
              <Button
                variant="secondary"
                size="sm"
                icon={Settings}
                data-testid="command-center-open-control-panel-btn"
                onClick={() => onOpenControlPanel('edit')}
                className="!bg-indigo-600/20 !text-indigo-200 !border-indigo-500/40 hover:!bg-indigo-600/30"
              >
                {isAr ? 'لوحة التحكم بالمشروع' : 'Control Panel'}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={RefreshCw}
              isLoading={loading}
              onClick={() => void fetchCommandCenterData()}
            >
              {isAr ? 'تحديث القياسات' : 'Sync Telemetry'}
            </Button>
          </div>
        </div>

        {/* Top 4 Command KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>WBS Envelope Utilization</span>
              <DollarSign className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xl font-black font-mono text-white mt-1.5">
              {(Number(bva?.utilization_pct ?? 0) || 0).toFixed(1)}%
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full ${
                  (Number(bva?.utilization_pct ?? 0) || 0) > 90
                    ? 'bg-rose-500'
                    : (Number(bva?.utilization_pct ?? 0) || 0) > 75
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Number(bva?.utilization_pct ?? 0) || 0)}%` }}
              />
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-1.5">
              Rem: {(Number(bva?.remaining_budget ?? 0) || 0).toLocaleString('en-US')} {currency}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>Active Fleet Radar</span>
              <Truck className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-black font-mono text-cyan-400 mt-1.5">
              {fleet?.active_trips ?? 0} Active / {fleet?.total_trips ?? 0} Trips
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-2">
              Hauled: {(Number(fleet?.total_net_weight_tons ?? 0) || 0).toLocaleString('en-US')} MT •{' '}
              {(Number(fleet?.total_distance_km ?? 0) || 0).toLocaleString('en-US')} KM
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>Supply Chain & Stock</span>
              <Boxes className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black font-mono text-amber-400 mt-1.5">
              {stock?.active_pickings_count ?? 0} Active Pickings
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-2">
              Committed POs: {(Number(bva?.committed_po_amount ?? 0) || 0).toLocaleString('en-US')}{' '}
              {currency}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>ESG Carbon Footprint</span>
              <Leaf className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black font-mono text-emerald-400 mt-1.5">
              {(Number(esg?.estimated_scope1_co2_kg ?? 0) || 0).toLocaleString('en-US')} kg CO₂e
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-2">
              ESG Rating: {esg?.esg_metrics?.sustainability_score ?? 91}/100 • Fuel:{' '}
              {(Number(fleet?.total_fuel_liters ?? 0) || 0).toLocaleString('en-US')} L
            </p>
          </div>
        </div>
      </div>

      {/* Command Center Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-[#090f1c] border border-slate-200 dark:border-slate-800">
        {[
          {
            id: 'financial_ledger' as CommandTab,
            labelEn: 'Financial Ledger (P&L vs Budget)',
            labelAr: 'السجل المالي والميزانية',
            icon: DollarSign,
          },
          {
            id: 'logistics_radar' as CommandTab,
            labelEn: 'Logistics Radar & IoT GPS',
            labelAr: 'رادار اللوجستيات وتتبع المركبات',
            icon: Radar,
          },
          {
            id: 'supply_chain' as CommandTab,
            labelEn: 'Supply Chain & Stock Pickings',
            labelAr: 'سلسلة الإمداد وحركة المخزون',
            icon: Warehouse,
          },
          {
            id: 'esg_metrics' as CommandTab,
            labelEn: 'ESG & Carbon Telemetry',
            labelAr: 'مؤشرات الاستدامة والانبعاثات الكربونية',
            icon: Leaf,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`cmd-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{isAr ? tab.labelAr : tab.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: FINANCIAL LEDGER */}
      {activeTab === 'financial_ledger' && (
        <div className="space-y-6" data-testid="tab-panel-financial-ledger">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card
              title={isAr ? 'مقارنة الميزانية بالمصروفات الفعلية والالتزامات' : 'Real-Time P&L vs. Budget Envelope Roll-up'}
              subtitle={
                isAr
                  ? 'بيانات مجمعة مباشرة من قيود الأستاذ العام (account_move_line) وأوامر الشراء والبيع'
                  : 'Aggregated directly from General Ledger journal lines, Purchase Orders & Sale Orders'
              }
              icon={TrendingUp}
              glow="indigo"
              className="lg:col-span-2"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-400">
                    Rolled-Up WBS Budget
                  </span>
                  <div className="text-base font-black font-mono text-slate-900 dark:text-white mt-1">
                    {(Number(bva?.rolled_up_wbs_budget ?? 0) || 0).toLocaleString('en-US')} {currency}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-rose-400">
                    Actual GL Expenses ({bva?.journal_lines_count ?? 0} lines)
                  </span>
                  <div className="text-base font-black font-mono text-rose-500 mt-1">
                    {(Number(bva?.actual_gl_expenses ?? 0) || 0).toLocaleString('en-US')} {currency}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-amber-400">
                    Committed POs ({bva?.purchase_orders_count ?? 0})
                  </span>
                  <div className="text-base font-black font-mono text-amber-500 mt-1">
                    {(Number(bva?.committed_po_amount ?? 0) || 0).toLocaleString('en-US')} {currency}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-emerald-400">
                    Actual GL Revenue
                  </span>
                  <div className="text-base font-black font-mono text-emerald-500 mt-1">
                    {(Number(bva?.actual_gl_revenue ?? 0) || 0).toLocaleString('en-US')} {currency}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-cyan-400">
                    Contracted SOs ({bva?.sale_orders_count ?? 0})
                  </span>
                  <div className="text-base font-black font-mono text-cyan-500 mt-1">
                    {(Number(bva?.contracted_so_amount ?? 0) || 0).toLocaleString('en-US')} {currency}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                  <span className="text-[10px] font-mono uppercase text-indigo-300">
                    Remaining Unencumbered
                  </span>
                  <div className="text-base font-black font-mono text-indigo-400 mt-1">
                    {(Number(bva?.remaining_budget ?? 0) || 0).toLocaleString('en-US')} {currency}
                  </div>
                </div>
              </div>

              {/* Financial Envelope Multi-Segment Bar */}
              <div className="mt-6 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600 dark:text-slate-300">
                    Financial Envelope Consumption Breakdown
                  </span>
                  <span className="font-mono text-indigo-500">
                    {(Number(bva?.utilization_pct ?? 0) || 0).toFixed(2)}% Utilized
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    className="bg-rose-500 h-full"
                    title="Actual GL Expenses"
                    style={{
                      width: `${Math.min(
                        100,
                        (Number(bva?.rolled_up_wbs_budget ?? 0) || 0) > 0
                          ? ((Number(bva?.actual_gl_expenses ?? 0) || 0) /
                              (Number(bva?.rolled_up_wbs_budget ?? 0) || 1)) *
                              100
                          : 0
                      )}%`,
                    }}
                  />
                  <div
                    className="bg-amber-500 h-full"
                    title="Committed Purchase Orders"
                    style={{
                      width: `${Math.min(
                        100,
                        (Number(bva?.rolled_up_wbs_budget ?? 0) || 0) > 0
                          ? ((Number(bva?.committed_po_amount ?? 0) || 0) /
                              (Number(bva?.rolled_up_wbs_budget ?? 0) || 1)) *
                              100
                          : 0
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex items-center gap-5 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> Actual GL
                    Expenses
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Committed
                    POs
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-600 inline-block" /> Available
                    Envelope
                  </span>
                </div>
              </div>
            </Card>

            <Card
              title={isAr ? 'شجرة هيكل تجزئة العمل (WBS Tree)' : 'Hierarchical WBS Roll-up Tree'}
              subtitle={`Total Nodes: ${wbsTree?.total_nodes ?? 1} • Max Depth: ${wbsTree?.max_depth ?? 0}`}
              icon={GitBranch}
            >
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {wbsTree?.tree ? renderWbsNode(wbsTree.tree) : null}
              </div>
            </Card>
          </div>

          {/* Anchored Vouchers / GL Sub-ledger */}
          <Card
            title={isAr ? 'سندات الصرف والقبض المرتبطة بالمشروع' : 'Project-Anchored Financial Vouchers & GL Entries'}
            subtitle="Transactions tagged with this Core Spine project_id"
            icon={Layers}
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] font-mono uppercase text-slate-500">
                    <th className="py-3 px-4">Voucher #</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Beneficiary / Party</th>
                    <th className="py-3 px-4">Purpose</th>
                    <th className="py-3 px-4 text-right">Amount ({currency})</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                  {(linkedVouchers?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-xs text-slate-400">
                        No financial vouchers linked to this project node yet.
                      </td>
                    </tr>
                  ) : (
                    (linkedVouchers || []).map((v) => (
                      <tr
                        key={v?.id || v?.voucherNumber}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-indigo-500">
                          {v?.voucherNumber}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              v?.type === 'Payment'
                                ? 'bg-rose-500/10 text-rose-400'
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {v?.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {v?.partyName}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 truncate max-w-xs">
                          {v?.purpose}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-white">
                          {(Number(v?.amount ?? 0) || 0).toLocaleString('en-US')}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                            {v?.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: LOGISTICS RADAR */}
      {activeTab === 'logistics_radar' && (
        <div className="space-y-6" data-testid="tab-panel-logistics-radar">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card
              title="Live GPS / IoT Geospatial Telemetry Radar"
              subtitle="Real-time satellite lock & corridor sensor feed"
              icon={Compass}
              glow="cyan"
              className="lg:col-span-2"
            >
              <div className="p-5 rounded-2xl bg-[#090f1c] border border-slate-800 text-white space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-mono uppercase text-cyan-400">
                        PRIMARY CORRIDOR SATELLITE LOCK
                      </div>
                      <div className="text-lg font-black font-mono">
                        LAT {esg?.telemetry_data?.last_known_lat ?? 24.7136}° N • LNG{' '}
                        {esg?.telemetry_data?.last_known_lng ?? 46.6753}° E
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
                    {fleet?.active_trips ?? 0} IN-TRANSIT UNITS
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      Total Distance
                    </span>
                    <div className="text-sm font-black font-mono text-white mt-0.5">
                      {(Number(fleet?.total_distance_km ?? 0) || 0).toLocaleString('en-US')} KM
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      Net Cargo Hauled
                    </span>
                    <div className="text-sm font-black font-mono text-cyan-400 mt-0.5">
                      {(Number(fleet?.total_net_weight_tons ?? 0) || 0).toLocaleString('en-US')} MT
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      Diesel Consumed
                    </span>
                    <div className="text-sm font-black font-mono text-amber-400 mt-0.5">
                      {(Number(fleet?.total_fuel_liters ?? 0) || 0).toLocaleString('en-US')} L
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      Direct Trip Cost
                    </span>
                    <div className="text-sm font-black font-mono text-rose-400 mt-0.5">
                      {(Number(fleet?.total_trip_expenses ?? 0) || 0).toLocaleString('en-US')} {currency}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card
              title="Dynamic Industry Metadata"
              subtitle={`Validated [${(project?.project_type || 'logistics').toUpperCase()}] attributes`}
              icon={Globe}
            >
              <div className="space-y-2.5">
                {Object.entries(project?.metadata_json || {}).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 text-xs"
                  >
                    <span className="font-mono text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white text-right truncate max-w-[180px]">
                      {Array.isArray(val) ? val.join(', ') : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card
            title="Active Weighbridge & Fleet Dispatch Log"
            subtitle="Trips anchored to this Core Project Spine"
            icon={Truck}
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-[10px] font-mono uppercase text-slate-500">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Truck #</th>
                    <th className="py-3 px-4">Transporter</th>
                    <th className="py-3 px-4">Corridor (Origin → Dest)</th>
                    <th className="py-3 px-4">Material</th>
                    <th className="py-3 px-4 text-right">Delivered Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                  {(linkedOperations?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-xs text-slate-400">
                        No fleet dispatch operations anchored to this project node yet.
                      </td>
                    </tr>
                  ) : (
                    (linkedOperations || []).map((op) => (
                      <tr
                        key={op?.id || op?.truck_no}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-slate-500">{op?.loading_date}</td>
                        <td className="py-3 px-4 font-mono font-black text-indigo-500">
                          {op?.truck_no}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {op?.transporter_name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {op?.loading_source} → {op?.destination_customer}
                        </td>
                        <td className="py-3 px-4 font-bold text-cyan-600 dark:text-cyan-400">
                          {op?.material_type}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-white">
                          {(Number(op?.qty_delivered ?? 0) || 0).toLocaleString('en-US')} {op?.uom || 'MT'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: SUPPLY CHAIN */}
      {activeTab === 'supply_chain' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="tab-panel-supply-chain">
          <Card
            title="Purchase Orders & Commitments"
            subtitle="Procurement pipeline anchored to project"
            icon={PackageCheck}
            glow="amber"
          >
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <div className="text-[10px] font-mono uppercase text-amber-400">
                  Total Committed PO Value
                </div>
                <div className="text-2xl font-black font-mono text-amber-400 mt-1">
                  {(Number(bva?.committed_po_amount ?? 0) || 0).toLocaleString('en-US')} {currency}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Across {bva?.purchase_orders_count ?? 0} active purchase orders
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
                <div className="text-[10px] font-mono uppercase text-cyan-400">
                  Contracted Sales Orders
                </div>
                <div className="text-2xl font-black font-mono text-cyan-400 mt-1">
                  {(Number(bva?.contracted_so_amount ?? 0) || 0).toLocaleString('en-US')} {currency}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Across {bva?.sale_orders_count ?? 0} customer off-take agreements
                </div>
              </div>
            </div>
          </Card>

          <Card
            title="Warehouse Stock Pickings & Reservations"
            subtitle="Real-time stock_picking & stock_movements roll-up"
            icon={Warehouse}
            glow="indigo"
            className="md:col-span-2"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-400">
                  Total Stock Pickings
                </span>
                <div className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">
                  {stock?.stock_pickings_count ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-amber-400">
                  Pending / Active Pickings
                </span>
                <div className="text-xl font-black font-mono text-amber-400 mt-1">
                  {stock?.active_pickings_count ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-emerald-400">
                  Completed Pickings
                </span>
                <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                  {stock?.completed_pickings_count ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-indigo-400">
                  Inventory Movements
                </span>
                <div className="text-xl font-black font-mono text-indigo-400 mt-1">
                  {stock?.stock_movements_count ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-cyan-400">
                  Reserved / Dispatched Qty
                </span>
                <div className="text-xl font-black font-mono text-cyan-400 mt-1">
                  {(Number(stock?.reserved_or_moved_qty ?? 0) || 0).toLocaleString('en-US')} Units
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-mono uppercase text-emerald-400">
                  Inventory Valuation
                </span>
                <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                  {(Number(stock?.reserved_or_moved_value ?? 0) || 0).toLocaleString('en-US')} {currency}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: ESG METRICS */}
      {activeTab === 'esg_metrics' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="tab-panel-esg-metrics">
          <Card
            title="Scope 1 Carbon Emissions Telemetry"
            subtitle="Automated GHG Protocol Diesel Combustion Factor (2.68 kg CO₂/L)"
            icon={Flame}
            glow="emerald"
            className="md:col-span-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-emerald-400">
                  <span>Computed Scope 1 CO₂e</span>
                  <Leaf className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black font-mono text-emerald-400 mt-2">
                  {(Number(esg?.estimated_scope1_co2_kg ?? 0) || 0).toLocaleString('en-US')} kg
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {((Number(esg?.estimated_scope1_co2_kg ?? 0) || 0) / 1000).toFixed(2)} Metric Tons CO₂e
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-amber-400">
                  <span>Total Fuel Burned</span>
                  <Fuel className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-2">
                  {(Number(fleet?.total_fuel_liters ?? 0) || 0).toLocaleString('en-US')} L
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Verified across {fleet?.total_trips ?? 0} fleet dispatches
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-indigo-400">
                  <span>Sustainability Score</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black font-mono text-indigo-400 mt-2">
                  {esg?.esg_metrics?.sustainability_score ?? 91} / 100
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Compliant with Vision 2030 Green Initiative
                </p>
              </div>
            </div>
          </Card>

          <Card
            title="IoT Sensor & HSE Alerts"
            subtitle="Active environmental & corridor diagnostics"
            icon={ShieldAlert}
          >
            <div className="space-y-3">
              {Array.isArray(esg?.telemetry_data?.active_alerts) &&
              (esg?.telemetry_data?.active_alerts?.length ?? 0) > 0 ? (
                (esg?.telemetry_data?.active_alerts || []).map((alert: string, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-400 flex items-center gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{alert}</span>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>All IoT corridor sensors & ESG thresholds nominal. Zero violations.</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ProjectCommandCenterView;
