# Platform UI, Branding, and Enterprise Gating Specification

## Phase 1: Unified Dark Theme Overhaul
**Objective:** Standardize the platform's visual identity around a deep, modern dark theme with interactive glow effects.
*   **Base Backgrounds:** Apply `bg-slate-950` as the primary application background and `bg-slate-900` for cards, modals, and elevated surface areas.
*   **Text & Borders:** Standardize text to high-contrast slate scales (e.g., `text-slate-200` for primary, `text-slate-400` for secondary) and use subtle borders (`border-slate-800`).
*   **Interactive Glow Effects:** Implement Tailwind hover states on primary interactive elements (buttons, feature cards, navigation icons). Use transitions (e.g., `transition-all duration-300`) combined with shadow-glows (e.g., `hover:shadow-[0_0_15px_rgba(14,165,233,0.5)]`) to create a tactile, responsive feel.

## Phase 2: Enterprise Tier Gating (Registration View)
**Objective:** Strictly gate premium architecture features on the tenant registration page (`frontend/src/views/RegisterView.tsx` or similar).
*   **Target Features:** "External Database Hosting" and "Custom Domain" configurations.
*   **UI Locking:** If the user selects the "Standard" or "Professional" tier, physically disable the toggle/input fields for Custom Domain and External DB. Apply visual locks (e.g., a padlock icon) and gray-out the sections using `opacity-50 pointer-events-none`.
*   **State Enforcement:** Ensure the React component state strictly clears any inputted data for these fields if the user downgrades their tier selection before submission.

## Phase 3: Dynamic Tenant Branding
**Objective:** Implement a robust, multi-layered branding system for tenant workspaces.
*   **Monogram Avatars:** Create a utility function to extract the first 1-2 letters of a tenant's company name to generate a dynamic monogram (e.g., "Alwehda Alarabia" -> "AA"). Render this inside a sleek, circular colored badge.
*   **Logo Integration:** Implement the UI to fetch and display the custom tenant logo if one has been uploaded and stored in the tenant's `branding_context`.
*   **Fallback Logic:** Implement strict rendering fallback: If `logo_url` exists, display the logo. If `logo_url` is null/empty, automatically fallback to the Monogram Avatar.