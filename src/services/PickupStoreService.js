const { pool } = require('../database/db');
const { CHECKOUT_COUNTRY, normalizeCountry } = require('../lib/checkoutAddress');

const PROVIDERS = {
  boxnow: 'boxnow',
  akis: 'akis',
  acs: 'acs',
  manual: 'manual',
};

const PROVIDER_LABELS = {
  boxnow: 'Box Now',
  akis: 'Akis Express',
  acs: 'ACS',
  manual: 'Manual',
};

function slugifyCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function rowToStore(row) {
  if (!row) return null;
  const provider = String(row.provider || PROVIDERS.manual).toLowerCase();
  return {
    id: row.id,
    code: row.code,
    provider,
    provider_label: PROVIDER_LABELS[provider] || provider,
    external_id: row.external_id || null,
    name: row.name,
    address_line1: row.address_line1,
    city: row.city,
    postal_code: row.postal_code,
    country: normalizeCountry(row.country) || CHECKOUT_COUNTRY,
    phone: row.phone || null,
    hours: row.hours || null,
    lat: row.lat != null && row.lat !== '' ? Number(row.lat) : null,
    lng: row.lng != null && row.lng !== '' ? Number(row.lng) : null,
    active: row.active === true || row.active === 1 || row.active === '1',
    display_order: Number(row.display_order) || 0,
    created_at: row.created_at,
  };
}

class PickupStoreService {
  async listActive(filters = {}) {
    const params = [CHECKOUT_COUNTRY];
    // Postgres boolean columns reject `active = 1`.
    let sql = `SELECT * FROM pickup_stores
       WHERE active = TRUE AND UPPER(TRIM(country)) = $1`;

    if (filters.provider) {
      params.push(String(filters.provider).toLowerCase());
      sql += ` AND LOWER(COALESCE(provider, 'manual')) = $${params.length}`;
    }
    if (filters.city) {
      params.push(String(filters.city).trim());
      sql += ` AND LOWER(TRIM(city)) = LOWER($${params.length})`;
    }
    if (filters.q) {
      params.push(`%${String(filters.q).trim().toLowerCase()}%`);
      sql += ` AND (
        LOWER(name) LIKE $${params.length}
        OR LOWER(address_line1) LIKE $${params.length}
        OR LOWER(city) LIKE $${params.length}
        OR LOWER(postal_code) LIKE $${params.length}
        OR LOWER(COALESCE(provider, '')) LIKE $${params.length}
      )`;
    }

    sql += ' ORDER BY provider ASC, city ASC, name ASC';
    const result = await pool.query(sql, params);
    return result.rows.map(rowToStore);
  }

  async listAll(filters = {}) {
    const params = [];
    let sql = 'SELECT * FROM pickup_stores WHERE 1=1';
    if (filters.provider) {
      params.push(String(filters.provider).toLowerCase());
      sql += ` AND LOWER(provider) = $${params.length}`;
    }
    sql += ' ORDER BY provider ASC, city ASC, name ASC';
    const result = await pool.query(sql, params);
    return result.rows.map(rowToStore);
  }

  async listCities() {
    const result = await pool.query(
      `SELECT DISTINCT city FROM pickup_stores
       WHERE active = TRUE AND UPPER(TRIM(country)) = $1
         AND city IS NOT NULL AND TRIM(city) <> ''
       ORDER BY city ASC`,
      [CHECKOUT_COUNTRY]
    );
    return result.rows.map((r) => r.city);
  }

  async countByProvider() {
    const result = await pool.query(
      `SELECT provider, COUNT(*) as count,
              SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) as active_count
       FROM pickup_stores
       GROUP BY provider`
    );
    const out = {};
    for (const row of result.rows) {
      out[String(row.provider || 'manual').toLowerCase()] = {
        total: Number(row.count) || 0,
        active: Number(row.active_count) || 0,
      };
    }
    return out;
  }

  async getById(id) {
    const storeId = parseInt(id, 10);
    if (!Number.isInteger(storeId) || storeId <= 0) return null;
    const result = await pool.query('SELECT * FROM pickup_stores WHERE id = $1', [storeId]);
    return rowToStore(result.rows[0]);
  }

  async getActiveById(id) {
    const store = await this.getById(id);
    if (!store || !store.active) return null;
    if (store.country !== CHECKOUT_COUNTRY) return null;
    return store;
  }

