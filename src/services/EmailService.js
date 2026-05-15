const nodemailer = require('nodemailer');
const config = require('../config');
const { pool } = require('../database/db');
const { getBrandSettings, getOutboundEmailFrom, getEffectiveSmtpConfig } = require('../routes/brand');
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

/** Build Nodemailer transport options from merged env or brand_settings SMTP. */
function buildNodemailerOptions(smtp) {
  if (!smtp || !smtp.host) return null;
  const port = Number(smtp.port) || 587;
  const secure = smtp.secure === true;
  const opts = {
    host: String(smtp.host).trim(),
    port,
    secure,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  };
  const user = smtp.user != null ? String(smtp.user).trim() : '';
  const pass = smtp.pass != null ? String(smtp.pass) : '';
  if (user && pass !== '') {
    opts.auth = { user, pass };
  }
  if (!secure && port === 587) {
    opts.requireTLS = true;
  }
  return opts;
}

function formatSmtpError(err) {
  if (!err) return 'Unknown error';
  const bits = [err.message].filter(Boolean);
  if (err.response) bits.push(String(err.response).trim());
  if (err.code) bits.push(`(${err.code})`);
  return bits.join(' — ');
}

class EmailService {
  constructor() {}

  async send({ to, subject, html, text, replyTo }) {
    const from = await getOutboundEmailFrom();
    const smtp = await getEffectiveSmtpConfig();
    const opts = buildNodemailerOptions(smtp);
    if (!opts) {
      console.log('[Email] (no SMTP configured) Would send:', { from, to, subject });
      return { success: true };
    }

    const transporter = nodemailer.createTransport(opts);
    const resolvedReplyTo = replyTo || config.email.replyTo || config.email.supportEmail;
    try {
      await transporter.sendMail({
        from,
        to,
        replyTo: resolvedReplyTo,
        subject,
        html: html || text,
        text,
      });
      return { success: true };
    } catch (err) {
      console.error('Email send error:', err);
      return { success: false, error: formatSmtpError(err) };
    }
  }

  buildSmtpDiagnostics(smtp) {
    const pass = smtp.pass != null ? String(smtp.pass) : '';
    const user = smtp.user != null ? String(smtp.user).trim() : '';
    return {
      source: smtp.source || 'none',
      host: smtp.host || '',
      port: Number(smtp.port) || 587,
      secure: smtp.secure === true,
      user,
      passLength: pass.length,
      hostConfigured: Boolean(smtp.host),
      credentialsConfigured: Boolean(user && pass !== ''),
    };
  }

  async smtpDiagnostics() {
    const smtp = await getEffectiveSmtpConfig();
    return this.buildSmtpDiagnostics(smtp);
  }

