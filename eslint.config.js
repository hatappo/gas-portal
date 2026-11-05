import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'assets/**', 'node_modules/**'] },
  js.configs.recommended,
  { languageOptions: { globals: { ...globals.node, PortalI18n: 'readonly', PortalUrlSchemes: 'readonly', PortalThemes: 'readonly', PortalCatalogRules: 'readonly' } } },
  {
    files: ['src/server/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        HtmlService: 'readonly',
        UrlFetchApp: 'readonly',
        ScriptApp: 'readonly',
        LockService: 'readonly',
        Sheets: 'readonly',
        CacheService: 'readonly',
        Utilities: 'readonly',
        PropertiesService: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^(getGitHubConnections|saveGitHubConnection|disconnectGitHub|getGitHubActionItems|doGet|getCatalog|saveCatalogCacheTtl|saveActionsCacheTtl|normalizeCatalogCacheTtl_|readCachedSheetCatalog_|saveTheme|saveLanguage|include_|parseCatalog_|readSheetCatalog_|initializeScriptProperties|initializeProperties|savePortalSettings|saveSpreadsheetSettings|createPortalSpreadsheet|saveUnblockedUrlSchemes)$' }] },
  },
  // GAS rejects newer syntax such as logical assignment even when Node accepts it.
  { files: ['src/server/*.js', 'src/shared/*.js'], languageOptions: { ecmaVersion: 2020, sourceType: 'script' } },
  { files: ['src/server/Code.js'], languageOptions: { globals: { readCachedSheetCatalog_: 'readonly' } } },
  { files: ['src/server/GitHub.js'], languageOptions: { globals: { normalizeActionsCacheTtl_: 'readonly' } } },
  { files: ['src/server/SheetCatalog.js'], languageOptions: { globals: { parseCatalog_: 'readonly', normalizeCatalogCacheTtl_: 'readonly', getPortalUserProperties_: 'readonly', normalizeSpreadsheetId_: 'readonly' } } },
  {
    files: ['src/browser/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, google: 'readonly' } },
  },
];
