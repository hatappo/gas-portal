/** Saved-message search using app-issued user tokens. Never expose credentials or raw API bodies. */
/** @typedef {{id: string, token: string, revision: string, workspaceId: string, userId: string, workspace: string, user: string, url: string}} SlackConnection */
/** @typedef {{id: string, title: string, url: string, context: string, postedAt: string}} SlackItem */
/** @typedef {{items: SlackItem[], partial: boolean, error: string, hasMore: boolean}} SlackSearch */

/** @param {string} id */
function slackPropertyKey_(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('INVALID_CONNECTION');
  return 'SLACK_CONNECTION_' + id;
}
/** @returns {SlackConnection[]} */
function slackConnections_() {
  const properties = PropertiesService.getUserProperties().getProperties();
  return Object.keys(properties).filter((key) => key.startsWith('SLACK_CONNECTION_')).sort().map((key) => {
    const value = /** @type {SlackConnection} */ (JSON.parse(properties[key]));
    if (slackPropertyKey_(value.id) !== key || typeof value.token !== 'string' || !/^https:\/\/[a-z0-9-]+\.slack\.com\/$/.test(value.url) || !/^T[A-Z0-9]+$/.test(value.workspaceId) || !/^[UW][A-Z0-9]+$/.test(value.userId)) throw new Error('INVALID_CONNECTION');
    return value;
  });
}
/** @param {SlackConnection} connection */
function slackPublicConnection_(connection) {
  return { id: connection.id, label: connection.workspace + '@' + connection.user, tokenSuffix: connection.token.slice(-2) };
}
/** Metadata only; identity is verified once when saving the token. */
function getSlackConnections() {
  try { return { ok: true, connections: slackConnections_().map(slackPublicConnection_) }; }
  catch { return { ok: false, error: 'SETTINGS_FAILED' }; }
}
/** @param {unknown} error */
function slackErrorCode_(error) {
  const code = error instanceof Error ? error.message : '';
  return ['UNAUTHORIZED', 'MISSING_SCOPE', 'RATE_LIMITED', 'INVALID_CONNECTION', 'CONNECTION_CHANGED', 'INVALID_INPUT', 'CONNECTION_LIMIT', 'DUPLICATE_CONNECTION', 'AUTHORIZATION_REQUIRED'].includes(code) ? code : 'REQUEST_FAILED';
}
/** Fixed origin, fixed methods, no redirects. Errors are bounded and never include response bodies.
 * @param {string} token @param {'auth.test' | 'search.messages'} method @param {string} [query] @returns {any}
 */
