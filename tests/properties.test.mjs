import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';

test("Default the icon to P and use the first Unicode code point", () => {
  const { context } = server();
  for (const [value, expected] of [['', 'P'], [' ', 'P'], [' F ', 'F'], ['😀Portal', '😀'], ['<script>', '<']]) {
    assert.equal(context.getPortalContent_({ PORTAL_ICON: value }).icon, expected);
  }
});

test("Initialize separate stores while preserving existing values and avoiding repeat writes", () => {
  const scriptValues = { PORTAL_NAME: 'Legacy Portal', SPREADSHEET_ID: 'private-id', OTHER: 'keep' };
  const userValues = { PORTAL_ICON: '', PORTAL_THEME: 'kuri', OTHER: 'user-keep' };
  let writes = 0;
  let locks = 0;
  const store = (values) => ({
    getProperties: () => ({ ...values }),
    setProperties(missing, remove) { assert.equal(remove, false); Object.assign(values, missing); writes++; },
  });
  const { context } = server({
    PropertiesService: { getScriptProperties: () => store(scriptValues), getUserProperties: () => store(userValues) },
    LockService: { getScriptLock: () => ({ waitLock() { locks++; }, releaseLock() { locks--; } }) },
  });
  const result = plain(context.initializeProperties());
  assert.deepEqual(result.script, { created: ['SHEET_NAME'], existing: ['SPREADSHEET_ID'], migrated: [] });
  assert.deepEqual(result.user, {
    created: ['PORTAL_NAME', 'PORTAL_HEADLINE', 'PORTAL_DESCRIPTION', 'PORTAL_LANGUAGE', 'CATALOG_CACHE_SECONDS'],
    existing: ['PORTAL_ICON', 'PORTAL_THEME'], migrated: ['PORTAL_NAME'],
  });
  assert.equal(userValues.PORTAL_NAME, 'Legacy Portal');
  assert.equal(userValues.PORTAL_ICON, '');
  assert.equal(userValues.PORTAL_THEME, 'kuri');
  assert.equal(userValues.SPREADSHEET_ID, undefined);
  assert.equal(userValues.OTHER, 'user-keep');
  assert.equal(scriptValues.PORTAL_ICON, undefined);
  assert.equal(scriptValues.SPREADSHEET_ID, 'private-id');
  assert.equal(scriptValues.OTHER, 'keep');
  assert.doesNotMatch(JSON.stringify(result), /Legacy Portal|private-id|user-keep/);
  const second = plain(context.initializeProperties());
  assert.deepEqual(second.script.created, []);
  assert.deepEqual(second.user.created, []);
  assert.equal(writes, 2);
  assert.equal(locks, 0);
});

test("Preserve the legacy initializer response shape", () => {
  const { context } = server({ properties: {} });
  const result = plain(context.initializeScriptProperties());
  assert.equal(result.created.length, 9);
  assert.deepEqual(result.existing, []);
});

test("Release the initialization lock after storage failures", () => {
  let released = false;
  const { context } = server({
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({}), setProperties() { throw new Error('write failed'); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) },
  });
  assert.throws(() => context.initializeScriptProperties(), /write failed/);
  assert.equal(released, true);
});
