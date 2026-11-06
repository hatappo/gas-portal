import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

let server, browser, base;
before(async () => {
  server = await createServer({ configFile: fileURLToPath(new URL('../../vite.config.mjs', import.meta.url)), server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  base = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await server?.close(); });

async function pageFor(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The smoke suite uses only the local fixture, including its image fallbacks.
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.goto(base);
  await page.waitForSelector('#directory[aria-busy="false"] .tool-card');
  return page;
}

test('Tabs preserve drafts and history; defaults only apply after saving', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await page.locator('#tab-tools').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.activeElement.id === 'tab-actions');
  await page.locator('#tab-settings').click();
  await page.locator('#setting-name').fill('Draft portal');
  await page.locator('#settings-tab-tools').click();
  await page.locator('#settings-tools-panel').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('#settings-appearance-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#setting-name').inputValue(), 'Draft portal');
  await page.locator('#portal-settings-form [type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('.brand-name').textContent === 'Draft portal');
  await page.locator('#reset-portal-settings').click();
  assert.equal(await page.locator('#setting-name').inputValue(), 'My Portal');
  assert.equal(await page.locator('.brand-name').textContent(), 'Draft portal');
  await page.locator('#setting-headline').fill('');
  await page.locator('#setting-description').fill('');
  await page.locator('#portal-settings-form [type="submit"]').click();
  await page.locator('.intro').waitFor({ state: 'hidden' });
  await page.reload();
  await page.locator('#setting-name').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#setting-name').inputValue(), 'My Portal');
  assert.equal(await page.locator('#setting-headline').inputValue(), '');
});

test('Disclosure keyboard operation keeps closed content inert and respects reduced motion', async t => {
  const page = await pageFor(t);
  await page.locator('#tab-settings').click();
  await page.locator('#settings-tab-actions').click();
  const trigger = page.locator('.github-pat-help .disclosure-trigger');
  const content = page.locator('.github-pat-help .disclosure-content');
  const body = page.locator('.github-pat-help .disclosure-body');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.github-pat-help .disclosure-trigger').getAttribute('aria-expanded') === 'true');
  assert.notEqual(await body.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.keyboard.press('Space');
  assert.equal(await content.getAttribute('inert'), '');
  await content.locator('a').first().evaluate(el => el.focus());
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await body.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await trigger.click();
  assert.ok((await body.boundingBox()).height > 0);
});

for (const theme of ['lofi', 'dracula']) {
  test(`Cards retain natural heights and row spacing in ${theme}`, async t => {
    const page = await pageFor(t, { reducedMotion: 'reduce' });
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1280, 800, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const result = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.tool-card')];
        cards[0].querySelector('.tool-description').textContent = 'Short.';
        cards[1].querySelector('.tool-description').textContent = 'Long content that must not stretch adjacent cards. '.repeat(16);
        const bounds = cards.map(card => { const r = card.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; });
        const cols = getComputedStyle(document.getElementById('tools')).gridTemplateColumns.split(' ').length;
        const tag = cards[0].querySelector('.tool-tag');
        return { bounds, cols, overflow: document.documentElement.scrollWidth > innerWidth,
          tagFill: getComputedStyle(tag).backgroundColor, cardFill: getComputedStyle(cards[0]).backgroundColor };
      });
      assert.equal(result.overflow, false, `${width}px overflow`);
      assert.notEqual(result.tagFill, result.cardFill);
      if (result.cols > 1) {
        assert.equal(result.bounds[0].top, result.bounds[1].top);
        assert.ok(result.bounds[1].height > result.bounds[0].height + 80);
        assert.ok(result.bounds[result.cols].top > Math.max(...result.bounds.slice(0, result.cols).map(r => r.bottom)));
      }
    }
  });
}

