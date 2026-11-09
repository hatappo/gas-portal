import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewPage, runPreviewMock, plain } from './helpers.mjs';
test('Gmail preview starts disabled, persists preferences and shares the Actions cache', t => {
  const storage = {}, { call } = runPreviewMock(previewPage(t), { storage });
  assert.equal(call('getGmailSettings').settings.enabled, false);
  assert.equal(call('getGmailActionItems').error, 'DISABLED');
  assert.equal(call('saveGmailSettings', { enabled: true, limit: 50 }).ok, true);
  assert.equal(call('getGmailActionItems').cached, false);
  assert.equal(call('getGmailActionItems').cached, true);
  assert.equal(call('getGmailActionItems', true).cached, false);
  call('saveActionsCacheTtl', 0);
  assert.equal(call('getGmailActionItems').cached, false);
  const reloaded = runPreviewMock(previewPage(t), { storage });
  assert.deepEqual(plain(reloaded.call('getGmailSettings').settings), { enabled: true, limit: 50 });
});
test('Gmail preview supplies empty, more, partial and error states without real mail', t => {
  for (const scenario of ['empty', 'more', 'partial', 'unauthorized', 'forbidden', 'rate-limit', 'error']) {
    const { call } = runPreviewMock(previewPage(t), { search: '?gmail=' + scenario });
    const result = call('getGmailActionItems');
    if (scenario === 'empty') assert.deepEqual(plain(result.items), []);
    else if (scenario === 'more') { assert.equal(result.items.length, 20); assert.equal(result.hasMore, true); }
    else if (scenario === 'partial') assert.equal(result.partial, true);
    else assert.equal(result.ok, false);
  }
});
