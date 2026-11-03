import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { browser, server, plain } from './helpers.mjs';

const themes = ['tsuyukusa', 'sakura', 'wakatake', 'yamabuki', 'tetsukon', 'sumi', 'kuri', 'fukamidori'];

test('旧・紫紺の保存値は栗色に引き継ぎ、明示的な保存は新しい ID を使う', () => {
  const userProperties = { PORTAL_THEME: 'shikon' };
  const { context } = server({ userProperties });
  assert.equal(context.getPortalTheme_(), 'kuri');
  assert.equal(userProperties.PORTAL_THEME, 'shikon', '表示だけではストアを書き換えない');
  assert.deepEqual(plain(context.saveTheme('kuri')), { ok: true, theme: 'kuri' });
  assert.equal(userProperties.PORTAL_THEME, 'kuri');
});

test('テーマは User Properties に保存し、再表示で復元する。Script Properties は変更しない', () => {
  const userProperties = {};
  const properties = { PORTAL_NAME: 'Example', PORTAL_THEME: 'not-used' };
  const template = { evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) };
  const { context } = server({ userProperties, properties,
    HtmlService: { createTemplateFromFile: () => template }, ScriptApp: { getScriptId: () => 'test' },
  });
  context.doGet();
  assert.equal(template.theme, 'tsuyukusa');
  for (const theme of themes) {
    assert.deepEqual(plain(context.saveTheme(theme)), { ok: true, theme });
    context.doGet();
    assert.equal(template.theme, theme);
    assert.equal(userProperties.PORTAL_THEME, theme);
  }
  assert.deepEqual(properties, { PORTAL_NAME: 'Example', PORTAL_THEME: 'not-used' });
  assert.equal(server().context.getPortalTheme_(), 'tsuyukusa', '別の利用者のストアには影響しない');
});

test('未対応のテーマは保存せず、不正な保存値は既定色へ戻す。保存失敗の詳細を返さない', () => {
  const userProperties = { PORTAL_THEME: 'unknown' };
  const { context } = server({ userProperties });
  assert.equal(context.getPortalTheme_(), 'tsuyukusa');
  for (const value of [null, 123, '', {}, '<script>', '__proto__', 'TSUYUKUSA']) {
    assert.deepEqual(plain(context.saveTheme(value)), { ok: false });
    assert.equal(userProperties.PORTAL_THEME, 'unknown');
  }
  const failed = server({ PropertiesService: { getUserProperties: () => ({ setProperty() { throw new Error('private-details'); } }) } });
  assert.deepEqual(plain(failed.context.saveTheme('sakura')), { ok: false });
  assert.doesNotMatch(JSON.stringify(failed.logs), /private-details/);
});

test('設定タブはアイコンのみで名前を持ち、8 テーマをライト・ダーク 4 件ずつ選択できる', (t) => {
  const { dom, document, themeRequests } = browser((window) => { window.document.documentElement.dataset.theme = 'sumi'; });
  t.after(() => dom.window.close());
  const settings = document.querySelector('#tab-settings');
  assert.equal(settings.textContent, '');
  assert.equal(settings.getAttribute('aria-label'), '設定');
  settings.click();
  assert.equal(document.querySelector('#settings-panel').hidden, false);
  const groups = document.querySelectorAll('.theme-group');
  assert.equal(groups.length, 2);
  assert.deepEqual([...groups].map((group) => group.querySelectorAll('input').length), [4, 4]);
  assert.equal(document.querySelector('input[name="portal-theme"]:checked').value, 'sumi');
  for (const theme of themes) {
    const choice = document.querySelector(`input[value="${theme}"]`);
    choice.click();
    assert.equal(document.documentElement.dataset.theme, theme);
    const request = themeRequests.at(-1);
    assert.equal(request.theme, theme);
    assert.equal(choice.disabled, true);
    request.success({ ok: true, theme });
    assert.equal(choice.disabled, false);
    assert.equal(document.querySelector('#theme-status').textContent, '保存しました');
  }
});

test('保存失敗では最後に保存できたテーマへ戻し、再選択で再試行できる', (t) => {
  const { dom, document, themeRequests } = browser();
  t.after(() => dom.window.close());
  const choice = document.querySelector('input[value="sakura"]');
  for (const complete of [(request) => request.failure(), (request) => request.success({ ok: false }), (request) => request.success({ ok: true, theme: 'unknown' })]) {
    choice.click();
    complete(themeRequests.at(-1));
    assert.equal(document.documentElement.dataset.theme, 'tsuyukusa');
    assert.equal(choice.disabled, false);
    assert.match(document.querySelector('#theme-status').textContent, /保存できません/);
  }
  choice.click();
  themeRequests.at(-1).success({ ok: true, theme: 'sakura' });
  assert.equal(document.documentElement.dataset.theme, 'sakura');
});

test('テーマ保存のタイムアウトを通知し、遅れて届いた応答で新しい選択を上書きしない', (t) => {
  let timeout;
  const { dom, document, themeRequests } = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 15000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => dom.window.close());
  document.querySelector('input[value="sakura"]').click();
  timeout();
  assert.match(document.querySelector('#theme-status').textContent, /再読み込み/);
  document.querySelector('input[value="tetsukon"]').click();
  themeRequests[1].success({ ok: true, theme: 'tetsukon' });
  themeRequests[0].success({ ok: true, theme: 'sakura' });
  assert.equal(document.documentElement.dataset.theme, 'tetsukon');
});

test('8 配色すべてで本文・補助文字・選択中ラベルに 4.5:1 以上のコントラストを確保する', () => {
  const css = readFileSync('src/browser/styles.css', 'utf8');
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  themes.forEach((theme, index) => {
    const block = css.match(new RegExp(`\\[data-theme="${theme}"\\] \\{([^}]+)\\}`))[1];
    assert.match(block, new RegExp(`color-scheme: ${index < 4 ? 'light' : 'dark'}`));
    const colors = Object.fromEntries([...block.matchAll(/--([\w-]+): (#[\da-f]{6})/g)].map((match) => [match[1], match[2]]));
    const pairs = ['ink', 'muted', 'accent'].flatMap((text) => ['paper', 'surface', 'surface-soft'].map((surface) => [text, surface]));
    pairs.push(['on-theme', 'theme-color'], ['external-ink', 'external-bg'], ['warning-ink', 'warning-bg']);
    for (const [text, surface] of pairs) {
      const [low, high] = [luminance(colors[text]), luminance(colors[surface])].sort((a, b) => a - b);
      assert.ok((high + .05) / (low + .05) >= 4.5, `${theme}: ${text} / ${surface}`);
    }
  });
});
