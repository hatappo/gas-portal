import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser } from './helpers.mjs';

const connection = { id: '11111111-1111-4111-8111-111111111111', label: 'acme@octocat', login: 'octocat', owner: 'acme' };
const item = { id: 'acme/portal#1', title: '<img src=x onerror=alert(1)>', repository: 'acme/portal', number: 1, updatedAt: '2026-11-04T12:00:00Z', kind: 'pull', url: 'https://github.com/acme/portal/pull/1', reasons: ['direct'] };
const response = { ok: true, fetchedAt: Date.now(), cached: false, groups: [
  { kind: 'assigned', items: [], total: 0, partial: false, error: '', searchUrl: 'https://github.com/search' },
  { kind: 'direct', items: [item], total: 1, partial: false, error: '', searchUrl: 'https://github.com/search' },
  { kind: 'team', items: [{ ...item, reasons: ['team'] }], total: 1, partial: false, error: '', searchUrl: 'https://github.com/search' },
] };
function appFor(t, setup) { const app = browser(setup); t.after(() => app.dom.window.close()); return app; }
function open(app, tab = 'actions') {
  app.document.getElementById('tab-' + tab).click();
  if (tab === 'settings') app.document.getElementById('settings-tab-actions').click();
  app.githubRequests[0].success({ ok: true, connections: [connection] });
}
function submit(app, value) {
  app.document.getElementById('add-github').click();
  app.document.getElementById('github-owner').value = 'new-org';
  app.document.getElementById('github-token').value = value;
  app.document.getElementById('github-settings-form').dispatchEvent(new app.dom.window.Event('submit', { bubbles: true, cancelable: true }));
}

test('Load GitHub only when its tab is visited, deduplicate reviews, and safely render external links', (t) => {
  const app = appFor(t);
  assert.equal(app.githubRequests.length, 0);
  open(app);
  assert.equal(app.githubRequests[1].kind, 'actions');
  app.githubRequests[1].success(response);
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 1);
  assert.equal(app.document.querySelectorAll('#action-items img').length, 0);
  assert.match(app.document.querySelector('#action-items').textContent, /直接のレビュー依頼/);
  assert.match(app.document.querySelector('#action-items').textContent, /チームへのレビュー依頼/);
  assert.equal(app.document.querySelector('.action-item-title').target, '_blank');
  assert.equal(app.document.querySelector('.action-item-title').rel, 'noopener noreferrer');
  app.document.getElementById('tab-tools').click(); app.document.getElementById('tab-actions').click();
  assert.equal(app.githubRequests.length, 2);
  app.document.querySelector('#refresh-actions').click();
  assert.equal(app.githubRequests[2].force, true);
  app.githubRequests[2].success({ ok: false, error: 'UNAUTHORIZED' });
  assert.match(app.document.getElementById('actions-status').textContent, /認証が無効/);
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 0);
});

test('Keep connections independent and never label failed or partial retrievals as empty', (t) => {
  const app = appFor(t); app.document.getElementById('tab-actions').click();
  app.githubRequests[0].success({ ok: true, connections: [connection, { ...connection, id: '22222222-2222-4222-8222-222222222222', label: 'other@octocat', owner: 'other' }] });
  app.githubRequests[1].success(response);
  app.githubRequests[2].success({ ok: true, fetchedAt: Date.now(), groups: [{ ...response.groups[0], partial: true, error: 'FORBIDDEN' }] });
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 1);
  assert.match(app.document.getElementById('actions-status').textContent, /アクセスが拒否/);
  assert.doesNotMatch(app.document.getElementById('action-items').textContent, /現在、対応が必要な項目はありません/);
});

test('Initialize connection metadata from a direct Settings hash without loading action data', (t) => {
  const app = appFor(t, (window) => window.history.replaceState(null, '', '#settings'));
  assert.equal(app.githubRequests[0].kind, 'connections');
  app.githubRequests[0].success({ ok: true, connections: [] });
  assert.equal(app.githubRequests.length, 1);
  assert.equal(app.document.getElementById('add-github').disabled, false);
});

test('Clear the token field on save and preserve a pending save across tab navigation and other requests', (t) => {
  const app = appFor(t); open(app, 'settings');
  submit(app, 'github_pat_TEST_SECRET');
  const save = app.githubRequests.find((request) => request.kind === 'save');
  assert.equal(save.input.token, 'github_pat_TEST_SECRET');
  assert.deepEqual(Object.keys(save.input).sort(), ['id', 'owner', 'token']);
  assert.equal(save.input.owner, 'new-org');
  assert.equal(app.document.getElementById('github-label'), null);
  assert.equal(app.document.getElementById('github-repositories'), null);
  assert.equal(app.document.getElementById('github-token').value, '');
  assert.doesNotMatch(app.document.documentElement.outerHTML, /TEST_SECRET/);
  app.document.getElementById('tab-actions').click();
  const actions = app.githubRequests.find((request) => request.kind === 'actions');
  actions.success(response);
  save.success({ ok: true, connection: { ...connection, id: '22222222-2222-4222-8222-222222222222', label: 'new-org@octocat', owner: 'new-org' } });
  assert.equal(app.document.getElementById('github-settings-fields').disabled, false);
  assert.match(app.document.getElementById('github-connections').textContent, /new-org/);
  assert.equal(app.githubRequests.filter((request) => request.kind === 'actions').length, 3);
});

