import React, { useEffect, useMemo, useState } from 'react';
import { FolderKanban, RefreshCw, ShieldCheck, AlertCircle } from 'lucide-react';
import { erpApi } from '../../services/api';
import { CoreProjectRecord } from '../../types';
import { useApp } from '../../context/AppContext';

export const FALLBACK_ACTIVE_PROJECTS: CoreProjectRecord[] = [
  {
    id: '11111111-2222-4333-8444-555555555501',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    company_id: null,
    parent_project_id: null,
    project_code: 'PRJ-LOG-2026-001',
    name: 'Red Sea & Central Corridor Aggregate Haulage Spine',
    project_type: 'logistics',
    status: 'active',
    client_id: null,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    total_budget: 4850000,
    currency_id: 'SAR',
    metadata_json: {
      origin: 'Riyadh Quarry Cluster A',
      destination: 'NEOM / Red Sea Logistics Hub',
      cargo_type: 'Gabbro & Washed Silica',
      estimated_distance_km: 1120,
      vehicle_requirements: ['Heavy Tipper 45T', 'Flatbed 40T'],
    },
    esg_metrics: { co2_emissions_kg: 18420, fuel_consumed_liters: 6870, sustainability_score: 91 },
    telemetry_data: { last_known_lat: 24.7136, last_known_lng: 46.6753, active_alerts: [] },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
  },
  {
    id: '11111111-2222-4333-8444-555555555502',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    company_id: null,
    parent_project_id: '11111111-2222-4333-8444-555555555501',
    project_code: 'PRJ-EPC-2026-002',
    name: 'Diriyah Gate Infrastructure Phase III WBS-1',
    project_type: 'epc',
    status: 'active',
    client_id: null,
    start_date: '2026-02-15',
    end_date: '2027-06-30',
    total_budget: 12500000,
    currency_id: 'SAR',
    metadata_json: {
      site_location: 'Diriyah North Sector',
      contractor_tier: 'Tier-1 EPC',
      retention_percentage: 10,
      wbs_phases: ['Earthworks', 'Subbase Compaction', 'Structural Concrete'],
    },
    esg_metrics: { co2_emissions_kg: 42100, fuel_consumed_liters: 15700, sustainability_score: 88 },
    telemetry_data: { last_known_lat: 24.7331, last_known_lng: 46.5742, active_alerts: [] },
    created_at: '2026-02-15T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
  },
  {
    id: '11111111-2222-4333-8444-555555555503',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    company_id: null,
    parent_project_id: null,
    project_code: 'PRJ-HUM-2026-003',
    name: 'UNHCR Emergency Relief Corridor - East Africa Hub',
    project_type: 'humanitarian_supply',
    status: 'active',
    client_id: null,
    start_date: '2026-03-01',
    end_date: '2026-11-30',
    total_budget: 3200000,
    currency_id: 'USD',
    metadata_json: {
      donor_organization: 'UNHCR / WFP Joint Fund',
      grant_code: 'GR-UN-2026-884',
      target_demographics: 'Displaced Families & Regional Clinics',
      target_beneficiaries: 85000,
      relief_cluster: 'Logistics & Emergency Shelter',
    },
    esg_metrics: { co2_emissions_kg: 9450, fuel_consumed_liters: 3520, sustainability_score: 95 },
    telemetry_data: { last_known_lat: 15.5007, last_known_lng: 32.5599, active_alerts: [] },
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
  },
  {
    id: '11111111-2222-4333-8444-555555555504',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    company_id: null,
    parent_project_id: null,
    project_code: 'PRJ-OG-2026-004',
    name: 'Eastern Province Upstream Rig Supply & Mud Logistics',
    project_type: 'oil_gas',
    status: 'active',
    client_id: null,
    start_date: '2026-01-15',
    end_date: '2027-01-15',
    total_budget: 19400000,
    currency_id: 'SAR',
    metadata_json: {
      well_block_id: 'GHW-BLK-14B',
      rig_code: 'RIG-ARAMCO-77',
      hazmat_class: 'Class 3 Flammable / Drilling Barite',
      hse_clearance_level: 'LEVEL-4 CRITICAL',
      daily_barrel_target: 45000,
    },
    esg_metrics: { co2_emissions_kg: 64300, fuel_consumed_liters: 23990, sustainability_score: 84 },
    telemetry_data: { last_known_lat: 25.383, last_known_lng: 49.586, active_alerts: ['H2S Sensor Nominal'] },
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
  },
];

