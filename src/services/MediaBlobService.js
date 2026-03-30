const { v4: uuidv4 } = require('uuid');
const { pool, isPostgres } = require('../database/db');

class MediaBlobService {
  static assertPostgres() {
    if (!isPostgres) throw new Error('MediaBlobService requires PostgreSQL');
  }

  static async insert(buffer, contentType) {
    this.assertPostgres();
    const id = uuidv4();
    await pool.query('INSERT INTO media_blobs (id, content_type, data) VALUES ($1, $2, $3)', [
      id,
      contentType || 'application/octet-stream',
      buffer,
    ]);
    return id;
  }

  static async getById(id) {
    this.assertPostgres();
    const r = await pool.query('SELECT content_type, data FROM media_blobs WHERE id = $1', [id]);
    if (!r.rows.length) return null;
    const row = r.rows[0];
    return { contentType: row.content_type, data: row.data };
  }
}

module.exports = MediaBlobService;
