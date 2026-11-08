/** Read-only Calendar API. Credentials and upstream error bodies never leave the server. */
function calendarSettings_() {
  try {
    const settings = JSON.parse(PropertiesService.getUserProperties().getProperty('CALENDAR_SETTINGS') || 'null');
    return PortalCalendar.restoreSettings(settings);
  } catch { return PortalCalendar.defaults(); }
}
/** @param {string[]} ids */
function calendarNames_(ids) {
  try { return PortalCalendar.names(JSON.parse(PropertiesService.getUserProperties().getProperty('CALENDAR_NAMES') || '{}'), ids); }
  catch { return {}; }
}
function getCalendarSettings() {
  const settings = calendarSettings_();
  return { ok: true, settings, calendarNames: calendarNames_(settings.calendarIds) };
}
/** @param {unknown} input @param {unknown} [names] */
function saveCalendarSettings(input, names) {
  if (!PortalCalendar.validSettings(input)) return { ok: false, error: 'INVALID_INPUT' };
  try {
    return withPortalPropertiesLock_(() => {
      const calendarNames = { ...calendarNames_(input.calendarIds), ...PortalCalendar.names(names, input.calendarIds) };
      PropertiesService.getUserProperties().setProperty('CALENDAR_NAMES', JSON.stringify(calendarNames));
      PropertiesService.getUserProperties().setProperty('CALENDAR_SETTINGS', JSON.stringify({ ...PortalCalendar.defaults(), ...input }));
      PropertiesService.getUserProperties().setProperty('CALENDAR_REVISION', Utilities.getUuid());
      return { ok: true, settings: { ...PortalCalendar.defaults(), ...input }, calendarNames };
    });
  } catch { return { ok: false, error: 'SETTINGS_FAILED' }; }
}
/** @param {unknown} error */
function calendarError_(error) {
  const code = error instanceof Error ? error.message : '';
  return ['AUTHORIZATION_REQUIRED', 'FORBIDDEN', 'RATE_LIMITED', 'INVALID_INPUT', 'CALENDAR_CHANGED', 'TOO_MANY_RESULTS'].includes(code) ? code : 'REQUEST_FAILED';
}
/** @param {string} path @returns {any} */
function calendarRequest_(path) {
  const scope = 'https://www.googleapis.com/auth/calendar.readonly';
  if ((/** @type {(mode: GoogleAppsScript.Script.AuthMode, scopes: string[]) => GoogleAppsScript.Script.AuthorizationInfo} */ (ScriptApp.getAuthorizationInfo))(ScriptApp.AuthMode.FULL, [scope]).getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) throw new Error('AUTHORIZATION_REQUIRED');
  let response;
  try { response = UrlFetchApp.fetch('https://www.googleapis.com/calendar/v3/' + path, { method: 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true, followRedirects: false }); }
  catch { throw new Error('REQUEST_FAILED'); }
  const status = response.getResponseCode();
  if (status === 401) throw new Error('AUTHORIZATION_REQUIRED');
  if (status === 429) throw new Error('RATE_LIMITED');
  if (status === 403 || status === 404) throw new Error('FORBIDDEN');
  if (status !== 200) throw new Error('REQUEST_FAILED');
  try { return JSON.parse(response.getContentText()); } catch { throw new Error('REQUEST_FAILED'); }
}
/** @param {unknown} color */
function calendarColor_(color) { return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#64748b'; }
function getCalendarChoices() {
  try {
    /** @type {CalendarChoice[]} */ const calendars = [];
    let page = '';
    for (let i = 0; i < 10; i++) {
      const data = calendarRequest_('users/me/calendarList?minAccessRole=reader&maxResults=250' + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
      if (!Array.isArray(data.items)) throw new Error('REQUEST_FAILED');
      for (const entry of data.items) if (!entry.deleted && typeof entry.id === 'string') calendars.push({ id: entry.primary ? 'primary' : entry.id, name: String(entry.summaryOverride || entry.summary || entry.id).slice(0, 200), color: calendarColor_(entry.backgroundColor), primary: entry.primary === true });
      page = data.nextPageToken || '';
      if (!page) {
        withPortalPropertiesLock_(() => {
          const ids = calendarSettings_().calendarIds;
          const names = { ...calendarNames_(ids), ...PortalCalendar.names(Object.fromEntries(calendars.map(c => [c.id, c.name])), ids) };
          PropertiesService.getUserProperties().setProperty('CALENDAR_NAMES', JSON.stringify(names));
        });
        return { ok: true, calendars };
      }
    }
    throw new Error('TOO_MANY_RESULTS');
  } catch (error) { return { ok: false, error: calendarError_(error) }; }
}
/** Restrict links to the original Google services. @param {unknown} value @param {'event' | 'meeting'} kind */
function calendarLink_(value, kind) {
  if (typeof value !== 'string') return '';
  const pattern = kind === 'event' ? /^https:\/\/(?:www\.)?google\.com\/calendar[/?]|^https:\/\/calendar\.google\.com\// : /^https:\/\/meet\.google\.com\/[a-z0-9-]+(?:[?#]|$)/;
  return pattern.test(value) ? value : '';
}
/** @param {any} raw @param {string} calendarId @param {string} name @param {string} color @param {string} timeZone @param {any} colors @returns {CalendarEvent | null} */
function calendarEvent_(raw, calendarId, name, color, timeZone, colors) {
  if (!raw || raw.status === 'cancelled' || raw.eventType === 'workingLocation' || raw.attendees?.some((/** @type {any} */ attendee) => attendee.self && attendee.responseStatus === 'declined')) return null;
  const allDay = typeof raw.start?.date === 'string';
  const start = allDay ? PortalCalendar.midnight(raw.start.date, timeZone) : Date.parse(raw.start?.dateTime);
  const end = allDay ? PortalCalendar.midnight(raw.end?.date, timeZone) : Date.parse(raw.end?.dateTime);
  if (typeof raw.id !== 'string' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('REQUEST_FAILED');
  return { id: calendarId + ':' + raw.id, calendarId, calendarName: name, title: typeof raw.summary === 'string' ? raw.summary.slice(0, 1000) : '', start, end, allDay, busy: raw.transparency !== 'transparent', color: calendarColor_(colors?.event?.[raw.colorId]?.background || color), url: calendarLink_(raw.htmlLink, 'event'), meetingUrl: calendarLink_(raw.hangoutLink, 'meeting') };
}
/** @param {boolean} [forceRefresh] @param {string} [timeZone] */
function getCalendarEvents(forceRefresh = false, timeZone = 'UTC') {
  try {
    if (typeof timeZone !== 'string' || timeZone.length > 80) throw new Error('INVALID_INPUT');
    let day;
    try { day = PortalCalendar.day(Date.now(), timeZone); } catch { throw new Error('INVALID_INPUT'); }
    const settings = calendarSettings_();
    const revision = PropertiesService.getUserProperties().getProperty('CALENDAR_REVISION') || '';
    const signature = JSON.stringify([settings, revision, day.date, timeZone]);
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signature).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
    const key = 'calendar:v1:' + hash;
    /** @type {CalendarSnapshot} */ const result = { enabled: true, date: day.date, timeZone, dayStart: day.start, dayEnd: day.end, events: [], notices: [], fetchedAt: Date.now(), cached: false };
    let cache;
    try { cache = CacheService.getUserCache(); } catch { /* Live reads still work without cache storage. */ }
    if (forceRefresh === true || settings.cacheSeconds === 0) { try { cache?.remove(key); } catch { /* Optional cache. */ } }
    else {
      try {
        const cached = JSON.parse(cache?.get(key) || 'null');
        if (cached && Date.now() >= cached.fetchedAt && Date.now() - cached.fetchedAt < settings.cacheSeconds * 1000) return { ok: true, ...cached, cached: true };
      } catch { /* Optional cache. */ }
    }
    let colors;
    try { colors = calendarRequest_('colors'); } catch { /* Calendar colors remain a useful fallback. */ }
    const seen = new Map();
    for (const id of settings.calendarIds) {
      try {
        const meta = calendarRequest_('users/me/calendarList/' + encodeURIComponent(id));
        const name = String(meta.summaryOverride || meta.summary || id).slice(0, 200);
        let page = '';
        for (let i = 0; i < 4; i++) {
          const data = calendarRequest_('calendars/' + encodeURIComponent(id) + '/events?singleEvents=true&showDeleted=false&orderBy=startTime&maxResults=250&timeMin=' + encodeURIComponent(new Date(day.start).toISOString()) + '&timeMax=' + encodeURIComponent(new Date(day.end).toISOString()) + '&timeZone=' + encodeURIComponent(timeZone) + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
          if (!Array.isArray(data.items)) throw new Error('REQUEST_FAILED');
          for (const raw of data.items) {
            const event = calendarEvent_(raw, id, name, meta.backgroundColor, timeZone, colors);
            if (!event || event.end <= day.start || event.start >= day.end) continue;
            const identity = raw.iCalUID ? raw.iCalUID + ':' + event.start : event.id;
            const existing = seen.get(identity);
            if (existing) { existing.busy = existing.busy || event.busy; continue; }
            seen.set(identity, event); result.events.push(event);
          }
          page = data.nextPageToken || '';
          if (!page) break;
          if (i === 3) throw new Error('TOO_MANY_RESULTS');
        }
      } catch (error) { result.notices.push(id + ': ' + calendarError_(error)); }
    }
    result.events.sort((a, b) => a.start - b.start || a.end - b.end);
    result.fetchedAt = Date.now();
    if (JSON.stringify(calendarSettings_()) !== JSON.stringify(settings) || (PropertiesService.getUserProperties().getProperty('CALENDAR_REVISION') || '') !== revision) throw new Error('CALENDAR_CHANGED');
    if (!result.notices.length && settings.cacheSeconds > 0) {
      try { const serialized = JSON.stringify(result); if (Utilities.newBlob(serialized).getBytes().length < 95000) cache?.put(key, serialized, settings.cacheSeconds); } catch { /* Optional cache. */ }
    }
    return { ok: true, ...result };
  } catch (error) { return { ok: false, error: calendarError_(error) }; }
}
