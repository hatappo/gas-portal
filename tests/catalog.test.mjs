import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entry, server, plain } from './helpers.mjs';

const parse = (entries) => plain(server().context.parseCatalog_(entries));

test('オブジェクト配列から公開データを作り、内部用の余分な項目を返さない', () => {
  assert.deepEqual(parse([entry({ memo: 'private' })]), {
    tools: [{ ...entry(), category: 'その他' }], issues: [],
  });
});

test('tags は配列で指定し、空白・空タグ・重複を除去する', () => {
  const result = parse([entry({ tags: [' 経理 ', '申請', '経理', ' ', '分類,補足'] })]);
  assert.deepEqual(result.tools[0].tags, ['経理', '申請', '分類,補足']);
});

test('Apps Script のオリジンに GAS タグを自動付与する', () => {
  for (const url of ['https://script.google.com', 'https://script.google.com/macros/s/test/exec',
    'https://script.google.com/a/macros/example.com/s/test/exec', 'https://script.google.com?x=1',
    'https://script.google.com#top', ' HTTPS://SCRIPT.GOOGLE.COM:443/macros/s/test/exec ']) {
    const result = parse([entry({ url, tags: undefined })]);
    assert.deepEqual(result.issues, [], url);
    assert.deepEqual(result.tools[0].tags, ['GAS'], url);
  }
});

test('GAS 自動タグは手動タグの後ろに追加し、重複や元データの変更を起こさない', () => {
  for (const [tags, expected] of [[['業務'], ['業務', 'GAS']],
    [[' GAS ', '業務', 'GAS'], ['GAS', '業務']]]) {
    const input = entry({ url: 'https://script.google.com/macros/s/test/exec', tags });
    const before = structuredClone(input);
    assert.deepEqual(parse([input]).tools[0].tags, expected);
    assert.deepEqual(input, before);
  }
});

test('似たホスト・異なるポート・他 URL 内の文字列には GAS タグを付けない', () => {
  for (const url of ['https://script.google.com.example.com/tool', 'https://script.google.company',
    'https://sub.script.google.com', 'https://script.google.com:8443/tool',
    'https://example.com/https://script.google.com', 'https://example.com/?url=https://script.google.com']) {
    assert.deepEqual(parse([entry({ url, tags: [] })]).tools[0].tags, [], url);
  }
  const invalid = parse([entry({ url: 'https://script.google.com@evil.example/tool' })]);
  assert.equal(invalid.tools.length, 0);
  assert.equal(invalid.issues.length, 1);
});

test('scope は社内外の日本語と英語を受け付け、未指定・空欄は社内', () => {
  for (const [scope, expected] of [[undefined, 'internal'], ['', 'internal'], ['社内', 'internal'],
    ['社外', 'external'], ['internal', 'internal'], ['external', 'external']]) {
    assert.equal(parse([entry({ scope })]).tools[0].scope, expected);
  }
  for (const scope of ['unknown', 0, null]) {
    assert.match(parse([entry({ scope })]).issues[0].message, /scope/);
  }
});

test('任意項目を省略すると説明は空・タグなし・社内になる', () => {
  assert.deepEqual(parse([{ id: 'a', name: 'A', url: 'https://example.com' }]).tools[0], {
    id: 'a', name: 'A', url: 'https://example.com', description: '',
    tags: [], relatedLinks: [], scope: 'internal', category: 'その他',
  });
});

test('配列順に依存せず ID を文字列昇順で並べ、元データを変更しない', () => {
  const entries = ['tool-2', 'tool-10', 'tool-1', 'b', ' A ', 'a'].map((id) => entry({ id }));
  const before = structuredClone(entries);
  assert.deepEqual(parse(entries).tools.map((tool) => tool.id), ['A', 'a', 'b', 'tool-1', 'tool-10', 'tool-2']);
  assert.deepEqual(entries, before);
});

test('空配列は正常な空一覧、配列以外は取得失敗', () => {
  assert.deepEqual(parse([]), { tools: [], issues: [] });
  for (const value of [null, undefined, {}, 'invalid']) assert.throws(() => parse(value));
});

test('必須項目の欠落・文字列以外・オブジェクト以外を検出する', () => {
  const entries = [null, [], 42, {}, entry({ id: '' }), entry({ name: 123 }), entry({ url: null })];
  const result = parse(entries);
  assert.equal(result.tools.length, 0);
  assert.deepEqual(result.issues.map((issue) => issue.row), [1, 2, 3, 4, 5, 6, 7]);
});

test('description と tags の型が不正なら除外する', () => {
  for (const invalid of [{ description: 123 }, { tags: '業務' }, { tags: ['業務', 1] }, { tags: null }]) {
    assert.equal(parse([entry(invalid)]).issues.length, 1);
  }
});

test('重複 ID はすべて除外し、配列内の位置（1 始まり）を報告する', () => {
  const result = parse([entry(), entry({ id: ' address ' }), entry({ id: 'unique' })]);
  assert.deepEqual(result.tools.map((tool) => tool.id), ['unique']);
  assert.deepEqual(result.issues.map((issue) => issue.row), [1, 2]);
  assert.match(result.issues[0].message, /重複/);
});

test('不正 URL・危険なスキーム・認証情報入り URL を拒否する', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://example.com', '//example.com',
    'https://', 'https://user:pass@example.com', 'https://example.com\\@evil.com',
    'https://exa mple.com', 'https://example.com/\nattack', 'https://-bad.com',
    'https://example.com:99999', 'https://example.com/<script>', 'https://example.com/%zz']) {
    const result = parse([entry({ url })]);
    assert.equal(result.tools.length, 0, url);
    assert.equal(result.issues.length, 1, url);
  }
});

test('HTTPS のパス・クエリ・フラグメントを保持する', () => {
  const url = 'https://script.google.com/macros/s/abc/exec?a=1&b=%E3%81%82#top';
  assert.equal(parse([entry({ url })]).tools[0].url, url);
});

test('HTML を含む名前はそのままテキストデータとして返す', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(parse([entry({ name })]).tools[0].name, name);
});

test('関連リンクは省略・空配列可で、ラベルと URL を整えて順序と元データを保持する', () => {
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

test('不正な関連リンクは登録不備として除外する', () => {
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
