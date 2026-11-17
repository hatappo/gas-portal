import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const output = path.resolve('extension/.output/chrome-mv3');
const portalUrl = 'https://script.google.com/a/macros/clap-s.com/s/test-deployment/exec?sidePanel=1&panelNonce={nonce}#links';

test('Production permissions are limited to the panel, local settings, and GAS hosts', () => {
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions.toSorted(), ['sidePanel', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://script.google.com/*', 'https://*.googleusercontent.com/*']);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.declarative_net_request, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.match(manifest.content_security_policy.extension_pages, /frame-src https:/);
  assert.equal(manifest.version, JSON.parse(readFileSync('package.json', 'utf8')).version);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
});

test('Packaged icons cover toolbar and management sizes with the shared portal artwork', () => {
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.icons), ['16', '32', '48', '128']);
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = readFileSync(path.join(output, file));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
  assert.match(readFileSync(path.join(output, 'FONT-LICENSE.txt'), 'utf8'), /SIL OPEN FONT LICENSE/);
});

async function extensionPage(t, locale = 'en-US', width = 360) {
  const profile = mkdtempSync(path.join(tmpdir(), 'portal-extension-browser-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width, height: 800 }, locale, args: ['--disable-extensions-except=' + output, '--load-extension=' + output] });
  t.after(async () => { await context.close(); rmSync(profile, { recursive: true, force: true }); });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto('chrome-extension://' + id + '/sidepanel.html');
  return { page, context, id };
}

async function assertSavedPage(page, language) {
  const saved = await page.evaluate(() => globalThis.chrome.storage.local.get(null));
  assert.deepEqual(Object.keys(saved).sort(), language ? ['languagePreference', 'panelConfig'] : ['panelConfig']);
  if (language) assert.equal(saved.languagePreference, language);
  const config = saved.panelConfig;
  assert.equal(config.pages.length, 1);
  assert.equal(config.pages[0].url, portalUrl);
  assert.equal(config.pages[0].parameterSetId, undefined);
  assert.equal(config.activePageId, config.pages[0].id);
  assert.equal(config.parameterSets, undefined);
}

test('Unpacked extension saves page configuration, expands URL templates, reloads and restores its connection', { timeout: 60000 }, async t => {
  const { page, context, id } = await extensionPage(t);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep authentication and network entirely mocked; this does not claim Google sign-in works.
  await context.route('https://**/*', route => {
    const request = new URL(route.request().url());
    const body = request.hostname === 'script.google.com'
      ? '<!doctype html><iframe src="https://abc-script.googleusercontent.com/panel?panelNonce=' + request.searchParams.get('panelNonce') + '"></iframe>'
      : '<!doctype html><body>Mock portal</body>';
    return route.fulfill({ contentType: 'text/html', body });
  });
  await page.goto('chrome-extension://' + id + '/sidepanel.html');
  await page.getByLabel('Page URL').fill('http://example.com');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  assert.match(await page.getByRole('alert').textContent(), /HTTPS/);
  await page.getByLabel('Page URL').fill(portalUrl);
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.locator('iframe').waitFor();
  const first = new URL(await page.locator('iframe').getAttribute('src'));
  assert.equal(first.searchParams.get('sidePanel'), '1');
  assert.match(first.searchParams.get('panelNonce'), /^[a-f0-9]{32}$/);
  await assertSavedPage(page);
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow != null);
  const outer = page.frame({ url: first.href });
  await outer.waitForLoadState();
  await page.frameLocator('iframe').frameLocator('iframe').locator('body').waitFor();
  const frame = page.frames().find(frame => frame.url().startsWith('https://abc-script.googleusercontent.com/'));
  assert.deepEqual(await frame.evaluate(() => Array.from(location.ancestorOrigins)), ['https://script.google.com', 'chrome-extension://' + id]);
  assert.equal(await page.getByRole('status').count(), 0, 'No site-specific readiness handshake');
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.waitForFunction(old => document.querySelector('iframe').src !== old, first.href);
  const openedUrl = await page.locator('iframe').getAttribute('src');
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open tab' }).click();
  const tab = await opened;
  await tab.waitForURL(openedUrl);
  await tab.close();
  await page.reload();
  await page.locator('iframe').waitFor();
  assert.equal(await page.getByLabel('Page URL').count(), 0);
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByLabel('Page URL').inputValue(), portalUrl);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/gas-portal-extension-setup.png', fullPage: true });
});

