import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { init } from '../lib/init.mjs';
import { build, buildPreview } from '../lib/build.mjs';
import { GAS_FILES, packageInfo, readConfig, saveConfig, validateConfig } from '../lib/config.mjs';
import { browse, deploy, login, push, runClasp } from '../lib/remote.mjs';

function fixture(t, name = 'work-a') {
  const root = mkdtempSync(path.join(tmpdir(), 'gas-portal-' + name + '-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  init(root, { scriptId: name + '-script', authProfile: name });
  return root;
}
function stub(list = [{ deploymentId: 'head' }, { deploymentId: 'web', versionNumber: 1 }], failure) {
  const calls = [];
  return { calls, run(root, config, args, capture) {
    calls.push({ root, config: { ...config }, args, capture });
    if (failure === args.at(0)) throw new Error('remote failed');
    if (args.includes('list-deployments')) return JSON.stringify(list);
  } };
}

test("Pin the dependency on init and preserve scripts, configuration, and ignore rules across reruns", (t) => {
  const root = fixture(t);
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json')));
  assert.equal(pkg.devDependencies['gas-portal'], `https://github.com/hatappo/gas-portal/releases/download/v${packageInfo.version}/gas-portal-${packageInfo.version}.tgz`);
  assert.equal(pkg.scripts.deploy, 'portal deploy');
  assert.equal(pkg.scripts.ship, 'npm run push && npm run deploy');
  assert.equal(pkg.scripts.browse, 'portal browse');
  pkg.scripts.browse = 'custom-browse';
  pkg.scripts.ship = 'custom-publish';
  pkg.scripts.build = 'custom-build';
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  writeFileSync(path.join(root, '.gitignore'), '*.private\n!.portal/\n');
  init(root, { scriptId: 'other', authProfile: 'other' });
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\*\.private\n!\.portal\//);
  assert.ok(ignore.lastIndexOf('.portal/') > ignore.indexOf('!.portal/'));
  init(root);
  assert.equal(readFileSync(path.join(root, '.gitignore'), 'utf8'), ignore);
  assert.equal(readConfig(root).scriptId, 'work-a-script');
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'))).scripts.build, 'custom-build');
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'))).scripts.ship, 'custom-publish');
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'))).scripts.browse, 'custom-browse');
});

test("Store configuration under the gas-portal key and keep other package.json fields and indentation", (t) => {
  const root = fixture(t);
  const file = path.join(root, 'package.json');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8'))['gas-portal'], { scriptId: 'work-a-script', authProfile: 'work-a' });
  for (const indent of ['    ', '\t']) {
    const pkg = { name: 'consumer', custom: { keep: true }, 'gas-portal': { scriptId: 'one' }, scripts: { test: 'node --test' } };
    writeFileSync(file, JSON.stringify(pkg, null, indent) + '\n');
    saveConfig(root, { scriptId: 'two', authProfile: 'work-a' });
    assert.equal(readFileSync(file, 'utf8'), JSON.stringify({ ...pkg, 'gas-portal': { scriptId: 'two', authProfile: 'work-a' } }, null, indent) + '\n');
    init(root, { scriptId: 'ignored' });
    const text = readFileSync(file, 'utf8');
    assert.ok(text.startsWith('{\n' + indent + '"name"'), 'init keeps the indentation');
    assert.equal(JSON.parse(text)['gas-portal'].scriptId, 'two', 'init keeps the existing configuration');
  }
  writeFileSync(file, JSON.stringify({ name: 'consumer' }));
  assert.throws(() => readConfig(root), /"gas-portal" is missing in package\.json/);
  for (const value of [null, [], 'text']) {
    writeFileSync(file, JSON.stringify({ 'gas-portal': value }));
    assert.throws(() => readConfig(root), /must be a JSON object/);
  }
  rmSync(file);
  assert.throws(() => readConfig(root), /package\.json is missing/);
});

test("Preserve existing Release URLs and directory dependencies in either dependency section", (t) => {
  const root = fixture(t);
  for (const key of ['dependencies', 'devDependencies']) {
    for (const dependency of ['file:../../hobby/gas-portal', 'https://github.com/hatappo/gas-portal/releases/download/v0.0.9/gas-portal-0.0.9.tgz']) {
      writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, [key]: { 'gas-portal': dependency } }));
      init(root);
      const pkg = JSON.parse(readFileSync(path.join(root, 'package.json')));
      assert.equal(pkg[key]['gas-portal'], dependency);
      assert.equal(pkg[key === 'dependencies' ? 'devDependencies' : 'dependencies'], undefined);
    }
  }
});

