# Comprehensive Platform Remediation & E2E Wiring Plan (v2026.09)

**CRITICAL EXECUTION PROTOCOL:** Execute strictly in sequential phases. Pause after completing each phase, report the modified files, and explicitly request user approval before proceeding to the next phase.

## Phase 1: State Persistence, Master Data Wiring & Deduplication
- **Volatile Records**: Fix the bug where Financial Vouchers, Document Attachments, and Master Data Materials vanish on browser refresh. Ensure proper `POST` database commits and wire the `useEffect` hooks to `GET` data on mount.
- **Chart of Accounts (COA)**: Inject an "+ Add Account / إضافة حساب" button into the `Chart of Accounts` view. Wire it to a modal that allows users to create sub-accounts under the 5 root nodes and post to the backend.
- **Master Data Dropdowns**: Wire the empty dropdowns to their respective backend registries (Clients/Suppliers, Materials, Target Vehicle).
- **Data Deduplication**: Cleanse the duplicate records rendering in the `Master Data & Permissions Matrix` by enforcing unique ID mapping.

## Phase 2: Universal Terminology, Navigation & UI Polish
- **Universal Enterprise Terminology (Abstraction)**: NEVER hardcode legacy spreadsheet terms into the UI. Strip out all specific industry terms and replace them with universal enterprise standards across all menus, modals, and tables:
  - "Crushers / كسارات" → **"Material Suppliers / موردي المواد"**
  - "Transporters / مقاولي النقل" → **"Service Suppliers / موردي الخدمات"**
  - "Concrete Company / شركة خرسانة" → **"Clients / العملاء"**
- **Missing Navigation Menus**: Inject the missing "HR" (الموارد البشرية) and "Procurement" (المشتريات) module groups into the main `Sidebar.tsx` navigation tree.
- **Global User Avatar**: Ensure user profile picture (`avatar_url`) renders uniformly across all headers and sidebars.
- **Data Leakage Masking**: Mask raw database UUIDs and raw file hashes in the UI with human-readable references.
- **Dynamic Time Filters**: Fix the hardcoded month tabs in Daily Operations to dynamically generate up to the current month.

## Phase 3: Universal Unit of Measurement (UOM) Upgrade
- **Backend & Frontend Sync**: Upgrade ecosystem to support dynamic units: `MT طن`, `kg`, `truck`, `CBM`. 
- **Data Rendering**: Apply `MT طن` explicitly to all Weighbridge tickets, daily logs, and waste calculations.

## Phase 4: API Routing, Math Engines & Dead Buttons
- **Transporter Settlements**: Wire the dead "Issue Voucher" buttons in the ledgers to trigger the payable voucher creation modal.
- **Tafqeet & Math Fixes**: Sync the Arabic Tafqeet state with the numeric input field. Fix the ZATCA invoice math engine so Rate/Amount/VAT calculate accurately via backend Python `Decimal` logic, not frontend JavaScript.
- **Form Validation Traps**: Remove the HTML5 native validation (`required`) that blocks form submissions on custom React dropdowns.
- **500 & 403 Errors**: Resolve the `500 Internal Server Error` on ZATCA Invoicing sync and fix the `403 Access Denied` RLS failure.

## Phase 5: GPS Fleet Radar & Planning Charters
- **Fleet Radar**: Build and wire the "+ تسجيل شاحنة برادار التتبع" (Register GPS Truck) modal to capture IMEI/Plate and persist to the live radar map.
- **Planning Charter**: Wire the "إضافة ميثاق جديد +" (Provision New Charter) button to a functional slide-over modal that persists to the backend.

## Phase 6: Print, PDF Export & Sharing Engine
- **Print Standardization (@media print)**: Fix the global print views. Ensure clicking 'Export & Print' prints a clean, white-background table, stripping out the dark-mode UI. 
- **Pagination Fix**: Fix the bug where a single voucher prints twice across two pages.
- **PDF Generation Crash**: Fix the "Error generating merged PDF" crash by adding null checks for scenarios where 0 attachments are selected.
- **Async Synchronization**: Fix the JavaScript Promises on the Share buttons. The UI must `await` the PDF Blob generation before showing success toasts or opening links.

## Phase 7: Universal Bulk Import Engine & Schema Extension
- **UI Components**: Inject a standard "استيراد بيانات / Bulk Import (CSV/Excel)" button across all data entry modules.
- **Legacy Excel Parser**: The backend `/api/v1/*/bulk-import` endpoints MUST parse the legacy "قاعدة البيانات الشاملة" format and map it to the active ERP ecosystem.
- **Database Schema Extension (Superset Concept)**: Do NOT overwrite the existing relational SQLAlchemy models. EXTEND them. Ensure the models retain their current structure while adding any missing fields required to absorb the Excel columns.
- **Data Mapping Interface**: The backend must map the specific Excel headers (like "الناقل" or "الكسارة") into the universal database entities (`service_suppliers` and `material_suppliers`).

## Phase 8: E2E Audit & Deployment
- **Verification**: Run `npm run lint` and `npm run build`. Confirm Python backend compiles cleanly.
- **Deployment**: Commit all changes (`git commit -m "feat(core): e2e remediation, universal terminology, and bulk import engine"`), push to origin/main, restart services.