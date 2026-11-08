import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';

const input = { id: '', token: 'xoxp-TEST-SECRET' };
const identity = { ok: true, team_id: 'TDEMO', user_id: 'UDEMO', team: 'Demo', user: 'alex', url: 'https://demo.slack.com/' };
const message = (number = 1, overrides = {}) => ({ type: 'message', text: 'Review <https://example.com|the plan> &amp; discuss', ts: `1793987462.${String(number).padStart(6, '0')}`, channel: { id: 'CDEMO', name: 'team' }, permalink: 'javascript:evil()', blocks: ['secret-extra'], ...overrides });
const search = (matches = [message()], total = matches.length, cursor = '') => ({ ok: true, messages: { total, matches, pagination: { next_cursor: cursor } } });
function fixture(userProperties = {}) {
  const requests = [], cache = new Map();
  let respond = (url) => ({ body: url.endsWith('auth.test') ? identity : search() });
  const app = server({ userProperties,
    UrlFetchApp: { fetch(url, init) { requests.push({ url, init }); const { status = 200, body = {} } = respond(url, init); return { getResponseCode: () => status, getContentText: () => JSON.stringify(body) }; } },
    CacheService: { getUserCache: () => ({ get: (key) => cache.get(key), put: (key, value, ttl) => { assert.equal(ttl, Number(userProperties.ACTIONS_CACHE_SECONDS || 300)); cache.set(key, value); }, remove: (key) => cache.delete(key) }) },
  });
  return { ...app, requests, cache, userProperties, respond(fn) { respond = fn; }, connect() { const result = app.context.saveSlackConnection(input); assert.equal(result.ok, true, JSON.stringify(result)); requests.length = 0; return result.connection; } };
}

test('Slack validates app-issued user tokens and exposes metadata without secrets or extra identity requests', () => {
  const app = fixture(), connection = app.connect();
  assert.equal(connection.label, 'Demo@alex');
  assert.deepEqual(Object.keys(connection).sort(), ['id', 'label', 'tokenSuffix']);
  assert.equal(connection.tokenSuffix, input.token.slice(-2));
  assert.equal(JSON.parse(Object.values(app.userProperties)[0]).token, input.token);
  assert.deepEqual(plain(app.context.getSlackConnections()), { ok: true, connections: [plain(connection)] });
  assert.equal(app.requests.length, 0);
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(app.requests.length, 1);
  assert.equal(new URL(app.requests[0].url).pathname, '/api/search.messages');
  assert.equal(new URL(app.requests[0].url).searchParams.get('query'), 'is:saved');
  assert.equal(app.requests[0].init.headers.Authorization, 'Bearer ' + input.token);
  assert.equal(app.requests[0].init.followRedirects, false);
  assert.equal(result.items[0].title, 'Review the plan & discuss');
  assert.equal(result.items[0].url, 'https://demo.slack.com/archives/CDEMO/p1793987462000001');
  assert.equal(result.items[0].id, 'TDEMO:CDEMO:1793987462.000001');
  assert.equal(result.items[0].context, 'Demo · team');
  assert.ok(Number.isFinite(Date.parse(result.items[0].postedAt)));
  for (const value of [result, app.context.getSlackConnections(), app.context.getPortalContent_(app.userProperties), app.logs, [...app.cache.values()]]) assert.doesNotMatch(JSON.stringify(value), /TEST-SECRET|secret-extra|javascript:/);
});

test('Slack rejects browser credentials, bot tokens, unknown input fields and foreign IDs without requests', () => {
  const app = fixture();
  for (const value of [null, { ...input, token: 'xoxc-browser' }, { ...input, token: 'xoxb-bot' }, { ...input, token: 'xoxp-a\nheader' }, { ...input, token: 'xoxp-' + 'a'.repeat(512) }, { ...input, extra: true }, { ...input, id: '../elsewhere' }, { id: '', token: '' }]) assert.equal(app.context.saveSlackConnection(value).ok, false);
  assert.equal(app.requests.length, 0);
  assert.equal(Object.keys(app.userProperties).length, 0);
});

test('Slack keeps credentials on failed edits and reports bounded API errors without raw bodies', () => {
  const app = fixture(), connection = app.connect(), before = { ...app.userProperties };
  for (const [status, body, code] of [[200, { ok: false, error: 'token_revoked' }, 'UNAUTHORIZED'], [200, { ok: false, error: 'missing_scope' }, 'MISSING_SCOPE'], [200, { ok: false, error: 'ratelimited' }, 'RATE_LIMITED'], [429, {}, 'RATE_LIMITED'], [302, {}, 'REQUEST_FAILED'], [500, {}, 'REQUEST_FAILED'], [200, { ok: false, error: input.token }, 'REQUEST_FAILED']]) {
    app.respond(() => ({ status, body }));
    assert.equal(app.context.saveSlackConnection({ id: connection.id, token: '' }).error, code);
    assert.deepEqual(app.userProperties, before);
    const result = app.context.getSlackActionItems(connection.id, true);
    assert.equal(result.error, code);
    assert.equal(result.items.length, 0);
    assert.equal(app.cache.size, 0);
  }
  app.respond(() => { throw new Error(input.token); });
  assert.equal(app.context.getSlackActionItems(connection.id).error, 'REQUEST_FAILED');
  assert.doesNotMatch(JSON.stringify(app.logs), /TEST-SECRET/);
});

