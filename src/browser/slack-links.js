/** Personal Slack saved messages, loaded separately from the embedded spreadsheet catalog.
 * @param {ReturnType<typeof import('./client.js').initializeCatalog>} catalog
 */
export function initializeSlackLinks(catalog) {
  /** @type {SlackConnectionInfo[]} */
  let connections = [];
  /** @type {{id: string, label: string, response: SlackBookmarksResponse}[]} */
  let results = [];
  let revision = 0;
  let loading = false;
  const t = (/** @type {string} */ key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);

  /** @param {unknown} value @returns {value is SlackBookmarksResponse} */
  function valid(value) {
    const data = /** @type {SlackBookmarksResponse} */ (value);
    if (!data || !data.ok) return Boolean(data && typeof data.error === 'string');
    return typeof data.workspace === 'string' && /^https:\/\/[a-z0-9-]+\.slack\.com\/$/.test(data.url) &&
      Number.isFinite(data.fetchedAt) && typeof data.cached === 'boolean' && typeof data.hasMore === 'boolean' && typeof data.partial === 'boolean' && typeof data.error === 'string' &&
      Array.isArray(data.items) && data.items.length <= 200 && data.items.every(item => item && typeof item.title === 'string' && item.title.length <= 500 &&
        typeof item.url === 'string' && item.url.startsWith(data.url + 'archives/') && /^archives\/[CGD][A-Z0-9]+\/p\d+$/.test(item.url.slice(data.url.length)));
  }
  function publish() {
    /** @type {CatalogTool[]} */
    const tools = [];
    /** @type {{label: string, message: string}[]} */
    const notices = [];
    /** @type {{hit: boolean, fetchedAt: number}[]} */
    const freshness = [];
    for (const { id, label, response } of results) {
      if (!response.ok) { notices.push({ label, message: t('Could not load Slack saved messages. Check the connection in Sources.') }); continue; }
      if (response.error && !response.items.length) { notices.push({ label, message: t('Could not load Slack saved messages. Check the connection in Sources.') }); continue; }
      freshness.push({ hit: response.cached, fetchedAt: response.fetchedAt });
      tools.push({ id: 'slack-saved:' + id, name: response.workspace, url: response.url, tags: ['Slack'],
        description: t('Saved messages: {count}', { count: response.items.length }) + (response.hasMore ? ' · ' + t('More available in Slack') : ''),
        children: response.items.map(item => {
          const title = item.title || t('Saved message');
          const characters = Array.from(title);
          return { name: characters.length > 48 ? characters.slice(0, 48).join('') + '…' : title, url: item.url, description: title };
        }),
      });
      if (response.error || response.partial) notices.push({ label, message: t('Only part of the saved messages could be retrieved. Check the connection in Sources.') });
    }
    catalog.setSupplementary({ tools, notices, loading, freshness });
  }
  /** @param {boolean} force */
  async function load(force) {
    const current = ++revision;
    loading = connections.length > 0; publish();
    const next = await Promise.all(connections.map(connection => new Promise(resolve => {
      let finished = false;
      const finish = (/** @type {SlackBookmarksResponse} */ response) => {
        if (finished) return;
        finished = true; window.clearTimeout(timeout);
        resolve({ ...connection, response });
      };
      const failure = () => finish({ ok: false, error: 'REQUEST_FAILED' });
      const timeout = window.setTimeout(failure, 30000);
      try {
        google.script.run.withSuccessHandler((/** @type {SlackBookmarksResponse} */ response) => finish(valid(response) ? response : { ok: false, error: 'REQUEST_FAILED' }))
          .withFailureHandler(failure).getSlackBookmarks(connection.id, force);
      } catch { failure(); }
    })));
    if (current !== revision) return;
    results = next; loading = false; publish();
  }
  document.addEventListener('portal:refresh-links', () => { void load(true); });
  document.addEventListener('portal:languagechange', publish);
  return {
    connectionFailure() {
      revision++; loading = false;
      results = [{ id: '', label: 'Slack', response: { ok: false, error: 'REQUEST_FAILED' } }];
      publish();
    },
    /** @param {SlackConnectionInfo[]} entries */
    setConnections(entries) {
      connections = entries;
      results = results.filter(result => entries.some(entry => entry.id === result.id));
      void load(false);
    },
  };
}
