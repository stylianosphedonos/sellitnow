const crypto = require('crypto');
const { pool } = require('../database/db');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
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
  // Accept YYYY-MM-DD or full ISO; store date-only YYYY-MM-DD
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
  return {
    id: row.id,
    code: row.code,
    discount_percent: Number(row.discount_percent),
    expires_at,
    label: row.label || null,
    is_active: active,
    expired,
    status: !active ? 'inactive' : expired ? 'expired' : 'active',
    created_at: row.created_at,
  };
}

class VoucherService {
  async list({ status } = {}) {
    const result = await pool.query(
      `SELECT id, code, discount_percent, expires_at, label, is_active, created_at
       FROM discount_vouchers
       ORDER BY created_at DESC, id DESC`
    );
    let rows = (result.rows || []).map(mapRow);
    const filter = String(status || 'all').toLowerCase();
    if (filter === 'active') rows = rows.filter((r) => r.status === 'active');
    else if (filter === 'expired') rows = rows.filter((r) => r.status === 'expired');
    else if (filter === 'inactive') rows = rows.filter((r) => r.status === 'inactive');
    return rows;
  }

  async getById(id) {
    const result = await pool.query(
      `SELECT id, code, discount_percent, expires_at, label, is_active, created_at
       FROM discount_vouchers WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) throw new Error('Voucher not found');
    return mapRow(result.rows[0]);
  }

  async getByIds(ids) {
    const list = [...new Set((ids || []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
    if (!list.length) return [];
    const placeholders = list.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `SELECT id, code, discount_percent, expires_at, label, is_active, created_at
       FROM discount_vouchers
       WHERE id IN (${placeholders})
       ORDER BY created_at DESC, id DESC`,
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

  /**
   * Create one or many vouchers with the same discount % and expiry.
   * @param {{ discount_percent: number, expires_at?: string, quantity?: number, label?: string, code?: string }} data
   */
  async create(data = {}) {
    const discount_percent = parseDiscountPercent(data.discount_percent);
    const expires_at = parseExpiresAt(data.expires_at);
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
        `INSERT INTO discount_vouchers (code, discount_percent, expires_at, label, is_active)
         VALUES ($1, $2, $3, $4, 1)
         RETURNING id, code, discount_percent, expires_at, label, is_active, created_at`,
        [code, discount_percent, expires_at, label]
      );
      created.push(mapRow(result.rows[0]));
    }
    return created;
  }

  async setActive(id, isActive) {
    const result = await pool.query(
      `UPDATE discount_vouchers
       SET is_active = $2
       WHERE id = $1
       RETURNING id, code, discount_percent, expires_at, label, is_active, created_at`,
      [id, isActive ? 1 : 0]
    );
    if (!result.rows.length) throw new Error('Voucher not found');
    return mapRow(result.rows[0]);
  }

  async remove(id) {
    const result = await pool.query('DELETE FROM discount_vouchers WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) throw new Error('Voucher not found');
    return true;
  }

  formatExportText(vouchers) {
    const lines = (vouchers || []).map((v) => {
      const parts = [v.code, `${Number(v.discount_percent)}%`];
      if (v.expires_at) parts.push(`expires ${v.expires_at}`);
      else parts.push('no expiry');
      if (v.label) parts.push(v.label);
      return parts.join('\t');
    });
    return lines.join('\n') + (lines.length ? '\n' : '');
  }
}

module.exports = new VoucherService();