  /**
   * Send a one-off message to verify SMTP and the resolved From address (admin settings).
   * @param {string} to — plain recipient email
   */
  async sendTestOutbound(to) {
    const addr = String(to || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      return { success: false, error: 'Enter a valid recipient email address.' };
    }
    const from = await getOutboundEmailFrom();
    const smtp = await getEffectiveSmtpConfig();
    const diag = this.buildSmtpDiagnostics(smtp);

    if (!smtp.host) {
      return {
        success: false,
        error:
          'No SMTP server is configured. Set SMTP_HOST (and related variables) on your hosting, or enter SMTP under Settings (SMTP server section) and save.',
        from,
        smtp: diag,
      };
    }
    if (!diag.credentialsConfigured) {
      return {
        success: false,
        error:
          'SMTP username and password are required (Microsoft 365: use an app password if MFA is on).',
        from,
        smtp: diag,
      };
    }
    const opts = buildNodemailerOptions(smtp);
    if (!opts.auth) {
      return {
        success: false,
        error: 'SMTP username and password are required for this server.',
        from,
        smtp: diag,
      };
    }
    const transporter = nodemailer.createTransport(opts);
    try {
      await transporter.verify();
    } catch (err) {
      console.error('[Email] SMTP verify failed:', err);
      return {
        success: false,
        error: `SMTP connection or login failed: ${formatSmtpError(err)}`,
        from,
        smtp: diag,
      };
    }
    const subject = 'Sellitnow - test email';
    const safeFrom = escapeHtml(from);
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;line-height:1.6;color:#111">
        <p style="font-size:17px;font-weight:600;margin:0 0 12px">Test email</p>
        <p style="margin:0 0 12px">If you are reading this, your store’s <strong>outbound email</strong> is working.</p>
        <p style="margin:0 0 8px;font-size:14px;color:#444"><strong>From (configured):</strong> ${safeFrom}</p>
        <p style="margin:0;font-size:14px;color:#444"><strong>To:</strong> ${escapeHtml(addr)}</p>
        <p style="margin:20px 0 0;font-size:13px;color:#666">This message was sent from the Sellitnow admin Send test email action.</p>
      </div>
    `;
    const text = [
      'Sellitnow test email',
      '',
      'If you received this, outbound email is working.',
      `From (configured): ${from}`,
      `To: ${addr}`,
    ].join('\n');
    const r = await this.send({ to: addr, subject, html, text });
    const diagAfter = await this.smtpDiagnostics();
    if (!r.success) {
      return {
        success: false,
        error: r.error || 'Send failed',
        from,
        smtp: diagAfter,
      };
    }
    return { success: true, from, to: addr, smtp: diagAfter };
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

  /** Customer-facing address for an order row (+ optional user_email). */
  resolveCustomerTo(order) {
    const to = String(order.guest_email || order.user_email || '').trim();
    return to.includes('@') ? to : null;
  }

  async buildOrderItemsTableHtml(items) {
    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);
    return (items || [])
      .map((i) => {
        let snap = i.product_snapshot;
        try {
          snap = typeof snap === 'string' ? JSON.parse(snap) : snap;
        } catch {
          snap = {};
        }
        const variant =
          snap?.color || snap?.size
            ? ` <span style="color:#666;font-size:13px">(${[snap.color, snap.size].filter(Boolean).join(' · ')})</span>`
            : '';
        const title = escapeHtml(snap?.title || 'Item');
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee">${title}${variant}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(i.unit_price)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(i.total_price)}</td>
        </tr>`;
      })
      .join('');
  }

  parseShippingAddress(order) {
    let addr = order.shipping_address;
    try {
      addr = typeof addr === 'string' ? JSON.parse(addr) : addr;
    } catch {
      addr = {};
    }
    return addr && typeof addr === 'object' ? addr : {};
  }

  formatShippingAddressHtml(addr) {
    const lines = [
      addr.address_line1,
      [addr.city, addr.postal_code].filter(Boolean).join(' '),
      addr.country,
    ].filter(Boolean);
    if (!lines.length) return '—';
    return lines.map((l) => escapeHtml(l)).join('<br>');
  }

  /**
   * Payment receipt sent automatically when card payment succeeds (Stripe webhook / confirm).
   * @param {{ stripeTransactionId: string, amountPaid: number }} payment
   */
  async sendPaymentReceipt(order, items, payment = {}) {
    const to = this.resolveCustomerTo(order);
    if (!to) {
      console.log('[Email] No customer address for payment receipt:', order.order_number);
      return { success: false, error: 'No customer email on this order.' };
    }

    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);
    const businessName = config.email.businessName || '3nity Lab';
    const supportEmail = config.email.supportEmail || 'support@3nitylab.com';
    const customerEmail = order.guest_email || order.user_email || to;
    const addr = this.parseShippingAddress(order);
    const itemsRows = await this.buildOrderItemsTableHtml(items);
    const paidAt = new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
    const stripeId = payment.stripeTransactionId
      ? escapeHtml(String(payment.stripeTransactionId))
      : '—';
    const amountPaid =
      payment.amountPaid != null && Number.isFinite(Number(payment.amountPaid))
        ? fmt(payment.amountPaid)
        : fmt(order.total_amount);

    const stockNote = order.stock_warning
      ? `<p style="color:#b45309;background:#fffbeb;padding:14px 16px;border-radius:8px;border:1px solid #fcd34d;margin:20px 0;line-height:1.5"><strong>Stock notice:</strong> ${escapeHtml(order.stock_warning)}</p>`
      : '';

    const phoneRow = addr.phone
      ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;width:38%">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(addr.phone)}</td></tr>`
      : '';

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#111">
        <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:#fff;padding:28px 24px;border-radius:12px 12px 0 0">
          <p style="margin:0 0 6px;font-size:13px;opacity:0.9;text-transform:uppercase;letter-spacing:0.06em">Payment receipt</p>
          <p style="margin:0;font-size:22px;font-weight:700">${escapeHtml(businessName)}</p>
          <p style="margin:10px 0 0;font-size:15px;opacity:0.95">Thank you — your payment was successful.</p>
        </div>

        <div style="background:#fff;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 12px 12px;padding:24px">
          <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
            <tr>
              <td style="padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px" colspan="2">
                <p style="margin:0 0 4px;font-size:13px;color:#166534;text-transform:uppercase;letter-spacing:0.04em">Amount paid</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:#15803d">${amountPaid}</p>
                <p style="margin:8px 0 0;font-size:13px;color:#166534">Paid on ${escapeHtml(paidAt)} · Card (online)</p>
              </td>
            </tr>
          </table>

          <p style="font-size:15px;font-weight:600;margin:0 0 12px;color:#333">Receipt details</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;background:#fafafa;border-radius:8px;overflow:hidden">
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555;width:40%">Receipt / order #</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(order.order_number)}</td></tr>
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555">Order ID</td><td style="padding:10px 14px;border-bottom:1px solid #eee">${order.id}</td></tr>
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555">Transaction reference</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font-family:ui-monospace,monospace;font-size:13px">${stripeId}</td></tr>
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555">Payment status</td><td style="padding:10px 14px;border-bottom:1px solid #eee"><span style="color:#15803d;font-weight:600">Paid</span></td></tr>
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555">Order status</td><td style="padding:10px 14px;border-bottom:1px solid #eee">${escapeHtml(order.status || 'processing')}</td></tr>
            <tr><td style="padding:10px 14px;color:#555">Customer email</td><td style="padding:10px 14px"><a href="mailto:${escapeHtml(customerEmail)}" style="color:#1e40af">${escapeHtml(customerEmail)}</a></td></tr>
          </table>

          <p style="font-size:15px;font-weight:600;margin:0 0 10px;color:#333">Ship to</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
            <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;width:38%;vertical-align:top">Address</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${this.formatShippingAddressHtml(addr)}</td></tr>
            ${phoneRow}
          </table>

          ${stockNote}

          <p style="font-size:15px;font-weight:600;margin:0 0 12px;color:#333">Items purchased</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
            <thead><tr style="background:#f0f0f0"><th style="text-align:left;padding:10px 12px">Product</th><th style="padding:10px 12px">Qty</th><th style="text-align:right;padding:10px 12px">Unit</th><th style="text-align:right;padding:10px 12px">Line total</th></tr></thead>
            <tbody>${itemsRows}</tbody>
          </table>

          <table style="width:100%;max-width:320px;margin-left:auto;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:6px 8px;color:#555">Subtotal</td><td style="padding:6px 8px;text-align:right">${fmt(order.subtotal)}</td></tr>
            <tr><td style="padding:6px 8px;color:#555">Tax (VAT)</td><td style="padding:6px 8px;text-align:right">${fmt(order.tax_amount)}</td></tr>
            <tr><td style="padding:6px 8px;color:#555">Shipping</td><td style="padding:6px 8px;text-align:right">${fmt(order.shipping_cost)}</td></tr>
            <tr><td style="padding:10px 8px 6px;font-weight:700;border-top:2px solid #111">Total charged</td><td style="padding:10px 8px 6px;text-align:right;font-weight:700;border-top:2px solid #111">${fmt(order.total_amount)}</td></tr>
          </table>

          <p style="font-size:14px;line-height:1.65;color:#444;margin:28px 0 0;padding-top:20px;border-top:1px solid #eee">
            Your order is being processed and prepared for shipment. Keep this email as your payment receipt.
            Questions? Reply to this message or contact us at
            <a href="mailto:${escapeHtml(supportEmail)}" style="color:#1e40af">${escapeHtml(supportEmail)}</a>.
          </p>
          <p style="font-size:14px;color:#666;margin:16px 0 0">Thank you,<br><strong>${escapeHtml(businessName)}</strong></p>
        </div>
      </div>
    `;

    const plainAddr = [addr.address_line1, [addr.city, addr.postal_code].filter(Boolean).join(' '), addr.country]
      .filter(Boolean)
      .join(', ');

    const text = [
      `${businessName} — Payment receipt`,
      '',
      `Order: ${order.order_number}`,
      `Amount paid: ${amountPaid}`,
      `Paid: ${paidAt}`,
      `Transaction: ${payment.stripeTransactionId || '—'}`,
      `Customer email: ${customerEmail}`,
      plainAddr ? `Ship to: ${plainAddr}` : '',
      '',
      `Subtotal: ${fmt(order.subtotal)}`,
      `Tax: ${fmt(order.tax_amount)}`,
      `Shipping: ${fmt(order.shipping_cost)}`,
      `Total: ${fmt(order.total_amount)}`,
      '',
      `Questions: ${supportEmail}`,
    ]
      .filter(Boolean)
      .join('\n');

    return this.send({
      to,
      subject: `Payment receipt — Order #${order.order_number}`,
      html,
      text,
      replyTo: supportEmail,
    });
  }

  /**
   * Sent when checkout is complete from the customer's perspective:
   * card payment succeeded, or pay-on-delivery order placed.
   */
  async sendOrderReceivedAndProcessing(order, items) {
    const to = this.resolveCustomerTo(order);
    if (!to) {
      console.log('[Email] No customer address for order received mail:', order.order_number);
      return { success: true };
    }
    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);
    const itemsRows = await this.buildOrderItemsTableHtml(items);
    const stockNote =
      order.stock_warning
        ? `<p style="color:#b45309;background:#fffbeb;padding:14px 16px;border-radius:8px;border:1px solid #fcd34d;margin:20px 0;line-height:1.5"><strong>Stock notice:</strong> ${escapeHtml(order.stock_warning)}</p>`
        : '';
    const paidOnline = order.payment_method !== 'pay_on_delivery' && order.payment_status === 'paid';
    const intro = paidOnline
      ? `<p style="font-size:16px;line-height:1.6;color:#333">Thank you for your purchase. We have safely received your <strong>payment</strong> and your order is now in our queue to be <strong>processed and prepared</strong> for shipment.</p>`
      : `<p style="font-size:16px;line-height:1.6;color:#333">Thank you for your order. We have received it and will <strong>process and prepare</strong> your items for shipment. <strong>Payment will be collected on delivery</strong> — please have the agreed amount or payment method ready when your parcel arrives.</p>`;

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111">
        <p style="font-size:18px;font-weight:600;margin:0 0 8px">We have your order</p>
        ${intro}
        <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px;background:#fafafa;border-radius:8px;overflow:hidden">
          <tr><td style="padding:12px 16px;border-bottom:1px solid #eee"><strong>Order number</strong></td><td style="padding:12px 16px;border-bottom:1px solid #eee">${escapeHtml(order.order_number)}</td></tr>
          <tr><td style="padding:12px 16px"><strong>Order total</strong></td><td style="padding:12px 16px">${fmt(order.total_amount)}</td></tr>
        </table>
        ${stockNote}
        <p style="font-size:15px;margin:8px 0 12px;font-weight:600">Items</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px">
          <thead><tr style="background:#f0f0f0"><th style="text-align:left;padding:10px 12px">Product</th><th style="padding:10px 12px">Qty</th><th style="text-align:right;padding:10px 12px">Price</th><th style="text-align:right;padding:10px 12px">Total</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <p style="font-size:14px;line-height:1.6;color:#444">If you have any questions, simply reply to this email and our team will help you.</p>
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:16px">Thank you for shopping with us,<br><span style="color:#666">Sellitnow</span></p>
      </div>
    `;

    const payLine = paidOnline
      ? 'Payment received — we will process your order shortly.'
      : 'Pay on delivery — payment is due when your order arrives.';
    const text = `We have your order #${order.order_number}. Total: ${fmt(order.total_amount)}. ${payLine} Thank you for shopping with Sellitnow.`;

    return this.send({
      to,
      subject: `We received your order #${order.order_number}`,
      html,
      text,
    });
  }

  /**
   * Suggested customer email after an admin changes fulfillment status.
   * @returns {null | { to: string, subject: string, html: string, text: string }}
   */
  async buildOrderStatusUpdateDraft(order, { previousStatus, newStatus, trackingNumber } = {}) {
    const to = this.resolveCustomerTo(order);
    if (!to) return null;

    const on = escapeHtml(order.order_number);
    const prev = escapeHtml(String(previousStatus || '—'));
    const next = String(newStatus || '').toLowerCase();
    const track = trackingNumber != null && String(trackingNumber).trim() ? escapeHtml(String(trackingNumber).trim()) : '';

    let subject = `Update on your order #${order.order_number}`;
    let headline = 'Order update';
    let bodyHtml = '';
    let bodyText = '';

    switch (next) {
      case 'pending':
        headline = 'Your order is pending';
        bodyHtml = `<p style="font-size:16px;line-height:1.6">Your order <strong>#${on}</strong> is currently <strong>pending</strong>. We will notify you as soon as it moves to the next step.</p>`;
        bodyText = `Your order #${order.order_number} is pending. We will keep you updated.`;
        break;
      case 'processing':
        subject = `We're preparing order #${order.order_number}`;
        headline = 'We are processing your order';
        bodyHtml = `<p style="font-size:16px;line-height:1.6">Good news — we are now <strong>processing</strong> order <strong>#${on}</strong>. Our team is preparing your items for shipment.</p>`;
        bodyText = `We are processing your order #${order.order_number}.`;
        break;
      case 'shipped':
        subject = `Your order #${order.order_number} is on the way`;
        headline = 'Your order has shipped';
        bodyHtml = `<p style="font-size:16px;line-height:1.6">Order <strong>#${on}</strong> has been <strong>shipped</strong>.</p>${
          track
            ? `<p style="font-size:16px;line-height:1.6">Tracking number: <strong>${track}</strong></p>`
            : '<p style="font-size:15px;line-height:1.6;color:#555">A tracking number was not added to this update. If you need tracking details, reply to this email.</p>'
        }`;
        bodyText = `Order #${order.order_number} has shipped.${track ? ` Tracking: ${trackingNumber}.` : ''}`;
        break;
      case 'delivered':
        subject = `Your order #${order.order_number} has been delivered`;
        headline = 'Delivered';
        bodyHtml = `<p style="font-size:16px;line-height:1.6">Your order <strong>#${on}</strong> is marked as <strong>delivered</strong>. We hope everything looks great — if something is not right, reply to this email and we will help.</p>`;
        bodyText = `Your order #${order.order_number} has been delivered. Thank you!`;
        break;
      case 'cancelled':
        subject = `Order #${order.order_number} has been cancelled`;
        headline = 'Order cancelled';
        bodyHtml = `<p style="font-size:16px;line-height:1.6">Your order <strong>#${on}</strong> has been <strong>cancelled</strong>. If you did not request this or have questions, please reply to this email.</p>`;
        bodyText = `Your order #${order.order_number} has been cancelled. Contact us if you have questions.`;
        break;
      default:
        headline = 'Order status update';
        bodyHtml = `<p style="font-size:16px;line-height:1.6">The status of your order <strong>#${on}</strong> has been updated to <strong>${escapeHtml(next)}</strong>.</p>`;
        bodyText = `Your order #${order.order_number} status is now ${newStatus}.`;
    }

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <p style="font-size:18px;font-weight:600;margin:0 0 8px">${headline}</p>
        <p style="font-size:13px;color:#666;margin:0 0 20px">Previous status: ${prev} → New status: ${escapeHtml(next)}</p>
        ${bodyHtml}
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:24px">Thank you,<br><span style="color:#666">Sellitnow</span></p>
      </div>
    `;

    return { to, subject, html, text: bodyText };
  }

  async sendDraft(draft) {
    if (!draft?.to || !draft.subject) return { success: false, error: 'Invalid draft' };
    return this.send({ to: draft.to, subject: draft.subject, html: draft.html, text: draft.text });
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
      const fallback = parseFromAddress(await getOutboundEmailFrom());
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
