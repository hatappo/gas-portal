import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { browser, server, plain } from './helpers.mjs';

const themes = ['tsuyukusa', 'sakura', 'wakatake', 'yamabuki', 'ginnezu', 'tetsukon', 'sumi', 'kuri', 'fukamidori', 'daidai'];

test("Map legacy Shikon values to Kuri without rewriting storage until save", () => {
  const userProperties = { PORTAL_THEME: 'shikon' };
  const { context } = server({ userProperties });
  assert.equal(context.getPortalTheme_(), 'kuri');
  assert.equal(userProperties.PORTAL_THEME, 'shikon', 'Rendering must not rewrite storage');
  assert.deepEqual(plain(context.saveTheme('kuri')), { ok: true, theme: 'kuri' });
  assert.equal(userProperties.PORTAL_THEME, 'kuri');
});

test("Persist themes in User Properties without changing Script Properties", () => {
  const userProperties = {};
  const properties = { PORTAL_NAME: 'Example', PORTAL_THEME: 'not-used' };
  const template = { evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) };
  const { context } = server({ userProperties, properties,
    HtmlService: { createTemplateFromFile: () => template }, ScriptApp: { getScriptId: () => 'test' },
  });
  context.doGet();
  assert.equal(template.theme, 'auto');
  for (const theme of ['auto', ...themes]) {
    assert.deepEqual(plain(context.saveTheme(theme)), { ok: true, theme });
    context.doGet();
    assert.equal(template.theme, theme);
    assert.equal(userProperties.PORTAL_THEME, theme);
  }
  assert.deepEqual(properties, { PORTAL_NAME: 'Example', PORTAL_THEME: 'not-used' });
  assert.equal(server().context.getPortalTheme_(), 'auto', "Other users' stores must remain unchanged");
});

test("Reject unsupported themes, fall back for invalid stored values, and hide failure details", () => {
  const userProperties = { PORTAL_THEME: 'unknown' };
  const { context } = server({ userProperties });
  assert.equal(context.getPortalTheme_(), 'auto');
  for (const value of [null, 123, '', {}, '<script>', '__proto__', 'TSUYUKUSA']) {
    assert.deepEqual(plain(context.saveTheme(value)), { ok: false });
    assert.equal(userProperties.PORTAL_THEME, 'unknown');
  }
  const failed = server({ PropertiesService: { getUserProperties: () => ({ setProperty() { throw new Error('private-details'); } }) } });
  assert.deepEqual(plain(failed.context.saveTheme('sakura')), { ok: false });
  assert.doesNotMatch(JSON.stringify(failed.logs), /private-details/);
});

test("Provide an accessible icon tab and ten themes split evenly between light and dark", (t) => {
  const { dom, document, themeRequests } = browser((window) => { window.document.documentElement.dataset.theme = 'sumi'; });
  t.after(() => dom.window.close());
  const settings = document.querySelector('#tab-settings');
  assert.equal(settings.textContent, '');
  assert.equal(settings.getAttribute('aria-label'), '設定');
  settings.click();
  assert.equal(document.querySelector('#settings-panel').hidden, false);
  const groups = document.querySelectorAll('.theme-group');
  assert.equal(groups.length, 2);
  assert.deepEqual([...groups].map((group) => group.querySelectorAll('input').length), [5, 5]);
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

test("Restore the saved theme after failure and allow retry", (t) => {
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

test("Report theme save timeouts and ignore late responses", (t) => {
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

test("Maintain at least 4.5:1 contrast for text and selected labels in all ten themes", () => {
  const css = readFileSync('src/browser/styles.css', 'utf8');
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  themes.forEach((theme, index) => {
    const block = css.match(new RegExp(`\\[data-theme="${theme}"\\] \\{([^}]+)\\}`))[1];
    assert.match(block, new RegExp(`color-scheme: ${index < 5 ? 'light' : 'dark'}`));
    const colors = Object.fromEntries([...block.matchAll(/--([\w-]+): (#[\da-f]{6})/g)].map((match) => [match[1], match[2]]));
    const pairs = ['ink', 'muted', 'accent'].flatMap((text) => ['paper', 'surface', 'surface-soft'].map((surface) => [text, surface]));
    pairs.push(['on-theme', 'theme-color'], ['external-ink', 'external-bg'], ['warning-ink', 'warning-bg']);
    for (const [text, surface] of pairs) {
      const [low, high] = [luminance(colors[text]), luminance(colors[surface])].sort((a, b) => a - b);
      assert.ok((high + .05) / (low + .05) >= 4.5, `${theme}: ${text} / ${surface}`);
    }
  });
});


test("Follow system color changes only while automatic is selected, without saving resolved colors", (t) => {
  let onChange;
  const media = { matches: true, addEventListener(event, listener) { assert.equal(event, 'change'); onChange = listener; } };
  const { dom, document, themeRequests } = browser((window) => {
    window.matchMedia = (query) => query === '(prefers-color-scheme: dark)' ? media : { matches: false, addEventListener() {} };
  });
  t.after(() => dom.window.close());
  const theme = () => document.documentElement.dataset.theme;
  const selected = () => document.querySelector('input[name="portal-theme"]:checked').value;
  assert.equal(theme(), 'tetsukon');
  assert.equal(selected(), 'auto');
  media.matches = false;
  onChange();
  assert.equal(theme(), 'tsuyukusa');
  assert.equal(themeRequests.length, 0);
  document.querySelector('input[value="ginnezu"]').click();
  themeRequests.at(-1).success({ ok: true, theme: 'ginnezu' });
  media.matches = true;
  onChange();
  assert.equal(theme(), 'ginnezu');
  document.querySelector('input[value="auto"]').click();
  assert.equal(theme(), 'tetsukon');
  assert.equal(themeRequests.at(-1).theme, 'auto');
  themeRequests.at(-1).failure();
  assert.equal(theme(), 'ginnezu');
  assert.equal(selected(), 'ginnezu');
  document.querySelector('input[value="auto"]').click();
  themeRequests.at(-1).success({ ok: true, theme: 'auto' });
  media.matches = false;
  onChange();
  assert.equal(theme(), 'tsuyukusa');
  assert.equal(selected(), 'auto');
});

test("Use light mode when media queries are unavailable and preserve explicit saved themes", (t) => {
  const fallback = browser();
  const explicit = browser((window) => {
    window.document.documentElement.dataset.theme = 'daidai';
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
  });
  t.after(() => { fallback.dom.window.close(); explicit.dom.window.close(); });
  assert.equal(fallback.document.documentElement.dataset.theme, 'tsuyukusa');
  assert.equal(fallback.document.querySelector('input[value="auto"]').checked, true);
  assert.equal(explicit.document.documentElement.dataset.theme, 'daidai');
});
