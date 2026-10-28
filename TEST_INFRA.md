# E2E Test Infra: finapp Frontend Tailwind V4 Migration

## Test Philosophy
- Opaque-box and structural requirement-driven. No reliance on internal CSS implementations.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory Mapping
| # | Feature | Source (Requirement) | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Combination) | Tier 4 (Workload) |
|---|---------|----------------------|:-----------------:|:-----------------:|:--------------------:|:-----------------:|
| 1 | Landing `@theme` Tokens | R2 | 5 tests | 5 tests | ✓ | ✓ |
| 2 | Landing `style.css` Gutting | R2 | 5 tests | 5 tests | ✓ | ✓ |
| 3 | Landing `index.html` Utilities | R1 | 5 tests | 5 tests | ✓ | ✓ |
| 4 | Landing Auth Pages Utilities | R1, R3 | 5 tests | 5 tests | ✓ | ✓ |
| 5 | Landing `404.html` Utilities | R1 | 5 tests | 5 tests | ✓ | ✓ |
| 6 | Landing Tooling & CLI Build | R4 | 5 tests | 5 tests | ✓ | ✓ |
| 7 | Dashboard `@theme` Tokens | R2 | 5 tests | 5 tests | ✓ | ✓ |
| 8 | Dashboard `index.css` Gutting | R2 | 5 tests | 5 tests | ✓ | ✓ |
| 9 | Dashboard App Shell & Nav | R1, R3 | 5 tests | 5 tests | ✓ | ✓ |
| 10 | Dashboard Canvas & D3 SVG | R1, R2, R3 | 5 tests | 5 tests | ✓ | ✓ |
| 11 | Dashboard Modals & Labs | R1, R3 | 5 tests | 5 tests | ✓ | ✓ |
| 12 | Dashboard Vite & TS Build | R4 | 5 tests | 5 tests | ✓ | ✓ |
| 13 | E2E Regression Integration | Acceptance | 5 tests | 5 tests | ✓ | ✓ |
| 14 | Responsive & Parity | R3 | 5 tests | 5 tests | ✓ | ✓ |

## Test Architecture
- Test Runner: Node.js native test runner (`node --test`) invoking automated verification scripts.
- Test Suite Location: `frontend/test/`
  - `frontend/test/css_migration.test.js` (CSS line count, token definitions, zero `@apply`, non-utility retained rules).
  - `frontend/test/html_utility_migration.test.js` (Landing HTML utility classes, elimination of bespoke BEM classes).
  - `frontend/test/dashboard_utility_migration.test.js` (Dashboard TSX className props, absence of bespoke BEM classes, active states).
  - `frontend/test/build_verification.test.js` (Landing build, Dashboard tsc & build, bundle generation).
  - Existing suite: `frontend/test/*.test.js` (34 tests).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Landing Theme Switching | F1, F2, F3, F4, F14 | Medium |
| 2 | Landing Mobile Navigation Collapse | F1, F2, F3, F14 | Medium |
| 3 | Landing Sample Scenario Preview | F1, F2, F3, F14 | Medium |
| 4 | Dashboard View Switching & Persistence | F7, F8, F9, F14 | Medium |
| 5 | Dashboard Canvas Node Selection & Linking | F7, F8, F10, F14 | High |
| 6 | Dashboard Simulation Modal Execution | F7, F8, F11, F14 | High |

## Coverage Thresholds
- Tier 1: >= 70 test cases (5 per feature across 14 features)
- Tier 2: >= 70 test cases (boundaries, empty values, line count limits, forbidden `@apply`)
- Tier 3: pairwise coverage of feature combinations (theme switching across views, viewport resizing with active canvas)
- Tier 4: 6 realistic application scenarios
