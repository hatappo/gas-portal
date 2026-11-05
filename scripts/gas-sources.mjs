/**
 * Shared files, in load order. Each defines one global used by both the server and the browser.
 * The server build prepends them to Code.js; src/browser/main.js imports the same files.
 */
export const sharedSources = [
  'src/shared/i18n.js',
  'src/shared/url-schemes.js',
  'src/shared/themes.js',
  'src/shared/catalog-rules.js',
];
