import { Request, Response } from 'express';
import { ExtendedRequest } from '../middleware/tenantResolver';
import {
  ProjectCharterItem,
  ExecutionTaskItem,
  StrategicHazardItem
} from '../components/planningTypes';

// In-Memory seed stores (tenant-scoped)
const DEFAULT_TENANT_ID = '6ab52593-ab47-4eee-8779-0cdfbb2762da';

const charterStore: ProjectCharterItem[] = [
  {
    id: 'cht-001',
    tenant_id: DEFAULT_TENANT_ID,
    project_name: 'Western Province Cold-Chain Fleet Expansion',
    manager_id: 'tm-2',
    manager_name: 'Eng. Faisal Al-Otaibi',
    start_date: '2026-09-01',
    end_date: '2026-12-31',
    total_budget: 1250000.00,
    smart_goals: [
      { id: 'g1', goal: 'Deploy 25 temperature-monitored refrigerated reefers', target_date: '2026-10-15', status: 'IN_PROGRESS' },
      { id: 'g2', goal: 'Achieve 99.4% on-time delivery across Jeddah-Makkah corridor', target_date: '2026-12-01', status: 'PENDING' },
      { id: 'g3', goal: 'Integrate IoT telematics with real-time ZATCA billing', target_date: '2026-11-01', status: 'COMPLETED' }
    ],
    kpis_json: {
      on_time_delivery_target_pct: 99.4,
      cost_per_ton_km_sar: 0.18,
      fleet_utilization_target_pct: 92.0,
      safety_incident_target: 0
    },
    scope_of_work_text: 'Comprehensive turnkey rollout of heavy refrigerated transport assets, driver regulatory compliance onboarding, IoT telemetry installation, and cold-chain route optimization across the Western economic cluster.',
    status: 'ACTIVE',
    created_at: '2026-09-01T08:00:00Z',
    updated_at: '2026-09-07T12:00:00Z'
  }
];

const taskStore: ExecutionTaskItem[] = [
  {
    id: 'tsk-101',
    tenant_id: DEFAULT_TENANT_ID,
    charter_id: 'cht-001',
    task_name: 'Procure 25 ThermoKing Refrigeration Units',
    phase: 'Execution',
    department: 'Fleet Operations',
    assigned_user_id: 'tm-2',
    assigned_user_name: 'Eng. Faisal Al-Otaibi',
    priority: 'CRITICAL',
    status: 'IN_PROGRESS',
    planned_hours: 120,
    task_cost: 450000.00,
    materials_required: ['25x ThermoKing SLXi-400 Units', 'Telemetry Sensors', 'Mounting Brackets'],
    created_at: '2026-09-01T09:00:00Z',
    updated_at: '2026-09-06T14:30:00Z'
  },
  {
    id: 'tsk-102',
    tenant_id: DEFAULT_TENANT_ID,
    charter_id: 'cht-001',
    task_name: 'Saudi Food & Drug Authority (SFDA) Cold Storage Audit',
    phase: 'Planning',
    department: 'Legal & Compliance',
    assigned_user_id: 'tm-1',
    assigned_user_name: 'Khaled Al-Harbi',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    planned_hours: 45,
    task_cost: 35000.00,
    materials_required: ['SFDA Calibration Certificates', 'Temperature Data Loggers'],
    created_at: '2026-09-02T10:00:00Z',
    updated_at: '2026-09-05T11:00:00Z'
  },
  {
    id: 'tsk-103',
    tenant_id: DEFAULT_TENANT_ID,
    charter_id: 'cht-001',
    task_name: 'Heavy Transport Driver Safety & Cold Chain Protocol Training',
    phase: 'Initiation',
    department: 'Human Resources',
    assigned_user_id: 'tm-2',
    assigned_user_name: 'Eng. Faisal Al-Otaibi',
    priority: 'MEDIUM',
    status: 'COMPLETED',
    planned_hours: 60,
    task_cost: 28000.00,
    materials_required: ['Driver Handbook', 'HACCP Training Materials'],
    created_at: '2026-09-02T11:00:00Z',
    updated_at: '2026-09-04T16:00:00Z'
  },
  {
    id: 'tsk-104',
    tenant_id: DEFAULT_TENANT_ID,
    charter_id: 'cht-001',
    task_name: 'Fuel & Maintenance Budget Allocation Reconciliation',
    phase: 'Monitoring',
    department: 'Finance',
    assigned_user_id: 'tm-3',
    assigned_user_name: 'Salman Al-Dossary',
    priority: 'MEDIUM',
    status: 'PENDING',
    planned_hours: 30,
    task_cost: 15000.00,
    materials_required: ['General Ledger Integration', 'Fuel Card Statements'],
    created_at: '2026-09-03T12:00:00Z',
    updated_at: '2026-09-03T12:00:00Z'
  }
];

