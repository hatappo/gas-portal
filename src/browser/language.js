import { createSaver } from './save-control.js';
export function initializeLanguage() {
  const root = document.documentElement;
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('portal-language'));
  const status = /** @type {HTMLElement} */ (document.getElementById('language-status'));
  let savedPreference = PortalI18n.preference(root.dataset.languagePreference);
  const browserLanguages = () => navigator.languages?.length ? navigator.languages : [navigator.language];
  const resolvedLanguage = () => PortalI18n.resolve(savedPreference, browserLanguages());
  const save = createSaver({
    status, t: (key) => PortalI18n.t(key, root.lang), setBusy: (busy) => { select.disabled = busy; },
  });

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
    for (const id of ['status-title', 'theme-status', 'portal-settings-status', 'language-status', 'cache-settings-status',
      'actions-cache-settings-status', 'spreadsheet-settings-status', 'url-scheme-settings-status', 'github-settings-status', 'favicon-finder-status']) {
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
    save({
      send: (runner) => runner.saveLanguage(language),
      confirm: (/** @type {{ok: boolean, language?: string}} */ response) => {
        if (!response?.ok || response.language !== language) return false;
        savedPreference = PortalI18n.preference(language);
        root.dataset.languagePreference = savedPreference;
        apply(resolvedLanguage());
        return PortalI18n.t('Saved', root.lang);
      },
      restore: () => { select.value = savedPreference; },
      failureMessage: 'Could not save the language. Please try again.',
    });
  });
}
