import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkScanStatus, findings, markdown, readExceptions, run, summarize } from '../scripts/security-scan.mjs';

const id = 'GHSA-test-test-test';
const policy = `[[IgnoredVulns]]\nid = "${id}"\neffectiveUntil = 2099-01-01\nreason = "Developer-controlled input only."\n`;
const report = (ids = []) => ({ results: [{ packages: [{
  package: { ecosystem: 'npm', name: 'example', version: '1.0.0' },
  vulnerabilities: ids.map(value => ({ id: value, aliases: ['CVE-2098-1234'], summary: 'Example vulnerability' })),
}] }] });

test('Risk exceptions require unique IDs, reasons and explicit dates; broad exclusions are rejected', () => {
  assert.equal(readExceptions(policy)[0].expires, '2099-01-01');
  for (const invalid of [policy + policy, policy.replace('reason = "Developer-controlled input only."', ''),
    policy.replace('effectiveUntil = 2099-01-01', ''), policy.replace('2099-01-01', '"2099-01-01"'),
    '[[PackageOverrides]]\nignore = true', policy + 'ignoreUntil = 2099-01-01\n']) {
    assert.throws(() => readExceptions(invalid));
  }
});

test('Summary preserves accepted findings and leaves unknown findings actionable', () => {
  const result = summarize(report([id, 'GHSA-new-new-new']), report(['GHSA-new-new-new']), readExceptions(policy), '2098-12-01');
  assert.equal(result.accepted.length, 1);
  assert.equal(result.remaining.length, 1);
  const text = markdown(result);
  assert.match(text, /Temporarily accepted \(not fixed\)/);
  assert.match(text, /Developer-controlled input only/);
  assert.match(text, /2099-01-01/);
  assert.match(text, /GHSA-new-new-new/);
});

test('Expired and obsolete exceptions remain visible, and hidden results need a current matching reason', () => {
  const exceptions = readExceptions(policy);
  const result = summarize(report([id]), report([id]), exceptions, '2099-01-01');
  assert.equal(result.expired.length, 1);
  assert.equal(result.remaining.length, 1);
  assert.equal(summarize(report(), report(), exceptions, '2098-01-01').unused.length, 1);
  assert.throws(() => summarize(report([id]), report(), exceptions, '2099-01-01'));
  assert.throws(() => summarize(report([id]), report(), [], '2098-01-01'));
  assert.throws(() => summarize(report(), report([id]), [], '2098-01-01'));
});

test('Aliases are matched and duplicate package findings are counted once', () => {
  const raw = report([id]);
  raw.results.push(raw.results[0]);
  assert.equal(findings(raw).length, 1);
  const aliases = readExceptions(policy.replace(id, 'CVE-2098-1234'));
  assert.equal(summarize(raw, report(), aliases, '2098-01-01').accepted.length, 1);
});

test('Missing packages, corrupt reports, scanner errors and timeouts cannot pass as clean scans', () => {
  for (const malformed of [{}, { results: [] }, { results: [{}] }, { results: [{ packages: [{}] }] }]) {
    assert.throws(() => findings(malformed));
  }
  checkScanStatus({ status: 0 }, 'test');
  checkScanStatus({ status: 1 }, 'test');
  for (const result of [{ status: 127 }, { status: 128 }, { status: null, signal: 'SIGTERM' }, { error: new Error('timeout') }]) {
    assert.throws(() => checkScanStatus(result, 'test'));
  }
});

test('Report tables escape HTML, table separators and injected line breaks', () => {
  const exceptions = readExceptions(policy);
  exceptions[0].reason = '<script>|\n## misleading';
  const text = markdown(summarize(report([id]), report(), exceptions, '2098-01-01'));
  assert.match(text, /&lt;script&gt;&#124; ## misleading/);
  assert.doesNotMatch(text, /<script>|\n## misleading/);
});

test('The scan runner retains raw evidence, fails on errors and removes stale successful output', () => {
  const root = mkdtempSync(join(tmpdir(), 'portal-security-'));
  const executable = join(root, 'scanner.mjs');
  const originalScanner = process.env.OSV_SCANNER;
  const originalSummary = process.env.GITHUB_STEP_SUMMARY;
  try {
    process.env.OSV_SCANNER = executable;
    delete process.env.GITHUB_STEP_SUMMARY;
    writeFileSync(join(root, 'osv-scanner.toml'), policy);
    writeFileSync(executable, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('osv-scanner version: 2.7.1'); process.exit(0); }
const raw = args[args.indexOf('--config') + 1].endsWith('unfiltered.toml');
writeFileSync(args[args.indexOf('--output-file') + 1], JSON.stringify(raw ? ${JSON.stringify(report([id]))} : ${JSON.stringify(report())}));
process.exit(raw ? 1 : 0);
`, { mode: 0o755 });
    assert.equal(run(root), 0);
    assert.match(readFileSync(join(root, 'security-reports/raw.json'), 'utf8'), new RegExp(id));
    assert.match(readFileSync(join(root, 'security-reports/summary.md'), 'utf8'), /Temporarily accepted \| 1/);
    writeFileSync(join(root, 'osv-scanner.toml'), policy.replace('2099-01-01', '2000-01-01'));
    assert.notEqual(run(root), 0);
    writeFileSync(executable, '#!/usr/bin/env node\nprocess.exit(127);\n');
    assert.equal(run(root), 2);
    assert.match(readFileSync(join(root, 'security-reports/summary.md'), 'utf8'), /Scan incomplete/);
    assert.throws(() => readFileSync(join(root, 'security-reports/raw.json')));
  } finally {
    if (originalScanner === undefined) delete process.env.OSV_SCANNER;
    else process.env.OSV_SCANNER = originalScanner;
    if (originalSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = originalSummary;
    rmSync(root, { recursive: true, force: true });
  }
});
