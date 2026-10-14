import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldAlert,
  User,
  DollarSign,
  Briefcase
} from 'lucide-react';
import { ExecutionTaskItem } from './planningTypes';
import { useApp } from '../context/AppContext';

interface ExecutionMatrixTableProps {
  tasks: ExecutionTaskItem[];
  charterId: string;
  onTaskUpdated: () => void;
  onOpenHazardModal: (task: ExecutionTaskItem) => void;
}

export const ExecutionMatrixTable: React.FC<ExecutionMatrixTableProps> = ({
  tasks,
  charterId,
  onTaskUpdated,
  onOpenHazardModal,
}) => {
  const { language } = useApp();
  const isAr = language === 'ar';
  const { t } = useTranslation();
  const [selectedPhase, setSelectedPhase] = useState<string>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  // Batch Task Modal State
  const [batchRows, setBatchRows] = useState([
    {
      task_name: '',
      phase: 'Execution',
      department: 'Fleet Operations',
      assigned_user_name: 'Eng. Faisal Al-Otaibi',
      priority: 'MEDIUM',
      planned_hours: '40',
      task_cost: '25000',
    },
  ]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchError, setBatchError] = useState('');

  const phases = ['Initiation', 'Planning', 'Execution', 'Monitoring', 'Closure'];
  const departments = ['Fleet Operations', 'Logistics', 'Warehouse', 'Legal & Compliance', 'Finance', 'Human Resources'];

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const filteredTasks = safeTasks.filter((t) => {
    const matchesPhase = selectedPhase === 'ALL' || t?.phase === selectedPhase;
    const matchesDept = selectedDept === 'ALL' || t?.department === selectedDept;
    return matchesPhase && matchesDept;
  });

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    setUpdatingTaskId(taskId);
    try {
      const res = await fetch(`/api/tenant/planning/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        onTaskUpdated();
      }
    } catch (err) {
      console.error('Failed to update task status', err);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleAddBatchRow = () => {
    setBatchRows([
      ...(batchRows || []),
      {
        task_name: '',
        phase: 'Execution',
        department: 'Fleet Operations',
        assigned_user_name: 'Eng. Faisal Al-Otaibi',
        priority: 'MEDIUM',
        planned_hours: '40',
        task_cost: '25000',
      },
    ]);
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = (batchRows || []).filter((r) => r?.task_name?.trim());
    if ((validRows?.length ?? 0) === 0) {
      setBatchError('Please provide at least one task with a name.');
      return;
    }

    setBatchSubmitting(true);
    setBatchError('');

    try {
      const res = await fetch('/api/tenant/planning/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charter_id: charterId,
          tasks: validRows.map((r) => ({
            task_name: r.task_name.trim(),
            phase: r.phase,
            department: r.department,
            assigned_user_name: r.assigned_user_name,
            priority: r.priority,
            planned_hours: parseFloat(r.planned_hours) || 0,
            task_cost: parseFloat(r.task_cost) || 0,
            materials_required: [],
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to batch create tasks');
      }

      setShowBatchModal(false);
      setBatchRows([
        {
          task_name: '',
          phase: 'Execution',
          department: 'Fleet Operations',
          assigned_user_name: 'Eng. Faisal Al-Otaibi',
          priority: 'MEDIUM',
          planned_hours: '40',
          task_cost: '25000',
        },
      ]);
      onTaskUpdated();
    } catch (err: any) {
      setBatchError(err.message || 'Error creating tasks');
    } finally {
      setBatchSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Bar: Filters & Batch Creation Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3 text-sky-400" /> {t('planning.filterMatrix', 'Filter:')}
          </span>

          {/* Phase Filter */}
          <select
            value={selectedPhase}
            onChange={(e) => setSelectedPhase(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="ALL">{t('planning.allPhases', 'All Phases')} ({safeTasks?.length ?? 0})</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="ALL">{t('planning.allDepartments', 'All Departments')}</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowBatchModal(true)}
          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> {t('planning.batchAddTasks', 'Batch Add Tasks')}
        </button>
      </div>

      {/* High-Density Execution Matrix Data Table */}
      <div className="neo-data-viewport overflow-x-auto rounded-lg border border-slate-800/80 bg-slate-900/60 shadow-xs">
        <table className="neo-grid-table w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <th className="py-1 px-2">{t('planning.taskNameScope', 'Task Name & Scope')}</th>
              <th className="py-1 px-2">{t('planning.phaseDept', 'Phase & Dept')}</th>
              <th className="py-1 px-2">{t('planning.workloadCost', 'Workload / Cost')}</th>
              <th className="py-1 px-2">{t('planning.assignedPersonnel', 'Assigned Personnel')}</th>
              <th className="py-1 px-2">{t('planning.priority', 'Priority')}</th>
              <th className="py-1 px-2">{t('planning.status', 'Status')}</th>
              <th className="py-1 px-2 text-right">{t('planning.hazardTracker', 'Hazard Tracker')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {(filteredTasks?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                  {t('planning.noTasks', 'No execution tasks matching selected criteria.')}
                </td>
              </tr>
            ) : (
              (filteredTasks || []).map((task) => {
                const activeHazards = Array.isArray(task?.hazards)
                  ? task.hazards.filter((h) => h?.mitigation_status !== 'MITIGATED')
                  : [];

                return (
                  <tr
                    key={task.id}
                    className="hover:bg-amber-500/10 transition-colors group"
                  >
                    {/* Task Name */}
                    <td className="py-0.5 px-2">
                      <div className="font-bold text-white group-hover:text-blue-400 transition-colors text-[11px]">
                        {task.task_name}
                      </div>
                      {Array.isArray(task?.materials_required) && (task.materials_required?.length ?? 0) > 0 && (
                        <div className="text-[9.5px] text-slate-500 flex items-center gap-1">
                          <span className="font-mono text-slate-400">{t('planning.materialsLabel', 'Mat:')}</span>{' '}
                          {task.materials_required.join(', ')}
                        </div>
                      )}
                    </td>

                    {/* Phase & Department */}
                    <td className="py-0.5 px-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-block px-1.5 py-0.2 bg-slate-800 text-slate-300 text-[9.5px] font-bold rounded border border-slate-700/60 whitespace-nowrap shrink-0">
                          {task.phase}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 whitespace-nowrap shrink-0">
                          <Briefcase className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                          {task.department}
                        </span>
                      </div>
                    </td>

                    {/* Workload / Cost */}
                    <td className="py-0.5 px-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[10px] font-semibold text-slate-200 flex items-center gap-0.5 neo-cell-mono whitespace-nowrap shrink-0">
                          <Clock className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                          <bdi>{task.planned_hours}h</bdi>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-0.5 neo-cell-mono whitespace-nowrap shrink-0">
                          <DollarSign className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                          <bdi>{Number(task.task_cost).toLocaleString()} SAR</bdi>
                        </div>
                      </div>
                    </td>

                    {/* Assigned Personnel */}
                    <td className="py-0.5 px-2">
                      <div className="text-[10.5px] font-medium text-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        {task.assigned_user_name || t('planning.unassigned', 'Unassigned')}
                      </div>
                    </td>

                    {/* Priority Badge */}
                    <td className="py-0.5 px-2">
                      <span
                        className={`px-1.5 py-0.2 text-[9px] font-bold rounded border whitespace-nowrap shrink-0 ${
                          task.priority === 'CRITICAL'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : task.priority === 'HIGH'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>

                    {/* Inline Status Dropdown Editor */}
                    <td className="py-0.5 px-2">
                      <div className="relative inline-block">
                        <select
                          disabled={updatingTaskId === task.id}
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          className={`text-[9.5px] font-bold rounded px-1.5 py-0.5 border transition-all cursor-pointer focus:outline-none ${
                            task.status === 'COMPLETED'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : task.status === 'IN_PROGRESS'
                              ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                              : task.status === 'BLOCKED'
                              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="BLOCKED">BLOCKED</option>
                          <option value="COMPLETED">COMPLETED</option>
                        </select>
                      </div>
                    </td>

                    {/* Hazard Tracker Link */}
                    <td className="py-0.5 px-2 text-right">
                      <button
                        onClick={() => onOpenHazardModal(task)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all ${
                          (activeHazards?.length ?? 0) > 0
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                            : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>
                          {(activeHazards?.length ?? 0) > 0
                            ? t('planning.activeCount', { count: activeHazards?.length ?? 0, defaultValue: `${activeHazards?.length ?? 0} Active` })
                            : t('planning.logRisk', 'Risk')}
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Batch Create Tasks Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-500" />
                Batch Create Execution Tasks (Tier 2 Matrix)
              </h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {batchError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {batchError}
              </div>
            )}

            <form onSubmit={handleBatchSubmit} className="space-y-4">
              <div className="space-y-3">
                {(batchRows || []).map((row, index) => (
                  <div
                    key={index}
                    className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/60 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                      <span>Row #{index + 1}</span>
                      {(batchRows?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => setBatchRows((batchRows || []).filter((_, i) => i !== index))}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Task Name *</label>
                        <input
                          type="text"
                          required
                          placeholder={isAr ? 'مثال: تركيب أجهزة تتبع IoT' : 'e.g. Install IoT Telematics Sensors'}
                          value={row.task_name}
                          onChange={(e) => {
                            const updated = [...batchRows];
                            updated[index].task_name = e.target.value;
                            setBatchRows(updated);
                          }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-300 mb-1">Phase</label>
                          <select
                            value={row.phase}
                            onChange={(e) => {
                              const updated = [...batchRows];
                              updated[index].phase = e.target.value;
                              setBatchRows(updated);
                            }}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            {phases.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-300 mb-1">Department</label>
                          <select
                            value={row.department}
                            onChange={(e) => {
                              const updated = [...batchRows];
                              updated[index].department = e.target.value;
                              setBatchRows(updated);
                            }}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            {departments.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Planned Hours</label>
                        <input
                          type="number"
                          value={row.planned_hours}
                          onChange={(e) => {
                            const updated = [...batchRows];
                            updated[index].planned_hours = e.target.value;
                            setBatchRows(updated);
                          }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Cost (SAR)</label>
                        <input
                          type="number"
                          value={row.task_cost}
                          onChange={(e) => {
                            const updated = [...batchRows];
                            updated[index].task_cost = e.target.value;
                            setBatchRows(updated);
                          }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Priority</label>
                        <select
                          value={row.priority}
                          onChange={(e) => {
                            const updated = [...batchRows];
                            updated[index].priority = e.target.value;
                            setBatchRows(updated);
                          }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                          <option value="CRITICAL">CRITICAL</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleAddBatchRow}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Another Row
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={batchSubmitting}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                  >
                    {batchSubmitting ? 'Inserting Tasks...' : `Commit ${batchRows?.length ?? 0} Tasks`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
