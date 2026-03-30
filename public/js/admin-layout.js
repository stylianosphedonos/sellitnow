(function () {
  var mq = window.matchMedia('(max-width: 768px)');

  function shortTitle() {
    var t = document.title || 'Admin';
    var i = t.indexOf(' - ');
    if (i !== -1) return t.slice(0, i).trim();
    return t.trim() || 'Admin';
  }

  function init() {
    var layout = document.querySelector('.admin-layout');
    var sidebar = document.querySelector('.admin-sidebar');
    if (!layout || !sidebar) return;

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
