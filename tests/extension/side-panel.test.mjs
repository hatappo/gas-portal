import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const output = path.resolve('extension/.output/chrome-mv3');
const portalUrl = 'https://script.google.com/a/macros/clap-s.com/s/test-deployment/exec#links';

test('Production permissions are limited to the panel, local settings, and GAS hosts', () => {
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions.toSorted(), ['sidePanel', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://script.google.com/*', 'https://*.googleusercontent.com/*']);
  assert.equal(manifest.content_scripts, undefined);
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

test('Unpacked extension saves only the URL, verifies readiness, reloads and restores its connection', { timeout: 60000 }, async t => {
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
  await page.getByLabel('GAS web app URL').fill('https://example.com');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  assert.match(await page.getByRole('alert').textContent(), /deployed GAS/);
  await page.getByLabel('GAS web app URL').fill(portalUrl);
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await page.locator('iframe').waitFor();
  const first = new URL(await page.locator('iframe').getAttribute('src'));
  assert.equal(first.searchParams.get('sidePanel'), '1');
  assert.match(first.searchParams.get('panelNonce'), /^[a-f0-9]{32}$/);
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.local.get(null)), { portalUrl });
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow != null);
  const outer = page.frame({ url: first.href });
  await outer.waitForLoadState();
  await page.frameLocator('iframe').frameLocator('iframe').locator('body').waitFor();
  const frame = page.frames().find(frame => frame.url().startsWith('https://abc-script.googleusercontent.com/'));
  assert.deepEqual(await frame.evaluate(() => Array.from(location.ancestorOrigins)), ['https://script.google.com', 'chrome-extension://' + id]);
  assert.match(await page.getByRole('status').textContent(), /Waiting/, 'load alone is not readiness');
  await frame.evaluate(() => top.postMessage({ type: 'gas-portal:side-panel-ready', nonce: 'wrong' }, '*'));
  assert.equal(await page.getByRole('status').count(), 1);
  await frame.evaluate(() => top.postMessage({ type: 'gas-portal:side-panel-ready', nonce: new URL(location.href).searchParams.get('panelNonce') }, '*'));
  await page.getByRole('status').waitFor({ state: 'detached' });
  await page.clock.install();
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.waitForFunction(old => document.querySelector('iframe').src !== old, first.href);
  await page.clock.runFor(16000);
  assert.match(await page.getByRole('status').textContent(), /Could not confirm/);
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open tab' }).click();
  const tab = await opened;
  await tab.waitForURL(portalUrl);
  await tab.close();
  await page.reload();
  await page.locator('iframe').waitFor();
  assert.equal(await page.getByLabel('GAS web app URL').count(), 0);
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByLabel('GAS web app URL').inputValue(), portalUrl);
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
  await page.getByLabel('GAS web app URL').fill('https://example.com');
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await select.selectOption('ja');
  await page.waitForFunction(() => document.documentElement.lang === 'ja');
  assert.match(await page.getByRole('alert').innerText(), /デプロイ済み/);
  assert.equal(await page.getByRole('button', { name: '設定', exact: true }).getAttribute('title'), '設定');
  await page.getByLabel('GASウェブアプリのURL').fill(portalUrl);
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
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.local.get(null)), { portalUrl, languagePreference: 'en' });
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
  await page.getByLabel('GAS web app URL').fill(portalUrl);
  await page.getByRole('button', { name: 'Save and connect' }).click();
  const iframe = page.locator('iframe');
  await iframe.waitFor();
  await iframe.evaluate(frame => { frame.dataset.identity = 'retained'; });
  const src = await iframe.getAttribute('src');
  assert.equal(await page.locator('header').count(), 0);
  assert.equal(await page.locator('.extension-name').innerText(), 'GAS Portal Side Panel');
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
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.storage.local.get(null)), { portalUrl });
  await page.screenshot({ path: '/tmp/gas-portal-extension-blackout.png' });
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(450);
  await toggle.dblclick();
  await iframe.waitFor({ state: 'visible' });
  assert.equal(await iframe.getAttribute('src'), src);
  assert.equal(await iframe.getAttribute('data-identity'), 'retained');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#portal-url').waitFor();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'true' && !document.querySelector('#privacy-toggle').disabled);
  assert.equal(await page.locator('#portal-url').isVisible(), false, 'Settings and its URL are concealed too');
  await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Enter');
  await page.locator('#portal-url').waitFor({ state: 'visible' });
  await toggle.dblclick();
  await page.waitForFunction(() => document.querySelector('#privacy-toggle').getAttribute('aria-pressed') === 'true' && !document.querySelector('#privacy-toggle').disabled);
  assert.equal(await page.locator('#portal-url').isVisible(), false, 'A double-click while visible must only hide');
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
  assert.equal(await page.locator('#portal-url').isVisible(), false);
  await toggle.dblclick();
  await page.getByRole('button', { name: '保存して接続' }).waitFor();
  await page.evaluate(() => { globalThis.chrome.storage.session.set = async () => { throw new Error('Write unavailable'); }; });
  await toggle.dblclick();
  await page.getByRole('alert').filter({ hasText: '暗転状態を保存できません' }).waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#portal-url').isVisible(), false);
  await toggle.dblclick();
  assert.equal(await page.locator('#portal-url').isVisible(), false, 'Failed reveal must not expose content');
});
