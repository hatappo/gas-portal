import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plain, server } from './helpers.mjs';

const parse = (rows) => plain(server().context.parseSheetCatalog_(rows));

test("Parse headers, tag separators, and multiple related links", () => {
  const result = parse([
    ['name', 'url', 'id', 'tags', 'scope', 'relatedLinks', 'メモ'],  // scope is no longer read
    ['ツール', 'https://script.google.com/macros/s/test/exec', 'a', '業務,資料、業務\n経理', '社外',
      'https://example.com/manual 使い方\nhttps://example.com/source ソース', 'private'],
  ]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.tools[0].tags, ['業務', '資料', '経理', 'GAS']);
  assert.equal(Object.hasOwn(result.tools[0], 'scope'), false, 'A leftover scope column is ignored like any unknown column');
  assert.deepEqual(result.tools[0].relatedLinks, [
    { label: '使い方', url: 'https://example.com/manual' }, { label: 'ソース', url: 'https://example.com/source' },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

test("Skip blank rows, preserve sheet row numbers, and exclude all duplicate IDs", () => {
  const result = parse([
    ['id', 'name', 'url'], ['same', '一つ目', 'https://example.com'], [],
    ['same', '二つ目', 'https://example.com'], ['bad', '不正', 'not-a-url'],
    ['b', 'B', 'https://example.com'], ['a', 'A', 'https://example.com'],
  ]);
  assert.deepEqual(result.issues.map((issue) => issue.row), [2, 4, 5]);
  assert.deepEqual(result.tools.map((tool) => tool.id), ['a', 'b']);
});

test("Handle missing optional columns, trailing cells, and header-only sheets", () => {
  const headers = ['id', 'name', 'url', 'relatedLinks'];
  assert.deepEqual(parse([headers]), { tools: [], issues: [] });
  const tool = parse([headers, [1, '数値 ID', 'https://example.com']]).tools[0];
  assert.equal(tool.id, '1');
  assert.equal(tool.description, '');
  assert.deepEqual(tool.tags, []);
  assert.deepEqual(tool.relatedLinks, []);
});

test("Reject missing or duplicate column names as configuration errors", () => {
  for (const headers of [[], ['id', 'name'], ['id', 'name', 'url', ' id ']]) {
    assert.throws(() => parse([headers]), /INVALID_.*HEADERS/);
  }
});

test("Report missing labels and unsafe related URLs as row issues", () => {
  const result = parse([
    ['id', 'name', 'url', 'relatedLinks'],
    ['a', 'A', 'https://example.com', '使い方'],
    ['b', 'B', 'https://example.com', 'https://example.com/manual   '],
    ['c', 'C', 'https://example.com', 'not-a-url リンク'],
  ]);
  assert.equal(result.tools.length, 0);
  assert.deepEqual(result.issues.map((issue) => issue.row), [2, 3, 4]);
  assert.match(result.issues[0].message, /半角スペース/);
});

test("Handle CRLF, blank lines, and whitespace without changing labels or queries", () => {
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

test("Require migration for legacy-only columns and ignore them when the new column exists", () => {
  const headers = ['id', 'name', 'url', 'relatedLink1Label', 'relatedLink1Url'];
  assert.throws(() => parse([headers]), /LEGACY_RELATED_HEADERS/);
  const result = parse([[...headers, 'relatedLinks'],
    ['a', 'A', 'https://example.com', '旧リンク', 'https://old.example.com', 'https://new.example.com 新リンク']]);
  assert.deepEqual(result.tools[0].relatedLinks, [{ url: 'https://new.example.com', label: '新リンク' }]);
});

test('Hide TRUE rows with reordered headers and preserve visible defaults', () => {
  const result = parse([
    ['hidden', 'url', 'id', 'name'],
    ...['TRUE', ' true ', true, 'FALSE', false, '', 'other'].map((value, index) => [value, 'https://example.com', String(index), 'Entry']),
  ]);
  assert.deepEqual(result.tools.map((tool) => tool.id), ['3', '4', '5', '6']);
  assert.deepEqual(result.issues, []);
  assert.equal(parse([['id', 'name', 'url', 'hidden'], ['a', 'Visible', 'https://example.com']]).tools.length, 1);
});

test('Exclude hidden drafts and duplicate IDs before validation while retaining original issue row numbers', () => {
  const result = parse([
    ['id', 'name', 'url', 'hidden', 'tags', 'relatedLinks'],
    ['same', 'Hidden entry', 'https://example.com/hidden', 'TRUE', 'hidden-only-tag', 'not a link'],
    ['same', 'Visible entry', 'https://example.com/visible', 'FALSE', 'visible-tag'],
    ['', 'Hidden unfinished draft', '', true],
    ['bad', 'Invalid visible entry', 'not-a-url', ''],
  ]);
  assert.deepEqual(result.tools.map((tool) => tool.id), ['same']);
  assert.deepEqual(result.tools[0].tags, ['visible-tag']);
  assert.deepEqual(result.issues.map((issue) => issue.row), [5]);
  assert.doesNotMatch(JSON.stringify(result), /Hidden|hidden-only-tag|not a link/);
  assert.deepEqual(parse([['id', 'name', 'url', 'hidden'], ['', '', '', true]]), { tools: [], issues: [] });
});

test('Read the optional icon column by header name', () => {
  const result = parse([
    ['id', 'name', 'url', 'icon'],
    ['a', 'A', 'https://example.com', '📘'],
    ['b', 'B', 'https://example.com', ''],
    ['c', 'C', 'https://example.com', 'https://example.com/icon.png'],
  ]);
  assert.deepEqual(result.tools.map((tool) => tool.icon), ['📘', undefined, 'https://example.com/icon.png']);
  assert.equal(Object.hasOwn(parse([['id', 'name', 'url'], ['a', 'A', 'https://example.com']]).tools[0], 'icon'), false);
});
