const slugify = require('slugify');
const { pool } = require('../database/db');
const { parseOptionsJson } = require('../lib/productOptions');
const { trimToNull } = require('../lib/localizedText');

const DEFAULT_ICON_HEIGHT_PX = 140;
const MIN_ICON_DIMENSION_PX = 48;
const MAX_ICON_WIDTH_PX = 1200;
const MAX_ICON_HEIGHT_PX = 600;
const WEBSITE_LAYOUTS = ['tile', 'banner-left', 'banner-right'];
const CATEGORY_TYPES = ['browse', 'icon'];
const WEBSITE_ZONES = [
  'home-main',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'left',
  'right',
];
const CATEGORY_FIELDS =
  'id, name, name_el, slug, description, description_el, image_url, display_order, icon_size_px, icon_width_px, icon_height_px, website_layout, category_type, website_zone, request_prompt, request_prompt_el, show_on_website';

function parseNullableInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be a whole number.`);
  }
  return parsed;
}

function parseIconDimension(value, fieldName, maxPx) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseNullableInteger(value, fieldName);
  if (parsed < MIN_ICON_DIMENSION_PX || parsed > maxPx) {
    throw new Error(`${fieldName} must be between ${MIN_ICON_DIMENSION_PX} and ${maxPx} pixels.`);
  }
  return parsed;
}

function parseIconWidthPx(value) {
  return parseIconDimension(value, 'Icon width', MAX_ICON_WIDTH_PX);
}

function parseIconHeightPx(value) {
  return parseIconDimension(value, 'Icon height', MAX_ICON_HEIGHT_PX);
}

/** @deprecated Legacy single-size field; maps to height when saving. */
function parseIconSizePx(value) {
  return parseIconHeightPx(value);
}

function parseShowOnWebsite(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === 1 || value === '1' || value === 'true') return 1;
  return 0;
}

function parseWebsiteLayout(value) {
  if (value === undefined || value === null || value === '') return 'tile';
  const normalized = String(value).trim().toLowerCase();
  if (!WEBSITE_LAYOUTS.includes(normalized)) {
    throw new Error('Layout must be grid tile, banner left, or banner right.');
  }
  return normalized;
}

function parseCategoryType(value) {
  if (value === undefined || value === null || value === '') return 'browse';
  const normalized = String(value).trim().toLowerCase();
  if (!CATEGORY_TYPES.includes(normalized)) {
    throw new Error('Category type must be browse or icon.');
  }
  return normalized;
}

function parseWebsiteZone(value) {
  if (value === undefined || value === null || value === '') return 'home-main';
  const normalized = String(value).trim().toLowerCase();
  if (!WEBSITE_ZONES.includes(normalized)) {
    throw new Error('Website zone is invalid.');
  }
  return normalized;
}

function parseRequestPrompt(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeCategoryRow(row) {
  if (!row) return row;
  return {
    ...row,
    show_on_website: row.show_on_website === 1 || row.show_on_website === true,
    icon_size_px: row.icon_size_px != null ? row.icon_size_px : null,
    icon_width_px: row.icon_width_px != null ? row.icon_width_px : null,
    icon_height_px: row.icon_height_px != null ? row.icon_height_px : null,
    website_layout: parseWebsiteLayout(row.website_layout),
    category_type: parseCategoryType(row.category_type),
    website_zone: parseWebsiteZone(row.website_zone),
    request_prompt: row.request_prompt != null ? row.request_prompt : null,
  };
}

class CategoryService {
  async list(options = {}) {
    const { websiteOnly = false } = options;
    const where = websiteOnly ? 'WHERE show_on_website = 1' : '';
    const result = await pool.query(
      `SELECT ${CATEGORY_FIELDS}
       FROM categories
       ${where}
       ORDER BY
         CASE WHEN display_order IS NULL THEN 1 ELSE 0 END,
         display_order ASC,
         id ASC`
    );
    return result.rows.map(normalizeCategoryRow);
  }

  async getById(id) {
    const result = await pool.query(
      `SELECT ${CATEGORY_FIELDS} FROM categories WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) throw new Error('Category not found');
    return normalizeCategoryRow(result.rows[0]);
  }

  async getBySlug(slug) {
    const result = await pool.query(
      `SELECT ${CATEGORY_FIELDS} FROM categories WHERE slug = $1`,
      [slug]
    );
    if (!result.rows.length) throw new Error('Category not found');
    return normalizeCategoryRow(result.rows[0]);
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
             AND (p.title ILIKE $3 OR COALESCE(p.title_el, '') ILIKE $3 OR COALESCE(p.description, '') ILIKE $3 OR COALESCE(p.description_el, '') ILIKE $3 OR COALESCE(p.sku, '') ILIKE $3)`,
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
          `SELECT p.id, p.title, p.title_el, p.price, p.options_json, p.product_type,
                  (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
           FROM products p
           WHERE p.status = $2
             AND (
               p.category_id = $1 OR EXISTS (
                 SELECT 1 FROM product_categories pc
                 WHERE pc.product_id = p.id AND pc.category_id = $1
               )
             )
             AND (p.title ILIKE $3 OR COALESCE(p.title_el, '') ILIKE $3 OR COALESCE(p.description, '') ILIKE $3 OR COALESCE(p.description_el, '') ILIKE $3 OR COALESCE(p.sku, '') ILIKE $3)
           ORDER BY
             CASE WHEN p.display_order IS NULL THEN 1 ELSE 0 END,
             p.display_order ASC,
             p.id ASC
           LIMIT $4 OFFSET $5`,
          [categoryId, 'active', pattern, limit, offset]
        )
      : await pool.query(
          `SELECT p.id, p.title, p.title_el, p.price, p.options_json, p.product_type,
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

    const items = result.rows.map((row) => {
      const opts = parseOptionsJson(row.options_json);
      const colors = opts.colors || [];
      const sizes = opts.sizes || [];
      return {
        id: row.id,
        title: row.title,
        title_el: row.title_el || null,
        price: row.price,
        image_url: row.image_url,
        product_type: row.product_type || 'simple',
        options: {
          colors: colors.length ? [''] : [],
          sizes: sizes.length ? [''] : [],
        },
      };
    });
    const ProductService = require('./ProductService');
    const enriched = await ProductService.enrichProductsList(items, { compact: true });

    return { items: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data) {
    const name = data.name != null ? String(data.name).trim() : '';
    if (!name) throw new Error('Name is required');
    const slugRaw = data.slug != null ? String(data.slug).trim() : '';
    const slug = slugRaw ? slugRaw : slugify(name, { lower: true });
    const displayOrder = parseNullableInteger(data.display_order, 'Display order');
    const iconWidthPx = parseIconWidthPx(data.icon_width_px);
    const iconHeightPx =
      data.icon_height_px !== undefined
        ? parseIconHeightPx(data.icon_height_px)
        : parseIconHeightPx(data.icon_size_px);
    const showOnWebsite = parseShowOnWebsite(data.show_on_website);
    const websiteLayout = parseWebsiteLayout(data.website_layout);
    const categoryType = parseCategoryType(data.category_type);
    const websiteZone = parseWebsiteZone(data.website_zone);
    const requestPrompt = parseRequestPrompt(data.request_prompt);
    const requestPromptEl = parseRequestPrompt(data.request_prompt_el);
    const result = await pool.query(
      `INSERT INTO categories (name, name_el, slug, description, description_el, image_url, display_order, icon_size_px, icon_width_px, icon_height_px, website_layout, category_type, website_zone, request_prompt, request_prompt_el, show_on_website)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${CATEGORY_FIELDS}`,
      [
        name,
        trimToNull(data.name_el) || null,
        slug,
        data.description != null ? data.description : null,
        trimToNull(data.description_el) ?? null,
        data.image_url || null,
        displayOrder,
        iconHeightPx,
        iconWidthPx,
        iconHeightPx,
        websiteLayout,
        categoryType,
        websiteZone,
        requestPrompt,
        requestPromptEl,
        showOnWebsite,
      ]
    );
    return normalizeCategoryRow(result.rows[0]);
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
    if (data.name_el !== undefined) {
      updates.push(`name_el = $${i++}`);
      values.push(trimToNull(data.name_el));
    }
    if (data.description !== undefined) {
      updates.push(`description = $${i++}`);
      values.push(data.description);
    }
    if (data.description_el !== undefined) {
      updates.push(`description_el = $${i++}`);
      values.push(trimToNull(data.description_el));
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
    if (data.icon_width_px !== undefined) {
      updates.push(`icon_width_px = $${i++}`);
      values.push(parseIconWidthPx(data.icon_width_px));
    }
    if (data.icon_height_px !== undefined) {
      const height = parseIconHeightPx(data.icon_height_px);
      updates.push(`icon_height_px = $${i++}`);
      values.push(height);
      updates.push(`icon_size_px = $${i++}`);
      values.push(height);
    } else if (data.icon_size_px !== undefined) {
      const height = parseIconSizePx(data.icon_size_px);
      updates.push(`icon_size_px = $${i++}`);
      values.push(height);
      updates.push(`icon_height_px = $${i++}`);
      values.push(height);
    }
    if (data.show_on_website !== undefined) {
      updates.push(`show_on_website = $${i++}`);
      values.push(parseShowOnWebsite(data.show_on_website));
    }
    if (data.website_layout !== undefined) {
      updates.push(`website_layout = $${i++}`);
      values.push(parseWebsiteLayout(data.website_layout));
    }
    if (data.category_type !== undefined) {
      updates.push(`category_type = $${i++}`);
      values.push(parseCategoryType(data.category_type));
    }
    if (data.website_zone !== undefined) {
      updates.push(`website_zone = $${i++}`);
      values.push(parseWebsiteZone(data.website_zone));
    }
    if (data.request_prompt !== undefined) {
      updates.push(`request_prompt = $${i++}`);
      values.push(parseRequestPrompt(data.request_prompt));
    }
    if (data.request_prompt_el !== undefined) {
      updates.push(`request_prompt_el = $${i++}`);
      values.push(parseRequestPrompt(data.request_prompt_el));
    }

    if (updates.length === 0) throw new Error('No fields to update');

    values.push(id);
    const result = await pool.query(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!result.rows.length) throw new Error('Category not found');
    return normalizeCategoryRow(result.rows[0]);
  }
}

CategoryService.DEFAULT_ICON_HEIGHT_PX = DEFAULT_ICON_HEIGHT_PX;
CategoryService.MIN_ICON_DIMENSION_PX = MIN_ICON_DIMENSION_PX;
CategoryService.MAX_ICON_WIDTH_PX = MAX_ICON_WIDTH_PX;
CategoryService.MAX_ICON_HEIGHT_PX = MAX_ICON_HEIGHT_PX;
CategoryService.DEFAULT_ICON_SIZE_PX = DEFAULT_ICON_HEIGHT_PX;
CategoryService.MIN_ICON_SIZE_PX = MIN_ICON_DIMENSION_PX;
CategoryService.MAX_ICON_SIZE_PX = MAX_ICON_HEIGHT_PX;
CategoryService.WEBSITE_LAYOUTS = WEBSITE_LAYOUTS;
CategoryService.CATEGORY_TYPES = CATEGORY_TYPES;
CategoryService.WEBSITE_ZONES = WEBSITE_ZONES;

module.exports = new CategoryService();
