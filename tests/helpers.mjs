import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import solid from 'vite-plugin-solid';
import path from 'node:path';
import { withPreviewContent } from '../scripts/preview-project.mjs';
import { renderPreview } from '../scripts/preview.mjs';
import { sharedSources, serverSources } from '../scripts/gas-sources.mjs';

// Compile explicit startup with the production JSX transform. Individual services can be
// replaced at the composition boundary without exposing production globals.
export async function bundleModule(source) {
  const entryId = path.resolve('tests/browser-entry.js');
  const result = await build({ configFile: false, logLevel: 'silent', plugins: [solid(), {
    name: 'browser-test-entry',
    resolveId(id) { if (id === entryId) return id; },
    load(id) { if (id === entryId) return source; },
  }], build: { write: false, minify: false, lib: { entry: entryId, name: 'PortalTest', formats: ['iife'] } } });
  return (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output).find((file) => file.type === 'chunk').code;
}
export async function bundleBrowser({ connectGitHub = true, connectSlack = false, connectCalendar = false, start = true } = {}) {
  const imports = sharedSources.map(file => `import ${JSON.stringify(path.resolve(file))};`).join('\n');
  const init = `initializePortal({ ${connectGitHub ? '' : 'connectGitHub: () => {},'} ${connectSlack ? '' : 'connectSlack: () => {},'} ${connectCalendar ? '' : 'connectCalendar: () => {},'} })`;
  return bundleModule(`${imports}
    import { initializePortal } from ${JSON.stringify(path.resolve('src/browser/bootstrap.js'))};
    ${start ? `window.testPortal = ${init};` : `window.startPortal = () => ${init};`}`);
}
const browserClient = await bundleBrowser();

export const entry = (overrides = {}) => ({
  id: 'address', name: 'アドレス生成', url: 'https://example.com/tool',
  description: 'メール用の文字列を生成', tags: ['業務'],
  ...overrides,
});

export function sheetRows(entries) {
  const headers = ['id', 'name', 'url', 'description', 'tags'];
  return [headers, ...entries.map((entry) => [
    entry.id, entry.name, entry.url, entry.description || '', (entry.tags || []).join(','),
  ])];
}

export function server({ values = sheetRows([entry()]), sheetProperties = [{ title: 'ツール一覧', index: 0 }],
  properties = {}, userProperties = { SPREADSHEET_ID: 'test-spreadsheet-id', SHEET_NAME: 'ツール一覧' }, ...overrides } = {}) {
  const logs = [];
  const calls = [];
  const context = vm.createContext({
    console: { error: (...args) => logs.push(args), info: (...args) => logs.push(args) },
    ScriptApp: { AuthMode: { FULL: 'FULL' }, requireAllScopes() {} },
    PropertiesService: {
      getScriptProperties: () => ({ getProperties: () => ({ ...properties }), setProperties: (values) => Object.assign(properties, values) }),
      getUserProperties: () => ({ getProperties: () => ({ ...userProperties }), setProperties: (values) => Object.assign(userProperties, values), getProperty: (key) => userProperties[key] ?? null, setProperty: (key, value) => { userProperties[key] = value; }, deleteProperty: (key) => { delete userProperties[key]; } }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }), getUserLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Sheets: { Spreadsheets: {
      get: (...args) => { calls.push(['get', ...args]); return { sheets: sheetProperties.map((properties) => ({ properties })) }; },
      Values: { get: (...args) => {
        calls.push(['values', ...args]);
        if (!sheetProperties.some((sheet) => sheet.title === args[1].slice(1, -1).replaceAll("''", "'"))) throw new Error('Unable to parse range');
        return { values };
      } },
    } },
    Utilities: {
      getUuid: randomUUID,
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => [...createHash(algorithm).update(value).digest()],
      newBlob: (text) => ({ getBytes: () => [...Buffer.from(text)] }),
    },
    ...overrides,
  });
  for (const file of sharedSources) vm.runInContext(readFileSync(file, 'utf8'), context);
  for (const file of serverSources) vm.runInContext(readFileSync(file, 'utf8'), context);
  return { context, logs, calls };
}

export const plain = (value) => JSON.parse(JSON.stringify(value));

