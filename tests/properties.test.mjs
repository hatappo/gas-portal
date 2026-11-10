import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';

test("Default the icon to P and use the first Unicode code point", () => {
  const { context } = server();
  for (const [value, expected] of [['', 'P'], [' ', 'P'], [' F ', 'F'], ['😀Portal', '😀'], ['<script>', '<']]) {
    assert.equal(context.getPortalContent_({ PORTAL_ICON: value }).icon, expected);
  }
});

test("Initialize User Properties without accessing Script Properties or repeating writes", () => {
  const scriptValues = { PORTAL_NAME: 'Legacy Portal', SPREADSHEET_ID: 'private-id', OTHER: 'keep' };
  const userValues = { PORTAL_ICON: '', PORTAL_THEME: 'forest', OTHER: 'user-keep' };
  let writes = 0;
  let locks = 0;
  const store = (values) => ({
    getProperties: () => ({ ...values }),
    setProperties(missing, remove) { assert.equal(remove, false); Object.assign(values, missing); writes++; },
  });
  const { context } = server({
    PropertiesService: { getScriptProperties: () => { assert.fail('Script Properties must not be read'); }, getUserProperties: () => store(userValues) },
    LockService: { getScriptLock: () => ({ waitLock() { locks++; }, releaseLock() { locks--; } }) },
  });
  const result = plain(context.getPortalUserProperties_());
  assert.deepEqual(result, userValues);
  assert.deepEqual(Object.keys(userValues).sort(), [
    'PORTAL_NAME', 'PORTAL_ICON', 'PORTAL_HEADLINE', 'PORTAL_DESCRIPTION', 'PORTAL_THEME', 'PORTAL_LANGUAGE',
    'CATALOG_CACHE_SECONDS', 'ACTIONS_CACHE_SECONDS', 'CALENDAR_SETTINGS', 'SPREADSHEET_ID', 'SHEET_NAME',
    'UNBLOCKED_URL_SCHEMES', 'OTHER',
  ].sort());
  assert.equal(userValues.PORTAL_NAME, 'My Portal');
  assert.equal(userValues.PORTAL_ICON, '');
  assert.equal(userValues.PORTAL_THEME, 'forest');
  assert.equal(userValues.SPREADSHEET_ID, '');
  assert.equal(userValues.SHEET_NAME, '');
  assert.equal(userValues.OTHER, 'user-keep');
  assert.equal(scriptValues.PORTAL_ICON, undefined);
  assert.equal(scriptValues.SPREADSHEET_ID, 'private-id');
  assert.equal(scriptValues.OTHER, 'keep');
  assert.doesNotMatch(JSON.stringify(result), /Legacy Portal|private-id/);
  const second = plain(context.getPortalUserProperties_());
  assert.deepEqual(second, result);
  assert.equal(writes, 1);
  assert.equal(locks, 0);
});

test("Release the initialization lock after storage failures", () => {
  let released = false;
  const { context } = server({
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({}) }), getUserProperties: () => ({ getProperties: () => ({}), setProperties() { throw new Error('write failed'); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) },
  });
  assert.throws(() => context.getPortalUserProperties_(), /write failed/);
  assert.equal(released, true);
});

test('Render an unconfigured portal without consulting Script Properties', () => {
  const userProperties = {};
  let scriptReads = 0;
  const output = { setTitle() { return this; }, setFaviconUrl() { return this; }, addMetaTag() { return this; } };
  const template = { evaluate: () => output };
  const { context, calls } = server({
    PropertiesService: {
      getScriptProperties() { scriptReads++; throw new Error('Script Properties must not be read'); },
      getUserProperties: () => ({
        getProperties: () => ({ ...userProperties }),
        getProperty: (key) => userProperties[key] ?? null,
        setProperties: (values) => Object.assign(userProperties, values),
      }),
    },
    HtmlService: { createTemplateFromFile: () => template },
    ScriptApp: { getScriptId: () => 'test-project' },
  });
  assert.equal(context.doGet(), output);
  assert.equal(template.portal.name, 'My Portal');
  assert.equal(template.portal.spreadsheetUrl, '');
  assert.equal(JSON.parse(template.initialCatalogJson).ok, false);
  assert.equal(context.getCatalog().ok, false);
  assert.equal(scriptReads, 0);
  assert.equal(calls.length, 0);
  assert.equal(userProperties.SPREADSHEET_ID, '');
  assert.equal(userProperties.SHEET_NAME, '');
});


test('Editor authorization changes no settings and initialization does not explicitly request consent', () => {
  let consentRequired = true;
  let checks = 0;
  let locks = 0;
  const userProperties = { PORTAL_NAME: 'Keep me', PORTAL_HEADLINE: '' };
  const app = server({ userProperties,
    ScriptApp: { AuthMode: { FULL: 'FULL' }, requireAllScopes(mode) {
      checks++;
      assert.equal(mode, 'FULL');
      if (consentRequired) throw new Error('CONSENT_PROMPT');
    } },
    LockService: { getScriptLock: () => ({ waitLock() { locks++; }, releaseLock() {} }) },
  });
  assert.throws(() => app.context.authorizePortal(), /CONSENT_PROMPT/);
  assert.equal(locks, 0);
  assert.deepEqual(userProperties, { PORTAL_NAME: 'Keep me', PORTAL_HEADLINE: '' });
  assert.deepEqual(plain(app.logs), [['PORTAL_AUTHORIZATION_CHECK_STARTED']]);
  consentRequired = false;
  assert.deepEqual(plain(app.context.authorizePortal()), { ok: true });
  assert.equal(locks, 0);
  assert.deepEqual(userProperties, { PORTAL_NAME: 'Keep me', PORTAL_HEADLINE: '' });
  assert.equal(checks, 2);
  consentRequired = true;
  assert.equal(Object.keys(app.context.getPortalUserProperties_()).length, 12);
  assert.equal(checks, 2, 'Automatic initialization must not invoke the consent flow');
  assert.equal(userProperties.PORTAL_NAME, 'Keep me');
  assert.equal(userProperties.PORTAL_HEADLINE, '');
  assert.deepEqual(plain(app.logs.at(-1)), ['PORTAL_AUTHORIZATION_GRANTED: All required permissions are granted. No additional authorization is needed.']);
  consentRequired = true;
  app.context.getPortalUserProperties_();
  assert.equal(checks, 2, 'Normal page initialization must not request consent');
});