export interface ProjectSelectorProps {
  id?: string;
  value: string;
  onChange: (projectId: string, project?: CoreProjectRecord) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  autoSelectDefault?: boolean;
  placeholder?: string;
  className?: string;
  error?: string;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  id,
  value,
  onChange,
  label,
  required = true,
  disabled = false,
  autoSelectDefault = true,
  placeholder,
  className = '',
  error,
}) => {
  const { language, currentCompany } = useApp();
  const isAr = language === 'ar';
  const currentCompanyId = currentCompany?.id;
  const [projects, setProjects] = useState<CoreProjectRecord[]>(FALLBACK_ACTIVE_PROJECTS);
  const [loading, setLoading] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const loadActiveProjects = async () => {
    setLoading(true);
    setFallbackMessage(null);
    try {
      const data = await erpApi.getCoreProjects(
        { status: 'Active Execution' },
        currentCompanyId || undefined
      );
      if (Array.isArray(data) && data.length > 0) {
        setProjects(data);
        if (autoSelectDefault && !value) {
          onChange(data[0].id, data[0]);
        }
      } else {
        setProjects(FALLBACK_ACTIVE_PROJECTS);
        if (autoSelectDefault && !value) {
          onChange(FALLBACK_ACTIVE_PROJECTS[0].id, FALLBACK_ACTIVE_PROJECTS[0]);
        }
      }
    } catch {
      setProjects(FALLBACK_ACTIVE_PROJECTS);
      setFallbackMessage(
        isAr
          ? 'تم تحميل قائمة المشاريع النشطة الاحتياطية مؤقتاً.'
          : 'Loaded offline Core Spine directory fallback.'
      );
      if (autoSelectDefault && !value) {
        onChange(FALLBACK_ACTIVE_PROJECTS[0].id, FALLBACK_ACTIVE_PROJECTS[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoSelectDefault && !value && projects.length > 0) {
      onChange(projects[0].id, projects[0]);
    }
    void loadActiveProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompanyId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === value) || null,
    [projects, value]
  );

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
          <span>
            {label ||
              (isAr
                ? 'المشروع الأساسي (العمود الفقري للتخطيط)'
                : 'Core Spine Project (WBS Anchor)')}
          </span>
          {required && <span className="text-rose-500">*</span>}
        </label>
        <button
          type="button"
          onClick={() => void loadActiveProjects()}
          title={isAr ? 'تحديث قائمة المشاريع النشطة' : 'Refresh Active Projects'}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>{isAr ? 'متصل بـ Core Spine' : 'Core Spine Linked'}</span>
        </button>
      </div>

      <div className="relative">
        <select
          id={id}
          aria-label={label || 'Core Spine Project'}
          data-testid="core-project-selector"
          value={value}
          required={required}
          disabled={disabled}
          onChange={(e) => {
            const nextId = e.target.value;
            const found = projects.find((p) => p.id === nextId);
            onChange(nextId, found);
          }}
          className={`w-full px-3.5 py-2.5 bg-white dark:bg-[#1e1e2d] border ${
            error
              ? 'border-rose-500 focus:ring-rose-500'
              : 'border-slate-300 dark:border-slate-700/80 focus:ring-indigo-500 focus:border-indigo-500'
          } rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 transition-all`}
        >
          <option value="">
            {placeholder ||
              (isAr
                ? '-- اختر المشروع النشط لربط المعاملة --'
                : '-- Select Active Core Project --')}
          </option>
          {projects.map((proj) => (
            <option key={proj.id} value={proj.id}>
              [{proj.project_code}] {proj.name} ({proj.project_type.toUpperCase()} •{' '}
              {Number(proj.total_budget || 0).toLocaleString('en-US')} {proj.currency_id})
            </option>
          ))}
        </select>
      </div>

      {fallbackMessage && (
        <div
          data-testid="project-selector-fallback-notice"
          className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{fallbackMessage}</span>
        </div>
      )}

      {selectedProject ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/5 dark:bg-indigo-950/30 border border-indigo-500/20 text-[11px]">
          <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold truncate">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="font-mono">{selectedProject.project_code}</span>
            <span className="text-slate-400">•</span>
            <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono">
              {selectedProject.project_type}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
            {isAr ? 'الميزانية المعتمدة:' : 'Envelope:'}{' '}
            <span className="font-black text-slate-700 dark:text-slate-200">
              {Number(selectedProject.total_budget || 0).toLocaleString('en-US')}{' '}
              {selectedProject.currency_id}
            </span>
          </div>
        </div>
      ) : (
        error && (
          <div className="flex items-center gap-1 text-[11px] font-bold text-rose-500">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </div>
        )
      )}
    </div>
  );
};

export default ProjectSelector;
