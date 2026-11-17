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
  assert.ok(link.closest('#settings-sources-panel'));
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

test('Select the bookmarklet on click or focus without a copy button or clipboard access', (t) => {
  const { dom, document } = browser(window => {
    Object.defineProperty(window.navigator, 'clipboard', { get() { return assert.fail('No clipboard access'); } });
  });
  t.after(() => dom.window.close());
  for (const id of ['settings-panel', 'settings-sources-panel']) document.getElementById(id).hidden = false;
  const code = document.getElementById('favicon-finder-code');
  code.dispatchEvent(new dom.window.Event('portal:disclosure-open', { bubbles: true }));
  code.focus();
  assert.deepEqual([code.selectionStart, code.selectionEnd], [0, code.value.length]);
  code.setSelectionRange(2, 2);
  code.click();
  assert.deepEqual([code.selectionStart, code.selectionEnd], [0, code.value.length]);
  assert.equal(document.getElementById('favicon-finder-copy'), null);
});
