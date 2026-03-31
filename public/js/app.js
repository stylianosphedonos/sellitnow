function apiPrefix() {
  if (typeof sellitnowGetApiBase === 'function') return sellitnowGetApiBase();
  return '/api/v1';
}

function mediaUrl(u) {
  if (typeof sellitnowResolveMediaUrl === 'function') return sellitnowResolveMediaUrl(u);
  return u;
}

function readCachedBrandSettings() {
  try {
    return JSON.parse(localStorage.getItem('sellitnow.brand') || 'null');
  } catch {
    return null;
  }
}

function persistBrandSettings(data) {
  try {
    localStorage.setItem('sellitnow.brand', JSON.stringify({
      primary: data.primary || '',
      primaryDark: data.primaryDark || '',
      secondary: data.secondary || '',
      accent: data.accent || '',
      currency: data.currency || '',
      banner: data.banner || '',
      logo: data.logo || '',
      heroTitle: data.heroTitle,
      heroSubtitle: data.heroSubtitle,
    }));
  } catch (_) {}
}

function applyHeroCopy(data) {
  if (!data || typeof data !== 'object') return;
  const h1 = document.getElementById('heroTitle');
  const sub = document.getElementById('heroSubtitle');
  if (h1 && data.heroTitle !== undefined) h1.textContent = data.heroTitle;
  if (sub && data.heroSubtitle !== undefined) sub.textContent = data.heroSubtitle;
}

function applyBrandTheme(data, persist = false) {
  if (!data) return;
  if (typeof window !== 'undefined') {
    window.__storeCurrency = String(data.currency || 'usd').toUpperCase();
  }
  const root = document.documentElement;
  if (data.primary) root.style.setProperty('--primary', data.primary);
  if (data.primaryDark) root.style.setProperty('--primary-dark', data.primaryDark);
  if (data.secondary) root.style.setProperty('--secondary', data.secondary);
  if (data.accent) root.style.setProperty('--accent', data.accent);
  if (persist) persistBrandSettings(data);
}

function getToken() {
  const legacy = localStorage.getItem('token');
  if (legacy) return legacy;
  return getUser() ? 'cookie-session' : null;
}

function setToken(token) {
  // Legacy compatibility: keep removal behavior but avoid persisting new JWTs in browser storage.
  if (!token) localStorage.removeItem('token');
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

let sellitnowCsrfMemory = null;
let sellitnowCsrfFetchPromise = null;

function sellitnowCsrfCookieName() {
  if (typeof window !== 'undefined' && window.__SELLITNOW_CSRF_COOKIE__ != null) {
    return String(window.__SELLITNOW_CSRF_COOKIE__);
  }
  return 'sellitnow_csrf';
}

function clearSellitnowCsrfCache() {
  sellitnowCsrfMemory = null;
  sellitnowCsrfFetchPromise = null;
}

/**
 * CSRF cookie is readable from JS only when the page and API share the same site
 * (typical single-origin deploy). If static assets and API are on different origins,
 * the cookie is still sent on API requests but document.cookie cannot see it — use GET /auth/csrf.
 */
async function getCsrfTokenForMutations() {
  const name = sellitnowCsrfCookieName();
  const fromCookie = getCookie(name);
  if (fromCookie) return fromCookie;
  if (sellitnowCsrfMemory) return sellitnowCsrfMemory;
  if (!sellitnowCsrfFetchPromise) {
    sellitnowCsrfFetchPromise = fetch(apiPrefix() + '/auth/csrf', { credentials: 'include' })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        sellitnowCsrfFetchPromise = null;
        const t = typeof data.csrfToken === 'string' ? data.csrfToken : '';
        if (t) sellitnowCsrfMemory = t;
        return t;
      })
      .catch(() => {
        sellitnowCsrfFetchPromise = null;
        return '';
      });
  }
  return sellitnowCsrfFetchPromise;
}

function sellitnowAuthHeaderPair() {
  const token = getToken();
  if (token && token !== 'cookie-session') return { Authorization: `Bearer ${token}` };
  return {};
}

/** Same-origin or cross-origin API calls with session cookie + optional Bearer. */
function sellitnowFetchWithAuth(url, options = {}) {
  const headers = { ...sellitnowAuthHeaderPair(), ...(options.headers || {}) };
  return fetch(url, { ...options, headers, credentials: 'include' });
}

