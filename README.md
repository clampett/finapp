# FinApp: Investing Strategy Simulator, Budget Tracker, Cash-flow Engine

**Software Engineering Project · Team 1 · Version 2.2.0**

**Last updated: 11/14/2026**

A visual, interactive personal finance dashboard that maps your finances as an interconnected web using nodes. Trace where your income flows, organize accounts and debts, build financial scenarios, and explore possible future outcomes.

---

## What It Does

**FinApp** models personal finances as a directed graph network, with dedicated views for understanding and adjusting your scenario:

- **Financial Overview:** View net worth, estimated take-home income, monthly commitments, and available surplus, with interactive breakdowns of the monthly budget, assets, and debts. Track net-worth and income goals.
- **Interactive Node Graph:** Add, edit, move, connect, remove, and restore income, checking, savings, investment, debt, and expense nodes. Use separate selection, pan, lasso, and connection tools, plus undo/redo, canvas fullscreen, zoom, automatic arrangement, and fit-to-view.
- **Cash Flow:** Review how income funds expenses, debt payments, and savings allocations. Choose gross or take-home income and adjust effective taxes and growth assumptions.
- **Budgeting:** Manage income and expense transactions, recurring rules, and generated due occurrences. Review stock positions and record trades, with linked scenario updates where supported.
- **Investments & Market Data:** Manage stock holdings shared with Budgeting, inspect estimated dividend income, and review historical returns and volatility. Explore stock charts over 1D, 1M, 1Y, or 5Y with date-tracking tooltips and green/red price changes. View public cryptocurrency and foreign-exchange quotes.
- **AI Coach:** Use a guided scenario review, a comparative Scenario lab, local Ollama chat, a result notebook, and a dated markets/news briefing. The built-in guide remains available when local inference is unavailable.
- **Pre-Loaded Archetypes:** Explore _Recent Grad with Loans_, _Mid-Career Family_, and _FIRE Strategist_. The family scenario is the default demo.
- **Monte Carlo Simulation:** Explore 1,000 simulated paths over an adjustable horizon using cached historical market data or explicit return assumptions.
- **Markov Regime Simulation:** Explore modeled bull/bear persistence and transitions, with the calibration source and transition probabilities shown alongside results.
- **Debt Payoff Comparison:** Compare avalanche and snowball strategies, payment budgets, interest accrued, and remaining balances.
- **Scenario Import & Export:** Keep user-scoped browser drafts, exchange validated JSON scenarios, and export simulation results.
- **Account & Appearance Settings:** Edit a signed-in account’s display name and profile picture, choose light/dark/system appearance, and customize simulation defaults and balance previews. Demo settings allow browser-local name and appearance changes without photo uploads.
- **Authentication:** Register and verify a local account, sign in with a password, or use Google sign-in when its client and authorized origins are configured.
- **Responsive Navigation:** Collapse the sidebar, open settings from the account menu, and retain the current dashboard tab on reload. Theme preferences are remembered in the browser across visits.

---

## Architecture Overview

FinApp operates as a distributed multi-service application:

| Component              | Technology                                                        | Role / Responsibility                                                                                  | Port                   |
| :--------------------- | :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :--------------------- |
| **Frontend Client**    | React 19, Vite, TypeScript, D3.js, Recharts, Tailwind CSS         | Financial overview, interactive node graph, budgeting, investments, settings, and AI/simulation panels | `8080` through Express |
| **Landing & Auth**     | Vanilla TypeScript, Tailwind CSS, Express                         | Landing pages, sign-in, registration, and verification                                                 | `8080`                 |
| **Application Core**   | Java 17/21, Spring Boot 3.2.4, Spring Data JPA, Hibernate, Flyway | Authentication, sessions, profile access, API routing, and database migrations                         | `8081`                 |
| **Simulation Service** | Python 3.12, FastAPI, NumPy, Pandas, Uvicorn                      | Financial projections, debt calculations, dividend estimates, and cached stock/crypto/FX data          | `5000`                 |
| **Database**           | PostgreSQL 15                                                     | Persistent user accounts, password hashes, sessions, and stored financial records                      | `5432`                 |
| **Optional Local AI**  | Ollama, `qwen2.5:1.5b`                                            | Local text generation called by the Express coach service                                              | `11434` on loopback    |

