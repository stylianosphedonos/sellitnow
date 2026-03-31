const nodemailer = require('nodemailer');
const config = require('../config');
const { getBrandSettings } = require('../routes/brand');
const { formatMoney } = require('../lib/formatMoney');

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

  async sendAdminNewOrder(order) {
    const { currency } = await getBrandSettings();
    const warn = order.stock_warning
      ? `<p style="color:#b45309"><strong>Stock:</strong> ${String(order.stock_warning)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</p>`
      : '';
    return this.send({
      to: config.email.from,
      subject: `New order #${order.order_number}`,
      html: `<p>New order received: <strong>#${order.order_number}</strong>. Total: ${formatMoney(order.total_amount, currency)}</p>${warn}`,
    });
  }
}

module.exports = new EmailService();
