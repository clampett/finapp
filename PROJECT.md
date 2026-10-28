# Project: finapp Frontend Tailwind V4 Utility Migration

## Architecture
- **Monorepo Structure**: Two independent frontend sub-applications under `frontend/`:
  1. `frontend/landing`: Static multi-page marketing and authentication application (`pages/*.html`, `src/css/style.css`, `src/ts/*.ts`), built via `@tailwindcss/cli` and `esbuild`.
  2. `frontend/dashboard`: React 19 + TypeScript SPA (`src/**/*.tsx`, `src/index.css`), bundled with Vite 8 + `@tailwindcss/vite`.
- **Styling Architecture**: Pure Tailwind CSS v4 utility-first styling across all HTML pages and JSX components.
  - Zero usage of `@apply`.
  - Zero configuration files (`tailwind.config.js`).
  - Minimal CSS files containing exclusively: `@import 'tailwindcss'`, `@source` (Landing only), `@theme { ... }`, `:root` / `[data-theme]` variables, and non-utility CSS rules (SVG presentation rules, keyframes, scrollbars, summary markers, prefers-reduced-motion, and JS-toggled state rules).
- **Token Design**:
  - Landing: semantic tokens referencing CSS variables dynamically toggled via `data-theme="light"` / `data-theme="dark"`.
  - Dashboard: 19 semantic hex tokens covering surfaces, borders, typography, active states, and financial indicators.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Landing Tailwind V4 `@theme` & Token System | Implement Landing `@theme` block with 13 color tokens, font-sans, and 3 breakpoints (`nav: 1050px`, `mob: 850px`, `xs: 600px`). | M1 | Survey / R2 |
| 2 | Landing `style.css` Gutting | Reduce `style.css` down to ~80-90 lines containing only `@import`, `@source`, `@theme`, `:root`/`[data-theme]`, scrollbars, selection, SVG node rules, details marker, reduced motion, `.is-open`, `.negative`. Zero `@apply`. | M1 | Survey / R1 / R2 |
| 3 | Landing `index.html` Utility Migration | Migrate 73 bespoke BEM classes across hero, preview card, feature grid, workflow layout, demo scenarios, FAQ, CTA, and footer into Tailwind v4 utilities. | M1 | Survey / R1 |
| 4 | Landing Auth Pages Utility Migration | Migrate `login.html`, `registration.html`, `verify.html` into Tailwind v4 utilities, preserving password toggles, alert styling, forms, submit states. | M1 | Survey / R1 / R3 |
| 5 | Landing `404.html` Normalization | Fix line 18 duplicate closing tag, normalize classes to `text-primary-fg` and `text-foreground`. | M1 | Survey / R1 |
| 6 | Landing Tooling & Build Verification | Verify `npm run build:css` and `npm run build` succeed with exit code 0 using `@tailwindcss/cli`. | M1 | Survey / R4 / Acceptance |
| 7 | Dashboard Tailwind V4 `@theme` & Token System | Implement Dashboard `@theme` block with 19 color tokens, font-sans, and 5 breakpoints (`2xl: 1600px`, `xl: 1100px`, `md: 800px`, `sm: 650px`, `xs: 600px`). | M2 | Survey / R2 |
| 8 | Dashboard `src/index.css` Gutting | Reduce `index.css` down to ~150 lines, retaining only `@import`, `@theme`, `:root`, scrollbars, focus ring, summary marker, `.canvas-host` background, D3 SVG elements, cursor modes, keyframes, reduced motion. Zero `@apply`. | M2 | Survey / R1 / R2 |
| 9 | Dashboard Core Layout & Nav Utility Migration | Migrate `App.tsx`, `DashboardTab.tsx`, `OverviewComposition.tsx` to utility classes (`bg-surface`, `border-border`, `text-text`, active item classes). | M2 | Survey / R1 / R3 |
| 10 | Dashboard Canvas & Editor Utility Migration | Migrate `Canvas.tsx`, `CanvasToolbar.tsx`, `AccountEditor.tsx`, `ConnectionEditor.tsx`, `BudgetControls.tsx`, `graphs.tsx` to utility classes, preserving D3 SVG integration. | M2 | Survey / R1 / R3 |
| 11 | Dashboard Complex Modals Utility Migration | Migrate `SimulationModal.tsx`, `ForecastChart.tsx`, `ForecastInsights.tsx`, `SimulationGuide.tsx`, `BudgetingTab.tsx`, `Investing.tsx` to utility classes. | M2 | Survey / R1 / R3 |
| 12 | Dashboard Tooling & TypeScript Build Verification | Verify `npx tsc -b` and `npm run build` succeed with exit code 0 using `@tailwindcss/vite`. | M2 | Survey / R4 / Acceptance |
| 13 | Automated E2E & Parity Test Suite | Build automated test suite covering Tiers 1-4: zero `@apply`, stylesheet line counts, token presence, HTML/JSX class migration, build commands, and 34 existing node unit tests. | M3 | Survey / Acceptance |
| 14 | Visual & Interactive Parity & Adversarial Hardening | Tier 5 adversarial verification: theme switching, mobile menu toggle, D3 canvas linking, Monte Carlo modal, responsive breakpoints. | M3 | Survey / R3 / Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status | Assigned Agents |
|---|------|-------|-------------|--------|-----------------|
| 1 | Landing Sub-Application Utility-First Migration | `frontend/landing` (5 HTML files + `style.css`) | none | IMPLEMENTED (Awaiting Gate) | Worker: `4b8dbee7-de22-44c1-af7c-2a88fb7b6ddf` |
| 2 | Dashboard Sub-Application Utility-First Migration | `frontend/dashboard` (18 TSX files + `index.css`) | none | IN_PROGRESS (Replacement) | Worker: `82dfd292-c316-4b01-b750-e3d82070b730` |
| 3 | E2E Verification, Visual Parity & Adversarial Hardening | Full `frontend` testing and validation | M1, M2 | TEST INFRA READY | Test Writer: `8f8c0ed0-3cc8-4017-bcca-b29fa650a61a` |

