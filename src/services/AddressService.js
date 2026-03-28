const { pool } = require('../database/db');

class AddressService {
  async list(userId) {
    const result = await pool.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id',
      [userId]
    );
    return result.rows;
  }

  async getById(id, userId) {
    const result = await pool.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!result.rows.length) throw new Error('Address not found');
    return result.rows[0];
  }

  async create(userId, data) {
    const { address_line1, address_line2, city, postal_code, country, is_default } = data;

    if (is_default) {
      await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [userId]);
    }

    const result = await pool.query(
      `INSERT INTO addresses (user_id, address_line1, address_line2, city, postal_code, country, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, address_line1, address_line2 || null, city, postal_code, country, is_default ?? false]
    );
    return result.rows[0];
  }

  async update(id, userId, data) {
    const addr = await this.getById(id, userId);

    if (data.is_default) {
      await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [userId]);
    }

    const result = await pool.query(
      `UPDATE addresses SET
        address_line1 = COALESCE($2, address_line1),
        address_line2 = COALESCE($3, address_line2),
        city = COALESCE($4, city),
        postal_code = COALESCE($5, postal_code),
        country = COALESCE($6, country),
        is_default = COALESCE($7, is_default)
       WHERE id = $1 AND user_id = $8
       RETURNING *`,
      [
        id,
        data.address_line1 ?? addr.address_line1,
        data.address_line2 ?? addr.address_line2,
        data.city ?? addr.city,
        data.postal_code ?? addr.postal_code,
        data.country ?? addr.country,
        data.is_default ?? addr.is_default,
        userId,
      ]
    );
    return result.rows[0];
  }

  async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (!result.rows.length) throw new Error('Address not found');
    return { success: true };
  }
}

module.exports = new AddressService();
