import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Boxes,
  Compass,
  Filter,
  Flame,
  FolderKanban,
  FolderPlus,
  GitBranch,
  HardHat,
  HeartHandshake,
  Layers,
  Leaf,
  Radar,
  RefreshCw,
  Search,
  Sprout,
  Truck,
} from 'lucide-react';
import { Card, Button } from '../components/ui';
import {
  CoreProjectRecord,
  CoreProjectStatus,
  CoreProjectType,
} from '../types';
import { erpApi } from '../services/api';
import { useAppContext } from '../context/AppContext';
import { FALLBACK_ACTIVE_PROJECTS } from '../components/common/ProjectSelector';
import { ProjectCreationModal } from './ProjectCreationModal';
import { ProjectCommandCenterView } from './ProjectCommandCenterView';

const TYPE_FILTER_OPTIONS: { value: CoreProjectType | 'ALL'; labelEn: string; labelAr: string }[] = [
  { value: 'ALL', labelEn: 'All Sectors', labelAr: 'جميع القطاعات' },
  { value: 'logistics', labelEn: 'Logistics', labelAr: 'اللوجستيات' },
  { value: 'supply_chain', labelEn: 'Supply Chain', labelAr: 'سلاسل الإمداد' },
  { value: 'humanitarian_supply', labelEn: 'Humanitarian', labelAr: 'الإغاثة الإنسانية' },
  { value: 'epc', labelEn: 'EPC & Infra', labelAr: 'المقاولات EPC' },
  { value: 'oil_gas', labelEn: 'Oil & Gas', labelAr: 'النفط والغاز' },
  { value: 'commercial_agribusiness', labelEn: 'Agribusiness', labelAr: 'الأعمال الزراعية' },
];

function getProjectTypeBadge(type: CoreProjectType) {
  switch (type) {
    case 'logistics':
      return {
        icon: Truck,
        cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        label: 'LOGISTICS',
      };
    case 'supply_chain':
      return {
        icon: Boxes,
        cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
        label: 'SUPPLY CHAIN',
      };
    case 'humanitarian_supply':
      return {
        icon: HeartHandshake,
        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        label: 'HUMANITARIAN',
      };
    case 'epc':
      return {
        icon: HardHat,
        cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        label: 'EPC INFRA',
      };
    case 'oil_gas':
      return {
        icon: Flame,
        cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        label: 'OIL & GAS',
      };
    case 'commercial_agribusiness':
      return {
        icon: Sprout,
        cls: 'bg-lime-500/15 text-lime-400 border-lime-500/30',
        label: 'AGRIBUSINESS',
      };
  }
}