test('Slack paginates with cursors, deduplicates, filters unsafe records and bounds requests', () => {
  const app = fixture({ SLACK_BOOKMARK_LIMIT: '200' }), connection = app.connect();
  app.respond((url) => ({ body: new URL(url).searchParams.get('cursor') === '*' ? search([message()], 3, 'next=/&?') : search([message(), message(2), message(3, { channel: { id: '../evil' } })], 3) }));
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(result.items.length, 2);
  assert.equal(result.partial, true);
  assert.equal(app.requests.length, 2);
  assert.equal(new URL(app.requests[1].url).searchParams.get('cursor'), 'next=/&?');
  app.respond(() => ({ body: search(Array.from({ length: 100 }, (_, i) => message(i)), 1000, 'more') }));
  const count = app.requests.length;
  assert.equal(app.context.getSlackActionItems(connection.id, true).partial, true);
  assert.equal(app.requests.length - count, 2);
});

test('Slack preserves first-page results after a second-page failure and never caches failed searches', () => {
  const app = fixture({ SLACK_BOOKMARK_LIMIT: '200' }), connection = app.connect();
  app.respond((url) => new URL(url).searchParams.get('cursor') === '*' ? { body: search([message()], 2, 'next') } : { status: 429 });
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(result.items.length, 1);
  assert.equal(result.partial, true);
  assert.equal(result.error, 'RATE_LIMITED');
  assert.equal(app.cache.size, 0);
});

test('Slack supports legacy page pagination and flags incomplete search coverage', () => {
  const app = fixture({ SLACK_BOOKMARK_LIMIT: '200' }), connection = app.connect();
  app.respond((url) => ({ body: { ok: true, messages: { total: 101, matches: new URL(url).searchParams.has('page') ? [message(101)] : Array.from({ length: 100 }, (_, i) => message(i)) } } }));
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(result.items.length, 101);
  assert.equal(result.partial, false);
  assert.equal(new URL(app.requests[1].url).searchParams.get('page'), '2');
});

test('Slack shares Actions TTL, caches empty results and isolates user/revision credentials', () => {
  const app = fixture({ ACTIONS_CACHE_SECONDS: '900' }), connection = app.connect();
  app.respond(() => ({ body: search([]) }));
  assert.equal(app.context.getSlackActionItems(connection.id).cached, false);
  const count = app.requests.length;
  assert.equal(app.context.getSlackActionItems(connection.id).cached, true);
  assert.equal(app.requests.length, count);
  assert.equal(fixture().context.getSlackActionItems(connection.id).error, 'INVALID_CONNECTION');
  assert.equal(app.context.getSlackActionItems(connection.id, true).cached, false);
  const key = [...app.cache.keys()][0];
  app.respond(() => ({ body: identity }));
  assert.equal(app.context.saveSlackConnection({ id: connection.id, token: '' }).ok, true);
  assert.equal(app.cache.has(key), false);
  assert.equal(app.context.disconnectSlack(connection.id).ok, true);
  assert.equal(app.context.getSlackConnections().connections.length, 0);
});

test('Slack enforces duplicate and connection limits and rejects stale in-flight saves and reads', () => {
  const app = fixture(), connection = app.connect();
  assert.equal(app.context.saveSlackConnection(input).error, 'DUPLICATE_CONNECTION');
  for (const id of ['TOTHER', 'TTHIRD']) {
    app.respond(() => ({ body: { ...identity, team_id: id } }));
    assert.equal(app.context.saveSlackConnection(input).ok, true);
  }
  assert.equal(app.context.saveSlackConnection(input).error, 'CONNECTION_LIMIT');
  app.respond(() => { app.context.disconnectSlack(connection.id); return { body: search() }; });
  assert.equal(app.context.getSlackActionItems(connection.id).error, 'CONNECTION_CHANGED');
  assert.equal(app.cache.size, 0);
  const other = fixture(), saved = other.connect();
  other.respond(() => { other.context.disconnectSlack(saved.id); return { body: identity }; });
  assert.equal(other.context.saveSlackConnection({ id: saved.id, token: '' }).error, 'CONNECTION_CHANGED');
  assert.equal(other.context.getSlackConnections().connections.length, 0);
});

test('Slack honors shortened and disabled TTLs, and reads live when the cache is unavailable', () => {
  const app = fixture({ ACTIONS_CACHE_SECONDS: '21600' }), connection = app.connect();
  app.context.getSlackActionItems(connection.id);
  const key = [...app.cache.keys()][0], cached = JSON.parse(app.cache.get(key));
  cached.fetchedAt -= 120000; app.cache.set(key, JSON.stringify(cached));
  app.userProperties.ACTIONS_CACHE_SECONDS = '60';
  assert.equal(app.context.getSlackActionItems(connection.id).cached, false);
  app.userProperties.ACTIONS_CACHE_SECONDS = '0';
  assert.equal(app.context.getSlackActionItems(connection.id).cached, false);
  assert.equal(app.cache.size, 0);
  app.userProperties.ACTIONS_CACHE_SECONDS = '300';
  app.context.CacheService.getUserCache = () => { throw new Error('Unavailable'); };
  assert.equal(app.context.getSlackActionItems(connection.id).items.length, 1);
});

