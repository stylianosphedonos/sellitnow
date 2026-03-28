(function (global) {
  function money(n) {
    if (typeof global.formatStoreMoney === 'function') return global.formatStoreMoney(n);
    const code = (global.__storeCurrency || 'USD').toString().toUpperCase();
    const num = parseFloat(n);
    if (!Number.isFinite(num)) return '—';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(num);
    } catch {
      return `${code} ${num.toFixed(2)}`;
    }
  }

  function escapeHtml(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function variantsHtml(color, size) {
    const hasC = color && String(color).trim();
    const hasS = size && String(size).trim();
    if (!hasC && !hasS) return '';
    let html = '<dl class="line-item__variants">';
    if (hasC) {
      html += `<div class="line-item__variant-row"><dt>Color</dt><dd>${escapeHtml(String(color).trim())}</dd></div>`;
    }
    if (hasS) {
      html += `<div class="line-item__variant-row"><dt>Size</dt><dd>${escapeHtml(String(size).trim())}</dd></div>`;
    }
    html += '</dl>';
    return html;
  }

  function reviewLine(item) {
    const thumb = item.image_url
      ? `<img class="line-item__img" src="${escapeHtml(item.image_url)}" alt="">`
      : '<div class="line-item__img line-item__img--placeholder">📦</div>';
    const unit = parseFloat(item.price);
    const lineTotal = parseFloat(item.line_total);
    const sku = item.sku
      ? `<p class="line-item__sku"><span class="line-item__sku-label">SKU</span> ${escapeHtml(item.sku)}</p>`
      : '';

    return `
      <div class="order-review__line">
        <div class="line-item__thumb">${thumb}</div>
        <div class="order-review__body">
          <div class="line-item__title">${escapeHtml(item.title)}</div>
          ${sku}
          ${variantsHtml(item.color, item.size)}
          <p class="order-review__qty-meta">Qty <strong>${item.quantity}</strong> × ${money(unit)}</p>
        </div>
        <div class="order-review__line-total">${money(lineTotal)}</div>
      </div>
    `;
  }

  function footerHtml(cart) {
    return `
      <div class="order-review__footer">
        <div class="order-review__row"><span>Subtotal</span><span>${money(cart.subtotal)}</span></div>
        <div class="order-review__row"><span>Est. tax (VAT)</span><span>${money(cart.tax_amount)}</span></div>
        <div class="order-review__row"><span>Shipping estimate</span><span>${money(cart.shipping_estimate)}</span></div>
        <div class="order-review__row order-review__row--total"><span>Total</span><span>${money(cart.total)}</span></div>
      </div>
    `;
  }

  /**
   * Full markup for checkout sidebar (live cart or frozen snapshot).
   */
  global.buildOrderReviewPanel = function buildOrderReviewPanel(cart) {
    if (!cart || !cart.items || cart.items.length === 0) {
      return `
        <div class="order-review">
          <h2 class="order-review__title">Order review</h2>
          <p class="order-review__empty" style="padding:20px;color:var(--text-muted);font-size:14px">
            Your cart is empty. <a href="/cart.html">Return to cart</a> to add items.
          </p>
        </div>
      `;
    }
    const lines = cart.items.map((item) => reviewLine(item)).join('');
    return `
      <div class="order-review">
        <h2 class="order-review__title">Order review</h2>
        <p class="order-review__hint" style="padding:0 20px 12px;margin:0;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border)">
          SKU, color, and size match what will appear on your order.
        </p>
        <div class="order-review__lines">${lines}</div>
        ${footerHtml(cart)}
      </div>
    `;
  };

  global.buildPaymentStepOrderBanner = function (orderNumber, totalAmount) {
    const num = escapeHtml(orderNumber || '');
    const total = parseFloat(totalAmount);
    return `
      <div class="checkout-order-banner">
        <p class="checkout-order-banner__label">Order number</p>
        <p class="checkout-order-banner__number">${num}</p>
        <p class="checkout-order-banner__total">Amount due: <strong>${Number.isFinite(total) ? money(total) : '—'}</strong></p>
      </div>
    `;
  };
})(typeof window !== 'undefined' ? window : globalThis);
