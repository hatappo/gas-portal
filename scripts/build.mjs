import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import { Linter } from 'eslint';
import { withPortalAssets } from './portal-html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
// Use a conservative syntax baseline for GAS, independently of the local Node version.
// This checks grammar only; GAS service availability still requires runtime validation.
const gasSyntax = new Linter();
function checkGasSyntax(code, filename) {
  const errors = gasSyntax.verify(code, { languageOptions: { ecmaVersion: 2020, sourceType: 'script' } }, { allowInlineConfig: false }).filter((message) => message.fatal);
  if (errors.length) {
    const error = errors[0];
    throw new Error(`${filename}:${error.line}:${error.column}: GAS syntax check (ES2020): ${error.message}`);
  }
}
// Check syntax before replacing output. Building does not access the spreadsheet.
const i18n = readFileSync(path.join(root, 'src/shared/i18n.js'), 'utf8');
checkGasSyntax(i18n, 'i18n.js');
const urlSchemes = readFileSync(path.join(root, 'src/shared/url-schemes.js'), 'utf8');
checkGasSyntax(urlSchemes, 'url-schemes.js');
const serverFiles = ['Code.js', 'Catalog.js', 'SheetCatalog.js'];
const github = readFileSync(path.join(root, 'src/server/GitHub.js'), 'utf8');
checkGasSyntax(github, 'GitHub.js');
for (const file of serverFiles) {
  checkGasSyntax(readFileSync(path.join(root, 'src/server', file), 'utf8'), file);
}
// GAS embeds JS/CSS as HTML. Keep Vite output in memory and update dist only after success.
const bundle = await build({
  configFile: false,
  root: path.join(root, 'src'),
  publicDir: false,
  build: {
    write: false,
    target: 'es2020',
    // HtmlService can misparse URL-bearing template literals emitted by Oxc.
    // Keep string literals quoted and line breaks escaped in the inline bundle.
    minify: 'terser',
    terserOptions: { ecma: 5, format: { inline_script: true } },
    lib: { entry: path.join(root, 'src/browser/main.js'), name: 'MyPortal', formats: ['iife'], fileName: 'client', cssFileName: 'styles' },
  },
});
const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((result) => result.output);
const client = outputs.find((file) => file.type === 'chunk')?.code;
const css = outputs.find((file) => file.type === 'asset' && file.fileName.endsWith('.css'))?.source;
if (outputs.length !== 2 || typeof client !== 'string' || typeof css !== 'string') {
  throw new Error('GAS output requires a single JavaScript bundle and CSS asset.');
}
new vm.Script(client, { filename: 'Client.html' });
if (/<\/script/i.test(client) || /<\/style/i.test(css)) throw new Error('Generated assets must not contain closing HTML tags.');
const index = withPortalAssets(readFileSync(path.join(root, 'src/Index.html'), 'utf8').replace('<!-- repository-link -->', '<!-- portal-repository-link -->'), root)
  .replace('<!-- gas-styles -->', "<?!= include_('Styles'); ?>")
  .replace('<script type="module" src="/browser/main.js"></script>', "<?!= include_('Client'); ?>")
  .replace('<!-- preview-label -->', '');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const file of ['appsscript.json']) {
  copyFileSync(path.join(root, 'src', file), path.join(dist, file));
}
writeFileSync(path.join(dist, 'Index.html'), index);
for (const file of serverFiles) {
  writeFileSync(path.join(dist, file), (file === 'Code.js' ? i18n + '\n' + urlSchemes + '\n' + github + '\n' : '') + readFileSync(path.join(root, 'src/server', file), 'utf8'));
}
writeFileSync(path.join(dist, 'Styles.html'), `<style>\n${css}\n</style>\n`);
writeFileSync(path.join(dist, 'Client.html'), `<script>\n${client}\n</script>\n`);
console.log('Generated seven GAS files in dist/.');
