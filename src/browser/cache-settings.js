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
