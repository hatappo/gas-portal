import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig, restoreConfig, validateConfig, normalizePageUrl, pageRequest, pageLabel } from '../extension/config.ts';
const nonce = 'a'.repeat(32);

test('Page URLs preserve queries and fragments, keep nonce templates readable and reject unsafe schemes', () => {
  assert.equal(normalizePageUrl(' https://example.com/?key=%7Bnonce%7D#section '), 'https://example.com/?key={nonce}#section');
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/test', 'http://example.com', 'https://user:secret@example.com', 'https://{nonce}.example.com/', 'chrome://settings']) assert.equal(normalizePageUrl(url), null);
});
test('The URL template substitutes all nonce occurrences without changing other parameters or persisted configuration', () => {
  const url = 'https://example.com/{nonce}?keep=a%26b&nonce={nonce}&nonce={nonce}#part';
  const config = validateConfig({ pages: [{ id: 'page', name: 'Example', url }], activePageId: 'page' });
  assert.equal(pageRequest(config, nonce), url.replaceAll('{nonce}', nonce));
  assert.equal(config.pages[0].url, url);
  assert.throws(() => pageRequest(config, 'invalid'));
  assert.equal(pageRequest(emptyConfig(), nonce), null);
});
test('Previous page configurations flatten parameter sets and drop the old schema', () => {
  const previous = { pages: [{ id: 'page', name: 'Example', url: 'https://example.com/?keep=1#part', parameterSetId: 'preset' }], activePageId: 'page', parameterSets: [{ id: 'preset', parameters: 'mode=compact\nrequest={nonce}', readiness: 'none' }] };
  const config = restoreConfig({ panelConfig: previous });
  assert.deepEqual(config, { pages: [{ id: 'page', name: 'Example', url: 'https://example.com/?keep=1&mode=compact&request={nonce}#part' }], activePageId: 'page' });
  assert.deepEqual(restoreConfig({ panelConfig: config }), config);
  const legacy = restoreConfig({ portalUrl: 'https://script.google.com/macros/s/test/exec#links' });
  assert.equal(legacy.pages[0].url, 'https://script.google.com/macros/s/test/exec?sidePanel=1&panelNonce={nonce}#links');
});
test('Page settings reject duplicates, allow blank names and recover a removed active page', () => {
  const config = { pages: [{ id: 'page', name: 'Example', url: 'https://example.com/' }], activePageId: 'page' };
  assert.throws(() => validateConfig({ ...config, pages: [...config.pages, ...config.pages] }));
  const blank = validateConfig({ ...config, pages: [{ ...config.pages[0], name: ' ' }] });
  assert.equal(blank.pages[0].name, '');
  assert.equal(pageLabel(blank.pages[0]), 'example.com');
  assert.equal(pageLabel({ ...blank.pages[0], url: 'https://other.example:8443/path?secret=hidden' }), 'other.example:8443');
  assert.equal(pageLabel({ ...blank.pages[0], name: 'Custom' }), 'Custom');
  assert.equal(validateConfig({ ...config, activePageId: 'deleted' }).activePageId, 'page');
  assert.throws(() => restoreConfig({ panelConfig: null }));
});
