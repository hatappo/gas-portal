/** GitHub Cloud integration. Never return tokens, API bodies, or request headers to callers. */
/** @typedef {{id: string, login: string, owner: string, ownerType: string, token: string, revision: string}} GitHubConnection */
/** @typedef {{id: string, title: string, url: string, repository: string, number: number, updatedAt: string, kind: string, reasons: string[]}} GitHubItem */
/** @typedef {{kind: string, items: GitHubItem[], total: number, partial: boolean, error: string, searchUrl: string}} GitHubGroup */

/** @param {string} id */
function githubPropertyKey_(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('INVALID_CONNECTION');
  return 'GITHUB_CONNECTION_' + id;
}

/** @returns {GitHubConnection[]} */
function githubConnections_() {
  const properties = PropertiesService.getUserProperties().getProperties();
  return Object.keys(properties).filter((key) => key.startsWith('GITHUB_CONNECTION_')).sort().map((key) => {
    const value = /** @type {GitHubConnection} */ (JSON.parse(properties[key]));
    if (githubPropertyKey_(value.id) !== key || typeof value.token !== 'string' || typeof value.login !== 'string' || typeof value.owner !== 'string') throw new Error('INVALID_CONNECTION');
    return value;
  });
}

/** @param {GitHubConnection} connection */
function githubPublicConnection_(connection) {
  return { id: connection.id, label: (connection.owner || '*') + '@' + connection.login, login: connection.login, owner: connection.owner };
}

/** Metadata only. This RPC does not make GitHub requests. */
function getGitHubConnections() {
  try { return { ok: true, connections: githubConnections_().map(githubPublicConnection_) }; }
  catch { return { ok: false, error: 'SETTINGS_FAILED' }; }
}

/** Keep error codes bounded; raw upstream messages may contain sensitive data.
 * @param {unknown} error
 */
function githubErrorCode_(error) {
  const code = error instanceof Error ? error.message : '';
  return ['UNAUTHORIZED', 'FORBIDDEN', 'RATE_LIMITED', 'INVALID_FILTER', 'INVALID_CONNECTION', 'CONNECTION_CHANGED', 'INVALID_INPUT', 'CONNECTION_LIMIT', 'AUTHORIZATION_REQUIRED'].includes(code) ? code : 'REQUEST_FAILED';
}

/** Fixed API origin and paths only; never follow upstream redirects or pagination URLs.
 * @param {string} token @param {string} path @returns {any}
 */
function githubRequest_(token, path) {
  let response;
  try {
    response = UrlFetchApp.fetch('https://api.github.com' + path, {
      method: 'get', followRedirects: false, muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
    });
  } catch {
    if (typeof ScriptApp.getAuthorizationInfo === 'function' && ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) throw new Error('AUTHORIZATION_REQUIRED');
    throw new Error('REQUEST_FAILED');
  }
  const status = response.getResponseCode();
  if (status !== 200) {
    const headers = response.getAllHeaders();
    const header = (/** @type {string} */ name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
    if (status === 429 || (status === 403 && (String(header('x-ratelimit-remaining')) === '0' || header('retry-after') !== undefined))) throw new Error('RATE_LIMITED');
    if (status === 401) throw new Error('UNAUTHORIZED');
    if (status === 403 || status === 404) throw new Error('FORBIDDEN');
    if (status === 422) throw new Error('INVALID_FILTER');
    throw new Error('REQUEST_FAILED');
  }
  try { return JSON.parse(response.getContentText()); }
  catch { throw new Error('REQUEST_FAILED'); }
}

/** @param {unknown} input */
function validateGitHubInput_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');
  const value = /** @type {Record<string, unknown>} */ (input);
  const keys = ['id', 'token', 'owner'];
  if (Object.keys(value).length !== keys.length || keys.some((key) => typeof value[key] !== 'string')) throw new Error('INVALID_INPUT');
  const strings = /** @type {Record<string, string>} */ (value);
  const id = strings.id.trim();
  if (id) githubPropertyKey_(id);
  const token = strings.token.trim();
  const owner = strings.owner.trim();
  if (token.length > 255 || (token && !/^github_pat_[A-Za-z0-9_]+$/.test(token))) throw new Error('INVALID_INPUT');
  if (owner && !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) throw new Error('INVALID_INPUT');
  return { id, token, owner };
}

