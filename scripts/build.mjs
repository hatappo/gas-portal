import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import { withPortalAssets } from './portal-html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
// Check syntax before replacing output. Building does not access the spreadsheet.
const i18n = readFileSync(path.join(root, 'src/shared/i18n.js'), 'utf8');
new vm.Script(i18n);
const serverFiles = ['Code.js', 'Catalog.js', 'SheetCatalog.js'];
for (const file of serverFiles) {
  new vm.Script(readFileSync(path.join(root, 'src/server', file), 'utf8'), { filename: file });
}
// GAS embeds JS/CSS as HTML. Keep Vite output in memory and update dist only after success.
const bundle = await build({
  configFile: false,
  root: path.join(root, 'src'),
  publicDir: false,
  build: {
    write: false,
    target: 'es2020',
    lib: { entry: path.join(root, 'src/browser/main.js'), name: 'MyPortal', formats: ['iife'], fileName: 'client', cssFileName: 'styles' },
  },
});
const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((result) => result.output);
const client = outputs.find((file) => file.type === 'chunk')?.code;
const css = outputs.find((file) => file.type === 'asset' && file.fileName.endsWith('.css'))?.source;
if (outputs.length !== 2 || typeof client !== 'string' || typeof css !== 'string') {
  throw new Error('GAS output requires a single JavaScript bundle and CSS asset.');
}
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
  writeFileSync(path.join(dist, file), (file === 'Code.js' ? i18n + '\n' : '') + readFileSync(path.join(root, 'src/server', file), 'utf8'));
}
writeFileSync(path.join(dist, 'Styles.html'), `<style>\n${css}\n</style>\n`);
writeFileSync(path.join(dist, 'Client.html'), `<script>\n${client}\n</script>\n`);
console.log('Generated seven GAS files in dist/.');
