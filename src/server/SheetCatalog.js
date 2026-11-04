/** Read the sheet configured in Script Properties, without writes or caching. @returns {Catalog} */
function readSheetCatalog_() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const id = (properties.SPREADSHEET_ID || '').trim();
  const name = (properties.SHEET_NAME || '').trim();
  if (!/^[\w-]+$/.test(id)) throw new Error('SPREADSHEET_NOT_CONFIGURED');
  if (!name) throw new Error('SHEET_NAME_NOT_CONFIGURED');
  if (typeof Sheets === 'undefined' || !Sheets?.Spreadsheets?.Values) throw new Error('SHEETS_SERVICE_DISABLED');
  const spreadsheet = Sheets.Spreadsheets.get(id, { fields: 'sheets(properties(title))' });
  if (!spreadsheet.sheets?.some((sheet) => sheet.properties?.title === name)) throw new Error('SHEET_NOT_FOUND');
  // Always quote sheet names to handle apostrophes and named-range collisions.
  const range = "'" + name.replace(/'/g, "''") + "'";
  const response = Sheets.Spreadsheets.Values.get(id, range, { valueRenderOption: 'FORMATTED_VALUE' });
  return parseSheetCatalog_(response.values || []);
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
    if (row.every((cell) => String(cell ?? '').trim() === '')) return;
    /** @param {string} name */
    const cell = (name) => String(row[headers.indexOf(name)] ?? '');
    entries.push({
      id: cell('id'), name: cell('name'), url: cell('url'), description: cell('description'),
      scope: /** @type {CatalogEntry['scope']} */ (cell('scope')),
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
      issue.message = PortalI18n.t("Each relatedLinks line must contain an HTTPS URL, a space, and a label.");
    }
  });
  return catalog;
}
