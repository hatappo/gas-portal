(() => {
  'use strict';
  /** @type {Array<[string, string, 'catalog' | 'actions', 'saveCatalogCacheTtl' | 'saveActionsCacheTtl']>} */
  const preferences = [
    ['catalog-cache-seconds', 'cache-settings-status', 'catalog', 'saveCatalogCacheTtl'],
    ['actions-cache-seconds', 'actions-cache-settings-status', 'actions', 'saveActionsCacheTtl'],
  ];
  /** @param {string} key */
  const t = (key) => PortalI18n.t(key, document.documentElement.lang);
  for (const [selectId, statusId, kind, save] of preferences) {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById(selectId));
    const status = /** @type {HTMLElement} */ (document.getElementById(statusId));
    // One option per choice, from the shared list. Language changes retranslate them through data-i18n.
    select.replaceChildren(...PortalCacheDurations[kind].choices.map((seconds) => {
      const option = document.createElement('option');
      const key = PortalCacheDurations.label(kind, seconds);
      option.value = String(seconds);
      option.dataset.i18n = key;
      option.textContent = t(key);
      return option;
    }));
    let saved = String(PortalCacheDurations.normalize(kind, select.dataset.savedValue || undefined));
    select.value = saved;
    const saveChoice = PortalSave.createSaver({ status, t, setBusy: (busy) => { select.disabled = busy; } });
    select.addEventListener('change', () => {
      const value = select.value;
      if (select.disabled || value === saved) return;
      saveChoice({
        send: (runner) => runner[save](Number(value)),
        confirm: (/** @type {{ok: boolean, seconds?: number}} */ response) => {
          if (!response?.ok || response.seconds !== Number(value)) return false;
          saved = value;
          select.dataset.savedValue = value;
          return t('Saved');
        },
        restore: () => { select.value = saved; },
        failureMessage: 'Could not save cache settings. Please try again.',
      });
    });
  }
})();
