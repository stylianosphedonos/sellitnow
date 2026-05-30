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
    'ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_size_px INTEGER'
  );
  await pool.query(
    'ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_width_px INTEGER'
  );
  await pool.query(
    'ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_height_px INTEGER'
  );
  await pool.query(`
    UPDATE categories
    SET icon_height_px = icon_size_px
    WHERE icon_height_px IS NULL AND icon_size_px IS NOT NULL
  `);
  await pool.query(
    'ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_on_website INTEGER NOT NULL DEFAULT 1'
  );
  await pool.query(
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_align TEXT DEFAULT 'center'"
  );
  await pool.query(
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_focus TEXT DEFAULT 'center'"
  );
  await pool.query(
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS website_layout TEXT DEFAULT 'tile'"
  );
  await pool.query(`
    UPDATE categories SET website_layout = CASE
      WHEN icon_align = 'left' THEN 'banner-left'
      WHEN icon_align = 'right' THEN 'banner-right'
      ELSE 'tile'
    END
    WHERE website_layout IS NULL OR website_layout = 'tile'
  `);
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
  await pool.query(
    `CREATE TABLE IF NOT EXISTS order_email_logs (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      email_type TEXT NOT NULL,
      label TEXT NOT NULL,
      recipient_to TEXT NOT NULL,
      subject TEXT,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      error_message TEXT,
      source TEXT NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_order_email_logs_order_id ON order_email_logs(order_id)'
  );
}

module.exports = { runPostgresMigrations };
