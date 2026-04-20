const slugify = require('slugify');
const { pool } = require('../database/db');
const { parseOptionsJson } = require('../lib/productOptions');

function parseNullableInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be a whole number.`);
  }
  return parsed;
}

class CategoryService {
  async list() {
    const result = await pool.query(
      `SELECT id, name, slug, description, image_url, display_order
       FROM categories
       ORDER BY
         CASE WHEN display_order IS NULL THEN 1 ELSE 0 END,
         display_order ASC,
         id ASC`
    );
    return result.rows;
  }

  async getById(id) {
    const result = await pool.query(
      'SELECT id, name, slug, description, image_url, display_order FROM categories WHERE id = $1',
      [id]
    );
    if (!result.rows.length) throw new Error('Category not found');
    return result.rows[0];
  }

  async getBySlug(slug) {
    const result = await pool.query(
      'SELECT id, name, slug, description, image_url, display_order FROM categories WHERE slug = $1',
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
           WHERE p.status = $2
             AND (
               p.category_id = $1 OR EXISTS (
                 SELECT 1 FROM product_categories pc
                 WHERE pc.product_id = p.id AND pc.category_id = $1
               )
             )
             AND (p.title ILIKE $3 OR COALESCE(p.description, '') ILIKE $3 OR COALESCE(p.sku, '') ILIKE $3)`,
          [categoryId, 'active', pattern]
        )
      : await pool.query(
          `SELECT COUNT(*)::int FROM products p
           WHERE p.status = $2
             AND (
               p.category_id = $1 OR EXISTS (
                 SELECT 1 FROM product_categories pc
                 WHERE pc.product_id = p.id AND pc.category_id = $1
               )
             )`,
          [categoryId, 'active']
        );

    const total = countResult.rows[0].count;

    const result = pattern
      ? await pool.query(
          `SELECT p.id, p.sku, p.title, p.slug, p.description, p.price, p.stock_quantity, p.status, p.category_id, p.options_json, p.display_order,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.status = $2
             AND (
               p.category_id = $1 OR EXISTS (
                 SELECT 1 FROM product_categories pc
                 WHERE pc.product_id = p.id AND pc.category_id = $1
               )
             )
             AND (p.title ILIKE $3 OR COALESCE(p.description, '') ILIKE $3 OR COALESCE(p.sku, '') ILIKE $3)
           ORDER BY
             CASE WHEN p.display_order IS NULL THEN 1 ELSE 0 END,
             p.display_order ASC,
             p.id ASC
           LIMIT $4 OFFSET $5`,
          [categoryId, 'active', pattern, limit, offset]
        )
      : await pool.query(
          `SELECT p.id, p.sku, p.title, p.slug, p.description, p.price, p.stock_quantity, p.status, p.category_id, p.options_json, p.display_order,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.status = $2
             AND (
               p.category_id = $1 OR EXISTS (
                 SELECT 1 FROM product_categories pc
                 WHERE pc.product_id = p.id AND pc.category_id = $1
               )
             )
           ORDER BY
             CASE WHEN p.display_order IS NULL THEN 1 ELSE 0 END,
             p.display_order ASC,
             p.id ASC
           LIMIT $3 OFFSET $4`,
          [categoryId, 'active', limit, offset]
        );

    const productIds = result.rows.map((row) => row.id);
    const categoryMap = new Map();
    if (productIds.length) {
      const placeholders = productIds.map((_, i) => `$${i + 1}`).join(', ');
      const categoryRows = await pool.query(
        `SELECT product_id, category_id FROM product_categories
         WHERE product_id IN (${placeholders})
         ORDER BY product_id, category_id`,
        productIds
      );
      for (const row of categoryRows.rows) {
        if (!categoryMap.has(row.product_id)) categoryMap.set(row.product_id, []);
        categoryMap.get(row.product_id).push(row.category_id);
      }
    }

    const items = result.rows.map((row) => {
      const opts = parseOptionsJson(row.options_json);
      const { options_json: _o, ...rest } = row;
      return {
        ...rest,
        category_ids: categoryMap.get(row.id) || (row.category_id ? [row.category_id] : []),
        options: opts,
      };
    });

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data) {
    const name = data.name != null ? String(data.name).trim() : '';
    if (!name) throw new Error('Name is required');
    const slugRaw = data.slug != null ? String(data.slug).trim() : '';
    const slug = slugRaw ? slugRaw : slugify(name, { lower: true });
    const displayOrder = parseNullableInteger(data.display_order, 'Display order');
    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, image_url, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, slug, description, image_url, display_order`,
      [name, slug, data.description != null ? data.description : null, data.image_url || null, displayOrder]
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
    if (data.display_order !== undefined) {
      updates.push(`display_order = $${i++}`);
      values.push(parseNullableInteger(data.display_order, 'Display order'));
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
