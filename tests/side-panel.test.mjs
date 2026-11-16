import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { server, bundleModule } from './helpers.mjs';
import { normalizePortalUrl, embeddedPortalUrl, isReadyMessage, allowedPanelAncestor, READY_MESSAGE } from '../src/browser/side-panel-protocol.ts';
import { build } from '../lib/build.mjs';
import { init } from '../lib/init.mjs';
import { GAS_FILES } from '../lib/config.mjs';

const id = 'abcdefghijklmnopabcdefghijklmnop';
const nonce = 'a'.repeat(32);
const portalUrl = 'https://script.google.com/macros/u/1/s/test-deployment/exec?authuser=1#links';

test('Only deployed GAS URLs and supported account/route parameters can be saved', () => {
  assert.equal(normalizePortalUrl(' ' + portalUrl + ' '), portalUrl);
  for (const invalid of ['https://example.com', portalUrl.replace('/exec', '/dev'), portalUrl.replace('https:', 'http:'), portalUrl.replace('script.google.com', 'script.google.com.evil.test'), portalUrl.replace('https://', 'https://user:secret@'), portalUrl.replace('authuser=1', 'token=secret'), portalUrl.replace('#links', '#unknown')]) {
    assert.equal(normalizePortalUrl(invalid), null);
  }
  const embedded = new URL(embeddedPortalUrl(portalUrl, nonce));
  assert.equal(embedded.searchParams.get('authuser'), '1');
  assert.equal(embedded.hash, '#links');
  assert.equal(embedded.searchParams.get('panelNonce'), nonce);
  assert.equal(embedded.searchParams.get('sidePanel'), '1');
  assert.throws(() => embeddedPortalUrl(portalUrl, 'invalid'));
});

test('Readiness accepts only GAS origins and the current per-load nonce', () => {
  const data = { type: READY_MESSAGE, nonce };
  for (const origin of ['https://script.google.com', 'https://script.googleusercontent.com', 'https://abc-script.googleusercontent.com']) assert.ok(isReadyMessage(origin, data, nonce));
  for (const origin of ['https://evil.test', 'https://evil.googleusercontent.com', 'https://script.googleusercontent.com.evil.test', 'https://script.google.com/path', 'https://user:pass@script.google.com', 'null']) assert.equal(isReadyMessage(origin, data, nonce), false);
  assert.equal(isReadyMessage('https://script.google.com', { ...data, nonce: 'b'.repeat(32) }, nonce), false);
  assert.equal(isReadyMessage('https://script.google.com', { ...data, type: 'load' }, nonce), false);
  assert.equal(isReadyMessage('https://script.google.com', null, nonce), false);
});

test('Only the configured extension may be the top ancestor, with GAS-only intermediaries', () => {
  const origin = 'chrome-extension://' + id;
  assert.ok(allowedPanelAncestor([origin], [id]));
  assert.ok(allowedPanelAncestor(['https://script.google.com', origin], [id]));
  for (const ancestors of [[], ['https://evil.test', origin], [origin, 'https://evil.test'], ['chrome-extension://' + 'b'.repeat(32)]]) assert.equal(allowedPanelAncestor(ancestors, [id]), false);
  assert.equal(allowedPanelAncestor([origin], []), false);
});

test('The shared allowlist preserves the eight-file build contract without consumer ID configuration', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'portal-panel-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  init(root);
  const result = build(root);
  assert.deepEqual(result.files, GAS_FILES);
  assert.equal(result.files.length, 8);
  assert.ok(readFileSync(path.join(result.output, 'Code.js'), 'utf8').includes('SIDE_PANEL_EXTENSION_IDS'));
});

