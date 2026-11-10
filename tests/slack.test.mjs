import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';

const input = { id: '', token: 'xoxp-TEST-SECRET' };
const identity = { ok: true, team_id: 'TDEMO', user_id: 'UDEMO', team: 'Demo', user: 'alex', url: 'https://demo.slack.com/' };
const message = (number = 1, overrides = {}) => ({ type: 'message', text: 'Review <https://example.com|the plan> &amp; discuss', ts: `1793987462.${String(number).padStart(6, '0')}`, channel: { id: 'CDEMO', name: 'team' }, permalink: 'javascript:evil()', blocks: ['secret-extra'], ...overrides });
const search = (matches = [message()], total = matches.length, cursor = '') => ({ ok: true, messages: { total, matches, pagination: { next_cursor: cursor } } });
function fixture(userProperties = {}) {
  const requests = [], cache = new Map();
  let detail = (url) => ({ body: { ok: true, messages: [{ ts: new URL(url).searchParams.get('latest'), saved: { todo_state: 'to_do' } }] } });
  let respond = (url) => ({ body: url.endsWith('auth.test') ? identity : search() });
  class Clock extends Date { static now() { return Date.parse('2026-11-10T12:00:00Z'); } }
  const app = server({ userProperties, Date: Clock,
    UrlFetchApp: { fetch(url, init) { requests.push({ url, init }); const { status = 200, body = {} } = /conversations\.(history|replies)/.test(url) ? detail(url, init) : respond(url, init); return { getResponseCode: () => status, getContentText: () => JSON.stringify(body) }; } },
    CacheService: { getUserCache: () => ({ get: (key) => cache.get(key), put: (key, value, ttl) => { assert.equal(ttl, Number(userProperties.ACTIONS_CACHE_SECONDS || 300)); cache.set(key, value); }, remove: (key) => cache.delete(key) }) },
  });
  return { ...app, requests, cache, userProperties, respond(fn) { respond = fn; }, detail(fn) { detail = fn; }, connect() { const result = app.context.saveSlackConnection(input); assert.equal(result.ok, true, JSON.stringify(result)); requests.length = 0; return result.connection; } };
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
  assert.equal(app.requests.length, 2);
  assert.equal(new URL(app.requests[0].url).pathname, '/api/search.messages');
  assert.equal(new URL(app.requests[0].url).searchParams.get('query'), 'is:to-do after:2026-10-09');
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
  assert.equal(app.requests.length, 4);
  assert.equal(new URL(app.requests[1].url).searchParams.get('cursor'), 'next=/&?');
  app.respond(() => ({ body: search(Array.from({ length: 100 }, (_, i) => message(i)), 1000, 'more') }));
  const count = app.requests.length;
  assert.equal(app.context.getSlackActionItems(connection.id, true).partial, true);
  assert.equal(app.requests.length - count, 102);
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

test('Slack caps candidates at 200 across two pages and ignores old limit properties', () => {
  for (const [total, hasMore] of [[199, false], [200, false], [201, true]]) {
    const app = fixture({ SLACK_BOOKMARK_LIMIT: '10' }), connection = app.connect();
    app.respond(url => {
      const params = new URL(url).searchParams;
      assert.equal(params.get('count'), '100');
      const offset = params.get('cursor') === '*' ? 0 : 100;
      const count = Math.min(100, total - offset);
      return { body: search(Array.from({ length: count }, (_, i) => message(offset + i)), total, offset + count < total ? 'next' : '') };
    });
    const result = app.context.getSlackActionItems(connection.id);
    assert.equal(result.items.length, Math.min(total, 200));
    assert.equal(result.hasMore, hasMore);
    assert.equal(result.partial, false);
    assert.equal(app.requests.length, 2 + Math.min(total, 200));
    assert.equal(app.context.getSlackActionItems(connection.id).cached, true);
    assert.equal(app.cache.size, 1);
    app.context.disconnectSlack(connection.id);
    assert.equal(app.cache.size, 0);
  }
});

test('Slack no longer initializes a limit property and rejects retired settings RPC calls', () => {
  const app = fixture({ KEEP: 'value' });
  for (const limit of [10, 20, 50, 100, 200]) assert.deepEqual(plain(app.context.saveSlackBookmarkLimit(limit)), { ok: false });
  assert.deepEqual(app.userProperties, { KEEP: 'value' });
  app.context.getPortalUserProperties_();
  assert.equal(app.userProperties.SLACK_BOOKMARK_LIMIT, undefined);
  assert.equal(app.context.getPortalContent_(app.userProperties).slackBookmarkLimit, undefined);
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


test('Slack excludes completed To-dos, keeps unknown states, and does not backfill the check limit', () => {
  const app = fixture(), connection = app.connect();
  app.respond(url => {
    const offset = new URL(url).searchParams.get('cursor') === '*' ? 0 : 100;
    return { body: search(Array.from({ length: 100 }, (_, i) => message(offset + i + 1)), 250, 'next') };
  });
  app.detail(url => {
    const ts = new URL(url).searchParams.get('latest');
    return { body: { ok: true, messages: [{ ts, saved: { todo_state: ts.endsWith('000002') ? 'to_do' : ts.endsWith('000003') ? 'future-state' : 'completed' } }] } };
  });
  const result = app.context.getSlackActionItems(connection.id);
  assert.deepEqual(plain(result.diagnostics), { searchTotal: 250, received: 200, eligible: 200, skipped: 0, hasMore: true, remaining: 50, completed: 198, incomplete: 1, unknown: 1 });
  const propertiesBeforeCacheRead = { ...app.userProperties };
  assert.deepEqual(plain(app.context.getSlackActionItems(connection.id).diagnostics), plain(result.diagnostics));
  assert.deepEqual(app.userProperties, propertiesBeforeCacheRead);
  assert.deepEqual(plain(result.items.map(item => item.todoState)), ['to_do', 'unknown']);
  assert.equal(result.hasMore, true);
  assert.equal(app.requests.length, 202);
  assert.equal(app.context.getSlackActionItems(connection.id).cached, true);
  assert.equal(app.requests.length, 202);
});

test('Slack applies a rolling 31-day posting window before detail requests, not registration dates', () => {
  const app = fixture(), connection = app.connect();
  const cutoff = app.context.Date.now() / 1000 - 31 * 86400;
  const at = n => String(n) + '.000000';
  app.respond(() => ({ body: search([message(1, { ts: at(cutoff - 1) }), message(2, { ts: at(cutoff) }), message(3, { ts: at(app.context.Date.now() / 1000 + 1) })]) }));
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(result.items.length, 1);
  assert.ok(result.items[0].id.endsWith(at(cutoff)));
  assert.equal(app.requests.length, 2);
});

test('Slack resolves reply parents from permalinks and checks the reply, never the parent state', () => {
  const app = fixture(), connection = app.connect();
  app.respond(() => ({ body: search([message(1, { type: 'im', channel: { id: 'DDEMO' }, permalink: 'https://demo.slack.com/archives/CDEMO/p1793987462000001?thread_ts=1793987000.000000&cid=CDEMO' }), message(2, { type: 'im', channel: { id: 'DDEMO' }, thread_ts: '1793987000.000000' })]) }));
  app.detail(url => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://slack.com');
    assert.equal(parsed.pathname, '/api/conversations.replies');
    assert.equal(parsed.searchParams.get('channel'), 'DDEMO');
    assert.equal(parsed.searchParams.get('ts'), '1793987000.000000');
    const ts = parsed.searchParams.get('latest');
    return { body: { ok: true, messages: [{ ts: '1793987000.000000', saved: { todo_state: 'completed' } }, { ts, saved: { todo_state: ts.endsWith('000001') ? 'to_do' : 'completed' } }] } };
  });
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(result.partial, false);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].todoState, 'to_do');
  assert.equal(app.requests.length, 3);
});

