// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DailyOperationsModal } from './DailyOperationsModal';

const mockAddOperation = vi.fn();
const mockUpdateOperation = vi.fn();
const mockShowToast = vi.fn();

// Stable references to prevent infinite re-render loops in useEffect
const STABLE_CUSTOMERS = [
  { id: 'cust-1', customerName: 'Yamama Cement Co.' },
  { id: 'cust-2', customerName: 'Saudi ReadyMix' },
];
const STABLE_CRUSHERS = [
  { id: 'crush-1', crusherName: 'Riyadh Primary Crusher', location: 'Rumah Road' },
  { id: 'crush-2', crusherName: 'Eastern Quarry', location: 'Dammam' },
];
const STABLE_TRANSPORTERS = [
  { id: 'trans-1', transporterName: 'Najd Haulage Fleet', driverName: 'Ahmed Al-Salem', defaultTruckNo: '7842-ق أ د' },
  { id: 'trans-2', transporterName: 'Al-Majd Transport', driverName: 'Khalid Tariq', defaultTruckNo: '1122-ب س ك' },
];
const STABLE_MATERIALS = [
  { id: 'mat-1', nameAr: 'حصى سن 1/2', nameEn: 'Aggregate 1/2', defaultSellingPrice: 44, defaultPurchasePrice: 25 },
  { id: 'mat-2', nameAr: 'رمل أبيض', nameEn: 'White Sand', defaultSellingPrice: 38, defaultPurchasePrice: 20 },
];
const STABLE_USER = { id: 'u1', fullName: 'Engineer Moath', role: 'admin' };
const STABLE_OPERATIONS: any[] = [];

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    operations: STABLE_OPERATIONS,
    customers: STABLE_CUSTOMERS,
    crushers: STABLE_CRUSHERS,
    transporters: STABLE_TRANSPORTERS,
    materials: STABLE_MATERIALS,
    addOperation: mockAddOperation,
    updateOperation: mockUpdateOperation,
    language: 'en',
    currentUser: STABLE_USER,
    canAccessFinancials: true,
    showToast: mockShowToast,
  }),
}));

vi.mock('./DynamicFieldRenderer', () => ({
  DynamicFieldRenderer: () => <div data-testid="mock-dynamic-fields" />,
}));

