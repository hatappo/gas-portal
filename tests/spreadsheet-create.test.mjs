import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { server, plain, browser } from './helpers.mjs';

function setup(options = {}) {
  const userProperties = options.userProperties || {};
  const requests = [];
  let authorizationChecks = 0;
  let locked = false;
  const app = server({ userProperties,
    ScriptApp: {
      AuthMode: { FULL: 'FULL' }, AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' },
      getAuthorizationInfo(mode) {
        authorizationChecks++;
        assert.equal(mode, 'FULL');
        return { getAuthorizationStatus: () => options.unauthorized ? 'REQUIRED' : 'NOT_REQUIRED' };
      },
    },
    LockService: { getScriptLock: () => ({ waitLock() { locked = true; options.afterLock?.(); }, releaseLock() { locked = false; } }) },
    Sheets: { Spreadsheets: {
      create(resource) {
        assert.equal(locked, true);
        assert.equal((userProperties.SPREADSHEET_ID || '').trim(), '');
        requests.push(['create', plain(resource)]);
        if (options.failCreate) throw new Error('private-api-details');
        return { spreadsheetId: 'created-sheet' };
      },
      batchUpdate(resource, id) {
        assert.equal(locked, true);
        assert.equal(userProperties.SPREADSHEET_ID, id, 'Persist the ID before table initialization');
        requests.push(['batchUpdate', plain(resource), id]);
        if (options.failTable) throw new Error('private-api-details');
        return {};
      },
    } },
  });
  return { ...app, requests, userProperties, isLocked: () => locked, authorizationChecks: () => authorizationChecks };
}

