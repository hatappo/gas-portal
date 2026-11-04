import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPreview } from './preview.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Exclude the developer's project, spreadsheet, and Git remote from packaged assets.
const source = readFileSync(path.join(root, 'src/Index.html'), 'utf8')
  .replace('href="<?= projectUrl ?>"', 'data-portal-project-link')
  .replace('<!-- repository-link -->', '<!-- portal-repository-link -->');
const preview = renderPreview(source, root, { configPath: path.join(root, 'assets/unused-config.json'), spreadsheetId: '' })
  .replace('<!-- gas-styles -->', () => readFileSync(path.join(root, 'dist/Styles.html'), 'utf8'))
  .replace('<script type="module" src="/browser/main.js"></script>', () => readFileSync(path.join(root, 'dist/Client.html'), 'utf8'));
if (/<\?/.test(preview)) throw new Error('The preview contains unresolved GAS template expressions.');
rmSync(path.join(root, 'assets'), { recursive: true, force: true });
mkdirSync(path.join(root, 'assets/preview'), { recursive: true });
cpSync(path.join(root, 'dist'), path.join(root, 'assets/gas'), { recursive: true });
for (const name of ['external-link', 'refresh-cw', 'layout-grid', 'list']) {
  cpSync(path.join(root, `src/assets/${name}.svg`), path.join(root, `assets/${name}.svg`));
}
cpSync(path.join(root, 'src/mobile.html'), path.join(root, 'assets/preview/mobile.html'));
writeFileSync(path.join(root, 'assets/preview/index.html'), preview);
console.log('Generated packaged GAS code and mock preview in assets/.');
