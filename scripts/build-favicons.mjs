import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { Resvg } from '@resvg/resvg-js';
import { hex, portalThemes, themeColors } from './theme-colors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => String.fromCodePoint(start + index)).join('');
export const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + range(0x3041, 0x3096) + 'ゝゞ' + range(0x30a1, 0x30fa) + 'ーヽヾ';
const japaneseCss = readFileSync(fileURLToPath(import.meta.resolve('@fontsource/shippori-mincho/400.css')), 'utf8');
// Fontsource splits Japanese fonts by unicode-range. Load only subsets used by kana.
const japaneseSubsets = [...japaneseCss.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, body]) => ({
  file: body.match(/url\(\.\/files\/([^)]*\.woff)\)/)?.[1],
  ranges: [...body.matchAll(/U\+([0-9a-f]+)(?:-([0-9a-f]+))?/gi)].map(([, start, end]) => [parseInt(start, 16), parseInt(end || start, 16)]),
}));
const japaneseFonts = new Map();
const fontBytes = readFileSync(fileURLToPath(import.meta.resolve('@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff')));
const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));

function fontFor(letter) {
  if (/^[A-Z]$/.test(letter)) return font;
  const code = letter.codePointAt(0);
  const subset = japaneseSubsets.find(({ ranges }) => ranges.some(([start, end]) => code >= start && code <= end));
  if (!subset?.file) throw new Error(`Missing font subset for ${letter}.`);
  if (!japaneseFonts.has(subset.file)) {
    const bytes = readFileSync(fileURLToPath(import.meta.resolve('@fontsource/shippori-mincho/files/' + subset.file)));
    japaneseFonts.set(subset.file, opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  }
  return japaneseFonts.get(subset.file);
}

export function iconFilename(letter) {
  if ([...letter].length !== 1 || !letters.includes(letter)) throw new Error('Unsupported favicon character.');
  return (/^[A-Z]$/.test(letter) ? letter : 'u' + letter.codePointAt(0).toString(16)) + '.png';
}

/** Each portal theme's icon uses its DaisyUI primary color, with primary-content for the glyph. */
export function readThemes() {
  const names = portalThemes().all;
  if (new Set(names).size !== names.length) throw new Error('Theme names must be unique.');
  return names.map((name) => {
    const { colors } = themeColors(name);
    return { name, color: hex(colors.primary), ink: hex(colors['primary-content']) };
  });
}

export function iconSvg(color, letter, ink = '#ffffff') {
  if (!/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(ink) || [...letter].length !== 1 || !letters.includes(letter)) throw new Error('Invalid favicon palette or letter.');
  const selectedFont = fontFor(letter);
  if (!selectedFont.charToGlyphIndex(letter)) throw new Error(`Missing glyph: ${letter}`);
  const outline = selectedFont.getPath(letter, 0, 0, 48);
  const box = outline.getBoundingBox();
  if (!outline.commands.length || box.x2 <= box.x1 || box.y2 <= box.y1) throw new Error(`Missing glyph: ${letter}`);
  const scale = Math.min(1, 48 / (box.x2 - box.x1), 48 / (box.y2 - box.y1));
  const x = 32 - scale * (box.x1 + box.x2) / 2;
  const y = 32 - scale * (box.y1 + box.y2) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="20" fill="${color}"/><path fill="${ink}" transform="translate(${x} ${y}) scale(${scale})" d="${outline.toPathData({ flipY: false })}"/></svg>`;
}

// Rasterize the approved font outline without needing the original font at build time.
export function renderFallback() {
  const source = readFileSync(path.join(root, 'src/assets/favicon-fallback.svg'), 'utf8');
  return new Resvg(source, { font: { loadSystemFonts: false } }).render();
}

export function buildFavicons(destination = path.join(root, 'site')) {
  const themes = readThemes();
  mkdirSync(destination, { recursive: true });
  for (const { name, color, ink } of themes) {
    const directory = path.join(destination, 'favicons', name);
    mkdirSync(directory, { recursive: true });
    for (const letter of letters) {
      const png = new Resvg(iconSvg(color, letter, ink), { font: { loadSystemFonts: false } }).render().asPng();
      writeFileSync(path.join(directory, iconFilename(letter)), png);
    }
  }
  writeFileSync(path.join(destination, 'favicons/fallback.png'), renderFallback().asPng());
  copyFileSync(fileURLToPath(import.meta.resolve('@fontsource/libre-baskerville/LICENSE')), path.join(destination, 'FONT-LICENSE.txt'));
  copyFileSync(fileURLToPath(import.meta.resolve('@fontsource/shippori-mincho/LICENSE')), path.join(destination, 'JAPANESE-FONT-LICENSE.txt'));
  writeFileSync(path.join(destination, '.nojekyll'), '');
  const sections = themes.map(({ name }) => `<section><h2>${name}</h2><div class="icons">${[...letters].map((letter) => `<a href="favicons/${name}/${iconFilename(letter)}" title="${name} ${letter}"><img src="favicons/${name}/${iconFilename(letter)}" alt="${letter}" width="40" height="40" loading="lazy"/></a>`).join('')}</div></section>`).join('\n');
  writeFileSync(path.join(destination, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>gas-portal favicons</title>
<style>body{max-width:960px;margin:48px auto;padding:0 24px;font:16px/1.6 system-ui;background:#f6f9fc;color:#263844}h1{font-size:28px}h2{font-size:16px;margin:28px 0 12px}.icons{display:flex;flex-wrap:wrap;gap:12px}.icons a{display:flex;border-radius:12px}.icons a:focus-visible{outline:3px solid #2b5d89;outline-offset:4px}a{color:#2b5d89}footer{margin-top:40px;font-size:14px}</style></head>
<body><h1>gas-portal favicons</h1><p>One palette per portal theme (DaisyUI primary colors) with A–Z, hiragana, and katakana, drawn with Libre Baskerville and Shippori Mincho.</p><section><h2>Fallback</h2><p>The 玄 glyph from <a href="https://opentype.jp/kouzansousho.htm">Kouzan Brush Font Sousho by Aoyagi Kouzan</a>, in iron indigo and shared by all themes.</p><a href="favicons/fallback.png"><img src="favicons/fallback.png" alt="Cursive 玄 fallback icon" width="64" height="64"/></a></section>${sections}<footer><a href="https://github.com/hatappo/gas-portal">Source</a> · <a href="FONT-LICENSE.txt">Latin font license</a> · <a href="JAPANESE-FONT-LICENSE.txt">Japanese font license</a></footer></body></html>\n`);
  return { count: themes.length * letters.length + 1, destination };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { count, destination } = buildFavicons();
  console.log(`Generated ${count} PNG favicons in ${destination}.`);
}
