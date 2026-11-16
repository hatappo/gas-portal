import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const icons = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' };

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  imports: false,
  zip: { artifactTemplate: `gas-portal-side-panel-${version}-{{browser}}.zip` },
  manifest: {
    name: 'GAS Portal Side Panel',
    version,
    description: 'Keep your personal GAS portal beside your browser tabs.',
    minimum_chrome_version: '116',
    permissions: ['storage'],
    host_permissions: ['https://script.google.com/*', 'https://*.googleusercontent.com/*'],
    icons,
    action: { default_title: 'Open GAS Portal', default_icon: icons },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; frame-src https://script.google.com https://*.googleusercontent.com; base-uri 'none'" },
  },
  hooks: {
    'build:publicAssets'(wxt, files) {
      const directory = path.join(wxt.config.wxtDir, 'icons');
      // Run the shared Node-only artwork generator outside Vite's config bundle.
      execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-extension-icons.mjs', import.meta.url)), directory]);
      for (const [size, relativeDest] of Object.entries(icons)) {
        files.push({ absoluteSrc: path.join(directory, size + '.png'), relativeDest });
      }
      files.push({ absoluteSrc: fileURLToPath(import.meta.resolve('@fontsource/libre-baskerville/LICENSE')), relativeDest: 'FONT-LICENSE.txt' });
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
