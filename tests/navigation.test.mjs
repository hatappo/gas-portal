import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, catalog } from './helpers.mjs';

const selected = (document) => document.querySelector('[role="tab"][aria-selected="true"]').id;

test('Open each tab directly from the hash and fall back safely for absent or unknown routes', (t) => {
  for (const [hash, tab] of [['#tools', 'tools'], ['#actions', 'actions'], ['#settings', 'settings'], ['', 'tools'], ['#unknown', 'tools'], ['#%ZZ', 'tools']]) {
    const app = browser((window) => window.history.replaceState(null, '', '/?state=empty' + hash));
    t.after(() => app.dom.window.close());
    assert.equal(selected(app.document), 'tab-' + tab);
    assert.equal(app.dom.window.location.search, '?state=empty');
    assert.equal(app.dom.window.history.length, 1);
    app.requests[0].success(catalog);
    assert.equal(selected(app.document), 'tab-' + tab, 'Catalog arrival does not change the route');
  }
});

test('Local tab navigation supports back and forward, retains queries and drafts, and avoids duplicate entries', async (t) => {
  const app = browser((window) => window.history.replaceState(null, '', '/?state=empty#tools'));
  t.after(() => app.dom.window.close());
  const { window } = app.dom;
  const doc = app.document;
  app.requests[0].success(catalog);
  doc.getElementById('search').value = 'guide';
  doc.getElementById('search').dispatchEvent(new window.Event('input'));
  doc.getElementById('tab-actions').click();
  assert.equal(window.location.hash, '#actions');
  doc.getElementById('tab-actions').click();
  assert.equal(window.history.length, 2);
  doc.getElementById('tab-actions').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(window.location.hash, '#settings');
  doc.getElementById('setting-name').value = 'Unsaved name';
  const travel = (direction) => new Promise((resolve) => {
    window.addEventListener('popstate', resolve, { once: true });
    window.history[direction]();
  });
  await travel('back');
  assert.equal(selected(doc), 'tab-actions');
  await travel('back');
  assert.equal(selected(doc), 'tab-tools');
  await travel('forward');
  assert.equal(selected(doc), 'tab-actions');
  assert.equal(window.location.search, '?state=empty');
  assert.equal(doc.getElementById('setting-name').value, 'Unsaved name');
  assert.equal(doc.getElementById('search').value, 'guide');
  assert.equal(app.requests.length, 1);
  const changed = new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }));
  window.location.hash = '#settings';
  await changed;
  assert.equal(selected(doc), 'tab-settings');
});

function gasBrowser(t) {
  const pushes = [];
  let initialLocation;
  let historyChanged;
  const app = browser((window) => {
    window.history.replaceState(null, '', '/iframe#unrelated');
    window.google.script.url = { getLocation(callback) { initialLocation = callback; } };
    window.google.script.history = {
      push(...args) { pushes.push(args); },
      setChangeHandler(callback) { historyChanged = callback; },
    };
  });
  t.after(() => app.dom.window.close());
  return { ...app, pushes, initial: (hash) => initialLocation({ hash }), pop: (hash) => historyChanged({ location: { hash } }) };
}

test('GAS reads and updates the outer web app URL while retaining query parameters', (t) => {
  const app = gasBrowser(t);
  app.initial('settings');
  assert.equal(selected(app.document), 'tab-settings');
  app.document.getElementById('tab-actions').click();
  assert.deepEqual(JSON.parse(JSON.stringify(app.pushes)), [[null, null, 'actions']]);
  assert.equal(app.dom.window.location.hash, '#unrelated', 'Never route the sandbox iframe URL');
  app.pop('tools');
  assert.equal(selected(app.document), 'tab-tools');
  app.pop('settings');
  assert.equal(selected(app.document), 'tab-settings');
  assert.equal(app.pushes.length, 1, 'History replay must not push another entry');
});

test('Delayed initial GAS location cannot override user navigation or a newer history event', (t) => {
  const clicked = gasBrowser(t);
  clicked.document.getElementById('tab-actions').click();
  clicked.initial('settings');
  assert.equal(selected(clicked.document), 'tab-actions');
  const popped = gasBrowser(t);
  popped.pop('settings');
  popped.initial('actions');
  assert.equal(selected(popped.document), 'tab-settings');
});

test('The skip link hash keeps the current tab and unavailable history does not break the UI', (t) => {
  const app = gasBrowser(t);
  app.initial('settings');
  app.pop('main');
  assert.equal(selected(app.document), 'tab-settings');
  app.dom.window.google.script.history.push = () => { throw new Error('unavailable'); };
  app.document.getElementById('tab-actions').click();
  assert.equal(selected(app.document), 'tab-actions');
});
