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
const categoryRequestsRoutes = require('./routes/categoryRequests');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const brandRoutes = require('./routes/brand');
const pickupStoresRoutes = require('./routes/pickupStores');

const PaymentService = require('./services/PaymentService');
const { optionalAuth } = require('./middleware/auth');
const {
  SAMPLE_PRODUCTS,
  upsertStorefrontCategories,
  migrateLegacyHeroCopy,
} = require('./database/storefrontDefaults');

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
app.use(
  uploadMount,
  express.static(config.app.uploadDir, {
    maxAge: '365d',
    immutable: true,
    etag: true,
  })
);

// API before public static so /api/* is never shadowed by files under public/
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/categories', categoriesRoutes);
app.use('/api/v1/category-requests', categoryRequestsRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/brand', brandRoutes);
app.use('/api/v1/pickup-stores', pickupStoresRoutes);
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
    const { order_id, order_number, guest_token, shipping_address, guest_email } = req.body;
    const guestHeaderToken = typeof req.headers['x-guest-order-token'] === 'string' ? req.headers['x-guest-order-token'] : null;
    const orderRef = order_id ?? order_number;
    const userId = req.user?.id || null;
    const sessionId = req.headers['x-cart-session'] || null;

    if (shipping_address) {
      const result = await PaymentService.createCheckoutPaymentIntent({
        userId,
        sessionId,
        shippingAddress: shipping_address,
        guestEmail: guest_email,
      });
      return res.json(result);
    }

    if (!orderRef) {
      return res.status(400).json({ error: 'shipping_address or order_id is required' });
    }
    const result = await PaymentService.createPaymentIntent(orderRef, {
      userId,
      guestToken: guestHeaderToken || guest_token || null,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
paymentsRouter.post('/confirm', async (req, res) => {
  try {
    const { order_id, order_number, payment_intent_id, guest_token } = req.body;
    const guestHeaderToken = typeof req.headers['x-guest-order-token'] === 'string' ? req.headers['x-guest-order-token'] : null;
    const orderRef = order_id ?? order_number ?? null;
    if (!payment_intent_id) {
      return res.status(400).json({ error: 'payment_intent_id is required' });
    }
    const result = await PaymentService.confirmPaymentIntent(orderRef, payment_intent_id, {
      userId: req.user?.id || null,
      guestToken: guestHeaderToken || guest_token || null,
      sessionId: req.headers['x-cart-session'] || null,
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

// Static frontend (public folder).
// JS/CSS/HTML are not content-hashed, so always revalidate (ETag) — otherwise deploys
// look "missing" in production for up to maxAge (was 7d).
app.use(
  express.static(path.join(process.cwd(), 'public'), {
    etag: true,
    setHeaders(res, filePath) {
      if (/\.(html?|js|css|mjs|map)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
      }
      // Images, fonts, etc. under public/ — short browser cache is fine
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  })
);

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
  if (!productCols.some((c) => c.name === 'display_order')) {
    db.exec('ALTER TABLE products ADD COLUMN display_order INTEGER');
  }
  if (!productCols.some((c) => c.name === 'product_type')) {
    db.exec("ALTER TABLE products ADD COLUMN product_type TEXT DEFAULT 'simple' CHECK (product_type IN ('simple', 'bundle'))");
  }

  const categoryCols = db.prepare('PRAGMA table_info(categories)').all();
  if (!categoryCols.some((c) => c.name === 'display_order')) {
    db.exec('ALTER TABLE categories ADD COLUMN display_order INTEGER');
  }
  if (!categoryCols.some((c) => c.name === 'icon_size_px')) {
    db.exec('ALTER TABLE categories ADD COLUMN icon_size_px INTEGER');
  }
  if (!categoryCols.some((c) => c.name === 'icon_width_px')) {
    db.exec('ALTER TABLE categories ADD COLUMN icon_width_px INTEGER');
  }
  if (!categoryCols.some((c) => c.name === 'icon_height_px')) {
    db.exec('ALTER TABLE categories ADD COLUMN icon_height_px INTEGER');
  }
  if (categoryCols.some((c) => c.name === 'icon_size_px')) {
    db.exec(`
      UPDATE categories
      SET icon_height_px = icon_size_px
      WHERE icon_height_px IS NULL AND icon_size_px IS NOT NULL
    `);
  }
  if (!categoryCols.some((c) => c.name === 'show_on_website')) {
    db.exec('ALTER TABLE categories ADD COLUMN show_on_website INTEGER NOT NULL DEFAULT 1');
  }
  if (!categoryCols.some((c) => c.name === 'icon_align')) {
    db.exec("ALTER TABLE categories ADD COLUMN icon_align TEXT DEFAULT 'center'");
  }
  if (!categoryCols.some((c) => c.name === 'icon_focus')) {
    db.exec("ALTER TABLE categories ADD COLUMN icon_focus TEXT DEFAULT 'center'");
  }
  if (!categoryCols.some((c) => c.name === 'website_layout')) {
    db.exec("ALTER TABLE categories ADD COLUMN website_layout TEXT DEFAULT 'tile'");
    if (categoryCols.some((c) => c.name === 'icon_align')) {
      db.exec(`
        UPDATE categories SET website_layout = CASE
          WHEN icon_align = 'left' THEN 'banner-left'
          WHEN icon_align = 'right' THEN 'banner-right'
          ELSE 'tile'
        END
      `);
    }
  }
  if (!categoryCols.some((c) => c.name === 'category_type')) {
    db.exec("ALTER TABLE categories ADD COLUMN category_type TEXT DEFAULT 'browse'");
  }
  if (!categoryCols.some((c) => c.name === 'website_zone')) {
    db.exec("ALTER TABLE categories ADD COLUMN website_zone TEXT DEFAULT 'home-main'");
  }
  if (!categoryCols.some((c) => c.name === 'request_prompt')) {
    db.exec('ALTER TABLE categories ADD COLUMN request_prompt TEXT');
  }
  if (!categoryCols.some((c) => c.name === 'name_el')) {
    db.exec('ALTER TABLE categories ADD COLUMN name_el TEXT');
  }
  if (!categoryCols.some((c) => c.name === 'description_el')) {
    db.exec('ALTER TABLE categories ADD COLUMN description_el TEXT');
  }
  if (!categoryCols.some((c) => c.name === 'request_prompt_el')) {
    db.exec('ALTER TABLE categories ADD COLUMN request_prompt_el TEXT');
  }

  const productI18nCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (productI18nCols.length && !productI18nCols.includes('title_el')) {
    db.exec('ALTER TABLE products ADD COLUMN title_el TEXT');
  }
  if (productI18nCols.length && !productI18nCols.includes('description_el')) {
    db.exec('ALTER TABLE products ADD COLUMN description_el TEXT');
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
  db.exec(`CREATE TABLE IF NOT EXISTS bundle_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    display_order INTEGER DEFAULT 0,
    UNIQUE(bundle_product_id, component_product_id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_product_categories_category_id ON product_categories(category_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_product_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type)');
  db.exec(`INSERT OR IGNORE INTO product_categories (product_id, category_id)
    SELECT id, category_id FROM products WHERE category_id IS NOT NULL`);

  db.exec(`CREATE TABLE IF NOT EXISTS order_email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    email_type TEXT NOT NULL,
    label TEXT NOT NULL,
    recipient_to TEXT NOT NULL,
    subject TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    source TEXT NOT NULL DEFAULT 'system',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_order_email_logs_order_id ON order_email_logs(order_id)'
  );
  db.exec(`CREATE TABLE IF NOT EXISTS pickup_stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    provider TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    name TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'CY',
    phone TEXT,
    hours TEXT,
    lat REAL,
    lng REAL,
    active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS discount_vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_percent REAL NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
    expires_at TEXT,
    label TEXT,
    usage_type TEXT NOT NULL DEFAULT 'single' CHECK (usage_type IN ('single', 'multi')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  const voucherCols = db.prepare('PRAGMA table_info(discount_vouchers)').all().map((c) => c.name);
  if (voucherCols.length && !voucherCols.includes('usage_type')) {
    db.exec("ALTER TABLE discount_vouchers ADD COLUMN usage_type TEXT NOT NULL DEFAULT 'multi'");
  }
  db.exec(`CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL REFERENCES discount_vouchers(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    guest_email TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_discount_vouchers_code ON discount_vouchers(code)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_discount_vouchers_active ON discount_vouchers(is_active)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON voucher_redemptions(voucher_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user ON voucher_redemptions(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_email ON voucher_redemptions(guest_email)');
  const cartTableCols = db.prepare('PRAGMA table_info(cart)').all().map((c) => c.name);
  if (cartTableCols.length && !cartTableCols.includes('voucher_code')) {
    db.exec('ALTER TABLE cart ADD COLUMN voucher_code TEXT');
  }
  const orderColsForDiscount = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (orderColsForDiscount.length && !orderColsForDiscount.includes('discount_amount')) {
    db.exec('ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0');
  }
  if (orderColsForDiscount.length && !orderColsForDiscount.includes('voucher_code')) {
    db.exec('ALTER TABLE orders ADD COLUMN voucher_code TEXT');
  }
  const pickupCols = db.prepare('PRAGMA table_info(pickup_stores)').all().map((c) => c.name);
  if (!pickupCols.includes('provider')) {
    db.exec("ALTER TABLE pickup_stores ADD COLUMN provider TEXT NOT NULL DEFAULT 'manual'");
  }
  if (!pickupCols.includes('external_id')) {
    db.exec('ALTER TABLE pickup_stores ADD COLUMN external_id TEXT');
  }
  if (!pickupCols.includes('lat')) {
    db.exec('ALTER TABLE pickup_stores ADD COLUMN lat REAL');
  }
  if (!pickupCols.includes('lng')) {
    db.exec('ALTER TABLE pickup_stores ADD COLUMN lng REAL');
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_pickup_stores_active_order ON pickup_stores(active, display_order, city)'
  );
  db.exec('CREATE INDEX IF NOT EXISTS idx_pickup_stores_provider ON pickup_stores(provider)');
}

async function ensureDb() {
  try {
    const fs = require('fs');
    const dbMod = require('./database/db');
    if (config.database.usePostgres) {
      const { runPostgresMigrations } = require('./database/postgresMigrations');
      await runPostgresMigrations(dbMod.pool);
      const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.postgresql.sql'), 'utf8');
      await dbMod.execPostgresScript(dbMod.pool, schema);
      console.log('Database ready (PostgreSQL)');
      return;
    }
    const { db } = dbMod;
    // Older SQLite DBs may lack columns referenced by schema indexes (e.g. product_type).
    // Add critical columns before applying the full schema / index set.
    try {
      const productCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
      if (productCols.length && !productCols.includes('product_type')) {
        db.exec("ALTER TABLE products ADD COLUMN product_type TEXT DEFAULT 'simple'");
      }
      if (productCols.length && !productCols.includes('delivery_cost')) {
        db.exec('ALTER TABLE products ADD COLUMN delivery_cost REAL');
      }
      if (productCols.length && !productCols.includes('display_order')) {
        db.exec('ALTER TABLE products ADD COLUMN display_order INTEGER');
      }
      if (productCols.length && !productCols.includes('options_json')) {
        db.exec('ALTER TABLE products ADD COLUMN options_json TEXT');
      }
    } catch (preErr) {
      console.warn('SQLite pre-migrate:', preErr.message);
    }
    const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    db.exec(schema);
    runSchemaMigrations(db);
    const { seedDefaultGreekCopy } = require('./database/storefrontDefaults');
    const { copyGreekContentToElColumns } = require('./lib/localizedText');
    await seedDefaultGreekCopy(dbMod.pool);
    await copyGreekContentToElColumns(dbMod.pool);
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
    const { seedDefaultGreekCopy } = require('./database/storefrontDefaults');
    await migrateLegacyHeroCopy(pool);
    await seedDefaultGreekCopy(pool);

    const r = await pool.query('SELECT COUNT(*) as count FROM products');
    if (r.rows[0]?.count > 0) return;

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
    console.log('Sample products created');
  } catch (err) {
    console.warn('Could not seed:', err.message);
  }
}

async function afterListenStartup() {
  await ensureDb();
  await ensureSeed();
  try {
    const CourierPickupSyncService = require('./services/CourierPickupSyncService');
    const results = await CourierPickupSyncService.syncAll();
    const summary = Object.values(results)
      .map((r) => {
        if (r.skipped) return `${r.provider}: skipped`;
        if (!r.ok) return `${r.provider}: ${r.error || 'failed'}`;
        return `${r.provider}: ${r.active} active`;
      })
      .join('; ');
    console.log(`Pickup stores sync — ${summary}`);
  } catch (err) {
    console.warn('Could not sync pickup stores:', err.message);
  }
  const { startOrderExpiryScheduler } = require('./services/OrderExpiryScheduler');
  startOrderExpiryScheduler();
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
      console.log(`3nityLab listening on http://${HOST}:${PORT}`);
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
