Transform the current high-density navigation layouts into an enterprise-grade, clean dashboard interface. This specification addresses sidebar clutter, dual-row top navigation crowding, floating widget layout collisions, and unhandled button actions across all primary views.
Collapsible Accordion Sidebar (w-64 to w-16) with localStorage persistence (oxengl_sidebar_collapsed).
- 4 Sidebar Groups: Core Operations, Logistics & Fleet, Finance & GL, System Governance.
- Two-Domain Top Navigation Switcher: [Operations & Logistics] vs [Finance, Accounting & Control].
- Dynamic Secondary Sub-Nav Ribbon beneath the active domain.
- Fix floating AI widget collisions with table scrollbars and pagination.
- Wire all dead-end buttons: Refresh, JSON Snapshot, Export & Print, Export Excel, + Add Record, and Pagination.
- Zero compile/TypeScript errors on `npm run build` in frontend/.
- Clean layout without visual clipping or overlapping widgets.
