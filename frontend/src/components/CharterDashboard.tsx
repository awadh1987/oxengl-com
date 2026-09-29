import React, { useState } from 'react';
import {
  Calendar,
  DollarSign,
  Target,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BarChart3,
  Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProjectCharterItem } from './planningTypes';
import { erpApi } from '../services/api';

interface CharterDashboardProps {
  charters: ProjectCharterItem[];
  selectedCharterId: string;
  onSelectCharter: (id: string) => void;
  onCharterCreated: (newCharter?: any) => void;
  onOpenProvisionModal?: () => void;
}

export const CharterDashboard: React.FC<CharterDashboardProps> = ({
  charters,
  selectedCharterId,
  onSelectCharter,
  onCharterCreated,
  onOpenProvisionModal,
}) => {
  const { t } = useTranslation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [projectName, setProjectName] = useState('');
  const [managerName, setManagerName] = useState('Eng. Faisal Al-Otaibi');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [totalBudget, setTotalBudget] = useState('1250000');
  const [scopeText, setScopeText] = useState('');
  const [formError, setFormError] = useState('');

  const activeCharter = charters.find((c) => c.id === selectedCharterId) || charters[0];

  const handleCreateCharter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setFormError('Project name is required');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setFormError('End date must be after start date');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const payload = {
        project_name: projectName.trim(),
        manager_name: managerName.trim(),
        start_date: startDate,
        end_date: endDate,
        total_budget: parseFloat(totalBudget) || 0,
        scope_of_work_text: scopeText,
        smart_goals: [
          { id: 'g1', goal: 'Initial milestone phase deployment', target_date: endDate, status: 'PENDING' }
        ],
        kpis_json: {
          on_time_delivery_target_pct: 99.0,
          cost_efficiency_index: 1.05
        }
      };

      let newCharter: any = null;
      try {
        newCharter = await erpApi.createProjectCharter(payload);
      } catch {
        const res = await fetch('/api/tenant/planning/charters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create charter');
        }
        newCharter = await res.json();
      }

      setShowCreateModal(false);
      setProjectName('');
      setScopeText('');
      onCharterCreated(newCharter);
    } catch (err: any) {
      setFormError(err.message || 'Error provisioning charter');
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeCharter) {
    return (
      <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800">
        <Layers className="w-12 h-12 mx-auto text-blue-500 mb-3 opacity-80" />
        <h3 className="text-xl font-bold text-white mb-2">{t('planning.emptyTitle')}</h3>
        <p className="text-slate-400 max-w-md mx-auto mb-6 text-sm">
          {t('planning.emptyDesc')}
        </p>
        <button
          onClick={() => (onOpenProvisionModal ? onOpenProvisionModal() : setShowCreateModal(true))}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-blue-600/20 inline-flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> {t('planning.provisionBtn')}
        </button>
      </div>
    );
  }

  // Calculate timeline progress
  const startMs = new Date(activeCharter.start_date).getTime();
  const endMs = new Date(activeCharter.end_date).getTime();
  const nowMs = Date.now();
  const totalDuration = Math.max(1, endMs - startMs);
  const elapsed = Math.max(0, Math.min(totalDuration, nowMs - startMs));
  const timelineProgressPct = Math.round((elapsed / totalDuration) * 100);
  const daysRemaining = Math.max(0, Math.ceil((endMs - nowMs) / (1000 * 60 * 60 * 24)));

  const budget = activeCharter.total_budget || 0;
  const committed = activeCharter.committed_cost || 0;
  const burnRate = budget > 0 ? Math.min(100, Math.round((committed / budget) * 100)) : 0;
  const variance = budget - committed;

  return (
    <div className="space-y-6 px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto">
      {/* Top Header & Project Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold rounded-full uppercase tracking-wider">
              Tier 1 Strategic Plan
            </span>
            <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${
              activeCharter.status === 'ACTIVE'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              {activeCharter.status}
            </span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {activeCharter.project_name}
          </h2>
          <p className="text-slate-400 text-sm flex items-center gap-4">
            <span>Lead: <strong className="text-slate-200">{activeCharter.manager_name || 'Executive Lead'}</strong></span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              {activeCharter.start_date} → {activeCharter.end_date}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {charters.length > 1 && (
            <select
              value={selectedCharterId}
              onChange={(e) => onSelectCharter(e.target.value)}
              className="bg-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
            >
              {charters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.project_name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => (onOpenProvisionModal ? onOpenProvisionModal() : setShowCreateModal(true))}
            className="px-4 py-2 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center gap-2 cursor-pointer"
            id="charter-dashboard-top-provision-btn"
          >
            <Plus className="w-4 h-4" /> {t('planning.provisionBtn', 'Provision Charter')}
          </button>
        </div>
      </div>

      {/* KPI & Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Metric 1: Budget Health */}
        <div className="bg-slate-900/60 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Total Budget vs Committed</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black text-white">
              SAR {committed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Cap: SAR {budget.toLocaleString('en-US')}</span>
              <span className={variance >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {variance >= 0 ? `+SAR ${variance.toLocaleString()}` : `-SAR ${Math.abs(variance).toLocaleString()}`}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                burnRate > 90 ? 'bg-rose-500' : burnRate > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${burnRate}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Timeline Progress */}
        <div className="bg-slate-900/60 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Milestone Schedule</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black text-white">
              {timelineProgressPct}% <span className="text-sm font-normal text-slate-400">Elapsed</span>
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>{daysRemaining} Days Remaining</span>
              <span className="text-blue-400 font-semibold">{activeCharter.end_date}</span>
            </div>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, timelineProgressPct)}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Execution Matrix Progress */}
        <div className="bg-slate-900/60 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Execution Tasks</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black text-white">
              {activeCharter.completed_tasks || 0} / {activeCharter.total_tasks || 0}
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Completion Rate</span>
              <span className="text-indigo-400 font-bold">{activeCharter.completion_rate || 0}%</span>
            </div>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${activeCharter.completion_rate || 0}%` }}
            />
          </div>
        </div>

        {/* Metric 4: Risk & Hazard Tracker */}
        <div className="bg-slate-900/60 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Strategic Hazards</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black text-white">
              {activeCharter.active_hazards_count || 0}{' '}
              <span className="text-sm font-normal text-amber-400">Active</span>
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Mitigation Pipeline</span>
              <span className="text-slate-300">Tier 3 Linked</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${
              (activeCharter.active_hazards_count || 0) > 0 ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
            }`} />
            <span className="text-xs font-medium text-slate-300">
              {(activeCharter.active_hazards_count || 0) > 0 ? 'Requires Action' : 'All Clear'}
            </span>
          </div>
        </div>
      </div>

      {/* Scope of Work & SMART Goals Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-400" />
              Strategic SMART Goals & Target Delivery
            </h3>
            <span className="text-xs text-slate-400">
              {activeCharter.smart_goals?.length || 0} Defined Objectives
            </span>
          </div>

          <div className="space-y-3">
            {activeCharter.smart_goals && activeCharter.smart_goals.length > 0 ? (
              activeCharter.smart_goals.map((g, idx) => (
                <div
                  key={g.id || idx}
                  className="flex items-center justify-between p-3.5 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold flex items-center justify-center border border-blue-500/20">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{g.goal}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> Target Date: {g.target_date}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${
                    g.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {g.status || 'IN_PROGRESS'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 italic">No explicit SMART goals attached to this charter.</p>
            )}
          </div>

          {activeCharter.scope_of_work_text && (
            <div className="pt-4 border-t border-slate-800/80">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Scope of Work Narrative
              </h4>
              <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
                {activeCharter.scope_of_work_text}
              </p>
            </div>
          )}
        </div>

        {/* KPI Success Metrics Widget */}
        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            Key Performance Indicators (KPIs)
          </h3>

          <div className="space-y-3">
            <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-700/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-slate-400">On-Time Delivery Target</span>
                <span className="text-sm font-bold text-emerald-400">
                  {activeCharter.kpis_json?.on_time_delivery_target_pct || 99.4}%
                </span>
              </div>
              <p className="text-xs text-slate-500">Benchmark SLA for multi-depot fleet corridors</p>
            </div>

            <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-700/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-slate-400">Cost per Ton/Km Index</span>
                <span className="text-sm font-bold text-blue-400">
                  SAR {activeCharter.kpis_json?.cost_per_ton_km_sar || 0.18}
                </span>
              </div>
              <p className="text-xs text-slate-500">Standard fuel & asset amortization efficiency</p>
            </div>

            <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-700/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-slate-400">Fleet Utilization Target</span>
                <span className="text-sm font-bold text-indigo-400">
                  {activeCharter.kpis_json?.fleet_utilization_target_pct || 92.0}%
                </span>
              </div>
              <p className="text-xs text-slate-500">Active transit operational duty hours</p>
            </div>
          </div>
        </div>
      </div>

      {/* Provision Charter Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-500" />
                Provision New Project Charter (Tier 1)
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateCharter} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: إنشاء محطة لوجستية في المنطقة الشرقية' : 'e.g. Eastern Province Logistics Terminal Setup'}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Project Director / Lead</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Total Budget (SAR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={totalBudget}
                    onChange={(e) => setTotalBudget(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Scope of Work Narrative</label>
                <textarea
                  rows={3}
                  placeholder={isAr ? 'حدد المخرجات الرئيسية والمتطلبات التنظيمية والمعايير الفنية...' : 'Outline high-level deliverables, regulatory guidelines, and technical parameters...'}
                  value={scopeText}
                  onChange={(e) => setScopeText(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {submitting ? 'Provisioning...' : 'Provision Charter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