describe('DailyOperationsModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders "Add New Trip (Daily Operations Entry)" modal when open', () => {
    render(<DailyOperationsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/Add New Trip \(Daily Operations Entry\)/i)).toBeInTheDocument();
  });

  it('verifies previously locked/auto-generated cells are now fully editable and interactive', async () => {
    render(<DailyOperationsModal isOpen={true} onClose={vi.fn()} />);

    // 1. Scale Ticket Number
    const scaleTicketInput = screen.getByLabelText(/Scale Ticket Number/i) as HTMLInputElement;
    expect(scaleTicketInput).not.toBeDisabled();
    expect(scaleTicketInput).not.toHaveAttribute('readonly');
    fireEvent.change(scaleTicketInput, { target: { value: 'CUSTOM-ST-999' } });
    expect(scaleTicketInput.value).toBe('CUSTOM-ST-999');

    // 2. Loading Invoice Number
    const loadingInvoiceInput = screen.getByLabelText(/Loading Invoice Number/i) as HTMLInputElement;
    expect(loadingInvoiceInput).not.toBeDisabled();
    expect(loadingInvoiceInput).not.toHaveAttribute('readonly');
    fireEvent.change(loadingInvoiceInput, { target: { value: 'CUSTOM-LOAD-888' } });
    expect(loadingInvoiceInput.value).toBe('CUSTOM-LOAD-888');

    // 3. Receipt Invoice Number
    const receiptInvoiceInput = screen.getByLabelText(/Receipt Invoice Number/i) as HTMLInputElement;
    expect(receiptInvoiceInput).not.toBeDisabled();
    expect(receiptInvoiceInput).not.toHaveAttribute('readonly');
    fireEvent.change(receiptInvoiceInput, { target: { value: 'CUSTOM-REC-777' } });
    expect(receiptInvoiceInput.value).toBe('CUSTOM-REC-777');
  });

  it('opens dropdown selectors on click with high z-index and displays menu items cleanly without clipping', () => {
    render(<DailyOperationsModal isOpen={true} onClose={vi.fn()} />);

    // Find Transporter dropdown trigger button by its label
    const transporterTrigger = screen.getByRole('combobox', { name: /Service Supplier Name/i });
    expect(transporterTrigger).toBeInTheDocument();
    expect(transporterTrigger).toHaveTextContent('Najd Haulage Fleet');

    // Click to open dropdown
    fireEvent.click(transporterTrigger);

    // Dropdown listbox should be portalled to document.body with zIndex 9999
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(listbox).toHaveStyle({ zIndex: '9999' });
    expect(document.body).toContainElement(listbox);

    const listboxScope = within(listbox);
    expect(listboxScope.getByText('Najd Haulage Fleet')).toBeInTheDocument();
    expect(listboxScope.getByText('Al-Majd Transport')).toBeInTheDocument();

    // Select second transporter
    fireEvent.click(listboxScope.getByText('Al-Majd Transport'));

    // Verify trigger updated to reflect new selection
    expect(transporterTrigger).toHaveTextContent('Al-Majd Transport');
  });

  it('enforces Zero-Default-Date Principle and clean initial numeric/ticket states on a new trip entry', () => {
    render(<DailyOperationsModal isOpen={true} onClose={vi.fn()} />);

    const loadingDateInput = screen.getByLabelText(/Loading Date/i) as HTMLInputElement;
    expect(loadingDateInput).toBeInTheDocument();
    expect(loadingDateInput.value).toBe('');
    expect(loadingDateInput).toHaveAttribute('placeholder', 'YYYY-MM-DD');

    // Verify numeric fields initialize cleanly without stale dummy values
    expect((screen.getByLabelText(/Loaded Weight/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Received Weight/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Sales Amount Excl\. VAT/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Raw Materials Supplier Cost/i) as HTMLInputElement).value).toBe('');

    // Verify ticket/invoice numbers initialize cleanly
    expect((screen.getByLabelText(/Scale Ticket Number/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Loading Invoice Number/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Receipt Invoice Number/i) as HTMLInputElement).value).toBe('');

    // Attempt submit without entering a loading date
    const submitBtn = screen.getByRole('button', { name: /Register Trip Entry/i });
    fireEvent.click(submitBtn);

    expect(mockAddOperation).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/Please fill all required fields/i),
      'warning'
    );
  });

  it('submits form with updated user-entered values in payload', async () => {
    render(<DailyOperationsModal isOpen={true} onClose={vi.fn()} />);

    // Enter explicit Loading Date (required under Zero-Default-Date Principle)
    const loadingDateInput = screen.getByLabelText(/Loading Date/i);
    fireEvent.change(loadingDateInput, { target: { value: '2026-05-15' } });

    // Update truck number
    const truckInput = screen.getByLabelText(/Truck Number/i);
    fireEvent.change(truckInput, { target: { value: '9999-XYZ' } });

    // Update scale ticket number
    const scaleTicketInput = screen.getByLabelText(/Scale Ticket Number/i);
    fireEvent.change(scaleTicketInput, { target: { value: 'MY-SCALE-TICKET-01' } });

    // Update loading invoice number
    const loadingInvoiceInput = screen.getByLabelText(/Loading Invoice Number/i);
    fireEvent.change(loadingInvoiceInput, { target: { value: 'MY-LOAD-INV-01' } });

    // Update receipt invoice number
    const receiptInvoiceInput = screen.getByLabelText(/Receipt Invoice Number/i);
    fireEvent.change(receiptInvoiceInput, { target: { value: 'MY-REC-INV-01' } });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /Register Trip Entry/i });
    fireEvent.click(submitBtn);

    expect(mockAddOperation).toHaveBeenCalledTimes(1);
    const submittedPayload = mockAddOperation.mock.calls[0][0];

    expect(submittedPayload.loading_date).toBe('2026-05-15');
    expect(submittedPayload.operation_month).toBe(5);
    expect(submittedPayload.operation_year).toBe(2026);
    expect(submittedPayload.truck_no).toBe('9999-XYZ');
    expect(submittedPayload.scale_ticket_no).toBe('MY-SCALE-TICKET-01');
    expect(submittedPayload.loading_invoice_no).toBe('MY-LOAD-INV-01');
    expect(submittedPayload.receipt_invoice_no).toBe('MY-REC-INV-01');
  });
});

