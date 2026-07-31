const slugify = require('slugify');
const config = require('../config');
const { pool } = require('../database/db');
const { parseOptionsJson, stringifyOptionsJson } = require('../lib/productOptions');
const { publicUrlForUploadedFile } = require('../lib/mediaPublicUrl');
const {
  normalizeBundleItemsInput,
  computeStockFromBundleRows,
  sumComponentPrices,
} = require('../lib/bundleItems');

class ProductService {
  isBundle(product) {
    return product && product.product_type === 'bundle';
  }

  normalizeProductType(value) {
    const type = value == null ? 'simple' : String(value).trim().toLowerCase();
    if (type === 'bundle' || type === 'offer') return 'bundle';
    return 'simple';
  }

  async getBundleItems(bundleProductId) {
    const result = await pool.query(
      `SELECT bi.id, bi.bundle_product_id, bi.component_product_id, bi.quantity, bi.display_order,
              p.title AS component_title, p.slug AS component_slug, p.price AS component_price,
              p.stock_quantity AS component_stock_quantity, p.status AS component_status, p.product_type AS component_product_type,
              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) AS component_image_url
       FROM bundle_items bi
       JOIN products p ON p.id = bi.component_product_id
       WHERE bi.bundle_product_id = $1
       ORDER BY bi.display_order ASC, bi.id ASC`,
      [bundleProductId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      component_product_id: row.component_product_id,
      quantity: row.quantity,
      display_order: row.display_order,
      title: row.component_title,
      slug: row.component_slug,
      price: Number(row.component_price),
      stock_quantity: row.component_stock_quantity,
      status: row.component_status,
      product_type: row.component_product_type,
      image_url: row.component_image_url,
    }));
  }

  async getBundleItemsByBundleIds(bundleIds) {
    if (!Array.isArray(bundleIds) || bundleIds.length === 0) return new Map();
    const placeholders = bundleIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `SELECT bi.bundle_product_id, bi.component_product_id, bi.quantity, bi.display_order,
              p.title AS component_title, p.price AS component_price,
              p.stock_quantity AS component_stock_quantity, p.status AS component_status,
              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) AS component_image_url
       FROM bundle_items bi
       JOIN products p ON p.id = bi.component_product_id
       WHERE bi.bundle_product_id IN (${placeholders})
       ORDER BY bi.bundle_product_id, bi.display_order ASC, bi.id ASC`,
      bundleIds
    );
    const map = new Map();
    for (const row of result.rows) {
      if (!map.has(row.bundle_product_id)) map.set(row.bundle_product_id, []);
      map.get(row.bundle_product_id).push({
        component_product_id: row.component_product_id,
        quantity: row.quantity,
        display_order: row.display_order,
        title: row.component_title,
        price: Number(row.component_price),
        stock_quantity: row.component_stock_quantity,
        status: row.component_status,
        image_url: row.component_image_url,
      });
    }
    return map;
  }

  computeBundleStockFromItems(items) {
    return computeStockFromBundleRows(items);
  }

  async validateBundleItems(bundleProductId, itemsInput) {
    const items = normalizeBundleItemsInput(itemsInput);
    if (!items.length) {
      throw new Error('An offer must include at least one product.');
    }
    for (const item of items) {
      if (bundleProductId && item.component_product_id === Number(bundleProductId)) {
        throw new Error('An offer cannot include itself.');
      }
      const component = await this.getById(item.component_product_id);
      if (this.isBundle(component)) {
        throw new Error(`"${component.title}" is already an offer and cannot be included in another offer.`);
      }
    }
    return items;
  }

  async setBundleItems(bundleProductId, itemsInput) {
    const items = await this.validateBundleItems(bundleProductId, itemsInput);
    await pool.query('DELETE FROM bundle_items WHERE bundle_product_id = $1', [bundleProductId]);
    for (const item of items) {
      await pool.query(
        `INSERT INTO bundle_items (bundle_product_id, component_product_id, quantity, display_order)
         VALUES ($1, $2, $3, $4)`,
        [bundleProductId, item.component_product_id, item.quantity, item.display_order]
      );
    }
    return this.getBundleItems(bundleProductId);
  }

  async enrichProduct(product) {
    if (!product) return product;
    product.product_type = product.product_type || 'simple';
    if (!this.isBundle(product)) {
      product.bundle_items = [];
      product.compare_at_price = null;
      return product;
    }
    const bundleItems = await this.getBundleItems(product.id);
    product.bundle_items = bundleItems;
    product.compare_at_price = sumComponentPrices(bundleItems);
    product.stock_quantity = this.computeBundleStockFromItems(bundleItems);
    return product;
  }

  async enrichProductsList(items, options = {}) {
    const compact = Boolean(options.compact);
    if (!Array.isArray(items) || !items.length) return items;
    const bundleIds = items.filter((p) => p.product_type === 'bundle').map((p) => p.id);
    if (!bundleIds.length) {
      return items.map((p) => ({
        ...p,
        product_type: p.product_type || 'simple',
        ...(compact ? {} : { bundle_items: [] }),
        compare_at_price: null,
      }));
    }
    const bundleMap = await this.getBundleItemsByBundleIds(bundleIds);
    return items.map((p) => {
      const productType = p.product_type || 'simple';
      if (productType !== 'bundle') {
        return {
          ...p,
          product_type: productType,
          ...(compact ? {} : { bundle_items: [] }),
          compare_at_price: null,
        };
      }
      const bundleItems = bundleMap.get(p.id) || [];
      const base = {
        ...p,
        product_type: productType,
        compare_at_price: sumComponentPrices(bundleItems),
        stock_quantity: this.computeBundleStockFromItems(bundleItems),
      };
      if (!compact) base.bundle_items = bundleItems;
      return base;
    });
  }
  normalizeSku(value) {
    const sku = value == null ? '' : String(value).trim();
    return sku || null;
  }

  generateFallbackSku(title) {
    const base = slugify(String(title || 'product'), { lower: true, strict: true }) || 'product';
    return `AUTO-${base}-${Date.now()}`;
  }

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

  async adminList(page = 1, limit = 100, search = '') {
    const offset = (page - 1) * limit;
    const term = search != null ? String(search).trim() : '';
    const pattern = term ? `%${term}%` : null;

    const countResult = pattern
      ? await pool.query('SELECT COUNT(*)::int FROM products p WHERE p.title ILIKE $1', [pattern])
      : await pool.query('SELECT COUNT(*)::int FROM products');
    const total = countResult.rows[0].count;

    const result = pattern
      ? await pool.query(
          `SELECT p.id, p.sku, p.title, p.slug, p.price, p.stock_quantity, p.status, p.category_id, p.options_json, p.delivery_cost, p.display_order, p.product_type
           FROM products p
           WHERE p.title ILIKE $1
           ORDER BY
             CASE WHEN p.display_order IS NULL THEN 1 ELSE 0 END,
             p.display_order ASC,
             p.id ASC
           LIMIT $2 OFFSET $3`,
          [pattern, limit, offset]
        )
      : await pool.query(
          `SELECT p.id, p.sku, p.title, p.slug, p.price, p.stock_quantity, p.status, p.category_id, p.options_json, p.delivery_cost, p.display_order, p.product_type
           FROM products p
           ORDER BY
             CASE WHEN p.display_order IS NULL THEN 1 ELSE 0 END,
             p.display_order ASC,
             p.id ASC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
    const items = result.rows;
    const categoryMap = await this.getCategoryIdsByProductIds(items.map((x) => x.id));
    const mapped = items.map((row) => ({
      ...row,
      product_type: row.product_type || 'simple',
      category_ids: categoryMap.get(row.id) || (row.category_id ? [row.category_id] : []),
    }));
    const enriched = await this.enrichProductsList(mapped);
    return { items: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async list(page = 1, limit = 20, search = '', options = {}) {
    const offset = (page - 1) * limit;
    const term = search != null ? String(search).trim() : '';
    const pattern = term ? `%${term}%` : null;
    const productType =
      options.productType === 'bundle' || options.productType === 'simple'
        ? options.productType
        : null;

    const typeSql =
      productType === 'bundle'
        ? ` AND p.product_type = 'bundle'`
        : productType === 'simple'
          ? ` AND COALESCE(p.product_type, 'simple') = 'simple'`
          : '';

    const countResult = pattern
      ? await pool.query(
          `SELECT COUNT(*)::int FROM products p
           WHERE p.status = 'active'
             AND (p.title ILIKE $1 OR COALESCE(p.description, '') ILIKE $1 OR COALESCE(p.sku, '') ILIKE $1)${typeSql}`,
          [pattern]
        )
      : await pool.query(
          `SELECT COUNT(*)::int FROM products p WHERE p.status = 'active'${typeSql}`
        );

    const total = countResult.rows[0].count;

    // Card payload only — omit description and other unused fields for faster storefront loads
    const result = pattern
      ? await pool.query(
          `SELECT p.id, p.title, p.price, p.options_json, p.product_type,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.status = 'active'
             AND (p.title ILIKE $1 OR COALESCE(p.description, '') ILIKE $1 OR COALESCE(p.sku, '') ILIKE $1)${typeSql}
           ORDER BY
             CASE WHEN p.display_order IS NULL THEN 1 ELSE 0 END,
             p.display_order ASC,
             p.id ASC
           LIMIT $2 OFFSET $3`,
          [pattern, limit, offset]
        )
      : await pool.query(
          `SELECT p.id, p.title, p.price, p.options_json, p.product_type,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.status = 'active'${typeSql}
           ORDER BY
             CASE WHEN p.display_order IS NULL THEN 1 ELSE 0 END,
             p.display_order ASC,
             p.id ASC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );

    const items = result.rows.map((row) => {
      const opts = parseOptionsJson(row.options_json);
      const colors = opts.colors || [];
      const sizes = opts.sizes || [];
      return {
        id: row.id,
        title: row.title,
        price: row.price,
        image_url: row.image_url,
        product_type: row.product_type || 'simple',
        // Card only needs presence of options, not the full value lists
        options: {
          colors: colors.length ? [''] : [],
          sizes: sizes.length ? [''] : [],
        },
      };
    });
    const enriched = await this.enrichProductsList(items, { compact: true });

    return { items: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
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
    product.product_type = product.product_type || 'simple';
    delete product.options_json;
    return this.enrichProduct(product);
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
    product.product_type = product.product_type || 'simple';
    delete product.options_json;
    return this.enrichProduct(product);
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

    const normalizedSku = this.normalizeSku(data.sku) || this.generateFallbackSku(data.title);
    const displayOrder = data.display_order !== undefined ? data.display_order : null;
    const productType = this.normalizeProductType(data.product_type);
    const stockQuantity = productType === 'bundle' ? 0 : (data.stock_quantity ?? 0);

    const result = await pool.query(
      `INSERT INTO products (sku, title, slug, description, price, stock_quantity, category_id, status, product_type, options_json, delivery_cost, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        normalizedSku,
        data.title,
        slug,
        data.description || null,
        data.price,
        stockQuantity,
        primaryCategoryId,
        data.status || 'draft',
        productType,
        optionsJson,
        deliveryCost != null && Number.isFinite(deliveryCost) ? deliveryCost : null,
        displayOrder,
      ]
    );
    const product = result.rows[0];
    await this.assignProductCategories(product.id, categoryIds);

    if (productType === 'bundle' && data.bundle_items !== undefined) {
      await this.setBundleItems(product.id, data.bundle_items);
    } else if (productType === 'bundle') {
      throw new Error('An offer must include at least one product.');
    }

    if (imageFiles.length) {
      for (let i = 0; i < imageFiles.length; i++) {
        const imageUrl = await publicUrlForUploadedFile(imageFiles[i], { assetType: 'product' });
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

    const title = data.title !== undefined && data.title !== null ? data.title : product.title;
    const rawSku = data.sku !== undefined ? data.sku : product.sku;
    const sku = this.normalizeSku(rawSku) || this.generateFallbackSku(title);
    const description = data.description !== undefined ? data.description : product.description;
    const price = data.price !== undefined && data.price !== null ? data.price : product.price;
    const productType =
      data.product_type !== undefined && data.product_type !== null
        ? this.normalizeProductType(data.product_type)
        : (product.product_type || 'simple');
    let stock_quantity = data.stock_quantity !== undefined && data.stock_quantity !== null ? data.stock_quantity : product.stock_quantity;
    if (productType === 'bundle') {
      stock_quantity = 0;
    }
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

    let display_order = product.display_order ?? null;
    if (data.display_order !== undefined) {
      display_order = data.display_order === null || data.display_order === '' ? null : Number(data.display_order);
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
        product_type = $10,
        options_json = $11,
        delivery_cost = $12,
        display_order = $13,
        updated_at = NOW()
       WHERE id = $1`,
      [id, sku, title, slug, description, price, stock_quantity, category_id, status, productType, optionsJson, delivery_cost, display_order]
    );
    await this.assignProductCategories(id, normalizedCategoryIds);

    if (productType === 'bundle') {
      if (data.bundle_items !== undefined) {
        await this.setBundleItems(id, data.bundle_items);
      } else if (!this.isBundle(product)) {
        throw new Error('An offer must include at least one product.');
      }
    } else {
      await pool.query('DELETE FROM bundle_items WHERE bundle_product_id = $1', [id]);
    }

    if (imageFiles.length) {
      const existing = await pool.query('SELECT id FROM product_images WHERE product_id = $1', [id]);
      const currentCount = existing.rows.length;
      const maxTotal = config.app.maxImagesPerProduct;
      const toAdd = Math.min(imageFiles.length, maxTotal - currentCount);

      for (let i = 0; i < toAdd; i++) {
        const imageUrl = await publicUrlForUploadedFile(imageFiles[i], { assetType: 'product' });
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
    const product = await pool.query('SELECT id, product_type FROM products WHERE id = $1', [productId]);
    if (!product.rows.length) return false;
    if (product.rows[0].product_type === 'bundle') {
      const items = await this.getBundleItems(productId);
      for (const item of items) {
        await pool.query(
          'UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1',
          [item.component_product_id, item.quantity * quantity]
        );
      }
      return true;
    }
    const result = await pool.query(
      'UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1 RETURNING id',
      [productId, quantity]
    );
    return result.rows.length > 0;
  }

  async incrementStock(productId, quantity) {
    const product = await pool.query('SELECT id, product_type FROM products WHERE id = $1', [productId]);
    if (!product.rows.length) return;
    if (product.rows[0].product_type === 'bundle') {
      const items = await this.getBundleItems(productId);
      for (const item of items) {
        await pool.query(
          'UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1',
          [item.component_product_id, item.quantity * quantity]
        );
      }
      return;
    }
    await pool.query(
      'UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1',
      [productId, quantity]
    );
  }

  async getEffectiveStock(productOrId) {
    const product =
      typeof productOrId === 'object' && productOrId != null
        ? productOrId
        : await this.getById(productOrId);
    if (this.isBundle(product)) {
      const items = product.bundle_items || (await this.getBundleItems(product.id));
      return this.computeBundleStockFromItems(items);
    }
    return Number(product.stock_quantity) || 0;
  }
}

module.exports = new ProductService();
