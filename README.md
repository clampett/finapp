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

Install Docker Desktop, Node/npm, and JDK 17 or 21. From the project root run:

```powershell
.\start.ps1
```

Open http://localhost:8080 and sign in with **testuser / test123**. No Render, Neon, cloud account, or `.env` is required. The script installs missing npm dependencies, builds both frontends, starts local PostgreSQL/Python containers, and runs local Java/Express. Spring Boot output appears live as `[SPRING]`. Press Ctrl+C in that terminal to stop the stack; data remains on disk.

The `local` Spring profile creates the test account with a BCrypt password hash and a sample Recent Grad node graph. It reuses existing matching accounts and preserves existing scenarios; it never replaces a different password. This fixture is only for local classroom development. Do not enable the `local` profile on a public server.

### Registration and verification

Create an account normally, then copy the six-digit `CODE:` printed in the terminal running `start.ps1` into the verification page. Console delivery skips SMTP entirely. Codes expire in 15 minutes and belong to one account. Use **Print a new code in the terminal** to replace an expired code. If you closed verification, sign in with that account to resume it. The seeded test account is already verified.

### Team workflow and data

- Each teammate pulls the same code and runs their own local stack. Everyone has the same test credentials, with a separate database on each computer.
- Share feature changes through Git branches and pull requests. Share useful scenario data with the dashboard's JSON export/import; browser scenario edits do not currently write to PostgreSQL or sync across machines.
- Keep schema changes in new Flyway migrations. Keep repeatable example data in development fixtures rather than making manual edits on one computer.
- Registered accounts and password hashes persist in the local `finapp_postgres_data` external Docker volume. `docker compose down -v` does not delete this external volume, but explicitly deleting the volume or disk still loses data. Run `./backup-db.ps1 -DatabaseMode local` while the database is running for a private backup.
- Old hosted `.env` datasource settings are ignored by `start.ps1` and the local Compose backend. Existing hosted services/data are not deleted or used by this workflow.

### All-Docker alternative

```powershell
.\start-docker.ps1
```

This builds all services in Docker and displays their logs, including verification codes. Run `docker compose stop` to stop the containers. For manual Java work, use `./mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=local'` from `java-backend` after starting `db` and `python-backend`. The profile is required to seed the development account.

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

See [the code and debugging guide](docs/code-guide.md) for the file map, request flow, Python calculation responsibilities, and formatting commands.

See [current implementation and model assumptions](docs/current-implementation.md) for scenario editing, local draft storage, debt payment rules, and verification commands.
