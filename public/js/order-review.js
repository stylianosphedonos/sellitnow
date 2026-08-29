(function (global) {
  function tr(key, vars) {
    return typeof global.t === 'function' ? global.t(key, vars) : key;
  }

  function loc(obj, field) {
    if (typeof global.localizedField === 'function') return global.localizedField(obj, field);
    return (obj && obj[field]) || '';
  }

  function money(n) {
    if (typeof global.formatStoreMoney === 'function') return global.formatStoreMoney(n);
    const code = (global.__storeCurrency || 'USD').toString().toUpperCase();
    const num = parseFloat(n);
    if (!Number.isFinite(num)) return '—';
    try {
      const locale = typeof global.getStoreLang === 'function' && global.getStoreLang() === 'el' ? 'el-CY' : undefined;
      return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(num);
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

  function imgSrc(u) {
    return typeof global.sellitnowResolveMediaUrl === 'function'
      ? global.sellitnowResolveMediaUrl(u)
      : u;
  }

  function variantsHtml(color, size) {
    const hasC = color && String(color).trim();
    const hasS = size && String(size).trim();
    if (!hasC && !hasS) return '';
    const localizeVal = (v) =>
      String(v).trim() === 'Not Specified' ? tr('product.notSpecified') : String(v).trim();
    let html = '<dl class="line-item__variants">';
    if (hasC) {
      html += `<div class="line-item__variant-row"><dt>${escapeHtml(tr('product.color'))}</dt><dd>${escapeHtml(localizeVal(color))}</dd></div>`;
    }
    if (hasS) {
      html += `<div class="line-item__variant-row"><dt>${escapeHtml(tr('product.size'))}</dt><dd>${escapeHtml(localizeVal(size))}</dd></div>`;
    }
    html += '</dl>';
    return html;
  }

  function reviewLine(item) {
    const title = loc(item, 'title');
    const thumb = item.image_url
      ? `<img class="line-item__img" src="${escapeHtml(imgSrc(item.image_url))}" alt="" loading="lazy" decoding="async">`
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
          <div class="line-item__title">${escapeHtml(title)}</div>
          ${sku}
          ${variantsHtml(item.color, item.size)}
          <p class="order-review__qty-meta">${escapeHtml(tr('review.qty'))} <strong>${item.quantity}</strong> × ${money(unit)}</p>
        </div>
        <div class="order-review__line-total">${money(lineTotal)}</div>
      </div>
    `;
  }

  function footerHtml(cart) {
    return `
      <div class="order-review__footer">
        <div class="order-review__row"><span>${escapeHtml(tr('cart.subtotal'))}</span><span>${money(cart.subtotal)}</span></div>
        <div class="order-review__row"><span>${escapeHtml(tr('review.estTax'))}</span><span>${money(cart.tax_amount)}</span></div>
        <div class="order-review__row"><span>${escapeHtml(tr('review.pickup'))}</span><span>${money(cart.shipping_estimate)}</span></div>
        <div class="order-review__row order-review__row--total"><span>${escapeHtml(tr('cart.total'))}</span><span>${money(cart.total)}</span></div>
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
          <h2 class="order-review__title">${escapeHtml(tr('review.title'))}</h2>
          <p class="order-review__empty" style="padding:20px;color:var(--text-muted);font-size:14px">
            ${escapeHtml(tr('review.empty'))} <a href="/cart.html">${escapeHtml(tr('review.returnCart'))}</a>
          </p>
        </div>
      `;
    }
    const lines = cart.items.map((item) => reviewLine(item)).join('');
    return `
      <div class="order-review">
        <h2 class="order-review__title">${escapeHtml(tr('review.title'))}</h2>
        <p class="order-review__hint" style="padding:0 20px 12px;margin:0;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border)">
          ${escapeHtml(tr('review.hint'))}
        </p>
        <div class="order-review__lines">${lines}</div>
        ${footerHtml(cart)}
      </div>
    `;
  };

  global.buildPaymentStepOrderBanner = function (orderNumber, totalAmount) {
    const num = orderNumber
      ? escapeHtml(orderNumber)
      : `<span style="font-weight:500;color:var(--text-muted)">${escapeHtml(tr('review.assignedAfter'))}</span>`;
    const total = parseFloat(totalAmount);
    return `
      <div class="checkout-order-banner">
        <p class="checkout-order-banner__label">${escapeHtml(tr('review.orderNumber'))}</p>
        <p class="checkout-order-banner__number">${num}</p>
        <p class="checkout-order-banner__total">${escapeHtml(tr('review.amountDue'))} <strong>${Number.isFinite(total) ? money(total) : '—'}</strong></p>
      </div>
    `;
  };
})(typeof window !== 'undefined' ? window : globalThis);
