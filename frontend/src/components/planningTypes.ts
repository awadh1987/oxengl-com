export interface ProjectCharterItem {
  id: string;
  tenant_id: string;
  project_name: string;
  manager_id?: string;
  manager_name?: string;
  start_date: string;
  end_date: string;
  total_budget: number;
  smart_goals: Array<{ id: string; goal: string; target_date: string; status: string }>;
  kpis_json: Record<string, any>;
  scope_of_work_text: string;
  status: 'ACTIVE' | 'DRAFT' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
  total_tasks?: number;
  completed_tasks?: number;
  completion_rate?: number;
  committed_cost?: number;
  budget_burn_rate?: number;
  active_hazards_count?: number;
}

export interface ExecutionTaskItem {
  id: string;
  tenant_id: string;
  charter_id: string;
  task_name: string;
  phase: 'Initiation' | 'Planning' | 'Execution' | 'Monitoring' | 'Closure';
  department: string;
  assigned_user_id?: string;
  assigned_user_name?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
  planned_hours: number;
  task_cost: number;
  materials_required: string[];
  created_at: string;
  updated_at: string;
  hazards?: StrategicHazardItem[];
}

export interface StrategicHazardItem {
  id: string;
  tenant_id: string;
  execution_task_id: string;
  desired_outcome: string;
  potential_hazard_description: string;
  mitigation_status: 'IDENTIFIED' | 'IN_PROGRESS' | 'MITIGATED' | 'ACCEPTED';
  mitigation_plan?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  mitigated_at?: string;
  created_at: string;
  updated_at: string;
}
