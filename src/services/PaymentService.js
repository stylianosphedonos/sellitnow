const Stripe = require('stripe');
const config = require('../config');
const { pool } = require('../database/db');
const { getBrandSettings } = require('../routes/brand');
const OrderService = require('./OrderService');
const ProductService = require('./ProductService');
const EmailService = require('./EmailService');

let stripe = null;
if (config.stripe.secretKey) {
  stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });
}

class PaymentService {
  /**
   * Process payment with Stripe
   * orderRef can be order_id (number) or order_number (string)
   */
  async processPayment(orderRef, paymentMethodId) {
    if (!stripe) throw new Error('Stripe is not configured');

    const order = Number.isInteger(Number(orderRef))
      ? await OrderService.getById(Number(orderRef))
      : await OrderService.getOrderByNumber(orderRef);
    if (!order) throw new Error('Order not found');
    if (order.payment_status === 'paid') throw new Error('Order already paid');

    const amountInCents = Math.round(parseFloat(order.total_amount) * 100);
    if (amountInCents < 50) throw new Error('Amount too small');

    const { currency: storeCurrency } = await getBrandSettings();
    const stripeCurrency = (storeCurrency || 'usd').toLowerCase();

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: stripeCurrency,
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { order_id: order.id.toString(), order_number: order.order_number },
      });

      if (paymentIntent.status === 'succeeded') {
        await this.handlePaymentSuccess(order.id, paymentIntent.id, order.total_amount);
      }

      return {
        status: paymentIntent.status,
        client_secret: paymentIntent.client_secret,
        order_number: order.order_number,
      };
    } catch (err) {
      await pool.query(
        'INSERT INTO transactions (order_id, amount, status) VALUES ($1, $2, $3)',
        [order.id, order.total_amount, 'failed']
      );
      throw err;
    }
  }

  /**
   * Handle successful payment (idempotent: safe if webhook retries)
   */
  async handlePaymentSuccess(orderId, stripeTransactionId, amount) {
    const orderResult = await pool.query('SELECT payment_status FROM orders WHERE id = $1', [orderId]);
    if (!orderResult.rows.length) return;
    if (orderResult.rows[0].payment_status === 'paid') return; // already handled

    await pool.query(
      'UPDATE orders SET payment_status = $1, status = $2 WHERE id = $3',
      ['paid', 'processing', orderId]
    );
    await pool.query(
      'INSERT INTO transactions (order_id, stripe_transaction_id, amount, status) VALUES ($1, $2, $3, $4)',
      [orderId, stripeTransactionId, amount, 'succeeded']
    );

    // Decrement product stock (only once, when order moves to paid)
    const items = await pool.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId]);
    for (const item of items.rows) {
      await ProductService.decrementStock(item.product_id, item.quantity);
    }
  }

  /**
   * Create PaymentIntent for client-side confirmation
   * orderRef can be order_id (number) or order_number (string)
   */
  async createPaymentIntent(orderRef) {
    if (!stripe) throw new Error('Stripe is not configured');

    const order = Number.isInteger(Number(orderRef))
      ? await OrderService.getById(Number(orderRef))
      : await OrderService.getOrderByNumber(orderRef);
    if (!order) throw new Error('Order not found');
    if (order.payment_status === 'paid') throw new Error('Order already paid');

    const amountInCents = Math.round(parseFloat(order.total_amount) * 100);
    if (amountInCents < 50) throw new Error('Amount too small');

    const { currency: storeCurrency } = await getBrandSettings();
    const stripeCurrency = (storeCurrency || 'usd').toLowerCase();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: stripeCurrency,
      automatic_payment_methods: { enabled: true },
      metadata: { order_id: order.id.toString(), order_number: order.order_number },
    });

    return {
      client_secret: paymentIntent.client_secret,
      order_number: order.order_number,
    };
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(payload, signature) {
    if (!stripe || !config.stripe.webhookSecret) {
      throw new Error('Webhook not configured');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, config.stripe.webhookSecret);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const orderId = parseInt(pi.metadata?.order_id, 10);
      const amount = pi.amount_received / 100;
      if (orderId) {
        await this.handlePaymentSuccess(orderId, pi.id, amount);
      }
    }

    return { received: true };
  }
}

module.exports = new PaymentService();
