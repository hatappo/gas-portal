/**
 * @typedef {{label: string, url: string}} RelatedLink
 * @typedef {{id: string, name: string, url: string, description?: string, tags?: string[], relatedLinks?: RelatedLink[], scope?: 'internal' | 'external' | '社内' | '社外'}} CatalogEntry
 * @typedef {{id: string, name: string, url: string, description: string, category: string, tags: string[], relatedLinks: RelatedLink[], scope: 'internal' | 'external'}} Tool
 * @typedef {{row: number, message: string}} CatalogIssue row は配列内の位置（1 始まり）。
 * @typedef {{tools: Tool[], issues: CatalogIssue[]}} Catalog
 */

// 自動タグの追加はこの配列へ。ホスト名の境界まで照合し、似た別ドメインには付与しない。
const AUTO_TAG_RULES_ = [
  { pattern: /^https:\/\/script\.google\.com(?::443)?(?:[/?#]|$)/i, tag: 'GAS' },
];

/**
 * 同梱したデータを検証する。末尾 _ は GAS の非公開関数。
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
      issues.push({ row: index + 1, message: '登録データはオブジェクトで指定してください。' });
      return;
    }
    const id = text_(entry.id);
    const name = text_(entry.name);
    const url = text_(entry.url);
    const rawScope = text_(entry.scope);
    let message = '';
    if (!id || !name || !url) {
      message = 'id・name・url は空でない文字列で指定してください。';
    } else if ((counts.get(id) || 0) > 1) {
      message = 'id が重複しています。';
    } else if (!isSafeHttpsUrl_(entry.url)) {
      message = 'url に有効な HTTPS の URL を入力してください。';
    } else if ((entry.scope !== undefined && typeof entry.scope !== 'string') ||
        !['', '社内', '社外', 'internal', 'external'].includes(rawScope)) {
      message = 'scope は internal（社内）または external（社外）にしてください。';
    } else if (entry.description !== undefined && typeof entry.description !== 'string') {
      message = 'description は文字列で指定してください。';
    } else if (entry.tags !== undefined && (!Array.isArray(entry.tags) ||
        entry.tags.some((/** @type {unknown} */ tag) => typeof tag !== 'string'))) {
      message = 'tags は文字列の配列で指定してください。';
    } else if (entry.relatedLinks !== undefined && (!Array.isArray(entry.relatedLinks) ||
        entry.relatedLinks.some((/** @type {RelatedLink} */ link) => !link || Array.isArray(link) ||
          !text_(link.label) || !text_(link.url) || !isSafeHttpsUrl_(link.url)))) {
      message = 'relatedLinks は、空でない label と有効な HTTPS の url を持つオブジェクトの配列にしてください。';
    }
    if (message) {
      issues.push({ row: index + 1, message });
      return;
    }
    const tags = /** @type {string[]} */ (entry.tags || []);
    const autoTags = AUTO_TAG_RULES_.filter((rule) => rule.pattern.test(url)).map((rule) => rule.tag);
    tools.push({
      id, name, url, description: text_(entry.description),
      // 旧公開版との RPC 互換性のため category は残す。新 UI では使わない。
      category: 'その他',
      tags: [...new Set([...tags.map((tag) => tag.trim()).filter(Boolean), ...autoTags])],
      relatedLinks: (/** @type {RelatedLink[]} */ (entry.relatedLinks || []))
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
      scope: rawScope === '社外' || rawScope === 'external' ? 'external' : 'internal',
    });
  });
  // ロケールに依存しない ID の文字列順。
  tools.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { tools, issues };
}

/** @param {unknown} value @returns {string} */
function text_(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * GAS V8 には WHATWG URL がないため、許可する形式を限定して検証する。
 * ASCII ホスト名（国際化ドメインは Punycode）、任意ポート、パス・クエリを許可。
 * @param {string} value
 * @returns {boolean}
 */
function isSafeHttpsUrl_(value) {
  // 改行・制御文字は trim 前にも拒否する。
  // eslint-disable-next-line no-control-regex -- URL に制御文字が混ざることを明示的に防ぐ。
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
