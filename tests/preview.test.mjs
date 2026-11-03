import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { renderPreview } from '../scripts/preview.mjs';

const source = readFileSync('src/Index.html', 'utf8');

test('Vite 用 HTML は GAS タグを解決し、モックと通常のモジュール入口を含む', (t) => {
  const html = renderPreview(source, process.cwd());
  assert.doesNotMatch(html, /<\?|__preview\/version|location.reload|setInterval/);
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  assert.equal(dom.window.document.title, 'My Portal');
  assert.match(dom.window.document.querySelector('.eyebrow').textContent, /LOCAL PREVIEW/);
  assert.equal(dom.window.document.querySelector('script[type="module"]').getAttribute('src'), '/browser/main.js');
  assert.equal(dom.window.document.querySelectorAll('.external-link-icon').length >= 1, true);
});

test('プレビューは成功・空・不正行・設定エラー・通信エラーを通信せず再現する', (t) => {
  const dom = new JSDOM(renderPreview(source, process.cwd()));
  t.after(() => dom.window.close());
  const mock = dom.window.document.querySelector('script:not([src])').textContent;
  for (const scenario of ['', 'empty', 'invalid', 'config', 'error']) {
    let result;
    let failed = false;
    const context = vm.createContext({ URLSearchParams, location: { search: `?state=${scenario}` }, setTimeout(fn) { fn(); } });
    vm.runInContext(mock, context);
    const run = vm.runInContext('google.script.run', context);
    run.withSuccessHandler((value) => { result = value; }).withFailureHandler(() => { failed = true; }).getCatalog();
    if (scenario === 'error') assert.equal(failed, true);
    else if (scenario === 'config') assert.equal(result.ok, false);
    else if (scenario === 'invalid') assert.equal(result.issues.length, 1);
    else assert.equal(result.tools.length, scenario === 'empty' ? 0 : 4);
  }
});

test('ローカルのテーマを復元・保存し、一覧取得中の保存でも応答ハンドラを取り違えない', (t) => {
  const dom = new JSDOM(renderPreview(source, process.cwd()));
  t.after(() => dom.window.close());
  let stored = 'shikon';
  const pending = [];
  const context = vm.createContext({
    document: dom.window.document, URLSearchParams, location: { search: '' },
    localStorage: { getItem: () => stored, setItem(key, value) { assert.equal(key, 'portal-preview-theme'); stored = value; } },
    setTimeout(fn) { pending.push(fn); },
  });
  vm.runInContext(dom.window.document.querySelector('script:not([src])').textContent, context);
  assert.equal(dom.window.document.documentElement.dataset.theme, 'kuri');
  const run = vm.runInContext('google.script.run', context);
  let catalog;
  let theme;
  run.withSuccessHandler((value) => { catalog = value; }).getCatalog();
  run.withSuccessHandler((value) => { theme = value; }).saveTheme('sumi');
  pending.forEach((fn) => fn());
  assert.equal(catalog.tools.length, 4);
  assert.equal(theme.theme, 'sumi');
  assert.equal(stored, 'sumi');
});

test('表示設定モックは保存・復元・リセットを行い、テーマを保持する', (t) => {
  const settings = { PORTAL_NAME: 'Local Portal', PORTAL_ICON: 'L', PORTAL_HEADLINE: 'Local headline', PORTAL_DESCRIPTION: 'Local description' };
  const storage = { 'portal-preview-settings': JSON.stringify(settings), 'portal-preview-theme': 'kuri' };
  const dom = new JSDOM(renderPreview(source, process.cwd()));
  t.after(() => dom.window.close());
  const context = vm.createContext({
    document: dom.window.document, URLSearchParams, location: { search: '' }, setTimeout(fn) { fn(); },
    localStorage: { getItem: (key) => storage[key], setItem: (key, value) => { storage[key] = value; } },
  });
  vm.runInContext(dom.window.document.querySelector('script:not([src])').textContent, context);
  assert.equal(dom.window.document.querySelector('#setting-name').value, 'Local Portal');
  const run = vm.runInContext('google.script.run', context);
  let result;
  run.withSuccessHandler((value) => { result = value; }).savePortalSettings({ ...settings, PORTAL_NAME: 'Updated' });
  assert.equal(result.settings.PORTAL_NAME, 'Updated');
  assert.equal(JSON.parse(storage['portal-preview-settings']).PORTAL_NAME, 'Updated');
  run.withSuccessHandler((value) => { result = value; }).resetPortalSettings();
  assert.equal(result.settings.PORTAL_NAME, 'My Portal');
  assert.equal(storage['portal-preview-theme'], 'kuri');
});
