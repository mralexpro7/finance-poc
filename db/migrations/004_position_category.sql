-- Asset category of a position. `ticker_policy` drives validation and the form:
--   catalog = ticker optional; when given it must exist in ticker_catalog (Twelve Data stocks/ETFs)
--   free    = ticker required; any valid symbol (e.g. crypto BTC, ETH)
--   none    = no ticker (stored NULL), e.g. bank accounts
CREATE TABLE IF NOT EXISTS "finance-schema".position_category (
  id            smallint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          varchar(32) NOT NULL,
  name          text        NOT NULL,
  description   text,
  ticker_policy varchar(16) NOT NULL,
  sort_order    smallint    NOT NULL DEFAULT 0,
  CONSTRAINT position_category_code_uq UNIQUE (code),
  CONSTRAINT position_category_name_uq UNIQUE (name),
  CONSTRAINT position_category_ticker_policy_ck CHECK (ticker_policy IN ('catalog', 'free', 'none'))
);

INSERT INTO "finance-schema".position_category (code, name, description, ticker_policy, sort_order) VALUES
  ('investment', 'Investments', 'Stocks, ETFs, precious metals, retirement accounts (401(k), IRA) and other investments', 'catalog', 1),
  ('crypto',     'Crypto',      'Cryptocurrencies such as Bitcoin or Ether',                                            'free',    2),
  ('cash',       'Cash',        'Checking, savings and other cash held in bank accounts',                                'none',    3)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE "finance-schema".position
  ADD COLUMN IF NOT EXISTS category_id smallint
    REFERENCES "finance-schema".position_category (id) ON DELETE RESTRICT;

-- Existing positions (GOOGL, META, MSFT) are investments.
UPDATE "finance-schema".position
   SET category_id = (SELECT id FROM "finance-schema".position_category WHERE code = 'investment')
 WHERE category_id IS NULL;

ALTER TABLE "finance-schema".position ALTER COLUMN category_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS position_category_id_idx ON "finance-schema".position (category_id);

-- Cash (and ticker-less investments such as a 401(k)) have no ticker. UNIQUE still applies to
-- non-NULL tickers; Postgres allows any number of NULLs.
ALTER TABLE "finance-schema".position ALTER COLUMN ticker DROP NOT NULL;
