import { createSaver } from './save-control.js';
export function initializeUrlSchemeSettings() {
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
    box.className = 'checkbox';
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
  const save = createSaver({ status, t, setBusy: (busy) => { fieldset.disabled = busy; } });
  fieldset.addEventListener('change', () => {
    if (fieldset.disabled) return;
    const next = PortalUrlSchemes.normalizeUnblocked(boxes.filter((box) => !box.checked).map((box) => box.value));
    if (next.join(',') === saved.join(',')) return;
    save({
      send: (runner) => runner.saveUnblockedUrlSchemes(next),
      confirm: (/** @type {{ok: boolean, schemes?: string[]}} */ response) => {
        if (!response?.ok || response.schemes?.join(',') !== next.join(',')) return false;
        saved = next;
        fieldset.dataset.savedValue = next.join(',');
        // The tool list reads the saved value and re-renders without fetching the catalog.
        document.dispatchEvent(new CustomEvent('portal:urlschemeschange'));
        return t('Saved');
      },
      restore: show,
      failureMessage: 'Could not save URL scheme settings. Please try again.',
    });
  });
}
