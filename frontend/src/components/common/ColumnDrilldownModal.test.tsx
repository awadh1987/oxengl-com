// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  ColumnDrilldownModal,
  OxenColumnDef,
  OxenColumnHeader,
  OxenActiveFiltersBar,
  useOxenColumnFilter,
} from './ColumnDrilldownModal';

afterEach(() => {
  cleanup();
});

interface MockTripRow {
  id: string;
  trip_id: string;
  date: string;
  truck_plate: string;
  service_supplier: string;
  origin: string;
  destination: string;
  material: string;
  qty_loaded: number;
  qty_delivered: number;
  wastage_pct: number;
  sales_amount: number;
  purchases_cost: number;
  paid_supplier: number;
  net_profit: number;
  scale_ticket: string;
  has_attachment: boolean;
  record_state: string;
  approval_status: string;
}

const SAMPLE_TRIPS: MockTripRow[] = [
  {
    id: '1',
    trip_id: 'TRP-1001',
    date: '2026-03-10',
    truck_plate: 'KSA-9011',
    service_supplier: 'Al-Majd Logistics',
    origin: 'Riyadh Quarry A',
    destination: 'NEOM Sector 4',
    material: 'Washed Sand',
    qty_loaded: 42.5,
    qty_delivered: 42.0,
    wastage_pct: 1.18,
    sales_amount: 4200,
    purchases_cost: 2800,
    paid_supplier: 2800,
    net_profit: 1400,
    scale_ticket: 'TKT-8801',
    has_attachment: true,
    record_state: 'Verified',
    approval_status: 'Settled',
  },
  {
    id: '2',
    trip_id: 'TRP-1002',
    date: '2026-03-12',
    truck_plate: 'KSA-9011',
    service_supplier: 'Al-Majd Logistics',
    origin: 'Riyadh Quarry A',
    destination: 'Diriyah Gate',
    material: 'Aggregate 20mm',
    qty_loaded: 40.0,
    qty_delivered: 38.0,
    wastage_pct: 5.0,
    sales_amount: 3800,
    purchases_cost: 2600,
    paid_supplier: 1500,
    net_profit: 1200,
    scale_ticket: 'TKT-8802',
    has_attachment: false,
    record_state: 'High Wastage (>2%)',
    approval_status: 'Partial / Open',
  },
  {
    id: '3',
    trip_id: 'TRP-1003',
    date: '2026-03-15',
    truck_plate: 'KSA-4420',
    service_supplier: 'Najd Heavy Haul',
    origin: 'Dammam Crusher',
    destination: 'Qiddiya Hub',
    material: 'Washed Sand',
    qty_loaded: 45.0,
    qty_delivered: 45.0,
    wastage_pct: 0.0,
    sales_amount: 5000,
    purchases_cost: 3100,
    paid_supplier: 3100,
    net_profit: 1900,
    scale_ticket: 'Pending',
    has_attachment: false,
    record_state: 'Verified',
    approval_status: 'Settled',
  },
];

const COLUMNS: OxenColumnDef<MockTripRow>[] = [
  { key: 'trip_id', label: 'Trip ID', type: 'categorical', getValue: (r) => r.trip_id },
  { key: 'date', label: 'Date', type: 'date', getValue: (r) => r.date },
  { key: 'truck_plate', label: 'Truck #', type: 'categorical', getValue: (r) => r.truck_plate },
  { key: 'service_supplier', label: 'Service Supplier', type: 'categorical', getValue: (r) => r.service_supplier },
  { key: 'origin', label: 'Origin / Dispatch Facility', type: 'categorical', getValue: (r) => r.origin },
  { key: 'destination', label: 'Destination Client', type: 'categorical', getValue: (r) => r.destination },
  { key: 'material', label: 'Material', type: 'categorical', getValue: (r) => r.material },
  { key: 'qty_loaded', label: 'Loaded Qty', type: 'numeric', unit: 'MT', getValue: (r) => r.qty_loaded, getNumericValue: (r) => r.qty_loaded },
  { key: 'qty_delivered', label: 'Delivered Qty', type: 'numeric', unit: 'MT', getValue: (r) => r.qty_delivered, getNumericValue: (r) => r.qty_delivered },
  { key: 'wastage_pct', label: 'Wastage (%)', type: 'numeric', unit: '%', getValue: (r) => r.wastage_pct, getNumericValue: (r) => r.wastage_pct },
  { key: 'sales_amount', label: 'Sales Excl. VAT', type: 'numeric', unit: 'SAR', getValue: (r) => r.sales_amount, getNumericValue: (r) => r.sales_amount },
  { key: 'purchases_cost', label: 'Purchase Cost', type: 'numeric', unit: 'SAR', getValue: (r) => r.purchases_cost, getNumericValue: (r) => r.purchases_cost },
  { key: 'paid_supplier', label: 'Paid to Raw Materials Supplier', type: 'numeric', unit: 'SAR', getValue: (r) => r.paid_supplier, getNumericValue: (r) => r.paid_supplier },
  { key: 'net_profit', label: 'Net Profit', type: 'numeric', unit: 'SAR', getValue: (r) => r.net_profit, getNumericValue: (r) => r.net_profit },
  { key: 'scale_ticket', label: 'Scale Ticket', type: 'categorical', getValue: (r) => r.scale_ticket },
  {
    key: 'actions',
    label: 'Actions',
    type: 'actions',
    getValue: (r) => r.record_state,
    getActionFlags: (r) => ({
      hasAttachment: r.has_attachment,
      recordState: r.record_state,
      approvalStatus: r.approval_status,
    }),
  },
];