test('Create only the eight supported columns with typed table, header notes, and no sheet-name property', () => {
  const app = setup({ userProperties: { PORTAL_NAME: 'My Work', PORTAL_THEME: 'sumi' } });
  assert.deepEqual(plain(app.context.createPortalSpreadsheet('en')), { ok: true, spreadsheetId: 'created-sheet' });
  assert.equal(app.requests.length, 2);
  const spreadsheet = app.requests[0][1];
  assert.equal(spreadsheet.properties.title, 'My Work');
  assert.equal(spreadsheet.sheets.length, 1);
  const sheet = spreadsheet.sheets[0];
  assert.deepEqual(sheet.properties.gridProperties, { rowCount: 101, columnCount: 8, frozenRowCount: 1 });
  const headers = sheet.data[0].rowData[0].values;
  const names = ['id', 'hidden', 'scope', 'tags', 'name', 'url', 'description', 'relatedLinks'];
  assert.deepEqual(headers.map((cell) => cell.userEnteredValue.stringValue), names);
  assert.ok(headers.every((cell) => cell.note && cell.userEnteredFormat.textFormat.bold));
  assert.match(headers[7].note, /: URL, a space, then a label/);
  assert.match(headers[7].note, /\nhttps:\/\/example.com\/guide User guide\nvscode:\/\/file\/path\/to\/project Open in VS Code/);
  const requests = app.requests[1][1].requests;
  const table = requests.find((request) => request.addTable).addTable.table;
  assert.equal(table.name, 'PortalLinks');
  assert.deepEqual(table.rowsProperties.headerColorStyle, { rgbColor: { red: 113 / 255, green: 164 / 255, blue: 217 / 255 } });
  assert.deepEqual(headers[0].userEnteredFormat.textFormat.foregroundColorStyle, { rgbColor: { red: 22 / 255, green: 51 / 255, blue: 77 / 255 } });
  assert.deepEqual(table.range, { sheetId: 0, startRowIndex: 0, endRowIndex: 101, startColumnIndex: 0, endColumnIndex: 8 });
  assert.deepEqual(table.columnProperties.map((column) => column.columnName), names);
  assert.deepEqual(table.columnProperties.map((column) => column.columnType), ['TEXT', 'BOOLEAN', 'DROPDOWN', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT']);
  assert.deepEqual(table.columnProperties[2].dataValidationRule.condition.values, [{ userEnteredValue: 'internal' }, { userEnteredValue: 'external' }]);
  const formats = requests.filter((request) => request.repeatCell).map((request) => request.repeatCell);
  assert.equal(formats.length, 6);
  assert.ok(formats.every((format) => format.cell.userEnteredFormat.numberFormat.type === 'TEXT'));
  assert.equal(app.requests[1][2], 'created-sheet');
  assert.equal(app.userProperties.SPREADSHEET_ID, 'created-sheet');
  assert.equal(Object.hasOwn(app.userProperties, 'SHEET_NAME'), false);
  assert.equal(app.userProperties.PORTAL_THEME, 'sumi');
  assert.equal(app.isLocked(), false);
});

test('Reject every nonempty saved ID before calling Sheets, including stale or invalid values', () => {
  for (const id of ['existing-id', 'https://docs.google.com/spreadsheets/d/existing/edit', 'invalid/id']) {
    const app = setup({ userProperties: { SPREADSHEET_ID: id, SHEET_NAME: 'Keep me' } });
    const before = { ...app.userProperties };
    assert.equal(app.context.createPortalSpreadsheet('en').ok, false);
    assert.deepEqual(app.userProperties, before);
    assert.deepEqual(app.requests, []);
    assert.equal(app.isLocked(), false);
  }
});

test('Check the ID after acquiring the same settings lock and reject duplicate creations', () => {
  const userProperties = {};
  const waiting = setup({ userProperties, afterLock() { userProperties.SPREADSHEET_ID = 'saved-by-another-request'; } });
  assert.equal(waiting.context.createPortalSpreadsheet('en').ok, false);
  assert.equal(waiting.requests.length, 0);
  const app = setup({ userProperties: { SPREADSHEET_ID: '  ', SHEET_NAME: '' } });
  assert.equal(app.context.createPortalSpreadsheet('en').ok, true);
  assert.equal(app.context.createPortalSpreadsheet('en').ok, false);
  assert.equal(app.requests.length, 2);
  assert.equal(app.userProperties.SHEET_NAME, '');
});

test('Preserve an existing sheet name and localize notes using the saved or browser language', () => {
  const app = setup({ userProperties: { SHEET_NAME: 'Keep me', PORTAL_LANGUAGE: 'ja' } });
  assert.equal(app.context.createPortalSpreadsheet('en').ok, true);
  assert.equal(app.userProperties.SHEET_NAME, 'Keep me');
  assert.match(app.requests[0][1].sheets[0].data[0].rowData[0].values[7].note, /「URL 半角スペース ラベル」/);
});

test('Keep the created ID after table failure and report partial failure without creating again', () => {
  const app = setup({ failTable: true });
  const result = plain(app.context.createPortalSpreadsheet('en'));
  assert.equal(result.ok, false);
  assert.equal(result.connected, true);
  assert.equal(result.spreadsheetId, 'created-sheet');
  assert.match(result.error, /table setup failed/);
  assert.doesNotMatch(JSON.stringify(result), /private-api-details/);
  assert.deepEqual(plain(app.logs), [['SPREADSHEET_CREATION_FAILED', 'TABLE_SETUP', 'Error: private-api-details']]);
  assert.equal(app.userProperties.SPREADSHEET_ID, 'created-sheet');
  assert.equal(app.context.createPortalSpreadsheet('en').ok, false);
  assert.equal(app.requests.length, 2);
  assert.equal(app.isLocked(), false);
});

test('Report failed creation or property writes without falsely claiming success or initializing an untracked sheet', () => {
  const failed = setup({ failCreate: true });
  assert.equal(failed.context.createPortalSpreadsheet('en').ok, false);
  assert.equal(failed.userProperties.SPREADSHEET_ID, undefined);
  assert.equal(failed.requests.length, 1);
  assert.equal(failed.isLocked(), false);
  const app = setup();
  app.context.PropertiesService.getUserProperties = () => ({ getProperty: () => null, setProperty() { throw new Error('private-store-error'); } });
  const result = plain(app.context.createPortalSpreadsheet('en'));
  assert.equal(result.ok, false);
  assert.equal(result.spreadsheetId, 'created-sheet');
  assert.equal(result.connected, false);
  assert.match(result.error, /ID could not be saved/);
  assert.equal(app.requests.length, 1);
  assert.equal(app.isLocked(), false);
  assert.doesNotMatch(JSON.stringify(result), /private-store-error/);
  assert.deepEqual(plain(app.logs), [['SPREADSHEET_CREATION_FAILED', 'PROPERTY_SAVE', 'Error: private-store-error']]);
});

test('The new empty table remains an empty catalog even when checkboxes return FALSE', () => {
  const app = setup();
  app.context.createPortalSpreadsheet();
  const names = app.requests[0][1].sheets[0].data[0].rowData[0].values.map((cell) => cell.userEnteredValue.stringValue);
  const rows = [names, ...Array.from({ length: 100 }, () => names.map((name) => name === 'hidden' ? false : ''))];
  assert.deepEqual(plain(app.context.parseSheetCatalog_(rows)), { tools: [], issues: [] });
  rows[20][names.indexOf('name')] = 'Unfinished entry';
  assert.deepEqual(plain(app.context.parseSheetCatalog_(rows)).issues.map((issue) => issue.row), [21]);
});

test('Create from Settings once, keep unsaved sheet-name text, and offer the created file and reload', (t) => {
  const { dom, document, creationRequests } = browser();
  t.after(() => dom.window.close());
  const create = document.getElementById('create-spreadsheet');
  const id = document.getElementById('setting-spreadsheet');
  const name = document.getElementById('setting-sheet-name');
  name.value = 'Unsaved sheet-name draft';
  create.click(); create.click();
  assert.equal(creationRequests.length, 1);
  assert.equal(creationRequests[0].browserLanguage, 'ja');
  assert.equal(document.getElementById('spreadsheet-settings-fields').disabled, true);
  creationRequests[0].success({ ok: true, spreadsheetId: 'created-sheet' });
  assert.equal(id.value, 'created-sheet');
  assert.equal(name.value, 'Unsaved sheet-name draft');
  assert.equal(create.disabled, true);
  assert.equal(document.getElementById('reload-spreadsheet').hidden, false);
  const link = document.getElementById('created-spreadsheet-link');
  assert.equal(link.href, 'https://docs.google.com/spreadsheets/d/created-sheet/edit');
  assert.equal(link.hidden, false);
  assert.equal(link.target, '_blank');
  id.value = '';
  id.dispatchEvent(new dom.window.Event('input'));
  assert.equal(create.disabled, true, 'Clearing the draft cannot bypass a saved ID');
});

test('Do not create with an entered ID; block repeated actions after an uncertain creation', (t) => {
  let timeout;
  const { dom, document, creationRequests } = browser((window) => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms) => { if (ms === 60000) { timeout = fn; return 123; } return original(fn, ms); };
  });
  t.after(() => dom.window.close());
  const create = document.getElementById('create-spreadsheet');
  const id = document.getElementById('setting-spreadsheet');
  id.value = 'unsaved-id';
  id.dispatchEvent(new dom.window.Event('input'));
  create.click();
  assert.equal(creationRequests.length, 0);
  id.value = '';
  id.dispatchEvent(new dom.window.Event('input'));
  create.click();
  timeout();
  creationRequests[0].success({ ok: true, spreadsheetId: 'late-id' });
  assert.equal(id.value, '');
  assert.equal(id.readOnly, true);
  assert.equal(create.disabled, true);
  assert.equal(document.querySelector('#spreadsheet-settings-form [type=submit]').disabled, true);
  assert.equal(document.getElementById('reload-spreadsheet').hidden, false);
});

