import assert from 'node:assert/strict';
import { test } from 'node:test';
import { server, plain } from './helpers.mjs';
const now = Date.parse('2026-11-07T12:00:00Z');
const event = (id, start = '10:00', end = '11:00', extra = {}) => ({ id, summary: 'Meeting ' + id, start: { dateTime: '2026-11-07T' + start + ':00Z' }, end: { dateTime: '2026-11-07T' + end + ':00Z' }, htmlLink: 'https://calendar.google.com/calendar/event?eid=test', hangoutLink: 'https://meet.google.com/abc-defg-hij', ...extra });
function fixture(overrides = {}) {
  const requests = [], cache = new Map();
  const settings = { calendarIds: ['primary'], cacheSeconds: 300, alertMinutes: 5, ...overrides };
  const properties = { CALENDAR_SETTINGS: JSON.stringify(settings) };
  let handler = url => url.endsWith('/colors') ? { event: { 1: { background: '#ff9900' } } } : url.includes('/events?') ? { items: [event('one')] } : url.includes('/calendarList?') ? { items: [{ id: 'user@example.com', primary: true, summary: 'Work', backgroundColor: '#123456' }] } : { summary: 'Work', backgroundColor: '#123456' };
  let required = false;
  const app = server({ userProperties: properties, Date: class extends Date { static now() { return now; } },
    ScriptApp: { AuthMode: { FULL: 'FULL' }, AuthorizationStatus: { REQUIRED: 'required' }, getAuthorizationInfo(_mode, scopes) { assert.deepEqual(plain(scopes), ['https://www.googleapis.com/auth/calendar.readonly']); return { getAuthorizationStatus: () => required ? 'required' : 'granted' }; }, getOAuthToken: () => 'SECRET_OAUTH_TOKEN' },
    UrlFetchApp: { fetch(url, init) { requests.push({ url, init }); const response = handler(url); return { getResponseCode: () => response.status || 200, getContentText: () => JSON.stringify(response.body || response) }; } },
    CacheService: { getUserCache: () => ({ get: key => cache.get(key), put: (key, value, seconds) => { assert.ok(seconds <= 21600); cache.set(key, value); }, remove: key => cache.delete(key) }) },
  });
  return { ...app, requests, cache, properties, settings, respond(fn) { handler = fn; }, requireAuthorization() { required = true; } };
}

test('Calendar settings are per-user, validated with the primary calendar by default without fetching settings from Google', () => {
  const base = server();
  assert.deepEqual(plain(base.context.getCalendarSettings().settings), { calendarIds: ['primary'], cacheSeconds: 300, alertMinutes: 0 });
  const app = fixture();
  assert.equal(app.context.getCalendarSettings().settings.cacheSeconds, 300);
  assert.equal(app.requests.length, 0);
  for (const value of [null, { ...app.settings, calendarIds: [] }, { ...app.settings, calendarIds: ['a', 'a'] }, { ...app.settings, calendarIds: Array.from({ length: 6 }, (_, n) => String(n)) }, { ...app.settings, cacheSeconds: 42 }, { ...app.settings, alertMinutes: 4 }, { ...app.settings, extra: true }]) assert.equal(app.context.saveCalendarSettings(value).error, 'INVALID_INPUT');
  const saved = app.context.saveCalendarSettings({ ...app.settings, cacheSeconds: 900 });
  assert.equal(saved.ok, true);
  assert.equal(JSON.parse(app.properties.CALENDAR_SETTINGS).cacheSeconds, 900);
  assert.ok(app.properties.CALENDAR_REVISION);
  assert.equal(app.requests.length, 0);
});

