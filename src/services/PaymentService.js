const Stripe = require('stripe');
const config = require('../config');
const { pool } = require('../database/db');
const { getBrandSettings } = require('../routes/brand');
const OrderService = require('./OrderService');
const CartService = require('./CartService');
const ProductService = require('./ProductService');
const EmailService = require('./EmailService');
const { verifyGuestOrderToken, createGuestOrderToken } = require('../lib/guestOrderToken');
const { computeShippingTotal } = require('../lib/shipping');
const PickupStoreService = require('./PickupStoreService');
const {
  resolveCheckoutAddress,
  toPaymentMetadataAddress,
} = require('../lib/checkoutAddress');

let stripe = null;
if (config.stripe.secretKey) {
  stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });
}

/** Card-only checkout: no Bancontact, MB WAY, iDEAL, etc. from automatic_payment_methods. */
const CARD_ONLY_INTENT = {
  payment_method_types: ['card'],
};

class PaymentService {
  assertOrderAccess(order, { userId = null, guestToken = null } = {}) {
    if (order.user_id) {
      if (!userId || Number(order.user_id) !== Number(userId)) {
        throw new Error('Not authorized to access this order');
      }
      return;
    }
    if (!order.guest_email) {
      throw new Error('Order has no checkout identity');
    }
    if (!guestToken) {
      throw new Error('Not authorized to access this order');
    }
    let payload;
    try {
      payload = verifyGuestOrderToken(guestToken);
    } catch {
      throw new Error('Not authorized to access this order');
    }
    if (
      payload.orderId !== Number(order.id) ||
      payload.guestEmail !== String(order.guest_email).trim().toLowerCase()
    ) {
      throw new Error('Not authorized to access this order');
    }
  }

  /**
   * Process payment with Stripe
   * orderRef can be order_id (number) or order_number (string)
   */
  async processPayment(orderRef, paymentMethodId, actor = {}) {
    if (!stripe) throw new Error('Stripe is not configured');

    const order = Number.isInteger(Number(orderRef))
      ? await OrderService.getById(Number(orderRef))
      : await OrderService.getOrderByNumber(orderRef);
    if (!order) throw new Error('Order not found');
    this.assertOrderAccess(order, actor);
    if (order.payment_status === 'paid') throw new Error('Order already paid');
    if (order.payment_method === 'pay_on_delivery') throw new Error('This order is pay on delivery');

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
        ...CARD_ONLY_INTENT,
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

    const orderForMail = await OrderService.getOrderWithCustomerEmail(orderId);
    const itemRows = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    const mailResult = await EmailService.sendPaymentReceipt(
      orderForMail,
      itemRows.rows,
      {
        stripeTransactionId,
        amountPaid: amount,
      },
      { source: 'payment_webhook' }
    );
    if (!mailResult?.success) {
      console.error(
        `[Payment] Payment receipt email failed for order #${orderForMail.order_number} (id ${orderId}):`,
        mailResult?.error || 'unknown error'
      );
    }
  }

  /**
   * Create PaymentIntent from cart + shipping (order is created after payment succeeds).
   */
  async createCheckoutPaymentIntent({ userId = null, sessionId = null, shippingAddress, guestEmail }) {
    if (!stripe) throw new Error('Stripe is not configured');
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      throw new Error('Shipping address is required');
    }

    const cartData = await CartService.getCart(userId, sessionId);
    if (!cartData.items.length) throw new Error('Cart is empty');

    if (!userId && !guestEmail) throw new Error('Email required for guest checkout');

    const resolvedAddress = await resolveCheckoutAddress(shippingAddress, PickupStoreService);
    const brand = await getBrandSettings();
    const shippingCost = computeShippingTotal(brand.defaultDeliveryCost, cartData.items, {
      fulfillmentMethod: resolvedAddress.fulfillment_method,
    });
    const totalAmount = cartData.subtotal + cartData.tax_amount + shippingCost;
    const amountInCents = Math.round(parseFloat(totalAmount) * 100);
    if (amountInCents < 50) throw new Error('Amount too small');

