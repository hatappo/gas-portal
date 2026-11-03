import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { githubUrl } from './repository-url.mjs';

export const CONFIG_NAME = 'portal.config.json';
export const GAS_FILES = ['appsscript.json', 'Code.js', 'Catalog.js', 'SheetCatalog.js', 'Index.html', 'Styles.html', 'Client.html'];
export const packageRoot = new URL('../', import.meta.url);
export const packageInfo = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'));
export const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);

export function validateConfig(value, requireTarget = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('portal.config.json は JSON オブジェクトで指定してください。');
  const allowed = ['scriptId', 'deploymentId', 'authProfile', 'repositoryUrl'];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`未対応の設定: ${key}`);
  for (const key of ['scriptId', 'deploymentId']) {
    if (value[key] !== undefined && !validId(value[key])) throw new Error(`${key} は URL ではなく ID を指定してください。`);
  }
  if (value.authProfile !== undefined && (typeof value.authProfile !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value.authProfile))) {
    throw new Error('authProfile は英数字から始まる 80 文字以内の英数字・ハイフン・アンダースコア・ドットで指定してください。');
  }
  if (value.repositoryUrl !== undefined && (typeof value.repositoryUrl !== 'string' || (value.repositoryUrl !== '' && !githubUrl(value.repositoryUrl)))) {
    throw new Error('repositoryUrl は GitHub リポジトリ URL または空文字にしてください。');
  }
  if (value.deploymentId && !value.scriptId) throw new Error('deploymentId を指定するには scriptId が必要です。');
  if (requireTarget && (!value.scriptId || !value.authProfile)) throw new Error('portal.config.json に scriptId と authProfile を設定してください。');
  return value;
}

export function readConfig(root, requireTarget = false) {
  const file = path.join(root, CONFIG_NAME);
  if (!existsSync(file)) throw new Error('portal.config.json がありません。portal init を実行してください。');
  return validateConfig(JSON.parse(readFileSync(file, 'utf8')), requireTarget);
}

export function assertRegular(file) {
  if (existsSync(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())) throw new Error(`通常のファイルではないため変更しません: ${file}`);
}

export function saveConfig(root, config) {
  validateConfig(config);
  const file = path.join(root, CONFIG_NAME);
  assertRegular(file);
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}

/** 生成物専用ディレクトリだけを扱い、既存の別用途のファイルやシンボリックリンクを上書きしない。 */
export function generatedRoot(root) {
  const dir = path.join(root, '.portal');
  if (existsSync(dir)) {
    if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw new Error('.portal は通常のディレクトリである必要があります。');
    const marker = path.join(dir, 'generated.json');
    assertRegular(marker);
    if (!existsSync(marker) || JSON.parse(readFileSync(marker, 'utf8')).generator !== 'gas-portal') throw new Error('既存の .portal は gas-portal の生成物ではありません。別の場所へ移動してください。');
  } else {
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'generated.json'), JSON.stringify({ generator: 'gas-portal' }) + '\n');
  }
  return dir;
}

export function prepareClasp(root, config) {
  const dir = generatedRoot(root);
  for (const name of ['.clasp.json', '.claspignore']) assertRegular(path.join(dir, name));
  writeFileSync(path.join(dir, '.clasp.json'), JSON.stringify({ scriptId: config.scriptId, rootDir: 'dist' }, null, 2) + '\n');
  writeFileSync(path.join(dir, '.claspignore'), '**/**\n' + GAS_FILES.map((file) => '!' + file).join('\n') + '\n');
  return dir;
}
