import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareClasp, readConfig, saveConfig, validId } from './config.mjs';
import { build } from './build.mjs';

/** Avoid the shell and always select the environment's authentication profile explicitly. */
export function runClasp(root, config, args, capture = false) {
  root = realpathSync(root);
  return execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('@google/clasp')),
    '--user', config.authProfile, '--project', path.join(root, '.portal/.clasp.json'), ...args], {
    cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

export function showTarget(config, log = console.log) {
  log(`Authentication profile: ${config.authProfile} / GAS: ${config.scriptId}`);
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
    throw new Error('Invalid deployment list. Update cancelled.');
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

/** Update an existing deployment from code saved in GAS, without building or pushing. */
export function deploy(root, options = {}, run = runClasp) {
  if (options.deploymentId !== undefined && !validId(options.deploymentId)) throw new Error('Invalid deploymentId.');
  const config = readConfig(root, true);
  prepareClasp(root, config);
  showTarget(config);
  const published = listDeployments(root, config, run).filter((entry) => entry.versionNumber != null);
  if (!published.length) throw new Error('No versioned deployment exists. Create the first web app manually in the GAS console: Deploy > New deployment > Web app. Execute as yourself and restrict access to yourself.');
  const id = options.deploymentId ?? config.deploymentId;
  if (!id && published.length !== 1) throw new Error('Multiple versioned deployments exist. Check portal deployments, then select the web app with portal deploy --deployment-id ID.');
  const target = id ? published.find((entry) => entry.deploymentId === id) : published[0];
  if (!target) throw new Error('The specified deploymentId is not a versioned deployment in this GAS project. Update cancelled.');
  const args = ['update-deployment', target.deploymentId];
  if (options.description !== undefined) args.push('--description', options.description);
  console.log(`Updating: ${target.deploymentId} (currently @${target.versionNumber})`);
  run(root, config, args);
  if (config.deploymentId !== target.deploymentId) {
    try { saveConfig(root, { ...config, deploymentId: target.deploymentId }); }
    catch { throw new Error(`The deployment was updated, but saving the configuration failed. Set deploymentId to ${target.deploymentId}.`); }
  }
  return target.deploymentId;
}

/** Open the published web app without uploading code or changing deployment configuration. */
export function browse(root, options = {}, run = runClasp) {
  if (options.deploymentId !== undefined && !validId(options.deploymentId)) throw new Error('Invalid deploymentId.');
  const config = readConfig(root, true);
  prepareClasp(root, config);
  showTarget(config);
  const published = listDeployments(root, config, run).filter((entry) => entry.versionNumber != null);
  if (!published.length) throw new Error('No versioned deployment exists. Create the first web app manually in the GAS console: Deploy > New deployment > Web app.');
  const id = options.deploymentId ?? config.deploymentId;
  if (!id && published.length !== 1) throw new Error('Multiple versioned deployments exist. Check portal deployments, then select the web app with portal browse --deployment-id ID.');
  const target = id ? published.find((entry) => entry.deploymentId === id) : published[0];
  if (!target) throw new Error('The specified deploymentId is not a versioned deployment in this GAS project. Opening cancelled.');
  // clasp verifies the WEB_APP entry point and opens its URL using the default browser.
  run(root, config, ['open-web-app', target.deploymentId]);
  return target.deploymentId;
}
