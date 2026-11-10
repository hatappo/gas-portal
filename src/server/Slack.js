/** Bounded To-do search using app-issued user tokens. Never expose credentials or raw API bodies. */
/** @typedef {{id: string, token: string, revision: string, workspaceId: string, userId: string, workspace: string, user: string, url: string}} SlackConnection */
/** @typedef {{id: string, title: string, url: string, context: string, postedAt: string, todoState?: 'to_do' | 'unknown'}} SlackItem */
/** @typedef {{searchTotal: number | null, received: number, eligible: number, skipped: number, hasMore: boolean | null, remaining: number | null, completed: number, incomplete: number, unknown: number}} SlackDiagnostics */
/** @typedef {{items: SlackItem[], partial: boolean, error: string, hasMore: boolean, diagnostics: SlackDiagnostics}} SlackSearch */

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
 * @param {string} token @param {'auth.test' | 'search.messages' | 'conversations.history' | 'conversations.replies'} method @param {string} [query] @returns {any}
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
function slackCacheKey_(connection, limit) { return 'slack-todos-v2:' + connection.id + ':' + connection.revision + ':' + limit; }
/** @param {SlackConnection} connection */
function clearSlackCache_(connection) {
  try {
    const cache = CacheService.getUserCache();
    cache.remove(slackCacheKey_(connection, PortalSlackSettings.limit));
    cache.remove(slackBookmarksCacheKey_(connection));
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
  // search.messages may label DM matches as type=im; validate message fields instead.
  if (!value || typeof value.text !== 'string' || typeof value.ts !== 'string' || !/^\d{10}\.\d{6}$/.test(value.ts) || typeof value.channel?.id !== 'string' || !/^[CGD][A-Z0-9]+$/.test(value.channel.id)) return null;
  const channel = value.channel.id;
  const title = String(value.text).replace(/<https?:\/\/[^>|]+\|([^>]+)>/g, '$1').replace(/&(amp|lt|gt);/g, (_, entity) => entity === 'amp' ? '&' : entity === 'lt' ? '<' : '>').replace(/\s+/g, ' ').trim().slice(0, 500);
  return { id: connection.workspaceId + ':' + channel + ':' + value.ts, title,
    url: connection.url + 'archives/' + channel + '/p' + value.ts.replace('.', ''),
    context: connection.workspace + ' · ' + (typeof value.channel.name === 'string' ? value.channel.name.slice(0, 80) : channel),
    postedAt: new Date(Number(value.ts) * 1000).toISOString() };
}
/** Retired settings RPC: old clients cannot change the fixed candidate budget. */
function saveSlackBookmarkLimit() { return { ok: false }; }

/** Resolve only the exact message. Search results do not include personal To-do state.
 * @param {SlackConnection} connection @param {SlackItem} item @param {string} threadTs
 * @returns {'to_do' | 'completed' | 'unknown'}
 */
function slackTodoState_(connection, item, threadTs) {
  const parts = item.id.split(':');
  const channel = parts[1], ts = parts[2];
  const query = '?channel=' + encodeURIComponent(channel) + '&oldest=' + ts + '&latest=' + ts + '&inclusive=true&limit=2';
  const data = threadTs
    ? slackRequest_(connection.token, 'conversations.replies', query + '&ts=' + threadTs)
    : slackRequest_(connection.token, 'conversations.history', query);
  if (!Array.isArray(data.messages)) throw new Error('REQUEST_FAILED');
  const state = data.messages.find((/** @type {any} */ message) => message?.ts === ts)?.saved?.todo_state;
  return state === 'to_do' || state === 'completed' ? state : 'unknown';
}
/** Thread parents may be supplied only in the search permalink. Never fetch that URL.
 * @param {any} raw @returns {string}
 */
function slackThreadTimestamp_(raw) {
  const direct = raw.thread_ts;
  if (typeof direct === 'string' && /^\d{10}\.\d{6}$/.test(direct)) return direct === raw.ts ? '' : direct;
  const match = typeof raw.permalink === 'string' ? /[?&]thread_ts=(\d{10}\.\d{6})(?:&|$)/.exec(raw.permalink) : null;
  return match && match[1] !== raw.ts ? match[1] : '';
}
/** Search candidates are capped before completion filtering; never backfill completed items.
 * At most two search pages and one detail request per unique candidate.
 * @param {SlackConnection} connection @param {number} limit @returns {SlackSearch}
 */
function slackSearch_(connection, limit) {
  /** @type {SlackSearch} */
  const result = { items: [], partial: false, error: '', hasMore: false, diagnostics: { searchTotal: null, received: 0, eligible: 0, skipped: 0, hasMore: null, remaining: null, completed: 0, incomplete: 0, unknown: 0 } };
  const seen = new Set();
  /** @type {{item: SlackItem, threadTs: string}[]} */
  const candidates = [];
  const now = Date.now();
  const cutoff = now - 31 * 86400000;
  // Slack dates are day-granular. Search one extra boundary day, then enforce the exact window.
  const after = new Date(cutoff - 86400000).toISOString().slice(0, 10);
  const query = encodeURIComponent('is:to-do after:' + after);
  let scanned = 0;
  const count = Math.min(limit, 100);
  const pages = Math.ceil(limit / count);
  let cursor = '*';
  let total = -1;
  let consistentTotal = true;
  try {
    for (let page = 1; page <= pages; page++) {
      const data = slackRequest_(connection.token, 'search.messages', '?query=' + query + '&count=' + count + '&sort=timestamp&sort_dir=desc&' + (cursor ? 'cursor=' + encodeURIComponent(cursor) : 'page=' + page));
      const messages = data.messages;
      if (!messages || !Array.isArray(messages.matches) || messages.matches.length > count || !Number.isSafeInteger(messages.total) || messages.total < 0) throw new Error('REQUEST_FAILED');
      if (total >= 0 && total !== messages.total) { result.partial = true; consistentTotal = false; }
      total = messages.total;
      result.hasMore = total > limit;
      for (const raw of messages.matches.slice(0, limit - scanned)) {
        scanned++;
        const item = slackItem_(raw, connection);
        if (!item || seen.has(item.id)) { result.partial = true; continue; }
        seen.add(item.id);
        const postedAt = Date.parse(item.postedAt);
        if (postedAt < cutoff || postedAt > now) continue;
        candidates.push({ item, threadTs: slackThreadTimestamp_(raw) });
      }
      const next = messages.pagination?.next_cursor ?? messages.paging?.next_cursor ?? data.response_metadata?.next_cursor;
      if (next !== undefined && (typeof next !== 'string' || next.length > 4096)) throw new Error('REQUEST_FAILED');
      const more = next !== undefined ? Boolean(next) : page * count < total;
      if (!more || page === pages) {
        result.hasMore = result.hasMore || more;
        result.partial = result.partial || scanned < Math.min(limit, total);
        break;
      }
      cursor = next || '';
    }
  } catch (error) { result.error = slackErrorCode_(error); result.partial = true; }
  const diagnostics = result.diagnostics;
  diagnostics.received = scanned;
  diagnostics.eligible = candidates.length;
  diagnostics.skipped = scanned - candidates.length;
  if (total >= 0 && consistentTotal) {
    diagnostics.searchTotal = total;
    diagnostics.hasMore = result.hasMore || total > scanned;
    // Contradictory pagination cannot establish an exact remainder.
    if (total >= scanned && !(diagnostics.hasMore && total === scanned)) diagnostics.remaining = total - scanned;
  }
  // Stop on global failures instead of repeatedly hitting a revoked token or rate limit.
  let stopped = ['RATE_LIMITED', 'UNAUTHORIZED', 'AUTHORIZATION_REQUIRED'].includes(result.error);
  const started = Date.now();
  for (const { item, threadTs } of candidates) {
    let state = /** @type {'to_do' | 'completed' | 'unknown'} */ ('unknown');
    if (!stopped && Date.now() - started < 25000) {
      try { state = slackTodoState_(connection, item, threadTs); }
      catch (error) {
        const code = slackErrorCode_(error);
        if (!result.error) result.error = code;
        result.partial = true;
        stopped = ['RATE_LIMITED', 'UNAUTHORIZED', 'AUTHORIZATION_REQUIRED'].includes(code);
      }
    } else {
      result.partial = true;
    }
    if (state === 'completed') diagnostics.completed++;
    else if (state === 'to_do') diagnostics.incomplete++;
    else diagnostics.unknown++;
    if (state !== 'completed') result.items.push({ ...item, todoState: state });
  }
  return result;
}
/** @param {unknown} id @param {boolean} [forceRefresh] */
function getSlackActionItems(id, forceRefresh = false) {
  try {
    if (typeof id !== 'string') throw new Error('INVALID_CONNECTION');
    const connection = slackConnections_().find((item) => item.id === id);
    if (!connection) throw new Error('INVALID_CONNECTION');
    const ttl = normalizeActionsCacheTtl_(PropertiesService.getUserProperties().getProperty('ACTIONS_CACHE_SECONDS'));
    const limit = PortalSlackSettings.limit;
    const key = slackCacheKey_(connection, limit);
    if (forceRefresh === true || ttl === 0) {
      try { CacheService.getUserCache().remove(key); } catch { /* Optional cache. */ }
    }
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
      if (ttl > 0 && !result.error && !result.partial) {
        try {
          const serialized = JSON.stringify({ connectionId: id, revision: connection.revision, limit, result, fetchedAt });
          if (Utilities.newBlob(serialized).getBytes().length < 95000) CacheService.getUserCache().put(key, serialized, ttl);
        } catch { /* Large results and unavailable cache fall back to live reads. */ }
      }
      return { ok: true, ...result, fetchedAt, cached: false };
    });
  } catch (error) { return { ok: false, error: slackErrorCode_(error) }; }
}

