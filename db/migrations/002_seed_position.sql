INSERT INTO "finance-schema".position (name, ticker) VALUES
  ('Alphabet Inc. (Google)', 'GOOGL'),
  ('Meta Platforms, Inc.',   'META'),
  ('Microsoft Corporation',  'MSFT')
ON CONFLICT (ticker) DO NOTHING;
