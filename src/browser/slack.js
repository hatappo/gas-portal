import { createSaver } from './save-control.js';
/** @param {ReturnType<typeof import('./action-items.js').initializeActions>} actions */
export function initializeSlack(actions) {
  /** @param {string} id */
  const el = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);
  const limit = /** @type {HTMLSelectElement} */ (el('slack-bookmark-limit'));
  let savedLimit = String(PortalSlackSettings.normalize(limit.dataset.savedValue));
  limit.replaceChildren(...PortalSlackSettings.choices.map((value) => {
    const option = document.createElement('option');
    option.value = String(value); option.textContent = String(value);
    return option;
  }));
  limit.value = savedLimit;
  const saveLimit = createSaver({ status: el('slack-limit-status'), t, setBusy: (busy) => { limit.disabled = busy; } });
  limit.addEventListener('change', () => {
    const value = limit.value;
    if (limit.disabled || value === savedLimit) return;
    saveLimit({
      send: (runner) => runner.saveSlackBookmarkLimit(Number(value)),
      confirm: (/** @type {{ok: boolean, limit?: number}} */ response) => {
        if (!response?.ok || response.limit !== Number(value)) return false;
        savedLimit = value; limit.dataset.savedValue = value;
        // Invalidate only Slack snapshots. The next visit to Actions reads the new limit.
        sources.clear(); if (initialized) publishSources();
        return t('Saved');
      },
      restore: () => { limit.value = savedLimit; },
      failureMessage: 'Could not save the bookmark limit. Please try again.',
    });
  });
  const form = /** @type {HTMLFormElement} */ (el('slack-settings-form'));
  const fields = /** @type {HTMLFieldSetElement} */ (el('slack-settings-fields'));
  const token = /** @type {HTMLInputElement} */ (el('slack-token'));
  const add = /** @type {HTMLButtonElement} */ (el('add-slack'));
  const settingsStatus = el('slack-settings-status');
  actions.setProviderState('slack', { ready: false, loading: false, error: '' });
  /** @type {SlackConnectionInfo[]} */
  let connections = [];
  /** @type {Map<string, ActionSource>} */
  const sources = new Map();
  let initialized = false;
  let initializing = false;
  let editingId = '';
  let busy = false;
  let settingsRevision = 0;
  let initializationRevision = 0;

  /** @param {string} code */
  function errorMessage(code) {
    /** @type {Record<string, string>} */
    const messages = {
      UNAUTHORIZED: 'Slack authorization expired or was revoked. Replace the token in Settings.',
      MISSING_SCOPE: 'Slack requires the search:read user token scope. Update the app permissions and reinstall it.',
      RATE_LIMITED: 'Slack rate limit reached. Wait a few minutes before refreshing.',
      INVALID_CONNECTION: 'This connection no longer exists. Reload the portal.',
      CONNECTION_CHANGED: 'The connection changed during this request. Reload the portal.',
      INVALID_INPUT: 'Enter an app-issued Slack User OAuth Token (xoxp-).',
      DUPLICATE_CONNECTION: 'This Slack workspace and user are already connected. Edit the existing connection.',
      CONNECTION_LIMIT: 'You can save up to 3 Slack connections.',
      AUTHORIZATION_REQUIRED: 'Additional authorization is required. Run initializeProperties in the GAS editor as the deploying account, grant the requested permissions, then reload the portal.',
    };
    return t(messages[code] || 'Could not load Slack data. Check authorization and try again.');
  }

  /** @param {string} text @param {() => void} action */
  function button(text, action) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'action-text-button btn btn-ghost btn-sm'; node.textContent = text;
    node.addEventListener('click', action);
    return node;
  }
  /** @param {string} url */
  function safeSlackUrl(url) {
    try { const parsed = new URL(url); return parsed.protocol === 'https:' && /^[a-z0-9-]+\.slack\.com$/.test(parsed.hostname) && !parsed.port && !parsed.username && !parsed.password && /^\/archives\/[CGD][A-Z0-9]+\/p\d+$/.test(parsed.pathname) ? parsed.href : ''; }
    catch { return ''; }
  }

  /** @param {SlackConnectionInfo | undefined} connection */
  function edit(connection) {
    if (busy) return;
    editingId = connection?.id || '';
    token.value = ''; token.required = !connection;
    form.hidden = false;
    settingsStatus.textContent = '';
    token.focus();
  }

  function renderConnections() {
    el('slack-connections').replaceChildren(...connections.map((connection) => {
      const row = document.createElement('li'); row.className = 'slack-connection';
      const name = document.createElement('strong'); name.textContent = connection.label;
      const info = document.createElement('div'); info.append(name);
      const controls = document.createElement('div'); controls.className = 'slack-connection-controls';
      const editButton = button(t('Edit'), () => edit(connection));
      const disconnect = button(t('Disconnect'), () => {
        if (!busy && window.confirm(t('Disconnect this Slack connection? Its token will be removed from the portal.'))) mutate(connection.id);
      });
      editButton.disabled = disconnect.disabled = busy;
      editButton.setAttribute('aria-label', t('Edit') + ': ' + connection.label);
      disconnect.setAttribute('aria-label', t('Disconnect') + ': ' + connection.label);
      controls.append(editButton, disconnect); row.append(info, controls); return row;
    }));
    add.disabled = busy || !initialized || connections.length >= 3;
  }

  /** @param {unknown} value */
  function validActions(value) {
    const data = /** @type {SlackActionsResponse} */ (value);
    if (!data || !data.ok) return Boolean(data && typeof data.error === 'string');
    try {
      return Number.isFinite(new Date(data.fetchedAt).getTime()) && typeof data.error === 'string' && typeof data.partial === 'boolean' && Array.isArray(data.items) && data.items.length <= 200 && data.items.every((item) =>
        item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.context === 'string' && typeof item.url === 'string' && Boolean(safeSlackUrl(item.url)) && Number.isFinite(Date.parse(item.postedAt)));
    } catch { return false; }
  }

  /** @param {SlackActionsResponse} response @returns {ActionResult} */
  function normalizeActions(response) {
    if (!response.ok) return { items: [], notices: [{ message: errorMessage(response.error) }] };
    return {
      fetchedAt: response.fetchedAt, cached: response.cached, hasMore: response.hasMore === true,
      items: response.items.map((item) => ({
        service: 'slack', serviceLabel: 'Slack', id: item.id, title: item.title || t('Saved message'),
        url: safeSlackUrl(item.url), context: item.context, updatedAt: item.postedAt, dateLabel: 'Posted', reasons: ['Bookmark'],
      })),
      notices: response.error || response.partial ? [{ message: response.error ? errorMessage(response.error) : 'Only part of the results could be retrieved.' }] : [],
    };
  }
  function publishSources() {
    for (const id of sources.keys()) if (!connections.some((connection) => connection.id === id)) sources.delete(id);
    for (const connection of connections) if (!sources.has(connection.id)) {
      sources.set(connection.id, {
        id: connection.id, label: connection.label, serviceLabel: 'Slack',
        load(force, done) {
          const failure = () => done(normalizeActions({ ok: false, error: 'REQUEST_FAILED' }));
          try {
            google.script.run.withSuccessHandler((/** @type {SlackActionsResponse} */ response) => {
              done(normalizeActions(validActions(response) ? response : { ok: false, error: 'REQUEST_FAILED' }));
            }).withFailureHandler(failure).getSlackActionItems(connection.id, force);
          } catch { failure(); }
        },
      });
    }
    actions.setSources('slack', [...sources.values()]);
  }
  function initialize() {
    if (initialized) return;
    if (initializing) return;
    initializing = true;
    settingsStatus.textContent = '';
    el('slack-settings-loading').hidden = false;
    actions.setProviderState('slack', { ready: false, loading: true, error: '' });
    el('retry-slack-settings').hidden = true;
    const generation = ++initializationRevision;
    const timeout = window.setTimeout(failure, 15000);
    function failure() {
      if (!initializing || generation !== initializationRevision) return;
      window.clearTimeout(timeout); initializing = false;
      el('slack-settings-loading').hidden = true;
      settingsStatus.textContent = errorMessage('REQUEST_FAILED');
      actions.setProviderState('slack', { ready: false, loading: false, error: errorMessage('REQUEST_FAILED') });
      el('retry-slack-settings').hidden = false;
    }
    try {
      google.script.run.withSuccessHandler((/** @type {SlackConnectionsResponse} */ response) => {
        if (!initializing || generation !== initializationRevision) return;
        if (!response?.ok || !Array.isArray(response.connections) || response.connections.length > 3 || !response.connections.every((connection) => connection && typeof connection.id === 'string' && typeof connection.label === 'string')) { failure(); return; }
        window.clearTimeout(timeout); initializing = false; initialized = true;
        el('slack-settings-loading').hidden = true;
        connections = response.connections;
        settingsStatus.textContent = '';
        renderConnections(); publishSources();
      }).withFailureHandler(failure).getSlackConnections();
    } catch { failure(); }
  }

  /** @param {string} [disconnectId] */
  function mutate(disconnectId) {
    if (busy) return;
    const input = { id: editingId, token: token.value };
    token.value = '';
    busy = true; fields.disabled = true; renderConnections();
    settingsStatus.textContent = t(disconnectId ? 'Disconnecting…' : 'Checking and saving connection…');
    const generation = ++settingsRevision;
    const timeout = window.setTimeout(() => finish(false, t('Could not confirm the save. Reload the page to check.')), 60000);
    /** @param {boolean} ok @param {string} message */
    function finish(ok, message) {
      if (!busy || generation !== settingsRevision) return;
      window.clearTimeout(timeout); busy = false; fields.disabled = false;
      if (ok) { form.hidden = true; editingId = ''; }
      settingsStatus.textContent = message; renderConnections(); if (ok) publishSources();
    }
    const failure = () => finish(false, t('Could not confirm the save. Reload the page to check.'));
    try {
      const runner = google.script.run.withFailureHandler(failure);
      if (disconnectId) {
        runner.withSuccessHandler((/** @type {{ok: boolean, error?: string}} */ response) => {
          if (!busy || generation !== settingsRevision) return;
          if (!response?.ok) { finish(false, errorMessage(response?.error || 'REQUEST_FAILED')); return; }
          connections = connections.filter((connection) => connection.id !== disconnectId);
          finish(true, t('Disconnected. Revoke the token on Slack if you no longer need it.'));
        }).disconnectSlack(disconnectId);
      } else {
        runner.withSuccessHandler((/** @type {SlackSaveResponse} */ response) => {
          if (!busy || generation !== settingsRevision) return;
          if (!response?.ok || !response.connection) { finish(false, errorMessage(response && !response.ok ? response.error : 'REQUEST_FAILED')); return; }
          connections = [...connections.filter((connection) => connection.id !== response.connection.id), response.connection];
          sources.delete(response.connection.id);
          finish(true, t('Connected. Action Items will show saved-message search results.'));
        }).saveSlackConnection(input);
      }
    } catch { failure(); }
  }

  add.addEventListener('click', () => edit(undefined));
  el('cancel-slack').addEventListener('click', () => { if (!busy) { form.hidden = true; token.value = ''; } });
  form.addEventListener('submit', (event) => { event.preventDefault(); mutate(); });
  document.addEventListener('portal:refresh-actions', () => { if (!initialized) initialize(); });
  el('retry-slack-settings').addEventListener('click', initialize);
  document.addEventListener('portal:tabchange', () => {
    if (!el('actions-panel').hidden || !el('settings-panel').hidden) initialize();
  });
  document.addEventListener('portal:languagechange', renderConnections);
  if (!el('actions-panel').hidden || !el('settings-panel').hidden) initialize();
}
