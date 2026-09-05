const crypto = require('crypto');
const { pool } = require('../database/db');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const USAGE_SINGLE = 'single';
const USAGE_MULTI = 'multi';

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeEmail(email) {
  const s = String(email || '')
    .trim()
    .toLowerCase();
  return s || null;
}

function generateCode(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function parseExpiresAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const dateOnly = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error('Expiry date must be YYYY-MM-DD.');
  }
  const d = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error('Expiry date is invalid.');
  return dateOnly;
}

function parseDiscountPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Discount percent must be a number.');
  if (n <= 0 || n > 100) throw new Error('Discount percent must be between 1 and 100.');
  return Math.round(n * 100) / 100;
}

function parseUsageType(value) {
  const raw = String(value || USAGE_SINGLE)
    .trim()
    .toLowerCase();
  if (raw === USAGE_MULTI || raw === 'multiuse' || raw === 'multi-used' || raw === 'multi_used') {
    return USAGE_MULTI;
  }
  if (raw === USAGE_SINGLE || raw === 'singleuse' || raw === 'single-used' || raw === 'single_used') {
    return USAGE_SINGLE;
  }
  throw new Error('Usage type must be single or multi.');
}

function isExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  const end = new Date(`${String(expiresAt).slice(0, 10)}T23:59:59.999Z`);
  return now.getTime() > end.getTime();
}

function mapRow(row) {
  if (!row) return null;
  const expires_at = row.expires_at || null;
  const active = Number(row.is_active) === 1;
  const expired = isExpired(expires_at);
  const usage_type = row.usage_type === USAGE_MULTI ? USAGE_MULTI : USAGE_SINGLE;
  const redemption_count = Number(row.redemption_count) || 0;
  let status = !active ? 'inactive' : expired ? 'expired' : 'active';
  if (status === 'active' && usage_type === USAGE_SINGLE && redemption_count > 0) {
    status = 'used';
  }
  return {
    id: row.id,
    code: row.code,
    discount_percent: Number(row.discount_percent),
    expires_at,
    label: row.label || null,
    usage_type,
    usage_label: usage_type === USAGE_MULTI ? 'Multi use (once per customer)' : 'Single use',
    is_active: active,
    expired,
    redemption_count,
    status,
    created_at: row.created_at,
  };
}

const VOUCHER_SELECT = `SELECT v.id, v.code, v.discount_percent, v.expires_at, v.label, v.is_active, v.usage_type, v.created_at,
  (SELECT COUNT(*) FROM voucher_redemptions r WHERE r.voucher_id = v.id) AS redemption_count
  FROM discount_vouchers v`;

class VoucherService {
  async list({ status } = {}) {
    const result = await pool.query(`${VOUCHER_SELECT} ORDER BY v.created_at DESC, v.id DESC`);
    let rows = (result.rows || []).map(mapRow);
    const filter = String(status || 'all').toLowerCase();
    if (filter === 'active') rows = rows.filter((r) => r.status === 'active');
    else if (filter === 'expired') rows = rows.filter((r) => r.status === 'expired');
    else if (filter === 'inactive') rows = rows.filter((r) => r.status === 'inactive');
    else if (filter === 'used') rows = rows.filter((r) => r.status === 'used');
    return rows;
  }

  async getById(id) {
    const result = await pool.query(`${VOUCHER_SELECT} WHERE v.id = $1`, [id]);
    if (!result.rows.length) throw new Error('Voucher not found');
    return mapRow(result.rows[0]);
  }

