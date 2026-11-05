/**
 * @typedef {{id: string, name: string, url: string, description?: string, tags?: string[], icon?: string}} CatalogEntry
 * @typedef {{name: string, url: string, description: string, icon?: string}} ChildLink
 * @typedef {{id: string, name: string, url: string, description: string, category: string, tags: string[], children: ChildLink[], icon?: string}} Tool
 * @typedef {{row: number, message: string}} CatalogIssue row is the one-based array position.
 * @typedef {{tools: Tool[], issues: CatalogIssue[]}} Catalog
 */

// Add automatic tag rules here. Match host boundaries to reject lookalike domains.
const AUTO_TAG_RULES_ = [
  { pattern: /^https:\/\/script\.google\.com(?::443)?(?:[/?#]|$)/i, tag: 'GAS' },
];

/**
 * Validate catalog entries in sheet row order. The trailing underscore makes a GAS function private.
 * A row with an id is a tool. A row with a blank id is a related link of the nearest tool row above it,
 * so the sheet order is the structure: one level, no references to resolve.
 * Errors stay confined to rows: a related link under a tool row that has errors is excluded with an issue.
 * @param {unknown} entries
 * @returns {Catalog}
 */
function parseCatalog_(entries) {
  if (!Array.isArray(entries)) throw new Error('INVALID_CATALOG');
  /** @type {Map<string, number>} */
  const counts = new Map();
  entries.forEach((entry) => {
    const id = text_(entry?.id);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  /** @type {Tool[]} */
  const tools = [];
  /** @type {CatalogIssue[]} */
  const issues = [];
  /** The nearest tool row above: the tool, or null when that row had errors. Undefined before any tool row. */
  /** @type {Tool | null | undefined} */
  let parent;
  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({ row: index + 1, message: PortalI18n.t("Each entry must be an object.") });
      return;
    }
    const id = text_(entry.id);
    const name = text_(entry.name);
    const url = text_(entry.url);
    let message = '';
    if (!id && parent === undefined) {
      message = PortalI18n.t("A row with a blank id needs a tool row above it.");
    } else if (!id && parent === null) {
      message = PortalI18n.t("The parent row has errors.");
    } else if (!name || !url) {
      message = PortalI18n.t(id ? "id, name, and url must be non-empty strings." : "name and url must be non-empty strings.");
    } else if (id && (counts.get(id) || 0) > 1) {
      message = PortalI18n.t("Duplicate id.");
    } else if (!isValidLinkUrl_(entry.url)) {
      message = PortalI18n.t("Enter a valid URL in url.");
    } else if (entry.description !== undefined && typeof entry.description !== 'string') {
      message = PortalI18n.t("description must be a string.");
    } else if (entry.tags !== undefined && (!Array.isArray(entry.tags) ||
        entry.tags.some((/** @type {unknown} */ tag) => typeof tag !== 'string'))) {
      message = PortalI18n.t("tags must be an array of strings.");
    } else if (entry.icon !== undefined && !isValidIcon_(entry.icon)) {
      message = PortalI18n.t("icon must be an image URL starting with https:// or an emoji.");
    }
    if (message) {
      issues.push({ row: index + 1, message });
      // Related links below a broken tool row must not move to an earlier tool.
      if (id) parent = null;
      return;
    }
    const tags = /** @type {string[]} */ (entry.tags || []).map((tag) => tag.trim()).filter(Boolean);
    const autoTags = AUTO_TAG_RULES_.filter((rule) => rule.pattern.test(url)).map((rule) => rule.tag);
    const icon = text_(entry.icon);
    // Omit icon when blank, keeping the response unchanged for rows without one.
    const iconField = icon ? { icon } : {};
    if (!id) {
      const tool = /** @type {Tool} */ (parent);
      tool.children.push({ name, url, description: text_(entry.description), ...iconField });
      // Tag filters treat a tool and its related links as one: merge their tags.
      tool.tags = [...new Set([...tool.tags, ...tags, ...autoTags])];
      return;
    }
    parent = {
      id, name, url, description: text_(entry.description),
      // Retain category for RPC compatibility; the current UI does not use it.
      category: 'その他',
      tags: [...new Set([...tags, ...autoTags])],
      children: [],
      ...iconField,
    };
    tools.push(parent);
  });
  return { tools, issues };
}

/** @param {unknown} value @returns {string} */
function text_(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Check URL syntax only. Whether a scheme may be opened is decided in the browser
 * from the user's settings (see PortalUrlSchemes), so blocked links can still be shown.
 * Web URLs keep strict host validation; other schemes such as vscode:// vary in structure.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidLinkUrl_(value) {
  if (typeof value !== 'string') return false;
  // Reject line breaks and control characters before trimming.
  // eslint-disable-next-line no-control-regex -- Explicitly reject control characters in URLs.
  if (/[\u0000-\u001f\u007f\\<>"`]/.test(value)) return false;
  const url = value.trim();
  if (url.length > 2048 || /\s/.test(url) || /%(?![\da-f]{2})/i.test(url)) return false;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url);
  if (!scheme) return false;
  if (/^https?$/i.test(scheme[1])) return isSafeWebUrl_(url);
  return url.length > scheme[0].length;
}

/**
 * An icon overrides the automatic favicon: an https image URL, or a short text such as an emoji.
 * Emoji sequences (flags, skin tones, ZWJ families) span several code points, so allow up to eight.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidIcon_(value) {
  if (typeof value !== 'string') return false;
  const icon = value.trim();
  if (!icon) return true;
  if (/^[a-z][a-z\d+.-]*:/i.test(icon)) return /^https:/i.test(icon) && isValidLinkUrl_(icon);
  // eslint-disable-next-line no-control-regex -- Reject control characters in icon text.
  return !/[\s\u0000-\u001f\u007f]/.test(icon) && Array.from(icon).length <= 8;
}

/**
 * GAS V8 lacks WHATWG URL, so validate a restricted set of URL formats.
 * Allow ASCII hosts (Punycode for international domains), optional ports, paths, and queries.
 * Credentials are rejected because the host pattern excludes "@".
 * @param {string} url A trimmed URL without control characters or whitespace.
 * @returns {boolean}
 */
function isSafeWebUrl_(url) {
  const match = /^https?:\/\/([a-z\d.-]+)(?::(\d{1,5}))?(?:[/?#][^\s]*)?$/i.exec(url);
  if (!match) return false;
  const host = match[1];
  if (host.length > 253 || host.split('.').some((label) =>
    label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))) return false;
  return !match[2] || (Number(match[2]) >= 1 && Number(match[2]) <= 65535);
}
