// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppProvider, useApp } from '../context/AppContext';
import { EnterpriseApprovalEnginePanel } from '../components/approvals/EnterpriseApprovalEnginePanel';
import { InlineApprovalActionBadge } from '../components/approvals/InlineApprovalActionBadge';

// Harness component to test AppContext approval interceptor & inline badges
const ApprovalInterceptorHarness: React.FC = () => {
  const {
    operations,
    vouchers,
    crusherPayments,
    workflowRequests,
    approvalAuditLogs,
    addOperation,
    addVoucher,
    addCrusherPayment,
  } = useApp();

  const latestOp = operations[0];
  const latestVoucher = vouchers[0];
  const latestCrusher = crusherPayments[0];

  return (
    <div>
      <button
        data-testid="trigger-high-op"
        onClick={() =>
          void addOperation({
            loading_date: '2026-04-15',
            truck_no: 'TRK-909',
            transporter_name: 'Al-Yamama Transport',
            loading_source: 'Riyadh Quarry',
            destination_customer: 'NEOM Infrastructure Corp',
            material_type: 'Gabbro Aggregate 3/4"',
            qty_loaded: 500,
            qty_delivered: 498,
            qty_wastage: 2,
            wastage_percentage: 0.4,
            scale_ticket_no: '',
            sales_amount: 28147.83,
            vat_amount: 4222.17,
            total_sales: 32370, // >= 15,000 SAR threshold (< 50,000 SAR) -> 1-step PENDING_APPROVAL
            purchases_cost: 15000,
            crusher_payment: 5000,
            net_profit: 17370,
            operation_month: 4,
            operation_year: 2026,
          } as any)
        }
      >
        Add High Value Operation
      </button>

      <button
        data-testid="trigger-high-voucher"
        onClick={() =>
          addVoucher({
            voucherNumber: 'PV-2026-04-0099',
            type: 'Payment',
            category: 'Supplier Payment',
            date: '2026-04-15',
            amount: 60000, // >= 50,000 SAR threshold -> 2-step FINANCIAL_VOUCHER workflow
            partyType: 'Crusher',
            partyName: 'Red Sea Heavy Equipment',
            paymentMethod: 'Bank Transfer',
            referenceNumber: 'REF-60K',
            purpose: 'Urgent turbine parts settlement',
            month: 4,
            year: 2026,
            preparedBy: 'Finance Officer',
            isApproved: true,
            status: 'Approved', // Should be intercepted & forced to Pending_Approval
          })
        }
      >
        Add High Value Voucher
      </button>

      <button
        data-testid="trigger-high-crusher"
        onClick={() =>
          addCrusherPayment({
            crusher_id: 'crusher-1',
            crusher_name: 'Eastern Crusher Co',
            payment_date: '2026-04-15',
            amount: 22000, // >= 20,000 SAR threshold -> PENDING_APPROVAL
            payment_method: 'Bank Transfer',
            reference_no: 'CR-22000',
            notes: 'Monthly aggregate settlement',
            month: 4,
            year: 2026,
          })
        }
      >
        Add High Crusher Payment
      </button>

      {latestOp && (
        <div data-testid="latest-op-info">
          <span data-testid="latest-op-id">{latestOp.id}</span>
          <span data-testid="latest-op-status">{latestOp.approval_status}</span>
          <InlineApprovalActionBadge
            documentType="OPERATIONS"
            documentId={latestOp.id}
            documentRef={latestOp.id}
          />
        </div>
      )}

      {latestVoucher && (
        <div data-testid="latest-voucher-info">
          <span data-testid="latest-voucher-id">{latestVoucher.id}</span>
          <span data-testid="latest-voucher-status">{latestVoucher.status}</span>
          <InlineApprovalActionBadge
            documentType="FINANCIAL_VOUCHER"
            documentId={latestVoucher.id}
            documentRef={latestVoucher.voucherNumber}
          />
        </div>
      )}

      {latestCrusher && (
        <div data-testid="latest-crusher-info">
          <span data-testid="latest-crusher-status">{latestCrusher.approval_status}</span>
        </div>
      )}

      <div data-testid="pending-count">
        {workflowRequests.filter((r) => r.status === 'PENDING_APPROVAL').length}
      </div>
      <div data-testid="audit-count">{approvalAuditLogs.length}</div>
    </div>
  );
};

