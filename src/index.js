const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const brandRoutes = require('./routes/brand');

const PaymentService = require('./services/PaymentService');

const app = express();

function parseTrustProxy() {
  const v = process.env.TRUST_PROXY;
  if (v === 'false' || v === '0') return false;
  if (v === 'true' || v === 'all') return true;
  if (v != null && String(v).trim() !== '') {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return 1;
}

app.set('trust proxy', parseTrustProxy());

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// CORS
app.use(cors({ origin: true, credentials: true }));

// Stripe webhook needs raw body - must be before express.json()
app.post(
  '/api/v1/payments/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];
      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }
      await PaymentService.handleWebhook(req.body, signature);
      res.json({ received: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// JSON body parser (for all other routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads (disk)
app.use(config.app.uploadUrlPrefix, express.static(config.app.uploadDir));

// API before public static so /api/* is never shadowed by files under public/
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/categories', categoriesRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/brand', brandRoutes);
app.use('/api/v1/admin', adminRoutes);

const paymentsRouter = express.Router();
paymentsRouter.get('/config', (req, res) => {
  const key = config.stripe?.publishableKey;
  if (!key) return res.status(503).json({ error: 'Stripe not configured' });
  res.json({ publishableKey: key });
});
paymentsRouter.post('/process', async (req, res) => {
  try {
    const { order_id, order_number, payment_method_id } = req.body;
    const orderRef = order_id ?? order_number;
    if (!orderRef || !payment_method_id) {
      return res.status(400).json({ error: 'order_id/order_number and payment_method_id required' });
    }
    const result = await PaymentService.processPayment(orderRef, payment_method_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
paymentsRouter.post('/create-intent', async (req, res) => {
  try {
    const { order_id, order_number } = req.body;
    const orderRef = order_id ?? order_number;
    if (!orderRef) return res.status(400).json({ error: 'order_id or order_number required' });
    const result = await PaymentService.createPaymentIntent(orderRef);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.use('/api/v1/payments', paymentsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.all('/api/v1/setup', async (req, res) => {
  try {
    const { pool } = require('./database/db');
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('admin123', 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, role, failed_login_attempts, locked_until)
       VALUES ($1, $2, $3, $4, 1, 'admin', 0, NULL)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         email_verified = 1,
         role = 'admin',
         failed_login_attempts = 0,
         locked_until = NULL`,
      ['admin@sellitnow.com', hash, 'Admin', 'User']
    );
    res.json({ message: 'Admin ready. Login with admin@sellitnow.com / admin123' });
  } catch (err) {
    const msg = err.message || err.code || err.detail || err.hint || (err.toString && err.toString()) || 'Unknown error';
    console.error('Setup failed:', err);
    res.status(500).json({ error: msg });
  }
});

// Static frontend (public folder)
app.use(express.static(path.join(process.cwd(), 'public')));

// SPA fallback - serve index.html for non-API routes that don't match static files
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'), (err) => {
    if (err) next();
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = config.port;

function runSchemaMigrations(db) {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('is_active')) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  }

  const productCols = db.prepare('PRAGMA table_info(products)').all();
  if (!productCols.some((c) => c.name === 'options_json')) {
    db.exec('ALTER TABLE products ADD COLUMN options_json TEXT');
  }

  const cartCols = db.prepare('PRAGMA table_info(cart_items)').all().map((c) => c.name);
  if (!cartCols.includes('color') || !cartCols.includes('size')) {
    db.exec(`CREATE TABLE cart_items_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      color TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(cart_id, product_id, color, size)
    )`);
    db.exec(`INSERT INTO cart_items_new (id, cart_id, product_id, quantity, created_at, color, size)
      SELECT id, cart_id, product_id, quantity, created_at, '', '' FROM cart_items`);
    db.exec('DROP TABLE cart_items');
    db.exec('ALTER TABLE cart_items_new RENAME TO cart_items');
  }
}

async function ensureDb() {
  try {
    const fs = require('fs');
    const { db } = require('./database/db');
    const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    db.exec(schema);
    runSchemaMigrations(db);
    console.log('Database ready');
  } catch (err) {
    console.error('Database init failed:', err.message);
    throw err;
  }
}

async function ensureAdmin() {
  try {
    const bcrypt = require('bcryptjs');
    const { pool } = require('./database/db');
    const hash = await bcrypt.hash('admin123', 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, role, failed_login_attempts, locked_until)
       VALUES ($1, $2, $3, $4, 1, 'admin', 0, NULL)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = excluded.password_hash,
         email_verified = 1,
         role = 'admin',
         failed_login_attempts = 0,
         locked_until = NULL`,
      ['admin@sellitnow.com', hash, 'Admin', 'User']
    );
    console.log('Admin ready: admin@sellitnow.com / admin123');
  } catch (err) {
    console.warn('Could not ensure admin:', err.message);
  }
}

async function ensureSeed() {
  try {
    const slugify = require('slugify');
    const { pool } = require('./database/db');
    const r = await pool.query('SELECT COUNT(*) as count FROM products');
    if (r.rows[0]?.count > 0) return;
    const cat1 = await pool.query(
      `INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
      ['Electronics', 'electronics', 'Electronic devices and gadgets']
    );
    const cat2 = await pool.query(
      `INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
      ['Clothing', 'clothing', 'Apparel and fashion']
    );
    const c1 = cat1.rows[0]?.id || 1;
    const c2 = cat2.rows[0]?.id || 2;
    await pool.query(
      `INSERT OR IGNORE INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      ['SKU-001', 'Wireless Headphones', 'wireless-headphones', 'High-quality wireless headphones', 49.99, 100, c1]
    );
    await pool.query(
      `INSERT OR IGNORE INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      ['SKU-002', 'USB-C Cable', 'usb-c-cable', 'Durable USB-C charging cable', 12.99, 200, c1]
    );
    await pool.query(
      `INSERT OR IGNORE INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      ['SKU-003', 'Cotton T-Shirt', 'cotton-t-shirt', 'Comfortable cotton t-shirt', 19.99, 50, c2]
    );
    await pool.query(
      `UPDATE products SET options_json = $1 WHERE sku = 'SKU-003'`,
      [JSON.stringify({ colors: ['Black', 'White', 'Navy'], sizes: ['S', 'M', 'L', 'XL'] })]
    );
    console.log('Sample products created');
  } catch (err) {
    console.warn('Could not seed:', err.message);
  }
}

async function startup() {
  await ensureDb();
  await ensureAdmin();
  await ensureSeed();
  app.listen(PORT, () => {
    console.log(`Sellitnow running at http://localhost:${PORT}`);
  });
}

startup().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});
