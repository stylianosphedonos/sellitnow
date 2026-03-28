function escapeHtml(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatVariantsHtml(color, size) {
  const hasColor = color && String(color).trim();
  const hasSize = size && String(size).trim();
  if (!hasColor && !hasSize) return '';
  let html = '<dl class="line-item__variants">';
  if (hasColor) {
    html += `<div class="line-item__variant-row"><dt>Color</dt><dd>${escapeHtml(String(color).trim())}</dd></div>`;
  }
  if (hasSize) {
    html += `<div class="line-item__variant-row"><dt>Size</dt><dd>${escapeHtml(String(size).trim())}</dd></div>`;
  }
  html += '</dl>';
  return html;
}

function renderCartLine(item) {
  const thumb = item.image_url
    ? `<img class="line-item__img" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}">`
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
        <a class="line-item__title" href="/product.html?id=${item.product_id}">${escapeHtml(item.title)}</a>
        ${skuRow}
        ${formatVariantsHtml(item.color, item.size)}
      </div>
      <div class="cart-line__pricing">
        <div class="cart-line__unit-wrap">
          <span class="cart-line__label">Unit price</span>
          <span class="cart-line__unit">${formatStoreMoney(unit)}</span>
        </div>
        <div class="cart-line__qty-wrap">
          <label class="cart-line__label" for="qty-${item.id}">Quantity</label>
          <input type="number" class="cart-line__qty-input" id="qty-${item.id}" value="${item.quantity}" min="1" max="${item.stock_quantity}" data-item-id="${item.id}" aria-label="Quantity for ${escapeHtml(item.title)}">
        </div>
        <div class="cart-line__line-wrap">
          <span class="cart-line__label">Line total</span>
          <span class="cart-line__line-total">${formatStoreMoney(lineTotal)}</span>
        </div>
      </div>
      <div class="cart-line__actions">
        <button type="button" class="cart-line__remove" data-remove-id="${item.id}">Remove</button>
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
          <h1 class="cart-empty__title">Your cart is empty</h1>
          <p class="cart-empty__text">Add items from the store to see them here. When you’re ready, you can review color, size, and totals before checkout.</p>
          <a href="/" class="btn cart-empty__cta">Browse products</a>
        </div>
      `;
      return;
    }

    const itemCount = cart.item_count || cart.items.reduce((s, i) => s + i.quantity, 0);
    const linesHtml = cart.items.map((item) => renderCartLine(item)).join('');

    container.innerHTML = `
      <header class="cart-page__head">
        <div>
          <h1 class="cart-page__title">Shopping cart</h1>
          <p class="cart-page__subtitle">${itemCount} ${itemCount === 1 ? 'item' : 'items'} · Review options and quantities below</p>
        </div>
        <a href="/" class="cart-page__continue">← Continue shopping</a>
      </header>
      <div class="cart-layout">
        <section class="cart-lines" aria-label="Cart items">
          ${linesHtml}
        </section>
        <aside class="cart-summary" aria-label="Order summary">
          <h2 class="cart-summary__title">Order summary</h2>
          <div class="cart-summary__body">
            ${renderSummaryRow('Subtotal', formatStoreMoney(cart.subtotal))}
            ${renderSummaryRow('Estimated tax (VAT)', formatStoreMoney(cart.tax_amount), { muted: true })}
            ${renderSummaryRow('Shipping estimate', formatStoreMoney(cart.shipping_estimate), { muted: true })}
            <div class="cart-summary__divider"></div>
            ${renderSummaryRow('Total', formatStoreMoney(cart.total), { strong: true })}
          </div>
          <p class="cart-summary__note">Tax and shipping are estimates until checkout. Each line shows SKU and selected color/size for your order.</p>
          <a href="/checkout.html" class="btn cart-summary__checkout">Proceed to checkout</a>
          <p class="cart-summary__secure">🔒 Secure checkout</p>
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
  } catch (err) {
    container.innerHTML = `<div class="cart-error"><p>Could not load your cart.</p><a href="/">Return home</a></div>`;
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

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof loadBrandSettings === 'function') await loadBrandSettings();
  loadCart();
  loadCartCount();
});
