import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { buildFavicons, renderFallback, iconSvg, iconFilename, letters, readThemes } from '../scripts/build-favicons.mjs';
import { server } from './helpers.mjs';

test('Generate all supported theme and letter combinations as 64px PNG assets with real glyphs', (t) => {
  const destination = mkdtempSync(path.join(tmpdir(), 'portal-favicons-'));
  t.after(() => rmSync(destination, { recursive: true, force: true }));
  assert.equal(letters.length, 207);
  assert.equal(new Set(letters).size, 207);
  const themes = readThemes();
  assert.equal(themes.length, 21);
  assert.equal(buildFavicons(destination).count, themes.length * 207 + 1);
  const { context } = server();
  const images = new Set();
  for (const { name, color, ink } of themes) {
    assert.equal(context.isPortalTheme_(name), true);
    assert.equal(readdirSync(path.join(destination, 'favicons', name)).length, 207);
    for (const letter of letters) {
      const url = new URL(context.getPortalFaviconUrl_(name, letter));
      const relative = url.pathname.replace('/gas-portal/', '');
      const png = readFileSync(path.join(destination, relative));
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16), 64);
      assert.equal(png.readUInt32BE(20), 64);
      if (/^[A-Z]$/.test(letter)) images.add(png.toString('base64'));
      assert.equal(path.basename(url.pathname), iconFilename(letter));
      const rendered = new Resvg(iconSvg(color, letter, ink), { font: { loadSystemFonts: false } }).render();
      const [r, g, b] = ink.slice(1).match(/../g).map((part) => parseInt(part, 16));
      const pixels = rendered.pixels;
      assert.equal(pixels[3], 0, 'The rounded corner is transparent');
      let glyph = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b && pixels[i + 3] === 255) glyph++;
      }
      assert.ok(glyph > 30, `${name}/${letter} has a visible glyph in primary-content without system fonts`);
    }
  }
  assert.equal(images.size, 26 * new Set(themes.map(({ color, ink }) => color + ink)).size);
  assert.deepEqual(readFileSync(path.join(destination, 'favicons/fallback.png')), renderFallback().asPng());
  for (const file of ['FONT-LICENSE.txt', 'JAPANESE-FONT-LICENSE.txt']) {
    assert.match(readFileSync(path.join(destination, file), 'utf8'), /SIL OPEN FONT LICENSE/);
  }
});

test('Use safe favicon fallbacks and normalize ASCII letters without exposing arbitrary settings in URLs', () => {
  const { context } = server();
  const base = 'https://hatappo.github.io/gas-portal/favicons/';
  assert.equal(context.getPortalFaviconUrl_('dracula', 'p'), base + 'dracula/P.png');
  assert.equal(context.getPortalFaviconUrl_('auto', 'Z'), base + 'nord/Z.png', 'Auto uses the light default; doGet cannot see the device scheme');
  for (const icon of ['漢', '😀', '../secret', '', 'AB', '<', '゙', '・', 'ｱ']) {
    for (const theme of ['auto', ...readThemes().map(({ name }) => name)]) {
      assert.equal(context.getPortalFaviconUrl_(theme, icon), base + 'fallback.png');
    }
  }
  assert.equal(context.getPortalFaviconUrl_('../invalid', 'P'), base + 'nord/P.png');
  assert.equal(context.getPortalFaviconUrl_('tsuyukusa', 'P'), base + 'nord/P.png', 'Earlier palette names are no longer published');
});

test('Set the outer GAS page favicon from the executing user settings', () => {
  let favicon;
  const output = { setTitle() { return this; }, setFaviconUrl(value) { favicon = value; return this; }, addMetaTag() { return this; } };
  const { context } = server({
    userProperties: { PORTAL_THEME: 'dracula', PORTAL_ICON: 'm' },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => output }) },
    ScriptApp: { getScriptId: () => 'test-script' },
  });
  context.getCatalog = () => ({ ok: true, tools: [], issues: [] });
  assert.equal(context.doGet(), output);
  assert.equal(favicon, 'https://hatappo.github.io/gas-portal/favicons/dracula/M.png');
});


test('Resolve kana, small letters, voiced letters, and iteration marks to stable ASCII filenames', () => {
  const { context } = server();
  for (const letter of ['あ', 'ぁ', 'っ', 'ゃ', 'が', 'ぱ', 'ゔ', 'ゕ', 'ゖ', 'ゐ', 'ゝ', 'ゞ', 'ア', 'ァ', 'ッ', 'ャ', 'ガ', 'パ', 'ヴ', 'ヷ', 'ヺ', 'ヵ', 'ヶ', 'ー', 'ヽ', 'ヾ']) {
    assert.ok(letters.includes(letter));
    assert.equal(context.getPortalFaviconUrl_('dracula', letter), 'https://hatappo.github.io/gas-portal/favicons/dracula/u' + letter.charCodeAt(0).toString(16) + '.png');
  }
  assert.equal(context.getPortalFaviconUrl_('dracula', 'か\u3099'), context.getPortalFaviconUrl_('dracula', 'が'));
  assert.equal(context.getPortalContent_({ PORTAL_ICON: 'は\u309a' }).icon, 'ぱ');
  for (const letter of ['', '../', '漢', '<', 'AB']) assert.throws(() => iconSvg('#71a4d9', letter));
});


test('Keep the fallback transparent with a visible iron-indigo mark at favicon size', () => {
  const rendered = renderFallback();
  assert.equal(rendered.width, 64);
  assert.equal(rendered.height, 64);
  const pixels = rendered.pixels;
  let transparent = 0;
  let opaqueInk = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) transparent++;
    if (pixels[i + 3] > 240 && pixels[i] < 80 && pixels[i + 1] > pixels[i] && pixels[i + 2] > pixels[i + 1]) opaqueInk++;
  }
  assert.ok(transparent > 2000, 'No solid background or tile');
  // A genuine cursive glyph is sparse; validate visible ink without prescribing stroke weight.
  assert.ok(opaqueInk > 50, 'Opaque indigo strokes survive rasterization');
  for (const position of [0, 63, 63 * 64, 64 * 64 - 1]) assert.equal(pixels[position * 4 + 3], 0);
});
