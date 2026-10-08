import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Pause,
  Plus,
  Settings,
  Layers,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
  Truck,
  Scale,
  Receipt,
  Landmark,
  ArrowRight,
  Database,
  Sliders,
  X,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { TFunction } from 'i18next';

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  department: 'Logistics' | 'Finance' | 'Weighbridge' | 'ZATCA' | 'Audit';
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  x: number;
  y: number;
  status: 'active' | 'idle' | 'executing' | 'error';
  params: Record<string, string>;
}

export const getDepartmentLabel = (dept: string, t: TFunction): string => {
  const map: Record<string, string> = {
    Logistics: t('workflows.deptLogistics', 'Logistics'),
    Weighbridge: t('workflows.deptWeighbridge', 'Weighbridge'),
    ZATCA: t('workflows.deptZatca', 'ZATCA'),
    Finance: t('workflows.deptFinance', 'Finance'),
    Audit: t('workflows.deptAudit', 'Audit'),
  };
  return map[dept] || dept;
};

export const getNodeTypeLabel = (type: string, t: TFunction): string => {
  const map: Record<string, string> = {
    trigger: t('workflows.typeTrigger', 'TRIGGER'),
    condition: t('workflows.typeCondition', 'CONDITION'),
    action: t('workflows.typeAction', 'ACTION'),
  };
  return map[type] || type.toUpperCase();
};

const buildInitialNodes = (t: TFunction): WorkflowNode[] => [
  {
    id: 'node-1',
    type: 'trigger',
    department: 'Logistics',
    title: t('workflows.node1Title', 'Trip Dispatch Created'),
    subtitle: t('workflows.node1Subtitle', 'Triggered upon truck arrival at quarry'),
    icon: Truck,
    x: 60,
    y: 120,
    status: 'active',
    params: {
      [t('workflows.paramMinTonnage', 'Min Tonnage Threshold')]: '25.0 MT',
      [t('workflows.paramAutoFleet', 'Auto Fleet Allocation')]: t('workflows.valEnabled', 'Enabled'),
      [t('workflows.paramShrinkageCheck', 'Transporter Shrinkage Check')]: t('workflows.valActive', 'Active'),
    },
  },
  {
    id: 'node-2',
    type: 'action',
    department: 'Weighbridge',
    title: t('workflows.node2Title', 'Weighbridge Slip Certified'),
    subtitle: t('workflows.node2Subtitle', 'Gross, Tare & Net payload verified'),
    icon: Scale,
    x: 380,
    y: 120,
    status: 'active',
    params: {
      [t('workflows.paramScaleTolerance', 'Scale Tolerance')]: '+/- 0.5%',
      [t('workflows.paramZatcaSerial', 'ZATCA Ticket Serialization')]: t('workflows.valAuto', 'Auto'),
      [t('workflows.paramLossMitigation', 'Loss Mitigation Protocol')]: t('workflows.valStrictAudit', 'Strict Audit'),
    },
  },
  {
    id: 'node-3',
    type: 'condition',
    department: 'ZATCA',
    title: t('workflows.node3Title', 'ZATCA Phase-2 Clearance'),
    subtitle: t('workflows.node3Subtitle', 'Cryptographic hash & QR generation'),
    icon: ShieldCheck,
    x: 700,
    y: 120,
    status: 'active',
    params: {
      [t('workflows.paramComplianceMode', 'Compliance Mode')]: t('workflows.valStage2Prod', 'Stage-2 Production'),
      [t('workflows.paramEcdsaStamp', 'ECDSA Cryptographic Stamp')]: t('workflows.valEnforced', 'Enforced'),
      [t('workflows.paramTaxRate', 'Tax Rate')]: t('workflows.valStandardVat', '15.0% Standard VAT'),
    },
  },
  {
    id: 'node-4',
    type: 'action',
    department: 'Finance',
    title: t('workflows.node4Title', 'Tax Invoice & Voucher Created'),
    subtitle: t('workflows.node4Subtitle', 'Customer ledger updated & GL entry posted'),
    icon: FileSpreadsheet,
    x: 1020,
    y: 120,
    status: 'active',
    params: {
      [t('workflows.paramAutoJournal', 'Auto Journal Posting')]: t('workflows.valEnabled', 'Enabled'),
      [t('workflows.paramSubledgerSplit', 'Subledger Split')]: t('workflows.valCustomerTransporter', 'Customer vs Transporter'),
      [t('workflows.paramPaymentTerms', 'Payment Terms')]: t('workflows.valPaymentTerms30', '30 Days Net'),
    },
  },
];

