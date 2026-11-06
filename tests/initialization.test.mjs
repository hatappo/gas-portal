import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, bundleBrowser } from './helpers.mjs';

const dormant = await bundleBrowser({ start: false, connectGitHub: false });
test('Importing browser modules does not mount controls or start RPCs before explicit startup', t => {
  const app = browser(() => {}, dormant);
  t.after(() => app.dom.window.close());
  assert.equal(app.requests.length, 0);
  assert.equal(app.githubRequests.length, 0);
  assert.equal(app.document.querySelectorAll('#theme-picker input').length, 0);
  const { actions } = app.dom.window.startPortal();
  assert.equal(app.requests.length, 1);
  assert.ok(app.document.querySelectorAll('#theme-picker input').length > 0);
  assert.equal(typeof actions.setSources, 'function');
  for (const key of ['PortalActions', 'PortalSave', 'PortalMotion']) assert.equal(key in app.dom.window, false);
  assert.equal(app.githubRequests.length, 0, 'The service connection is injected, not started by an import');
});
