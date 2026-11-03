import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareClasp, readConfig, saveConfig, validId } from './config.mjs';
import { build } from './build.mjs';

/** シェルを通さず、常に現場で選んだ認証プロフィールを明示する。 */
export function runClasp(root, config, args, capture = false) {
  root = realpathSync(root);
  return execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('@google/clasp')),
    '--user', config.authProfile, '--project', path.join(root, '.portal/.clasp.json'), ...args], {
    cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

export function showTarget(config, log = console.log) {
  log(`認証プロフィール: ${config.authProfile} / GAS: ${config.scriptId}`);
}

export function login(root, run = runClasp) {
  const config = readConfig(root, true);
  prepareClasp(root, config);
  showTarget(config);
  run(root, config, ['login']);
}

export function status(root, run = runClasp) {
  const config = readConfig(root, true);
  prepareClasp(root, config);
  showTarget(config);
  run(root, config, ['show-authorized-user']);
}

export function push(root, run = runClasp) {
  const config = readConfig(root, true);
  build(root);
  showTarget(config);
  run(root, config, ['push']);
}

export function listDeployments(root, config, run = runClasp) {
  const list = JSON.parse(run(root, config, ['--json', 'list-deployments'], true));
  if (!Array.isArray(list) || list.some((entry) => !entry || !validId(entry.deploymentId) ||
    (entry.versionNumber != null && (!Number.isInteger(entry.versionNumber) || entry.versionNumber < 1)))) {
    throw new Error('デプロイ一覧の形式が不正です。更新を中止しました。');
  }
  return list;
}

export function deployments(root, run = runClasp) {
  const config = readConfig(root, true);
  prepareClasp(root, config);
  showTarget(config);
  const list = listDeployments(root, config, run);
  for (const item of list) console.log(`${item.deploymentId} @${item.versionNumber ?? 'HEAD'}${item.deploymentId === config.deploymentId ? ' (configured)' : ''}`);
  return list;
}

/** build・push は行わない。GAS に保存済みのコードから既存公開デプロイを更新する。 */
export function deploy(root, options = {}, run = runClasp) {
  if (options.deploymentId !== undefined && !validId(options.deploymentId)) throw new Error('deploymentId が不正です。');
  const config = readConfig(root, true);
  prepareClasp(root, config);
  showTarget(config);
  const published = listDeployments(root, config, run).filter((entry) => entry.versionNumber != null);
  if (!published.length) throw new Error('公開用デプロイがありません。初回は GAS コンソールの「デプロイ」→「新しいデプロイ」→「ウェブアプリ」から、実行者・アクセスを自分にして手動でデプロイしてください。');
  const id = options.deploymentId ?? config.deploymentId;
  if (!id && published.length !== 1) throw new Error('公開用デプロイが複数あります。portal deployments で確認し、portal deploy --deployment-id ID でウェブアプリを指定してください。');
  const target = id ? published.find((entry) => entry.deploymentId === id) : published[0];
  if (!target) throw new Error('指定した deploymentId は対象 GAS の公開用デプロイにありません。更新を中止しました。');
  const args = ['update-deployment', target.deploymentId];
  if (options.description !== undefined) args.push('--description', options.description);
  console.log(`更新先: ${target.deploymentId}（現在 @${target.versionNumber}）`);
  run(root, config, args);
  if (config.deploymentId !== target.deploymentId) {
    try { saveConfig(root, { ...config, deploymentId: target.deploymentId }); }
    catch { throw new Error(`デプロイ更新は成功しましたが、設定ファイルへの保存に失敗しました。deploymentId に ${target.deploymentId} を設定してください。`); }
  }
  return target.deploymentId;
}
