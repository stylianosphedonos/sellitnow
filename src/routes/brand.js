const express = require('express');
const config = require('../config');
const { pool } = require('../database/db');

const router = express.Router();

const DEFAULTS = {
  primary: '#ee4d2d',
  primaryDark: '#d4380d',
  secondary: '#ff6633',
  accent: '#ff9000',
  banner: '',
  logo: '',
  currency: 'usd',
  heroTitle: 'Up to 90% Off',
  heroSubtitle: 'Discover amazing deals on electronics, fashion & more',
};

function rowToObj(rows) {
  const obj = {};
  for (const r of rows || []) {
    obj[r.key] = r.value;
  }
  return obj;
}

function normalizeCurrency(val) {
  if (val == null || val === '') return null;
  const c = String(val).trim().toLowerCase();
  return /^[a-z]{3}$/.test(c) ? c : null;
}

function taxPercentFromStored(stored) {
  if (stored.taxRatePercent == null || String(stored.taxRatePercent).trim() === '') return undefined;
  const n = parseFloat(stored.taxRatePercent);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, n));
}

function defaultTaxPercentFromConfig() {
  const v = config.app.vatRate;
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10000) / 100;
}

async function getBrandSettings() {
  const result = await pool.query('SELECT key, value FROM brand_settings');
  const stored = rowToObj(result.rows);
  const taxOverride = taxPercentFromStored(stored);
  const taxRatePercent = taxOverride !== undefined ? taxOverride : defaultTaxPercentFromConfig();
  const currency = normalizeCurrency(stored.currency) || DEFAULTS.currency;

  const heroTitle =
    stored.heroTitle !== undefined && stored.heroTitle !== null
      ? String(stored.heroTitle)
      : DEFAULTS.heroTitle;
  const heroSubtitle =
    stored.heroSubtitle !== undefined && stored.heroSubtitle !== null
      ? String(stored.heroSubtitle)
      : DEFAULTS.heroSubtitle;

  return {
    primary: stored.primary || DEFAULTS.primary,
    primaryDark: stored.primaryDark || DEFAULTS.primaryDark,
    secondary: stored.secondary || DEFAULTS.secondary,
    accent: stored.accent || DEFAULTS.accent,
    banner: stored.banner || DEFAULTS.banner,
    logo: stored.logo || DEFAULTS.logo,
    currency,
    taxRatePercent,
    heroTitle,
    heroSubtitle,
  };
}

// Public: GET brand settings (for storefront)
router.get('/', async (req, res) => {
  try {
    const settings = await getBrandSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.getBrandSettings = getBrandSettings;
module.exports.DEFAULTS = DEFAULTS;
module.exports.normalizeCurrency = normalizeCurrency;
