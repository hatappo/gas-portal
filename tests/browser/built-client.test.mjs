import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chromium } from 'playwright';

for (const locale of ['en-US', 'ja-JP']) {
test(`The packaged inline client survives document.write and initializes localized controls (${locale})`, { timeout: 30000 }, async t => {
  const client = readFileSync('dist/Client.html', 'utf8');
  // The observed deployment truncated a warning at https:. This models that
  // failure mode without claiming to reproduce Google's undocumented processor.
  const stripped = client.replace(/\/\/[^\r\n]*/g, '');
  assert.equal(stripped, client, 'Compiled JavaScript contains no raw line-comment markers');
  const preview = readFileSync('assets/preview/index.html', 'utf8');
  assert.ok(preview.includes(client));
  const connectionUrl = 'https://script.google.com/a/example.org/macros/s/' + 'long-deployment-'.repeat(20) + '/exec';
  const rendered = preview.replace(/(<textarea id="side-panel-url"[^>]*>)[\s\S]*?(<\/textarea>)/, `$1${connectionUrl}$2`);
  const html = rendered.replace(client, () => '<script>document.documentElement.lang = "en"; document.documentElement.dataset.languagePreference = "auto";</script>' + stripped);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ locale, viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === 'https://portal.test/'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' })
    : route.abort());
  await page.goto('https://portal.test/');
  await page.evaluate(html => { document.open(); document.write(html); document.close(); }, html);
  assert.deepEqual(errors, [], 'The generated scripts must initialize without errors');
  await page.waitForSelector('#directory[aria-busy="false"] .tool-card');
  await page.locator('#search').fill('Workplace guide');
  await page.locator('#tools a[href="https://example.com/#demo-guide"]').waitFor();
  await page.locator('#tab-actions').click();
  await page.locator('#actions-search').waitFor();
  await page.locator('#tab-settings').click();
  await page.locator('#setting-name').waitFor();
  const japanese = locale === 'ja-JP';
  assert.equal(await page.locator('#portal-settings-form .settings-save').innerText(), japanese ? '変更を保存' : 'Save changes');
  assert.equal(await page.locator('#reset-portal-settings').innerText(), japanese ? '既定値に戻す' : 'Restore defaults');
  assert.match(await page.locator('#intro-help').innerText(), japanese ? /見出し・メモ/ : /Leave the headline or notes/);
  await page.locator('#settings-tab-extension').click();
  await page.locator('#side-panel-extension-ids').waitFor();
  assert.ok(page.url().endsWith('#settings/extension'));
  assert.equal(await page.locator('#portal-settings-form').isVisible(), false);
  const input = page.locator('#side-panel-url');
  const url = await input.inputValue();
  assert.equal(url, connectionUrl + '?sidePanel=1&panelNonce={nonce}');
  assert.equal(await page.locator('#side-panel-copy-url').count(), 0);
  await input.click();
  assert.deepEqual(await input.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, url.length]);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await input.evaluate(el => el.tagName), 'TEXTAREA');
  assert.ok(await input.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1));

  assert.deepEqual(errors, []);
});
}
