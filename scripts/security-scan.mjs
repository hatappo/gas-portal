import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'smol-toml';

export function readExceptions(text) {
  const config = parse(text);
  if (Object.keys(config).some(key => key !== 'IgnoredVulns')) {
    throw new Error('Only individual IgnoredVulns exceptions are allowed.');
  }
  const entries = config.IgnoredVulns ?? [];
  if (!Array.isArray(entries)) throw new Error('IgnoredVulns must be an array.');
  const seen = new Set();
  return entries.map(entry => {
    if (Object.keys(entry).some(key => !['id', 'effectiveUntil', 'reason'].includes(key)) ||
        typeof entry.id !== 'string' || !/^[A-Za-z0-9-]+$/.test(entry.id) || seen.has(entry.id) ||
        typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new Error('Each exception needs a unique advisory ID and a non-empty reason.');
    }
    const date = entry.effectiveUntil;
    if (!(date instanceof Date) || !Number.isFinite(date.getTime()) ||
        !date.isDate?.()) {
      throw new Error(`Exception ${entry.id} needs an effectiveUntil date (YYYY-MM-DD).`);
    }
    seen.add(entry.id);
    return { id: entry.id, reason: entry.reason, expires: Date.prototype.toISOString.call(date).slice(0, 10) };
  });
}

export function findings(report) {
  if (!Array.isArray(report.results)) throw new Error('Invalid OSV report: missing results.');
  const rows = new Map();
  let packageCount = 0;
  for (const result of report.results) {
    if (!Array.isArray(result.packages)) throw new Error('Invalid OSV report: missing packages.');
    for (const item of result.packages) {
      const pkg = item.package;
      if (!pkg?.name || !pkg.version || !pkg.ecosystem) throw new Error('Invalid OSV package.');
      packageCount++;
      if (item.vulnerabilities !== undefined && !Array.isArray(item.vulnerabilities)) {
        throw new Error('Invalid OSV vulnerabilities.');
      }
      for (const vulnerability of item.vulnerabilities ?? []) {
        if (!vulnerability.id) throw new Error('Invalid OSV advisory.');
        const key = JSON.stringify([pkg.ecosystem, pkg.name, pkg.version, vulnerability.id]);
        rows.set(key, {
          key, name: pkg.name, version: pkg.version, id: vulnerability.id,
          aliases: vulnerability.aliases ?? [], summary: vulnerability.summary ?? '',
        });
      }
    }
  }
  // --all-packages makes an empty scan a setup error, never a clean result.
  if (!packageCount) throw new Error('OSV scanned no packages.');
  return [...rows.values()];
}

export function summarize(raw, filtered, exceptions, today = new Date().toISOString().slice(0, 10)) {
  const all = findings(raw);
  const remaining = findings(filtered);
  const remainingKeys = new Set(remaining.map(row => row.key));
  const rawKeys = new Set(all.map(row => row.key));
  if (remaining.some(row => !rawKeys.has(row.key))) {
    throw new Error('Scan results changed between runs. Retry the scan.');
  }
  const accepted = [];
  for (const row of all.filter(row => !remainingKeys.has(row.key))) {
    const exception = exceptions.find(entry => [row.id, ...row.aliases].includes(entry.id));
    if (!exception || exception.expires <= today) {
      throw new Error(`OSV filtered ${row.id} without a current exception.`);
    }
    accepted.push({ ...row, exception });
  }
  const expired = exceptions.filter(entry => entry.expires <= today);
  const unused = exceptions.filter(entry => !all.some(row => [row.id, ...row.aliases].includes(entry.id)));
  return { all, remaining, accepted, expired, unused };
}

function cell(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;').replace(/[\r\n]/g, ' ');
}

