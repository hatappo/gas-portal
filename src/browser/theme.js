(() => {
  'use strict';
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);

  const root = document.documentElement;
  const choices = Array.from(document.querySelectorAll('input[name="portal-theme"]'), (node) => /** @type {HTMLInputElement} */ (node));
  const status = /** @type {HTMLElement} */ (document.getElementById('theme-status'));
  let savedTheme = root.dataset.theme || 'auto';
  if (!choices.some((choice) => choice.value === savedTheme)) savedTheme = 'auto';
  let generation = 0;
  let activeTheme = savedTheme;
  const darkMode = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  /** @param {string} theme */
  function apply(theme) {
    activeTheme = theme;
    root.dataset.theme = theme === 'auto' ? (darkMode?.matches ? 'tetsukon' : 'tsuyukusa') : theme;
    choices.forEach((choice) => { choice.checked = choice.value === theme; });
  }

  /** @param {boolean} value */
  function saving(value) {
    choices.forEach((choice) => { choice.disabled = value; });
    status.setAttribute('aria-busy', String(value));
  }

  apply(savedTheme);
  darkMode?.addEventListener('change', () => {
    if (activeTheme === 'auto') apply('auto');
  });
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
