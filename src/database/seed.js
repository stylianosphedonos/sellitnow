const bcrypt = require('bcryptjs');
const { pool } = require('../database/db');
const slugify = require('slugify');

async function seed() {
  try {
    // Create or reset admin user (always use admin123 for development)
    const password_hash = await bcrypt.hash('admin123', 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, role, failed_login_attempts, locked_until)
       VALUES ($1, $2, $3, $4, 1, 'admin', 0, NULL)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         email_verified = 1,
         role = 'admin',
         failed_login_attempts = 0,
         locked_until = NULL`,
      ['admin@sellitnow.com', password_hash, 'Admin', 'User']
    );

    // Create sample categories
    await pool.query(
      `INSERT OR IGNORE INTO categories (name, slug, description) VALUES ($1, $2, $3)`,
      ['Electronics', 'electronics', 'Electronic devices and gadgets']
    );
    await pool.query(
      `INSERT OR IGNORE INTO categories (name, slug, description) VALUES ($1, $2, $3)`,
      ['Clothing', 'clothing', 'Apparel and fashion']
    );
    const catRes = await pool.query('SELECT id FROM categories ORDER BY id');
    const catId1 = catRes.rows[0]?.id || 1;
    const catId2 = catRes.rows[1]?.id || 2;

    // Create sample products
    await pool.query(
      `INSERT OR IGNORE INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      ['SKU-001', 'Wireless Headphones', slugify('Wireless Headphones', { lower: true }), 'High-quality wireless headphones', 49.99, 100, catId1]
    );
    await pool.query(
      `INSERT OR IGNORE INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      ['SKU-002', 'USB-C Cable', slugify('USB-C Cable', { lower: true }), 'Durable USB-C charging cable', 12.99, 200, catId1]
    );
    await pool.query(
      `INSERT OR IGNORE INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      ['SKU-003', 'Cotton T-Shirt', slugify('Cotton T-Shirt', { lower: true }), 'Comfortable cotton t-shirt', 19.99, 50, catId2]
    );
    await pool.query(
      `UPDATE products SET options_json = $1 WHERE sku = 'SKU-003'`,
      [JSON.stringify({ colors: ['Black', 'White', 'Navy'], sizes: ['S', 'M', 'L', 'XL'] })]
    );

    console.log('Seed completed successfully.');
    console.log('Admin: admin@sellitnow.com / admin123');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    const { db } = require('./db');
    db.close();
  }
}

seed();
