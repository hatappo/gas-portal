import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';

const input = { id: '', token: 'github_pat_TEST_SECRET', owner: 'acme' };
function fixture(options = {}) {
  const requests = [];
  const cache = new Map();
  const userProperties = options.userProperties || {};
  let respond = (url) => ({ status: 200, body: url.includes('/users/') ? { type: 'Organization' } : { login: 'octocat' } });
  const app = server({ userProperties,
    UrlFetchApp: { fetch(url, init) { requests.push({ url, init }); const { status = 200, body = {}, headers = {} } = respond(url, init); return { getResponseCode: () => status, getContentText: () => JSON.stringify(body), getAllHeaders: () => headers }; } },
    CacheService: { getUserCache: () => ({ get: (key) => cache.get(key), put: (key, value, ttl) => { assert.equal(ttl, Number(userProperties.ACTIONS_CACHE_SECONDS || 300)); cache.set(key, value); }, remove: (key) => cache.delete(key) }) },
  });
  return { ...app, requests, cache, userProperties, respond(fn) { respond = fn; }, connect(value = input) { const result = app.context.saveGitHubConnection(value); assert.equal(result.ok, true, JSON.stringify(result)); requests.length = 0; return result.connection; } };
}
function raw(number, pull = false, overrides = {}) {
  return { id: number, number, title: 'Work ' + number, state: 'open', repository_url: 'https://api.github.com/repos/acme/portal', updated_at: '2026-11-04T12:00:00Z', html_url: 'javascript:evil()', body: 'private-body', ...(pull ? { pull_request: {} } : {}), ...overrides };
}
function searchReply(url, items = [raw(1)], extra = {}) {
  if (!url.includes('/search/')) return { body: url.includes('/users/') ? { type: 'Organization' } : { login: 'octocat' } };
  const query = new URL(url).searchParams.get('q');
  return { body: { total_count: items.length, incomplete_results: false, items: query.includes('is:issue') ? items : items.map((item) => ({ ...item, pull_request: {} })), ...extra } };
}

test('Validate and privately store fine-grained credentials; expose only explicit metadata', () => {
  const app = fixture();
  const connection = app.connect();
  const saved = Object.values(app.userProperties).map(JSON.parse)[0];
  assert.equal(saved.token, input.token);
  assert.equal(saved.login, 'octocat');
  for (const result of [connection, app.context.getGitHubConnections(), app.context.getPortalContent_(app.userProperties)]) assert.doesNotMatch(JSON.stringify(result), /TEST_SECRET|"token"/);
  const updated = app.context.saveGitHubConnection({ ...input, id: connection.id, token: '', owner: '' });
  assert.equal(updated.ok, true);
  assert.equal(connection.label, 'acme@octocat');
  assert.equal(updated.connection.label, '*@octocat');
  assert.equal(Object.hasOwn(saved, 'label'), false);
  assert.equal(Object.hasOwn(saved, 'repositories'), false);
  assert.equal(JSON.parse(Object.values(app.userProperties)[0]).token, input.token);
  assert.notEqual(JSON.parse(Object.values(app.userProperties)[0]).revision, saved.revision);
  assert.equal(app.requests[0].init.headers.Authorization, 'Bearer ' + input.token);
  assert.equal(app.requests[0].init.method, 'get');
  assert.equal(app.requests[0].init.followRedirects, false);
  assert.doesNotMatch(JSON.stringify(app.logs), /TEST_SECRET/);
});

test('Reject classic tokens, query injection, invalid scopes and foreign connection IDs without requests', () => {
  const app = fixture();
  for (const values of [null, { ...input, token: 'ghp_broad' }, { ...input, owner: 'acme OR user:evil' }, { ...input, repositories: 'acme/portal is:closed' }, { ...input, repositories: 'other/repo' }, { ...input, id: '../other' }, { ...input, token: 'github_pat_a\nheader' }, { ...input, extra: 'ignored?' }]) {
    assert.equal(app.context.saveGitHubConnection(values).ok, false);
  }
  assert.equal(app.requests.length, 0);
  assert.equal(Object.keys(app.userProperties).length, 0);
});

