import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { buildPreview, configurePreviewHtml } from './build.mjs';
import { PACKAGE_FILE, packageRoot, readConfig } from './config.mjs';

/** A linked checkout serves source through Vite; release packages serve their bundled preview. */
export async function createPreviewServer(root, { port = 4173, source = existsSync(new URL('src/Index.html', packageRoot)) && existsSync(new URL('scripts/preview.mjs', packageRoot)) } = {}) {
  readConfig(root);
  // Reload when the configuration in package.json changes.
  const configPath = path.join(root, PACKAGE_FILE);
  const sourceRoot = fileURLToPath(packageRoot);
  let previewRoot;
  let plugins;
  if (source) {
    const { gasPreview, tailwindcss } = await import(new URL('scripts/preview.mjs', packageRoot));
    previewRoot = path.join(sourceRoot, 'src');
    plugins = [tailwindcss(), gasPreview(sourceRoot, {
      configPath, spreadsheetId: '',
      prepareHtml: (html) => html.replace('href="<?= projectUrl ?>"', 'data-portal-project-link').replace('<!-- repository-link -->', '<!-- portal-repository-link -->'),
      finishHtml: (html) => configurePreviewHtml(html, root),
    })];
  } else {
    previewRoot = buildPreview(root);
    const assetPath = fileURLToPath(new URL('assets/preview/index.html', packageRoot));
    plugins = [{
      name: 'packaged-portal-preview',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          return context.path === '/index.html' ? configurePreviewHtml(readFileSync(assetPath, 'utf8'), root) : html;
        },
      },
      configureServer(server) {
        server.watcher.add([assetPath, configPath]);
        server.watcher.on('change', (file) => {
          if (file === assetPath || file === configPath) server.ws.send({ type: 'full-reload' });
        });
      },
    }];
  }
  return createServer({ configFile: false, root: previewRoot, publicDir: false, appType: 'mpa', plugins,
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [previewRoot] } },
  });
}
