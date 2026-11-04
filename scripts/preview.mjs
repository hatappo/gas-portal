import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { withPreviewProject, withPreviewContent } from './preview-project.mjs';
import { withPortalAssets } from './portal-html.mjs';

// This file and its mock data are not uploaded to GAS.
const demo = {
  ok: true,
  tools: [
    { id: 'demo-address', name: 'Address generator', description: 'Generate an email address from a name.', scope: 'internal', tags: ['Accounts', 'Productivity'], url: 'https://example.com/#demo-address', relatedLinks: [
      { label: 'User guide', url: 'https://example.com/manual' },
      { label: 'Source code', url: 'https://example.com/source' },
    ] },
    { id: 'demo-expense', name: 'Expense service', description: 'Upload receipts and submit expense claims.', scope: 'external', tags: ['Finance', 'Requests', 'Productivity'], url: 'https://example.com/#demo-expense' },
    { id: 'demo-guide', name: 'Workplace guide', description: 'Find work instructions and answers to common questions.', scope: 'internal', tags: ['Reference', 'Onboarding'], url: 'https://example.com/#demo-guide' },
    { id: 'demo-request', name: 'Request forms', description: 'Open the forms you need for everyday requests.', scope: 'internal', tags: ['Finance', 'Requests'], url: 'https://example.com/#demo-request' },
  ],
  issues: [],
};
export function renderPreview(html, root, options = {}) {
  const url = pathToFileURL(path.join(root, 'src/server/'));
  const context = vm.createContext({ console });
  const i18n = readFileSync(path.join(root, 'src/shared/i18n.js'), 'utf8');
  vm.runInContext(i18n, context);
  for (const name of ['Catalog', 'Code']) {
    vm.runInContext(readFileSync(new URL(`${name}.js`, url), 'utf8'), context);
  }
  const catalog = { ok: true, ...context.parseCatalog_(demo.tools) };
  // Prevent embedded data from closing the script element.
  const serialize = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
  // Use optional environment variables only for footer links; do not contact Sheets.
  const portal = context.getPortalContent_({}, { SPREADSHEET_ID: options.spreadsheetId ?? process.env.SPREADSHEET_ID ?? '' });
  return withPreviewContent(withPreviewProject(withPortalAssets(html, root), options.configPath ?? path.join(root, '.clasp.json')), portal)
    .replace('<!-- preview-label -->', '<p class="preview-label"><span>LOCAL PREVIEW</span> · <span data-i18n="Mock data">Mock data</span></p>')
    .replace('<script type="module" src="/browser/main.js"></script>', () => `<script>
      ${i18n}
      let previewPreference = 'auto';
      try { previewPreference = PortalI18n.preference(localStorage.getItem('portal-preview-language')); } catch { /* Storage may be unavailable. */ }
      const browserLanguages = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
      let previewLanguage = PortalI18n.resolve(previewPreference, browserLanguages);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = previewLanguage;
        document.documentElement.dataset.languagePreference = previewPreference;
      }
      const getPortalPropertyDefaults_ = ${context.getPortalPropertyDefaults_.toString()};
      const validatePortalSettings_ = ${context.validatePortalSettings_.toString()};
      try {
        const stored = localStorage.getItem('portal-preview-settings');
        if (stored) {
          const settings = validatePortalSettings_(JSON.parse(stored), previewLanguage);
          Object.entries(settings).forEach(([key, value]) => {
            document.querySelector('#portal-settings-form [name="' + key + '"]').value = value;
          });
        }
      } catch { /* Use HTML defaults when stored values are invalid or browser storage is unavailable. */ }
      const demo = ${serialize(demo)};
      const catalog = ${serialize(catalog)};
      const scenario = new URLSearchParams(location.search).get('state');
      // Use browser storage locally; production uses GAS User Properties.
      try {
        const storedTheme = localStorage.getItem('portal-preview-theme');
        const theme = storedTheme === 'shikon' ? 'kuri' : storedTheme;
        if (Array.from(document.querySelectorAll('input[name="portal-theme"]')).some(input => input.value === theme)) document.documentElement.dataset.theme = theme;
      } catch { /* Use defaults when the browser denies storage access. */ }
      const google = {script: {run: {
        withSuccessHandler(fn) {return {...this, success: fn};},
        withFailureHandler(fn) {return {...this, failure: fn};},
        savePortalSettings(input, browserLanguage) {setTimeout(() => {
          try {
            const settings = validatePortalSettings_(input, PortalI18n.resolve(previewPreference, [browserLanguage || previewLanguage]));
            localStorage.setItem('portal-preview-settings', JSON.stringify(settings));
            this.success({ok:true, settings});
          } catch (error) { this.success({ok:false, error:error.message}); }
        }, 200);},
        resetPortalSettings() {this.savePortalSettings(getPortalPropertyDefaults_(previewLanguage));},
        saveLanguage(language) {setTimeout(() => {
          if (!['auto', 'ja', 'en'].includes(language)) return this.success({ok:false});
          try {
            localStorage.setItem('portal-preview-language', language);
            previewPreference = language;
            previewLanguage = PortalI18n.resolve(language, browserLanguages);
            this.success({ok:true, language});
          } catch { this.failure(); }
        }, 200);},
        saveTheme(theme) {setTimeout(() => {
          try {
            localStorage.setItem('portal-preview-theme', theme);
            this.success({ok:true, theme});
          } catch { this.failure(); }
        }, 200);},
        getCatalog() {setTimeout(() => {
          if (scenario === 'error') return this.failure();
          if (scenario === 'empty') return this.success({ok:true, tools:[], issues:[]});
          if (scenario === 'invalid') return this.success({ok:true, tools:[], issues:[{row:2, message:PortalI18n.t('Enter a valid HTTPS URL in url.')}]});
          if (scenario === 'config') return this.success({ok:false, error:PortalI18n.t('The first row must contain id, name, and url columns. Also check for duplicate column names.')});
          this.success(catalog);
        }, 350);}
      }}};
    </script>\n<script type="module" src="/browser/main.js"></script>`);
}

/** Replace GAS templates and RPC locally. Vite handles serving and HMR. */
export function gasPreview(root) {
  return {
    name: 'gas-preview',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        return context.path === '/Index.html' ? renderPreview(html, root) : html;
      },
    },
    configureServer(server) {
      const configPath = path.join(root, '.clasp.json');
      server.watcher.add(configPath);
      server.watcher.on('change', (file) => {
        if (file === configPath || file.startsWith(path.join(root, 'src/server/')) || file === path.join(root, 'src/assets/external-link.svg')) {
          server.ws.send({ type: 'full-reload' });
        }
      });
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/') request.url = '/Index.html' + url.search;
        if (url.pathname === '/mobile') request.url = '/mobile.html' + url.search;
        next();
      });
    },
  };
}