function slackRequest_(token, method, query = '') {
  let response;
  try {
    response = UrlFetchApp.fetch('https://slack.com/api/' + method + query, {
      method: 'get', followRedirects: false, muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
    });
  } catch {
    if (typeof ScriptApp.getAuthorizationInfo === 'function' && ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) throw new Error('AUTHORIZATION_REQUIRED');
    throw new Error('REQUEST_FAILED');
  }
  const status = response.getResponseCode();
  if (status === 429) throw new Error('RATE_LIMITED');
  if (status === 401) throw new Error('UNAUTHORIZED');
  if (status !== 200) throw new Error('REQUEST_FAILED');
  const data = JSON.parse(response.getContentText());
  if (data?.ok !== true) {
    if (['invalid_auth', 'token_revoked', 'token_expired', 'account_inactive', 'not_authed', 'not_allowed_token_type'].includes(data?.error)) throw new Error('UNAUTHORIZED');
    if (data?.error === 'missing_scope') throw new Error('MISSING_SCOPE');
    if (data?.error === 'ratelimited') throw new Error('RATE_LIMITED');
    throw new Error('REQUEST_FAILED');
  }
  return data;
}
/** @template T @param {() => T} action @returns {T} */
function withSlackLock_(action) {
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try { return action(); } finally { lock.releaseLock(); }
}
/** @param {SlackConnection} connection @param {number} limit */
function slackCacheKey_(connection, limit) { return 'slack-saved-v2:' + connection.id + ':' + connection.revision + ':' + limit; }
/** @param {SlackConnection} connection */
function clearSlackCache_(connection) {
  try {
    const cache = CacheService.getUserCache();
    for (const limit of PortalSlackSettings.choices) cache.remove(slackCacheKey_(connection, limit));
  } catch { /* Cache is optional. */ }
}
/** @param {unknown} input */
function saveSlackConnection(input) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');
    const value = /** @type {Record<string, unknown>} */ (input);
    if (Object.keys(value).length !== 2 || typeof value.id !== 'string' || typeof value.token !== 'string') throw new Error('INVALID_INPUT');
    const id = value.id.trim();
    if (id) slackPropertyKey_(id);
    const previous = id ? slackConnections_().find((connection) => connection.id === id) : undefined;
    if (id && !previous) throw new Error('INVALID_CONNECTION');
    const token = value.token.trim() || previous?.token;
    if (!token || token.length > 512 || !/^xoxp-[A-Za-z0-9-]+$/.test(token)) throw new Error('INVALID_INPUT');
    const identity = slackRequest_(token, 'auth.test');
    if (typeof identity.team_id !== 'string' || !/^T[A-Z0-9]+$/.test(identity.team_id) || typeof identity.user_id !== 'string' || !/^[UW][A-Z0-9]+$/.test(identity.user_id) || typeof identity.url !== 'string' || !/^https:\/\/[a-z0-9-]+\.slack\.com\/$/.test(identity.url) || typeof identity.team !== 'string' || typeof identity.user !== 'string') throw new Error('UNAUTHORIZED');
    return withSlackLock_(() => {
      const connections = slackConnections_();
      if (previous && connections.find((connection) => connection.id === id)?.revision !== previous.revision) throw new Error('CONNECTION_CHANGED');
      if (!previous && connections.length >= 3) throw new Error('CONNECTION_LIMIT');
      if (connections.some((connection) => connection.id !== id && connection.workspaceId === identity.team_id && connection.userId === identity.user_id)) throw new Error('DUPLICATE_CONNECTION');
      const connection = { id: previous?.id || Utilities.getUuid(), token, revision: Utilities.getUuid(), workspaceId: identity.team_id, userId: identity.user_id, workspace: identity.team.slice(0, 80), user: identity.user.slice(0, 80), url: identity.url };
      PropertiesService.getUserProperties().setProperty(slackPropertyKey_(connection.id), JSON.stringify(connection));
      if (previous) clearSlackCache_(previous);
      return { ok: true, connection: slackPublicConnection_(connection) };
    });
  } catch (error) { return { ok: false, error: slackErrorCode_(error) }; }
}
/** Remove local credentials, without revoking the Slack app. @param {unknown} id */
function disconnectSlack(id) {
  try {
    if (typeof id !== 'string') throw new Error('INVALID_CONNECTION');
    const key = slackPropertyKey_(id);
    return withSlackLock_(() => {
      const previous = slackConnections_().find((connection) => connection.id === id);
      PropertiesService.getUserProperties().deleteProperty(key);
      if (previous) clearSlackCache_(previous);
      return { ok: true };
    });
  } catch (error) { return { ok: false, error: slackErrorCode_(error) }; }
}
/** Keep a plain-text excerpt; never render Slack blocks or upstream HTML. Rebuild links from identity.
 * @param {any} value @param {SlackConnection} connection @returns {SlackItem | null}
 */
function slackItem_(value, connection) {
  if (!value || value.type !== 'message' || typeof value.text !== 'string' || typeof value.ts !== 'string' || !/^\d{10}\.\d{6}$/.test(value.ts) || typeof value.channel?.id !== 'string' || !/^[CGD][A-Z0-9]+$/.test(value.channel.id)) return null;
  const channel = value.channel.id;
  const title = String(value.text).replace(/<https?:\/\/[^>|]+\|([^>]+)>/g, '$1').replace(/&(amp|lt|gt);/g, (_, entity) => entity === 'amp' ? '&' : entity === 'lt' ? '<' : '>').replace(/\s+/g, ' ').trim().slice(0, 500);
  return { id: connection.workspaceId + ':' + channel + ':' + value.ts, title,
    url: connection.url + 'archives/' + channel + '/p' + value.ts.replace('.', ''),
    context: connection.workspace + ' · ' + (typeof value.channel.name === 'string' ? value.channel.name.slice(0, 80) : channel),
    postedAt: new Date(Number(value.ts) * 1000).toISOString() };
}
/** Per-user setting shared by Slack connections. Existing result snapshots update on the next read.
 * @param {unknown} limit
 */
