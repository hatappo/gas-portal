/** Accept a raw ID or an editor URL on the exact Google Sheets origin.
 * Published links and other origins are not spreadsheet IDs. @param {unknown} input
 */
function normalizeSpreadsheetId_(input) {
  if (typeof input !== 'string') return '';
  const value = input.trim();
  if (/^[\w-]+$/.test(value)) return value;
  const match = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/(?:edit|view|preview|copy))?\/?(?:[?#][^\s]*)?$/.exec(value);
  return match ? match[1] : '';
}

/** Validate only the two source fields, without broadening the display-settings RPC. @param {unknown} input */
function validateSpreadsheetSettings_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error("Check your spreadsheet settings.");
  const values = /** @type {Record<string, unknown>} */ (input);
  if (Object.keys(values).length !== 2 || typeof values.SPREADSHEET_ID !== 'string' || typeof values.SHEET_NAME !== 'string') {
    throw new Error("Check your spreadsheet settings.");
  }
  const id = normalizeSpreadsheetId_(values.SPREADSHEET_ID);
  if (values.SPREADSHEET_ID.trim() && !id) throw new Error("Enter a spreadsheet ID or a Google Sheets URL beginning with https://docs.google.com/spreadsheets/.");
  const name = values.SHEET_NAME.trim();
  if (id.length > 256 || name.length > 100) throw new Error("Check your spreadsheet settings.");
  return { SPREADSHEET_ID: id, SHEET_NAME: name };
}

/** Save for the executing user only. Empty values explicitly disconnect the source or select the first sheet. @param {unknown} input */
function saveSpreadsheetSettings(input) {
  let settings;
  try { settings = validateSpreadsheetSettings_(input); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Check your input." }; }
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperties(settings, false));
    return { ok: true, settings };
  } catch {
    console.error('SPREADSHEET_SETTINGS_SAVE_FAILED');
    return { ok: false, error: "Could not save. Please try again." };
  }
}

/** Define the new sheet's supported columns, table types, and header notes. @param {string} language */
function portalSpreadsheetColumns_(language) {
  /** @param {string} key */
  const t = (key) => PortalI18n.t(key, language);
  return [
    { name: 'id', type: 'TEXT', width: 160, note: t('Unique text ID; leading zeros are preserved. Leave it blank to make this row a related link of the nearest row above that has an id. Rows appear in sheet order, so sorting the sheet changes which tool a related link belongs to.') },
    { name: 'hidden', type: 'BOOLEAN', width: 100, note: t('Optional. Check TRUE to hide this entry. FALSE or blank keeps it visible. Hidden rows are excluded from search, tags, and counts.') },
    { name: 'tags', type: 'TEXT', width: 200, note: t('Optional. Separate tags with commas or line breaks.') },
    { name: 'icon', type: 'TEXT', width: 120, note: t('Optional. An image URL starting with https:// or an emoji, shown instead of the automatic favicon. Leave blank to detect the favicon automatically.') },
    { name: 'name', type: 'TEXT', width: 220, note: t('Required. Display name shown in the portal.') },
    { name: 'url', type: 'TEXT', width: 320, note: t('Required. Primary URL, such as https:// or vscode://, entered as plain text rather than a file chip.') },
    { name: 'description', type: 'TEXT', width: 320, note: t('Optional. Plain-text description. HTML and Markdown are not interpreted. For a related link, it is shown as a tooltip.') },
  ];
}

/** Create a new source only. The same lock serializes source saves and duplicate create requests.
 * Use Sheets API with drive.file; do not broaden access to all spreadsheets for writing.
 * @param {unknown} [browserLanguage]
 */
