/**
 * @typedef {{label: string, url: string}} RelatedLink
 * @typedef {{id: string, name: string, url: string, description?: string, tags?: string[], relatedLinks?: RelatedLink[], scope?: 'internal' | 'external' | '社内' | '社外'}} CatalogEntry
 * @typedef {{id: string, name: string, url: string, description: string, category: string, tags: string[], relatedLinks: RelatedLink[], scope: 'internal' | 'external'}} Tool
 * @typedef {{row: number, message: string}} CatalogIssue row is the one-based array position.
 * @typedef {{tools: Tool[], issues: CatalogIssue[]}} Catalog
 */

// Add automatic tag rules here. Match host boundaries to reject lookalike domains.
const AUTO_TAG_RULES_ = [
  { pattern: /^https:\/\/script\.google\.com(?::443)?(?:[/?#]|$)/i, tag: 'GAS' },
];

/**
 * Validate catalog entries. The trailing underscore makes a GAS function private.
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
  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({ row: index + 1, message: PortalI18n.t("Each entry must be an object.") });
      return;
    }
    const id = text_(entry.id);
    const name = text_(entry.name);
    const url = text_(entry.url);
    const rawScope = text_(entry.scope);
    let message = '';
    if (!id || !name || !url) {
      message = PortalI18n.t("id, name, and url must be non-empty strings.");
    } else if ((counts.get(id) || 0) > 1) {
      message = PortalI18n.t("Duplicate id.");
    } else if (!isSafeHttpsUrl_(entry.url)) {
      message = PortalI18n.t("Enter a valid HTTPS URL in url.");
    } else if ((entry.scope !== undefined && typeof entry.scope !== 'string') ||
        !['', '社内', '社外', 'internal', 'external'].includes(rawScope)) {
      message = PortalI18n.t("scope must be internal or external.");
    } else if (entry.description !== undefined && typeof entry.description !== 'string') {
      message = PortalI18n.t("description must be a string.");
    } else if (entry.tags !== undefined && (!Array.isArray(entry.tags) ||
        entry.tags.some((/** @type {unknown} */ tag) => typeof tag !== 'string'))) {
      message = PortalI18n.t("tags must be an array of strings.");
    } else if (entry.relatedLinks !== undefined && (!Array.isArray(entry.relatedLinks) ||
        entry.relatedLinks.some((/** @type {RelatedLink} */ link) => !link || Array.isArray(link) ||
          !text_(link.label) || !text_(link.url) || !isSafeHttpsUrl_(link.url)))) {
      message = PortalI18n.t("relatedLinks must be an array of objects with a non-empty label and a valid HTTPS url.");
    }
    if (message) {
      issues.push({ row: index + 1, message });
      return;
    }
    const tags = /** @type {string[]} */ (entry.tags || []);
    const autoTags = AUTO_TAG_RULES_.filter((rule) => rule.pattern.test(url)).map((rule) => rule.tag);
    tools.push({
      id, name, url, description: text_(entry.description),
      // Retain category for RPC compatibility; the current UI does not use it.
      category: 'その他',
      tags: [...new Set([...tags.map((tag) => tag.trim()).filter(Boolean), ...autoTags])],
      relatedLinks: (/** @type {RelatedLink[]} */ (entry.relatedLinks || []))
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
      scope: rawScope === '社外' || rawScope === 'external' ? 'external' : 'internal',
    });
  });
  // Sort string IDs independently of locale.
  tools.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { tools, issues };
}

/** @param {unknown} value @returns {string} */
function text_(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * GAS V8 lacks WHATWG URL, so validate a restricted set of URL formats.
 * Allow ASCII hosts (Punycode for international domains), optional ports, paths, and queries.
 * @param {string} value
 * @returns {boolean}
 */
function isSafeHttpsUrl_(value) {
  // Reject line breaks and control characters before trimming.
  // eslint-disable-next-line no-control-regex -- Explicitly reject control characters in URLs.
  if (/[\u0000-\u001f\u007f\\<>"`]/.test(value)) return false;
  const url = value.trim();
  if (/\s/.test(url) || /%(?![\da-f]{2})/i.test(url)) return false;
  const match = /^https:\/\/([a-z\d.-]+)(?::(\d{1,5}))?(?:[/?#][^\s]*)?$/i.exec(url);
  if (!match) return false;
  const host = match[1];
  if (host.length > 253 || host.split('.').some((label) =>
    label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))) return false;
  return !match[2] || (Number(match[2]) >= 1 && Number(match[2]) <= 65535);
}
