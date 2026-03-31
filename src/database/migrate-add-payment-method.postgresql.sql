-- Run once on existing PostgreSQL databases (optional for fresh installs from schema.postgresql.sql).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card';
