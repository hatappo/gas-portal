import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, bundleBrowser } from './helpers.mjs';

const client = await bundleBrowser({ connectGitHub: false });
const item = { service: 'github', serviceLabel: 'GitHub', id: 'acme/portal#1', title: 'Review changes', url: 'https://github.com/acme/portal/pull/1', context: 'acme/portal #1', updatedAt: '2026-11-04T12:00:00Z', reasons: ['Direct review'] };
const result = (items = [item], fetchedAt = 1700000000000) => ({ items, notices: [], fetchedAt });
function fixture(t, setup = () => {}) {
  const app = browser(setup, client); t.after(() => app.dom.window.close());
  const calls = [];
  const source = (id, serviceLabel = 'GitHub') => ({ id, label: id + '@octocat', serviceLabel, load(force, done) { calls.push({ id, force, done }); } });
  const api = app.dom.window.testPortal.actions;
  const start = () => app.document.getElementById('tab-actions').click();
  const refresh = app.document.getElementById('refresh-actions');
  const rows = () => [...app.document.querySelectorAll('.action-item-list > li')];
  return { ...app, calls, source, api, start, refresh, rows };
}

test('Fetch all connections in parallel, commit once, and deduplicate across connections with merged reasons', (t) => {
  const app = fixture(t);
  app.api.setSources('github', [app.source('a'), app.source('b')]); app.start();
  assert.equal(app.calls.length, 2, 'Both requests start before either responds');
  assert.equal(app.document.querySelectorAll('#actions-panel .refresh-catalog').length, 1);
  assert.equal(app.refresh.disabled, true);
  app.calls[1].done(result([{ ...item, reasons: ['Team review'] }]));
  assert.equal(app.rows().length, 0, 'Partial completion must not change the visible snapshot');
  app.calls[0].done(result());
  assert.equal(app.rows().length, 1);
  assert.equal(app.rows()[0].querySelectorAll('.action-item-kind').length, 2);
  assert.equal(app.document.getElementById('actions-count').textContent, '1 件を表示');
  assert.equal(app.refresh.disabled, false);
  const snapshot = app.document.getElementById('action-items').innerHTML;
  app.refresh.click(); app.refresh.click();
  assert.equal(app.calls.length, 4, 'Repeated clicks must not start another batch');
  assert.ok(app.calls.slice(2).every((call) => call.force));
  app.calls[2].done(result([{ ...item, title: 'Updated title' }]));
  assert.equal(app.document.getElementById('action-items').innerHTML, snapshot);
  app.calls[3].done(result([]));
  assert.match(app.rows()[0].textContent, /Updated title/);
});

