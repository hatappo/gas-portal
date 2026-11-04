import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { withPreviewContent } from '../scripts/preview-project.mjs';
import { browser, server, plain } from './helpers.mjs';

const values = (overrides = {}) => ({ PORTAL_NAME: 'Fumi Portal', PORTAL_ICON: 'F', PORTAL_HEADLINE: '今日の仕事', PORTAL_DESCRIPTION: 'リンクとタスク', ...overrides });

test("Migrate legacy display settings once while preserving existing empty values", () => {
  const properties = { PORTAL_NAME: 'Old Portal', PORTAL_HEADLINE: 'Old headline', SPREADSHEET_ID: 'private-id' };
  const userProperties = { PORTAL_HEADLINE: '', PORTAL_THEME: 'kuri', OTHER: 'keep' };
  const { context } = server({ properties, userProperties });
  context.getPortalUserProperties_(properties);
  assert.equal(userProperties.PORTAL_NAME, 'Old Portal');
  assert.equal(userProperties.PORTAL_HEADLINE, '');
  assert.equal(userProperties.SPREADSHEET_ID, undefined);
  properties.PORTAL_NAME = 'Changed legacy';
  context.getPortalUserProperties_(properties);
  assert.equal(userProperties.PORTAL_NAME, 'Old Portal');
  assert.equal(userProperties.PORTAL_THEME, 'kuri');
  assert.equal(userProperties.OTHER, 'keep');
});

test("Save and reset only four display fields without reviving legacy values", () => {
  const properties = { PORTAL_NAME: 'Old Portal', SPREADSHEET_ID: 'sheet', SHEET_NAME: 'Tools' };
  const userProperties = { PORTAL_THEME: 'sakura', OTHER: 'keep' };
  const { context } = server({ properties, userProperties });
  assert.deepEqual(plain(context.savePortalSettings(values())), { ok: true, settings: values() });
  assert.equal(context.getPortalContent_(userProperties, properties).name, 'Fumi Portal');
  const reset = plain(context.resetPortalSettings());
  assert.deepEqual(reset.settings, plain(context.getPortalPropertyDefaults_()));
  context.getPortalUserProperties_(properties);
  context.initializeProperties();
  assert.equal(userProperties.PORTAL_NAME, 'My Portal');
  assert.equal(userProperties.PORTAL_THEME, 'sakura');
  assert.equal(userProperties.OTHER, 'keep');
  assert.deepEqual(properties, { PORTAL_NAME: 'Old Portal', SPREADSHEET_ID: 'sheet', SHEET_NAME: 'Tools' });
});

test("Default blank settings, preserve text, and reject extra keys, invalid types, or excessive length", () => {
  const userProperties = {};
  const { context } = server({ userProperties });
  const result = context.savePortalSettings(values({ PORTAL_NAME: '  ', PORTAL_ICON: '😀', PORTAL_HEADLINE: '<b>test</b>' }));
  assert.equal(result.settings.PORTAL_NAME, 'My Portal');
  assert.equal(result.settings.PORTAL_ICON, '😀');
  assert.equal(result.settings.PORTAL_HEADLINE, '<b>test</b>');
  const before = { ...userProperties };
  for (const input of [null, [], {}, values({ SPREADSHEET_ID: 'other' }), values({ PORTAL_THEME: 'sumi' }), values({ PORTAL_NAME: 1 }),
    values({ PORTAL_ICON: 'AB' }), values({ PORTAL_NAME: 'x'.repeat(81) }), values({ PORTAL_HEADLINE: 'x'.repeat(161) }), values({ PORTAL_DESCRIPTION: 'x'.repeat(501) })]) {
    assert.equal(context.savePortalSettings(input).ok, false);
    assert.deepEqual(userProperties, before);
  }
});

