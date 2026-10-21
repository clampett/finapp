# SOFTWARE ENGINEERING PROJECT TEAM 1 (Version 2.1.0 10/14/2026)
# FinApp: Investing Strategy Simulator, Budget Tracker, Cash-flow Engine

A visual, interactive personal finance dashboard that maps your finances as an interconnected web using nodes. Trace where your income flows, manage finances, and model long-term financial trajectories in a real-time, responsive workspace.

---

## What It Does

Traditional finance platforms limit analysis to static ledger tables or backward-looking categorization charts. **FinApp** models personal finances as a dynamic, directed graph network:
- **Interactive Visual Canvas:** Render cash flows across nodes representing income streams, checking/savings reserves, debt instruments, and investment vehicles.
- **Dynamic Graph Grid:** Infinite-canvas background grid built with D3.js that pans and zooms relative to user actions, adapting automatically to different screen resolutions.
- **Pre-Loaded Archetypes:** Load pre-configured financial profiles (e.g., *Recent Grad with Loans*, *Mid-Career Family*, *FIRE Strategist*) seeded directly from PostgreSQL.
- **Monte Carlo 30-Year Wealth Forecast:** Execute 1,000-iteration stochastic simulations modeling market volatility against historical S&P 500 benchmarks.
- **Parametric Simulation Controls:** Adjust the dynamic savings rate slider ($0/mo to 100% of net surplus) and toggle real-time purchasing power discounting via an integrated 2.5% inflation rate model.

---

## Architecture Overview

FinApp operates as a distributed multi-service architecture:

| Component | Technology | Role / Responsibility | Port |
| :--- | :--- | :--- | :--- |
| **Frontend Client** | React 18, Vite, TypeScript, D3.js, Recharts, Tailwind CSS | Interactive node graph canvas, simulation modal, and dashboard UI | `8080` (Express wrapper) |
| **Landing & Auth** | Vanilla TypeScript, Tailwind CSS, Express | Static landing pages, login view, and authentication forms | `8080` |
| **Application Core** | Java 17/21, Spring Boot 3.2.4, Spring Data JPA, Hibernate | Manages user entities, node topologies, and graph edge connections | `8081` |
| **Simulation Service** | Python 3.12, FastAPI, NumPy, Pandas, Uvicorn | Computes Monte Carlo trajectory paths and serves historical market analytics | `5000` |
| **Database** | PostgreSQL 15 | Relational persistence for user accounts, financial nodes, and directional edges | `5432` |

---

## Prerequisites

Ensure the following runtimes and tools are installed locally:
1. **Docker Desktop** (Engine running with Compose v2 support)
2. **Node.js** (v20+ recommended) & **npm**
3. **Java Development Kit (JDK 17 or 21)**
4. **PowerShell 7+** (Recommended for Windows environments)

---

## Quickstart Guide

### Option 1: Automated Local Launch via PowerShell (Windows)

A unified PowerShell automation script orchestrates dependencies, starts background containers, and streams backend and frontend logs concurrently.

1. Use the hosted FinApp URL, or pull the code and run `./start.ps1` for local frontend development. Teammates need no Neon account, invitation, database settings, or `.env` file. Only Node/npm is required for the local frontend path.
2. Sign in with the shared development account: **`testuser` / `test123`**.
3. The backend owner deploys the server once and commits its public origin in `shared-backend.json`. See [shared hosting setup](docs/shared-hosting.md). An empty URL means this one-time deployment has not been finished yet.

The default script builds the landing pages/dashboard and runs Express, which forwards `/api` to the shared server. Press Ctrl+C to stop the local frontend. The shared backend and database remain online independently.

For deliberately isolated backend work, run `./start.ps1 -Mode local`. For the backend owner's local Java development against the shared database, use `./start.ps1 -Mode server`; Spring logs appear with `[SPRING]`. These advanced paths require the full prerequisites and are separate from normal team sign-in.

### Option 2: Manual Multi-Service Startup
If running individual components manually across separate terminals:

1. Start Infrastructure Containers
For backend-owner work with the original multi-container stack and owner-only credentials, run:

```powershell
./start-docker.ps1
```

For isolated local infrastructure only:

```powershell
docker volume create finapp_postgres_data
docker compose up -d db python-backend
```

Use new Flyway migrations for schema and seed changes. Do not delete database volumes to refresh seed data. The local volume is external and survives `docker compose down -v`; the hosted shared database is outside Compose entirely. Neither protection replaces backups.
2. Start the Spring Boot Service
Navigate to the Java backend directory and launch via the Maven wrapper:

```powershell
cd java-backend
./mvnw.cmd spring-boot:run
```
The Spring service initializes on http://localhost:8081. Manual Maven launches do not load the root `.env` automatically; use `start.ps1 -Mode server` for owner-only shared settings or export the three `SPRING_DATASOURCE_*` variables in that terminal first.

3. Build & Serve the Frontend
From the root directory:

```powershell
cd frontend
npm run in
npm run build --prefix ./landing
npm run build --prefix ./dashboard
npm run dev
```
The Express server hosts the static landing interface and compiled React dashboard on http://localhost:8080.

### Access Points
Landing Page & Authentication: http://localhost:8080

Interactive Dashboard: http://localhost:8080/dashboard/

Java REST API Root: http://localhost:8081/api/v1

Python Simulation API Docs: http://localhost:5000/docs

### Development Workflow
Branching Model: Feature development follows dev -> your_branch_name. Direct commits to main and dev are protected.

Cross-Service Testing: Ensure frontend TypeScript interfaces (GraphData, NodeDTO, EdgeDTO) remain strictly typed against Spring Boot entities and FastAPI Pydantic schemas.

Code Reviews: All contributions require passing local builds (npm run build, ./mvnw test) and pull request approvals prior to merging.


## Current scenario workspace

See [current implementation and model assumptions](docs/current-implementation.md) for scenario editing, local draft storage, debt payment rules, and verification commands.
