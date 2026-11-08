import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { server, browser, plain, previewPage, runPreviewMock } from './helpers.mjs';
import { withPreviewContent } from '../scripts/preview-project.mjs';

const source = readFileSync('src/Index.html', 'utf8');
const settings = (id = 'new-id', name = '') => ({ SPREADSHEET_ID: id, SHEET_NAME: name });

test('Accept IDs and Google Sheets editor URLs, rejecting other origins and published links', () => {
  const { context } = server();
  for (const value of [' abc_123-Z ', 'https://docs.google.com/spreadsheets/d/abc_123-Z', 'https://docs.google.com/spreadsheets/d/abc_123-Z/edit?usp=sharing#gid=17', 'https://docs.google.com/spreadsheets/u/2/d/abc_123-Z/edit']) {
    assert.equal(context.normalizeSpreadsheetId_(value), 'abc_123-Z');
    assert.equal(context.getPortalContent_(settings(value)).spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/abc_123-Z/edit');
  }
  for (const value of [null, 3, {}, '', 'http://docs.google.com/spreadsheets/d/id/edit', 'https://docs.google.com.evil.test/spreadsheets/d/id/edit', 'https://docs.google.com@evil.test/spreadsheets/d/id/edit', 'https://evil.test/?next=https://docs.google.com/spreadsheets/d/id', 'https://docs.google.com/spreadsheets/d/e/published/pubhtml', 'https://docs.google.com:443/spreadsheets/d/id/edit', 'https://docs.google.com/spreadsheets/d/id/more', 'javascript:alert(1)', 'https://docs.google.com/spreadsheets/d/id/edit\n<script>']) {
    assert.equal(context.normalizeSpreadsheetId_(value), '', String(value));
  }
});

test('Ignore Script Properties and initialize missing source fields with empty values', () => {
  for (const [initial, expected] of [
    [{}, settings('', '')],
    [settings('', ''), settings('', '')],
    [{ SPREADSHEET_ID: 'new-id' }, settings('new-id', '')],
    [{ SHEET_NAME: '' }, settings('', '')],
  ]) {
    const properties = settings('legacy', 'Old tab');
    const userProperties = { ...initial };
    const { context } = server({ properties, userProperties });
    context.getPortalUserProperties_();
    assert.equal(userProperties.SPREADSHEET_ID, expected.SPREADSHEET_ID);
    assert.equal(userProperties.SHEET_NAME, expected.SHEET_NAME);
    assert.deepEqual(properties, settings('legacy', 'Old tab'));
    properties.SPREADSHEET_ID = 'changed-legacy';
    properties.SHEET_NAME = 'Changed tab';
    context.getPortalUserProperties_();
    assert.equal(userProperties.SPREADSHEET_ID, expected.SPREADSHEET_ID);
    assert.equal(userProperties.SHEET_NAME, expected.SHEET_NAME);
  }
});

test('Use User Properties and resolve the first tab by index, not array order or the URL gid', () => {
  const userProperties = settings('https://docs.google.com/spreadsheets/d/user-sheet/edit#gid=99');
  const { context, calls } = server({ userProperties, sheetProperties: [{ title: 'Second', index: 1 }, { title: "First's sheet", index: 0, hidden: true }] });
  assert.equal(context.getCatalog().ok, true);
  assert.deepEqual(plain(calls), [
    ['get', 'user-sheet', { fields: 'sheets(properties(title,index))' }],
    ['values', 'user-sheet', "'First''s sheet'", { valueRenderOption: 'FORMATTED_VALUE' }],
  ]);
  const missing = server({ userProperties: settings('id', 'Missing') });
  assert.equal(missing.context.getCatalog().ok, false);
  assert.equal(missing.calls[0][2], "'Missing'");
  assert.equal(server({ userProperties: settings('id'), sheetProperties: [] }).context.getCatalog().ok, false);
});

test('Save only validated source fields, preserve unrelated preferences, and keep storage errors private', () => {
  const userProperties = { PORTAL_NAME: 'Mine', PORTAL_THEME: 'dim', CATALOG_CACHE_SECONDS: '300', OTHER: 'keep' };
  const { context } = server({ userProperties });
  const response = plain(context.saveSpreadsheetSettings(settings(' https://docs.google.com/spreadsheets/d/new-id/edit ', '  Tools  ')));
  assert.deepEqual(response, { ok: true, settings: settings('new-id', 'Tools') });
  assert.equal(userProperties.PORTAL_NAME, 'Mine');
  assert.equal(userProperties.OTHER, 'keep');
  const before = { ...userProperties };
  for (const value of [null, [], {}, { SPREADSHEET_ID: 'id' }, { ...settings(), PORTAL_THEME: 'auto' }, settings(3), settings('id', []), settings('bad/id'), settings('id', 'x'.repeat(101)), settings('x'.repeat(257))]) {
    assert.equal(context.saveSpreadsheetSettings(value).ok, false);
    assert.deepEqual(userProperties, before);
  }
  assert.equal(context.saveSpreadsheetSettings(settings('', '')).ok, true);
  context.getPortalUserProperties_();
  assert.equal(userProperties.SPREADSHEET_ID, '');
  const broken = server({ PropertiesService: { getUserProperties: () => ({ setProperties() { throw new Error('private-details'); } }) } });
  const failed = broken.context.saveSpreadsheetSettings(settings());
  assert.equal(failed.ok, false);
  assert.doesNotMatch(JSON.stringify([failed, broken.logs]), /private-details/);
});

test('Render stored source values safely as form text', () => {
  const { context } = server();
  const dom = new JSDOM(withPreviewContent(source, context.getPortalContent_(settings('"><script>bad</script>', '</input><img src=x>'))));
  assert.equal(dom.window.document.querySelector('#setting-spreadsheet').value, '"><script>bad</script>');
  assert.equal(dom.window.document.querySelector('#setting-sheet-name').value, '</input><img src=x>');
  assert.equal(dom.window.document.querySelectorAll('img').length, 0);
  dom.window.close();
});

test('Keep source saving independent, preserve drafts on failure, and ignore late responses after a timeout', (t) => {
  let timeout;
  const { dom, document, sourceSettingsRequests, settingsRequests } = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 15000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => dom.window.close());
  const form = document.querySelector('#spreadsheet-settings-form');
  const id = document.querySelector('#setting-spreadsheet');
  const name = document.querySelector('#setting-sheet-name');
  const fields = document.querySelector('#spreadsheet-settings-fields');
  const reload = document.querySelector('#reload-spreadsheet');
  const submit = () => form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  document.querySelector('#setting-name').value = 'Unrelated draft';
  id.value = 'https://docs.google.com/spreadsheets/d/new-id/edit';
  name.value = '';
  submit(); submit();
  assert.equal(sourceSettingsRequests.length, 1);
  assert.equal(settingsRequests.length, 0);
  assert.equal(fields.disabled, true);
  sourceSettingsRequests[0].success({ ok: true, settings: settings() });
  assert.equal(id.value, 'new-id');
  assert.equal(fields.disabled, false);
  assert.equal(reload.hidden, false);
  assert.equal(document.querySelector('#setting-name').value, 'Unrelated draft');
  id.value = 'another-id';
  submit();
  sourceSettingsRequests[1].failure();
  assert.equal(id.value, 'another-id');
  assert.equal(reload.hidden, true);
  submit();
  timeout();
  sourceSettingsRequests[2].success({ ok: true, settings: settings() });
  assert.equal(id.value, 'another-id');
  assert.equal(fields.disabled, false);
  assert.match(document.querySelector('#spreadsheet-settings-status').textContent, /再読み込み/);
});

