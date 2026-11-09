import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, bundleBrowser, plain } from './helpers.mjs';
const client = await bundleBrowser({ connectGitHub: true, connectSlack: true, connectGmail: true });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const item = { id: 'abc1', threadId: 'def1', title: '<img src=x onerror=alert(1)> Proposal', sender: 'Alex <alex@example.com>', receivedAt: '2026-11-09T10:00:00Z' };
const response = (items = [item], extra = {}) => ({ ok: true, items, account: 'me@example.com', partial: false, error: '', hasMore: false, cached: false, fetchedAt: 1794220000000, ...extra });
function fixture(t) {
  const app = browser(() => {}, client); t.after(() => app.dom.window.close());
  return { ...app, get: id => app.document.getElementById(id), click: id => app.document.getElementById(id).click() };
}
async function initialize(app, enabled = true) {
  app.click('tab-actions');
  app.githubRequests[0].success({ ok: true, connections: [] });
  app.slackRequests[0].success({ ok: true, connections: [] });
  app.gmailRequests[0].success({ ok: true, settings: { enabled, limit: 20 } }); await flush();
}
test('Gmail loads lazily into Inbox, keeps mail out of Tasks, and shares forced refresh', async t => {
  const app = fixture(t); assert.equal(app.gmailRequests.length, 0);
  await initialize(app);
  assert.equal(app.gmailRequests[1].kind, 'actions');
  app.gmailRequests[1].success(response());
  const inbox = app.get('inbox-services');
  assert.equal(inbox.querySelector('img'), null);
  assert.equal(inbox.querySelector('.inbox-count').textContent, '1');
  const summary = inbox.querySelector('.inbox-summary');
  assert.equal(summary.getAttribute('aria-expanded'), 'false');
  summary.click();
  assert.equal(summary.getAttribute('aria-expanded'), 'true');
  assert.match(inbox.textContent, /Proposal/);
  assert.equal(inbox.querySelector('a').href, 'https://mail.google.com/mail/?authuser=me%40example.com#all/def1');
  assert.equal(inbox.querySelector('a').target, '_blank');
  assert.equal(app.get('action-items').querySelectorAll('.action-item-list > li').length, 0);
  assert.equal(app.get('action-filters'), null);
  app.get('actions-search').value = 'unmatched'; app.get('actions-search').dispatchEvent(new app.dom.window.Event('input'));
  assert.equal(inbox.querySelector('.inbox-count').textContent, '0');
  assert.equal(inbox.querySelectorAll('.inbox-message-list li').length, 0);
  app.get('actions-search').value = ''; app.get('actions-search').dispatchEvent(new app.dom.window.Event('input'));
  app.click('refresh-actions'); assert.equal(app.gmailRequests.at(-1).force, true);
  app.gmailRequests.at(-1).success(response([item], { hasMore: true }));
  assert.equal(inbox.querySelector('.inbox-summary'), summary, 'Refreshing preserves the open card');
  assert.equal(summary.getAttribute('aria-expanded'), 'true');
  assert.equal(inbox.querySelector('.inbox-count').textContent, '1+');
  assert.match(inbox.querySelector('.inbox-more-results').textContent, /取得上限/);
});
test('Disabling Gmail removes its rows and discards in-flight results; settings retain user drafts on failure', async t => {
  const app = fixture(t); await initialize(app);
  const pending = app.gmailRequests.at(-1);
  app.click('tab-settings'); app.click('settings-tab-actions');
  const headings = [...app.get('settings-actions-panel').querySelectorAll('h2')].map(el => el.textContent).filter(text => ['Gmail', 'Slack', 'GitHub'].includes(text));
  assert.deepEqual(headings, ['Gmail', 'Slack', 'GitHub']);
  app.click('gmail-enabled');
  const form = app.get('gmail-settings-form');
  form.dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  assert.deepEqual(plain(app.gmailRequests.at(-1).input), { enabled: false, limit: 20 });
  app.gmailRequests.at(-1).success({ ok: true, settings: { enabled: false, limit: 20 } }); await flush();
  pending.success(response()); app.click('tab-actions');
  assert.equal(app.get('inbox-services').querySelector('.inbox-card'), null);
  app.click('tab-settings'); app.click('gmail-enabled');
  form.dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  app.gmailRequests.at(-1).failure(); await flush();
  assert.equal(app.get('gmail-enabled').checked, true);
  assert.match(app.get('gmail-settings-host').querySelector('[role="alert"]').textContent, /保存結果を確認|保存.*確認/);
});
test('Gmail failures leave other services visible and initialization can be retried from Settings', async t => {
  const app = fixture(t); app.click('tab-actions');
  app.githubRequests[0].success({ ok: true, connections: [] });
  app.slackRequests[0].success({ ok: true, connections: [] });
  app.gmailRequests[0].failure(); await flush();
  assert.equal(app.get('refresh-actions').disabled, false);
  app.click('tab-settings'); app.click('settings-tab-actions');
  app.gmailRequests.at(-1).success({ ok: true, settings: { enabled: true, limit: 20 } }); await flush();
  app.dom.window.testPortal.actions.setSources('other', [{ id: 'x', label: 'Other', serviceLabel: 'Other', load(_force, done) { done({ items: [{ service: 'other', serviceLabel: 'Other', id: 'x', title: 'Other task', url: 'https://example.com', context: '', updatedAt: item.receivedAt, reasons: ['Task'] }], notices: [] }); } }]);
  app.click('tab-actions');
  app.gmailRequests.at(-1).success({ ok: false, error: 'AUTHORIZATION_REQUIRED' });
  assert.match(app.get('action-items').textContent, /Other task/);
  assert.match(app.get('actions-status').textContent, /authorizePortal/);
  assert.equal(app.get('refresh-actions').disabled, false);
});

test('Gmail empty subjects and source notices follow language changes without refetching', async t => {
  const app = fixture(t); await initialize(app);
  app.gmailRequests.at(-1).success(response([{ ...item, title: '' }], { hasMore: true }));
  assert.match(app.get('inbox-services').textContent, /（件名なし）/);
  assert.match(app.document.querySelector('.inbox-more-results').textContent, /未読/);
  const requests = app.gmailRequests.length;
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.match(app.get('inbox-services').textContent, /\(No subject\)/);
  assert.match(app.document.querySelector('.inbox-more-results').textContent, /More unread items/);
  assert.equal(app.gmailRequests.length, requests);
});