test('Calendar reads only a bounded day, expands recurrence, caches sanitized events and forces refresh', () => {
  const app = fixture();
  const first = app.context.getCalendarEvents(false, 'UTC');
  assert.equal(first.ok, true); assert.equal(first.events.length, 1);
  assert.equal(first.events[0].color, '#123456');
  const request = app.requests.find(r => r.url.includes('/events?'));
  const params = new URL(request.url).searchParams;
  assert.equal(params.get('singleEvents'), 'true');
  assert.equal(params.get('timeMin'), '2026-11-07T00:00:00.000Z');
  assert.equal(params.get('timeMax'), '2026-11-08T00:00:00.000Z');
  assert.ok(app.requests.every(r => r.init.method === 'get' && r.init.followRedirects === false));
  assert.equal(request.init.headers.Authorization, 'Bearer SECRET_OAUTH_TOKEN');
  const calls = app.requests.length;
  assert.equal(app.context.getCalendarEvents(false, 'UTC').cached, true);
  assert.equal(app.requests.length, calls);
  assert.equal(app.context.getCalendarEvents(true, 'UTC').cached, false);
  assert.ok(app.requests.length > calls);
  assert.doesNotMatch(JSON.stringify([first, ...app.cache.values(), app.logs]), /SECRET_OAUTH_TOKEN|Authorization/);
  app.context.saveCalendarSettings({ ...app.settings, cacheSeconds: 0 });
  assert.equal(app.context.getCalendarEvents(false, 'UTC').cached, false);
  assert.equal(app.context.getCalendarEvents(false, 'UTC').cached, false);
});

test('Calendar sanitizes links, excludes declined/cancelled events and deduplicates shared invitations', () => {
  const app = fixture({ calendarIds: ['primary', 'other@example.com'] });
  app.respond(url => url.endsWith('/colors') ? { event: { 1: { background: '#ff9900' } } } : url.includes('/events?') ? { items: [
    event('one', '10:00', '11:00', { iCalUID: 'shared', colorId: '1', description: 'PRIVATE_BODY' }),
    event('declined', '10:00', '11:00', { attendees: [{ self: true, responseStatus: 'declined' }] }),
    event('cancelled', '10:00', '11:00', { status: 'cancelled' }),
    event('location', '10:00', '11:00', { eventType: 'workingLocation' }),
    event('unsafe', '12:00', '13:00', { iCalUID: 'unsafe', summary: undefined, htmlLink: 'javascript:evil()', hangoutLink: 'https://meet.google.com.evil.test/a', transparency: 'transparent' }),
    { id: 'all-day', iCalUID: 'all-day', start: { date: '2026-11-07' }, end: { date: '2026-11-08' }, summary: 'Holiday', transparency: 'transparent' },
  ] } : { summary: 'Calendar', backgroundColor: '#123456' });
  const response = app.context.getCalendarEvents(true, 'UTC');
  assert.equal(response.events.length, 3);
  assert.equal(response.events.find(e => e.title === 'Meeting one').color, '#ff9900');
  const hidden = response.events.find(e => e.title === '');
  assert.equal(hidden.url, ''); assert.equal(hidden.meetingUrl, ''); assert.equal(hidden.busy, false);
  assert.equal(response.events.filter(e => e.allDay).length, 1);
  assert.doesNotMatch(JSON.stringify(response), /PRIVATE_BODY|javascript|evil.test/);
});

test('Calendar permission failures, partial pages and changed settings never yield cached free time', () => {
  const app = fixture(); app.requireAuthorization();
  const denied = app.context.getCalendarEvents(true, 'UTC');
  assert.match(denied.notices[0], /AUTHORIZATION_REQUIRED/); assert.equal(app.requests.length, 0); assert.equal(app.cache.size, 0);
  const partial = fixture();
  partial.respond(url => url.includes('/events?') ? { items: [event('one')], nextPageToken: 'next' } : { summary: 'Work' });
  const response = partial.context.getCalendarEvents(true, 'UTC');
  assert.equal(response.events.length, 1);
  assert.match(response.notices[0], /TOO_MANY_RESULTS/);
  assert.equal(partial.requests.filter(r => r.url.includes('/events?')).length, 4);
  assert.equal(partial.cache.size, 0);
  const changed = fixture();
  changed.respond(url => { if (url.includes('/events?')) { changed.context.saveCalendarSettings({ ...changed.settings, cacheSeconds: 900 }); return { items: [] }; } return {}; });
  assert.equal(changed.context.getCalendarEvents(true, 'UTC').error, 'CALENDAR_CHANGED');
  assert.equal(changed.cache.size, 0);
});

