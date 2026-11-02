-- Allow multiple stock holdings/lots per ticker for a user
ALTER TABLE stocks DROP CONSTRAINT IF EXISTS stocks_user_id_ticker_key;

CREATE INDEX IF NOT EXISTS idx_stocks_user_id_ticker ON stocks (user_id, ticker);

