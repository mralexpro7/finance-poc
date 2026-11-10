-- Purchases of a position: when, at what unit price, how many units.
-- numeric (not float) so money and fractional quantities (crypto, fractional shares) stay exact.
CREATE TABLE IF NOT EXISTS "finance-schema".position_transaction (
  id           bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position_id  bigint        NOT NULL
                 REFERENCES "finance-schema".position (id) ON DELETE CASCADE,
  executed_at  timestamptz   NOT NULL,           -- date and time of purchase
  price        numeric(20,8) NOT NULL,           -- bought-at value per unit
  quantity     numeric(28,10) NOT NULL,          -- units (shares, coins, ...) purchased
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT position_transaction_price_ck    CHECK (price > 0),
  CONSTRAINT position_transaction_quantity_ck CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS position_transaction_position_idx
  ON "finance-schema".position_transaction (position_id, executed_at DESC);
