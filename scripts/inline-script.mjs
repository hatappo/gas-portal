import { parse } from 'espree';

/**
 * HtmlService can mistake comment-like text in minified regexps and strings for
 * JavaScript comments (observed with Svelte's CSS regexp and warning URLs).
 * Serialize slash-bearing literals after minification so it cannot reintroduce
 * those delimiters. AST values preserve escapes, Unicode, flags, and semantics;
 * do not rewrite source text with a global search/replace.
 */
export function prepareInlineScript(source) {
  const ast = parse(source, { ecmaVersion: 2020, range: true });
  const replacements = [];
  const quote = value => JSON.stringify(value)
    .replaceAll('/', '\\u002f').replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  function visit(node) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (node.type === 'Literal') {
      if (node.regex?.pattern.includes('/')) {
        replacements.push({ range: node.range, text: `(new RegExp(${quote(node.regex.pattern)},${quote(node.regex.flags)}))` });
      } else if (typeof node.value === 'string' && node.value.includes('/')) {
        replacements.push({ range: node.range, text: quote(node.value) });
      }
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  }
  visit(ast);
  let result = source;
  for (const { range, text } of replacements.sort((a, b) => b.range[0] - a.range[0])) {
    result = result.slice(0, range[0]) + text + result.slice(range[1]);
  }
  return result;
}
