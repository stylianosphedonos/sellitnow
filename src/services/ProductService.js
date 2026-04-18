const slugify = require('slugify');
const config = require('../config');
const { pool } = require('../database/db');
const { parseOptionsJson, stringifyOptionsJson } = require('../lib/productOptions');
const { publicUrlForUploadedFile } = require('../lib/mediaPublicUrl');

class ProductService {
  async getCategoryIdsByProductIds(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) return new Map();
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `SELECT product_id, category_id
       FROM product_categories
       WHERE product_id IN (${placeholders})
       ORDER BY product_id, category_id`,
      productIds
    );
    const map = new Map();
    for (const row of result.rows) {
      if (!map.has(row.product_id)) map.set(row.product_id, []);
      map.get(row.product_id).push(row.category_id);
    }
    return map;
  }

  async assignProductCategories(productId, categoryIdsInput = null) {
    let categoryIds = Array.isArray(categoryIdsInput) ? categoryIdsInput : [];
    categoryIds = [...new Set(
      categoryIds
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x))
    )];
    await pool.query('DELETE FROM product_categories WHERE product_id = $1', [productId]);
    for (const categoryId of categoryIds) {
      await pool.query(
        `INSERT INTO product_categories (product_id, category_id)
         VALUES ($1, $2)
         ON CONFLICT (product_id, category_id) DO NOTHING`,
        [productId, categoryId]
      );
    }
    return categoryIds;
  }

  async adminList(page = 1, limit = 100) {
    const offset = (page - 1) * limit;
    const countResult = await pool.query('SELECT COUNT(*)::int FROM products');
    const total = countResult.rows[0].count;
    const result = await pool.query(
      `SELECT p.id, p.sku, p.title, p.slug, p.price, p.stock_quantity, p.status, p.category_id, p.options_json, p.delivery_cost
       FROM products p ORDER BY p.id LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const items = result.rows;
    const categoryMap = await this.getCategoryIdsByProductIds(items.map((x) => x.id));
    const mapped = items.map((row) => ({
      ...row,
      category_ids: categoryMap.get(row.id) || (row.category_id ? [row.category_id] : []),
    }));
    return { items: mapped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async list(page = 1, limit = 20, search = '') {
    const offset = (page - 1) * limit;
    const term = search != null ? String(search).trim() : '';
    const pattern = term ? `%${term}%` : null;

    const countResult = pattern
      ? await pool.query(
          `SELECT COUNT(*)::int FROM products p
           WHERE p.status = 'active'
             AND (p.title ILIKE $1 OR COALESCE(p.description, '') ILIKE $1 OR COALESCE(p.sku, '') ILIKE $1)`,
          [pattern]
        )
      : await pool.query("SELECT COUNT(*)::int FROM products WHERE status = 'active'");

    const total = countResult.rows[0].count;

    const result = pattern
      ? await pool.query(
          `SELECT p.id, p.sku, p.title, p.slug, p.description, p.price, p.stock_quantity, p.status, p.category_id, p.options_json,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.status = 'active'
             AND (p.title ILIKE $1 OR COALESCE(p.description, '') ILIKE $1 OR COALESCE(p.sku, '') ILIKE $1)
           ORDER BY p.id
           LIMIT $2 OFFSET $3`,
          [pattern, limit, offset]
        )
      : await pool.query(
          `SELECT p.id, p.sku, p.title, p.slug, p.description, p.price, p.stock_quantity, p.status, p.category_id, p.options_json,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.status = 'active'
           ORDER BY p.id
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );

    const categoryMap = await this.getCategoryIdsByProductIds(result.rows.map((x) => x.id));
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

  async getById(id) {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    );
    if (!result.rows.length) throw new Error('Product not found');
    const product = result.rows[0];

    const imagesResult = await pool.query(
      'SELECT id, image_url, display_order FROM product_images WHERE product_id = $1 ORDER BY display_order',
      [id]
    );
    product.images = imagesResult.rows;
    product.image_url = product.images[0]?.image_url || null;
    const catRows = await pool.query(
      `SELECT pc.category_id, c.name
       FROM product_categories pc
       LEFT JOIN categories c ON c.id = pc.category_id
       WHERE pc.product_id = $1
       ORDER BY pc.category_id`,
      [id]
    );
    product.category_ids = catRows.rows.map((r) => r.category_id);
    product.category_names = catRows.rows.map((r) => r.name).filter(Boolean);
    product.options = parseOptionsJson(product.options_json);
    delete product.options_json;
    return product;
  }

  async getBySlug(slug) {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.slug = $1 AND p.status = 'active'`,
      [slug]
    );
    if (!result.rows.length) throw new Error('Product not found');
    const product = result.rows[0];

    const imagesResult = await pool.query(
      'SELECT id, image_url, display_order FROM product_images WHERE product_id = $1 ORDER BY display_order',
      [product.id]
    );
    product.images = imagesResult.rows;
    product.image_url = product.images[0]?.image_url || null;
    const catRows = await pool.query(
      `SELECT pc.category_id, c.name
       FROM product_categories pc
       LEFT JOIN categories c ON c.id = pc.category_id
       WHERE pc.product_id = $1
       ORDER BY pc.category_id`,
      [product.id]
    );
    product.category_ids = catRows.rows.map((r) => r.category_id);
    product.category_names = catRows.rows.map((r) => r.name).filter(Boolean);
    product.options = parseOptionsJson(product.options_json);
    delete product.options_json;
    return product;
  }

  async create(data, imageFiles = []) {
    const slug = slugify(data.title, { lower: true });
    let optionsJson = null;
    if (data.options !== undefined) {
      optionsJson = stringifyOptionsJson(data.options);
    } else if (data.options_json !== undefined) {
      optionsJson = data.options_json;
    }

    const categoryIds = Array.isArray(data.category_ids)
      ? data.category_ids
      : (data.category_id ? [data.category_id] : []);
    const primaryCategoryId = categoryIds.length ? categoryIds[0] : null;

    const deliveryCost =
      data.delivery_cost !== undefined && data.delivery_cost !== null ? Number(data.delivery_cost) : null;

    const result = await pool.query(
      `INSERT INTO products (sku, title, slug, description, price, stock_quantity, category_id, status, options_json, delivery_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.sku,
        data.title,
        slug,
        data.description || null,
        data.price,
        data.stock_quantity ?? 0,
        primaryCategoryId,
        data.status || 'draft',
        optionsJson,
        deliveryCost != null && Number.isFinite(deliveryCost) ? deliveryCost : null,
      ]
    );
    const product = result.rows[0];
    await this.assignProductCategories(product.id, categoryIds);

    if (imageFiles.length) {
      for (let i = 0; i < imageFiles.length; i++) {
        const imageUrl = await publicUrlForUploadedFile(imageFiles[i]);
        await pool.query(
          'INSERT INTO product_images (product_id, image_url, display_order) VALUES ($1, $2, $3)',
          [product.id, imageUrl, i]
        );
      }
    }

    return this.getById(product.id);
  }

  async update(id, data, imageFiles = []) {
    const product = await this.getById(id);
    const slug = data.title ? slugify(data.title, { lower: true }) : product.slug;

    const sku = data.sku !== undefined && data.sku !== null ? data.sku : product.sku;
    const title = data.title !== undefined && data.title !== null ? data.title : product.title;
    const description = data.description !== undefined ? data.description : product.description;
    const price = data.price !== undefined && data.price !== null ? data.price : product.price;
    const stock_quantity = data.stock_quantity !== undefined && data.stock_quantity !== null ? data.stock_quantity : product.stock_quantity;
    const category_ids =
      data.category_ids !== undefined
        ? data.category_ids
        : (data.category_id !== undefined
          ? (data.category_id ? [data.category_id] : [])
          : (Array.isArray(product.category_ids) ? product.category_ids : []));
    const normalizedCategoryIds = [...new Set(
      (Array.isArray(category_ids) ? category_ids : [])
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x))
    )];
    const category_id = normalizedCategoryIds.length ? normalizedCategoryIds[0] : null;
    const status = data.status !== undefined && data.status !== null ? data.status : product.status;

    let delivery_cost = product.delivery_cost;
    if (data.delivery_cost !== undefined) {
      delivery_cost =
        data.delivery_cost === null || data.delivery_cost === ''
          ? null
          : Number(data.delivery_cost);
    }

    const optRow = await pool.query('SELECT options_json FROM products WHERE id = $1', [id]);
    let optionsJson = optRow.rows[0]?.options_json ?? null;
    if (data.options !== undefined) {
      optionsJson = stringifyOptionsJson(data.options);
    } else if (data.options_json !== undefined) {
      optionsJson = data.options_json;
    }

    await pool.query(
      `UPDATE products SET
        sku = $2,
        title = $3,
        slug = $4,
        description = $5,
        price = $6,
        stock_quantity = $7,
        category_id = $8,
        status = $9,
        options_json = $10,
        delivery_cost = $11,
        updated_at = NOW()
       WHERE id = $1`,
      [id, sku, title, slug, description, price, stock_quantity, category_id, status, optionsJson, delivery_cost]
    );
    await this.assignProductCategories(id, normalizedCategoryIds);

    if (imageFiles.length) {
      const existing = await pool.query('SELECT id FROM product_images WHERE product_id = $1', [id]);
      const currentCount = existing.rows.length;
      const maxTotal = config.app.maxImagesPerProduct;
      const toAdd = Math.min(imageFiles.length, maxTotal - currentCount);

      for (let i = 0; i < toAdd; i++) {
        const imageUrl = await publicUrlForUploadedFile(imageFiles[i]);
        await pool.query(
          'INSERT INTO product_images (product_id, image_url, display_order) VALUES ($1, $2, $3)',
          [id, imageUrl, currentCount + i]
        );
      }
    }

    return this.getById(id);
  }

  async removeImage(productId, imageId) {
    await this.getById(productId);

    const parsedImageId = Number(imageId);
    if (!Number.isInteger(parsedImageId)) {
      throw new Error('Invalid image id');
    }

    const deleted = await pool.query(
      'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING id',
      [parsedImageId, productId]
    );
    if (!deleted.rows.length) {
      throw new Error('Image not found');
    }

    const remaining = await pool.query(
      'SELECT id FROM product_images WHERE product_id = $1 ORDER BY display_order, id',
      [productId]
    );
    for (let i = 0; i < remaining.rows.length; i++) {
      await pool.query('UPDATE product_images SET display_order = $1 WHERE id = $2', [i, remaining.rows[i].id]);
    }

    return this.getById(productId);
  }

  async delete(id) {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) throw new Error('Product not found');
    return { success: true };
  }

  async decrementStock(productId, quantity) {
    const result = await pool.query(
      'UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1 RETURNING id',
      [productId, quantity]
    );
    return result.rows.length > 0;
  }

  async incrementStock(productId, quantity) {
    await pool.query(
      'UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1',
      [productId, quantity]
    );
  }
}

module.exports = new ProductService();
