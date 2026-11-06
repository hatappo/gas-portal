import { mountCatalogView } from './catalog-view';

// Coordinates catalog RPCs and validation; Solid owns the dynamic lists.
(() => {
  'use strict';
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);

  /** @param {string} id @returns {HTMLElement} */
  function element(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error('Missing UI element: ' + id);
    return node;
  }
  const search = /** @type {HTMLInputElement} */ (element('search'));
  const refresh = /** @type {HTMLButtonElement} */ (element('refresh-catalog'));
  /** @type {{hit: boolean, fetchedAt: number} | undefined} */
  let freshness;
  const reset = /** @type {HTMLButtonElement} */ (element('reset'));
  /** @type {CatalogTool[]} */
  let tools = [];
  /** @type {CatalogWarning[]} */
  let issues = [];
  /** @type {Set<string>} */
  let selectedTags = new Set();
  /** @type {'cards' | 'list'} */
  let view = 'cards';
  let generation = 0;
  let catalogReady = false;
  let resultSignature = '';
  /** @type {Animation | undefined} */
  let resultAnimation;
  // Switching tabs stops the result animation; reduced motion stops it at once.
  document.addEventListener('portal:tabchange', () => resultAnimation?.cancel());
  PortalMotion.onReduce(() => resultAnimation?.cancel());

  /** Skip unchanged results and show the latest input without waiting for earlier animations. @param {string} signature */
  function animateResults(signature) {
    if (signature === resultSignature) return;
    resultSignature = signature;
    resultAnimation?.cancel();
    if (!element('directory').hidden) resultAnimation = PortalMotion.appear(element('results'));
  }

  /** @param {string} text */
  const normalize = (text) => text.normalize('NFKC').toLocaleLowerCase('ja').trim();

  /** @param {string} title @param {string} description @param {boolean} canReset */
  function showStatus(title, description, canReset = false) {
    element('status').hidden = false;
    element('status-title').textContent = title;
    element('status-description').textContent = description;
    reset.hidden = !canReset;
  }

  const updateView = mountCatalogView((values) => {
    selectedTags = new Set(values);
    renderTools();
  }, (mode) => {
    view = mode;
    renderTools();
  });

  /** @param {CatalogTool[]} visible */
  function updateLists(visible) {
    const tags = [...new Set(tools.flatMap((tool) => tool.tags))];
    element('tag-filter').hidden = tags.length === 0;
    element('warnings').hidden = issues.length === 0;
    element('warning-summary').textContent = t('Entries not displayed: {count}. Check the spreadsheet.', { count: issues.length });
    updateView({ disabled: search.disabled, tools: visible, tags, selected: new Set(selectedTags), issues, view,
      language: document.documentElement.lang,
      unblocked: PortalUrlSchemes.normalizeUnblocked(element('url-scheme-settings').dataset.savedValue) });
  }

  function renderTools() {
    const query = normalize(search.value);
    const visible = tools.filter((tool) =>
      [...selectedTags].every((tag) => tool.tags.includes(tag)) &&
      normalize([tool.name, tool.description, ...tool.tags, ...(tool.children || []).map((child) => child.name)].join(' ')).includes(query));
    const list = element('tools');
    list.hidden = view !== 'cards' || visible.length === 0;
    element('table-view').hidden = view !== 'list' || visible.length === 0;
    const count = element('count');
    count.style.setProperty('--count-digits', String(String(tools.length).length));
    count.textContent = t('{visible} / {total} items', { visible: visible.length, total: tools.length });
    updateLists(visible);
    element('status').hidden = visible.length > 0;
    if (tools.length === 0) {
      showStatus(issues.length ? t("No tools can be displayed") : t('No items to display'),
        issues.length ? t("Fix the spreadsheet using the issues listed above.") : t("Add tools to the spreadsheet to display them here."));
    } else if (visible.length === 0) {
      showStatus(t('No items to display'), t("Try a different keyword or tag."), true);
    }
    animateResults(JSON.stringify([view, visible.map((tool) => tool.id)]));
  }

  /** @param {boolean} value */
  function setLoading(value) {
    refresh.disabled = value;
    refresh.setAttribute('aria-busy', String(value));
    setControlsDisabled(value);
    element('directory').setAttribute('aria-busy', String(value));
  }

  /** @param {boolean} value */
  function setControlsDisabled(value) {
    search.disabled = value;
    updateView((previous) => ({ ...previous, disabled: value }));
  }

  /** @param {boolean} [preserveCount] */
  function clearResults(preserveCount = false) {
    resultAnimation?.cancel();
    resultSignature = '';
    updateView((previous) => ({ ...previous, tools: [], tags: [], issues: [] }));
    element('tools').hidden = true;
    element('table-view').hidden = true;
    element('tag-filter').hidden = true;
    element('warnings').hidden = true;
    if (!preserveCount) element('count').textContent = '';
  }

  /** @param {string | undefined} message */
  function showError(message = undefined) {
    setLoading(false);
    setControlsDisabled(true);
    catalogReady = false;
    freshness = undefined;
    renderFreshness();
    tools = [];
    issues = [];
    clearResults();
    showStatus(t("Could not load the tool list"), (message ? PortalI18n.translate(message, document.documentElement.lang) : '') || t("Select Fetch latest to try again. If the problem persists, check the GAS settings."));
  }

  /**
   * Validate one tool from the response. The server applies the same shared rules, so this only
   * matters for data it should have rejected; even then only the offending part is dropped:
   * an invalid related link or icon is removed, and an invalid tool is skipped, never the whole list.
   * @param {CatalogTool} tool
   * @returns {CatalogTool | null}
   */
  function sanitizeTool(tool) {
    if (!tool || typeof tool !== 'object' || ['id', 'name', 'url', 'description'].some((key) =>
      typeof tool[/** @type {keyof CatalogTool} */ (key)] !== 'string') || !safeUrl(tool.url)) return null;
    if (!Array.isArray(tool.tags) || !tool.tags.every((tag) => typeof tag === 'string')) return null;
    const children = (Array.isArray(tool.children) ? tool.children : []).filter((child) => child &&
      ['name', 'url', 'description'].every((key) => typeof child[/** @type {keyof CatalogChild} */ (key)] === 'string') &&
      child.name.trim() && safeUrl(child.url)).map((child) => safeIcon(child.icon) ? child : { ...child, icon: undefined });
    return { ...tool, children, icon: safeIcon(tool.icon) ? tool.icon : undefined };
  }

  /** @param {unknown} icon */
  function safeIcon(icon) {
    return icon === undefined || (typeof icon === 'string' && Boolean(icon.trim()) && PortalCatalogRules.isValidIcon(icon) &&
      (!PortalCatalogRules.isIconUrl(icon) || safeUrl(icon)));
  }

  /** Shared syntax rules plus the browser's own parser; blocked schemes are still rendered, without a link. @param {string} value */
  function safeUrl(value) {
    if (!PortalCatalogRules.isValidLinkUrl(value)) return false;
    try {
      const url = new URL(value);
      // Credentials matter for web hosts; "@" is ordinary in schemes such as mailto:.
      const web = url.protocol === 'https:' || url.protocol === 'http:';
      return Boolean(PortalUrlSchemes.schemeOf(value)) && !(web && (url.username || url.password));
    } catch {
      return false;
    }
  }

  function renderFreshness() {
    const target = element('catalog-freshness');
    target.hidden = !freshness;
    if (!freshness) { target.textContent = ''; return; }
    const time = new Date(freshness.fetchedAt).toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    target.textContent = t(freshness.hit ? 'Cached · Retrieved {time}' : 'Retrieved {time}', { time });
  }

  /** Use the same validation and rendering for embedded data and refresh responses. @param {CatalogResponse} response */
  function receiveCatalog(response) {
    if (response && !response.ok && typeof response.error === 'string') {
      showError(response.error);
      return;
    }
    if (!response || !response.ok || !Array.isArray(response.tools) || !Array.isArray(response.issues)) {
      showError();
      return;
    }
    /** @type {CatalogWarning[]} */
    const skipped = [];
    const accepted = /** @type {CatalogTool[]} */ (response.tools.map((tool) => {
      const safe = sanitizeTool(tool);
      if (!safe) skipped.push({ row: 0, message: t('"{name}" could not be displayed in this browser.', { name: typeof tool?.name === 'string' ? tool.name : '?' }) });
      return safe;
    }).filter(Boolean));
    catalogReady = true;
    freshness = response.cache && typeof response.cache.hit === 'boolean' && Number.isFinite(response.cache.fetchedAt) && response.cache.fetchedAt > 0 ? response.cache : undefined;
    renderFreshness();
    tools = accepted;
    issues = [...response.issues, ...skipped];
    const availableTags = new Set(tools.flatMap((tool) => tool.tags));
    selectedTags = new Set([...selectedTags].filter((tag) => availableTags.has(tag)));
    setLoading(false);
    renderTools();
  }

  /** @param {boolean} [forceRefresh] */
  function loadCatalog(forceRefresh = false) {
    catalogReady = false;
    // Keep the previous summary while loading and reserve its width even if the next
    // timestamp is shorter (for example, a cache hit followed by a live refresh).
    refresh.style.minWidth = Math.max(44, Math.ceil(refresh.getBoundingClientRect().width)) + 'px';
    setLoading(true);
    const current = ++generation;
    clearResults(true);
    element('status').hidden = true;
    element('status-title').textContent = '';
    element('status-description').textContent = '';
    // Stop waiting after the timeout and ignore late responses.
    const timeout = window.setTimeout(() => {
      if (current !== generation) return;
      generation += 1;
      showError();
    }, 30000);
    const failure = () => {
      window.clearTimeout(timeout);
      if (current === generation) showError();
    };
    try {
      google.script.run.withSuccessHandler((/** @type {CatalogResponse} */ response) => {
        window.clearTimeout(timeout);
        if (current !== generation) return;
        receiveCatalog(response);
      }).withFailureHandler(failure).getCatalog(forceRefresh);
    } catch {
      failure();
    }
  }

  refresh.addEventListener('click', () => { if (!refresh.disabled) loadCatalog(true); });
  search.addEventListener('input', renderTools);
  reset.addEventListener('click', () => {
    search.value = '';
    selectedTags.clear();
    renderTools();
    search.focus();
  });
  document.addEventListener('portal:urlschemeschange', () => {
    if (catalogReady) renderTools();
  });
  document.addEventListener('portal:languagechange', () => {
    renderFreshness();
    if (!catalogReady) {
      updateView((previous) => ({ ...previous, language: document.documentElement.lang }));
      return;
    }
    renderTools();
  });
  const initial = document.getElementById('initial-catalog')?.textContent?.trim();
  if (initial) {
    try { receiveCatalog(JSON.parse(initial)); }
    catch { showError(); }
  } else {
    // Only test fixtures render without embedded data; the built page always embeds it.
    loadCatalog();
  }
})();
