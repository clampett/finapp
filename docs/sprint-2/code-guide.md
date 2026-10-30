# Where to read and debug FinApp

This guide follows a request from startup to the browser, Java API, and Python calculations. The readability cleanup preserved the existing comments and behavior; the account editor and node canvas were moved into their own components.

## Startup and local storage

| File | What to inspect |
| --- | --- |
| `start.ps1` | The normal entry point; delegates to local startup. |
| `start-server.ps1` | Environment overrides, database readiness, frontend build, Java/Node launch arguments, live logs, and cleanup. |
| `scripts/FinApp.Common.ps1` | Native command exit codes, ASCII console output, environment parsing, and streamed log readers. Legacy shared-database helpers are retained for explicit recovery utilities. |
| `start-docker.ps1` | The alternative that runs the application services in Docker. |
| `backup-db.ps1` | Private PostgreSQL dump creation and checksum generation. |
| `docker-compose.yml` | Local service connections and the external database volume. |

Account records and password hashes live in PostgreSQL. Edited financial scenarios currently live in browser localStorage, scoped by demo/user and profile ID. Authentication identity and its matching key live in sessionStorage for the active tab. These three stores have different purposes; changing one does not automatically update the others.

## Sign-in, registration, and Back navigation

1. `frontend/landing/src/ts/login.ts` handles form validation, submission, and the redirect after login or registration.
2. `frontend/landing/src/ts/main.ts` supplies the shared HTTP helper and waits for pending logout before a new login. It also handles public-page theme, navigation, and sample previews.
3. `frontend/landing/src/ts/verify.ts` submits the account-bound code or requests a replacement.
4. `java-backend/src/main/java/com/finapp/javabackend/controller/AuthController.java` validates credentials, manages verification tokens, creates sessions, and revokes sessions on logout.
5. `java-backend/src/main/java/com/finapp/javabackend/service/EmailService.java` prints local codes without contacting SMTP. Its Java package is `services`, despite the existing directory being named `service`.
6. `java-backend/src/main/java/com/finapp/javabackend/config/SessionCookieAuthenticationFilter.java` checks the cookie and matching tab header against the stored session.
7. `frontend/dashboard/src/session.ts` is shared with the landing pages. It clears tab identity, requests backend logout, and validates browser-history restores before revealing a private workspace.

For the default development account, inspect `java-backend/src/main/java/com/finapp/javabackend/config/LocalDevelopmentData.java`. It runs only with the local Spring profile, preserves an existing matching account, and copies a starting scenario without replacing existing node data. Schema changes belong in new Flyway migrations; already-applied migration files were not reformatted.

## Dashboard and node editing

| File | Responsibility |
| --- | --- |
| `frontend/dashboard/src/main.tsx` | Session validation before the private React application mounts. |
| `frontend/dashboard/src/App.tsx` | Sidebar navigation, selected view, demo profile selection, search, and sign-out. |
| `frontend/dashboard/src/graphs.tsx` | Scenario loading, browser drafts, account/connection updates, JSON import/export, Reset, and opening simulations. |
| `frontend/dashboard/src/components/Canvas.tsx` | D3 drawing, drag behavior, zoom, fit-to-view, resize handling, and rendering cleanup. |
| `frontend/dashboard/src/components/AccountEditor.tsx` | The selected account's form draft and Apply/Delete actions. |
| `frontend/dashboard/src/finance.ts` | Shared graph types, import validation, payment precedence, summary totals, and JSON downloads. |
| `frontend/dashboard/src/SimulationModal.tsx` | Simulation request mapping, debounce/cancellation, dialog keyboard behavior, charts, and result explanations. |

When a displayed total looks wrong, inspect `finance.ts` first. When an edit is lost or loaded from the wrong workspace, inspect the storage key and draft handling in `graphs.tsx`. For node positioning or zoom, inspect `components/Canvas.tsx`.

## Simulation request and calculation order

The request path is:

`SimulationModal.tsx` -> `frontend/api-proxy.js` -> Java `controller/SimulationController.java` -> Python `app/routers/simulate.py`.

The Python files are organized by calculation responsibility:

