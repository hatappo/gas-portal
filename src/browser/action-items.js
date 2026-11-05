(() => {
  'use strict';
  /** @param {string} id */
  const el = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);
  const refresh = /** @type {HTMLButtonElement} */ (el('refresh-actions'));
  /** @type {Map<string, {ready: boolean, loading: boolean, error: string}>} */
  const providers = new Map();
  /** @type {Map<string, ActionSource>} */
  const sources = new Map();
  /** Committed results remain visible until the whole batch settles. @type {Map<string, ActionResult>} */
  let results = new Map();
  let generation = 0;
  let loading = false;
  let timer = 0;

  /** @param {string} text @param {string} className */
  function textNode(text, className = '') {
    const node = document.createElement('span'); node.textContent = text; node.className = className; return node;
  }
  /** Providers validate their own origins; the shared renderer also rejects unsafe schemes. @param {string} text @param {string} url */
  function link(text, url) {
    const node = document.createElement('a'); node.textContent = text;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
        node.href = parsed.href; node.target = '_blank'; node.rel = 'noopener noreferrer';
      }
    } catch { /* Invalid destinations stay inert. */ }
    node.append((/** @type {HTMLTemplateElement} */ (el('action-external-icon'))).content.cloneNode(true));
    return node;
  }
  /** @param {string} description */
  function emptyState(description) {
    const box = document.createElement('div'); box.className = 'status'; box.setAttribute('role', 'status');
    const title = document.createElement('h3'); title.textContent = t('No items to display');
    const copy = document.createElement('p'); copy.textContent = t(description);
    box.append(title, copy); return box;
  }
  function render() {
    const pending = loading || [...providers.values()].some((provider) => provider.loading || !provider.ready && !provider.error);
    refresh.disabled = pending || !sources.size && ![...providers.values()].some((provider) => provider.error);
    refresh.setAttribute('aria-busy', String(pending));
    el('action-items').setAttribute('aria-busy', String(pending));
    /** @type {Map<string, ActionItem>} */
    const unique = new Map();
    /** @type {Array<{label: string, notice: ActionNotice}>} */
    const notices = [];
    const timestamps = [];
    for (const provider of providers.values()) if (provider.error) notices.push({ label: '', notice: { message: provider.error } });
    for (const [key, source] of sources) {
      const result = results.get(key);
      if (!result) continue;
      if (result.fetchedAt !== undefined) timestamps.push(result.fetchedAt);
      result.notices.forEach((notice) => notices.push({ label: source.serviceLabel + ' · ' + source.label, notice }));
      for (const item of result.items) {
        const id = item.service + ':' + item.id;
        const previous = unique.get(id);
        const reasons = [...new Set([...(previous?.reasons || []), ...item.reasons])];
        unique.set(id, { ...(previous && Date.parse(previous.updatedAt) > Date.parse(item.updatedAt) ? previous : item), reasons });
      }
    }
    const items = [...unique.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (a.service + ':' + a.id).localeCompare(b.service + ':' + b.id));
    el('actions-count').textContent = results.size || !pending ? t('{count} shown', { count: items.length }) : '—';
    const freshness = el('actions-freshness');
    freshness.hidden = timestamps.length === 0;
    freshness.textContent = timestamps.length ? new Intl.DateTimeFormat(document.documentElement.lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(Math.min(...timestamps)) : '';
    const status = el('actions-status'); status.replaceChildren(); status.hidden = !notices.length;
    if (notices.length) {
      const details = document.createElement('details'); details.open = !items.length;
      const summary = document.createElement('summary'); summary.textContent = t('Some results could not be retrieved.');
      const list = document.createElement('ul');
      for (const { label, notice } of notices) {
        const row = document.createElement('li');
        row.append(textNode([label, notice.reason && t(notice.reason), PortalI18n.translate(notice.message, document.documentElement.lang)].filter(Boolean).join(' · ')));
        if (notice.url) row.append(' ', link(t('View source'), notice.url));
        list.append(row);
      }
      details.append(summary, list); status.append(details);
    }
    const content = el('action-items'); content.replaceChildren();
    if (items.length) {
      const list = document.createElement('ul'); list.className = 'action-item-list';
      for (const item of items) {
        const row = document.createElement('li');
        const title = link(item.title, item.url); title.className = 'action-item-title link link-hover';
        const meta = document.createElement('div'); meta.className = 'action-item-meta';
        meta.append(textNode(item.serviceLabel, 'action-service'), textNode(item.context, 'action-context'));
        const updated = document.createElement('time'); updated.dateTime = item.updatedAt;
        updated.textContent = t('Updated') + ' ' + new Intl.DateTimeFormat(document.documentElement.lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(item.updatedAt));
        meta.append(updated);
        const badges = document.createElement('div'); badges.className = 'action-item-reasons';
        item.reasons.forEach((reason) => badges.append(textNode(t(reason), 'action-item-kind badge badge-sm badge-ghost')));
        row.append(title, meta, badges); list.append(row);
      }
      content.append(list);
    } else if (!pending && !notices.length) {
      content.append(emptyState(sources.size ? 'No action items right now.' : 'Connect a service in Settings to see your action items.'));
    }
  }

  function cancelBatch() {
    generation++; window.clearTimeout(timer); loading = false;
  }
  /** Start independent RPCs together, commit once, and ignore obsolete callbacks. @param {boolean} [force] */
  function loadAll(force = false) {
    if (loading || !sources.size) return;
    const current = ++generation;
    const pending = new Set(sources.keys());
    const next = new Map();
    loading = true;
    refresh.style.minWidth = Math.max(44, Math.ceil(refresh.getBoundingClientRect().width)) + 'px';
    render();
    /** @param {string} key @param {ActionResult} result */
    const finish = (key, result) => {
      if (current !== generation || !pending.delete(key)) return;
      next.set(key, result);
      if (!pending.size) {
        window.clearTimeout(timer); results = next; loading = false; render();
      }
    };
    const failed = () => ({ items: [], notices: [{ message: 'Could not retrieve data from this connection. Try again.' }] });
    timer = window.setTimeout(() => { for (const key of [...pending]) finish(key, failed()); }, 60000);
    for (const [key, source] of sources) {
      try { source.load(force, (result) => finish(key, result)); }
      catch { finish(key, failed()); }
    }
  }
  function loadVisible() {
    if (!el('actions-panel').hidden && [...sources.keys()].some((key) => !results.has(key))) loadAll();
  }
  window.PortalActions = {
    setProviderState(provider, state) { providers.set(provider, state); render(); },
    setSources(provider, entries) {
      // Preserve unchanged adapters, but discard removed/edited sources and in-flight batches.
      cancelBatch();
      const next = new Map(entries.map((entry) => [provider + ':' + entry.id, entry]));
      for (const [key, source] of sources) if (key.startsWith(provider + ':') && next.get(key) !== source) {
        sources.delete(key); results.delete(key);
      }
      next.forEach((entry, key) => sources.set(key, entry));
      providers.set(provider, { ready: true, loading: false, error: '' });
      render(); loadVisible();
    },
  };
  refresh.addEventListener('click', () => {
    if (refresh.disabled) return;
    document.dispatchEvent(new Event('portal:refresh-actions'));
    loadAll(true);
  });
  document.addEventListener('portal:tabchange', loadVisible);
  document.addEventListener('portal:languagechange', render);
})();