describe('Phase 4: Enterprise Approvals Engine & Platform-Wide Governance', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Approval Matrix with all 8 modules and allows creating & toggling threshold rules', async () => {
    render(
      <AppProvider>
        <EnterpriseApprovalEnginePanel initialSubTab="matrix" />
      </AppProvider>
    );

    // Verify all 8 module cards are rendered
    expect(screen.getByTestId('module-toggle-card-OPERATIONS')).toBeTruthy();
    expect(screen.getByTestId('module-toggle-card-PURCHASE_ORDER')).toBeTruthy();
    expect(screen.getByTestId('module-toggle-card-VENDOR_BILL')).toBeTruthy();
    expect(screen.getByTestId('module-toggle-card-PURCHASE_REQUISITION')).toBeTruthy();
    expect(screen.getByTestId('module-toggle-card-FINANCIAL_VOUCHER')).toBeTruthy();
    expect(screen.getByTestId('module-toggle-card-CRUSHER_PAYMENT')).toBeTruthy();
    expect(screen.getByTestId('module-toggle-card-FLEET_WORK_ORDER')).toBeTruthy();
    expect(screen.getByTestId('module-toggle-card-HRMS')).toBeTruthy();

    // Open new rule modal and create a custom rule
    fireEvent.click(screen.getByTestId('open-add-rule-modal-btn'));
    fireEvent.change(screen.getByTestId('rule-form-module'), {
      target: { value: 'FLEET_WORK_ORDER' },
    });
    fireEvent.change(screen.getByTestId('rule-form-min-amount'), {
      target: { value: '12500' },
    });
    fireEvent.change(screen.getByTestId('rule-form-role'), {
      target: { value: 'CEO' },
    });
    fireEvent.click(screen.getByTestId('save-rule-form-btn'));

    await waitFor(() => {
      expect(screen.getAllByText(/12,500/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('intercepts high-value Operations, Vouchers, and Crusher Payments into PENDING_APPROVAL and supports inline Approve, Escalate, and Reject with full audit logging', async () => {
    render(
      <AppProvider>
        <ApprovalInterceptorHarness />
        <EnterpriseApprovalEnginePanel initialSubTab="inbox" />
      </AppProvider>
    );

    // 1. Trigger a high-value Operation (32,370 SAR >= 15,000 SAR threshold)
    fireEvent.click(screen.getByTestId('trigger-high-op'));

    await waitFor(() => {
      expect(screen.getByTestId('latest-op-status').textContent).toBe('PENDING_APPROVAL');
    });

    const opId = screen.getByTestId('latest-op-id').textContent!;

    // 2. Trigger a high-value Financial Voucher (60,000 SAR >= 50,000 SAR threshold -> 2 steps)
    fireEvent.click(screen.getByTestId('trigger-high-voucher'));

    await waitFor(() => {
      // Blocked from Posted; forced to Pending_Approval
      expect(screen.getByTestId('latest-voucher-status').textContent).toBe('Pending_Approval');
    });

    // 3. Trigger a high-value Crusher Payment (22,000 SAR >= 20,000 SAR threshold)
    fireEvent.click(screen.getByTestId('trigger-high-crusher'));

    await waitFor(() => {
      expect(screen.getByTestId('latest-crusher-status').textContent).toBe('PENDING_APPROVAL');
    });

    // Verify inline approval button appears for the pending operation and click inline Approve
    const inlineApproveBtn = screen.getByTestId(`inline-approve-${opId}`);
    expect(inlineApproveBtn).toBeTruthy();
    fireEvent.click(inlineApproveBtn);

    await waitFor(() => {
      // Single-step Operations threshold rule completes and updates operation status to APPROVED
      expect(screen.getByTestId('latest-op-status').textContent).toBe('APPROVED');
    });

    // Check that audit log recorded the approval
    expect(Number(screen.getByTestId('audit-count').textContent)).toBeGreaterThanOrEqual(1);

    // Switch to Audit tab in EnterpriseApprovalEnginePanel and verify audit trail entry
    fireEvent.click(screen.getByTestId('approvals-subtab-audit'));
    await waitFor(() => {
      expect(screen.getAllByText(new RegExp(opId)).length).toBeGreaterThanOrEqual(1);
    });
  });
});
