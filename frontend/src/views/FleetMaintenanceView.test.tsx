// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { FleetMaintenanceView } from './FleetMaintenanceView';

const mockCompany = { id: 'comp-oxen-01', name: 'Oxen Haulage Logistics' };

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    currentCompany: mockCompany,
    language: 'en',
    themeMode: 'dark',
  }),
}));

vi.mock('../services/api', () => ({
  erpApi: {
    getVehicles: vi.fn().mockResolvedValue([
      { id: 'v-101', name: 'Mercedes Actros 3340', license_plate: '7842-KAD', model: 'Actros 3340', vehicle_type: 'truck', status: 'active', odometer_km: 128450 },
    ]),
    getMaintenanceOrders: vi.fn().mockResolvedValue([]),
    getFuelTransactions: vi.fn().mockResolvedValue([]),
    getInspectionLogs: vi.fn().mockResolvedValue([]),
    getMobileTrips: vi.fn().mockResolvedValue([]),
  },
  getAuthToken: vi.fn().mockReturnValue('mock-token'),
  getTenantId: vi.fn().mockReturnValue('mock-tenant'),
}));

vi.mock('../components/FleetTracker', () => ({
  FleetTracker: () => <div data-testid="fleet-tracker-mock">Fleet Tracker Telemetry</div>,
}));

vi.mock('../components/BulkImportModal', () => ({
  BulkImportModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="bulk-import-modal-mock">Bulk Import Modal</div> : null,
}));

describe('FleetMaintenanceView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Fleet Maintenance & Fuel Operations header title and action controls', async () => {
    render(<FleetMaintenanceView />);

    expect(
      screen.getByRole('heading', { name: /Fleet Maintenance & Fuel Operations/i })
    ).toBeInTheDocument();

    const actionButton = screen.getByRole('button', { name: /Actions \/ More/i });
    expect(actionButton).toBeInTheDocument();
  });

  it('opens Action/More dropdown cleanly on top with z-index 9999 without container clipping', async () => {
    render(<FleetMaintenanceView />);

    const actionButton = screen.getByRole('button', { name: /Actions \/ More/i });
    fireEvent.click(actionButton);

    // Dropdown menu must be portalled directly into document.body
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(document.body).toContainElement(menu);
    expect(menu).toHaveStyle({ zIndex: '9999' });
    expect(menu).toHaveClass('erp-dropdown-menu-panel');

    // Menu options must all be present and rendered cleanly
    const menuScope = within(menu);
    expect(menuScope.getByText(/Bulk Import \(\.xlsx\)/i)).toBeInTheDocument();
    expect(menuScope.getByText(/JSON Snapshot/i)).toBeInTheDocument();
    expect(menuScope.getByText(/Export Excel/i)).toBeInTheDocument();
    expect(menuScope.getByText(/Export & Print/i)).toBeInTheDocument();
  });

  it('triggers Bulk Import modal from Action/More dropdown', async () => {
    render(<FleetMaintenanceView />);

    const actionButton = screen.getByRole('button', { name: /Actions \/ More/i });
    fireEvent.click(actionButton);

    const bulkImportItem = screen.getByText(/Bulk Import \(\.xlsx\)/i);
    fireEvent.click(bulkImportItem);

    // Dropdown closes and Bulk Import modal opens
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('bulk-import-modal-mock')).toBeInTheDocument();
  });

  it('initializes maintenance scheduled date and fuel transaction date inputs to blank state by default', () => {
    render(<FleetMaintenanceView />);

    // Open New Order modal
    const newOrderBtn = screen.getByRole('button', { name: /New Order/i });
    fireEvent.click(newOrderBtn);

    const scheduledDateInput = document.getElementById('maintenance-scheduled-date-input') as HTMLInputElement;
    expect(scheduledDateInput).toBeInTheDocument();
    expect(scheduledDateInput.value).toBe('');
    expect(scheduledDateInput).toHaveAttribute('placeholder', 'YYYY-MM-DD');

    // Close New Order modal and open Log Fuel modal
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    fireEvent.click(screen.getByRole('button', { name: /Log Fuel/i }));

    const fuelDateInput = document.getElementById('fuel-transaction-date-input') as HTMLInputElement;
    expect(fuelDateInput).toBeInTheDocument();
    expect(fuelDateInput.value).toBe('');
    expect(fuelDateInput).toHaveAttribute('placeholder', 'YYYY-MM-DD');
  });
});

