const nodemailer = require('nodemailer');
const config = require('../config');
const { pool } = require('../database/db');
const { getBrandSettings } = require('../routes/brand');
const { formatMoney } = require('../lib/formatMoney');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseFromAddress(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  const raw = (m ? m[1] : from || '').trim();
  return raw.includes('@') ? raw : null;
}

class EmailService {
  constructor() {
    this.transporter = config.email.host
      ? nodemailer.createTransport({
          host: config.email.host,
          port: config.email.port,
          secure: config.email.secure,
          auth: {
            user: config.email.user,
            pass: config.email.pass,
          },
        })
      : null;
  }

  async send({ to, subject, html, text }) {
    if (!this.transporter) {
      console.log('[Email] (no SMTP configured) Would send:', { to, subject });
      return { success: true };
    }

    try {
      await this.transporter.sendMail({
        from: config.email.from,
        to,
        subject,
        html: html || text,
        text,
      });
      return { success: true };
    } catch (err) {
      console.error('Email send error:', err);
      return { success: false, error: err.message };
    }
  }

  async sendWelcome(user) {
    return this.send({
      to: user.email,
      subject: 'Welcome to Sellitnow',
      html: `<p>Hi ${user.first_name},</p><p>Thanks for registering with Sellitnow. Your account is ready.</p><p>Happy shopping!</p>`,
    });
  }

  async sendVerification(user, verificationUrl) {
    return this.send({
      to: user.email,
      subject: 'Verify your Sellitnow email',
      html: `<p>Hi ${user.first_name},</p><p>Please verify your email by clicking: <a href="${verificationUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
    });
  }

  async sendPasswordReset(user, resetUrl) {
    return this.send({
      to: user.email,
      subject: 'Reset your Sellitnow password',
      html: `<p>Hi ${user.first_name},</p><p>Reset your password: <a href="${resetUrl}">Reset Password</a></p><p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
    });
  }

