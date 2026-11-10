import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';

const id = '33333333-3333-4333-8333-333333333333';
const connection = { id, token: 'xoxp-SECRET', revision: 'one', workspaceId: 'TDEMO', userId: 'UDEMO', workspace: 'Demo', user: 'alex', url: 'https://demo.slack.com/' };
const message = n => ({ text: 'Saved <https://example.com|reference> &amp; notes', ts: '1700000000.' + String(n).padStart(6, '0'), channel: { id: 'CDEMO' } });
function fixture() {
  const cache = new Map(), requests = [], puts = [];
  const userProperties = { ['SLACK_CONNECTION_' + id]: JSON.stringify(connection) };
  let reply = () => ({ ok: true, messages: { total: 1, matches: [message(1)], pagination: { next_cursor: '' } } });
  const app = server({ userProperties,
    UrlFetchApp: { fetch(url, options) { requests.push({ url, options }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify(reply(url)) }; } },
    CacheService: { getUserCache: () => ({ get: key => cache.get(key), remove: key => cache.delete(key), put(key, value, ttl) { cache.set(key, value); puts.push(ttl); } }) },
  });
  return { ...app, requests, cache, puts, userProperties, respond(fn) { reply = fn; } };
}

test('Saved messages use bounded search only, retain old posts, and use the Links cache', () => {
  const app = fixture();
  const first = plain(app.context.getSlackBookmarks(id));
  assert.equal(first.ok, true); assert.equal(first.items.length, 1);
  assert.equal(first.items[0].title, 'Saved reference & notes');
  assert.equal(first.url, 'https://demo.slack.com/');
  assert.doesNotMatch(JSON.stringify(first), /SECRET|xoxp|token|revision/);
  assert.equal(new URL(app.requests[0].url).searchParams.get('query'), 'is:saved');
  assert.equal(app.requests.length, 1, 'No identity or per-message request');
  assert.equal(app.context.getSlackBookmarks(id).cached, true);
  assert.deepEqual(app.puts, [21600]);
  assert.equal(app.context.getSlackBookmarks(id, true).cached, false);
  assert.equal(app.requests.length, 2);
  app.userProperties.CATALOG_CACHE_SECONDS = '0';
  app.context.getSlackBookmarks(id); app.context.getSlackBookmarks(id);
  assert.equal(app.requests.length, 4);
});

test('Saved search stops at 200 and signals further matches without chasing them', () => {
  const app = fixture(); let page = 0;
  app.respond(() => ({ ok: true, messages: { total: 215, matches: Array.from({ length: 100 }, (_, i) => message(++page * 100 + i)), pagination: { next_cursor: 'more' } } }));
  const result = app.context.getSlackBookmarks(id);
  assert.equal(result.items.length, 200); assert.equal(result.hasMore, true);
  assert.equal(app.requests.length, 2); assert.equal(result.partial, false);
});

test('Partial saved searches are not cached and connection changes discard stale responses', () => {
  const app = fixture(); let page = 0;
  app.respond(() => ++page === 1 ? { ok: true, messages: { total: 2, matches: [message(1)], pagination: { next_cursor: 'next' } } } : { ok: false, error: 'ratelimited' });
  const result = app.context.getSlackBookmarks(id);
  assert.equal(result.items.length, 1); assert.equal(result.partial, true); assert.equal(result.error, 'RATE_LIMITED');
  assert.equal(app.cache.size, 0);
  app.respond(() => { app.userProperties['SLACK_CONNECTION_' + id] = JSON.stringify({ ...connection, revision: 'two' }); return { ok: true, messages: { total: 0, matches: [] } }; });
  assert.equal(app.context.getSlackBookmarks(id).error, 'CONNECTION_CHANGED');
});

test('Disconnect invalidates saved-message cache and rejects unknown connections', () => {
  const app = fixture(); app.context.getSlackBookmarks(id);
  assert.equal(app.cache.size, 1);
  assert.equal(app.context.disconnectSlack(id).ok, true); assert.equal(app.cache.size, 0);
  assert.equal(app.context.getSlackBookmarks(id).error, 'INVALID_CONNECTION');
});
