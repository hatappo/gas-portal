import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { entry, server, plain, sheetRows } from './helpers.mjs';

test('スクリプトプロパティで指定したタブを位置に関係なく読み、RPC の形を維持する', () => {
  const { context, calls } = server({
    properties: { SPREADSHEET_ID: ' test-id ', SHEET_NAME: "仕事's リンク" },
    sheetProperties: [{ title: 'Other', index: 0 }, { title: "仕事's リンク", index: 1 }],
  });
  assert.deepEqual(plain(context.getCatalog()), {
    ok: true, tools: [{ ...entry(), category: 'その他' }], issues: [],
  });
  assert.deepEqual(plain(calls), [
    ['get', 'test-id', { fields: 'sheets(properties(title))' }],
    ['values', 'test-id', "'仕事''s リンク'", { valueRenderOption: 'FORMATTED_VALUE' }],
  ]);
});

test('再読み込みごとにシートを取得し、変更したデータを反映する', () => {
  const values = sheetRows([entry()]);
  const { context, calls } = server({ values });
  assert.equal(context.getCatalog().tools[0].name, entry().name);
  values[1][1] = '変更後';
  assert.equal(context.getCatalog().tools[0].name, '変更後');
  assert.equal(calls.length, 4);
});

test('サービス・シート・ヘッダ不備を安全なメッセージで通知する', () => {
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

test('プロパティ不足・不正 ID は API を呼ばずに設定を案内する', () => {
  for (const [properties, expected] of [
    [{}, /SPREADSHEET_ID/],
    [{ SPREADSHEET_ID: 'https://docs.google.com/spreadsheets/d/test/edit' }, /SPREADSHEET_ID/],
    [{ SPREADSHEET_ID: 'test' }, /SHEET_NAME/],
    [{ SPREADSHEET_ID: 'test', SHEET_NAME: ' ' }, /SHEET_NAME/],
  ]) {
    const { context, calls } = server({ properties });
    assert.match(context.getCatalog().error, expected);
    assert.equal(calls.length, 0);
  }
});

test('API のエラー詳細やファイル ID を利用者・ログへ漏らさない', () => {
  const { context, logs } = server({ Sheets: { Spreadsheets: { Values: {}, get() { throw new Error('secret spreadsheet-id private-data'); } } } });
  const result = plain(context.getCatalog());
  assert.equal(result.ok, false);
  assert.doesNotMatch(JSON.stringify([result, logs]), /spreadsheet-id|private-data|secret/);
  assert.match(result.error, /共有設定・認可/);
});

test('マニフェストは自分のみ・デプロイ者実行で Sheets の読み取り専用認可だけを持つ', () => {
  const manifest = JSON.parse(readFileSync('src/appsscript.json', 'utf8'));
  assert.deepEqual(manifest.webapp, { access: 'MYSELF', executeAs: 'USER_DEPLOYING' });
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  assert.deepEqual(manifest.dependencies.enabledAdvancedServices, [{ userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' }]);
});

test('ページ生成時のプロジェクト ID からエディタの URL を作り、ポータルのタイトルを設定する', () => {
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
    assert.equal(calls.length, 0, 'ページ生成ではシートを読み込まない');
  }
});

test('Spreadsheet のリンクは設定 ID から生成し、未設定・不正な ID はリンクを作らない', () => {
  const { context } = server();
  for (const id of ['', '   ', 'https://example.com', 'bad/id', '"><img src=x>']) {
    assert.equal(context.getPortalContent_({}, { SPREADSHEET_ID: id }).spreadsheetUrl, '');
  }
  for (const id of ['first-sheet', 'second_sheet']) {
    assert.equal(context.getPortalContent_({}, { SPREADSHEET_ID: ` ${id} ` }).spreadsheetUrl,
      `https://docs.google.com/spreadsheets/d/${id}/edit`);
  }
});

test('ポータルの文言はプロパティから読み、未設定・空白は既定値に戻し、再表示で変更を反映する', () => {
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
  assert.equal(template.portal.headline, '毎日の仕事に、ひとつの入口を。');
  assert.equal(template.portal.description, '業務で使うツールやサービスへのリンクと、日々のToDoをひとつにまとめます。');
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
  assert.equal(template.portal.headline, '毎日の仕事に、ひとつの入口を。');
  assert.equal(template.portal.description, '業務で使うツールやサービスへのリンクと、日々のToDoをひとつにまとめます。');
});
