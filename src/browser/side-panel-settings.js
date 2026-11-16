import { normalizePortalUrl } from './side-panel-protocol';
import { createSaver, serverError } from './save-control.js';
export function initializeSidePanelSettings() {
  initializeConnectionUrl();
  const form = document.getElementById('side-panel-settings-form');
  const fieldset = /** @type {HTMLFieldSetElement | null} */ (document.getElementById('side-panel-settings-fields'));
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('side-panel-extension-ids'));
  const status = document.getElementById('side-panel-settings-status');
  if (!form || !fieldset || !input || !status) return;
  /** @param {string} key */
  const t = (key) => PortalI18n.t(key, document.documentElement.lang);
  const save = createSaver({ status, t, setBusy: (busy) => { fieldset.disabled = busy; } });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (fieldset.disabled) return;
    let ids;
    try { ids = PortalSidePanel.parseAdditional(input.value); }
    catch (error) {
      input.setAttribute('aria-invalid', 'true');
      status.textContent = t(error instanceof Error ? error.message : 'Check your input.');
      return;
    }
    input.removeAttribute('aria-invalid');
    const value = ids.join('\n');
    save({
      send: (runner) => runner.saveSidePanelExtensionIds(value),
      confirm: (/** @type {{ok: boolean, ids?: string[]}} */ response) => {
        if (!response?.ok || response.ids?.join('\n') !== value) return serverError(response);
        input.value = value;
        return t('Saved. Reload the side panel to apply.');
      },
      failureMessage: 'Could not save. Please try again.',
    });
  });
}

function initializeConnectionUrl() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('side-panel-url'));
  const copy = /** @type {HTMLButtonElement | null} */ (document.getElementById('side-panel-copy-url'));
  const help = document.getElementById('side-panel-url-help');
  const status = document.getElementById('side-panel-copy-status');
  if (!input || !copy || !help || !status) return;
  /** @param {string} key */
  const t = (key) => PortalI18n.t(key, document.documentElement.lang);
  const url = normalizePortalUrl(input.value);
  input.value = url || '';
  copy.disabled = !url;
  if (!url) {
    const message = 'Open the deployed web app (/exec) to copy its connection URL. Not available in local preview or test deployments.';
    help.dataset.i18n = message;
    help.textContent = t(message);
  }
  copy.addEventListener('click', async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = t('Copied');
    } catch {
      input.focus();
      input.select();
      status.textContent = t('The URL is selected. Press Ctrl+C or ⌘C to copy it.');
    }
  });
}