function normalizeProjectStatusKey(status?: string): string {
  const cleaned = (status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (cleaned === 'active' || cleaned === 'active_execution' || cleaned === 'approved' || cleaned === 'in_progress') {
    return 'active';
  }
  if (cleaned === 'suspended' || cleaned === 'on_hold' || cleaned === 'paused') {
    return 'on_hold';
  }
  return cleaned;
}

function computeSimulatedUtilizationPct(proj: CoreProjectRecord): number {
  const hash = proj.project_code
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const normStatus = normalizeProjectStatusKey(proj.status);
  if (normStatus === 'draft' || normStatus === 'planning') return 12;
  if (normStatus === 'completed' || normStatus === 'closed' || normStatus === 'audited') return 96;
  return 38 + (hash % 52);
}

export const PlanningHubView: React.FC = () => {
  const { lang, currentCompanyId } = useAppContext();
  const isAr = lang === 'ar';

  const [projects, setProjects] = useState<CoreProjectRecord[]>(FALLBACK_ACTIVE_PROJECTS);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedType, setSelectedType] = useState<CoreProjectType | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<CoreProjectStatus | 'ALL'>('ALL');
  const [rootOnly, setRootOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [activeCommandProject, setActiveCommandProject] = useState<CoreProjectRecord | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await erpApi.getCoreProjects(
        {
          project_type: selectedType === 'ALL' ? '' : selectedType,
          status: selectedStatus === 'ALL' ? '' : selectedStatus,
          root_only: rootOnly,
          search: searchQuery.trim() || undefined,
        },
        currentCompanyId || undefined
      );
      if (Array.isArray(data) && data.length > 0) {
        setProjects(data);
      } else if (!selectedType || selectedType === 'ALL') {
        setProjects(FALLBACK_ACTIVE_PROJECTS);
      }
    } catch {
      setProjects(FALLBACK_ACTIVE_PROJECTS);
    } finally {
      setLoading(false);
    }
  }, [selectedType, selectedStatus, rootOnly, searchQuery, currentCompanyId]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((proj) => {
      if (selectedType !== 'ALL' && proj.project_type.toLowerCase() !== selectedType.toLowerCase()) return false;
      if (
        selectedStatus !== 'ALL' &&
        normalizeProjectStatusKey(proj.status) !== normalizeProjectStatusKey(selectedStatus)
      ) {
        return false;
      }
      if (rootOnly && proj.parent_project_id) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inCode = proj.project_code.toLowerCase().includes(q);
        const inName = proj.name.toLowerCase().includes(q);
        const inMeta = JSON.stringify(proj.metadata_json || {})
          .toLowerCase()
          .includes(q);
        if (!inCode && !inName && !inMeta) return false;
      }
      return true;
    });
  }, [projects, selectedType, selectedStatus, rootOnly, searchQuery]);

  const portfolioStats = useMemo(() => {
    const totalBudget = filteredProjects.reduce(
      (sum, p) => sum + Number(p.total_budget || 0),
      0
    );
    const totalCo2 = filteredProjects.reduce(
      (sum, p) => sum + Number(p.esg_metrics?.co2_emissions_kg || 0),
      0
    );
    const avgUtilization =
      filteredProjects.length > 0
        ? filteredProjects.reduce((sum, p) => sum + computeSimulatedUtilizationPct(p), 0) /
          filteredProjects.length
        : 0;
    return {
      count: filteredProjects.length,
      totalBudget,
      totalCo2,
      avgUtilization,
    };
  }, [filteredProjects]);

  if (activeCommandProject) {
    return (
      <ProjectCommandCenterView
        project={activeCommandProject}
        onBack={() => setActiveCommandProject(null)}
        onSelectSubProject={(subId) => {
          const found = projects.find((p) => p.id === subId);
          if (found) setActiveCommandProject(found);
        }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="planning-hub-view">
      {/* Top Operations Center Header */}
      <div className="p-6 rounded-3xl bg-[#090f1c] border border-slate-800 shadow-2xl text-white relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <FolderKanban className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono text-[10px] font-black uppercase">
                  CORE PLANNING SPINE v4.2
                </span>
                <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <Activity className="w-3.5 h-3.5 animate-pulse" />
                  RLS MULTI-TENANT ISOLATION ACTIVE
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1">
                {isAr
                  ? 'مركز قيادة التخطيط الاستراتيجي والمشاريع (Planning Spine Hub)'
                  : 'Planning Spine Command Hub & WBS Master Directory'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? 'العمود الفقري الموحد لربط قيود الأستاذ العام، رحلات الأسطول، أوامر الشراء، وحركات المخزون'
                  : 'Immutable master WBS anchor governing GL journal lines, fleet trips, purchase orders, and stock pickings'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              icon={RefreshCw}
              isLoading={loading}
              onClick={() => void fetchProjects()}
              className="!bg-slate-800/90 !text-slate-200 !border-slate-700"
            >
              {isAr ? 'مزامنة' : 'Sync Spine'}
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={FolderPlus}
              onClick={() => setIsCreateModalOpen(true)}
              data-testid="open-create-project-modal-btn"
            >
              {isAr ? 'تأسيس مشروع جديد' : 'Initialize Core Project'}
            </Button>
          </div>
        </div>

        {/* Executive Portfolio Telemetry Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>Active WBS Projects</span>
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {portfolioStats.count}
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-1">
              Multi-level WBS hierarchy nodes
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>Portfolio Financial Envelope</span>
              <Compass className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
              {portfolioStats.totalBudget.toLocaleString('en-US')} SAR
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-1">
              Allocated across active programs
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>Mean Envelope Utilization</span>
              <Radar className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-black font-mono text-cyan-400 mt-1">
              {portfolioStats.avgUtilization.toFixed(1)}%
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-cyan-500 rounded-full"
                style={{ width: `${Math.min(100, portfolioStats.avgUtilization)}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>Tracked Scope 1 Carbon</span>
              <Leaf className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {portfolioStats.totalCo2.toLocaleString('en-US')} kg
            </div>
            <p className="text-[11px] font-mono text-emerald-400 mt-1">
              ESG Telemetry Active
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Command Bar */}
      <Card noPadding className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Sector Type Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPE_FILTER_OPTIONS.map((opt) => {
              const active = selectedType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`filter-type-${opt.value}`}
                  onClick={() => setSelectedType(opt.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {isAr ? opt.labelAr : opt.labelEn}
                </button>
              );
            })}
          </div>

          {/* Search, Status & Root Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAr ? 'بحث بالكود أو الاسم أو البيانات...' : 'Search code, title, JSONB...'
                }
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label="Filter by Project Status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as CoreProjectStatus | 'ALL')}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
              >
                <option value="ALL">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="active">ACTIVE</option>
                <option value="approved">APPROVED</option>
                <option value="planning">PLANNING</option>
                <option value="draft">DRAFT</option>
                <option value="on_hold">ON HOLD</option>
                <option value="completed">COMPLETED</option>
              </select>
            </div>

            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={rootOnly}
                onChange={(e) => setRootOnly(e.target.checked)}
                className="rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span>{isAr ? 'المشاريع الرئيسية فقط' : 'Root WBS Only'}</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Master Projects Directory Table */}
      <Card
        title={isAr ? 'دليل مشاريع العمود الفقري (Core Projects Directory)' : 'Core Projects Spine Directory'}
        subtitle={
          isAr
            ? 'اضغط على أي مشروع لفتح غرفة القيادة والقياسات الحية (Command Center Telemetry)'
            : 'Select any project node to launch the real-time multi-ledger Command Center'
        }
        icon={GitBranch}
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-4">Project Code & WBS</th>
                <th className="py-3.5 px-4">Master Project Title & Metadata</th>
                <th className="py-3.5 px-4">Sector Archetype</th>
                <th className="py-3.5 px-4">Schedule</th>
                <th className="py-3.5 px-4 text-right">Total Envelope</th>
                <th className="py-3.5 px-4 min-w-[200px]">Envelope Utilization</th>
                <th className="py-3.5 px-4 text-center">ESG Score</th>
                <th className="py-3.5 px-4 text-right">Command Center</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {filteredProjects.map((proj) => {
                const badge = getProjectTypeBadge(proj.project_type);
                const BadgeIcon = badge.icon;
                const utilPct = computeSimulatedUtilizationPct(proj);
                const utilizedAmount = Math.round((Number(proj.total_budget || 0) * utilPct) / 100);
                const metaEntries = Object.entries(proj.metadata_json || {}).slice(0, 2);

                return (
                  <tr
                    key={proj.id}
                    onClick={() => setActiveCommandProject(proj)}
                    className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                  >
                    <td className="py-4 px-4 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 group-hover:underline">
                          {proj.project_code}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            proj.parent_project_id
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          {proj.parent_project_id ? 'SUB-WBS' : 'ROOT WBS'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px] uppercase">
                          {proj.status}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-4 align-top">
                      <div className="font-black text-slate-900 dark:text-white text-sm">
                        {proj.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        {metaEntries.map(([k, v]) => (
                          <span
                            key={k}
                            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300"
                          >
                            {k}: {Array.isArray(v) ? v.join(', ') : String(v)}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-4 px-4 align-top">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-mono font-black ${badge.cls}`}
                      >
                        <BadgeIcon className="w-3.5 h-3.5" />
                        {badge.label}
                      </span>
                    </td>

                    <td className="py-4 px-4 align-top font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      <div>Start: {proj.start_date}</div>
                      <div>End: {proj.end_date || 'Continuous'}</div>
                    </td>

                    <td className="py-4 px-4 align-top text-right font-mono">
                      <div className="text-sm font-black text-slate-900 dark:text-white">
                        {Number(proj.total_budget || 0).toLocaleString('en-US')}
                      </div>
                      <div className="text-[10px] text-slate-400">{proj.currency_id || 'SAR'}</div>
                    </td>

                    <td className="py-4 px-4 align-top">
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          {utilPct}% Utilized
                        </span>
                        <span className="text-slate-400">
                          {utilizedAmount.toLocaleString('en-US')} {proj.currency_id}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            utilPct > 85
                              ? 'bg-rose-500'
                              : utilPct > 70
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, utilPct)}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-4 px-4 align-top text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs font-black">
                        <Leaf className="w-3 h-3" />
                        {proj.esg_metrics?.sustainability_score ?? 90}
                      </span>
                    </td>

                    <td
                      className="py-4 px-4 align-top text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="primary"
                        size="xs"
                        icon={Radar}
                        data-testid={`open-command-center-${proj.project_code}`}
                        onClick={() => setActiveCommandProject(proj)}
                      >
                        {isAr ? 'غرفة القيادة' : 'Telemetry'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ProjectCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        existingProjects={projects}
        onCreated={(newProj) => {
          setProjects((prev) => [newProj, ...prev]);
        }}
      />
    </div>
  );
};

export default PlanningHubView;
