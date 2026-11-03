import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { withPreviewProject, withPreviewContent } from './preview-project.mjs';
import { withPortalAssets } from './portal-html.mjs';

// このファイルとデモデータは GAS にアップロードされない。
const demo = {
  ok: true,
  tools: [
    { id: 'demo-address', name: 'アドレス生成', description: '名前から、メールアドレスに使う文字列を生成します。', scope: 'internal', tags: ['アカウント', '業務効率化'], url: 'https://example.com/#demo-address', relatedLinks: [
      { label: '使い方', url: 'https://example.com/manual' },
      { label: 'ソースコード', url: 'https://example.com/source' },
    ] },
    { id: 'demo-expense', name: '経費精算サービス', description: '領収書の登録と経費申請に使う外部サービスです。', scope: 'external', tags: ['経理', '申請', '業務効率化'], url: 'https://example.com/#demo-expense' },
    { id: 'demo-guide', name: '社内ガイド', description: '業務の進め方や、よくある質問を確認できます。', scope: 'internal', tags: ['資料', 'オンボーディング'], url: 'https://example.com/#demo-guide' },
    { id: 'demo-request', name: '各種申請', description: '必要な申請フォームへアクセスできます。', scope: 'internal', tags: ['経理', '申請'], url: 'https://example.com/#demo-request' },
  ],
  issues: [],
};
export function renderPreview(html, root, options = {}) {
  const url = pathToFileURL(path.join(root, 'src/server/'));
  const context = vm.createContext({ console });
  for (const name of ['Catalog', 'Code']) {
    vm.runInContext(readFileSync(new URL(`${name}.js`, url), 'utf8'), context);
  }
  const catalog = { ok: true, ...context.parseCatalog_(demo.tools) };
  // データに </script> 等が含まれても script 要素を閉じさせない。
  const serialize = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
  // 任意の環境変数はフッタのリンク確認だけに使う。シートへの通信はしない。
  const portal = context.getPortalContent_({}, { SPREADSHEET_ID: options.spreadsheetId ?? process.env.SPREADSHEET_ID ?? '' });
  return withPreviewContent(withPreviewProject(withPortalAssets(html, root), options.configPath ?? path.join(root, '.clasp.json')), portal)
    .replace('<!-- preview-label -->', '<p class="eyebrow">LOCAL PREVIEW · 架空データ</p>')
    .replace('<script type="module" src="/browser/main.js"></script>', () => `<script>
      const getPortalPropertyDefaults_ = ${context.getPortalPropertyDefaults_.toString()};
      const validatePortalSettings_ = ${context.validatePortalSettings_.toString()};
      try {
        const stored = localStorage.getItem('portal-preview-settings');
        if (stored) {
          const settings = validatePortalSettings_(JSON.parse(stored));
          Object.entries(settings).forEach(([key, value]) => {
            document.querySelector('#portal-settings-form [name="' + key + '"]').value = value;
          });
        }
      } catch { /* 不正な保存値や保存不可のブラウザでは HTML の既定値を使う。 */ }
      const demo = ${serialize(demo)};
      const catalog = ${serialize(catalog)};
      const scenario = new URLSearchParams(location.search).get('state');
      // ローカルだけはブラウザに保存。本番では GAS の User Properties を使用する。
      try {
        const storedTheme = localStorage.getItem('portal-preview-theme');
        const theme = storedTheme === 'shikon' ? 'kuri' : storedTheme;
        if (Array.from(document.querySelectorAll('input[name="portal-theme"]')).some(input => input.value === theme)) document.documentElement.dataset.theme = theme;
      } catch { /* ブラウザが保存を許可しない場合は既定値で表示する。 */ }
      const google = {script: {run: {
        withSuccessHandler(fn) {return {...this, success: fn};},
        withFailureHandler(fn) {return {...this, failure: fn};},
        savePortalSettings(input) {setTimeout(() => {
          try {
            const settings = validatePortalSettings_(input);
            localStorage.setItem('portal-preview-settings', JSON.stringify(settings));
            this.success({ok:true, settings});
          } catch (error) { this.success({ok:false, error:error.message}); }
        }, 200);},
        resetPortalSettings() {this.savePortalSettings(getPortalPropertyDefaults_());},
        saveTheme(theme) {setTimeout(() => {
          try {
            localStorage.setItem('portal-preview-theme', theme);
            this.success({ok:true, theme});
          } catch { this.failure(); }
        }, 200);},
        getCatalog() {setTimeout(() => {
          if (scenario === 'error') return this.failure();
          if (scenario === 'empty') return this.success({ok:true, tools:[], issues:[]});
          if (scenario === 'invalid') return this.success({ok:true, tools:[], issues:[{row:2, message:'url に有効な HTTPS の URL を入力してください。'}]});
          if (scenario === 'config') return this.success({ok:false, error:'指定シートの 1 行目に id・name・url の列が必要です。列名の重複も確認してください。'});
          this.success(catalog);
        }, 350);}
      }}};
    </script>\n<script type="module" src="/browser/main.js"></script>`);
}

/** GAS のテンプレートと RPC だけをローカル用に置き換える。配信・HMR は Vite に任せる。 */
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
