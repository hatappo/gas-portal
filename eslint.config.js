import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'assets/**', 'node_modules/**'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ['src/server/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        HtmlService: 'readonly',
        ScriptApp: 'readonly',
        LockService: 'readonly',
        Sheets: 'readonly',
        PropertiesService: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^(doGet|getCatalog|saveTheme|include_|parseCatalog_|readSheetCatalog_|initializeScriptProperties|initializeProperties|savePortalSettings|resetPortalSettings)$' }] },
  },
  { files: ['src/server/Code.js'], languageOptions: { globals: { readSheetCatalog_: 'readonly' } } },
  { files: ['src/server/SheetCatalog.js'], languageOptions: { globals: { parseCatalog_: 'readonly' } } },
  {
    files: ['src/browser/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, google: 'readonly' } },
  },
];
