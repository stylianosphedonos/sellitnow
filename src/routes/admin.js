const express = require('express');
const path = require('path');
const config = require('../config');
const ProductService = require('../services/ProductService');
const CategoryService = require('../services/CategoryService');
const OrderService = require('../services/OrderService');
const bcrypt = require('bcryptjs');
const { pool } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { uploadProductImages, uploadBanner, uploadLogo, uploadCategoryImage } = require('../middleware/upload');
const { publicUrlForUploadedFile } = require('../lib/mediaPublicUrl');
const { getBrandSettings, normalizeCurrency } = require('./brand');
const { formatMoney } = require('../lib/formatMoney');
const PDFDocument = require('pdfkit');

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

// Products
router.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const result = await ProductService.adminList(page, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/products', async (req, res) => {
  try {
    const data = req.body;
    const product = await ProductService.create(data, []);
    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    const clean = { ...data };
    clean.category_id = (clean.category_id === '' || clean.category_id === undefined) ? null : parseInt(clean.category_id, 10);
    clean.stock_quantity = parseInt(clean.stock_quantity, 10) || 0;
    clean.price = parseFloat(clean.price) || 0;
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

// Orders
router.get('/orders', async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await OrderService.adminListOrders(search, page, limit);
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
    const { status, tracking_number } = req.body;
    const order = await OrderService.updateOrderStatus(id, status, tracking_number);
    res.json({ order });
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

    doc.moveDown(2);
    doc.text('Items:', 50, doc.y);
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
    const { primary, primaryDark, secondary, accent, banner, logo, currency, taxRatePercent, heroTitle, heroSubtitle } =
      req.body;
    const updates = [
      primary != null && { key: 'primary', value: String(primary) },
      primaryDark != null && { key: 'primaryDark', value: String(primaryDark) },
      secondary != null && { key: 'secondary', value: String(secondary) },
      accent != null && { key: 'accent', value: String(accent) },
      banner !== undefined && { key: 'banner', value: String(banner || '') },
      logo !== undefined && { key: 'logo', value: String(logo || '') },
      heroTitle !== undefined && { key: 'heroTitle', value: String(heroTitle) },
      heroSubtitle !== undefined && { key: 'heroSubtitle', value: String(heroSubtitle) },
    ].filter(Boolean);

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
