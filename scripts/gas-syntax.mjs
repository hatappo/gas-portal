import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';

/**
 * GAS rejects newer syntax such as logical assignment even when Node accepts it.
 * This checks grammar only; GAS service availability still requires runtime validation.
 */
export function checkGasSyntax(code, filename) {
  try {
    parse(code, { ecmaVersion: 2020, sourceType: 'script' });
  } catch (error) {
    throw new Error(`${filename}:${error.lineNumber}:${error.column}: GAS syntax check (ES2020): ${error.message}`, { cause: error });
  }
}

// `node scripts/gas-syntax.mjs` checks every file that ends up in the GAS project.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const dir of ['src/shared', 'src/server']) {
    for (const file of readdirSync(path.join(root, dir)).filter((name) => name.endsWith('.js')).sort()) {
      checkGasSyntax(readFileSync(path.join(root, dir, file), 'utf8'), `${dir}/${file}`);
    }
  }
}
