const express = require('express');
const ProductService = require('../services/ProductService');
const CategoryService = require('../services/CategoryService');

const router = express.Router();

// GET /api/v1/products/suggest - typeahead matches (must be before :idOrSlug)
router.get('/suggest', async (req, res) => {
  try {
    const q = String(req.query.q || req.query.search || '').trim();
    const limit = parseInt(req.query.limit, 10) || 8;
    const categoryId = parseInt(req.query.category_id, 10);
    const result = await ProductService.suggest(q, {
      limit,
      categoryId: Number.isFinite(categoryId) ? categoryId : null,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/products - list with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const q = String(req.query.q || req.query.search || '').trim();
    const typeRaw = String(req.query.type || '').trim().toLowerCase();
    const productType =
      typeRaw === 'bundle' || typeRaw === 'offer'
        ? 'bundle'
        : typeRaw === 'simple' || typeRaw === 'item' || typeRaw === 'items'
          ? 'simple'
          : null;
    const result = await ProductService.list(page, limit, q, { productType });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/products/:id - by id or slug (SEO-friendly)
router.get('/:idOrSlug', async (req, res) => {
  try {
    const id = parseInt(req.params.idOrSlug, 10);
    const product = Number.isNaN(id)
      ? await ProductService.getBySlug(req.params.idOrSlug)
      : await ProductService.getById(id);
    res.json({ product });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
