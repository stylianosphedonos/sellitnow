const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { pool } = require('../database/db');
const { getBrandSettings } = require('../routes/brand');
const ProductService = require('./ProductService');
const { validateVariantForProduct } = require('../lib/productOptions');

class CartService {
  /**
   * Get or create cart for user or guest
   */
  async getOrCreateCart(userId = null, sessionId = null) {
    if (userId) {
      let result = await pool.query('SELECT * FROM cart WHERE user_id = $1', [userId]);
      if (result.rows.length) {
        return result.rows[0];
      }
      const newCart = await pool.query(
        'INSERT INTO cart (user_id) VALUES ($1) RETURNING *',
        [userId]
      );
      return newCart.rows[0];
    }

    if (!sessionId) {
      sessionId = uuidv4();
    }

    let result = await pool.query('SELECT * FROM cart WHERE session_id = $1', [sessionId]);
    if (result.rows.length) {
      const cart = result.rows[0];
      if (cart.expires_at && new Date(cart.expires_at) < new Date()) {
        await pool.query('DELETE FROM cart WHERE id = $1', [cart.id]);
        return this.getOrCreateCart(null, sessionId);
      }
      return cart;
    }

    const expiresAt = new Date(Date.now() + config.app.cartExpiryDays * 24 * 60 * 60 * 1000).toISOString();
    result = await pool.query(
      'INSERT INTO cart (session_id, expires_at) VALUES ($1, $2) RETURNING *',
      [sessionId, expiresAt]
    );
    return result.rows[0];
  }

  /**
   * Get cart with items
   */
  async getCart(userId = null, sessionId = null) {
    const cart = await this.getOrCreateCart(userId, sessionId);
    const itemsResult = await pool.query(
      `SELECT ci.id, ci.product_id, ci.quantity, ci.color, ci.size, p.title, p.price, p.stock_quantity, p.sku,
              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = $1`,
      [cart.id]
    );

    let subtotal = 0;
    const items = itemsResult.rows.map((r) => {
      const lineTotal = parseFloat(r.price) * r.quantity;
      subtotal += lineTotal;
      return {
        id: r.id,
        product_id: r.product_id,
        quantity: r.quantity,
        color: r.color || '',
        size: r.size || '',
        title: r.title,
        price: parseFloat(r.price),
        stock_quantity: r.stock_quantity,
        image_url: r.image_url,
        sku: r.sku,
        line_total: lineTotal,
      };
    });

    const brand = await getBrandSettings();
    const taxRate = Number(brand.taxRatePercent) / 100;
    const taxAmount = subtotal * (Number.isFinite(taxRate) ? taxRate : 0);
    const shippingCost = config.app.shippingCost;
    const total = subtotal + taxAmount + shippingCost;

    return {
      cart_id: cart.id,
      session_id: cart.session_id,
      items,
      subtotal,
      tax_amount: taxAmount,
      shipping_estimate: shippingCost,
      total,
      item_count: items.reduce((s, i) => s + i.quantity, 0),
    };
  }

  /**
   * Add item to cart
   */
  async addItem(userId, sessionId, productId, quantity = 1, variant = {}) {
    const cart = await this.getOrCreateCart(userId, sessionId);
    const product = await ProductService.getById(productId);
    if (product.status !== 'active') throw new Error('Product not available');
    if (product.stock_quantity < quantity) throw new Error('Insufficient stock');

    const { color, size } = validateVariantForProduct(product, variant.color, variant.size);

    const existing = await pool.query(
      'SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2 AND color = $3 AND size = $4',
      [cart.id, productId, color, size]
    );

    if (existing.rows.length) {
      const newQty = existing.rows[0].quantity + quantity;
      if (product.stock_quantity < newQty) throw new Error('Insufficient stock');
      await pool.query(
        'UPDATE cart_items SET quantity = $1 WHERE cart_id = $2 AND product_id = $3 AND color = $4 AND size = $5',
        [newQty, cart.id, productId, color, size]
      );
    } else {
      await pool.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity, color, size) VALUES ($1, $2, $3, $4, $5)',
        [cart.id, productId, quantity, color, size]
      );
    }

    return this.getCart(userId, sessionId);
  }

  /**
   * Update cart item quantity
   */
  async updateItem(userId, sessionId, itemId, quantity) {
    const cart = await this.getOrCreateCart(userId, sessionId);
    const itemResult = await pool.query(
      `SELECT ci.*, p.stock_quantity FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.id = $1 AND ci.cart_id = $2`,
      [itemId, cart.id]
    );
    if (!itemResult.rows.length) throw new Error('Cart item not found');

    if (quantity <= 0) {
      await pool.query('DELETE FROM cart_items WHERE id = $1', [itemId]);
    } else {
      if (quantity > itemResult.rows[0].stock_quantity) {
        throw new Error('Insufficient stock');
      }
      await pool.query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [quantity, itemId]);
    }

    return this.getCart(userId, sessionId);
  }

  /**
   * Remove item from cart
   */
  async removeItem(userId, sessionId, itemId) {
    const cart = await this.getOrCreateCart(userId, sessionId);
    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND cart_id = $2 RETURNING id',
      [itemId, cart.id]
    );
    if (!result.rows.length) throw new Error('Cart item not found');
    return this.getCart(userId, sessionId);
  }

  /**
   * Merge guest cart into user cart on login
   */
  async mergeCarts(userId, sessionId) {
    const userCart = await pool.query('SELECT * FROM cart WHERE user_id = $1', [userId]);
    const guestCart = await pool.query('SELECT * FROM cart WHERE session_id = $1', [sessionId]);

    if (!guestCart.rows.length) return;
    if (!userCart.rows.length) {
      await pool.query('UPDATE cart SET user_id = $1, session_id = NULL, expires_at = NULL WHERE session_id = $2', [
        userId,
        sessionId,
      ]);
      return;
    }

    // Merge guest items into user cart
    const guestItems = await pool.query(
      'SELECT product_id, quantity, color, size FROM cart_items WHERE cart_id = $1',
      [guestCart.rows[0].id]
    );

    for (const item of guestItems.rows) {
      await this.addItem(userId, null, item.product_id, item.quantity, {
        color: item.color,
        size: item.size,
      });
    }

    await pool.query('DELETE FROM cart WHERE id = $1', [guestCart.rows[0].id]);
  }

  /**
   * Clear cart (after order)
   */
  async clearCart(cartId) {
    await pool.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
  }
}

module.exports = new CartService();
