-- Run once on existing SQLite databases if orders table predates payment_method.
ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'card';
