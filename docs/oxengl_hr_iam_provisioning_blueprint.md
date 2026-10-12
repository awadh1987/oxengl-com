# OxenGL HR-to-IAM Provisioning Blueprint

## 1. Architectural Strategy: Event-Driven Provisioning
To maintain loose coupling between the HRMS and IAM modules, user provisioning must occur asynchronously. 
*   **Trigger:** When a new employee profile is successfully committed in the `Register Employee` endpoint, a FastAPI `BackgroundTask` (or dedicated event dispatcher) is fired with the `EmployeeCreated` payload.
*   **Action:** The IAM service listens to this event, references the `job_title` against the Mapping Matrix, and provisions a `User` account with the appropriate Base Role and dynamic ABAC constraints.

## 2. HR Title to IAM Role Mapping Matrix
The IAM service must contain a dictionary/configuration that maps the standardized HR titles to their baseline RBAC roles and ABAC context rules.

| HR Job Title | IAM Base Role (RBAC) | ABAC Context Rules & Constraints |
| :--- | :--- | :--- |
| Chief Executive Officer (CEO) | Super_Admin | unrestricted_access: true, requires_mfa: true |
| Chief Operating Officer (COO) | Operations_Admin | fleet_override_auth: true |
| Chief Financial Officer (CFO) | Finance_Admin | master_ledger_auth: true, requires_mfa: true |
| Chief Technology Officer (CTO) | System_Admin | restrict_pii_view: true, api_key_auth: true |
| General Manager | General_Manager | geo_fence: 'KSA' |
| Operations Manager | Ops_Manager | approval_limit: 100000, standard_hours: true |
| Finance Manager | Finance_Manager | approval_limit: 500000, ip_restricted: true |
| HR & Admin Manager | HR_Manager | requires_mfa: true, unmasked_pii: true |
| Fleet & Logistics Manager | Fleet_Manager | approval_limit: 50000 |
| Procurement Manager | Procurement_Manager | approval_limit: 100000, sod_block_self_approval: true |
| Warehouse Supervisor | Warehouse_Manager | max_stock_variance_percent: 5, branch_locked: true |
| Dispatch Supervisor | Dispatch_Manager | shift_locked: true |
| Senior Financial Accountant | Finance_Editor | standard_hours: true |
| Logistics Operations Specialist | Ops_Editor | read_only_billing: true |
| HR Generalist / Mandoob | HR_Editor | ip_restricted: true |
| Procurement Officer | Procurement_Editor | approval_limit: 0 |
| IT Support Specialist | IT_Support | restrict_pii_view: true, restrict_financials: true |
| Administrative Assistant | Admin_Viewer | standard_hours: true |
| Data Entry Clerk | Data_Entry | standard_hours: true, ip_restricted: true |
| Fleet Dispatcher | Dispatch_Operator | shift_locked: true |
| Heavy Vehicle Driver | Field_Operator | device_fingerprint_required: true |
| Light Vehicle Driver | Field_Operator | device_fingerprint_required: true |
| Warehouse Operator | WMS_Operator | mac_address_locked: true, shift_locked: true |
| Forklift Operator | WMS_Operator | device_locked: true, read_only_valuation: true |
| Maintenance Technician / Mechanic | Maintenance_Operator| branch_locked: true |
| Security Guard | Security_Operator | location_coordinates_locked: true |
| Office Boy / Tea Boy | Employee_Self_Serve | hr_portal_only: true |
| Cleaner / Janitor | Employee_Self_Serve | hr_portal_only: true |

## 3. ABAC Context Schema
The provisioning service must inject a JSON object into the new user's ABAC context profile (e.g., `user.abac_context` column). 
*   **approval_limit** (Integer): Maximum SAR amount the user can approve.
*   **shift_locked** (Boolean): Restricts login access to the employee's assigned working hours.
*   **ip_restricted** (Boolean): Requires login from trusted corporate IP ranges.
*   **requires_mfa** (Boolean): Forces multi-factor authentication on login.

## 4. Execution Flow
1. **Generate Credentials:** Auto-generate a secure temporary password.
2. **Create IAM User:** Insert into the `users` (or IAM equivalent) table, linking `employee_id`.
3. **Assign Roles/Context:** Apply the RBAC role and ABAC JSON payload.
4. **Dispatch Notification:** Trigger a welcome email/SMS to the employee's personal contact info with initial login instructions.