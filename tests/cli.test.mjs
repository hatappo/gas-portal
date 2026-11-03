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
import { deploy, login, push, runClasp } from '../lib/remote.mjs';

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

test('init は依存バージョンを固定し、既存スクリプト・設定・ignore を保持して再実行できる', (t) => {
  const root = fixture(t);
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json')));
  assert.equal(pkg.devDependencies['gas-portal'], packageInfo.version);
  assert.equal(pkg.scripts.deploy, 'portal deploy');
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
});

test('設定未入力でも init・build・preview ができ、リモート操作は認証と対象の設定を必須にする', (t) => {
  const root = fixture(t);
  saveConfig(root, {});
  build(root);
  buildPreview(root);
  const { run, calls } = stub();
  for (const command of [push, login]) assert.throws(() => command(root, run), /scriptId と authProfile/);
  assert.throws(() => deploy(root, {}, run), /scriptId と authProfile/);
  assert.equal(calls.length, 0);
});

test('設定の未知キー・パス・HTML・不正な認証名を拒否する', () => {
  for (const value of [null, [], { scriptId: 'https://example.com' }, { scriptId: '../other' }, { authProfile: '--user' },
    { authProfile: 'work a' }, { account: 'wrong-key' }, { repositoryUrl: 'https://token@github.com/a/b' }, { deploymentId: 'web' }]) {
    assert.throws(() => validateConfig(value));
  }
});

test('init が既存の不正な package.json やシンボリックリンクを上書きしない', (t) => {
  const root = fixture(t);
  const config = readFileSync(path.join(root, 'portal.config.json'), 'utf8');
  writeFileSync(path.join(root, 'package.json'), '{bad json');
  assert.throws(() => init(root));
  assert.equal(readFileSync(path.join(root, 'portal.config.json'), 'utf8'), config);
  const other = fixture(t, 'outside');
  rmSync(path.join(root, 'portal.config.json'));
  symlinkSync(path.join(other, 'portal.config.json'), path.join(root, 'portal.config.json'));
  assert.throws(() => init(root), /通常のファイル/);
});

test('build は 7 ファイルだけを生成し、現場の GitHub リンクを反映する', (t) => {
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

test('生成物ではない .portal と生成先の symlink を保護する', (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, '.portal'));
  writeFileSync(path.join(root, '.portal/keep.txt'), 'keep');
  assert.throws(() => build(root), /生成物ではありません/);
  assert.equal(readFileSync(path.join(root, '.portal/keep.txt'), 'utf8'), 'keep');
  const second = fixture(t, 'second');
  build(second);
  rmSync(path.join(second, '.portal/dist'), { recursive: true });
  symlinkSync(path.join(root, '.portal'), path.join(second, '.portal/dist'));
  assert.throws(() => build(second), /通常のディレクトリ/);
  assert.equal(readFileSync(path.join(root, '.portal/keep.txt'), 'utf8'), 'keep');
});

test('clasp の実際の判定で許可した生成物だけが push 対象になる', (t) => {
  const root = fixture(t);
  build(root);
  for (const file of ['secret.js', 'notes.html', '.secret.json']) writeFileSync(path.join(root, '.portal/dist', file), 'private');
  mkdirSync(path.join(root, '.portal/dist/nested'));
  writeFileSync(path.join(root, '.portal/dist/nested/Code.js'), 'private');
  const result = JSON.parse(runClasp(root, readConfig(root), ['--json', 'show-file-status'], true));
  assert.deepEqual(result.filesToPush.sort(), GAS_FILES.map((name) => '.portal/dist/' + name).sort());
});

test('現場ごとの生成物・認証プロフィール・プレビュー保存領域を分離する', (t) => {
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
});

test('deploy は build・push せず、唯一の公開先を更新して ID を保存する', (t) => {
  const root = fixture(t);
  const { run, calls } = stub();
  assert.equal(deploy(root, {}, run), 'web');
  assert.deepEqual(calls.map((c) => c.args), [['--json', 'list-deployments'], ['update-deployment', 'web']]);
  assert.equal(existsSync(path.join(root, '.portal/dist')), false);
  assert.equal(readConfig(root).deploymentId, 'web');
});

test('設定済みの公開先を選び、明示した ID で切り替えできる。description は単一引数', (t) => {
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

test('公開先ゼロ・曖昧・他プロジェクトの ID・HEAD・不正な一覧では更新しない', (t) => {
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

test('更新失敗では deploymentId を保存しない', (t) => {
  const root = fixture(t);
  const { run } = stub(undefined, 'update-deployment');
  assert.throws(() => deploy(root, {}, run), /remote failed/);
  assert.equal(readConfig(root).deploymentId, undefined);
});

test('login は設定したプロフィールを使い、コードを生成しない', (t) => {
  const root = fixture(t);
  const { run, calls } = stub();
  login(root, run);
  assert.equal(calls[0].config.authProfile, 'work-a');
  assert.deepEqual(calls[0].args, ['login']);
  assert.equal(existsSync(path.join(root, '.portal/dist')), false);
});

test('CLI は未知のコマンド・オプション・不足引数を拒否し、終了コードを返す', (t) => {
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

test('配布用プレビューはソース不要で一覧・検索・テーマの選択肢を表示する', async (t) => {
  const root = fixture(t);
  const html = readFileSync(path.join(buildPreview(root), 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<\?|browser\/main.js|node_modules/);
  const dom = new JSDOM(html, { url: 'http://localhost:4173/', runScripts: 'dangerously' });
  t.after(() => dom.window.close());
  await new Promise((resolve) => setTimeout(resolve, 400));
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll('#tools > li').length, 4);
  doc.querySelector('#search').value = '経費';
  doc.querySelector('#search').dispatchEvent(new dom.window.Event('input'));
  assert.equal(doc.querySelectorAll('#tools > li').length, 1);
  // 非同期保存はブラウザ・既存のテーマと設定 UI のテストでも検証する。
  assert.equal(doc.querySelectorAll('input[name="portal-theme"]').length, 8);
});
