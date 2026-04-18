require('dotenv').config();
const path = require('path');

const storageRoot = process.env.STORAGE_ROOT || process.env.RENDER_DISK_ROOT || process.cwd();
const uploadUrlPrefix = (process.env.UPLOAD_URL_PREFIX || '/uploads').replace(/\/+$/, '') || '/uploads';
const sqliteDbPath = process.env.SQLITE_DB_PATH || path.join(storageRoot, 'data', 'sellitnow.db');
const uploadDir = process.env.UPLOAD_DIR || path.join(storageRoot, 'uploads');
const databaseUrl = (process.env.DATABASE_URL || '').trim();
const usePostgres = Boolean(databaseUrl);

function parseBool(v, fallback = false) {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  /** Host to bind (Render and most PaaS require 0.0.0.0 for inbound traffic) */
  host: process.env.HOST || '0.0.0.0',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  database: {
    url: databaseUrl || null,
    usePostgres,
    sqlitePath: sqliteDbPath,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    guestOrderTokenExpiresIn: process.env.GUEST_ORDER_TOKEN_EXPIRES_IN || '7d',
  },
  auth: {
    cookieName: process.env.AUTH_COOKIE_NAME || 'sellitnow_auth',
    csrfCookieName: process.env.CSRF_COOKIE_NAME || 'sellitnow_csrf',
    cookieSecure: parseBool(process.env.AUTH_COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    cookieSameSite: process.env.AUTH_COOKIE_SAMESITE || 'lax',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    /**
     * ISO country for Stripe.js Payment Request (Apple Pay).
     * Must match your Stripe account country; if unset, checkout uses the order shipping country.
     */
    paymentRequestCountry: (() => {
      const raw = process.env.STRIPE_PAYMENT_REQUEST_COUNTRY;
      if (raw == null || String(raw).trim() === '') return null;
      const c = String(raw).trim().toUpperCase().slice(0, 2);
      return /^[A-Z]{2}$/.test(c) ? c : null;
    })(),
  },
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'Sellitnow <noreply@sellitnow.com>',
  },
  app: {
    vatRate: parseFloat(process.env.VAT_RATE || '0.20'),
    shippingCost: parseFloat(process.env.SHIPPING_COST || '5.99'),
    uploadDir,
    uploadUrlPrefix,
    maxImageSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '5', 10),
    maxImagesPerProduct: parseInt(process.env.MAX_IMAGES_PER_PRODUCT || '5', 10),
    cartExpiryDays: 7,
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
    passwordMinLength: 8,
  },
};