The standard local startup runs PostgreSQL and Python in Docker, with Spring Boot and Express running on your computer. The launchers also prepare an optional local Ollama runtime in the background.

Browser requests go through the Express gateway: application and market APIs are proxied to Java, Java requests calculations and price data from Python, and the coach service calls the local Ollama runtime. Forecast calculations remain in Python; the language model explains and guides rather than calculating authoritative results.

---

## Prerequisites

Install the following tools before starting:

1. **Docker Desktop** with Docker Compose v2.
2. **Node.js** `20.19+` within version 20, or `22.12+`, and **npm**.
3. **Java Development Kit 17 or 21**.
4. **Windows:** PowerShell; PowerShell 7 is recommended.
5. **macOS:** Terminal with Bash and the `lsof` utility.

Maven is provided through the repository's Maven wrapper. A separate Python installation is not required for the standard startup because Python runs in Docker.

Keep ports `5000`, `5432`, `8080`, and `8081` available. Optional local AI uses loopback port `11434`; a compatible existing Ollama runtime can be reused.

---

## Quickstart Guide

### Option 1: Automated Local Launch — Windows

From the repository root in PowerShell:

```powershell
.\start.ps1
```

The script prepares missing npm dependencies, builds both frontends, starts PostgreSQL and Python containers, and launches Spring Boot and Express locally.

Open:

http://localhost:8080

Sign in with the local development account:

- **Username:** `testuser`
- **Password:** `test123`

Spring Boot logs and verification codes appear in the launch terminal with the `[SPRING]` prefix.

Press **Ctrl+C** in that terminal to stop the stack. The local database remains on disk.

### Option 2: Automated Local Launch — macOS

From the repository root in Terminal:

```bash
bash ./start.sh
```

The script prepares dependencies, starts the Docker services, builds the frontend, and launches Spring Boot and Express.

Open:

http://localhost:8080

Use the same local development credentials:

- **Username:** `testuser`
- **Password:** `test123`

Logs appear in the terminal with `[SPRING]`, `[PY]`, and `[WEB]` prefixes. Press **Ctrl+C** to stop the stack.

**macOS port conflicts:**

- If port `5000` is occupied, check **System Settings → General → AirDrop & Handoff → AirPlay Receiver**.
- If port `5432` is occupied, stop any separately installed PostgreSQL service before launching.
- If Docker does not start automatically, open Docker Desktop, wait for its engine to become ready, and retry.

### Option 3: All-Docker Launch

On Windows:

```powershell
.\start-docker.ps1
```

On macOS, using the default database volume:

```bash
docker volume create finapp_postgres_data
docker compose up --build
```

This builds and runs all application services inside Docker. Verification codes appear in the backend container logs.

Stop the containers with:

```bash
docker compose stop
```

---

## Registration and Verification

1. Open the registration page and create an account.
2. Find the six-digit verification code in the terminal:

   ```text
   [SPRING] CODE: 123456
   ```

3. Enter the code on the verification page.
4. Sign in to open your workspace.

Codes expire after **15 minutes** and are associated with the registered account.

Use **Print a new code in the terminal** to request a replacement. If you close the verification page, sign in with the unverified account to resume verification.

The seeded `testuser` account is already verified.

Console delivery is enabled for local development and skips SMTP. No email provider credentials are required.

### Google sign-in

The backend supplies the Google client configuration to the landing pages. Set `GOOGLE_CLIENT_ID` for your own Google web client; `VITE_GOOGLE_CLIENT_ID` is supported as a fallback. Its authorized JavaScript origins must match the origin where the site is opened, such as `http://localhost:8080` for local development. The client ID is public configuration, not an AI API key.

