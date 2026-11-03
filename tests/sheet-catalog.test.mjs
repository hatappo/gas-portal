import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plain, server } from './helpers.mjs';

const parse = (rows) => plain(server().context.parseSheetCatalog_(rows));

test('TSV の列を読み、カンマ・読点・改行のタグと複数の関連リンクを扱う', () => {
  const result = parse([
    ['name', 'url', 'id', 'tags', 'scope', 'relatedLinks', 'メモ'],
    ['ツール', 'https://script.google.com/macros/s/test/exec', 'a', '業務,資料、業務\n経理', '社外',
      'https://example.com/manual 使い方\nhttps://example.com/source ソース', 'private'],
  ]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.tools[0].tags, ['業務', '資料', '経理', 'GAS']);
  assert.equal(result.tools[0].scope, 'external');
  assert.deepEqual(result.tools[0].relatedLinks, [
    { label: '使い方', url: 'https://example.com/manual' }, { label: 'ソース', url: 'https://example.com/source' },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

test('空行を飛ばしてシートの実際の行番号を返し、重複 ID を全件除外する', () => {
  const result = parse([
    ['id', 'name', 'url'], ['same', '一つ目', 'https://example.com'], [],
    ['same', '二つ目', 'https://example.com'], ['bad', '不正', 'javascript:alert(1)'],
    ['b', 'B', 'https://example.com'], ['a', 'A', 'https://example.com'],
  ]);
  assert.deepEqual(result.issues.map((issue) => issue.row), [2, 4, 5]);
  assert.deepEqual(result.tools.map((tool) => tool.id), ['a', 'b']);
});

test('任意列・末尾セルの省略とヘッダのみの表に対応する', () => {
  const headers = ['id', 'name', 'url', 'relatedLinks'];
  assert.deepEqual(parse([headers]), { tools: [], issues: [] });
  const tool = parse([headers, [1, '数値 ID', 'https://example.com']]).tools[0];
  assert.equal(tool.id, '1');
  assert.equal(tool.description, '');
  assert.equal(tool.scope, 'internal');
  assert.deepEqual(tool.tags, []);
  assert.deepEqual(tool.relatedLinks, []);
});

test('列名不足・重複は表全体の設定エラーにする', () => {
  for (const headers of [[], ['id', 'name'], ['id', 'name', 'url', ' id ']]) {
    assert.throws(() => parse([headers]), /INVALID_.*HEADERS/);
  }
});

test('URL やラベルの欠落・危険な関連 URL は行の不備にする', () => {
  const result = parse([
    ['id', 'name', 'url', 'relatedLinks'],
    ['a', 'A', 'https://example.com', '使い方'],
    ['b', 'B', 'https://example.com', 'https://example.com/manual   '],
    ['c', 'C', 'https://example.com', 'javascript:alert(1) リンク'],
  ]);
  assert.equal(result.tools.length, 0);
  assert.deepEqual(result.issues.map((issue) => issue.row), [2, 3, 4]);
  assert.match(result.issues[0].message, /半角スペース/);
});

test('セル内の空行・CRLF・複数スペースに対応し、ラベル内の空白や URL のクエリを保持する', () => {
  const result = parse([
    ['id', 'name', 'url', 'relatedLinks'],
    ['a', 'A', 'https://example.com', ' \r\n https://example.com/?x=1&y=2#top   Google Drive - ファイル共有 \r\n\r\nhttps://example.com/source\tソース コード\r'],
  ]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.tools[0].relatedLinks, [
    { url: 'https://example.com/?x=1&y=2#top', label: 'Google Drive - ファイル共有' },
    { url: 'https://example.com/source', label: 'ソース コード' },
  ]);
});

test('旧列だけの場合は移行を案内し、新列があれば旧列を無視する', () => {
  const headers = ['id', 'name', 'url', 'relatedLink1Label', 'relatedLink1Url'];
  assert.throws(() => parse([headers]), /LEGACY_RELATED_HEADERS/);
  const result = parse([[...headers, 'relatedLinks'],
    ['a', 'A', 'https://example.com', '旧リンク', 'https://old.example.com', 'https://new.example.com 新リンク']]);
  assert.deepEqual(result.tools[0].relatedLinks, [{ url: 'https://new.example.com', label: '新リンク' }]);
});