function createPortalSpreadsheet(browserLanguage) {
  let spreadsheetId = '';
  let connected = false;
  let stage = 'PRECHECK';
  const language = getPortalLanguage_(browserLanguage);
  try {
    return withPortalPropertiesLock_(() => {
      const store = PropertiesService.getUserProperties();
      if (store.getProperty('SPREADSHEET_ID')?.trim()) {
        return { ok: false, notCreated: true, error: 'A spreadsheet ID is already configured. No spreadsheet was created.' };
      }
      stage = 'AUTHORIZATION';
      const authorization = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
      if (authorization.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) {
        console.error('SPREADSHEET_CREATION_BLOCKED', 'AUTHORIZATION_REQUIRED');
        return { ok: false, notCreated: true, error: 'Additional authorization is required. Run authorizePortal in the GAS editor as the deploying account, grant the requested permissions, then reload the portal.' };
      }
      stage = 'PREPARE_REQUEST';
      const columns = portalSpreadsheetColumns_(language);
      const range = { sheetId: 0, startRowIndex: 0, endRowIndex: 101, startColumnIndex: 0, endColumnIndex: columns.length };
      const name = store.getProperty('PORTAL_NAME')?.trim() || 'My Portal';
      /** @type {GoogleAppsScript.Sheets.Schema.Spreadsheet} */
      const resource = {
        properties: { title: name },
        sheets: [{
          // Create only the defined columns; unused ones do not exist, rather than being hidden.
          properties: { sheetId: 0, title: 'Links', gridProperties: { rowCount: 101, columnCount: columns.length, frozenRowCount: 1 } },
          data: [{
            startRow: 0, startColumn: 0,
            columnMetadata: columns.map((column) => ({ pixelSize: column.width })),
            rowData: [{ values: columns.map((column) => ({
              userEnteredValue: { stringValue: column.name }, note: column.note,
              userEnteredFormat: { textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 22 / 255, green: 51 / 255, blue: 77 / 255 } } }, wrapStrategy: 'WRAP' },
            })) }],
          }],
        }],
      };
      if (typeof Sheets === 'undefined') throw new Error('SHEETS_SERVICE_DISABLED');
      stage = 'CREATE';
      const created = Sheets.Spreadsheets.create(resource);
      stage = 'CREATE_RESPONSE';
      if (!created.spreadsheetId || !/^[\w-]+$/.test(created.spreadsheetId)) throw new Error('INVALID_CREATED_ID');
      spreadsheetId = created.spreadsheetId;
      // Checkpoint before table setup: later failures must not create another spreadsheet on retry.
      stage = 'PROPERTY_SAVE';
      store.setProperty('SPREADSHEET_ID', spreadsheetId);
      connected = true;
      /** @type {GoogleAppsScript.Sheets.Schema.Request[]} */
      const requests = columns.filter((column) => column.type === 'TEXT').map((column) => ({ repeatCell: {
        range: { ...range, startRowIndex: 1, startColumnIndex: columns.indexOf(column), endColumnIndex: columns.indexOf(column) + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat.numberFormat,userEnteredFormat.wrapStrategy',
      } }));
      requests.push({ addTable: { table: {
        name: 'PortalLinks', range,
        // A calm blue header (#71a4d9); table settings own the header fill.
        rowsProperties: { headerColorStyle: { rgbColor: { red: 113 / 255, green: 164 / 255, blue: 217 / 255 } } },
        columnProperties: columns.map((column, columnIndex) => ({
          columnIndex, columnName: column.name, columnType: column.type,
        })),
      } } });
      stage = 'TABLE_SETUP';
      Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheetId);
      // Deliberately leave SHEET_NAME (including absence) and other user settings untouched.
      return { ok: true, spreadsheetId };
    });
  } catch (error) {
    // Preserve the API reason in restricted execution logs, never in the browser response.
    // Do not log request bodies, properties, or authentication tokens.
    console.error('SPREADSHEET_CREATION_FAILED', stage, String(error));
    // Before the create request nothing can exist, so the browser can let the user retry right away.
    if (!spreadsheetId && ['PRECHECK', 'AUTHORIZATION', 'PREPARE_REQUEST'].includes(stage)) {
      const disabled = error instanceof Error && error.message === 'SHEETS_SERVICE_DISABLED';
      return { ok: false, notCreated: true, error: disabled ? 'Enable the Google Sheets API in GAS Services.' : 'Could not create the spreadsheet. Please try again.' };
    }
    const message = !spreadsheetId
      ? 'Could not confirm creation. Check Google Drive and reload before trying again.'
      : connected
        ? 'Spreadsheet created and connected, but table setup failed. Open the created spreadsheet to check it.'
        : 'Spreadsheet created, but its ID could not be saved. Save the ID shown in this form before reloading.';
    return { ok: false, error: message, ...(spreadsheetId ? { spreadsheetId, connected } : {}) };
  }
}
