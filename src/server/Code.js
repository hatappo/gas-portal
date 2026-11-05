/** @returns {GoogleAppsScript.HTML.HtmlOutput} */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  const portal = getPortalContent_(getPortalUserProperties_());
  template.portal = portal;
  template.theme = getPortalTheme_();
  // Without data-theme, DaisyUI follows the device color scheme, so auto needs no script.
  // The value is allowlisted by getPortalTheme_, so it is safe to print unescaped.
  template.themeAttribute = template.theme === 'auto' ? '' : 'data-theme="' + template.theme + '"';
  template.initialCatalogJson = serializeCatalog_(getCatalog());
  template.projectUrl = 'https://script.google.com/home/projects/' + encodeURIComponent(ScriptApp.getScriptId()) + '/edit';
  return template.evaluate()
    .setTitle(portal.name)
    .setFaviconUrl(getPortalFaviconUrl_(template.theme, portal.icon))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Read the current user's language, falling back to English when browser language is unavailable. */
/** @param {unknown} [browserLanguage] */
function getPortalLanguage_(browserLanguage) {
  try { return PortalI18n.resolve(PropertiesService.getUserProperties().getProperty('PORTAL_LANGUAGE'), [PortalI18n.normalize(browserLanguage)]); }
  catch { return 'en'; }
}

/** @param {unknown} language @returns {{ok: true, language: string} | {ok: false}} */
function saveLanguage(language) {
  if (language !== 'ja' && language !== 'en' && language !== 'auto') return { ok: false };
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperty('PORTAL_LANGUAGE', language));
    return { ok: true, language };
  } catch {
    console.error('LANGUAGE_SAVE_FAILED');
    return { ok: false };
  }
}

/** @param {unknown} theme */
function isPortalTheme_(theme) {
  return PortalThemes.isTheme(theme);
}

/** Settings belong to the executing user; this app is personal and runs as its deployer. */
function getPortalTheme_() {
  const theme = PropertiesService.getUserProperties().getProperty('PORTAL_THEME');
  // Names from before the DaisyUI themes (such as tsuyukusa) fall back to auto, without rewriting storage.
  return isPortalTheme_(theme) ? /** @type {string} */ (theme) : 'auto';
}

/** @param {unknown} theme @returns {{ok: true, theme: string} | {ok: false}} */
function saveTheme(theme) {
  if (!isPortalTheme_(theme)) return { ok: false };
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperty('PORTAL_THEME', /** @type {string} */ (theme)));
    return { ok: true, theme: /** @type {string} */ (theme) };
  } catch {
    console.error('THEME_SAVE_FAILED');
    return { ok: false };
  }
}

/** Use defaults for missing fields; preserve explicitly empty intro text. Never interpret content as HTML.
 * @param {Record<string, string>} properties
 */
function getPortalContent_(properties) {
  const languagePreference = PortalI18n.preference(properties.PORTAL_LANGUAGE);
  const language = PortalI18n.resolve(languagePreference);
  const defaults = getPortalPropertyDefaults_(language);
  const original = getPortalPropertyDefaults_('ja');
  /** @param {'PORTAL_HEADLINE' | 'PORTAL_DESCRIPTION'} key */
  const content = (key) => {
    const value = properties[key]?.trim();
    return value === undefined || value === original[key] || value === getPortalPropertyDefaults_('en')[key] ? defaults[key] : value;
  };
  const name = properties.PORTAL_NAME?.trim() || defaults.PORTAL_NAME;
  const split = name.search(/\s/);
  const spreadsheetId = normalizeSpreadsheetId_(properties.SPREADSHEET_ID);
  return {
    name,
    spreadsheetId: properties.SPREADSHEET_ID || '',
    sheetName: properties.SHEET_NAME || '',
    language,
    languagePreference,
    cacheSeconds: String(normalizeCatalogCacheTtl_(properties.CATALOG_CACHE_SECONDS)),
    actionsCacheSeconds: String(normalizeActionsCacheTtl_(properties.ACTIONS_CACHE_SECONDS)),
    unblockedUrlSchemes: PortalUrlSchemes.normalizeUnblocked(properties.UNBLOCKED_URL_SCHEMES).join(','),
    defaultsJson: JSON.stringify(defaults),
    icon: Array.from(normalizePortalIcon_(properties.PORTAL_ICON?.trim() || defaults.PORTAL_ICON))[0],
    brandLead: split < 0 ? name : name.slice(0, split),
    brandRest: split < 0 ? '' : name.slice(split),
    headline: content('PORTAL_HEADLINE'),
    description: content('PORTAL_DESCRIPTION'),
    spreadsheetUrl: /^[\w-]+$/.test(spreadsheetId) ? 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit' : '',
  };
}

