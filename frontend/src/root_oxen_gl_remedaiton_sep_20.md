# Comprehensive Platform & Multi-Tenant Remediation Plan (v2026.09)

**CRITICAL EXECUTION PROTOCOL:** This plan must be executed in strictly sequential phases. The agent MUST pause after completing each phase, report the modified files and outcomes, and explicitly request user approval before proceeding to the next phase.

## Phase 1: Terminology Cleansing & Global Avatar
- **Global User Avatar**: Ensure user profile picture (`avatar_url`) renders uniformly across all tenant headers, navbar profiles, and sidebars (`Navbar.tsx`, `Sidebar.tsx`, `TenantLoginView.tsx`). Fallback to user initials if image fails.
- **Contractor Terminology**: Replace terms like "إضافة مقاول نقل / شاحنة جديدة" with native, broader entities: "إضافة مقاول" (Add Contractor) and "إضافة مورد ومقاول باطن" (Add Supplier and Subcontractor).
- **Clients Registry**: Generalize "إضافة عميل / شركة خرسانة جديدة" to **"إضافة عميل جديد"** (Add New Client).

## Phase 2: Universal Unit of Measurement (UOM) Upgrade
- **Backend Models**: Update SQLAlchemy models, database migrations, and Pydantic schemas across Operations, Logistics, and Inventory to support a dynamic `unit_of_measure` field.
- **Frontend Inputs**: Replace hardcoded units with a UOM selector supporting: `MT` (Metric Ton / طن), `kg` (Kilogram / كجم), `truck` (Truckload / شاحنة), `CBM` (Cubic Meter / متر مكعب).
- **Data Rendering**: Ensure all tables, weighbridge tickets, and waste calculations explicitly display the selected unit across all tenants.

## Phase 3: GPS Fleet Radar Registration Flow
- **UI Button**: In `FleetMapView.tsx` / `FleetOperationsView.tsx`, add "+ تسجيل شاحنة برادار التتبع / Register GPS Truck".
- **Registration Modal**: Implement a modal capturing Plate Number, Carrier ID, GPS Tracker ID (IMEI), and Target Temp Bounds.
- **Backend API**: Post payload to `/api/v1/logistics/fleet/register` and ensure the live radar array updates dynamically.

## Phase 4: Planning Department Charter Activation
- **UI Wiring**: Fix the dead-end button "إضافة ميثاق جديد + / Provision New Charter +" in the Planning modules to open a functional slide-over modal (Charter Title, Budget, Milestones, Lead).
- **Backend Integration**: Persist the form data to `/api/v1/planning/charters` and trigger reactive state re-renders upon success.

## Phase 5: Platform-Wide E2E Audit & Deployment
- **Audit**: Scan all buttons across OxenGL and isolated tenants to ensure ZERO dead triggers. Every action must map to a functional modal or endpoint respecting RLS L3 multi-tenant boundaries.
- **Build & Verification**: Run `npm run lint` and `npm run build` in `frontend/`. Confirm backend Python modules compile flawlessly.
- **Deployment**: Commit all changes (`git commit -m "feat(core): phased e2e remediation completed"`), push to origin/main, restart `oxengl.service`, and reload Nginx.
