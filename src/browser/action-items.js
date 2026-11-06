import { mountActionView } from './action-view';

export function initializeActions() {
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
  let forcePending = false;
  let timer = 0;

  const updateView = mountActionView();
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
    el('actions-status').hidden = !notices.length;
    updateView({ items, notices, pending, connected: sources.size > 0, language: document.documentElement.lang });
  }

  function cancelBatch() {
    generation++; window.clearTimeout(timer); loading = false;
  }
  /** Start independent RPCs together, commit once, and ignore obsolete callbacks. @param {boolean} [force] */
  function loadAll(force = false) {
    if (loading || !sources.size || [...providers.values()].some((provider) => !provider.ready && !provider.error)) return;
    force = force || forcePending;
    forcePending = false;
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
    timer = window.setTimeout(() => {
      // oxlint-disable-next-line unicorn/no-useless-spread -- finish() deletes from pending, so iterate a snapshot.
      for (const key of [...pending]) finish(key, failed());
    }, 60000);
    for (const [key, source] of sources) {
      try { source.load(force, (result) => finish(key, result)); }
      catch { finish(key, failed()); }
    }
  }
  function loadVisible() {
    if (!el('actions-panel').hidden && (forcePending || [...sources.keys()].some((key) => !results.has(key)))) loadAll();
  }
  const actions = {
    /** @param {string} provider @param {{ready: boolean, loading: boolean, error: string}} state */
    setProviderState(provider, state) { providers.set(provider, state); render(); loadVisible(); },
    /** @param {string} provider @param {ActionSource[]} entries */
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
    forcePending = true;
    document.dispatchEvent(new Event('portal:refresh-actions'));
    loadAll(true);
  });
  el('actions-settings').addEventListener('click', () => {
    el('settings-tab-actions').click();
    el('settings-tab-actions').focus();
  });
  document.addEventListener('portal:tabchange', loadVisible);
  document.addEventListener('portal:languagechange', render);
  return actions;
}
