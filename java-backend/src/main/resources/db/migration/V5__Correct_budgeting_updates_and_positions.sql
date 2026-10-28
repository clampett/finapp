-- Added the timestamp required by the user-update trigger introduced in V4.
-- Preserved earlier migrations so databases with recorded Flyway checksums could upgrade.
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Replayed trades in date, creation, and ID order. Applied each split only to
-- shares held at that point and released average cost only when a sale occurred.
CREATE OR REPLACE VIEW stock_positions AS
WITH RECURSIVE ordered_trades AS (
    SELECT t.*, ROW_NUMBER() OVER (
        PARTITION BY stock_id ORDER BY transaction_date, created_at, id
    ) AS sequence_number
    FROM stock_transactions t
), running AS (
    SELECT s.id AS stock_id, 0::BIGINT AS sequence_number,
           0::NUMERIC AS shares, 0::NUMERIC AS basis,
           0::NUMERIC AS dividends, 0::NUMERIC AS sale_proceeds
    FROM stocks s
    UNION ALL
    SELECT p.stock_id, t.sequence_number,
           CASE t.type
               WHEN 'buy' THEN p.shares + t.quantity
               WHEN 'sell' THEN p.shares - t.quantity
               WHEN 'split' THEN p.shares * t.quantity
               ELSE p.shares
           END,
           CASE t.type
               WHEN 'buy' THEN p.basis + t.quantity * t.price_per_share + t.fees
               WHEN 'sell' THEN CASE WHEN p.shares = 0 THEN 0
                   ELSE p.basis * (p.shares - t.quantity) / p.shares END
               ELSE p.basis
           END,
           p.dividends + CASE WHEN t.type = 'dividend' THEN t.total_amount ELSE 0 END,
           p.sale_proceeds + CASE WHEN t.type = 'sell'
               THEN t.quantity * t.price_per_share - t.fees ELSE 0 END
    FROM running p
    JOIN ordered_trades t ON t.stock_id = p.stock_id
        AND t.sequence_number = p.sequence_number + 1
), latest AS (
    SELECT DISTINCT ON (stock_id) * FROM running
    ORDER BY stock_id, sequence_number DESC
)
SELECT s.user_id, s.id AS stock_id, s.ticker, s.company_name,
       s.pays_dividend, s.dividend_frequency, s.dividend_per_share,
       p.shares AS shares_owned,
       ROUND(p.basis, 2) AS cost_basis,
       CASE WHEN p.shares > 0 THEN ROUND(p.basis / p.shares, 4) END AS avg_cost_per_share,
       p.dividends AS total_dividends,
       p.sale_proceeds AS total_sale_proceeds,
       s.last_price,
       ROUND(s.last_price * p.shares, 2) AS market_value
FROM stocks s JOIN latest p ON p.stock_id = s.id;
