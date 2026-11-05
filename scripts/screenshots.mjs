// Capture the local preview in every theme for visual review. Not part of `npm run check` or CI.
// First run: npx playwright install chromium
// Usage: npm run screenshots -- [--themes nord,night] [--views tools,appearance] [--widths 1280,390]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { portalThemes } from './theme-colors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Each view is a URL hash, a ready condition, and an optional action before the capture. */
export const views = {
  tools: { hash: '', ready: '#directory[aria-busy="false"]' },
  list: { hash: '', ready: '#directory[aria-busy="false"]', prepare: (page) => page.click('#view-list') },
  actions: { query: '?github=multiple', hash: '#actions', ready: '#action-items[aria-busy="false"]' },
  appearance: { hash: '#settings/appearance', ready: '#settings-appearance-panel:not([hidden])' },
  'settings-tools': { hash: '#settings/tools', ready: '#settings-tools-panel:not([hidden])' },
  'settings-actions': { hash: '#settings/actions', ready: '#github-connections li' },
};

/** @param {string[]} argv */
export function parseOptions(argv, themes = portalThemes().all) {
  const options = { themes: [...themes], views: Object.keys(views), widths: [1280, 390], out: path.join(root, 'screenshots') };
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    const list = value.split(',').map((item) => item.trim()).filter(Boolean);
    if (flag === '--themes') {
      const unknown = list.filter((theme) => !themes.includes(theme));
      if (unknown.length) throw new Error(`Unknown themes: ${unknown.join(', ')}`);
      options.themes = list;
    } else if (flag === '--views') {
      const unknown = list.filter((view) => !Object.hasOwn(views, view));
      if (unknown.length) throw new Error(`Unknown views: ${unknown.join(', ')}. Choose from ${Object.keys(views).join(', ')}.`);
      options.views = list;
    } else if (flag === '--widths') {
      options.widths = list.map(Number);
      if (options.widths.some((width) => !Number.isInteger(width) || width < 320 || width > 2560)) throw new Error('Widths must be integers from 320 to 2560.');
    } else if (flag === '--out') {
      // The output directory is deleted before each run, so keep it inside screenshots/.
      const out = path.resolve(value);
      const base = path.join(root, 'screenshots');
      if (out !== base && !out.startsWith(base + path.sep)) throw new Error(`--out must be inside ${base}, because it is deleted before each run.`);
      options.out = out;
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return options;
}

/** One page per view and width, with every theme side by side, to review at a glance. */
export function contactSheet(entries) {
  const escape = (text) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  const cells = entries.map(({ theme, src }) =>
    `<figure><figcaption>${escape(theme)}</figcaption><img src="${src}" alt=""></figure>`).join('');
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:12px;background:#777;font:600 16px system-ui;display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px;align-items:start}
figure{margin:0;background:#fff}figcaption{padding:4px 8px}img{display:block;width:100%}</style>${cells}`;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = /** @type {net.AddressInfo} */ (server.address());
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const { chromium } = await import('playwright');
  const { createServer } = await import('vite');
  process.env.PORT = String(await freePort());
  const server = await createServer({ configFile: path.join(root, 'vite.config.mjs'), logLevel: 'error' });
  await server.listen();
  const base = `http://127.0.0.1:${process.env.PORT}/`;
  rmSync(options.out, { recursive: true, force: true });
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch();
    for (const width of options.widths) {
      const directory = path.join(options.out, String(width));
      mkdirSync(directory, { recursive: true });
      // Themes run in parallel; each gets its own context so stored preferences stay separate.
      await Promise.all(options.themes.map(async (theme) => {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        await context.addInitScript((value) => localStorage.setItem('portal-preview-theme', value), theme);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(`${theme} ${width}px: ${error.message}`));
        for (const name of options.views) {
          const view = views[name];
          await page.goto(base + (view.query || '') + view.hash);
          await page.waitForSelector(view.ready, { state: 'attached', timeout: 15000 });
          await view.prepare?.(page);
          await page.waitForTimeout(150);
          await page.screenshot({ path: path.join(directory, `${name}-${theme}.png`), fullPage: true });
        }
        await context.close();
      }));
      const page = await browser.newPage({ viewport: { width: 1600, height: 200 } });
      for (const name of options.views) {
        const entries = options.themes.map((theme) => ({ theme,
          src: 'data:image/png;base64,' + readFileSync(path.join(directory, `${name}-${theme}.png`)).toString('base64') }));
        const html = path.join(directory, `sheet-${name}.html`);
        writeFileSync(html, contactSheet(entries));
        await page.goto('file://' + html);
        await page.screenshot({ path: path.join(options.out, `sheet-${name}-${width}.png`), fullPage: true });
        rmSync(html);
      }
      await page.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
  const count = options.themes.length * options.views.length * options.widths.length;
  console.log(`Captured ${count} screenshots and ${options.views.length * options.widths.length} contact sheets in ${path.relative(process.cwd(), options.out) || '.'}/.`);
  if (errors.length) {
    console.error('Page errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message.includes("Executable doesn't exist") ? 'Chromium is missing. Run: npx playwright install chromium' : error);
    process.exitCode = 1;
  });
}
