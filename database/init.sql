-- =========================================================
-- FinApp Database Schema + Seed Data
-- =========================================================

-- ---------- TABLES ----------

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    is_archetype  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE financial_profiles (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    age                INT CHECK (age > 0),
    annual_income      NUMERIC(14,2) CHECK (annual_income >= 0),
    risk_tolerance     VARCHAR(20) CHECK (risk_tolerance IN ('LOW','MEDIUM','HIGH')),
    target_retire_age  INT
);

CREATE TABLE financial_nodes (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_type         VARCHAR(20) NOT NULL
        CHECK (node_type IN ('INCOME','CHECKING','SAVINGS','INVESTMENT','DEBT','EXPENSE')),
    name              VARCHAR(100) NOT NULL,
    current_balance   NUMERIC(14,2) NOT NULL DEFAULT 0,
    interest_rate_apr NUMERIC(6,3)  NOT NULL DEFAULT 0 CHECK (interest_rate_apr >= 0)
);

CREATE TABLE node_edges (
    id                 BIGSERIAL PRIMARY KEY,
    source_node_id     BIGINT NOT NULL REFERENCES financial_nodes(id) ON DELETE CASCADE,
    target_node_id     BIGINT NOT NULL REFERENCES financial_nodes(id) ON DELETE CASCADE,
    percentage_flow    NUMERIC(5,2)  CHECK (percentage_flow BETWEEN 0 AND 100),
    fixed_amount_flow  NUMERIC(14,2) CHECK (fixed_amount_flow >= 0),
    CHECK (source_node_id <> target_node_id),
    CHECK ((percentage_flow IS NULL) <> (fixed_amount_flow IS NULL))
);

CREATE INDEX idx_profiles_user ON financial_profiles(user_id);
CREATE INDEX idx_nodes_user    ON financial_nodes(user_id);
CREATE INDEX idx_edges_source  ON node_edges(source_node_id);
CREATE INDEX idx_edges_target  ON node_edges(target_node_id);


-- =========================================================
-- SEED DATA — 3 Archetypes
-- =========================================================

-- ---------- Archetype 1: Recent Grad with Loans ----------

INSERT INTO users (id, username, email, is_archetype)
VALUES (1, 'recent_grad', 'grad@example.com', TRUE);

INSERT INTO financial_profiles (user_id, age, annual_income, risk_tolerance, target_retire_age)
VALUES (1, 23, 55000.00, 'MEDIUM', 65);

INSERT INTO financial_nodes (id, user_id, node_type, name, current_balance, interest_rate_apr) VALUES
(1, 1, 'INCOME',     'Salary',            0,        0),
(2, 1, 'CHECKING',   'Checking Account',  1800.00,  0),
(3, 1, 'EXPENSE',    'Rent',              0,        0),
(4, 1, 'DEBT',       'Student Loan A',    22000.00, 5.80),
(5, 1, 'DEBT',       'Student Loan B',    8000.00,  3.40),
(6, 1, 'INVESTMENT', 'Roth IRA',          1200.00,  7.00);

INSERT INTO node_edges (source_node_id, target_node_id, fixed_amount_flow) VALUES
(1, 2, 4583.33),
(2, 3, 1400.00),
(2, 4, 300.00),
(2, 5, 150.00),
(2, 6, 200.00);


-- ---------- Archetype 2: Mid-Career Family ----------

INSERT INTO users (id, username, email, is_archetype)
VALUES (2, 'midcareer_family', 'family@example.com', TRUE);

INSERT INTO financial_profiles (user_id, age, annual_income, risk_tolerance, target_retire_age)
VALUES (2, 41, 135000.00, 'MEDIUM', 62);

INSERT INTO financial_nodes (id, user_id, node_type, name, current_balance, interest_rate_apr) VALUES
(7,  2, 'INCOME',     'Salary',             0,         0),
(8,  2, 'CHECKING',   'Checking Account',   6200.00,   0),
(9,  2, 'EXPENSE',    'Mortgage',           0,         0),
(10, 2, 'EXPENSE',    'Childcare & Misc',   0,         0),
(11, 2, 'DEBT',       'Auto Loan',          14000.00,  4.90),
(12, 2, 'INVESTMENT', '401k',               88000.00,  6.50),
(13, 2, 'SAVINGS',    'College Fund (529)', 15000.00,  2.00);

INSERT INTO node_edges (source_node_id, target_node_id, fixed_amount_flow) VALUES
(7,  8,  11250.00),
(8,  9,  2800.00),
(8,  10, 1800.00),
(8,  11, 450.00),
(8,  12, 1100.00),
(8,  13, 300.00);


-- ---------- Archetype 3: FIRE Strategist ----------

INSERT INTO users (id, username, email, is_archetype)
VALUES (3, 'fire_strategist', 'fire@example.com', TRUE);

INSERT INTO financial_profiles (user_id, age, annual_income, risk_tolerance, target_retire_age)
VALUES (3, 29, 98000.00, 'HIGH', 40);

INSERT INTO financial_nodes (id, user_id, node_type, name, current_balance, interest_rate_apr) VALUES
(14, 3, 'INCOME',     'Salary',            0,        0),
(15, 3, 'CHECKING',   'Checking Account',  2500.00,  0),
(16, 3, 'EXPENSE',    'Living Expenses',   0,        0),
(17, 3, 'INVESTMENT', 'Index Fund Brokerage', 72000.00, 8.00),
(18, 3, 'INVESTMENT', '401k',              45000.00, 6.50),
(19, 3, 'SAVINGS',    'Emergency Fund',    20000.00, 1.50);

INSERT INTO node_edges (source_node_id, target_node_id, fixed_amount_flow) VALUES
(14, 15, 8166.67),
(15, 16, 2200.00);

INSERT INTO node_edges (source_node_id, target_node_id, percentage_flow) VALUES
(15, 17, 50.00),
(15, 18, 20.00),
(15, 19, 5.00);