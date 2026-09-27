# OxenGl ERP — Global Platform Responsive Design & Layout Overhaul Specification

## 1. Executive Summary
This document establishes the mandatory UI/UX and CSS engineering standards to resolve mobile responsiveness defects, text direction (bidi) bugs, layout collisions, and viewport sizing errors **globally across the entire OxenGl ERP platform** (including Fleet Operations, Procurement, S2P, Finance, HR, and all administrative dashboards).

---

## 2. Global Platform-Wide Responsive Engineering Standards

### Fix 1: Global Mixed-Direction Text & Alphanumeric Isolation (Alert Banners & Telemetry)
* **Problem:** Across the ERP, mixed Arabic interfaces combined with English error codes, vehicle IDs, and metric units (e.g., `V-1002`, `16.80 KM`, invoice numbers, PO references) cause punctuation, dashes, and number strings to flip or break layout flow.
* **Global Requirement:** Update all global notification banners, warning widgets, table data cells, and telemetry headers to explicitly isolate alphanumeric codes and units using `dir="ltr"` and `unicode-bidi: isolate;`.
* **Code Pattern:**
  ```html
  <span dir="ltr" class="inline-block unicode-bidi-isolate font-mono">V-1002</span>
  <span dir="ltr" class="inline-block unicode-bidi-isolate">16.80 KM</span>

  Fix 2: Global Sidebar Drawers & Floating Action Button (FAB) Safe-Area Layering
Problem: Persistent desktop sidebars (Navigation, module sub-menus) collide with mobile viewports, and floating action buttons or quick-action tools overlap essential lower-screen grid cards.

Global Requirement: Convert all permanent sidebar structures platform-wide into responsive collapsible drawers (hidden md:block with mobile off-canvas drawer states). Ensure all floating buttons and action bars utilize proper z-index hierarchies (z-40) and account for mobile safe areas (env(safe-area-inset-bottom)).

Code Pattern:

CSS
.erp-mobile-fab {
  position: fixed;
  bottom: calc(1.5rem + env(safe-area-inset-bottom));
  right: 1.5rem;
  z-index: 40;
}
Fix 3: Global Status Badge & Metadata Pill Wrapping
Problem: Status indicators, tags, and metadata pills (e.g., Matched, Approved, FPS 60, ZATCA P2) clip, overflow, or force unwanted horizontal scrolling in narrow data tables and card headers.

Global Requirement: Refactor all table cells, card headers, and filter bars across the entire ERP to use wrapping flex containers (flex-wrap) with tight row/column gaps, ensuring individual badges maintain whitespace-nowrap.

Code Pattern:

HTML
<div class="flex flex-wrap items-center gap-1.5 md:gap-2">
  <span class="whitespace-nowrap px-2 py-0.5 text-xs rounded bg-slate-800 text-emerald-400 border border-slate-700">MATCHED</span>
</div>
Fix 4: Global Mobile Card Layout & Gutters
Problem: Dashboard cards, metric summaries, and data grid containers across procurement, fleet, and finance stretch edge-to-edge on mobile screens without safety margins.

Global Requirement: Enforce a mobile-first responsive padding utility (px-3 sm:px-4 md:px-6) and fluid column scaling (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4) on every major module container across the platform.

Code Pattern:

HTML
<div class="px-3 sm:px-4 md:px-6 w-full max-w-7xl mx-auto">
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
    <!-- Enterprise Cards -->
  </div>
</div>
Fix 5: Global Mobile Viewport Height Handling (h-dvh)
Problem: Using rigid h-screen (100vh) classes on main application wrappers causes content clipping and erratic scrolling behavior when mobile browser address bars expand and collapse.

Global Requirement: Replace all instances of h-screen and min-h-screen layout wrappers platform-wide with modern dynamic viewport units (h-dvh / min-h-dvh).

Code Pattern:

CSS
.erp-viewport-root {
  min-height: 100vh;
  min-height: 100dvh;
}
