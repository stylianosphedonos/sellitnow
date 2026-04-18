const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const config = require('./config');

const MediaBlobService = require('./services/MediaBlobService');
const { isPostgres } = require('./database/db');

const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const brandRoutes = require('./routes/brand');

const PaymentService = require('./services/PaymentService');
const { optionalAuth } = require('./middleware/auth');

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
app.use(compression());

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// CORS
function parseCorsOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (!raw) return null;
  const origins = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return origins.length ? origins : null;
}

const corsOrigins = parseCorsOrigins();
app.use(
  cors({
    origin: corsOrigins || false,
    credentials: Boolean(corsOrigins && corsOrigins.length),
  })
);

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
// Used by admin actions like database restore (potentially large payloads).
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (
      config.env !== 'development' &&
      res.statusCode >= 500 &&
      body &&
      typeof body === 'object' &&
      typeof body.error === 'string'
    ) {
      return originalJson({ ...body, error: 'Internal server error' });
    }
    return originalJson(body);
  };
  next();
});
app.use((req, res, next) => {
  const m = req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
  if (!req.path.startsWith('/api/v1/')) return next();
  if (req.path === '/api/v1/payments/webhook') return next();
  const authCookie = req.cookies?.[config.auth.cookieName];
  if (!authCookie) return next();
  const csrfCookie = req.cookies?.[config.auth.csrfCookieName];
  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  return next();
});
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

function isUuidParam(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s));
}

const uploadMount = (config.app.uploadUrlPrefix || '/uploads').replace(/\/+$/, '') || '/uploads';

// PostgreSQL: binary images served from media_blobs (survives redeploy without a disk)
app.get(`${uploadMount}/blob/:id`, async (req, res, next) => {
  if (!isPostgres) return res.status(404).end();
  const { id } = req.params;
  if (!isUuidParam(id)) return res.status(404).end();
  try {
    const row = await MediaBlobService.getById(id);
    if (!row) return res.status(404).end();
    res.setHeader('Content-Type', row.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(row.data);
  } catch (err) {
    next(err);
  }
});

// Static uploads (disk — SQLite / local dev)
app.use(uploadMount, express.static(config.app.uploadDir));

// API before public static so /api/* is never shadowed by files under public/
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/categories', categoriesRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/brand', brandRoutes);
app.use('/api/v1/admin', adminRoutes);

const paymentsRouter = express.Router();
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many payment attempts, try again later' },
});
paymentsRouter.get('/config', async (req, res) => {
  const key = config.stripe?.publishableKey;
  if (!key) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const settings = await brandRoutes.getBrandSettings();
    res.json({
      publishableKey: key,
      currency: settings.currency || 'usd',
      paymentRequestCountry: config.stripe.paymentRequestCountry,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load payment config' });
  }
});
paymentsRouter.use(optionalAuth);
paymentsRouter.use(paymentLimiter);
paymentsRouter.post('/process', async (req, res) => {
  try {
    const { order_id, order_number, payment_method_id, guest_token } = req.body;
    const guestHeaderToken = typeof req.headers['x-guest-order-token'] === 'string' ? req.headers['x-guest-order-token'] : null;
    const orderRef = order_id ?? order_number;
    if (!orderRef || !payment_method_id) {
      return res.status(400).json({ error: 'order_id/order_number and payment_method_id required' });
    }
    const result = await PaymentService.processPayment(orderRef, payment_method_id, {
      userId: req.user?.id || null,
      guestToken: guestHeaderToken || guest_token || null,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
paymentsRouter.post('/create-intent', async (req, res) => {
  try {
    const { order_id, order_number, guest_token } = req.body;
    const guestHeaderToken = typeof req.headers['x-guest-order-token'] === 'string' ? req.headers['x-guest-order-token'] : null;
    const orderRef = order_id ?? order_number;
    if (!orderRef) return res.status(400).json({ error: 'order_id or order_number required' });
    const result = await PaymentService.createPaymentIntent(orderRef, {
      userId: req.user?.id || null,
      guestToken: guestHeaderToken || guest_token || null,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.use('/api/v1/payments', paymentsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Static frontend (public folder)
app.use(express.static(path.join(process.cwd(), 'public')));

// SPA fallback - serve index.html for non-API routes that don't match static files
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
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
  if (config.env === 'development') {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

const PORT = config.port;
const HOST = config.host;

function runSchemaMigrations(db) {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('is_active')) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  }

  const productCols = db.prepare('PRAGMA table_info(products)').all();
  if (!productCols.some((c) => c.name === 'options_json')) {
    db.exec('ALTER TABLE products ADD COLUMN options_json TEXT');
  }
  if (!productCols.some((c) => c.name === 'delivery_cost')) {
    db.exec('ALTER TABLE products ADD COLUMN delivery_cost REAL');
  }

  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!orderCols.includes('stock_warning')) {
    db.exec('ALTER TABLE orders ADD COLUMN stock_warning TEXT');
  }
  if (!orderCols.includes('payment_method')) {
    db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'card'");
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

  db.exec(`CREATE TABLE IF NOT EXISTS product_categories (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (product_id, category_id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_product_categories_category_id ON product_categories(category_id)');
  db.exec(`INSERT OR IGNORE INTO product_categories (product_id, category_id)
    SELECT id, category_id FROM products WHERE category_id IS NOT NULL`);
}

async function ensureDb() {
  try {
    const fs = require('fs');
    const dbMod = require('./database/db');
    if (config.database.usePostgres) {
      const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.postgresql.sql'), 'utf8');
      await dbMod.execPostgresScript(dbMod.pool, schema);
      await dbMod.pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_warning TEXT');
      await dbMod.pool.query(
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card'`
      );
      await dbMod.pool.query(
        'ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_cost DOUBLE PRECISION'
      );
      await dbMod.pool.query(
        `INSERT INTO product_categories (product_id, category_id)
         SELECT id, category_id FROM products WHERE category_id IS NOT NULL
         ON CONFLICT (product_id, category_id) DO NOTHING`
      );
      console.log('Database ready (PostgreSQL)');
      return;
    }
    const { db } = dbMod;
    const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    db.exec(schema);
    runSchemaMigrations(db);
    console.log('Database ready (SQLite)');
  } catch (err) {
    console.error('Database init failed:', err.message);
    throw err;
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
      `INSERT INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       ON CONFLICT (sku) DO NOTHING`,
      ['SKU-001', 'Wireless Headphones', 'wireless-headphones', 'High-quality wireless headphones', 49.99, 100, c1]
    );
    await pool.query(
      `INSERT INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       ON CONFLICT (sku) DO NOTHING`,
      ['SKU-002', 'USB-C Cable', 'usb-c-cable', 'Durable USB-C charging cable', 12.99, 200, c1]
    );
    await pool.query(
      `INSERT INTO products (sku, title, slug, description, price, stock_quantity, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       ON CONFLICT (sku) DO NOTHING`,
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

async function afterListenStartup() {
  await ensureDb();
  await ensureSeed();
}

function startup() {
  if (config.env !== 'development') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me') {
      throw new Error('JWT_SECRET must be configured in non-development environments');
    }
    if (!corsOrigins) {
      throw new Error('CORS_ALLOWED_ORIGINS must be configured in non-development environments');
    }
  }
  return new Promise((resolve, reject) => {
    app.listen(PORT, HOST, () => {
      console.log(`Sellitnow listening on http://${HOST}:${PORT}`);
      resolve();
    }).on('error', reject);
  });
}

startup()
  .then(() => afterListenStartup())
  .catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
