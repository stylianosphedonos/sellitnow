/**
 * Incremental PostgreSQL migrations for existing databases.
 * Must run before schema.postgresql.sql (which creates indexes on new columns).
 */
async function runPostgresMigrations(pool) {
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_warning TEXT');
  await pool.query(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card'`
  );
  await pool.query(
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_cost DOUBLE PRECISION'
  );
  await pool.query('ALTER TABLE products ALTER COLUMN sku DROP NOT NULL');
  await pool.query(
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS display_order INTEGER'
  );
  await pool.query(
    'ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_order INTEGER'
  );
  await pool.query(
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'simple'"
  );
  await pool.query(
    "UPDATE products SET product_type = 'simple' WHERE product_type IS NULL"
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS bundle_items (
      id SERIAL PRIMARY KEY,
      bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      display_order INTEGER DEFAULT 0,
      UNIQUE(bundle_product_id, component_product_id)
    )`
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_product_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type)'
  );
  await pool.query(
    `INSERT INTO product_categories (product_id, category_id)
     SELECT id, category_id FROM products WHERE category_id IS NOT NULL
     ON CONFLICT (product_id, category_id) DO NOTHING`
  );
}

module.exports = { runPostgresMigrations };
