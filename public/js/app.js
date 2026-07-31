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
    const raw =
      localStorage.getItem('3nitylab.brand') || localStorage.getItem('sellitnow.brand');
    return JSON.parse(raw || 'null');
  } catch {
    return null;
  }
}

function persistBrandSettings(data) {
  try {
    localStorage.setItem('3nitylab.brand', JSON.stringify({
      primary: data.primary || '',
      primaryDark: data.primaryDark || '',
      secondary: data.secondary || '',
      accent: data.accent || '',
      headerShadow: data.headerShadow || '',
      currency: data.currency || '',
      banner: data.banner || '',
      logo: data.logo || '',
      allProductsImage: data.allProductsImage || '',
      allProductsShowOnWebsite: data.allProductsShowOnWebsite !== false,
      heroTitle: data.heroTitle,
      heroSubtitle: data.heroSubtitle,
      heroBannerOverlay: data.heroBannerOverlay,
    }));
  } catch (_) {}
}

function syncHeroHasCopyClass() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const h1 = document.getElementById('heroTitle');
  const sub = document.getElementById('heroSubtitle');
  const hasCopy =
    Boolean(h1 && String(h1.textContent || '').trim()) ||
    Boolean(sub && String(sub.textContent || '').trim());
  hero.classList.toggle('hero--has-copy', hasCopy);
  syncHeroEmptyState();
}

function syncHeroEmptyState() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const hasImage = hero.classList.contains('hero--has-image');
  const hasCopy = hero.classList.contains('hero--has-copy');
  hero.classList.toggle('hero--empty', !hasImage && !hasCopy);
  hero.hidden = !hasImage && !hasCopy;
}

function applyHeroCopy(data) {
  if (!data || typeof data !== 'object') return;
  const h1 = document.getElementById('heroTitle');
  const sub = document.getElementById('heroSubtitle');
  if (h1 && data.heroTitle !== undefined) h1.textContent = data.heroTitle;
  if (sub && data.heroSubtitle !== undefined) sub.textContent = data.heroSubtitle;
  syncHeroHasCopyClass();
}

const DEFAULT_HERO_BANNER_OVERLAY = 0.35;

function parseHeroBannerOverlay(data) {
  const raw = data && data.heroBannerOverlay;
  if (raw == null || String(raw).trim() === '') return DEFAULT_HERO_BANNER_OVERLAY;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_HERO_BANNER_OVERLAY;
  return Math.min(0.85, Math.max(0, n));
}

