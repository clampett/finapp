# Scenario workspace and simulation behavior

Team development runs locally: `./start.ps1` starts PostgreSQL, Python, Spring Boot, and Express on this computer. Sign in with the locally seeded `testuser` / `test123`. No hosted API or database is required. Account registration prints verification codes in the same terminal under `[SPRING]`; console mode skips SMTP. Each machine has its own accounts/data; Git shares code and JSON export/import shares scenarios. See README.md for the workflow.

## Editing scenarios

- Select a demo profile or sign in to open your profile. Click a canvas account to edit its name, type, monthly amount or balance, APR, and optional debt payment override.
- Add/remove accounts and connections, search by account name, drag nodes, and use Fit view or zoom controls.
- Cash flow and Investments navigation show editable account tables. Overview currently shows the same financial summary and canvas.
- Changes are scenario drafts saved in browser local storage, scoped by demo/user and profile ID. They do **not** write to PostgreSQL. Export JSON to back up or share, and Import to restore. Reset replaces the local scenario with the fetched server profile.
- Income/expense amounts are monthly. Other node amounts are point-in-time balances. Choose gross pay or take-home pay in Income & monthly budget. New demo scenarios default to gross pay with an editable 20% effective tax estimate.
- A fixed incoming connection into a debt sets its monthly payment unless a node payment override exists. Without either, the assumed payment is 2% of the initial balance. A zero APR or zero explicit payment is respected.
- Savings/investment routes from income/checking now allocate after-bill surplus: affordable fixed transfers first, then percentages of the remainder, then the extra-investment slider. Other edges remain descriptive routing rather than a complete transaction ledger.

## Forecast assumptions

See [simulation math and demo checks](simulation-model.md) for the equations, defaults, data source, and reference budgets.

- The panel is named Monte Carlo simulation. It uses 1,000 seeded paths and a separate cashflow reference.
- Gross income is reduced by an editable effective tax estimate before living expenses and contractual debt payments. Take-home income is not taxed again.
- Scheduled investment/saving transfers are funded before extra investing. A 0% extra allocation still honors affordable planned transfers; other unassigned money stays in checking.
- Each loan releases its own contractual payment after payoff. Checking and savings have separate yield pools; investments receive market returns. Shortfalls draw checking, savings, then investments before modeled borrowing.
- The existing free yfinance/SQLite cache now fetches maximum available adjusted history. SPY is used as an explicitly labeled US-stock proxy; a verified download supplied 404 completed months, January 1993 through September 2026. Other benchmarks expose their actual available spans.
- Historical Monte Carlo resamples twelve-month blocks. Markov uses regimes fitted to the same history. The default dashboard centers returns on an editable 7% forward assumption while retaining observed risk; observed historical mean can be selected instead.
- The default dashboard grows income and living expenses 2.5% annually and displays purchasing power at 2.5% inflation. These are editable/scenario assumptions, not predictions. Additional portfolio fees default to zero.
- P10/P50/P90 are annual quantiles, not individual market paths. A separate option displays eight actual sampled paths.
- The cashflow reference follows the same budget, debt, and borrowing rules with cash/market returns and portfolio fees disabled. Contributions, total net worth, and differences from the reference are separate quantities.
- History refresh happens in the background. Cached/stale history and explicit fallback assumptions remain usable without blocking requests on the free provider. The source and actual model inputs are shown in the panel and result export.

## Debt comparison

Minimums plus the chosen share of remaining surplus form one fixed monthly payment budget. Minimums are not deducted twice; freed payments roll into remaining debts. If income cannot cover minimums, payments are capped by the affordable budget and remaining balances continue accruing interest. Avalanche targets the highest APR; snowball targets the smallest balance. The chart includes month zero and the exact payoff month, with no extra zero month. An unpaid balance at the horizon is explicitly reported as unpaid, never as a debt-free date. Interest accrued is shown for the modeled horizon.

## Checks

- API gateway: `node --test frontend/api-proxy.test.js`. Java `SharedBackendSecurityTest` exercises real filters for public demos, session expiry, owner checks, and blocked unsafe bulk writes.
- Frontend: `npm run build --prefix ./frontend`, `npm run lint --prefix ./frontend/dashboard`.
- Python: install `python-backend/requirements-dev.txt`, then run `python -m unittest tests.test_simulation -v` and `python -m pytest tests/test_price_cache.py` from `python-backend`.
- Java: `./mvnw.cmd test` from `java-backend` (requires the configured PostgreSQL instance for the application context test). MVC slice tests exercise controller contracts without security filters; they do not establish authentication correctness.
- Simulation proxy preserves Python validation responses, times out failed calls, and uses `PYTHON_SERVICE_URL` for Docker service discovery.

## Remaining integration work

Existing session cookies now authenticate private workspace reads, including expiry and owner checks, while seeded demos remain public. The old graph bulk-write endpoint is blocked because it lacks ownership validation; UI scenario editing remains browser-local. Authenticated graph persistence, simulation history, AI advice, full per-edge transaction routing, tax brackets, and retirement withdrawals remain separate work. Existing market cache utilities are retained.

## Landing page and entry flow

The landing page shares the dashboard palette and teal-circle FinApp logo, with a sample node graph, switchable profile previews, feature explanations, scenario cards, and expandable FAQs. Demo links use `?demo=true&profile=1`, `2`, or `3`; the dashboard validates the profile parameter and preserves demo profile changes in the URL. Missing or invalid profile values fall back to Mid-Career Family. The landing preview and generic demo links also default to that family profile, while explicit scenario links retain the selected archetype. Sample landing values describe the seeded profiles, not saved local scenario edits.

Sign-in, registration, and verification pages share the same styling. Forms use native required-field validation, inline server errors, pending states, password visibility controls, and a paste-friendly six-digit verification input. Verification now binds codes to the registered account, provides a resend action, and resumes from sign-in for unverified accounts. Local console delivery skips SMTP. Password recovery remains unfinished and is no longer exposed as a dead link. Landing-page light/dark preferences are restored from browser storage; the dashboard retains its dark design.

## Session behavior

Returning from the private dashboard to a public page (including Back to login) clears tab identity and calls backend logout, deleting that server session. Explicit Sign out does the same. Cached dashboard snapshots are hidden and revalidated before being shown again; expired/revoked sessions redirect to login instead of showing graph-load errors.

Authentication requires the HttpOnly session cookie and its matching key in sessionStorage. A fresh tab cannot reuse a leftover cookie after the original tab closes. Refresh retains the active tab's sign-in. Tab closure does not reliably notify servers, so unused server records expire after 24 hours; closing a tab is not a guarantee of immediate database deletion, and browser session-restore features may restore tab storage. Back and Sign out explicitly revoke the record. Node drafts in localStorage are retained when signing out.

The account seed is in java-backend/src/main/java/com/finapp/javabackend/config/LocalDevelopmentData.java. The matching testuser remains in each developer's own PostgreSQL database; it is not an authentication bypass or shared hosted account.

Session checks: `node --test frontend/session.test.js`; Java LocalAuthTest and SharedBackendSecurityTest cover revocation, cookie expiry, and rejected cookie-only access.
