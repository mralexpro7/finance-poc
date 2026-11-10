-- Positions: tracked securities (name + unique ticker symbol).
CREATE TABLE IF NOT EXISTS "finance-schema".position (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text        NOT NULL,
  ticker     varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT position_ticker_uq UNIQUE (ticker),
  CONSTRAINT position_ticker_upper_ck CHECK (ticker = upper(ticker))
);
