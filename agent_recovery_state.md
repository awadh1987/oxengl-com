# Agent Recovery State & Execution Checkpoint

## Active Specification
**UI Menu Consolidation & Layout Overhaul** (`docs/docs/ui-menu-consolidation-spec.md`)

---

## Current Status
- **Current Phase:** Phase 1: Unified Standard Sidebar (Planned - Awaiting Approval)
- **State:** Read and analyzed `docs/docs/ui-menu-consolidation-spec.md`. Mapped all popover routing items from `Navbar.tsx` (Master Data & RBAC, Chart of Accounts, Tenant Settings, Enterprise Org Profile, Executive Approvals, Subscription & Billing, Corporate Compliance Vault) to the canonical sidebar tree. Prepared `frontend/src/components/layout/Sidebar.tsx` architecture. Ready for user approval to execute Phase 1.
- **Last Sync / Commit:** Checkpoint prior to Phase 1 execution.

---

## Phase Breakdown
- [ ] **Phase 1: Unified Standard Sidebar**
  - [ ] Consolidate core navigation links into a single, unified left sidebar (`frontend/src/components/layout/Sidebar.tsx` and `frontend/src/components/Sidebar.tsx`).
  - [ ] Extract routing items hidden inside the System & Settings popover (Master Data & RBAC `/settings/master-data`, Chart of Accounts `/finance/chart`, Tenant Settings `/settings/tenant`, Enterprise Org Profile `/settings/organization`, Executive Approvals `/settings/approvals`, Subscription & Billing `/settings/billing`, Corporate Compliance Vault `/compliance/vault`).
  - [ ] Integrate extracted items cleanly into the primary sidebar tree with proper role permissions, badges, icons, and bilingual labels.
  - [ ] Ensure seamless collapsed rail, expanded drawer, and mobile drawer accessibility.
- [ ] **Phase 2: Stacked Horizontal Domain Tabs (Header)**
  - [ ] Refactor Domain Switcher in `TopHeader.tsx` / `Navbar.tsx`.
  - [ ] Place two main domain tabs ("Operations & Logistics" and "Finance, Accounting & Control") in the top header, stacked vertically using `flex-col`.
  - [ ] Implement horizontal collapsible sub-navigation lists expanding horizontally below active domain tab.
- [ ] **Phase 3: Cleanup & Build**
  - [ ] Remove legacy standalone domain switcher ribbons and redundant popover links.
  - [ ] Verify build with `npm run build`.

---

## Modified Files Log (UI Menu Consolidation)
- `agent_recovery_state.md`
