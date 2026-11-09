import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, bundleBrowser } from './helpers.mjs';

const client = await bundleBrowser({ connectSlack: true });
const connection = { id: '33333333-3333-4333-8333-333333333333', label: 'Demo@alex' };
const item = { id: 'TDEMO:CDEMO:1793987462.000001', title: '<img src=x onerror=alert(1)> Saved message', url: 'https://demo.slack.com/archives/CDEMO/p1793987462000001', context: 'Demo · team', postedAt: '2026-11-06T18:00:00Z' };
const response = (items = [item], overrides = {}) => ({ ok: true, items, error: '', partial: false, fetchedAt: 1793990000000, cached: false, ...overrides });
function fixture(t) {
  const app = browser(() => {}, client); t.after(() => app.dom.window.close());
  const click = id => app.document.getElementById(id).click();
  return { ...app, click, get(id) { return app.document.getElementById(id); } };
}
function connect(app, connections = [connection]) {
  app.githubRequests[0].success({ ok: true, connections: [] });
  app.slackRequests[0].success({ ok: true, connections });
}

test('Slack initializes lazily, waits for both providers, and renders safe posted-message rows', t => {
  const app = fixture(t);
  assert.equal(app.slackRequests.length, 0);
  app.click('tab-actions');
  assert.equal(app.slackRequests.length, 1);
  app.slackRequests[0].success({ ok: true, connections: [connection] });
  assert.equal(app.slackRequests.length, 1, 'Wait for GitHub metadata before starting a batch');
  app.githubRequests[0].success({ ok: true, connections: [] });
  assert.equal(app.slackRequests.length, 2);
  assert.equal(app.slackRequests[1].kind, 'actions');
  assert.equal(app.get('refresh-actions').getAttribute('aria-busy'), 'true');
  app.slackRequests[1].success(response());
  assert.equal(app.get('refresh-actions').getAttribute('aria-busy'), 'false');
  assert.match(app.get('action-items').textContent, /ブックマーク/);
  assert.match(app.get('action-items').textContent, /投稿/);
  assert.equal(app.get('action-items').querySelector('img'), null);
  assert.equal(app.get('action-items').querySelector('a').target, '_blank');
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.match(app.get('action-items').textContent, /Posted/);
  app.click('refresh-actions');
  assert.equal(app.slackRequests[2].force, true);
  assert.equal(app.get('action-items').querySelectorAll('li').length, 1, 'Keep the snapshot during refresh');
  app.slackRequests[2].success(response([]));
  assert.match(app.get('action-items').textContent, /No tasks right now/);
});

test('A single refresh starts GitHub and Slack together and commits only after both finish', t => {
  const app = fixture(t); app.click('tab-actions');
  app.githubRequests[0].success({ ok: true, connections: [{ id: 'gh', label: '*@alex', login: 'alex', owner: '' }] });
  assert.equal(app.githubRequests.length, 1, 'Do not duplicate early GitHub searches');
  app.slackRequests[0].success({ ok: true, connections: [connection] });
  assert.equal(app.githubRequests.length, 2); assert.equal(app.slackRequests.length, 2);
  app.githubRequests[1].success({ ok: true, groups: [{ kind: 'assigned', items: [{ id: 'repo#1', title: 'GitHub task', url: 'https://github.com/demo/repo/issues/1', repository: 'demo/repo', number: 1, updatedAt: '2026-11-06T19:00:00Z', reasons: ['assigned'] }], partial: false, error: '', searchUrl: '' }], fetchedAt: 1793990000000 });
  assert.equal(app.get('action-items').querySelectorAll('li').length, 0);
  app.slackRequests[1].success(response());
  assert.equal(app.get('action-items').querySelectorAll('li').length, 2);
  assert.deepEqual([...app.get('action-items').querySelectorAll('.action-service')].map(node => node.textContent), ['GitHub', 'Slack']);
  app.click('refresh-actions');
  assert.equal(app.githubRequests[2].force, true); assert.equal(app.slackRequests[2].force, true);
  app.githubRequests[2].success({ ok: false, error: 'UNAUTHORIZED' }); app.slackRequests[2].success(response());
  assert.equal(app.get('action-items').querySelectorAll('li').length, 1);
  assert.equal(app.get('actions-status').hidden, false);
});

test('Slack settings save and clear passwords, edit without revealing credentials, and disconnect', t => {
  const app = fixture(t); app.click('tab-settings'); connect(app, []);
  app.click('settings-tab-actions'); app.click('add-slack');
  app.get('slack-token').value = 'xoxp-TEST-SECRET';
  app.get('slack-settings-form').dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  assert.equal(app.slackRequests[1].input.token, 'xoxp-TEST-SECRET');
  assert.equal(app.get('slack-token').value, '');
  assert.equal(app.get('slack-settings-fields').disabled, true);
  app.slackRequests[1].success({ ok: true, connection });
  assert.equal(app.get('slack-settings-form').hidden, true);
  assert.match(app.get('slack-connections').textContent, /Demo@alex/);
  assert.doesNotMatch(app.document.body.innerHTML, /TEST-SECRET/);
  app.get('slack-connections').querySelector('button').click();
  assert.equal(app.get('slack-token').required, false);
  assert.equal(app.get('slack-token').value, '••••••••');
  assert.equal(app.get('slack-token').readOnly, true);
  app.click('cancel-slack');
  app.dom.window.confirm = () => true;
  app.get('slack-connections').querySelectorAll('button')[1].click();
  assert.equal(app.slackRequests[2].kind, 'disconnect');
  app.slackRequests[2].success({ ok: true });
  assert.equal(app.get('slack-connections').children.length, 0);
});