test("Allow unconfigured local operations but require authentication and a target for remote operations", (t) => {
  const root = fixture(t);
  saveConfig(root, {});
  build(root);
  buildPreview(root);
  const { run, calls } = stub();
  for (const command of [push, login]) assert.throws(() => command(root, run), /scriptId and authProfile/);
  assert.throws(() => deploy(root, {}, run), /scriptId and authProfile/);
  assert.equal(calls.length, 0);
});

test("Reject unknown keys, paths, HTML, and invalid profile names", () => {
  for (const value of [null, [], { scriptId: 'https://example.com' }, { scriptId: '../other' }, { authProfile: '--user' },
    { authProfile: 'work a' }, { account: 'wrong-key' }, { repositoryUrl: 'https://token@github.com/a/b' }, { deploymentId: 'web' }]) {
    assert.throws(() => validateConfig(value));
  }
});

test("Protect malformed package.json files and symbolic links during init", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'package.json'), '{bad json');
  assert.throws(() => init(root));
  assert.equal(readFileSync(path.join(root, 'package.json'), 'utf8'), '{bad json');
  const other = fixture(t, 'outside');
  const outside = readFileSync(path.join(other, 'package.json'), 'utf8');
  rmSync(path.join(root, 'package.json'));
  symlinkSync(path.join(other, 'package.json'), path.join(root, 'package.json'));
  assert.throws(() => init(root), /non-regular file/);
  assert.throws(() => saveConfig(root, { scriptId: 'changed' }), /non-regular file/);
  assert.equal(readFileSync(path.join(other, 'package.json'), 'utf8'), outside);
});

test("Generate only seven files and inject the consumer GitHub link", (t) => {
  const root = fixture(t);
  saveConfig(root, { ...readConfig(root), repositoryUrl: 'https://github.com/example/work-a' });
  const result = build(root);
  assert.deepEqual(readdirSync(result.output).sort(), [...GAS_FILES].sort());
  const html = readFileSync(path.join(result.output, 'Index.html'), 'utf8');
  assert.match(html, /https:\/\/github.com\/example\/work-a/);
  assert.doesNotMatch(html, /LOCAL PREVIEW|demo-address|@vite/);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, '.portal/.clasp.json'))), { scriptId: 'work-a-script', rootDir: 'dist' });
  const manifest = JSON.parse(readFileSync(path.join(result.output, 'appsscript.json')));
  assert.deepEqual(manifest.webapp, { access: 'MYSELF', executeAs: 'USER_DEPLOYING' });
  assert.equal(manifest.executionApi, undefined);
});

test("Protect unrelated .portal directories and output symbolic links", (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, '.portal'));
  writeFileSync(path.join(root, '.portal/keep.txt'), 'keep');
  assert.throws(() => build(root), /not generated/);
  assert.equal(readFileSync(path.join(root, '.portal/keep.txt'), 'utf8'), 'keep');
  const second = fixture(t, 'second');
  build(second);
  rmSync(path.join(second, '.portal/dist'), { recursive: true });
  symlinkSync(path.join(root, '.portal'), path.join(second, '.portal/dist'));
  assert.throws(() => build(second), /regular directory/);
  assert.equal(readFileSync(path.join(root, '.portal/keep.txt'), 'utf8'), 'keep');
});

test("Use actual clasp filtering to upload only the allowed generated files", (t) => {
  const root = fixture(t);
  build(root);
  for (const file of ['secret.js', 'notes.html', '.secret.json']) writeFileSync(path.join(root, '.portal/dist', file), 'private');
  mkdirSync(path.join(root, '.portal/dist/nested'));
  writeFileSync(path.join(root, '.portal/dist/nested/Code.js'), 'private');
  const result = JSON.parse(runClasp(root, readConfig(root), ['--json', 'show-file-status'], true));
  assert.deepEqual(result.filesToPush.sort(), GAS_FILES.map((name) => '.portal/dist/' + name).sort());
});

