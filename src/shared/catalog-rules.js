// Shared by the GAS server and browser bundle: which catalog URLs and icons are well-formed.
// GAS V8 has no WHATWG URL, so these rules are regular expressions. They accept only URLs that the
// browser's URL parser also accepts, so a value the server lets through never breaks the page.
// Whether a scheme may be opened is decided separately (see PortalUrlSchemes).
globalThis.PortalCatalogRules = (() => {
  /** Emoji sequences (flags, skin tones, ZWJ families) span several code points. */
  const MAX_ICON_CHARACTERS = 8;
  /** Schemes whose host the URL standard parses as a domain or IPv4 address. */
  const DOMAIN_SCHEMES = ['http', 'https', 'ws', 'wss', 'ftp'];

  /** @param {string} port */
  const validPort = (port) => port === '' || (/^\d{1,5}$/.test(port) && Number(port) <= 65535);

  /**
   * A domain of ASCII labels (Punycode for international names), or a dotted-decimal IPv4 address.
   * A host whose last label is numeric is parsed as IPv4 by browsers, so it must be a valid one.
   * @param {string} host
   */
  function validDomain(host) {
    const labels = host.split('.');
    if (!host || host.length > 253 || labels.some((label) => label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))) return false;
    if (!/^\d+$/.test(labels[labels.length - 1])) return true;
    return labels.length === 4 && labels.every((label) => /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(label));
  }

  /**
   * Check URL syntax only. Credentials are rejected for domain schemes; other schemes such as
   * vscode:// or ssh:// may carry user info, but their host and port must still be well-formed.
   * @param {unknown} value
   * @returns {boolean}
   */
  function isValidLinkUrl(value) {
    if (typeof value !== 'string') return false;
    // Reject line breaks and control characters before trimming.
    // eslint-disable-next-line no-control-regex -- Explicitly reject control characters in URLs.
    if (/[\u0000-\u001f\u007f\\<>"`]/.test(value)) return false;
    const url = value.trim();
    if (url.length > 2048 || /\s/.test(url) || /%(?![\da-f]{2})/i.test(url)) return false;
    const match = /^([a-z][a-z\d+.-]*):(.*)$/i.exec(url);
    if (!match) return false;
    const scheme = match[1].toLowerCase();
    const rest = match[2];
    if (!rest) return false;
    if (!rest.startsWith('//')) return !DOMAIN_SCHEMES.includes(scheme) && scheme !== 'file';
    const authority = /^\/\/([^/?#]*)/.exec(rest)?.[1] ?? '';
    if (DOMAIN_SCHEMES.includes(scheme)) {
      const web = /^([^:@[\]]+)(?::(\d*))?$/.exec(authority);
      return Boolean(web) && validDomain(/** @type {RegExpExecArray} */ (web)[1]) && validPort((/** @type {RegExpExecArray} */ (web)[2]) ?? '');
    }
    // Other schemes: optional user info, then a host without brackets, and a numeric port.
    const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
    const colon = hostPort.indexOf(':');
    const host = colon < 0 ? hostPort : hostPort.slice(0, colon);
    const port = colon < 0 ? '' : hostPort.slice(colon + 1);
    // Browsers reject these characters in hosts of any scheme.
    if (/[[\]@#?/:^|]/.test(host) || !validPort(port)) return false;
    // Without a host, browsers allow neither a port nor user info.
    if (host === '' && (colon >= 0 || authority.includes('@'))) return false;
    // file: URLs cannot have user info or a port, and their host must be a domain when present.
    if (scheme === 'file') return !authority.includes('@') && colon < 0 && (host === '' || validDomain(host));
    return true;
  }

  /** @param {string} icon */
  const isIconUrl = (icon) => /^https:/i.test(icon);

  /**
   * An icon overrides the automatic favicon: an https image URL, or a short text such as an emoji.
   * A blank icon means none.
   * @param {unknown} value
   * @returns {boolean}
   */
  function isValidIcon(value) {
    if (typeof value !== 'string') return false;
    const icon = value.trim();
    if (!icon) return true;
    if (/^[a-z][a-z\d+.-]*:/i.test(icon)) return isIconUrl(icon) && isValidLinkUrl(icon);
    // eslint-disable-next-line no-control-regex -- Reject control characters in icon text.
    return !/[\s\u0000-\u001f\u007f]/.test(icon) && Array.from(icon).length <= MAX_ICON_CHARACTERS;
  }

  return { isValidLinkUrl, isValidIcon, isIconUrl };
})();
