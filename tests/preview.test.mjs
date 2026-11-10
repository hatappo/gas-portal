import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { renderPreview } from '../scripts/preview.mjs';
import { previewPage, runPreviewMock } from './helpers.mjs';

const source = readFileSync('src/Index.html', 'utf8');

test("Resolve GAS templates and include the mock and Vite module entry", (t) => {
  const html = renderPreview(source, process.cwd());
  assert.doesNotMatch(html, /<\?|__preview\/version|location.reload|setInterval/);
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  assert.equal(dom.window.document.title, 'My Portal');
  assert.equal(dom.window.document.querySelector('.intro .preview-label'), null);
  assert.equal(dom.window.document.querySelector('.site-header > .preview-label.preset-filled-warning-500').textContent, 'LOCAL PREVIEW');
  assert.equal(dom.window.document.querySelector('script[type="module"]').getAttribute('src'), '/browser/main.js');
  assert.equal(dom.window.document.querySelectorAll('.external-link-icon').length >= 1, true);
  for (const [tab, icon] of [['tools', 'tool-case'], ['actions', 'list-checks'], ['settings', 'settings']]) {
    const svg = dom.window.document.querySelector('#tab-' + tab + ' > svg');
    assert.equal(svg.getAttribute('class'), icon + '-icon');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
  }
});

test("Simulate success, empty, invalid, configuration, and transport states offline", (t) => {
  const dom = previewPage(t);
  for (const scenario of ['', 'empty', 'invalid', 'config', 'error']) {
    let result;
    let failed = false;
    const { run } = runPreviewMock(dom, { search: `?state=${scenario}` });
    run.withSuccessHandler((value) => { result = value; }).withFailureHandler(() => { failed = true; }).getCatalog();
    if (scenario === 'error') assert.equal(failed, true);
    else if (scenario === 'config') assert.equal(result.ok, false);
    else if (scenario === 'invalid') assert.equal(result.issues.length, 1);
    else assert.equal(result.tools.length, scenario === 'empty' ? 0 : 6);
  }
});

test("Restore and save themes without mixing concurrent response handlers", (t) => {
  const dom = previewPage(t);
  let stored = 'dracula';
  const pending = [];
  const { run } = runPreviewMock(dom, {
    localStorage: { getItem: () => stored, setItem(key, value) { assert.equal(key, 'portal-preview-theme'); stored = value; } },
    setTimeout(fn) { pending.push(fn); },
  });
  assert.equal(dom.window.document.documentElement.dataset.theme, 'dracula');
  let catalog;
  let theme;
  run.withSuccessHandler((value) => { catalog = value; }).getCatalog();
  run.withSuccessHandler((value) => { theme = value; }).saveTheme('modern');
  pending.forEach((fn) => fn());
  assert.equal(catalog.tools.length, 6);
  assert.equal(theme.theme, 'modern');
  assert.equal(stored, 'modern');
});

test("Save, restore, and reset display settings while preserving the theme", (t) => {
  const settings = { PORTAL_NAME: 'Local Portal', PORTAL_ICON: 'l', PORTAL_HEADLINE: 'Local headline', PORTAL_DESCRIPTION: 'Local description' };
  const storage = { 'portal-preview-settings': JSON.stringify(settings), 'portal-preview-theme': 'dracula' };
  const dom = previewPage(t);
  const { context, run } = runPreviewMock(dom, { storage });
  assert.equal(dom.window.document.querySelector('#setting-name').value, 'Local Portal');
  assert.equal(dom.window.document.querySelector('#setting-icon').value, 'L');
  let result;
  run.withSuccessHandler((value) => { result = value; }).savePortalSettings({ ...settings, PORTAL_NAME: 'Updated' });
  assert.equal(result.settings.PORTAL_NAME, 'Updated');
  assert.equal(result.settings.PORTAL_ICON, 'L');
  assert.equal(JSON.parse(storage['portal-preview-settings']).PORTAL_ICON, 'L');
  assert.equal(JSON.parse(storage['portal-preview-settings']).PORTAL_NAME, 'Updated');
  run.withSuccessHandler((value) => { result = value; }).savePortalSettings(vm.runInContext("getPortalPropertyDefaults_('en')", context));
  assert.equal(result.settings.PORTAL_NAME, 'My Portal');
  assert.equal(storage['portal-preview-theme'], 'dracula');
});


test('Preview cache settings persist, cached loads restore, and forced refresh always bypasses them', (t) => {
  const storage = {};
  const create = () => runPreviewMock(previewPage(t), { storage });
  const initial = create();
  assert.equal(initial.document.querySelector('#catalog-cache-seconds').dataset.savedValue, '21600');
  let result;
  const load = (run, force) => { run.withSuccessHandler((value) => { result = value; }).getCatalog(force); return result; };
  assert.equal(JSON.parse(initial.document.getElementById('initial-catalog').textContent).cache.hit, false);
  assert.equal(load(initial.run).cache.hit, true);
  initial.run.withSuccessHandler((value) => { result = value; }).saveCatalogCacheTtl(21600);
  assert.equal(result.ok, true);
  assert.equal(initial.document.querySelector('#actions-cache-seconds').dataset.savedValue, '300');
  initial.run.withSuccessHandler((value) => { result = value; }).saveActionsCacheTtl(900);
  assert.equal(result.ok, true);
  const restored = create();
  assert.equal(restored.document.querySelector('#actions-cache-seconds').dataset.savedValue, '900');
  assert.equal(restored.document.querySelector('#catalog-cache-seconds').dataset.savedValue, '21600');
  assert.equal(load(restored.run).cache.hit, true);
  assert.equal(load(restored.run, true).cache.hit, false);
  restored.run.withSuccessHandler(() => {}).saveCatalogCacheTtl(0);
  assert.equal(load(restored.run).cache.hit, false);
  assert.equal(load(restored.run).cache.hit, false);
});

test('The preview mock checks input with the server code and replies like the server', (t) => {
  const storage = {};
  const create = (search = '') => {
    const { call } = runPreviewMock(previewPage(t), { storage, search });
    return (method, ...args) => JSON.parse(JSON.stringify(call(method, ...args)));
  };
  const call = create();
  assert.deepEqual(call('saveTheme', 'no-such-theme'), { ok: false });
  assert.deepEqual(call('saveTheme', 'modern'), { ok: true, theme: 'modern' });
  assert.deepEqual(call('saveLanguage', 'fr'), { ok: false });
  assert.deepEqual(call('saveUnblockedUrlSchemes', ['javascript']), { ok: false });
  assert.deepEqual(call('saveUnblockedUrlSchemes', ['file', 'data', 'file']), { ok: false });
  assert.deepEqual(call('saveUnblockedUrlSchemes', ['file', 'data']), { ok: true, schemes: ['data', 'file'] });
  // An existing source stops creation before anything is made, so the form stays usable.
  assert.deepEqual(call('saveSpreadsheetSettings', { SPREADSHEET_ID: 'existing-sheet', SHEET_NAME: '' }).ok, true);
  assert.deepEqual(call('createPortalSpreadsheet'), { ok: false, notCreated: true, error: 'A spreadsheet ID is already configured. No spreadsheet was created.' });
  // Messages are English keys, translated by the browser as for the server.
  assert.equal(create('?state=config')('getCatalog').error, 'The first row must contain id, name, and url columns. Also check for duplicate column names.');
  assert.equal(create('?state=invalid')('getCatalog').issues[0].message, 'Enter a valid URL in url.');
});
