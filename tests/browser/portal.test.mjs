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
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => localStorage.setItem('portal-calendar-open', 'false'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The smoke suite uses only the local fixture, including its image fallbacks.
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.goto(base);
  await page.waitForSelector('#directory[aria-busy="false"] .tool-card');
  return page;
}

async function selectPortalTab(page, tab) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const menu = page.locator('#compact-nav-trigger');
  if (await menu.isVisible()) {
    await menu.click();
    await page.locator('.compact-nav-item[data-portal-tab="' + tab + '"]').click();
  } else await page.locator('#tab-' + tab).click();
}

test('Tabs preserve drafts and history; defaults only apply after saving', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await page.locator('#tab-tools').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.activeElement.id === 'tab-actions');
  await selectPortalTab(page, 'settings');
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
  await selectPortalTab(page, 'settings');
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
  await selectPortalTab(page, 'actions');
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('#actions-panel button#refresh-actions').count(), 1);
  assert.ok(await page.locator('.action-service', { hasText: 'GitHub' }).count() > 0);
  assert.equal(await page.locator('.action-service', { hasText: 'Slack' }).count(), 2);
  assert.match(await page.locator('.action-item-list').textContent(), /Posted/);
  await page.locator('#refresh-actions').click();
  assert.equal(await page.locator('#refresh-actions').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('.action-service', { hasText: 'Slack' }).count(), 2);
  await page.waitForSelector('#refresh-actions[aria-busy="false"]');
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-actions').click();
  await page.locator('#settings-actions-panel').waitFor({ state: 'visible' });
  const disclosure = page.locator('.slack-token-help .disclosure-trigger');
  await disclosure.focus(); await page.keyboard.press('Enter');
  assert.match(await page.locator('.slack-token-help').textContent(), /User Token Scopes/);
  assert.match(await page.locator('.slack-token-help').textContent(), /search:read/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#slack-connections button').first().click();
  await page.locator('#replace-slack-token').click();
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
  await selectPortalTab(page, 'actions');
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('.action-service', { hasText: 'Slack' }).count(), 2);
});

test('Slack limit changes update results and show more-results information without an error', async t => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto(base + '/?github=empty&slack=more#inbox-and-tasks');
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('.action-item-list > li').count(), 20);
  assert.equal(await page.locator('.action-more-results').count(), 1);
  assert.equal(await page.locator('#actions-status').isVisible(), false);
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-actions').click();
  await page.locator('#slack-bookmark-limit').selectOption('100');
  await page.waitForFunction(() => document.getElementById('slack-bookmark-limit').dataset.savedValue === '100');
  await selectPortalTab(page, 'actions');
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('.action-item-list > li').count(), 55);
  assert.equal(await page.locator('.action-more-results').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.reload();
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('.action-item-list > li').count(), 55);
});

test('Task reason badges remain readable across light and dark themes without type filters', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await selectPortalTab(page, 'actions');
  await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
  assert.equal(await page.locator('#action-filters').count(), 0);
  for (const theme of ['lofi', 'dracula']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      // Floating tooltips reposition on animation frames after a viewport resize.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    const colors = await page.locator('.action-item-kind').evaluateAll(nodes => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      const rgb = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      return nodes.map(node => ({ bg: rgb(getComputedStyle(node).backgroundColor), fg: rgb(getComputedStyle(node).color) }));
    });
    assert.ok(new Set(colors.map(color => color.bg.join())).size >= 2);
    for (const { bg, fg } of colors) {
      const luminance = rgb => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const values = [luminance(bg), luminance(fg)].sort((a, b) => b - a);
      assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, 'Badges must retain readable contrast');
    }
  }
  assert.equal(await page.locator('.action-item-list > li').count(), 7);
});

