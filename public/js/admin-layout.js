(function () {
  var mq = window.matchMedia('(max-width: 768px)');

  function shortTitle() {
    var t = document.title || 'Admin';
    var i = t.indexOf(' - ');
    if (i !== -1) return t.slice(0, i).trim();
    return t.trim() || 'Admin';
  }

  function storeName() {
    var i = document.title.indexOf(' - ');
    if (i !== -1) {
      var rest = document.title.slice(i + 3).trim();
      if (rest) return rest;
    }
    return 'Admin';
  }

  function normalizePath(path) {
    if (!path) return '/';
    if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
    return path;
  }

  function isNavActive(href) {
    var current = normalizePath(window.location.pathname);
    var target = normalizePath(href.split('?')[0].split('#')[0]);
    if (target === '/admin' || target === '/admin/index.html') {
      return current === '/admin' || current === '/admin/index.html';
    }
    if (current === target) return true;
    if (target.endsWith('.html') && current === target.replace(/\.html$/, '')) return true;
    return false;
  }

  function enhanceSidebar(sidebar) {
    if (sidebar.dataset.enhanced === '1') return;
    sidebar.dataset.enhanced = '1';

    var links = Array.prototype.slice.call(sidebar.querySelectorAll('a'));
    var storeLinks = [];
    var configLinks = [];
    var footerLink = null;

    links.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (href === '/' || a.textContent.indexOf('Back to Store') !== -1) {
        footerLink = a;
        return;
      }
      if (href.indexOf('/admin/settings') !== -1 || href.indexOf('/admin/brand') !== -1 || href.indexOf('/admin/user-management') !== -1) {
        configLinks.push(a);
      } else {
        storeLinks.push(a);
      }
    });

    var brand = document.createElement('div');
    brand.className = 'admin-sidebar__brand';
    brand.innerHTML =
      '<span class="admin-sidebar__brand-title">Management</span>' +
      '<span class="admin-sidebar__brand-name">' +
      escapeHtml(storeName()) +
      '</span>';

    var nav = document.createElement('nav');
    nav.className = 'admin-sidebar__nav';
    nav.setAttribute('aria-label', 'Admin navigation');

    function appendGroup(label, groupLinks) {
      if (!groupLinks.length) return;
      var lbl = document.createElement('span');
      lbl.className = 'admin-sidebar__label';
      lbl.textContent = label;
      nav.appendChild(lbl);
      groupLinks.forEach(function (a) {
        if (isNavActive(a.getAttribute('href') || '')) a.classList.add('active');
        nav.appendChild(a);
      });
    }

    appendGroup('Store', storeLinks);
    appendGroup('Configuration', configLinks);

    sidebar.textContent = '';
    sidebar.appendChild(brand);
    sidebar.appendChild(nav);

    if (footerLink) {
      var footer = document.createElement('div');
      footer.className = 'admin-sidebar__footer';
      footer.appendChild(footerLink);
      sidebar.appendChild(footer);
    }
  }

  function escapeHtml(s) {
    var d = document.createElement('span');
    d.textContent = s;
    return d.innerHTML;
  }

  function statusBadgeClass(status) {
    var s = String(status || '').toLowerCase();
    if (['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'draft', 'active', 'archived'].indexOf(s) !== -1) {
      return 'badge badge--' + s;
    }
    return 'badge';
  }

  window.adminStatusBadge = function (status) {
    var cls = statusBadgeClass(status);
    return '<span class="' + cls + '">' + escapeHtml(String(status || '')) + '</span>';
  };

  function init() {
    var layout = document.querySelector('.admin-layout');
    var sidebar = document.querySelector('.admin-sidebar');
    if (!layout || !sidebar) return;

    enhanceSidebar(sidebar);

    if (!sidebar.id) sidebar.id = 'admin-sidebar-nav';

    var overlay = document.createElement('div');
    overlay.className = 'admin-nav-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    var topbar = document.createElement('header');
    topbar.className = 'admin-mobile-topbar';
    topbar.innerHTML =
      '<button type="button" class="admin-nav-toggle" aria-expanded="false" aria-controls="' +
      sidebar.id +
      '" aria-label="Open menu">' +
      '<span class="admin-nav-toggle__bars" aria-hidden="true"><span></span><span></span><span></span></span>' +
      '</button>' +
      '<span class="admin-mobile-topbar__title"></span>';

    var titleEl = topbar.querySelector('.admin-mobile-topbar__title');
    var toggleBtn = topbar.querySelector('.admin-nav-toggle');

    layout.insertBefore(topbar, layout.firstChild);
    sidebar.after(overlay);

    function syncTitle() {
      if (titleEl) titleEl.textContent = shortTitle();
    }
    syncTitle();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) syncTitle();
    });

    function setOpen(open) {
      layout.classList.toggle('admin-layout--nav-open', open);
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggleBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (mq.matches) {
        document.body.style.overflow = open ? 'hidden' : '';
      } else {
        document.body.style.overflow = '';
      }
    }

    function toggle() {
      if (!mq.matches) return;
      setOpen(!layout.classList.contains('admin-layout--nav-open'));
    }

    toggleBtn.addEventListener('click', toggle);
    overlay.addEventListener('click', function () {
      setOpen(false);
    });

    sidebar.addEventListener('click', function (e) {
      if (mq.matches && e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });

    function onMqChange() {
      if (!mq.matches) setOpen(false);
    }
    if (mq.addEventListener) mq.addEventListener('change', onMqChange);
    else mq.addListener(onMqChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