Google sign-in needs internet access. If Google setup or loading fails, the normal password sign-in and **Create an account** link remain available. Local password registration does not require Google configuration.

For an all-Docker launch, view backend logs with:

```bash
docker compose logs -f backend
```

---

## Team Workflow and Data

Each teammate runs an independent local stack. No Render account, Neon account, hosted backend, or `.env` file is required for the standard workflow.

- **Code:** Share changes through Git branches and pull requests.
- **Accounts:** Registered users, password hashes, sessions, and signed-in profile fields are stored in PostgreSQL.
- **Scenario Drafts:** Node graph edits are saved in browser local storage, scoped to the user or demo profile.
- **Budget and Portfolio Records:** Signed-in transactions, recurring rules, stocks, positions, and trades use backend persistence. Demo records use browser storage instead.
- **Local Preferences:** Theme, goals, simulation defaults, and balance-display preferences use browser storage. Currency previews use a manual exchange rate; underlying account values and simulations remain in USD.
- **AI Conversation and Notebook:** Recent chat and saved comparison snapshots are temporary in-memory state, not durable database records.
- **Sharing Scenarios:** Use JSON export/import to transfer scenarios between browsers or computers.
- **Database Changes:** Add new Flyway migrations rather than editing migrations that have already been applied.

The local Spring profile creates `testuser` with a BCrypt password hash and a starting scenario. It preserves existing matching accounts and scenarios rather than replacing a different password.

This account and profile are intended for local classroom development. Do not enable the local development profile on a public server.

### Database Persistence

PostgreSQL data is stored in the external Docker volume:

```text
finapp_postgres_data
```

Stopping or recreating containers preserves this volume. `docker compose down -v` does not remove the external PostgreSQL volume, but explicitly deleting the volume or its underlying disk deletes its data.

For a private local database backup on Windows, while PostgreSQL is running:

```powershell
.\backup-db.ps1 -DatabaseMode local
```

Database persistence and browser drafts are separate. A database backup does not back up browser-local scenario edits; export those scenarios as JSON.

---

## Simulation Behavior

FinApp keeps income flows, account balances, investments, and debts separate when calculating projections.

- Income can be entered as gross pay or take-home pay.
- Gross pay uses an editable effective tax estimate; take-home pay is not taxed again.
- Living expenses and contractual debt payments are deducted before allocating surplus.
- Affordable planned savings and investment transfers are funded before additional investment allocations.
- Unallocated surplus remains in checking.
- Shortfalls draw from checking, savings, and investments before creating modeled borrowing.
- Debt payments are counted once, and released payments become available after payoff.
- Projections support editable return, growth, inflation, and fee assumptions.
- Charts distinguish percentile outcomes, sampled paths, and a cashflow reference.
- Debt remaining at the simulation horizon is reported as unpaid rather than assigned a misleading payoff date.

Market history is cached and refreshed in the background. The simulation panel identifies its data source and model assumptions, including fallback assumptions when historical data is unavailable.

These are educational scenarios, not guaranteed outcomes or personalized financial advice.

---

## AI Coach

### Local model setup

The Windows and macOS launchers prepare the local model automatically in the background using Docker Desktop. On the first launch, Docker downloads the Ollama image and FinApp downloads the roughly 1 GB `qwen2.5:1.5b` model. Subsequent launches reuse the image and model volume. The dashboard, simulations, and built-in guide are available while downloads run.

The launcher reuses a compatible Ollama server already listening on loopback. Otherwise, it runs FinApp’s CPU-only container and stops that container when FinApp shuts down. The model volume is retained. To skip setup on a particular launch, set `FINAPP_SKIP_OLLAMA=1` in your shell before starting FinApp. No account or API key is required. The separate all-Docker launch does not automatically enable this host-based integration.

### Chat and privacy