function gasFixture(extensionId = '') {
  const modes = [];
  const output = { setTitle() { return this; }, setFaviconUrl() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode(mode) { modes.push(mode); return this; } };
  const template = { evaluate: () => output };
  const fixture = server({ userProperties: { SIDE_PANEL_EXTENSION_IDS: extensionId }, HtmlService: { createTemplateFromFile: () => template, createHtmlOutput: content => ({ content }), XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' } }, ScriptApp: { getScriptId: () => 'test-script' } });
  return { ...fixture, modes, output, template };
}

test('Normal web requests retain frame protection; embedded requests require an allowlisted ID and a nonce', () => {
  const normal = gasFixture(id);
  assert.equal(normal.context.doGet(), normal.output);
  assert.deepEqual(normal.modes, []);
  assert.equal(normal.template.sidePanelHead, '');
  for (const [extensionId, panelNonce] of [['', nonce], [id, 'invalid'], [id, '']]) {
    const denied = gasFixture(extensionId);
    assert.match(denied.context.doGet({ parameter: { sidePanel: '1', panelNonce } }).content, /not configured/);
    assert.deepEqual(denied.calls, [], 'rejected before reading private catalog');
    assert.deepEqual(denied.modes, []);
  }
  const embedded = gasFixture(id);
  assert.equal(embedded.context.doGet({ parameter: { sidePanel: '1', panelNonce: nonce } }), embedded.output);
  assert.deepEqual(embedded.modes, ['ALLOWALL']);
  assert.match(embedded.template.sidePanelHead, /body\{visibility:hidden\}/);
  assert.ok(embedded.template.sidePanelHead.includes(id));
  assert.ok(embedded.template.sidePanelHead.includes(nonce));
});

test('The browser guard rejects unauthorized frames before startup and removes hidden content', async () => {
  const code = await bundleModule(`import '../src/shared/i18n.js'; import { allowSidePanel } from '../src/browser/side-panel-bridge.ts'; window.allowed = allowSidePanel();`);
  for (const [ancestors, expected] of [[['chrome-extension://' + id], true], [[], false], [['https://evil.test', 'chrome-extension://' + id], false]]) {
    const dom = new JSDOM(`<html lang="en"><head><style id="side-panel-guard">body{visibility:hidden}</style><meta name="portal-extensions" content="${id}"></head><body><button>Private controls</button></body></html>`, { runScripts: 'outside-only', url: 'https://abc-script.googleusercontent.com' });
    Object.defineProperty(dom.window.location, 'ancestorOrigins', { value: ancestors });
    dom.window.eval(code);
    assert.equal(dom.window.allowed, expected);
    assert.equal(dom.window.document.querySelector('#side-panel-guard'), null);
    assert.equal(Boolean(dom.window.document.querySelector('button')), expected);
    dom.window.close();
  }
});

test('Additional IDs are validated, deduplicated and saved only in User Properties', () => {
  const userProperties = { PORTAL_NAME: 'Keep me', SIDE_PANEL_EXTENSION_IDS: id };
  const { context } = server({ userProperties });
  const second = 'b'.repeat(32);
  const result = context.saveSidePanelExtensionIds(` ${id}\r\n${second}\n${id}\n`);
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.ids), [id, second]);
  assert.equal(userProperties.SIDE_PANEL_EXTENSION_IDS, id + '\n' + second);
  assert.equal(userProperties.PORTAL_NAME, 'Keep me');
  assert.equal(context.getPortalContent_(userProperties).sidePanelExtensionIds, id + '\n' + second);
  for (const input of [null, [id], { officialIds: [id] }, '<script>', 'z'.repeat(32), id + ',' + second, id.toUpperCase(), 'a'.repeat(4097), Array.from('abcdefghijk', c => c.repeat(32)).join('\n')]) {
    assert.equal(context.saveSidePanelExtensionIds(input).ok, false);
    assert.equal(userProperties.SIDE_PANEL_EXTENSION_IDS, id + '\n' + second, 'invalid writes preserve existing access');
  }
  assert.equal(context.saveSidePanelExtensionIds('').ok, true);
  assert.equal(userProperties.SIDE_PANEL_EXTENSION_IDS, '');
  assert.deepEqual(Array.from(context.PortalSidePanel.allowedIds('<script>')), []);
  assert.equal(context.getPortalContent_({ SIDE_PANEL_EXTENSION_IDS: '<script>' }).sidePanelExtensionIds, '');
});

test('Official IDs are merged with user IDs and cannot be removed by saving an empty list', () => {
  const { context } = server();
  const shared = readFileSync('src/shared/side-panel.js', 'utf8');
  assert.deepEqual(Array.from(context.PortalSidePanel.officialIds), [], 'no fictional store ID');
  // Simulate a future verified store release without adding an actual production ID.
  vm.runInContext(shared.replace('Object.freeze([])', `Object.freeze(["${id}"])`), context);
  assert.deepEqual(Array.from(context.PortalSidePanel.allowedIds(id + '\n' + 'b'.repeat(32))), [id, 'b'.repeat(32)]);
  assert.equal(context.saveSidePanelExtensionIds('').ok, true);
  assert.deepEqual(Array.from(context.PortalSidePanel.allowedIds('')), [id]);
  assert.deepEqual(Array.from(context.PortalSidePanel.allowedIds('bad')), [id]);
});

test('Saved IDs take effect on the next load without rebuilding or redeploying', () => {
  const fixture = gasFixture();
  const request = { parameter: { sidePanel: '1', panelNonce: nonce, extensionId: id } };
  assert.match(fixture.context.doGet(request).content, /not configured/, 'URL cannot grant access');
  fixture.context.saveSidePanelExtensionIds(id);
  assert.equal(fixture.context.doGet(request), fixture.output);
  fixture.context.saveSidePanelExtensionIds('');
  assert.match(fixture.context.doGet(request).content, /not configured/);
});

test('Readiness targets the actual validated parent, including the second allowed extension', async () => {
  const second = 'b'.repeat(32);
  const code = await bundleModule(`import '../src/shared/i18n.js'; import { allowSidePanel, notifySidePanelReady } from '../src/browser/side-panel-bridge.ts'; notifySidePanelReady(); window.allowed = allowSidePanel(); notifySidePanelReady();`);
  for (const parent of [id, second, 'c'.repeat(32)]) {
    const dom = new JSDOM(`<html lang="en"><head><meta name="portal-extensions" content="${id},${second}"><meta name="portal-panel-nonce" content="${nonce}"></head><body></body></html>`, { runScripts: 'outside-only', url: 'https://abc-script.googleusercontent.com' });
    const origin = 'chrome-extension://' + parent;
    Object.defineProperty(dom.window.location, 'ancestorOrigins', { value: ['https://script.google.com', origin] });
    const messages = [];
    dom.window.postMessage = (data, target) => messages.push({ data: JSON.parse(JSON.stringify(data)), target });
    dom.window.eval(code);
    assert.deepEqual(messages, parent === id || parent === second ? [{ data: { type: READY_MESSAGE, nonce }, target: origin }] : []);
    dom.window.close();
  }
});

test('Workspace deployment URLs preserve their domain, account and settings route', () => {
  const workspace = 'https://script.google.com/a/macros/clap-s.com/s/test-deployment/exec?authuser=1#settings/extension';
  assert.equal(normalizePortalUrl(workspace), workspace);
  const embedded = new URL(embeddedPortalUrl(workspace, nonce));
  assert.equal(embedded.pathname, '/a/macros/clap-s.com/s/test-deployment/exec');
  assert.equal(embedded.searchParams.get('authuser'), '1');
  assert.equal(embedded.hash, '#settings/extension');
  assert.equal(embedded.searchParams.get('panelNonce'), nonce);
  for (const invalid of [workspace.replace('/exec', '/dev'), workspace.replace('clap-s.com', '../evil'), workspace.replace('clap-s.com', '-clap-s.com'), workspace.replace('script.google.com', 'evil.test'), workspace.replace('authuser=1', 'token=secret')]) {
    assert.equal(normalizePortalUrl(invalid), null);
  }
});

test('The connection URL is supplied by GAS, including Workspace deployments and undeployed projects', () => {
  for (const url of ['https://script.google.com/macros/s/test/exec', 'https://script.google.com/a/macros/example.org/s/test/exec', 'https://script.google.com/macros/s/test/dev', null]) {
    const fixture = gasFixture(id);
    fixture.context.ScriptApp.getService = () => ({ getUrl: () => url });
    fixture.context.doGet();
    assert.equal(fixture.template.webAppUrl, url || '');
  }
});

test('Connection URL copying supports both languages, manual fallback and unavailable deployments', async () => {
  const code = await bundleModule(`import '../src/shared/i18n.js'; import { initializeSidePanelSettings } from '../src/browser/side-panel-settings.js'; initializeSidePanelSettings();`);
  const markup = readFileSync('src/Index.html', 'utf8').match(/<div class="side-panel-connection">[\s\S]*?(?=\s*<form id="side-panel-settings-form")/)[0];
  const validUrl = 'https://script.google.com/a/example.org/macros/s/test/exec';
  for (const language of ['en', 'ja']) {
    for (const mode of ['success', 'rejected', 'unsupported', 'preview', 'dev']) {
      const url = mode === 'preview' ? '' : mode === 'dev' ? validUrl.replace('/exec', '/dev') : validUrl;
      const dom = new JSDOM(`<html lang="${language}"><body>${markup.replace('<?= webAppUrl ?>', url)}</body></html>`, { runScripts: 'outside-only' });
      try {
        const writes = [];
        if (mode !== 'unsupported') Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async value => {
          writes.push(value);
          if (mode === 'rejected') throw new Error('NotAllowedError');
        } } });
        dom.window.eval(code);
        const input = dom.window.document.getElementById('side-panel-url');
        const copy = dom.window.document.getElementById('side-panel-copy-url');
        const status = dom.window.document.getElementById('side-panel-copy-status');
        if (mode === 'preview' || mode === 'dev') {
          assert.equal(copy.disabled, true);
          assert.equal(input.value, '');
          assert.match(dom.window.document.getElementById('side-panel-url-help').textContent, language === 'ja' ? /デプロイ済み/ : /deployed web app/);
          continue;
        }
        assert.equal(copy.disabled, false);
        assert.equal(input.readOnly, true);
        copy.click();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(writes, mode === 'unsupported' ? [] : [validUrl]);
        if (mode === 'success') {
          assert.equal(status.textContent, dom.window.PortalI18n.t('Copied', language));
        } else {
          assert.equal(dom.window.document.activeElement, input);
          assert.equal(input.selectionStart, 0);
          assert.equal(input.selectionEnd, validUrl.length);
          assert.match(status.textContent, /Ctrl\+C/);
        }
      } finally { dom.window.close(); }
    }
  }
});


test('Workspace URLs returned by GAS use the same domain validation in either path order', () => {
  for (const domain of ['example.org', 'work.example.co.jp', 'clap-s.com']) {
    for (const prefix of [`/a/${domain}/macros`, `/a/macros/${domain}`]) {
      const url = `https://script.google.com${prefix}/s/test-deployment/exec?authuser=1#settings/extension`;
      assert.equal(normalizePortalUrl(url), url);
      const embedded = new URL(embeddedPortalUrl(url, nonce));
      assert.equal(embedded.pathname, `${prefix}/s/test-deployment/exec`);
      assert.equal(embedded.searchParams.get('panelNonce'), nonce);
      for (const invalid of [url.replace('/exec', '/dev'), url.replace(domain, '-example.org'), url.replace(domain, 'example..org'), url.replace('script.google.com', 'script.google.com.evil.test'), url.replace('authuser=1', 'token=secret')]) {
        assert.equal(normalizePortalUrl(invalid), null);
      }
    }
  }
});