/** Hero section on index: centered image (+ optional headline overlay). */
function applyHeroBannerBackground(data) {
  const hero = document.querySelector('.hero');
  const root = document.documentElement;
  if (!hero) return;
  // No brand payload yet — keep neutral page bg (avoid orange flash before /brand loads).
  if (!data || typeof data !== 'object') return;
  const bannerEl = hero.querySelector('.hero__banner');
  const centerImg = document.getElementById('heroCenterImg');
  const banner = data.banner && String(data.banner).trim();
  if (banner) {
    const b = mediaUrl(banner);
    const overlay = parseHeroBannerOverlay(data);
    hero.classList.add('hero--has-image');
    root.classList.add('has-hero-banner');
    root.classList.remove('hero-use-gradient');
    root.style.setProperty('--hero-banner-image', `url(${JSON.stringify(b)})`);
    root.style.setProperty('--hero-banner-overlay', String(overlay));
    if (centerImg) {
      centerImg.hidden = false;
      centerImg.removeAttribute('hidden');
      if (centerImg.getAttribute('src') !== b) centerImg.src = b;
      centerImg.alt = '';
    }
    // Dim layer only when headline text sits on top of the image
    if (bannerEl) {
      const h1 = document.getElementById('heroTitle');
      const sub = document.getElementById('heroSubtitle');
      const hasCopy =
        Boolean(h1 && String(h1.textContent || '').trim()) ||
        Boolean(sub && String(sub.textContent || '').trim()) ||
        Boolean(String(data.heroTitle || '').trim()) ||
        Boolean(String(data.heroSubtitle || '').trim());
      if (hasCopy && overlay > 0) {
        bannerEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay}))`;
      } else {
        bannerEl.style.backgroundImage = '';
      }
    }
  } else {
    hero.classList.remove('hero--has-image');
    root.classList.remove('has-hero-banner');
    root.style.removeProperty('--hero-banner-image');
    root.style.removeProperty('--hero-banner-overlay');
    if (centerImg) {
      centerImg.removeAttribute('src');
      centerImg.hidden = true;
      centerImg.setAttribute('hidden', '');
    }
    if (bannerEl) bannerEl.style.backgroundImage = '';
    const h1 = document.getElementById('heroTitle');
    const sub = document.getElementById('heroSubtitle');
    const hasCopy =
      Boolean(h1 && String(h1.textContent || '').trim()) ||
      Boolean(sub && String(sub.textContent || '').trim()) ||
      Boolean(String(data.heroTitle || '').trim()) ||
      Boolean(String(data.heroSubtitle || '').trim());
    if (hasCopy) root.classList.add('hero-use-gradient');
    else root.classList.remove('hero-use-gradient');
  }
  syncHeroHasCopyClass();
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
  if (data.headerShadow) root.style.setProperty('--header-shadow', data.headerShadow);
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

function clearSession() {
  clearSellitnowCsrfCache();
  setToken(null);
  setUser(null);
}

function isLoggedInClient() {
  return Boolean(getUser() || localStorage.getItem('token'));
}

function isLoginPage() {
  return /\/login\.html$/i.test(location.pathname);
}

function isProtectedPage() {
  const path = location.pathname;
  return path.startsWith('/admin/') || /\/profile\.html$/i.test(path);
}

function apiPathFromUrl(url) {
  const base = apiPrefix();
  const raw = String(url || '');
  if (raw.startsWith(base)) return raw.slice(base.length).split('?')[0] || '/';
  try {
    const u = new URL(raw, location.origin);
    const marker = '/api/v1';
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) return u.pathname.slice(idx + marker.length) || '/';
    return u.pathname;
  } catch {
    return raw.split('?')[0] || '/';
  }
}

function isAuthExemptApiPath(path, method) {
  const p = String(path || '').split('?')[0];
  const m = String(method || 'GET').toUpperCase();
  if (p === '/auth/login' && m === 'POST') return true;
  if (p === '/auth/register' && m === 'POST') return true;
  return false;
}

let sessionExpiredHandling = false;

async function handleSessionExpired(options = {}) {
  if (sessionExpiredHandling) return;
  sessionExpiredHandling = true;

  clearSession();
  updateNav();

  if (!options.silent && typeof showToast === 'function' && !isLoginPage()) {
    showToast('Your session has expired. Please log in again.', { type: 'error' });
  }

  if (isProtectedPage() && !isLoginPage()) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    window.location.href = `/login.html?redirect=${redirect}&reason=session_expired`;
    return;
  }

  sessionExpiredHandling = false;
}

async function maybeHandleExpiredSession(status, path, method) {
  if (status !== 401 || !isLoggedInClient()) return false;
  if (isAuthExemptApiPath(path, method)) return false;
  await handleSessionExpired();
  return true;
}

async function ensureValidSession() {
  if (!isLoggedInClient()) return;
  try {
    const { user } = await callApi('/auth/me');
    if (user) setUser(user);
    updateNav();
  } catch (err) {
    if (err.sessionExpired) return;
    if (err.status === 401) await handleSessionExpired({ silent: isLoginPage() });
  }
}

async function sellitnowEnsureAdminAccess() {
  const path = location.pathname;
  if (path !== '/admin' && !path.startsWith('/admin/')) return true;
  await ensureValidSession();
  const user = getUser();
  if (!isLoggedInClient() || user?.role !== 'admin') {
    const redirect = encodeURIComponent(location.pathname + location.search);
    window.location.replace(`/login.html?redirect=${redirect}`);
    return false;
  }
  updateNav();
  return true;
}

if (typeof window !== 'undefined') {
  window.sellitnowEnsureAdminAccess = sellitnowEnsureAdminAccess;
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
  const method = String(options.method || 'GET').toUpperCase();
  return fetch(url, { ...options, headers, credentials: 'include' }).then((res) => {
    void maybeHandleExpiredSession(res.status, apiPathFromUrl(url), method);
    return res;
  });
}

/** Mutating requests (e.g. multipart) — includes CSRF when the session uses the auth cookie. */
async function sellitnowFetchWithCsrf(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...sellitnowAuthHeaderPair(), ...(options.headers || {}) };
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = await getCsrfTokenForMutations();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(url, { ...options, headers, credentials: 'include' });
  void maybeHandleExpiredSession(res.status, apiPathFromUrl(url), method);
  return res;
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
  if (!res.ok) {
    if (await maybeHandleExpiredSession(res.status, path, method)) {
      const err = new Error(data.error || 'Session expired');
      err.status = res.status;
      err.data = data;
      err.sessionExpired = true;
      throw err;
    }
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
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

function getHeaderLogoHeight() {
  if (typeof window === 'undefined' || !window.matchMedia) return '88px';
  if (window.matchMedia('(max-width: 380px)').matches) return '56px';
  if (window.matchMedia('(max-width: 768px)').matches) return '64px';
  return '88px';
}

function applyBrandLogo(data) {
  if (!data) return;
  const logos = document.querySelectorAll('.logo');
  const h = getHeaderLogoHeight();
  logos.forEach((el) => {
    if (data.logo) {
      el.innerHTML = '';
      const img = document.createElement('img');
      img.src = mediaUrl(data.logo);
      img.alt = '3nityLab';
      // Force size so a stale CSS cache cannot keep the logo tiny
      img.style.height = h;
      img.style.maxHeight = h;
      img.style.width = 'auto';
      img.style.maxWidth = 'min(360px, 48vw)';
      img.style.objectFit = 'contain';
      img.style.objectPosition = 'left center';
      img.style.display = 'block';
      el.appendChild(img);
    } else {
      el.textContent = '3nityLab';
    }
  });
}

let sellitnowLogoResizeBound = false;
function initLogoResizeRefresh() {
  if (sellitnowLogoResizeBound || typeof window === 'undefined') return;
  sellitnowLogoResizeBound = true;
  let last = getHeaderLogoHeight();
  window.addEventListener('resize', () => {
    const next = getHeaderLogoHeight();
    if (next === last) return;
    last = next;
    document.querySelectorAll('.logo img').forEach((img) => {
      img.style.height = next;
      img.style.maxHeight = next;
    });
  });
}

function applyCachedBrandSettings() {
  const cached = readCachedBrandSettings();
  if (!cached) return null;
  applyBrandTheme(cached, false);
  applyHeroCopy(cached);
  applyHeroBannerBackground(cached);
  applyBrandLogo(cached);
  initLogoResizeRefresh();
  return cached;
}

async function refreshBrandSettingsFromNetwork() {
  const res = await fetch(apiPrefix() + '/brand');
  if (!res.ok) return null;
  const data = await res.json();
  applyBrandTheme(data, true);
  applyHeroCopy(data);
  applyHeroBannerBackground(data);
  applyBrandLogo(data);
  initLogoResizeRefresh();
  return data;
}

/** Apply cached brand immediately; always refresh from network (await unless skipAwait on cache hit). */
async function loadBrandSettings(options = {}) {
  try {
    const cached = applyCachedBrandSettings();
    if (cached && options.backgroundRefresh) {
      void refreshBrandSettingsFromNetwork().catch(() => {});
      return cached;
    }
    return await refreshBrandSettingsFromNetwork();
  } catch (_) {
    return null;
  }
}

async function loadCartCount() {
  try {
    const cart = await callApi('/cart/count');
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
    if (adminBtn) adminBtn.style.display = user.role === 'admin' ? 'inline' : 'none';
  } else {
    if (loginBtn) loginBtn.style.display = 'inline';
    if (adminBtn) adminBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (btn && btn.dataset.bound !== '1') {
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      try {
        await callApi('/auth/logout', { method: 'POST' });
      } catch (_) {}
      clearSession();
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

  let host = document.getElementById('3nitylab-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = '3nitylab-toast-host';
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
  container.querySelectorAll('.product-stock').forEach((el) => el.remove());
  container.querySelectorAll('[data-quick-add]').forEach((btn) => {
    btn.disabled = false;
    if (btn.textContent.trim().toLowerCase() === 'out of stock') {
      btn.textContent = 'Add to cart';
    }
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

function renderProductCardMarkup(p, opts = {}) {
  const isBundle = p.product_type === 'bundle';
  const needOptions = !isBundle && productCardNeedsOptions(p) ? '1' : '0';
  const offerBadge = isBundle ? '<span class="product-card__offer-badge">Offer</span>' : '';
  const comparePrice =
    isBundle && p.compare_at_price > p.price
      ? `<div class="product-price-compare">${formatStoreMoney(p.compare_at_price)}</div>`
      : '';
  const eager = opts.priority ? ' fetchpriority="high" loading="eager"' : ' loading="lazy"';
  return `
    <article class="product-card product-card--compact${isBundle ? ' product-card--offer' : ''}" data-product-id="${p.id}">
      <a href="/product.html?id=${p.id}" class="product-card__link">
        <div class="product-image">
          ${offerBadge}
          ${p.image_url ? `<img src="${escapeHtml(mediaUrl(p.image_url))}" alt="${escapeHtml(p.title)}"${eager} decoding="async">` : '📦'}
        </div>
        <div class="product-info">
          <div class="product-title">${escapeHtml(p.title)}</div>
          ${comparePrice}
          <div class="product-price">${formatStoreMoney(p.price)}</div>
        </div>
      </a>
      <div class="product-card__footer">
        <button type="button" class="btn product-card__cta" data-quick-add="${p.id}" data-need-options="${needOptions}">Add to cart</button>
      </div>
    </article>
  `;
}

/** Populated in `loadCategories` for section titles when filtering by category. */
const sellitnowCategoryLabels = new Map();
const sellitnowCategoriesById = new Map();

const WEBSITE_ZONE_CONTAINER_IDS = {
  'home-main': 'categoryGrid',
  top: 'zone-top',
  bottom: 'zone-bottom',
  'top-left': 'zone-top-left',
  'top-right': 'zone-top-right',
  'bottom-left': 'zone-bottom-left',
  'bottom-right': 'zone-bottom-right',
  left: 'zone-left',
  right: 'zone-right',
};

const FLOATING_WEBSITE_ZONES = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

const MOBILE_DOCK_ZONES = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'left',
  'right',
]);

function isMobileSiteDock() {
  return window.matchMedia('(max-width: 640px)').matches;
}

function sortCategoriesForZone(list) {
  return [...list].sort((a, b) => {
    const ao = a.display_order;
    const bo = b.display_order;
    if (ao == null && bo == null) return a.id - b.id;
    if (ao == null) return 1;
    if (bo == null) return -1;
    return ao - bo || a.id - b.id;
  });
}

/** Scroll so the products section title sits below the sticky header. */
function scrollProductsBrowseIntoView() {
  const heading = document.getElementById('productsSectionHeading');
  const target = heading || document.querySelector('.products');
  if (!target) return;

  const header = document.querySelector('.header');
  const headerOffset = (header ? header.getBoundingClientRect().height : 0) + 12;
  const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function applyProductsBrowseMode(categoryId, categoryLabel) {
  const categoriesEl = document.getElementById('categories');
  const browseBar = document.getElementById('productsBrowseBar');
  const heading = document.getElementById('productsSectionHeading');
  const inCategory =
    categoryId != null && Number.isFinite(categoryId) && categoryId > 0;

  if (categoriesEl) categoriesEl.hidden = inCategory;
  if (browseBar) browseBar.hidden = !inCategory;

  if (heading) {
    if (inCategory) {
      const label = categoryLabel != null && String(categoryLabel).trim() !== '' ? String(categoryLabel).trim() : '';
      heading.textContent = label || 'Products';
    } else {
      heading.textContent = 'Items';
    }
  }
}

function isIconCategory(c) {
  return c && c.category_type === 'icon';
}

function getCategoryWebsiteZone(c) {
  const zone = c && c.website_zone;
  if (zone && WEBSITE_ZONE_CONTAINER_IDS[zone]) return zone;
  return 'home-main';
}

function renderCompactCategoryIcon(c, inDock) {
  const media = renderCategoryCardMedia(c, 'tile');
  const typeClass = isIconCategory(c) ? ' category-icon--request' : '';
  const dockClass = inDock ? ' category-icon--dock' : '';
  return `
    <button type="button" class="category-icon${typeClass}${dockClass}" data-category-id="${c.id}" aria-label="${escapeHtml(c.name)}">
      ${media}
      <span class="category-icon__label">${escapeHtml(c.name)}</span>
    </button>`;
}

function renderCategoryForZone(c, zone) {
  if (zone === 'home-main') return renderStorefrontCategoryCard(c);
  return renderCompactCategoryIcon(c, false);
}

function renderMobileCategoryDock(byZone) {
  const dock = document.getElementById('zone-mobile-dock');
  if (!dock) return;

  const items = [];
  for (const zone of MOBILE_DOCK_ZONES) {
    items.push(...(byZone.get(zone) || []));
  }
  const sorted = sortCategoriesForZone(items);

  if (!isMobileSiteDock() || !sorted.length) {
    dock.hidden = true;
    dock.innerHTML = '';
    document.body.classList.remove('has-zone-mobile-dock');
    return;
  }

  dock.innerHTML = sorted.map((c) => renderCompactCategoryIcon(c, true)).join('');
  dock.hidden = false;
  document.body.classList.add('has-zone-mobile-dock');
}

function initMobileCategoryDockReload(byZoneRef) {
  if (window.__sellitnowMobileDockResizeBound) return;
  window.__sellitnowMobileDockResizeBound = true;
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (byZoneRef.current) renderMobileCategoryDock(byZoneRef.current);
    }, 150);
  });
}

function openCategoryRequestModal(category) {
  const modal = document.getElementById('categoryRequestModal');
  if (!modal || !category) return;
  const form = document.getElementById('categoryRequestForm');
  const successEl = document.getElementById('categoryRequestSuccess');
  const errEl = document.getElementById('categoryRequestError');
  const titleEl = document.getElementById('categoryRequestTitle');
  const promptEl = document.getElementById('categoryRequestPrompt');
  const idInput = document.getElementById('categoryRequestCategoryId');

  if (form) {
    form.reset();
    form.style.display = '';
  }
  if (successEl) successEl.hidden = true;
  if (errEl) errEl.style.display = 'none';
  if (titleEl) titleEl.textContent = category.name || 'Request a product';
  if (promptEl) {
    const prompt = category.request_prompt || category.description || 'Tell us what you need and we will email you back.';
    promptEl.textContent = prompt;
    promptEl.style.display = prompt ? '' : 'none';
  }
  if (idInput) idInput.value = String(category.id);

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('request-modal-open');
  document.getElementById('categoryRequestName')?.focus();
}

function closeCategoryRequestModal() {
  const modal = document.getElementById('categoryRequestModal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('request-modal-open');
}

function initCategoryRequestModal() {
  const modal = document.getElementById('categoryRequestModal');
  const form = document.getElementById('categoryRequestForm');
  if (!modal || !form || form.dataset.sellitnowBound === '1') return;
  form.dataset.sellitnowBound = '1';

  modal.querySelectorAll('[data-close-request-modal]').forEach((el) => {
    el.addEventListener('click', closeCategoryRequestModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeCategoryRequestModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('categoryRequestSubmit');
    const errEl = document.getElementById('categoryRequestError');
    const successEl = document.getElementById('categoryRequestSuccess');
    if (errEl) errEl.style.display = 'none';

    const formData = new FormData(form);
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }

    try {
      const res = await sellitnowFetchWithCsrf(
        (typeof sellitnowApiUrl === 'function' ? sellitnowApiUrl : (p) => apiPrefix() + p)('/category-requests'),
        { method: 'POST', body: formData }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send request');
      form.style.display = 'none';
      if (successEl) successEl.hidden = false;
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Could not send request';
        errEl.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send request';
      }
    }
  });
}

function handleCategoryActivation(id) {
  const category = sellitnowCategoriesById.get(id);
  if (isIconCategory(category)) {
    openCategoryRequestModal(category);
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set('category', String(id));
  history.replaceState({}, '', url.pathname + url.search);
  const label = sellitnowCategoryLabels.get(id);
  applyProductsBrowseMode(id, label);
  loadProducts(1, id);
  scrollProductsBrowseIntoView();
}

function bindCategoryNavigation() {
  if (document.body.dataset.sellitnowCategoryNavBound === '1') return;
  document.body.dataset.sellitnowCategoryNavBound = '1';
  document.addEventListener('click', (ev) => {
    const card = ev.target.closest('[data-category-id]');
    if (!card || card.id === 'loadAllProductsBtn') return;
    const id = parseInt(card.getAttribute('data-category-id'), 10);
    if (!Number.isFinite(id) || id <= 0) return;
    ev.preventDefault();
    handleCategoryActivation(id);
  });
}

function bindCategoryGridNavigation() {
  bindCategoryNavigation();
}

function bindBackToCategories() {
  const btn = document.getElementById('backToCategoriesBtn');
  if (!btn || btn.dataset.sellitnowBound === '1') return;
  btn.dataset.sellitnowBound = '1';
  btn.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.delete('category');
    history.replaceState({}, '', url.pathname + url.search);
    applyProductsBrowseMode(null);
    loadProducts(1, null);
    document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function bindLoadAllProductsFromCategorySection() {
  const btn = document.getElementById('loadAllProductsBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.delete('category');
    history.replaceState({}, '', url.pathname + url.search);
    applyProductsBrowseMode(null);
    loadProducts(1, null);
  });
}

function hasCustomCategoryIconSize(c, hasImage) {
  if (c.icon_width_px != null && Number(c.icon_width_px) > 0) return true;
  if (c.icon_height_px != null && Number(c.icon_height_px) > 0) return true;
  if (!hasImage && c.icon_size_px != null && Number(c.icon_size_px) > 0) return true;
  return false;
}

function getCategoryIconDimensions(c, hasImage) {
  const legacyHeight =
    !hasImage && c.icon_size_px != null && Number(c.icon_size_px) > 0
      ? Number(c.icon_size_px)
      : null;
  let height =
    c.icon_height_px != null && Number(c.icon_height_px) > 0
      ? Number(c.icon_height_px)
      : legacyHeight;
  let width =
    c.icon_width_px != null && Number(c.icon_width_px) > 0
      ? Number(c.icon_width_px)
      : null;
  if (width != null && height == null) height = width;
  return { width, height };
}

function getCategoryIconMediaClasses(c, layout, hasImage) {
  const isBanner = layout === 'banner-left' || layout === 'banner-right';
  let classes = isBanner
    ? 'category-card__media category-card__media--banner'
    : 'category-card__media category-card__media--tile';
  if (!hasCustomCategoryIconSize(c, hasImage)) return classes;
  classes += ' category-card__media--sized';
  const { width } = getCategoryIconDimensions(c, hasImage);
  if (isBanner && width != null) classes += ' category-card__media--custom-width';
  return classes;
}

function getCategoryIconMediaStyle(c, layout, hasImage) {
  if (!hasCustomCategoryIconSize(c, hasImage)) return '';
  const isBanner = layout === 'banner-left' || layout === 'banner-right';
  const { width, height } = getCategoryIconDimensions(c, hasImage);
  const parts = ['aspect-ratio:unset', 'box-sizing:border-box'];
  if (isBanner && width != null) {
    parts.push(`width:${width}px`, 'max-width:100%');
  } else {
    parts.push('width:100%');
  }
  if (height != null) {
    parts.push(`height:${height}px`);
  }
  return parts.join(';');
}

function getCategoryCardTileStyle(c, hasImage) {
  if (!hasCustomCategoryIconSize(c, hasImage)) return '';
  const { width } = getCategoryIconDimensions(c, hasImage);
  if (width == null) return '';
  return `width:${width}px;max-width:100%`;
}

function getCategoryIconSizePx(c) {
  const { height } = getCategoryIconDimensions(c, false);
  return height != null ? height : 140;
}

function getCategoryWebsiteLayout(c) {
  const layout = c.website_layout;
  if (layout === 'banner-left' || layout === 'banner-right') return layout;
  return 'tile';
}

function renderCategoryCardMedia(c, layout) {
  const hasImage = Boolean(c.image_url);
  const mediaClass = getCategoryIconMediaClasses(c, layout, hasImage);
  const mediaStyle = getCategoryIconMediaStyle(c, layout, hasImage);
  const styleAttr = mediaStyle ? ` style="${mediaStyle}"` : '';
  const imgUrl = hasImage ? mediaUrl(c.image_url) : '';
  if (imgUrl) {
    return `<div class="${mediaClass} category-card__media--image"${styleAttr}><img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async"></div>`;
  }
  return `<div class="${mediaClass} category-card__media--placeholder"${styleAttr}><span class="icon" aria-hidden="true">🛒</span></div>`;
}