test('Slack rejects malformed search payloads and unsafe authenticated workspace URLs', () => {
  const app = fixture(), connection = app.connect();
  for (const body of [null, {}, { ok: true }, { ok: true, messages: { total: -1, matches: [] } }, search([], 2, { invalid: true })]) {
    app.respond(() => ({ body }));
    assert.equal(app.context.getSlackActionItems(connection.id, true).error, 'REQUEST_FAILED');
    assert.equal(app.cache.size, 0);
  }
  for (const url of ['https://demo.slack.com.evil.test/', 'http://demo.slack.com/', 'https://user@demo.slack.com/', 'https://demo.slack.com:123/']) {
    app.respond(() => ({ body: { ...identity, url } }));
    assert.equal(app.context.saveSlackConnection({ id: connection.id, token: '' }).error, 'UNAUTHORIZED');
  }
});

test('Slack defaults to 20 and distinguishes a full page from additional search results without another call', () => {
  for (const [total, hasMore] of [[19, false], [20, false], [21, true]]) {
    const app = fixture(), connection = app.connect();
    app.respond(url => {
      assert.equal(new URL(url).searchParams.get('count'), '20');
      return { body: search(Array.from({ length: Math.min(total, 20) }, (_, i) => message(i)), total, hasMore ? 'next' : '') };
    });
    const result = app.context.getSlackActionItems(connection.id);
    assert.equal(result.items.length, Math.min(total, 20));
    assert.equal(result.hasMore, hasMore);
    assert.equal(result.partial, false, 'Reaching the chosen limit is not a retrieval failure');
    assert.equal(app.requests.length, 1);
  }
});

test('Slack request sizes, pagination and cache entries follow the saved limit', () => {
  const app = fixture(), connection = app.connect();
  app.respond(url => {
    const count = Number(new URL(url).searchParams.get('count'));
    const page = new URL(url).searchParams.get('cursor') === '*' ? 1 : 2;
    return { body: search(Array.from({ length: count }, (_, i) => message(i + (page - 1) * count)), 205, 'next') };
  });
  for (const limit of [10, 20, 50, 100, 200]) {
    assert.equal(app.context.saveSlackBookmarkLimit(limit).ok, true);
    const before = app.requests.length;
    const result = app.context.getSlackActionItems(connection.id);
    assert.equal(result.items.length, limit);
    assert.equal(result.hasMore, true);
    assert.equal(result.partial, false);
    assert.equal(result.cached, false);
    assert.equal(app.requests.length - before, limit <= 100 ? 1 : 2);
    assert.equal(app.context.getSlackActionItems(connection.id).cached, true);
  }
  assert.equal(app.cache.size, 5);
  app.context.disconnectSlack(connection.id);
  assert.equal(app.cache.size, 0);
});

test('Slack limit settings validate input, preserve other properties and initialize missing defaults', () => {
  const app = fixture({ KEEP: 'value' });
  assert.equal(app.context.getPortalContent_(app.userProperties).slackBookmarkLimit, '20');
  for (const limit of ['20', 0, -1, 21, 1000, null, NaN]) assert.equal(app.context.saveSlackBookmarkLimit(limit).ok, false);
  assert.deepEqual(app.userProperties, { KEEP: 'value' });
  app.context.getPortalUserProperties_();
  assert.equal(app.userProperties.SLACK_BOOKMARK_LIMIT, '20');
  app.context.saveSlackBookmarkLimit(50);
  app.context.getPortalUserProperties_();
  assert.equal(app.userProperties.SLACK_BOOKMARK_LIMIT, '50');
  assert.equal(app.context.getPortalContent_(app.userProperties).slackBookmarkLimit, '50');
  app.context.PropertiesService.getUserProperties = () => { throw new Error('private failure'); };
  assert.deepEqual(plain(app.context.saveSlackBookmarkLimit(20)), { ok: false });
});


test('Slack exposes only the new two-character suffix after rotating credentials', () => {
  const app = fixture(), connection = app.connect();
  const token = input.token + 'XY';
  const updated = app.context.saveSlackConnection({ ...input, id: connection.id, token });
  assert.equal(updated.ok, true);
  assert.equal(updated.connection.tokenSuffix, 'XY');
  app.requests.length = 0;
  const metadata = app.context.getSlackConnections();
  assert.equal(metadata.connections[0].tokenSuffix, 'XY');
  assert.equal(app.requests.length, 0, 'Reading the suffix does not contact the provider');
  assert.doesNotMatch(JSON.stringify(metadata), /TEST[_-]SECRET|"token"/);
});
