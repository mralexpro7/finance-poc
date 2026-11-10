-- Runs once, on first start of an empty data volume.
CREATE SCHEMA IF NOT EXISTS "finance-schema" AUTHORIZATION CURRENT_USER;
ALTER ROLE CURRENT_USER SET search_path TO "finance-schema", public;