test('Slack never infers state from text, missing details, or other messages', () => {
  for (const messages of [[], [{ ts: '1793987462.000001' }], [{ ts: '1793987462.000099', saved: { todo_state: 'completed' } }]]) {
    const app = fixture(), connection = app.connect();
    app.respond(() => ({ body: search([message(1, { text: 'Completed task' })]) }));
    app.detail(() => ({ body: { ok: true, messages } }));
    const result = app.context.getSlackActionItems(connection.id);
    assert.equal(result.items[0].todoState, 'unknown');
    assert.equal(result.partial, false);
  }
});

test('Slack stops detail calls on rate limits, retains unchecked candidates as unknown, and does not cache failures', () => {
  const app = fixture(), connection = app.connect();
  app.respond(() => ({ body: search([message(1), message(2), message(3)]) }));
  app.detail(() => ({ status: 429 }));
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(app.requests.length, 2);
  assert.equal(result.error, 'RATE_LIMITED');
  assert.equal(result.partial, true);
  assert.deepEqual(plain(result.items.map(item => item.todoState)), ['unknown', 'unknown', 'unknown']);
  assert.equal(app.cache.size, 0);
});

test('Slack preserves other conversation types after a detail scope failure', () => {
  const app = fixture(), connection = app.connect();
  app.respond(() => ({ body: search([message(1), message(2)]) }));
  app.detail(url => new URL(url).searchParams.get('latest').endsWith('000001') ? { body: { ok: false, error: 'missing_scope' } } : { body: { ok: true, messages: [{ ts: message(2).ts, saved: { todo_state: 'to_do' } }] } });
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(result.error, 'MISSING_SCOPE');
  assert.deepEqual(plain(result.items.map(item => item.todoState)), ['unknown', 'to_do']);
  assert.equal(app.cache.size, 0);
});


