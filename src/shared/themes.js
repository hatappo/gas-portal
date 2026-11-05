// Shared by the GAS server, browser bundle, favicon build, and tests.
// Names are DaisyUI themes. Keep this list in sync with the @plugin "daisyui" list in styles.css.
globalThis.PortalThemes = (() => {
  // Each theme passes 4.5:1 for body text, muted text, and filled components when primary
  // is used only as a fill, never as text color. "dark" is the documented exception.
  const light = ['nord', 'light', 'lofi', 'fantasy', 'emerald', 'cmyk', 'acid', 'lemonade', 'cyberpunk', 'wireframe'];
  const dark = ['night', 'dark', 'dim', 'dracula', 'forest', 'halloween', 'synthwave', 'black', 'aqua', 'luxury', 'sunset'];
  // "auto" follows the device: these two are used for light and dark mode.
  const auto = { light: 'nord', dark: 'night' };

  /** @param {unknown} theme */
  function isTheme(theme) {
    return typeof theme === 'string' && (theme === 'auto' || light.includes(theme) || dark.includes(theme));
  }

  /** @param {string} theme @param {boolean} prefersDark */
  function resolve(theme, prefersDark) {
    return theme === 'auto' || !isTheme(theme) ? (prefersDark ? auto.dark : auto.light) : theme;
  }

  /** @param {string} theme */
  function label(theme) {
    return theme.charAt(0).toUpperCase() + theme.slice(1);
  }

  return { light, dark, auto, all: [...light, ...dark], isTheme, resolve, label };
})();
