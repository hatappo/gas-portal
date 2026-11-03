import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertRegular, CONFIG_NAME, packageInfo, readConfig, saveConfig, validateConfig } from './config.mjs';

export function init(root, options = {}) {
  const configFile = path.join(root, CONFIG_NAME);
  const packageFile = path.join(root, 'package.json');
  const ignoreFile = path.join(root, '.gitignore');
  [configFile, packageFile, ignoreFile].forEach(assertRegular);
  const config = existsSync(configFile) ? readConfig(root) : validateConfig({
    ...(options.scriptId !== undefined ? { scriptId: options.scriptId } : {}),
    ...(options.deploymentId !== undefined ? { deploymentId: options.deploymentId } : {}),
    ...(options.authProfile !== undefined ? { authProfile: options.authProfile } : {}),
  });
  const pkg = existsSync(packageFile) ? JSON.parse(readFileSync(packageFile, 'utf8')) : { name: 'my-gas-portal', private: true };
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('package.json の形式が不正です。');
  for (const key of ['scripts', 'dependencies', 'devDependencies']) {
    if (pkg[key] !== undefined && (!pkg[key] || typeof pkg[key] !== 'object' || Array.isArray(pkg[key]))) throw new Error(`package.json の ${key} はオブジェクトにしてください。`);
  }
  pkg.scripts ??= {};
  const scripts = { build: 'portal build', preview: 'portal preview', push: 'portal push', deploy: 'portal deploy', login: 'portal login' };
  for (const [name, command] of Object.entries(scripts)) pkg.scripts[name] ??= command;
  if (!pkg.dependencies?.['gas-portal'] && !pkg.devDependencies?.['gas-portal']) {
    pkg.devDependencies ??= {};
    pkg.devDependencies['gas-portal'] = packageInfo.version;
  }
  const ignore = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '';
  const lines = new Set(ignore.split(/\r?\n/).map((line) => line.trim()));
  // 最後に追加し、既存の ! パターンよりも生成物・認証情報の除外を優先する。
  const block = 'node_modules/\n.portal/\n.clasprc.json\nclient_secret*.json\n';
  const hasFinalBlock = ignore.endsWith(block);
  const nextIgnore = hasFinalBlock ? ignore : ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + '\n# gas-portal: generated files and local credentials\n' + block;
  if (!existsSync(configFile)) saveConfig(root, config);
  writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
  if (!hasFinalBlock || !lines.has('.portal/')) writeFileSync(ignoreFile, nextIgnore);
  return config;
}