function renderStorefrontCategoryCard(c) {
  const layout = getCategoryWebsiteLayout(c);
  const hasImage = Boolean(c.image_url);
  const media = renderCategoryCardMedia(c, layout);
  const label = `<span class="category-card__label">${escapeHtml(c.name)}</span>`;
  const tileStyle = layout === 'tile' ? getCategoryCardTileStyle(c, hasImage) : '';
  const tileStyleAttr = tileStyle ? ` style="${tileStyle}"` : '';
  const tileWidthClass =
    layout === 'tile' && getCategoryCardTileStyle(c, hasImage)
      ? ' category-card--sized-width'
      : '';
  const requestClass = isIconCategory(c) ? ' category-card--request-icon' : '';

  if (layout === 'banner-left') {
    return `
      <button type="button" class="category-card category-card--banner category-card--banner-left${requestClass}" data-category-id="${c.id}">
        ${media}
        ${label}
      </button>`;
  }
  if (layout === 'banner-right') {
    return `
      <button type="button" class="category-card category-card--banner category-card--banner-right${requestClass}" data-category-id="${c.id}">
        ${media}
        ${label}
      </button>`;
  }
  return `
      <button type="button" class="category-card category-card--tile${tileWidthClass}${requestClass}" data-category-id="${c.id}"${tileStyleAttr}>
        ${media}
        ${label}
      </button>`;
}

