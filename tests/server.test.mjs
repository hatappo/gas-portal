import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { entry, server, plain, sheetRows } from './helpers.mjs';

test("Read the configured sheet regardless of position and preserve the RPC shape", () => {
  const { context, calls } = server({
    userProperties: { SPREADSHEET_ID: ' test-id ', SHEET_NAME: "仕事's リンク" },
    sheetProperties: [{ title: 'Other', index: 0 }, { title: "仕事's リンク", index: 1 }],
  });
  const { cache, ...response } = plain(context.getCatalog());
  assert.equal(cache.hit, false);
  assert.ok(cache.fetchedAt > 0);
  assert.deepEqual(response, {
    ok: true, tools: [{ ...entry(), category: 'その他' }], issues: [],
  });
  assert.deepEqual(plain(calls), [
    ['values', 'test-id', "'仕事''s リンク'", { valueRenderOption: 'FORMATTED_VALUE' }],
  ]);
});

test("Reload spreadsheet data when cache service is unavailable", () => {
  const values = sheetRows([entry()]);
  const { context, calls } = server({ values });
  assert.equal(context.getCatalog().tools[0].name, entry().name);
  values[1][1] = '変更後';
  assert.equal(context.getCatalog().tools[0].name, '変更後');
  assert.equal(calls.length, 2);
});

test("Report missing services, sheets, and headers safely", () => {
  for (const [options, expected] of [
    [{ Sheets: undefined }, /Google Sheets API/],
    [{ sheetProperties: [] }, /シートがありません/],
    [{ values: [] }, /1 行目/],
    [{ values: [['id', 'name', 'url', 'relatedLink1Label']] }, /relatedLinks 列/],
  ]) {
    const { context } = server(options);
    const result = context.getCatalog();
    assert.equal(result.ok, false);
    assert.match(result.error, expected);
  }
});

test("Reject missing properties and invalid IDs before calling the API", () => {
  for (const [properties, expected] of [
    [{}, /設定画面/],
    [{ SPREADSHEET_ID: 'https://docs.google.com.evil.test/spreadsheets/d/test/edit' }, /設定画面/],
    [{ SPREADSHEET_ID: 'bad/id' }, /設定画面/],
  ]) {
    const { context, calls } = server({ userProperties: properties });
    assert.match(context.getCatalog().error, expected);
    assert.equal(calls.length, 0);
  }
});

test("Do not expose API error details or file IDs", () => {
  const { context, logs } = server({ Sheets: { Spreadsheets: { Values: {}, get() { throw new Error('secret spreadsheet-id private-data'); } } } });
  const result = plain(context.getCatalog());
  assert.equal(result.ok, false);
  assert.doesNotMatch(JSON.stringify([result, logs]), /spreadsheet-id|private-data|secret/);
  assert.match(result.error, /共有設定・認可/);
});

test("Use private deployer execution with read-only Sheets access and per-file creation access", () => {
  const manifest = JSON.parse(readFileSync('src/appsscript.json', 'utf8'));
  assert.deepEqual(manifest.webapp, { access: 'MYSELF', executeAs: 'USER_DEPLOYING' });
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.file']);
  assert.deepEqual(manifest.dependencies.enabledAdvancedServices, [{ userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' }]);
});

test("Generate the editor URL from the current project and set the page title", () => {
  for (const scriptId of ['project-one', 'project-two']) {
    let title;
    const output = { setTitle(value) { title = value; return this; }, addMetaTag() { return this; } };
    const template = { evaluate() { return output; } };
    const { context, calls } = server({
      HtmlService: { createTemplateFromFile(name) { assert.equal(name, 'Index'); return template; } },
      ScriptApp: { getScriptId() { return scriptId; } },
    });
    assert.equal(context.doGet(), output);
    assert.equal(template.projectUrl, `https://script.google.com/home/projects/${scriptId}/edit`);
    assert.equal(title, 'My Portal');
    assert.equal(template.portal.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/test-spreadsheet-id/edit');
    assert.equal(calls.length, 1, 'A cold page embeds the catalog with a single values request');
    assert.equal(JSON.parse(template.initialCatalogJson).ok, true);
  }
});

test("Generate spreadsheet links only for valid configured IDs", () => {
  const { context } = server();
  for (const id of ['', '   ', 'https://example.com', 'bad/id', '"><img src=x>']) {
    assert.equal(context.getPortalContent_({ SPREADSHEET_ID: id }).spreadsheetUrl, '');
  }
  for (const id of ['first-sheet', 'second_sheet']) {
    assert.equal(context.getPortalContent_({ SPREADSHEET_ID: ` ${id} ` }).spreadsheetUrl,
      `https://docs.google.com/spreadsheets/d/${id}/edit`);
  }
});

test("Read display properties, apply defaults for missing fields, and reflect subsequent changes", () => {
  const userProperties = {};
  let title;
  const output = { setTitle(value) { title = value; return this; }, addMetaTag() { return this; } };
  const template = { evaluate() { return output; } };
  const { context } = server({
    userProperties,
    HtmlService: { createTemplateFromFile() { return template; } },
    ScriptApp: { getScriptId() { return 'test-project'; } },
  });
  context.doGet();
  assert.equal(title, 'My Portal');
  assert.equal(template.portal.headline, 'One place to start your workday.');
  assert.equal(template.portal.description, 'Keep your work tools, service links, and daily to-dos in one place.');
  userProperties.PORTAL_NAME = '  Fumi Workspace  ';
  userProperties.PORTAL_HEADLINE = '今日の仕事';
  userProperties.PORTAL_DESCRIPTION = 'リンクとタスク';
  context.doGet();
  assert.equal(title, 'Fumi Workspace');
  assert.equal(template.portal.brandLead + template.portal.brandRest, title);
  assert.equal(template.portal.headline, '今日の仕事');
  assert.equal(template.portal.description, 'リンクとタスク');
  userProperties.PORTAL_NAME = '仕事場';
  userProperties.PORTAL_HEADLINE = '  \n ';
  userProperties.PORTAL_DESCRIPTION = '';
  context.doGet();
  assert.equal(title, '仕事場');
  assert.equal(template.portal.brandLead, title);
  assert.equal(template.portal.brandRest, '');
  assert.equal(template.portal.headline, '');
  assert.equal(template.portal.description, '');
});