test('Japanese setup remains usable at the narrowest panel width', { timeout: 30000 }, async t => {
  const { page } = await extensionPage(t, 'ja-JP', 320);
  await page.getByRole('button', { name: '保存して接続', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/gas-portal-extension-setup-ja.png', fullPage: true });
});


test('Extension language defaults to Auto, persists independently and keeps the portal iframe mounted', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t, 'en-US', 320);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Mock portal</p>' }));
  const select = page.locator('#extension-language');
  await select.waitFor();
  assert.equal(await select.inputValue(), 'auto');
  await page.getByLabel('Page URL').fill('http://example.com');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await select.selectOption('ja');
  await page.waitForFunction(() => document.documentElement.lang === 'ja');
  assert.match(await page.getByRole('alert').innerText(), /HTTPS/);
  assert.equal(await page.getByRole('button', { name: '設定', exact: true }).getAttribute('title'), '設定');
  await page.getByLabel('画面のURL').fill(portalUrl);
  await page.getByRole('button', { name: '保存して接続' }).click();
  await page.locator('iframe').waitFor();
  await page.locator('iframe').evaluate(frame => { frame.dataset.identity = 'preserved'; });
  const frameUrl = await page.locator('iframe').getAttribute('src');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await select.selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('iframe').waitFor({ state: 'visible' });
  assert.equal(await page.locator('iframe').getAttribute('src'), frameUrl);
  assert.equal(await page.locator('iframe').getAttribute('data-identity'), 'preserved');
  await page.reload();
  await page.locator('iframe').waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await select.inputValue(), 'en');
  await select.selectOption('auto');
  await page.waitForFunction(() => document.getElementById('extension-language-status').textContent === 'Saved');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { value: ['ja-JP'], configurable: true });
    window.dispatchEvent(new Event('languagechange'));
  });
  await page.waitForFunction(() => document.documentElement.lang === 'ja');
  await select.selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.evaluate(() => window.dispatchEvent(new Event('languagechange')));
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await assertSavedPage(page, 'en');
  assert.equal(await page.locator('footer button svg:visible').count(), 4);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '/tmp/gas-portal-extension-settings-en.png', fullPage: true });
});

test('A failed language save keeps the previous preference and shows localized feedback', { timeout: 30000 }, async t => {
  const { page } = await extensionPage(t, 'ja-JP');
  await page.getByRole('button', { name: '保存して接続' }).waitFor();
  await page.evaluate(() => { globalThis.chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); }; });
  await page.locator('#extension-language').selectOption('en');
  await page.waitForFunction(() => document.getElementById('extension-language-status').textContent.includes('保存できません'));
  assert.equal(await page.locator('#extension-language').inputValue(), 'auto');
  assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.local.get(null)), {});
});

