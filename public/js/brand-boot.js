(function (g) {
  function readCachedBrand() {
    try {
      if (!g.localStorage) return null;
      const raw =
        g.localStorage.getItem('3nitylab.brand') || g.localStorage.getItem('sellitnow.brand');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function resolveMediaUrl(url) {
    if (url == null || url === '') return url;
    if (typeof g.sellitnowResolveMediaUrl === 'function') return g.sellitnowResolveMediaUrl(url);
    return String(url);
  }

  function preloadHeroBanner(resolvedUrl) {
    if (!resolvedUrl || typeof document === 'undefined') return;
    try {
      const href = String(resolvedUrl);
      if (document.querySelector('link[data-hero-preload="1"]')) return;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      link.setAttribute('data-hero-preload', '1');
      document.head.appendChild(link);
    } catch (_) {}
  }

  function cachedHeroHasCopy(data) {
    if (!data || typeof data !== 'object') return false;
    const fields = [data.heroTitle, data.heroSubtitle, data.heroTitleEl, data.heroSubtitleEl];
    return fields.some((v) => v != null && String(v).trim() !== '');
  }

  function applyThemeVars(data) {
    if (!data || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (data.primary) root.style.setProperty('--primary', data.primary);
    if (data.primaryDark) root.style.setProperty('--primary-dark', data.primaryDark);
    if (data.secondary) root.style.setProperty('--secondary', data.secondary);
    if (data.accent) root.style.setProperty('--accent', data.accent);
    if (data.headerShadow) root.style.setProperty('--header-shadow', data.headerShadow);
    if (data.currency) g.__storeCurrency = String(data.currency).toUpperCase();

    // Avoid orange hero flash: decide banner vs gradient before first paint when cache exists.
    const banner = data.banner && String(data.banner).trim();
    if (banner) {
      root.classList.add('has-hero-banner');
      root.classList.remove('hero-use-gradient');
      const resolved = resolveMediaUrl(banner);
      root.style.setProperty('--hero-banner-image', 'url(' + JSON.stringify(resolved) + ')');
      const overlayRaw = data.heroBannerOverlay;
      let overlay = 0.35;
      if (overlayRaw != null && String(overlayRaw).trim() !== '') {
        const n = Number(overlayRaw);
        if (Number.isFinite(n)) overlay = Math.min(0.85, Math.max(0, n));
      }
      root.style.setProperty('--hero-banner-overlay', String(overlay));
      preloadHeroBanner(resolved);
    } else {
      root.classList.remove('has-hero-banner');
      if (cachedHeroHasCopy(data)) root.classList.add('hero-use-gradient');
      else root.classList.remove('hero-use-gradient');
      root.style.removeProperty('--hero-banner-image');
      root.style.removeProperty('--hero-banner-overlay');
    }
  }

  applyThemeVars(readCachedBrand());
})(typeof window !== 'undefined' ? window : globalThis);
