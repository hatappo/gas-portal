// Official Web Store IDs are added here after publication. The additional ID belongs to the executing user.
globalThis.PortalSidePanel = (() => {
  /** @type {readonly string[]} */
  const officialIds = Object.freeze([]);
  /** @param {unknown} input @returns {string[]} */
  function parseAdditional(input) {
    if (typeof input !== 'string') throw new Error('Enter one extension ID (32 lowercase letters, a–p).');
    const id = input.trim();
    if (!id) return [];
    if (!/^[a-p]{32}$/.test(id)) throw new Error('Enter one extension ID (32 lowercase letters, a–p).');
    return [id];
  }
  /** Invalid manually edited properties never broaden access. @param {unknown} input */
  function readAdditional(input) {
    try { return parseAdditional(input ?? ''); } catch { return []; }
  }
  /** @param {unknown} input */
  function allowedIds(input) {
    return [...new Set([...officialIds, ...readAdditional(input)])];
  }
  return Object.freeze({ officialIds, parseAdditional, readAdditional, allowedIds });
})();
