import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, browser, entry, sheetRows, catalog, plain } from './helpers.mjs';

function cachedServer(options = {}) {
  let now = 1700000000000;
  const values = sheetRows([entry()]);
  const properties = { SPREADSHEET_ID: 'sheet-one', SHEET_NAME: 'ツール一覧' };
  const userProperties = {};
  const entries = new Map();
  const writes = [];
  let locks = 0;
  const cache = {
    get: (key) => entries.get(key) || null,
    put(key, value, ttl) { entries.set(key, value); writes.push({ key, value, ttl }); },
    remove(key) { entries.delete(key); },
  };
  const result = server({ values, properties, userProperties,
    CacheService: { getUserCache: () => cache },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }), getUserLock: () => ({ waitLock() { locks++; }, releaseLock() { locks--; } }) },
    Date: class extends Date { static now() { return now; } },
    ...options,
  });
  return { ...result, values, properties, userProperties, entries, writes, cache,
    advance: (seconds) => { now += seconds * 1000; }, locks: () => locks };
}

test('Read Sheets once on a miss, zero times on a hit, and replace cached data on forced refresh', () => {
  const fixture = cachedServer();
  const { context, calls, values, writes, advance } = fixture;
  const first = plain(context.getCatalog());
  assert.equal(first.ok, true);
  assert.equal(first.cache.hit, false);
  assert.equal(calls.length, 1);
  assert.equal(writes[0].ttl, 21600);
  assert.ok(writes[0].key.length <= 250);
  assert.doesNotMatch(writes[0].key, /sheet-one/);
  values[1][1] = 'Changed';
  advance(1);
  const hit = plain(context.getCatalog());
  assert.equal(hit.cache.hit, true);
  assert.equal(hit.cache.fetchedAt, first.cache.fetchedAt);
  assert.equal(hit.tools[0].name, first.tools[0].name);
  assert.equal(calls.length, 1);
  const fresh = plain(context.getCatalog(true));
  assert.equal(fresh.cache.hit, false);
  assert.equal(fresh.tools[0].name, 'Changed');
  assert.equal(calls.length, 2);
  assert.equal(context.getCatalog().tools[0].name, 'Changed');
  assert.equal(calls.length, 2);
  assert.equal(fixture.locks(), 0);
});

test('Expire cached entries even if the cache service retains them, and bypass cache when disabled', () => {
  const { context, calls, advance } = cachedServer();
  context.getCatalog();
  advance(21599);
  assert.equal(context.getCatalog().cache.hit, true);
  assert.equal(calls.length, 1);
  advance(1);
  assert.equal(context.getCatalog().cache.hit, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(plain(context.saveCatalogCacheTtl(0)), { ok: true, seconds: 0 });
  context.getCatalog();
  context.getCatalog();
  assert.equal(calls.length, 4);
});

test('Separate cache entries by source and executing user while reusing the latest data across duration changes', () => {
  const first = cachedServer();
  first.context.getCatalog();
  first.properties.SPREADSHEET_ID = 'sheet-two';
  assert.equal(first.context.getCatalog().cache.hit, false);
  first.context.saveCatalogCacheTtl(3600);
  assert.equal(first.context.getCatalog().cache.hit, true);
  assert.equal(first.context.getCatalog(true).cache.hit, false);
  assert.equal(first.writes.at(-1).ttl, 3600);
  assert.equal(new Set(first.writes.map((write) => write.key)).size, 2);
  const other = cachedServer();
  other.values[1][1] = 'Other user';
  assert.equal(other.context.getCatalog().tools[0].name, 'Other user');
  assert.equal(other.calls.length, 1);
});

test('Validate settings, preserve existing values during initialization, and reject unsupported TTL values', () => {
  const { context, userProperties } = cachedServer();
  context.initializeProperties();
  assert.equal(userProperties.CATALOG_CACHE_SECONDS, '21600');
  for (const seconds of [0, 300, 3600, 21600]) {
    assert.deepEqual(plain(context.saveCatalogCacheTtl(seconds)), { ok: true, seconds });
    context.initializeProperties();
    assert.equal(userProperties.CATALOG_CACHE_SECONDS, String(seconds));
    assert.equal(context.getPortalContent_(userProperties).cacheSeconds, String(seconds));
  }
  for (const value of ['300', -1, 1, 21601, {}, null, true, NaN]) assert.deepEqual(plain(context.saveCatalogCacheTtl(value)), { ok: false });
  assert.equal(userProperties.CATALOG_CACHE_SECONDS, '21600');
  assert.equal(context.getPortalContent_({ CATALOG_CACHE_SECONDS: 'bad' }).cacheSeconds, '21600');
});

test('Treat corrupted entries, eviction, and cache failures as misses without exposing private details', () => {
  const fixture = cachedServer();
  const { context, entries, writes, calls, cache } = fixture;
  context.getCatalog();
  const key = writes[0].key;
  for (const value of ['not json', '{}', JSON.stringify({ tools: [], issues: [], fetchedAt: 'bad' })]) {
    entries.set(key, value);
    assert.equal(context.getCatalog().cache.hit, false);
  }
  entries.clear();
  assert.equal(context.getCatalog().cache.hit, false);
  cache.get = () => { throw new Error('private-cache-failure'); };
  cache.put = () => { throw new Error('private-cache-failure'); };
  cache.remove = () => { throw new Error('private-cache-failure'); };
  const result = context.getCatalog(true);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 6);
  assert.doesNotMatch(JSON.stringify([result, fixture.logs]), /private-cache-failure/);
  assert.equal(fixture.locks(), 0);
});

