/**
 * OxenGL Platform Master Governance, Dynamic Landing CMS & Broadcast Engine Service.
 * File: frontend/src/services/governanceService.ts
 */

import { authFetch } from './api';

export interface LandingSection {
  id: string;
  section_key: string;
  locale: string;
  title: string | null;
  subtitle: string | null;
  content_data: Record<string, any>;
  sort_order: number;
  is_visible: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PlatformMasterSettings {
  id: string;
  platform_name: string;
  platform_tagline?: string | null;
  logo_light_url?: string | null;
  logo_dark_url?: string | null;
  favicon_url?: string | null;
  primary_color: string;
  secondary_color: string;
  support_email?: string | null;
  legal_terms_url?: string | null;
  privacy_policy_url?: string | null;
  custom_css?: string | null;
  metadata?: Record<string, any>;
  updated_at?: string;
  updated_by?: string | null;
}

export interface PublicLandingData {
  platform_settings: Partial<PlatformMasterSettings>;
  sections: LandingSection[];
  sections_map: Record<string, LandingSection>;
  cached_at?: string;
}

export interface SystemBroadcast {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'maintenance';
  is_active: boolean;
  starts_at: string;
  expires_at?: string | null;
  is_dismissible: boolean;
  target_scope: string;
  created_at?: string;
  created_by?: string | null;
}

// ==============================================================================
// Public Endpoints
// ==============================================================================

export async function getPublicLanding(): Promise<PublicLandingData> {
  const res = await fetch('/api/v1/public/landing', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to load landing content (${res.status})`);
  }
  return res.json();
}

export async function getActiveBroadcasts(): Promise<SystemBroadcast[]> {
  const res = await fetch('/api/v1/broadcasts/active', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

// ==============================================================================
// SuperAdmin CMS Studio Endpoints
// ==============================================================================

export async function getAdminLandingSections(): Promise<LandingSection[]> {
  const res = await authFetch('/api/v1/admin/landing/sections', { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Failed to load admin landing sections (${res.status})`);
  }
  return res.json();
}

export async function updateAdminLandingSection(
  sectionKey: string,
  payload: Partial<LandingSection>
): Promise<LandingSection> {
  const res = await authFetch(`/api/v1/admin/landing/sections/${encodeURIComponent(sectionKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update landing section ${sectionKey} (${res.status})`);
  }
  return res.json();
}

export async function resetLandingSectionsDefault(): Promise<LandingSection[]> {
  const res = await authFetch('/api/v1/admin/landing/reset-default', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to reset landing sections (${res.status})`);
  }
  return res.json();
}

// ==============================================================================
// SuperAdmin Platform Master Settings Endpoints
// ==============================================================================

export async function getPlatformMasterSettings(): Promise<PlatformMasterSettings> {
  const res = await authFetch('/api/v1/admin/platform/settings', { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Failed to load platform master settings (${res.status})`);
  }
  return res.json();
}

export async function updatePlatformMasterSettings(
  payload: Partial<PlatformMasterSettings>
): Promise<PlatformMasterSettings> {
  const res = await authFetch('/api/v1/admin/platform/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update platform master settings (${res.status})`);
  }
  return res.json();
}

export async function uploadPlatformLogo(
  payload: { fileName: string; fileBuffer: string; assetType?: string } | FormData,
  assetType: string = 'primary_logo'
): Promise<{ success: boolean; url: string; asset_type?: string }> {
  let init: RequestInit;
  if (payload instanceof FormData) {
    init = {
      method: 'POST',
      body: payload,
    };
  } else {
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: payload.fileName,
        fileBuffer: payload.fileBuffer,
        asset_type: payload.assetType || assetType,
      }),
    };
  }

  const res = await authFetch(`/api/v1/admin/platform/upload-logo?asset_type=${encodeURIComponent(assetType)}`, init);
  if (!res.ok) {
    throw new Error(`Failed to upload logo asset (${res.status})`);
  }
  return res.json();
}

// ==============================================================================
// SuperAdmin Broadcast Management Endpoints
// ==============================================================================

export async function getAdminBroadcasts(): Promise<SystemBroadcast[]> {
  const res = await authFetch('/api/v1/admin/broadcasts', { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Failed to load admin broadcasts (${res.status})`);
  }
  return res.json();
}

export async function createBroadcast(
  payload: Partial<SystemBroadcast>
): Promise<SystemBroadcast> {
  const res = await authFetch('/api/v1/admin/broadcasts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create broadcast banner (${res.status})`);
  }
  return res.json();
}

export async function updateBroadcast(
  id: string,
  payload: Partial<SystemBroadcast>
): Promise<SystemBroadcast> {
  const res = await authFetch(`/api/v1/admin/broadcasts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update broadcast banner (${res.status})`);
  }
  return res.json();
}

export async function deleteBroadcast(id: string): Promise<boolean> {
  const res = await authFetch(`/api/v1/admin/broadcasts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete broadcast banner (${res.status})`);
  }
  return true;
}
