const slugify = require('slugify');
const { pool } = require('../database/db');
const { parseOptionsJson } = require('../lib/productOptions');

class CategoryService {
  async list() {
    const result = await pool.query(
      'SELECT id, name, slug, description, image_url FROM categories ORDER BY id'
    );
    return result.rows;
  }

  async getById(id) {
    const result = await pool.query(
      'SELECT id, name, slug, description, image_url FROM categories WHERE id = $1',
      [id]
    );
    if (!result.rows.length) throw new Error('Category not found');
    return result.rows[0];
  }

  async getBySlug(slug) {
    const result = await pool.query(
      'SELECT id, name, slug, description, image_url FROM categories WHERE slug = $1',
      [slug]
    );
    if (!result.rows.length) throw new Error('Category not found');
    return result.rows[0];
  }

  async getProductsByCategoryId(categoryId, page = 1, limit = 20, search = '') {
    const offset = (page - 1) * limit;
    const term = search != null ? String(search).trim() : '';
    const pattern = term ? `%${term}%` : null;

    const countResult = pattern
      ? await pool.query(
          `SELECT COUNT(*)::int FROM products p
           WHERE p.category_id = $1 AND p.status = $2
             AND (p.title ILIKE $3 OR COALESCE(p.description, '') ILIKE $3 OR COALESCE(p.sku, '') ILIKE $3)`,
          [categoryId, 'active', pattern]
        )
      : await pool.query(
          'SELECT COUNT(*)::int FROM products WHERE category_id = $1 AND status = $2',
          [categoryId, 'active']
        );

    const total = countResult.rows[0].count;

    const result = pattern
      ? await pool.query(
          `SELECT p.id, p.sku, p.title, p.slug, p.description, p.price, p.stock_quantity, p.status, p.options_json,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.category_id = $1 AND p.status = $2
             AND (p.title ILIKE $3 OR COALESCE(p.description, '') ILIKE $3 OR COALESCE(p.sku, '') ILIKE $3)
           ORDER BY p.id
           LIMIT $4 OFFSET $5`,
          [categoryId, 'active', pattern, limit, offset]
        )
      : await pool.query(
          `SELECT p.id, p.sku, p.title, p.slug, p.description, p.price, p.stock_quantity, p.status, p.options_json,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.category_id = $1 AND p.status = $2
           ORDER BY p.id
           LIMIT $3 OFFSET $4`,
          [categoryId, 'active', limit, offset]
        );

    const items = result.rows.map((row) => {
      const opts = parseOptionsJson(row.options_json);
      const { options_json: _o, ...rest } = row;
      return { ...rest, options: opts };
    });

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data) {
    const name = data.name != null ? String(data.name).trim() : '';
    if (!name) throw new Error('Name is required');
    const slugRaw = data.slug != null ? String(data.slug).trim() : '';
    const slug = slugRaw ? slugRaw : slugify(name, { lower: true });
    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, description, image_url`,
      [name, slug, data.description != null ? data.description : null, data.image_url || null]
    );
    return result.rows[0];
  }

  async update(id, data) {
    const updates = [];
    const values = [];
    let i = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${i++}`);
      values.push(data.name);
      if (data.slug === undefined) {
        updates.push(`slug = $${i++}`);
        values.push(slugify(data.name, { lower: true }));
      }
    }
    if (data.description !== undefined) {
      updates.push(`description = $${i++}`);
      values.push(data.description);
    }
    if (data.image_url !== undefined) {
      updates.push(`image_url = $${i++}`);
      values.push(data.image_url);
    }
    if (data.slug !== undefined) {
      updates.push(`slug = $${i++}`);
      values.push(data.slug);
    }

    if (updates.length === 0) throw new Error('No fields to update');

    values.push(id);
    const result = await pool.query(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!result.rows.length) throw new Error('Category not found');
    return result.rows[0];
  }
}

module.exports = new CategoryService();
