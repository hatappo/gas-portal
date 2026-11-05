(() => {
  'use strict';
  // Settings offers a bookmarklet that shows a page's icon URL for the icon column.
  // It runs in the user's own tab, so it sees icons declared in HTML on signed-in pages.
  if (!document.getElementById('favicon-finder-link')) return;
  const link = /** @type {HTMLAnchorElement} */ (document.getElementById('favicon-finder-link'));
  const code = /** @type {HTMLTextAreaElement} */ (document.getElementById('favicon-finder-code'));
  const copy = /** @type {HTMLButtonElement} */ (document.getElementById('favicon-finder-copy'));
  const status = /** @type {HTMLElement} */ (document.getElementById('favicon-finder-status'));
  /** @param {string} key */
  const t = (key) => PortalI18n.t(key, document.documentElement.lang);

  /** Runs on the visited page, not in the portal. Keep it self-contained.
   * Prefer the largest https icon the page declares, then the site's /favicon.ico.
   * @param {string} title @param {string} none
   */
  function findFavicon(title, none) {
    let best = '';
    let bestSize = -1;
    const links = document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]');
    Array.prototype.forEach.call(links, (/** @type {HTMLLinkElement} */ icon) => {
      if (!/^https:/i.test(icon.href)) return;
      let size = 0;
      (icon.getAttribute('sizes') || '').split(/\s+/).forEach((value) => {
        const match = /^(\d+)x\d+$/i.exec(value);
        if (match) size = Math.max(size, Number(match[1]));
        if (value.toLowerCase() === 'any') size = Math.max(size, 512);
      });
      if (!size && /apple-touch-icon/i.test(icon.rel)) size = 180;
      if (size > bestSize) { best = icon.href; bestSize = size; }
    });
    if (!best && location.protocol === 'https:') best = location.origin + '/favicon.ico';
    if (best) window.prompt(title, best);
    else window.alert(none);
  }

  function render() {
    const source = '(' + findFavicon.toString() + ')(' +
      JSON.stringify(t('Favicon URL for the icon column')) + ',' + JSON.stringify(t('No https icon found on this page.')) + ')';
    // Percent-encoding keeps line breaks and comments intact; browsers decode javascript: URLs before running them.
    const bookmarklet = 'javascript:' + encodeURIComponent(source);
    link.href = bookmarklet;
    code.value = bookmarklet;
  }
  render();
  document.addEventListener('portal:languagechange', render);

  // Clicking would run the finder on the portal itself; it is meant to be dragged.
  link.addEventListener('click', (event) => {
    event.preventDefault();
    status.textContent = t('Drag this link to your bookmarks bar instead of clicking it.');
  });

  copy.addEventListener('click', () => {
    const manual = () => {
      // The code sits in a collapsed section; open it so the selection is visible and focusable.
      const details = code.closest('details');
      if (details) details.open = true;
      code.focus();
      code.select();
      status.textContent = t('Copying is not available here. The code is selected; press Ctrl+C or ⌘C.');
    };
    try {
      navigator.clipboard.writeText(code.value).then(() => { status.textContent = t('Copied'); }, manual);
    } catch { manual(); }
  });
})();
