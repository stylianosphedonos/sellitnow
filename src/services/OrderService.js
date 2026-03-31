const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { pool } = require('../database/db');
const CartService = require('./CartService');
const ProductService = require('./ProductService');
const EmailService = require('./EmailService');
const { createGuestOrderToken, verifyGuestOrderToken } = require('../lib/guestOrderToken');

class OrderService {
  async releaseOrderItemsToStock(client, orderId) {
    const itemsResult = await client.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );
    for (const item of itemsResult.rows) {
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1',
        [item.product_id, item.quantity]
      );
    }
  }

  generateOrderNumber() {
    return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  /**
   * Create order from cart
   */
  async createOrder(userId, guestEmail, shippingAddress, cartId, sessionId) {
    const cartData = await CartService.getCart(userId, sessionId);
    if (cartData.items.length === 0) throw new Error('Cart is empty');

    const email = userId ? null : guestEmail;
    if (!userId && !email) throw new Error('Email required for guest checkout');

    const stockIssueLines = [];
    for (const item of cartData.items) {
      const product = await ProductService.getById(item.product_id);
      if (Number(product.stock_quantity) < Number(item.quantity)) {
        stockIssueLines.push(
          `"${product.title}": ordered ${item.quantity}, available ${product.stock_quantity}`
        );
      }
    }
    const stockWarning =
      stockIssueLines.length > 0
        ? `Stock was not available for all line items at checkout: ${stockIssueLines.join('; ')}.`
        : null;

    let userEmail = null;
    if (userId) {
      const u = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
      userEmail = u.rows[0]?.email;
    }

    const subtotal = cartData.subtotal;
    const taxAmount = cartData.tax_amount;
    const shippingCost = config.app.shippingCost;
    const totalAmount = subtotal + taxAmount + shippingCost;

    const orderNumber = this.generateOrderNumber();

    const orderResult = await pool.query(
      `INSERT INTO orders (order_number, user_id, guest_email, status, subtotal, tax_amount, shipping_cost, total_amount, shipping_address, payment_status, stock_warning)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, 'pending', $9)
       RETURNING *`,
      [
        orderNumber,
        userId || null,
        email || null,
        subtotal,
        taxAmount,
        shippingCost,
        totalAmount,
        JSON.stringify(shippingAddress),
        stockWarning,
      ]
    );
    const order = orderResult.rows[0];

    for (const item of cartData.items) {
      const product = await ProductService.getById(item.product_id);
      const productSnapshot = {
        id: product.id,
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        color: item.color || '',
        size: item.size || '',
      };
      await pool.query(
        `INSERT INTO order_items (order_id, product_id, product_snapshot, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.id,
          item.product_id,
          JSON.stringify(productSnapshot),
          item.quantity,
          item.price,
          item.line_total,
        ]
      );
    }

    await CartService.clearCart(cartData.cart_id);

    // Stock is decremented only when payment succeeds (PaymentService.handlePaymentSuccess)

    const items = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [order.id]
    );
    const orderWithEmail = { ...order, user_email: userEmail };
    await EmailService.sendOrderConfirmation(orderWithEmail, items.rows);
    await EmailService.sendAdminNewOrder(order);

    const result = { order, items: items.rows };
    if (!userId && email) {
      result.guest_order_token = createGuestOrderToken(order.id, email);
    }
    return result;
  }

  /**
   * Get user orders
   */
  async getUserOrders(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const countResult = await pool.query(
      'SELECT COUNT(*)::int FROM orders WHERE user_id = $1',
      [userId]
    );
    const total = countResult.rows[0].count;

    const result = await pool.query(
      `SELECT id, order_number, status, total_amount, payment_status, created_at
       FROM orders WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [userId, limit, offset]
    );

    return { items: result.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get order by id (user or guest)
   */
  async getOrderById(orderId, userId = null, guestAccessToken = null) {
    const result = await pool.query(
      `SELECT o.*, u.email as user_email
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );
    if (!result.rows.length) throw new Error('Order not found');

    const ord = result.rows[0];
    if (userId != null) {
      if (Number(ord.user_id) !== Number(userId)) throw new Error('Order not found');
    } else {
      if (!guestAccessToken) throw new Error('Order not found');
      let tokenPayload;
      try {
        tokenPayload = verifyGuestOrderToken(guestAccessToken);
      } catch {
        throw new Error('Order not found');
      }
      const orderGuest = String(ord.guest_email || '').trim().toLowerCase();
      if (!orderGuest) throw new Error('Order not found');
      if (tokenPayload.orderId !== Number(ord.id) || tokenPayload.guestEmail !== orderGuest) {
        throw new Error('Order not found');
      }
    }

    const itemsResult = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [orderId]
    );
    ord.items = itemsResult.rows;
    return ord;
  }

  /**
   * Get order by id (internal, no auth check)
   */
  async getById(orderId) {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!result.rows.length) throw new Error('Order not found');
    return result.rows[0];
  }

  /**
   * Get order by order number
   */
  async getOrderByNumber(orderNumber) {
    const result = await pool.query(
      'SELECT * FROM orders WHERE order_number = $1',
      [orderNumber]
    );
    if (!result.rows.length) throw new Error('Order not found');
    return result.rows[0];
  }

  /**
   * Admin: list all orders with search
   */
  async adminListOrders(search, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    let query = 'SELECT o.*, u.email as user_email FROM orders o LEFT JOIN users u ON o.user_id = u.id';
    const params = [];
    let i = 1;

    if (search) {
      query += ' WHERE (o.order_number ILIKE $1 OR o.guest_email ILIKE $1 OR u.email ILIKE $1)';
      params.push(`%${search}%`);
      i++;
    }
    query += ` ORDER BY o.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query(
      search
        ? 'SELECT COUNT(*)::int FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE (o.order_number ILIKE $1 OR o.guest_email ILIKE $1 OR u.email ILIKE $1)'
        : 'SELECT COUNT(*)::int FROM orders',
      search ? [`%${search}%`] : []
    );
    const total = countResult.rows[0].count;

    return { items: result.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Admin: get order details
   */
  async adminGetOrder(orderId) {
    const result = await pool.query(
      `SELECT o.*, u.email as user_email, u.first_name, u.last_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );
    if (!result.rows.length) throw new Error('Order not found');

    const order = result.rows[0];
    const itemsResult = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [orderId]
    );
    order.items = itemsResult.rows;
    return order;
  }

  /**
   * Admin: update order status
   */
  async updateOrderStatus(orderId, status, trackingNumber = null) {
    const client = await pool.connect();
    let order;
    try {
      await client.query('BEGIN');
      const currentResult = await client.query(
        'SELECT id, status, payment_status FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );
      if (!currentResult.rows.length) throw new Error('Order not found');
      const currentOrder = currentResult.rows[0];

      const shouldReleaseStock = (
        status === 'cancelled'
        && currentOrder.status !== 'cancelled'
        && ['paid', 'refunded'].includes(currentOrder.payment_status)
      );
      if (shouldReleaseStock) {
        await this.releaseOrderItemsToStock(client, orderId);
      }

      const result = await client.query(
        `UPDATE orders SET status = $1, tracking_number = COALESCE($2, tracking_number), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [status, trackingNumber, orderId]
      );
      order = result.rows[0];
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (status === 'shipped' && (order.guest_email || order.user_id)) {
      const u = order.user_id ? await pool.query('SELECT email FROM users WHERE id = $1', [order.user_id]) : { rows: [] };
      const email = order.guest_email || (u.rows[0]?.email);
      if (email) {
        await EmailService.sendOrderShipped({ ...order, user_email: email }, order.tracking_number);
      }
    }
    if (status === 'delivered') {
      const u = order.user_id ? await pool.query('SELECT email FROM users WHERE id = $1', [order.user_id]) : { rows: [] };
      const email = order.guest_email || (u.rows[0]?.email);
      if (email) {
        await EmailService.sendOrderDelivered({ ...order, user_email: email });
      }
    }

    return order;
  }

  /**
   * Cancel order (user or guest)
   */
  async cancelOrder(orderId, userId = null, guestAccessToken = null) {
    const order = await this.getOrderById(orderId, userId, guestAccessToken);
    return this.updateOrderStatus(order.id, 'cancelled');
  }
}

module.exports = new OrderService();
