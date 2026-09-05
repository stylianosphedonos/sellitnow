function escapeHtml(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function imgSrc(u) {
  return typeof sellitnowResolveMediaUrl === 'function' ? sellitnowResolveMediaUrl(u) : u;
}

function tr(key, vars) {
  return typeof t === 'function' ? t(key, vars) : key;
}

function loc(obj, field) {
  if (typeof localizedField === 'function') return localizedField(obj, field);
  return (obj && obj[field]) || '';
}

function formatVariantsHtml(color, size) {
  const hasColor = color && String(color).trim();
  const hasSize = size && String(size).trim();
  if (!hasColor && !hasSize) return '';
  const localizeVal = (v) =>
    String(v).trim() === 'Not Specified' ? tr('product.notSpecified') : String(v).trim();
  let html = '<dl class="line-item__variants">';
  if (hasColor) {
    html += `<div class="line-item__variant-row"><dt>${escapeHtml(tr('product.color'))}</dt><dd>${escapeHtml(localizeVal(color))}</dd></div>`;
  }
  if (hasSize) {
    html += `<div class="line-item__variant-row"><dt>${escapeHtml(tr('product.size'))}</dt><dd>${escapeHtml(localizeVal(size))}</dd></div>`;
  }
  html += '</dl>';
  return html;
}

function renderCartLine(item) {
  const title = loc(item, 'title');
  const thumb = item.image_url
    ? `<img class="line-item__img" src="${escapeHtml(imgSrc(item.image_url))}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">`
    : '<div class="line-item__img line-item__img--placeholder" aria-hidden="true">📦</div>';
  const unit = parseFloat(item.price);
  const lineTotal = parseFloat(item.line_total);
  const skuRow = item.sku
    ? `<p class="line-item__sku"><span class="line-item__sku-label">SKU</span> ${escapeHtml(item.sku)}</p>`
    : '';

  return `
    <article class="cart-line line-item" data-cart-item-id="${item.id}">
      <div class="line-item__thumb">${thumb}</div>
      <div class="line-item__info">
        <a class="line-item__title" href="/product.html?id=${item.product_id}">${escapeHtml(title)}</a>
        ${skuRow}
        ${formatVariantsHtml(item.color, item.size)}
      </div>
      <div class="cart-line__pricing">
        <div class="cart-line__unit-wrap">
          <span class="cart-line__label">${escapeHtml(tr('cart.unitPrice'))}</span>
          <span class="cart-line__unit">${formatStoreMoney(unit)}</span>
        </div>
        <div class="cart-line__qty-wrap">
          <label class="cart-line__label" for="qty-${item.id}">${escapeHtml(tr('product.quantity'))}</label>
          <input type="number" class="cart-line__qty-input" id="qty-${item.id}" value="${item.quantity}" min="1" data-item-id="${item.id}" aria-label="${escapeHtml(tr('cart.qtyFor', { title }))}">
        </div>
        <div class="cart-line__line-wrap">
          <span class="cart-line__label">${escapeHtml(tr('cart.lineTotal'))}</span>
          <span class="cart-line__line-total">${formatStoreMoney(lineTotal)}</span>
        </div>
      </div>
      <div class="cart-line__actions">
        <button type="button" class="cart-line__remove" data-remove-id="${item.id}">${escapeHtml(tr('cart.remove'))}</button>
      </div>
    </article>
  `;
}

function renderSummaryRow(label, value, options = {}) {
  const { strong = false, muted = false } = options;
  const valClass = strong ? 'cart-summary__value cart-summary__value--total' : 'cart-summary__value';
  const rowClass = muted ? 'cart-summary__row cart-summary__row--muted' : 'cart-summary__row';
  return `<div class="${rowClass}"><span>${label}</span><span class="${valClass}">${value}</span></div>`;
}

async function loadCart() {
  const container = document.getElementById('cartContent');
  try {
    const cart = await callApi('/cart');
    if (!cart.items || cart.items.length === 0) {
      container.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty__icon" aria-hidden="true">🛒</div>
          <h1 class="cart-empty__title">${escapeHtml(tr('cart.emptyTitle'))}</h1>
          <p class="cart-empty__text">${escapeHtml(tr('cart.emptyText'))}</p>
          <a href="/" class="btn cart-empty__cta">${escapeHtml(tr('cart.browse'))}</a>
        </div>
      `;
      return;
    }

    const itemCount = cart.item_count || cart.items.reduce((s, i) => s + i.quantity, 0);
    const linesHtml = cart.items.map((item) => renderCartLine(item)).join('');
    const itemsWord = itemCount === 1 ? tr('cart.item') : tr('cart.items');
    const shippingIsFree =
      cart.shipping_is_free === true ||
      itemCount >= (Number(cart.free_delivery_min_items) || 10);
    const shippingLabel = shippingIsFree
      ? tr('cart.shippingFree')
      : formatStoreMoney(cart.shipping_estimate);

    container.innerHTML = `
      <header class="cart-page__head">
        <div>
          <h1 class="cart-page__title">${escapeHtml(tr('cart.title'))}</h1>
          <p class="cart-page__subtitle">${escapeHtml(tr('cart.subtitle', { count: itemCount, items: itemsWord }))}</p>
        </div>
        <div class="cart-page__head-actions">
          <a href="/" class="cart-page__continue">${escapeHtml(tr('cart.continue'))}</a>
          <button type="button" class="btn cart-page__clear" id="clearCartBtn">${escapeHtml(tr('cart.removeAll'))}</button>
        </div>
      </header>
      <div class="cart-layout">
        <section class="cart-lines" aria-label="${escapeHtml(tr('cart.itemsAria'))}">
          ${linesHtml}
        </section>
        <aside class="cart-summary" aria-label="${escapeHtml(tr('cart.summary'))}">
          <h2 class="cart-summary__title">${escapeHtml(tr('cart.summary'))}</h2>
          <div class="cart-summary__body">
            ${renderSummaryRow(tr('cart.subtotal'), formatStoreMoney(cart.subtotal))}
            ${
              cart.voucher_code && Number(cart.discount_amount) > 0
                ? renderSummaryRow(
                    tr('cart.discount', { code: cart.voucher_code, percent: cart.discount_percent }),
                    `−${formatStoreMoney(cart.discount_amount)}`,
                    { muted: true }
                  )
                : ''
            }
            ${renderSummaryRow(tr('cart.tax'), formatStoreMoney(cart.tax_amount), { muted: true })}
            ${renderSummaryRow(tr('cart.shipping'), shippingLabel, { muted: true })}
            <div class="cart-summary__divider"></div>
            ${renderSummaryRow(tr('cart.total'), formatStoreMoney(cart.total), { strong: true })}
          </div>
          <div class="cart-summary__voucher">
            ${
              cart.voucher_code
                ? `<div class="cart-summary__voucher-applied">
                    <span>${escapeHtml(tr('cart.voucherApplied', { code: cart.voucher_code, percent: cart.discount_percent }))}</span>
                    <button type="button" class="cart-summary__voucher-remove" id="removeVoucherBtn">${escapeHtml(tr('cart.voucherRemove'))}</button>
                  </div>`
                : `<form class="cart-summary__voucher-form" id="applyVoucherForm">
                    <label class="cart-summary__voucher-label" for="voucherCodeInput">${escapeHtml(tr('cart.voucherLabel'))}</label>
                    <div class="cart-summary__voucher-row">
                      <input type="text" id="voucherCodeInput" class="cart-summary__voucher-input" placeholder="${escapeHtml(tr('cart.voucherPlaceholder'))}" autocomplete="off" maxlength="40">
                      <button type="submit" class="btn cart-summary__voucher-apply" id="applyVoucherBtn">${escapeHtml(tr('cart.voucherApply'))}</button>
                    </div>
                    <p class="cart-summary__voucher-error" id="voucherError" hidden></p>
                  </form>`
            }
          </div>
          <p class="cart-summary__note">${escapeHtml(tr('cart.freeDeliveryNote'))}</p>
          <p class="cart-summary__note">${escapeHtml(tr('cart.note'))}</p>
          <a href="/checkout.html" class="btn cart-summary__checkout">${escapeHtml(tr('cart.checkout'))}</a>
          <p class="cart-summary__secure">${escapeHtml(tr('cart.secure'))}</p>
        </aside>
      </div>
    `;

    container.querySelectorAll('.cart-line__qty-input').forEach((input) => {
      input.addEventListener('change', async () => {
        const itemId = parseInt(input.dataset.itemId, 10);
        const qty = parseInt(input.value, 10) || 1;
        try {
          await callApi(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity: qty }) });
          loadCart();
          loadCartCount();
        } catch (err) {
          alert(err.message);
          loadCart();
        }
      });
    });

    container.querySelectorAll('[data-remove-id]').forEach((btn) => {
      btn.addEventListener('click', () => removeItem(parseInt(btn.getAttribute('data-remove-id'), 10)));
    });

    const clearBtn = document.getElementById('clearCartBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => clearAllItems());
    }

    const voucherForm = document.getElementById('applyVoucherForm');
    if (voucherForm) {
      voucherForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('voucherCodeInput');
        const errEl = document.getElementById('voucherError');
        const btn = document.getElementById('applyVoucherBtn');
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
        if (btn) {
          btn.disabled = true;
          btn.textContent = tr('cart.voucherApplying');
        }
        try {
          await callApi('/cart/voucher', { method: 'POST', body: JSON.stringify({ code }) });
          loadCart();
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || tr('cart.voucherInvalid');
            errEl.hidden = false;
          }
          if (btn) {
            btn.disabled = false;
            btn.textContent = tr('cart.voucherApply');
          }
        }
      });
    }

    document.getElementById('removeVoucherBtn')?.addEventListener('click', async () => {
      try {
        await callApi('/cart/voucher', { method: 'DELETE' });
        loadCart();
      } catch (err) {
        alert(err.message);
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="cart-error"><p>${escapeHtml(tr('cart.loadFailed'))}</p><a href="/">${escapeHtml(tr('cart.returnHome'))}</a></div>`;
  }
}

async function removeItem(itemId) {
  try {
    await callApi(`/cart/items/${itemId}`, { method: 'DELETE' });
    loadCart();
    loadCartCount();
  } catch (err) {
    alert(err.message);
  }
}

async function clearAllItems() {
  if (!window.confirm(tr('cart.removeAllConfirm'))) return;
  const btn = document.getElementById('clearCartBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = tr('cart.removingAll');
  }
  try {
    await callApi('/cart', { method: 'DELETE' });
    loadCart();
    loadCartCount();
  } catch (err) {
    alert(err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = tr('cart.removeAll');
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof loadBrandSettings === 'function') await loadBrandSettings();
  loadCart();
  loadCartCount();
});

window.addEventListener('storelangchange', () => {
  if (document.getElementById('cartContent')) loadCart();
});