/** Saved messages are reference links, independent of the To-do candidate window and cache.
 * @param {unknown} id @param {boolean} [forceRefresh]
 */
function getSlackBookmarks(id, forceRefresh = false) {
  try {
    if (typeof id !== 'string') throw new Error('INVALID_CONNECTION');
    const connection = slackConnections_().find((item) => item.id === id);
    if (!connection) throw new Error('INVALID_CONNECTION');
    const ttl = normalizeCatalogCacheTtl_(PropertiesService.getUserProperties().getProperty('CATALOG_CACHE_SECONDS'));
    const key = slackBookmarksCacheKey_(connection);
    if (forceRefresh === true || ttl === 0) {
      try { CacheService.getUserCache().remove(key); } catch { /* Optional cache. */ }
    } else {
      try {
        const cached = JSON.parse(CacheService.getUserCache().get(key) || 'null');
        if (cached?.connectionId === id && cached.revision === connection.revision && Array.isArray(cached.result?.items) && Date.now() - cached.fetchedAt >= 0 && Date.now() - cached.fetchedAt < ttl * 1000) return { ok: true, ...cached.result, fetchedAt: cached.fetchedAt, cached: true };
      } catch { /* Fall through to live retrieval. */ }
    }
    /** @type {SlackItem[]} */
    const items = [];
    const seen = new Set();
    let cursor = '*', hasMore = false, partial = false, error = '', scanned = 0, total = -1;
    try {
      for (let page = 1; page <= 2; page++) {
        const data = slackRequest_(connection.token, 'search.messages', '?query=is%3Asaved&count=100&sort=timestamp&sort_dir=desc&' + (cursor ? 'cursor=' + encodeURIComponent(cursor) : 'page=' + page));
        const messages = data.messages;
        if (!messages || !Array.isArray(messages.matches) || messages.matches.length > 100 || !Number.isSafeInteger(messages.total) || messages.total < 0) throw new Error('REQUEST_FAILED');
        if (total >= 0 && total !== messages.total) partial = true;
        total = messages.total;
        for (const raw of messages.matches) {
          scanned++;
          const item = slackItem_(raw, connection);
          if (!item || seen.has(item.id)) { partial = true; continue; }
          seen.add(item.id); items.push(item);
        }
        const next = messages.pagination?.next_cursor ?? messages.paging?.next_cursor ?? data.response_metadata?.next_cursor;
        if (next !== undefined && (typeof next !== 'string' || next.length > 4096)) throw new Error('REQUEST_FAILED');
        hasMore = next !== undefined ? Boolean(next) : scanned < total;
        if (!hasMore || page === 2) {
          partial = partial || scanned < Math.min(200, total);
          hasMore = hasMore || scanned < total;
          break;
        }
        cursor = next || '';
      }
    } catch (cause) { error = slackErrorCode_(cause); partial = true; }
    const result = { workspace: connection.workspace, url: connection.url, items, hasMore, partial, error };
    const fetchedAt = Date.now();
    return withSlackLock_(() => {
      if (slackConnections_().find((item) => item.id === id)?.revision !== connection.revision) throw new Error('CONNECTION_CHANGED');
      if (ttl > 0 && !partial && !error) {
        try {
          const serialized = JSON.stringify({ connectionId: id, revision: connection.revision, result, fetchedAt });
          if (Utilities.newBlob(serialized).getBytes().length < 95000) CacheService.getUserCache().put(key, serialized, ttl);
        } catch { /* Large results are served without caching. */ }
      }
      return { ok: true, ...result, fetchedAt, cached: false };
    });
  } catch (error) { return { ok: false, error: slackErrorCode_(error) }; }
}
/** @param {SlackConnection} connection */
function slackBookmarksCacheKey_(connection) { return 'slack-bookmarks-v1:' + connection.id + ':' + connection.revision; }