test("Isolate generated files, profiles, and preview storage by environment", (t) => {
  const a = fixture(t, 'a');
  const b = fixture(t, 'b');
  const { run, calls } = stub();
  push(a, run);
  push(b, run);
  assert.deepEqual(calls.map(({ config, args }) => [config.scriptId, config.authProfile, args]), [
    ['a-script', 'a', ['push']], ['b-script', 'b', ['push']],
  ]);
  const previews = [a, b].map((root) => readFileSync(path.join(buildPreview(root), 'index.html'), 'utf8'));
  assert.match(previews[0], /home\/projects\/a-script\/edit/);
  assert.doesNotMatch(previews[0], /home\/projects\/b-script\/edit/);
  const key = (html) => /portal-preview-settings-[\w-]+/.exec(html)[0];
  assert.notEqual(key(previews[0]), key(previews[1]));
  const languageKey = (html) => /portal-preview-language-[\w-]+/.exec(html)[0];
  assert.notEqual(languageKey(previews[0]), languageKey(previews[1]));
});

test("Update the only versioned deployment and save its ID without building or pushing", (t) => {
  const root = fixture(t);
  const { run, calls } = stub();
  assert.equal(deploy(root, {}, run), 'web');
  assert.deepEqual(calls.map((c) => c.args), [['--json', 'list-deployments'], ['update-deployment', 'web']]);
  assert.equal(existsSync(path.join(root, '.portal/dist')), false);
  assert.equal(readConfig(root).deploymentId, 'web');
});

test("Select configured or explicit deployment IDs and pass descriptions as one argument", (t) => {
  const root = fixture(t);
  saveConfig(root, { ...readConfig(root), deploymentId: 'web' });
  const { run, calls } = stub([{ deploymentId: 'web', versionNumber: 1 }, { deploymentId: 'second', versionNumber: 2 }]);
  deploy(root, {}, run);
  assert.deepEqual(calls.at(-1).args, ['update-deployment', 'web']);
  const description = 'Update\n$(command) `text` "quote"';
  deploy(root, { deploymentId: 'second', description }, run);
  assert.deepEqual(calls.at(-1).args, ['update-deployment', 'second', '--description', description]);
  assert.equal(readConfig(root).deploymentId, 'second');
});

test("Reject missing, ambiguous, foreign, HEAD, or malformed deployments", (t) => {
  const root = fixture(t);
  for (const [list, options] of [[[], {}], [[{ deploymentId: 'head' }], {}],
    [[{ deploymentId: 'a', versionNumber: 1 }, { deploymentId: 'b', versionNumber: 2 }], {}],
    [[{ deploymentId: 'a', versionNumber: 1 }], { deploymentId: 'other-project' }],
    [[{ deploymentId: 'head' }, { deploymentId: 'a', versionNumber: 1 }], { deploymentId: 'head' }],
    [[{ deploymentId: 'a', versionNumber: '1' }], {}], [null, {}]]) {
    const { run, calls } = stub(list);
    assert.throws(() => deploy(root, options, run));
    assert.equal(calls.length, 1);
    assert.equal(readConfig(root).deploymentId, undefined);
  }
});

test("Do not save deploymentId after a failed update", (t) => {
  const root = fixture(t);
  const { run } = stub(undefined, 'update-deployment');
  assert.throws(() => deploy(root, {}, run), /remote failed/);
  assert.equal(readConfig(root).deploymentId, undefined);
});

test("Log in with the selected profile without generating code", (t) => {
  const root = fixture(t);
  const { run, calls } = stub();
  login(root, run);
  assert.equal(calls[0].config.authProfile, 'work-a');
  assert.deepEqual(calls[0].args, ['login']);
  assert.equal(existsSync(path.join(root, '.portal/dist')), false);
});