export function markdown(result) {
  const lines = [
    '# Dependency security scan', '',
    '| Status | Count |', '| --- | ---: |',
    `| Requires action | ${result.remaining.length} |`,
    `| Temporarily accepted | ${result.accepted.length} |`,
    `| Expired exceptions | ${result.expired.length} |`,
    '', 'Counts are package/version/advisory findings, not npm audit dependency-chain counts.', '',
  ];
  if (result.remaining.length) {
    lines.push('## Requires action', '', '| Package | Advisory | Summary |', '| --- | --- | --- |');
    for (const row of result.remaining) {
      lines.push(`| ${cell(row.name)}@${cell(row.version)} | ${cell(row.id)} | ${cell(row.summary)} |`);
    }
    lines.push('');
  }
  if (result.accepted.length) {
    lines.push('## Temporarily accepted (not fixed)', '', '| Package | Advisory | Expires (UTC) | Reason |', '| --- | --- | --- | --- |');
    for (const row of result.accepted) {
      lines.push(`| ${cell(row.name)}@${cell(row.version)} | ${cell(row.id)} | ${row.exception.expires} | ${cell(row.exception.reason)} |`);
    }
    lines.push('');
  }
  for (const [title, entries] of [['Expired exceptions — review required', result.expired], ['Exceptions no longer matched — remove or review', result.unused]]) {
    if (entries.length) lines.push(`## ${title}`, '', ...entries.map(entry => `- ${cell(entry.id)}: ${entry.expires} — ${cell(entry.reason)}`), '');
  }
  lines.push('The artifact contains unfiltered and filtered OSV JSON, scanner logs, and the exception policy used for this run.', '');
  return lines.join('\n');
}

export function checkScanStatus(result, name) {
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error(`${name} scan failed (${result.error?.message ?? result.signal ?? result.status}). See scanner logs.`);
  }
}

export function run(root = process.cwd()) {
  const output = resolve(root, 'security-reports');
  mkdirSync(output, { recursive: true });
  // Never retain a previous successful report when the current scan fails.
  for (const name of ['raw.json', 'filtered.json', 'summary.md', 'raw.log', 'filtered.log', 'version.log']) {
    rmSync(resolve(output, name), { force: true });
  }
  try {
    const policy = readFileSync(resolve(root, 'osv-scanner.toml'), 'utf8');
    const exceptions = readExceptions(policy);
    writeFileSync(resolve(output, 'osv-scanner.toml'), policy);
    writeFileSync(resolve(output, 'unfiltered.toml'), '# Intentionally empty: preserve every finding.\n');
    const scanner = process.env.OSV_SCANNER || 'osv-scanner';
    const version = spawnSync(scanner, ['--version'], { encoding: 'utf8', timeout: 10000 });
    writeFileSync(resolve(output, 'version.log'), `${version.stdout ?? ''}${version.stderr ?? ''}`);
    if (version.status !== 0 || !/^osv-scanner version: 2\.7\.1\s/m.test(version.stdout ?? '')) {
      throw new Error('Install OSV-Scanner 2.7.1 or set OSV_SCANNER to its executable path.');
    }
    const reports = {};
    const statuses = {};
    for (const [name, config] of [['raw', 'unfiltered.toml'], ['filtered', 'osv-scanner.toml']]) {
      const result = spawnSync(scanner, [
        'scan', 'source', '--lockfile', resolve(root, 'package-lock.json'),
        '--config', resolve(output, config), '--all-packages', '--all-vulns',
        '--format', 'json', '--output-file', resolve(output, `${name}.json`),
      ], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
      writeFileSync(resolve(output, `${name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      checkScanStatus(result, name);
      reports[name] = JSON.parse(readFileSync(resolve(output, `${name}.json`), 'utf8'));
      statuses[name] = result.status;
    }
    const result = summarize(reports.raw, reports.filtered, exceptions);
    const summary = markdown(result);
    writeFileSync(resolve(output, 'summary.md'), summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log(`OSV: ${result.remaining.length} actionable, ${result.accepted.length} temporarily accepted, ${result.expired.length} expired. See security-reports/summary.md.`);
    return statuses.filtered === 1 || result.remaining.length || result.expired.length ? 1 : 0;
  } catch (error) {
    const summary = `# Dependency security scan\n\nScan incomplete: ${cell(error.message)}\n\nThis is not a clean security result.\n`;
    writeFileSync(resolve(output, 'summary.md'), summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.error(error.message);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = run();
}
