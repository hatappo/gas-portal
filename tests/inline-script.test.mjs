import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from 'espree';
import { prepareInlineScript } from '../scripts/inline-script.mjs';

const cssCommentPattern = String.raw`/\/\*.*?\*\//g`;

test('Serialize the Svelte CSS-comment regexp as a constructor while preserving replacement behavior', () => {
  const source = `globalThis.strip = text => text.replaceAll(${cssCommentPattern}, '').trim();`;
  const prepared = prepareInlineScript(source);
  assert.notEqual(prepared, source);
  const { tokens } = parse(prepared, { ecmaVersion: 2020, tokens: true });
  assert.equal(tokens.filter(token => token.regex).length, 0);
  const before = vm.createContext({}), after = vm.createContext({});
  vm.runInContext(source, before);
  vm.runInContext(prepared, after);
  for (const css of ['color:red;/* note */ padding:2px;', '/* first *//* second */', 'color:red', '/* unterminated', '/* multiline\ncomment */', 'content:"日本語";/*注記*/']) {
    assert.equal(after.strip(css), before.strip(css));
  }
});

test('Only slash-bearing literals change; comments, plain templates, division, and ordinary regexps stay intact', () => {
  const source = 'const text = "plain";\nconst template = `ordinary template`;\n/* keep this comment */\nconst ratio = 8 / 2;\nconst ordinary = /hello/i;';
  assert.equal(prepareInlineScript(source), source);
  const withRegExp = source + `\nconst first = ${cssCommentPattern}; const second = ${cssCommentPattern};`;
  const prepared = prepareInlineScript(withRegExp);
  assert.ok(prepared.startsWith(source));
  assert.equal((prepared.match(/new RegExp/g) || []).length, 2);
  new vm.Script(prepared);
});

test('RegExp flags and fresh state per evaluation are preserved', () => {
  const source = `globalThis.make = () => ${cssCommentPattern};`;
  const context = vm.createContext({});
  vm.runInContext(prepareInlineScript(source), context);
  const first = context.make();
  assert.equal(first.flags, 'g');
  assert.equal(first.test('/* comment */'), true);
  assert.ok(first.lastIndex > 0);
  assert.equal(context.make().lastIndex, 0);
});

test('Warning URLs survive comment stripping without changing the message or following statements', () => {
  const source = 'console.warn("https://svelte.dev/e/select_multiple_invalid_value");globalThis.finished=true;';
  // Model the observed truncation, not the undocumented HtmlService implementation.
  const stripLineComments = code => code.replace(/\/\/[^\n]*/g, '');
  assert.equal(stripLineComments(source), 'console.warn("https:');
  assert.throws(() => new vm.Script(stripLineComments(source)), SyntaxError);
  const prepared = prepareInlineScript(source);
  assert.equal(stripLineComments(prepared), prepared);
  const warnings = [];
  const context = vm.createContext({ console: { warn: value => warnings.push(value) } });
  vm.runInContext(stripLineComments(prepared), context);
  assert.deepEqual(warnings, ['https://svelte.dev/e/select_multiple_invalid_value']);
  assert.equal(context.finished, true);
});

test('Escaped slashes, backslashes, quotes, Unicode and property keys keep their runtime values', () => {
  const values = ['https://example.com/日本語?x="a"', '/* comment-like text */', '\\/', '\\u002f', '</script>', 'https://example.com/\u2028\u2029', cssCommentPattern];
  const source = `globalThis.values = ${JSON.stringify(values)}; globalThis.object = { 'https://example.com': 'a/b' }; globalThis.escaped = "https:\\/\\/example.com";`;
  const prepared = prepareInlineScript(source);
  const before = vm.createContext({}), after = vm.createContext({});
  vm.runInContext(source, before);
  vm.runInContext(prepared, after);
  for (const key of ['values', 'object', 'escaped']) assert.equal(JSON.stringify(after[key]), JSON.stringify(before[key]));
  assert.equal(prepareInlineScript(prepared), prepared, 'Repeated preparation is idempotent');
  assert.doesNotMatch(prepared, /\/\/|\/\*|<\/script/i);
});
