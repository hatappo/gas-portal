// Official Web Store IDs are added here after publication. Additional IDs belong to the executing user.
globalThis.PortalSidePanel = (() => {
  /** @type {readonly string[]} */
  const officialIds = Object.freeze([]);
  /** @param {unknown} input @returns {string[]} */
  function parseAdditional(input) {
    if (typeof input !== 'string' || input.length > 4096) throw new Error('Enter one extension ID per line (32 lowercase letters, a–p).');
    const ids = [...new Set(input.split(/\r?\n/).map((id) => id.trim()).filter(Boolean))];
    if (ids.some((id) => !/^[a-p]{32}$/.test(id))) throw new Error('Enter one extension ID per line (32 lowercase letters, a–p).');
    if (ids.length > 10) throw new Error('You can add up to 10 extension IDs.');
    return ids;
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