export const WorkflowAutomationCanvas: React.FC = () => {
  const { themeMode, tenantTheme } = useApp();
  const { t, i18n } = useTranslation();
  const isDark = themeMode === 'dark';

  const [isRunning, setIsRunning] = useState(true);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);

  // Initial workflow sequence connecting the end-to-end ERP lifecycle
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => buildInitialNodes(t));

  useEffect(() => {
    const updated = buildInitialNodes(t);
    setNodes(updated);
    if (selectedNode) {
      const match = updated.find((n) => n.id === selectedNode.id);
      if (match) setSelectedNode(match);
    }
  }, [i18n.language, t]);

  const toggleSimulation = () => {
    setIsRunning(!isRunning);
  };

  return (
    <div className="relative flex h-[720px] w-full flex-col overflow-hidden rounded-3xl border border-slate-800 bg-[#090d1a] shadow-2xl">
      {/* Canvas Top Bar */}
      <div className="z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-[#0c1122]/90 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-white">
                {t('workflows.title')}
              </h2>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                {isRunning ? t('workflows.livePipelineActive') : t('workflows.simulationPaused')}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {t('workflows.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSimulation}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
              isRunning
                ? 'border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span>{t('workflows.pauseFlow')}</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>{t('workflows.simulateFlow')}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              // Pulse restart
              setIsRunning(false);
              setTimeout(() => setIsRunning(true), 200);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white"
            title={t('workflows.resetPulse')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t('workflows.resetPulse')}</span>
          </button>
        </div>
      </div>

      {/* Canvas Workspace */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Floating Toolbox Palette on the Left */}
        <div className="absolute left-4 top-4 z-20 flex w-52 flex-col gap-2 rounded-2xl border border-slate-800/80 bg-[#0e1428]/90 p-3 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-slate-800/80 pb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('workflows.toolbox')}
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="group flex cursor-pointer items-center justify-between rounded-xl border border-orange-500/20 bg-orange-500/10 p-2 text-orange-200 transition-all hover:border-orange-500/50">
              <span className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-orange-400" />
                <b className="text-[11px]">{t('workflows.dispatchTrigger')}</b>
              </span>
              <Plus className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
            </div>

            <div className="group flex cursor-pointer items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-200 transition-all hover:border-emerald-500/50">
              <span className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-emerald-400" />
                <b className="text-[11px]">{t('workflows.weighbridgeAudit')}</b>
              </span>
              <Plus className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
            </div>

            <div className="group flex cursor-pointer items-center justify-between rounded-xl border border-blue-500/20 bg-blue-500/10 p-2 text-blue-200 transition-all hover:border-blue-500/50">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                <b className="text-[11px]">{t('workflows.zatcaStage2')}</b>
              </span>
              <Plus className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
            </div>

            <div className="group flex cursor-pointer items-center justify-between rounded-xl border border-violet-500/20 bg-violet-500/10 p-2 text-violet-200 transition-all hover:border-violet-500/50">
              <span className="flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5 text-violet-400" />
                <b className="text-[11px]">{t('workflows.ledgerVoucher')}</b>
              </span>
              <Plus className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
            </div>
          </div>
        </div>

        {/* Dotted Grid Canvas Surface */}
        <div className="canvas-dotted-grid relative flex-1 overflow-auto p-12">
          {/* SVG Connector Lines with Animated Pulses */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="oxengl-flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#10b981" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* Connecting line 1 -> 2 */}
            <path
              d="M 310 170 C 345 170, 345 170, 380 170"
              fill="none"
              stroke="#1e293b"
              strokeWidth="4"
            />
            {isRunning && (
              <path
                d="M 310 170 C 345 170, 345 170, 380 170"
                fill="none"
                stroke="url(#oxengl-flow-grad)"
                strokeWidth="4"
                className="animate-pulse-flow"
              />
            )}

            {/* Connecting line 2 -> 3 */}
            <path
              d="M 630 170 C 665 170, 665 170, 700 170"
              fill="none"
              stroke="#1e293b"
              strokeWidth="4"
            />
            {isRunning && (
              <path
                d="M 630 170 C 665 170, 665 170, 700 170"
                fill="none"
                stroke="url(#oxengl-flow-grad)"
                strokeWidth="4"
                className="animate-pulse-flow"
              />
            )}

            {/* Connecting line 3 -> 4 */}
            <path
              d="M 950 170 C 985 170, 985 170, 1020 170"
              fill="none"
              stroke="#1e293b"
              strokeWidth="4"
            />
            {isRunning && (
              <path
                d="M 950 170 C 985 170, 985 170, 1020 170"
                fill="none"
                stroke="url(#oxengl-flow-grad)"
                strokeWidth="4"
                className="animate-pulse-flow"
              />
            )}
          </svg>

          {/* Workflow Interactive Nodes */}
          {nodes.map((node) => {
            const Icon = node.icon;
            const isSelected = selectedNode?.id === node.id;

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node)}
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                className={`absolute w-64 cursor-pointer rounded-2xl border p-4 shadow-xl backdrop-blur-xl transition-all ${
                  isSelected
                    ? 'border-orange-500 bg-[#151b33] shadow-orange-500/20 ring-2 ring-orange-500/40'
                    : 'border-slate-800 bg-[#10162a]/95 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-amber-400 shadow-sm">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {getDepartmentLabel(node.department, t)}
                      </span>
                      <h4 className="text-xs font-black text-white">{node.title}</h4>
                    </div>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>

                <p className="mt-2 text-[11px] leading-snug text-slate-400">
                  {node.subtitle}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] text-slate-400">
                  <span className="font-mono">{getNodeTypeLabel(node.type, t)}</span>
                  <span className="text-emerald-400 font-bold">{t('workflows.verified', '100% Verified')}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Property Inspector Drawer on the Right */}
        {selectedNode && (
          <div className="absolute right-0 top-0 z-30 h-full w-80 border-l border-slate-800 bg-[#0d1222] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-orange-400">
                  {t('workflows.nodeInspector', 'Node Inspector')}
                </span>
                <h3 className="text-xs font-black text-white">{selectedNode.title}</h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-[10px] font-mono text-slate-400">{t('workflows.targetDepartment', 'Target Department')}</p>
                <p className="font-bold text-white text-xs">{getDepartmentLabel(selectedNode.department, t)}</p>
              </div>

              <div className="space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t('workflows.nodeConfigParams', 'Node Configuration Parameters')}
                </span>
                {Object.entries(selectedNode.params).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between border-b border-slate-800/60 py-2 text-xs"
                  >
                    <span className="text-slate-400">{key}</span>
                    <span className="font-mono font-bold text-amber-300">{val}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[11px] text-emerald-300">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{t('workflows.isolationBoundary', 'Isolation Boundary Preserved')}</span>
                </div>
                <p className="mt-1 text-[10px] text-emerald-300/80">
                  {t('workflows.isolationBoundaryDesc', 'Cross-tenant execution barriers verified via Schema RLS L3.')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
