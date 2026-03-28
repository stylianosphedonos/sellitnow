/**
 * Static hosting (e.g. Cloudflare Workers with assets.directory = "public") has no Express API.
 * Deploy the Node app separately (Render, Railway, Fly, VPS) and set the API URL before other scripts:
 *
 *   <script>
 *     window.__SELLITNOW_API_BASE__ = 'https://your-api.example.com/api/v1';
 *   </script>
 *   <script src="/js/runtime-config.js"></script>
 *
 * If the API lives on another origin, optional explicit origin for /uploads and other paths:
 *   window.__SELLITNOW_BACKEND_ORIGIN__ = 'https://your-api.example.com';
 */
(function (g) {
  function getApiBase() {
    const raw = g.__SELLITNOW_API_BASE__ != null ? String(g.__SELLITNOW_API_BASE__) : '/api/v1';
    return raw.replace(/\/$/, '');
  }

  function backendOrigin() {
    if (g.__SELLITNOW_BACKEND_ORIGIN__) {
      return String(g.__SELLITNOW_BACKEND_ORIGIN__).replace(/\/$/, '');
    }
    const base = getApiBase();
    if (/^https?:\/\//i.test(base)) {
      try {
        return new URL(base.endsWith('/') ? base : base + '/').origin;
      } catch (_) {}
    }
    return '';
  }

  function resolveMediaUrl(url) {
    if (url == null || url === '') return url;
    const s = String(url);
    if (/^https?:\/\//i.test(s)) return s;
    const origin = backendOrigin();
    if (origin && s.startsWith('/')) return origin + s;
    return s;
  }

  function apiUrl(path) {
    const p = path.startsWith('/') ? path : '/' + path;
    return getApiBase() + p;
  }

  g.sellitnowGetApiBase = getApiBase;
  g.sellitnowApiUrl = apiUrl;
  g.sellitnowResolveMediaUrl = resolveMediaUrl;
})(typeof window !== 'undefined' ? window : globalThis);