/** @template T @param {() => T} action @returns {T} */
function withGitHubLock_(action) {
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try { return action(); } finally { lock.releaseLock(); }
}

/** Cache keys include a fresh revision for every credential or filter change. @param {GitHubConnection} connection */
function githubCacheKey_(connection) { return 'github-actions-v3:' + connection.id + ':' + connection.revision; }

/** @param {GitHubConnection} connection */
function clearGitHubCache_(connection) {
  try { CacheService.getUserCache().remove(githubCacheKey_(connection)); } catch { /* Cache is optional. */ }
}

/** Store only after validating the authenticated identity and optional owner filter.
 * @param {unknown} input
 */
function saveGitHubConnection(input) {
  try {
    const values = validateGitHubInput_(input);
    const previous = values.id ? githubConnections_().find((connection) => connection.id === values.id) : undefined;
    if (values.id && !previous) throw new Error('INVALID_CONNECTION');
    const token = values.token || previous?.token;
    if (!token) throw new Error('INVALID_INPUT');
    const user = githubRequest_(token, '/user');
    if (!user || typeof user.login !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(user.login)) throw new Error('UNAUTHORIZED');
    let ownerType = 'user';
    if (values.owner) {
      const account = githubRequest_(token, '/users/' + values.owner);
      if (account?.type !== 'User' && account?.type !== 'Organization') throw new Error('INVALID_FILTER');
      ownerType = account.type === 'Organization' ? 'org' : 'user';
    }
    return withGitHubLock_(() => {
      const connections = githubConnections_();
      if (previous && connections.find((connection) => connection.id === values.id)?.revision !== previous.revision) throw new Error('CONNECTION_CHANGED');
      if (!previous && connections.length >= 3) throw new Error('CONNECTION_LIMIT');
      const connection = { ...values, id: previous?.id || Utilities.getUuid(), login: user.login, ownerType, token, revision: Utilities.getUuid() };
      PropertiesService.getUserProperties().setProperty(githubPropertyKey_(connection.id), JSON.stringify(connection));
      if (previous) clearGitHubCache_(previous);
      return { ok: true, connection: githubPublicConnection_(connection) };
    });
  } catch (error) { return { ok: false, error: githubErrorCode_(error) }; }
}

/** Remove local authorization data; token revocation is managed on GitHub. @param {unknown} id */
function disconnectGitHub(id) {
  try {
    if (typeof id !== 'string') throw new Error('INVALID_CONNECTION');
    const key = githubPropertyKey_(id);
    return withGitHubLock_(() => {
      const previous = githubConnections_().find((connection) => connection.id === id);
      PropertiesService.getUserProperties().deleteProperty(key);
      if (previous) clearGitHubCache_(previous);
      return { ok: true };
    });
  } catch (error) { return { ok: false, error: githubErrorCode_(error) }; }
}

/** @param {GitHubConnection} connection @param {string} kind */
function githubQuery_(connection, kind) {
  const subject = kind === 'assigned' ? 'is:issue assignee:' + connection.login
    : kind === 'direct' ? 'is:pr user-review-requested:@me'
      : kind === 'team' ? 'is:pr team-review-requested-user:' + connection.login
        : 'is:pr author:' + connection.login + ' review:changes_requested';
  const scope = connection.owner ? connection.ownerType + ':' + connection.owner : '';
  return ('is:open ' + subject + ' ' + scope).trim();
}

/** Whitelist fields and rebuild links from validated identifiers; discard bodies, users, and raw URLs.
 * @param {any} value @param {string} kind @returns {GitHubItem | null}
 */
function githubItem_(value, kind) {
  if (!value || typeof value.title !== 'string' || !Number.isSafeInteger(value.number) || value.number <= 0 || value.state !== 'open') return null;
  const match = /^https:\/\/api\.github\.com\/repos\/([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100})$/.exec(value.repository_url);
  if (!match || !Number.isFinite(Date.parse(value.updated_at)) || Boolean(value.pull_request) !== (kind !== 'assigned')) return null;
  const repository = match[1];
  return { id: repository.toLowerCase() + '#' + value.number, title: value.title.slice(0, 500), repository, number: value.number,
    url: 'https://github.com/' + repository + (kind === 'assigned' ? '/issues/' : '/pull/') + value.number,
    updatedAt: new Date(value.updated_at).toISOString(), kind: kind === 'assigned' ? 'issue' : 'pull', reasons: [kind] };
}

