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
  let generation = 0;
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
  id.addEventListener('input', updateControls);
  reload.addEventListener('click', () => window.location.reload());

  /** @param {boolean} creating */
  function run(creating) {
    if (fields.disabled || uncertain || (creating && create.disabled)) return;
    const current = ++generation;
    fields.disabled = true;
    reload.hidden = true;
    status.textContent = t(creating ? 'Creating spreadsheet…' : 'Saving…');
    status.setAttribute('aria-busy', 'true');
    const finish = () => { fields.disabled = false; status.setAttribute('aria-busy', 'false'); updateControls(); };
    const timeout = window.setTimeout(() => {
      if (current !== generation) return;
      generation++;
      uncertain = creating;
      reload.hidden = !creating;
      finish();
      status.textContent = t(creating ? 'Could not confirm creation. Check Google Drive and reload before trying again.' : 'Could not confirm the save. Reload the page to check.');
    }, creating ? 60000 : 15000);
    const failure = () => {
      window.clearTimeout(timeout);
      if (current !== generation) return;
      uncertain = creating;
      reload.hidden = !creating;
      finish();
      status.textContent = t(creating ? 'Could not confirm creation. Check Google Drive and reload before trying again.' : 'Could not save. Your input has been kept. Please try again.');
    };
    try {
      const runner = google.script.run.withFailureHandler(failure);
      if (creating) {
        runner.withSuccessHandler((/** @type {SpreadsheetCreationResponse} */ response) => {
          if (current !== generation) return;
          const createdId = response?.spreadsheetId;
          if (typeof createdId !== 'string' || !/^[\w-]+$/.test(createdId)) {
            failure();
            if (response && !response.ok && typeof response.error === 'string') status.textContent = PortalI18n.translate(response.error, document.documentElement.lang);
            return;
          }
          window.clearTimeout(timeout);
          id.value = createdId;
          const connected = response.ok || response.connected === true;
          if (connected) savedId = createdId;
          // Show the created file even when its ID could not be saved, so it can be inspected.
          showLink(createdId);
          reload.hidden = !connected;
          finish();
          status.textContent = response.ok ? t('Created and connected. Reload the portal to use the new spreadsheet.') : PortalI18n.translate(response.error, document.documentElement.lang);
        }).createPortalSpreadsheet(document.documentElement.lang);
      } else {
        runner.withSuccessHandler((/** @type {SpreadsheetSettingsResponse} */ response) => {
          if (current !== generation) return;
          if (!response?.ok || typeof response.settings?.SPREADSHEET_ID !== 'string' || typeof response.settings?.SHEET_NAME !== 'string') {
            failure();
            if (response && !response.ok && typeof response.error === 'string') status.textContent = PortalI18n.translate(response.error, document.documentElement.lang);
            return;
          }
          window.clearTimeout(timeout);
          id.value = savedId = response.settings.SPREADSHEET_ID;
          showLink(savedId);
          name.value = response.settings.SHEET_NAME;
          finish();
          reload.hidden = false;
          status.textContent = t('Saved. Reload the portal to use this source.');
        }).saveSpreadsheetSettings({ SPREADSHEET_ID: id.value, SHEET_NAME: name.value });
      }
    } catch { failure(); }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); run(false); });
  create.addEventListener('click', () => run(true));
})();
