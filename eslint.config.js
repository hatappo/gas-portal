import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'assets/**', 'node_modules/**'] },
  js.configs.recommended,
  { languageOptions: { globals: { ...globals.node, PortalI18n: 'readonly' } } },
  {
    files: ['src/server/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        HtmlService: 'readonly',
        ScriptApp: 'readonly',
        LockService: 'readonly',
        Sheets: 'readonly',
        CacheService: 'readonly',
        Utilities: 'readonly',
        PropertiesService: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^(doGet|getCatalog|saveCatalogCacheTtl|normalizeCatalogCacheTtl_|readCachedSheetCatalog_|saveTheme|saveLanguage|include_|parseCatalog_|readSheetCatalog_|initializeScriptProperties|initializeProperties|savePortalSettings|saveSpreadsheetSettings|createPortalSpreadsheet|resetPortalSettings)$' }] },
  },
  { files: ['src/server/Code.js'], languageOptions: { globals: { readCachedSheetCatalog_: 'readonly' } } },
  { files: ['src/server/SheetCatalog.js'], languageOptions: { globals: { parseCatalog_: 'readonly', normalizeCatalogCacheTtl_: 'readonly', getPortalUserProperties_: 'readonly', normalizeSpreadsheetId_: 'readonly' } } },
  {
    files: ['src/browser/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, google: 'readonly' } },
  },
];
