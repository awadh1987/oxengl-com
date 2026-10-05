import React from 'react';
import { WorkflowAutomationCanvas } from '../components/design-system/WorkflowAutomationCanvas';
import { IsolationTelemetryBadge } from '../components/design-system/IsolationTelemetryBadge';
import { BentoCard } from '../components/design-system/BentoCard';
import { Sparkles, ShieldCheck, Zap, GitBranch, Cpu, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const WorkflowAutomationView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 pb-12" id="workflow-automation-view">
      {/* Top Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/15 px-3 py-0.5 text-xs font-bold text-orange-400 dark:text-orange-300">
              <Zap className="h-3.5 w-3.5" />
              {t('workflows.badgeLabel', 'Business Logic Automation Engine')}
            </span>
            <IsolationTelemetryBadge variant="pill" />
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
            {t('workflows.title', 'Workflow & Process Automation Builder')}
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 sm:text-sm">
            {t('workflows.subtitle', 'Configure cross-departmental approval chains, real-time dispatch triggers, and automated ZATCA tax invoice generation.')}
          </p>
          <p className="mt-2 max-w-2xl rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-800/60 dark:bg-indigo-950/30 dark:text-indigo-200">
            {t('workflows.sandboxNote', 'Active architectural and workflow sandbox for designing tenant workspace processes.')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-slate-600 dark:text-slate-400 sm:inline-block">
            {t('workflows.engineLatency', 'Engine Latency: ')}
            <b className="text-emerald-600 dark:text-emerald-400">12ms</b>
          </span>
        </div>
      </div>

      {/* Main Full-Screen Node Automation Canvas */}
      <WorkflowAutomationCanvas />

      {/* Capabilities & Automation Rules Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <BentoCard
          title={t('workflows.card1Title', 'Trip Dispatch to Scale Ticket')}
          subtitle={t('workflows.card1Subtitle', 'Real-time Logistics Sync')}
          icon={GitBranch}
        >
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {t('workflows.card1Desc', 'When a haulage truck arrives at a partner quarry, tare weight and destination are locked automatically. Deviation triggers audit alerts.')}
          </p>
        </BentoCard>

        <BentoCard
          title={t('workflows.card2Title', 'Scale Ticket to ZATCA Tax Invoice')}
          subtitle={t('workflows.card2Subtitle', 'Phase-2 Cryptographic Auto-Issue')}
          icon={ShieldCheck}
          glow
        >
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {t('workflows.card2Desc', 'Upon gross weight verification, net tonnage is priced using active customer rate sheets and submitted for ZATCA Phase-2 cryptographic signing.')}
          </p>
        </BentoCard>

        <BentoCard
          title={t('workflows.card3Title', 'Payment Clearance & Ledger Posting')}
          subtitle={t('workflows.card3Subtitle', 'Autonomous Dual-Entry Reconciliation')}
          icon={Cpu}
        >
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {t('workflows.card3Desc', 'Financial vouchers automatically balance quarry supplier payables and transporter net settlements with verified bank transfer references.')}
          </p>
        </BentoCard>
      </div>
    </div>
  );
};

