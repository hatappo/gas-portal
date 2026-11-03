import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';

test('アイコンは未設定なら P、指定値の先頭の Unicode 文字を使用する', () => {
  const { context } = server();
  for (const [value, expected] of [['', 'P'], [' ', 'P'], [' F ', 'F'], ['😀Portal', '😀'], ['<script>', '<']]) {
    assert.equal(context.getPortalContent_({ PORTAL_ICON: value }).icon, expected);
  }
});

test('初期化は保存先を分け、空値・既存テーマ・未知のキーを保持し、再実行で書き込まない', () => {
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
    created: ['PORTAL_NAME', 'PORTAL_HEADLINE', 'PORTAL_DESCRIPTION'],
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

test('旧 initializeScriptProperties も新しい初期化に委譲し、旧レスポンス形式を維持する', () => {
  const { context } = server({ properties: {} });
  const result = plain(context.initializeScriptProperties());
  assert.equal(result.created.length, 7);
  assert.deepEqual(result.existing, []);
});

test('初期化の書き込み失敗でもロックを解放する', () => {
  let released = false;
  const { context } = server({
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({}), setProperties() { throw new Error('write failed'); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) },
  });
  assert.throws(() => context.initializeScriptProperties(), /write failed/);
  assert.equal(released, true);
});
