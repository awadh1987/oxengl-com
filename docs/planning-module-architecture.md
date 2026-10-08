# Planning Department Module Architecture

Act as a Principal Full-Stack Architect. Expand our multi-tenant SaaS logistics platform by scaffolding a robust "Planning Department" module. Based on our deduplicated planning templates, generate the structural blueprints and relational schemas for three distinct planning tiers.

Please generate clean, modular code covering the following requirements:

1. **Database Schema (PostgreSQL/Prisma with RLS):**
   - **`project_charters` (The High-Level Plan):** id, tenant_id, project_name, manager_id, start_date, end_date, total_budget, smart_goals, kpis_json, scope_of_work_text.
   - **`execution_tasks` (The Granular Matrix):** id, charter_id, task_name, phase, department, assigned_user_id, priority, status, planned_hours, task_cost, materials_required.
   - **`strategic_hazards` (The Risk Tracker):** id, execution_task_id, desired_outcome, potential_hazard_description, mitigation_status.

2. **API Controllers & Routing:**
   - Create route stubs with tenant-scoped middleware for: 
     - Provisioning a new `Project Charter` with initial budget and timeline.
     - Batch-creating `execution_tasks` tied to specific phases and departments.
     - Logging and updating `strategic_hazards` linked to individual tasks.

3. **Frontend UI/UX Shell Components:**
   - **Charter Dashboard:** A high-level overview component displaying the project budget, timeline progress bar, and KPI success metrics.
   - **Execution Kanban/Table:** A high-density data table grouping tasks by `Phase`, showing planned hours vs. assigned personnel, with inline editing for statuses.
   - **Hazard Warning Module:** A side-panel or modal UI that highlights active `potential_hazards` requiring mitigation by the project manager.
   
   {
  "action": "inject_sidebar_planning_item",
  "target_file": "Oxen-gl/src/components/Sidebar.tsx",
  "payload": {
    "id": "planning",
    "labelAr": "إدارة التخطيط الاستراتيجي",
    "labelEn": "Planning Department",
    "icon": "Layers",
    "roles": ["Admin", "COO", "Accountant", "Data_Entry", "Guest"],
    "badge": "Tier 1-3"
  }
}