/** Fetch at most two pages per category. Counts always describe displayed items, never an inferred total.
 * @param {GitHubConnection} connection @param {string} kind @returns {GitHubGroup}
 */
function githubSearch_(connection, kind) {
  const query = githubQuery_(connection, kind);
  /** @type {GitHubGroup} */
  const result = { kind, items: [], total: 0, partial: false, error: '', searchUrl: 'https://github.com/search?type=' + (kind === 'assigned' ? 'issues' : 'pullrequests') + '&q=' + encodeURIComponent(query) };
  const seen = new Set();
  try {
    for (let page = 1; page <= 2; page++) {
      const data = githubRequest_(connection.token, '/search/issues?q=' + encodeURIComponent(query) + '&sort=updated&order=desc&per_page=100&page=' + page);
      if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.total_count) || data.total_count < 0 || typeof data.incomplete_results !== 'boolean') throw new Error('REQUEST_FAILED');
      if (page > 1 && result.total !== data.total_count) result.partial = true;
      result.total = data.total_count;
      result.partial = result.partial || data.incomplete_results;
      for (const raw of data.items) {
        const item = githubItem_(raw, kind);
        if (!item) { result.partial = true; continue; }
        if (seen.has(item.id)) { result.partial = true; continue; }
        seen.add(item.id);
        result.items.push(item);
      }
      if (data.items.length < 100 || result.items.length >= data.total_count) break;
    }
    result.partial = result.partial || result.items.length < result.total;
  } catch (error) {
    result.error = githubErrorCode_(error);
    result.partial = true;
  }
  return result;
}

/** Read one connection independently so a failing provider/account does not hide others.
 * @param {unknown} id @param {boolean} [forceRefresh]
 */
function getGitHubActionItems(id, forceRefresh = false) {
  try {
    if (typeof id !== 'string') throw new Error('INVALID_CONNECTION');
    const connection = githubConnections_().find((item) => item.id === id);
    if (!connection) throw new Error('INVALID_CONNECTION');
    const key = githubCacheKey_(connection);
    const ttl = normalizeActionsCacheTtl_(PropertiesService.getUserProperties().getProperty('ACTIONS_CACHE_SECONDS'));
    if (forceRefresh === true || ttl === 0) clearGitHubCache_(connection);
    else {
      try {
        const cached = JSON.parse(CacheService.getUserCache().get(key) || 'null');
        if (cached?.connectionId === id && cached.revision === connection.revision && Array.isArray(cached.groups) && Date.now() - cached.fetchedAt >= 0 && Date.now() - cached.fetchedAt < ttl * 1000) {
          return { ok: true, groups: cached.groups, fetchedAt: cached.fetchedAt, cached: true };
        }
      } catch { /* A cache failure must not prevent live reads. */ }
    }
    // Identity is verified when saving credentials. Searches enforce token authorization.
    /** @type {GitHubGroup[]} */
    const groups = [];
    let blocked = '';
    for (const kind of ['assigned', 'direct', 'team', 'changes']) {
      const group = blocked
        ? { kind, items: [], total: 0, partial: true, error: blocked, searchUrl: 'https://github.com/search?q=' + encodeURIComponent(githubQuery_(connection, kind)) }
        : githubSearch_(connection, kind);
      groups.push(group);
      if (['RATE_LIMITED', 'UNAUTHORIZED', 'FORBIDDEN', 'AUTHORIZATION_REQUIRED'].includes(group.error)) blocked = group.error;
    }
    if (groups.every((group) => !group.items.length) && ['UNAUTHORIZED', 'AUTHORIZATION_REQUIRED'].includes(blocked)) throw new Error(blocked);
    const fetchedAt = Date.now();
    return withGitHubLock_(() => {
      if (githubConnections_().find((item) => item.id === id)?.revision !== connection.revision) throw new Error('CONNECTION_CHANGED');
      if (ttl > 0 && !groups.some((group) => group.error)) {
        try {
          const serialized = JSON.stringify({ connectionId: id, revision: connection.revision, groups, fetchedAt });
          if (Utilities.newBlob(serialized).getBytes().length < 95000) CacheService.getUserCache().put(key, serialized, ttl);
        } catch { /* Large results and unavailable cache fall back to live reads. */ }
      }
      return { ok: true, groups, fetchedAt, cached: false };
    });
  } catch (error) { return { ok: false, error: githubErrorCode_(error) }; }
}