test('Preview persists source settings without accessing Google and restores them after reload', (t) => {
  const storage = {};
  const create = () => runPreviewMock(previewPage(t), { storage });
  let result;
  const first = create();
  first.run.withSuccessHandler((value) => { result = value; }).saveSpreadsheetSettings(settings('https://docs.google.com/spreadsheets/d/new-id/edit', 'My tools'));
  assert.deepEqual(plain(result), { ok: true, settings: settings('new-id', 'My tools') });
  const restored = create();
  assert.equal(restored.document.querySelector('#setting-spreadsheet').value, 'new-id');
  assert.equal(restored.document.querySelector('#setting-sheet-name').value, 'My tools');
  assert.equal(restored.document.querySelector('footer nav .spreadsheet-link').href, 'https://docs.google.com/spreadsheets/d/new-id/edit');
  assert.equal(restored.document.querySelector('#open-spreadsheet-link').dataset.url, 'https://docs.google.com/spreadsheets/d/new-id/edit');
  restored.run.withSuccessHandler((value) => { result = value; }).getCatalog();
  assert.equal(result.tools[0].id, 'demo-address');
  restored.run.withSuccessHandler((value) => { result = value; }).saveSpreadsheetSettings(settings('https://evil.test'));
  assert.equal(result.ok, false);
  assert.equal(JSON.parse(storage['portal-preview-source']).SPREADSHEET_ID, 'new-id');
});


