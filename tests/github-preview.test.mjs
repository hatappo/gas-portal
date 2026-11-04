import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGitHubPreview } from '../scripts/github-preview.mjs';

test('Offline preview includes changes requested and retains all four categories in the empty scenario', async () => {
  for (const scenario of ['', 'empty']) {
    const rpc = createGitHubPreview(scenario);
    const response = await new Promise((resolve) => { rpc.success = resolve; rpc.getGitHubActionItems('preview'); });
    assert.deepEqual(response.groups.map((group) => group.kind), ['assigned', 'direct', 'team', 'changes']);
    if (scenario === 'empty') assert.ok(response.groups.every((group) => group.items.length === 0));
    else {
      assert.equal(response.groups[3].items[0].kind, 'pull');
      assert.deepEqual(response.groups[3].items[0].reasons, ['changes']);
    }
  }
});

test('Preview uses the shared duration, bypasses cache on refresh and never caches failures', async () => {
  let seconds = 300;
  const rpc = createGitHubPreview('', () => seconds);
  const read = (force = false) => new Promise((resolve) => { rpc.success = resolve; rpc.getGitHubActionItems('preview', force); });
  assert.equal((await read()).cached, false);
  assert.equal((await read()).cached, true);
  assert.equal((await read(true)).cached, false);
  seconds = 0;
  assert.equal((await read()).cached, false);
  assert.equal((await read()).cached, false);
  const partial = createGitHubPreview('partial');
  for (let i = 0; i < 2; i++) {
    const result = await new Promise((resolve) => { partial.success = resolve; partial.getGitHubActionItems('preview'); });
    assert.equal(result.cached, false);
  }
});

test('Preview overlapping connections share tasks and can fail independently', async () => {
  for (const scenario of ['multiple', 'multiple-error']) {
    const rpc = createGitHubPreview(scenario);
    const metadata = await new Promise((resolve) => { rpc.success = resolve; rpc.getGitHubConnections(); });
    assert.equal(metadata.connections.length, 2);
    const responses = [];
    for (const connection of metadata.connections) responses.push(await new Promise((resolve) => { rpc.success = resolve; rpc.getGitHubActionItems(connection.id); }));
    assert.equal(responses[0].ok, true);
    if (scenario === 'multiple-error') assert.equal(responses[1].error, 'FORBIDDEN');
    else {
      assert.equal(responses[1].groups[0].items.length, responses[0].groups[0].items.length + 1);
      assert.equal(responses[1].groups[0].items[0].id, responses[0].groups[0].items[0].id);
    }
  }
});