  async sendOrderConfirmation(order, items) {
    const email = order.guest_email || (order.user_email || '');
    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);
    const stockNote =
      order.stock_warning
        ? `<p style="color:#b45309;background:#fffbeb;padding:12px;border-radius:6px;border:1px solid #fcd34d"><strong>Stock notice:</strong> ${String(order.stock_warning)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</p>`
        : '';
    const payOnDeliveryNote =
      order.payment_method === 'pay_on_delivery'
        ? '<p><strong>Payment:</strong> Pay on delivery — please have the exact amount or agreed payment method ready when your order arrives.</p>'
        : '';
    const itemsList = items
      .map((i) => {
        let snap = i.product_snapshot;
        try {
          snap = typeof snap === 'string' ? JSON.parse(snap) : snap;
        } catch {
          snap = {};
        }
        const variant =
          snap?.color || snap?.size
            ? ` <small>(${[snap.color, snap.size].filter(Boolean).join(' · ')})</small>`
            : '';
        return `<tr><td>${snap?.title || 'Item'}${variant}</td><td>${i.quantity}</td><td>${fmt(i.unit_price)}</td><td>${fmt(i.total_price)}</td></tr>`;
      })
      .join('');
    return this.send({
      to: email,
      subject: `Order Confirmation #${order.order_number}`,
      html: `
        <h2>Order Confirmation</h2>
        <p>Order Number: <strong>${order.order_number}</strong></p>
        <p>Total: ${fmt(order.total_amount)}</p>
        ${payOnDeliveryNote}
        ${stockNote}
        <table border="1" cellpadding="8">
          <tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>
          ${itemsList}
        </table>
        <p>Thank you for your order!</p>
      `,
    });
  }

  async sendOrderShipped(order, trackingNumber) {
    const email = order.guest_email || (order.user_email || '');
    return this.send({
      to: email,
      subject: `Your order #${order.order_number} has shipped`,
      html: `
        <p>Your order <strong>#${order.order_number}</strong> has been shipped.</p>
        ${trackingNumber ? `<p>Tracking number: <strong>${trackingNumber}</strong></p>` : ''}
        <p>Thank you for shopping with Sellitnow!</p>
      `,
    });
  }

  async sendOrderDelivered(order) {
    const email = order.guest_email || (order.user_email || '');
    return this.send({
      to: email,
      subject: `Your order #${order.order_number} has been delivered`,
      html: `<p>Your order <strong>#${order.order_number}</strong> has been delivered. We hope you enjoy your purchase!</p>`,
    });
  }

  /**
   * Notify every active admin user; falls back to EMAIL_FROM address if none exist.
   * @param {object} order — row from orders (+ user_email when present)
   * @param {object[]} items — order_items rows
   */
  async sendAdminNewOrder(order, items = []) {
    const adminResult = await pool.query(
      `SELECT email FROM users WHERE role = 'admin' AND is_active`
    );
    let recipients = adminResult.rows.map((r) => r.email).filter((e) => e && String(e).trim().includes('@'));
    if (!recipients.length) {
      const fallback = parseFromAddress(config.email.from);
      if (fallback) recipients = [fallback];
      else {
        console.log('[Email] No admin recipients for new order notification:', order.order_number);
        return { success: true };
      }
    }

    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);

    let addr = order.shipping_address;
    try {
      addr = typeof addr === 'string' ? JSON.parse(addr) : addr;
    } catch {
      addr = {};
    }
    const phoneLine = addr.phone ? `<tr><td style="padding:4px 0;color:#444"><strong>Phone</strong></td><td style="padding:4px 0">${escapeHtml(addr.phone)}</td></tr>` : '';

    const customerEmail = order.guest_email || order.user_email || '—';
    const payMethod =
      order.payment_method === 'pay_on_delivery' ? 'Pay on delivery' : 'Card (online)';
    const adminOrderUrl = `${String(config.apiBaseUrl || '').replace(/\/$/, '')}/admin/order.html?id=${order.id}`;

    const stockBlock = order.stock_warning
      ? `<p style="color:#b45309;background:#fffbeb;padding:12px;border-radius:6px;border:1px solid #fcd34d;margin:16px 0"><strong>Stock notice:</strong> ${escapeHtml(order.stock_warning)}</p>`
      : '';

    const itemsRows = (items || [])
      .map((i) => {
        let snap = i.product_snapshot;
        try {
          snap = typeof snap === 'string' ? JSON.parse(snap) : snap;
        } catch {
          snap = {};
        }
        const variant =
          snap?.color || snap?.size ? ` (${[snap.color, snap.size].filter(Boolean).join(' · ')})` : '';
        const sku = snap?.sku ? `<br><small style="color:#666">SKU ${escapeHtml(snap.sku)}</small>` : '';
        const title = escapeHtml(snap?.title || 'Item');
        return `<tr><td style="padding:10px 8px;border-bottom:1px solid #eee">${title}${variant}${sku}</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(i.unit_price)}</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(i.total_price)}</td></tr>`;
      })
      .join('');

    const placedAt =
      order.created_at != null
        ? new Date(order.created_at).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '—';

    const html = `
      <h2 style="margin:0 0 12px">New order placed</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#333">Order <strong>#${escapeHtml(order.order_number)}</strong> (ID ${order.id}) · ${escapeHtml(placedAt)}</p>
      <p style="margin:0 0 20px"><a href="${escapeHtml(adminOrderUrl)}">Open order in admin</a></p>

      <table style="width:100%;max-width:560px;border-collapse:collapse;margin-bottom:20px;font-size:14px">
        <tr><td style="padding:4px 0;width:140px;color:#444"><strong>Customer email</strong></td><td style="padding:4px 0">${escapeHtml(customerEmail)}</td></tr>
        <tr><td style="padding:4px 0;color:#444"><strong>Order status</strong></td><td style="padding:4px 0">${escapeHtml(order.status || '—')}</td></tr>
        <tr><td style="padding:4px 0;color:#444"><strong>Payment</strong></td><td style="padding:4px 0">${escapeHtml(payMethod)} · ${escapeHtml(order.payment_status || '—')}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px;font-size:15px">Shipping</h3>
      <table style="width:100%;max-width:560px;border-collapse:collapse;margin-bottom:8px;font-size:14px">
        <tr><td style="padding:4px 0;width:140px;color:#444;vertical-align:top"><strong>Address</strong></td><td style="padding:4px 0">${escapeHtml(addr.address_line1 || '—')}<br>${escapeHtml([addr.city, addr.postal_code].filter(Boolean).join(' '))} ${escapeHtml(addr.country || '')}</td></tr>
        ${phoneLine}
      </table>

      ${stockBlock}

      <h3 style="margin:24px 0 8px;font-size:15px">Line items</h3>
      <table style="width:100%;max-width:640px;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f5f5f5"><th style="text-align:left;padding:10px 8px">Product</th><th style="padding:10px 8px">Qty</th><th style="text-align:right;padding:10px 8px">Price</th><th style="text-align:right;padding:10px 8px">Total</th></tr></thead>
        <tbody>${itemsRows || '<tr><td colspan="4">No items</td></tr>'}</tbody>
      </table>

      <table style="margin-top:16px;font-size:14px;max-width:320px;margin-left:auto">
        <tr><td style="padding:4px 8px">Subtotal</td><td style="padding:4px 8px;text-align:right">${fmt(order.subtotal)}</td></tr>
        <tr><td style="padding:4px 8px">Tax (VAT)</td><td style="padding:4px 8px;text-align:right">${fmt(order.tax_amount)}</td></tr>
        <tr><td style="padding:4px 8px">Shipping</td><td style="padding:4px 8px;text-align:right">${fmt(order.shipping_cost)}</td></tr>
        <tr><td style="padding:8px 8px 4px;font-weight:700;border-top:1px solid #ddd">Total</td><td style="padding:8px 8px 4px;text-align:right;font-weight:700;border-top:1px solid #ddd">${fmt(order.total_amount)}</td></tr>
      </table>
    `;

    const subject = `New order #${order.order_number}`;
    for (const to of recipients) {
      await this.send({ to: String(to).trim(), subject, html });
    }
    return { success: true };
  }
}

module.exports = new EmailService();