const InteractiveGridHarness: React.FC = () => {
  const {
    columnFilters,
    filteredData,
    activeDrilldownColumn,
    openDrilldown,
    closeDrilldown,
    setColumnFilter,
    clearAllColumnFilters,
    isColumnFiltered,
    getColumnDef,
  } = useOxenColumnFilter(SAMPLE_TRIPS, COLUMNS);

  return (
    <div>
      <OxenActiveFiltersBar
        columns={COLUMNS}
        columnFilters={columnFilters}
        onOpenColumn={openDrilldown}
        onClearColumn={(k) => setColumnFilter(k, null)}
        onClearAll={clearAllColumnFilters}
        totalCount={SAMPLE_TRIPS.length}
        filteredCount={filteredData.length}
      />
      <table>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <OxenColumnHeader
                key={col.key}
                column={getColumnDef(col.key)}
                isFiltered={isColumnFiltered(col.key)}
                onOpen={() => openDrilldown(col.key)}
                onClear={() => setColumnFilter(col.key, null)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredData.map((row) => (
            <tr key={row.id} data-testid={`trip-row-${row.trip_id}`}>
              <td>{row.trip_id}</td>
              <td>{row.truck_plate}</td>
              <td>{row.net_profit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ColumnDrilldownModal
        isOpen={Boolean(activeDrilldownColumn)}
        column={activeDrilldownColumn}
        data={SAMPLE_TRIPS}
        currentFilter={
          activeDrilldownColumn ? columnFilters[activeDrilldownColumn.key] : null
        }
        onApply={setColumnFilter}
        onClose={closeDrilldown}
      />
    </div>
  );
};

describe('Phase 3 — Universal Interactive Column Header Filter & Drill-Down Engine', () => {
  it('renders all 16 specified Daily Operations column headers as interactive drill-down triggers', () => {
    render(<InteractiveGridHarness />);

    const expectedLabels = [
      'Trip ID',
      'Date',
      'Truck #',
      'Service Supplier',
      'Origin / Dispatch Facility',
      'Destination Client',
      'Material',
      'Loaded Qty',
      'Delivered Qty',
      'Wastage (%)',
      'Sales Excl. VAT',
      'Purchase Cost',
      'Paid to Raw Materials Supplier',
      'Net Profit',
      'Scale Ticket',
      'Actions',
    ];

    expectedLabels.forEach((label) => {
      const btn = screen.getByTitle(`Click to drill down & filter by ${label}`);
      expect(btn).toBeInTheDocument();
    });
  });

  it('Categorical drill-down shows distinct entities, occurrence counts, MT/SAR totals, and filters multi-select', () => {
    render(<InteractiveGridHarness />);

    fireEvent.click(screen.getByTitle('Click to drill down & filter by Truck #'));

    const dialog = screen.getByRole('dialog', {
      name: /Truck # Column Drill-Down & Filter/i,
    });
    expect(dialog).toBeInTheDocument();

    // KSA-9011 appears 2 times (42+38 = 80.00 MT, 4200+3800 = 8,000.00 SAR)
    expect(within(dialog).getByText('KSA-9011')).toBeInTheDocument();
    expect(within(dialog).getByText('80.00')).toBeInTheDocument();
    expect(within(dialog).getByText('8,000.00')).toBeInTheDocument();

    // Select KSA-4420 only
    fireEvent.click(within(dialog).getByText('KSA-4420'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Apply Filter/i }));

    expect(screen.queryByTestId('trip-row-TRP-1001')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trip-row-TRP-1002')).not.toBeInTheDocument();
    expect(screen.getByTestId('trip-row-TRP-1003')).toBeInTheDocument();
  });

  it('Date column drill-down initializes From/To date inputs to blank ("") per Phase 1 rule and filters by date range', () => {
    render(<InteractiveGridHarness />);

    fireEvent.click(screen.getByTitle('Click to drill down & filter by Date'));

    const dialog = screen.getByRole('dialog', {
      name: /Date Column Drill-Down & Filter/i,
    });

    const fromInput = within(dialog).getByLabelText('From Date') as HTMLInputElement;
    const toInput = within(dialog).getByLabelText('To Date') as HTMLInputElement;

    // Strictly blank default state (Zero-Default-Date rule)
    expect(fromInput.value).toBe('');
    expect(toInput.value).toBe('');

    // Filter between 2026-03-11 and 2026-03-14 (only TRP-1002 on 2026-03-12 matches)
    fireEvent.change(fromInput, { target: { value: '2026-03-11' } });
    fireEvent.change(toInput, { target: { value: '2026-03-14' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Apply Filter/i }));

    expect(screen.queryByTestId('trip-row-TRP-1001')).not.toBeInTheDocument();
    expect(screen.getByTestId('trip-row-TRP-1002')).toBeInTheDocument();
    expect(screen.queryByTestId('trip-row-TRP-1003')).not.toBeInTheDocument();
  });

  it('Numeric / Financial column drill-down computes instant Sum, Average, Min, Max and filters by operator', () => {
    render(<InteractiveGridHarness />);

    fireEvent.click(screen.getByTitle('Click to drill down & filter by Net Profit'));

    const dialog = screen.getByRole('dialog', {
      name: /Net Profit Column Drill-Down & Filter/i,
    });

    // Net profits: 1400, 1200, 1900 -> Sum = 4500.00, Avg = 1500.00, Min = 1200.00, Max = 1900.00
    expect(within(dialog).getByTestId('drilldown-agg-sum')).toHaveTextContent('4,500.00');
    expect(within(dialog).getByTestId('drilldown-agg-avg')).toHaveTextContent('1,500.00');
    expect(within(dialog).getByTestId('drilldown-agg-min')).toHaveTextContent('1,200.00');
    expect(within(dialog).getByTestId('drilldown-agg-max')).toHaveTextContent('1,900.00');

    // Switch operator to '>' (gt) and threshold to 1500
    const operatorSelect = within(dialog).getByLabelText('Comparison Operator');
    fireEvent.change(operatorSelect, { target: { value: 'gt' } });

    const thresholdInput = within(dialog).getByLabelText('Target Threshold Value');
    fireEvent.change(thresholdInput, { target: { value: '1500' } });

    // Aggregations dynamically recalculate for matching records (only 1900 matches)
    expect(within(dialog).getByTestId('drilldown-agg-sum')).toHaveTextContent('1,900.00');

    fireEvent.click(within(dialog).getByRole('button', { name: /Apply Filter/i }));

    expect(screen.queryByTestId('trip-row-TRP-1001')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trip-row-TRP-1002')).not.toBeInTheDocument();
    expect(screen.getByTestId('trip-row-TRP-1003')).toBeInTheDocument();
  });

  it('Actions column drill-down filters by attachment presence and operational state', () => {
    render(<InteractiveGridHarness />);

    fireEvent.click(screen.getByTitle('Click to drill down & filter by Actions'));

    const dialog = screen.getByRole('dialog', {
      name: /Actions Column Drill-Down & Filter/i,
    });

    // Filter by "Has Attachment" (only TRP-1001 has attachment)
    fireEvent.click(within(dialog).getByRole('button', { name: /Has Attachment/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Apply Filter/i }));

    expect(screen.getByTestId('trip-row-TRP-1001')).toBeInTheDocument();
    expect(screen.queryByTestId('trip-row-TRP-1002')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trip-row-TRP-1003')).not.toBeInTheDocument();

    // Clear all filters via OxenActiveFiltersBar
    fireEvent.click(screen.getByRole('button', { name: /Clear All/i }));
    expect(screen.getByTestId('trip-row-TRP-1001')).toBeInTheDocument();
    expect(screen.getByTestId('trip-row-TRP-1002')).toBeInTheDocument();
    expect(screen.getByTestId('trip-row-TRP-1003')).toBeInTheDocument();
  });
});
