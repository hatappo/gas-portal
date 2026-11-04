import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { githubUrl } from './repository-url.mjs';
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
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('Invalid package.json format.');
  for (const key of ['scripts', 'dependencies', 'devDependencies']) {
    if (pkg[key] !== undefined && (!pkg[key] || typeof pkg[key] !== 'object' || Array.isArray(pkg[key]))) throw new Error(`${key} in package.json must be an object.`);
  }
  pkg.scripts ??= {};
  const scripts = { build: 'portal build', preview: 'portal preview', push: 'portal push', deploy: 'portal deploy', login: 'portal login' };
  for (const [name, command] of Object.entries(scripts)) pkg.scripts[name] ??= command;
  if (!pkg.dependencies?.['gas-portal'] && !pkg.devDependencies?.['gas-portal']) {
    pkg.devDependencies ??= {};
    const repository = githubUrl(packageInfo.repository.url);
    if (!repository) throw new Error('The package source GitHub repository is not configured.');
    pkg.devDependencies['gas-portal'] = `${repository}/releases/download/v${packageInfo.version}/gas-portal-${packageInfo.version}.tgz`;
  }
  const ignore = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '';
  const lines = new Set(ignore.split(/\r?\n/).map((line) => line.trim()));
  // Append exclusions last so existing negation patterns cannot expose output or credentials.
  const block = 'node_modules/\n.portal/\n.clasprc.json\nclient_secret*.json\n';
  const hasFinalBlock = ignore.endsWith(block);
  const nextIgnore = hasFinalBlock ? ignore : ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + '\n# gas-portal: generated files and local credentials\n' + block;
  if (!existsSync(configFile)) saveConfig(root, config);
  writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
  if (!hasFinalBlock || !lines.has('.portal/')) writeFileSync(ignoreFile, nextIgnore);
  return config;
}
