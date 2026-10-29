# SOFTWARE ENGINEERING PROJECT TEAM 1 (Version 2.2.0 10/28/2026)
# FinApp: Investing Strategy Simulator, Budget Tracker, Cash-flow Engine

A visual, interactive personal finance dashboard that maps your finances as an interconnected web using nodes. Trace where your income flows, organize accounts and debts, build financial scenarios, and explore possible future outcomes.

---

## What It Does

**FinApp** models personal finances as a directed graph network, with dedicated views for understanding and adjusting your scenario:

- **Financial Overview:** View net worth, estimated take-home income, monthly commitments, and available surplus, alongside visual breakdowns of your monthly budget, assets, and debts.
- **Interactive Node Graph:** Add, edit, move, and connect nodes representing income, checking, savings, investments, debts, and expenses. Use search, selection tools, zoom, automatic arrangement, and fit-to-view controls.
- **Cash Flow & Budgeting:** Review monthly income, expenses, debt payments, and savings allocations. Choose gross or take-home income and adjust the effective tax estimate.
- **Investments:** Explore investment accounts and stock holdings with market-price lookup. Market data depends on provider availability and is not guaranteed to be real-time.
- **Pre-Loaded Archetypes:** Explore *Recent Grad with Loans*, *Mid-Career Family*, and *FIRE Strategist* demo scenarios.
- **Monte Carlo Simulation:** Compare 1,000 simulated paths over an adjustable horizon using cached historical market data and explicit return assumptions.
- **Market Regime Simulation:** Explore outcomes using modeled bull and bear market conditions.
- **Debt Payoff Comparison:** Compare avalanche and snowball strategies, including payment budgets, interest accrued, and remaining balances.
- **Scenario Import & Export:** Save browser drafts and exchange scenarios through JSON files.
- **Account Registration & Verification:** Register locally and verify your account using the six-digit code printed in the startup terminal.

---

## Architecture Overview

FinApp operates as a distributed multi-service application:

| Component | Technology | Role / Responsibility | Port |
| :--- | :--- | :--- | :--- |
| **Frontend Client** | React 19, Vite, TypeScript, D3.js, Recharts, Tailwind CSS | Financial overview, interactive node graph, budgeting, investments, and simulation panels | `8080` through Express |
| **Landing & Auth** | Vanilla TypeScript, Tailwind CSS, Express | Landing pages, sign-in, registration, and verification | `8080` |
| **Application Core** | Java 17/21, Spring Boot 3.2.4, Spring Data JPA, Hibernate, Flyway | Authentication, sessions, profile access, API routing, and database migrations | `8081` |
| **Simulation Service** | Python 3.12, FastAPI, NumPy, Pandas, Uvicorn | Financial projections, debt calculations, and cached market data | `5000` |
| **Database** | PostgreSQL 15 | Persistent user accounts, password hashes, sessions, and stored financial records | `5432` |

The standard local startup runs PostgreSQL and Python in Docker, with Spring Boot and Express running on your computer.

---

## Prerequisites

Install the following tools before starting:

1. **Docker Desktop** with Docker Compose v2.
2. **Node.js** `20.19+` within version 20, or `22.12+`, and **npm**.
3. **Java Development Kit 17 or 21**.
4. **Windows:** PowerShell; PowerShell 7 is recommended.
5. **macOS:** Terminal with Bash and the `lsof` utility.

Maven is provided through the repository's Maven wrapper. A separate Python installation is not required for the standard startup because Python runs in Docker.

Keep ports `5000`, `5432`, `8080`, and `8081` available.

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

For an all-Docker launch, view backend logs with:

```bash
docker compose logs -f backend
```

---

## Team Workflow and Data

Each teammate runs an independent local stack. No Render account, Neon account, hosted backend, or `.env` file is required for the standard workflow.

- **Code:** Share changes through Git branches and pull requests.
- **Accounts:** Registered users and password hashes are stored in each computer's PostgreSQL database.
- **Scenario Drafts:** Node graph edits are saved in browser local storage, scoped to the user or demo profile.
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

## Access Points

| Service | URL |
| :--- | :--- |
| **Landing Page & Authentication** | http://localhost:8080 |
| **Interactive Dashboard** | http://localhost:8080/dashboard/ |
| **Java REST API Root** | http://localhost:8081/api/v1 |
| **Python Simulation API Docs** | http://localhost:5000/docs |

Public demo profiles can be explored without registering. Private workspaces require an authenticated session.

---

## Development Workflow

**Branching Model:** Create feature branches from `dev` and submit pull requests back to `dev`. Follow repository protection rules for `dev` and `main`.

**Cross-Service Contracts:** Keep frontend graph types, Java DTOs, and Python request models consistent when changing API payloads.

**Code Reviews:** Review changes and complete the relevant builds and tests before merging.

### Frontend Checks

From the repository root:

```bash
npm run build --prefix ./frontend
npm run lint --prefix ./frontend/dashboard
node --test frontend/api-proxy.test.js
node --test frontend/session.test.js
```

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
python -m unittest tests.test_simulation -v
python -m pytest tests/test_price_cache.py
```

---

## Current Limits

- Scenario graph edits remain browser-local and do not currently synchronize to PostgreSQL or another computer.
- Market quotes and historical downloads depend on external provider availability.
- Forecasts use explicit modeling assumptions and simplified effective taxes.
- Full transaction routing through every connection, authenticated graph persistence, simulation history, AI advice, tax brackets, and retirement withdrawals remain separate integration work.
- Password recovery remains unfinished.

---

## Project Documentation

- [Code and Debugging Guide](docs/code-guide.md): File map, request flow, calculation responsibilities, and formatting commands.
- [Current Implementation](docs/current-implementation.md): Scenario behavior, storage, authentication, and integration limits.
- [Simulation Model](docs/simulation-model.md): Equations, assumptions, market data, and reference budgets.
