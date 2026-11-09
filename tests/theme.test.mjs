import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { browser, server, plain } from './helpers.mjs';
import { contrast, mix, portalThemes, themeColors } from '../scripts/theme-colors.mjs';
import { withPreviewContent } from '../scripts/preview-project.mjs';

// Copy out of the vm realm so deepEqual compares plain arrays.
const themes = JSON.parse(JSON.stringify(portalThemes()));

test('Fall back to auto for names from the earlier palettes without rewriting storage', () => {
  for (const legacy of ['tsuyukusa', 'shikon', 'tetsukon']) {
    const userProperties = { PORTAL_THEME: legacy };
    const { context } = server({ userProperties });
    assert.equal(context.getPortalTheme_(), 'auto', legacy);
    assert.equal(userProperties.PORTAL_THEME, legacy, 'Rendering must not rewrite storage');
  }
});

test('Persist themes in User Properties and render data-theme only for explicit themes', () => {
  const userProperties = {};
  const properties = { PORTAL_NAME: 'Example', PORTAL_THEME: 'not-used' };
  const template = { evaluate: () => ({ setTitle() { return this; }, setFaviconUrl() { return this; }, addMetaTag() { return this; } }) };
  const { context } = server({ userProperties, properties,
    HtmlService: { createTemplateFromFile: () => template }, ScriptApp: { getScriptId: () => 'test' },
  });
  context.doGet();
  assert.equal(template.theme, 'auto');
  assert.equal(template.themeAttribute, '', 'Auto leaves the device color scheme to DaisyUI');
  for (const theme of ['auto', ...themes.all]) {
    assert.deepEqual(plain(context.saveTheme(theme)), { ok: true, theme });
    context.doGet();
    assert.equal(template.theme, theme);
    assert.equal(template.themeAttribute, theme === 'auto' ? '' : `data-theme="${theme}"`);
    assert.equal(userProperties.PORTAL_THEME, theme);
  }
  assert.deepEqual(properties, { PORTAL_NAME: 'Example', PORTAL_THEME: 'not-used' });
  assert.equal(server().context.getPortalTheme_(), 'auto', "Other users' stores must remain unchanged");
});

test('Reject unsupported themes, fall back for invalid stored values, and hide failure details', () => {
  const userProperties = { PORTAL_THEME: 'unknown' };
  const { context } = server({ userProperties });
  assert.equal(context.getPortalTheme_(), 'auto');
  for (const value of [null, 123, '', {}, '<script>', '__proto__', 'NORD', 'tsuyukusa', 'corporate']) {
    assert.deepEqual(plain(context.saveTheme(value)), { ok: false });
    assert.equal(userProperties.PORTAL_THEME, 'unknown');
  }
  const failed = server({ PropertiesService: { getUserProperties: () => ({ setProperty() { throw new Error('private-details'); } }) } });
  assert.deepEqual(plain(failed.context.saveTheme('dracula')), { ok: false });
  assert.doesNotMatch(JSON.stringify(failed.logs), /private-details/);
});

test('Render the theme attribute in previews the same way as GAS', () => {
  const html = '<html <?!= themeAttribute ?>>';
  assert.equal(withPreviewContent(html, { }), '<html >');
  assert.equal(withPreviewContent(html, { }, 'dracula'), '<html data-theme="dracula">');
});

test('Generate theme choices from the shared list, grouped by color scheme', (t) => {
  const { dom, document, themeRequests } = browser((window) => { window.document.documentElement.dataset.theme = 'dracula'; });
  t.after(() => dom.window.close());
  const settings = document.querySelector('#tab-settings');
  assert.equal(settings.textContent.trim(), '');
  assert.equal(settings.getAttribute('aria-label'), '設定');
  settings.click();
  assert.equal(document.querySelector('#settings-panel').hidden, false);
  const groups = [...document.querySelectorAll('.theme-group')];
  assert.deepEqual(groups.map((group) => group.querySelector('legend').textContent), ['ライト', 'ダーク']);
  assert.deepEqual(groups.map((group) => [...group.querySelectorAll('input')].map((input) => input.value)), [themes.light, themes.dark]);
  assert.equal(document.querySelector('input[value="nord"]').getAttribute('aria-label'), 'Nord');
  assert.equal(document.querySelector('input[value="nord"]').closest('label').querySelector('.theme-preview').dataset.theme, 'nord');
  assert.equal(document.querySelector('input[name="portal-theme"]:checked').value, 'dracula');
  for (const theme of [...themes.all, 'auto']) {
    const choice = document.querySelector(`input[value="${theme}"]`);
    choice.click();
    assert.equal(document.documentElement.getAttribute('data-theme'), theme === 'auto' ? null : theme);
    const request = themeRequests.at(-1);
    assert.equal(request.theme, theme);
    assert.equal(choice.disabled, true);
    request.success({ ok: true, theme });
    assert.equal(choice.disabled, false);
    assert.equal(document.querySelector('#theme-status').textContent, '保存しました');
  }
});