async function loadCategories() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;

  Object.entries(WEBSITE_ZONE_CONTAINER_IDS).forEach(([zone, containerId]) => {
    if (zone === 'home-main') return;
    const el = document.getElementById(containerId);
    if (el) {
      el.innerHTML = '';
      el.hidden = true;
    }
  });

  const cachedBrand = readCachedBrandSettings();
  const showAllProductsTile = cachedBrand?.allProductsShowOnWebsite !== false;
  const allProductsImage = cachedBrand?.allProductsImage ? mediaUrl(cachedBrand.allProductsImage) : '';
  const allProductsTile = showAllProductsTile ? `
      <button type="button" class="category-card" id="loadAllProductsBtn" aria-label="Show all products">
        ${
          allProductsImage
            ? `<div class="category-card__media"><img src="${escapeHtml(allProductsImage)}" alt="All products" loading="lazy" decoding="async"></div>`
            : '<div class="category-card__media category-card__media--placeholder"><span class="icon" aria-hidden="true">🏪</span></div>'
        }
        <span class="category-card__label">All products</span>
      </button>` : '';

  try {
    const { categories } = await callApi('/categories');
    sellitnowCategoryLabels.clear();
    sellitnowCategoriesById.clear();

    const byZone = new Map();
    for (const c of categories || []) {
      if (!c || c.id == null) continue;
      sellitnowCategoryLabels.set(c.id, c.name);
      sellitnowCategoriesById.set(c.id, c);
      const zone = getCategoryWebsiteZone(c);
      if (!byZone.has(zone)) byZone.set(zone, []);
      byZone.get(zone).push(c);
    }

    for (const [zone, list] of byZone.entries()) {
      list.sort((a, b) => {
        const ao = a.display_order;
        const bo = b.display_order;
        if (ao == null && bo == null) return a.id - b.id;
        if (ao == null) return 1;
        if (bo == null) return -1;
        return ao - bo || a.id - b.id;
      });
    }

    window.__sellitnowCategoriesByZone = byZone;
    if (!window.__sellitnowMobileDockByZoneRef) {
      window.__sellitnowMobileDockByZoneRef = { current: null };
      initMobileCategoryDockReload(window.__sellitnowMobileDockByZoneRef);
    }
    window.__sellitnowMobileDockByZoneRef.current = byZone;

    const homeMain = byZone.get('home-main') || [];
    grid.innerHTML = allProductsTile + homeMain.map((c) => renderStorefrontCategoryCard(c)).join('');

    const categoriesSection = document.getElementById('categories');
    if (categoriesSection) {
      categoriesSection.hidden = homeMain.length === 0 && !showAllProductsTile;
    }

    for (const [zone, containerId] of Object.entries(WEBSITE_ZONE_CONTAINER_IDS)) {
      if (zone === 'home-main') continue;
      const el = document.getElementById(containerId);
      const list = byZone.get(zone) || [];
      if (!el || !list.length) continue;
      const isBar = zone === 'top' || zone === 'bottom';
      const isSide = zone === 'left' || zone === 'right';
      el.classList.toggle('site-zone--bar-row', isBar);
      el.classList.toggle('site-zone--side-stack', isSide);
      el.classList.toggle('site-zone--float-stack', FLOATING_WEBSITE_ZONES.has(zone));
      el.innerHTML = list.map((c) => renderCategoryForZone(c, zone)).join('');
      el.hidden = false;
    }

    renderMobileCategoryDock(byZone);
  } catch (err) {
    sellitnowCategoryLabels.clear();
    sellitnowCategoriesById.clear();
    renderMobileCategoryDock(new Map());
    grid.innerHTML = allProductsTile + '<p>No categories</p>';
  }
  bindLoadAllProductsFromCategorySection();
  bindCategoryGridNavigation();
  bindBackToCategories();
}