## Interface Contracts

### Landing ↔ Shared Static Assets
- `frontend/landing/src/css/style.css` compiles to `frontend/build/landing/assets/styles.css`.
- Landing HTML files link to `/assets/styles.css`, `/assets/main.js`, `/assets/login.js`, `/assets/verify.js`.
- Root Express server serves static landing build from `frontend/build/landing/`.

### Dashboard ↔ API & Navigation Contracts
- Dashboard links from Landing: `/dashboard/?demo=true&profile=2` or `/login`.
- Back link from Dashboard: `/` (Landing home).
- Dashboard Vite base: `/dashboard/`.
- Active view switching in `App.tsx`: views `'overview' | 'archetype' | 'budgeting' | 'investing'`.
- Dynamic classes contract:
  - `App.tsx`: active navigation item styled with `bg-active-bg text-active-text border-active-border` while preserving `active` class if needed.
  - `Canvas.tsx`: host element toggles `.is-linking`, `.connect-mode`, `.canvas-expanded`; D3 nodes/edges toggle `.is-selected`, `.edge-selected`, `.connection-source`, `.connection-target`.
  - Values: `.negative` (`text-coral`), `.positive` (`text-mint`).

## Code Layout

### Landing Workspace (`frontend/landing/`) - Exclusively owned by Worker M1:
- `frontend/landing/src/css/style.css` (owned by M1)
- `frontend/landing/pages/index.html` (owned by M1)
- `frontend/landing/pages/login.html` (owned by M1)
- `frontend/landing/pages/registration.html` (owned by M1)
- `frontend/landing/pages/verify.html` (owned by M1)
- `frontend/landing/pages/404.html` (owned by M1)

### Dashboard Workspace (`frontend/dashboard/`) - Exclusively owned by Replacement Worker M2:
- `frontend/dashboard/src/index.css` (owned by replacement M2)
- `frontend/dashboard/src/App.tsx` (owned by replacement M2)
- `frontend/dashboard/src/DashboardTab.tsx` (owned by replacement M2)
- `frontend/dashboard/src/graphs.tsx` (owned by replacement M2)
- `frontend/dashboard/src/SimulationModal.tsx` (owned by replacement M2)
- `frontend/dashboard/src/BudgetingTab.tsx` (owned by replacement M2)
- `frontend/dashboard/src/main.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/Canvas.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/CanvasToolbar.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/CanvasIcon.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/AccountEditor.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/ConnectionEditor.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/BudgetControls.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/Investing.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/NumberField.tsx` (owned by replacement M2)
- `frontend/dashboard/src/components/OverviewComposition.tsx` (owned by replacement M2)
- `frontend/dashboard/src/simulation/ForecastChart.tsx` (owned by replacement M2)
- `frontend/dashboard/src/simulation/ForecastInsights.tsx` (owned by replacement M2)
- `frontend/dashboard/src/simulation/SimulationGuide.tsx` (owned by replacement M2)

### Test Workspace (`frontend/test/`) - Owned by E2E Testing Track (M3):
- `frontend/test/` (owned by M3)
