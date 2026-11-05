import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { withPreviewContent } from '../scripts/preview-project.mjs';

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
  vm.runInContext(readFileSync('src/shared/i18n.js', 'utf8'), context);
  vm.runInContext(readFileSync('src/shared/url-schemes.js', 'utf8'), context);
  vm.runInContext(readFileSync('src/shared/themes.js', 'utf8'), context);
  vm.runInContext(readFileSync('src/shared/catalog-rules.js', 'utf8'), context);
  for (const name of ['Catalog', 'SheetCatalog', 'Code', 'GitHub']) {
    vm.runInContext(readFileSync(`src/server/${name}.js`, 'utf8'), context);
  }
  return { context, logs, calls };
}

export const plain = (value) => JSON.parse(JSON.stringify(value));

export function browser(setupWindow = () => {}, client = ['language', 'client', 'theme', 'settings', 'cache-settings', 'url-scheme-settings', 'favicon-finder', 'spreadsheet-settings', 'action-items', 'github'].map((file) => readFileSync(`src/browser/${file}.js`, 'utf8')).join('\n'), source = readFileSync('src/Index.html', 'utf8')) {
  const html = withPreviewContent(source, server().context.getPortalContent_({ PORTAL_LANGUAGE: 'ja' }))
    .replace(/<\?[\s\S]*?\?>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
  const requests = [];
  const languageRequests = [];
  const themeRequests = [];
  const cacheSettingsRequests = [];
  const settingsRequests = [];
  const sourceSettingsRequests = [];
  const creationRequests = [];
  const githubRequests = [];
  const urlSchemeRequests = [];
  const runner = {
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
    resetPortalSettings() { settingsRequests.push({ reset: true, success: this.success, failure: this.failure }); },
    saveLanguage(language) { languageRequests.push({ language, success: this.success, failure: this.failure }); },
    saveTheme(theme) { themeRequests.push({ theme, success: this.success, failure: this.failure }); },
  };
  dom.window.google = { script: { run: runner } };
  setupWindow(dom.window);
  dom.window.eval(readFileSync('src/shared/i18n.js', 'utf8'));
  dom.window.eval(readFileSync('src/shared/url-schemes.js', 'utf8'));
  dom.window.eval(readFileSync('src/shared/themes.js', 'utf8'));
  dom.window.eval(readFileSync('src/shared/catalog-rules.js', 'utf8'));
  dom.window.eval(client);
  return { dom, document: dom.window.document, requests, themeRequests, settingsRequests, languageRequests, cacheSettingsRequests, sourceSettingsRequests, creationRequests, githubRequests, urlSchemeRequests };
}

export const catalog = {
  ok: true,
  tools: [
    { id: 'address', name: 'アドレス生成', url: 'https://example.com/address', description: 'メールの文字列を生成', category: '業務', tags: ['業務'] },
    { id: 'guide', name: 'Guide', url: 'https://example.com/guide', description: '社内の手引き', category: '資料', tags: ['資料'] },
  ],
  issues: [],
};
