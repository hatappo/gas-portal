(() => {
  'use strict';
  /** @type {Array<[string, string, string, string[], 'saveCatalogCacheTtl' | 'saveActionsCacheTtl']>} */
  const preferences = [
    ['catalog-cache-seconds', 'cache-settings-status', '21600', ['0', '300', '3600', '21600'], 'saveCatalogCacheTtl'],
    ['actions-cache-seconds', 'actions-cache-settings-status', '300', ['0', '60', '300', '900', '1800', '3600', '21600'], 'saveActionsCacheTtl'],
  ];
  for (const [selectId, statusId, defaultValue, choices, save] of preferences) {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById(selectId));
    const status = /** @type {HTMLElement} */ (document.getElementById(statusId));
    /** @param {string} key */
    const t = (key) => PortalI18n.t(key, document.documentElement.lang);
    let saved = select.dataset.savedValue || String(defaultValue);
    if (!choices.includes(saved)) saved = String(defaultValue);
    select.value = saved;
    let generation = 0;
    select.addEventListener('change', () => {
      const value = select.value;
      if (select.disabled || value === saved) return;
      const current = ++generation;
      select.disabled = true;
      status.textContent = t('Saving…');
      status.setAttribute('aria-busy', 'true');
      const finish = () => { select.disabled = false; status.setAttribute('aria-busy', 'false'); };
      const timeout = window.setTimeout(() => {
        if (current !== generation) return;
        generation++;
        select.value = saved;
        finish();
        status.textContent = t('Could not confirm the save. Reload the page to check.');
      }, 15000);
      const failure = () => {
        window.clearTimeout(timeout);
        if (current !== generation) return;
        select.value = saved;
        finish();
        status.textContent = t('Could not save cache settings. Please try again.');
      };
      try {
        google.script.run.withSuccessHandler((/** @type {{ok: boolean, seconds?: number}} */ response) => {
          if (current !== generation) return;
          if (!response?.ok || response.seconds !== Number(value)) { failure(); return; }
          window.clearTimeout(timeout);
          saved = value;
          select.dataset.savedValue = value;
          finish();
          status.textContent = t('Saved');
        }).withFailureHandler(failure)[save](Number(value));
      } catch { failure(); }
    });
  }
})();