/** Compose combining marks and uppercase ASCII; preserve other single-character icons. @param {string} icon */
function normalizePortalIcon_(icon) {
  return icon.normalize('NFC').replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

/** Public static assets contain no user settings beyond the selected theme and letter.
 * Auto uses the light default because doGet cannot read the browser's color preference.
 * @param {string} theme @param {string} icon
 */
function getPortalFaviconUrl_(theme, icon) {
  const color = theme !== 'auto' && isPortalTheme_(theme) ? theme : PortalThemes.auto.light;
  const normalized = normalizePortalIcon_(icon);
  const supported = /^[A-Z\u3041-\u3096\u309d-\u309e\u30a1-\u30fa\u30fc-\u30fe]$/.test(normalized);
  if (!supported) return 'https://hatappo.github.io/gas-portal/favicons/fallback.png';
  const letter = normalized;
  const filename = /^[A-Z]$/.test(letter) ? letter : 'u' + letter.charCodeAt(0).toString(16);
  return 'https://hatappo.github.io/gas-portal/favicons/' + color + '/' + filename + '.png';
}

/** Supported display properties and their defaults. */
/** @param {string} [language] */
function getPortalPropertyDefaults_(language = 'en') {
  return {
    PORTAL_NAME: 'My Portal',
    PORTAL_HEADLINE: PortalI18n.t("One place to start your workday.", language),
    PORTAL_DESCRIPTION: PortalI18n.t("Keep your work tools, service links, and daily to-dos in one place.", language),
    PORTAL_ICON: 'P',
  };
}

/** Serialize settings updates and initialization. @template T @param {() => T} action @returns {T} */
function withPortalPropertiesLock_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return action(); } finally { lock.releaseLock(); }
}

/** @param {GoogleAppsScript.Properties.Properties} store
 * @param {Record<string, string>} defaults
 */
function initializePropertyStore_(store, defaults) {
  const current = store.getProperties();
  /** @type {Record<string, string>} */
  const missing = {};
  const existing = [];
  for (const [key, value] of Object.entries(defaults)) {
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      existing.push(key);
    } else {
      missing[key] = value;
    }
  }
  if (Object.keys(missing).length) store.setProperties(missing, false);
  return { created: Object.keys(missing), existing, migrated: [] };
}

/** Initialize missing settings only in the executing user's store. */
function initializeUserProperties_() {
  return initializePropertyStore_(PropertiesService.getUserProperties(), {
    ...getPortalPropertyDefaults_(),
    PORTAL_THEME: 'auto', PORTAL_LANGUAGE: 'auto', CATALOG_CACHE_SECONDS: '21600', ACTIONS_CACHE_SECONDS: '300',
    SPREADSHEET_ID: '', SHEET_NAME: '', UNBLOCKED_URL_SCHEMES: '',
  });
}

function getPortalUserProperties_() {
  return withPortalPropertiesLock_(() => {
    initializeUserProperties_();
    return PropertiesService.getUserProperties().getProperties();
  });
}

/** Run in the GAS editor. Preserve existing keys, including empty values, and never return their values. */
function initializeProperties() {
  // Editor-only consent flow. Keep this outside the lock and automatic initialization.
  console.info('PORTAL_AUTHORIZATION_CHECK_STARTED');
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  console.info('PORTAL_AUTHORIZATION_GRANTED');
  return withPortalPropertiesLock_(() => ({
    script: { created: [], existing: [], migrated: [] },
    user: initializeUserProperties_(),
  }));
}

/** Compatibility alias for earlier commands and editor workflows. */
function initializeScriptProperties() {
  const result = initializeProperties();
  return {
    created: [...result.script.created, ...result.user.created],
    existing: [...result.script.existing, ...result.user.existing],
  };
}