test('Calendar choices paginate and redact API errors; malformed time zones make no requests', () => {
  const app = fixture();
  app.respond(url => url.includes('pageToken') ? { items: [{ id: 'other', summary: '<unsafe>', backgroundColor: 'url(evil)' }] } : { items: [{ id: 'mail@example.com', primary: true, summary: 'Main' }], nextPageToken: 'next & token' });
  const response = app.context.getCalendarChoices();
  assert.deepEqual(plain(response.calendars.map(c => c.id)), ['primary', 'other']);
  assert.equal(response.calendars[1].color, '#64748b');
  assert.match(app.requests[1].url, /next%20%26%20token/);
  app.respond(() => ({ status: 403, body: { error: 'SECRET_OAUTH_TOKEN' } }));
  assert.equal(app.context.getCalendarChoices().error, 'FORBIDDEN');
  app.requests.length = 0;
  assert.equal(app.context.getCalendarEvents(false, 'invalid/time-zone').error, 'INVALID_INPUT');
  assert.equal(app.requests.length, 0);
});

test('Calendar civil-day boundaries handle DST, midnight transitions and date changes', () => {
  const model = server().context.PortalCalendar;
  const spring = model.day(Date.parse('2026-03-08T12:00:00Z'), 'America/New_York');
  assert.equal(spring.end - spring.start, 23 * 3600000);
  const fall = model.day(Date.parse('2026-11-01T12:00:00Z'), 'America/New_York');
  assert.equal(fall.end - fall.start, 25 * 3600000);
  const midnight = model.day(Date.parse('2018-11-04T12:00:00Z'), 'America/Sao_Paulo');
  assert.equal(midnight.start, Date.parse('2018-11-04T03:00:00Z'));
  assert.equal(model.dateKey(Date.parse('2026-11-07T15:00:00Z'), 'Asia/Tokyo'), '2026-11-08');
});

test('Calendar gaps merge overlapping busy intervals and disappear for partial or busy all-day data', () => {
  const model = server().context.PortalCalendar;
  const events = [[10, 20], [15, 30], [40, 50]].map(([start, end], i) => ({ id: String(i), start, end, allDay: false, busy: true }));
  const slots = model.slots(events, 0, 60, true);
  assert.deepEqual(plain(slots.filter(s => s.gap).map(s => [s.start, s.end])), [[30, 40]]);
  assert.equal(model.slots(events, 0, 60, false).filter(s => s.gap).length, 0);
  assert.equal(model.slots([...events, { id: 'all', start: 0, end: 60, allDay: true, busy: true }], 0, 60, true).filter(s => s.gap).length, 0);
  assert.equal(model.state(slots[0], slots, 10), 'current');
  assert.equal(model.state(slots[0], slots, 20), 'past');
  assert.equal(model.state(slots.find(s => s.id === '2'), slots, 20), 'next');
  assert.equal(model.slots([], 0, 60, true).length, 0, 'Do not fabricate a whole free day');
});

test('Unavailable Calendar cache storage falls back to live reads', () => {
  const app = fixture();
  app.context.CacheService.getUserCache = () => { throw new Error('Unavailable'); };
  const result = app.context.getCalendarEvents(false, 'UTC');
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.cached, false);
});

test('Calendar notices validate every supported time and reject retired settings', () => {
  const app = fixture();
  for (const alertMinutes of [0, 1, 2, 3, 5, 10, 15]) {
    assert.equal(app.context.saveCalendarSettings({ ...app.settings, alertMinutes }).ok, true);
    assert.deepEqual(plain(app.context.getCalendarSettings().settings), { ...app.settings, alertMinutes });
  }
  for (const pulseEnabled of [0, null, 'true', undefined]) assert.equal(app.context.saveCalendarSettings({ ...app.settings, pulseEnabled }).ok, false);
  for (const alertMinutes of [-1, 4, 16, 1.5, '3']) assert.equal(app.context.saveCalendarSettings({ ...app.settings, alertMinutes }).ok, false);
});

