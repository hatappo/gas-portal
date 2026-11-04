(() => {
  'use strict';
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('catalog-cache-seconds'));
  const status = /** @type {HTMLElement} */ (document.getElementById('cache-settings-status'));
  /** @param {string} key */
  const t = (key) => PortalI18n.t(key, document.documentElement.lang);
  let saved = select.dataset.savedValue || '21600';
  if (!['0', '300', '3600', '21600'].includes(saved)) saved = '21600';
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
      }).withFailureHandler(failure).saveCatalogCacheTtl(Number(value));
    } catch { failure(); }
  });
})();