/** @param {unknown} input @param {string} [language] @returns {Record<string, string>} */
function validatePortalSettings_(input, language = 'en') {
  const defaults = getPortalPropertyDefaults_(language);
  /** @type {Record<string, number>} */
  const limits = { PORTAL_NAME: 80, PORTAL_ICON: 1, PORTAL_HEADLINE: 160, PORTAL_DESCRIPTION: 500 };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(PortalI18n.t("Invalid display settings."));
  const values = /** @type {Record<string, unknown>} */ (input);
  if (Object.keys(values).length !== Object.keys(defaults).length || Object.keys(values).some((key) => !Object.prototype.hasOwnProperty.call(defaults, key))) {
    throw new Error(PortalI18n.t("Only the four display settings can be changed."));
  }
  /** @type {Record<string, string>} */
  const settings = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = values[key];
    if (typeof value !== 'string') throw new Error(PortalI18n.t("Enter display settings as text."));
    const trimmed = key === 'PORTAL_ICON' ? normalizePortalIcon_(value.trim()) : value.trim();
    if (Array.from(trimmed).length > limits[key]) throw new Error(PortalI18n.t('{key} must contain at most {limit} characters.', 'ja', { key, limit: limits[key] }));
    settings[key] = key === 'PORTAL_HEADLINE' || key === 'PORTAL_DESCRIPTION' ? trimmed : trimmed || fallback;
  }
  return settings;
}

/** @param {unknown} input @param {unknown} [browserLanguage] */
function savePortalSettings(input, browserLanguage) {
  let settings;
  try { settings = validatePortalSettings_(input, getPortalLanguage_(browserLanguage)); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : PortalI18n.t("Check your input.") }; }
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperties(settings, false));
    return { ok: true, settings };
  } catch {
    console.error('PORTAL_SETTINGS_SAVE_FAILED');
    return { ok: false, error: PortalI18n.t("Could not save. Please try again.") };
  }
}

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
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(PortalI18n.t("Check your spreadsheet settings."));
  const values = /** @type {Record<string, unknown>} */ (input);
  if (Object.keys(values).length !== 2 || typeof values.SPREADSHEET_ID !== 'string' || typeof values.SHEET_NAME !== 'string') {
    throw new Error(PortalI18n.t("Check your spreadsheet settings."));
  }
  const id = normalizeSpreadsheetId_(values.SPREADSHEET_ID);
  if (values.SPREADSHEET_ID.trim() && !id) throw new Error(PortalI18n.t("Enter a spreadsheet ID or a Google Sheets URL beginning with https://docs.google.com/spreadsheets/."));
  const name = values.SHEET_NAME.trim();
  if (id.length > 256 || name.length > 100) throw new Error(PortalI18n.t("Check your spreadsheet settings."));
  return { SPREADSHEET_ID: id, SHEET_NAME: name };
}

/** Save for the executing user only. Empty values explicitly disconnect the source or select the first sheet. @param {unknown} input */
function saveSpreadsheetSettings(input) {
  let settings;
  try { settings = validateSpreadsheetSettings_(input); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : PortalI18n.t("Check your input.") }; }
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperties(settings, false));
    return { ok: true, settings };
  } catch {
    console.error('SPREADSHEET_SETTINGS_SAVE_FAILED');
    return { ok: false, error: PortalI18n.t("Could not save. Please try again.") };
  }
}

/** Restore display defaults while preserving theme and connection settings. */
function resetPortalSettings() {
  return savePortalSettings(getPortalPropertyDefaults_(getPortalLanguage_()));
}

