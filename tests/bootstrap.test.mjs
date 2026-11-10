import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { browser, catalog, server } from './helpers.mjs';
import { withPreviewContent } from '../scripts/preview-project.mjs';

const embedded = (response) => browser((window) => {
  window.document.getElementById('initial-catalog').textContent = server().context.serializeCatalog_(response);
});

test('Embed JSON without allowing spreadsheet text to close script elements or change the payload', (t) => {
  const payload = { ...catalog, tools: [{ ...catalog.tools[0], name: '</script><script>window.injected=true</script><img src=x onerror=alert(1)>', description: '<!-- & > \\ " \u2028 \u2029 \n' }] };
  payload.tools[0].description += String.fromCharCode(0x2028, 0x2029);
  const { context } = server();
  const json = context.serializeCatalog_(payload);
  assert.doesNotMatch(json, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(json), payload);
  const html = withPreviewContent(readFileSync('src/Index.html', 'utf8'), context.getPortalContent_({}))
    .replace('<?!= initialCatalogJson ?>', () => json).replace(/<\?[\s\S]*?\?>/g, '');
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  assert.equal(dom.window.document.querySelectorAll('script').length, 2);
  assert.equal(dom.window.document.querySelectorAll('img').length, 0);
  assert.deepEqual(JSON.parse(dom.window.document.getElementById('initial-catalog').textContent), payload);
  assert.equal(dom.window.document.getElementById('status').hidden, true, 'Initial HTML must not flash a loading panel');
  const app = embedded(payload);
  t.after(() => app.dom.window.close());
  assert.equal(app.requests.length, 0);
  assert.match(app.document.getElementById('tools').textContent, /window.injected/);
  assert.equal(app.document.querySelectorAll('img:not(.tool-favicon img), [onerror]').length, 0);
  assert.equal(app.dom.window.injected, undefined);
});

test('Render embedded data immediately and issue a forced RPC only when explicitly refreshed', (t) => {
  const { dom, document, requests } = embedded({ ...catalog, cache: { hit: true, fetchedAt: 1700000000000 } });
  t.after(() => dom.window.close());
  assert.equal(requests.length, 0);
  assert.equal(document.querySelectorAll('#tools > li').length, 2);
  assert.equal(document.querySelector('#status').hidden, true);
  assert.equal(document.querySelector('#directory').getAttribute('aria-busy'), 'false');
  assert.match(document.querySelector('#catalog-freshness').title, /キャッシュ/);
  document.querySelector('#search').value = 'guide';
  document.querySelector('#search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.querySelector('#view-list').click();
  document.querySelector('#refresh-catalog').click();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].forceRefresh, true);
  assert.equal(document.querySelector('#status').hidden, true);
  assert.equal(document.querySelector('#refresh-catalog').getAttribute('aria-busy'), 'true');
  requests[0].success(catalog);
  assert.equal(document.querySelectorAll('#tool-rows > tr').length, 1);
  assert.equal(document.querySelector('#search').value, 'guide');
});

test('Render empty and warning-only embedded catalogs without an initial RPC', (t) => {
  for (const response of [{ ok: true, tools: [], issues: [] }, { ok: true, tools: [], issues: [{ row: 2, message: 'Invalid entry' }] }]) {
    const app = embedded(response);
    t.after(() => app.dom.window.close());
    assert.equal(app.requests.length, 0);
    assert.equal(app.document.querySelector('#refresh-catalog').disabled, false);
    assert.equal(app.document.querySelector('#warnings').hidden, response.issues.length === 0);
    assert.equal(app.document.querySelector('#status').hidden, false);
  }
});

test('Show embedded failures and malformed data safely, retain settings access, and allow explicit retry', (t) => {
  for (const payload of [JSON.stringify({ ok: false, error: '読み込みに失敗しました' }), '{broken', JSON.stringify({ ok: true, tools: [{ url: 'javascript:alert(1)' }], issues: [] })]) {
    const app = browser((window) => { window.document.getElementById('initial-catalog').textContent = payload; });
    t.after(() => app.dom.window.close());
    assert.equal(app.requests.length, 0, 'Do not automatically repeat failed initial reads');
    assert.equal(app.document.querySelector('#refresh-catalog').disabled, false);
    app.document.querySelector('#tab-settings').click();
    assert.equal(app.document.querySelector('#settings-panel').hidden, false);
    app.document.querySelector('#tab-tools').click();
    app.document.querySelector('#refresh-catalog').click();
    assert.equal(app.requests[0].forceRefresh, true);
    app.requests[0].success(catalog);
    assert.equal(app.document.querySelectorAll('#tools > li').length, 2);
  }
});

test('Keep rendering the HTML shell when the initial spreadsheet read fails', () => {
  const output = { setTitle() { return this; }, setFaviconUrl() { return this; }, addMetaTag() { return this; } };
  const template = { evaluate: () => output };
  const { context } = server({ values: [], HtmlService: { createTemplateFromFile: () => template }, ScriptApp: { getScriptId: () => 'test' } });
  assert.equal(context.doGet(), output);
  assert.equal(JSON.parse(template.initialCatalogJson).ok, false);
});


test('Display retrieval times without dates or day periods in both languages, including midnight', (t) => {
  for (const hour of [0, 17]) {
    const app = embedded({ ...catalog, cache: { hit: true, fetchedAt: new Date(2026, 10, 4, hour, 5).getTime() } });
    t.after(() => app.dom.window.close());
    const time = `${String(hour).padStart(2, '0')}:05`;
    assert.equal(app.document.getElementById('catalog-freshness').textContent, `${time} 取得`);
    const language = app.document.getElementById('portal-language');
    language.value = 'en';
    language.dispatchEvent(new app.dom.window.Event('change', { bubbles: true }));
    app.languageRequests[0].success({ ok: true, language: 'en' });
    assert.equal(app.document.getElementById('catalog-freshness').textContent, `Retrieved ${time}`);
  }
});


test('Refresh by clicking the retrieval time inside the shared button and ignore clicks while loading', (t) => {
  const app = embedded({ ...catalog, cache: { hit: true, fetchedAt: 1700000000000 } });
  t.after(() => app.dom.window.close());
  const button = app.document.getElementById('refresh-catalog');
  const time = app.document.getElementById('catalog-freshness');
  assert.equal(time.closest('button'), button);
  assert.equal(button.getAttribute('aria-describedby'), time.id);
  assert.equal(button.getAttribute('aria-label'), '最新データを取得');
  time.click();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].forceRefresh, true);
  assert.equal(button.disabled, true);
  time.click();
  assert.equal(app.requests.length, 1);
  app.requests[0].success({ ...catalog, cache: { hit: false, fetchedAt: 1700000060000 } });
  assert.equal(button.disabled, false);
  assert.equal(time.hidden, false);
  assert.doesNotMatch(time.textContent, /キャッシュ/);
});
