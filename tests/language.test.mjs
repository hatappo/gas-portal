import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { browser, server, catalog, plain, previewPage, runPreviewMock } from './helpers.mjs';

function choose(app, language) {
  app.document.getElementById('portal-language').value = language;
  app.document.getElementById('portal-language').dispatchEvent(new app.dom.window.Event('change', { bubbles: true }));
}

test('Persist only supported languages in User Properties without changing other settings', () => {
  const userProperties = { PORTAL_THEME: 'forest', PORTAL_NAME: 'Custom', PORTAL_HEADLINE: '独自の見出し' };
  const properties = { SPREADSHEET_ID: 'sheet', SHEET_NAME: 'Links' };
  const app = server({ userProperties, properties });
  assert.equal(app.context.getPortalLanguage_(), 'en');
  for (const value of ['en', 'ja', 'auto']) {
    assert.deepEqual(plain(app.context.saveLanguage(value)), { ok: true, language: value });
    assert.equal(app.context.getPortalLanguage_(), value === 'ja' ? 'ja' : 'en');
  }
  const before = { ...userProperties };
  for (const value of ['fr', 'EN', '', null, {}, '<script>']) assert.equal(app.context.saveLanguage(value).ok, false);
  assert.deepEqual(userProperties, before);
  assert.deepEqual(properties, { SPREADSHEET_ID: 'sheet', SHEET_NAME: 'Links' });
  assert.equal(server().context.getPortalLanguage_(), 'en');
});

test('Initialize the language once, preserving existing values and isolating user settings', () => {
  for (const value of ['ja', 'en', 'auto', '', 'unknown']) {
    const userProperties = { PORTAL_LANGUAGE: value };
    const app = server({ userProperties });
    app.context.getPortalUserProperties_();
    app.context.getPortalUserProperties_();
    assert.equal(userProperties.PORTAL_LANGUAGE, value);
    assert.equal(app.context.getPortalLanguage_(), value === 'ja' ? 'ja' : 'en');
  }
  const userProperties = {};
  server({ userProperties }).context.getPortalUserProperties_();
  assert.equal(userProperties.PORTAL_LANGUAGE, 'auto');
});

test('Use localized preset text while preserving custom content and preserving intentionally blank intro text', () => {
  const app = server({ userProperties: { PORTAL_LANGUAGE: 'en' } });
  const preset = plain(app.context.getPortalPropertyDefaults_());
  const content = app.context.getPortalContent_({ ...preset, PORTAL_LANGUAGE: 'en' });
  assert.equal(content.language, 'en');
  assert.equal(content.headline, 'One place to start your workday.');
  const custom = { ...preset, PORTAL_LANGUAGE: 'en', PORTAL_HEADLINE: '独自の見出し', PORTAL_DESCRIPTION: '<b>custom</b>' };
  assert.equal(app.context.getPortalContent_(custom).headline, custom.PORTAL_HEADLINE);
  assert.equal(app.context.getPortalContent_(custom).description, custom.PORTAL_DESCRIPTION);
  assert.equal(app.context.savePortalSettings({ ...preset, PORTAL_HEADLINE: '' }).settings.PORTAL_HEADLINE, '');
  assert.equal(app.context.savePortalSettings(app.context.getPortalPropertyDefaults_('en')).settings.PORTAL_HEADLINE, content.headline);
});