let currentProductSearch = '';
let currentProductPageSize = 0;
let currentProductGridColumns = 0;

const PRODUCT_GRID_ROWS = 4;

function getProductGridColumnCount() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  if (width <= 640) return 2;
  if (width <= 1024) return 4;
  return 5;
}

function getResponsiveProductPageSize() {
  return getProductGridColumnCount() * PRODUCT_GRID_ROWS;
}

function resolveProductPageSize() {
  return getResponsiveProductPageSize();
}

function getCurrentCategoryFromUrl() {
  const params = new URLSearchParams(location.search);
  const categoryRaw = params.get('category');
  if (!categoryRaw) return null;
  const categoryId = parseInt(categoryRaw, 10);
  return Number.isFinite(categoryId) ? categoryId : null;
}

function syncProductsBrowseChromeFromUrl() {
  const cid = getCurrentCategoryFromUrl();
  applyProductsBrowseMode(cid, cid != null ? sellitnowCategoryLabels.get(cid) : null);
}

let sellitnowHomePopstateBound = false;

function initHomeBrowseHistory() {
  if (sellitnowHomePopstateBound) return;
  sellitnowHomePopstateBound = true;
  window.addEventListener('popstate', () => {
    if (!document.getElementById('productGrid')) return;
    const q2 = new URLSearchParams(location.search).get('q') || '';
    const searchInput2 = document.getElementById('searchInput');
    if (searchInput2) searchInput2.value = q2;
    syncProductsBrowseChromeFromUrl();
    loadProducts(1, getCurrentCategoryFromUrl(), q2);
  });
}