test('Stored calendar choices survive removal of enable and separate pulse timing settings', () => {
  const app = fixture();
  app.properties.CALENDAR_SETTINGS = JSON.stringify({ enabled: false, calendarIds: ['other'], cacheSeconds: 900, alertMinutes: 10, pulseMinutes: 7, pulseEnabled: false });
  assert.deepEqual(plain(app.context.getCalendarSettings().settings), { calendarIds: ['other'], cacheSeconds: 900, alertMinutes: 10 });
});

test('Calendar names persist per user, refresh on discovery and never require API calls on settings reads', () => {
  const app = fixture();
  assert.deepEqual(plain(app.context.getCalendarSettings().calendarNames), {});
  assert.equal(app.context.getCalendarChoices().ok, true);
  app.requests.length = 0;
  assert.deepEqual(plain(app.context.getCalendarSettings().calendarNames), { primary: 'Work' });
  assert.equal(app.requests.length, 0);
  app.respond(() => ({ items: [{ id: 'user@example.com', primary: true, summary: 'Renamed' }, { id: 'holidays', summary: 'Public holidays' }] }));
  app.context.getCalendarChoices();
  assert.deepEqual(JSON.parse(app.properties.CALENDAR_NAMES), { primary: 'Renamed' }, 'Only selected names are persisted');
  const saved = app.context.saveCalendarSettings({ ...app.settings, calendarIds: ['holidays'] }, { primary: 'Renamed', holidays: 'Public holidays', unrelated: 'Ignored' });
  assert.deepEqual(plain(saved.calendarNames), { holidays: 'Public holidays' });
  const reloaded = server({ userProperties: app.properties });
  assert.deepEqual(plain(reloaded.context.getCalendarSettings().calendarNames), { holidays: 'Public holidays' });
  app.context.saveCalendarSettings({ ...app.settings, calendarIds: ['holidays'], cacheSeconds: 900 });
  assert.deepEqual(JSON.parse(app.properties.CALENDAR_NAMES), { holidays: 'Public holidays' }, 'Omitted names preserve existing metadata');
  app.respond(() => ({ status: 403 }));
  assert.equal(app.context.getCalendarChoices().ok, false);
  assert.deepEqual(JSON.parse(app.properties.CALENDAR_NAMES), { holidays: 'Public holidays' });
  assert.deepEqual(plain(server().context.getCalendarSettings().calendarNames), {}, 'Names never leak across users');
});

test('Calendar display-name metadata is bounded and corrupt metadata does not reset settings', () => {
  const app = fixture();
  const names = app.context.PortalCalendar.names;
  assert.deepEqual(plain(names({ primary: 123, constructor: 'Safe name' }, ['primary', 'constructor', 'toString'])), { constructor: 'Safe name' });
  assert.equal(names({ primary: 'x'.repeat(1000) }, ['primary']).primary.length, 200);
  for (const value of [null, [], 'bad', { primary: '  ' }]) assert.deepEqual(plain(names(value, ['primary'])), {});
  app.properties.CALENDAR_NAMES = 'invalid JSON';
  assert.deepEqual(plain(app.context.getCalendarSettings().settings), app.settings);
  assert.deepEqual(plain(app.context.getCalendarSettings().calendarNames), {});
  const ids = Array.from({ length: 5 }, (_, n) => String(n) + 'あ'.repeat(255));
  const saved = app.context.saveCalendarSettings({ ...app.settings, calendarIds: ids }, Object.fromEntries(ids.map(id => [id, '名'.repeat(200)])));
  assert.equal(saved.ok, true);
  assert.ok(Buffer.byteLength(app.properties.CALENDAR_NAMES) < 9000);
});