test('Do not cache errors, oversized catalogs, or unused private spreadsheet columns', () => {
  const bad = cachedServer();
  bad.values[0][0] = 'invalid-header';
  assert.equal(bad.context.getCatalog().ok, false);
  assert.equal(bad.writes.length, 0);
  assert.equal(bad.locks(), 0);
  const large = cachedServer();
  large.values[1][3] = 'あ'.repeat(40000);
  assert.equal(large.context.getCatalog().ok, true);
  assert.equal(large.writes.length, 0);
  const notes = cachedServer();
  notes.values[0].push('Private notes');
  notes.values[1].push('do-not-cache-this');
  assert.equal(notes.context.getCatalog().ok, true);
  assert.doesNotMatch(notes.writes[0].value, /do-not-cache-this/);
});

test('Invalidate the old entry before a failed forced refresh and never silently return stale data', () => {
  const { context, values, entries, calls } = cachedServer();
  context.getCatalog();
  values[0][0] = 'missing-id';
  assert.equal(context.getCatalog(true).ok, false);
  assert.equal(entries.size, 0);
  assert.equal(context.getCatalog().ok, false);
  assert.equal(calls.length, 3);
});

test('Recheck the cache under the user lock and avoid duplicate fills', () => {
  const fixture = cachedServer();
  const { context, cache, writes, entries, calls } = fixture;
  context.getCatalog();
  const value = writes[0];
  entries.clear();
  context.LockService.getUserLock = () => ({ waitLock() { cache.put(value.key, value.value, 3600); }, releaseLock() {} });
  assert.equal(context.getCatalog().cache.hit, true);
  assert.equal(calls.length, 1);
  context.LockService.getUserLock = () => ({ waitLock() { throw new Error('busy'); }, releaseLock() { assert.fail('An unacquired lock must not be released'); } });
  assert.equal(context.getCatalog(true).cache.hit, false);
  assert.equal(calls.length, 2);
});

test('Keep filters and List view during forced refresh, prevent duplicate requests, and allow retry after failure', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const refresh = document.querySelector('#refresh-catalog');
  assert.equal(refresh.disabled, true);
  assert.equal(requests[0].forceRefresh, false);
  requests[0].success({ ...catalog, cache: { hit: true, fetchedAt: 1700000000000 } });
  assert.match(document.querySelector('#catalog-freshness').textContent, /キャッシュ/);
  document.querySelector('#search').value = 'guide';
  document.querySelector('#search').dispatchEvent(new dom.window.Event('input'));
  document.querySelector('#view-list').click();
  document.querySelector('#scope-internal').click();
  [...document.querySelectorAll('#tags button')].find((button) => button.textContent === '資料').click();
  refresh.click();
  refresh.click();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].forceRefresh, true);
  requests[1].success({ ...catalog, cache: { hit: false, fetchedAt: 1700000010000 } });
  assert.equal(document.querySelector('#search').value, 'guide');
  assert.equal(document.querySelector('#view-list').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelectorAll('#tool-rows tr').length, 1);
  assert.doesNotMatch(document.querySelector('#catalog-freshness').textContent, /キャッシュ/);
  refresh.click();
  requests[2].failure();
  assert.equal(refresh.disabled, false);
  assert.equal(document.querySelector('#catalog-freshness').hidden, true);
  refresh.click();
  requests[3].success(catalog);
  assert.equal(document.querySelectorAll('#tool-rows tr').length, 1);
});

test('Save cache duration separately, group preferences under display settings, and restore failed or timed-out choices', (t) => {
  let timeout;
  const { dom, document, cacheSettingsRequests } = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 15000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => dom.window.close());
  const display = document.querySelector('.display-settings');
  const theme = document.querySelector('.theme-settings');
  assert.equal(display.querySelector('h2').textContent, '表示設定');
  assert.equal(display.lastElementChild.className, 'language-settings');
  assert.ok(display.querySelector('.cache-settings'));
  assert.equal(theme.querySelector('.cache-settings, .language-settings'), null);
  assert.equal(document.querySelector('#catalog-cache-seconds').closest('form'), null, 'Automatic preferences must remain independent of the display form submit');
  const select = document.querySelector('#catalog-cache-seconds');
  const change = (value) => { select.value = value; select.dispatchEvent(new dom.window.Event('change')); };
  assert.equal(select.value, '21600');
  change('3600');
  assert.equal(select.disabled, true);
  assert.equal(cacheSettingsRequests[0].seconds, 3600);
  cacheSettingsRequests[0].success({ ok: true, seconds: 3600 });
  assert.equal(select.disabled, false);
  change('300');
  cacheSettingsRequests[1].failure();
  assert.equal(select.value, '3600');
  change('0');
  timeout();
  cacheSettingsRequests[2].success({ ok: true, seconds: 0 });
  assert.equal(select.value, '3600');
  assert.equal(select.disabled, false);
  assert.match(document.querySelector('#cache-settings-status').textContent, /再読み込み/);
});


test('Embed the same cached catalog during doGet without an additional Sheets call', () => {
  const output = { setTitle() { return this; }, addMetaTag() { return this; } };
  const template = { evaluate: () => output };
  const { context, calls } = cachedServer({ HtmlService: { createTemplateFromFile: () => template }, ScriptApp: { getScriptId: () => 'test' } });
  context.doGet();
  assert.equal(JSON.parse(template.initialCatalogJson).cache.hit, false);
  assert.equal(calls.length, 1);
  context.doGet();
  assert.equal(JSON.parse(template.initialCatalogJson).cache.hit, true);
  assert.equal(calls.length, 1);
});