test('Release the language lock and do not expose storage errors', () => {
  let released = false;
  const app = server({
    PropertiesService: { getUserProperties: () => ({ setProperty() { throw new Error('private-token'); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) },
  });
  assert.equal(app.context.saveLanguage('en').ok, false);
  assert.equal(released, true);
  assert.doesNotMatch(JSON.stringify(app.logs), /private-token/);
});

test('Translate every settings status message when switching languages', (t) => {
  const app = browser();
  t.after(() => app.dom.window.close());
  const ids = ['theme-status', 'portal-settings-status', 'cache-settings-status', 'actions-cache-settings-status',
    'spreadsheet-settings-status', 'url-scheme-settings-status', 'github-settings-status', 'favicon-finder-status'];
  ids.forEach((id) => { app.document.getElementById(id).textContent = '保存しました'; });
  choose(app, 'en');
  app.languageRequests[0].success({ ok: true, language: 'en' });
  assert.deepEqual(ids.map((id) => app.document.getElementById(id).textContent), ids.map(() => 'Saved'));
});

test('Switch labels, accessibility text, warnings, and default content without losing filters or drafts', (t) => {
  const app = browser();
  t.after(() => app.dom.window.close());
  app.requests[0].success({ ...catalog, issues: [{ row: 4, message: 'url に有効な URL を入力してください。' }] });
  const { document: doc } = app;
  doc.getElementById('search').value = 'Guide';
  doc.getElementById('search').dispatchEvent(new app.dom.window.Event('input', { bubbles: true }));
  doc.getElementById('view-list').click();
  doc.getElementById('tab-settings').click();
  doc.getElementById('setting-headline').value = 'Unsaved custom headline';
  choose(app, 'en');
  assert.equal(doc.documentElement.lang, 'ja');
  assert.equal(doc.getElementById('portal-language').disabled, true);
  app.languageRequests[0].success({ ok: true, language: 'en' });
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.getElementById('tab-settings').getAttribute('aria-label'), 'Settings');
  assert.equal(doc.getElementById('refresh-catalog').getAttribute('aria-label'), 'Fetch latest');
  assert.equal(doc.getElementById('refresh-catalog').title, '', 'Skeleton supplies the tooltip without a duplicate native title');
  assert.equal(doc.getElementById('refresh-actions').title, '', 'Skeleton supplies the tooltip without a duplicate native title');
  assert.equal(doc.getElementById('refresh-actions').getAttribute('aria-label'), 'Fetch latest');
  assert.equal(doc.getElementById('search').placeholder, 'Search by name, description, or tags');
  assert.equal(doc.getElementById('search').value, 'Guide');
  assert.equal(doc.getElementById('view-list').checked, true);
  assert.equal(doc.getElementById('tab-settings').getAttribute('aria-selected'), 'true');
  assert.equal(doc.getElementById('setting-headline').value, 'Unsaved custom headline');
  assert.equal(doc.getElementById('page-title').textContent, 'One place to start your workday.');
  assert.match(doc.querySelector('#table-view thead').textContent, /Link.*Description.*Tags.*Related links/);
  assert.match(doc.getElementById('tool-rows').textContent, /Guide/);
  assert.match(doc.getElementById('warning-list').textContent, /Row 4: Enter a valid URL/);
  assert.match(doc.getElementById('warning-summary').textContent, /Entries not displayed: 1/);
  assert.equal(app.requests.length, 1);
  choose(app, 'ja');
  app.languageRequests[1].success({ ok: true, language: 'ja' });
  assert.equal(doc.getElementById('tab-settings').getAttribute('aria-label'), '設定');
  assert.equal(doc.getElementById('refresh-catalog').getAttribute('aria-label'), '最新データを取得');
  assert.equal(doc.getElementById('refresh-catalog').title, '', 'Skeleton supplies the tooltip without a duplicate native title');
  assert.equal(doc.getElementById('refresh-actions').title, '', 'Skeleton supplies the tooltip without a duplicate native title');
  assert.equal(doc.getElementById('refresh-actions').getAttribute('aria-label'), '最新データを取得');
  assert.equal(doc.getElementById('setting-headline').value, 'Unsaved custom headline');
  assert.match(doc.querySelector('#table-view thead').textContent, /リンク.*説明.*Tags.*関連リンク/);
});

test('Keep the saved language after failure and ignore late responses after timeout', (t) => {
  let timeout;
  const app = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 15000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => app.dom.window.close());
  choose(app, 'en');
  app.languageRequests[0].failure();
  assert.equal(app.document.documentElement.lang, 'ja');
  assert.equal(app.document.getElementById('portal-language').value, 'ja');
  choose(app, 'en');
  timeout();
  app.languageRequests[1].success({ ok: true, language: 'en' });
  assert.equal(app.document.documentElement.lang, 'ja');
  assert.match(app.document.getElementById('language-status').textContent, /再読み込み/);
  assert.equal(app.document.getElementById('portal-language').disabled, false);
});

test('Localize known server errors and parameterized messages without interpreting custom HTML', (t) => {
  const app = browser();
  t.after(() => app.dom.window.close());
  const translator = app.dom.window.PortalI18n;
  assert.equal(translator.translate('PORTAL_NAME は 80 文字以内で入力してください。', 'en'), 'PORTAL_NAME must contain at most 80 characters.');
  assert.equal(translator.translate('<img src=x onerror=alert(1)>', 'en'), '<img src=x onerror=alert(1)>');
  app.requests[0].success({ ok: false, error: '指定されたシートがありません。SHEET_NAME とシート名が一致しているか確認してください。' });
  choose(app, 'en');
  app.languageRequests[0].success({ ok: true, language: 'en' });
  assert.match(app.document.getElementById('status-description').textContent, /The specified sheet does not exist/);
});

