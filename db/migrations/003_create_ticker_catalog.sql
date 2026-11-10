-- Reference list of tradable symbols downloaded from Twelve Data (server/tickers.js).
-- Fully replaced on each sync; not referenced by foreign keys so a sync never blocks on positions.
CREATE TABLE IF NOT EXISTS "finance-schema".ticker_catalog (
  symbol     varchar(16) PRIMARY KEY,
  name       text        NOT NULL,
  exchange   text,
  mic_code   text,
  type       text,          -- e.g. 'Common Stock', 'ETF', 'American Depositary Receipt'
  currency   text,
  country    text,
  synced_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive name search ("%alphabet%") and symbol prefix search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS ticker_catalog_name_trgm ON "finance-schema".ticker_catalog USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ticker_catalog_symbol_prefix ON "finance-schema".ticker_catalog (symbol text_pattern_ops);
