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
  let generation = 0;

  /** @param {string} theme */
  function apply(theme) {
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = theme;
    choices.forEach((choice) => { choice.checked = choice.value === theme; });
  }

  /** @param {boolean} value */
  function saving(value) {
    choices.forEach((choice) => { choice.disabled = value; });
    status.setAttribute('aria-busy', String(value));
  }

  apply(savedTheme);
  choices.forEach((choice) => choice.addEventListener('change', () => {
    const theme = choice.value;
    if (!choice.checked || theme === savedTheme) return;
    const current = ++generation;
    apply(theme);
    saving(true);
    status.textContent = t("Saving…");
    const timeout = window.setTimeout(() => {
      if (current !== generation) return;
      generation++;
      saving(false);
      status.textContent = t("Could not confirm the save. Reload the page to check.");
    }, 15000);
    const failure = () => {
      window.clearTimeout(timeout);
      if (current !== generation) return;
      apply(savedTheme);
      saving(false);
      status.textContent = t("Could not save. Please select a theme again.");
    };
    try {
      google.script.run.withSuccessHandler((/** @type {ThemeResponse} */ response) => {
        if (current !== generation) return;
        if (!response?.ok || response.theme !== theme) { failure(); return; }
        window.clearTimeout(timeout);
        savedTheme = theme;
        saving(false);
        status.textContent = t("Saved");
      }).withFailureHandler(failure).saveTheme(theme);
    } catch {
      failure();
    }
  }));
})();
