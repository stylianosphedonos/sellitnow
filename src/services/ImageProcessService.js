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
    logoMaxWidth: 480,
    logoMaxHeight: 100,
    logoTop: 40,
    productTop: 168,
    productBottom: 56,
    productSide: 72,
    /** Dark fill used when brand logo is light/white (header logos). */
    darkLogoColor: { r: 42, g: 42, b: 42 },
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

function uploadPrefix() {
  return (config.app.uploadUrlPrefix || '/uploads').replace(/\/+$/, '') || '/uploads';
}

/**
 * Resolve brand logo bytes from brand_settings (disk path, blob id, or absolute URL).
 */
async function loadBrandLogoBuffer() {
  try {
    const result = await pool.query(`SELECT value FROM brand_settings WHERE key = 'logo' LIMIT 1`);
    const url = result.rows[0]?.value;
    if (!url || !String(url).trim()) {
      console.warn('[ImageProcess] No brand logo set — product photos will not include a logo.');
      return null;
    }
    const s = String(url).trim();

    const blobMatch = s.match(/\/blob\/([0-9a-f-]{36})/i);
    if (blobMatch) {
      if (!isPostgres) {
        console.warn('[ImageProcess] Logo is a blob URL but database is not Postgres.');
        return null;
      }
      const row = await MediaBlobService.getById(blobMatch[1]);
      if (!row?.data) {
        console.warn('[ImageProcess] Logo blob not found:', blobMatch[1]);
        return null;
      }
      return Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    }

    // Relative /uploads/filename or bare filename
    let pathname = s;
    try {
      if (/^https?:\/\//i.test(s)) pathname = new URL(s).pathname;
    } catch (_) {}

    const prefix = uploadPrefix();
    let filename = path.basename(pathname.split('?')[0]);
    if (pathname.startsWith(prefix + '/')) {
      filename = pathname.slice(prefix.length + 1).split('?')[0];
      // e.g. blob/uuid already handled; nested paths take basename
      filename = path.basename(filename);
    }
    if (filename && !filename.includes('..')) {
      const full = path.join(config.app.uploadDir, filename);
      if (fs.existsSync(full)) {
        return fs.promises.readFile(full);
      }
    }

    // Last resort: fetch absolute URL (cross-origin / CDN)
    if (/^https?:\/\//i.test(s)) {
      const res = await fetch(s);
      if (!res.ok) {
        console.warn('[ImageProcess] Failed to fetch logo URL:', res.status, s);
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    }

    console.warn('[ImageProcess] Could not resolve logo file for URL:', s);
    return null;
  } catch (err) {
    console.warn('[ImageProcess] loadBrandLogoBuffer error:', err.message);
    return null;
  }
}

/**
 * Resize logo for the studio canvas. Light/white logos (typical header marks)
 * are redrawn in dark charcoal so they read on the cream background.
 */
async function prepareStudioLogo(logoBuf, preset) {
  const resized = await sharp(logoBuf)
    .rotate()
    .resize({
      width: preset.logoMaxWidth,
      height: preset.logoMaxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  let opaque = 0;
  let lumSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 40) continue;
    opaque += 1;
    lumSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const avgLum = opaque ? lumSum / opaque : 0;
  const isLightLogo = avgLum >= 150;

  if (isLightLogo) {
    const { r, g, b } = preset.darkLogoColor;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }

  const png = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer({ resolveWithObject: true });

  return png;
}

async function composeProductStudio(inputBuffer, preset) {
  const size = preset.size;
  const layers = [];

  const logoBuf = await loadBrandLogoBuffer();
  if (logoBuf) {
    try {
      const logo = await prepareStudioLogo(logoBuf, preset);
      const left = Math.round((size - logo.info.width) / 2);
      layers.push({
        input: logo.data,
        left,
        top: preset.logoTop,
      });
    } catch (err) {
      console.warn('[ImageProcess] Logo composite failed:', err.message);
    }
  }

  const productBoxW = size - preset.productSide * 2;
  const productBoxH = size - preset.productTop - preset.productBottom;
  const product = await sharp(inputBuffer)
    .rotate()
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

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: preset.background,
    },
  })
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
    delete file.buffer;
  } else {
    file.buffer = buffer;
  }

  console.log(
    `[ImageProcess] ${assetType}: ${Math.round(input.length / 1024)}KB → ${Math.round(buffer.length / 1024)}KB (${mimetype})`
  );
  return file;
}

module.exports = {
  PRESETS,
  processBuffer,
  processMulterFile,
  loadBrandLogoBuffer,
  prepareStudioLogo,
};
