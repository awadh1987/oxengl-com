# Phase 2: Biometric HRMS & Double-Entry Financial Ledgers Specification

## 1. Database Migrations
- Relational tables: `hrms_attendance_logs`, `finance_journal_entries`, `finance_journal_lines`.
- Double-entry constraint: Sum of debits must match sum of credits at the transactional layer.
