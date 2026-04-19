const express = require('express');
const path = require('path');
const config = require('../config');
const ProductService = require('../services/ProductService');
const CategoryService = require('../services/CategoryService');
const OrderService = require('../services/OrderService');
const bcrypt = require('bcryptjs');
const { pool } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  uploadProductImages,
  uploadBanner,
  uploadLogo,
  uploadCategoryImage,
  uploadAllProductsTileImage,
} = require('../middleware/upload');
const { publicUrlForUploadedFile } = require('../lib/mediaPublicUrl');
const { getBrandSettings, normalizeCurrency, normalizeEmailFromInput } = require('./brand');
const EmailService = require('../services/EmailService');
const { formatMoney } = require('../lib/formatMoney');
const PDFDocument = require('pdfkit');
const { createFullBackup, restoreFullBackup } = require('../services/DatabaseBackupService');

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

function parseRequiredNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${fieldName} is required.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, fieldName, { required = false, defaultValue = undefined } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${fieldName} is required.`);
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be a whole number.`);
  }
  if (parsed < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }
  return parsed;
}

function parseNullableInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be a whole number.`);
  }
  return parsed;
}

function normalizeProductPayload(data, { forUpdate = false } = {}) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid request body');
  }

  const clean = { ...data };

  clean.price = parseRequiredNumber(clean.price, 'Price');
  clean.stock_quantity = parseNonNegativeInteger(clean.stock_quantity, 'Stock quantity', {
    required: false,
    defaultValue: 0,
  });
  const parsedSingleCategoryId = parseNullableInteger(clean.category_id, 'Category id');
  const categoryIdsInput = Array.isArray(clean.category_ids)
    ? clean.category_ids
    : (parsedSingleCategoryId != null ? [parsedSingleCategoryId] : []);
  clean.category_ids = [...new Set(
    categoryIdsInput
      .map((x) => parseNullableInteger(x, 'Category id'))
      .filter((x) => x != null)
  )];
  clean.category_id = clean.category_ids[0] ?? null;

  if (!forUpdate) {
    if (!String(clean.title || '').trim()) throw new Error('Title is required.');
    if (!String(clean.sku || '').trim()) throw new Error('SKU is required.');
  }

  if (data.delivery_cost !== undefined) {
    if (data.delivery_cost === null || data.delivery_cost === '') {
      clean.delivery_cost = null;
    } else {
      const d = Number(data.delivery_cost);
      if (!Number.isFinite(d) || d < 0) {
        throw new Error('Delivery cost must be a non-negative number when set.');
      }
      clean.delivery_cost = d;
    }
  }

  return clean;
}

// Products
router.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const q = String(req.query.q || req.query.search || '').trim();
    const result = await ProductService.adminList(page, limit, q);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/products', async (req, res) => {
  try {
    const data = normalizeProductPayload(req.body);
    const product = await ProductService.create(data, []);
    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const clean = normalizeProductPayload(req.body, { forUpdate: true });
    const product = await ProductService.update(id, clean, []);
    res.json({ product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/products/:id/images', uploadProductImages, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const files = req.files || [];
    const product = await ProductService.update(id, {}, files);
    res.json({ product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/products/:id/images/:imageId', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const imageId = parseInt(req.params.imageId, 10);
    const product = await ProductService.removeImage(id, imageId);
    res.json({ product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await ProductService.delete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Categories (admin create/update if needed)
router.post('/categories', async (req, res) => {
  try {
    const category = await CategoryService.create(req.body);
    res.status(201).json({ category });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const category = await CategoryService.update(id, req.body);
    res.json({ category });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/categories/:id/image', uploadCategoryImage, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const url = await publicUrlForUploadedFile(req.file);
    const category = await CategoryService.update(id, { image_url: url });
    res.json({ category });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/categories/:id/image', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const category = await CategoryService.update(id, { image_url: null });
    res.json({ category });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Orders
router.get('/orders', async (req, res) => {
  try {
    const search = req.query.search || '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await OrderService.adminListOrders(search, page, limit, status || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const order = await OrderService.adminGetOrder(id);
    res.json({ order });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.patch('/orders/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, tracking_number, send_customer_email } = req.body || {};
    const result = await OrderService.updateOrderStatus(id, status, tracking_number, {
      sendCustomerEmail: Boolean(send_customer_email),
    });
    res.json({
      order: result.order,
      customerEmailDraft: result.customerEmailDraft,
      customerEmailSent: result.customerEmailSent,
      customerEmailError: result.customerEmailError,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/orders/status/bulk', async (req, res) => {
  try {
    const { order_ids, status, tracking_number } = req.body || {};
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'order_ids is required' });
    }
    const ids = [...new Set(order_ids.map((id) => parseInt(id, 10)).filter(Number.isInteger))];
    if (!ids.length) {
      return res.status(400).json({ error: 'No valid order IDs provided' });
    }
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'status is required' });
    }

    const updates = await Promise.all(
      ids.map(async (id) => {
        const r = await OrderService.updateOrderStatus(id, status, tracking_number, {
          sendCustomerEmail: false,
        });
        return r.order;
      })
    );
    res.json({ orders: updates, updated_count: updates.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Invoice PDF
router.get('/orders/:id/invoice', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const order = await OrderService.adminGetOrder(id);
    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).text(`Invoice #${order.order_number}`, 50, 50);
    doc.fontSize(12).text(`Date: ${new Date(order.created_at).toLocaleDateString()}`, 50, 80);
    doc.text(`Status: ${order.status}`, 50, 95);
    doc.text(`Total: ${fmt(order.total_amount)}`, 50, 110);
    if (order.stock_warning) {
      doc.fillColor('#b45309');
      doc.text(`Stock notice: ${order.stock_warning}`, 50, doc.y + 8, { width: 500 });
      doc.fillColor('black');
    }
    doc.text('Items:', 50, doc.y + 14);
    doc.moveDown(0.5);

    let y = doc.y;
    for (const item of order.items) {
      const snapshot = typeof item.product_snapshot === 'string' ? JSON.parse(item.product_snapshot) : item.product_snapshot;
      const bits = [snapshot?.color, snapshot?.size].filter(Boolean);
      const variant = bits.length ? ` (${bits.join(', ')})` : '';
      doc.text(`${snapshot?.title || 'Item'}${variant} x ${item.quantity} @ ${fmt(item.unit_price)} = ${fmt(item.total_price)}`, 50, y);
      y += 20;
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customers
router.get('/customers', async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let query = 'SELECT id, email, first_name, last_name, phone, is_active, created_at FROM users WHERE role = $1';
    const params = ['customer'];
    let i = 2;

    if (search) {
      query += ` AND (email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }
    query += ` ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const countQuery = search
      ? 'SELECT COUNT(*)::int FROM users WHERE role = $1 AND (email ILIKE $2 OR first_name ILIKE $2 OR last_name ILIKE $2)'
      : 'SELECT COUNT(*)::int FROM users WHERE role = $1';
    const countParams = search ? ['customer', `%${search}%`] : ['customer'];
    const countResult = await pool.query(countQuery, countParams);
    const total = countResult.rows[0].count;

    res.json({
      items: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/customers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name, phone, is_active, created_at FROM users WHERE id = $1 AND role = $2',
      [id, 'customer']
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const orders = await pool.query(
      'SELECT id, order_number, status, total_amount, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json({
      customer: userResult.rows[0],
      orders: orders.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Brand settings
router.get('/brand', async (req, res) => {
  try {
    const settings = await getBrandSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/brand', async (req, res) => {
  try {
    const {
      primary,
      primaryDark,
      secondary,
      accent,
      banner,
      logo,
      allProductsImage,
      currency,
      taxRatePercent,
      heroTitle,
      heroSubtitle,
      heroBannerOverlay,
      emailFrom,
      defaultDeliveryCost,
    } = req.body;
    const updates = [
      primary != null && { key: 'primary', value: String(primary) },
      primaryDark != null && { key: 'primaryDark', value: String(primaryDark) },
      secondary != null && { key: 'secondary', value: String(secondary) },
      accent != null && { key: 'accent', value: String(accent) },
      banner !== undefined && { key: 'banner', value: String(banner || '') },
      logo !== undefined && { key: 'logo', value: String(logo || '') },
      allProductsImage !== undefined && { key: 'allProductsImage', value: String(allProductsImage || '') },
      heroTitle !== undefined && { key: 'heroTitle', value: String(heroTitle) },
      heroSubtitle !== undefined && { key: 'heroSubtitle', value: String(heroSubtitle) },
    ].filter(Boolean);

    if (heroBannerOverlay !== undefined && heroBannerOverlay !== null && String(heroBannerOverlay).trim() !== '') {
      const o = parseFloat(heroBannerOverlay);
      if (!Number.isFinite(o) || o < 0 || o > 0.85) {
        return res.status(400).json({ error: 'Hero banner dimming must be between 0 and 0.85.' });
      }
      updates.push({ key: 'heroBannerOverlay', value: String(Math.round(o * 1000) / 1000) });
    }

    if (currency !== undefined && currency !== null && String(currency).trim() !== '') {
      const cur = normalizeCurrency(currency);
      if (!cur) return res.status(400).json({ error: 'Currency must be a 3-letter ISO 4217 code (e.g. USD, EUR).' });
      updates.push({ key: 'currency', value: cur });
    }
    if (taxRatePercent !== undefined && taxRatePercent !== null && String(taxRatePercent).trim() !== '') {
      const t = parseFloat(taxRatePercent);
      if (!Number.isFinite(t) || t < 0 || t > 100) {
        return res.status(400).json({ error: 'Tax rate must be between 0 and 100 percent.' });
      }
      updates.push({ key: 'taxRatePercent', value: String(Math.round(t * 100) / 100) });
    }

    if (defaultDeliveryCost !== undefined && defaultDeliveryCost !== null && String(defaultDeliveryCost).trim() !== '') {
      const d = parseFloat(defaultDeliveryCost);
      if (!Number.isFinite(d) || d < 0) {
        return res.status(400).json({ error: 'Default delivery cost must be a non-negative number.' });
      }
      updates.push({ key: 'defaultDeliveryCost', value: String(Math.round(d * 100) / 100) });
    }

    if (emailFrom !== undefined) {
      if (emailFrom === null || String(emailFrom).trim() === '') {
        await pool.query(`DELETE FROM brand_settings WHERE key = 'emailFrom'`);
      } else {
        const normalized = normalizeEmailFromInput(emailFrom);
        await pool.query(
          'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          ['emailFrom', normalized]
        );
      }
    }

    const smtpSettingKeys = ['smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass'];
    if (req.body.smtpHost !== undefined) {
      const rawHost = req.body.smtpHost;
      if (rawHost === null || String(rawHost).trim() === '') {
        const delPh = smtpSettingKeys.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(`DELETE FROM brand_settings WHERE key IN (${delPh})`, smtpSettingKeys);
      } else {
        const host = String(rawHost).trim();
        if (host.length > 253) {
          return res.status(400).json({ error: 'SMTP host is too long.' });
        }
        await pool.query(
          'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          ['smtpHost', host]
        );
      }
    }

    const smtpHostCleared =
      req.body.smtpHost !== undefined && (req.body.smtpHost === null || String(req.body.smtpHost).trim() === '');

    if (!smtpHostCleared) {
      if (req.body.smtpPort !== undefined) {
        if (req.body.smtpPort === null || String(req.body.smtpPort).trim() === '') {
          await pool.query(`DELETE FROM brand_settings WHERE key = 'smtpPort'`);
        } else {
          const p = parseInt(req.body.smtpPort, 10);
          if (!Number.isFinite(p) || p < 1 || p > 65535) {
            return res.status(400).json({ error: 'SMTP port must be between 1 and 65535.' });
          }
          await pool.query(
            'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            ['smtpPort', String(p)]
          );
        }
      }
      if (req.body.smtpUser !== undefined) {
        const u = req.body.smtpUser == null ? '' : String(req.body.smtpUser).trim();
        await pool.query(
          'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          ['smtpUser', u]
        );
      }
      if (req.body.smtpSecure !== undefined) {
        const sec = Boolean(req.body.smtpSecure);
        await pool.query(
          'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          ['smtpSecure', sec ? 'true' : 'false']
        );
      }
      if (req.body.smtpPass !== undefined) {
        if (req.body.smtpPass === null || req.body.smtpPass === '') {
          await pool.query(`DELETE FROM brand_settings WHERE key = 'smtpPass'`);
        } else {
          await pool.query(
            'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            ['smtpPass', String(req.body.smtpPass)]
          );
        }
      }
    }

    for (const u of updates) {
      await pool.query(
        'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [u.key, u.value]
      );
    }

    const settings = await getBrandSettings();
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/email/test-send', async (req, res) => {
  try {
    const result = await EmailService.sendTestOutbound(req.body?.to);
    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        from: result.from,
        smtp: result.smtp || (await EmailService.smtpDiagnostics()),
      });
    }
    res.json({
      success: true,
      message: 'Test email sent. Check the inbox and spam folder.',
      from: result.from,
      to: result.to,
      smtp: result.smtp || (await EmailService.smtpDiagnostics()),
    });
  } catch (err) {
    console.error('[admin] POST /email/test-send:', err);
    res.status(500).json({
      error: err.message || 'Unexpected server error',
      smtp: await EmailService.smtpDiagnostics(),
    });
  }
});

router.post('/brand/banner', uploadBanner, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const url = await publicUrlForUploadedFile(req.file);
    await pool.query(
      'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['banner', url]
    );
    const settings = await getBrandSettings();
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/brand/logo', uploadLogo, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const url = await publicUrlForUploadedFile(req.file);
    await pool.query(
      'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['logo', url]
    );
    const settings = await getBrandSettings();
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/brand/all-products-image', uploadAllProductsTileImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const url = await publicUrlForUploadedFile(req.file);
    await pool.query(
      'INSERT INTO brand_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['allProductsImage', url]
    );
    const settings = await getBrandSettings();
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Full database backup/restore (admin-only)
router.get('/database/backup', async (req, res) => {
  try {
    const backup = await createFullBackup();
    const safeTs = String(backup?.createdAt || Date.now()).replace(/[:.]/g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="3nitylab-db-backup-${safeTs}.json"`);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/database/restore', async (req, res) => {
  try {
    const { backup } = req.body || {};
    if (!backup) return res.status(400).json({ error: 'Missing backup payload' });
    const result = await restoreFullBackup(backup);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// User Management (admin users for website management)
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, is_active, created_at FROM users WHERE role = $1 ORDER BY created_at DESC',
      ['admin']
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'Email, password, first name, and last name are required' });
    }
    if (password.length < config.app.passwordMinLength) {
      return res.status(400).json({
        error: `Password must be at least ${config.app.passwordMinLength} characters`,
      });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, role, failed_login_attempts, locked_until)
       VALUES ($1, $2, $3, $4, TRUE, 'admin', 0, NULL)
       RETURNING id, email, first_name, last_name, created_at`,
      [email.toLowerCase(), password_hash, first_name, last_name]
    );
    const user = result.rows[0];
    res.status(201).json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reset customer password (admin)
router.post('/customers/:id/reset-password', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { new_password } = req.body;
    if (!new_password || new_password.length < config.app.passwordMinLength) {
      return res.status(400).json({ error: `Password must be at least ${config.app.passwordMinLength} characters` });
    }

    const password_hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2', [
      password_hash,
      id,
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset any managed user's password (including the current admin's own account)
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });

    const { new_password } = req.body;
    if (!new_password || new_password.length < config.app.passwordMinLength) {
      return res.status(400).json({ error: `Password must be at least ${config.app.passwordMinLength} characters` });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });

    const password_hash = await bcrypt.hash(new_password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2',
      [password_hash, id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enable/disable any user (admin, cannot disable self)
router.patch('/users/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });

    const { is_active } = req.body || {};
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active (boolean) is required' });
    }
    if (id === req.user.id && !is_active) {
      return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    const result = await pool.query(
      `UPDATE users
       SET is_active = $2,
           failed_login_attempts = CASE WHEN $2 = 1 THEN failed_login_attempts ELSE 0 END,
           locked_until = CASE WHEN $2 = 1 THEN locked_until ELSE NULL END
       WHERE id = $1
       RETURNING id, email, first_name, last_name, role, is_active, created_at`,
      [id, is_active ? 1 : 0]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
