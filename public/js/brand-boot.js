(function (g) {
  function readCachedBrand() {
    try {
      const raw = g.localStorage ? g.localStorage.getItem('sellitnow.brand') : null;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function applyThemeVars(data) {
    if (!data || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (data.primary) root.style.setProperty('--primary', data.primary);
    if (data.primaryDark) root.style.setProperty('--primary-dark', data.primaryDark);
    if (data.secondary) root.style.setProperty('--secondary', data.secondary);
    if (data.accent) root.style.setProperty('--accent', data.accent);
    if (data.currency) g.__storeCurrency = String(data.currency).toUpperCase();
  }

  applyThemeVars(readCachedBrand());
})(typeof window !== 'undefined' ? window : globalThis);