test('Expose recoverable partial creation failures without losing the created ID', (t) => {
  const { dom, document, creationRequests } = browser();
  t.after(() => dom.window.close());
  document.getElementById('create-spreadsheet').click();
  creationRequests[0].success({ ok: false, spreadsheetId: 'created-sheet', connected: false, error: 'Spreadsheet created, but its ID could not be saved. Save the ID shown in this form before reloading.' });
  assert.equal(document.getElementById('setting-spreadsheet').value, 'created-sheet');
  assert.equal(document.getElementById('created-spreadsheet-link').hidden, false);
  assert.equal(document.querySelector('#spreadsheet-settings-form [type=submit]').disabled, false);
  assert.equal(document.getElementById('reload-spreadsheet').hidden, true);
  assert.match(document.getElementById('spreadsheet-settings-status').textContent, /ID を保存できません/);
});


test('Missing consent stops before Sheets or property writes and gives authorization instructions', () => {
  const app = setup({ unauthorized: true });
  const result = plain(app.context.createPortalSpreadsheet('en'));
  assert.equal(result.ok, false);
  assert.match(result.error, /initializeProperties/);
  assert.match(result.error, /authoriz/i);
  assert.deepEqual(app.requests, []);
  assert.deepEqual(app.userProperties, {});
  assert.equal(app.authorizationChecks(), 1);
  assert.deepEqual(plain(app.logs), [['SPREADSHEET_CREATION_BLOCKED', 'AUTHORIZATION_REQUIRED']]);
  assert.equal(app.isLocked(), false);
  assert.match(app.context.createPortalSpreadsheet('ja').error, /追加の権限/);
  const configured = setup({ unauthorized: true, userProperties: { SPREADSHEET_ID: 'already-configured' } });
  assert.match(configured.context.createPortalSpreadsheet('en').error, /already configured/);
  assert.equal(configured.authorizationChecks(), 0);
});

