import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plain, server } from './helpers.mjs';

const parse = (rows) => plain(server().context.parseSheetCatalog_(rows));

test("Parse headers, tag separators, and related link rows below their tool", () => {
  const result = parse([
    ['name', 'url', 'id', 'tags', 'scope', 'relatedLinks', 'parent', 'メモ'],
    ['ツール', 'https://script.google.com/macros/s/test/exec', 'a', '業務,資料、業務\n経理', '社外', 'https://old.example.com 旧', 'x', 'private'],
    [],
    ['使い方', 'https://example.com/manual', '', '手順', '', '', '', 'private'],
  ]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.tools[0].tags, ['業務', '資料', '経理', 'GAS', '手順']);
  for (const leftover of ['scope', 'relatedLinks', 'parent']) {
    assert.equal(Object.hasOwn(result.tools[0], leftover), false, `A leftover ${leftover} column is ignored like any unknown column`);
  }
  assert.deepEqual(result.tools[0].children, [{ name: '使い方', url: 'https://example.com/manual', description: '' }], 'Blank rows between a tool and its links are skipped');
  assert.doesNotMatch(JSON.stringify(result), /private|old\.example/);
});

test("Skip blank rows, preserve sheet row numbers, and exclude all duplicate IDs", () => {
  const result = parse([
    ['id', 'name', 'url'], ['same', '一つ目', 'https://example.com'], [],
    ['same', '二つ目', 'https://example.com'], ['bad', '不正', 'not-a-url'],
    ['b', 'B', 'https://example.com'], ['a', 'A', 'https://example.com'],
  ]);
  assert.deepEqual(result.issues.map((issue) => issue.row), [2, 4, 5]);
  assert.deepEqual(result.tools.map((tool) => tool.id), ['b', 'a'], 'Sheet row order');
});

test("Handle missing optional columns, trailing cells, and header-only sheets", () => {
  const headers = ['id', 'name', 'url', 'memo'];
  assert.deepEqual(parse([headers]), { tools: [], issues: [] });
  const tool = parse([headers, [1, '数値 ID', 'https://example.com']]).tools[0];
  assert.equal(tool.id, '1');
  assert.equal(tool.description, '');
  assert.deepEqual(tool.tags, []);
  assert.deepEqual(tool.children, []);
});

test("Reject missing or duplicate column names as configuration errors", () => {
  for (const headers of [[], ['id', 'name'], ['id', 'name', 'url', ' id ']]) {
    assert.throws(() => parse([headers]), /INVALID_.*HEADERS/);
  }
});

test("Report link row issues with spreadsheet row numbers, counting blank rows", () => {
  const result = parse([
    ['id', 'name', 'url'],
    ['', 'Orphan', 'https://example.com'],
    [],
    ['broken', 'Broken', 'not a url'],
    ['', 'Under broken', 'https://example.com'],
  ]);
  assert.deepEqual(result.issues.map((issue) => issue.row), [2, 4, 5]);
  assert.equal(result.tools.length, 0);
});

test("Hide the related links of a hidden tool, and hidden links on their own", () => {
  const result = parse([
    ['id', 'name', 'url', 'hidden'],
    ['visible', 'Visible', 'https://example.com', ''],
    ['', 'Hidden link', 'https://example.com/hidden', 'TRUE'],
    ['', 'Shown link', 'https://example.com/shown', ''],
    ['draft', 'Draft', 'https://example.com', 'TRUE'],
    ['', 'Draft doc', 'https://example.com/doc', ''],
    [],
    ['', 'Draft doc 2', 'https://example.com/doc2', 'FALSE'],
    ['next', 'Next', 'https://example.com', ''],
    ['', 'Next doc', 'https://example.com/next', ''],
  ]);
  assert.deepEqual(result.issues, [], 'Links of a hidden tool are hidden, not moved to the visible tool above');
  assert.deepEqual(result.tools.map((tool) => [tool.id, tool.children.map((child) => child.name)]), [['visible', ['Shown link']], ['next', ['Next doc']]]);
  assert.doesNotMatch(JSON.stringify(result), /Draft|Hidden link/);
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
    ['id', 'name', 'url', 'hidden', 'tags', 'memo'],
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
