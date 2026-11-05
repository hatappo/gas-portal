/**
 * @typedef {{id: string, name: string, url: string, description?: string, tags?: string[], icon?: string}} CatalogEntry
 * @typedef {{name: string, url: string, description: string, icon?: string}} ChildLink
 * @typedef {{id: string, name: string, url: string, description: string, tags: string[], children: ChildLink[], icon?: string}} Tool
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

/** Rules shared with the browser, so both sides agree on which rows are valid. @param {unknown} value */
function isValidLinkUrl_(value) {
  return PortalCatalogRules.isValidLinkUrl(value);
}

/** @param {unknown} value */
function isValidIcon_(value) {
  return PortalCatalogRules.isValidIcon(value);
}
