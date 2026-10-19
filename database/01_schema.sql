-- =========================================================
-- 01_schema.sql — Production Database Schema (DDL)
-- =========================================================

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    -- BCrypt is 60 chars (or 68 with Spring's '{bcrypt}' prefix).
    -- Salt is embedded directly inside the BCrypt string.
    password_hash VARCHAR(100),
    is_archetype  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    
    -- 1. Demo archetypes don't need a password, but real users MUST have one.
    -- 2. Enforces minimum length of 60 so raw plaintext passwords can never be stored.
    CONSTRAINT chk_user_password CHECK (
        is_archetype = TRUE OR (password_hash IS NOT NULL AND LENGTH(password_hash) >= 60)
    )
);

CREATE TABLE user_sessions (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,

    -- Prevents a session from being created already expired.
    CONSTRAINT chk_session_expiry CHECK (expires_at > created_at)
);

CREATE TABLE financial_profiles (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    age               INT CHECK (age > 0),
    annual_income     NUMERIC(14,2) CHECK (annual_income >= 0),
    risk_tolerance    VARCHAR(20) CHECK (risk_tolerance IN ('LOW','MEDIUM','HIGH')),
    target_retire_age INT
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
    id                BIGSERIAL PRIMARY KEY,
    source_node_id    BIGINT NOT NULL REFERENCES financial_nodes(id) ON DELETE CASCADE,
    target_node_id    BIGINT NOT NULL REFERENCES financial_nodes(id) ON DELETE CASCADE,
    percentage_flow   NUMERIC(5,2)  CHECK (percentage_flow BETWEEN 0 AND 100),
    fixed_amount_flow NUMERIC(14,2) CHECK (fixed_amount_flow >= 0),
    CHECK (source_node_id <> target_node_id),
    CHECK ((percentage_flow IS NULL) <> (fixed_amount_flow IS NULL))
);

CREATE INDEX idx_profiles_user ON financial_profiles(user_id);
CREATE INDEX idx_nodes_user    ON financial_nodes(user_id);
CREATE INDEX idx_edges_source  ON node_edges(source_node_id);
CREATE INDEX idx_edges_target  ON node_edges(target_node_id);
CREATE INDEX idx_sessions_user  ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token);