test('Footer hides on one activation and restores on two, preserving the mounted portal', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t, 'en-US', 320);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><input value="Private content">' }));
  await page.getByLabel('Page URL').fill(portalUrl);
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const iframe = page.locator('iframe');
  await iframe.waitFor();
  await iframe.evaluate(frame => { frame.dataset.identity = 'retained'; });
  const src = await iframe.getAttribute('src');
  assert.equal(await page.locator('header').count(), 0);
  assert.equal(await page.locator('.extension-name').innerText(), 'Alcove');
  const footer = await page.locator('footer').boundingBox();
  assert.equal(Math.round(footer.y + footer.height), 800);
  const toggle = page.locator('#privacy-toggle');
  assert.equal(await page.locator('footer nav button').first().getAttribute('id'), 'privacy-toggle');
  await page.mouse.move(0, 0);
  assert.equal(await toggle.locator('.privacy-current').isVisible(), true);
  assert.equal(await toggle.locator('.privacy-action').isVisible(), false);
  await toggle.hover();
  assert.equal(await toggle.locator('.privacy-current').isVisible(), false);
  assert.equal(await toggle.locator('.privacy-action').isVisible(), true);
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'true' && !document.querySelector('#privacy-toggle').disabled);
  assert.equal(await page.locator('.panel-body').evaluate(el => el.inert), true);
  assert.equal(await iframe.isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Open tab', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('.panel-content').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.session.get(null)), { privacyMode: true });
  await assertSavedPage(page);
  await page.screenshot({ path: '/tmp/gas-portal-extension-blackout.png' });
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(450);
  await toggle.dblclick();
  await iframe.waitFor({ state: 'visible' });
  assert.equal(await iframe.getAttribute('src'), src);
  assert.equal(await iframe.getAttribute('data-identity'), 'retained');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.page-url').waitFor();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'true' && !document.querySelector('#privacy-toggle').disabled);
  assert.equal(await page.locator('.page-url').isVisible(), false, 'Settings and its URL are concealed too');
  await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Enter');
  await page.locator('.page-url').waitFor({ state: 'visible' });
  await toggle.dblclick();
  await page.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'true' && !document.querySelector('#privacy-toggle').disabled);
  assert.equal(await page.locator('.page-url').isVisible(), false, 'A double-click while visible must only hide');
});

