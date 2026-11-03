import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPreview } from './preview.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// パッケージ生成時は開発者の接続先・シート・Git remote を持ち込まない。
const source = readFileSync(path.join(root, 'src/Index.html'), 'utf8')
  .replace('href="<?= projectUrl ?>"', 'data-portal-project-link')
  .replace('<!-- repository-link -->', '<!-- portal-repository-link -->');
const preview = renderPreview(source, root, { configPath: path.join(root, 'assets/unused-config.json'), spreadsheetId: '' })
  .replace('<!-- gas-styles -->', () => readFileSync(path.join(root, 'dist/Styles.html'), 'utf8'))
  .replace('<script type="module" src="/browser/main.js"></script>', () => readFileSync(path.join(root, 'dist/Client.html'), 'utf8'));
if (/<\?/.test(preview)) throw new Error('プレビューに未解決の GAS テンプレートが残っています。');
rmSync(path.join(root, 'assets'), { recursive: true, force: true });
mkdirSync(path.join(root, 'assets/preview'), { recursive: true });
cpSync(path.join(root, 'dist'), path.join(root, 'assets/gas'), { recursive: true });
cpSync(path.join(root, 'src/assets/external-link.svg'), path.join(root, 'assets/external-link.svg'));
cpSync(path.join(root, 'src/mobile.html'), path.join(root, 'assets/preview/mobile.html'));
writeFileSync(path.join(root, 'assets/preview/index.html'), preview);
console.log('assets/ に配布用の GAS コードとモックプレビューを生成しました。');
