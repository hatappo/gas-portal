#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { init } from '../lib/init.mjs';
import { build } from '../lib/build.mjs';
import { createPreviewServer } from '../lib/preview.mjs';
import { packageInfo } from '../lib/config.mjs';
import { browse, deploy, deployments, login, push, status } from '../lib/remote.mjs';

const help = `gas-portal ${packageInfo.version}
Usage: portal <command> [options]

  init [--script-id ID] [--auth-profile NAME] [--deployment-id ID]
                   Create configuration, npm scripts, and .gitignore (preserve existing values)
  login            Sign in with this environment's Google account
  status           Check the authentication profile and status
  build            Generate GAS code in .portal/dist (offline)
  preview [--port NUMBER]
                   Preview mock data locally (default port: 4173)
  browse [--deployment-id ID]
                   Open the published web app in your default browser
  push             Build and upload to GAS (without deploying)
  deployments      List deployments for the target GAS project
  deploy [--deployment-id ID] [--description TEXT]
                   Update an existing deployment from code saved in GAS (without pushing)

To initialize properties, run initializeProperties in the GAS editor.
`;

export async function main(args = process.argv.slice(2), root = process.cwd()) {
  const [command, ...rest] = args;
  if (!command || ['--help', '-h', 'help'].includes(command)) { console.log(help); return; }
  if (['--version', '-v'].includes(command)) { console.log(packageInfo.version); return; }
  const definitions = {
    init: { 'script-id': { type: 'string' }, 'auth-profile': { type: 'string' }, 'deployment-id': { type: 'string' } },
    preview: { port: { type: 'string' } },
    browse: { 'deployment-id': { type: 'string' } },
    deploy: { 'deployment-id': { type: 'string' }, description: { type: 'string', short: 'd' } },
    build: {}, push: {}, login: {}, status: {}, deployments: {},
  };
  if (!Object.hasOwn(definitions, command)) throw new Error(`Unknown command: ${command}\nSee portal --help.`);
  const { values } = parseArgs({ args: rest, options: definitions[command], allowPositionals: false });
  if (command === 'init') {
    init(root, { scriptId: values['script-id'], authProfile: values['auth-profile'], deploymentId: values['deployment-id'] });
    console.log('Configuration is ready. Check scriptId and authProfile under "gas-portal" in package.json, then run npm install. Existing values were preserved.');
  } else if (command === 'build') {
    const result = build(root);
    console.log(`${result.output}: gas-portal ${result.version} / ${result.files.length} files`);
  } else if (command === 'preview') {
    const port = Number(values.port ?? process.env.PORT ?? 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be an integer between 1 and 65535.');
    const server = await createPreviewServer(root, { port });
    try { await server.listen(); } catch (error) { await server.close(); throw error; }
    server.printUrls();
    console.log('Showing mock data only. No connection to Google or production properties.');
    const shutdown = async () => { await server.close(); process.exit(0); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } else if (command === 'browse') browse(root, { deploymentId: values['deployment-id'] });
  else if (command === 'deploy') deploy(root, { deploymentId: values['deployment-id'], description: values.description });
  else ({ push, login, status, deployments })[command](root);
}

if (import.meta.main) {
  try { await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
