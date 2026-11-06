import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { configurePreviewHtml } from '../lib/build.mjs';

test('Namespace every preview storage key per consumer directory', (t) => {
  const roots = [mkdtempSync(path.join(tmpdir(), 'portal-a-')), mkdtempSync(path.join(tmpdir(), 'portal-b-'))];
  t.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));
  roots.forEach((root) => writeFileSync(path.join(root, 'package.json'), JSON.stringify({ 'gas-portal': { repositoryUrl: '' } })));
  const keys = ['portal-preview-source', 'portal-preview-catalog', 'portal-preview-theme', 'portal-preview-language', 'portal-preview-settings',
    'portal-preview-cache-seconds', 'portal-preview-actions-cache-seconds', 'portal-preview-unblocked-url-schemes'];
  const html = keys.map((key) => `localStorage.getItem('${key}');`).join('\n');
  const [first, second] = roots.map((root) => configurePreviewHtml(html, root));
  for (const key of keys) {
    const pattern = new RegExp(`'${key}-([A-Za-z0-9_-]+)'`);
    const [a, b] = [pattern.exec(first)?.[1], pattern.exec(second)?.[1]];
    assert.ok(a && b, `${key} is namespaced`);
    assert.notEqual(a, b, `${key} differs between consumer directories`);
  }
  const namespace = new RegExp(`'portal-preview-source-([A-Za-z0-9_-]+)'`).exec(first)[1];
  assert.equal(first.split(namespace).length - 1, keys.length, 'Each key is namespaced exactly once');
});
