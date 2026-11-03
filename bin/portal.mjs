#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { init } from '../lib/init.mjs';
import { build, buildPreview } from '../lib/build.mjs';
import { packageInfo } from '../lib/config.mjs';
import { deploy, deployments, login, push, status } from '../lib/remote.mjs';

const help = `gas-portal ${packageInfo.version}
Usage: portal <command> [options]

  init [--script-id ID] [--auth-profile NAME] [--deployment-id ID]
                   設定・npm scripts・.gitignore を作成（既存値は保持）
  login            現場の Google アカウントでログイン
  status           認証プロフィールと認証状態を確認
  build            .portal/dist に GAS 用コードを生成（通信なし）
  preview [--port NUMBER]
                   架空データのローカルプレビュー（既定: 4173）
  push             build 後に GAS へアップロード（デプロイしない）
  deployments      対象 GAS のデプロイ一覧
  deploy [--deployment-id ID] [--description TEXT]
                   GAS 側の最新コードで既存デプロイを更新（push なし）

初期化は GAS エディタで initializeProperties を実行してください。
`;

export async function main(args = process.argv.slice(2), root = process.cwd()) {
  const [command, ...rest] = args;
  if (!command || ['--help', '-h', 'help'].includes(command)) { console.log(help); return; }
  if (['--version', '-v'].includes(command)) { console.log(packageInfo.version); return; }
  const definitions = {
    init: { 'script-id': { type: 'string' }, 'auth-profile': { type: 'string' }, 'deployment-id': { type: 'string' } },
    preview: { port: { type: 'string' } },
    deploy: { 'deployment-id': { type: 'string' }, description: { type: 'string', short: 'd' } },
    build: {}, push: {}, login: {}, status: {}, deployments: {},
  };
  if (!Object.hasOwn(definitions, command)) throw new Error(`未対応のコマンド: ${command}\nportal --help を参照してください。`);
  const { values } = parseArgs({ args: rest, options: definitions[command], allowPositionals: false });
  if (command === 'init') {
    init(root, { scriptId: values['script-id'], authProfile: values['auth-profile'], deploymentId: values['deployment-id'] });
    console.log('設定を準備しました。portal.config.json の scriptId・authProfile を確認して npm install を実行してください。既存設定は保持しています。');
  } else if (command === 'build') {
    const result = build(root);
    console.log(`${result.output}: gas-portal ${result.version} / ${result.files.length} files`);
  } else if (command === 'preview') {
    const port = Number(values.port ?? process.env.PORT ?? 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port は 1〜65535 を指定してください。');
    const previewRoot = buildPreview(root);
    const { createServer } = await import('vite');
    const server = await createServer({ configFile: false, root: previewRoot, publicDir: false, appType: 'mpa',
      server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [previewRoot] } },
    });
    try { await server.listen(); } catch (error) { await server.close(); throw error; }
    server.printUrls();
    console.log('架空データのみを表示します。Google や本番プロパティには接続しません。');
    const shutdown = async () => { await server.close(); process.exit(0); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } else if (command === 'deploy') deploy(root, { deploymentId: values['deployment-id'], description: values.description });
  else ({ push, login, status, deployments })[command](root);
}

if (import.meta.main) {
  try { await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
