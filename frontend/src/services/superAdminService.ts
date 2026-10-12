import { authFetch } from './api';

export interface TenantStatusToggleResponse {
  status: string;
  tenant_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  tenant_status: string;
  message: string;
}

export interface TenantOffboardResponse {
  status: string;
  message: string;
}

export const superAdminService = {
  /**
   * Toggles the active status of a tenant (archive/suspend or reactivate).
   * Revokes active sessions in Redis and DB upon suspension.
   */
  async toggleTenantStatus(
    tenantId: string,
    isActive: boolean,
    reason?: string
  ): Promise<TenantStatusToggleResponse> {
    const res = await authFetch(`/api/v1/super-admin/tenants/${tenantId}/toggle-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive, reason }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to toggle tenant status (${res.status})`);
    }

    return res.json();
  },

  /**
   * Initiates an asynchronous offboarding workflow requiring exact tenant name confirmation.
   */
  async offboardTenant(
    tenantId: string,
    confirmationName: string,
    purgeUsers: boolean = true
  ): Promise<TenantOffboardResponse> {
    const res = await authFetch(`/api/v1/super-admin/tenants/${tenantId}/offboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation_name: confirmationName, purge_users: purgeUsers }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Offboarding failed (${res.status})`);
    }

    return res.json();
  },
};

export const toggleTenantStatus = superAdminService.toggleTenantStatus;
export const offboardTenant = superAdminService.offboardTenant;
