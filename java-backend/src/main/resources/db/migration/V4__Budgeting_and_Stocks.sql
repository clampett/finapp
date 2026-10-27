-- =========================================================
-- V4__Budgeting_and_Stocks.sql
-- =========================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
CREATE TYPE transaction_kind     AS ENUM ('income', 'expense');
CREATE TYPE recurrence_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');
CREATE TYPE account_type         AS ENUM ('checking', 'savings', 'credit_card', 'cash', 'brokerage', 'other');
CREATE TYPE dividend_frequency   AS ENUM ('monthly', 'quarterly', 'semiannual', 'annual', 'irregular');
CREATE TYPE stock_txn_type       AS ENUM ('buy', 'sell', 'dividend', 'split');

-- -----------------------------------------------------------------------------
-- Shared trigger to keep updated_at current
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Accounts (where money lives: checking, credit card, etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE accounts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT         NOT NULL,
    type            account_type NOT NULL DEFAULT 'checking',
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, name),
    UNIQUE (id, user_id)
);

-- -----------------------------------------------------------------------------
-- Categories (e.g. Groceries, Rent, Salary) - each is for income OR expense
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT             NOT NULL,
    kind        transaction_kind NOT NULL,
    parent_id   BIGINT,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    UNIQUE (user_id, kind, name),
    UNIQUE (id, user_id),
    FOREIGN KEY (parent_id, user_id) REFERENCES categories(id, user_id) ON DELETE SET NULL (parent_id)
);

-- -----------------------------------------------------------------------------
-- Recurring transaction templates (rent, salary, subscriptions, ...)
-- Actual occurrences are generated into `transactions` by the app/a job.
-- -----------------------------------------------------------------------------
CREATE TABLE recurring_transactions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id      BIGINT,
    category_id     BIGINT,
    kind            transaction_kind     NOT NULL,
    description     TEXT                 NOT NULL,
    amount          NUMERIC(14,2)        NOT NULL CHECK (amount > 0),
    frequency       recurrence_frequency NOT NULL,
    interval_count  INTEGER              NOT NULL DEFAULT 1 CHECK (interval_count > 0), -- every N periods
    start_date      DATE                 NOT NULL,
    end_date        DATE,                                                              -- NULL = indefinite
    next_due_date   DATE                 NOT NULL,
    is_active       BOOLEAN              NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
    CHECK (end_date IS NULL OR end_date >= start_date),
    UNIQUE (id, user_id),
    FOREIGN KEY (account_id,  user_id) REFERENCES accounts(id,   user_id) ON DELETE SET NULL (account_id),
    FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id) ON DELETE SET NULL (category_id)
);

CREATE INDEX idx_recurring_due ON recurring_transactions (user_id, next_due_date) WHERE is_active;

-- -----------------------------------------------------------------------------
-- Transactions (actual income and expenses, one-time or from a recurring rule)
-- -----------------------------------------------------------------------------
CREATE TABLE transactions (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                  BIGINT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id               BIGINT,
    category_id               BIGINT,
    recurring_transaction_id BIGINT,          -- NULL for one-off transactions
    kind                     transaction_kind NOT NULL,
    description              TEXT             NOT NULL,
    amount                   NUMERIC(14,2)    NOT NULL CHECK (amount > 0), -- always positive; `kind` gives direction
    transaction_date         DATE             NOT NULL,
    notes                    TEXT,
    created_at               TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ      NOT NULL DEFAULT now(),
    FOREIGN KEY (account_id,  user_id) REFERENCES accounts(id,   user_id) ON DELETE SET NULL (account_id),
    FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id) ON DELETE SET NULL (category_id),
    FOREIGN KEY (recurring_transaction_id, user_id)
        REFERENCES recurring_transactions(id, user_id) ON DELETE SET NULL (recurring_transaction_id)
);

CREATE INDEX idx_transactions_user_date ON transactions (user_id, transaction_date DESC);
CREATE INDEX idx_transactions_category  ON transactions (category_id);
-- Prevents generating the same recurring occurrence twice
CREATE UNIQUE INDEX uq_transactions_recurring_occurrence
    ON transactions (recurring_transaction_id, transaction_date)
    WHERE recurring_transaction_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Stocks (one row per ticker per user)
-- -----------------------------------------------------------------------------
CREATE TABLE stocks (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                  BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker                   TEXT          NOT NULL,
    company_name             TEXT,
    exchange                 TEXT,
    pays_dividend            BOOLEAN       NOT NULL DEFAULT FALSE,
    dividend_frequency       dividend_frequency,
    dividend_per_share       NUMERIC(14,6) CHECK (dividend_per_share >= 0), -- per payment
    last_price               NUMERIC(14,4) CHECK (last_price >= 0),
    last_price_at            TIMESTAMPTZ,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, ticker),
    UNIQUE (id, user_id),
    -- dividend details only make sense if the stock pays one
    CHECK (pays_dividend OR (dividend_frequency IS NULL AND dividend_per_share IS NULL))
);