function saveSlackBookmarkLimit(limit) {
  if (!PortalSlackSettings.isChoice(limit)) return { ok: false };
  try {
    withSlackLock_(() => PropertiesService.getUserProperties().setProperty('SLACK_BOOKMARK_LIMIT', String(limit)));
    return { ok: true, limit };
  } catch { return { ok: false }; }
}

/** Search semantics, not a complete Later inventory or a To-do count. At most two pages per refresh.
 * @param {SlackConnection} connection @param {number} limit @returns {SlackSearch}
 */
function slackSearch_(connection, limit) {
  /** @type {SlackSearch} */
  const result = { items: [], partial: false, error: '', hasMore: false };
  const seen = new Set();
  const count = Math.min(limit, 100);
  const pages = Math.ceil(limit / count);
  let cursor = '*';
  let total = -1;
  try {
    for (let page = 1; page <= pages; page++) {
      const data = slackRequest_(connection.token, 'search.messages', '?query=is%3Asaved&count=' + count + '&sort=timestamp&sort_dir=desc&' + (cursor ? 'cursor=' + encodeURIComponent(cursor) : 'page=' + page));
      const messages = data.messages;
      if (!messages || !Array.isArray(messages.matches) || messages.matches.length > count || !Number.isSafeInteger(messages.total) || messages.total < 0) throw new Error('REQUEST_FAILED');
      if (total >= 0 && total !== messages.total) result.partial = true;
      total = messages.total;
      result.hasMore = total > limit;
      for (const raw of messages.matches) {
        const item = slackItem_(raw, connection);
        if (!item || seen.has(item.id)) { result.partial = true; continue; }
        seen.add(item.id); result.items.push(item);
      }
      const next = messages.pagination?.next_cursor ?? messages.paging?.next_cursor ?? data.response_metadata?.next_cursor;
      if (next !== undefined && (typeof next !== 'string' || next.length > 4096)) throw new Error('REQUEST_FAILED');
      const more = next !== undefined ? Boolean(next) : page * count < total;
      if (!more || page === pages) {
        result.hasMore = result.hasMore || more;
        result.partial = result.partial || result.items.length < Math.min(limit, total);
        break;
      }
      cursor = next || '';
    }
  } catch (error) { result.error = slackErrorCode_(error); result.partial = true; }
  return result;
}
/** @param {unknown} id @param {boolean} [forceRefresh] */
function getSlackActionItems(id, forceRefresh = false) {
  try {
    if (typeof id !== 'string') throw new Error('INVALID_CONNECTION');
    const connection = slackConnections_().find((item) => item.id === id);
    if (!connection) throw new Error('INVALID_CONNECTION');
    const ttl = normalizeActionsCacheTtl_(PropertiesService.getUserProperties().getProperty('ACTIONS_CACHE_SECONDS'));
    const limit = PortalSlackSettings.normalize(PropertiesService.getUserProperties().getProperty('SLACK_BOOKMARK_LIMIT'));
    const key = slackCacheKey_(connection, limit);
    if (forceRefresh === true || ttl === 0) clearSlackCache_(connection);
    else {
      try {
        const cached = JSON.parse(CacheService.getUserCache().get(key) || 'null');
        if (cached?.connectionId === id && cached.revision === connection.revision && cached.limit === limit && Array.isArray(cached.result?.items) && Date.now() - cached.fetchedAt >= 0 && Date.now() - cached.fetchedAt < ttl * 1000) return { ok: true, ...cached.result, fetchedAt: cached.fetchedAt, cached: true };
      } catch { /* A cache failure must not prevent live reads. */ }
    }
    const result = slackSearch_(connection, limit);
    const fetchedAt = Date.now();
    return withSlackLock_(() => {
      if (slackConnections_().find((item) => item.id === id)?.revision !== connection.revision) throw new Error('CONNECTION_CHANGED');
      if (ttl > 0 && !result.error) {
        try {
          const serialized = JSON.stringify({ connectionId: id, revision: connection.revision, limit, result, fetchedAt });
          if (Utilities.newBlob(serialized).getBytes().length < 95000) CacheService.getUserCache().put(key, serialized, ttl);
        } catch { /* Large results and unavailable cache fall back to live reads. */ }
      }
      return { ok: true, ...result, fetchedAt, cached: false };
    });
  } catch (error) { return { ok: false, error: slackErrorCode_(error) }; }
}
