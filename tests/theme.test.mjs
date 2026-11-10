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
  assert.equal(template.themeAttribute, 'data-theme="cerberus" data-color-scheme="auto"');
  for (const theme of ['auto', ...themes.all]) {
    assert.deepEqual(plain(context.saveTheme(theme)), { ok: true, theme });
    context.doGet();
    assert.equal(template.theme, theme);
    assert.equal(template.themeAttribute, context.PortalThemes.attributes(theme));
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
  assert.equal(withPreviewContent(html, { }), '<html data-theme="cerberus" data-color-scheme="auto">');
  assert.equal(withPreviewContent(html, { }, 'dracula'), '<html data-theme="dracula" data-color-scheme="auto">');
});

test('Choose Skeleton palettes and appearance independently, with one persisted preference', (t) => {
  const { dom, document, themeRequests } = browser();
  t.after(() => dom.window.close());
  document.getElementById('tab-settings').click();
  const choices = [...document.querySelectorAll('input[name="portal-theme"]')];
  assert.deepEqual(choices.map(input => input.value), themes.palettes);
  assert.equal(document.querySelector('input[value="cerberus"]').checked, true);
  for (const palette of themes.palettes.slice(1)) {
    const choice = document.querySelector(`input[name="portal-theme"][value="${palette}"]`);
    choice.click();
    assert.equal(document.documentElement.dataset.theme, palette);
    assert.equal(document.documentElement.dataset.colorScheme, 'auto');
    const request = themeRequests.at(-1);
    assert.equal(request.theme, palette);
    assert.equal(choice.disabled, true);
    request.success({ ok: true, theme: palette });
    assert.equal(choice.disabled, false);
  }
  for (const mode of ['dark', 'light', 'auto']) {
    document.querySelector(`input[name="portal-color-scheme"][value="${mode}"]`).click();
    assert.equal(document.documentElement.dataset.theme, 'wintry');
    assert.equal(document.documentElement.dataset.colorScheme, mode);
    const expected = mode === 'auto' ? 'wintry' : 'wintry-' + mode;
    assert.equal(themeRequests.at(-1).theme, expected);
    themeRequests.at(-1).success({ ok: true, theme: expected });
  }
});

test('Restore the saved theme after failure and allow retry', (t) => {
  const { dom, document, themeRequests } = browser();
  t.after(() => dom.window.close());
  assert.equal(document.documentElement.dataset.theme, 'cerberus', 'Auto has no attribute');
  assert.equal(document.querySelector('input[value="auto"]').checked, true);
  const choice = document.querySelector('input[value="dracula"]');
  for (const complete of [(request) => request.failure(), (request) => request.success({ ok: false }), (request) => request.success({ ok: true, theme: 'unknown' })]) {
    choice.click();
    complete(themeRequests.at(-1));
    assert.equal(document.documentElement.dataset.theme, 'cerberus');
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
  document.querySelector('input[value="modern"]').click();
  themeRequests[1].success({ ok: true, theme: 'modern' });
  themeRequests[0].success({ ok: true, theme: 'dracula' });
  assert.equal(document.documentElement.dataset.theme, 'modern');
});

test('Show the confirmed theme after a save timeout, so it can be selected again', (t) => {
  let timeout;
  const { dom, document, themeRequests } = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 15000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => dom.window.close());
  document.querySelector('input[value="mint"]').click();
  timeout();
  assert.equal(document.documentElement.dataset.theme, 'cerberus', 'Back to the saved auto theme');
  assert.equal(document.querySelector('input[value="auto"]').checked, true);
  themeRequests[0].success({ ok: true, theme: 'mint' });
  assert.equal(document.documentElement.dataset.theme, 'cerberus', 'A late response is ignored');
  document.querySelector('input[value="mint"]').click();
  assert.equal(themeRequests.length, 2, 'Selecting the same theme again sends a new save');
  themeRequests[1].success({ ok: true, theme: 'mint' });
  assert.equal(document.documentElement.dataset.theme, 'mint');
});

test('Import all official Skeleton palettes directly and validate appearance preferences', () => {
  const css = readFileSync('src/browser/themes.css', 'utf8');
  const imports = [...css.matchAll(/@skeletonlabs\/skeleton\/themes\/([a-z]+)/g)].map(match => match[1]);
  assert.deepEqual(imports, themes.palettes);
  assert.equal(imports.length, 24);
  assert.equal(css.includes('oklch('), false, 'Do not retain copied DaisyUI palette tables');
  const api = portalThemes();
  for (const palette of themes.palettes) for (const scheme of ['auto', 'light', 'dark']) {
    const value = api.preference(palette, scheme);
    assert.equal(api.isTheme(value), true);
    assert.deepEqual(plain(api.resolve(value)), { palette, scheme });
  }
  for (const invalid of ['lofi', 'night', 'cerberus-script', '<script>']) assert.equal(api.isTheme(invalid), false);
});

test('Both appearances keep readable contrast with official palettes and accessible control foregrounds', () => {
  // The portal uses primary only as a fill, never as text color, so primary-on-base is not checked.
  for (const name of [...themes.light, ...themes.dark]) {
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
    };
    for (const [pair, [text, surface, required = 4.5]] of Object.entries(pairs)) {
      const minimum = required;
      assert.ok(contrast(text, surface) >= minimum, `${name}: ${pair} = ${contrast(text, surface).toFixed(2)}`);
    }
  }
});

test('Muted action badges and selected chips retain readable text in every theme', () => {
  const accents = [...new Set(readFileSync('src/browser/tag-palette.js', 'utf8').match(/#[0-9a-f]{6}/g))];
  assert.equal(accents.length, 6);
  const linear = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  for (const name of [...themes.light, ...themes.dark]) {
    const { colors } = themeColors(name);
    for (const accent of [colors.primary, ...accents.map(linear)]) for (const amount of [.12, .2]) {
      assert.ok(contrast(colors['base-content'], mix(accent, colors['base-100'], amount)) >= 4.5, `${name} at ${amount}`);
    }
  }
});