test('Ignore late results after a connection is disconnected and remove its visible data', (t) => {
  const app = appFor(t, (window) => { window.confirm = () => true; }); open(app);
  const pending = app.githubRequests[1];
  app.document.getElementById('tab-settings').click();
  app.document.querySelectorAll('#github-connections button')[1].click();
  const disconnect = app.githubRequests.find((request) => request.kind === 'disconnect');
  disconnect.success({ ok: true }); pending.success(response);
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 0);
  assert.equal(app.document.getElementById('github-connections').children.length, 0);
});

test('Ignore timed-out callbacks, allow retry, and preserve unavailable states without unsafe links', (t) => {
  const callbacks = [];
  const app = appFor(t, (window) => { window.setTimeout = (fn) => { callbacks.push(fn); return callbacks.length; }; window.clearTimeout = () => {}; });
  open(app); const pending = app.githubRequests[1];
  callbacks.at(-1)(); pending.success(response);
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 0);
  app.document.querySelector('#refresh-actions').click();
  const retry = app.githubRequests.at(-1);
  pending.failure();
  retry.success({ ...response, groups: [{ ...response.groups[0], items: [{ ...item, url: 'javascript:evil()' }] }] });
  assert.equal(app.document.querySelector('.action-item-title').hasAttribute('href'), false);
});

test('Recover from malformed action responses and translate dynamic result labels after language changes', (t) => {
  const app = appFor(t); open(app);
  app.githubRequests[1].success({ ...response, groups: [null] });
  assert.match(app.document.getElementById('actions-status').textContent, /取得できません/);
  app.document.querySelector('#refresh-actions').click();
  app.githubRequests.at(-1).success(response);
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.match(app.document.getElementById('action-items').textContent, /Direct review/);
  assert.match(app.document.getElementById('action-items').textContent, /Team review/);
});

test('Edit an unscoped connection without requiring a name or replacement token', (t) => {
  const app = appFor(t);
  app.document.getElementById('tab-settings').click();
  app.githubRequests[0].success({ ok: true, connections: [{ ...connection, label: '*@octocat', owner: '' }] });
  assert.equal(app.document.querySelector('#github-connections strong').textContent, '*@octocat');
  assert.match(app.document.getElementById('github-connections').textContent, /アクセス可能なすべてのリポジトリ/);
  app.document.getElementById('settings-tab-actions').click();
  app.document.querySelector('#github-connections button').click();
  assert.equal(app.document.getElementById('github-token').required, false);
  assert.equal(app.document.activeElement.id, 'github-token');
  app.document.getElementById('github-settings-form').dispatchEvent(new app.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  const save = app.githubRequests.find((request) => request.kind === 'save');
  assert.equal(save.input.id, connection.id);
  assert.equal(save.input.owner, '');
  assert.equal(save.input.token, '');
});

test('Render changes requested alongside the original categories and translate its badge', (t) => {
  const app = appFor(t); open(app);
  const changedItem = { ...item, id: 'other/project#2', repository: 'other/project', number: 2, title: 'My contribution', url: 'https://github.com/other/project/pull/2', reasons: ['changes'] };
  app.githubRequests[1].success({ ...response, groups: [...response.groups, {
    kind: 'changes', items: [changedItem], total: 1, partial: false, error: '', searchUrl: 'https://github.com/search',
  }] });
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 2);
  assert.match(app.document.getElementById('action-items').textContent, /修正依頼あり/);
  assert.match(app.document.getElementById('action-items').textContent, /other\/project #2/);
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.match(app.document.getElementById('action-items').textContent, /Changes requested/);
  app.document.querySelector('#refresh-actions').click();
  app.githubRequests.at(-1).success({ ...response, groups: [...response.groups, {
    kind: 'changes', items: [], total: 0, partial: true, error: 'REQUEST_FAILED', searchUrl: 'https://github.com/search',
  }] });
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 1);
  assert.match(app.document.getElementById('actions-status').textContent, /Changes requested · Could not load GitHub data/);
});

test('An empty result describes all four categories', (t) => {
  const app = appFor(t); open(app);
  app.githubRequests[1].success({ ...response, groups: ['assigned', 'direct', 'team', 'changes'].map((kind) => ({ ...response.groups[0], kind, items: [] })) });
  assert.match(app.document.getElementById('action-items').textContent, /現在、対応が必要な項目はありません/);
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 0);
});

