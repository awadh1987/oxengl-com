import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  Plus,
  ShieldCheck,
  X
} from 'lucide-react';
import { ExecutionTaskItem, StrategicHazardItem } from './planningTypes';

interface HazardWarningModuleProps {
  isOpen: boolean;
  onClose: () => void;
  targetTask?: ExecutionTaskItem | null;
  hazards: StrategicHazardItem[];
  onHazardCreatedOrUpdated: () => void;
}

export const HazardWarningModule: React.FC<HazardWarningModuleProps> = ({
  isOpen,
  onClose,
  targetTask,
  hazards,
  onHazardCreatedOrUpdated,
}) => {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [hazardDesc, setHazardDesc] = useState('');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'MITIGATED'>('ACTIVE');

  // Mitigation edit state
  const [editingHazardId, setEditingHazardId] = useState<string | null>(null);
  const [editingMitigationPlan, setEditingMitigationPlan] = useState('');
  const [editingStatus, setEditingStatus] = useState<'IDENTIFIED' | 'IN_PROGRESS' | 'MITIGATED'>('IN_PROGRESS');

  if (!isOpen) return null;

  const relevantHazards = targetTask
    ? hazards.filter((h) => h.execution_task_id === targetTask.id)
    : hazards;

  const displayedHazards = relevantHazards.filter((h) => {
    if (activeTab === 'ACTIVE') return h.mitigation_status !== 'MITIGATED';
    if (activeTab === 'MITIGATED') return h.mitigation_status === 'MITIGATED';
    return true;
  });

  const handleCreateHazard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetTask?.id || !desiredOutcome.trim() || !hazardDesc.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/tenant/planning/hazards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execution_task_id: targetTask.id,
          desired_outcome: desiredOutcome.trim(),
          potential_hazard_description: hazardDesc.trim(),
          severity,
          mitigation_plan: mitigationPlan.trim(),
        }),
      });

      if (res.ok) {
        setShowAddForm(false);
        setDesiredOutcome('');
        setHazardDesc('');
        setMitigationPlan('');
        onHazardCreatedOrUpdated();
      }
    } catch (err) {
      console.error('Failed to log hazard', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMitigation = async (hazardId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenant/planning/hazards/${hazardId}/mitigate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mitigation_status: editingStatus,
          mitigation_plan: editingMitigationPlan.trim(),
        }),
      });

      if (res.ok) {
        setEditingHazardId(null);
        onHazardCreatedOrUpdated();
      }
    } catch (err) {
      console.error('Failed to update mitigation', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-sm animate-fade-in flex justify-end">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-full sm:max-w-2xl h-full h-dvh shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold rounded-md uppercase whitespace-nowrap shrink-0">
                {t('planning.tier3RiskTracker', 'Tier 3 Risk Tracker')}
              </span>
              <span className="text-xs text-slate-400">
                {targetTask ? `Linked: ${targetTask.task_name}` : 'Platform Scope'}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-white flex flex-wrap items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              <span>{t('planning.cockpitTitle', 'Strategic Hazards & Mitigation Cockpit')}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Banner / Filter Tabs */}
        <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <button
              onClick={() => setActiveTab('ACTIVE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'ACTIVE'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('planning.activeHazardsTab', 'Active Hazards')} ({relevantHazards.filter((h) => h.mitigation_status !== 'MITIGATED').length})
            </button>
            <button
              onClick={() => setActiveTab('MITIGATED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'MITIGATED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('planning.mitigatedTab', 'Mitigated')} ({relevantHazards.filter((h) => h.mitigation_status === 'MITIGATED').length})
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'ALL'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('planning.allRecordsTab', 'All Records')} ({relevantHazards.length})
            </button>
          </div>

          {targetTask && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> {t('planning.logHazard', 'Log Hazard')}
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Add Hazard Form */}
          {showAddForm && targetTask && (
            <form
              onSubmit={handleCreateHazard}
              className="p-5 bg-slate-950/60 rounded-2xl border border-blue-500/30 space-y-3.5 shadow-xl"
            >
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Log Proactive Strategic Hazard
              </h4>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Desired Outcome *</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: تصريح تشغيلي من هيئة الغذاء والدواء بدون مخالفات' : 'e.g. Unconditional SFDA operating permit without citations'}
                  value={desiredOutcome}
                  onChange={(e) => setDesiredOutcome(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Potential Hazard Description *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder={isAr ? 'وصف أوجه القصور أو الاختناقات أو المخاطر البيئية / التنظيمية...' : 'Describe failure modes, bottlenecks, or adverse environmental/regulatory risks...'}
                  value={hazardDesc}
                  onChange={(e) => setHazardDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Severity</label>
                  <select
                    value={severity}
                    onChange={(e: any) => setSeverity(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Mitigation Plan</label>
                  <input
                    type="text"
                    placeholder={isAr ? 'إجراءات وقائية...' : 'Preventive safeguards...'}
                    value={mitigationPlan}
                    onChange={(e) => setMitigationPlan(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {submitting ? 'Logging...' : 'Save Strategic Hazard'}
                </button>
              </div>
            </form>
          )}

          {/* List of Hazards */}
          {displayedHazards.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500/40" />
              <p className="text-sm font-medium">No hazards in this category.</p>
              <p className="text-xs text-slate-600">All associated execution milestones have mitigated risk profiles.</p>
            </div>
          ) : (
            displayedHazards.map((hazard) => {
              const isMitigated = hazard.mitigation_status === 'MITIGATED';
              const isEditing = editingHazardId === hazard.id;

              return (
                <div
                  key={hazard.id}
                  className={`p-5 rounded-2xl border transition-all space-y-3.5 ${
                    isMitigated
                      ? 'bg-slate-950/40 border-slate-800'
                      : hazard.severity === 'CRITICAL'
                      ? 'bg-rose-950/20 border-rose-800/40'
                      : 'bg-amber-950/20 border-amber-800/40'
                  }`}
                >
                  {/* Top Bar: Severity & Status Badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-black rounded-md border ${
                          hazard.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : hazard.severity === 'HIGH'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                        }`}
                      >
                        {hazard.severity} SEVERITY
                      </span>

                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${
                          isMitigated
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {hazard.mitigation_status}
                      </span>
                    </div>

                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(hazard.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Desired Outcome vs Hazard Description */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-emerald-400 uppercase tracking-wider block mb-0.5">
                        Target Desired Outcome:
                      </span>
                      <p className="text-slate-200 font-medium">{hazard.desired_outcome}</p>
                    </div>

                    <div>
                      <span className="font-semibold text-amber-400 uppercase tracking-wider block mb-0.5">
                        Potential Hazard / Failure Mode:
                      </span>
                      <p className="text-slate-300 leading-relaxed">{hazard.potential_hazard_description}</p>
                    </div>
                  </div>

                  {/* Mitigation Plan & Action Workflow */}
                  <div className="pt-3 border-t border-slate-800/60">
                    {isEditing ? (
                      <div className="space-y-3 bg-slate-900/90 p-3.5 rounded-xl border border-slate-700">
                        <label className="block text-xs font-semibold text-slate-200">
                          Update Mitigation Strategy
                        </label>
                        <textarea
                          rows={2}
                          value={editingMitigationPlan}
                          onChange={(e) => setEditingMitigationPlan(e.target.value)}
                          placeholder={isAr ? 'خطة التصحيح والمعالجة...' : 'Action plan to mitigate...'}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />

                        <div className="flex items-center justify-between">
                          <select
                            value={editingStatus}
                            onChange={(e: any) => setEditingStatus(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                          >
                            <option value="IDENTIFIED">IDENTIFIED</option>
                            <option value="IN_PROGRESS">IN_PROGRESS</option>
                            <option value="MITIGATED">MITIGATED (RESOLVED)</option>
                          </select>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingHazardId(null)}
                              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleUpdateMitigation(hazard.id)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                            >
                              Save Mitigation
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs">
                          <span className="text-slate-500 block mb-0.5">Mitigation Action Plan:</span>
                          <p className="text-slate-300 italic">
                            {hazard.mitigation_plan || 'No explicit mitigation registered yet.'}
                          </p>
                        </div>

                        <button
                          onClick={() => {
                            setEditingHazardId(hazard.id);
                            setEditingMitigationPlan(hazard.mitigation_plan || '');
                            setEditingStatus(
                              hazard.mitigation_status === 'MITIGATED'
                                ? 'MITIGATED'
                                : 'IN_PROGRESS'
                            );
                          }}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex-shrink-0"
                        >
                          {isMitigated ? 'Edit Details' : 'Mitigate Risk'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