test('Preview creates a fake source once and keeps demo entries after reload', (t) => {
  const storage = { 'portal-preview-source': JSON.stringify(settings('', '')) };
  const create = () => runPreviewMock(previewPage(t), { storage });
  let result;
  const first = create();
  first.run.withSuccessHandler((value) => { result = value; }).createPortalSpreadsheet('en');
  assert.deepEqual(plain(result), { ok: true, spreadsheetId: 'preview-created-sheet' });
  assert.deepEqual(JSON.parse(storage['portal-preview-source']), settings('preview-created-sheet', ''));
  first.run.withSuccessHandler((value) => { result = value; }).createPortalSpreadsheet('en');
  assert.equal(result.ok, false);
  assert.match(result.error, /already configured/);
  const restored = create();
  assert.equal(restored.document.querySelector('#setting-spreadsheet').value, 'preview-created-sheet');
  restored.run.withSuccessHandler((value) => { result = value; }).getCatalog();
  assert.equal(result.ok, true);
  assert.equal(result.tools.length, 6);
  assert.equal(result.tools[0].id, 'demo-address');
  assert.deepEqual(plain(result.issues), []);
});

test('Always link to the saved spreadsheet, follow saves, and ignore unsaved drafts', (t) => {
  const { dom, document, sourceSettingsRequests } = browser((window) => {
    window.document.getElementById('open-spreadsheet-link').dataset.url = 'https://docs.google.com/spreadsheets/d/saved-id/edit';
  });
  t.after(() => dom.window.close());
  const link = document.getElementById('open-spreadsheet-link');
  const id = document.getElementById('setting-spreadsheet');
  assert.equal(link.hidden, false);
  assert.equal(link.href, 'https://docs.google.com/spreadsheets/d/saved-id/edit');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.match(link.textContent, /スプレッドシートを開く/);
  id.value = 'draft-id';
  id.dispatchEvent(new dom.window.Event('input'));
  assert.equal(link.href, 'https://docs.google.com/spreadsheets/d/saved-id/edit', 'Drafts do not move the link');
  const submit = () => document.getElementById('spreadsheet-settings-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  submit();
  sourceSettingsRequests[0].success({ ok: true, settings: { SPREADSHEET_ID: 'draft-id', SHEET_NAME: '' } });
  assert.equal(link.href, 'https://docs.google.com/spreadsheets/d/draft-id/edit');
  id.value = '';
  submit();
  sourceSettingsRequests[1].failure();
  assert.equal(link.hidden, false, 'A failed save keeps the saved link');
  submit();
  sourceSettingsRequests[2].success({ ok: true, settings: { SPREADSHEET_ID: '', SHEET_NAME: '' } });
  assert.equal(link.hidden, true);
  assert.equal(link.hasAttribute('href'), false);
});

test('Hide the spreadsheet link when no source is saved', (t) => {
  const { dom, document } = browser();
  t.after(() => dom.window.close());
  assert.equal(document.getElementById('open-spreadsheet-link').hidden, true);
});
