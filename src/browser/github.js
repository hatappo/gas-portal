import { initializeTokenField } from './token-field.js';
/** @param {ReturnType<typeof import('./action-items.js').initializeActions>} actions */
export function initializeGitHub(actions) {
  /** @param {string} id */
  const el = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);
  const form = /** @type {HTMLFormElement} */ (el('github-settings-form'));
  const fields = /** @type {HTMLFieldSetElement} */ (el('github-settings-fields'));
  const token = /** @type {HTMLInputElement} */ (el('github-token'));
  const tokenField = initializeTokenField(token, /** @type {HTMLButtonElement} */ (el('replace-github-token')));
  const owner = /** @type {HTMLInputElement} */ (el('github-owner'));
  const add = /** @type {HTMLButtonElement} */ (el('add-github'));
  const settingsStatus = el('github-settings-status');
  actions.setProviderState('github', { ready: false, loading: false, error: '' });
  /** @type {GitHubConnectionInfo[]} */
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
      UNAUTHORIZED: 'GitHub authorization expired or was revoked. Replace the token in Settings.',
      FORBIDDEN: 'GitHub denied access. Check selected repositories, token permissions, organization approval, and SSO.',
      RATE_LIMITED: 'GitHub rate limit reached. Wait a few minutes before refreshing.',
      INVALID_FILTER: 'GitHub could not search this scope. Check the filters and repository access.',
      INVALID_CONNECTION: 'This connection no longer exists. Reload the portal.',
      CONNECTION_CHANGED: 'The connection changed during this request. Reload the portal.',
      INVALID_INPUT: 'Check the fine-grained token and organization or owner filter.',
      CONNECTION_LIMIT: 'You can save up to 3 GitHub connections.',
      AUTHORIZATION_REQUIRED: 'Additional authorization is required. Run authorizePortal in the GAS editor as the deploying account, grant the requested permissions, then reload the portal.',
    };
    return t(messages[code] || 'Could not load GitHub data. Check authorization and try again.');
  }

  /** @param {string} text @param {() => void} action */
  function button(text, action) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'action-text-button btn btn-ghost btn-sm'; node.textContent = text;
    node.addEventListener('click', action);
    return node;
  }
  /** @param {string} text @param {string} className */
  function paragraph(text, className = 'settings-help') {
    const node = document.createElement('p'); node.textContent = text; node.className = className; return node;
  }
  /** @param {string} url */
  function safeGitHubUrl(url) {
    try { const parsed = new URL(url); return parsed.origin === 'https://github.com' && !parsed.username && !parsed.password ? parsed.href : ''; }
    catch { return ''; }
  }
  /** @param {string} kind */
  function reason(kind) { return kind === 'assigned' ? 'Assigned issue' : kind === 'direct' ? 'Direct review' : kind === 'team' ? 'Team review' : 'Changes requested'; }

  /** @param {GitHubConnectionInfo | undefined} connection */
  function edit(connection) {
    if (busy) return;
    editingId = connection?.id || '';
    owner.value = connection?.owner || '';
    tokenField.edit(connection);
    form.hidden = false;
    settingsStatus.textContent = '';
    token.focus();
  }

  function renderConnections() {
    el('github-connections').replaceChildren(...connections.map((connection) => {
      const row = document.createElement('li'); row.className = 'github-connection';
      const name = document.createElement('strong'); name.textContent = connection.label;
      const info = document.createElement('div'); info.append(name);
      if (!connection.owner) info.append(paragraph(t('All accessible repositories')));
      const controls = document.createElement('div'); controls.className = 'github-connection-controls';
      const editButton = button(t('Edit'), () => edit(connection));
      const disconnect = button(t('Disconnect'), () => {
        if (!busy && window.confirm(t('Disconnect this GitHub connection? Its token will be removed from the portal.'))) mutate(connection.id);
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
    const data = /** @type {GitHubActionsResponse} */ (value);
    if (!data || !data.ok) return Boolean(data && typeof data.error === 'string');
    try {
      return Number.isFinite(new Date(data.fetchedAt).getTime()) && Array.isArray(data.groups) && data.groups.length <= 4 && data.groups.every((group) =>
        group && ['assigned', 'direct', 'team', 'changes'].includes(group.kind) && typeof group.error === 'string' && typeof group.searchUrl === 'string' && Array.isArray(group.items) && group.items.length <= 200 && group.items.every((item) =>
          item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.url === 'string' && typeof item.repository === 'string' && Number.isSafeInteger(item.number) && Number.isFinite(Date.parse(item.updatedAt)) && Array.isArray(item.reasons) && item.reasons.every((kind) => ['assigned', 'direct', 'team', 'changes'].includes(kind))));
    } catch { return false; }
  }

  /** Adapt GitHub responses to the shared, service-independent work queue. @param {GitHubActionsResponse} response @returns {ActionResult} */
  function normalizeActions(response) {
    if (!response.ok) return { items: [], notices: [{ message: errorMessage(response.error) }] };
    return {
      fetchedAt: response.fetchedAt, cached: response.cached,
      items: response.groups.flatMap((group) => group.items.map((item) => ({
        service: 'github', serviceLabel: 'GitHub', id: item.id.toLowerCase(), title: item.title,
        url: safeGitHubUrl(item.url), context: item.repository + ' #' + item.number,
        updatedAt: item.updatedAt, reasons: item.reasons.map(reason),
      }))),
      notices: response.groups.filter((group) => group.error || group.partial).map((group) => ({
        reason: reason(group.kind), message: group.error ? errorMessage(group.error) : 'Only part of the results could be retrieved.',
        url: safeGitHubUrl(group.searchUrl),
      })),
    };
  }
  function publishSources() {
    for (const id of sources.keys()) if (!connections.some((connection) => connection.id === id)) sources.delete(id);
    for (const connection of connections) if (!sources.has(connection.id)) {
      sources.set(connection.id, {
        id: connection.id, label: connection.label, serviceLabel: 'GitHub',
        load(force, done) {
          const failure = () => done(normalizeActions({ ok: false, error: 'REQUEST_FAILED' }));
          try {
            google.script.run.withSuccessHandler((/** @type {GitHubActionsResponse} */ response) => {
              done(normalizeActions(validActions(response) ? response : { ok: false, error: 'REQUEST_FAILED' }));
            }).withFailureHandler(failure).getGitHubActionItems(connection.id, force);
          } catch { failure(); }
        },
      });
    }
    actions.setSources('github', [...sources.values()]);
  }
  function initialize() {
    if (initialized) return;
    if (initializing) return;
    initializing = true;
    settingsStatus.textContent = '';
    el('github-settings-loading').hidden = false;
    actions.setProviderState('github', { ready: false, loading: true, error: '' });
    el('retry-github-settings').hidden = true;
    const generation = ++initializationRevision;
    const timeout = window.setTimeout(failure, 15000);
    function failure() {
      if (!initializing || generation !== initializationRevision) return;
      window.clearTimeout(timeout); initializing = false;
      el('github-settings-loading').hidden = true;
      settingsStatus.textContent = errorMessage('REQUEST_FAILED');
      actions.setProviderState('github', { ready: false, loading: false, error: errorMessage('REQUEST_FAILED') });
      el('retry-github-settings').hidden = false;
    }
    try {
      google.script.run.withSuccessHandler((/** @type {GitHubConnectionsResponse} */ response) => {
        if (!initializing || generation !== initializationRevision) return;
        if (!response?.ok || !Array.isArray(response.connections) || response.connections.length > 3 || !response.connections.every((connection) => connection && typeof connection.id === 'string' && typeof connection.label === 'string' && typeof connection.login === 'string' && typeof connection.owner === 'string')) { failure(); return; }
        window.clearTimeout(timeout); initializing = false; initialized = true;
        el('github-settings-loading').hidden = true;
        connections = response.connections;
        settingsStatus.textContent = '';
        renderConnections(); publishSources();
      }).withFailureHandler(failure).getGitHubConnections();
    } catch { failure(); }
  }

  /** @param {string} [disconnectId] */
  function mutate(disconnectId) {
    if (busy) return;
    const input = { id: editingId, token: tokenField.take(), owner: owner.value };
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
          finish(true, t('Disconnected. Revoke the token on GitHub if you no longer need it.'));
        }).disconnectGitHub(disconnectId);
      } else {
        runner.withSuccessHandler((/** @type {GitHubSaveResponse} */ response) => {
          if (!busy || generation !== settingsRevision) return;
          if (!response?.ok || !response.connection) { finish(false, errorMessage(response && !response.ok ? response.error : 'REQUEST_FAILED')); return; }
          connections = [...connections.filter((connection) => connection.id !== response.connection.id), response.connection];
          sources.delete(response.connection.id);
          finish(true, t('Connected. Inbox & Tasks will use this account and scope.'));
        }).saveGitHubConnection(input);
      }
    } catch { failure(); }
  }

  add.addEventListener('click', () => edit(undefined));
  el('cancel-github').addEventListener('click', () => { if (!busy) { form.hidden = true; token.value = ''; } });
  form.addEventListener('submit', (event) => { event.preventDefault(); mutate(); });
  document.addEventListener('portal:refresh-actions', () => { if (!initialized) initialize(); });
  el('retry-github-settings').addEventListener('click', initialize);
  document.addEventListener('portal:tabchange', () => {
    if (!el('actions-panel').hidden || !el('settings-panel').hidden) initialize();
  });
  document.addEventListener('portal:languagechange', renderConnections);
  if (!el('actions-panel').hidden || !el('settings-panel').hidden) initialize();
}
