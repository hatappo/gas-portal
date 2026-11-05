(() => {
  'use strict';
  const form = /** @type {HTMLFormElement} */ (document.getElementById('spreadsheet-settings-form'));
  const fields = /** @type {HTMLFieldSetElement} */ (document.getElementById('spreadsheet-settings-fields'));
  const id = /** @type {HTMLInputElement} */ (document.getElementById('setting-spreadsheet'));
  const name = /** @type {HTMLInputElement} */ (document.getElementById('setting-sheet-name'));
  const status = /** @type {HTMLElement} */ (document.getElementById('spreadsheet-settings-status'));
  const reload = /** @type {HTMLButtonElement} */ (document.getElementById('reload-spreadsheet'));
  const create = /** @type {HTMLButtonElement} */ (document.getElementById('create-spreadsheet'));
  const save = /** @type {HTMLButtonElement} */ (form.querySelector('[type="submit"]'));
  const link = /** @type {HTMLAnchorElement} */ (document.getElementById('open-spreadsheet-link'));
  /** @param {string} key */
  const t = (key) => PortalI18n.t(key, document.documentElement.lang);
  let savedId = id.value;
  let uncertain = false;
  /** Point the link at a saved or just-created file; hide it when there is none. @param {string} spreadsheetId */
  function showLink(spreadsheetId) {
    const valid = /^[\w-]+$/.test(spreadsheetId);
    link.hidden = !valid;
    if (valid) link.href = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit';
    else link.removeAttribute('href');
  }
  // The server renders the saved source's URL; the ID field may hold an unsaved draft.
  if (link.dataset.url) link.href = link.dataset.url;
  link.hidden = !link.dataset.url;
  function updateControls() {
    create.disabled = uncertain || Boolean(savedId.trim() || id.value.trim());
    save.disabled = uncertain;
    id.readOnly = name.readOnly = uncertain;
  }
  updateControls();
  const saveSource = PortalSave.createSaver({
    status, t, setBusy: (busy) => { fields.disabled = busy; if (!busy) updateControls(); },
  });
  id.addEventListener('input', updateControls);
  reload.addEventListener('click', () => window.location.reload());

  /** @param {boolean} creating */
  function run(creating) {
    if (fields.disabled || uncertain || (creating && create.disabled)) return;
    reload.hidden = true;
    // Without a reply, creation may still have happened, so block a second attempt until reload.
    const restore = () => { uncertain = creating; reload.hidden = !creating; };
    if (creating) {
      const unconfirmed = 'Could not confirm creation. Check Google Drive and reload before trying again.';
      saveSource({
        send: (runner) => runner.createPortalSpreadsheet(document.documentElement.lang),
        confirm: (/** @type {SpreadsheetCreationResponse} */ response) => {
          const createdId = response?.spreadsheetId;
          if (typeof createdId !== 'string' || !/^[\w-]+$/.test(createdId)) {
            // A definite failure before anything was created: keep the form usable for a retry.
            if (response && !response.ok && response.notCreated === true) return PortalI18n.translate(String(response.error), document.documentElement.lang);
            return PortalSave.serverError(response);
          }
          id.value = createdId;
          const connected = response.ok || response.connected === true;
          if (connected) savedId = createdId;
          // Show the created file even when its ID could not be saved, so it can be inspected.
          showLink(createdId);
          reload.hidden = !connected;
          return response.ok ? t('Created and connected. Reload the portal to use the new spreadsheet.') : PortalI18n.translate(response.error, document.documentElement.lang);
        },
        restore,
        busyMessage: 'Creating spreadsheet…',
        timeoutMessage: unconfirmed,
        failureMessage: unconfirmed,
        timeoutMs: 60000,
      });
    } else {
      saveSource({
        send: (runner) => runner.saveSpreadsheetSettings({ SPREADSHEET_ID: id.value, SHEET_NAME: name.value }),
        confirm: (/** @type {SpreadsheetSettingsResponse} */ response) => {
          if (!response?.ok) return PortalSave.serverError(response);
          if (typeof response.settings?.SPREADSHEET_ID !== 'string' || typeof response.settings?.SHEET_NAME !== 'string') return false;
          id.value = savedId = response.settings.SPREADSHEET_ID;
          showLink(savedId);
          name.value = response.settings.SHEET_NAME;
          reload.hidden = false;
          return t('Saved. Reload the portal to use this source.');
        },
        restore,
        failureMessage: 'Could not save. Your input has been kept. Please try again.',
      });
    }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); run(false); });
  create.addEventListener('click', () => run(true));
})();
