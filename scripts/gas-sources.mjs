/**
 * Shared files, in load order. Each defines one global used by both the server and the browser.
 * The server build prepends them to Code.js; src/browser/main.js imports the same files.
 */
export const sharedSources = [
  'src/shared/i18n.js',
  'src/shared/url-schemes.js',
  'src/shared/themes.js',
  'src/shared/catalog-rules.js',
  'src/shared/cache-durations.js',
];

// Source boundaries do not change the public seven-file GAS project layout.
export const serverGroups = {
  'Code.js': ['Settings', 'SpreadsheetSetup', 'GitHub', 'Slack', 'Code'],
  'Catalog.js': ['Catalog'],
  'SheetCatalog.js': ['SheetCatalog'],
};
export const serverSources = Object.values(serverGroups).flat().map((name) => `src/server/${name}.js`);
