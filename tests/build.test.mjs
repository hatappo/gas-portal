import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browser, catalog, server } from './helpers.mjs';
import ts from 'typescript';

test("Build stays offline, removes stale data, and preserves output after syntax errors", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'gas-portal-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync('src', path.join(root, 'src'), { recursive: true });
  mkdirSync(path.join(root, 'scripts'));
  for (const file of ['build.mjs', 'repository-url.mjs', 'portal-html.mjs']) cpSync(`scripts/${file}`, path.join(root, 'scripts', file));
  symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  mkdirSync(path.join(root, 'dist'));
  writeFileSync(path.join(root, 'dist/CatalogData.js'), 'old-private-data');
  const build = () => spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
  const first = build();
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(readdirSync(path.join(root, 'dist')).sort(), [
    'Catalog.js', 'Client.html', 'Code.js', 'Index.html', 'SheetCatalog.js', 'Styles.html', 'appsscript.json',
  ]);
  const html = readFileSync(path.join(root, 'dist/Index.html'), 'utf8');
  assert.match(html, /class="external-link-icon"/);
  assert.match(html, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
  assert.match(html, /Copyright \(c\) 2013-present Cole Bemis/);
  for (const icon of ['external-link', 'refresh-cw', 'layout-grid', 'list', 'tool-case', 'list-checks', 'settings']) {
    assert.match(html, new RegExp(`class="${icon}-icon"`));
    assert.doesNotMatch(html, new RegExp(`<!-- ${icon}-icon -->`));
  }
  assert.doesNotMatch(html, /LOCAL PREVIEW|__preview\/version|class="footer-link repository-link"/);
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:example/portal.git'], { cwd: root });
  assert.equal(build().status, 0);
  assert.doesNotMatch(readFileSync(path.join(root, 'dist/Index.html'), 'utf8'), /https:\/\/github.com\/example\/portal/);
  assert.match(readFileSync(path.join(root, 'dist/Index.html'), 'utf8'), /<!-- portal-repository-link -->/);
  cpSync('.claspignore' , path.join(root, '.claspignore'));
  writeFileSync(path.join(root, '.clasp.json'), JSON.stringify({ scriptId: 'test-project', rootDir: 'dist' }));
  for (const name of ['private.js', 'notes.html', '.secret.json']) {
    writeFileSync(path.join(root, 'dist', name), '{}');
  }
  mkdirSync(path.join(root, 'dist/nested'));
  writeFileSync(path.join(root, 'dist/nested/Code.js'), '// excluded');
  const status = spawnSync(process.execPath, [fileURLToPath(import.meta.resolve('@google/clasp')), '--json', 'show-file-status'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout).filesToPush.sort(), [
    'dist/Catalog.js', 'dist/Client.html', 'dist/Code.js', 'dist/Index.html',
    'dist/SheetCatalog.js', 'dist/Styles.html', 'dist/appsscript.json',
  ]);
  const bundledClient = readFileSync(path.join(root, 'dist/Client.html'), 'utf8');
  const bundledStyles = readFileSync(path.join(root, 'dist/Styles.html'), 'utf8');
  // HtmlService reparses inline scripts. URL-bearing or multiline template literals
  // must not be introduced by minification, even when the JS is valid in a browser.
  const clientCode = bundledClient.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  const parsedClient = ts.createSourceFile('Client.js', clientCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const unsafeTemplates = [];
  function inspect(node) {
    if ((ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && /:\/\/|[\r\n]/.test(node.getText(parsedClient))) unsafeTemplates.push(node.getText(parsedClient));
    ts.forEachChild(node, inspect);
  }
  inspect(parsedClient);
  assert.deepEqual(unsafeTemplates, [], 'GAS inline scripts must avoid URL-bearing and multiline template literals');
  assert.doesNotMatch(bundledClient + bundledStyles, /@vite|LOCAL PREVIEW|__preview|demo-address/);
  assert.match(bundledStyles, /--theme-color/);
  assert.doesNotMatch(html, /type="module"|browser\/main.js/);
  const app = browser((window) => { window.document.getElementById('initial-catalog').textContent = JSON.stringify(catalog); }, bundledClient.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, ''), html);
  t.after(() => app.dom.window.close());
  const { context } = server();
  const englishNote = context.portalSpreadsheetColumns_('en').find((column) => column.name === 'relatedLinks').note;
  const japaneseNote = context.portalSpreadsheetColumns_('ja').find((column) => column.name === 'relatedLinks').note;
  assert.equal(app.dom.window.PortalI18n.t(englishNote, 'ja'), japaneseNote, 'Minification preserves note URLs, Unicode, and line breaks');
  assert.equal(app.requests.length, 0, 'The built client renders embedded data without an initial RPC');
  assert.equal(app.document.querySelectorAll('#tools > li').length, 2);
  for (const [id, label] of [['view-cards', 'Cards'], ['view-list', 'List']]) {
    const button = app.document.getElementById(id);
    assert.equal(button.title, label);
    assert.equal(button.getAttribute('aria-label'), label);
    assert.equal(button.textContent.trim(), '');
    assert.equal(button.querySelector('svg').getAttribute('aria-hidden'), 'true');
  }
  app.document.querySelector('#view-list').click();
  assert.equal(app.document.querySelectorAll('#tool-rows > tr').length, 2);
  app.document.querySelector('#search').value = 'Guide';
  app.document.querySelector('#search').dispatchEvent(new app.dom.window.Event('input'));
  assert.equal(app.document.querySelectorAll('#tool-rows > tr').length, 1);
  app.document.querySelector('input[value="tetsukon"]').click();
  app.themeRequests[0].success({ ok: true, theme: 'tetsukon' });
  assert.equal(app.document.documentElement.dataset.theme, 'tetsukon');
  app.document.querySelector('#reset-portal-settings').click();
  assert.equal(app.settingsRequests.length, 0);
  app.document.querySelector('#portal-settings-form').dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  app.settingsRequests[0].success({ ok: true, settings: { PORTAL_NAME: 'Built Portal', PORTAL_ICON: 'B', PORTAL_HEADLINE: 'Built headline', PORTAL_DESCRIPTION: 'Built description' } });
  assert.equal(app.document.title, 'Built Portal');
  assert.equal(app.document.querySelector('#page-title').textContent, 'Built headline');
  // Node accepts these operators, but GAS rejects them. Fail before replacing output.
  for (const relative of ['src/server/GitHub.js', 'src/shared/i18n.js']) {
    const sourcePath = path.join(root, relative);
    const original = readFileSync(sourcePath, 'utf8');
    for (const operator of ['||=', '&&=', '??=']) {
      writeFileSync(sourcePath, original + `\nlet syntaxProbe = false; syntaxProbe ${operator} true;\n`);
      const rejected = build();
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /GAS syntax check \(ES2020\)/);
      assert.equal(readFileSync(path.join(root, 'dist/Client.html'), 'utf8'), bundledClient);
    }
    writeFileSync(sourcePath, original);
  }
  const clientSource = path.join(root, 'src/browser/client.js');
  const validClient = readFileSync(clientSource, 'utf8');
  writeFileSync(clientSource, 'function broken(');
  assert.notEqual(build().status, 0);
  assert.equal(readFileSync(path.join(root, 'dist/Client.html'), 'utf8'), bundledClient);
  writeFileSync(clientSource, validClient);
  const output = path.join(root, 'dist/SheetCatalog.js');
  const before = readFileSync(output, 'utf8');
  writeFileSync(path.join(root, 'src/server/SheetCatalog.js'), 'function broken(');
  assert.notEqual(build().status, 0);
  assert.equal(readFileSync(output, 'utf8'), before);
});
