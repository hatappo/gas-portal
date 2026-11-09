/** Unread message headers only. No bodies, attachments, tokens or upstream errors reach the client. */
function gmailSettings_() {
  try { return PortalGmail.restore(JSON.parse(PropertiesService.getUserProperties().getProperty('GMAIL_SETTINGS') || 'null')); }
  catch { return PortalGmail.defaults(); }
}
function getGmailSettings() { return { ok: true, settings: gmailSettings_() }; }
/** @param {unknown} input */
function saveGmailSettings(input) {
  if (!PortalGmail.validSettings(input)) return { ok: false, error: 'INVALID_INPUT' };
  try {
    return withPortalPropertiesLock_(() => {
      const store = PropertiesService.getUserProperties();
      store.setProperty('GMAIL_SETTINGS', JSON.stringify(input));
      store.setProperty('GMAIL_REVISION', Utilities.getUuid());
      return { ok: true, settings: input };
    });
  } catch { return { ok: false, error: 'SETTINGS_FAILED' }; }
}
/** @param {unknown} error */
function gmailError_(error) {
  const code = error instanceof Error ? error.message : '';
  return ['AUTHORIZATION_REQUIRED', 'FORBIDDEN', 'RATE_LIMITED', 'SETTINGS_CHANGED', 'NOT_FOUND', 'DISABLED'].includes(code) ? code : 'REQUEST_FAILED';
}
/** @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response @returns {any} */
function gmailResponse_(response) {
  const status = response.getResponseCode();
  if (status === 401) throw new Error('AUTHORIZATION_REQUIRED');
  if (status === 429) throw new Error('RATE_LIMITED');
  if (status === 404) throw new Error('NOT_FOUND');
  if (status === 403) {
    let reasons = [];
    try { reasons = JSON.parse(response.getContentText()).error?.errors?.map((/** @type {{reason?: string}} */ e) => e.reason) || []; } catch { /* Discard upstream details. */ }
    throw new Error(reasons.some((/** @type {string} */ reason) => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason)) ? 'RATE_LIMITED' : 'FORBIDDEN');
  }
  if (status !== 200) throw new Error('REQUEST_FAILED');
  try { return JSON.parse(response.getContentText()); } catch { throw new Error('REQUEST_FAILED'); }
}
/** Only internal paths and GET requests; requests are bounded and never retried in a loop.
 * @param {string} path @param {string} token @returns {GoogleAppsScript.URL_Fetch.URLFetchRequest} */
