# Scenario workspace and simulation behavior

Launch from the repository root with `./start.ps1`. The script builds both landing pages and the dashboard, compiles Java, starts Java on 8081 and Express on 8080, and runs Python/PostgreSQL in Docker. It checks for existing processes and startup failures, without downloading a process runner at launch. Java logs are in `java-backend/target/finapp-start.log` and `finapp-start-error.log`.

## Editing scenarios

- Select a demo profile or sign in to open your profile. Click a canvas account to edit its name, type, monthly amount or balance, APR, and optional debt payment override.
- Add/remove accounts and connections, search by account name, drag nodes, and use Fit view or zoom controls.
- Cash flow and Investments navigation show editable account tables. Overview currently shows the same financial summary and canvas.
- Changes are scenario drafts saved in browser local storage, scoped by demo/user and profile ID. They do **not** write to PostgreSQL. Export JSON to back up or share, and Import to restore. Reset replaces the local scenario with the fetched server profile.
- Income/expense amounts are monthly. Other node amounts are point-in-time balances. Use take-home income; taxes are not automatically deducted.
- A fixed incoming connection into a debt sets its monthly payment unless a node payment override exists. Without either, the assumed payment is 2% of the initial balance. A zero APR or zero explicit payment is respected.
- Other connections currently describe routing visually. They do not allocate wealth projections across individual accounts. Investment allocation is controlled in the forecast panel.

## Forecast assumptions

- Wealth = cash + investments - outstanding loans - newly accrued shortfall borrowing.
- Only investment assets receive random market returns. Cash grows at its balance-weighted account APR. Existing debt accrues its own APR and is amortized at the assumed monthly payment.
- Positive surplus is split between investments and cash by the investment slider. Once a loan is paid, its payment becomes available surplus. New borrowing is repaid before additional saving/investing.
- Shortfalls draw cash, then investments, then create borrowing at an illustrative 12% APR. Cash and investment balances never become negative market assets.
- Monte Carlo uses 1,000 seeded paths with an illustrative 10% annual return assumption and 15% annual volatility. Markov uses the existing bull/bear parameters shown in the UI. These are fixed assumptions, not historical/live calibration.
- A 0% investment allocation keeps surplus in cash; it does not remove income. Percentiles can coincide when the household has no market exposure. Negative net worth alone does not mean negative monthly cash flow.
- Inflation divides net worth and the no-asset-growth reference by 1.025 raised to elapsed years. The reference uses the same household flows and borrowing rules with zero asset returns.
- P10/P50/P90 are year-specific quantiles. P10 is not a worst-case bound, P50 is not a guarantee, and percentile lines are not individual bull/bear paths.

## Debt comparison

Minimums plus the chosen share of remaining surplus form one fixed monthly payment budget. Minimums are not deducted twice; freed payments roll into remaining debts. If income cannot cover minimums, payments are capped by the affordable budget and remaining balances continue accruing interest. Avalanche targets the highest APR; snowball targets the smallest balance. The chart includes month zero and the exact payoff month, with no extra zero month. An unpaid balance at the horizon is explicitly reported as unpaid, never as a debt-free date. Interest accrued is shown for the modeled horizon.

## Checks

- Frontend: `npm run build --prefix ./frontend`, `npm run lint --prefix ./frontend/dashboard`.
- Python: install `python-backend/requirements-dev.txt`, then run `python -m unittest tests.test_simulation -v` and `python -m pytest tests/test_price_cache.py` from `python-backend`.
- Java: `./mvnw.cmd test` from `java-backend` (requires the configured PostgreSQL instance for the application context test). MVC slice tests exercise controller contracts without security filters; they do not establish authentication correctness.
- Simulation proxy preserves Python validation responses, times out failed calls, and uses `PYTHON_SERVICE_URL` for Docker service discovery.

## Remaining integration work

Server-side account/session authorization, authenticated graph editing/persistence, simulation history, AI advice, market-data calibration, full per-edge cash routing, taxes, and changing income/expenses remain separate work. Existing market cache utilities are retained.

## Landing page and entry flow

The landing page shares the dashboard palette and teal-circle FinApp logo, with a sample node graph, switchable profile previews, feature explanations, scenario cards, and expandable FAQs. Demo links use `?demo=true&profile=1`, `2`, or `3`; the dashboard validates the profile parameter and preserves demo profile changes in the URL. Invalid profile values fall back to Recent Grad. Sample landing values describe the seeded profiles, not saved local scenario edits.

Sign-in, registration, and verification pages share the same styling. Forms use native required-field validation, inline server errors, pending states, password visibility controls, and a paste-friendly six-digit verification input. Existing authentication endpoints are retained; no server-side authorization changes are part of this page update. Password recovery remains unfinished and is no longer exposed as a dead link. Landing-page light/dark preferences are restored from browser storage; the dashboard retains its dark design.
