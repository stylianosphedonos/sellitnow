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
    const itemCount =
      cart.item_count ||
      (cart.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const shippingIsFree =
      cart.shipping_is_free === true ||
      itemCount >= (Number(cart.free_delivery_min_items) || 10);
    const shippingValue = shippingIsFree
      ? tr('cart.shippingFree')
      : money(cart.shipping_estimate);
    const discountRow =
      cart.voucher_code && Number(cart.discount_amount) > 0
        ? `<div class="order-review__row"><span>${escapeHtml(
            tr('cart.discount', { code: cart.voucher_code, percent: cart.discount_percent })
          )}</span><span>−${money(cart.discount_amount)}</span></div>`
        : '';
    const voucherBlock = cart.voucher_code
      ? `<div class="order-review__voucher order-review__voucher--applied">
          <span>${escapeHtml(
            tr('cart.voucherApplied', { code: cart.voucher_code, percent: cart.discount_percent })
          )}</span>
          <button type="button" class="order-review__voucher-remove" data-remove-voucher>${escapeHtml(
            tr('cart.voucherRemove')
          )}</button>
        </div>`
      : `<form class="order-review__voucher" data-apply-voucher>
          <label for="checkoutVoucherCode">${escapeHtml(tr('cart.voucherLabel'))}</label>
          <div class="order-review__voucher-row">
            <input type="text" id="checkoutVoucherCode" name="voucher_code" maxlength="40" autocomplete="off" placeholder="${escapeHtml(
              tr('cart.voucherPlaceholder')
            )}">
            <button type="submit" class="btn btn-sm">${escapeHtml(tr('cart.voucherApply'))}</button>
          </div>
          <p class="order-review__voucher-error" data-voucher-error hidden></p>
        </form>`;
    return `
      <div class="order-review__footer">
        <div class="order-review__row"><span>${escapeHtml(tr('cart.subtotal'))}</span><span>${money(cart.subtotal)}</span></div>
        ${discountRow}
        <div class="order-review__row"><span>${escapeHtml(tr('review.estTax'))}</span><span>${money(cart.tax_amount)}</span></div>
        <div class="order-review__row"><span>${escapeHtml(tr('review.pickup'))}</span><span>${escapeHtml(shippingValue)}</span></div>
        <div class="order-review__row order-review__row--total"><span>${escapeHtml(tr('cart.total'))}</span><span>${money(cart.total)}</span></div>
        ${voucherBlock}
        <p class="order-review__shipping-note">${escapeHtml(tr('cart.freeDeliveryNote'))}</p>
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

  global.bindOrderReviewVoucherControls = function bindOrderReviewVoucherControls(root, onChanged) {
    const host = root || document;
    const form = host.querySelector('[data-apply-voucher]');
    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const errEl = form.querySelector('[data-voucher-error]');
        const code = (input?.value || '').trim();
        if (errEl) {
          errEl.hidden = true;
          errEl.textContent = '';
        }
        if (!code) {
          if (errEl) {
            errEl.textContent = tr('cart.voucherRequired');
            errEl.hidden = false;
          }
          return;
        }
        try {
          const guestEmail = document.getElementById('guestEmail')?.value?.trim() || null;
          await global.callApi('/cart/voucher', {
            method: 'POST',
            body: JSON.stringify({ code, guest_email: guestEmail }),
          });
          if (typeof onChanged === 'function') onChanged();
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || tr('cart.voucherInvalid');
            errEl.hidden = false;
          }
        }
      });
    }
    const removeBtn = host.querySelector('[data-remove-voucher]');
    if (removeBtn && removeBtn.dataset.bound !== '1') {
      removeBtn.dataset.bound = '1';
      removeBtn.addEventListener('click', async () => {
        try {
          await global.callApi('/cart/voucher', { method: 'DELETE' });
          if (typeof onChanged === 'function') onChanged();
        } catch (err) {
          alert(err.message);
        }
      });
    }
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
