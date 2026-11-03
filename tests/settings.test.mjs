import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, server, plain } from './helpers.mjs';

const values = (overrides = {}) => ({ PORTAL_NAME: 'Fumi Portal', PORTAL_ICON: 'F', PORTAL_HEADLINE: '今日の仕事', PORTAL_DESCRIPTION: 'リンクとタスク', ...overrides });

test('初回表示で旧文言だけを移行し、既存の空値を保持し、その後は旧設定を参照しない', () => {
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

test('保存・リセットは表示設定 4 項目だけに適用し、再移行で古い値を復活させない', () => {
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

test('表示設定の空白は既定値へ、HTML はテキストとして保存し、余計なキー・型・長さを拒否する', () => {
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

test('保存失敗の詳細を返さず、ロックを解放する', () => {
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

test('フォームを保存するとタイトル・ブランド・見出しが安全なテキストで更新される', (t) => {
  const { dom, document, settingsRequests } = browser();
  t.after(() => dom.window.close());
  const settings = values({ PORTAL_NAME: '<img src=x> Portal', PORTAL_HEADLINE: '<b>headline</b>', PORTAL_DESCRIPTION: '</textarea><script>alert(1)</script>' });
  for (const [key, value] of Object.entries(settings)) document.querySelector(`[name="${key}"]`).value = value;
  document.querySelector('#portal-settings-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  assert.deepEqual(plain(settingsRequests[0].settings), settings);
  assert.equal(document.title, 'My Portal', '保存完了までは現在の表示を維持する');
  assert.equal(document.querySelector('#portal-settings-fields').disabled, true);
  settingsRequests[0].success({ ok: true, settings });
  assert.equal(document.title, settings.PORTAL_NAME);
  assert.equal(document.querySelector('.brand-name').textContent, settings.PORTAL_NAME);
  assert.equal(document.querySelector('#page-title').textContent, settings.PORTAL_HEADLINE);
  assert.equal(document.querySelector('.intro-copy').textContent, settings.PORTAL_DESCRIPTION);
  assert.equal(document.querySelectorAll('img').length, 0);
  assert.equal(document.querySelector('#portal-settings-fields').disabled, false);
});

test('既定値に戻す操作は入力欄だけを変更し、明示的な保存で初めて反映する', (t) => {
  const { dom, document, settingsRequests } = browser((window) => {
    window.document.documentElement.dataset.theme = 'kuri';
    for (const [key, value] of Object.entries(values())) window.document.querySelector(`[name="${key}"]`).value = value;
  });
  t.after(() => dom.window.close());
  document.querySelector('#setting-name').value = 'unsaved';
  document.querySelector('#reset-portal-settings').click();
  const defaults = plain(server().context.getPortalPropertyDefaults_());
  for (const [key, value] of Object.entries(defaults)) assert.equal(document.querySelector(`[name="${key}"]`).value, value);
  assert.equal(settingsRequests.length, 0, 'リセットだけではサーバーに書き込まない');
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

test('タイムアウト後に届いた表示設定の応答は反映せず再読み込みを案内する', (t) => {
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