const hazardStore: StrategicHazardItem[] = [
  {
    id: 'hzd-201',
    tenant_id: DEFAULT_TENANT_ID,
    execution_task_id: 'tsk-101',
    desired_outcome: 'Zero spoilage during peak transit hours (>45°C ambient summer heat)',
    potential_hazard_description: 'Refrigeration unit compressor power loss due to high ambient load during desert transit',
    mitigation_status: 'IN_PROGRESS',
    mitigation_plan: 'Dual-redundant compressor sensors and instant remote telemetry cutover alarm to mobile dispatch control room.',
    severity: 'HIGH',
    created_at: '2026-09-03T14:00:00Z',
    updated_at: '2026-09-07T10:00:00Z'
  },
  {
    id: 'hzd-202',
    tenant_id: DEFAULT_TENANT_ID,
    execution_task_id: 'tsk-102',
    desired_outcome: 'Unconditional SFDA cold storage operating permit without citation',
    potential_hazard_description: 'Regulatory delays in physical inspection slot scheduling leading to idle fleet assets',
    mitigation_status: 'MITIGATED',
    mitigation_plan: 'Pre-inspection fast-track certification submitted through authorized SFDA technical partner.',
    severity: 'MEDIUM',
    mitigated_at: '2026-09-06T15:00:00Z',
    created_at: '2026-09-04T09:30:00Z',
    updated_at: '2026-09-06T15:00:00Z'
  }
];

