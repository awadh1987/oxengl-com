# OxenGL Enterprise Agent Blueprint Execution Roadmap

**Architecture Version:** v2.0-Enterprise  
**Target Environment:** Linux / PostgreSQL 15 (pgvector) / Redis 7 / FastAPI / React + Vite + Tailwind  
**Status:** In Active Execution  

---

## 🧭 Executive Architecture & Blueprint Overview

The `docs/blueprints/` folder specifies the core engineering requirements for OxenGL Enterprise. This localized execution master plan maps blueprint specifications directly into the runtime source tree.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                OXENGL PLATFORM CORE                               │
├─────────────────────────┬────────────────────────────┬────────────────────────────┤
│ Phase 1: Two-Tier Auth   │ Phase 2: Logistics & Ledger│ Phase 3: Vector AI Engine  │
│ - SuperAdmin vs Tenant  │ - Biometric HRMS Engine    │ - pgvector Search Pipelines│
│ - Argon2id Cryptography │ - Double-Entry Ledger (GL) │ - Gemini Copilot RAG       │
│ - ABAC Authorization    │ - Balanced Voucher Matrix  │ - Predictive Forecasting   │
└─────────────────────────┴────────────────────────────┴────────────────────────────┘
```

---

## 🚀 Phase 2: Biometric HRMS & Double-Entry Financial Ledgers

### 1. Database Migrations & Schemas
- **Migration ID:** `202609130006_deploy_phase2_hrms_ledger.py` (Revises `15b54a41af4d`)
- **Tables Provisioned:**
  1. `hrms_attendance_logs`:
     - Relational model: `backend/app/domains/hr/models.py` (`HrmsAttendanceLog`)
     - Columns: `id` (UUID PK), `tenant_id` (UUID), `employee_id` (FK `employees.id`), `device_id` (VARCHAR), `check_in` (TIMESTAMPTZ), `check_out` (TIMESTAMPTZ), `biometric_hash` (SHA-256), `verification_mode` (`BIOMETRIC_FINGERPRINT`).
  2. `finance_journal_entries`:
     - Relational model: `backend/app/domains/finance/models.py` (`FinanceJournalEntry`)
     - Strict DB Check Constraint: `ck_finance_journal_entries_balanced` (`total_debit = total_credit`)
     - Columns: `id` (UUID PK), `tenant_id`, `company_id`, `entry_number`, `entry_date`, `description`, `total_debit`, `total_credit`, `status` (`POSTED`), `posted_by`.
  3. `finance_journal_lines`:
     - Relational model: `backend/app/domains/finance/models.py` (`FinanceJournalLine`)
     - Check Constraint: `ck_finance_journal_lines_non_negative` (`debit >= 0 AND credit >= 0`)
     - Columns: `id` (UUID PK), `tenant_id`, `entry_id` (FK `finance_journal_entries.id`), `account_code`, `account_id` (FK `accounts.id`), `description`, `debit`, `credit`.

### 2. Double-Entry Mathematical Guard ($\sum \text{Debits} = \sum \text{Credits}$)
- **Source Path:** `backend/app/domains/finance/guards.py` & `backend/app/domains/finance/services.py`
- **Decorator:** `@enforce_double_entry_balance`
- **Validation Rule:**
  $$\sum \text{Debits} == \sum \text{Credits} \quad \text{where} \quad \text{Debits} > 0, \text{Credits} > 0$$
  If $\Delta = |\sum \text{Debits} - \sum \text{Credits}| > 0$:
  Immediately abort execution block with `HTTP 400 Bad Request`:
  `"Ledger isolation error: Unbalanced transaction. Sum of debits (...) must strictly equal sum of credits (...)."`
- **Transaction Processing Service:** `TransactionProcessingService.post_balanced_entry()` handles atomic database commits to `finance_journal_entries` and `finance_journal_lines`.
- **API Endpoints:**
  - `POST /api/v1/finance/journals`: Protected with `@enforce_double_entry_balance`.
  - `POST /api/v1/finance/vouchers/balanced`: Dedicated balanced voucher submission with mathematical guard.
  - `GET /api/v1/finance/vouchers/balanced`: Query interface for posted balanced vouchers.

### 3. Biometric HRMS & Payroll Pipeline
- **Source Paths:** `backend/app/domains/hr/services.py`, `backend/app/domains/hr/integration.py`, `backend/app/api/v1/hr.py`
- **Calculations Engine:** `AutomatedPayrollEngine`
  - Baseline monthly target: 160.0 hours.
  - Overtime Bonus ($> 160$h): $1.5\times$ hourly rate.
  - Short-Hours Penalty ($< 160$h): Prorated deduction.
  - Net Pay Formula: $\text{Gross} + \text{Allowances} - \text{Deductions}$.
- **Attendance Endpoints:**
  - `POST /api/v1/hr/attendance/biometric`: Records biometric clock logs with SHA-256 fingerprint hash.
  - `GET /api/v1/hr/attendance`: Retrieves attendance audit history for tenant workers.
- **Approval & Posting:**
  - `POST /api/v1/hr/payroll/{id}/approve`: Approves draft payroll run and auto-posts balanced 4-line GL entry (`511000`, `512000`, `111101`, `211200`).

### 4. React Frontend Balanced Voucher Grid
- **Source Paths:**
  - `frontend/src/components/finance/BalancedVoucherGrid.tsx`
  - `frontend/src/views/FinancialVouchersView.tsx`
- **UI Architecture:**
  - Dynamic voucher line items table with account code selection, description, and debit/credit inputs.
  - Real-time balance calculations calculating Total Debits, Total Credits, and Discrepancy.
  - **Dynamic Error Badge:**
    - If unbalanced: `#unbalanced-error-badge` displays discrepancy and blocks GL posting.
    - If balanced: `#balanced-status-badge` confirms mathematical equality and unlocks GL posting.
  - Preset templates for Biometric HRMS Payroll Run and Freight Clearance.
  - Integrated into `FinancialVouchersView.tsx` with seamless tab switching between cash vouchers and the double-entry matrix.

---

## 🧪 Verification & Quality Assurance Suite

All changes must strictly satisfy:
1. `npx tsc --noEmit` $\implies$ 0 errors
2. `backend/.venv/bin/pytest backend/tests/` $\implies$ All passing (including `test_double_entry_guard.py` and `test_payroll_calculation.py`)
3. `python3 scripts/migration_sanity_check.py` $\implies$ 0 blocking architecture errors
4. `npm run build` $\implies$ Clean chunk bundling and deployment to `/var/www/oxengl/dist/`
