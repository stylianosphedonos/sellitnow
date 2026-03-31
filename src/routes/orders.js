const express = require('express');
const OrderService = require('../services/OrderService');
const CartService = require('../services/CartService');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

function getCartContext(req) {
  const userId = req.user?.id || null;
  const sessionId = req.headers['x-cart-session'] || null;
  return { userId, sessionId };
}

// POST /api/v1/orders - create order from cart
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { userId, sessionId } = getCartContext(req);
    const { guest_email, shipping_address } = req.body;

    if (!shipping_address) {
      return res.status(400).json({ error: 'Shipping address is required' });
    }

    const cart = await CartService.getCart(userId, sessionId);
    const { order, items, guest_order_token } = await OrderService.createOrder(
      userId,
      guest_email,
      shipping_address,
      cart.cart_id,
      sessionId
    );

    res.status(201).json({ order, items, guest_order_token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/v1/orders - user's orders (requires auth)
router.get('/', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await OrderService.getUserOrders(req.user.id, page, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/orders/:id - order details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    const userId = req.user?.id || null;
    const guestHeaderToken = typeof req.headers['x-guest-order-token'] === 'string' ? req.headers['x-guest-order-token'] : null;
    const guestQueryToken = typeof req.query.guest_token === 'string' ? req.query.guest_token : null;
    const guestToken = guestHeaderToken || guestQueryToken;

    const order = await OrderService.getOrderById(orderId, userId, guestToken);
    res.json({ order });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