  async getByIds(ids) {
    const list = [...new Set((ids || []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
    if (!list.length) return [];
    const placeholders = list.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `${VOUCHER_SELECT} WHERE v.id IN (${placeholders}) ORDER BY v.created_at DESC, v.id DESC`,
      list
    );
    return (result.rows || []).map(mapRow);
  }

  async codeExists(code) {
    const result = await pool.query('SELECT id FROM discount_vouchers WHERE code = $1', [code]);
    return result.rows.length > 0;
  }

  async createUniqueCode(preferred) {
    if (preferred) {
      const code = normalizeCode(preferred);
      if (code.length < 4) throw new Error('Custom code must be at least 4 characters.');
      if (await this.codeExists(code)) throw new Error('That voucher code already exists.');
      return code;
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateCode(10);
      if (!(await this.codeExists(code))) return code;
    }
    throw new Error('Could not generate a unique voucher code. Try again.');
  }

  async create(data = {}) {
    const discount_percent = parseDiscountPercent(data.discount_percent);
    const expires_at = parseExpiresAt(data.expires_at);
    const usage_type = parseUsageType(data.usage_type);
    const label = data.label != null && String(data.label).trim() ? String(data.label).trim().slice(0, 120) : null;
    let quantity = data.quantity == null || data.quantity === '' ? 1 : Number(data.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      throw new Error('Quantity must be a whole number between 1 and 500.');
    }
    const customCode = data.code != null && String(data.code).trim() ? String(data.code).trim() : '';
    if (customCode && quantity > 1) {
      throw new Error('Custom code can only be used when creating a single voucher.');
    }

    const created = [];
    for (let i = 0; i < quantity; i++) {
      const code = await this.createUniqueCode(i === 0 ? customCode : '');
      const result = await pool.query(
        `INSERT INTO discount_vouchers (code, discount_percent, expires_at, label, usage_type, is_active)
         VALUES ($1, $2, $3, $4, $5, 1)
         RETURNING id, code, discount_percent, expires_at, label, usage_type, is_active, created_at`,
        [code, discount_percent, expires_at, label, usage_type]
      );
      const row = result.rows[0];
      row.redemption_count = 0;
      created.push(mapRow(row));
    }
    return created;
  }

  async setActive(id, isActive) {
    const result = await pool.query(
      `UPDATE discount_vouchers
       SET is_active = $2
       WHERE id = $1
       RETURNING id`,
      [id, isActive ? 1 : 0]
    );
    if (!result.rows.length) throw new Error('Voucher not found');
    return this.getById(id);
  }

  async remove(id) {
    const result = await pool.query('DELETE FROM discount_vouchers WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) throw new Error('Voucher not found');
    return true;
  }

  async hasUserRedeemed(voucherId, userId, client = null) {
    if (!userId) return false;
    const db = client || pool;
    const result = await db.query(
      'SELECT id FROM voucher_redemptions WHERE voucher_id = $1 AND user_id = $2 LIMIT 1',
      [voucherId, userId]
    );
    return result.rows.length > 0;
  }

  async hasGuestRedeemed(voucherId, guestEmail, client = null) {
    const email = normalizeEmail(guestEmail);
    if (!email) return false;
    const db = client || pool;
    const result = await db.query(
      `SELECT id FROM voucher_redemptions
       WHERE voucher_id = $1 AND lower(guest_email) = $2
       LIMIT 1`,
      [voucherId, email]
    );
    return result.rows.length > 0;
  }

  async emailForUser(userId, client = null) {
    if (!userId) return null;
    const db = client || pool;
    const result = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
    return normalizeEmail(result.rows[0]?.email);
  }

  async hasCustomerRedeemed(voucherId, userId, guestEmail, client = null) {
    if (await this.hasUserRedeemed(voucherId, userId, client)) return true;
    const email = normalizeEmail(guestEmail) || (await this.emailForUser(userId, client));
    if (!email) return false;
    if (await this.hasGuestRedeemed(voucherId, email, client)) return true;
    const db = client || pool;
    const viaAccount = await db.query(
      `SELECT r.id FROM voucher_redemptions r
       JOIN users u ON u.id = r.user_id
       WHERE r.voucher_id = $1 AND lower(u.email) = $2
       LIMIT 1`,
      [voucherId, email]
    );
    return viaAccount.rows.length > 0;
  }

  /**
   * Validate a code for cart/checkout.
   * @param {string} codeInput
   * @param {{ userId?: number|null, guestEmail?: string|null, requireIdentity?: boolean }} [ctx]
   */
  async validateApplicable(codeInput, ctx = {}) {
    const code = normalizeCode(codeInput);
    if (!code) throw new Error('Enter a voucher code.');
    const result = await pool.query(`${VOUCHER_SELECT} WHERE v.code = $1`, [code]);
    if (!result.rows.length) throw new Error('Voucher code not found.');
    const voucher = mapRow(result.rows[0]);
    if (!voucher.is_active) throw new Error('This voucher is no longer active.');
    if (voucher.expired) throw new Error('This voucher has expired.');

    if (voucher.usage_type === USAGE_SINGLE) {
      if (voucher.redemption_count > 0) {
        throw new Error('This single-use voucher has already been used.');
      }
      return voucher;
    }

    const userId = ctx.userId || null;
    const guestEmail = normalizeEmail(ctx.guestEmail);
    if (userId || guestEmail) {
      if (await this.hasCustomerRedeemed(voucher.id, userId, guestEmail)) {
        throw new Error('You have already used this voucher.');
      }
    } else if (ctx.requireIdentity) {
      throw new Error('Sign in or enter your email to use this voucher.');
    }

    return voucher;
  }

  /**
   * Record a successful order redemption.
   */
  async recordRedemption({ voucherCode, orderId, userId = null, guestEmail = null }, client = null) {
    const db = client || pool;
    const code = normalizeCode(voucherCode);
    if (!code || !orderId) return null;

    const found = await db.query(
      `SELECT id, usage_type FROM discount_vouchers WHERE code = $1`,
      [code]
    );
    if (!found.rows.length) return null;
    const voucherId = found.rows[0].id;
    const usageType = found.rows[0].usage_type === USAGE_MULTI ? USAGE_MULTI : USAGE_SINGLE;
    const email = normalizeEmail(guestEmail) || (await this.emailForUser(userId, db));

    if (usageType === USAGE_SINGLE) {
      const count = await db.query(
        'SELECT COUNT(*) AS c FROM voucher_redemptions WHERE voucher_id = $1',
        [voucherId]
      );
      if ((Number(count.rows[0]?.c) || 0) > 0) {
        throw new Error('This single-use voucher has already been used.');
      }
    } else if (await this.hasCustomerRedeemed(voucherId, userId, email, db)) {
      throw new Error('You have already used this voucher.');
    }

    await db.query(
      `INSERT INTO voucher_redemptions (voucher_id, order_id, user_id, guest_email)
       VALUES ($1, $2, $3, $4)`,
      [voucherId, orderId, userId || null, email]
    );

    if (usageType === USAGE_SINGLE) {
      await db.query('UPDATE discount_vouchers SET is_active = 0 WHERE id = $1', [voucherId]);
    }

    return voucherId;
  }

  formatExportText(vouchers) {
    const lines = (vouchers || []).map((v) => {
      const parts = [
        v.code,
        `${Number(v.discount_percent)}%`,
        v.usage_type === USAGE_MULTI ? 'multi-use' : 'single-use',
      ];
      if (v.expires_at) parts.push(`expires ${v.expires_at}`);
      else parts.push('no expiry');
      if (v.label) parts.push(v.label);
      parts.push(`redeemed ${Number(v.redemption_count) || 0}`);
      return parts.join('\t');
    });
    return lines.join('\n') + (lines.length ? '\n' : '');
  }
}

module.exports = new VoucherService();
module.exports.USAGE_SINGLE = USAGE_SINGLE;
module.exports.USAGE_MULTI = USAGE_MULTI;
