// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppProvider } from '../context/AppContext';
import { PlanningHubView } from './PlanningHubView';
import { ProjectSelector } from '../components/common/ProjectSelector';
import { erpApi } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    erpApi: {
      ...actual.erpApi,
      getCoreProjects: vi.fn().mockResolvedValue([]),
      getCoreProjectTelemetry: vi.fn().mockResolvedValue(null),
      getCoreProjectWBS: vi.fn().mockResolvedValue(null),
      getPartners: vi.fn().mockResolvedValue([]),
      createCoreProject: vi.fn().mockImplementation(async (payload) => ({
        id: '11111111-2222-4333-8444-555555555599',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        company_id: null,
        parent_project_id: payload.parent_project_id || null,
        project_code: payload.project_code,
        name: payload.name,
        project_type: payload.project_type,
        status: payload.status || 'Active Execution',
        client_id: payload.client_id || null,
        start_date: payload.start_date || '2026-01-01',
        end_date: payload.end_date || '2026-12-31',
        total_budget: payload.total_budget || 1000000,
        currency_id: payload.currency_id || 'SAR',
        metadata_json: payload.metadata_json || {},
        esg_metrics: payload.esg_metrics || { co2_emissions_kg: 0, fuel_consumed_liters: 0 },
        telemetry_data: payload.telemetry_data || { active_alerts: [] },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    },
  };
});

describe('PlanningHubView & Command Center Suite', () => {
  it('renders PlanningHubView directory, filters by project type, and opens ProjectCommandCenterView tabs', async () => {
    render(
      <AppProvider>
        <PlanningHubView />
      </AppProvider>
    );

    expect(screen.getByTestId('planning-hub-view')).toBeDefined();
    expect(screen.getByText(/Red Sea & Central Corridor Aggregate Haulage Spine/i)).toBeDefined();

    // Filter by Humanitarian sector
    const humFilter = screen.getByTestId('filter-type-humanitarian_supply');
    fireEvent.click(humFilter);
    expect(screen.getByText(/UNHCR Emergency Relief Corridor/i)).toBeDefined();

    // Reset filter to ALL
    fireEvent.click(screen.getByTestId('filter-type-ALL'));

    // Open Command Center for the first project
    const openBtn = screen.getByTestId('open-command-center-PRJ-LOG-2026-001');
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByTestId('project-command-center-view')).toBeDefined();
    });

    // Switch across all 4 Command Center tabs
    fireEvent.click(screen.getByTestId('cmd-tab-logistics_radar'));
    expect(screen.getByTestId('tab-panel-logistics-radar')).toBeDefined();

    fireEvent.click(screen.getByTestId('cmd-tab-supply_chain'));
    expect(screen.getByTestId('tab-panel-supply-chain')).toBeDefined();

    fireEvent.click(screen.getByTestId('cmd-tab-esg_metrics'));
    expect(screen.getByTestId('tab-panel-esg-metrics')).toBeDefined();

    fireEvent.click(screen.getByTestId('cmd-tab-financial_ledger'));
    expect(screen.getByTestId('tab-panel-financial-ledger')).toBeDefined();
  });

  it('opens ProjectCreationModal multi-step wizard and renders dynamic schema fields per project type', async () => {
    render(
      <AppProvider>
        <PlanningHubView />
      </AppProvider>
    );

    fireEvent.click(screen.getByTestId('open-create-project-modal-btn'));
    expect(screen.getByTestId('project-creation-modal')).toBeDefined();

    // Select Oil & Gas project type in Step 1
    fireEvent.click(screen.getByTestId('select-project-type-oil_gas'));
    fireEvent.change(screen.getByTestId('project-name-input'), {
      target: { value: 'Ghawar South Rig Logistics Spine' },
    });

    // Advance to Step 2
    fireEvent.click(screen.getByTestId('wizard-next-step-btn'));

    await waitFor(() => {
      expect(screen.getByText(/Well \/ Concession Block ID/i)).toBeDefined();
      expect(screen.getByText(/Drilling Rig Code/i)).toBeDefined();
    });
  });

  it('ProjectSelector queries status="Active Execution" and shows clean fallback notice when API fails', async () => {
    const mockGetCoreProjects = vi.mocked(erpApi.getCoreProjects);
    mockGetCoreProjects.mockClear();
    mockGetCoreProjects.mockRejectedValueOnce(new Error('422 Unprocessable Entity'));

    const onChange = vi.fn();
    render(
      <AppProvider>
        <ProjectSelector value="" onChange={onChange} />
      </AppProvider>
    );

    await waitFor(() => {
      expect(mockGetCoreProjects).toHaveBeenCalledWith(
        { status: 'Active Execution' },
        undefined
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('project-selector-fallback-notice')).toBeDefined();
    });

    const selectEl = screen.getByTestId('core-project-selector') as HTMLSelectElement;
    expect(selectEl.options.length).toBeGreaterThan(1);
  });
});