    const { currency: storeCurrency } = brand;
    const stripeCurrency = (storeCurrency || 'usd').toLowerCase();

    const shippingJson = JSON.stringify(toPaymentMetadataAddress(resolvedAddress));
    if (shippingJson.length > 500) {
      throw new Error('Shipping address is too long');
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: stripeCurrency,
      ...CARD_ONLY_INTENT,
      metadata: {
        checkout_flow: 'cart',
        user_id: userId ? String(userId) : '',
        session_id: sessionId ? String(sessionId) : '',
        guest_email: guestEmail ? String(guestEmail).trim().toLowerCase() : '',
        shipping_address: shippingJson,
      },
    });

    return {
      client_secret: paymentIntent.client_secret,
      total_amount: totalAmount,
      shipping_cost: shippingCost,
      fulfillment_method: resolvedAddress.fulfillment_method,
    };
  }

  /**
   * After payment succeeds, create the order from cart metadata on the PaymentIntent.
   */
  async finalizeCheckoutPayment(paymentIntentId, actor = {}) {
    if (!stripe) throw new Error('Stripe is not configured');
    const piId = String(paymentIntentId || '').trim();
    if (!piId) throw new Error('payment_intent_id is required');

    const paymentIntent = await stripe.paymentIntents.retrieve(piId);
    const meta = paymentIntent.metadata || {};

    const legacyOrderId = parseInt(meta.order_id, 10);
    if (legacyOrderId) {
      const order = await OrderService.getById(legacyOrderId);
      this.assertOrderAccess(order, actor);
      if (paymentIntent.status === 'succeeded') {
        const amount =
          paymentIntent.amount_received != null
            ? paymentIntent.amount_received / 100
            : order.total_amount;
        await this.handlePaymentSuccess(order.id, paymentIntent.id, amount);
        return {
          payment_status: 'paid',
          order_id: order.id,
          order_number: order.order_number,
        };
      }
      if (paymentIntent.status === 'processing') {
        return {
          payment_status: 'pending',
          order_id: order.id,
          order_number: order.order_number,
          message: 'Payment is processing. Status will update when Stripe confirms.',
        };
      }
      throw new Error(`Payment is not complete (status: ${paymentIntent.status})`);
    }

    if (meta.checkout_flow !== 'cart') {
      throw new Error('Payment is not linked to a checkout');
    }

    const existingTx = await pool.query(
      'SELECT order_id FROM transactions WHERE stripe_transaction_id = $1',
      [piId]
    );
    if (existingTx.rows.length) {
      const order = await OrderService.getById(existingTx.rows[0].order_id);
      const out = {
        payment_status: 'paid',
        order_id: order.id,
        order_number: order.order_number,
      };
      if (!order.user_id && order.guest_email) {
        out.guest_order_token = createGuestOrderToken(order.id, order.guest_email);
      }
      return out;
    }

    if (paymentIntent.status !== 'succeeded') {
      if (paymentIntent.status === 'processing') {
        return {
          payment_status: 'pending',
          message: 'Payment is processing. Your order will be created when Stripe confirms.',
        };
      }
      throw new Error(`Payment is not complete (status: ${paymentIntent.status})`);
    }

    let shippingAddressRaw;
    try {
      shippingAddressRaw = JSON.parse(meta.shipping_address || '{}');
    } catch {
      throw new Error('Invalid checkout data on payment');
    }
    const shippingAddress = await resolveCheckoutAddress(shippingAddressRaw, PickupStoreService);

    const userId = meta.user_id ? parseInt(meta.user_id, 10) : null;
    const sessionId = meta.session_id || actor.sessionId || null;
    const guestEmail = meta.guest_email || null;

    if (!userId && !sessionId) {
      throw new Error('Checkout session expired. Please try again from your cart.');
    }

    const amount =
      paymentIntent.amount_received != null
        ? paymentIntent.amount_received / 100
        : paymentIntent.amount / 100;

    const { order, guest_order_token } = await OrderService.createOrderFromPaidCheckout(
      userId || null,
      guestEmail,
      shippingAddress,
      sessionId,
      { stripeTransactionId: piId, amount }
    );

    return {
      payment_status: 'paid',
      order_id: order.id,
      order_number: order.order_number,
      guest_order_token: guest_order_token || null,
    };
  }

  /**
   * Create PaymentIntent for client-side confirmation
   * orderRef can be order_id (number) or order_number (string)
   */
  async createPaymentIntent(orderRef, actor = {}) {
    if (!stripe) throw new Error('Stripe is not configured');

    const order = Number.isInteger(Number(orderRef))
      ? await OrderService.getById(Number(orderRef))
      : await OrderService.getOrderByNumber(orderRef);
    if (!order) throw new Error('Order not found');
    this.assertOrderAccess(order, actor);
    if (order.payment_status === 'paid') throw new Error('Order already paid');
    if (order.payment_method === 'pay_on_delivery') throw new Error('This order is pay on delivery');

    const amountInCents = Math.round(parseFloat(order.total_amount) * 100);
    if (amountInCents < 50) throw new Error('Amount too small');

    const { currency: storeCurrency } = await getBrandSettings();
    const stripeCurrency = (storeCurrency || 'usd').toLowerCase();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: stripeCurrency,
      ...CARD_ONLY_INTENT,
      metadata: { order_id: order.id.toString(), order_number: order.order_number },
    });

    return {
      client_secret: paymentIntent.client_secret,
      order_number: order.order_number,
    };
  }

  /**
   * Mark order paid after client-side PaymentIntent confirmation (backup when webhook is delayed/missing).
   */
  async confirmPaymentIntent(orderRef, paymentIntentId, actor = {}) {
    if (!stripe) throw new Error('Stripe is not configured');
    const piId = String(paymentIntentId || '').trim();
    if (!piId) throw new Error('payment_intent_id is required');

    const paymentIntent = await stripe.paymentIntents.retrieve(piId);
    const metaOrderId = parseInt(paymentIntent.metadata?.order_id, 10);

    if (paymentIntent.metadata?.checkout_flow === 'cart' && !metaOrderId) {
      return this.finalizeCheckoutPayment(piId, actor);
    }

    if (!orderRef) {
      throw new Error('order_id or order_number is required');
    }

    const order = Number.isInteger(Number(orderRef))
      ? await OrderService.getById(Number(orderRef))
      : await OrderService.getOrderByNumber(orderRef);
    if (!order) throw new Error('Order not found');
    this.assertOrderAccess(order, actor);

    if (!metaOrderId || metaOrderId !== Number(order.id)) {
      throw new Error('Payment does not match this order');
    }

    if (paymentIntent.status === 'succeeded') {
      const amount =
        paymentIntent.amount_received != null
          ? paymentIntent.amount_received / 100
          : order.total_amount;
      await this.handlePaymentSuccess(order.id, paymentIntent.id, amount);
      return { payment_status: 'paid', order_id: order.id, order_number: order.order_number };
    }

    if (paymentIntent.status === 'processing') {
      return {
        payment_status: 'pending',
        order_id: order.id,
        order_number: order.order_number,
        message: 'Payment is processing. Status will update when Stripe confirms.',
      };
    }

    throw new Error(`Payment is not complete (status: ${paymentIntent.status})`);
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
      const amount = pi.amount_received / 100;
      const orderId = parseInt(pi.metadata?.order_id, 10);
      if (orderId) {
        await this.handlePaymentSuccess(orderId, pi.id, amount);
      } else if (pi.metadata?.checkout_flow === 'cart') {
        try {
          await this.finalizeCheckoutPayment(pi.id, {
            sessionId: pi.metadata?.session_id || null,
          });
        } catch (err) {
          console.error('[Payment] Webhook checkout finalize failed:', err.message);
        }
      }
    }

    return { received: true };
  }
}

module.exports = new PaymentService();
