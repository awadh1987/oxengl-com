import React, { useState } from 'react';
import {
  X,
  Layers,
  Calendar,
  DollarSign,
  User,
  Target,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { erpApi } from '../services/api';

interface MilestoneGoal {
  id: string;
  goal: string;
  target_date: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'ACHIEVED';
}

interface ProvisionCharterSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  onCharterCreated: (newCharter?: any) => void;
}

export const ProvisionCharterSlideOver: React.FC<ProvisionCharterSlideOverProps> = ({
  isOpen,
  onClose,
  onCharterCreated,
}) => {
  const { language, showToast } = useApp();
  const isAr = language === 'ar';

  const todayStr = new Date().toISOString().split('T')[0];
  const defaultEndStr = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [projectName, setProjectName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [totalBudget, setTotalBudget] = useState('1500000');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(defaultEndStr);
  const [scopeText, setScopeText] = useState('');
  const [onTimeKpi, setOnTimeKpi] = useState('98.5');
  const [costEfficiencyKpi, setCostEfficiencyKpi] = useState('1.05');

  const [milestones, setMilestones] = useState<MilestoneGoal[]>([
    {
      id: 'm-1',
      goal: isAr ? 'استكمال مسوحات الموقع وتجهيز سلاسل الإمداد اللوجستية' : 'Site surveys & logistics cold-chain readiness',
      target_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'IN_PROGRESS',
    },
    {
      id: 'm-2',
      goal: isAr ? 'بدء عمليات الصب ومراقبة الجودة التكتيكية عبر رادار التتبع' : 'Pouring operations & tactical telemetry monitoring',
      target_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'PENDING',
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddMilestone = () => {
    const newId = `m-${Date.now()}`;
    setMilestones([
      ...milestones,
      {
        id: newId,
        goal: '',
        target_date: endDate,
        status: 'PENDING',
      },
    ]);
  };

  const handleUpdateMilestone = (id: string, field: keyof MilestoneGoal, value: string) => {
    setMilestones(
      milestones.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const handleRemoveMilestone = (id: string) => {
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!projectName.trim()) {
      setError(isAr ? 'يرجى إدخال اسم المشروع / الميثاق' : 'Charter / Project Name is required');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError(isAr ? 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء' : 'End date must be after start date');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        project_name: projectName.trim(),
        manager_name: managerName.trim() || (isAr ? 'مدير العمليات التنفيذي' : 'Executive Operations Lead'),
        total_budget: parseFloat(totalBudget) || 0,
        start_date: startDate,
        end_date: endDate,
        scope_of_work_text: scopeText.trim() || (isAr ? 'الميثاق التشغيلي وسلسلة التوريد المتكاملة للمشروع' : 'Operational project charter & integrated supply chain'),
        smart_goals: milestones.filter((m) => m.goal.trim().length > 0),
        kpis_json: {
          on_time_delivery_target_pct: parseFloat(onTimeKpi) || 98.5,
          cost_efficiency_index: parseFloat(costEfficiencyKpi) || 1.05,
        },
        status: 'ACTIVE',
      };

      const res = await erpApi.createProjectCharter(payload);

      showToast(
        isAr
          ? `تم إنشاء ميثاق المشروع "${payload.project_name}" وتفعيله بنجاح`
          : `Project charter "${payload.project_name}" provisioned and activated successfully`,
        'success'
      );

      onCharterCreated(res);
      onClose();
    } catch (err: any) {
      console.error('Failed to provision project charter:', err);
      const errMsg = err?.message || (isAr ? 'فشل إنشاء ميثاق المشروع' : 'Failed to provision charter');
      setError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-md animate-fade-in">
      {/* Backdrop clickable */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-full sm:max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col justify-between h-full h-dvh z-10 overflow-hidden">
        {/* Accent top gradient line */}
        <div className="h-1.5 w-full bg-linear-to-r from-blue-500 via-indigo-500 to-cyan-500 shrink-0" />

        {/* Slide-Over Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                <h2 className="text-lg font-black text-white">
                  {isAr ? 'إضافة ميثاق جديد +' : 'Provision New Charter +'}
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 whitespace-nowrap shrink-0">
                  Tier 1 Strategic
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? 'اعتماد الميثاق الاستراتيجي وتحديد الميزانية والمراحل التنفيذية ومؤشرات الأداء'
                  : 'Commission Tier 1 project charter, assign budget, and configure milestones'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="provision-charter-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 animate-shake">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Project Name & Executive Lead */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              {isAr ? 'الهوية المؤسسية والقيادة' : 'Charter Identity & Leadership'}
            </h3>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                {isAr ? 'اسم المشروع / الميثاق الاستراتيجي *' : 'Project / Charter Title *'}
              </label>
              <input
                type="text"
                required
                placeholder={
                  isAr
                    ? 'مثال: مشروع توريد خرسانة أبراج كافد المركزية - المرحلة 2'
                    : 'e.g. KAFD Central Towers High-Performance Concrete Supply - Phase 2'
                }
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {isAr ? 'المدير التنفيذي / المسؤول' : 'Executive Lead / Manager'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'د. فهد الشمري' : 'Dr. Fahad Al-Shammari'}
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                  {isAr ? 'الميزانية المعتمدة (ريال سعودي)' : 'Total Allocated Budget (SAR)'}
                </label>
                <input
                  type="number"
                  step="1000"
                  value={totalBudget}
                  onChange={(e) => setTotalBudget(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Timeline & Schedule */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-400" />
              {isAr ? 'الجدول الزمني المعتمد' : 'Project Schedule & Duration'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'تاريخ انطلاق المشروع' : 'Charter Start Date'}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-indigo-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'تاريخ التسليم النهائي' : 'Target Completion Date'}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-indigo-500 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Scope of Work */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-slate-300">
              {isAr ? 'نطاق العمل الاستراتيجي والمخرجات المستهدفة' : 'Scope of Work Narrative'}
            </label>
            <textarea
              rows={3}
              placeholder={
                isAr
                  ? 'وصف متكامل لنطاق الأعمال والمخرجات والمتطلبات اللوجستية للمشروع...'
                  : 'Detailed narrative of charter deliverables, scope constraints, and milestones...'
              }
              value={scopeText}
              onChange={(e) => setScopeText(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white placeholder-slate-600 focus:border-blue-500 outline-hidden resize-none"
            />
          </div>

          {/* Milestones & Strategic Goals */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Target className="h-4 w-4 text-cyan-400" />
                {isAr ? 'المراحل التنفيذية (SMART Milestones)' : 'Execution Milestones'}
              </h3>
              <button
                type="button"
                onClick={handleAddMilestone}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[11px] font-bold text-blue-300 hover:bg-blue-500/20 transition"
              >
                <Plus className="h-3 w-3" />
                <span>{isAr ? 'إضافة مرحلة +' : '+ Add Milestone'}</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {milestones.map((m, index) => (
                <div
                  key={m.id}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      {isAr ? `المرحلة #${index + 1}` : `Milestone #${index + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMilestone(m.id)}
                      className="text-slate-500 hover:text-rose-400 transition"
                      title={isAr ? 'حذف' : 'Remove'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder={isAr ? 'هدف أو مخرج المرحلة...' : 'Milestone goal / deliverable...'}
                    value={m.goal}
                    onChange={(e) => handleUpdateMilestone(m.id, 'goal', e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 outline-hidden"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={m.target_date}
                      onChange={(e) => handleUpdateMilestone(m.id, 'target_date', e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-300 outline-hidden"
                    />
                    <select
                      value={m.status}
                      onChange={(e) => handleUpdateMilestone(m.id, 'status', e.target.value as any)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 outline-hidden"
                    >
                      <option value="PENDING">{isAr ? 'قيد الانتظار' : 'Pending'}</option>
                      <option value="IN_PROGRESS">{isAr ? 'قيد التنفيذ' : 'In Progress'}</option>
                      <option value="ACHIEVED">{isAr ? 'مكتمل' : 'Achieved'}</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance KPI Targets */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              {isAr ? 'مؤشرات الأداء المستهدفة (KPI Targets)' : 'Target Performance KPIs'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'نسبة الالتزام بالمواعيد (% On-Time)' : 'On-Time Delivery Target (%)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={onTimeKpi}
                  onChange={(e) => setOnTimeKpi(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {isAr ? 'مؤشر كفاءة التكلفة (Cost Index)' : 'Cost Efficiency Index'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={costEfficiencyKpi}
                  onChange={(e) => setCostEfficiencyKpi(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 outline-hidden"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Slide-over Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            form="provision-charter-form"
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-linear-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-xs font-black text-white transition shadow-lg shadow-blue-950/50 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{isAr ? 'جاري الاعتماد والحفظ...' : 'Commissioning Charter...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>{isAr ? 'اعتماد وتفعيل الميثاق' : 'Commission & Activate Charter'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
