const fs = require('fs');
const path = require('path');
const config = require('../config');
const MediaBlobService = require('../services/MediaBlobService');
const ImageProcessService = require('../services/ImageProcessService');
const { isPostgres } = require('../database/db');

function uploadPrefix() {
  return (config.app.uploadUrlPrefix || '/uploads').replace(/\/+$/, '') || '/uploads';
}

/**
 * Returns the public URL path for a multer file (memory storage for Postgres, disk for SQLite).
 * @param {Express.Multer.File} file
 * @param {{ assetType?: string }} [options] - When set, resizes/composites before storing
 */
async function publicUrlForUploadedFile(file, options = {}) {
  // Prefer middleware-processed files; still process here if a caller skipped middleware.
  if (options.assetType && file && file._imageProcessed !== options.assetType) {
    try {
      await ImageProcessService.processMulterFile(file, options.assetType);
    } catch (err) {
      console.error('[ImageProcess] Failed for', options.assetType, err);
      throw new Error(
        `Image processing failed (${options.assetType}): ${err.message || 'unknown error'}`
      );
    }
  }

  const prefix = uploadPrefix();
  if (isPostgres) {
    const buf = file.buffer;
    if (!buf || !Buffer.isBuffer(buf)) {
      throw new Error('Missing image data');
    }
    const id = await MediaBlobService.insert(buf, file.mimetype);
    return `${prefix}/blob/${id}`;
  }
  const filename = file.filename || path.basename(file.path);
  return `${prefix}/${filename}`.replace(/\/{2,}/g, '/');
}

/**
 * Best-effort delete of a previously stored public media URL (local disk or Postgres blob).
 * @param {string} url
 */
async function deleteStoredMediaUrl(url) {
  const raw = url != null ? String(url).trim() : '';
  if (!raw) return;

  const prefix = uploadPrefix();
  const normalized = raw.replace(/\/{2,}/g, '/');
  const blobPrefix = `${prefix}/blob/`;
  if (normalized.startsWith(blobPrefix)) {
    const id = normalized.slice(blobPrefix.length).split(/[/?#]/)[0];
    if (id && isPostgres) {
      await MediaBlobService.deleteById(id).catch(() => {});
    }
    return;
  }

  const filename = path.basename(normalized);
  if (!filename || filename === '.' || filename === '..') return;

  const uploadDir = config.app.uploadDir;
  if (!uploadDir) return;

  const filePath = path.join(uploadDir, filename);
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(uploadDir);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) return;

  await fs.promises.unlink(resolved).catch(() => {});
}

module.exports = { publicUrlForUploadedFile, uploadPrefix, deleteStoredMediaUrl };
