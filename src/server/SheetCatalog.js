/** Validate the configured source before using the API or cache. */
function getSheetSource_() {
  let properties = PropertiesService.getUserProperties().getProperties();
  // doGet has already initialized these fields; avoid repeated initialization work on warm reads.
  if (!Object.prototype.hasOwnProperty.call(properties, 'SPREADSHEET_ID') || !Object.prototype.hasOwnProperty.call(properties, 'SHEET_NAME')) {
    properties = getPortalUserProperties_();
  }
  const id = normalizeSpreadsheetId_(properties.SPREADSHEET_ID);
  const name = (properties.SHEET_NAME || '').trim();
  if (!/^[\w-]+$/.test(id)) throw new Error('SPREADSHEET_NOT_CONFIGURED');
  return { id, name };
}

/** Read named sheets directly; resolve the first sheet from metadata when no name is configured.
 * @param {{id: string, name: string}} [source] @returns {Catalog}
 */
function readSheetCatalog_(source = getSheetSource_()) {
  if (typeof Sheets === 'undefined' || !Sheets?.Spreadsheets?.Values) throw new Error('SHEETS_SERVICE_DISABLED');
  const { id } = source;
  let name = source.name;
  if (!name) {
    const spreadsheet = Sheets.Spreadsheets.get(id, { fields: 'sheets(properties(title,index))' });
    const first = spreadsheet.sheets?.slice().sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0))[0];
    name = first?.properties?.title || '';
    if (!name) throw new Error('SHEET_NOT_FOUND');
  }
  // Always quote sheet names to handle apostrophes and named-range collisions.
  const range = "'" + name.replace(/'/g, "''") + "'";
  let response;
  let missingSheet = false;
  try {
    response = Sheets.Spreadsheets.Values.get(id, range, { valueRenderOption: 'FORMATTED_VALUE' });
  } catch (error) {
    let spreadsheet;
    try { spreadsheet = Sheets.Spreadsheets.get(id, { fields: 'sheets(properties(title))' }); }
    catch { throw error; }
    if (spreadsheet.sheets?.some((sheet) => sheet.properties?.title === name)) throw error;
    missingSheet = true;
  }
  if (missingSheet) throw new Error('SHEET_NOT_FOUND');
  return parseSheetCatalog_(response?.values || []);
}

/** Cache only validated catalog fields, never unused sheet columns or API errors.
 * @param {boolean} forceRefresh
 * @returns {Catalog & {cache: {hit: boolean, fetchedAt: number}}}
 */
function readCachedSheetCatalog_(forceRefresh) {
  const source = getSheetSource_();
  const ttl = normalizeCatalogCacheTtl_(PropertiesService.getUserProperties().getProperty('CATALOG_CACHE_SECONDS'));
  /** @type {GoogleAppsScript.Cache.Cache | null} */
  let cache = null;
  let key = '';
  try {
    // Version the key whenever cached catalog semantics change. Include the source, sharing one entry across duration choices.
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([source.id, source.name]), Utilities.Charset.UTF_8);
    key = 'catalog-v5:' + digest.map((byte) => (byte & 255).toString(16).padStart(2, '0')).join('');
    cache = CacheService.getUserCache();
  } catch { /* Cache availability must never prevent a live read. */ }

  const cached = () => {
    if (!cache || ttl === 0) return null;
    try {
      const text = cache.get(key);
      if (!text) return null;
      const value = JSON.parse(text);
      const age = Date.now() - value.fetchedAt;
      if (!Array.isArray(value.tools) || !Array.isArray(value.issues) || !Number.isFinite(value.fetchedAt) || age < 0 || age >= ttl * 1000) return null;
      return { tools: value.tools, issues: value.issues, cache: { hit: true, fetchedAt: value.fetchedAt } };
    } catch { return null; }
  };
  /** @param {boolean} writeCache */
  const fresh = (writeCache) => {
    const catalog = readSheetCatalog_(source);
    const fetchedAt = Date.now();
    if (writeCache && cache && ttl > 0) {
      try {
        const text = JSON.stringify({ ...catalog, fetchedAt });
        if (Utilities.newBlob(text).getBytes().length <= 100000) cache.put(key, text, ttl);
      } catch { /* Return fresh results even when storage fails or exceeds the cache limit. */ }
    }
    return { ...catalog, cache: { hit: false, fetchedAt } };
  };
  if (!cache) return fresh(false);
  if (!forceRefresh) {
    const hit = cached();
    if (hit) return hit;
  }
  // Serialize cache fills and forced refreshes so an earlier read cannot overwrite newer data.
  const lock = LockService.getUserLock();
  try { lock.waitLock(10000); }
  catch { return fresh(false); }
  try {
    if (!forceRefresh) {
      const hit = cached();
      if (hit) return hit;
    }
    try { cache.remove(key); } catch { /* A forced read still bypasses the cache. */ }
    return fresh(true);
  } finally { lock.releaseLock(); }
}

/** Use the first row as headers and map TSV-compatible columns into the catalog. @param {unknown[][]} rows @returns {Catalog} */
function parseSheetCatalog_(rows) {
  const headers = (rows[0] || []).map((value) => String(value ?? '').trim());
  const named = headers.filter(Boolean);
  if (new Set(named).size !== named.length || !['id', 'name', 'url'].every((name) => headers.includes(name))) {
    throw new Error('INVALID_SHEET_HEADERS');
  }
  if (!headers.includes('relatedLinks') && headers.some((name) => /^relatedLink[1-9]\d*(Label|Url)$/.test(name))) {
    throw new Error('LEGACY_RELATED_HEADERS');
  }
  /** @type {CatalogEntry[]} */
  const entries = [];
  /** @type {number[]} */
  const sourceRows = [];
  rows.slice(1).forEach((row, index) => {
    // Handle omitted trailing cells and blank spreadsheet rows.
    if (row.every((cell, column) => headers[column] === 'hidden' || String(cell ?? '').trim() === '')) return;
    /** @param {string} name */
    const cell = (name) => String(row[headers.indexOf(name)] ?? '');
    // Exclude hidden rows before validation, duplicate detection, and serialization.
    if (cell('hidden').trim().toUpperCase() === 'TRUE') return;
    entries.push({
      id: cell('id'), name: cell('name'), url: cell('url'), description: cell('description'),
      icon: cell('icon'),
      tags: cell('tags').split(/[,、\n\r]+/),
      relatedLinks: cell('relatedLinks').split(/\r\n?|\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        // Split URL and label at the first whitespace; preserve spaces within labels.
        const match = /^(\S+)[ \t]+(.+)$/.exec(line);
        return match ? { url: match[1], label: match[2].trim() } : { url: line, label: '' };
      }),
    });
    sourceRows.push(index + 2);
  });
  const catalog = parseCatalog_(entries);
  catalog.issues.forEach((issue) => {
    issue.row = sourceRows[issue.row - 1];
    if (issue.message.startsWith('relatedLinks')) {
      issue.message = PortalI18n.t("Each relatedLinks line must contain a URL, a space, and a label.");
    }
  });
  return catalog;
}
