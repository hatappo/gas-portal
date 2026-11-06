import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { bundleModule } from './helpers.mjs';
const saveModule = await bundleModule("import * as save from '../src/browser/save-control.js'; window.testSave = save;");

function setup() {
  const dom = new JSDOM('<p id="status"></p>', { runScripts: 'outside-only' });
  const { window } = dom;
  const calls = [];
  const timers = [];
  window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  window.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; };
  const runner = {
    withSuccessHandler(success) { return { ...runner, success, failure: this.failure }; },
    withFailureHandler(failure) { return { ...this, failure }; },
    saveTheme(value) { calls.push({ value, success: this.success, failure: this.failure }); },
  };
  window.google = { script: { run: runner } };
  window.PortalI18n = { translate: (message) => `translated:${message}` };
  window.eval(saveModule);
  const status = window.document.getElementById('status');
  const busy = [];
  const save = window.testSave.createSaver({ status, t: (key) => `t:${key}`, setBusy: (value) => busy.push(value) });
  return { window, status, save, calls, timers, busy };
}

test('Show progress, then the confirmed message, and clear the timeout', () => {
  const { status, save, calls, timers, busy } = setup();
  let restored = 0;
  save({ send: (runner) => runner.saveTheme('a'), confirm: () => 'done', restore: () => { restored++; }, failureMessage: 'failed' });
  assert.equal(status.textContent, 't:Saving…');
  assert.equal(status.getAttribute('aria-busy'), 'true');
  assert.equal(timers[0].ms, 15000);
  calls[0].success({ ok: true });
  assert.equal(status.textContent, 'done');
  assert.equal(status.getAttribute('aria-busy'), 'false');
  assert.equal(timers[0].cleared, true);
  assert.deepEqual(busy, [true, false]);
  assert.equal(restored, 0);
});

test('Restore on rejected replies, transport failures, server messages, and thrown sends', () => {
  const { status, save, calls } = setup();
  let restored = 0;
  const request = (confirm) => save({ send: (runner) => runner.saveTheme('a'), confirm, restore: () => { restored++; }, failureMessage: 'failed' });
  request(() => false);
  calls[0].success({});
  assert.equal(status.textContent, 't:failed');
  request(() => ({ error: 'server says no' }));
  calls[1].success({});
  assert.equal(status.textContent, 'server says no');
  request(() => 'unused');
  calls[2].failure(new Error('transport'));
  assert.equal(status.textContent, 't:failed');
  save({ send: () => { throw new Error('closed'); }, confirm: () => 'unused', restore: () => { restored++; }, failureMessage: 'failed' });
  assert.equal(status.textContent, 't:failed');
  assert.equal(restored, 4);
});

test('Ignore replies to a timed-out or superseded request', () => {
  const { status, save, calls, timers } = setup();
  let confirmed = 0;
  const request = () => save({ send: (runner) => runner.saveTheme('a'), confirm: () => { confirmed++; return 'done'; }, failureMessage: 'failed', timeoutMs: 60000 });
  request();
  assert.equal(timers[0].ms, 60000);
  timers[0].fn();
  assert.equal(status.textContent, 't:Could not confirm the save. Reload the page to check.');
  calls[0].success({ ok: true });
  assert.equal(confirmed, 0);
  assert.equal(status.textContent, 't:Could not confirm the save. Reload the page to check.');
  request();
  request();
  calls[1].success({ ok: true });
  calls[1].failure();
  assert.equal(confirmed, 0);
  calls[2].success({ ok: true });
  assert.equal(confirmed, 1);
});

test('Translate only failure replies that carry a server message', () => {
  const { window } = setup();
  assert.deepEqual({ ...window.testSave.serverError({ ok: false, error: 'x' }) }, { error: 'translated:x' });
  for (const response of [null, undefined, { ok: false }, { ok: true, error: 'x' }, { ok: false, error: 3 }]) {
    assert.equal(window.testSave.serverError(response), false);
  }
});
