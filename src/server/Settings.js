/** Read the current user's language, falling back to English when browser language is unavailable. */
/** @param {unknown} [browserLanguage] */
function getPortalLanguage_(browserLanguage) {
  try { return PortalI18n.resolve(PropertiesService.getUserProperties().getProperty('PORTAL_LANGUAGE'), [PortalI18n.normalize(browserLanguage)]); }
  catch { return 'en'; }
}

/** @param {unknown} language @returns {language is 'auto' | 'ja' | 'en'} */
function isPortalLanguagePreference_(language) {
  return language === 'ja' || language === 'en' || language === 'auto';
}

/** @param {unknown} language @returns {{ok: true, language: string} | {ok: false}} */
function saveLanguage(language) {
  if (!isPortalLanguagePreference_(language)) return { ok: false };
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
  // Unavailable palette names fall back to the default without rewriting storage.
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

/** Compose combining marks and uppercase ASCII; preserve other single-character icons. @param {string} icon */
function normalizePortalIcon_(icon) {
  return icon.normalize('NFC').replace(/[a-z]/g, (letter) => letter.toUpperCase());
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

/** Fill missing settings in the executing user's store without overwriting saved values. */
function initializeUserProperties_() {
  const store = PropertiesService.getUserProperties();
  const current = store.getProperties();
  const defaults = {
    ...getPortalPropertyDefaults_(),
    PORTAL_THEME: 'auto', PORTAL_LANGUAGE: 'auto', CATALOG_CACHE_SECONDS: String(PortalCacheDurations.catalog.defaultSeconds), ACTIONS_CACHE_SECONDS: String(PortalCacheDurations.actions.defaultSeconds),
    CALENDAR_SETTINGS: JSON.stringify(PortalCalendar.defaults()),
    SPREADSHEET_ID: '', SHEET_NAME: '', UNBLOCKED_URL_SCHEMES: '',
  };
  const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => !Object.prototype.hasOwnProperty.call(current, key)));
  if (Object.keys(missing).length) store.setProperties(missing, false);
}

function getPortalUserProperties_() {
  return withPortalPropertiesLock_(() => {
    initializeUserProperties_();
    return PropertiesService.getUserProperties().getProperties();
  });
}

/** @param {unknown} input @param {string} [language] @returns {Record<string, string>} */
function validatePortalSettings_(input, language = 'en') {
  const defaults = getPortalPropertyDefaults_(language);
  /** @type {Record<string, number>} */
  const limits = { PORTAL_NAME: 80, PORTAL_ICON: 1, PORTAL_HEADLINE: 160, PORTAL_DESCRIPTION: 500 };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error("Invalid display settings.");
  const values = /** @type {Record<string, unknown>} */ (input);
  if (Object.keys(values).length !== Object.keys(defaults).length || Object.keys(values).some((key) => !Object.prototype.hasOwnProperty.call(defaults, key))) {
    throw new Error("Only the four display settings can be changed.");
  }
  /** @type {Record<string, string>} */
  const settings = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = values[key];
    if (typeof value !== 'string') throw new Error("Enter display settings as text.");
    const trimmed = key === 'PORTAL_ICON' ? normalizePortalIcon_(value.trim()) : value.trim();
    if (Array.from(trimmed).length > limits[key]) throw new Error(PortalI18n.t('{key} must contain at most {limit} characters.', 'en', { key, limit: limits[key] }));
    settings[key] = key === 'PORTAL_HEADLINE' || key === 'PORTAL_DESCRIPTION' ? trimmed : trimmed || fallback;
  }
  return settings;
}

/** @param {unknown} input @param {unknown} [browserLanguage] */
function savePortalSettings(input, browserLanguage) {
  let settings;
  try { settings = validatePortalSettings_(input, getPortalLanguage_(browserLanguage)); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Check your input." }; }
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperties(settings, false));
    return { ok: true, settings };
  } catch {
    console.error('PORTAL_SETTINGS_SAVE_FAILED');
    return { ok: false, error: "Could not save. Please try again." };
  }
}

/** @param {unknown} value */
function normalizeCatalogCacheTtl_(value) {
  return PortalCacheDurations.normalize('catalog', value);
}

/** Persist only the supported cache duration choices. @param {unknown} seconds */
function saveCatalogCacheTtl(seconds) {
  if (!PortalCacheDurations.isChoice('catalog', seconds)) return { ok: false };
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
  return PortalCacheDurations.normalize('actions', value);
}

/** @param {unknown} seconds */
function saveActionsCacheTtl(seconds) {
  if (!PortalCacheDurations.isChoice('actions', seconds)) return { ok: false };
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperty('ACTIONS_CACHE_SECONDS', String(seconds)));
    return { ok: true, seconds };
  } catch {
    console.error('ACTIONS_CACHE_SETTINGS_SAVE_FAILED');
    return { ok: false };
  }
}

/** Accept a list of distinct optional schemes only; return it in canonical order, or null.
 * @param {unknown} schemes @returns {string[] | null}
 */
function validateUnblockedUrlSchemes_(schemes) {
  if (!Array.isArray(schemes) || schemes.some((scheme) => typeof scheme !== 'string' || !PortalUrlSchemes.optional.includes(scheme)) ||
      new Set(schemes).size !== schemes.length) return null;
  return PortalUrlSchemes.normalizeUnblocked(schemes);
}

/** Save which default-blocked URL schemes may be opened. Script schemes are never accepted.
 * @param {unknown} schemes
 * @returns {{ok: true, schemes: string[]} | {ok: false}}
 */
function saveUnblockedUrlSchemes(schemes) {
  const normalized = validateUnblockedUrlSchemes_(schemes);
  if (!normalized) return { ok: false };
  try {
    withPortalPropertiesLock_(() => PropertiesService.getUserProperties().setProperty('UNBLOCKED_URL_SCHEMES', normalized.join(',')));
    return { ok: true, schemes: normalized };
  } catch {
    console.error('URL_SCHEME_SETTINGS_SAVE_FAILED');
    return { ok: false };
  }
}
