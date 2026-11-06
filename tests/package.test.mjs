import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GAS_FILES } from '../lib/config.mjs';

test("Packages contain compiled assets and CLI without source, configuration, or credentials", (t) => {
  const cache = mkdtempSync(path.join(tmpdir(), 'gas-portal-pack-cache-'));
  t.after(() => rmSync(cache, { recursive: true, force: true }));
  const result = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache], { encoding: 'utf8' }));
  const report = Array.isArray(result) ? result[0] : result['gas-portal'];
  const files = report.files.map(({ path }) => path);
  for (const name of GAS_FILES) assert.ok(files.includes(`assets/gas/${name}`));
  for (const name of ['bin/portal.mjs', 'assets/preview/index.html', 'LICENSE', 'NOTICE']) assert.ok(files.includes(name));
  assert.ok(!files.some((name) => /^(src|tests|scripts|node_modules|\.git|\.portal)\//.test(name)));
  assert.ok(!files.some((name) => /(?:\.clasp|client_secret|\.env)/.test(name)));
});
