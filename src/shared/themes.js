// Skeleton's bundled palettes, shared by GAS, the browser and favicon generation.
globalThis.PortalThemes = (() => {
  const palettes = ['cerberus', 'catppuccin', 'concord', 'crimson', 'dracula', 'fennec', 'hamlindigo', 'legacy', 'mint', 'modern', 'mona', 'nosh', 'nouveau', 'pine', 'reign', 'rocket', 'rose', 'rosepine', 'sahara', 'seafoam', 'terminus', 'vintage', 'vox', 'wintry'];
  const light = palettes.map(name => name + '-light');
  const dark = palettes.map(name => name + '-dark');
  const all = [...palettes, ...light, ...dark];
  const auto = { light: 'cerberus-light', dark: 'cerberus-dark' };

  /** @param {unknown} theme */
  function isTheme(theme) {
    return typeof theme === 'string' && (theme === 'auto' || all.includes(theme));
  }
  /** @param {unknown} theme */
  function resolve(theme) {
    const value = isTheme(theme) && theme !== 'auto' ? String(theme) : 'cerberus';
    const scheme = value.endsWith('-dark') ? 'dark' : value.endsWith('-light') ? 'light' : 'auto';
    return { palette: value.replace(/-(light|dark)$/, ''), scheme };
  }
  /** @param {string} palette @param {string} scheme */
  function preference(palette, scheme) {
    if (!palettes.includes(palette)) return 'auto';
    return scheme === 'light' || scheme === 'dark' ? palette + '-' + scheme : palette === 'cerberus' ? 'auto' : palette;
  }
  /** Values are resolved through the allowlist before inclusion in server-rendered HTML. @param {unknown} theme */
  function attributes(theme) {
    const { palette, scheme } = resolve(theme);
    return 'data-theme="' + palette + '" data-color-scheme="' + scheme + '"';
  }
  /** @param {string} theme */
  function label(theme) {
    const name = resolve(theme).palette;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return { palettes, light, dark, auto, all, isTheme, resolve, preference, attributes, label };
})();
