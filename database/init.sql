-- =========================================================
-- FinApp Database Schema + Seed Data
-- =========================================================

-- ---------- TABLES ----------

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    email         VARCHAR(255)  NOT NULL UNIQUE,
    password      VARCHAR(255)  NOT NULL,
    is_archetype  BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    net_worth     NUMERIC(14,2) NOT NULL DEFAULT 0
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
    interest_rate_apr NUMERIC(5,2)  DEFAULT 0,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE node_edges (
    id                 BIGSERIAL PRIMARY KEY,
    source_node_id     BIGINT NOT NULL REFERENCES financial_nodes(id) ON DELETE CASCADE,
    target_node_id     BIGINT NOT NULL REFERENCES financial_nodes(id) ON DELETE CASCADE,
    monthly_fixed_flow NUMERIC(14,2) DEFAULT 0,
    percentage_flow    NUMERIC(5,2)  DEFAULT 0,
    created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- INDEXES ----------

CREATE INDEX idx_nodes_user ON financial_nodes(user_id);
CREATE INDEX idx_edges_source ON node_edges(source_node_id);
CREATE INDEX idx_edges_target ON node_edges(target_node_id);

-- ---------- SEED DATA ----------

-- Seed data for users (existing archetype users)
INSERT INTO users (username, email, password, is_archetype) VALUES 
('john_doe', 'john.doe@example.com', '$2a$10$X6HjT8yW7z4Bv5N9k3L2m1O5p4R6s7T8u9V0w1X2Y3Z4A5B6C7D8E', true),
('jane_smith', 'jane.smith@example.com', '$2a$10$Y7IjK8lM9nO0pQ1rS2tU3vW4xY5zA6bB7cC8dD9eE0fF1gG2hH3iJ', true),
('bob_johnson', 'bob.johnson@example.com', '$2a$10$Z8kL9mN0oP1qR2sT3uV4wX5yZ6aB7cC8dD9eE0fF1gG2hH3iJ4kL', true);

-- Seed data for financial profiles
INSERT INTO financial_profiles (user_id, age, annual_income) VALUES 
(1, 35, 75000.00),
(2, 28, 65000.00),
(3, 42, 95000.00);

-- Seed data for financial nodes (user_id references to above users)
INSERT INTO financial_nodes (user_id, node_type, name, current_balance, interest_rate_apr) VALUES 
(1, 'checking', 'Primary Checking', 2500.00, 0.00),
(1, 'savings', 'Emergency Fund', 10000.00, 0.50),
(1, 'loan', 'Student Loan', -20000.00, 4.50),
(2, 'checking', 'Checking Account', 1800.00, 0.00),
(2, 'investment', 'Brokerage Account', 5000.00, 1.25),
(3, 'checking', 'Business Checking', 15000.00, 0.00),
(3, 'real_estate', 'Primary Home', 300000.00, 0.00);

-- Add new user with registration endpoint
INSERT INTO users (username, email, password) VALUES ('test_user', 'test@example.com', '$2a$10$abcdefghijklmnopqrstuvwxyZ1234567890');