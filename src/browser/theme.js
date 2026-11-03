(() => {
  'use strict';

  const root = document.documentElement;
  const choices = Array.from(document.querySelectorAll('input[name="portal-theme"]'), (node) => /** @type {HTMLInputElement} */ (node));
  const status = /** @type {HTMLElement} */ (document.getElementById('theme-status'));
  let savedTheme = root.dataset.theme || 'tsuyukusa';
  if (!choices.some((choice) => choice.value === savedTheme)) savedTheme = 'tsuyukusa';
  let generation = 0;

  /** @param {string} theme */
  function apply(theme) {
    root.dataset.theme = theme;
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
    status.textContent = '保存中…';
    const timeout = window.setTimeout(() => {
      if (current !== generation) return;
      generation++;
      saving(false);
      status.textContent = '保存を確認できませんでした。ページを再読み込みして確認してください。';
    }, 15000);
    const failure = () => {
      window.clearTimeout(timeout);
      if (current !== generation) return;
      apply(savedTheme);
      saving(false);
      status.textContent = '保存できませんでした。もう一度選択してください。';
    };
    try {
      google.script.run.withSuccessHandler((/** @type {ThemeResponse} */ response) => {
        if (current !== generation) return;
        if (!response?.ok || response.theme !== theme) { failure(); return; }
        window.clearTimeout(timeout);
        savedTheme = theme;
        saving(false);
        status.textContent = '保存しました';
      }).withFailureHandler(failure).saveTheme(theme);
    } catch {
      failure();
    }
  }));
})();