function renderProductsPagination(paginationEl, data, categoryId) {
  if (!paginationEl) return;
  const page = Number(data.page) || 1;
  const totalPages = Number(data.totalPages) || 1;

  if (totalPages <= 1) {
    paginationEl.innerHTML = '';
    return;
  }

  paginationEl.innerHTML = '';

  const goTo = (target) => {
    const n = Math.min(totalPages, Math.max(1, Number(target) || 1));
    if (n === page) return;
    loadProducts(n, categoryId, undefined, true);
  };

  const addBtn = (label, targetPage, disabled) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.disabled = Boolean(disabled);
    if (!disabled) btn.addEventListener('click', () => goTo(targetPage));
    paginationEl.appendChild(btn);
    return btn;
  };

  addBtn('First', 1, page <= 1);
  addBtn('Prev', page - 1, page <= 1);

  const status = document.createElement('span');
  status.className = 'pagination__status';
  status.textContent = `Page ${page} of ${totalPages}`;
  paginationEl.appendChild(status);

  addBtn('Next', page + 1, page >= totalPages);
  addBtn('Last', totalPages, page >= totalPages);

  const gotoWrap = document.createElement('form');
  gotoWrap.className = 'pagination__goto';
  gotoWrap.setAttribute('aria-label', 'Go to page');

  const label = document.createElement('label');
  label.htmlFor = 'paginationPageInput';
  label.textContent = 'Go to';

  const input = document.createElement('input');
  input.type = 'number';
  input.id = 'paginationPageInput';
  input.min = '1';
  input.max = String(totalPages);
  input.value = String(page);
  input.inputMode = 'numeric';

  const goBtn = document.createElement('button');
  goBtn.type = 'submit';
  goBtn.textContent = 'Go';

  gotoWrap.appendChild(label);
  gotoWrap.appendChild(input);
  gotoWrap.appendChild(goBtn);
  gotoWrap.addEventListener('submit', (e) => {
    e.preventDefault();
    goTo(input.value);
  });
  paginationEl.appendChild(gotoWrap);
}

