import React, { useState, useEffect } from 'react';
import {
  Layers,
  ShieldAlert,
  BarChart3,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Plus
} from 'lucide-react';
import { CharterDashboard } from './CharterDashboard';
import { ExecutionMatrixTable } from './ExecutionMatrixTable';
import { HazardWarningModule } from './HazardWarningModule';
import { ProvisionCharterSlideOver } from './ProvisionCharterSlideOver';
import { useTranslation } from 'react-i18next';
import { erpApi } from '../services/api';
import {
  ProjectCharterItem,
  ExecutionTaskItem,
  StrategicHazardItem
} from './planningTypes';
import { Upload as BulkUploadIcon, FolderKanban } from 'lucide-react';
import { BulkImportModal } from './BulkImportModal';
import { PlanningHubView } from '../views/PlanningHubView';

export const PlanningDepartmentView: React.FC = () => {
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const [charters, setCharters] = useState<ProjectCharterItem[]>([]);
  const [selectedCharterId, setSelectedCharterId] = useState<string>('');
  const [currentTasks, setCurrentTasks] = useState<ExecutionTaskItem[]>([]);
  const [allHazards, setAllHazards] = useState<StrategicHazardItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Active view tab
  const [activeTab, setActiveTab] = useState<'CORE_SPINE' | 'OVERVIEW' | 'MATRIX' | 'HAZARDS'>('OVERVIEW');

  // Slide-over modal states
  const [hazardModalOpen, setHazardModalOpen] = useState(false);
  const [targetTaskForHazard, setTargetTaskForHazard] = useState<ExecutionTaskItem | null>(null);
  const [provisionSlideOverOpen, setProvisionSlideOverOpen] = useState(false);

  const fetchCharters = async () => {
    try {
      setLoading(true);
      setError('');
      let data: any = null;
      try {
        data = await erpApi.getProjectCharters();
      } catch {
        const res = await fetch('/api/tenant/planning/charters');
        if (!res.ok) throw new Error('Failed to fetch project charters');
        data = await res.json();
      }
      const charterList: ProjectCharterItem[] = Array.isArray(data) ? data : (data?.charters || []);
      setCharters(charterList);

      if (charterList && charterList.length > 0) {
        const activeId = selectedCharterId || charterList[0].id;
        setSelectedCharterId(activeId);
        fetchCharterDetails(activeId);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading planning data');
      setLoading(false);
    }
  };

  const fetchCharterDetails = async (charterId: string) => {
    try {
      let data: any = null;
      try {
        data = await erpApi.getProjectCharterDetails(charterId);
      } catch {
        const res = await fetch(`/api/tenant/planning/charters/${charterId}`);
        if (!res.ok) throw new Error('Failed to fetch charter details');
        data = await res.json();
      }
      setCurrentTasks(data?.tasks || []);

      // Extract all hazards across tasks
      const hazards: StrategicHazardItem[] = [];
      (data?.tasks || []).forEach((t: any) => {
        if (t.hazards && Array.isArray(t.hazards)) {
          hazards.push(...t.hazards);
        }
      });
      setAllHazards(hazards);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCharters();
  }, []);

  const handleSelectCharter = (id: string) => {
    setSelectedCharterId(id);
    fetchCharterDetails(id);
  };

  const handleOpenHazardModal = (task?: ExecutionTaskItem) => {
    setTargetTaskForHazard(task || null);
    setHazardModalOpen(true);
  };

  const handleDataRefresh = () => {
    if (selectedCharterId) {
      fetchCharterDetails(selectedCharterId);
    }
    fetchCharters();
  };

  return (
    <div className="min-h-dvh erp-viewport-root bg-slate-950 text-slate-100 p-6 md:p-8 space-y-6">
      {/* Top Navigation & Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold rounded-md uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {t('planning.coreOpsArch', 'Core Operations Architecture')}
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400 font-mono">{t('planning.rlsScoped', 'Row-Level Security Scoped')}</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Layers className="w-8 h-8 text-blue-500" />
            {t('planning.title')}
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            {t('planning.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
<button
            type="button"
            id="bulk-import-btn"
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <BulkUploadIcon className="h-3.5 w-3.5" />
            <span>{isAr ? 'استيراد جماعي (.xlsx)' : 'Bulk Import (.xlsx)'}</span>
          </button>
          <button
            onClick={handleDataRefresh}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors"
            title={t('planning.refreshTooltip', 'Refresh planning telemetry')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          <button
            onClick={() => setProvisionSlideOverOpen(true)}
            className="px-4 py-2 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center gap-2 cursor-pointer"
            id="provision-charter-header-btn"
          >
            <Plus className="w-4 h-4" />
            <span>{t('planning.provisionBtn', 'إضافة ميثاق جديد +')}</span>
          </button>

          <button
            onClick={() => handleOpenHazardModal()}
            className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/10 flex items-center gap-2"
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            {t('planning.riskCockpit')} ({allHazards.filter((h) => h.mitigation_status !== 'MITIGATED').length})
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('CORE_SPINE')}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === 'CORE_SPINE'
              ? 'text-indigo-400 border-b-2 border-indigo-500 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          {isAr ? 'العمود الفقري للمشاريع (Core Projects Spine)' : 'Core Projects Spine (WBS)'}
        </button>

        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === 'OVERVIEW'
              ? 'text-blue-400 border-b-2 border-blue-500 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          {t('planning.tier1')}
        </button>

        <button
          onClick={() => setActiveTab('MATRIX')}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === 'MATRIX'
              ? 'text-blue-400 border-b-2 border-blue-500 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          {t('planning.tier2')} ({currentTasks.length})
        </button>

        <button
          onClick={() => setActiveTab('HAZARDS')}
          className={`pb-3 transition-colors flex items-center gap-2 ${
            activeTab === 'HAZARDS'
              ? 'text-blue-400 border-b-2 border-blue-500 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          {t('planning.tier3')} ({allHazards.length})
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === 'CORE_SPINE' && <PlanningHubView />}

      {activeTab === 'OVERVIEW' && (
        <div className="space-y-8">
          <PlanningHubView />
          <CharterDashboard
            charters={charters}
            selectedCharterId={selectedCharterId}
            onSelectCharter={handleSelectCharter}
            onCharterCreated={(newCharter) => {
              if (newCharter?.id) {
                setSelectedCharterId(newCharter.id);
              }
              handleDataRefresh();
            }}
            onOpenProvisionModal={() => setProvisionSlideOverOpen(true)}
          />
        </div>
      )}

      {activeTab === 'MATRIX' && (
        <ExecutionMatrixTable
          tasks={currentTasks}
          charterId={selectedCharterId}
          onTaskUpdated={handleDataRefresh}
          onOpenHazardModal={handleOpenHazardModal}
        />
      )}

      {activeTab === 'HAZARDS' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {t('planning.viewingHazards', 'Viewing all proactive strategic hazards across active execution tasks.')}
            </span>
            <button
              onClick={() => handleOpenHazardModal()}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold"
            >
              {t('planning.openFullHazard', 'Open Full Hazard Slide-Over')}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allHazards.map((h) => (
              <div key={h.id} className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-400">
                    <bdi>{h.severity}</bdi> {t('planning.severity', 'SEVERITY')}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    <bdi>{h.mitigation_status}</bdi>
                  </span>
                </div>
                <p className="text-sm font-semibold text-white">{h.desired_outcome}</p>
                <p className="text-xs text-slate-400">{h.potential_hazard_description}</p>
                <div className="pt-2 border-t border-slate-800 text-xs text-slate-500">
                  {t('planning.planLabel', 'Plan:')} {h.mitigation_plan || t('planning.planPending', 'Pending mitigation plan formulation')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slide-over Hazard Warning Module */}
      <HazardWarningModule
        isOpen={hazardModalOpen}
        onClose={() => setHazardModalOpen(false)}
        targetTask={targetTaskForHazard}
        hazards={allHazards}
        onHazardCreatedOrUpdated={handleDataRefresh}
      />

      {/* Slide-over Provision Charter Module */}
      <ProvisionCharterSlideOver
        isOpen={provisionSlideOverOpen}
        onClose={() => setProvisionSlideOverOpen(false)}
        onCharterCreated={(newCharter) => {
          if (newCharter?.id) {
            setSelectedCharterId(newCharter.id);
          }
          handleDataRefresh();
        }}
      />
      <BulkImportModal isOpen={isBulkImportOpen} onClose={() => setIsBulkImportOpen(false)} defaultCategory="operations" />
    </div>
  );
};
