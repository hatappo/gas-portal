import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';
const settings = { enabled: true, limit: 20 };
const message = (id = 'abc1', extra = {}) => ({ id, threadId: 'def1', labelIds: ['UNREAD', 'INBOX'], internalDate: '1793987462000', snippet: 'SECRET_BODY', payload: { headers: [{ name: 'Subject', value: '<b>Plan</b>' }, { name: 'From', value: 'Alex <alex@example.com>' }], body: { data: 'SECRET_BODY' }, parts: ['SECRET_ATTACHMENT'] }, ...extra });
function fixture(initial = {}) {
  const properties = { GMAIL_SETTINGS: JSON.stringify(settings), ...initial }, batches = [], cache = new Map();
  let required = false;
  let handler = url => url.includes('/profile?') ? { emailAddress: 'me@example.com' } : url.includes('/messages?') ? { messages: [{ id: 'abc1', threadId: 'def1' }] } : message();
  const app = server({ userProperties: properties,
    ScriptApp: { AuthMode: { FULL: 'FULL' }, AuthorizationStatus: { REQUIRED: 'REQUIRED' }, getAuthorizationInfo(mode, scopes) { assert.equal(mode, 'FULL'); assert.deepEqual(plain(scopes), ['https://www.googleapis.com/auth/gmail.metadata']); return { getAuthorizationStatus: () => required ? 'REQUIRED' : 'GRANTED' }; }, getOAuthToken: () => 'SECRET_TOKEN' },
    UrlFetchApp: { fetchAll(requests) {
      batches.push(plain(requests));
      return requests.map(request => { const body = handler(request.url); return { getResponseCode: () => body.status || 200, getContentText: () => JSON.stringify(body) }; });
    } },
    CacheService: { getUserCache: () => ({ get: key => cache.get(key), remove: key => cache.delete(key), put: (key, value, ttl) => { assert.ok(ttl > 0 && ttl <= 21600); cache.set(key, value); } }) },
  });
  return { ...app, batches, properties, cache, respond(fn) { handler = fn; }, revoke() { required = true; } };
}
test('Gmail settings default to disabled and bounded limits, without contacting Google', () => {
  const base = server();
  assert.deepEqual(plain(base.context.getGmailSettings()), { ok: true, settings: { enabled: false, limit: 20 } });
  assert.equal(base.context.getGmailActionItems().error, 'DISABLED');
  const app = fixture();
  for (const input of [null, { ...settings, enabled: 'true' }, { ...settings, limit: 21 }, { ...settings, extra: 1 }, {}]) assert.equal(app.context.saveGmailSettings(input).error, 'INVALID_INPUT');
  assert.equal(app.batches.length, 0);
  assert.equal(app.context.saveGmailSettings({ enabled: true, limit: 100 }).ok, true);
  assert.equal(app.context.getGmailSettings().settings.limit, 100);
  assert.ok(app.properties.GMAIL_REVISION);
  assert.equal(base.context.getGmailSettings().settings.enabled, false);
});
test('Gmail reads only unread headers, runs identity alongside list and keeps private payloads out of results/cache/logs', () => {
  const app = fixture();
  const result = app.context.getGmailActionItems();
  assert.equal(result.ok, true);
  assert.equal(result.items[0].title, '<b>Plan</b>');
  assert.equal(result.items[0].sender, 'Alex <alex@example.com>');
  assert.equal(result.account, 'me@example.com');
  assert.equal(app.batches[0].length, 2);
  const list = new URL(app.batches[0][1].url);
  assert.equal(list.searchParams.get('labelIds'), 'UNREAD');
  assert.equal(list.searchParams.get('includeSpamTrash'), 'false');
  assert.equal(list.searchParams.has('q'), false, 'Metadata scope cannot use Gmail search queries');
  assert.equal(list.searchParams.get('maxResults'), '20');
  for (const request of app.batches.flat()) {
    assert.equal(new URL(request.url).origin, 'https://gmail.googleapis.com');
    assert.equal(request.method, 'get'); assert.equal(request.followRedirects, false);
    assert.equal(request.headers.Authorization, 'Bearer SECRET_TOKEN');
  }
  assert.match(app.batches[1][0].url, /format=metadata/);
  assert.doesNotMatch(app.batches[1][0].url, /snippet|body|attachment/);
  for (const value of [result, [...app.cache.values()], app.logs, app.properties]) assert.doesNotMatch(JSON.stringify(value), /SECRET_TOKEN|SECRET_BODY|SECRET_ATTACHMENT/);
});
test('Gmail shares Actions TTL, bypasses cache when forced or disabled and checks revoked consent before cache reads', () => {
  const app = fixture();
  assert.equal(app.context.getGmailActionItems().cached, false);
  assert.equal(app.context.getGmailActionItems().cached, true);
  assert.equal(app.batches.length, 2);
  assert.equal(app.context.getGmailActionItems(true).cached, false);
  app.properties.ACTIONS_CACHE_SECONDS = '0';
  assert.equal(app.context.getGmailActionItems().cached, false);
  assert.equal(app.context.getGmailActionItems().cached, false);
  app.revoke(); const calls = app.batches.length;
  assert.equal(app.context.getGmailActionItems().error, 'AUTHORIZATION_REQUIRED');
  assert.equal(app.batches.length, calls);
});
test('Gmail bounds metadata batches, distinguishes more results and removes messages read or deleted during retrieval', () => {
  const app = fixture({ GMAIL_SETTINGS: JSON.stringify({ ...settings, limit: 50 }) });
  const ids = Array.from({ length: 25 }, (_, index) => (0xabc1 + index).toString(16));
  app.respond(url => {
    if (url.includes('/profile?')) return { emailAddress: 'me@example.com' };
    if (url.includes('/messages?')) return { messages: ids.map(id => ({ id })), nextPageToken: 'another-page' };
    const id = url.split('/messages/')[1].split('?')[0];
    if (id === ids[0]) return { status: 404 };
    return message(id, { labelIds: id === ids[1] ? ['INBOX'] : id === ids[2] ? ['UNREAD', 'TRASH'] : ['UNREAD'] });
  });
  const result = app.context.getGmailActionItems();
  assert.equal(result.items.length, 22); assert.equal(result.hasMore, true); assert.equal(result.partial, false);
  assert.deepEqual(app.batches.map(batch => batch.length), [2, 10, 10, 5]);
});
test('Gmail partial errors preserve successful messages, never cache them and stop further batches', () => {
  const app = fixture();
  app.respond(url => url.includes('/profile?') ? { emailAddress: 'me@example.com' } : url.includes('/messages?') ? { messages: [{ id: 'abc1' }, { id: 'abc2' }] } : url.includes('abc1?') ? message() : { status: 429, body: 'SECRET_TOKEN' });
  const result = app.context.getGmailActionItems();
  assert.equal(result.items.length, 1); assert.equal(result.partial, true); assert.equal(result.error, 'RATE_LIMITED');
  assert.equal(app.cache.size, 0);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});
