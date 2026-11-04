/** @returns {GoogleAppsScript.HTML.HtmlOutput} */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  const scriptProperties = PropertiesService.getScriptProperties().getProperties();
  const portal = getPortalContent_(getPortalUserProperties_(scriptProperties), scriptProperties);
  template.portal = portal;
  template.theme = getPortalTheme_();
  template.projectUrl = 'https://script.google.com/home/projects/' + encodeURIComponent(ScriptApp.getScriptId()) + '/edit';
  return template.evaluate()
    .setTitle(portal.name)
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
  return typeof theme === 'string' && ['auto', 'tsuyukusa', 'sakura', 'wakatake', 'yamabuki', 'ginnezu', 'tetsukon', 'sumi', 'kuri', 'fukamidori', 'daidai'].includes(theme);
}

/** Settings belong to the executing user; this app is personal and runs as its deployer. */
function getPortalTheme_() {
  const theme = PropertiesService.getUserProperties().getProperty('PORTAL_THEME');
  // Map the legacy theme when reading, without rewriting storage.
  if (theme === 'shikon') return 'kuri';
  return isPortalTheme_(theme) ? theme : 'auto';
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

/** Use defaults for missing or blank values; never interpret content as HTML.
 * @param {Record<string, string>} properties
 * @param {Record<string, string>} scriptProperties
 */
function getPortalContent_(properties, scriptProperties = {}) {
  const languagePreference = PortalI18n.preference(properties.PORTAL_LANGUAGE);
  const language = PortalI18n.resolve(languagePreference);
  const defaults = getPortalPropertyDefaults_(language);
  const original = getPortalPropertyDefaults_('ja');
  /** @param {'PORTAL_HEADLINE' | 'PORTAL_DESCRIPTION'} key */
  const content = (key) => {
    const value = properties[key]?.trim();
    return !value || value === original[key] || value === getPortalPropertyDefaults_('en')[key] ? defaults[key] : value;
  };
  const name = properties.PORTAL_NAME?.trim() || defaults.PORTAL_NAME;
  const split = name.search(/\s/);
  const spreadsheetId = scriptProperties.SPREADSHEET_ID?.trim() || '';
  return {
    name,
    language,
    languagePreference,
    defaultsJson: JSON.stringify(defaults),
    icon: Array.from(properties.PORTAL_ICON?.trim() || defaults.PORTAL_ICON)[0],
    brandLead: split < 0 ? name : name.slice(0, split),
    brandRest: split < 0 ? '' : name.slice(split),
    headline: content('PORTAL_HEADLINE'),
    description: content('PORTAL_DESCRIPTION'),
    spreadsheetUrl: /^[\w-]+$/.test(spreadsheetId) ? 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit' : '',
  };
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

/** Serialize settings updates, migration, and initialization. @template T @param {() => T} action @returns {T} */
function withPortalPropertiesLock_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return action(); } finally { lock.releaseLock(); }
}

/** @param {GoogleAppsScript.Properties.Properties} store
 * @param {Record<string, string>} defaults
 * @param {Record<string, string>} legacy
 */
function initializePropertyStore_(store, defaults, legacy = {}) {
  const current = store.getProperties();
  /** @type {Record<string, string>} */
  const missing = {};
  const existing = [];
  const migrated = [];
  for (const [key, value] of Object.entries(defaults)) {
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      existing.push(key);
    } else if (Object.prototype.hasOwnProperty.call(legacy, key)) {
      missing[key] = legacy[key];
      migrated.push(key);
    } else {
      missing[key] = value;
    }
  }
  if (Object.keys(missing).length) store.setProperties(missing, false);
  return { created: Object.keys(missing), existing, migrated };
}

/** @param {Record<string, string>} scriptProperties */
function initializeUserProperties_(scriptProperties) {
  const defaults = getPortalPropertyDefaults_();
  // Migrate only the four display fields, excluding connection settings and unknown keys.
  const legacy = Object.fromEntries(Object.entries(scriptProperties).filter(([key]) => Object.prototype.hasOwnProperty.call(defaults, key)));
  return initializePropertyStore_(PropertiesService.getUserProperties(), { ...defaults, PORTAL_THEME: 'auto', PORTAL_LANGUAGE: 'auto' }, legacy);
}

/** @param {Record<string, string>} scriptProperties */
function getPortalUserProperties_(scriptProperties) {
  return withPortalPropertiesLock_(() => {
    initializeUserProperties_(scriptProperties);
    return PropertiesService.getUserProperties().getProperties();
  });
}

/** Run in the GAS editor. Preserve existing keys, including empty values, and never return their values. */
function initializeProperties() {
  return withPortalPropertiesLock_(() => {
    const scriptStore = PropertiesService.getScriptProperties();
    const script = initializePropertyStore_(scriptStore, {
      SPREADSHEET_ID: 'EXAMPLE_SPREADSHEET_ID', SHEET_NAME: PortalI18n.t("Tools"),
    });
    const user = initializeUserProperties_(scriptStore.getProperties());
    return { script, user };
  });
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
    const trimmed = value.trim();
    if (Array.from(trimmed).length > limits[key]) throw new Error(PortalI18n.t('{key} must contain at most {limit} characters.', 'ja', { key, limit: limits[key] }));
    settings[key] = trimmed || fallback;
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

/** Preserve theme and connection settings; save defaults explicitly to prevent remigration. */
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
 * @returns {({ok: true} & Catalog) | {ok: false, error: string}}
 */
function getCatalog() {
  try {
    return { ok: true, ...readSheetCatalog_() };
  } catch (error) {
    /** @type {Record<string, string>} */
    const messages = {
      SPREADSHEET_NOT_CONFIGURED: PortalI18n.t("Set the spreadsheet ID in the SPREADSHEET_ID Script Property."),
      SHEET_NAME_NOT_CONFIGURED: PortalI18n.t("Set the sheet name in the SHEET_NAME Script Property."),
      SHEETS_SERVICE_DISABLED: PortalI18n.t("Enable the Google Sheets API in GAS Services."),
      SHEET_NOT_FOUND: PortalI18n.t("The specified sheet does not exist. Check that SHEET_NAME matches its name."),
      INVALID_SHEET_HEADERS: PortalI18n.t("The first row must contain id, name, and url columns. Also check for duplicate column names."),
      LEGACY_RELATED_HEADERS: PortalI18n.t("Combine related links in the relatedLinks column, with one URL, a space, and a label per line."),
    };
    const code = error instanceof Error && Object.prototype.hasOwnProperty.call(messages, error.message) ? error.message : 'READ_FAILED';
    console.error('CATALOG_FAILED', code);
    return { ok: false, error: messages[code] || PortalI18n.t("Could not load the list. Check spreadsheet sharing, authorization, and Sheets API settings, then reload the page.") };
  }
}
