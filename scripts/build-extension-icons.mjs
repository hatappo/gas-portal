import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { iconSvg } from './build-favicons.mjs';
import { hex, portalThemes, themeColors } from './theme-colors.mjs';

// Reuse the portal's default favicon artwork rather than enlarging an existing PNG.
const destination = process.argv[2];
if (!destination) throw new Error('Provide an output directory for extension icons.');
const { colors } = themeColors(portalThemes().resolve('auto').palette);
const svg = iconSvg(hex(colors.primary), 'P', hex(colors['primary-content']));
mkdirSync(destination, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render().asPng();
  writeFileSync(path.join(destination, `${size}.png`), png);
}