async function loadProducts(page = 1, categoryId = null, searchQuery, scrollToTop = false) {
  const grid = document.getElementById('productGrid');
  const pagination = document.getElementById('pagination');
  if (!grid) return;

  if (searchQuery !== undefined) {
    currentProductSearch = String(searchQuery).trim();
  }
  const qParam = currentProductSearch ? `&q=${encodeURIComponent(currentProductSearch)}` : '';
  const pageSize = resolveProductPageSize();
  currentProductPageSize = pageSize;
  currentProductGridColumns = getProductGridColumnCount();

  try {
    let data;
    if (categoryId) {
      data = await callApi(`/categories/${categoryId}/products?page=${page}&limit=${pageSize}${qParam}`);
    } else {
      data = await callApi(`/products?page=${page}&limit=${pageSize}${qParam}`);
    }
    const items = data.items || [];
    grid.innerHTML = items.length
      ? items.map((p, i) => renderProductCardMarkup(p, { priority: i < 4 })).join('')
      : '<p>No products match your search.</p>';
    bindProductCardControls(grid);

    renderProductsPagination(pagination, data, categoryId);

    if (scrollToTop) {
      scrollProductsBrowseIntoView();
    }
  } catch (err) {
    grid.innerHTML = '<p>Failed to load products. Make sure the server is running.</p>';
  }
}

