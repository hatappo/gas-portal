// Metadata-only unread mail settings shared by GAS, the browser and preview.
globalThis.PortalGmail = (() => {
  const limits = [10, 20, 50, 100];
  const defaults = () => ({ enabled: false, limit: 20 });
  /** @param {unknown} value @returns {value is GmailSettings} */
  function validSettings(value) {
    const v = /** @type {GmailSettings} */ (value);
    return Boolean(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === 'enabled,limit' && typeof v.enabled === 'boolean' && limits.includes(v.limit));
  }
  /** @param {unknown} value */
  const restore = value => validSettings(value) ? { enabled: value.enabled, limit: value.limit } : defaults();
  /** @param {unknown} email @returns {email is string} */
  const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
  /** @param {unknown} value @returns {value is string} */
  const validId = value => typeof value === 'string' && /^[a-f0-9]{1,64}$/.test(value);
  /** @param {string} email @param {string} threadId */
  const url = (email, threadId) => validEmail(email) && validId(threadId) ? 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(email) + '#all/' + threadId : '';
  return { limits, defaults, validSettings, restore, validEmail, validId, url };
})();