test('Restore the saved theme after failure and allow retry', (t) => {
  const { dom, document, themeRequests } = browser();
  t.after(() => dom.window.close());
  assert.equal(document.documentElement.hasAttribute('data-theme'), false, 'Auto has no attribute');
  assert.equal(document.querySelector('input[value="auto"]').checked, true);
  const choice = document.querySelector('input[value="dracula"]');
  for (const complete of [(request) => request.failure(), (request) => request.success({ ok: false }), (request) => request.success({ ok: true, theme: 'unknown' })]) {
    choice.click();
    complete(themeRequests.at(-1));
    assert.equal(document.documentElement.hasAttribute('data-theme'), false);
    assert.equal(choice.disabled, false);
    assert.match(document.querySelector('#theme-status').textContent, /保存できません/);
  }
  choice.click();
  themeRequests.at(-1).success({ ok: true, theme: 'dracula' });
  assert.equal(document.documentElement.dataset.theme, 'dracula');
});

test('Report theme save timeouts and ignore late responses', (t) => {
  let timeout;
  const { dom, document, themeRequests } = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 15000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => dom.window.close());
  document.querySelector('input[value="dracula"]').click();
  timeout();
  assert.match(document.querySelector('#theme-status').textContent, /再読み込み/);
  document.querySelector('input[value="night"]').click();
  themeRequests[1].success({ ok: true, theme: 'night' });
  themeRequests[0].success({ ok: true, theme: 'dracula' });
  assert.equal(document.documentElement.dataset.theme, 'night');
});

test('Show the confirmed theme after a save timeout, so it can be selected again', (t) => {
  let timeout;
  const { dom, document, themeRequests } = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 15000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => dom.window.close());
  document.querySelector('input[value="nord"]').click();
  timeout();
  assert.equal(document.documentElement.hasAttribute('data-theme'), false, 'Back to the saved auto theme');
  assert.equal(document.querySelector('input[value="auto"]').checked, true);
  themeRequests[0].success({ ok: true, theme: 'nord' });
  assert.equal(document.documentElement.hasAttribute('data-theme'), false, 'A late response is ignored');
  document.querySelector('input[value="nord"]').click();
  assert.equal(themeRequests.length, 2, 'Selecting the same theme again sends a new save');
  themeRequests[1].success({ ok: true, theme: 'nord' });
  assert.equal(document.documentElement.dataset.theme, 'nord');
});

test('Keep the DaisyUI theme list in styles.css in sync with the shared list', () => {
  const css = readFileSync('src/browser/styles.css', 'utf8');
  const declared = /@plugin "daisyui" \{[^}]*themes:\s*([^;]+);/.exec(css)[1].split(',').map((entry) => entry.trim());
  assert.deepEqual(declared.map((entry) => entry.split(/\s+/)[0]).sort(), [...themes.all].sort());
  assert.ok(declared.includes(`${themes.auto.light} --default`), 'Auto light is the default without data-theme');
  assert.ok(declared.includes(`${themes.auto.dark} --prefersdark`), 'Auto dark follows prefers-color-scheme');
  assert.deepEqual([...themes.light, ...themes.dark], themes.all);
});

test('Every theme is grouped by its own color scheme and keeps 4.5:1 contrast where the portal puts text', () => {
  // The portal uses primary only as a fill, never as text color, so primary-on-base is not checked.
  // "dark" is kept as DaisyUI's standard dark theme although its button text is about 4.1:1.
  const exceptions = { dark: { 'primary-content/primary': 4.1 } };
  for (const name of themes.all) {
    const { scheme, colors } = themeColors(name);
    assert.equal(scheme, themes.light.includes(name) ? 'light' : 'dark', name);
    const muted = (surface) => mix(colors['base-content'], colors[surface], 0.75);
    const pairs = {
      'base-content/base-100': [colors['base-content'], colors['base-100']],
      'base-content/base-200': [colors['base-content'], colors['base-200']],
      'base-content/base-300': [colors['base-content'], colors['base-300']],
      'base-content/tool-tag': [colors['base-content'], mix(colors.primary, colors['base-100'], 0.12)],
      'muted/base-100': [muted('base-100'), colors['base-100']],
      'muted/base-200': [muted('base-200'), colors['base-200']],
      'primary-content/primary': [colors['primary-content'], colors.primary],
      'neutral-content/neutral': [colors['neutral-content'], colors.neutral],
      'warning-content/warning': [colors['warning-content'], colors.warning],
      'error-content/error': [colors['error-content'], colors.error],
      // Outline of unselected toggle buttons (non-text contrast, 3:1).
      'toggle-border/base-100': [mix(colors['base-content'], colors['base-100'], 0.6), colors['base-100'], 3],
    };
    for (const [pair, [text, surface, required = 4.5]] of Object.entries(pairs)) {
      const minimum = exceptions[name]?.[pair] ?? required;
      assert.ok(contrast(text, surface) >= minimum, `${name}: ${pair} = ${contrast(text, surface).toFixed(2)}`);
    }
  }
});

test('Muted action badges and selected chips retain readable text in every theme', () => {
  const accents = [...new Set(readFileSync('src/browser/tag-palette.js', 'utf8').match(/#[0-9a-f]{6}/g))];
  assert.equal(accents.length, 6);
  const linear = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  for (const name of themes.all) {
    const { colors } = themeColors(name);
    for (const accent of [colors.primary, ...accents.map(linear)]) for (const amount of [.12, .2]) {
      assert.ok(contrast(colors['base-content'], mix(accent, colors['base-100'], amount)) >= 4.5, `${name} at ${amount}`);
    }
  }
});
