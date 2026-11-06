import { mountThemePicker } from './theme-view';

(() => {
  'use strict';
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);

  const root = document.documentElement;
  const status = /** @type {HTMLElement} */ (document.getElementById('theme-status'));

  // The server omits data-theme for auto, so DaisyUI follows the device color scheme without script.
  let savedTheme = PortalThemes.isTheme(root.dataset.theme) ? /** @type {string} */ (root.dataset.theme) : 'auto';

  /** @param {string} theme */
  function apply(theme) {
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = theme;
    picker.setTheme(theme);
  }

  const picker = mountThemePicker(savedTheme, choose);
  const save = PortalSave.createSaver({ status, t, setBusy: picker.setBusy });

  apply(savedTheme);
  /** @param {string} theme */
  function choose(theme) {
    if (theme === savedTheme) return;
    apply(theme);
    save({
      send: (runner) => runner.saveTheme(theme),
      confirm: (/** @type {ThemeResponse} */ response) => {
        if (!response?.ok || response.theme !== theme) return false;
        savedTheme = theme;
        return t("Saved");
      },
      // Show the last confirmed theme, as the other settings do, so selecting it again works.
      restore: () => apply(savedTheme),
      failureMessage: "Could not save. Please select a theme again.",
    });
  }
})();
