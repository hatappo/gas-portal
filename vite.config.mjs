import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { gasPreview } from './scripts/preview.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');

export default defineConfig({
  root: path.join(root, 'src'),
  publicDir: false,
  appType: 'mpa',
  plugins: [svelte({ configFile: false }), tailwindcss(), gasPreview(root)],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    fs: { allow: [path.join(root, 'src')] },
  },
});
