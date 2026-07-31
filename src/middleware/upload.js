const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { isPostgres } = require('../database/db');

const uploadDir = config.app.uploadDir;
const maxSizeMB = config.app.maxImageSizeMB;
const maxSize = maxSizeMB * 1024 * 1024;

if (!isPostgres) {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

function productDiskStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `product-${unique}${ext}`);
    },
  });
}

function bannerDiskStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `banner-${unique}${ext}`);
    },
  });
}

function logoDiskStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `logo-${unique}${ext}`);
    },
  });
}

function categoryDiskStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `category-${unique}${ext}`);
    },
  });
}

function allProductsTileDiskStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `all-products-${unique}${ext}`);
    },
  });
}

function requestIconDiskStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `request-icon-${unique}${ext}`);
    },
  });
}

const memory = multer.memoryStorage();
const storage = isPostgres ? memory : productDiskStorage();
const bannerStorage = isPostgres ? memory : bannerDiskStorage();
const logoStorage = isPostgres ? memory : logoDiskStorage();
const categoryImageStorage = isPostgres ? memory : categoryDiskStorage();
const allProductsTileImageStorage = isPostgres ? memory : allProductsTileDiskStorage();
const requestIconImageStorage = isPostgres ? memory : requestIconDiskStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP, GIF allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSize },
});

/**
 * Run ImageProcessService after multer so create/edit uploads always get resized + logo.
 */
function withProcessedImages(multerMiddleware, assetType) {
  return (req, res, next) => {
    multerMiddleware(req, res, async (err) => {
      if (err) return next(err);
      try {
        const ImageProcessService = require('../services/ImageProcessService');
        const files = Array.isArray(req.files)
          ? req.files
          : req.file
            ? [req.file]
            : [];
        for (const file of files) {
          await ImageProcessService.processMulterFile(file, assetType);
        }
        next();
      } catch (processErr) {
        console.error('[upload] image processing failed:', processErr);
        next(processErr);
      }
    });
  };
}

/**
 * Upload up to 5 product images (always studio-processed: 1200² + logo)
 */
const uploadProductImages = withProcessedImages(
  upload.array('images', config.app.maxImagesPerProduct),
  'product'
);

const uploadBanner = withProcessedImages(
  multer({
    storage: bannerStorage,
    fileFilter,
    limits: { fileSize: maxSize },
  }).single('banner'),
  'banner'
);

const uploadLogo = withProcessedImages(
  multer({
    storage: logoStorage,
    fileFilter,
    limits: { fileSize: maxSize },
  }).single('logo'),
  'logo'
);

const uploadCategoryImage = withProcessedImages(
  multer({
    storage: categoryImageStorage,
    fileFilter,
    limits: { fileSize: maxSize },
  }).single('image'),
  'category'
);

const uploadAllProductsTileImage = withProcessedImages(
  multer({
    storage: allProductsTileImageStorage,
    fileFilter,
    limits: { fileSize: maxSize },
  }).single('image'),
  'all-products'
);

const uploadRequestIconImage = withProcessedImages(
  multer({
    storage: requestIconImageStorage,
    fileFilter,
    limits: { fileSize: maxSize },
  }).single('image'),
  'request-icon'
);

const uploadRequestPhoto = withProcessedImages(
  multer({
    storage: isPostgres ? memory : categoryImageStorage,
    fileFilter,
    limits: { fileSize: maxSize },
  }).single('photo'),
  'request'
);

module.exports = {
  uploadProductImages,
  uploadBanner,
  uploadLogo,
  uploadCategoryImage,
  uploadAllProductsTileImage,
  uploadRequestIconImage,
  uploadRequestPhoto,
  upload,
};
