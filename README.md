# SOFTWARE ENGINEERING PROJECT TEAM 1 (Version 2.0.0 10/06/2026)
# FinApp Dashboard Cash-Flow Engine, Budget Tracker and Investing Strategy Simulator

A visual, interactive personal finance dashboard that maps your money as a connected web. See exactly where your income goes, track your expenses, and manage your debts in a clear, drag-and-drop interface.

---

## What It Does

Traditional finance apps usually just show you a boring list of transactions or a static pie chart. **Our Dashboard** treats your money like a living network. You visually connect your salary to your checking account, and then route that money out to your rent, student loans, and investments.

**Current Features:**
* **Interactive Visual Canvas:** See your finances as floating, connected circles (nodes). You can click and drag them around the screen to organize your financial life.
* **Live Balances:** View exactly how much money is sitting in your accounts or how much you owe on loans directly on the screen.
* **Pre-Loaded Profiles:** Start instantly with ready-made user profiles (like the "Recent Grad") to see how the system works without typing in all your own data.

*(Coming soon: Multi-year wealth forecasting and AI financial advice!)*

---

## What You Need Installed (Prerequisites)

To run this app on your computer (As of now), you need three standard developer tools:
1. **Docker Desktop:** Runs our database seamlessly in the background.
2. **IntelliJ IDEA (or any Java IDE):** Used to run the backend Java code.
3. **Node.js:** Used to run the frontend website server.

---

## How to Start the App (Step-by-Step)

The app is broken into three distinct pieces: the database, the backend, and the frontend. You need to start them in this exact order for the application to work.

### Step 1: Start the Database
1. Open **Docker Desktop** and make sure the engine is running.
2. Open a terminal (Command Prompt, PowerShell, or VS Code Terminal).
3. Navigate into the main project folder (`finapp`).
4. Run this command:
   ```bash
   docker-compose up -d db
   ```
   *(This downloads and starts a database with our sample user profiles already loaded inside).*

### Step 2: Start the Backend (The Brain)
1. Open the `java-backend` folder using **IntelliJ IDEA**.
2. Let the IDE load the project files.
3. Find the `JavaBackendApplication.java` file.
4. Click the green **Play** button next to the code to run it.
5. Watch the console at the bottom of the screen. You are good to go once it says "Started JavaBackendApplication" (it runs in the background on port 8081).

### Step 3: Start the Frontend (The Visual Canvas)
1. Open a new terminal window.
2. Navigate into the `frontend` folder (`cd frontend`).
3. Run these commands to start the web server:
   ```bash
   npm run in
   npm run dev
   ```
4. The terminal will confirm it is serving your files on port 8080.

### Step 4: Use the App!
1. Open your web browser (Chrome, Edge, Safari, etc.).
2. Go to: **`http://localhost:8080`**
3. You will immediately see the Finance Dashboard load up with our interactive node graph!

---

## Tech Stack (As of 10/06/2026)

| Piece of the App | Technology Used | What it does |
| :--- | :--- | :--- |
| **Frontend** | HTML, Tailwind CSS, JavaScript, D3.js | Draws the interactive visual canvas you see in the browser. |
| **Backend** | Java, Spring Boot | The engine that processes requests and talks to the database. |
| **Database** | PostgreSQL | Stores all the user profiles, account balances, and connections securely. |

---

## Team Workflow

* **Branching:** We use a safe `main` -> `dev` -> `you_branch_name` workflow. Please do not push code directly to `main`.
* **Reviews:** All new code must be reviewed by teammates through a Pull Request on GitHub before being merged.
* **Tracking:** Every task must correspond to a GitHub Issue.
