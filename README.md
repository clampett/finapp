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

1. **Configure Environment:** (OPTIONAL)  
   Create an `.env` file in the repository root:
   ```env
   ANTHROPIC_API_KEY=your_key_here
(If not using external LLM analysis features immediately, a placeholder value such as dummy_key can be used).

Execute the Startup Script:

From the repository root in PowerShell:

PowerShell
.\start.ps1
The script boots Docker Desktop if not active, runs docker compose up --build -d db python-backend, builds static assets, and concurrently starts Spring Boot and the Express frontend server.

Graceful Teardown:

Press Ctrl + C in the PowerShell terminal to trigger the cleanup routine, stopping Java, Node, and Docker services cleanly.

Option 2: Manual Multi-Service Startup
If running individual components manually across separate terminals:

1. Start Infrastructure Containers
Launch PostgreSQL and the Python simulation engine:

Bash
docker compose up -d db python-backend
Note on Seed Data Updates: If updating schema.sql seed configurations, drop existing database volumes to ensure fresh initialization:

Bash
docker compose down -v
docker compose up -d db python-backend
2. Start the Spring Boot Service
Navigate to the Java backend directory and launch via the Maven wrapper:

Bash
cd java-backend
./mvnw spring-boot:run
The Spring service initializes on http://localhost:8081 and connects to PostgreSQL on port 5432.

3. Build & Serve the Frontend
From the root directory:

Bash
cd frontend
npm in
npm run build --prefix ./landing
npm run build --prefix ./dashboard
npm run dev
The Express server hosts the static landing interface and compiled React dashboard on http://localhost:8080.

Access Points
Landing Page & Authentication: http://localhost:8080

Interactive Dashboard: http://localhost:8080/dashboard/

Java REST API Root: http://localhost:8081/api/v1

Python Simulation API Docs: http://localhost:5000/docs

Development Workflow
Branching Model: Feature development follows dev -> your_branch_name. Direct commits to main and dev are protected.

Cross-Service Testing: Ensure frontend TypeScript interfaces (GraphData, NodeDTO, EdgeDTO) remain strictly typed against Spring Boot entities and FastAPI Pydantic schemas.

Code Reviews: All contributions require passing local builds (npm run build, ./mvnw test) and pull request approvals prior to merging.
