function apiPrefix() {
  if (typeof sellitnowGetApiBase === 'function') return sellitnowGetApiBase();
  return '/api/v1';
}

function mediaUrl(u) {
  if (typeof sellitnowResolveMediaUrl === 'function') return sellitnowResolveMediaUrl(u);
  return u;
}

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user || null));
}

function getCartSession() {
  let id = localStorage.getItem('cartSession');
  if (!id) {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem('cartSession', id);
  }
  return id;
}

async function callApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['X-Cart-Session'] = getCartSession();

  const res = await fetch(apiPrefix() + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatStoreMoney(amount, currencyCode) {
  const code =
    currencyCode != null && String(currencyCode).trim() !== ''
      ? String(currencyCode).toUpperCase()
      : (typeof window !== 'undefined' && window.__storeCurrency) || 'USD';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}

async function loadBrandSettings() {
  try {
    const res = await fetch(apiPrefix() + '/brand');
    if (!res.ok) return;
    const data = await res.json();
    if (typeof window !== 'undefined') {
      window.__storeCurrency = String(data.currency || 'usd').toUpperCase();
    }
    const root = document.documentElement;
    if (data.primary) root.style.setProperty('--primary', data.primary);
    if (data.primaryDark) root.style.setProperty('--primary-dark', data.primaryDark);
    if (data.secondary) root.style.setProperty('--secondary', data.secondary);
    if (data.accent) root.style.setProperty('--accent', data.accent);
    const hero = document.querySelector('.hero');
    if (hero) {
      if (data.banner) {
        const b = mediaUrl(data.banner);
        hero.style.backgroundImage = `linear-gradient(135deg, rgba(0,0,0,0.2), rgba(0,0,0,0.2)), url(${b})`;
        hero.style.backgroundSize = 'cover';
        hero.style.backgroundPosition = 'center';
      } else {
        hero.style.backgroundImage = '';
        hero.style.backgroundSize = '';
        hero.style.backgroundPosition = '';
      }
    }
    const logos = document.querySelectorAll('.logo');
    logos.forEach((el) => {
      if (data.logo) {
        el.innerHTML = '';
        const img = document.createElement('img');
        img.src = mediaUrl(data.logo);
        img.alt = 'Sellitnow';
        el.appendChild(img);
      } else {
        el.textContent = 'Sellitnow';
      }
    });
  } catch (_) {}
}

async function loadCartCount() {
  try {
    const cart = await callApi('/cart');
    const count = cart.item_count || 0;
    const el = document.getElementById('cartCount');
    if (el) el.textContent = count;
  } catch {
    const el = document.getElementById('cartCount');
    if (el) el.textContent = '0';
  }
}

function updateNav() {
  const user = getUser();
  const loginBtn = document.getElementById('loginBtn');
  const adminBtn = document.getElementById('adminBtn');
  const profileBtn = document.getElementById('profileBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (user) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'inline';
    if (logoutBtn) logoutBtn.style.display = 'inline';
    if (user.role === 'admin' && adminBtn) adminBtn.style.display = 'inline';
  } else {
    if (loginBtn) loginBtn.style.display = 'inline';
    if (adminBtn) adminBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      setToken(null);
      setUser(null);
      window.location.href = '/';
    });
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function quickAddProductFromCard(productId) {
  const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  if (!card) return;
  const btn = card.querySelector('[data-quick-add]');
  if (btn && btn.getAttribute('data-need-options') === '1') {
    window.location.href = '/product.html?id=' + productId;
    return;
  }
  try {
    await callApi('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity: 1, color: '', size: '' }),
    });
    loadCartCount();
    alert('Added to cart!');
  } catch (err) {
    alert(err.message);
  }
}

function bindProductCardControls(container) {
  container.querySelectorAll('[data-quick-add]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      quickAddProductFromCard(parseInt(btn.getAttribute('data-quick-add'), 10));
    });
  });
}

function productCardNeedsOptions(p) {
  const opts = p.options || { colors: [], sizes: [] };
  const colors = opts.colors || [];
  const sizes = opts.sizes || [];
  return colors.length > 0 || sizes.length > 0;
}

function renderProductCardMarkup(p) {
  const needOptions = productCardNeedsOptions(p) ? '1' : '0';
  return `
    <article class="product-card product-card--compact" data-product-id="${p.id}">
      <a href="/product.html?id=${p.id}" class="product-card__link">
        <div class="product-image">
          ${p.image_url ? `<img src="${escapeHtml(mediaUrl(p.image_url))}" alt="${escapeHtml(p.title)}">` : '📦'}
        </div>
        <div class="product-info">
          <div class="product-title">${escapeHtml(p.title)}</div>
          <div class="product-price">${formatStoreMoney(p.price)}</div>
        </div>
      </a>
      <div class="product-card__footer">
        <button type="button" class="btn product-card__cta" data-quick-add="${p.id}" data-need-options="${needOptions}">Add to cart</button>
      </div>
    </article>
  `;
}

async function loadCategories() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;
  try {
    const { categories } = await callApi('/categories');
    grid.innerHTML = categories.map(c => `
      <a href="/products.html?category=${c.id}" class="category-card">
        <div class="icon">🛒</div>
        <span>${c.name}</span>
      </a>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<p>No categories</p>';
  }
}

async function loadProducts(page = 1, categoryId = null) {
  const grid = document.getElementById('productGrid');
  const pagination = document.getElementById('pagination');
  if (!grid) return;

  try {
    let data;
    if (categoryId) {
      data = await callApi(`/categories/${categoryId}/products?page=${page}&limit=12`);
    } else {
      data = await callApi(`/products?page=${page}&limit=12`);
    }
    const items = data.items || [];
    grid.innerHTML = items.map((p) => renderProductCardMarkup(p)).join('');
    bindProductCardControls(grid);

    if (pagination && data.totalPages > 1) {
      let html = '';
      if (data.page > 1) {
        html += `<button onclick="loadProducts(${data.page - 1}${categoryId ? ', ' + categoryId : ''})">Prev</button>`;
      }
      html += `<span style="padding:8px">Page ${data.page} of ${data.totalPages}</span>`;
      if (data.page < data.totalPages) {
        html += `<button onclick="loadProducts(${data.page + 1}${categoryId ? ', ' + categoryId : ''})">Next</button>`;
      }
      pagination.innerHTML = html;
    } else if (pagination) {
      pagination.innerHTML = '';
    }
  } catch (err) {
    grid.innerHTML = '<p>Failed to load products. Make sure the server is running.</p>';
  }
}

async function initHomePage() {
  await loadBrandSettings();
  loadCartCount();
  updateNav();
  initLogout();
  loadCategories();
  const params = new URLSearchParams(location.search);
  const categoryId = params.get('category');
  loadProducts(1, categoryId ? parseInt(categoryId) : null);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomePage);
} else {
  initHomePage();
}

window.addEventListener('pageshow', (e) => {
  if (!e.persisted || !document.getElementById('productGrid')) return;
  loadBrandSettings().then(() => {
    const params = new URLSearchParams(location.search);
    const categoryId = params.get('category');
    loadProducts(1, categoryId ? parseInt(categoryId, 10) : null);
  });
});