- `app/main.py` creates FastAPI and registers the simulation router.
- `app/routers/simulate.py` validates the payload, calculates monthly income/expenses and debt-payment defaults, selects the requested model, and packages the result.
- `app/cashflow.py` reconciles gross/net income, the effective tax estimate, affordable fixed/percentage saving routes, and extra investment allocation. Browser calculations in `frontend/dashboard/src/finance.ts` are tested against the same demo budgets.
- `app/projection.py` implements the active household forecast. Checking, savings, investments, existing loans, and new borrowing are kept separate. Each month applies returns and interest, pays each contractual minimum, applies income/expense growth and tax, allocates surplus or covers a deficit, and records annual inflation-adjusted percentiles.
- `app/market_model.py` calibrates monthly risk from the existing full-history cache, warms data in the background, identifies offline fallbacks, and separates historical averages from forward-return assumptions. See [the simulation model](simulation-model.md) for equations and defaults.
- `app/debt_waterfall.py` compares debt-payment priorities with an affordable fixed monthly budget. Minimum payments are counted once, and freed payments roll into remaining debts.
- `app/markov_sim.py` supplies monthly bull/bear probabilities and return distributions to the household forecast. Its standalone trajectory helper is retained separately.
- `app/simulation.py` retains the earlier aggregate-balance simulator; it is not called by the current simulation route.
- `app/price_cache.py` now fetches maximum available adjusted history and supplies the active calibration. `app/asset_classes.py` and `app/market_data.py` retain the team's existing ticker mapping and trailing-statistics helpers; the active model uses explicitly labeled older benchmark proxies for longer coverage.
- `app/models.py` retains the earlier generic graph DTOs. The active request contract is defined in `app/routers/simulate.py`.

Read the comments beside payment precedence, APR conversion, the no-growth reference path, deficit funding, and percentile extraction when debugging financial results. Those operations explain most differences between cash flow, net worth, contributions, and compound growth.

## Formatting and verification

The repository uses spaces consistently: two per indentation level for frontend code, four for Java, Python, and PowerShell. `.editorconfig`, `.prettierrc.json`, `python-backend/pyproject.toml`, and `scripts/PSScriptAnalyzerSettings.psd1` hold the rules.

From the repository root:

```powershell
npm run format --prefix ./frontend
npm run format:check --prefix ./frontend
npm run build --prefix ./frontend
npm run lint --prefix ./frontend/dashboard
node --test frontend/session.test.js frontend/api-proxy.test.js
```

Prettier formats frontend and Java source only. It excludes generated files, dependencies, secrets, migrations, and the unchanged legacy 404 template with its pre-existing malformed closing tag.

With Python development requirements installed, run Black and tests from `python-backend`:

```powershell
python -m black --check app tests
python -m pytest tests
```

The retained hosted supervisor can be checked separately with `python -m black --line-length 100 --check ../deploy/run.py`. Python formatting is a development tool; normal `start.ps1` still uses Docker for Python and does not require a host Python installation.

PowerShell formatting uses the optional PSScriptAnalyzer module and the committed settings. Normalize line endings before invoking its formatter. Existing scripts can be syntax-checked with PowerShell's parser without running Docker or launching the application.

Java tests run with `./mvnw.cmd test` from `java-backend`. The application-context test needs PostgreSQL; use a disposable database for isolated checks rather than creating more test accounts in the regular development database.

## Public website pages

The public website is authored in `frontend/landing/pages`. The home page keeps the interactive profile preview; `/features`, `/how-it-works`, `/scenarios`, and `/faq` are separate static pages with descriptions and accessible SVG diagrams based on the current model. Diagram captions distinguish conceptual illustrations from actual simulated results. Express serves these clean routes and their `.html` redirects automatically from the existing static-page allowlist.

`frontend/landing/src/css/style.css` contains the shared Tailwind tokens and imports `public.css` for the public website layouts, illustrations, and responsive theme control. The dashboard styles are separate. `theme-init.ts` is loaded synchronously before the stylesheet on every public page, including authentication and 404 pages. It restores `user-theme` from localStorage, or follows the device preference until a choice is saved. `main.ts` handles the switch, accessible labels, cross-tab updates, and system-preference changes. Storage access remains optional so restricted browsers still load the pages.

Build with `npm run build --prefix ./frontend`. Theme behavior can be checked with `node --test frontend/test/landing-theme.test.js`. The public pages need no external image service, font CDN, or paid resource.

### Dashboard appearance

`frontend/dashboard/src/useTheme.ts` controls the header's sun/moon switch and shares the public pages' `user-theme` preference. The dashboard HTML restores this preference before styles paint. The hook follows changes made in other tabs and uses the device preference until an explicit choice has been saved. Appearance stays usable if storage is blocked.

`theme.css` defines the light semantic colors and canvas interaction states. `theme-palette.css` preserves the existing dark component colors and provides light equivalents for surfaces, labels, borders, chart paints, and shadows. Component utilities and SVG presentation values reference these variables so a theme change updates charts without rebuilding the scenario or requesting a new simulation. Prefer semantic utilities such as `bg-surface`, `text-muted`, and `border-border` for new UI. If a distinct legacy paint is needed, supply both dark and light variable values.

Run `node --test frontend/test/dashboard-theme.test.js` to check saved preferences, cross-tab updates, blocked storage, listener cleanup, and visual variable coverage.
