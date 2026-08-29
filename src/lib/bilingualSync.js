const { containsGreek, isBlank } = require('./localizedText');
const { translateText } = require('./translateText');
const { STOREFRONT_HERO } = require('../database/storefrontDefaults');

function trim(value) {
  if (value == null) return '';
  return String(value).trim();
}

function looksGreek(value) {
  return containsGreek(value);
}

/**
 * Fill missing side of a bilingual pair. May also move Greek out of an English column.
 * @returns {Promise<{ en: string, el: string, changed: boolean }>}
 */
async function syncBilingualPair(enValue, elValue) {
  let en = trim(enValue);
  let el = trim(elValue);
  let changed = false;

  if (en && !el) {
    if (looksGreek(en)) {
      el = en;
      en = await translateText(en, 'el', 'en');
    } else {
      el = await translateText(en, 'en', 'el');
    }
    changed = true;
  } else if (el && !en) {
    if (looksGreek(el)) {
      en = await translateText(el, 'el', 'en');
    } else {
      en = el;
      el = await translateText(en, 'en', 'el');
    }
    changed = true;
  } else if (en && el) {
    return { en, el, changed: false };
  }

  return { en, el, changed };
}

async function syncProducts(pool) {
  const result = await pool.query(
    'SELECT id, title, title_el, description, description_el FROM products ORDER BY id'
  );
  let updated = 0;
  for (const row of result.rows || []) {
    const title = await syncBilingualPair(row.title, row.title_el);
    const description = await syncBilingualPair(row.description, row.description_el);
    if (!title.changed && !description.changed) continue;

    await pool.query(
      `UPDATE products
       SET title = $1, title_el = $2, description = $3, description_el = $4
       WHERE id = $5`,
      [
        title.en || null,
        title.el || null,
        description.en || null,
        description.el || null,
        row.id,
      ]
    );
    updated += 1;
  }
  return updated;
}

async function syncCategories(pool) {
  const result = await pool.query(
    `SELECT id, name, name_el, description, description_el, request_prompt, request_prompt_el
     FROM categories ORDER BY id`
  );
  let updated = 0;
  for (const row of result.rows || []) {
    const name = await syncBilingualPair(row.name, row.name_el);
    const description = await syncBilingualPair(row.description, row.description_el);
    const requestPrompt = await syncBilingualPair(row.request_prompt, row.request_prompt_el);
    if (!name.changed && !description.changed && !requestPrompt.changed) continue;

    await pool.query(
      `UPDATE categories
       SET name = $1, name_el = $2, description = $3, description_el = $4,
           request_prompt = $5, request_prompt_el = $6
       WHERE id = $7`,
      [
        name.en || null,
        name.el || null,
        description.en || null,
        description.el || null,
        requestPrompt.en || null,
        requestPrompt.el || null,
        row.id,
      ]
    );
    updated += 1;
  }
  return updated;
}

async function readBrandValue(pool, key) {
  const r = await pool.query('SELECT value FROM brand_settings WHERE key = $1', [key]);
  return r.rows?.[0]?.value ?? null;
}

async function writeBrandValue(pool, key, value) {
  const v = value == null ? '' : String(value);
  await pool.query(
    `INSERT INTO brand_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, v]
  );
}

async function syncBrandHero(pool) {
  let heroTitle = trim(await readBrandValue(pool, 'heroTitle'));
  let heroSubtitle = trim(await readBrandValue(pool, 'heroSubtitle'));
  let heroTitleEl = trim(await readBrandValue(pool, 'heroTitleEl'));
  let heroSubtitleEl = trim(await readBrandValue(pool, 'heroSubtitleEl'));

  if (!heroTitle && !heroTitleEl) heroTitle = STOREFRONT_HERO.heroTitle;
  if (!heroSubtitle && !heroSubtitleEl) heroSubtitle = STOREFRONT_HERO.heroSubtitle;
  if (!heroTitleEl && STOREFRONT_HERO.heroTitleEl) heroTitleEl = STOREFRONT_HERO.heroTitleEl;
  if (!heroSubtitleEl && STOREFRONT_HERO.heroSubtitleEl) heroSubtitleEl = STOREFRONT_HERO.heroSubtitleEl;

  const title = await syncBilingualPair(heroTitle, heroTitleEl);
  const subtitle = await syncBilingualPair(heroSubtitle, heroSubtitleEl);

  if (title.changed || subtitle.changed || !heroTitle || !heroSubtitle || !heroTitleEl || !heroSubtitleEl) {
    await writeBrandValue(pool, 'heroTitle', title.en);
    await writeBrandValue(pool, 'heroTitleEl', title.el);
    await writeBrandValue(pool, 'heroSubtitle', subtitle.en);
    await writeBrandValue(pool, 'heroSubtitleEl', subtitle.el);
    return 1;
  }
  return 0;
}

async function syncAllBilingualContent(pool) {
  const products = await syncProducts(pool);
  const categories = await syncCategories(pool);
  const hero = await syncBrandHero(pool);
  return { products, categories, hero };
}

module.exports = {
  syncBilingualPair,
  syncProducts,
  syncCategories,
  syncBrandHero,
  syncAllBilingualContent,
};
