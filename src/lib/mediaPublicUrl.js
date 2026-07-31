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
  if (options.assetType) {
    await ImageProcessService.processMulterFile(file, options.assetType);
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

module.exports = { publicUrlForUploadedFile, uploadPrefix };