test('Tools and Actions share counter, timestamp and refresh styling', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  const selectors = {
    tools: ['#count', '#catalog-freshness', '#refresh-catalog', '.filter-toolbar'],
    actions: ['#actions-count', '#actions-freshness', '#refresh-actions', '.actions-summary'],
  };
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const controls = {};
    for (const tab of ['tools', 'actions']) {
      await selectPortalTab(page, tab);
      if (tab === 'actions') await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
      controls[tab] = await page.evaluate(selectors => {
        const style = (selector, keys) => {
          const value = getComputedStyle(document.querySelector(selector));
          return Object.fromEntries(keys.map(key => [key, value[key]]));
        };
        const button = ['fontSize', 'fontWeight', 'borderRadius', 'minHeight'];
        return {
          counter: style(selectors[0], ['fontSize', 'fontFamily', 'fontVariantNumeric']),
          time: document.querySelector(selectors[1]).textContent,
          refresh: style(selectors[2], button),
          summary: style(selectors[3], ['gap']),
        };
      }, selectors[tab]);
      assert.match(controls[tab].time, /^Retrieved \d{2}:\d{2}$/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${tab} at ${width}px`);
    }
    for (const key of ['counter', 'refresh']) assert.deepEqual(controls.tools[key], controls.actions[key], `${key} at ${width}px`);
  }
});

test('Filter chips reserve borders for selection and retain visible keyboard focus without resizing', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  for (const theme of ['lofi', 'dracula']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const tab of ['tools']) {
      await selectPortalTab(page, tab);
      const host = '#tags';
      const chip = page.locator(host + ' .tag-button[aria-pressed="false"]').first();
      const read = el => {
        const style = getComputedStyle(el), bounds = el.getBoundingClientRect();
        return { border: style.borderColor, shadow: style.boxShadow, width: bounds.width, height: bounds.height, outline: style.outlineStyle, outlineWidth: style.outlineWidth };
      };
      await chip.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
      const initial = await chip.evaluate(read);
      assert.equal(initial.border, 'rgba(0, 0, 0, 0)');
      assert.equal(initial.shadow, 'none');
      await page.keyboard.press('Tab');
      await chip.focus();
      const focused = await chip.evaluate(read);
      assert.equal(focused.outline, 'solid');
      assert.equal(focused.outlineWidth, '2px');
      // Keep a stable locator after aria-pressed changes.
      const label = await chip.textContent();
      await page.keyboard.press('Space');
      const selected = await page.getByRole('button', { name: label, exact: true }).evaluate(read);
      assert.notEqual(selected.border, 'rgba(0, 0, 0, 0)');
      assert.notEqual(selected.shadow, 'none');
      assert.equal(selected.width, initial.width);
      assert.equal(selected.height, initial.height);
      await page.locator(host + ' button').filter({ hasText: /^All$/ }).click();
    }
  }
});

test('Action search filters locally and remains usable at narrow widths', async t => {
  const page = await pageFor(t);
  await selectPortalTab(page, 'actions');
  await page.locator('.action-item-list > li').first().waitFor();
  const titles = await page.locator('.action-item-title').allTextContents();
  const search = page.getByRole('searchbox', { name: 'Search inbox and tasks' });
  await search.fill(titles[0]);
  assert.ok((await page.locator('.action-item-title').allTextContents()).every(title => title.toLowerCase().includes(titles[0].toLowerCase())));
  assert.equal(await search.evaluate(node => node === document.activeElement), true);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await search.boundingBox();
    assert.ok(bounds.width > 150, 'Search remains usable');
  }
  await search.fill('no matching title xyz');
  await page.locator('#action-items').getByRole('button', { name: 'Clear filters' }).click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.locator('.action-item-title').count(), titles.length);
});

test('Connection editors show masked suffixes and require an explicit switch to password entry', async t => {
  const page = await pageFor(t);
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-actions').click();
  for (const service of ['github', 'slack']) {
    await page.locator('#' + service + '-connections button').first().click();
    const field = page.locator('#' + service + '-token');
    assert.equal(await field.inputValue(), '••••••••mo');
    assert.equal(await field.getAttribute('readonly'), '');
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.locator('#replace-' + service + '-token').click();
    assert.equal(await field.inputValue(), '');
    assert.equal(await field.getAttribute('type'), 'password');
    assert.equal(await field.evaluate(node => node === document.activeElement), true);
    await field.fill('demo');
    await page.locator('#' + service + '-settings-form button[type="submit"]').click();
    await page.locator('#' + service + '-settings-form').waitFor({ state: 'hidden' });
    await page.locator('#' + service + '-connections button').first().click();
    assert.equal(await field.inputValue(), '••••••••mo');
    await page.locator('#cancel-' + service).click();
  }
});

async function calendarPage(t, scenario = '', options = {}) {
  const page = await pageFor(t, { timezoneId: 'Asia/Tokyo', ...options });
  // Keep fixture events on the same day, regardless of when CI runs.
  await page.clock.setFixedTime(new Date('2026-11-07T03:00:00Z'));
  await page.goto(base + '/?calendar=' + scenario);
  await page.locator('#toggle-calendar').click();
  await page.locator('#calendar-panel .refresh-catalog[aria-busy="false"]').waitFor();
  return page;
}

test('Calendar compact rows expand on hover and focus, and remain available across main tabs', async t => {
  const page = await calendarPage(t, 'overlap', { viewport: { width: 1440, height: 1000 } });
  assert.equal(await page.locator('.calendar-event[data-state="current"]:not(.is-gap)').count(), 2);
  assert.equal(await page.locator('.calendar-event[data-state="next"][data-expanded="true"]').count(), 1);
  const later = page.locator('.calendar-event[data-state="future"]:not(.is-gap)').first();
  const before = await later.boundingBox();
  await later.hover();
  await page.waitForFunction(() => document.querySelector('.calendar-event[data-state="future"]:not(.is-gap)').dataset.expanded === 'true');
  await page.waitForTimeout(300);
  assert.ok((await later.boundingBox()).height > before.height + 30);
  assert.equal(await later.locator('.calendar-event-detail').getAttribute('inert'), null);
  await page.locator('#calendar-panel .calendar-panel-controls').hover();
  await page.waitForFunction(() => document.querySelector('.calendar-event[data-state="future"]:not(.is-gap)').dataset.expanded === 'false');
  assert.equal(await later.locator('.calendar-event-detail').getAttribute('inert'), '');
  const past = page.locator('.calendar-event[data-state="past"]:not(.is-gap)').first();
  await past.locator('button').focus();
  await page.waitForFunction(() => document.querySelector('.calendar-event[data-state="past"]:not(.is-gap)').dataset.expanded === 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await past.locator('button').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  for (const tab of ['#tab-actions', '#tab-settings', '#tab-tools']) { await selectPortalTab(page, tab.replace('#tab-', '')); assert.equal(await page.locator('#calendar-panel').isVisible(), true); }
  await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
  assert.equal(await page.locator('#calendar-panel').isVisible(), false);
  assert.equal(await page.locator('#toggle-calendar').evaluate(el => el === document.activeElement), true);
});

test('Calendar settings persist, narrow screens remain usable and in-page notices can be enabled', async t => {
  const page = await calendarPage(t, 'alert', { viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-calendar').click();
  await page.locator('#settings-calendar-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#settings-tab-calendar').textContent(), 'Calendar');
  assert.equal(await page.locator('#calendar-panel').isVisible(), false);
  assert.equal(await page.locator('#toggle-calendar').getAttribute('aria-disabled'), 'true');
  await page.getByRole('button', { name: 'Load calendars', exact: true }).click();
  await page.getByLabel('Personal', { exact: true }).check();
  await page.getByLabel('Calendar cache duration', { exact: true }).selectOption('900');
  await page.getByLabel('Upcoming-event notice', { exact: true }).selectOption('5');
  await page.getByRole('button', { name: 'Preview notice', exact: true }).click();
  await page.locator('#calendar-notice-sample').waitFor();
  assert.equal(await page.locator('#calendar-notice-sample .calendar-event.is-approaching').count(), 1);
  assert.match(await page.locator('#calendar-notice-sample').textContent(), /In 5′/);
  await page.getByRole('button', { name: 'Preview notice', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-controls') === 'calendar-notice-sample');
  await page.locator('.calendar-settings button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('.calendar-settings .settings-form-status')?.textContent === 'Saved');
  await page.reload();
  await page.locator('.calendar-settings fieldset:not([disabled])').waitFor();
  assert.equal(await page.getByLabel('Calendar cache duration', { exact: true }).inputValue(), '900');
  assert.equal(await page.getByLabel('Upcoming-event notice', { exact: true }).inputValue(), '5');
  assert.equal(await page.getByLabel('Animate upcoming events', { exact: true }).count(), 0);
  await selectPortalTab(page, 'tools');
  await page.locator('#toggle-calendar').click();
  await page.locator('.calendar-all-day-trigger').tap();
  assert.equal(await page.locator('.calendar-all-day-pin').getAttribute('aria-pressed'), 'true');
  await page.locator('.calendar-all-day-trigger').tap();
  assert.equal(await page.locator('.calendar-all-day').getAttribute('data-expanded'), 'false');
  const later = page.locator('.calendar-event[data-state="future"]:not(.is-gap)').first();
  await later.locator('button').tap();
  assert.equal(await later.getAttribute('data-expanded'), 'true');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#calendar-panel').isVisible(), false);
});

test('Calendar empty and partial states never imply false free time', async t => {
  const page = await calendarPage(t, 'partial');
  assert.ok(await page.locator('.calendar-event').count() > 0);
  assert.equal(await page.locator('.calendar-event.is-gap').count(), 0);
  assert.match(await page.locator('.calendar-notice').textContent(), /Some calendars could not be loaded/);
  await page.goto(base + '/?calendar=empty');
  await page.locator('#toggle-calendar').click();
  await page.getByText('No events today.', { exact: true }).waitFor();
  assert.equal(await page.locator('.calendar-event').count(), 0);
  await page.goto(base + '/?calendar=unauthorized');
  await page.locator('#toggle-calendar').click();
  await page.getByText('Calendar authorization is required. Run authorizePortal in the GAS editor and grant access.', { exact: true }).first().waitFor();
  assert.equal(await page.locator('#calendar-panel .refresh-catalog').isEnabled(), true);
});

test('Calendar all-day card can be hovered, pinned and explicitly collapsed; upcoming motion respects reduced motion', async t => {
  const page = await calendarPage(t, 'pulse', { viewport: { width: 1440, height: 1000 } });
  const allDay = page.locator('.calendar-all-day');
  const header = allDay.locator('.calendar-all-day-trigger');
  assert.match(await header.textContent(), /All-day events.*4/);
  assert.equal(await allDay.getAttribute('data-expanded'), 'false');
  const closedHeight = (await allDay.boundingBox()).height;
  const pastHeight = (await page.locator('.calendar-event[data-state="past"]:not(.is-gap)').first().boundingBox()).height;
  assert.equal(closedHeight, pastHeight);
  assert.equal(await allDay.locator('.calendar-all-day-pin').isVisible(), false);
  const badge = page.locator('.calendar-next-badge');
  assert.equal(await badge.count(), 1);
  assert.equal(await badge.evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await badge.textContent(), 'In 2′');
  assert.equal(await badge.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
  await allDay.hover();
  await page.waitForFunction(() => document.querySelector('.calendar-all-day').dataset.expanded === 'true');
  await page.waitForTimeout(250);
  assert.ok((await allDay.boundingBox()).height > closedHeight + 40);
  const pin = allDay.getByRole('button', { name: 'Keep all-day events expanded', exact: true });
  await pin.click();
  assert.equal(await pin.getAttribute('aria-pressed'), 'true');
  await page.locator('#calendar-panel .calendar-panel-controls').hover();
  await page.locator('#toggle-calendar').focus();
  assert.equal(await allDay.getAttribute('data-expanded'), 'true');
  await pin.click();
  assert.equal(await allDay.getAttribute('data-expanded'), 'false', 'Unpin collapses even while hovered/focused');
  assert.equal(await allDay.locator('.calendar-all-day-body').getAttribute('inert'), '');
  await page.locator('#calendar-panel .calendar-panel-controls').hover();
  await allDay.hover();
  await page.waitForFunction(() => document.querySelector('.calendar-all-day').dataset.expanded === 'true');
  await page.locator('#calendar-panel .calendar-panel-controls').hover();
  assert.equal(await allDay.getAttribute('data-expanded'), 'false', 'First hover after unpin must close on pointer leave');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await badge.evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await allDay.locator('.calendar-all-day-body').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.locator('#calendar-panel .calendar-panel-controls').focus();
  await header.focus();
  await page.keyboard.press('Enter');
  assert.equal(await pin.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Enter');
  assert.equal(await allDay.getAttribute('data-expanded'), 'false');
});

test('Calendar segmented filters preserve rows and always reserve layout space across screen sizes', async t => {
  const page = await calendarPage(t, '', { viewport: { width: 1000, height: 900 }, reducedMotion: 'reduce' });
  const count = await page.locator('.calendar-event').count();
  const filters = page.getByRole('radiogroup', { name: 'Schedule display' });
  await filters.locator('label').filter({ hasText: 'Free' }).click();
  assert.equal(await page.locator('.calendar-event').count(), count);
  assert.equal(await page.locator('.calendar-event:not(.is-gap)[data-expanded="true"]').count(), 0);
  assert.ok(await page.locator('.calendar-event.is-gap[data-expanded="true"]').count() > 0);
  for (const row of await page.locator('.calendar-event:not(.is-gap)').all()) {
    assert.equal((await row.locator('.calendar-event-trigger').boundingBox()).height, 10);
    assert.equal(await row.locator('.calendar-event-copy').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  }
  assert.equal(await page.locator('.calendar-next-badge').isVisible(), false);
  await filters.locator('label').filter({ hasText: 'All' }).click();
  assert.equal(await page.locator('.calendar-event[data-expanded="true"]').count(), count);
  assert.equal(await page.locator('.calendar-all-day').getAttribute('data-expanded'), 'true');
  assert.equal(await page.locator('.calendar-all-day-pin').isVisible(), false);
  await filters.locator('label').filter({ hasText: 'Free' }).click();
  assert.equal(await page.locator('.calendar-event:not(.is-gap)[data-expanded="true"]').count(), 0);
  assert.equal(await page.locator('.calendar-all-day').getAttribute('data-expanded'), 'false');
  const current = page.locator('.calendar-event[data-state="current"]:not(.is-gap)').first();
  await current.hover();
  await page.waitForFunction(() => document.querySelector('.calendar-event[data-state="current"]:not(.is-gap)').dataset.expanded === 'true');
  await filters.hover();
  await page.waitForFunction(() => document.querySelector('.calendar-event[data-state="current"]:not(.is-gap)').dataset.expanded === 'false');
  await filters.locator('label').filter({ hasText: 'Nearby' }).click();
  assert.equal(await page.locator('.calendar-event[data-state="current"][data-expanded="true"]:not(.is-gap)').count(), 1);
  const fill = page.locator('.calendar-event[data-state="current"]:not(.is-gap)');
  assert.match(await fill.evaluate(el => getComputedStyle(el).backgroundImage), /linear-gradient/);
  assert.equal(await page.locator('.calendar-remaining-label').first().textContent(), '25′ left');
  assert.equal(await page.locator('.calendar-dock').count(), 0);
  const filterBox = await filters.boundingBox(), refreshBox = await page.locator('#calendar-panel .refresh-catalog').boundingBox();
  assert.ok(Math.abs(filterBox.y + filterBox.height / 2 - refreshBox.y - refreshBox.height / 2) < 2, 'Filter and refresh share one row');
  await filters.getByRole('radio', { name: 'Nearby', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await filters.getByRole('radio', { name: 'Free', exact: true }).isChecked(), true);
  for (const width of [1000, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const main = await page.locator('#main').boundingBox(), panel = await page.locator('#calendar-panel').boundingBox();
    assert.ok(width > 760 ? panel.x >= main.x + main.width - 1 : panel.y + panel.height <= main.y + 1, 'Docked panel does not cover main content at ' + width);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.reload();
  await page.locator('#toggle-calendar').click();
  await page.locator('#calendar-panel').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
  assert.equal(await page.locator('#calendar-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('portal-calendar-open')), 'false');
});

test('Past calendar rows remain reachable top-down, then collapse together outside the schedule', async t => {
  const page = await calendarPage(t, 'overlap', { viewport: { width: 1440, height: 1100 } });
  await page.locator('.calendar-all-day').hover();
  await page.waitForTimeout(500);
  const rows = await page.locator('.calendar-event[data-state="past"]').all();
  for (const row of rows) {
    const box = await row.boundingBox();
    assert.ok(box.height >= 28, 'Inspection provides full-height hit targets');
    await page.mouse.move(box.x + 70, box.y + 14);
    await page.waitForTimeout(350);
    assert.equal(await row.getAttribute('data-expanded'), 'true', 'Moving down must not lose the next target');
  }
  await page.locator('#calendar-panel .calendar-panel-controls').hover();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.calendar-schedule').getAttribute('data-browsing-past'), 'false');
  assert.equal((await rows[0].boundingBox()).height, 10);
  assert.equal(await page.locator('.calendar-all-day').getAttribute('data-expanded'), 'false');
});

test('Calendar past inspection ends on current or future rows while explicit all-day pins remain', async t => {
  const page = await calendarPage(t, 'overlap', { viewport: { width: 1440, height: 1100 } });
  const schedule = page.locator('.calendar-schedule');
  const allDay = page.locator('.calendar-all-day');
  const past = page.locator('.calendar-event[data-state="past"]:not(.is-gap)').first();
  for (const selector of ['[data-state="current"]:not(.is-gap)', '[data-state="next"]', '[data-state="future"]:not(.is-gap)', '[data-state="future"].is-gap']) {
    await allDay.hover();
    await page.waitForTimeout(300);
    await past.hover();
    await page.waitForTimeout(300);
    assert.equal(await schedule.getAttribute('data-browsing-past'), 'true');
    await page.locator('.calendar-event' + selector).first().hover();
    await page.waitForTimeout(350);
    assert.equal(await schedule.getAttribute('data-browsing-past'), 'false', selector);
    await page.waitForFunction(() => document.querySelector('.calendar-event[data-state="past"]:not(.is-gap)').getBoundingClientRect().height === 10);
    assert.equal(await allDay.getAttribute('data-expanded'), 'false');
  }
  await past.locator('button').focus();
  assert.equal(await schedule.getAttribute('data-browsing-past'), 'true');
  await page.locator('.calendar-event[data-state="next"] button').focus();
  assert.equal(await schedule.getAttribute('data-browsing-past'), 'false');
  await allDay.hover();
  await page.locator('.calendar-all-day-pin').click();
  await page.locator('.calendar-event[data-state="current"]:not(.is-gap)').first().hover();
  await page.waitForTimeout(350);
  assert.equal(await schedule.getAttribute('data-browsing-past'), 'false');
  assert.equal(await allDay.getAttribute('data-expanded'), 'true');
  assert.equal(await page.locator('.calendar-all-day-pin').getAttribute('aria-pressed'), 'true');
});

test('Calendar uses Lucide pin actions, stronger Next badges and vertical details when stacked', async t => {
  const page = await calendarPage(t, '', { viewport: { width: 700, height: 1100 }, reducedMotion: 'reduce' });
  await page.locator('.calendar-all-day').hover();
  const pin = page.locator('.calendar-all-day-pin');
  assert.equal(await pin.locator('svg').count(), 1);
  assert.equal(await pin.locator('path[d="m2 2 20 20"]').count(), 0);
  await pin.click();
  assert.equal(await pin.locator('path[d="m2 2 20 20"]').count(), 1);
  await pin.click();
  const current = page.locator('.calendar-event[data-state="current"]:not(.is-gap)').first();
  const title = await current.locator('.calendar-event-trigger').boundingBox();
  const detail = await current.locator('.calendar-event-detail').boundingBox();
  assert.ok(detail.y >= title.y + title.height - 1);
  assert.ok(await page.locator('.calendar-next-badge').evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 11);
  for (const width of [1440, 1280, 1000, 700]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const tab of ['tools', 'actions']) {
      await selectPortalTab(page, tab);
      const toolbar = page.locator(tab === 'tools' ? '.directory-toolbar' : '.actions-toolbar');
      const search = await toolbar.locator('.search-controls').boundingBox();
      const controls = await toolbar.locator(tab === 'tools' ? '.filter-toolbar' : '#refresh-actions').boundingBox();
      if (tab === 'tools' && width <= 760) {
        assert.ok(controls.y >= search.y + search.height - 1, 'Compact controls sit below search');
      } else if (tab === 'tools') {
        assert.ok(Math.abs(search.y + search.height / 2 - controls.y - controls.height / 2) < 2, `${tab} controls should stay beside search at ${width}px`);
      } else {
        const counts = await toolbar.locator('.queue-counts').boundingBox();
        assert.ok(Math.abs(counts.y + counts.height / 2 - controls.y - controls.height / 2) < 2, `Queue counters stay beside refresh at ${width}px`);
        assert.ok(search.y <= counts.y + counts.height);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    }
  }
});


test('Calendar hover waits 150ms, cancels brief passes, and keeps keyboard expansion immediate', async t => {
  const page = await pageFor(t, { timezoneId: 'Asia/Tokyo', reducedMotion: 'reduce', viewport: { width: 1440, height: 1100 } });
  await page.clock.install({ time: new Date('2026-11-07T03:00:00Z') });
  await page.goto(base + '/?calendar=overlap');
  await page.locator('#toggle-calendar').click();
  await page.locator('#calendar-panel .refresh-catalog[aria-busy="false"]').waitFor();
  await page.clock.pauseAt(new Date('2026-11-07T03:01:00Z'));
  const header = page.locator('#calendar-panel .calendar-panel-controls');
  const move = async locator => { const box = await locator.boundingBox(); await page.mouse.move(box.x + 10, box.y + box.height / 2); };
  for (const selector of ['.calendar-all-day', '.calendar-event[data-state="past"]:not(.is-gap)', '.calendar-event[data-state="future"]:not(.is-gap)']) {
    const row = page.locator(selector).first();
    await move(row);
    await page.clock.runFor(149);
    assert.equal(await row.getAttribute('data-expanded'), 'false', selector + ' should wait');
    if (!selector.includes('future')) assert.equal(await page.locator('.calendar-schedule').getAttribute('data-browsing-past'), 'false');
    await move(header);
    await page.clock.runFor(500);
    assert.equal(await row.getAttribute('data-expanded'), 'false', selector + ' should cancel');
    assert.equal(await page.locator('.calendar-schedule').getAttribute('data-browsing-past'), 'false');
    await move(row);
    await page.clock.runFor(150);
    assert.equal(await row.getAttribute('data-expanded'), 'true', selector + ' should expand');
    await move(header);
    await page.clock.runFor(500);
  }
  const future = page.locator('.calendar-event[data-state="future"]:not(.is-gap)').first();
  await future.locator('button').focus();
  assert.equal(await future.getAttribute('data-expanded'), 'true');
  await page.locator('.calendar-all-day-trigger').focus();
  assert.equal(await page.locator('.calendar-all-day').getAttribute('data-expanded'), 'true');
});


test('Calendar countdown changes at remaining-minute boundaries using the existing clock', async t => {
  const page = await pageFor(t, { timezoneId: 'Asia/Tokyo', reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-07T03:00:00Z') });
  await page.goto(base + '/?calendar=pulse');
  await page.locator('#toggle-calendar').click();
  await page.locator('#calendar-panel .refresh-catalog[aria-busy="false"]').waitFor();
  await page.clock.pauseAt(new Date('2026-11-07T03:00:30Z'));
  const badge = page.locator('#calendar-panel .calendar-next-badge');
  assert.equal(await badge.textContent(), 'In 2′');
  await page.clock.runFor(30000);
  assert.equal(await badge.textContent(), 'In 1′');
  await page.clock.runFor(60000);
  assert.equal(await badge.textContent(), 'Next');
});


test('Current calendar cards keep colored remaining minutes readable through the final minute', async t => {
  const page = await pageFor(t, { timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 1100 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('portal-preview-calendar', JSON.stringify({ calendarIds: ['primary'], cacheSeconds: 21600, alertMinutes: 3 })));
  await page.clock.setFixedTime(new Date('2026-11-07T03:00:00Z'));
  await page.goto(base + '/?calendar=overlap');
  await page.locator('#toggle-calendar').click();
  await page.locator('#calendar-panel .refresh-catalog[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.calendar-remaining-label').count(), 2);
  assert.equal(await page.locator('.calendar-event mask').count(), 0);
  const current = page.locator('.calendar-event').filter({ has: page.locator('.calendar-remaining-label', { hasText: '25′' }) });
  assert.match(await current.locator('.calendar-event-trigger').getAttribute('aria-label'), /25 min remaining/);
  assert.match(await current.locator('.calendar-event-time').textContent(), /45′/);
  assert.equal(await current.locator('.calendar-remaining-label').evaluate(el => getComputedStyle(el).fontSize), await current.locator('.calendar-event-time').evaluate(el => getComputedStyle(el).fontSize));
  await page.clock.setFixedTime(new Date('2026-11-07T03:24:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const ending = page.locator('.calendar-event').filter({ has: page.locator('.calendar-remaining-label', { hasText: /^1′ left$/ }) });
  assert.equal(await ending.count(), 1);
  assert.equal(await ending.evaluate(el => el.style.getPropertyValue('--event-progress')), '97.78%');
  assert.equal(await ending.locator('.calendar-remaining-label').isVisible(), true);
  assert.notEqual(await ending.locator('.calendar-remaining-label').evaluate(el => getComputedStyle(el).color), 'rgba(0, 0, 0, 0)');
  assert.match(await ending.locator('.calendar-event-trigger').getAttribute('title'), /1 min remaining/);
  for (const width of [700, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.clock.setFixedTime(new Date('2026-11-07T03:25:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await page.locator('.calendar-remaining-label').count(), 1);
  assert.equal(await page.locator('.calendar-remaining-label').textContent(), '20′ left');
});

test('Calendar upcoming card pulses without a modal or focus changes, and stops at start', async t => {
  const page = await pageFor(t, { timezoneId: 'Asia/Tokyo', viewport: { width: 1200, height: 900 } });
  await page.clock.install({ time: new Date('2026-11-07T03:00:00Z') });
  await page.goto(base + '/?calendar=pulse');
  await page.locator('#toggle-calendar').click();
  const card = page.locator('.calendar-event.is-approaching');
  await card.waitFor();
  assert.equal(await page.locator('[role=dialog]').count(), 0);
  assert.equal(await card.evaluate(el => getComputedStyle(el, '::before').animationName), 'calendar-upcoming-pulse');
  assert.equal(await card.evaluate(el => getComputedStyle(el, '::before').animationDuration), '1.8s');
  assert.equal(await card.locator('.calendar-next-badge').evaluate(el => getComputedStyle(el).animationName), 'none');
  const search = page.locator('#search');
  await search.fill('Address');
  await page.clock.runFor(60000);
  assert.equal(await search.evaluate(el => el === document.activeElement), true);
  assert.equal(await card.locator('.calendar-next-badge').textContent(), 'In 1′');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await card.evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
  await page.clock.runFor(60000);
  assert.equal(await card.count(), 0);
  assert.equal(await page.locator('[role=dialog]').count(), 0);
});

test('Calendar countdowns glitch only on value changes and honor reduced motion', async t => {
  const page = await calendarPage(t, 'pulse', { viewport: { width: 1000, height: 900 } });
  const times = page.locator('.calendar-changing-time');
  assert.equal(await times.evaluateAll(elements => elements.flatMap(el => el.getAnimations()).length), 0);
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    window.__calendarGlitches = [];
    Element.prototype.animate = function(frames, options) {
      if (this.matches('.calendar-changing-time')) window.__calendarGlitches.push({ text: this.textContent, duration: options.duration });
      return original.call(this, frames, options);
    };
  });
  await page.clock.setFixedTime(new Date('2026-11-07T03:01:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const glitches = await page.evaluate(() => window.__calendarGlitches);
  assert.equal(glitches.length, 2, 'Both current remaining minutes and the Next countdown change');
  assert.equal(glitches.every(item => item.duration === 320), true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await page.evaluate(() => window.__calendarGlitches.length), 2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-11-07T03:02:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await page.evaluate(() => window.__calendarGlitches.length), 2);
  const controls = page.locator('.calendar-panel-controls');
  assert.equal(await page.locator('#calendar-panel h2').count(), 0);
  const close = controls.getByRole('button', { name: 'Close calendar' });
  const buttonBox = await close.boundingBox(), iconBox = await close.locator('svg').boundingBox();
  assert.ok(Math.abs(buttonBox.y + buttonBox.height / 2 - iconBox.y - iconBox.height / 2) < 1);
});

test('Description preserves line breaks after saving and reload, and tab hover strengthens icon strokes without background fills', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await selectPortalTab(page, 'settings');
  const description = 'First line\nSecond line\n\nPlain <b>text</b>';
  await page.getByLabel('Notes', { exact: true }).fill(description);
  await page.locator('#portal-settings-form [type="submit"]').click();
  await page.waitForFunction(value => document.querySelector('.intro-copy').textContent === value, description);
  const copy = page.locator('.intro-copy');
  assert.equal(await copy.evaluate(el => getComputedStyle(el).whiteSpace), 'pre-line');
  assert.equal(await copy.locator('b').count(), 0);
  const lineTops = await copy.evaluate(el => {
    const text = el.firstChild;
    return [0, 11, 24].map(start => { const range = document.createRange(); range.setStart(text, start); range.setEnd(text, start + 1); return range.getBoundingClientRect().top; });
  });
  assert.ok(lineTops[1] > lineTops[0] && lineTops[2] > lineTops[1]);
  await page.reload();
  assert.equal(await copy.textContent(), description);
  for (const id of ['#tab-tools', '#tab-actions', '#tab-settings']) {
    await page.mouse.move(0, 0);
    const tab = page.locator(id);
    const before = await tab.evaluate(el => getComputedStyle(el).backgroundColor);
    await tab.hover();
    assert.equal(await tab.evaluate(el => getComputedStyle(el).backgroundColor), before);
    assert.equal(await tab.locator('svg').evaluate(el => parseFloat(getComputedStyle(el).strokeWidth)), 2.1);
    await page.mouse.move(0, 0);
    assert.equal(await tab.locator('svg').evaluate(el => parseFloat(getComputedStyle(el).strokeWidth)), await tab.getAttribute('aria-selected') === 'true' ? 1.9 : 1.75);
  }
  const appearance = locator => locator.evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor, stroke: getComputedStyle(el.querySelector('svg')).strokeWidth }));
  const calendar = page.locator('#toggle-calendar');
  assert.deepEqual(await appearance(calendar), await appearance(page.locator('#tab-tools')));
  await calendar.click();
  await page.mouse.move(0, 0);
  const active = await appearance(page.locator('#tab-settings'));
  assert.deepEqual(await appearance(calendar), active);
  await calendar.hover();
  const hovered = await appearance(calendar);
  await page.locator('#tab-settings').hover();
  assert.deepEqual(await appearance(page.locator('#tab-settings')), hovered);
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('#compact-nav-trigger').waitFor({ state: 'visible' });
  assert.deepEqual(await appearance(page.locator('#compact-nav-trigger')), active);
  await page.locator('#compact-nav-trigger').hover();
  assert.deepEqual(await appearance(page.locator('#compact-nav-trigger')), hovered);

});

test('Calendar refresh is compact and Japanese countdowns keep clear of event links', async t => {
  const page = await calendarPage(t, 'pulse', { viewport: { width: 1000, height: 900 } });
  await page.evaluate(() => { document.documentElement.lang = 'ja'; document.dispatchEvent(new Event('portal:languagechange')); });
  const badge = page.locator('.calendar-next-badge');
  assert.equal(await badge.textContent(), '2分後に開始');
  assert.equal(await page.locator('.calendar-remaining-label').textContent(), '残り25分');
  const refresh = page.locator('#calendar-panel .refresh-catalog');
  assert.equal((await refresh.locator('svg').boundingBox()).width, 14);
  assert.ok((await refresh.boundingBox()).height <= 28);
  assert.equal((await page.locator('#refresh-catalog svg').boundingBox()).width, 18, 'Tools keeps its usual size');
  for (const width of [1000, 700, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const badgeBox = await badge.boundingBox();
    const links = await page.locator('.calendar-event[data-state="next"] .calendar-event-detail a').all();
    for (const link of links) {
      const box = await link.boundingBox();
      assert.ok(box.x + box.width <= badgeBox.x || box.y + box.height <= badgeBox.y || box.y >= badgeBox.y + badgeBox.height);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
});

test('Calendar reminder can be silenced by keyboard and touch without changing notice settings', async t => {
  const page = await calendarPage(t, 'pulse', { viewport: { width: 1000, height: 900 } });
  const card = page.locator('.calendar-event[data-state="next"]').first();
  const button = card.getByRole('button', { name: 'Silence this reminder', exact: true });
  const badge = card.locator('.calendar-next-badge');
  const buttonBox = await button.boundingBox(), badgeBox = await badge.boundingBox();
  assert.ok(badgeBox.x + badgeBox.width <= buttonBox.x);
  assert.equal(await button.locator('svg').count(), 1);
  await button.focus();
  await page.keyboard.press('Enter');
  assert.equal(await card.getAttribute('data-reminder-active'), 'false');
  assert.equal(await card.evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
  assert.equal(await badge.textContent(), 'In 2′');
  assert.equal(await card.locator('.calendar-event-trigger').evaluate(el => el === document.activeElement), true);
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-calendar').click();
  assert.equal(await page.getByLabel('Upcoming-event notice', { exact: true }).inputValue(), '3');
  await page.getByRole('button', { name: 'Preview notice', exact: true }).click();
  const sample = page.locator('#calendar-notice-sample');
  await sample.getByRole('button', { name: 'Silence this reminder', exact: true }).click();
  assert.equal(await sample.locator('.is-approaching.calendar-event').count(), 0);
  await page.getByRole('button', { name: 'Preview notice', exact: true }).click();
  await page.getByRole('button', { name: 'Preview notice', exact: true }).click();
  assert.equal(await sample.locator('.is-approaching.calendar-event').count(), 1);
  const mobile = await calendarPage(t, 'pulse', { viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  await mobile.getByRole('button', { name: 'Silence this reminder', exact: true }).tap();
  assert.equal(await mobile.locator('.calendar-event.is-approaching').count(), 0);
});

test('Calendar authorization feedback stays near its control and uses themed error styling', async t => {
  const page = await calendarPage(t, 'unauthorized');
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-calendar').click();
  const load = page.getByRole('button', { name: 'Load calendars', exact: true });
  await load.click();
  const error = page.locator('#calendar-choices-error');
  await error.waitFor();
  assert.equal(await error.getAttribute('role'), 'alert');
  assert.equal(await load.getAttribute('aria-describedby'), 'calendar-choices-error');
  assert.equal(await page.locator('.calendar-settings > .alert-error').count(), 0);
  assert.equal(await page.locator('#calendar-panel .alert-error').count(), 1);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const buttonBox = await load.boundingBox(), errorBox = await error.boundingBox();
    assert.ok(errorBox.y >= buttonBox.y + buttonBox.height);
    assert.ok(errorBox.y - buttonBox.y - buttonBox.height < 24);
    assert.ok(errorBox.x >= 0 && errorBox.x + errorBox.width <= width);
  }
  const colors = await error.evaluate(el => ({ text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor, normal: getComputedStyle(el.parentElement).color }));
  assert.notEqual(colors.text, colors.normal);
  assert.notEqual(colors.background, 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: '/tmp/calendar-authorization-feedback.png', fullPage: true });
});

test('Calendar names survive reload and update on explicit discovery without changing the selection', async t => {
  const page = await pageFor(t);
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-calendar').click();
  await page.getByRole('button', { name: 'Load calendars', exact: true }).click();
  const choices = page.locator('.calendar-choices');
  await choices.getByLabel('Personal', { exact: true }).check();
  await page.locator('.calendar-settings button[type="submit"]').click();
  await page.getByText('Saved', { exact: true }).waitFor();
  await page.reload();
  await choices.getByLabel('Work calendar', { exact: true }).waitFor();
  assert.equal(await choices.getByLabel('Work calendar', { exact: true }).isChecked(), true);
  assert.equal(await choices.getByLabel('Personal', { exact: true }).isChecked(), true);
  await page.evaluate(() => localStorage.setItem('portal-preview-calendar-names', JSON.stringify({ primary: 'Old name', personal: 'Personal' })));
  await page.reload();
  await choices.getByLabel('Old name', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load calendars', exact: true }).click();
  await choices.getByLabel('Work calendar', { exact: true }).waitFor();
  await page.reload();
  await choices.getByLabel('Work calendar', { exact: true }).waitFor();
  assert.equal(await choices.getByLabel('Personal', { exact: true }).isChecked(), true);
});

test('Restored Calendar checkboxes stay visible and focused when unchecked, including after saving', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    localStorage.setItem('portal-preview-calendar', JSON.stringify({ calendarIds: ['primary', 'personal'], cacheSeconds: 300, alertMinutes: 0 }));
    localStorage.setItem('portal-preview-calendar-names', JSON.stringify({ primary: 'Work', personal: 'Personal' }));
  });
  await page.goto(base + '/#settings/calendar');
  await page.reload();
  const personal = page.locator('.calendar-choices').getByLabel('Personal', { exact: true });
  await personal.waitFor();
  await personal.focus();
  await page.keyboard.press('Space');
  assert.equal(await personal.isChecked(), false);
  assert.equal(await personal.isVisible(), true);
  assert.equal(await personal.evaluate(el => el === document.activeElement), true);
  await page.locator('.calendar-settings button[type="submit"]').click();
  await page.getByText('Saved', { exact: true }).waitFor();
  await personal.check();
  assert.equal(await personal.isChecked(), true);
});

test('Gmail settings persist and the shared search filters Inbox and Tasks', async t => {
  const page = await pageFor(t);
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-actions').click();
  const settings = page.locator('#settings-actions-panel');
  const headings = await settings.locator('h2').allTextContents();
  assert.deepEqual(headings.filter(text => ['Gmail', 'Slack', 'GitHub'].includes(text)), ['Gmail', 'Slack', 'GitHub']);
  await page.getByLabel('Show unread Gmail in Inbox', { exact: true }).check();
  await page.getByLabel('Maximum unread messages', { exact: true }).selectOption('50');
  await page.locator('#gmail-settings-form button[type="submit"]').click();
  await page.locator('#gmail-settings-host').getByText('Saved', { exact: true }).waitFor();
  await page.reload();
  await page.locator('#gmail-enabled:enabled').waitFor();
  assert.equal(await page.getByLabel('Show unread Gmail in Inbox', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Maximum unread messages', { exact: true }).inputValue(), '50');
  await selectPortalTab(page, 'actions');
  const card = page.locator('.inbox-card');
  await card.locator('.inbox-count').getByText('3', { exact: true }).waitFor();
  assert.equal(await card.locator('.inbox-summary').getAttribute('aria-expanded'), 'false');
  await card.locator('.inbox-summary').click();
  await card.locator('.inbox-message-list').waitFor();
  assert.equal(await card.locator('.inbox-message-list > li').count(), 3);
  assert.equal(await page.locator('.action-item-list > li').count(), 7);
  await page.getByRole('searchbox', { name: 'Search inbox and tasks', exact: true }).fill('proposal');
  assert.equal(await page.locator('.action-item-list > li').count(), 0);
  assert.equal(await card.locator('.inbox-count').textContent(), '1');
  assert.equal(await card.locator('.inbox-message-list li').count(), 1);
  assert.match(await card.locator('a').first().getAttribute('href'), /^https:\/\/mail.google.com\/mail\/\?authuser=demo%40example.com#all\//);
  await page.locator('#refresh-actions').click();
  await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
  assert.equal(await card.locator('.inbox-summary').getAttribute('aria-expanded'), 'true');
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: '/tmp/gmail-action-items-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});


test('Service logos are embedded, accessible, and visible in Actions and Settings in both themes', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/?gmail=ready#inbox-and-tasks');
  await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
  for (const name of ['GitHub', 'Slack']) {
    const logo = page.locator('.action-service').getByRole('img', { name, exact: true }).first();
    await logo.waitFor();
    assert.equal(await logo.getAttribute('title'), name);
    assert.equal(await logo.locator('.visually-hidden').textContent(), name);
  }
  for (const theme of ['lofi', 'dracula']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: '/tmp/service-logos-' + theme + '-' + width + '.png', fullPage: true });
    }
  }
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-actions').click();
  for (const service of ['gmail', 'slack', 'github']) assert.equal(await page.locator('#' + service + '-settings-title .service-logo[aria-hidden="true"]').count(), 1);
  await page.locator('#settings-tab-tools').click();
  assert.equal(await page.locator('#spreadsheet-settings-title .service-logo-drive').isVisible(), true);
  await page.locator('#settings-tab-calendar').click();
  await page.locator('.calendar-settings h2 .service-logo-calendar').waitFor();
  // All brand SVGs decode from data URLs, including when every external request is blocked.
  const loaded = await page.locator('.service-logo').evaluateAll(async logos => {
    const urls = [...new Set(logos.map(logo => getComputedStyle(logo).backgroundImage.slice(5, -2)))];
    return Promise.all(urls.map(async url => { const image = new Image(); image.src = url; await image.decode(); return { inline: url.startsWith('data:image/svg+xml'), width: image.naturalWidth }; }));
  });
  assert.equal(loaded.length, 5);
  assert.ok(loaded.every(image => image.inline && image.width > 0));
});


test('Cache settings lead each panel and advanced Tools controls preserve nested disclosure state', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await selectPortalTab(page, 'settings');
  await page.locator('#settings-tab-tools').click();
  const before = async (a, b) => assert.ok((await page.locator(a).boundingBox()).y < (await page.locator(b).boundingBox()).y);
  await before('#catalog-cache-seconds', '#spreadsheet-settings-title');
  const offset = async selector => (await page.locator(selector).boundingBox()).y - (await page.locator('.settings-tabs').boundingBox()).y;
  const cacheOffset = await offset('#catalog-cache-seconds');
  const common = await page.locator('#cache-help').textContent();
  await page.locator('#catalog-cache-seconds').selectOption('3600');
  await page.locator('#cache-settings-status').getByText('Saved', { exact: true }).waitFor();
  const advanced = page.getByRole('button', { name: 'Advanced settings', exact: true });
  assert.equal(await advanced.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#url-scheme-settings').isVisible(), false);
  await advanced.focus(); await page.keyboard.press('Enter');
  await page.locator('#favicon-finder-link').waitFor();
  const scheme = page.locator('#url-scheme-settings input[value="data"]');
  await scheme.uncheck();
  await page.locator('#url-scheme-settings-status').getByText('Saved', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'If dragging does not work', exact: true }).click();
  await page.locator('#favicon-finder-code').waitFor();
  assert.match(await page.locator('#favicon-finder-code').inputValue(), /^javascript:/);
  await advanced.click();
  await page.locator('.tools-advanced-settings > .disclosure-content[inert][aria-hidden="true"]').waitFor({ state: 'attached' });
  await page.locator('#favicon-finder-code').evaluate(element => element.focus());
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'favicon-finder-code');
  await advanced.click();
  assert.equal(await scheme.isChecked(), false);
  assert.equal(await page.locator('#favicon-finder-code').isVisible(), true);
  await page.locator('#settings-tab-actions').click();
  await before('#actions-cache-seconds', '#gmail-settings-title');
  assert.equal(await page.locator('#actions-cache-help').textContent(), common);
  assert.ok(Math.abs(await offset('#actions-cache-seconds') - cacheOffset) <= 1);
  await page.locator('#settings-tab-calendar').click();
  await before('[aria-labelledby="calendar-cache-label"]', '#calendar-settings-title');
  assert.equal(await page.locator('#calendar-cache-help').textContent(), common);
  assert.ok(Math.abs(await offset('[aria-labelledby="calendar-cache-label"]') - cacheOffset) <= 1);
  await page.locator('[aria-labelledby="calendar-cache-label"]').selectOption('900');
  await page.locator('.calendar-settings button[type="submit"]').click();
  await page.locator('.calendar-settings').getByText('Saved', { exact: true }).waitFor();
  await page.reload();
  await page.locator('.calendar-settings fieldset:not([disabled])').waitFor();
  assert.equal(await page.locator('[aria-labelledby="calendar-cache-label"]').inputValue(), '900');
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: '/tmp/cache-settings-calendar.png', fullPage: true });
  await page.locator('#settings-tab-tools').click();
  assert.equal(await page.locator('#catalog-cache-seconds').inputValue(), '3600');
  await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
  assert.equal(await scheme.isChecked(), false);
  await page.screenshot({ path: '/tmp/cache-settings-tools.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});

test('Inbox previews expand on hover, support keyboard and touch, and do not issue extra requests', async t => {
  const page = await pageFor(t);
  await page.goto(base + '/?gmail=ready#inbox-and-tasks');
  const summary = page.locator('.inbox-summary');
  await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
  assert.equal((await page.locator('#tab-actions').textContent()).trim(), 'Inbox & Tasks');
  assert.equal(await summary.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.inbox-message-list').isVisible(), false);
  const retrieved = await page.locator('#actions-freshness').textContent();
  await summary.hover();
  await page.locator('.inbox-summary[aria-expanded="true"]').waitFor();
  await page.locator('.inbox-message-title').first().waitFor();
  assert.equal(await page.locator('.inbox-message-list li').count(), 3);
  await page.locator('#tasks-title').hover();
  await page.locator('.inbox-summary[aria-expanded="false"]').waitFor();
  await summary.focus(); await page.keyboard.press('Enter');
  await page.locator('.inbox-summary[aria-expanded="true"]').waitFor();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  assert.equal(await summary.getAttribute('aria-expanded'), 'false');
  assert.equal(await summary.evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('#actions-freshness').textContent(), retrieved);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.inbox-message-list').waitFor({ state: 'hidden' });
  for (const theme of ['lofi', 'dracula']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.screenshot({ path: '/tmp/inbox-tasks-' + theme + '.png', fullPage: true });
  }
  const touch = await pageFor(t, { hasTouch: true, viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce' });
  await touch.goto(base + '/?gmail=ready#inbox-and-tasks');
  const button = touch.locator('.inbox-summary'); await button.waitFor();
  await button.tap(); await touch.locator('.inbox-message-title').first().waitFor();
  assert.equal(await button.getAttribute('aria-expanded'), 'true');
  assert.equal(await touch.locator('.inbox-message-title svg').first().evaluate(el => getComputedStyle(el).display), 'inline-block');
  await touch.screenshot({ path: '/tmp/inbox-tasks-mobile.png', fullPage: true });
  await button.tap();
  assert.equal(await button.getAttribute('aria-expanded'), 'false');
  assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});

test('Inbox distinguishes an empty inbox, a capped preview and failed retrieval', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  for (const [scenario, count, empty] of [['empty', '0', 'true'], ['more', '20+', 'false'], ['unauthorized', '—', 'false']]) {
    await page.goto(base + '/?gmail=' + scenario + '#inbox-and-tasks');
    await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
    const card = page.locator('.inbox-card');
    assert.equal(await card.locator('.inbox-count').textContent(), count);
    assert.equal(await card.getAttribute('data-empty'), empty);
    await card.locator('.inbox-summary').click();
    if (scenario === 'empty') await card.getByText('No unread items.', { exact: true }).waitFor();
    if (scenario === 'more') { assert.equal(await card.locator('.inbox-message-list li').count(), 20); await card.locator('.inbox-more-results').waitFor(); }
    if (scenario === 'unauthorized') await card.locator('[role="alert"]').waitFor();
  }
});

test('Inbox count badges sit at the icon shoulder and fit zero, capped and unavailable counts', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce', viewport: { width: 390, height: 900 } });
  for (const [scenario, count] of [['ready', '3'], ['more', '20+'], ['empty', '0'], ['unauthorized', '—']]) {
    await page.goto(base + '/?gmail=' + scenario + '#inbox-and-tasks');
    await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
    const service = page.locator('.inbox-service');
    assert.equal(await service.locator('.inbox-count').textContent(), count);
    for (const theme of ['lofi', 'dracula']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const layout = await service.evaluate(el => {
        const icon = el.querySelector('.service-logo').getBoundingClientRect();
        const badge = el.querySelector('.inbox-count');
        const box = badge.getBoundingClientRect();
        const summary = el.closest('.inbox-summary').getBoundingClientRect();
        return { icon: { top: icon.top, right: icon.right }, badge: { top: box.top, left: box.left, bottom: box.bottom }, summaryTop: summary.top, font: parseFloat(getComputedStyle(badge).fontSize), fits: badge.scrollWidth <= badge.clientWidth };
      });
      assert.ok(layout.badge.top < layout.icon.top);
      assert.ok(Math.abs(layout.badge.left - layout.icon.right) <= 6);
      assert.ok(layout.badge.top >= layout.summaryTop);
      assert.ok(layout.font >= 11);
      assert.equal(layout.fits, true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
  }
});

test('Setup guidance links open their settings section by keyboard and preserve browser history', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await page.goto(base + '/?github=disconnected&slack=disconnected#inbox-and-tasks');
  for (const host of ['#inbox-services', '#action-items']) {
    const link = page.locator(host + ' a.settings-guidance-link');
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), '#settings/inbox-and-tasks');
    await link.focus(); await page.keyboard.press('Enter');
    await page.locator('#settings-actions-panel').waitFor({ state: 'visible' });
    assert.ok(page.url().endsWith('#settings/inbox-and-tasks'));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-tab-actions');
    await page.goBack();
    await page.locator('#actions-panel').waitFor({ state: 'visible' });
  }
  await page.goto(base + '/?calendar=partial#tools');
  await page.locator('#toggle-calendar').click();
  const calendarLink = page.locator('#calendar-panel a.settings-guidance-link');
  await calendarLink.waitFor();
  await calendarLink.click();
  await page.locator('#settings-calendar-panel').waitFor({ state: 'visible' });
  assert.ok(page.url().endsWith('#settings/calendar'));
});

test('Queue counters follow shared search, stay beside refresh and retain counts while loading', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await page.goto(base + '/?gmail=ready#inbox-and-tasks');
  await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
  const inbox = page.locator('#inbox-total-count'), tasks = page.locator('#actions-count');
  assert.equal(await inbox.textContent(), '3 / 3 items');
  assert.equal(await tasks.textContent(), '7 / 7 items');
  assert.equal(await page.locator('.tasks-heading .count').count(), 0);
  const search = page.locator('#actions-search');
  await search.fill('proposal');
  assert.equal(await inbox.textContent(), '1 / 3 items');
  assert.equal(await tasks.textContent(), '0 / 7 items');
  assert.equal(await page.locator('.inbox-summary').getAttribute('aria-expanded'), 'false');
  await page.locator('#refresh-actions').click();
  assert.equal(await inbox.textContent(), '1 / 3 items');
  assert.equal(await tasks.textContent(), '0 / 7 items');
  await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
  for (const width of [1440, 1000, 900, 820, 780, 740, 700, 660, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    // Let the refresh tooltip reposition after resizing before checking overflow.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const box = await page.locator('.queue-counts').boundingBox();
    const refresh = await page.locator('#refresh-actions').boundingBox();
    const input = await search.boundingBox();
    assert.ok(box.x + box.width <= refresh.x + 1);
    assert.ok(Math.abs(box.y + box.height / 2 - refresh.y - refresh.height / 2) < 2);
    assert.ok(input.width > 150);
    const contentWidth = await page.locator('main').evaluate(el => {
      const style = getComputedStyle(el);
      return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
    if (width > 760 && contentWidth > 560) {
      assert.ok(Math.abs(input.y + input.height / 2 - refresh.y - refresh.height / 2) < 2, `Keep one row at ${contentWidth}px content width`);
    } else {
      assert.ok(input.y + input.height <= box.y, `Wrap only at narrow content widths: ${contentWidth}px`);
      const toolbar = await page.locator('.inbox-tasks-toolbar').boundingBox();
      assert.ok(Math.abs(box.x - toolbar.x) < 1, 'Wrapped counters start at the left edge');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
});

test('Inbox hover opens after 150ms and cancels a brief pass', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.goto(base + '/?gmail=ready#inbox-and-tasks');
  await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
  await page.clock.pauseAt(new Date('2026-11-09T12:01:00Z'));
  const summary = page.locator('.inbox-summary');
  const move = async locator => { const box = await locator.boundingBox(); await page.mouse.move(box.x + 10, box.y + box.height / 2); };
  await move(summary); await page.clock.runFor(149);
  assert.equal(await summary.getAttribute('aria-expanded'), 'false');
  await move(page.locator('#inbox-title')); await page.clock.runFor(500);
  assert.equal(await summary.getAttribute('aria-expanded'), 'false');
  await move(summary); await page.clock.runFor(150);
  assert.equal(await summary.getAttribute('aria-expanded'), 'true');
});

test('Compact header replaces tabs with an accessible menu and preserves drafts and history', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  const wideHeader = await page.locator('.site-header').boundingBox();
  assert.ok(wideHeader.height <= 65);
  await page.setViewportSize({ width: 600, height: 1000 });
  await page.locator('html[data-compact="true"]').waitFor();
  assert.equal(await page.locator('.portal-tabs').isVisible(), false);
  assert.equal(await page.locator('.brand-name').isVisible(), false);
  assert.equal(await page.locator('.preview-label').textContent(), 'LOCAL PREVIEW');
  assert.equal(await page.locator('.preview-label.badge-warning').isVisible(), true);
  assert.ok((await page.locator('.site-header').boundingBox()).height <= 53);
  const trigger = page.locator('#compact-nav-trigger');
  assert.match(await trigger.getAttribute('aria-label'), /Tools & Links/);
  await trigger.focus(); await page.keyboard.press('Enter');
  await page.getByRole('menuitemradio', { name: 'Tools & Links', exact: true }).focus();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.locator('#actions-panel').waitFor({ state: 'visible' });
  assert.ok(page.url().endsWith('#inbox-and-tasks'));
  assert.match(await trigger.getAttribute('aria-label'), /Inbox & Tasks/);
  assert.equal(await trigger.locator('svg').innerHTML(), await page.locator('#tab-actions svg').innerHTML());
  assert.equal(await page.locator('#inbox-title').isVisible(), false);
  assert.equal(await page.locator('#tasks-title').isVisible(), false);
  await selectPortalTab(page, 'settings');
  await page.locator('#setting-name').fill('Compact draft');
  await selectPortalTab(page, 'tools');
  await page.goBack();
  await page.locator('#settings-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#setting-name').inputValue(), 'Compact draft');
  await trigger.click(); await page.keyboard.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator('html[data-compact="false"]').waitFor();
  assert.equal(await page.locator('.portal-tabs').isVisible(), true);
  assert.equal(await page.locator('.brand-name').isVisible(), true);
  assert.equal(await trigger.isVisible(), false);
  assert.equal(await page.locator('#setting-name').inputValue(), 'Compact draft');
  for (const theme of ['lofi', 'dracula']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator('html[data-compact="true"]').waitFor();
    await trigger.click();
    await page.screenshot({ path: '/tmp/compact-header-' + theme + '.png', fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
});

test('Compact mode follows the calendar viewport breakpoint and closes an open menu when returning to wide tabs', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce', viewport: { width: 900, height: 1000 } });
  await page.locator('html[data-compact="false"]').waitFor();
  await page.locator('#toggle-calendar').click();
  await page.locator('#calendar-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('html').getAttribute('data-compact'), 'false');
  await page.locator('.calendar-panel-close').click();
  await page.locator('html[data-compact="false"]').waitFor();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('#compact-nav-trigger').click();
  await page.getByRole('menuitemradio', { name: 'Tools & Links', exact: true }).focus();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator('html[data-compact="false"]').waitFor();
  await page.locator('.compact-nav-menu').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-tools');
});


test('Calendar stacking, compact header and toolbars switch together without an intermediate card layout', async t => {
  const page = await calendarPage(t, 'overlap', { viewport: { width: 900, height: 1000 } });
  await selectPortalTab(page, 'actions');
  for (const width of [761, 760, 700, 600, 599, 390, 320, 760, 761]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('html[data-compact="' + (width <= 760) + '"]').waitFor();
    const main = await page.locator('#main').boundingBox();
    const calendar = await page.locator('#calendar-panel').boundingBox();
    assert.ok(width <= 760 ? calendar.y + calendar.height <= main.y + 1 : calendar.x >= main.x + main.width - 1);
    assert.equal(await page.locator('.portal-tabs').isVisible(), width > 760);
    assert.equal(await page.locator('#inbox-title').isVisible(), width > 760);
    if (width <= 760) {
      const event = page.locator('.calendar-event[data-expanded="true"]').first();
      assert.notEqual(await event.evaluate(el => getComputedStyle(el).display), 'grid', 'No intermediate two-column card layout');
      const trigger = await event.locator('.calendar-event-trigger').boundingBox();
      const detail = await event.locator('.calendar-event-detail').boundingBox();
      assert.ok(detail.y >= trigger.y + trigger.height - 1, 'Event detail stays below its title at every stacked width');
      const search = await page.locator('#actions-search').boundingBox();
      const counts = await page.locator('.queue-counts').boundingBox();
      assert.ok(counts.y >= search.y + search.height);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
});


test('Compact settings temporarily hide the calendar without changing its open preference', async t => {
  const page = await calendarPage(t, 'overlap', { viewport: { width: 600, height: 1000 }, reducedMotion: 'reduce' });
  const panel = page.locator('#calendar-panel');
  const toggle = page.locator('#toggle-calendar');
  const preference = () => page.evaluate(() => localStorage.getItem('portal-calendar-open'));
  await selectPortalTab(page, 'settings');
  assert.equal(await panel.isVisible(), false);
  assert.equal(await toggle.isVisible(), true);
  assert.equal(await toggle.getAttribute('aria-disabled'), 'true');
  assert.equal(await preference(), 'true');
  assert.equal(await toggle.locator('svg').count(), 1, 'Only the suppressed calendar icon is rendered');
  assert.equal(await toggle.locator('path[d="m2 2 20 20"]').count(), 1);
  // aria-disabled blocks the calendar action, but the real pointer can still open its explanation.
  await toggle.click({ force: true });
  const hint = page.getByRole('tooltip');
  await hint.waitFor();
  assert.equal(await hint.textContent(), 'In compact view, the calendar is hidden while Settings is open.');
  assert.equal(await preference(), 'true');
  assert.equal(await panel.isVisible(), false);
  await page.keyboard.press('Escape');
  await hint.waitFor({ state: 'hidden' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await hint.waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#setting-name').fill('Preserved draft');
  await page.locator('#compact-nav-trigger').click();
  await page.keyboard.press('Escape');
  assert.equal(await preference(), 'true');
  await page.setViewportSize({ width: 761, height: 1000 });
  await panel.waitFor({ state: 'visible' });
  assert.equal(await toggle.isVisible(), true);
  assert.equal(await page.locator('#setting-name').inputValue(), 'Preserved draft');
  await page.setViewportSize({ width: 760, height: 1000 });
  await panel.waitFor({ state: 'hidden' });
  for (const width of [761, 760, 900, 600, 761, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('html[data-compact="' + (width <= 760) + '"]').waitFor();
    assert.equal(await toggle.locator('svg').count(), 1, 'Resizing never accumulates icons');
    assert.equal(await toggle.locator('path[d="m2 2 20 20"]').count(), width <= 760 ? 1 : 0);
  }
  await selectPortalTab(page, 'actions');
  await panel.waitFor({ state: 'visible' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  await page.goBack();
  await page.locator('#settings-panel').waitFor({ state: 'visible' });
  assert.equal(await panel.isVisible(), false);
  assert.equal(await page.locator('#setting-name').inputValue(), 'Preserved draft');
  await page.goForward();
  await panel.waitFor({ state: 'visible' });
  assert.equal(await toggle.locator('svg').count(), 1, 'Tab changes retain one icon');
  assert.equal(await toggle.locator('path[d="m2 2 20 20"]').count(), 0);
  await toggle.click();
  assert.equal(await preference(), 'false');
  await selectPortalTab(page, 'settings');
  await selectPortalTab(page, 'tools');
  assert.equal(await panel.isVisible(), false);
  assert.equal(await toggle.isVisible(), true);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
});