Ask FinApp tries free-form Ollama generation for every question while local AI is enabled. A bundled product guide supplies factual context, and up to two recent AI exchanges help it understand follow-ups. Selected horizon and stress-test labels and qualitative comparison signals may be attached. Exact graph balances, account records, and dashboard-added result summaries are not automatically sent to Ollama. Anything explicitly typed into chat is part of the model request. The reviewed guide remains a clearly labeled fallback when inference is unavailable.

### Scenario lab and notebook

The Scenario lab supports seven single-variable stress tests: expense growth, market returns, fees, volatility, income growth, investment share, and inflation. Intensity, baseline assumptions, time horizon and the target can be adjusted. Both runs use the same model and seed. Their actual yearly percentiles feed the comparison chart; P10, P50 and P90 can be selected. Up to four result snapshots can be saved in the in-memory notebook while the AI tab remains mounted. These snapshots do not edit the original graph or persist after leaving the tab.

### Markets, news, and interactive charts

Markets & news uses four fixed benchmark funds from the existing Investments cache and recent Yahoo Finance headlines. An empty primary news feed falls back to Yahoo’s fixed public RSS feed. The benchmark chart supports 1D (five-minute regular-session bars from the latest available session), 1M, 1Y and 5Y (daily adjusted closes), with exact dates and prices in the tracking tooltip. Longer ranges reuse the existing full-history price cache. Coach intraday requests are limited to four benchmark symbols. Investments reuses the same chart for validated USD-priced stocks, with a one-year default; all symbols pass the existing stock lookup checks before chart retrieval. Intraday requests are cached for five minutes and backed off after failures; no API key is needed. A single background worker shares refreshes across requests (15-minute cache, two-minute failure backoff, maximum 24-hour stale observations). Stories older than seven days are excluded. Article links are HTTPS and host-allowlisted. The model receives dated retrieved context when enabled; it is not retrained, cannot browse arbitrary websites, and must not treat headlines as instructions or as proof of what caused a price move. Market retrieval requires internet access; chat and simulations can still work without it once the local model is installed.

### Request limits and limitations

Chat requests are limited to 12 per client per minute, one concurrent inference, and 30 inference attempts per server process per minute. Messages, history, HTTP bodies, model context, generated output and timeouts are bounded. Recent chat is kept in memory rather than the database. No paid APIs or API keys were added. The Python simulator remains the source of forecast results. Historical benchmark volatility can be applied to both cases without changing the expected return. AI responses may be inaccurate; the chat displays an educational-use notice and does not provide personalized financial advice.

Ollama runs beside the Express gateway, not inside each visitor’s browser. The current integration targets loopback on that gateway’s machine. A deployed frontend therefore needs an available runtime in that environment to generate answers; otherwise the labeled built-in guide is used. The local launchers do not provision a hosted AI service.

## Access Points

| Service                           | URL                              |
| :-------------------------------- | :------------------------------- |
| **Landing Page & Authentication** | http://localhost:8080            |
| **Interactive Dashboard**         | http://localhost:8080/dashboard/ |
| **Java REST API Root**            | http://localhost:8081/api/v1     |
| **Python Simulation API Docs**    | http://localhost:5000/docs       |

Public demo profiles can be explored without registering. Private workspaces require an authenticated session.

---

## Development Workflow

**Branching Model:** Create feature branches from `dev` and submit pull requests back to `dev`. Follow repository protection rules for `dev` and `main`.

**Cross-Service Contracts:** Keep frontend graph types, Java DTOs, and Python request models consistent when changing API payloads.

**Code Reviews:** Review changes and complete the relevant builds and tests before merging.

### Frontend Source Layout

The frontend is organized by responsibility so tab views, domain logic, canvas controls, and server code can be maintained separately.

