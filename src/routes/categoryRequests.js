const express = require('express');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const CategoryService = require('../services/CategoryService');
const EmailService = require('../services/EmailService');
const { uploadRequestPhoto } = require('../middleware/upload');

const router = express.Router();

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please try again later.' },
});

function parseEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@') || email.length > 254) {
    throw new Error('A valid email address is required.');
  }
  return email;
}

// POST /api/v1/category-requests
router.post('/', requestLimiter, (req, res) => {
  uploadRequestPhoto(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || 'Invalid photo upload.' });
    }

    try {
      const categoryId = parseInt(req.body.category_id, 10);
      if (!Number.isFinite(categoryId) || categoryId < 1) {
        throw new Error('Category is required.');
      }

      const category = await CategoryService.getById(categoryId);
      if (!category.show_on_website) {
        throw new Error('Category not available.');
      }
      if (category.category_type !== 'icon') {
        throw new Error('This category does not accept requests.');
      }

      const customerName = String(req.body.name || '').trim();
      if (!customerName) throw new Error('Your name is required.');

      const customerEmail = parseEmail(req.body.email);
      const message = String(req.body.message || '').trim();
      if (message.length > 5000) {
        throw new Error('Message is too long (max 5000 characters).');
      }

      let photoFile = req.file || null;
      if (photoFile) {
        const ImageProcessService = require('../services/ImageProcessService');
        await ImageProcessService.processMulterFile(photoFile, 'request');
        if (!photoFile.buffer && photoFile.path) {
          photoFile = {
            ...photoFile,
            buffer: fs.readFileSync(photoFile.path),
          };
        }
      }

      const result = await EmailService.sendCategoryRequest({
        category,
        customerName,
        customerEmail,
        message,
        photoFile,
      });

      if (!result.success) {
        return res.status(503).json({ error: result.error || 'Could not send your request.' });
      }

      res.json({ success: true, message: 'Your request was sent. We will get back to you soon.' });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Could not send request.' });
    }
  });
});

module.exports = router;
