import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const temporary = mkdtempSync(path.join(tmpdir(), 'gas-portal-pack-'));
try {
  execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--pack-destination', temporary], { cwd: root, stdio: 'inherit' });
  const name = `${pkg.name}-${pkg.version}.tgz`;
  const source = path.join(temporary, name);
  const destination = path.join(root, 'releases', name);
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    if (!readFileSync(destination).equals(readFileSync(source))) throw new Error('A different package already exists at this version. Bump the version in package.json and try again.');
  } else copyFileSync(source, destination);
  console.log(`Local package: ${destination}`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