| Location                             | Responsibility                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `frontend/dashboard/src/App.tsx`     | Application shell, navigation, account menu, and selected view.                                      |
| `frontend/dashboard/src/views/`      | Tab-level composition for overview/cash flow, graph workspace, budgeting, investments, and settings. |
| `frontend/dashboard/src/common/`     | Shared finance types/calculations, session handling, theme, number inputs, and platform shortcuts.   |
| `frontend/dashboard/src/workspace/`  | Graph loading, history, editing, canvas interactions, toolbar, and node/connection editors.          |
| `frontend/dashboard/src/budgeting/`  | Data/actions hooks, transaction and recurring forms, holdings/trades, and graph synchronization.     |
| `frontend/dashboard/src/investing/`  | Shared holdings, market quotes/charts, goals, and financial preferences.                             |
| `frontend/dashboard/src/simulation/` | Simulation dialog, parameter controls, calibration details, outcome tables, charts, and defaults.    |
| `frontend/dashboard/src/coach/`      | AI tab components, chat/lab state, and the `coach-engine.ts` scenario helper.                        |
| `frontend/dashboard/src/styles/`     | Dashboard styles and light/dark theme tokens.                                                        |
| `frontend/landing/`                  | Public pages, authentication screens, and their TypeScript/CSS sources.                              |
| `frontend/server/coach/`             | Local inference, reviewed guide data, prompts, and public market/news context.                       |
| `frontend/server/proxy/`             | Gateway forwarding to the Java API.                                                                  |
| `frontend/test/`                     | Tests grouped into `dashboard`, `landing`, `server`, and `integration`.                              |

Keep module names distinct on case-insensitive filesystems: a component and helper must not share the same filename stem with only capitalization or `.ts`/`.tsx` distinguishing them.

### Frontend Checks

From the repository root:

```bash
npm run build --prefix ./frontend
npm run lint --prefix ./frontend/dashboard
npm run format:check --prefix ./frontend
npm test --prefix ./frontend
```

The test command discovers all four frontend test groups. Integration tests build the landing pages/dashboard, and gateway tests start temporary local HTTP servers.

To apply the shared source formatting:

```bash
npm run format --prefix ./frontend
```

Despite the command’s location, formatting covers maintained frontend **and Java** source files. It excludes installed dependencies, generated output, and database migrations. Prettier uses a 100-character preferred width, spaces, two-space indentation (four for Java), single quotes where supported, trailing commas, and LF line endings. Add explanatory comments around important logic, using past-participle phrasing such as “Validated…” or “Preserved…”.

### Java Checks

From `java-backend` on Windows:

```powershell
.\mvnw.cmd test
```

From `java-backend` on macOS:

```bash
sh ./mvnw test
```

### Python Checks

For Python development and testing, use a separate Python environment and install the development requirements.

From `python-backend`:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest tests
```

---

## Current Limits

- Scenario graph edits remain browser-local and do not currently synchronize to PostgreSQL or another computer.
- Market quotes and historical downloads depend on external provider availability.
- Forecasts use explicit modeling assumptions and simplified effective taxes.
- Full transaction routing through every connection, authenticated graph-save integration, durable simulation history, tax brackets, and retirement withdrawals remain separate integration work. Scenario database tables alone do not make the graph editor synchronize its browser drafts.
- Stock holdings and graph investment nodes are distinct inputs. Editing shares in Investments does not automatically change the graph balances used by AI scenario comparisons.
- Currency previews do not perform automatic portfolio conversion or change the simulator’s USD accounting.
- Local AI quality and latency depend on the installed model and available hardware. Cached market context can be stale or unavailable; the model is not continuously retrained on news.
- Password recovery remains unfinished.

---

## Project Documentation

- [Code and Debugging Guide](docs/sprint-2/code-guide.md): File map, request flow, calculation responsibilities, and formatting commands.
- [Current Implementation](docs/sprint-2/current-implementation.md): Scenario behavior, storage, authentication, and integration limits.
- [Simulation Model](docs/sprint-2/simulation-model.md): Equations, assumptions, market data, and reference budgets.