test('Keep scope@token-user in settings while the unified queue uses service and repository labels', (t) => {
  const app = appFor(t); open(app, 'settings');
  const row = app.document.querySelector('#github-connections li');
  assert.equal(row.querySelector('strong').textContent, 'acme@octocat');
  assert.equal(row.querySelector('p'), null);
  app.document.getElementById('tab-actions').click();
  app.githubRequests.at(-1).success(response);
  assert.equal(app.document.querySelector('.action-service').textContent, 'GitHub');
  assert.equal(app.document.querySelector('.action-context').textContent, 'acme/portal #1');
  assert.doesNotMatch(app.document.getElementById('action-items').textContent, /acme@octocat/);
});

test('Use refresh spinners without loading messages and retain the previous items while refreshing', (t) => {
  const app = appFor(t);
  app.document.getElementById('tab-actions').click();
  assert.equal(app.document.getElementById('refresh-actions').getAttribute('aria-busy'), 'true');
  assert.equal(app.document.getElementById('actions-status').textContent, '');
  app.githubRequests[0].success({ ok: true, connections: [connection] });
  assert.equal(app.document.querySelectorAll('#actions-panel .refresh-catalog').length, 1);
  let refresh = app.document.querySelector('#refresh-actions');
  assert.equal(refresh.getAttribute('aria-busy'), 'true');
  assert.doesNotMatch(app.document.getElementById('action-items').textContent, /取得中|Fetching|読み込み/);
  assert.equal(app.document.querySelector('#action-items .status'), null);
  app.githubRequests[1].success(response);
  refresh = app.document.querySelector('#refresh-actions');
  assert.equal(refresh.getAttribute('aria-busy'), 'false');
  refresh.click();
  assert.equal(app.document.querySelectorAll('.action-item-list > li').length, 1);
  assert.equal(app.document.querySelector('#refresh-actions').getAttribute('aria-busy'), 'true');
  app.githubRequests.at(-1).failure();
  assert.equal(app.document.querySelector('#refresh-actions').getAttribute('aria-busy'), 'false');
  assert.equal(app.document.querySelector('#action-items .status'), null, 'Failure must not look like a successful empty result');
});

test('Use the same empty-state presentation for Tools, disconnected Actions, and successful zero-item connections', (t) => {
  const app = appFor(t);
  app.requests[0].success({ ok: true, tools: [], issues: [] });
  const title = app.document.getElementById('status-title').textContent;
  assert.equal(title, '表示する項目がありません');
  app.document.getElementById('tab-actions').click();
  app.githubRequests[0].success({ ok: true, connections: [] });
  assert.equal(app.document.querySelector('#action-items .status h3').textContent, title);
  assert.match(app.document.querySelector('#action-items .status p').textContent, /サービスを接続/);
  const connected = appFor(t); open(connected);
  connected.githubRequests[1].success({ ...response, groups: response.groups.map((group) => ({ ...group, items: [] })) });
  assert.equal(connected.document.querySelector('#action-items .status h3').textContent, title);
});

test('Show only a spinner while initial Settings connections load and clear it on failure and retry', (t) => {
  const app = appFor(t, (window) => window.history.replaceState(null, '', '#settings/actions'));
  const spinner = app.document.getElementById('github-settings-loading');
  const status = app.document.getElementById('github-settings-status');
  assert.equal(spinner.hidden, false);
  assert.equal(spinner.getAttribute('aria-busy'), 'true');
  assert.equal(spinner.getAttribute('aria-label'), '読み込み中です');
  assert.equal(status.textContent, '');
  app.githubRequests[0].failure();
  assert.equal(spinner.hidden, true);
  assert.notEqual(status.textContent, '');
  app.document.getElementById('retry-github-settings').click();
  assert.equal(spinner.hidden, false);
  assert.equal(status.textContent, '');
  app.githubRequests[1].success({ ok: true, connections: [connection] });
  assert.equal(spinner.hidden, true);
  assert.equal(status.textContent, '');
  assert.equal(app.githubRequests.length, 2, 'Settings must not start task searches');
});

test('The shared refresh control retries initial metadata failures without a second retry button', (t) => {
  const app = appFor(t); app.document.getElementById('tab-actions').click();
  app.githubRequests[0].failure();
  const refresh = app.document.getElementById('refresh-actions');
  assert.equal(refresh.disabled, false);
  assert.equal(app.document.getElementById('retry-actions'), null);
  refresh.click();
  assert.equal(app.githubRequests[1].kind, 'connections');
  assert.equal(refresh.disabled, true);
  app.githubRequests[1].success({ ok: true, connections: [connection] });
  assert.equal(app.githubRequests[2].kind, 'actions');
  app.githubRequests[2].success(response);
  assert.equal(refresh.disabled, false);
  assert.equal(app.document.getElementById('actions-status').hidden, true);
});