  async create(input) {
    const payload = this.normalizeInput(input, { requireCode: false });
    const result = await pool.query(
      `INSERT INTO pickup_stores
        (code, provider, external_id, name, address_line1, city, postal_code, country, phone, hours, lat, lng, active, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        payload.code,
        payload.provider,
        payload.external_id,
        payload.name,
        payload.address_line1,
        payload.city,
        payload.postal_code,
        payload.country,
        payload.phone,
        payload.hours,
        payload.lat,
        payload.lng,
        payload.active,
        payload.display_order,
      ]
    );
    return rowToStore(result.rows[0]);
  }

  async update(id, input) {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Pickup store not found');
    const payload = this.normalizeInput({ ...existing, ...input }, { requireCode: true });
    const result = await pool.query(
      `UPDATE pickup_stores SET
        code = $1,
        provider = $2,
        external_id = $3,
        name = $4,
        address_line1 = $5,
        city = $6,
        postal_code = $7,
        country = $8,
        phone = $9,
        hours = $10,
        lat = $11,
        lng = $12,
        active = $13,
        display_order = $14
       WHERE id = $15
       RETURNING *`,
      [
        payload.code,
        payload.provider,
        payload.external_id,
        payload.name,
        payload.address_line1,
        payload.city,
        payload.postal_code,
        payload.country,
        payload.phone,
        payload.hours,
        payload.lat,
        payload.lng,
        payload.active,
        payload.display_order,
        existing.id,
      ]
    );
    return rowToStore(result.rows[0]);
  }

  async remove(id) {
    const storeId = parseInt(id, 10);
    const result = await pool.query('DELETE FROM pickup_stores WHERE id = $1 RETURNING id', [
      storeId,
    ]);
    if (!result.rows.length) throw new Error('Pickup store not found');
    return true;
  }

  /**
   * Upsert a synced courier location. Returns whether inserted or updated.
   */
  async upsertSyncedStore(store) {
    const payload = this.normalizeInput(store, { requireCode: true });
    const existing = await pool.query('SELECT id FROM pickup_stores WHERE code = $1', [
      payload.code,
    ]);
    if (existing.rows.length) {
      await pool.query(
        `UPDATE pickup_stores SET
          provider = $1,
          external_id = $2,
          name = $3,
          address_line1 = $4,
          city = $5,
          postal_code = $6,
          country = $7,
          phone = $8,
          hours = $9,
          lat = $10,
          lng = $11,
          active = $12,
          display_order = $13
         WHERE code = $14`,
        [
          payload.provider,
          payload.external_id,
          payload.name,
          payload.address_line1,
          payload.city,
          payload.postal_code,
          payload.country,
          payload.phone,
          payload.hours,
          payload.lat,
          payload.lng,
          payload.active,
          payload.display_order,
          payload.code,
        ]
      );
      return 'updated';
    }
    await pool.query(
      `INSERT INTO pickup_stores
        (code, provider, external_id, name, address_line1, city, postal_code, country, phone, hours, lat, lng, active, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        payload.code,
        payload.provider,
        payload.external_id,
        payload.name,
        payload.address_line1,
        payload.city,
        payload.postal_code,
        payload.country,
        payload.phone,
        payload.hours,
        payload.lat,
        payload.lng,
        payload.active,
        payload.display_order,
      ]
    );
    return 'inserted';
  }

  async deletePlaceholderSeeds() {
    await pool.query(
      `DELETE FROM pickup_stores
       WHERE (provider = 'manual' OR provider IS NULL)
         AND code IN (
           'nicosia-makarios','nicosia-strovolos','limassol-makarios','limassol-germanas',
           'larnaca-finikoudes','paphos-harbour','paralimni-centre'
         )`
    );
  }

  normalizeInput(input, { requireCode }) {
    const name = String(input.name || '').trim();
    const address_line1 = String(input.address_line1 || '').trim();
    const city = String(input.city || '').trim();
    const postal_code = String(input.postal_code || '').trim() || '0000';
    if (!name || !address_line1 || !city) {
      throw new Error('Name, address, and city are required');
    }

    let provider = String(input.provider || PROVIDERS.manual)
      .trim()
      .toLowerCase();
    if (!PROVIDER_LABELS[provider]) provider = PROVIDERS.manual;

    const external_id = input.external_id != null ? String(input.external_id).trim() : null;

    let code = String(input.code || '').trim();
    if (!code) {
      if (requireCode) throw new Error('Store code is required');
      code =
        slugifyCode(`${provider}-${external_id || city}-${name}`) ||
        `${provider}-${Date.now()}`;
    } else {
      code = slugifyCode(code) || code;
    }
    if (!code) throw new Error('Invalid store code');

    const country = normalizeCountry(input.country) || CHECKOUT_COUNTRY;
    if (country !== CHECKOUT_COUNTRY) {
      throw new Error('Pickup stores must be in Cyprus (CY)');
    }

    const activeRaw = input.active;
    const active =
      activeRaw === undefined || activeRaw === null
        ? 1
        : activeRaw === true || activeRaw === 1 || activeRaw === '1' || activeRaw === 'true'
          ? 1
          : 0;

    const display_order = Number(input.display_order);
    const latNum = input.lat != null && input.lat !== '' ? Number(input.lat) : null;
    const lngNum = input.lng != null && input.lng !== '' ? Number(input.lng) : null;

    return {
      code,
      provider,
      external_id,
      name,
      address_line1,
      city,
      postal_code,
      country: CHECKOUT_COUNTRY,
      phone: String(input.phone || '').trim() || null,
      hours: String(input.hours || '').trim() || null,
      lat: Number.isFinite(latNum) ? latNum : null,
      lng: Number.isFinite(lngNum) ? lngNum : null,
      active,
      display_order: Number.isFinite(display_order) ? display_order : 0,
    };
  }
}

module.exports = new PickupStoreService();
module.exports.PROVIDERS = PROVIDERS;
module.exports.PROVIDER_LABELS = PROVIDER_LABELS;