test('Slack stops starting detail requests after the soft time budget and keeps remaining states unknown', () => {
  const app = fixture(), connection = app.connect();
  const now = app.context.Date.now();
  let clock = now;
  app.context.Date.now = () => clock;
  app.respond(() => ({ body: search([message(1), message(2)]) }));
  app.detail(() => { clock += 26000; return { body: { ok: true, messages: [{ ts: message(1).ts, saved: { todo_state: 'to_do' } }] } }; });
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(app.requests.length, 2);
  assert.deepEqual(plain(result.items.map(item => item.todoState)), ['to_do', 'unknown']);
  assert.equal(result.partial, true);
  assert.equal(app.cache.size, 0);
});


test('Slack diagnostics separate excluded matches from state counts and leave unknown totals unset', () => {
  const app = fixture(), connection = app.connect();
  app.respond(() => ({ body: search([message(1), message(1), message(2, { channel: { id: '../bad' } }), message(3, { ts: '1700000000.000000' })]) }));
  const diagnostics = plain(app.context.getSlackActionItems(connection.id).diagnostics);
  assert.deepEqual(diagnostics, { searchTotal: 4, received: 4, eligible: 1, skipped: 3, hasMore: false, remaining: 0, completed: 0, incomplete: 1, unknown: 0 });
  app.respond(() => ({ status: 429 }));
  const failure = app.context.getSlackActionItems(connection.id, true);
  assert.deepEqual(plain(failure.diagnostics), { searchTotal: null, received: 0, eligible: 0, skipped: 0, hasMore: null, remaining: null, completed: 0, incomplete: 0, unknown: 0 });
});

test('Slack diagnostics retain remaining search counts after page failures without inventing completion states', () => {
  const app = fixture(), connection = app.connect();
  app.respond(url => new URL(url).searchParams.get('cursor') === '*' ? { body: search([message(1)], 3, 'next') } : { status: 429 });
  const result = app.context.getSlackActionItems(connection.id);
  assert.deepEqual(plain(result.diagnostics), { searchTotal: 3, received: 1, eligible: 1, skipped: 0, hasMore: true, remaining: 2, completed: 0, incomplete: 0, unknown: 1 });
  assert.equal(app.requests.length, 2, 'Diagnostics make no additional calls');
});

test('Slack diagnostics do not calculate an exact remainder from changing search totals', () => {
  const app = fixture(), connection = app.connect();
  app.respond(url => ({ body: new URL(url).searchParams.get('cursor') === '*' ? search([message(1)], 3, 'next') : search([message(2)], 4) }));
  const result = app.context.getSlackActionItems(connection.id);
  assert.equal(result.diagnostics.searchTotal, null);
  assert.equal(result.diagnostics.remaining, null);
  assert.equal(result.diagnostics.hasMore, null);
  assert.equal(result.diagnostics.received, 2);
  assert.equal(result.diagnostics.incomplete, 2);
});
