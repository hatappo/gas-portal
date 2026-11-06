import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { browser } from './helpers.mjs';

/** Run the bookmarklet on a fake visited page and capture what it shows. */
function runOn(href, url, head = '') {
  const page = new JSDOM(`<!doctype html><html><head>${head}</head><body></body></html>`, { url, runScripts: 'outside-only' });
  const shown = [];
  page.window.prompt = (title, value) => { shown.push(['prompt', title, value]); };
  page.window.alert = (message) => { shown.push(['alert', message]); };
  page.window.eval(decodeURIComponent(href.slice('javascript:'.length)));
  page.window.close();
  return shown;
}

test('Offer the bookmarklet as a link and as copyable code', (t) => {
  const { dom, document } = browser();
  t.after(() => dom.window.close());
  const link = document.getElementById('favicon-finder-link');
  assert.ok(link.closest('#settings-tools-panel'));
  assert.match(link.href, /^javascript:/);
  assert.doesNotMatch(link.href, /[\n\r]/, 'Line breaks are percent-encoded');
  assert.equal(document.getElementById('favicon-finder-code').value, link.getAttribute('href'));
  assert.equal(link.draggable, true);
});

test('Pick the largest https icon a page declares, ignoring data and http icons', (t) => {
  const { dom, document } = browser();
  t.after(() => dom.window.close());
  const href = document.getElementById('favicon-finder-link').getAttribute('href');
  const shown = runOn(href, 'https://app.example.com/home?token=secret', `
    <link rel="icon" href="/small.png" sizes="16x16">
    <link rel="shortcut icon" href="https://cdn.example.com/medium.png" sizes="32x32">
    <link rel="apple-touch-icon" href="/apple.png">
    <link rel="icon" href="data:image/png;base64,AAAA" sizes="512x512">
    <link rel="icon" href="http://insecure.example.com/large.png" sizes="256x256">
    <link rel="mask-icon" href="/mask.svg" sizes="any">`);
  assert.deepEqual(shown, [['prompt', 'icon 列に書く Favicon の URL', 'https://app.example.com/apple.png']]);
  assert.deepEqual(runOn(href, 'https://app.example.com/', '<link rel="icon" href="/vector.svg" sizes="any"><link rel="icon" href="/x.png" sizes="192x192">'),
    [['prompt', 'icon 列に書く Favicon の URL', 'https://app.example.com/vector.svg']]);
});

test('Fall back to /favicon.ico on https pages and report pages without an https icon', (t) => {
  const { dom, document } = browser();
  t.after(() => dom.window.close());
  const href = document.getElementById('favicon-finder-link').getAttribute('href');
  assert.deepEqual(runOn(href, 'https://intranet.example.com:8443/app/'),
    [['prompt', 'icon 列に書く Favicon の URL', 'https://intranet.example.com:8443/favicon.ico']]);
  assert.deepEqual(runOn(href, 'http://localhost:3000/', '<link rel="icon" href="/favicon.png">'),
    [['alert', 'このページには https のアイコンが見つかりませんでした。']]);
});

test('Do not run the finder on the portal when the link is clicked', (t) => {
  const { dom, document } = browser();
  t.after(() => dom.window.close());
  dom.window.prompt = () => assert.fail('The finder must not run on the portal');
  const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  document.getElementById('favicon-finder-link').dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.match(document.getElementById('favicon-finder-status').textContent, /ドラッグ/);
});

test('Copy the code, or select it for manual copying when the clipboard is unavailable', async (t) => {
  const copied = [];
  const ok = browser((window) => {
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (text) => { copied.push(text); } } });
  });
  t.after(() => ok.dom.window.close());
  ok.document.getElementById('favicon-finder-copy').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copied, [ok.document.getElementById('favicon-finder-code').value]);
  assert.equal(ok.document.getElementById('favicon-finder-status').textContent, 'コピーしました');

  for (const clipboard of [undefined, { writeText: () => Promise.reject(new Error('denied')) }]) {
    const app = browser((window) => {
      if (clipboard) Object.defineProperty(window.navigator, 'clipboard', { value: clipboard });
    });
    t.after(() => app.dom.window.close());
    // The button is only reachable with Settings → Tools & Links open.
    for (const id of ['settings-panel', 'settings-tools-panel']) app.document.getElementById(id).hidden = false;
    const code = app.document.getElementById('favicon-finder-code');
    assert.equal(code.closest('.disclosure-content').getAttribute('aria-hidden'), 'true');
    app.document.getElementById('favicon-finder-copy').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(code.closest('.disclosure-content').getAttribute('aria-hidden'), 'false', 'Open the collapsed section to show the selection');
    assert.equal(app.document.activeElement, code);
    assert.deepEqual([code.selectionStart, code.selectionEnd], [0, code.value.length]);
    assert.match(app.document.getElementById('favicon-finder-status').textContent, /⌘C/);
  }
});

test('Style the copy button like the other secondary settings buttons', (t) => {
  const { dom, document } = browser();
  t.after(() => dom.window.close());
  const copy = document.getElementById('favicon-finder-copy');
  assert.equal(copy.className, document.getElementById('cancel-github').className);
  assert.ok(copy.parentElement.classList.contains('settings-form-actions'), 'Button sizing and borders apply only inside .settings-form-actions');
});