test('Preview language persists locally, restores on reload, and reports storage failures', (t) => {
  const storage = { 'portal-preview-language': 'en' };
  const dom = previewPage(t);
  const runMock = () => runPreviewMock(dom, { localStorage: { getItem: (key) => storage[key], setItem(key, value) { storage[key] = value; } } }).context;
  let context = runMock();
  assert.equal(dom.window.document.documentElement.lang, 'en');
  let result;
  vm.runInContext('google.script.run', context).withSuccessHandler(value => { result = value; }).saveLanguage('ja');
  assert.equal(result.language, 'ja');
  context = runMock();
  assert.equal(dom.window.document.documentElement.lang, 'ja');
  context.localStorage.setItem = () => { throw new Error('denied'); };
  let failed = false;
  vm.runInContext('google.script.run', context).withFailureHandler(() => { failed = true; }).saveLanguage('en');
  assert.equal(failed, true);
});

test('Detect ordered browser preferences, preserve explicit choices, and fall back to English', () => {
  const { context } = server();
  const resolve = context.PortalI18n.resolve;
  for (const [preference, languages, expected] of [
    ['auto', ['ja-JP', 'en-US'], 'ja'], ['auto', ['en-GB', 'ja'], 'en'],
    [undefined, ['fr-FR', 'ja-JP'], 'ja'], ['', ['EN-us'], 'en'],
    ['auto', ['zh-CN'], 'en'], ['auto', [], 'en'], ['unknown', [], 'en'],
    ['en', ['ja-JP'], 'en'], ['ja', ['en-US'], 'ja'],
  ]) assert.equal(resolve(preference, languages), expected);
});

test('Automatic mode follows browser changes without writes and explicit selection overrides detection', (t) => {
  let languages = ['ja-JP', 'en-US'];
  const app = browser((window) => {
    window.document.documentElement.dataset.languagePreference = 'auto';
    Object.defineProperty(window.navigator, 'languages', { get: () => languages });
  });
  t.after(() => app.dom.window.close());
  const doc = app.document;
  assert.equal(doc.documentElement.lang, 'ja');
  assert.equal(doc.getElementById('portal-language').value, 'auto');
  assert.equal(app.languageRequests.length, 0);
  languages = ['en-US'];
  app.dom.window.dispatchEvent(new app.dom.window.Event('languagechange'));
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.getElementById('page-title').textContent, 'One place to start your workday.');
  assert.equal(app.languageRequests.length, 0);
  choose(app, 'ja');
  app.languageRequests[0].success({ ok: true, language: 'ja' });
  app.dom.window.dispatchEvent(new app.dom.window.Event('languagechange'));
  assert.equal(doc.documentElement.lang, 'ja');
  choose(app, 'auto');
  app.languageRequests[1].success({ ok: true, language: 'auto' });
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.documentElement.dataset.languagePreference, 'auto');
});

test('Keep optional intro text empty regardless of resolved or saved language', (t) => {
  const app = browser((window) => {
    window.document.documentElement.dataset.languagePreference = 'auto';
    Object.defineProperty(window.navigator, 'languages', { value: ['ja-JP'] });
  });
  t.after(() => app.dom.window.close());
  app.document.getElementById('setting-headline').value = '';
  app.document.getElementById('portal-settings-form').dispatchEvent(new app.dom.window.Event('submit', { cancelable: true, bubbles: true }));
  const request = app.settingsRequests[0];
  assert.equal(request.browserLanguage, 'ja');
  const api = server({ userProperties: { PORTAL_LANGUAGE: 'auto' } });
  const response = api.context.savePortalSettings(request.settings, request.browserLanguage);
  assert.equal(response.settings.PORTAL_HEADLINE, '');
  const explicit = server({ userProperties: { PORTAL_LANGUAGE: 'en' } });
  assert.equal(explicit.context.savePortalSettings(request.settings, 'ja').settings.PORTAL_HEADLINE, '');
});

test('Give language its own section at the same heading level as portal content and color theme', (t) => {
  const app = browser();
  t.after(() => app.dom.window.close());
  const panel = app.document.getElementById('settings-appearance-panel');
  const headings = [...panel.querySelectorAll('h2')];
  assert.deepEqual(headings.map((heading) => heading.textContent), ['ポータルの表示内容', 'カラーテーマ', '表示言語']);
  const language = app.document.querySelector('.language-settings');
  assert.equal(language.tagName, 'SECTION');
  assert.equal(language.parentElement, panel);
  assert.equal(app.document.getElementById('portal-language').getAttribute('aria-labelledby'), 'language-settings-title');
  assert.equal(language.getAttribute('aria-labelledby'), 'language-settings-title');
});
