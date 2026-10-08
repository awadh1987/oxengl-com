/**
 * Standardized IAM roles - frontend mirror of backend/app/domains/iam/role_catalog.py.
 *
 * The backend (GET /api/v1/users/roles) is the source of truth; `useIamRoles` fetches it and only
 * falls back to this constant when the request fails. Never hardcode role lists in components.
 */
export const IAM_ROLES = [
  'Super_Admin',
  'Operations_Admin',
  'Finance_Admin',
  'System_Admin',
  'General_Manager',
  'Ops_Manager',
  'Finance_Manager',
  'HR_Manager',
  'Fleet_Manager',
  'Procurement_Manager',
  'Warehouse_Manager',
  'Dispatch_Manager',
  'Finance_Editor',
  'Ops_Editor',
  'HR_Editor',
  'Procurement_Editor',
  'IT_Support',
  'Admin_Viewer',
  'Data_Entry',
  'Dispatch_Operator',
  'Field_Operator',
  'WMS_Operator',
  'Maintenance_Operator',
  'Security_Operator',
  'Employee_Self_Serve',
] as const;

export type IamRole = (typeof IAM_ROLES)[number];

/** Workspace-assignable roles: the 25 standardized roles plus the workspace Owner. */
export const ASSIGNABLE_IAM_ROLES = [...IAM_ROLES, 'Owner'] as const;

/** External / contractor identities - the only roles the Invite flow may assign. */
export const EXTERNAL_INVITE_ROLES = ['Guest', 'External_Auditor'] as const;
export type ExternalInviteRole = (typeof EXTERNAL_INVITE_ROLES)[number];

/** Roles whose assignment is restricted (Owner/CEO/platform admin) and audited server-side. */
export const PRIVILEGED_IAM_ROLES: readonly string[] = ['Super_Admin', 'Owner'];

export const HR_REGISTRATION_WARNING_EN =
  'Internal staff must be registered via the HR module to generate payroll and compliance profiles.';
export const HR_REGISTRATION_WARNING_AR =
  'يجب تسجيل الموظفين الداخليين عبر وحدة الموارد البشرية لإنشاء ملفات الرواتب والامتثال.';

const AR_ROLE_LABELS: Record<string, string> = {
  Super_Admin: 'مدير أعلى',
  Operations_Admin: 'مدير العمليات (إداري)',
  Finance_Admin: 'مدير المالية (إداري)',
  System_Admin: 'مدير النظام',
  General_Manager: 'المدير العام',
  Ops_Manager: 'مدير العمليات',
  Finance_Manager: 'مدير مالي',
  HR_Manager: 'مدير الموارد البشرية',
  Fleet_Manager: 'مدير الأسطول',
  Procurement_Manager: 'مدير المشتريات',
  Warehouse_Manager: 'مدير المستودعات',
  Dispatch_Manager: 'مدير الإرسال',
  Finance_Editor: 'محرر مالي',
  Ops_Editor: 'محرر عمليات',
  HR_Editor: 'محرر موارد بشرية',
  Procurement_Editor: 'محرر مشتريات',
  IT_Support: 'دعم تقنية المعلومات',
  Admin_Viewer: 'مشاهد إداري',
  Data_Entry: 'إدخال بيانات',
  Dispatch_Operator: 'مشغل إرسال',
  Field_Operator: 'مشغل ميداني',
  WMS_Operator: 'مشغل المستودعات',
  Maintenance_Operator: 'مشغل صيانة',
  Security_Operator: 'مشغل أمن',
  Employee_Self_Serve: 'خدمة الموظف الذاتية',
  Guest: 'ضيف',
  External_Auditor: 'مدقق خارجي',
};

/** Human label for a role value ("Finance_Manager" -> "Finance Manager" / Arabic). Unknown values pass through. */
export function iamRoleLabel(role: string | null | undefined, isAr: boolean): string {
  if (!role) return '';
  if (isAr && AR_ROLE_LABELS[role]) return AR_ROLE_LABELS[role];
  return role.replace(/_/g, ' ');
}
