const express = require('express');
const CartService = require('../services/CartService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

function getCartContext(req) {
  const userId = req.user?.id || null;
  const sessionId = req.headers['x-cart-session'] || null;
  return { userId, sessionId };
}

// GET /api/v1/cart
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { userId, sessionId } = getCartContext(req);
    const cart = await CartService.getCart(userId, sessionId);
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/cart/items
router.post('/items', optionalAuth, async (req, res) => {
  try {
    const { userId, sessionId } = getCartContext(req);
    const { product_id, quantity = 1, color = '', size = '' } = req.body;
    const cart = await CartService.addItem(userId, sessionId, product_id, quantity, { color, size });
    res.json(cart);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/v1/cart/items/:id
router.patch('/items/:id', optionalAuth, async (req, res) => {
  try {
    const { userId, sessionId } = getCartContext(req);
    const itemId = parseInt(req.params.id, 10);
    const { quantity } = req.body;
    const cart = await CartService.updateItem(userId, sessionId, itemId, quantity);
    res.json(cart);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/v1/cart/items/:id
router.delete('/items/:id', optionalAuth, async (req, res) => {
  try {
    const { userId, sessionId } = getCartContext(req);
    const itemId = parseInt(req.params.id, 10);
    const cart = await CartService.removeItem(userId, sessionId, itemId);
    res.json(cart);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
