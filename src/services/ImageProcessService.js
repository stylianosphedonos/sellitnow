const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { pool, isPostgres } = require('../database/db');
const MediaBlobService = require('./MediaBlobService');

/** Ideal output sizes aligned with storefront display. */
const PRESETS = {
  product: {
    size: 1200,
    background: '#f3f1ec',
    logoMaxWidth: 420,
    logoMaxHeight: 78,
    logoTop: 44,
    productTop: 148,
    productBottom: 56,
    productSide: 72,
    format: 'jpeg',
    quality: 84,
  },
  banner: {
    width: 2400,
    height: 1029, // ~21:9
    format: 'jpeg',
    quality: 82,
  },
  logo: {
    maxWidth: 800,
    maxHeight: 200,
    format: 'png',
  },
  category: {
    size: 600,
    format: 'jpeg',
    quality: 82,
  },
  'all-products': {
    size: 600,
    format: 'jpeg',
    quality: 82,
  },
  request: {
    maxEdge: 1600,
    format: 'jpeg',
    quality: 82,
  },
};

async function readMulterBuffer(file) {
  if (file?.buffer && Buffer.isBuffer(file.buffer)) return file.buffer;
  if (file?.path) return fs.promises.readFile(file.path);
  throw new Error('Missing image data');
}

async function loadBrandLogoBuffer() {
  try {
    const result = await pool.query(`SELECT value FROM brand_settings WHERE key = 'logo' LIMIT 1`);
    const url = result.rows[0]?.value;
    if (!url || !String(url).trim()) return null;
    const s = String(url).trim();

    const blobMatch = s.match(/\/blob\/([0-9a-f-]{36})/i);
    if (blobMatch) {
      if (!isPostgres) return null;
      const row = await MediaBlobService.getById(blobMatch[1]);
      return row?.data ? Buffer.from(row.data) : null;
    }

    const filename = path.basename(s.split('?')[0]);
    if (!filename || filename.includes('..')) return null;
    const full = path.join(config.app.uploadDir, filename);
    if (!fs.existsSync(full)) return null;
    return fs.promises.readFile(full);
  } catch (_) {
    return null;
  }
}

async function composeProductStudio(inputBuffer, preset) {
  const size = preset.size;
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: preset.background,
    },
  });

  const layers = [];

  const logoBuf = await loadBrandLogoBuffer();
  if (logoBuf) {
    try {
      const logo = await sharp(logoBuf)
        .resize({
          width: preset.logoMaxWidth,
          height: preset.logoMaxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer({ resolveWithObject: true });

      const left = Math.round((size - logo.info.width) / 2);
      layers.push({
        input: logo.data,
        left,
        top: preset.logoTop,
      });
    } catch (_) {
      // Continue without logo if it fails to decode
    }
  }

  const productBoxW = size - preset.productSide * 2;
  const productBoxH = size - preset.productTop - preset.productBottom;
  const product = await sharp(inputBuffer)
    .rotate() // honor EXIF orientation
    .resize({
      width: productBoxW,
      height: productBoxH,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toBuffer({ resolveWithObject: true });

  const productLeft = Math.round((size - product.info.width) / 2);
  const productTop =
    preset.productTop + Math.round((productBoxH - product.info.height) / 2);
  layers.push({
    input: product.data,
    left: productLeft,
    top: productTop,
  });

  return canvas
    .composite(layers)
    .jpeg({ quality: preset.quality, mozjpeg: true })
    .toBuffer();
}

async function processBuffer(inputBuffer, assetType) {
  const type = PRESETS[assetType] ? assetType : 'request';
  const preset = PRESETS[type];

  if (type === 'product') {
    return {
      buffer: await composeProductStudio(inputBuffer, preset),
      mimetype: 'image/jpeg',
      ext: '.jpg',
    };
  }

  if (type === 'banner') {
    const buffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: preset.width,
        height: preset.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: preset.quality, mozjpeg: true })
      .toBuffer();
    return { buffer, mimetype: 'image/jpeg', ext: '.jpg' };
  }

  if (type === 'logo') {
    const buffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: preset.maxWidth,
        height: preset.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { buffer, mimetype: 'image/png', ext: '.png' };
  }

  if (type === 'category' || type === 'all-products') {
    const buffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: preset.size,
        height: preset.size,
        fit: 'cover',
        position: 'centre',
      })
      .jpeg({ quality: preset.quality, mozjpeg: true })
      .toBuffer();
    return { buffer, mimetype: 'image/jpeg', ext: '.jpg' };
  }

  // request / fallback — shrink long edge only
  const buffer = await sharp(inputBuffer)
    .rotate()
    .resize({
      width: preset.maxEdge,
      height: preset.maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: preset.quality, mozjpeg: true })
    .toBuffer();
  return { buffer, mimetype: 'image/jpeg', ext: '.jpg' };
}

/**
 * Process a multer file in place (buffer and/or disk path) for the given asset type.
 * @param {Express.Multer.File} file
 * @param {keyof typeof PRESETS} assetType
 */
async function processMulterFile(file, assetType) {
  if (!file || !assetType) return file;
  const input = await readMulterBuffer(file);
  const { buffer, mimetype, ext } = await processBuffer(input, assetType);

  file.mimetype = mimetype;
  file.size = buffer.length;

  if (file.path) {
    const dir = path.dirname(file.path);
    const base = path.basename(file.filename || file.path).replace(/\.[^.]+$/, '');
    const newFilename = `${base}${ext}`;
    const newPath = path.join(dir, newFilename);
    await fs.promises.writeFile(newPath, buffer);
    if (newPath !== file.path) {
      await fs.promises.unlink(file.path).catch(() => {});
    }
    file.path = newPath;
    file.filename = newFilename;
    // Prefer disk for SQLite path; drop buffer to avoid double storage
    delete file.buffer;
  } else {
    file.buffer = buffer;
  }

  return file;
}

module.exports = {
  PRESETS,
  processBuffer,
  processMulterFile,
  loadBrandLogoBuffer,
};
