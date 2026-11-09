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
  assert.equal(await page.locator('#actions-count').textContent(), '4 / 7 items');
  await page.locator('#refresh-actions').click();
  await page.waitForSelector('#refresh-actions[aria-busy="false"]');
  assert.equal(await page.locator('.action-item-list > li').count(), 4);
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
  await page.locator('#action-filters button').filter({ hasText: /^All$/ }).click();
  assert.equal(await page.locator('.action-item-list > li').count(), 7);
});

test('Tools and Actions share counter, timestamp, filter and refresh styling', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  const selectors = {
    tools: ['#count', '#catalog-freshness', '#refresh-catalog', '#tags .tag-button[aria-pressed="true"]', '#tag-filter', '.directory-toolbar', '.filter-toolbar'],
    actions: ['#actions-count', '#actions-freshness', '#refresh-actions', '#action-filters .tag-button[aria-pressed="true"]', '.action-type-filter', '.actions-toolbar', '.actions-summary'],
  };
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const controls = {};
    for (const tab of ['tools', 'actions']) {
      await page.locator('#tab-' + tab).click();
      if (tab === 'actions') await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
      controls[tab] = await page.evaluate(selectors => {
        const style = (selector, keys) => {
          const value = getComputedStyle(document.querySelector(selector));
          return Object.fromEntries(keys.map(key => [key, value[key]]));
        };
        const button = ['fontSize', 'fontWeight', 'borderRadius', 'minHeight', 'paddingInlineStart', 'paddingInlineEnd'];
        return {
          counter: style(selectors[0], ['fontSize', 'fontFamily', 'fontVariantNumeric', 'minWidth']),
          time: document.querySelector(selectors[1]).textContent,
          refresh: style(selectors[2], button),
          filter: style(selectors[3], [...button, 'backgroundColor', 'color', 'boxShadow']),
          row: style(selectors[4], ['gap', 'flexWrap', 'paddingBottom']),
          toolbar: style(selectors[5], ['gap', 'marginBottom']),
          summary: style(selectors[6], ['gap']),
        };
      }, selectors[tab]);
      assert.match(controls[tab].time, /^Retrieved \d{2}:\d{2}$/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${tab} at ${width}px`);
    }
    for (const key of ['counter', 'refresh', 'filter', 'row', 'toolbar', 'summary']) assert.deepEqual(controls.tools[key], controls.actions[key], `${key} at ${width}px`);
  }
});

test('Filter chips reserve borders for selection and retain visible keyboard focus without resizing', async t => {
  const page = await pageFor(t, { reducedMotion: 'reduce' });
  for (const theme of ['lofi', 'dracula']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const tab of ['tools', 'actions']) {
      await page.locator('#tab-' + tab).click();
      if (tab === 'actions') await page.waitForSelector('#action-items[aria-busy="false"] .action-item-list');
      const host = tab === 'tools' ? '#tags' : '#action-filters';
      const chip = page.locator(host + ' .tag-button[aria-pressed="false"]').first();
      const read = el => {
        const style = getComputedStyle(el), bounds = el.getBoundingClientRect();
        return { border: style.borderColor, shadow: style.boxShadow, width: bounds.width, height: bounds.height, outline: style.outlineStyle, outlineWidth: style.outlineWidth };
      };
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
  await page.locator('#tab-actions').click();
  await page.locator('.action-item-list > li').first().waitFor();
  const titles = await page.locator('.action-item-title').allTextContents();
  const search = page.getByRole('searchbox', { name: 'Search by title or message' });
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
  await page.locator('#tab-settings').click();
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
  for (const tab of ['#tab-actions', '#tab-settings', '#tab-tools']) { await page.locator(tab).click(); assert.equal(await page.locator('#calendar-panel').isVisible(), true); }
  await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
  assert.equal(await page.locator('#calendar-panel').isVisible(), false);
  assert.equal(await page.locator('#toggle-calendar').evaluate(el => el === document.activeElement), true);
});

test('Calendar settings persist, narrow screens remain usable and in-page notices can be enabled', async t => {
  const page = await calendarPage(t, 'alert', { viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  await page.locator('#tab-settings').click();
  await page.locator('#settings-tab-calendar').click();
  await page.locator('#settings-calendar-panel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#settings-tab-calendar').textContent(), 'Calendar');
  assert.equal(await page.locator('#calendar-panel').isVisible(), true);
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
  await page.locator('#toggle-calendar').click();
  await page.locator('.calendar-settings fieldset:not([disabled])').waitFor();
  assert.equal(await page.getByLabel('Calendar cache duration', { exact: true }).inputValue(), '900');
  assert.equal(await page.getByLabel('Upcoming-event notice', { exact: true }).inputValue(), '5');
  assert.equal(await page.getByLabel('Animate upcoming events', { exact: true }).count(), 0);
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

test('Calendar uses Lucide pin actions, stronger Next badges and horizontal details when stacked', async t => {
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
  assert.ok(detail.x >= title.x + title.width - 1);
  assert.ok(detail.y < title.y + title.height);
  assert.ok(await page.locator('.calendar-next-badge').evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 11);
  for (const width of [1440, 1280, 1000, 700]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const tab of ['tools', 'actions']) {
      await page.locator('#tab-' + tab).click();
      const toolbar = page.locator(tab === 'tools' ? '.directory-toolbar' : '.actions-toolbar');
      const search = await toolbar.locator('.search-controls').boundingBox();
      const controls = await toolbar.locator(tab === 'tools' ? '.filter-toolbar' : '.actions-summary').boundingBox();
      assert.ok(Math.abs(search.y + search.height / 2 - controls.y - controls.height / 2) < 2, `${tab} controls should stay beside search at ${width}px`);
    }
  }
});


test('Calendar hover waits 180ms, cancels brief passes, and keeps keyboard expansion immediate', async t => {
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
    await page.clock.runFor(179);
    assert.equal(await row.getAttribute('data-expanded'), 'false', selector + ' should wait');
    if (!selector.includes('future')) assert.equal(await page.locator('.calendar-schedule').getAttribute('data-browsing-past'), 'false');
    await move(header);
    await page.clock.runFor(500);
    assert.equal(await row.getAttribute('data-expanded'), 'false', selector + ' should cancel');
    assert.equal(await page.locator('.calendar-schedule').getAttribute('data-browsing-past'), 'false');
    await move(row);
    await page.clock.runFor(180);
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
  await page.locator('#tab-settings').click();
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
    assert.equal(await tab.locator('svg').evaluate(el => parseFloat(getComputedStyle(el).strokeWidth)), 1.75);
  }
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
  await page.locator('#tab-settings').click();
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
  await page.locator('#tab-settings').click();
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
  await page.locator('#tab-settings').click();
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

test('Gmail settings precede Slack and GitHub, persist across reload and join the shared Action Items filters', async t => {
  const page = await pageFor(t);
  await page.locator('#tab-settings').click();
  await page.locator('#settings-tab-actions').click();
  const settings = page.locator('#settings-actions-panel');
  const headings = await settings.locator('h2').allTextContents();
  assert.deepEqual(headings.filter(text => ['Gmail', 'Slack', 'GitHub'].includes(text)), ['Gmail', 'Slack', 'GitHub']);
  await page.getByLabel('Show unread Gmail in Action Items', { exact: true }).check();
  await page.getByLabel('Maximum unread messages', { exact: true }).selectOption('50');
  await page.locator('#gmail-settings-form button[type="submit"]').click();
  await page.locator('#gmail-settings-host').getByText('Saved', { exact: true }).waitFor();
  await page.reload();
  await page.locator('#gmail-enabled:enabled').waitFor();
  assert.equal(await page.getByLabel('Show unread Gmail in Action Items', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Maximum unread messages', { exact: true }).inputValue(), '50');
  await page.locator('#tab-actions').click();
  const filter = page.getByRole('button', { name: 'Gmail Unread mail', exact: true });
  await filter.click();
  assert.equal(await page.locator('.action-item-list > li').count(), 3);
  await page.getByRole('searchbox', { name: 'Search by title or message', exact: true }).fill('proposal');
  assert.equal(await page.locator('.action-item-list > li').count(), 1);
  assert.match(await page.locator('.action-item-list a').getAttribute('href'), /^https:\/\/mail.google.com\/mail\/\?authuser=demo%40example.com#all\//);
  await page.locator('#refresh-actions').click();
  await page.locator('#refresh-actions[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.action-item-list > li').count(), 1);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: '/tmp/gmail-action-items-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});
