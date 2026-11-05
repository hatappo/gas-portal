// Shared by the GAS server and browser bundle. Decides which link schemes may be opened.
globalThis.PortalUrlSchemes = (() => {
  // These run script in the portal page itself, so settings can never unblock them.
  const fixed = ['javascript', 'vbscript'];
  // Blocked by default. Each one can be unblocked in Settings. The ms-msdt, search-ms, and ms-officecmd
  // schemes start Windows programs and have been used to deliver attacks through links.
  const optional = ['data', 'file', 'blob', 'about', 'filesystem', 'ms-msdt', 'search-ms', 'ms-officecmd'];

  /** Keep known optional schemes only, in their canonical order.
   * @param {unknown} value A comma-separated string or an array.
   * @returns {string[]}
   */
  function normalizeUnblocked(value) {
    const items = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
    const selected = new Set(items.filter((item) => typeof item === 'string').map((item) => item.trim().toLowerCase()));
    return optional.filter((scheme) => selected.has(scheme));
  }

  /** @param {string} url @returns {string} The lowercase scheme, or an empty string. */
  function schemeOf(url) {
    const match = /^([a-z][a-z\d+.-]*):/i.exec(url.trim());
    return match ? match[1].toLowerCase() : '';
  }

  /** @param {string} url @param {readonly string[]} unblocked */
  function isBlocked(url, unblocked) {
    const scheme = schemeOf(url);
    return !scheme || fixed.includes(scheme) || (optional.includes(scheme) && !unblocked.includes(scheme));
  }

  return { optional, normalizeUnblocked, schemeOf, isBlocked };
})();
