# OxenGL ERP — Global Platform Responsive Design & Layout Overhaul Specification

## 1. Executive Summary
This document establishes the mandatory UI/UX and CSS engineering standards to resolve mobile responsiveness defects, text direction (bidi) bugs, layout collisions, and viewport sizing errors **globally across the entire OxenGL ERP platform**. 

Furthermore, this specification enforces an omnipresent **Deep Dark Theme** and introduces premium **"Hover Spotlight" interactive features** for all central platform interfaces.

### 1.1 Landing Page Architecture Separation
To ensure tenant autonomy while maintaining the elite SaaS aesthetic of the main platform, landing pages are strictly separated into two distinct engines:
* **Central OxenGL Landing Page (`oxengl.me`):** Serves as the primary SaaS showcase utilizing the strict Deep Dark Theme, advanced cursor telemetry, and spotlight glow features.
* **Tenant Landing Pages (`*.oxengl.me` / Custom Domains):** Architecturally isolated. Tenants are provided a dynamic landing page engine where they can configure their own brand colors, light/dark modes, and custom layouts independently of the central platform's design constraints.

---

## 2. Premium Aesthetics: Dark Theme & Interactive Spotlights

### Standard 1: Omnipresent Deep Dark Theme
* **Requirement:** Apply a strict dark theme to all central platform admin and operational dashboards (`bg-slate-950` for base layers, `bg-slate-900` for elevated surfaces).
* **Code Pattern:**
  `<body class="bg-slate-950 text-slate-300 antialiased selection:bg-indigo-500/30">...</body>`

### Standard 2: "Hover Lightable" Features (Spotlight Effect)
* **Requirement:** Implement radial gradient spotlights that activate on hover (`group-hover`) to guide the user's eye on metric cards, data table rows, and primary action buttons.
* **Code Pattern (Tailwind):**
  <div class="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-6 transition-all hover:border-indigo-500/50">
    <div class="absolute -inset-px bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-purple-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
    <div class="relative z-10">Content</div>
  </div>

---

## 3. Global Platform-Wide Responsive Engineering Standards

### Fix 1: Global Mixed-Direction Text & Alphanumeric Isolation
* **Requirement:** Explicitly isolate alphanumeric codes and units (e.g., `V-1002`, `16.80 KM`) in Arabic layouts using `dir="ltr"` and `unicode-bidi: isolate;` to prevent punctuation flipping.

### Fix 2: Global Sidebar Drawers & FAB Safe-Area Layering
* **Requirement:** Convert all permanent sidebar structures into responsive collapsible drawers (`hidden lg:block` with mobile off-canvas states). Ensure floating buttons utilize `z-40` and CSS `env(safe-area-inset-bottom)`.

### Fix 3: Global Status Badge & Metadata Pill Wrapping
* **Requirement:** Refactor all table cells and card headers to use wrapping flex containers (`flex-wrap`) with tight gaps, ensuring individual badges maintain `whitespace-nowrap`.

### Fix 4: Global Mobile Card Layout & Gutters
* **Requirement:** Enforce mobile-first padding (`px-3 sm:px-4 md:px-6`) and fluid grid columns (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) on all module containers.

### Fix 5: Global Mobile Viewport Height Handling
* **Requirement:** Replace all instances of `h-screen` and `min-h-screen` layout wrappers platform-wide with modern dynamic viewport units (`h-dvh` / `min-h-dvh`).
