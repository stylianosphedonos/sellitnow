const nodemailer = require('nodemailer');
const config = require('../config');

function brandName() {
  return config.email.businessName || '3nityLab';
}
const { pool } = require('../database/db');
const OrderEmailLogService = require('./OrderEmailLogService');
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

  async send({ to, subject, html, text, replyTo, attachments }) {
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
        attachments: attachments || undefined,
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
    const subject = `${brandName()} - test email`;
    const safeFrom = escapeHtml(from);
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;line-height:1.6;color:#111">
        <p style="font-size:17px;font-weight:600;margin:0 0 12px">Test email</p>
        <p style="margin:0 0 12px">If you are reading this, your store’s <strong>outbound email</strong> is working.</p>
        <p style="margin:0 0 8px;font-size:14px;color:#444"><strong>From (configured):</strong> ${safeFrom}</p>
        <p style="margin:0;font-size:14px;color:#444"><strong>To:</strong> ${escapeHtml(addr)}</p>
        <p style="margin:20px 0 0;font-size:13px;color:#666">This message was sent from the ${escapeHtml(brandName())} admin Send test email action.</p>
      </div>
    `;
    const text = [
      `${brandName()} test email`,
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
      subject: `Welcome to ${brandName()}`,
      html: `<p>Hi ${user.first_name},</p><p>Thanks for registering with ${escapeHtml(brandName())}. Your account is ready.</p><p>Happy shopping!</p>`,
    });
  }

  async sendVerification(user, verificationUrl) {
    return this.send({
      to: user.email,
      subject: `Verify your ${brandName()} email`,
      html: `<p>Hi ${user.first_name},</p><p>Please verify your email by clicking: <a href="${verificationUrl}">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
    });
  }

  async sendPasswordReset(user, resetUrl) {
    return this.send({
      to: user.email,
      subject: `Reset your ${brandName()} password`,
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
   * Build payment receipt draft (does not send).
   * @param {{ stripeTransactionId?: string, amountPaid?: number }} payment
   */
  async buildPaymentReceiptDraft(order, items, payment = {}) {
    const to = this.resolveCustomerTo(order);
    if (!to) return null;

    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);
    const businessName = brandName();
    const supportEmail = config.email.supportEmail || 'support@3nitylab.com';
    const customerEmail = order.guest_email || order.user_email || to;
    const addr = this.parseShippingAddress(order);
    const itemsRows = await this.buildOrderItemsTableHtml(items);
    const paidAt = new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
    const stripeId = payment.stripeTransactionId
      ? escapeHtml(String(payment.stripeTransactionId))
      : '—';
    const isPaid = order.payment_status === 'paid';
    const amountPaid =
      payment.amountPaid != null && Number.isFinite(Number(payment.amountPaid))
        ? fmt(payment.amountPaid)
        : fmt(order.total_amount);

    const phoneRow = addr.phone
      ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;width:38%">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(addr.phone)}</td></tr>`
      : '';

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#111">
        <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);color:#fff;padding:28px 24px;border-radius:12px 12px 0 0">
          <p style="margin:0 0 6px;font-size:13px;opacity:0.9;text-transform:uppercase;letter-spacing:0.06em">${isPaid ? 'Payment receipt' : 'Order confirmation'}</p>
          <p style="margin:0;font-size:22px;font-weight:700">${escapeHtml(businessName)}</p>
          <p style="margin:10px 0 0;font-size:15px;opacity:0.95">${isPaid ? 'Thank you — your payment was successful.' : 'Thank you for your order.'}</p>
        </div>

        <div style="background:#fff;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 12px 12px;padding:24px">
          <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
            <tr>
              <td style="padding:16px;background:${isPaid ? '#f0fdf4' : '#fffbeb'};border:1px solid ${isPaid ? '#bbf7d0' : '#fcd34d'};border-radius:8px" colspan="2">
                <p style="margin:0 0 4px;font-size:13px;color:${isPaid ? '#166534' : '#b45309'};text-transform:uppercase;letter-spacing:0.04em">${isPaid ? 'Amount paid' : 'Order total'}</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:${isPaid ? '#15803d' : '#b45309'}">${amountPaid}</p>
                <p style="margin:8px 0 0;font-size:13px;color:${isPaid ? '#166534' : '#b45309'}">${isPaid ? `Paid on ${escapeHtml(paidAt)} · Card (online)` : `Payment: ${escapeHtml(order.payment_status || 'pending')}`}</p>
              </td>
            </tr>
          </table>

          <p style="font-size:15px;font-weight:600;margin:0 0 12px;color:#333">Receipt details</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;background:#fafafa;border-radius:8px;overflow:hidden">
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555;width:40%">Receipt / order #</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(order.order_number)}</td></tr>
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555">Order ID</td><td style="padding:10px 14px;border-bottom:1px solid #eee">${order.id}</td></tr>
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555">Transaction reference</td><td style="padding:10px 14px;border-bottom:1px solid #eee;font-family:ui-monospace,monospace;font-size:13px">${stripeId}</td></tr>
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555">Payment status</td><td style="padding:10px 14px;border-bottom:1px solid #eee"><span style="color:${isPaid ? '#15803d' : '#b45309'};font-weight:600">${escapeHtml(isPaid ? 'Paid' : order.payment_status || 'pending')}</span></td></tr>
            <tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#555">Order status</td><td style="padding:10px 14px;border-bottom:1px solid #eee">${escapeHtml(order.status || 'processing')}</td></tr>
            <tr><td style="padding:10px 14px;color:#555">Customer email</td><td style="padding:10px 14px"><a href="mailto:${escapeHtml(customerEmail)}" style="color:#1e40af">${escapeHtml(customerEmail)}</a></td></tr>
          </table>

          <p style="font-size:15px;font-weight:600;margin:0 0 10px;color:#333">Ship to</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
            <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;width:38%;vertical-align:top">Address</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${this.formatShippingAddressHtml(addr)}</td></tr>
            ${phoneRow}
          </table>

          <p style="font-size:15px;font-weight:600;margin:0 0 12px;color:#333">Items purchased</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
            <thead><tr style="background:#f0f0f0"><th style="text-align:left;padding:10px 12px">Product</th><th style="padding:10px 12px">Qty</th><th style="text-align:right;padding:10px 12px">Unit</th><th style="text-align:right;padding:10px 12px">Line total</th></tr></thead>
            <tbody>${itemsRows}</tbody>
          </table>

          <table style="width:100%;max-width:320px;margin-left:auto;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:6px 8px;color:#555">Subtotal</td><td style="padding:6px 8px;text-align:right">${fmt(order.subtotal)}</td></tr>
            <tr><td style="padding:6px 8px;color:#555">Tax (VAT)</td><td style="padding:6px 8px;text-align:right">${fmt(order.tax_amount)}</td></tr>
            <tr><td style="padding:6px 8px;color:#555">Shipping</td><td style="padding:6px 8px;text-align:right">${fmt(order.shipping_cost)}</td></tr>
            <tr><td style="padding:10px 8px 6px;font-weight:700;border-top:2px solid #111">${isPaid ? 'Total charged' : 'Order total'}</td><td style="padding:10px 8px 6px;text-align:right;font-weight:700;border-top:2px solid #111">${fmt(order.total_amount)}</td></tr>
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

    const subject = isPaid
      ? `Payment receipt — Order #${order.order_number}`
      : `Order confirmation — #${order.order_number}`;

    const text = [
      `${businessName} — ${isPaid ? 'Payment receipt' : 'Order confirmation'}`,
      '',
      `Order: ${order.order_number}`,
      isPaid ? `Amount paid: ${amountPaid}` : `Order total: ${amountPaid}`,
      isPaid ? `Paid: ${paidAt}` : `Payment status: ${order.payment_status || 'pending'}`,
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

    return { to, subject, html, text, replyTo: supportEmail };
  }

  /**
   * Payment receipt sent automatically when card payment succeeds (Stripe webhook / confirm).
   */
  async sendPaymentReceipt(order, items, payment = {}, options = {}) {
    const draft = await this.buildPaymentReceiptDraft(order, items, payment);
    if (!draft) {
      console.log('[Email] No customer address for payment receipt:', order.order_number);
      return { success: false, error: 'No customer email on this order.' };
    }
    const label =
      order.payment_status === 'paid' ? 'Payment receipt' : 'Order confirmation';
    const emailType =
      order.payment_status === 'paid' ? 'payment_receipt' : 'order_confirmation';
    const result = await this.send(draft);
    if (order?.id) {
      await OrderEmailLogService.append({
        orderId: order.id,
        emailType,
        label,
        recipientTo: draft.to,
        subject: draft.subject,
        success: Boolean(result.success),
        errorMessage: result.error || null,
        source: options.source || 'automatic',
      });
    }
    return result;
  }

  /**
   * Sent when checkout is complete from the customer's perspective:
   * card payment succeeded, or pay-on-delivery order placed.
   */
  /** support@3nitylab.com plus active admin inboxes (deduped). */
  async getSupportNotificationRecipients() {
    const supportEmail = String(config.email.supportEmail || 'support@3nitylab.com')
      .trim()
      .toLowerCase();
    const seen = new Set();
    const recipients = [];

    function add(email) {
      const norm = String(email || '')
        .trim()
        .toLowerCase();
      if (!norm.includes('@') || seen.has(norm)) return;
      seen.add(norm);
      recipients.push(norm);
    }

    add(supportEmail);

    const adminResult = await pool.query(
      `SELECT email FROM users WHERE role = 'admin' AND is_active`
    );
    for (const row of adminResult.rows) add(row.email);

    if (!recipients.length) {
      const fallback = parseFromAddress(await getOutboundEmailFrom());
      if (fallback) add(fallback);
    }

    return recipients;
  }

  async sendOrderReceivedAndProcessing(order, items, options = {}) {
    const to = this.resolveCustomerTo(order);
    if (!to) {
      console.log('[Email] No customer address for order received mail:', order.order_number);
      return { success: false, error: 'No customer email on this order.' };
    }
    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);
    const itemsRows = await this.buildOrderItemsTableHtml(items);
    const storeName = brandName();
    const isPod = order.payment_method === 'pay_on_delivery';
    const isPaid = order.payment_status === 'paid';
    const paymentLabel = isPaid ? 'Paid' : isPod ? 'Pay on delivery' : 'Payment pending';

    let intro;
    let payLine;
    if (isPaid) {
      intro = `<p style="font-size:16px;line-height:1.6;color:#333">Thank you for your purchase. We have received your <strong>order</strong> and your <strong>payment</strong>. Your items are now in our queue to be <strong>processed and prepared</strong> for shipment.</p>`;
      payLine = 'Payment received — we will process your order shortly.';
    } else if (isPod) {
      intro = `<p style="font-size:16px;line-height:1.6;color:#333">Thank you for your order. We have received it and will <strong>process and prepare</strong> your items for shipment. <strong>Payment will be collected on delivery</strong> — please have the agreed amount ready when your parcel arrives.</p>`;
      payLine = 'Pay on delivery — payment is due when your order arrives.';
    } else {
      intro = `<p style="font-size:16px;line-height:1.6;color:#333">Thank you for your order. We have <strong>received order #${escapeHtml(order.order_number)}</strong>. If you have not finished paying yet, please complete card payment on the checkout page. Once payment is confirmed, we will process and prepare your items for shipment.</p>`;
      payLine = 'Payment is pending — complete checkout to confirm your order.';
    }

    const subject = `We received your order #${order.order_number}`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111">
        <p style="font-size:18px;font-weight:600;margin:0 0 8px">We have your order</p>
        ${intro}
        <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px;background:#fafafa;border-radius:8px;overflow:hidden">
          <tr><td style="padding:12px 16px;border-bottom:1px solid #eee"><strong>Order number</strong></td><td style="padding:12px 16px;border-bottom:1px solid #eee">${escapeHtml(order.order_number)}</td></tr>
          <tr><td style="padding:12px 16px;border-bottom:1px solid #eee"><strong>Payment</strong></td><td style="padding:12px 16px;border-bottom:1px solid #eee">${escapeHtml(paymentLabel)}</td></tr>
          <tr><td style="padding:12px 16px"><strong>Order total</strong></td><td style="padding:12px 16px">${fmt(order.total_amount)}</td></tr>
        </table>
        <p style="font-size:15px;margin:8px 0 12px;font-weight:600">Items</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px">
          <thead><tr style="background:#f0f0f0"><th style="text-align:left;padding:10px 12px">Product</th><th style="padding:10px 12px">Qty</th><th style="text-align:right;padding:10px 12px">Price</th><th style="text-align:right;padding:10px 12px">Total</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <p style="font-size:14px;line-height:1.6;color:#444">If you have any questions, simply reply to this email and our team will help you.</p>
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:16px">Thank you for shopping with us,<br><span style="color:#666">${escapeHtml(storeName)}</span></p>
      </div>
    `;

    const text = `We have your order #${order.order_number}. Total: ${fmt(order.total_amount)}. ${payLine} Thank you for shopping with ${storeName}.`;

    const result = await this.send({ to, subject, html, text });
    if (order?.id) {
      await OrderEmailLogService.append({
        orderId: order.id,
        emailType: 'order_received',
        label: 'Order received (customer)',
        recipientTo: to,
        subject,
        success: Boolean(result.success),
        errorMessage: result.error || null,
        source: options.source || 'order_created',
      });
    }
    return result;
  }

  storeBaseUrl() {
    return String(config.apiBaseUrl || '').replace(/\/$/, '') || 'http://localhost:3000';
  }

  /**
   * Remind customer to complete payment for an unpaid order.
   */
  async buildPaymentReminderDraft(order, items = []) {
    const to = this.resolveCustomerTo(order);
    if (!to) return null;
    if (order.payment_status === 'paid') return null;

    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);
    const itemsRows = await this.buildOrderItemsTableHtml(items);
    const storeName = brandName();
    const storeUrl = this.storeBaseUrl();
    const supportEmail = config.email.supportEmail || 'support@3nitylab.com';
    const on = escapeHtml(order.order_number);

    const subject = `Payment reminder — order #${order.order_number}`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111">
        <p style="font-size:18px;font-weight:600;margin:0 0 8px">Complete your payment</p>
        <p style="font-size:16px;line-height:1.6;color:#333">This is a friendly reminder that we are still waiting for payment on order <strong>#${on}</strong> (total <strong>${fmt(order.total_amount)}</strong>).</p>
        <p style="font-size:15px;line-height:1.6;color:#444">If you were interrupted during checkout, please return to our store and place your order again, or reply to this email and we will help you complete payment.</p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px;background:#fafafa;border-radius:8px;overflow:hidden">
          <tr><td style="padding:12px 16px;border-bottom:1px solid #eee"><strong>Order number</strong></td><td style="padding:12px 16px;border-bottom:1px solid #eee">${on}</td></tr>
          <tr><td style="padding:12px 16px"><strong>Amount due</strong></td><td style="padding:12px 16px">${fmt(order.total_amount)}</td></tr>
        </table>
        <p style="font-size:15px;margin:8px 0 12px;font-weight:600">Items</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px">
          <thead><tr style="background:#f0f0f0"><th style="text-align:left;padding:10px 12px">Product</th><th style="padding:10px 12px">Qty</th><th style="text-align:right;padding:10px 12px">Total</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px"><a href="${escapeHtml(storeUrl)}" style="color:#ee4d2d;font-weight:600">Visit ${escapeHtml(storeName)}</a></p>
        <p style="font-size:14px;line-height:1.6;color:#444">Questions? Reply to this email or contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>.</p>
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:16px">Thank you,<br><span style="color:#666">${escapeHtml(storeName)}</span></p>
      </div>
    `;

    const text = [
      `Payment reminder for order #${order.order_number}.`,
      `Amount due: ${fmt(order.total_amount)}.`,
      `Visit ${storeUrl} or contact ${supportEmail} if you need help.`,
      `— ${storeName}`,
    ].join('\n');

    return { to, subject, html, text };
  }

  async sendPaymentReminder(order, items = [], options = {}) {
    const draft = await this.buildPaymentReminderDraft(order, items);
    if (!draft) {
      if (order.payment_status === 'paid') {
        return { success: false, error: 'This order is already paid.' };
      }
      return { success: false, error: 'No customer email on this order.' };
    }
    const result = await this.send(draft);
    if (order?.id) {
      await OrderEmailLogService.append({
        orderId: order.id,
        emailType: 'payment_reminder',
        label: 'Payment reminder',
        recipientTo: draft.to,
        subject: draft.subject,
        success: Boolean(result.success),
        errorMessage: result.error || null,
        source: options.source || 'admin_manual',
      });
    }
    return result;
  }

  /**
   * Customer notice when an unpaid order is auto-cancelled after the expiry window.
   */
  async buildUnpaidOrderCancelledDraft(order, { expiryDays = 3 } = {}) {
    const to = this.resolveCustomerTo(order);
    if (!to) return null;

    const { currency } = await getBrandSettings();
    const fmt = (a) => formatMoney(a, currency);
    const storeName = brandName();
    const supportEmail = config.email.supportEmail || 'support@3nitylab.com';
    const on = escapeHtml(order.order_number);
    const days = Number(expiryDays) || 3;

    const subject = `Order #${order.order_number} cancelled — payment not received`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <p style="font-size:18px;font-weight:600;margin:0 0 8px">Order cancelled</p>
        <p style="font-size:16px;line-height:1.6;color:#333">Your order <strong>#${on}</strong> has been <strong>cancelled</strong> because we did not receive payment within <strong>${days} days</strong>.</p>
        <p style="font-size:15px;line-height:1.6;color:#444">Order total was ${fmt(order.total_amount)}. No charge was completed for this order.</p>
        <p style="font-size:15px;line-height:1.6;color:#444">If you still wish to purchase these items, you are welcome to place a new order on our website.</p>
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:24px">If you believe this is a mistake or you already paid, please reply to this email or contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a> with your order number.</p>
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:16px">Thank you,<br><span style="color:#666">${escapeHtml(storeName)}</span></p>
      </div>
    `;

    const text = [
      `Order #${order.order_number} was cancelled because payment was not received within ${days} days.`,
      `Order total: ${fmt(order.total_amount)}. No payment was completed.`,
      `Contact ${supportEmail} if you have questions.`,
      `— ${storeName}`,
    ].join('\n');

    return { to, subject, html, text };
  }

  async sendUnpaidOrderCancelled(order, options = {}) {
    const draft = await this.buildUnpaidOrderCancelledDraft(order, {
      expiryDays: options.expiryDays,
    });
    if (!draft) {
      console.log('[Email] No customer address for unpaid cancel mail:', order.order_number);
      return { success: false, error: 'No customer email on this order.' };
    }
    const result = await this.send(draft);
    if (order?.id) {
      await OrderEmailLogService.append({
        orderId: order.id,
        emailType: 'unpaid_cancelled',
        label: 'Order cancelled (unpaid)',
        recipientTo: draft.to,
        subject: draft.subject,
        success: Boolean(result.success),
        errorMessage: result.error || null,
        source: options.source || 'auto_expiry',
      });
    }
    return result;
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
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:24px">Thank you,<br><span style="color:#666">${escapeHtml(brandName())}</span></p>
      </div>
    `;

    return { to, subject, html, text: bodyText };
  }

  async sendDraft(draft, logContext = null) {
    if (!draft?.to || !draft.subject) return { success: false, error: 'Invalid draft' };
    const result = await this.send({
      to: draft.to,
      subject: draft.subject,
      html: draft.html,
      text: draft.text,
    });
    if (logContext?.orderId) {
      await OrderEmailLogService.append({
        orderId: logContext.orderId,
        emailType: logContext.emailType || 'status_update',
        label: logContext.label || 'Status update email',
        recipientTo: draft.to,
        subject: draft.subject,
        success: Boolean(result.success),
        errorMessage: result.error || null,
        source: logContext.source || 'admin_manual',
      });
    }
    return result;
  }

  /**
   * Internal notification to support@3nitylab.com (and active admins) for fulfillment.
   * @param {object} order — row from orders (+ user_email when present)
   * @param {object[]} items — order_items rows
   */
  async sendAdminNewOrder(order, items = []) {
    const recipients = await this.getSupportNotificationRecipients();
    if (!recipients.length) {
      console.log('[Email] No support recipients for new order notification:', order.order_number);
      return { success: false, error: 'No support email configured.' };
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

    const subject = `[3nityLab] New order #${order.order_number}`;
    let anySuccess = false;
    let lastError = null;
    for (const to of recipients) {
      const recipient = String(to).trim();
      const sendResult = await this.send({ to: recipient, subject, html });
      if (sendResult.success) anySuccess = true;
      else lastError = sendResult.error || lastError;
      if (order?.id) {
        await OrderEmailLogService.append({
          orderId: order.id,
          emailType: 'support_new_order',
          label: 'Support new-order notification',
          recipientTo: recipient,
          subject,
          success: Boolean(sendResult.success),
          errorMessage: sendResult.error || null,
          source: 'order_created',
        });
      }
    }
    return anySuccess
      ? { success: true }
      : { success: false, error: lastError || 'Could not send support notification.' };
  }

  async sendCategoryRequest({ category, customerName, customerEmail, message, photoFile }) {
    const recipients = await this.getSupportNotificationRecipients();
    if (!recipients.length) {
      return { success: false, error: 'No support email configured.' };
    }

    const storeName = brandName();
    const categoryName = escapeHtml(category.name || 'Category');
    const name = escapeHtml(customerName || 'Customer');
    const email = escapeHtml(customerEmail || '');
    const bodyText = String(message || '').trim();
    const bodyHtml = escapeHtml(bodyText).replace(/\n/g, '<br>');
    const subject = `Product request: ${category.name || 'Category'}`;

    const html = `
      <h2>Product request from ${storeName}</h2>
      <p><strong>Category:</strong> ${categoryName}</p>
      <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
      <p><strong>Message:</strong></p>
      <p>${bodyHtml || '(no message)'}</p>
      ${photoFile ? '<p><em>Photo attached.</em></p>' : ''}
    `;

    const text = [
      `Product request from ${storeName}`,
      `Category: ${category.name || 'Category'}`,
      `From: ${customerName || 'Customer'} <${customerEmail || ''}>`,
      '',
      bodyText || '(no message)',
      photoFile ? '\n(Photo attached.)' : '',
    ].join('\n');

    const attachments = [];
    if (photoFile && photoFile.buffer) {
      attachments.push({
        filename: photoFile.originalname || 'request-photo.jpg',
        content: photoFile.buffer,
        contentType: photoFile.mimetype,
      });
    }

    let lastError = null;
    let anySuccess = false;
    for (const to of recipients) {
      const result = await this.send({
        to,
        subject,
        html,
        text,
        replyTo: customerEmail,
        attachments: attachments.length ? attachments : undefined,
      });
      if (result.success) anySuccess = true;
      else lastError = result.error;
    }

    return anySuccess
      ? { success: true }
      : { success: false, error: lastError || 'Could not send request email.' };
  }
}

module.exports = new EmailService();
