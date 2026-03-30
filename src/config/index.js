require('dotenv').config();
const path = require('path');

const storageRoot = process.env.STORAGE_ROOT || process.env.RENDER_DISK_ROOT || process.cwd();
const uploadUrlPrefix = (process.env.UPLOAD_URL_PREFIX || '/uploads').replace(/\/+$/, '') || '/uploads';
const sqliteDbPath = process.env.SQLITE_DB_PATH || path.join(storageRoot, 'data', 'sellitnow.db');
const uploadDir = process.env.UPLOAD_DIR || path.join(storageRoot, 'uploads');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/sellitnow',
    sqlitePath: sqliteDbPath,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
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