test('GitHub and Slack share one refresh control; Slack settings work on a narrow screen', async t => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.locator('#tab-actions').click();
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('#actions-panel button#refresh-actions').count(), 1);
  assert.ok(await page.locator('.action-service', { hasText: 'GitHub' }).count() > 0);
  assert.equal(await page.locator('.action-service', { hasText: 'Slack' }).count(), 2);
  assert.match(await page.locator('.action-item-list').textContent(), /Posted/);
  await page.locator('#refresh-actions').click();
  assert.equal(await page.locator('#refresh-actions').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('.action-service', { hasText: 'Slack' }).count(), 2);
  await page.waitForSelector('#refresh-actions[aria-busy="false"]');
  await page.locator('#actions-settings').click();
  await page.locator('#settings-actions-panel').waitFor({ state: 'visible' });
  const disclosure = page.locator('.slack-token-help .disclosure-trigger');
  await disclosure.focus(); await page.keyboard.press('Enter');
  assert.match(await page.locator('.slack-token-help').textContent(), /User Token Scopes/);
  assert.match(await page.locator('.slack-token-help').textContent(), /search:read/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#slack-connections button').first().click();
  await page.locator('#slack-token').fill('demo');
  await page.locator('#slack-settings-form [type="submit"]').click();
  assert.equal(await page.locator('#slack-token').inputValue(), '');
  await page.locator('#slack-settings-form').waitFor({ state: 'hidden' });
  assert.match(await page.locator('#slack-settings-status').textContent(), /Connected/);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#slack-connections button').nth(1).click();
  await page.waitForFunction(() => document.querySelector('#slack-connections').children.length === 0);
  await page.locator('#add-slack').click();
  await page.locator('#slack-token').fill('demo');
  await page.locator('#slack-settings-form [type="submit"]').click();
  await page.locator('#slack-settings-form').waitFor({ state: 'hidden' });
  await page.locator('#tab-actions').click();
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('.action-service', { hasText: 'Slack' }).count(), 2);
});

test('Slack limit changes update results and show more-results information without an error', async t => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto(base + '/?github=empty&slack=more#actions');
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('.action-item-list > li').count(), 20);
  assert.equal(await page.locator('.action-more-results').count(), 1);
  assert.equal(await page.locator('#actions-status').isVisible(), false);
  await page.locator('#actions-settings').click();
  await page.locator('#slack-bookmark-limit').selectOption('100');
  await page.waitForFunction(() => document.getElementById('slack-bookmark-limit').dataset.savedValue === '100');
  await page.locator('#tab-actions').click();
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('.action-item-list > li').count(), 55);
  assert.equal(await page.locator('.action-more-results').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.reload();
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('.action-item-list > li').count(), 55);
});

test('Action type chips filter with OR, retain keyboard focus and show readable colors across light and dark themes', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await page.locator('#tab-actions').click();
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  const assigned = page.getByRole('button', { name: 'GitHub Assigned issue', exact: true });
  await assigned.focus(); await page.keyboard.press('Space');
  assert.equal(await assigned.getAttribute('aria-pressed'), 'true');
  assert.equal(await assigned.evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.action-item-list > li').count(), 2);
  await page.getByRole('button', { name: 'Slack Bookmark', exact: true }).click();
  assert.equal(await page.locator('.action-item-list > li').count(), 4);
  assert.equal(await page.locator('#actions-count').textContent(), '4 / 7 shown');
  await page.locator('#refresh-actions').click();
  await page.waitForSelector('#refresh-actions[aria-busy="false"]');
  assert.equal(await page.locator('.action-item-list > li').count(), 4);
  for (const theme of ['lofi', 'dracula']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    const colors = await page.locator('.action-item-kind').evaluateAll(nodes => nodes.map(node => ({ bg: getComputedStyle(node).backgroundColor, fg: getComputedStyle(node).color })));
    assert.ok(new Set(colors.map(color => color.bg)).size >= 2);
    for (const { bg, fg } of colors) {
      const luminance = rgb => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const values = [luminance(bg), luminance(fg)].sort((a, b) => b - a);
      assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, 'Badges must retain readable contrast');
    }
  }
  await page.locator('#action-filters button').filter({ hasText: /^All$/ }).click();
  assert.equal(await page.locator('.action-item-list > li').count(), 7);
});
