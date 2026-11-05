(() => {
  'use strict';
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);

  const root = document.documentElement;
  const status = /** @type {HTMLElement} */ (document.getElementById('theme-status'));

  /** A radio card with a small preview drawn in the theme's own colors. @param {string} theme */
  function card(theme) {
    const label = document.createElement('label');
    label.className = 'theme-choice';
    const input = document.createElement('input');
    input.className = 'visually-hidden';
    input.type = 'radio';
    input.name = 'portal-theme';
    input.value = theme;
    input.setAttribute('aria-label', PortalThemes.label(theme));
    const preview = document.createElement('span');
    preview.className = 'theme-preview';
    preview.dataset.theme = theme;
    preview.setAttribute('aria-hidden', 'true');
    preview.innerHTML = '<span class="mini-header"><i></i><b></b></span><span class="mini-title"></span>' +
      '<span class="mini-layout"><i></i><i></i></span><span class="mini-swatches"><i></i><i></i><i></i></span>';
    const name = document.createElement('span');
    name.className = 'theme-label';
    const text = document.createElement('span');
    text.textContent = PortalThemes.label(theme);
    const check = document.createElement('span');
    check.className = 'theme-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    name.append(text, check);
    label.append(input, preview, name);
    return label;
  }
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    document.querySelector(`.theme-group[data-scheme="${scheme}"] .theme-grid`)?.replaceChildren(...PortalThemes[scheme].map(card));
  }

  const choices = Array.from(document.querySelectorAll('input[name="portal-theme"]'), (node) => /** @type {HTMLInputElement} */ (node));
  // The server omits data-theme for auto, so DaisyUI follows the device color scheme without script.
  let savedTheme = PortalThemes.isTheme(root.dataset.theme) ? /** @type {string} */ (root.dataset.theme) : 'auto';

  /** @param {string} theme */
  function apply(theme) {
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = theme;
    choices.forEach((choice) => { choice.checked = choice.value === theme; });
  }

  const save = PortalSave.createSaver({ status, t, setBusy: (busy) => choices.forEach((choice) => { choice.disabled = busy; }) });

  apply(savedTheme);
  choices.forEach((choice) => choice.addEventListener('change', () => {
    const theme = choice.value;
    if (!choice.checked || theme === savedTheme) return;
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
  }));
})();