export const planningModuleController = {
  // --------------------------------------------------------------------------
  // TIER 1: PROJECT CHARTERS
  // --------------------------------------------------------------------------
  provisionCharter: (req: Request, res: Response): void => {
    const extReq = req as ExtendedRequest;
    const tenantId = extReq.tenant?.tenant_id || DEFAULT_TENANT_ID;
    const { project_name, manager_id, manager_name, start_date, end_date, total_budget, smart_goals, kpis_json, scope_of_work_text } = req.body;

    if (!project_name || !start_date || !end_date) {
      res.status(400).json({ error: 'project_name, start_date, and end_date are required' });
      return;
    }

    if (new Date(end_date) < new Date(start_date)) {
      res.status(400).json({ error: 'end_date cannot precede start_date' });
      return;
    }

    const newCharter: ProjectCharterItem = {
      id: `cht-${Date.now().toString(36)}`,
      tenant_id: tenantId,
      project_name: String(project_name).trim(),
      manager_id: manager_id || undefined,
      manager_name: manager_name || 'Project Director',
      start_date,
      end_date,
      total_budget: Number(total_budget) || 0,
      smart_goals: Array.isArray(smart_goals) ? smart_goals : [],
      kpis_json: typeof kpis_json === 'object' && kpis_json !== null ? kpis_json : {},
      scope_of_work_text: scope_of_work_text || '',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    charterStore.unshift(newCharter);
    res.status(201).json({ message: 'Project charter provisioned successfully', charter: newCharter });
  },

  listCharters: (req: Request, res: Response): void => {
    const extReq = req as ExtendedRequest;
    const tenantId = extReq.tenant?.tenant_id || DEFAULT_TENANT_ID;

    const tenantCharters = charterStore.filter(c => c.tenant_id === tenantId);
    
    const enriched = tenantCharters.map(c => {
      const tasks = taskStore.filter(t => t.tenant_id === tenantId && t.charter_id === c.id);
      const totalCost = tasks.reduce((sum, t) => sum + (t.task_cost || 0), 0);
      const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
      const hazards = hazardStore.filter(h => h.tenant_id === tenantId && tasks.some(t => t.id === h.execution_task_id));
      const activeHazards = hazards.filter(h => h.mitigation_status !== 'MITIGATED').length;

      return {
        ...c,
        total_tasks: tasks.length,
        completed_tasks: completedTasks,
        completion_rate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
        committed_cost: totalCost,
        budget_burn_rate: c.total_budget > 0 ? Math.round((totalCost / c.total_budget) * 100) : 0,
        active_hazards_count: activeHazards
      };
    });

    res.json({ charters: enriched, total: enriched.length });
  },

  getCharterDetails: (req: Request, res: Response): void => {
    const extReq = req as ExtendedRequest;
    const tenantId = extReq.tenant?.tenant_id || DEFAULT_TENANT_ID;
    const { charterId } = req.params;

    const charter = charterStore.find(c => c.tenant_id === tenantId && c.id === charterId);
    if (!charter) {
      res.status(404).json({ error: 'Project charter not found' });
      return;
    }

    const tasks = taskStore.filter(t => t.tenant_id === tenantId && t.charter_id === charterId);
    const enrichedTasks = tasks.map(t => {
      const hazards = hazardStore.filter(h => h.tenant_id === tenantId && h.execution_task_id === t.id);
      return { ...t, hazards };
    });

    const totalCommitted = tasks.reduce((acc, t) => acc + (t.task_cost || 0), 0);
    const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;

    res.json({
      charter,
      tasks: enrichedTasks,
      summary: {
        total_tasks: tasks.length,
        completed_tasks: completedCount,
        committed_budget: totalCommitted,
        budget_variance: charter.total_budget - totalCommitted,
        budget_burn_pct: charter.total_budget > 0 ? (totalCommitted / charter.total_budget) * 100 : 0
      }
    });
  },

  // --------------------------------------------------------------------------
  // TIER 2: EXECUTION TASKS
  // --------------------------------------------------------------------------
  batchCreateExecutionTasks: (req: Request, res: Response): void => {
    const extReq = req as ExtendedRequest;
    const tenantId = extReq.tenant?.tenant_id || DEFAULT_TENANT_ID;
    const { charter_id, tasks } = req.body;

    if (!charter_id || !Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({ error: 'charter_id and non-empty tasks array are required' });
      return;
    }

    const charterExists = charterStore.some(c => c.tenant_id === tenantId && c.id === charter_id);
    if (!charterExists) {
      res.status(404).json({ error: 'Associated charter does not exist for this tenant' });
      return;
    }

    const createdTasks: ExecutionTaskItem[] = tasks.map((t: any, idx: number) => ({
      id: `tsk-${Date.now().toString(36)}-${idx}`,
      tenant_id: tenantId,
      charter_id,
      task_name: String(t.task_name || 'Untitled Task').trim(),
      phase: t.phase || 'Execution',
      department: t.department || 'Operations',
      assigned_user_id: t.assigned_user_id || undefined,
      assigned_user_name: t.assigned_user_name || 'Assigned Lead',
      priority: t.priority || 'MEDIUM',
      status: t.status || 'PENDING',
      planned_hours: Number(t.planned_hours) || 0,
      task_cost: Number(t.task_cost) || 0,
      materials_required: Array.isArray(t.materials_required) ? t.materials_required : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    taskStore.push(...createdTasks);
    res.status(201).json({
      message: `Successfully batch created ${createdTasks.length} execution tasks`,
      created_count: createdTasks.length,
      tasks: createdTasks
    });
  },

  updateTaskStatus: (req: Request, res: Response): void => {
    const extReq = req as ExtendedRequest;
    const tenantId = extReq.tenant?.tenant_id || DEFAULT_TENANT_ID;
    const { taskId } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` });
      return;
    }

    const taskIndex = taskStore.findIndex(t => t.tenant_id === tenantId && t.id === taskId);
    if (taskIndex === -1) {
      res.status(404).json({ error: 'Execution task not found' });
      return;
    }

    taskStore[taskIndex].status = status;
    taskStore[taskIndex].updated_at = new Date().toISOString();

    res.json({ message: 'Task status updated successfully', task: taskStore[taskIndex] });
  },

  // --------------------------------------------------------------------------
  // TIER 3: STRATEGIC HAZARDS
  // --------------------------------------------------------------------------
  logStrategicHazard: (req: Request, res: Response): void => {
    const extReq = req as ExtendedRequest;
    const tenantId = extReq.tenant?.tenant_id || DEFAULT_TENANT_ID;
    const { execution_task_id, desired_outcome, potential_hazard_description, severity, mitigation_plan } = req.body;

    if (!execution_task_id || !desired_outcome || !potential_hazard_description) {
      res.status(400).json({ error: 'execution_task_id, desired_outcome, and potential_hazard_description are required' });
      return;
    }

    const taskExists = taskStore.some(t => t.tenant_id === tenantId && t.id === execution_task_id);
    if (!taskExists) {
      res.status(404).json({ error: 'Target execution task not found for this tenant' });
      return;
    }

    const newHazard: StrategicHazardItem = {
      id: `hzd-${Date.now().toString(36)}`,
      tenant_id: tenantId,
      execution_task_id,
      desired_outcome: String(desired_outcome).trim(),
      potential_hazard_description: String(potential_hazard_description).trim(),
      mitigation_status: 'IDENTIFIED',
      mitigation_plan: mitigation_plan || '',
      severity: severity || 'MEDIUM',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    hazardStore.unshift(newHazard);
    res.status(201).json({ message: 'Strategic hazard logged successfully', hazard: newHazard });
  },

  updateHazardMitigation: (req: Request, res: Response): void => {
    const extReq = req as ExtendedRequest;
    const tenantId = extReq.tenant?.tenant_id || DEFAULT_TENANT_ID;
    const { hazardId } = req.params;
    const { mitigation_status, mitigation_plan } = req.body;

    const validStatuses = ['IDENTIFIED', 'IN_PROGRESS', 'MITIGATED', 'ACCEPTED'];
    if (mitigation_status && !validStatuses.includes(mitigation_status)) {
      res.status(400).json({ error: `mitigation_status must be one of ${validStatuses.join(', ')}` });
      return;
    }

    const hazardIndex = hazardStore.findIndex(h => h.tenant_id === tenantId && h.id === hazardId);
    if (hazardIndex === -1) {
      res.status(404).json({ error: 'Strategic hazard not found' });
      return;
    }

    if (mitigation_status) {
      hazardStore[hazardIndex].mitigation_status = mitigation_status;
      if (mitigation_status === 'MITIGATED') {
        hazardStore[hazardIndex].mitigated_at = new Date().toISOString();
      }
    }
    if (mitigation_plan !== undefined) {
      hazardStore[hazardIndex].mitigation_plan = mitigation_plan;
    }
    hazardStore[hazardIndex].updated_at = new Date().toISOString();

    res.json({ message: 'Strategic hazard mitigation updated', hazard: hazardStore[hazardIndex] });
  },

  // --------------------------------------------------------------------------
  // PLANNING ANALYTICS & TELEMETRY
  // --------------------------------------------------------------------------
  getPlanningAnalytics: (req: Request, res: Response): void => {
    const extReq = req as ExtendedRequest;
    const tenantId = extReq.tenant?.tenant_id || DEFAULT_TENANT_ID;

    const tenantCharters = charterStore.filter(c => c.tenant_id === tenantId);
    const tenantTasks = taskStore.filter(t => t.tenant_id === tenantId);
    const tenantHazards = hazardStore.filter(h => h.tenant_id === tenantId);

    const totalAllocated = tenantCharters.reduce((sum, c) => sum + (c.total_budget || 0), 0);
    const totalCommitted = tenantTasks.reduce((sum, t) => sum + (t.task_cost || 0), 0);
    const completedTasks = tenantTasks.filter(t => t.status === 'COMPLETED').length;
    const blockedTasks = tenantTasks.filter(t => t.status === 'BLOCKED').length;
    const activeHazards = tenantHazards.filter(h => h.mitigation_status !== 'MITIGATED').length;
    const mitigatedHazards = tenantHazards.filter(h => h.mitigation_status === 'MITIGATED').length;

    res.json({
      total_charters: tenantCharters.length,
      active_charters: tenantCharters.filter(c => c.status === 'ACTIVE').length,
      total_allocated_budget: totalAllocated,
      total_committed_task_cost: totalCommitted,
      budget_variance: totalAllocated - totalCommitted,
      budget_consumption_rate: totalAllocated > 0 ? Math.round((totalCommitted / totalAllocated) * 100) : 0,
      total_tasks_count: tenantTasks.length,
      completed_tasks_count: completedTasks,
      blocked_tasks_count: blockedTasks,
      task_completion_rate: tenantTasks.length > 0 ? Math.round((completedTasks / tenantTasks.length) * 100) : 0,
      total_hazards_count: tenantHazards.length,
      active_hazards_count: activeHazards,
      mitigated_hazards_count: mitigatedHazards
    });
  }
};