test("Reject unknown commands, options, and missing arguments with a failure exit code", (t) => {
  const root = fixture(t);
  const cli = path.resolve('bin/portal.mjs');
  for (const args of [['properties:init'], ['deploy', '--force'], ['deploy', '--description'], ['push', 'other'], ['preview', '--port', '0']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
  }
  const help = spawnSync(process.execPath, [cli, '--help'], { cwd: root, encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /initializeProperties/);
});

test("Display search and theme choices in a source-free packaged preview", async (t) => {
  const root = fixture(t);
  const html = readFileSync(path.join(buildPreview(root), 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<\?|browser\/main.js|node_modules/);
  const dom = new JSDOM(html, { url: 'http://localhost:4173/', runScripts: 'dangerously' });
  t.after(() => dom.window.close());
  await new Promise((resolve) => setTimeout(resolve, 400));
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll('#tools > li').length, 6);
  doc.querySelector('#search').value = 'Expense';
  doc.querySelector('#search').dispatchEvent(new dom.window.Event('input'));
  assert.equal(doc.querySelectorAll('#tools > li').length, 1);
  // Async persistence is also covered by browser, theme, and settings tests.
  assert.equal(doc.querySelectorAll('input[name="portal-theme"]').length, 22, 'auto plus 21 themes');
});

test('Add ship to existing consumers and stop before deployment if push fails', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(file));
  delete pkg.scripts.ship;
  // Exercise npm sequencing with local stub scripts; never call clasp or Google.
  pkg.scripts.push = 'node push.cjs';
  pkg.scripts.deploy = 'node deploy.cjs';
  writeFileSync(file, JSON.stringify(pkg));
  writeFileSync(path.join(root, 'push.cjs'), "require('node:fs').appendFileSync('calls.txt', 'push\\n'); process.exit(Number(process.env.TEST_PUSH_EXIT || 0));");
  writeFileSync(path.join(root, 'deploy.cjs'), "require('node:fs').appendFileSync('calls.txt', 'deploy\\n');");
  init(root);
  assert.equal(JSON.parse(readFileSync(file)).scripts.push, pkg.scripts.push);
  const log = path.join(root, 'calls.txt');
  for (const [exitCode, expected] of [[0, 'push\ndeploy\n'], [1, 'push\n']]) {
    writeFileSync(log, '');
    const result = spawnSync('npm', ['run', 'ship'], { cwd: root, encoding: 'utf8', env: { ...process.env, TEST_PUSH_EXIT: String(exitCode) } });
    assert.equal(result.status, exitCode, result.stdout + result.stderr);
    assert.equal(readFileSync(log, 'utf8'), expected);
  }
});


test('Browse selects the configured or sole versioned deployment without pushing, deploying, or saving config', (t) => {
  const root = fixture(t);
  const initialConfig = readFileSync(path.join(root, 'package.json'), 'utf8');
  const single = stub();
  assert.equal(browse(root, {}, single.run), 'web');
  assert.deepEqual(single.calls.map((call) => call.args), [['--json', 'list-deployments'], ['open-web-app', 'web']]);
  assert.equal(single.calls[1].config.authProfile, 'work-a');
  assert.equal(readFileSync(path.join(root, 'package.json'), 'utf8'), initialConfig);
  const list = [{ deploymentId: 'head' }, { deploymentId: 'one', versionNumber: 1 }, { deploymentId: 'two', versionNumber: 2 }];
  saveConfig(root, { ...readConfig(root), deploymentId: 'two' });
  const configured = stub(list);
  assert.equal(browse(root, {}, configured.run), 'two');
  const override = stub(list);
  assert.equal(browse(root, { deploymentId: 'one' }, override.run), 'one');
  assert.equal(readConfig(root).deploymentId, 'two');
});

test('Browse rejects missing, ambiguous, HEAD, and foreign deployments and propagates clasp failures', (t) => {
  const root = fixture(t);
  for (const [list, options, error] of [
    [[{ deploymentId: 'head' }], {}, /Create the first web app/],
    [[{ deploymentId: 'one', versionNumber: 1 }, { deploymentId: 'two', versionNumber: 2 }], {}, /Multiple/],
    [[{ deploymentId: 'head' }, { deploymentId: 'web', versionNumber: 1 }], { deploymentId: 'head' }, /not a versioned/],
    [[{ deploymentId: 'web', versionNumber: 1 }], { deploymentId: 'foreign' }, /not a versioned/],
  ]) {
    const remote = stub(list);
    assert.throws(() => browse(root, options, remote.run), error);
    assert.equal(remote.calls.some((call) => call.args[0] === 'open-web-app'), false);
  }
  const invalid = stub();
  assert.throws(() => browse(root, { deploymentId: 'https://evil.test' }, invalid.run), /Invalid deploymentId/);
  assert.equal(invalid.calls.length, 0);
  const failed = stub(undefined, 'open-web-app');
  assert.throws(() => browse(root, {}, failed.run), /remote failed/);
  const pkgFile = path.join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgFile));
  delete pkg.scripts.browse;
  writeFileSync(pkgFile, JSON.stringify(pkg));
  init(root);
  assert.equal(JSON.parse(readFileSync(pkgFile)).scripts.browse, 'portal browse');
});