test('Keep existing settings when authorization or owner lookup fails; redact upstream errors', () => {
  const app = fixture(); const connection = app.connect(); const before = { ...app.userProperties };
  for (const [status, expected] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [404, 'FORBIDDEN'], [429, 'RATE_LIMITED'], [422, 'INVALID_FILTER'], [302, 'REQUEST_FAILED'], [500, 'REQUEST_FAILED']]) {
    app.respond(() => ({ status, body: { message: 'TEST_SECRET' } }));
    const result = app.context.saveGitHubConnection({ ...input, id: connection.id });
    assert.deepEqual(plain(result), { ok: false, error: expected });
    assert.deepEqual(app.userProperties, before);
  }
  app.respond((url) => url.endsWith('/user') ? { body: { login: 'octocat' } } : { status: 404 });
  assert.equal(app.context.saveGitHubConnection({ ...input, id: connection.id }).error, 'FORBIDDEN');
  assert.deepEqual(app.userProperties, before);
  assert.ok(app.context.getGitHubActionItems(connection.id).groups.every((group) => group.error === 'FORBIDDEN'));
  app.respond(() => { throw new Error('Authorization: TEST_SECRET'); });
  assert.ok(app.context.getGitHubActionItems(connection.id).groups.every((group) => group.error === 'REQUEST_FAILED'));
  assert.doesNotMatch(JSON.stringify(app.logs), /TEST_SECRET/);
});

test('Query assigned issues and direct/team reviews, paginate, deduplicate and whitelist item data', () => {
  const app = fixture(); const connection = app.connect();
  app.respond((url) => {
    if (!url.includes('/search/')) return searchReply(url);
    const page = new URL(url).searchParams.get('page');
    return searchReply(url, page === '1' ? Array.from({ length: 100 }, (_, i) => raw(i + 1)) : [raw(100), raw(101), raw(102, false, { repository_url: 'https://evil.test/repo' })], { total_count: 102 });
  });
  const result = app.context.getGitHubActionItems(connection.id);
  assert.equal(result.ok, true);
  assert.equal(result.groups.length, 4);
  for (const group of result.groups) {
    assert.equal(group.items.length, 101);
    assert.equal(group.partial, true);
    assert.match(group.items[0].url, /^https:\/\/github.com\/acme\/portal\/(issues|pull)\/1$/);
  }
  const queries = app.requests.filter((request) => request.url.includes('/search/')).map((request) => new URL(request.url).searchParams.get('q'));
  assert.equal(queries.length, 8);
  assert.match(queries[0], /is:open is:issue assignee:octocat org:acme/);
  assert.match(queries[2], /user-review-requested:@me/);
  assert.match(queries[4], /team-review-requested-user:octocat/);
  assert.equal(queries[6], 'is:open is:pr author:octocat review:changes_requested org:acme');
  assert.equal(result.groups[3].kind, 'changes');
  assert.deepEqual(plain(result.groups[3].items[0].reasons), ['changes']);
  assert.doesNotMatch(JSON.stringify(result), /private-body|TEST_SECRET|javascript|evil.test/);
});

test('Bound search requests and identify truncation, incomplete results, and partial failures', () => {
  const app = fixture(); const connection = app.connect();
  app.respond((url) => searchReply(url, Array.from({ length: 100 }, (_, i) => raw(i + 1 + (Number(new URL(url).searchParams.get('page')) - 1) * 100)), { total_count: 2000 }));
  const truncated = app.context.getGitHubActionItems(connection.id);
  assert.ok(truncated.groups.every((group) => group.items.length === 200 && group.partial));
  app.respond((url) => {
    if (url.includes('/search/') && new URL(url).searchParams.get('q').includes('user-review-requested')) return { status: 403, headers: { 'Retry-After': '60' } };
    return searchReply(url, [raw(1)], { incomplete_results: true });
  });
  const partial = app.context.getGitHubActionItems(connection.id, true);
  assert.equal(partial.groups[0].items.length, 1);
  assert.equal(partial.groups[0].partial, true);
  assert.equal(partial.groups[1].error, 'RATE_LIMITED');
  assert.equal(partial.groups[2].error, 'RATE_LIMITED');
  assert.equal(partial.groups[3].error, 'RATE_LIMITED');
  assert.equal(app.cache.size, 0, 'Do not cache failed requests');
});

