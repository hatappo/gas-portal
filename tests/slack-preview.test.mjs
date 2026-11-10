import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewPage, runPreviewMock, plain } from './helpers.mjs';

const id = '33333333-3333-4333-8333-333333333333';
test('Slack preview is wired into the page, accepts only dummy credentials and keeps them out of storage', t => {
  const dom = previewPage(t), storage = {};
  const { call, document } = runPreviewMock(dom, { storage, search: '?slack=disconnected' });
  const originalStorage = { ...storage };
  assert.equal(document.querySelector('#slack-token').placeholder, 'demo');
  assert.equal(call('getSlackConnections').connections.length, 0);
  assert.equal(call('saveSlackConnection', { id: '', token: 'xoxp-REAL-SECRET' }).error, 'INVALID_INPUT');
  assert.equal(call('saveSlackConnection', { id: '', token: '' }).error, 'INVALID_INPUT');
  assert.equal(call('saveSlackConnection', { id: '', token: 'demo' }).connection.label, 'Example workspace@demo-user');
  assert.equal(call('getSlackActionItems', id).items.length, 2);
  assert.doesNotMatch(JSON.stringify(call('getSlackConnections')), /"token"|SECRET/);
  assert.deepEqual(storage, originalStorage);
  assert.equal(call('disconnectSlack', id).ok, true);
  assert.equal(call('getSlackActionItems', id).error, 'INVALID_CONNECTION');
});

test('Slack preview shares the Actions duration and supports empty, partial and failed reads', t => {
  const dom = previewPage(t);
  const { call } = runPreviewMock(dom);
  assert.equal(call('getSlackActionItems', id).cached, false);
  assert.equal(call('getSlackActionItems', id).cached, true);
  assert.equal(call('getSlackActionItems', id, true).cached, false);
  call('saveActionsCacheTtl', 0);
  assert.equal(call('getSlackActionItems', id).cached, false);
  assert.equal(call('getSlackActionItems', id).cached, false);
  for (const scenario of ['empty', 'partial', 'unauthorized', 'rate-limit', 'scope', 'error']) {
    const { call: rpc } = runPreviewMock(previewPage(t), { search: '?slack=' + scenario });
    const response = plain(rpc('getSlackActionItems', id));
    if (scenario === 'empty') assert.deepEqual(response.items, []);
    else if (scenario === 'partial') {
      assert.equal(response.items.length, 2); assert.equal(response.partial, true);
      assert.equal(rpc('getSlackActionItems', id).cached, false);
    } else { assert.equal(response.ok, false); assert.ok(response.error); }
  }
});

test('Slack preview uses a fixed 200-item limit without a setting or stored preference', t => {
  const storage = { 'portal-preview-slack-limit': '10' }, dom = previewPage(t);
  const { call, document } = runPreviewMock(dom, { storage, search: '?slack=more' });
  const response = call('getSlackActionItems', id);
  assert.equal(response.items.length, 200);
  assert.equal(response.hasMore, true);
  assert.equal(document.querySelector('#slack-bookmark-limit'), null);
  assert.equal(call('saveSlackBookmarkLimit', 20).ok, false);
  assert.equal(call('getSlackActionItems', id).items.length, 200);
  assert.equal(storage['portal-preview-slack-limit'], '10');
});
