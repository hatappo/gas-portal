import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { browser } from './helpers.mjs';

const { PortalCacheDurations: durations, PortalI18n: i18n } = (() => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync('src/shared/i18n.js', 'utf8'), context);
  vm.runInContext(readFileSync('src/shared/cache-durations.js', 'utf8'), context);
  return context;
})();

test('Normalize stored cache durations to a supported choice or the default', () => {
  assert.equal(durations.normalize('catalog', '3600'), 3600);
  assert.equal(durations.normalize('catalog', 300), 300);
  assert.equal(durations.normalize('catalog', '0'), 0);
  for (const value of ['60', '0300', '', 'bad', undefined, null, 3600.5]) assert.equal(durations.normalize('catalog', value), 21600);
  assert.equal(durations.normalize('actions', '60'), 60);
  assert.equal(durations.normalize('actions', 'bad'), 300);
});

test('Accept only numeric choices when saving', () => {
  assert.equal(durations.isChoice('catalog', 3600), true);
  assert.equal(durations.isChoice('catalog', '3600'), false);
  assert.equal(durations.isChoice('catalog', 60), false);
  assert.equal(durations.isChoice('actions', 60), true);
});

test('Every choice has a translated label that marks only the default', () => {
  for (const kind of ['catalog', 'actions']) {
    for (const seconds of durations[kind].choices) {
      const key = durations.label(kind, seconds);
      assert.equal(key.endsWith(' (default)'), seconds === durations[kind].defaultSeconds, key);
      assert.notEqual(i18n.t(key, 'ja'), key, `Missing Japanese label: ${key}`);
    }
  }
});

test('Generate the cache duration options from the shared choices', (t) => {
  const { dom, document } = browser();
  t.after(() => dom.window.close());
  for (const [id, kind] of [['catalog-cache-seconds', 'catalog'], ['actions-cache-seconds', 'actions']]) {
    const options = [...document.getElementById(id).options];
    const choices = Array.from(durations[kind].choices);
    assert.deepEqual(options.map((option) => option.value), choices.map(String));
    assert.deepEqual(options.map((option) => option.textContent), choices.map((seconds) => i18n.t(durations.label(kind, seconds), 'ja')));
  }
  assert.equal(document.getElementById('catalog-cache-seconds').selectedOptions[0].textContent, '6時間（既定）');
  assert.equal(document.getElementById('actions-cache-seconds').selectedOptions[0].textContent, '5分（既定）');
});
