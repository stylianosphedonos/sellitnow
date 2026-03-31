const express = require('express');
const CategoryService = require('../services/CategoryService');

const router = express.Router();

// GET /api/v1/categories
router.get('/', async (req, res) => {
  try {
    const categories = await CategoryService.list();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/categories/:id/products (must be before :id)
router.get('/:id/products', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const q = String(req.query.q || req.query.search || '').trim();
    const result = await CategoryService.getProductsByCategoryId(id, page, limit, q);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/v1/categories/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const category = await CategoryService.getById(id);
    res.json({ category });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