test('Cache only whitelisted data per connection and user, and invalidate after force refresh, editing, or disconnect', () => {
  const app = fixture(); const connection = app.connect(); app.respond((url) => searchReply(url));
  assert.equal(app.context.getGitHubActionItems(connection.id).cached, false);
  const count = app.requests.length;
  assert.equal(app.context.getGitHubActionItems(connection.id).cached, true);
  assert.equal(app.requests.length, count);
  assert.doesNotMatch([...app.cache.values()].join(''), /TEST_SECRET|private-body/);
  const other = fixture(); assert.equal(other.context.getGitHubConnections().connections.length, 0);
  assert.equal(other.context.getGitHubActionItems(connection.id).error, 'INVALID_CONNECTION');
  const otherConnection = app.connect({ ...input, owner: '' }); app.respond((url) => searchReply(url));
  assert.equal(app.context.getGitHubActionItems(otherConnection.id).cached, false);
  assert.equal(app.cache.size, 2);
  app.respond(() => ({ status: 401 }));
  assert.equal(app.context.getGitHubActionItems(connection.id, true).error, 'UNAUTHORIZED');
  assert.equal(app.cache.size, 1);
  assert.equal(app.context.disconnectGitHub(otherConnection.id).ok, true);
  assert.equal(app.cache.size, 0);
  assert.equal(app.context.getGitHubActionItems(otherConnection.id).error, 'INVALID_CONNECTION');
  assert.equal(app.context.getGitHubConnections().connections.length, 1);
});

test('Ignore expired cache and reject a result if the connection changes during fetching', () => {
  const app = fixture(); const connection = app.connect(); app.respond((url) => searchReply(url));
  app.context.getGitHubActionItems(connection.id);
  for (const [key, value] of app.cache) app.cache.set(key, JSON.stringify({ ...JSON.parse(value), fetchedAt: Date.now() - 300001 }));
  assert.equal(app.context.getGitHubActionItems(connection.id).cached, false);
  app.respond((url) => {
    if (url.includes('/search/')) app.context.disconnectGitHub(connection.id);
    return searchReply(url);
  });
  assert.equal(app.context.getGitHubActionItems(connection.id, true).error, 'CONNECTION_CHANGED');
  assert.equal(app.cache.size, 0);
});

test('Limit saved connections and preserve unrelated properties on disconnect', () => {
  const app = fixture();
  const first = app.connect(); app.connect(); app.connect();
  app.userProperties.PORTAL_NAME = 'Keep';
  assert.equal(app.context.saveGitHubConnection(input).error, 'CONNECTION_LIMIT');
  assert.equal(app.context.disconnectGitHub(first.id).ok, true);
  assert.equal(app.userProperties.PORTAL_NAME, 'Keep');
});

test('Resolve organization and user owner filters from GitHub instead of assuming they are interchangeable', () => {
  for (const [type, qualifier] of [['User', 'user'], ['Organization', 'org']]) {
    const app = fixture();
    app.respond((url) => ({ body: url.includes('/users/') ? { type } : { login: 'octocat' } }));
    const connection = app.connect();
    app.respond((url) => searchReply(url, []));
    const result = app.context.getGitHubActionItems(connection.id);
    assert.equal(result.ok, true);
    assert.ok(result.groups.every((group) => group.items.length === 0 && !group.partial && !group.error));
    assert.match(new URL(app.requests.find((request) => request.url.includes('/search/')).url).searchParams.get('q'), new RegExp(qualifier + ':acme'));
  }
});

test('Report a failed second page while preserving first-page items and never caching the partial failure', () => {
  const app = fixture(); const connection = app.connect();
  app.respond((url) => new URL(url).searchParams.get('page') === '2' ? { status: 503 } : searchReply(url, Array.from({ length: 100 }, (_, i) => raw(i + 1)), { total_count: 150 }));
  const result = app.context.getGitHubActionItems(connection.id);
  assert.ok(result.groups.every((group) => group.items.length === 100 && group.error === 'REQUEST_FAILED' && group.partial));
  assert.equal(app.cache.size, 0);
});

test('Reject malformed API payloads without exposing data and handle missing external-request consent', () => {
  const app = fixture(); const connection = app.connect();
  app.respond((url) => url.includes('/search/') ? { body: { secret: 'TEST_SECRET', items: {} } } : { body: { login: 'octocat' } });
  const result = app.context.getGitHubActionItems(connection.id);
  assert.ok(result.groups.every((group) => group.error === 'REQUEST_FAILED'));
  assert.doesNotMatch(JSON.stringify(result), /TEST_SECRET/);
  app.context.ScriptApp.getAuthorizationInfo = () => ({ getAuthorizationStatus: () => 'REQUIRED' });
  app.context.ScriptApp.AuthorizationStatus = { REQUIRED: 'REQUIRED' };
  app.respond(() => { throw new Error('Permission denied'); });
  assert.equal(app.context.getGitHubActionItems(connection.id).error, 'AUTHORIZATION_REQUIRED');
});