function initResponsiveProductPageSizeReload() {
  const onResize = () => {
    const nextColumns = getProductGridColumnCount();
    if (nextColumns === currentProductGridColumns) return;
    const categoryId = getCurrentCategoryFromUrl();
    loadProducts(1, categoryId);
  };
  window.addEventListener('resize', onResize);
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
    syncQueryInUrl(q);
    loadProducts(1, getCurrentCategoryFromUrl(), q);
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
  initLogout();
  updateNav();
  const categoryId = getCurrentCategoryFromUrl();
  const q = new URLSearchParams(location.search).get('q') || '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = q;
  initHomeSearch();
  initResponsiveProductPageSizeReload();
  initHomeBrowseHistory();
  initCategoryRequestModal();

  // Paint from cache immediately; fetch everything in parallel (don't gate products on brand/session).
  applyCachedBrandSettings();
  await Promise.all([
    ensureValidSession(),
    loadBrandSettings({ backgroundRefresh: true }),
    loadCartCount(),
    loadCategories(),
    loadProducts(1, categoryId, q),
  ]);
  syncProductsBrowseChromeFromUrl();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomePage);
} else {
  initHomePage();
}

window.addEventListener('pageshow', (e) => {
  if (!e.persisted || !document.getElementById('productGrid')) return;
  const categoryId = getCurrentCategoryFromUrl();
  const q = new URLSearchParams(location.search).get('q') || '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = q;
  syncProductsBrowseChromeFromUrl();
  void Promise.all([loadBrandSettings(), loadProducts(1, categoryId, q)]);
});
