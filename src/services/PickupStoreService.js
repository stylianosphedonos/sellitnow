const { pool } = require('../database/db');
const { CHECKOUT_COUNTRY, normalizeCountry } = require('../lib/checkoutAddress');

const DEFAULT_CYPRUS_STORES = [
  {
    code: 'nicosia-makarios',
    name: 'Nicosia — Makarios Avenue',
    address_line1: 'Arch. Makarios III Ave 45',
    city: 'Nicosia',
    postal_code: '1065',
    hours: 'Mon–Fri 09:00–18:00, Sat 09:00–14:00',
    display_order: 10,
  },
  {
    code: 'nicosia-strovolos',
    name: 'Nicosia — Strovolos',
    address_line1: 'Strovolos Ave 120',
    city: 'Nicosia',
    postal_code: '2042',
    hours: 'Mon–Fri 09:00–18:00, Sat 09:00–14:00',
    display_order: 20,
  },
  {
    code: 'limassol-makarios',
    name: 'Limassol — Makarios Avenue',
    address_line1: 'Arch. Makarios III Ave 88',
    city: 'Limassol',
    postal_code: '3020',
    hours: 'Mon–Fri 09:00–18:00, Sat 09:00–14:00',
    display_order: 30,
  },
  {
    code: 'limassol-germanas',
    name: 'Limassol — Germasogeia',
    address_line1: 'Georgiou A Ave 15',
    city: 'Limassol',
    postal_code: '4047',
    hours: 'Mon–Fri 09:00–18:00, Sat 09:00–13:00',
    display_order: 40,
  },
  {
    code: 'larnaca-finikoudes',
    name: 'Larnaca — City Centre',
    address_line1: 'Athens Ave 22',
    city: 'Larnaca',
    postal_code: '6023',
    hours: 'Mon–Fri 09:00–18:00, Sat 09:00–14:00',
    display_order: 50,
  },
  {
    code: 'paphos-harbour',
    name: 'Paphos — Harbour Area',
    address_line1: 'Poseidonos Ave 8',
    city: 'Paphos',
    postal_code: '8042',
    hours: 'Mon–Fri 09:00–17:30, Sat 09:00–13:00',
    display_order: 60,
  },
  {
    code: 'paralimni-centre',
    name: 'Paralimni — Town Centre',
    address_line1: '1st April Street 30',
    city: 'Paralimni',
    postal_code: '5280',
    hours: 'Mon–Fri 09:00–17:30, Sat 09:00–13:00',
    display_order: 70,
  },
];

function rowToStore(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address_line1: row.address_line1,
    city: row.city,
    postal_code: row.postal_code,
    country: normalizeCountry(row.country) || CHECKOUT_COUNTRY,
    phone: row.phone || null,
    hours: row.hours || null,
    active: row.active === true || row.active === 1 || row.active === '1',
    display_order: Number(row.display_order) || 0,
    created_at: row.created_at,
  };
}

function slugifyCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

class PickupStoreService {
  async listActive() {
    const result = await pool.query(
      `SELECT * FROM pickup_stores
       WHERE active = TRUE AND UPPER(TRIM(country)) = $1
       ORDER BY display_order ASC, city ASC, name ASC`,
      [CHECKOUT_COUNTRY]
    );
    return result.rows.map(rowToStore);
  }

  async listAll() {
    const result = await pool.query(
      `SELECT * FROM pickup_stores
       ORDER BY display_order ASC, city ASC, name ASC`
    );
    return result.rows.map(rowToStore);
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
        (code, name, address_line1, city, postal_code, country, phone, hours, active, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        payload.code,
        payload.name,
        payload.address_line1,
        payload.city,
        payload.postal_code,
        payload.country,
        payload.phone,
        payload.hours,
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
        name = $2,
        address_line1 = $3,
        city = $4,
        postal_code = $5,
        country = $6,
        phone = $7,
        hours = $8,
        active = $9,
        display_order = $10
       WHERE id = $11
       RETURNING *`,
      [
        payload.code,
        payload.name,
        payload.address_line1,
        payload.city,
        payload.postal_code,
        payload.country,
        payload.phone,
        payload.hours,
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

  normalizeInput(input, { requireCode }) {
    const name = String(input.name || '').trim();
    const address_line1 = String(input.address_line1 || '').trim();
    const city = String(input.city || '').trim();
    const postal_code = String(input.postal_code || '').trim();
    if (!name || !address_line1 || !city || !postal_code) {
      throw new Error('Name, address, city, and postal code are required');
    }
    let code = String(input.code || '').trim();
    if (!code) {
      if (requireCode) throw new Error('Store code is required');
      code = slugifyCode(`${city}-${name}`) || `store-${Date.now()}`;
    } else {
      code = slugifyCode(code);
    }
    if (!code) throw new Error('Invalid store code');

    const country = normalizeCountry(input.country) || CHECKOUT_COUNTRY;
    if (country !== CHECKOUT_COUNTRY) {
      throw new Error('Pickup stores must be in Cyprus (CY)');
    }

    const activeRaw = input.active;
    const active =
      activeRaw === undefined || activeRaw === null
        ? true
        : activeRaw === true || activeRaw === 1 || activeRaw === '1' || activeRaw === 'true';

    const display_order = Number(input.display_order);
    return {
      code,
      name,
      address_line1,
      city,
      postal_code,
      country: CHECKOUT_COUNTRY,
      phone: String(input.phone || '').trim() || null,
      hours: String(input.hours || '').trim() || null,
      active,
      display_order: Number.isFinite(display_order) ? display_order : 0,
    };
  }

  /**
   * Idempotent seed of default Cyprus pickup points when the table is empty.
   */
  async ensureDefaultCyprusStores() {
    const countRes = await pool.query('SELECT COUNT(*) as count FROM pickup_stores');
    const count = Number(countRes.rows[0]?.count || 0);
    if (count > 0) return { seeded: false, count };

    for (const store of DEFAULT_CYPRUS_STORES) {
      await pool.query(
        `INSERT INTO pickup_stores
          (code, name, address_line1, city, postal_code, country, hours, active, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
         ON CONFLICT (code) DO NOTHING`,
        [
          store.code,
          store.name,
          store.address_line1,
          store.city,
          store.postal_code,
          CHECKOUT_COUNTRY,
          store.hours,
          store.display_order,
        ]
      );
    }
    return { seeded: true, count: DEFAULT_CYPRUS_STORES.length };
  }
}

module.exports = new PickupStoreService();
module.exports.DEFAULT_CYPRUS_STORES = DEFAULT_CYPRUS_STORES;
