import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entry, server, plain } from './helpers.mjs';

const parse = (entries) => plain(server().context.parseCatalog_(entries));

test("Build public catalog data without exposing internal fields", () => {
  assert.deepEqual(parse([entry({ memo: 'private' })]), {
    tools: [{ ...entry(), category: 'その他' }], issues: [],
  });
});

test("Trim tags and remove empty or duplicate values", () => {
  const result = parse([entry({ tags: [' 経理 ', '申請', '経理', ' ', '分類,補足'] })]);
  assert.deepEqual(result.tools[0].tags, ['経理', '申請', '分類,補足']);
});

test("Automatically tag Apps Script origins as GAS", () => {
  for (const url of ['https://script.google.com', 'https://script.google.com/macros/s/test/exec',
    'https://script.google.com/a/macros/example.com/s/test/exec', 'https://script.google.com?x=1',
    'https://script.google.com#top', ' HTTPS://SCRIPT.GOOGLE.COM:443/macros/s/test/exec ']) {
    const result = parse([entry({ url, tags: undefined })]);
    assert.deepEqual(result.issues, [], url);
    assert.deepEqual(result.tools[0].tags, ['GAS'], url);
  }
});

test("Append automatic tags without duplicates or input mutation", () => {
  for (const [tags, expected] of [[['業務'], ['業務', 'GAS']],
    [[' GAS ', '業務', 'GAS'], ['GAS', '業務']]]) {
    const input = entry({ url: 'https://script.google.com/macros/s/test/exec', tags });
    const before = structuredClone(input);
    assert.deepEqual(parse([input]).tools[0].tags, expected);
    assert.deepEqual(input, before);
  }
});

test("Do not tag lookalike hosts, alternate ports, or embedded URLs", () => {
  for (const url of ['https://script.google.com.example.com/tool', 'https://script.google.company',
    'https://sub.script.google.com', 'https://script.google.com:8443/tool',
    'https://example.com/https://script.google.com', 'https://example.com/?url=https://script.google.com']) {
    assert.deepEqual(parse([entry({ url, tags: [] })]).tools[0].tags, [], url);
  }
  const invalid = parse([entry({ url: 'https://script.google.com@evil.example/tool' })]);
  assert.equal(invalid.tools.length, 0);
  assert.equal(invalid.issues.length, 1);
});

test("Accept Japanese and English scopes and default to internal", () => {
  for (const [scope, expected] of [[undefined, 'internal'], ['', 'internal'], ['社内', 'internal'],
    ['社外', 'external'], ['internal', 'internal'], ['external', 'external']]) {
    assert.equal(parse([entry({ scope })]).tools[0].scope, expected);
  }
  for (const scope of ['unknown', 0, null]) {
    assert.match(parse([entry({ scope })]).issues[0].message, /scope/);
  }
});

test("Default optional fields to empty descriptions, no tags, and internal scope", () => {
  assert.deepEqual(parse([{ id: 'a', name: 'A', url: 'https://example.com' }]).tools[0], {
    id: 'a', name: 'A', url: 'https://example.com', description: '',
    tags: [], relatedLinks: [], scope: 'internal', category: 'その他',
  });
});

test("Sort string IDs without depending on input order or mutating data", () => {
  const entries = ['tool-2', 'tool-10', 'tool-1', 'b', ' A ', 'a'].map((id) => entry({ id }));
  const before = structuredClone(entries);
  assert.deepEqual(parse(entries).tools.map((tool) => tool.id), ['A', 'a', 'b', 'tool-1', 'tool-10', 'tool-2']);
  assert.deepEqual(entries, before);
});

test("Accept empty arrays and reject non-array catalogs", () => {
  assert.deepEqual(parse([]), { tools: [], issues: [] });
  for (const value of [null, undefined, {}, 'invalid']) assert.throws(() => parse(value));
});

test("Reject missing required fields, non-string values, and non-object entries", () => {
  const entries = [null, [], 42, {}, entry({ id: '' }), entry({ name: 123 }), entry({ url: null })];
  const result = parse(entries);
  assert.equal(result.tools.length, 0);
  assert.deepEqual(result.issues.map((issue) => issue.row), [1, 2, 3, 4, 5, 6, 7]);
});

test("Exclude entries with invalid description or tag types", () => {
  for (const invalid of [{ description: 123 }, { tags: '業務' }, { tags: ['業務', 1] }, { tags: null }]) {
    assert.equal(parse([entry(invalid)]).issues.length, 1);
  }
});

test("Exclude every duplicate ID and report one-based positions", () => {
  const result = parse([entry(), entry({ id: ' address ' }), entry({ id: 'unique' })]);
  assert.deepEqual(result.tools.map((tool) => tool.id), ['unique']);
  assert.deepEqual(result.issues.map((issue) => issue.row), [1, 2]);
  assert.match(result.issues[0].message, /重複/);
});

test("Reject invalid URLs, unsafe schemes, and embedded credentials", () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://example.com', '//example.com',
    'https://', 'https://user:pass@example.com', 'https://example.com\\@evil.com',
    'https://exa mple.com', 'https://example.com/\nattack', 'https://-bad.com',
    'https://example.com:99999', 'https://example.com/<script>', 'https://example.com/%zz']) {
    const result = parse([entry({ url })]);
    assert.equal(result.tools.length, 0, url);
    assert.equal(result.issues.length, 1, url);
  }
});

test("Preserve HTTPS paths, queries, and fragments", () => {
  const url = 'https://script.google.com/macros/s/abc/exec?a=1&b=%E3%81%82#top';
  assert.equal(parse([entry({ url })]).tools[0].url, url);
});

test("Return HTML-like names as plain text", () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(parse([entry({ name })]).tools[0].name, name);
});

test("Normalize optional related links while preserving order and input", () => {
  for (const relatedLinks of [undefined, []]) {
    assert.deepEqual(parse([entry({ relatedLinks })]).tools[0].relatedLinks, []);
  }
  const input = entry({ relatedLinks: [
    { label: ' 使い方 ', url: ' https://example.com/manual ', memo: 'private' },
    { label: '編集', url: 'https://script.google.com/home/projects/test' },
  ] });
  const before = structuredClone(input);
  const result = parse([input]).tools[0];
  assert.deepEqual(result.relatedLinks, [
    { label: '使い方', url: 'https://example.com/manual' },
    { label: '編集', url: 'https://script.google.com/home/projects/test' },
  ]);
  assert.deepEqual(input, before);
  assert.deepEqual(result.tags, ['業務']); // 自動タグはメイン URL のみ対象。
});

test("Exclude entries with invalid related links", () => {
  for (const relatedLinks of [null, {}, 'https://example.com', [null], [[]], [123],
    [{}], [{ label: '', url: 'https://example.com' }], [{ label: 1, url: 'https://example.com' }],
    [{ label: '使い方', url: 1 }], [{ label: '使い方', url: ' ' }],
    ...['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com',
      'https://example.com/\nattack', 'https://-bad.com'].map((url) => [{ label: '使い方', url }])]) {
    const result = parse([entry({ relatedLinks })]);
    assert.equal(result.tools.length, 0);
    assert.match(result.issues[0].message, /relatedLinks/);
  }
});
