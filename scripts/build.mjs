import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import { withPortalAssets } from './portal-html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
// 構文エラーを検出してから生成物を置き換える。ビルド時にシートへアクセスしない。
const serverFiles = ['Code.js', 'Catalog.js', 'SheetCatalog.js'];
for (const file of serverFiles) {
  new vm.Script(readFileSync(path.join(root, 'src/server', file), 'utf8'), { filename: file });
}
// GAS は JS/CSS を HTML として同梱する。Vite の結果をメモリで受け取り、成功後だけ dist を更新する。
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
  throw new Error('GAS 向けの出力は単一の JS と CSS が必要です。');
}
if (/<\/script/i.test(client) || /<\/style/i.test(css)) throw new Error('生成物に HTML の終了タグを含めることはできません。');
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
  copyFileSync(path.join(root, 'src/server', file), path.join(dist, file));
}
writeFileSync(path.join(dist, 'Styles.html'), `<style>\n${css}\n</style>\n`);
writeFileSync(path.join(dist, 'Client.html'), `<script>\n${client}\n</script>\n`);
console.log('dist/ に GAS 用の 7 ファイルを出力しました。');
