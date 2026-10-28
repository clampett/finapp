# Test Suite Infrastructure: Tailwind V4 Utility Migration (Tiers 1-4)

**Status**: TEST READY & PUBLISHED  
**Test Runner**: Node.js Native Test Runner (`node --test`)  
**Working Directory**: `/mnt/shared/files/documents/Class/Software Engineering/finapp/frontend`  
**Total Tests**: 210 test cases (176 new migration tests + 34 existing baseline tests)  

---

## 1. Test Suite Architecture

The test infrastructure is located under `/mnt/shared/files/documents/Class/Software Engineering/finapp/frontend/test/` and conforms strictly to the requirements in `PROJECT.md` and `TEST_INFRA.md`. All tests are self-contained, isolated, opaque-box, and assert genuine logic against the authoritative specifications without dummy facades.

### Test Files Created:

| File Path | Feature Scope | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Total Tests | Pass Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `frontend/test/css_migration.test.js` | F1 (Landing @theme), F2 (style.css gutting), F7 (Dashboard @theme), F8 (index.css gutting) | 20 | 20 | 6 | 2 | **48** | **48/48 PASS** (100%) |
| `frontend/test/html_utility_migration.test.js` | F3 (index.html), F4 (Auth pages), F5 (404.html), F14 (Interactive hooks & parity) | 20 | 20 | 4 | 2 | **46** | **46/46 PASS** (100%) |
| `frontend/test/dashboard_utility_migration.test.js` | F9 (App shell & Nav), F10 (Canvas & D3), F11 (Modals & Labs), F14 (Dynamic states) | 20 | 20 | 4 | 2 | **46** | **46/46 PASS** (100%) |
| `frontend/test/build_verification.test.js` | F6 (Landing build), F12 (Dashboard build), F13 (Regression & deps), F14 (Artifact parity) | 15 | 15 | 2 | 4 | **36** | **36/36 PASS** (100%) |
| `frontend/test/*.test.js` (Existing) | Baseline finance, budgeting, session, and proxy logic | - | - | - | - | **34** | **34/34 PASS** (100%) |
| **Total Automated Tests** | | | | | | **210** | **210/210 PASS** (100%) |

---

## 2. How to Run the Tests

From `/mnt/shared/files/documents/Class/Software Engineering/finapp/frontend`:

### Complete Full Suite Run:
```bash
cd "/mnt/shared/files/documents/Class/Software Engineering/finapp/frontend"
node --test test/*.test.js
```

### Individual Track Verification:
```bash
# 1. CSS Migration & Token Verification (Tiers 1-4)
node --test test/css_migration.test.js

# 2. Landing HTML Utility Migration & Interactive Hooks (Tiers 1-4)
node --test test/html_utility_migration.test.js

# 3. Dashboard TSX Utility Migration & Dynamic States (Tiers 1-4)
node --test test/dashboard_utility_migration.test.js

# 4. End-to-End Build, Tooling, and Integration Verification (Tiers 1-4)
node --test test/build_verification.test.js

# 5. Baseline Unit Test Suite (Existing 34 tests)
node --test test/api-proxy.test.js test/budgeting.test.js test/finance.test.js test/session.test.js
```

---

## 3. Feature Inventory & Tier Coverage Mapping

| # | Feature | Requirements Source | Test File | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Combination) | Tier 4 (Workload) |
|---|---------|---------------------|-----------|:-----------------:|:-----------------:|:--------------------:|:-----------------:|
| 1 | Landing `@theme` Tokens | R2 | `css_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 2 | Landing `style.css` Gutting | R1, R2 | `css_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 3 | Landing `index.html` Utilities | R1 | `html_utility_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 4 | Landing Auth Pages Utilities | R1, R3 | `html_utility_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 5 | Landing `404.html` Utilities | R1 | `html_utility_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 6 | Landing Tooling & CLI Build | R4 | `build_verification.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 7 | Dashboard `@theme` Tokens | R2 | `css_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 8 | Dashboard `index.css` Gutting | R1, R2 | `css_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 9 | Dashboard App Shell & Nav | R1, R3 | `dashboard_utility_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 10 | Dashboard Canvas & D3 SVG | R1, R2, R3 | `dashboard_utility_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 11 | Dashboard Modals & Labs | R1, R3 | `dashboard_utility_migration.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 12 | Dashboard Vite & TS Build | R4 | `build_verification.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 13 | E2E Regression Integration | Acceptance | `build_verification.test.js` | 5 tests | 5 tests | ✓ | ✓ |
| 14 | Responsive & Parity | R3 | Cross-cutting (all test files) | 5 tests | 5 tests | ✓ | ✓ |

---

## 4. Key Verification Checks Implemented

1. **Zero `@apply` Rule (Acceptance Criteria & R1)**:
   - Automated recursive scan across all `.css` files in `frontend/` ensures zero occurrences of `@apply`.
2. **Stylesheet Gutting Boundaries (R2)**:
   - `landing/src/css/style.css`: verified non-empty line count is <= 90 lines (96 total lines, 87 non-empty lines) with only `@import`, `@source`, `@theme`, `:root`/`[data-theme]` CSS variables, SVG presentation rules, and dynamic toggles (`.site-navigation.is-open`, `.negative`).
   - `dashboard/src/index.css`: verified reduced down to `@import`, `@theme` (19 colors + Inter font-sans + 5 breakpoints), dark `:root`, scrollbars, focus ring, D3 SVG elements (`canvas-node`, `canvas-edge`, `node-port`, `connector-preview`), `@keyframes connector-flow`, cursor modes, and reduced motion.
3. **Landing Utility Migration (R1 & R3)**:
   - All 5 HTML files in `landing/pages/` verified for complete elimination of bespoke BEM classes (`site-container`, `site-header`, `hero`, `feature-card`, `auth-card`, `auth-form`, etc.).
   - Preservation of interactive hooks (`#site-navigation`, `#menu-toggle`, `[data-password-toggle]`, `[data-preview]`, `[data-theme]`, `#preview-worth`).
4. **Dashboard Utility Migration (R1 & R3)**:
   - TSX components verified for elimination of bespoke component classes in JSX `className` props.
   - Verified presence of Dashboard semantic utility tokens (`bg-base`, `bg-surface`, `bg-raised`, `bg-header`, `border-border`, `text-text`, `text-muted`, `text-brand`, `bg-active-bg`, `text-active-text`, `border-active-border`).
   - Preservation of D3 dynamic classes (`canvas-node`, `canvas-edge`, `is-selected`, `edge-selected`, `node-port`, `is-linking`, `connect-mode`).
5. **Tooling and Builds (R4)**:
   - Verified `npm run build:css` (tailwindcss CLI) exits code 0.
   - Verified `npm run build` in landing exits code 0.
   - Verified `npx tsc -b` and `npm run build` in dashboard exit code 0.
   - Verified zero `tailwind.config.*` files exist.
   - Verified all 34 existing Node unit tests continue to pass without regression.