test('An empty owner searches across accessible repositories without repository filters or access probes', () => {
  const app = fixture(); const connection = app.connect({ ...input, owner: '' });
  assert.equal(connection.label, '*@octocat');
  app.respond((url) => searchReply(url));
  const result = app.context.getGitHubActionItems(connection.id);
  assert.equal(result.ok, true);
  const queries = app.requests.filter(({ url }) => url.includes('/search/')).map(({ url }) => new URL(url).searchParams.get('q'));
  assert.deepEqual(queries, [
    'is:open is:issue assignee:octocat',
    'is:open is:pr user-review-requested:@me',
    'is:open is:pr team-review-requested-user:octocat',
    'is:open is:pr author:octocat review:changes_requested',
  ]);
  assert.equal(app.requests.length, 4, 'Use the saved identity without blocking searches on another authenticated-user lookup');
  assert.ok(app.requests.every(({ url }) => url.includes('/search/issues?')));
});

test('Fetch the fourth category instead of reusing a three-category cache and preserve other results if it fails', () => {
  const app = fixture(); const connection = app.connect();
  const saved = JSON.parse(Object.values(app.userProperties)[0]);
  app.cache.set('github-actions-v2:' + connection.id + ':' + saved.revision, JSON.stringify({ connectionId: connection.id, revision: saved.revision, fetchedAt: Date.now(), groups: [] }));
  app.respond((url) => url.includes('/search/') && new URL(url).searchParams.get('q').includes('review:changes_requested')
    ? { status: 503 } : searchReply(url));
  const result = app.context.getGitHubActionItems(connection.id);
  assert.equal(result.cached, false);
  assert.equal(result.groups.length, 4);
  assert.ok(result.groups.slice(0, 3).every((group) => group.items.length === 1 && !group.error));
  assert.equal(result.groups[3].error, 'REQUEST_FAILED');
  assert.equal(result.groups[3].partial, true);
  assert.equal(new URL(result.groups[3].searchUrl).searchParams.get('q'), 'is:open is:pr author:octocat review:changes_requested org:acme');
  assert.ok([...app.cache.keys()].every((key) => key.startsWith('github-actions-v2:')), 'Failed four-category responses must not be cached');
});

test('Apply the shared Action Items duration to every connection and bypass reads and writes when disabled', () => {
  const app = fixture();
  const first = app.connect(); const second = app.connect({ ...input, owner: '' });
  app.respond((url) => searchReply(url));
  app.context.saveActionsCacheTtl(21600);
  for (const id of [first.id, second.id]) {
    assert.equal(app.context.getGitHubActionItems(id).cached, false);
    assert.equal(app.context.getGitHubActionItems(id).cached, true);
  }
  for (const [key, value] of app.cache) app.cache.set(key, JSON.stringify({ ...JSON.parse(value), fetchedAt: Date.now() - 60001 }));
  assert.equal(app.context.getGitHubActionItems(first.id).cached, true);
  app.context.saveActionsCacheTtl(60);
  for (const id of [first.id, second.id]) assert.equal(app.context.getGitHubActionItems(id).cached, false);
  app.context.saveActionsCacheTtl(0);
  const count = app.requests.length;
  for (const id of [first.id, second.id, first.id]) assert.equal(app.context.getGitHubActionItems(id).cached, false);
  assert.equal(app.requests.length - count, 12);
  assert.equal(app.cache.size, 0);
});

test('Detect revoked credentials in the first search without identity lookup or subsequent searches', () => {
  const app = fixture(); const connection = app.connect();
  app.respond(() => ({ status: 401 }));
  assert.deepEqual(plain(app.context.getGitHubActionItems(connection.id)), { ok: false, error: 'UNAUTHORIZED' });
  assert.equal(app.requests.length, 1);
  assert.match(app.requests[0].url, /\/search\/issues\?/);
  assert.equal(app.cache.size, 0);
});
