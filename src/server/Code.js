/** @returns {GoogleAppsScript.HTML.HtmlOutput} */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  const portal = getPortalContent_(getPortalUserProperties_());
  template.portal = portal;
  template.theme = getPortalTheme_();
  // Skeleton palettes support both schemes; CSS follows the device for auto.
  // The value is allowlisted by getPortalTheme_, so it is safe to print unescaped.
  template.themeAttribute = PortalThemes.attributes(template.theme);
  template.initialCatalogJson = serializeCatalog_(getCatalog());
  template.projectUrl = 'https://script.google.com/home/projects/' + encodeURIComponent(ScriptApp.getScriptId()) + '/edit';
  return template.evaluate()
    .setTitle(portal.name)
    .setFaviconUrl(getPortalFaviconUrl_(template.theme, portal.icon))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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

/** Public static assets contain no user settings beyond the selected theme and letter.
 * Auto uses the light default because doGet cannot read the browser's color preference.
 * @param {string} theme @param {string} icon
 */
function getPortalFaviconUrl_(theme, icon) {
  const color = PortalThemes.resolve(theme).palette;
  const normalized = normalizePortalIcon_(icon);
  const supported = /^[A-Z\u3041-\u3096\u309d-\u309e\u30a1-\u30fa\u30fc-\u30fe]$/.test(normalized);
  if (!supported) return 'https://hatappo.github.io/gas-portal/favicons/fallback.png';
  const filename = /^[A-Z]$/.test(normalized) ? normalized : 'u' + normalized.charCodeAt(0).toString(16);
  return 'https://hatappo.github.io/gas-portal/favicons/' + color + '/' + filename + '.png';
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
      SPREADSHEET_NOT_CONFIGURED: "Set a spreadsheet ID or Google Sheets URL in Settings.",
      SHEETS_SERVICE_DISABLED: "Enable the Google Sheets API in GAS Services.",
      SHEET_NOT_FOUND: "The specified sheet does not exist. Check that SHEET_NAME matches its name.",
      INVALID_SHEET_HEADERS: "The first row must contain id, name, and url columns. Also check for duplicate column names.",
    };
    const code = error instanceof Error && Object.prototype.hasOwnProperty.call(messages, error.message) ? error.message : 'READ_FAILED';
    console.error('CATALOG_FAILED', code);
    return { ok: false, error: messages[code] || "Could not load the list. Check spreadsheet sharing, authorization, and Sheets API settings, then reload the page." };
  }
}

/** Escape JSON for a non-executable script element; never embed raw spreadsheet text.
 * @param {unknown} catalog @returns {string}
 */
function serializeCatalog_(catalog) {
  return JSON.stringify(catalog).replace(/[<>&\u2028\u2029]/g, (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}