test('Slack reports missing scopes and partial failures, rejects hostile URLs, and recovers', t => {
  const app = fixture(t); app.click('tab-actions'); connect(app);
  app.slackRequests[1].success(response([item], { error: 'RATE_LIMITED', partial: true }));
  assert.equal(app.get('action-items').querySelectorAll('li').length, 1);
  assert.match(app.get('actions-status').textContent, /レート制限/);
  app.click('refresh-actions');
  app.slackRequests[2].success(response([{ ...item, url: 'https://demo.slack.com.evil.test/archives/C/p1' }]));
  assert.equal(app.get('action-items').querySelectorAll('li').length, 0);
  assert.match(app.get('actions-status').textContent, /Slack のデータを取得できません/);
  app.click('refresh-actions');
  app.slackRequests[3].success({ ok: false, error: 'MISSING_SCOPE' });
  assert.match(app.get('actions-status').textContent, /search:read/);
  app.click('refresh-actions'); app.slackRequests[4].success(response());
  assert.equal(app.get('actions-status').hidden, true);
});

test('A provider metadata failure does not block the other provider and can be retried', t => {
  const app = fixture(t); app.click('tab-actions');
  app.slackRequests[0].success({ ok: true, connections: [connection] });
  app.githubRequests[0].failure();
  assert.equal(app.slackRequests.length, 2);
  app.slackRequests[1].success(response());
  assert.equal(app.get('action-items').querySelectorAll('li').length, 1);
  assert.equal(app.get('refresh-actions').disabled, false);
});

test('Refresh preserves force intent while failed provider metadata is retried', t => {
  const app = fixture(t); app.click('tab-actions');
  app.slackRequests[0].success({ ok: true, connections: [connection] });
  app.githubRequests[0].failure(); app.slackRequests[1].success(response());
  app.click('refresh-actions');
  assert.equal(app.githubRequests[1].kind, 'connections');
  assert.equal(app.slackRequests.length, 2, 'Wait for the metadata retry');
  app.githubRequests[1].success({ ok: true, connections: [] });
  assert.equal(app.slackRequests[2].force, true, 'The surviving connection must bypass its cache');
  app.slackRequests[2].success(response());
  assert.equal(app.get('refresh-actions').disabled, false);
});

test('Slack limit autosaves, rolls back failures, and invalidates the old snapshot for the next tab visit', t => {
  const app = fixture(t); app.click('tab-actions'); connect(app);
  app.slackRequests[1].success(response());
  app.click('tab-settings'); app.click('settings-tab-actions');
  const limit = app.get('slack-bookmark-limit');
  assert.equal(limit.value, '20');
  assert.deepEqual([...limit.options].map(option => option.value), ['10', '20', '50', '100', '200']);
  limit.value = '50'; limit.dispatchEvent(new app.dom.window.Event('change'));
  assert.equal(app.slackRequests[2].kind, 'limit');
  assert.equal(app.slackRequests[2].limit, 50);
  assert.equal(limit.disabled, true);
  app.slackRequests[2].success({ ok: false });
  assert.equal(limit.value, '20'); assert.equal(limit.disabled, false);
  limit.value = '50'; limit.dispatchEvent(new app.dom.window.Event('change'));
  app.slackRequests[3].success({ ok: true, limit: 50 });
  assert.equal(limit.dataset.savedValue, '50');
  assert.equal(app.slackRequests.length, 4, 'Do not fetch messages from Settings');
  app.click('tab-actions');
  assert.equal(app.slackRequests[4].kind, 'actions');
  app.slackRequests[4].success(response());
});

test('More Slack results are informational, separate from errors, and survive refresh and language changes', t => {
  const app = fixture(t); app.click('tab-actions'); connect(app);
  app.slackRequests[1].success(response([item], { hasMore: true }));
  assert.equal(app.get('actions-status').hidden, true);
  assert.match(app.get('action-items').querySelector('.action-more-results').textContent, /Demo@alex.*このほかにも検索結果/);
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.match(app.get('action-items').querySelector('.action-more-results').textContent, /More search results/);
  app.click('refresh-actions');
  assert.ok(app.get('action-items').querySelector('.action-more-results'));
  app.slackRequests[2].success(response([item], { hasMore: false }));
  assert.equal(app.get('action-items').querySelector('.action-more-results'), null);
});
