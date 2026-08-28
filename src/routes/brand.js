const express = require('express');
const config = require('../config');
const { pool } = require('../database/db');
const { STOREFRONT_HERO } = require('../database/storefrontDefaults');

const router = express.Router();

const DEFAULTS = {
  primary: '#ee4d2d',
  primaryDark: '#d4380d',
  secondary: '#ff6633',
  accent: '#ff9000',
  headerShadow: '#ee4d2d',
  banner: '',
  logo: '',
  allProductsImage: '',
  allProductsShowOnWebsite: true,
  requestIconImage: '',
  currency: 'usd',
  heroTitle: STOREFRONT_HERO.heroTitle,
  heroSubtitle: STOREFRONT_HERO.heroSubtitle,
  /** Black overlay on hero photo (0 = brightest, ~0.35 = previous default) */
  heroBannerOverlay: 0.35,
};

function rowToObj(rows) {
  const obj = {};
  for (const r of rows || []) {
    obj[r.key] = r.value;
  }
  return obj;
}

function parseBoolSetting(val, defaultVal = true) {
  if (val == null || String(val).trim() === '') return defaultVal;
  const s = String(val).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return defaultVal;
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

/** Extract bare email from "Name <email>" or plain address. */
function parseEmailAddress(from) {
  const s = String(from || '').trim();
  if (!s) return null;
  const angle = s.match(/^(.+)<([^>]+)>$/);
  const addr = angle ? angle[2].trim() : s;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? addr : null;
}

/** Nodemailer From with display name (e.g. 3nityLab <support@3nitylab.com>). */
function formatOutboundFrom(raw) {
  const displayName = String(config.email.businessName || '3nityLab').trim() || '3nityLab';
  const addr =
    parseEmailAddress(raw) ||
    parseEmailAddress(config.email.from) ||
    parseEmailAddress(config.email.supportEmail);
  if (!addr) return config.email.from;
  const safeName =
    displayName.includes('"') || displayName.includes(',')
      ? `"${displayName.replace(/"/g, '\\"')}"`
      : displayName;
  return `${safeName} <${addr}>`;
}

/** Validate address; stored/sent as "3nityLab <email>". */
function normalizeEmailFromInput(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const addrPart = parseEmailAddress(s);
  if (!addrPart) {
    throw new Error('Enter a valid email address (e.g. support@3nitylab.com)');
  }
  return formatOutboundFrom(addrPart);
}

/** Resolved From: admin-configured sender, else EMAIL_FROM env. */
async function getOutboundEmailFrom() {
  const s = await getBrandSettings();
  const raw =
    s.emailFrom && String(s.emailFrom).trim() ? String(s.emailFrom).trim() : config.email.from;
  return formatOutboundFrom(raw);
}

function smtpEnvHostSet() {
  return Boolean(config.email.host && String(config.email.host).trim());
}

/**
 * Effective SMTP for Nodemailer: environment wins when SMTP_HOST is set; otherwise brand_settings.
 * @returns {{ source: 'env'|'brand'|null, host: string, port: number, secure: boolean, user: string, pass: string }}
 */
async function getEffectiveSmtpConfig() {
  if (smtpEnvHostSet()) {
    return {
      source: 'env',
      host: String(config.email.host).trim(),
      port: Number(config.email.port) || 587,
      secure: config.email.secure === true,
      user: config.email.user != null ? String(config.email.user).trim() : '',
      pass: config.email.pass != null ? String(config.email.pass) : '',
    };
  }
  const smtpKeys = ['smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass'];
  const ph = smtpKeys.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `SELECT key, value FROM brand_settings WHERE key IN (${ph})`,
    smtpKeys
  );
  const row = rowToObj(result.rows);
  const host = row.smtpHost != null ? String(row.smtpHost).trim() : '';
  if (!host) {
    return { source: null, host: '', port: 587, secure: false, user: '', pass: '' };
  }
  const port = parseInt(row.smtpPort, 10);
  const secure = String(row.smtpSecure || '').toLowerCase() === 'true';
  return {
    source: 'brand',
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    user: row.smtpUser != null ? String(row.smtpUser).trim() : '',
    pass: row.smtpPass != null ? String(row.smtpPass) : '',
  };
}

