import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createPreviewServer } from '../lib/preview.mjs';

test('Consumer previews use live source when linked and refresh consumer config without restarting in either mode', async (t) => {
  for (const source of [true, false]) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'portal-live-preview-'));
    const config = path.join(root, 'package.json');
    writeFileSync(config, JSON.stringify({ 'gas-portal': { scriptId: 'first-project', repositoryUrl: '' } }));
    const server = await createPreviewServer(root, { port: 0, source });
    t.after(async () => { await server.close(); rmSync(root, { recursive: true, force: true }); });
    await server.listen();
    const base = 'http://127.0.0.1:' + server.httpServer.address().port;
    const first = await (await fetch(base + '/')).text();
    assert.match(first, /first-project\/edit/);
    assert.match(first, /portal-preview-source-[\w-]+/);
    assert.match(first, /portal-preview-actions-cache-seconds-[\w-]+/);
    assert.doesNotMatch(first, /<\?/);
    for (const url of ['/package.json', '/@fs' + config]) assert.doesNotMatch(await (await fetch(base + url)).text(), /first-project/, 'Do not serve the consumer package.json');
    if (source) {
      assert.match(first, /src="\/browser\/main.js"/);
      const client = await (await fetch(base + '/browser/client.js')).text();
      assert.match(client, /mountCatalogView/, 'Serve current source instead of packaged output');
      const view = await (await fetch(base + '/browser/CatalogView.svelte')).text();
      assert.match(view, /svelte/, 'Compile Svelte components for linked consumer previews');
      assert.doesNotMatch(view, /<ToolCard/);
      const events = [];
      const send = server.ws.send.bind(server.ws);
      server.ws.send = (event) => { events.push(event); send(event); };
      server.watcher.emit('change', path.resolve('src/server/Code.js'));
      assert.ok(events.some((event) => event.type === 'full-reload'), 'Embedded server data changes require a full reload');
    } else assert.doesNotMatch(first, /src="\/browser\/main.js"/);
    writeFileSync(config, JSON.stringify({ 'gas-portal': { scriptId: 'updated-project', repositoryUrl: '' } }));
    const refreshed = await (await fetch(base + '/')).text();
    assert.match(refreshed, /updated-project\/edit/);
    assert.doesNotMatch(refreshed, /first-project\/edit/);
  }
});
