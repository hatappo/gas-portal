import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { sharedSources, serverGroups } from './gas-sources.mjs';
import { checkGasSyntax } from './gas-syntax.mjs';
import { withPortalAssets } from './portal-html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
// Check syntax before replacing output. Building does not access the spreadsheet.
const shared = sharedSources.map((file) => {
  const code = readFileSync(path.join(root, file), 'utf8');
  checkGasSyntax(code, path.basename(file));
  return code;
});
const serverOutputs = Object.fromEntries(Object.entries(serverGroups).map(([output, names]) => {
  const sources = names.map((name) => {
    const code = readFileSync(path.join(root, 'src/server', name + '.js'), 'utf8');
    checkGasSyntax(code, name + '.js');
    return code;
  });
  return [output, [...(output === 'Code.js' ? shared : []), ...sources].join('\n')];
}));
// GAS embeds JS/CSS as HTML. Keep Vite output in memory and update dist only after success.
const bundle = await build({
  configFile: false,
  root: path.join(root, 'src'),
  publicDir: false,
  plugins: [svelte({ configFile: false }), tailwindcss()],
  build: {
    write: false,
    target: 'es2020',
    // Tailwind v4 already requires these browsers. Older targets add large oklch color fallbacks.
    cssTarget: ['chrome111', 'edge111', 'firefox128', 'safari16.4'],
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
for (const [file, source] of Object.entries(serverOutputs)) writeFileSync(path.join(dist, file), source);
writeFileSync(path.join(dist, 'Styles.html'), `<style>\n${css}\n</style>\n`);
writeFileSync(path.join(dist, 'Client.html'), `<script>\n${client}\n</script>\n`);
console.log('Generated eight GAS files in dist/.');