test('Combine services without ID collisions, sort by update time, and show the oldest successful retrieval', (t) => {
  const app = fixture(t);
  app.api.setSources('github', [app.source('a')]);
  app.api.setSources('calendar', [app.source('b', 'Google Calendar')]); app.start();
  app.calls[0].done(result());
  app.calls[1].done(result([{ ...item, service: 'calendar', serviceLabel: 'Google Calendar', title: 'Meeting', updatedAt: '2026-11-05T12:00:00Z' }], 1700000300000));
  assert.equal(app.rows().length, 2);
  assert.match(app.rows()[0].textContent, /Meeting/);
  assert.equal(app.rows()[0].querySelector('.action-service').textContent, 'Google Calendar');
  assert.equal(app.document.getElementById('actions-freshness').textContent, new Intl.DateTimeFormat('ja', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(1700000000000));
  app.refresh.click();
  assert.equal(app.calls.length, 4);
  assert.ok(app.calls.slice(2).every((call) => call.force));
});

test('Commit successful results after a timeout, drop failed old data, and ignore late callbacks', (t) => {
  const timers = [];
  const app = fixture(t, (window) => { window.setTimeout = (fn) => { timers.push(fn); return timers.length; }; window.clearTimeout = () => {}; });
  app.api.setSources('github', [app.source('a'), app.source('b')]); app.start();
  app.calls[0].done(result()); app.calls[1].done(result([{ ...item, id: 'other', title: 'Old item' }]));
  assert.equal(app.rows().length, 2);
  app.refresh.click();
  app.calls[2].done(result());
  assert.equal(app.rows().length, 2);
  timers.at(-1)();
  assert.equal(app.rows().length, 1);
  assert.equal(app.refresh.disabled, false);
  assert.match(app.document.getElementById('actions-status').textContent, /b@octocat/);
  assert.match(app.document.getElementById('actions-status').textContent, /一部の結果/);
  app.calls[3].done(result([{ ...item, id: 'late' }]));
  assert.equal(app.rows().length, 1);
  app.refresh.click();
  app.calls[4].done(result([])); app.calls[5].done(result([]));
  assert.equal(app.document.getElementById('actions-status').hidden, true);
  assert.match(app.document.getElementById('action-items').textContent, /現在、対応が必要な項目はありません/);
});

test('Changing sources cancels old batches and removed credentials cannot restore visible data', (t) => {
  const app = fixture(t);
  const a = app.source('a'); const b = app.source('b');
  app.api.setSources('github', [a, b]); app.start();
  const old = app.calls.slice();
  app.api.setSources('github', [b]);
  assert.equal(app.calls.length, 3);
  old.forEach((call) => call.done(result([{ ...item, title: 'Obsolete' }])));
  assert.equal(app.rows().length, 0);
  app.calls[2].done(result());
  assert.equal(app.rows().length, 1);
  app.api.setSources('github', []);
  assert.equal(app.rows().length, 0);
  assert.match(app.document.getElementById('action-items').textContent, /サービスを接続/);
  assert.equal(app.refresh.disabled, true);
});

test('Solid retains focused rows through loading, language changes and refreshed data', (t) => {
  const app = fixture(t);
  app.api.setSources('github', [app.source('a')]); app.start();
  app.calls[0].done(result());
  const row = app.rows()[0];
  const link = row.querySelector('a');
  link.focus();
  app.refresh.click();
  assert.equal(app.rows()[0], row);
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.equal(app.rows()[0], row);
  assert.equal(app.document.activeElement, link);
  app.calls[1].done(result([{ ...item, title: 'New title', reasons: ['Changes requested'] }]));
  assert.equal(app.rows()[0], row);
  assert.equal(app.document.activeElement, link);
  assert.match(link.textContent, /New title/);
  assert.equal(row.querySelector('.action-item-kind').textContent, 'Changes requested');
});

test('Reconciled notices update their source label and error text after a connection changes', (t) => {
  const app = fixture(t);
  app.api.setSources('github', [app.source('a')]); app.start();
  app.calls[0].done({ items: [], notices: [{ message: 'First failure' }] });
  const changed = { ...app.source('a'), label: 'new-owner@octocat' };
  app.api.setSources('github', [changed]);
  app.calls[1].done({ items: [], notices: [{ message: 'Second failure' }] });
  const text = app.document.getElementById('actions-status').textContent;
  assert.match(text, /new-owner@octocat/);
  assert.match(text, /Second failure/);
  assert.doesNotMatch(text, /a@octocat|First failure/);
});

test('Error disclosure preserves user toggles and expands when all results become unavailable', (t) => {
  const app = fixture(t);
  app.api.setSources('github', [app.source('a')]); app.start();
  const notice = { message: 'Could not retrieve data from this connection. Try again.' };
  app.calls[0].done({ ...result(), notices: [notice] });
  const trigger = app.document.querySelector('#actions-status .disclosure-trigger');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false', 'Partial results start collapsed');
  trigger.click();
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  trigger.click();
  app.refresh.click();
  app.calls[1].done({ items: [], notices: [notice] });
  assert.equal(trigger.getAttribute('aria-expanded'), 'true', 'Total failure reveals its explanation');
  app.refresh.click();
  app.calls[2].done(result());
  assert.equal(app.document.querySelector('#actions-status .portal-disclosure'), null);
});