/** Embed only the approved static files in the template. @param {string} filename */
function include_(filename) {
  if (!['Styles', 'Client'].includes(filename)) throw new Error('INVALID_INCLUDE');
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Public RPC; access is restricted by the web app's MYSELF setting.
 * Read the configured spreadsheet with the deployer's read-only authorization.
 * @param {boolean} [forceRefresh]
 * @returns {({ok: true} & Catalog & {cache: {hit: boolean, fetchedAt: number}}) | {ok: false, error: string}}
 */
function getCatalog(forceRefresh = false) {
  try {
    return { ok: true, ...readCachedSheetCatalog_(forceRefresh === true) };
  } catch (error) {
    /** @type {Record<string, string>} */
    const messages = {
      SPREADSHEET_NOT_CONFIGURED: PortalI18n.t("Set a spreadsheet ID or Google Sheets URL in Settings."),
      SHEETS_SERVICE_DISABLED: PortalI18n.t("Enable the Google Sheets API in GAS Services."),
      SHEET_NOT_FOUND: PortalI18n.t("The specified sheet does not exist. Check that SHEET_NAME matches its name."),
      INVALID_SHEET_HEADERS: PortalI18n.t("The first row must contain id, name, and url columns. Also check for duplicate column names."),
    };
    const code = error instanceof Error && Object.prototype.hasOwnProperty.call(messages, error.message) ? error.message : 'READ_FAILED';
    console.error('CATALOG_FAILED', code);
    return { ok: false, error: messages[code] || PortalI18n.t("Could not load the list. Check spreadsheet sharing, authorization, and Sheets API settings, then reload the page.") };
  }
}


/** @param {unknown} value */
function normalizeCatalogCacheTtl_(value) {
  return ['0', '300', '3600', '21600'].includes(String(value)) ? Number(value) : 21600;
}

/** Persist only the supported cache duration choices. @param {unknown} seconds */
function saveCatalogCacheTtl(seconds) {
  if (typeof seconds !== 'number' || ![0, 300, 3600, 21600].includes(seconds)) return { ok: false };
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperty('CATALOG_CACHE_SECONDS', String(seconds)));
    return { ok: true, seconds };
  } catch {
    console.error('CACHE_SETTINGS_SAVE_FAILED');
    return { ok: false };
  }
}


/** Shared duration for all Action Items providers; kept separate from the catalog. @param {unknown} value */
function normalizeActionsCacheTtl_(value) {
  return ['0', '60', '300', '900', '1800', '3600', '21600'].includes(String(value)) ? Number(value) : 300;
}

/** @param {unknown} seconds */
function saveActionsCacheTtl(seconds) {
  if (typeof seconds !== 'number' || ![0, 60, 300, 900, 1800, 3600, 21600].includes(seconds)) return { ok: false };
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperty('ACTIONS_CACHE_SECONDS', String(seconds)));
    return { ok: true, seconds };
  } catch {
    console.error('ACTIONS_CACHE_SETTINGS_SAVE_FAILED');
    return { ok: false };
  }
}

/** Save which default-blocked URL schemes may be opened. Script schemes are never accepted.
 * @param {unknown} schemes
 * @returns {{ok: true, schemes: string[]} | {ok: false}}
 */
function saveUnblockedUrlSchemes(schemes) {
  if (!Array.isArray(schemes) || schemes.some((scheme) => typeof scheme !== 'string' || !PortalUrlSchemes.optional.includes(scheme)) ||
      new Set(schemes).size !== schemes.length) return { ok: false };
  const normalized = PortalUrlSchemes.normalizeUnblocked(schemes);
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperty('UNBLOCKED_URL_SCHEMES', normalized.join(',')));
    return { ok: true, schemes: normalized };
  } catch {
    console.error('URL_SCHEME_SETTINGS_SAVE_FAILED');
    return { ok: false };
  }
}

/** Escape JSON for a non-executable script element; never embed raw spreadsheet text.
 * @param {unknown} catalog @returns {string}
 */
function serializeCatalog_(catalog) {
  return JSON.stringify(catalog).replace(/[<>&\u2028\u2029]/g, (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
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
        return { ok: false, notCreated: true, error: PortalI18n.t('A spreadsheet ID is already configured. No spreadsheet was created.', language) };
      }
      stage = 'AUTHORIZATION';
      const authorization = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
      if (authorization.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) {
        console.error('SPREADSHEET_CREATION_BLOCKED', 'AUTHORIZATION_REQUIRED');
        return { ok: false, notCreated: true, error: PortalI18n.t('Additional authorization is required. Run initializeProperties in the GAS editor as the deploying account, grant the requested permissions, then reload the portal.', language) };
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
          properties: { sheetId: 0, title: 'Tools', gridProperties: { rowCount: 101, columnCount: columns.length, frozenRowCount: 1 } },
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
      return { ok: false, notCreated: true, error: PortalI18n.t(disabled ? 'Enable the Google Sheets API in GAS Services.' : 'Could not create the spreadsheet. Please try again.', language) };
    }
    const message = !spreadsheetId
      ? 'Could not confirm creation. Check Google Drive and reload before trying again.'
      : connected
        ? 'Spreadsheet created and connected, but table setup failed. Open the created spreadsheet to check it.'
        : 'Spreadsheet created, but its ID could not be saved. Save the ID shown in this form before reloading.';
    return { ok: false, error: PortalI18n.t(message, language), ...(spreadsheetId ? { spreadsheetId, connected } : {}) };
  }
}
