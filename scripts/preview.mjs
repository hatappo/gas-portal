import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { createGitHubPreview } from './github-preview.mjs';
import { withPreviewProject, withPreviewContent } from './preview-project.mjs';
import { sharedSources } from './gas-sources.mjs';
import { withPortalAssets } from './portal-html.mjs';
// Re-exported so a consumer previewing a linked checkout resolves Tailwind from this package.
export { default as tailwindcss } from '@tailwindcss/vite';

// This file and its mock data are not uploaded to GAS.
const demo = {
  ok: true,
  tools: [
    { id: 'demo-address', name: 'Address generator', description: 'Generate an email address from a name.', tags: ['Accounts', 'Productivity'], url: 'https://example.com/#demo-address' },
    { id: '', name: 'User guide', description: 'How to generate addresses for new members.', url: 'https://example.com/manual' },
    { id: '', name: 'Source code', url: 'https://example.com/source' },
    { id: 'demo-expense', name: 'Expense service', description: 'Upload receipts and submit expense claims.', tags: ['Finance', 'Requests', 'Productivity'], url: 'https://example.com/#demo-expense' },
    { id: 'demo-guide', name: 'Workplace guide', description: 'Find work instructions and answers to common questions. Its icon comes from the icon column.', tags: ['Reference', 'Onboarding'], url: 'https://example.com/#demo-guide', icon: '📘' },
    { id: 'demo-request', name: 'Request forms', description: 'Open the forms you need for everyday requests.', tags: ['Finance', 'Requests'], url: 'https://example.com/#demo-request' },
    { id: 'demo-workspace', name: 'Portal workspace', description: 'Open a local project in VS Code.', tags: ['Development'], url: 'vscode://file/path/to/my-portal' },
    { id: '', name: 'Local server', url: 'http://localhost:4174/' },
    { id: '', name: 'Inline note', url: 'data:text/plain,Hello' },
    { id: 'demo-z-blocked', name: 'Inline page', description: 'A data: URL. Blocked unless unblocked in Settings.', tags: ['Development'], url: 'data:text/html,Hello' },
  ],
  issues: [],
};
export function renderPreview(html, root, options = {}) {
  const url = pathToFileURL(path.join(root, 'src/server/'));
  const context = vm.createContext({ console });
  const i18n = readFileSync(path.join(root, 'src/shared/i18n.js'), 'utf8');
  const urlSchemes = readFileSync(path.join(root, 'src/shared/url-schemes.js'), 'utf8');
  for (const file of sharedSources) vm.runInContext(readFileSync(path.join(root, file), 'utf8'), context);
  for (const name of ['Catalog', 'Code']) {
    vm.runInContext(readFileSync(new URL(`${name}.js`, url), 'utf8'), context);
  }
  const catalog = { ok: true, ...context.parseCatalog_(demo.tools) };
  // Prevent embedded data from closing the script element.
  const serialize = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
  // Use the optional environment value for the source field and footer; do not contact Sheets.
  const portal = context.getPortalContent_({ SPREADSHEET_ID: options.spreadsheetId ?? process.env.SPREADSHEET_ID ?? '' });
  return withPreviewContent(withPreviewProject(withPortalAssets(html, root), options.configPath ?? path.join(root, '.clasp.json')), portal)
    .replace('placeholder="github_pat_…"', 'placeholder="demo"')
    .replace('<?!= initialCatalogJson ?>', () => context.serializeCatalog_(catalog))
    .replace('<!-- preview-label -->', '<p class="preview-label"><span>LOCAL PREVIEW</span> · <span data-i18n="Mock data">Mock data</span></p>')
    .replace('<script type="module" src="/browser/main.js"></script>', () => `<script>
      ${i18n}
      ${urlSchemes}
      ${readFileSync(path.join(root, 'src/shared/themes.js'), 'utf8')}
      ${readFileSync(path.join(root, 'src/shared/cache-durations.js'), 'utf8')}
      let previewPreference = 'auto';
      try { previewPreference = PortalI18n.preference(localStorage.getItem('portal-preview-language')); } catch { /* Storage may be unavailable. */ }
      const browserLanguages = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
      let previewLanguage = PortalI18n.resolve(previewPreference, browserLanguages);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = previewLanguage;
        document.documentElement.dataset.languagePreference = previewPreference;
      }
      const getPortalPropertyDefaults_ = ${context.getPortalPropertyDefaults_.toString()};
      const normalizePortalIcon_ = ${context.normalizePortalIcon_.toString()};
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
      const normalizeSpreadsheetId_ = ${context.normalizeSpreadsheetId_.toString()};
      const validateSpreadsheetSettings_ = ${context.validateSpreadsheetSettings_.toString()};
      let previewSource = ${serialize({ SPREADSHEET_ID: portal.spreadsheetId, SHEET_NAME: portal.sheetName })};
      try {
        const stored = localStorage.getItem('portal-preview-source');
        if (stored) previewSource = validateSpreadsheetSettings_(JSON.parse(stored));
      } catch { /* Invalid storage falls back to the preview defaults. */ }
      if (typeof document !== 'undefined') {
        document.getElementById('setting-spreadsheet').value = previewSource.SPREADSHEET_ID;
        document.getElementById('setting-sheet-name').value = previewSource.SHEET_NAME;
      }
      // Mirror production footer rendering after restoring the local source.
      if (typeof document !== 'undefined') {
        const id = normalizeSpreadsheetId_(document.getElementById('setting-spreadsheet').value);
        let link = document.querySelector('.spreadsheet-link');
        if (id) {
          if (!link) {
            link = document.querySelector('.project-link').cloneNode(true);
            link.className = 'link footer-link spreadsheet-link';
            link.firstChild.textContent = 'Spreadsheet ';
            document.querySelector('.project-link').after(link);
          }
          link.href = 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
          link.hidden = false;
        } else { link?.remove(); }
        document.getElementById('open-spreadsheet-link').dataset.url = id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '';
      }
      const normalizeCatalogCacheTtl_ = ${context.normalizeCatalogCacheTtl_.toString()};
      let previewCacheSeconds = PortalCacheDurations.catalog.defaultSeconds;
      try { previewCacheSeconds = normalizeCatalogCacheTtl_(localStorage.getItem('portal-preview-cache-seconds')); } catch { /* Use defaults. */ }
      if (typeof document !== 'undefined') document.getElementById('catalog-cache-seconds').dataset.savedValue = String(previewCacheSeconds);
      const normalizeActionsCacheTtl_ = ${context.normalizeActionsCacheTtl_.toString()};
      let previewActionsCacheSeconds = PortalCacheDurations.actions.defaultSeconds;
      try { previewActionsCacheSeconds = normalizeActionsCacheTtl_(localStorage.getItem('portal-preview-actions-cache-seconds')); } catch { /* Use defaults. */ }
      if (typeof document !== 'undefined') document.getElementById('actions-cache-seconds').dataset.savedValue = String(previewActionsCacheSeconds);
      let previewUnblockedUrlSchemes = [];
      try { previewUnblockedUrlSchemes = PortalUrlSchemes.normalizeUnblocked(localStorage.getItem('portal-preview-unblocked-url-schemes')); } catch { /* Use defaults. */ }
      if (typeof document !== 'undefined') document.getElementById('url-scheme-settings').dataset.savedValue = previewUnblockedUrlSchemes.join(',');
      const demo = ${serialize(demo)};
      const catalog = ${serialize(catalog)};
      const scenario = new URLSearchParams(location.search).get('state');
      // Use browser storage locally; production uses GAS User Properties.
      try {
        const theme = localStorage.getItem('portal-preview-theme');
        if (theme !== 'auto' && PortalThemes.isTheme(theme)) document.documentElement.dataset.theme = theme;
      } catch { /* Use defaults when the browser denies storage access. */ }
      function readPreviewCatalog(forceRefresh = false) {
        if (scenario === 'error') return {ok:false, error:PortalI18n.t('Select Fetch latest to try again. If the problem persists, check the GAS settings.')};
        if (scenario === 'empty') return {ok:true, tools:[], issues:[]};
        if (scenario === 'invalid') return {ok:true, tools:[], issues:[{row:2, message:PortalI18n.t('Enter a valid URL in url.')}]};
        if (scenario === 'config') return {ok:false, error:PortalI18n.t('The first row must contain id, name, and url columns. Also check for duplicate column names.')};
        let cached;
        try {
          const value = JSON.parse(localStorage.getItem('portal-preview-catalog') || 'null');
          if (!forceRefresh && previewCacheSeconds > 0 && Number.isFinite(value?.fetchedAt) && Date.now() - value.fetchedAt >= 0 && Date.now() - value.fetchedAt < previewCacheSeconds * 1000) cached = value;
        } catch { /* Storage is optional in previews too. */ }
        if (forceRefresh || previewCacheSeconds === 0) {
          try { localStorage.removeItem('portal-preview-catalog'); } catch { /* Ignore unavailable storage. */ }
        }
        const fetchedAt = cached?.fetchedAt || Date.now();
        if (!cached && previewCacheSeconds > 0) {
          try { localStorage.setItem('portal-preview-catalog', JSON.stringify({fetchedAt, seconds:previewCacheSeconds})); } catch { /* Still return mock data. */ }
        }
        return {...catalog, cache:{hit:Boolean(cached), fetchedAt}};
      }
      // Production embeds data during doGet; preview simulates this without an initial RPC.
      if (typeof document !== 'undefined') {
        const initial = document.getElementById('initial-catalog');
        if (initial) initial.textContent = JSON.stringify(readPreviewCatalog());
      }
      const createGitHubPreview = ${createGitHubPreview.toString()};
      const google = {script: {run: {
        ...createGitHubPreview(new URLSearchParams(location.search).get('github'), () => previewActionsCacheSeconds),
        withSuccessHandler(fn) {return {...this, success: fn};},
        withFailureHandler(fn) {return {...this, failure: fn};},
        savePortalSettings(input, browserLanguage) {setTimeout(() => {
          try {
            const settings = validatePortalSettings_(input, PortalI18n.resolve(previewPreference, [browserLanguage || previewLanguage]));
            localStorage.setItem('portal-preview-settings', JSON.stringify(settings));
            this.success({ok:true, settings});
          } catch (error) { this.success({ok:false, error:error.message}); }
        }, 200);},
        saveSpreadsheetSettings(input) {setTimeout(() => {
          try {
            const settings = validateSpreadsheetSettings_(input);
            localStorage.setItem('portal-preview-source', JSON.stringify(settings));
            previewSource = settings;
            localStorage.removeItem('portal-preview-catalog');
            this.success({ok:true, settings});
          } catch (error) { this.success({ok:false, error:error.message}); }
        }, 200);},
        createPortalSpreadsheet() {setTimeout(() => {
          if (previewSource.SPREADSHEET_ID.trim()) return this.success({ok:false, error:PortalI18n.t('A spreadsheet ID is already configured. No spreadsheet was created.', previewLanguage)});
          try {
            const next = {...previewSource, SPREADSHEET_ID:'preview-created-sheet'};
            localStorage.setItem('portal-preview-source', JSON.stringify(next));
            previewSource = next;
            localStorage.removeItem('portal-preview-catalog');
            this.success({ok:true, spreadsheetId:next.SPREADSHEET_ID});
          } catch { this.failure(); }
        }, 350);},
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
        saveActionsCacheTtl(seconds) {setTimeout(() => {
          if (!PortalCacheDurations.isChoice('actions', seconds)) return this.success({ok:false});
          try {
            localStorage.setItem('portal-preview-actions-cache-seconds', String(seconds));
            previewActionsCacheSeconds = seconds;
            this.success({ok:true, seconds});
          } catch { this.failure(); }
        }, 200);},
        saveUnblockedUrlSchemes(schemes) {setTimeout(() => {
          if (!Array.isArray(schemes) || schemes.some((scheme) => !PortalUrlSchemes.optional.includes(scheme)) || new Set(schemes).size !== schemes.length) return this.success({ok:false});
          try {
            const normalized = PortalUrlSchemes.normalizeUnblocked(schemes);
            localStorage.setItem('portal-preview-unblocked-url-schemes', normalized.join(','));
            this.success({ok:true, schemes:normalized});
          } catch { this.failure(); }
        }, 200);},
        saveCatalogCacheTtl(seconds) {setTimeout(() => {
          if (!PortalCacheDurations.isChoice('catalog', seconds)) return this.success({ok:false});
          try {
            localStorage.setItem('portal-preview-cache-seconds', String(seconds));
            previewCacheSeconds = seconds;
            this.success({ok:true, seconds});
          } catch { this.failure(); }
        }, 200);},
        getCatalog(forceRefresh = false) {setTimeout(() => {
          if (scenario === 'error') return this.failure();
          this.success(readPreviewCatalog(forceRefresh));
        }, 350);}
      }}};
    </script>\n<script type="module" src="/browser/main.js"></script>`);
}

/** Replace GAS templates and RPC locally. Vite handles serving and HMR. */
export function gasPreview(root, options = {}) {
  return {
    name: 'gas-preview',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (context.path !== '/Index.html') return html;
        const prepared = options.prepareHtml ? options.prepareHtml(html) : html;
        const rendered = renderPreview(prepared, root, options);
        return options.finishHtml ? options.finishHtml(rendered) : rendered;
      },
    },
    configureServer(server) {
      const configPath = options.configPath ?? path.join(root, '.clasp.json');
      server.watcher.add([configPath, path.join(root, 'src/server'), path.join(root, 'src/assets'), path.join(root, 'src/shared')]);
      server.watcher.on('change', (file) => {
        if (file === configPath || file.startsWith(path.join(root, 'src/server/')) || file.startsWith(path.join(root, 'src/assets/')) || file.startsWith(path.join(root, 'src/shared/'))) {
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