export function browser(setupWindow = () => {}, client = browserClient, source = readFileSync('src/Index.html', 'utf8')) {
  const html = withPreviewContent(source, server().context.getPortalContent_({ PORTAL_LANGUAGE: 'ja' }))
    .replace(/<\?[\s\S]*?\?>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com', pretendToBeVisual: true });
  const requests = [];
  const languageRequests = [];
  const themeRequests = [];
  const cacheSettingsRequests = [];
  const settingsRequests = [];
  const sourceSettingsRequests = [];
  const creationRequests = [];
  const githubRequests = [];
  const slackRequests = [];
  const calendarRequests = [];
  const urlSchemeRequests = [];
  const runner = {
    getCalendarSettings() { calendarRequests.push({kind: 'settings', success: this.success, failure: this.failure}); },
    saveCalendarSettings(input, names) { calendarRequests.push({kind: 'save', input, names, success: this.success, failure: this.failure}); },
    getCalendarChoices() { calendarRequests.push({kind: 'choices', success: this.success, failure: this.failure}); },
    getCalendarEvents(force, timeZone) { calendarRequests.push({kind: 'events', force, timeZone, success: this.success, failure: this.failure}); },
    saveSlackBookmarkLimit(limit) { slackRequests.push({ kind: 'limit', limit, success: this.success, failure: this.failure }); },
    getSlackConnections() { slackRequests.push({ kind: 'connections', success: this.success, failure: this.failure }); },
    saveSlackConnection(input) { slackRequests.push({ kind: 'save', input, success: this.success, failure: this.failure }); },
    disconnectSlack(id) { slackRequests.push({ kind: 'disconnect', id, success: this.success, failure: this.failure }); },
    getSlackActionItems(id, force) { slackRequests.push({ kind: 'actions', id, force, success: this.success, failure: this.failure }); },
    getGitHubConnections() { githubRequests.push({ kind: 'connections', success: this.success, failure: this.failure }); },
    saveGitHubConnection(input) { githubRequests.push({ kind: 'save', input, success: this.success, failure: this.failure }); },
    disconnectGitHub(id) { githubRequests.push({ kind: 'disconnect', id, success: this.success, failure: this.failure }); },
    getGitHubActionItems(id, force) { githubRequests.push({ kind: 'actions', id, force, success: this.success, failure: this.failure }); },
    withSuccessHandler(handler) { this.success = handler; return this; },
    withFailureHandler(handler) { this.failure = handler; return this; },
    getCatalog(forceRefresh) { requests.push({ forceRefresh, success: this.success, failure: this.failure }); },
    saveActionsCacheTtl(seconds) { cacheSettingsRequests.push({ kind: 'actions', seconds, success: this.success, failure: this.failure }); },
    saveUnblockedUrlSchemes(schemes) { urlSchemeRequests.push({ schemes, success: this.success, failure: this.failure }); },
    saveCatalogCacheTtl(seconds) { cacheSettingsRequests.push({ seconds, success: this.success, failure: this.failure }); },
    createPortalSpreadsheet(browserLanguage) { creationRequests.push({ browserLanguage, success: this.success, failure: this.failure }); },
    saveSpreadsheetSettings(settings) { sourceSettingsRequests.push({ settings, success: this.success, failure: this.failure }); },
    savePortalSettings(settings, browserLanguage) { settingsRequests.push({ settings, browserLanguage, success: this.success, failure: this.failure }); },
    saveLanguage(language) { languageRequests.push({ language, success: this.success, failure: this.failure }); },
    saveTheme(theme) { themeRequests.push({ theme, success: this.success, failure: this.failure }); },
  };
  dom.window.google = { script: { run: runner } };
  setupWindow(dom.window);
  for (const file of sharedSources) dom.window.eval(readFileSync(file, 'utf8'));
  dom.window.eval(client);
  return { dom, document: dom.window.document, requests, themeRequests, settingsRequests, languageRequests, cacheSettingsRequests, sourceSettingsRequests, creationRequests, githubRequests, slackRequests, calendarRequests, urlSchemeRequests };
}

export const catalog = {
  ok: true,
  tools: [
    { id: 'address', name: 'アドレス生成', url: 'https://example.com/address', description: 'メールの文字列を生成', tags: ['業務'] },
    { id: 'guide', name: 'Guide', url: 'https://example.com/guide', description: '社内の手引き', tags: ['資料'] },
  ],
  issues: [],
};

/** A rendered local preview page, closed when the test ends. */
export function previewPage(t) {
  const dom = new JSDOM(renderPreview(readFileSync('src/Index.html', 'utf8'), process.cwd()));
  t.after(() => dom.window.close());
  return dom;
}

/** Run the preview's mock script on a page, with an in-memory localStorage by default.
 * `call` runs one mock RPC with immediate timers and returns its reply.
 */
export function runPreviewMock(dom, { storage = {}, search = '', setTimeout = (fn) => { fn(); }, localStorage = {
  getItem: (key) => storage[key], setItem: (key, value) => { storage[key] = value; }, removeItem: (key) => { delete storage[key]; },
} } = {}) {
  const document = dom.window.document;
  const context = vm.createContext({ document, URLSearchParams, location: { search }, setTimeout, localStorage });
  vm.runInContext(document.querySelector('script:not([src]):not([type="application/json"])').textContent, context);
  const run = vm.runInContext('google.script.run', context);
  const call = (method, ...args) => {
    let result;
    run.withSuccessHandler((value) => { result = value; })[method](...args);
    return result;
  };
  return { document, context, run, call };
}