function defaultDeliveryCostFromStored(stored) {
  if (stored.defaultDeliveryCost == null || String(stored.defaultDeliveryCost).trim() === '') return undefined;
  const n = parseFloat(stored.defaultDeliveryCost);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

async function getBrandSettings() {
  const result = await pool.query('SELECT key, value FROM brand_settings');
  const stored = rowToObj(result.rows);
  const taxOverride = taxPercentFromStored(stored);
  const taxRatePercent = taxOverride !== undefined ? taxOverride : defaultTaxPercentFromConfig();
  const currency = normalizeCurrency(stored.currency) || DEFAULTS.currency;
  const deliveryOverride = defaultDeliveryCostFromStored(stored);
  const defaultDeliveryCost =
    deliveryOverride !== undefined ? deliveryOverride : config.app.shippingCost;

  const heroTitle =
    stored.heroTitle !== undefined && stored.heroTitle !== null
      ? String(stored.heroTitle)
      : DEFAULTS.heroTitle;
  const heroSubtitle =
    stored.heroSubtitle !== undefined && stored.heroSubtitle !== null
      ? String(stored.heroSubtitle)
      : DEFAULTS.heroSubtitle;

  let heroBannerOverlay = DEFAULTS.heroBannerOverlay;
  if (stored.heroBannerOverlay != null && String(stored.heroBannerOverlay).trim() !== '') {
    const o = parseFloat(stored.heroBannerOverlay);
    if (Number.isFinite(o)) heroBannerOverlay = Math.min(0.85, Math.max(0, o));
  }

  let emailFrom = null;
  try {
    if (stored.emailFrom != null && String(stored.emailFrom).trim() !== '') {
      emailFrom = normalizeEmailFromInput(String(stored.emailFrom));
    }
  } catch {
    emailFrom = null;
  }

  const smtpHostStored = stored.smtpHost != null ? String(stored.smtpHost).trim() : '';
  const smtpPortStored =
    stored.smtpPort != null && String(stored.smtpPort).trim() !== '' ? String(stored.smtpPort).trim() : '';
  const smtpUserStored = stored.smtpUser != null ? String(stored.smtpUser).trim() : '';
  const smtpSecureStored = String(stored.smtpSecure || '').toLowerCase() === 'true';
  const smtpPassSet = Boolean(stored.smtpPass != null && String(stored.smtpPass) !== '');

  return {
    primary: stored.primary || DEFAULTS.primary,
    primaryDark: stored.primaryDark || DEFAULTS.primaryDark,
    secondary: stored.secondary || DEFAULTS.secondary,
    accent: stored.accent || DEFAULTS.accent,
    headerShadow: stored.headerShadow || DEFAULTS.headerShadow,
    banner: stored.banner || DEFAULTS.banner,
    logo: stored.logo || DEFAULTS.logo,
    allProductsImage: stored.allProductsImage || DEFAULTS.allProductsImage,
    allProductsShowOnWebsite: parseBoolSetting(
      stored.allProductsShowOnWebsite,
      DEFAULTS.allProductsShowOnWebsite
    ),
    requestIconImage: stored.requestIconImage || DEFAULTS.requestIconImage,
    currency,
    taxRatePercent,
    heroTitle,
    heroSubtitle,
    heroBannerOverlay,
    emailFrom,
    defaultDeliveryCost,
    smtpConfiguredViaEnv: smtpEnvHostSet(),
    smtpHost: smtpHostStored,
    smtpPort: smtpPortStored,
    smtpUser: smtpUserStored,
    smtpSecure: smtpSecureStored,
    smtpPassSet,
  };
}

// Public: GET brand settings (for storefront)
router.get('/', async (req, res) => {
  try {
    const settings = await getBrandSettings();
    const {
      emailFrom: _private,
      smtpConfiguredViaEnv: _e,
      smtpHost: _h,
      smtpPort: _p,
      smtpUser: _u,
      smtpSecure: _s,
      smtpPassSet: _ps,
      ...publicSettings
    } = settings;
    res.json(publicSettings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.getBrandSettings = getBrandSettings;
module.exports.getOutboundEmailFrom = getOutboundEmailFrom;
module.exports.getEffectiveSmtpConfig = getEffectiveSmtpConfig;
module.exports.smtpEnvHostSet = smtpEnvHostSet;
module.exports.normalizeEmailFromInput = normalizeEmailFromInput;
module.exports.formatOutboundFrom = formatOutboundFrom;
module.exports.parseEmailAddress = parseEmailAddress;
module.exports.DEFAULTS = DEFAULTS;
module.exports.normalizeCurrency = normalizeCurrency;
module.exports.defaultDeliveryCostFromStored = defaultDeliveryCostFromStored;