function gmailRequest_(path, token) {
  return { url: 'https://gmail.googleapis.com/gmail/v1/users/me/' + path, method: 'get', followRedirects: false, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } };
}
/** @param {any} raw @param {string} expectedId @returns {GmailItem | null} */
function gmailItem_(raw, expectedId) {
  if (!raw || raw.id !== expectedId || !PortalGmail.validId(raw.threadId) || !Array.isArray(raw.labelIds)) throw new Error('REQUEST_FAILED');
  if (!raw.labelIds.includes('UNREAD') || raw.labelIds.some((/** @type {string} */ id) => ['SPAM', 'TRASH', 'DRAFT'].includes(id))) return null;
  const timestamp = Number(raw.internalDate);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime()) || !Array.isArray(raw.payload?.headers)) throw new Error('REQUEST_FAILED');
  /** @param {string} name */
  const header = name => {
    const value = raw.payload.headers.find((/** @type {{name?: string}} */ h) => typeof h?.name === 'string' && h.name.toLowerCase() === name)?.value;
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  };
  return { id: raw.id, threadId: raw.threadId, title: header('subject'), sender: header('from'), receivedAt: new Date(timestamp).toISOString() };
}
/** @param {boolean} [forceRefresh] */
function getGmailActionItems(forceRefresh = false) {
  try {
    const settings = gmailSettings_();
    if (!settings.enabled) throw new Error('DISABLED');
    const scope = 'https://www.googleapis.com/auth/gmail.metadata';
    if ((/** @type {(mode: GoogleAppsScript.Script.AuthMode, scopes: string[]) => GoogleAppsScript.Script.AuthorizationInfo} */ (ScriptApp.getAuthorizationInfo))(ScriptApp.AuthMode.FULL, [scope]).getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) throw new Error('AUTHORIZATION_REQUIRED');
    const store = PropertiesService.getUserProperties();
    const revision = store.getProperty('GMAIL_REVISION') || '';
    const ttl = normalizeActionsCacheTtl_(store.getProperty('ACTIONS_CACHE_SECONDS'));
    const key = 'gmail-unread-v1:' + revision + ':' + settings.limit;
    /** @type {GoogleAppsScript.Cache.Cache | undefined} */ let cache;
    try { cache = CacheService.getUserCache(); } catch { /* Live reads still work. */ }
    if (forceRefresh === true || ttl === 0) { try { cache?.remove(key); } catch { /* Optional cache. */ } }
    else {
      try {
        const cached = JSON.parse(cache?.get(key) || 'null');
        if (cached && Date.now() >= cached.fetchedAt && Date.now() - cached.fetchedAt < ttl * 1000 && PortalGmail.validEmail(cached.account) && Array.isArray(cached.items)) return { ok: true, ...cached, cached: true };
      } catch { /* Optional cache. */ }
    }
    const token = ScriptApp.getOAuthToken();
    // Profile and list run together; identity lookup never blocks the list request.
    const responses = UrlFetchApp.fetchAll([
      gmailRequest_('profile?fields=emailAddress', token),
      gmailRequest_('messages?labelIds=UNREAD&includeSpamTrash=false&maxResults=' + settings.limit + '&fields=messages(id,threadId),nextPageToken', token),
    ]);
    const profile = gmailResponse_(responses[0]), list = gmailResponse_(responses[1]);
    if (!PortalGmail.validEmail(profile.emailAddress) || !list || typeof list !== 'object' || (list.messages !== undefined && !Array.isArray(list.messages)) || (list.nextPageToken !== undefined && typeof list.nextPageToken !== 'string')) throw new Error('REQUEST_FAILED');
    const messages = list.messages || [];
    if (messages.length > settings.limit || messages.some((/** @type {{id?: unknown}} */ message) => !PortalGmail.validId(message?.id))) throw new Error('REQUEST_FAILED');
    /** @type {GmailResult} */ const result = { account: profile.emailAddress, items: [], partial: false, error: '', hasMore: Boolean(list.nextPageToken) };
    const ids = [...new Set(messages.map((/** @type {{id: string}} */ m) => m.id))];
    for (let offset = 0; offset < ids.length; offset += 10) {
      const batch = ids.slice(offset, offset + 10);
      let details;
      try { details = UrlFetchApp.fetchAll(batch.map(id => gmailRequest_('messages/' + id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&fields=id,threadId,labelIds,internalDate,payload/headers', token))); }
      catch { result.partial = true; result.error = 'REQUEST_FAILED'; break; }
      for (let i = 0; i < batch.length; i++) {
        try {
          const item = gmailItem_(gmailResponse_(details[i]), batch[i]);
          if (item) result.items.push(item);
        } catch (error) {
          const code = gmailError_(error);
          if (code === 'NOT_FOUND') continue; // Deleted between list and metadata reads.
          result.partial = true; result.error = code;
        }
      }
      if (result.error) break;
    }
    result.items.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
    const fetchedAt = Date.now();
    return withPortalPropertiesLock_(() => {
      if (JSON.stringify(gmailSettings_()) !== JSON.stringify(settings) || (store.getProperty('GMAIL_REVISION') || '') !== revision) throw new Error('SETTINGS_CHANGED');
      if (!result.partial && ttl > 0) {
        try { const text = JSON.stringify({ ...result, fetchedAt }); if (Utilities.newBlob(text).getBytes().length < 95000) cache?.put(key, text, ttl); } catch { /* Optional cache. */ }
      }
      return { ok: true, ...result, fetchedAt, cached: false };
    });
  } catch (error) { return { ok: false, error: gmailError_(error) }; }
}