test('Gmail sanitizes API failures and ignores responses when settings change during a read', () => {
  for (const [status, expected] of [[401, 'AUTHORIZATION_REQUIRED'], [403, 'FORBIDDEN'], [429, 'RATE_LIMITED'], [500, 'REQUEST_FAILED']]) {
    const app = fixture(); app.respond(() => ({ status, error: 'SECRET_TOKEN' }));
    assert.deepEqual(plain(app.context.getGmailActionItems()), { ok: false, error: expected });
  }
  const app = fixture();
  app.respond(url => {
    if (url.includes('/profile?')) return { emailAddress: 'me@example.com' };
    if (url.includes('/messages?')) return { messages: [{ id: 'abc1' }] };
    app.context.saveGmailSettings({ enabled: false, limit: 20 });
    return message();
  });
  assert.equal(app.context.getGmailActionItems().error, 'SETTINGS_CHANGED');
  assert.equal(app.cache.size, 0);
});
test('Gmail handles empty mailboxes and malformed IDs without issuing unexpected requests', () => {
  const app = fixture();
  app.respond(url => url.includes('/profile?') ? { emailAddress: 'me@example.com' } : {});
  assert.deepEqual(plain(app.context.getGmailActionItems().items), []);
  app.respond(url => url.includes('/profile?') ? { emailAddress: 'me@example.com' } : { messages: [{ id: '../profile' }] });
  assert.equal(app.context.getGmailActionItems(true).error, 'REQUEST_FAILED');
  assert.equal(app.batches.length, 2);
  assert.equal(app.context.PortalGmail.url('me@example.com', 'def1'), 'https://mail.google.com/mail/?authuser=me%40example.com#all/def1');
  assert.equal(app.context.PortalGmail.url('me@example.com', 'javascript:alert(1)'), '');
});