test('Keep API exception details in the execution log, never in the browser response', () => {
  const app = setup({ failCreate: true });
  const result = plain(app.context.createPortalSpreadsheet('en'));
  assert.equal(result.ok, false);
  assert.deepEqual(plain(app.logs), [['SPREADSHEET_CREATION_FAILED', 'CREATE', 'Error: private-api-details']]);
  assert.doesNotMatch(JSON.stringify(result), /private-api-details/);
  const malformed = setup();
  malformed.context.Sheets.Spreadsheets.create = () => ({});
  assert.equal(malformed.context.createPortalSpreadsheet('en').ok, false);
  assert.deepEqual(plain(malformed.logs), [['SPREADSHEET_CREATION_FAILED', 'CREATE_RESPONSE', 'Error: INVALID_CREATED_ID']]);
});


test('Column notes follow the selected language at creation without documenting automatic tag rules', () => {
  for (const [saved, browserLanguage, expected] of [
    ['en', 'ja', 'Optional. Separate tags with commas or line breaks.'],
    ['ja', 'en', '任意。カンマまたはセル内改行でタグを区切ります。'],
    ['auto', 'ja', '任意。カンマまたはセル内改行でタグを区切ります。'],
    ['auto', 'en', 'Optional. Separate tags with commas or line breaks.'],
    ['auto', undefined, 'Optional. Separate tags with commas or line breaks.'],
  ]) {
    const app = setup({ userProperties: { PORTAL_LANGUAGE: saved } });
    assert.equal(app.context.createPortalSpreadsheet(browserLanguage).ok, true);
    const headers = app.requests[0][1].sheets[0].data[0].rowData[0].values;
    assert.equal(headers.find((cell) => cell.userEnteredValue.stringValue === 'tags').note, expected);
    assert.ok(headers.every((cell) => !/GAS/.test(cell.note)));
  }
});


test('Creation cursor distinguishes an unavailable source action from an active request', (t) => {
  const { dom, document, creationRequests } = browser();
  t.after(() => dom.window.close());
  const style = document.createElement('style');
  style.textContent = readFileSync('src/browser/styles.css', 'utf8');
  document.head.append(style);
  const create = document.getElementById('create-spreadsheet');
  const id = document.getElementById('setting-spreadsheet');
  const cursor = () => dom.window.getComputedStyle(create).cursor;
  id.value = 'existing-sheet';
  id.dispatchEvent(new dom.window.Event('input'));
  assert.equal(create.disabled, true);
  assert.equal(cursor(), 'not-allowed');
  id.value = '';
  id.dispatchEvent(new dom.window.Event('input'));
  assert.equal(cursor(), 'pointer');
  create.click();
  assert.equal(cursor(), 'wait');
  creationRequests[0].success({ ok: true, spreadsheetId: 'created-sheet' });
  assert.equal(cursor(), 'not-allowed');
});