test('Reopening restores blackout without briefly showing content and synchronizes other panels', { timeout: 30000 }, async t => {
  const { page, context, id } = await extensionPage(t);
  await page.getByRole('button', { name: 'Save and connect' }).waitFor();
  await page.locator('#privacy-toggle').dblclick();
  await page.waitForFunction(async () => (await globalThis.chrome.storage.session.get('privacyMode')).privacyMode === true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.addInitScript(() => {
    globalThis.visibleBeforeRestore = false;
    const sample = () => {
      const body = document.querySelector('.panel-body');
      if (body && getComputedStyle(body).visibility !== 'hidden') globalThis.visibleBeforeRestore = true;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await reopened.goto('chrome-extension://' + id + '/sidepanel.html');
  await reopened.waitForFunction(() => !document.querySelector('#privacy-toggle')?.disabled);
  assert.equal(await reopened.locator('#privacy-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await reopened.evaluate(() => globalThis.visibleBeforeRestore), false);
  const other = await context.newPage();
  await other.goto('chrome-extension://' + id + '/sidepanel.html');
  await other.waitForFunction(() => !document.querySelector('#privacy-toggle')?.disabled);
  assert.equal(await other.locator('.panel-body').evaluate(el => el.inert), true);
  await reopened.locator('#privacy-toggle').dblclick();
  await other.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'false');
  await other.getByRole('button', { name: 'Save and connect' }).waitFor();
});

test('Session read and write failures keep content black until explicit successful recovery', { timeout: 30000 }, async t => {
  const { page } = await extensionPage(t, 'ja-JP');
  await page.addInitScript(() => {
    globalThis.chrome.storage.session.get = async () => { throw new Error('Session unavailable'); };
  });
  await page.reload();
  await page.getByRole('alert').filter({ hasText: '暗転状態を読み込めません' }).waitFor();
  const toggle = page.locator('#privacy-toggle');
  assert.equal(await page.locator('.page-url').isVisible(), false);
  await toggle.dblclick();
  await page.getByRole('button', { name: '保存して接続' }).waitFor();
  await page.evaluate(() => { globalThis.chrome.storage.session.set = async () => { throw new Error('Write unavailable'); }; });
  await toggle.dblclick();
  await page.getByRole('alert').filter({ hasText: '暗転状態を保存できません' }).waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.page-url').isVisible(), false);
  await toggle.dblclick();
  assert.equal(await page.locator('.page-url').isVisible(), false, 'Failed reveal must not expose content');
});

test('Multiple URL-only pages switch in the footer and reload only the active frame', { timeout: 60000 }, async t => {
  const { page, context } = await extensionPage(t, 'en-US', 320);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Generic page</p>' }));
  await page.getByLabel('Page name', { exact: true }).fill('Docs');
  await page.getByLabel('Page URL', { exact: true }).fill('https://example.com/docs?mode=compact&request={nonce}#intro');
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Notes');
  await page.getByLabel('Page URL', { exact: true }).nth(1).fill('https://example.org/notes?request={nonce}');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const iframe = page.locator('iframe:not([hidden])');
  await iframe.waitFor();
  const first = new URL(await iframe.getAttribute('src'));
  assert.equal(first.searchParams.get('mode'), 'compact');
  assert.match(first.searchParams.get('request'), /^[a-f0-9]{32}$/);
  assert.equal(first.hash, '#intro');
  assert.equal(await page.getByRole('status').count(), 0, 'Generic pages do not wait for a GAS handshake');
  const chooser = page.getByRole('combobox', { name: 'Switch page' });
  await chooser.selectOption({ label: 'Notes' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src.startsWith('https://example.org/'));
  assert.equal(await iframe.count(), 1);
  assert.equal(await page.locator('iframe').count(), 2);
  assert.notEqual(new URL(await iframe.getAttribute('src')).searchParams.get('request'), first.searchParams.get('request'));
  await page.reload();
  await iframe.waitFor();
  assert.ok((await iframe.getAttribute('src')).startsWith('https://example.org/'));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Page URL', { exact: true }).nth(1).fill('https://example.org/notes?mode=relaxed');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src === 'https://example.org/notes?mode=relaxed');
  await iframe.evaluate(el => { el.dataset.old = 'true'; });
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('iframe:not([hidden])')?.dataset.old);
  assert.equal(await iframe.getAttribute('src'), 'https://example.org/notes?mode=relaxed', 'Reload remounts even without a nonce');
  await chooser.selectOption({ label: 'Docs' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src.startsWith('https://example.com/docs?mode=compact&request='));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const footer = await page.locator('footer').boundingBox();
  assert.ok(footer.height <= 45, 'The selector must not grow the footer to two rows');
  await page.screenshot({ path: '/tmp/alcove-pages.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: '/tmp/alcove-settings.png', fullPage: true });
  await page.getByRole('button', { name: 'Remove page Notes' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.settings-card').length === 1);
  // Removing the tall card changes scrolling and the button's hit-test position.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.waitForFunction(() => document.querySelector('.page-switcher')?.options.length === 1);
  await iframe.waitFor({ state: 'visible' });
  assert.equal(await chooser.locator('option').count(), 1);
});

test('Legacy URL is restored and failed configuration saves keep the draft and current page intact', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t);
  await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Portal</p>' }));
  await page.evaluate(url => globalThis.chrome.storage.local.set({ portalUrl: url }), portalUrl);
  await page.reload();
  await page.locator('iframe').waitFor();
  const src = await page.locator('iframe').getAttribute('src');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).fill('My portal');
  // Let Chromium finish hiding the cross-origin frame before clicking through its old surface.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => { globalThis.chrome.storage.local.set = async () => { throw new Error('Unavailable'); }; });
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Page name', { exact: true }).inputValue(), 'My portal');
  assert.equal(await page.locator('iframe').getAttribute('src'), src);
  assert.equal(await page.getByRole('combobox', { name: 'Switch page' }).locator('option:checked').innerText(), 'GAS Portal');
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.local.get(null)), { portalUrl });
});


test('Settings exposes a selectable extension ID and its close button preserves the page', { timeout: 30000 }, async t => {
  const { page, context, id } = await extensionPage(t);
  await context.route('https://**/*', route => route.fulfill({ body: '<p>Example</p>', contentType: 'text/html' }));
  const field = page.getByLabel('Extension ID', { exact: true });
  await field.click();
  assert.equal(await field.inputValue(), id);
  assert.deepEqual(await field.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, id.length]);
  assert.equal(await page.getByText('GAS Portal connection', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Query parameter sets', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByText('No pages yet.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByLabel('Page URL').fill('https://example.com/');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const frame = page.locator('iframe');
  await frame.waitFor();
  await frame.evaluate(el => { el.dataset.identity = 'retained'; });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  // Wait for the hidden cross-origin surface to leave Chromium's hit-test regions.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: 'Close settings' }).click();
  await frame.waitFor({ state: 'visible' });
  assert.equal(await frame.getAttribute('data-identity'), 'retained');
});

test('Page cards support drag and keyboard reordering, persist order, and wrap long URLs', { timeout: 60000 }, async t => {
  const { page, context } = await extensionPage(t, 'en-US', 600);
  await context.route('https://**/*', route => route.fulfill({ body: '<p>Mock page</p>', contentType: 'text/html' }));
  await page.getByRole('heading', { name: 'Alcove settings', exact: true }).waitFor();
  assert.ok(await page.locator('#extension-id').evaluate(el => el.clientWidth < el.parentElement.clientWidth));
  assert.ok(await page.locator('#extension-language').evaluate(el => el.clientWidth < el.parentElement.clientWidth));
  const longUrl = 'https://example.com/' + 'long-path-'.repeat(35) + '?token={nonce}';
  await page.getByLabel('Page name', { exact: true }).fill('First');
  await page.getByLabel('Page URL', { exact: true }).fill(longUrl);
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Second');
  await page.getByLabel('Page URL', { exact: true }).nth(1).fill('https://example.org/');
  // Bring both cards into view for a real HTML drag-and-drop gesture.
  await page.setViewportSize({ width: 600, height: 1200 });
  const handle = page.getByRole('button', { name: 'Reorder page Second', exact: true });
  await handle.dragTo(page.locator('.settings-card').first());
  assert.deepEqual(await page.getByLabel('Page name', { exact: true }).evaluateAll(inputs => inputs.map(input => input.value)), ['Second', 'First']);
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await page.getByLabel('Page name', { exact: true }).evaluateAll(inputs => inputs.map(input => input.value)), ['First', 'Second']);
  await page.keyboard.press('ArrowUp');
  assert.deepEqual(await page.getByLabel('Page name', { exact: true }).evaluateAll(inputs => inputs.map(input => input.value)), ['Second', 'First']);
  await page.setViewportSize({ width: 320, height: 800 });
  const url = page.getByLabel('Page URL', { exact: true }).nth(1);
  assert.equal(await url.evaluate(el => el.tagName), 'TEXTAREA');
  assert.ok(await url.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: '/tmp/alcove-wrap-reorder.png', fullPage: true });
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.locator('iframe').waitFor();
  assert.deepEqual(await page.locator('.page-switcher option').allTextContents(), ['Second', 'First']);
  await page.reload();
  await page.locator('iframe').waitFor();
  assert.deepEqual(await page.locator('.page-switcher option').allTextContents(), ['Second', 'First']);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Page URL', { exact: true }).first().fill('chrome://extensions/');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.getByRole('alert').filter({ hasText: 'Chrome internal pages' }).waitFor();
});

test('Blank page names stay editable and use the URL domain in the chooser and frame title', { timeout: 30000 }, async t => {
  const { page, context } = await extensionPage(t);
  await context.route('https://**/*', route => route.fulfill({ body: '<title>A different title</title><p>Example</p>', contentType: 'text/html' }));
  const name = page.getByLabel('Page name', { exact: true });
  assert.equal(await name.inputValue(), '');
  await page.getByLabel('Page URL', { exact: true }).fill('https://example.org/path');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const frame = page.locator('iframe');
  await frame.waitFor();
  assert.equal(await frame.getAttribute('title'), 'example.org');
  assert.deepEqual(await page.locator('.page-switcher option').allTextContents(), ['example.org']);
  await page.reload();
  await frame.waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await name.inputValue(), '');
  await page.getByLabel('Page URL', { exact: true }).fill('https://other.example/path');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.waitForFunction(() => document.querySelector('iframe')?.title === 'other.example');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await name.fill('My page');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.waitForFunction(() => document.querySelector('iframe')?.title === 'My page');
});

test('Visited pages keep their document state; reload, URL edits and deletion affect only the selected page', { timeout: 60000 }, async t => {
  const { page, context } = await extensionPage(t);
  const requests = [];
  await context.route('https://**/*', route => {
    requests.push(route.request().url());
    return route.fulfill({ body: '<!doctype html><input aria-label="Draft"><p>Page</p>', contentType: 'text/html' });
  });
  await page.getByLabel('Page name', { exact: true }).fill('One');
  await page.getByLabel('Page URL', { exact: true }).fill('https://one.example/?nonce={nonce}');
  await page.getByRole('button', { name: 'Add page', exact: true }).click();
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Two');
  await page.getByLabel('Page URL', { exact: true }).nth(1).fill('https://two.example/?nonce={nonce}');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const active = page.locator('iframe:not([hidden])');
  const draft = page.frameLocator('iframe:not([hidden])').getByLabel('Draft');
  await draft.fill('First draft');
  const firstUrl = await active.getAttribute('src');
  await active.evaluate(el => { el.dataset.identity = 'one'; });
  const chooser = page.getByRole('combobox', { name: 'Switch page' });
  await chooser.selectOption({ label: 'Two' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.title === 'Two');
  await draft.fill('Second draft');
  assert.equal(requests.length, 2, 'Only visited pages load');
  const secondUrl = await active.getAttribute('src');
  await chooser.selectOption({ label: 'One' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.title === 'One');
  assert.equal(await draft.inputValue(), 'First draft');
  assert.equal(await active.getAttribute('src'), firstUrl);
  assert.equal(await active.getAttribute('data-identity'), 'one');
  assert.equal(await page.locator('iframe[hidden]').evaluate(el => el.inert), true);
  assert.equal(requests.length, 2, 'Switching back does not request the document again');
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.waitForFunction(old => document.querySelector('iframe:not([hidden])')?.src !== old, firstUrl);
  await draft.waitFor();
  assert.equal(await draft.inputValue(), '');
  assert.equal(requests.length, 3);
  await chooser.selectOption({ label: 'Two' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.title === 'Two');
  assert.equal(await draft.inputValue(), 'Second draft');
  assert.equal(await active.getAttribute('src'), secondUrl);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByLabel('Page name', { exact: true }).nth(1).fill('Renamed');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await active.waitFor();
  assert.equal(await draft.inputValue(), 'Second draft');
  assert.equal(requests.length, 3, 'Saving labels preserves all documents');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByLabel('Page URL', { exact: true }).first().fill('https://changed.example/');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await active.waitFor();
  assert.equal(await page.locator('iframe').count(), 1, 'An edited inactive page is unloaded, not eagerly fetched');
  assert.equal(await draft.inputValue(), 'Second draft');
  await chooser.selectOption({ label: 'One' });
  await page.waitForFunction(() => document.querySelector('iframe:not([hidden])')?.src === 'https://changed.example/');
  await draft.waitFor();
  assert.equal(await active.getAttribute('src'), 'https://changed.example/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: 'Remove page Renamed' }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await active.waitFor();
  assert.equal(await page.locator('iframe').count(), 1);
  assert.equal(await active.getAttribute('src'), 'https://changed.example/');
});
