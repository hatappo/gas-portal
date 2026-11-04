(() => {
  'use strict';
  const root = document.documentElement;
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('portal-language'));
  const status = /** @type {HTMLElement} */ (document.getElementById('language-status'));
  let savedPreference = PortalI18n.preference(root.dataset.languagePreference);
  const browserLanguages = () => navigator.languages?.length ? navigator.languages : [navigator.language];
  const resolvedLanguage = () => PortalI18n.resolve(savedPreference, browserLanguages());
  let generation = 0;

  /** @param {string} language */
  function apply(language) {
    root.lang = PortalI18n.normalize(language);
    select.value = savedPreference;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = PortalI18n.t(element.getAttribute('data-i18n') || '', root.lang);
    });
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      document.querySelectorAll('[data-i18n-' + attribute + ']').forEach((element) => {
        element.setAttribute(attribute, PortalI18n.t(element.getAttribute('data-i18n-' + attribute) || '', root.lang));
      });
    }
    // These nodes contain application messages, never catalog names or descriptions.
    for (const id of ['status-title', 'status-description', 'theme-status', 'portal-settings-status', 'language-status', 'cache-settings-status']) {
      const element = document.getElementById(id);
      if (element) element.textContent = PortalI18n.translate(element.textContent || '', root.lang);
    }
    document.dispatchEvent(new Event('portal:languagechange'));
  }

  apply(resolvedLanguage());
  window.addEventListener('languagechange', () => {
    if (savedPreference === 'auto') apply(resolvedLanguage());
  });
  select.addEventListener('change', () => {
    const language = select.value;
    if (!['auto', 'ja', 'en'].includes(language) || language === savedPreference || select.disabled) return;
    const current = ++generation;
    select.disabled = true;
    status.textContent = PortalI18n.t('Saving…', root.lang);
    status.setAttribute('aria-busy', 'true');
    const finish = () => { select.disabled = false; status.setAttribute('aria-busy', 'false'); };
    const timeout = window.setTimeout(() => {
      if (current !== generation) return;
      generation++;
      select.value = savedPreference;
      finish();
      status.textContent = PortalI18n.t('Could not confirm the save. Reload the page to check.', root.lang);
    }, 15000);
    const failure = () => {
      window.clearTimeout(timeout);
      if (current !== generation) return;
      select.value = savedPreference;
      finish();
      status.textContent = PortalI18n.t('Could not save the language. Please try again.', root.lang);
    };
    try {
      google.script.run.withSuccessHandler((/** @type {{ok: boolean, language?: string}} */ response) => {
        if (current !== generation) return;
        if (!response?.ok || response.language !== language) { failure(); return; }
        window.clearTimeout(timeout);
        savedPreference = PortalI18n.preference(language);
        root.dataset.languagePreference = savedPreference;
        apply(resolvedLanguage());
        finish();
        status.textContent = PortalI18n.t('Saved', root.lang);
      }).withFailureHandler(failure).saveLanguage(language);
    } catch { failure(); }
  });
})();