/** Mutating requests (e.g. multipart) — includes CSRF when the session uses the auth cookie. */
async function sellitnowFetchWithCsrf(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...sellitnowAuthHeaderPair(), ...(options.headers || {}) };
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = await getCsrfTokenForMutations();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  return fetch(url, { ...options, headers, credentials: 'include' });
}

async function callApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token && token !== 'cookie-session') headers['Authorization'] = `Bearer ${token}`;
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = await getCsrfTokenForMutations();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  headers['X-Cart-Session'] = getCartSession();

  const res = await fetch(apiPrefix() + path, { ...options, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function getCookie(name) {
  const target = `${encodeURIComponent(name)}=`;
  const bits = document.cookie ? document.cookie.split('; ') : [];
  for (const bit of bits) {
    if (bit.startsWith(target)) {
      return decodeURIComponent(bit.slice(target.length));
    }
  }
  return '';
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
    const cached = readCachedBrandSettings();
    if (cached) applyBrandTheme(cached, false);
    applyHeroCopy(cached);
    const res = await fetch(apiPrefix() + '/brand');
    if (!res.ok) return;
    const data = await res.json();
    applyBrandTheme(data, true);
    applyHeroCopy(data);
    const hero = document.querySelector('.hero');
    if (hero) {
      if (data.banner) {
        const b = mediaUrl(data.banner);
        hero.classList.add('hero--has-image');
        /* Top: readability overlay; middle: image (sized via .hero--has-image contain); bottom: brand gradient fills letterbox */
        hero.style.backgroundImage = [
          'linear-gradient(135deg, rgba(0,0,0,0.35), rgba(0,0,0,0.35))',
          `url(${JSON.stringify(b)})`,
          'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
        ].join(', ');
      } else {
        hero.classList.remove('hero--has-image');
        hero.style.backgroundImage = '';
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
    btn.addEventListener('click', async () => {
      try {
        await callApi('/auth/logout', { method: 'POST' });
      } catch (_) {}
      clearSellitnowCsrfCache();
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

/**
 * @param {string} message
 * @param {{ type?: 'success' | 'error', duration?: number, action?: { label: string, href: string } }} [options]
 */
function showToast(message, options = {}) {
  const type = options.type || 'success';
  const duration = options.duration ?? (type === 'error' ? 5200 : 4000);
  const action = options.action;

  let host = document.getElementById('sellitnow-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'sellitnow-toast-host';
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
  }

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');

  const iconWrap = document.createElement('span');
  iconWrap.className = 'toast__icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.textContent = type === 'error' ? '!' : '✓';

  const body = document.createElement('div');
  body.className = 'toast__body';

  const msg = document.createElement('span');
  msg.className = 'toast__msg';
  msg.textContent = message;
  body.appendChild(msg);

  if (action && action.href && action.label) {
    const a = document.createElement('a');
    a.className = 'toast__action';
    a.href = action.href;
    a.textContent = action.label;
    body.appendChild(a);
  }

  el.appendChild(iconWrap);
  el.appendChild(body);
  host.appendChild(el);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('toast--visible'));
  });

  const dismiss = () => {
    el.classList.remove('toast--visible');
    const removeEl = () => el.remove();
    el.addEventListener('transitionend', removeEl, { once: true });
    setTimeout(removeEl, 320);
  };

  setTimeout(dismiss, duration);
}

async function quickAddProductFromCard(productId) {
  const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  if (!card) return;
  try {
    await callApi('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity: 1, color: '', size: '' }),
    });
    loadCartCount();
    showToast('Added to cart', {
      type: 'success',
      action: { label: 'View cart', href: '/cart.html' },
    });
  } catch (err) {
    showToast(err.message, { type: 'error' });
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
          ${p.image_url ? `<img src="${escapeHtml(mediaUrl(p.image_url))}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">` : '📦'}
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

function bindLoadAllProductsFromCategorySection() {
  const btn = document.getElementById('loadAllProductsBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.delete('category');
    history.replaceState({}, '', url.pathname + url.search);
    loadProducts(1, null);
  });
}

async function loadCategories() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;
  const allProductsTile = `
      <button type="button" class="category-card" id="loadAllProductsBtn" aria-label="Show all products">
        <div class="category-card__media category-card__media--placeholder"><span class="icon" aria-hidden="true">🏪</span></div>
        <span class="category-card__label">All products</span>
      </button>`;
  try {
    const { categories } = await callApi('/categories');
    grid.innerHTML =
      allProductsTile +
      categories
        .map((c) => {
          const imgUrl = c.image_url ? mediaUrl(c.image_url) : '';
          const media = imgUrl
            ? `<div class="category-card__media"><img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async"></div>`
            : `<div class="category-card__media category-card__media--placeholder"><span class="icon" aria-hidden="true">🛒</span></div>`;
          return `
      <a href="/products.html?category=${c.id}" class="category-card">
        ${media}
        <span class="category-card__label">${escapeHtml(c.name)}</span>
      </a>`;
        })
        .join('');
  } catch (err) {
    grid.innerHTML = allProductsTile + '<p>No categories</p>';
  }
  bindLoadAllProductsFromCategorySection();
}

let currentProductSearch = '';

async function loadProducts(page = 1, categoryId = null, searchQuery) {
  const grid = document.getElementById('productGrid');
  const pagination = document.getElementById('pagination');
  if (!grid) return;

  if (searchQuery !== undefined) {
    currentProductSearch = String(searchQuery).trim();
  }
  const qParam = currentProductSearch ? `&q=${encodeURIComponent(currentProductSearch)}` : '';

  try {
    let data;
    if (categoryId) {
      data = await callApi(`/categories/${categoryId}/products?page=${page}&limit=12${qParam}`);
    } else {
      data = await callApi(`/products?page=${page}&limit=12${qParam}`);
    }
    const items = data.items || [];
    grid.innerHTML = items.length
      ? items.map((p) => renderProductCardMarkup(p)).join('')
      : '<p>No products match your search.</p>';
    bindProductCardControls(grid);

    if (pagination && data.totalPages > 1) {
      pagination.innerHTML = '';
      if (data.page > 1) {
        const prev = document.createElement('button');
        prev.textContent = 'Prev';
        prev.addEventListener('click', () => loadProducts(data.page - 1, categoryId));
        pagination.appendChild(prev);
      }
      const span = document.createElement('span');
      span.style.padding = '8px';
      span.textContent = `Page ${data.page} of ${data.totalPages}`;
      pagination.appendChild(span);
      if (data.page < data.totalPages) {
        const next = document.createElement('button');
        next.textContent = 'Next';
        next.addEventListener('click', () => loadProducts(data.page + 1, categoryId));
        pagination.appendChild(next);
      }
    } else if (pagination) {
      pagination.innerHTML = '';
    }
  } catch (err) {
    grid.innerHTML = '<p>Failed to load products. Make sure the server is running.</p>';
  }
}

function initHomeSearch() {
  const input = document.getElementById('searchInput');
  const btn = document.querySelector('.btn-search');
  if (!input && !btn) return;

  const syncQueryInUrl = (q) => {
    const url = new URL(location.href);
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    history.replaceState({}, '', url.pathname + url.search);
  };

  const runSearch = () => {
    const q = (input?.value || '').trim();
    const params = new URLSearchParams(location.search);
    const categoryRaw = params.get('category');
    const categoryId = categoryRaw ? parseInt(categoryRaw, 10) : null;
    syncQueryInUrl(q);
    loadProducts(1, categoryId, q);
  };

  btn?.addEventListener('click', runSearch);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });
}

async function initHomePage() {
  updateNav();
  initLogout();
  const params = new URLSearchParams(location.search);
  const categoryId = params.get('category') ? parseInt(params.get('category'), 10) : null;
  const q = params.get('q') || '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = q;
  initHomeSearch();

  await Promise.all([
    loadBrandSettings(),
    loadCartCount(),
    loadCategories(),
    loadProducts(1, categoryId, q),
  ]);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomePage);
} else {
  initHomePage();
}

window.addEventListener('pageshow', (e) => {
  if (!e.persisted || !document.getElementById('productGrid')) return;
  const params = new URLSearchParams(location.search);
  const categoryId = params.get('category') ? parseInt(params.get('category'), 10) : null;
  const q = params.get('q') || '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = q;
  void Promise.all([loadBrandSettings(), loadProducts(1, categoryId, q)]);
});
