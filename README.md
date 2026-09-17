# SOFTWARE ENGINNERING PROJECT TEAM 1
# Finance Dashboard Cash-Flow Engine & Wealth Simulator

A full-stack, microservice-based personal finance simulator that maps cash flow as an interactive, node-based pipeline. Built to simulate multi-year net worth trajectories, compare debt payoff strategies, and deliver AI-driven financial optimization.

---

## Executive Summary (model to change as we populate the repository at our discretion)

Traditional personal finance tools track historical spending through static pie charts and text ledgers. **Financial Cascade** models money as an interactive flow network. Users visually connect income streams, fixed expenses, debt obligations, and investment portfolios to run real-time Monte Carlo simulations based on live market yields and AI-driven strategies.

---

## Key Features (model to change as we populate the repository at our discretion)

* **Interactive Node Canvas:** Drag, drop, and link income sources, accounts, and investment buckets on a D3.js-powered visual canvas.
* **Monte Carlo Simulation Engine:** Runs 1,000-iteration probability projections using historical index fund returns (via Yahoo Finance API) to forecast 5, 10, and 30-year net worth trajectories.
* **AI Financial Co-Pilot:** Leverages the Claude API to analyze the visual graph state, detect cash leaks, and suggest optimal debt payoff strategies (Avalanche vs. Snowball).
* **Pre-Seeded Archetypes:** Test system dynamics instantly using populated database profiles (e.g., *Recent Grad with Student Debt*, *Mid-Career Family*, *FIRE Strategist*).

---

## System Architecture (model to change as we populate the repository at our discretion)

[ Frontend: HTML5 / CSS / JS / D3.js ]
│
HTTP REST / JSON
▼
[ Backend Core: Java Spring Boot Engine ] ◄──► [ Database: PostgreSQL ]
│
HTTP REST / JSON
▼
[ Analytics & AI: Python FastAPI Service ]
├── Yahoo Finance API (yfinance)
└── Anthropic Claude API


---

## Tech Stack & Team Responsibilities (model to change as we populate the repository at our discretion)

| Subsystem | Core Technologies | Primary Focus & Team Allocation |
| :--- | :--- | :--- |
| **Backend Core** | Java, Spring Boot, Spring Data JPA | REST APIs, business logic, financial utilities (2 Developers) |
| **Analytics & AI** | Python, FastAPI, NumPy, Pandas, Claude SDK | Monte Carlo engine, market data fetching, LLM integration (2 Developers) |
| **Database** | PostgreSQL, SQL | Relational schema design, seed profiles, query optimization (1 Developer) |
| **Frontend** | HTML5, Tailwind CSS, JavaScript, D3.js | Interactive node canvas, responsive dashboard layout (1 Developer) |

---

## Repository Structure (model to change as we populate the repository at our discretion)

```text
finapp/
├── docker-compose.yml          # Master local environment setup
├── README.md                   # Project documentation
├── java-backend/               # Spring Boot REST API & Business Logic
│   └── src/main/resources/     # Includes static/ for frontend delivery
├── python-backend/             # FastAPI Monte Carlo Engine & Claude Pipeline
│   ├── app/                    # Service endpoints and calculation scripts
│   └── requirements.txt        # Python dependencies
├── database/                   # PostgreSQL DDL and Seeding Scripts
│   └── init.sql                # Auto-executing database initialization
└── docs/                       # Scrum artifacts, sprint retros, and architecture diagrams
Quickstart: Running Locally via Docker
Ensure Docker Desktop is installed and running on your system.

Clone the repository:

Bash
git clone [https://github.com/clampett/finapp.git](https://github.com/clampett/finapp.git)
cd finapp
Configure Environment Variables:
Create a .env file in the root directory and add your Anthropic API key:

Code snippet
ANTHROPIC_API_KEY=your_actual_api_key_here
Spin up the stack:

Bash
docker compose up --build
Access the application:

Web Dashboard: http://localhost:8080

Spring Boot REST API: http://localhost:8080/api/v1

Python FastAPI Docs: http://localhost:5000/docs

Git & Scrum Workflow
Branching Strategy: Enforce a main -> develop -> feature/US-x.x workflow. No direct pushes to main or develop.

Pull Requests: All PRs require at least 2 peer reviews before merging into develop.

Issue Tracking: Every task must correspond to a GitHub Issue tagged with its story point estimate and sprint milestone.

Local Development (Without Docker)
If you need to run and debug individual components locally on your host machine:

Java Spring Boot:

Bash
cd java-backend
./mvnw spring-boot:run
Python FastAPI Service:

Bash
cd python-backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 5000 --reload
PostgreSQL Database:
Ensure a local PostgreSQL instance is running on port 5432 with database finance_db and user spring_user, or run a standalone container using:

Bash
docker run --name local-postgres -e POSTGRES_DB=finance_db -e POST
