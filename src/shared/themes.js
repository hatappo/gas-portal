// Shared by the GAS server, browser bundle, favicon build, and tests.
// Names are DaisyUI themes. Keep this list in sync with the @plugin "daisyui" list in styles.css.
globalThis.PortalThemes = (() => {
  // Each theme passes 4.5:1 for body text, muted text, and filled components when primary
  // is used only as a fill, never as text color. "dark" is the documented exception.
  const light = ['lofi', 'light', 'nord', 'fantasy', 'emerald', 'cmyk', 'acid', 'lemonade', 'cyberpunk', 'wireframe'];
  const dark = ['dracula', 'dark', 'dim', 'night', 'forest', 'halloween', 'synthwave', 'black', 'aqua', 'luxury', 'sunset'];
  // "auto" follows the device. These two have the strongest text contrast among themes whose
  // selected (primary) buttons also stand out from the page.
  const auto = { light: 'lofi', dark: 'dracula' };

  /** @param {unknown} theme */
  function isTheme(theme) {
    return typeof theme === 'string' && (theme === 'auto' || light.includes(theme) || dark.includes(theme));
  }

  /** @param {string} theme */
  function label(theme) {
    return theme.charAt(0).toUpperCase() + theme.slice(1);
  }

  return { light, dark, auto, all: [...light, ...dark], isTheme, label };
})();
