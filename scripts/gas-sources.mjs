/**
 * Shared files, in load order. Each defines one global used by both the server and the browser.
 * The server build places them at the start of Code.js; src/browser/main.js imports the same files.
 */
export const sharedSources = [
  'src/shared/i18n.js',
  'src/shared/url-schemes.js',
  'src/shared/themes.js',
  'src/shared/catalog-rules.js',
  'src/shared/cache-durations.js',
  'src/shared/slack-settings.js',
  'src/shared/calendar.js',
  'src/shared/gmail-settings.js',
];

// Keep editor entry points in their own file for easy discovery in the GAS editor.
export const serverGroups = {
  'Authorization.js': ['Authorization'],
  'Code.js': ['Settings', 'SpreadsheetSetup', 'GitHub', 'Slack', 'Calendar', 'Gmail', 'Code'],
  'Catalog.js': ['Catalog'],
  'SheetCatalog.js': ['SheetCatalog'],
};
export const serverSources = Object.values(serverGroups).flat().map((name) => `src/server/${name}.js`);