-- -----------------------------------------------------------------------------
-- Stock transactions: buys, sells, dividends received, and splits.
--   buy/sell : quantity * price_per_share (+ fees)
--   dividend : total_amount received (quantity = shares held, optional)
--   split    : quantity = split ratio (e.g. 2 for a 2-for-1)
-- -----------------------------------------------------------------------------
CREATE TABLE stock_transactions (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_id         BIGINT         NOT NULL,
    account_id       BIGINT,
    type             stock_txn_type NOT NULL,
    quantity         NUMERIC(18,6)  CHECK (quantity > 0),
    price_per_share  NUMERIC(14,4)  CHECK (price_per_share >= 0),
    fees             NUMERIC(14,2)  NOT NULL DEFAULT 0 CHECK (fees >= 0),
    total_amount     NUMERIC(14,2),               -- required for dividends
    transaction_date DATE           NOT NULL,
    notes            TEXT,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    FOREIGN KEY (stock_id,   user_id) REFERENCES stocks(id,   user_id) ON DELETE CASCADE,
    FOREIGN KEY (account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE SET NULL (account_id),
    CHECK (
        (type IN ('buy','sell') AND quantity IS NOT NULL AND price_per_share IS NOT NULL)
     OR (type = 'dividend'      AND total_amount IS NOT NULL AND total_amount > 0)
     OR (type = 'split'         AND quantity IS NOT NULL)
    )
);

CREATE INDEX idx_stock_txn_stock_date ON stock_transactions (stock_id, transaction_date);

-- -----------------------------------------------------------------------------
-- View: current position per stock (shares owned, cost basis, dividends)
-- Uses the average-cost method: sells reduce cost basis proportionally.
-- Splits are applied by multiplying shares owned (cost basis is unchanged).
-- NOTE: split handling here is simplified (assumes splits are applied to the
-- running total regardless of order); for strict accuracy, compute in-app.
-- -----------------------------------------------------------------------------
CREATE VIEW stock_positions AS
WITH agg AS (
    SELECT
        s.id AS stock_id,
        s.user_id,
        COALESCE(SUM(CASE WHEN t.type = 'buy'  THEN t.quantity END), 0) AS bought_qty,
        COALESCE(SUM(CASE WHEN t.type = 'sell' THEN t.quantity END), 0) AS sold_qty,
        COALESCE(SUM(CASE WHEN t.type = 'buy'  THEN t.quantity * t.price_per_share + t.fees END), 0) AS total_bought_cost,
        COALESCE(SUM(CASE WHEN t.type = 'sell' THEN t.quantity * t.price_per_share - t.fees END), 0) AS total_sale_proceeds,
        COALESCE(SUM(CASE WHEN t.type = 'dividend' THEN t.total_amount END), 0) AS total_dividends,
        COALESCE(EXP(SUM(LN(t.quantity)) FILTER (WHERE t.type = 'split')), 1) AS split_factor
    FROM stocks s
    LEFT JOIN stock_transactions t ON t.stock_id = s.id
    GROUP BY s.id, s.user_id
)
SELECT
    s.user_id,
    s.id            AS stock_id,
    s.ticker,
    s.company_name,
    s.pays_dividend,
    s.dividend_frequency,
    s.dividend_per_share,
    (a.bought_qty - a.sold_qty) * a.split_factor                         AS shares_owned,
    CASE WHEN a.bought_qty > 0
         THEN ROUND(a.total_bought_cost * (a.bought_qty - a.sold_qty) / a.bought_qty, 2)
         ELSE 0 END                                                       AS cost_basis,
    CASE WHEN (a.bought_qty - a.sold_qty) > 0
         THEN ROUND(a.total_bought_cost / (a.bought_qty * a.split_factor), 4)
         END                                                              AS avg_cost_per_share,
    a.total_dividends,
    a.total_sale_proceeds,
    s.last_price,
    ROUND(s.last_price * (a.bought_qty - a.sold_qty) * a.split_factor, 2) AS market_value
FROM stocks s
JOIN agg a ON a.stock_id = s.id;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_users_updated        BEFORE UPDATE ON users                  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_accounts_updated     BEFORE UPDATE ON accounts               FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recurring_updated    BEFORE UPDATE ON recurring_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stocks_updated       BEFORE UPDATE ON stocks                 FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stock_txn_updated    BEFORE UPDATE ON stock_transactions     FOR EACH ROW EXECUTE FUNCTION set_updated_at();