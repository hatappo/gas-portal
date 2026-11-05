(() => {
  'use strict';
  // A checked box means the scheme is blocked. Storage keeps the unblocked ones,
  // so schemes added to the default list later start out blocked.
  const fieldset = /** @type {HTMLFieldSetElement | null} */ (document.getElementById('url-scheme-settings'));
  const status = document.getElementById('url-scheme-settings-status');
  if (!fieldset || !status) return;
  // One checkbox per default-blocked scheme, from the shared list.
  fieldset.querySelector('.url-scheme-choices')?.replaceChildren(...PortalUrlSchemes.optional.map((scheme) => {
    const label = document.createElement('label');
    label.className = 'url-scheme-choice';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'checkbox checkbox-sm';
    box.value = scheme;
    const name = document.createElement('code');
    name.textContent = scheme + ':';
    label.append(box, name);
    return label;
  }));
  const boxes = /** @type {HTMLInputElement[]} */ (Array.from(fieldset.querySelectorAll('input[type="checkbox"]')));
  /** @param {string} key */
  const t = (key) => PortalI18n.t(key, document.documentElement.lang);
  let saved = PortalUrlSchemes.normalizeUnblocked(fieldset.dataset.savedValue);
  const show = () => boxes.forEach((box) => { box.checked = !saved.includes(box.value); });
  show();
  let generation = 0;
  fieldset.addEventListener('change', () => {
    if (fieldset.disabled) return;
    const next = PortalUrlSchemes.normalizeUnblocked(boxes.filter((box) => !box.checked).map((box) => box.value));
    if (next.join(',') === saved.join(',')) return;
    const current = ++generation;
    fieldset.disabled = true;
    status.textContent = t('Saving…');
    status.setAttribute('aria-busy', 'true');
    const finish = () => { fieldset.disabled = false; status.setAttribute('aria-busy', 'false'); };
    const timeout = window.setTimeout(() => {
      if (current !== generation) return;
      generation++;
      show();
      finish();
      status.textContent = t('Could not confirm the save. Reload the page to check.');
    }, 15000);
    const failure = () => {
      window.clearTimeout(timeout);
      if (current !== generation) return;
      show();
      finish();
      status.textContent = t('Could not save URL scheme settings. Please try again.');
    };
    try {
      google.script.run.withSuccessHandler((/** @type {{ok: boolean, schemes?: string[]}} */ response) => {
        if (current !== generation) return;
        if (!response?.ok || response.schemes?.join(',') !== next.join(',')) { failure(); return; }
        window.clearTimeout(timeout);
        saved = next;
        fieldset.dataset.savedValue = next.join(',');
        finish();
        status.textContent = t('Saved');
        // The tool list reads the saved value and re-renders without fetching the catalog.
        document.dispatchEvent(new CustomEvent('portal:urlschemeschange'));
      }).withFailureHandler(failure).saveUnblockedUrlSchemes(next);
    } catch { failure(); }
  });
})();
