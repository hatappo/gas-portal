import { createSaver } from './save-control.js';
import { mountThemePicker } from './theme-view';

export function initializeTheme() {
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);

  const root = document.documentElement;
  const status = /** @type {HTMLElement} */ (document.getElementById('theme-status'));

  // Palette and scheme share the existing per-user preference and save/rollback flow.
  let savedTheme = PortalThemes.preference(root.dataset.theme || 'cerberus', root.dataset.colorScheme || 'auto');

  /** @param {string} theme */
  function apply(theme) {
    const { palette, scheme } = PortalThemes.resolve(theme);
    root.dataset.theme = palette;
    root.dataset.colorScheme = scheme;
    picker.setTheme(theme);
  }

  const picker = mountThemePicker(savedTheme, choose);
  const save = createSaver({ status, t, setBusy: picker.setBusy });

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
}
