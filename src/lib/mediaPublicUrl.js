const path = require('path');
const config = require('../config');
const MediaBlobService = require('../services/MediaBlobService');
const { isPostgres } = require('../database/db');

function uploadPrefix() {
  return (config.app.uploadUrlPrefix || '/uploads').replace(/\/+$/, '') || '/uploads';
}

/**
 * Returns the public URL path for a multer file (memory storage for Postgres, disk for SQLite).
 */
async function publicUrlForUploadedFile(file) {
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

module.exports = { publicUrlForUploadedFile, uploadPrefix };
