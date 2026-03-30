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

const memory = multer.memoryStorage();
const storage = isPostgres ? memory : productDiskStorage();
const bannerStorage = isPostgres ? memory : bannerDiskStorage();
const logoStorage = isPostgres ? memory : logoDiskStorage();
const categoryImageStorage = isPostgres ? memory : categoryDiskStorage();

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
 * Upload up to 5 product images
 */
const uploadProductImages = upload.array('images', config.app.maxImagesPerProduct);

const uploadBanner = multer({
  storage: bannerStorage,
  fileFilter,
  limits: { fileSize: maxSize },
}).single('banner');

const uploadLogo = multer({
  storage: logoStorage,
  fileFilter,
  limits: { fileSize: maxSize },
}).single('logo');

const uploadCategoryImage = multer({
  storage: categoryImageStorage,
  fileFilter,
  limits: { fileSize: maxSize },
}).single('image');

module.exports = { uploadProductImages, uploadBanner, uploadLogo, uploadCategoryImage, upload };
