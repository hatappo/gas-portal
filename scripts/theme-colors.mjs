// Read DaisyUI theme colors for build-time use (favicons) and contrast tests.
// DaisyUI defines colors in OKLCH; convert them to sRGB without extra dependencies.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

/** The theme list shared with the portal (src/shared/themes.js). */
export function portalThemes() {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(path.join(root, 'src/shared/themes.js'), 'utf8'), context);
  return context.PortalThemes;
}

/** OKLCH (lightness 0–1) to linear sRGB, clamped to the sRGB gamut. */
function oklchToLinear([lightness, chroma, hue]) {
  const a = chroma * Math.cos(hue * Math.PI / 180);
  const b = chroma * Math.sin(hue * Math.PI / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map((value) => Math.min(1, Math.max(0, value)));
}

const encode = (value) => value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
const decode = (value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

/** @returns {{scheme: string, colors: Record<string, number[]>}} colors in linear sRGB */
export function themeColors(name) {
  const css = readFileSync(require.resolve(`daisyui/theme/${name}.css`), 'utf8');
  const scheme = /color-scheme:\s*(light|dark)/.exec(css)?.[1];
  if (!scheme) throw new Error(`Missing color-scheme for ${name}.`);
  const colors = {};
  for (const [, key, value] of css.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    const match = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(value.trim());
    if (!match) throw new Error(`Unsupported color for ${name} ${key}: ${value}`);
    colors[key] = oklchToLinear([Number(match[1]) / 100, Number(match[2]), Number(match[3])]);
  }
  return { scheme, colors };
}

/** @param {number[]} linear */
export function hex(linear) {
  return '#' + linear.map((value) => Math.round(encode(value) * 255).toString(16).padStart(2, '0')).join('');
}

/** Blend in gamma-encoded sRGB, like color-mix(in srgb) in the browser. */
export function mix(foreground, background, amount) {
  return foreground.map((value, index) => decode(amount * encode(value) + (1 - amount) * encode(background[index])));
}

export function contrast(first, second) {
  const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}