test("Release the lock and hide storage failure details", () => {
  let released = false;
  const { context, logs } = server({
    PropertiesService: { getUserProperties: () => ({ setProperties() { throw new Error('private-detail'); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) },
  });
  const result = context.savePortalSettings(values());
  assert.equal(result.ok, false);
  assert.equal(released, true);
  assert.doesNotMatch(JSON.stringify([result, logs]), /private-detail/);
});

test("Apply saved names and display content safely as text", (t) => {
  const { dom, document, settingsRequests } = browser();
  t.after(() => dom.window.close());
  const settings = values({ PORTAL_NAME: '<img src=x> Portal', PORTAL_HEADLINE: '<b>headline</b>', PORTAL_DESCRIPTION: '</textarea><script>alert(1)</script>' });
  for (const [key, value] of Object.entries(settings)) document.querySelector(`[name="${key}"]`).value = value;
  document.querySelector('#portal-settings-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  assert.deepEqual(plain(settingsRequests[0].settings), settings);
  assert.equal(document.title, 'My Portal', 'Keep the current display until saving succeeds');
  assert.equal(document.querySelector('#portal-settings-fields').disabled, true);
  settingsRequests[0].success({ ok: true, settings });
  assert.equal(document.title, settings.PORTAL_NAME);
  assert.equal(document.querySelector('.brand-name').textContent, settings.PORTAL_NAME);
  assert.equal(document.querySelector('#page-title').textContent, settings.PORTAL_HEADLINE);
  assert.equal(document.querySelector('.intro-copy').textContent, settings.PORTAL_DESCRIPTION);
  assert.equal(document.querySelectorAll('img').length, 0);
  assert.equal(document.querySelector('#portal-settings-fields').disabled, false);
});

test("Reset only form values until the user explicitly saves", (t) => {
  const { dom, document, settingsRequests } = browser((window) => {
    window.document.documentElement.dataset.theme = 'kuri';
    for (const [key, value] of Object.entries(values())) window.document.querySelector(`[name="${key}"]`).value = value;
  });
  t.after(() => dom.window.close());
  document.querySelector('#setting-name').value = 'unsaved';
  document.querySelector('#reset-portal-settings').click();
  const defaults = plain(server().context.getPortalPropertyDefaults_('ja'));
  for (const [key, value] of Object.entries(defaults)) assert.equal(document.querySelector(`[name="${key}"]`).value, value);
  assert.equal(settingsRequests.length, 0, 'Resetting the form must not write to the server');
  assert.equal(document.title, 'Fumi Portal');
  assert.equal(document.querySelector('#page-title').textContent, '今日の仕事');
  assert.equal(document.querySelector('.brand-mark').textContent, 'F');
  assert.equal(document.querySelector('.intro-copy').textContent, 'リンクとタスク');
  assert.equal(document.documentElement.dataset.theme, 'kuri');
  assert.match(document.querySelector('#portal-settings-status').textContent, /変更を保存/);
  document.querySelector('#portal-settings-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  assert.deepEqual(plain(settingsRequests[0].settings), defaults);
  settingsRequests[0].failure();
  assert.equal(document.querySelector('#setting-name').value, 'My Portal');
  assert.equal(document.title, 'Fumi Portal');
  assert.match(document.querySelector('#portal-settings-status').textContent, /入力内容は保持/);
  document.querySelector('#portal-settings-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  settingsRequests[1].success({ ok: true, settings: defaults });
  assert.equal(document.title, 'My Portal');
  assert.equal(document.documentElement.dataset.theme, 'kuri');
});

test("Ignore late settings responses after timeout and request a reload", (t) => {
  let timeout;
  const { dom, document, settingsRequests } = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 15000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => dom.window.close());
  document.querySelector('#portal-settings-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  timeout();
  settingsRequests[0].success({ ok: true, settings: values() });
  assert.equal(document.title, 'My Portal');
  assert.equal(document.querySelector('#portal-settings-fields').disabled, false);
  assert.match(document.querySelector('#portal-settings-status').textContent, /再読み込み/);
});


test('Persist empty intro text, preserve it during initialization, and hide it before client startup', (t) => {
  const userProperties = {};
  const { context } = server({ userProperties });
  const result = context.savePortalSettings(values({ PORTAL_HEADLINE: '  ', PORTAL_DESCRIPTION: '\n' }));
  assert.equal(result.settings.PORTAL_HEADLINE, '');
  assert.equal(result.settings.PORTAL_DESCRIPTION, '');
  context.initializeProperties();
  const content = context.getPortalContent_(userProperties);
  assert.equal(content.headline, '');
  assert.equal(content.description, '');
  const html = withPreviewContent(readFileSync('src/Index.html', 'utf8'), content).replace(/<\?[\s\S]*?\?>/g, '');
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  assert.equal(dom.window.document.querySelector('.intro').hidden, true);
  assert.equal(dom.window.document.querySelector('#page-title').hidden, true);
  assert.equal(dom.window.document.querySelector('.intro-copy').hidden, true);
  assert.equal(context.getPortalContent_({}).headline, 'One place to start your workday.');
});

test('Hide optional intro elements after saving and restore them only after saving defaults', (t) => {
  const { dom, document, settingsRequests, languageRequests } = browser();
  t.after(() => dom.window.close());
  const save = (headline, description) => {
    document.querySelector('#setting-headline').value = headline;
    document.querySelector('#setting-description').value = description;
    document.querySelector('#portal-settings-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    const request = settingsRequests.at(-1);
    request.success({ ok: true, settings: request.settings });
  };
  const intro = document.querySelector('.intro');
  save('', 'Description only');
  assert.equal(intro.hidden, false);
  assert.equal(document.querySelector('#page-title').hidden, true);
  assert.equal(document.querySelector('.intro-copy').hidden, false);
  assert.equal(intro.hasAttribute('aria-labelledby'), false);
  save('Headline only', '');
  assert.equal(document.querySelector('#page-title').hidden, false);
  assert.equal(document.querySelector('.intro-copy').hidden, true);
  assert.equal(intro.getAttribute('aria-labelledby'), 'page-title');
  save('', '');
  assert.equal(intro.hidden, true);
  const language = document.querySelector('#portal-language');
  language.value = 'en';
  language.dispatchEvent(new dom.window.Event('change'));
  languageRequests.at(-1).success({ ok: true, language: 'en' });
  assert.equal(document.querySelector('#setting-headline').value, '');
  assert.equal(intro.hidden, true);
  document.querySelector('#reset-portal-settings').click();
  assert.equal(intro.hidden, true, 'Reset affects only form fields until saved');
  save(document.querySelector('#setting-headline').value, document.querySelector('#setting-description').value);
  assert.equal(intro.hidden, false);
  assert.equal(document.querySelector('#page-title').hidden, false);
  assert.equal(document.querySelector('.intro-copy').hidden, false);
});
