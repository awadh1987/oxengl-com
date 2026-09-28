# UI Menu Consolidation & Layout Overhaul

## Objective
Unify the currently fragmented navigation system (scattered across the Sidebar, Top Ribbon, and Settings Popover) into a standardized layout. 

## Phase 1: Unified Standard Sidebar
- **Target:** `frontend/src/components/layout/Sidebar.tsx` (and related routing components).
- **Action:** Consolidate all core navigation links into a single, unified left sidebar. 
- **Migration:** Extract the routing items currently hidden inside the System & Settings popover (e.g., Master Data & RBAC, Chart of Accounts, Tenant Settings, Enterprise Org Profile) and integrate them cleanly into the primary sidebar tree.

## Phase 2: Stacked Horizontal Domain Tabs (Header)
- **Target:** `frontend/src/components/layout/TopHeader.tsx` or `Navbar.tsx`.
- **Action:** Refactor the "Domain Switcher" area. 
- **Layout:** Place the two main domain tabs ("Operations & Logistics" and "Finance, Accounting & Control") in the top header, but stack them vertically (one above the other) using `flex-col`.
- **Interactivity:** Implement horizontal (افقي) collapsible sub-navigation lists for each of these two main tabs. When a main tab is clicked/active, its respective sub-menu should expand horizontally below it.

## Phase 3: Cleanup & Build
- **Action:** Remove the legacy standalone domain switcher ribbons and redundant settings menu links to prevent duplicate routing.
- **Verification:** Run `npm run build` to verify TypeScript interfaces and routing paths.