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
  /** @type {'all' | 'internal' | 'external'} */
  let selectedScope = 'all';
  /** @type {'cards' | 'list'} */
  let view = 'cards';
  let generation = 0;
  let catalogReady = false;
  let resultSignature = '';
  /** @type {Animation | undefined} */
  let resultAnimation;
  /** @type {Animation | undefined} */
  let panelAnimation;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  reducedMotion?.addEventListener('change', () => {
    if (reducedMotion.matches) {
      resultAnimation?.cancel();
      panelAnimation?.cancel();
    }
  });

  /** @param {HTMLElement} target */
  function animateAppearance(target) {
    if (reducedMotion?.matches || typeof target.animate !== 'function') return;
    return target.animate([
      { opacity: 0.45, transform: 'translateY(5px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }

  /** Skip unchanged results and show the latest input without waiting for earlier animations. @param {string} signature */
  function animateResults(signature) {
    if (signature === resultSignature) return;
    resultSignature = signature;
    resultAnimation?.cancel();
    if (!element('directory').hidden) resultAnimation = animateAppearance(element('results'));
  }

  const portalTabs = [
    { hash: 'tools', button: element('tab-tools'), panel: element('directory') },
    { hash: 'actions', button: element('tab-actions'), panel: element('actions-panel') },
    { hash: 'settings', button: element('tab-settings'), panel: element('settings-panel') },
  ];
  const settingsTabs = ['appearance', 'tools', 'actions'].map((hash) => ({
    hash, button: element('settings-tab-' + hash), panel: element('settings-' + hash + '-panel'),
  }));
  let activeSettingsTab = 0;
  /** @param {number} index */
  function selectSettingsTab(index) {
    activeSettingsTab = index;
    settingsTabs.forEach(({ button, panel }, current) => {
      button.setAttribute('aria-selected', String(current === index));
      button.tabIndex = current === index ? 0 : -1;
      panel.hidden = current !== index;
    });
  }
  let activeTab = 0;
  /** @param {number} index */
  function selectPortalTab(index) {
    if (activeTab === index) return;
    activeTab = index;
    resultAnimation?.cancel();
    panelAnimation?.cancel();
    portalTabs.forEach(({ button, panel }, current) => {
      button.setAttribute('aria-selected', String(current === index));
      button.tabIndex = current === index ? 0 : -1;
      panel.hidden = current !== index;
    });
    panelAnimation = animateAppearance(portalTabs[index].panel);
    document.dispatchEvent(new CustomEvent('portal:tabchange', { detail: portalTabs[index].hash }));
  }
  // GAS renders this code in a sandbox iframe. Its bridge controls the public URL;
  // the local preview uses the browser history API instead.
  const gasHistory = typeof google !== 'undefined' ? google.script?.history : undefined;
  const gasUrl = typeof google !== 'undefined' ? google.script?.url : undefined;
  const useGasHistory = typeof gasHistory?.push === 'function' && typeof gasHistory?.setChangeHandler === 'function' && typeof gasUrl?.getLocation === 'function';
  let routeHash = '';
  let navigationRevision = 0;

  /** @param {string | undefined} hash */
  function applyRoute(hash) {
    routeHash = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
    // Preserve the skip-to-content link without treating it as a tab route.
    if (routeHash === 'main') return;
    const [main, section] = routeHash.split('/');
    if (main === 'settings') {
      const sectionIndex = settingsTabs.findIndex((tab) => tab.hash === section);
      selectSettingsTab(sectionIndex < 0 ? 0 : sectionIndex);
    }
    const index = portalTabs.findIndex((tab) => tab.hash === (main === 'settings' ? main : routeHash));
    selectPortalTab(index < 0 ? 0 : index);
  }

  /** @param {number} index @param {string} [hash] */
  function navigatePortalTab(index, hash = index === 2 && activeSettingsTab !== 0 ? 'settings/' + settingsTabs[activeSettingsTab].hash : portalTabs[index].hash) {
    navigationRevision++;
    selectPortalTab(index);
    if (routeHash === hash) return;
    try {
      if (useGasHistory) gasHistory?.push(null, null, hash);
      else window.history.pushState(window.history.state, '', '#' + hash);
      routeHash = hash;
    } catch {
      // A bridge failure must not prevent switching tabs or discard form drafts.
      console.warn('PORTAL_NAVIGATION_UPDATE_FAILED');
    }
  }

  if (useGasHistory) {
    try {
      gasHistory?.setChangeHandler((event) => {
        navigationRevision++;
        applyRoute(event.location?.hash);
      });
      const initialRevision = navigationRevision;
      gasUrl?.getLocation((location) => {
        if (navigationRevision === initialRevision) applyRoute(location.hash);
      });
    } catch { console.warn('PORTAL_NAVIGATION_INIT_FAILED'); }
  } else {
    const syncRoute = () => { navigationRevision++; applyRoute(window.location.hash); };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    applyRoute(window.location.hash);
  }

  settingsTabs.forEach(({ button }, index) => {
    const navigate = (/** @type {number} */ next) => {
      selectSettingsTab(next);
      navigatePortalTab(2, 'settings/' + settingsTabs[next].hash);
    };
    button.addEventListener('click', () => navigate(index));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % settingsTabs.length;
      else if (event.key === 'ArrowLeft') next = (index + settingsTabs.length - 1) % settingsTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = settingsTabs.length - 1;
      else return;
      event.preventDefault();
      navigate(next);
      settingsTabs[next].button.focus();
    });
  });

  portalTabs.forEach(({ button }, index) => {
    button.addEventListener('click', () => navigatePortalTab(index));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % portalTabs.length;
      else if (event.key === 'ArrowLeft') next = (index + portalTabs.length - 1) % portalTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = portalTabs.length - 1;
      else return;
      event.preventDefault();
      navigatePortalTab(next);
      portalTabs[next].button.focus();
    });
  });

  /** @param {string} text */
  const normalize = (text) => text.normalize('NFKC').toLocaleLowerCase('ja').trim();

  /** @param {string} title @param {string} description @param {boolean} canReset */
  function showStatus(title, description, canReset = false) {
    element('status').hidden = false;
    element('status-title').textContent = title;
    element('status-description').textContent = description;
    reset.hidden = !canReset;
  }

  function renderTags() {
    const container = element('tags');
    container.replaceChildren();
    const tags = [...new Set(tools.flatMap((tool) => tool.tags))];
    element('tag-filter').hidden = tags.length === 0;
    /** @param {string} label @param {string | null} value */
    const addButton = (label, value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tag-button';
      button.textContent = label;
      button.setAttribute('aria-pressed', String(value === null ? selectedTags.size === 0 : selectedTags.has(value)));
      button.addEventListener('click', () => {
        if (value === null) selectedTags.clear();
        else if (selectedTags.has(value)) selectedTags.delete(value);
        else selectedTags.add(value);
        // Keep the clicked button in place to preserve keyboard focus.
        container.querySelectorAll('button').forEach((item, index) => {
          item.setAttribute('aria-pressed', String(index === 0 ? selectedTags.size === 0 : selectedTags.has(tags[index - 1])));
        });
        renderTools();
      });
      container.append(button);
    };
    addButton(t("All"), null);
    tags.forEach((tag) => addButton(tag, tag));
  }

  function updateScopeButtons() {
    for (const scope of ['all', 'internal', 'external']) {
      element('scope-' + scope).setAttribute('aria-pressed', String(scope === selectedScope));
    }
  }

  /** @param {CatalogTool} tool */
  function scopeBadge(tool) {
    const badge = document.createElement('span');
    badge.className = 'scope-badge scope-' + tool.scope;
    badge.textContent = tool.scope === 'internal' ? t("Internal") : t("External");
    return badge;
  }

  /** @param {CatalogTool} tool */
  function tagLabels(tool) {
    const labels = document.createElement('div');
    labels.className = 'tool-tags';
    labels.hidden = tool.tags.length === 0;
    tool.tags.forEach((tag) => {
      const label = document.createElement('span');
      label.className = 'tool-tag';
      label.textContent = tag;
      labels.append(label);
    });
    return labels;
  }

  /** @param {{url: string}} tool */
  function toolLink(tool) {
    const link = document.createElement('a');
    link.href = tool.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const newTab = document.createElement('span');
    newTab.className = 'visually-hidden';
    newTab.textContent = t("(opens in a new tab)");
    link.append(newTab);
    return link;
  }

  /** @param {CatalogTool} tool */
  function relatedLinks(tool) {
    const list = document.createElement('ul');
    list.className = 'related-links';
    list.setAttribute('aria-label', t('Related links for {name}', { name: tool.name }));
    (tool.relatedLinks || []).forEach((related) => {
      const item = document.createElement('li');
      const link = toolLink(related);
      link.prepend(document.createTextNode(related.label));
      item.append(link);
      list.append(item);
    });
    return list;
  }

  /** @param {CatalogTool} tool */
  function card(tool) {
    const item = document.createElement('li');
    const container = document.createElement('article');
    container.className = 'tool-card';
    const link = toolLink(tool);
    link.className = 'tool-main';
    const title = document.createElement('h3');
    title.textContent = tool.name;
    const description = document.createElement('p');
    description.className = 'tool-description';
    description.textContent = tool.description;
    link.prepend(scopeBadge(tool), title, description, tagLabels(tool));
    container.append(link);
    if (tool.relatedLinks?.length) container.append(relatedLinks(tool));
    item.append(container);
    return item;
  }

  /** @param {CatalogTool} tool */
  function tableRow(tool) {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    const link = toolLink(tool);
    link.prepend(document.createTextNode(tool.name));
    name.append(link);
    const description = document.createElement('td');
    description.textContent = tool.description || '—';
    const scope = document.createElement('td');
    scope.append(scopeBadge(tool));
    const tags = document.createElement('td');
    tags.append(tagLabels(tool));
    const related = document.createElement('td');
    if (tool.relatedLinks?.length) related.append(relatedLinks(tool));
    else related.textContent = '—';
    row.append(name, description, scope, tags, related);
    return row;
  }

  function renderWarnings() {
    element('warnings').hidden = issues.length === 0;
    element('warning-summary').textContent = t('Entries not displayed: {count}. Check the spreadsheet.', { count: issues.length });
    const list = element('warning-list');
    list.replaceChildren();
    issues.forEach((issue) => {
      const item = document.createElement('li');
      item.textContent = t('Row {row}: {message}', { row: issue.row, message: PortalI18n.translate(issue.message, document.documentElement.lang) });
      list.append(item);
    });
  }

  function renderTools() {
    const query = normalize(search.value);
    const visible = tools.filter((tool) =>
      (selectedScope === 'all' || selectedScope === tool.scope) &&
      [...selectedTags].every((tag) => tool.tags.includes(tag)) &&
      normalize([tool.name, tool.description, ...tool.tags].join(' ')).includes(query));
    const list = element('tools');
    list.replaceChildren();
    const rows = element('tool-rows');
    rows.replaceChildren();
    list.hidden = view !== 'cards' || visible.length === 0;
    element('table-view').hidden = view !== 'list' || visible.length === 0;
    const count = element('count');
    count.style.setProperty('--count-digits', String(String(tools.length).length));
    count.textContent = t('{visible} / {total} items', { visible: visible.length, total: tools.length });
    visible.forEach((tool) => view === 'cards' ? list.append(card(tool)) : rows.append(tableRow(tool)));
    element('status').hidden = visible.length > 0;
    if (tools.length === 0) {
      showStatus(issues.length ? t("No tools can be displayed") : t('No items to display'),
        issues.length ? t("Fix the spreadsheet using the issues listed above.") : t("Add tools to the spreadsheet to display them here."));
    } else if (visible.length === 0) {
      showStatus(t('No items to display'), t("Try a different keyword, scope, or tag."), true);
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
    document.querySelectorAll('#scopes button, .view-switch button').forEach((button) => {
      /** @type {HTMLButtonElement} */ (button).disabled = value;
    });
  }

  /** @param {boolean} [preserveCount] */
  function clearResults(preserveCount = false) {
    resultAnimation?.cancel();
    resultSignature = '';
    element('tools').replaceChildren();
    element('tool-rows').replaceChildren();
    element('tools').hidden = true;
    element('table-view').hidden = true;
    element('tags').replaceChildren();
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

  /** @param {CatalogTool} tool */
  function safeTool(tool) {
    if (!tool || ['id', 'name', 'url', 'description'].some((key) =>
      typeof tool[/** @type {keyof CatalogTool} */ (key)] !== 'string')) return false;
    if (!['internal', 'external'].includes(tool.scope) || !Array.isArray(tool.tags) ||
        !tool.tags.every((tag) => typeof tag === 'string')) return false;
    if (tool.relatedLinks !== undefined && (!Array.isArray(tool.relatedLinks) ||
        !tool.relatedLinks.every((link) => link && typeof link.label === 'string' &&
          link.label.trim() && typeof link.url === 'string' && safeUrl(link.url)))) return false;
    return safeUrl(tool.url);
  }

  /** @param {string} value */
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
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
    if (!response || !response.ok || !Array.isArray(response.tools) ||
        !Array.isArray(response.issues) || !response.tools.every(safeTool)) {
      showError();
      return;
    }
    catalogReady = true;
    freshness = response.cache && typeof response.cache.hit === 'boolean' && Number.isFinite(response.cache.fetchedAt) && response.cache.fetchedAt > 0 ? response.cache : undefined;
    renderFreshness();
    tools = response.tools;
    issues = response.issues;
    const availableTags = new Set(tools.flatMap((tool) => tool.tags));
    selectedTags = new Set([...selectedTags].filter((tag) => availableTags.has(tag)));
    setLoading(false);
    renderTags();
    renderWarnings();
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
  /** @type {('all' | 'internal' | 'external')[]} */
  const scopes = ['all', 'internal', 'external'];
  scopes.forEach((scope) => element('scope-' + scope).addEventListener('click', () => {
    selectedScope = scope;
    updateScopeButtons();
    renderTools();
  }));
  /** @type {('cards' | 'list')[]} */
  const views = ['cards', 'list'];
  views.forEach((mode) => element('view-' + mode).addEventListener('click', () => {
    view = mode;
    views.forEach((item) => element('view-' + item).setAttribute('aria-pressed', String(item === view)));
    renderTools();
  }));
  reset.addEventListener('click', () => {
    search.value = '';
    selectedScope = 'all';
    selectedTags.clear();
    updateScopeButtons();
    renderTags();
    renderTools();
    search.focus();
  });
  document.addEventListener('portal:languagechange', () => {
    renderFreshness();
    if (!catalogReady) return;
    renderTags();
    renderWarnings();
    renderTools();
  });
  const initial = document.getElementById('initial-catalog')?.textContent?.trim();
  if (initial) {
    try { receiveCatalog(JSON.parse(initial)); }
    catch { showError(); }
  } else {
    // Retain compatibility with older HTML and development fixtures without embedded data.
    loadCatalog();
  }
})();
