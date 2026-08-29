const bcrypt = require('bcryptjs');
const slugify = require('slugify');
const { pool, closeDb } = require('./db');
const {
  SAMPLE_PRODUCTS,
  upsertStorefrontCategories,
} = require('./storefrontDefaults');

async function seed() {
  try {
    const password_hash = await bcrypt.hash('admin123', 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, role, failed_login_attempts, locked_until)
       VALUES ($1, $2, $3, $4, TRUE, 'admin', 0, NULL)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         email_verified = TRUE,
         role = 'admin',
         failed_login_attempts = 0,
         locked_until = NULL`,
      ['admin@sellitnow.com', password_hash, 'Admin', 'User']
    );

    await upsertStorefrontCategories(pool);

    const catRes = await pool.query('SELECT id, slug FROM categories');
    const catBySlug = new Map(catRes.rows.map((row) => [row.slug, row.id]));

    for (const product of SAMPLE_PRODUCTS) {
      const categoryId = catBySlug.get(product.categorySlug);
      await pool.query(
        `INSERT INTO products (sku, title, title_el, slug, description, description_el, price, stock_quantity, category_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
         ON CONFLICT (sku) DO NOTHING`,
        [
          product.sku,
          product.title,
          product.title_el || null,
          slugify(product.title, { lower: true }),
          product.description,
          product.description_el || null,
          product.price,
          product.stock,
          categoryId,
        ]
      );
    }

    console.log('Seed completed successfully.');
    console.log('Admin: admin@sellitnow.com / admin123');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

seed();
