import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, bundleBrowser, plain } from './helpers.mjs';
const client = await bundleBrowser({ connectGitHub: false, connectCalendar: true });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(t) {
  let now = Date.parse('2026-11-07T12:00:00Z');
  const app = browser(window => {
    window.Date.now = () => now;
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  }, client);
  t.after(() => app.dom.window.close());
  const settings = { calendarIds: ['primary'], cacheSeconds: 300, alertMinutes: 5 };
  const snapshot = () => {
    const timeZone = new app.dom.window.Intl.DateTimeFormat().resolvedOptions().timeZone;
    const day = app.dom.window.PortalCalendar.day(now, timeZone);
    const event = (id, start, end) => ({ id, calendarId: 'primary', calendarName: 'Work', title: id, start, end, allDay: false, busy: true, color: '#123456', url: 'https://calendar.google.com/calendar/event?eid=a', meetingUrl: '' });
    return { ok: true, enabled: true, date: day.date, timeZone, dayStart: day.start, dayEnd: day.end, events: [event('current', now - 60000, now + 60000), event('next', now + 120000, now + 180000)], notices: [], fetchedAt: now, cached: false };
  };
  return { ...app, settings, snapshot, setNow(value) { now = value; }, getNow: () => now, get: id => app.document.getElementById(id) };
}
test('Calendar starts independently, reclassifies cached events without RPCs, and refreshes on day rollover', async t => {
  const app = fixture(t);
  assert.equal(app.calendarRequests[0].kind, 'settings');
  app.calendarRequests[0].success({ ok: true, settings: app.settings }); await flush();
  assert.equal(app.calendarRequests[1].kind, 'events');
  app.calendarRequests[1].success(app.snapshot()); await flush();
  assert.equal(app.document.querySelectorAll('.calendar-event[data-state="current"]:not(.is-gap)').length, 1);
  assert.equal(app.document.querySelectorAll('.calendar-event[data-state="next"]').length, 1);
  assert.equal(app.document.querySelectorAll('.is-gap').length, 1);
  app.setNow(app.getNow() + 60000);
  app.dom.window.testPortal.calendar.tick();
  assert.equal(app.document.querySelectorAll('.calendar-event[data-state="past"]:not(.is-gap)').length, 1);
  assert.equal(app.calendarRequests.length, 2, 'Clock updates do not request Google');
  app.get('tab-actions').click(); app.get('tab-tools').click();
  assert.equal(app.get('calendar-panel').hidden, false);
  app.setNow(app.getNow() + 86400000);
  app.dom.window.testPortal.calendar.tick();
  assert.equal(app.document.querySelectorAll('.calendar-event').length, 0, 'Do not show yesterday as today');
  assert.equal(app.calendarRequests.length, 3);
});
test('Calendar partial errors suppress gaps; forced errors clear stale data and controls stay available', async t => {
  const app = fixture(t); app.calendarRequests[0].success({ ok: true, settings: app.settings }); await flush();
  app.calendarRequests[1].success({ ...app.snapshot(), notices: ['primary: FORBIDDEN'] }); await flush();
  assert.equal(app.document.querySelectorAll('.is-gap').length, 0);
  assert.match(app.get('calendar-panel').textContent, /一部のカレンダー/);
  app.document.querySelector('#calendar-panel .refresh-catalog').click();
  assert.equal(app.calendarRequests[2].force, true);
  app.calendarRequests[2].success({ ok: false, error: 'AUTHORIZATION_REQUIRED' }); await flush();
  assert.equal(app.document.querySelectorAll('.calendar-event').length, 0);
  assert.match(app.get('calendar-panel').textContent, /authorizePortal/);
  assert.equal(app.document.querySelector('#calendar-panel .refresh-catalog').disabled, false);
});
test('Changing Calendar settings invalidates in-flight responses and saves only validated settings', async t => {
  const app = fixture(t); app.calendarRequests[0].success({ ok: true, settings: app.settings }); await flush();
  const old = app.calendarRequests[1];
  app.get('tab-settings').click(); app.get('settings-tab-calendar').click();
  const cache = app.document.querySelector('[aria-labelledby=calendar-cache-label]'); cache.value = '900'; cache.dispatchEvent(new app.dom.window.Event('change'));
  app.document.querySelector('.calendar-settings form').dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  const save = app.calendarRequests[2];
  assert.deepEqual(plain(save.input), { ...app.settings, cacheSeconds: 900 });
  save.success({ ok: true, settings: save.input }); await flush();
  old.success(app.snapshot()); await flush();
  assert.equal(app.document.querySelectorAll('.calendar-event').length, 0);
  assert.equal(app.get('calendar-panel').hidden, false);
  assert.equal(app.calendarRequests.length, 4);
  app.calendarRequests[3].success(app.snapshot()); await flush();
  assert.ok(app.document.querySelectorAll('.calendar-event').length > 0);
});

test('Calendar settings initialization shows a spinner, coalesces retries and recovers in Settings', async t => {
  const app = fixture(t);
  assert.equal(app.document.querySelector('#calendar-panel .refresh-catalog').getAttribute('aria-busy'), 'true');
  app.get('toggle-calendar').click();
  assert.equal(app.calendarRequests.length, 1);
  app.calendarRequests[0].failure(new Error('Failed')); await flush();
  app.get('tab-settings').click(); app.get('settings-tab-calendar').click();
  app.document.querySelector('.calendar-settings > button').click();
  assert.equal(app.calendarRequests.length, 2);
  app.calendarRequests[1].success({ ok: true, settings: { ...app.settings, cacheSeconds: 900 } }); await flush();
  assert.equal(app.document.querySelector('.calendar-settings fieldset').disabled, false);
  assert.equal(app.document.querySelector('.calendar-settings > button'), null);
});

test('Upcoming card is highlighted at the notice boundary without fetching, then disappears when the event starts', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: { ...app.settings, alertMinutes: 1 } }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  assert.equal(app.document.querySelectorAll('.calendar-next-badge').length, 1);
  assert.equal(app.document.querySelector('.calendar-next-badge').classList.contains('is-approaching'), false);
  assert.equal(app.document.querySelector('#calendar-upcoming-notice'), null);
  app.setNow(app.getNow() + 60000); app.dom.window.testPortal.calendar.tick();
  assert.equal(app.document.querySelector('.calendar-next-badge').classList.contains('is-approaching'), true);
  assert.ok(app.document.querySelector('.calendar-event.is-approaching'));
  assert.equal(app.document.querySelector('[role=dialog]'), null);
  app.setNow(app.getNow() + 60000); app.dom.window.testPortal.calendar.tick();
  assert.equal(app.document.querySelectorAll('.calendar-next-badge').length, 0);
  assert.equal(app.calendarRequests.length, 2);
});

test('The latest-ending timed appointment alone shows its end, including overlapping and past events', async t => {
  const app = fixture(t); app.calendarRequests[0].success({ ok: true, settings: app.settings }); await flush();
  const data = app.snapshot();
  data.events[0].end = app.getNow() + 240000;
  app.calendarRequests[1].success(data); await flush();
  const finalRow = app.document.querySelector('.calendar-event[data-last="true"]');
  assert.equal(app.document.querySelectorAll('.calendar-event[data-last="true"]').length, 1);
  assert.match(finalRow.querySelector('button').title, /current/);
  assert.match(finalRow.querySelector('.calendar-event-time').textContent, /^\d{2}:\d{2} \u00b7 .+ ~ \d{2}:\d{2}$/);
  assert.doesNotMatch(app.document.querySelector('.calendar-event[data-state="next"] .calendar-event-time').textContent, /~/);
  app.setNow(app.getNow() + 240000); app.dom.window.testPortal.calendar.tick();
  assert.equal(finalRow.dataset.state, 'past');
  assert.equal(finalRow.dataset.last, 'true');
});

test('Calendar progress and expansion filters update locally without removing events or fetching', async t => {
  const app = fixture(t); app.calendarRequests[0].success({ ok: true, settings: app.settings }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  const current = app.document.querySelector('.calendar-event[data-state="current"]');
  assert.equal(current.style.getPropertyValue('--event-progress'), '50.00%');
  const count = app.document.querySelectorAll('.calendar-event').length;
  app.document.querySelectorAll('.calendar-display-filters input')[1].click();
  assert.equal(app.document.querySelectorAll('.calendar-event').length, count);
  assert.equal(current.dataset.expanded, 'false');
  assert.equal(app.document.querySelector('.is-gap').dataset.expanded, 'true');
  app.setNow(app.getNow() + 30000); app.dom.window.testPortal.calendar.tick();
  assert.equal(current.style.getPropertyValue('--event-progress'), '75.00%');
  app.document.querySelectorAll('.calendar-display-filters input')[0].click();
  assert.equal(current.dataset.expanded, 'true');
  assert.equal(app.document.querySelector('.is-gap').dataset.expanded, 'false');
  app.document.querySelectorAll('.calendar-display-filters input')[2].click();
  assert.equal(app.document.querySelectorAll('.calendar-event[data-expanded="true"]').length, count);
  app.document.querySelectorAll('.calendar-display-filters input')[1].click();
  assert.equal(current.dataset.expanded, 'false');
  assert.equal(app.calendarRequests.length, 2);
  assert.equal(app.document.querySelector('.calendar-date'), null);
});

test('Disabled notices retain the plain Next label and do not open a modal', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: { ...app.settings, alertMinutes: 0 } }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  assert.equal(app.document.querySelector('.calendar-next-badge').textContent, '次の予定');
  assert.equal(app.get('calendar-upcoming-notice'), null);
});

test('Notice sample uses unsaved timing without requests or a motion toggle', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: { ...app.settings, alertMinutes: 0 } }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  app.get('tab-settings').click(); app.get('settings-tab-calendar').click();
  const select = app.get('calendar-alert-select');
  assert.deepEqual(Array.from(select.options, o => o.value), ['0', '1', '2', '3', '5', '10', '15']);
  select.value = '15'; select.dispatchEvent(new app.dom.window.Event('change'));
  const trigger = app.document.querySelector('[aria-controls="calendar-notice-sample"]');
  trigger.click(); await flush();
  assert.equal(app.get('calendar-notice-sample').querySelectorAll('.calendar-event.is-approaching').length, 1);
  assert.match(app.get('calendar-notice-sample').textContent, /15分後に開始/);
  trigger.click(); await flush();
  assert.equal(app.get('calendar-notice-sample'), null);
  select.value = '0'; select.dispatchEvent(new app.dom.window.Event('change'));
  trigger.click(); await flush();
  assert.match(app.get('calendar-notice-sample').textContent, /3分後に開始/);
  assert.equal(app.calendarRequests.length, 2);
  assert.equal(app.document.querySelector('.calendar-pulse-toggle'), null);
});

test('Calendar refetches only after expiry, coalesces ticks, and backs off failures while visible', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: { ...app.settings, cacheSeconds: 900 } }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  const tick = app.dom.window.testPortal.calendar.tick;
  const start = app.getNow();
  app.setNow(start + 14 * 60000); tick();
  assert.equal(app.calendarRequests.length, 2, 'Local clock updates reuse the fetched data');
  app.setNow(start + 15 * 60000); tick(); tick(); tick();
  assert.equal(app.calendarRequests.length, 3, 'Only one pending read per controller');
  app.calendarRequests[2].failure(new Error('Unavailable')); await flush();
  app.setNow(app.getNow() + 59000); tick();
  assert.equal(app.calendarRequests.length, 3);
  app.setNow(app.getNow() + 1000); tick();
  assert.equal(app.calendarRequests.length, 4, 'Failures wait a minute before retry');
  app.calendarRequests[3].success(app.snapshot()); await flush();
  Object.defineProperty(app.document, 'hidden', { configurable: true, value: true });
  app.document.dispatchEvent(new app.dom.window.Event('visibilitychange'));
  app.setNow(app.getNow() + 16 * 60000); tick();
  assert.equal(app.calendarRequests.length, 4, 'Hidden pages never start a read');
  Object.defineProperty(app.document, 'hidden', { configurable: true, value: false });
  app.document.dispatchEvent(new app.dom.window.Event('visibilitychange'));
  assert.equal(app.calendarRequests.length, 5, 'Visibility restores expired data');
  app.calendarRequests[4].success(app.snapshot()); await flush();
  app.get('toggle-calendar').click();
  app.setNow(app.getNow() + 16 * 60000); tick();
  assert.equal(app.calendarRequests.length, 5, 'Closed panels do not auto-fetch');
});


test('Next countdown follows remaining time without additional requests and localizes Japanese labels', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: { ...app.settings, alertMinutes: 3 } }); await flush();
  const snapshot = app.snapshot(); snapshot.events[1].start += 60000; snapshot.events[1].end += 60000;
  app.calendarRequests[1].success(snapshot); await flush();
  const badge = () => app.document.querySelector('#calendar-panel .calendar-next-badge');
  for (const minutes of [3, 2, 1]) {
    assert.equal(badge().textContent, `${minutes}分後に開始`);
    app.setNow(app.getNow() + 60000); app.dom.window.testPortal.calendar.tick();
  }
  assert.equal(badge(), null);
  assert.equal(app.calendarRequests.length, 2);
});


test('Current appointments show independent remaining minutes with accessible time text', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: app.settings }); await flush();
  const data = app.snapshot();
  data.events[0].start = app.getNow() - 30 * 60000;
  data.events[0].end = app.getNow() + 30 * 60000;
  data.events.push({ ...data.events[0], id: 'overlap', end: app.getNow() + 15 * 60000 });
  app.calendarRequests[1].success(data); await flush();
  const rows = Array.from(app.document.querySelectorAll('.calendar-event[data-state="current"]:not(.is-gap)'));
  assert.equal(rows.length, 2);
  assert.equal(app.document.querySelectorAll('.calendar-event mask').length, 0);
  const row = rows.find(row => row.querySelector('.calendar-remaining-label').textContent === '残り30分');
  assert.match(row.querySelector('button').getAttribute('aria-label'), /残り30分/);
  app.setNow(app.getNow() + 29 * 60000); app.dom.window.testPortal.calendar.tick();
  assert.equal(row.querySelector('.calendar-remaining-label').textContent, '残り1分');
  assert.equal(row.style.getPropertyValue('--event-progress'), '98.33%');
  assert.match(row.querySelector('button').title, /残り1分/);
  app.setNow(app.getNow() + 60000); app.dom.window.testPortal.calendar.tick();
  assert.equal(row.querySelector('.calendar-remaining-label'), null);
});

test('Calendar labels switch between Japanese and English without refetching events', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: { ...app.settings, alertMinutes: 1 } }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  const next = () => app.document.querySelector('.calendar-next-badge');
  const remaining = () => app.document.querySelector('.calendar-remaining-label');
  assert.equal(next().textContent, '次の予定');
  assert.equal(remaining().textContent, '残り1分');
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.equal(next().textContent, 'Next');
  assert.equal(remaining().textContent, '1′ left');
  app.setNow(app.getNow() + 60000); app.dom.window.testPortal.calendar.tick();
  assert.equal(next().textContent, 'In 1′');
  assert.equal(next().getAttribute('aria-label'), 'Starts in 1 min');
  app.document.documentElement.lang = 'ja';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.equal(next().textContent, '1分後に開始');
  assert.equal(next().getAttribute('aria-label'), '1分後に開始');
  assert.equal(app.calendarRequests.length, 2);
});

test('Silencing one appointment preserves its countdown and other reminders through refreshes', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: app.settings }); await flush();
  const snapshot = app.snapshot();
  snapshot.events.push({ ...snapshot.events[1], id: 'another-next', title: 'Another next' });
  app.calendarRequests[1].success(snapshot); await flush();
  assert.equal(app.document.querySelectorAll('.calendar-silence').length, 2);
  const row = Array.from(app.document.querySelectorAll('.calendar-event')).find(item => item.querySelector('.calendar-event-title')?.textContent === ' · next');
  const button = row.querySelector('.calendar-silence');
  assert.equal(button.getAttribute('aria-label'), 'このお知らせを停止');
  button.click();
  assert.equal(row.classList.contains('is-approaching'), false);
  assert.equal(row.querySelector('.calendar-next-badge').textContent, '2分後に開始');
  assert.equal(app.document.activeElement, row.querySelector('.calendar-event-trigger'));
  assert.equal(app.document.querySelectorAll('.calendar-silence').length, 1);
  assert.equal(app.calendarRequests.length, 2, 'Silencing is a local interaction, not a settings update');
  app.get('toggle-calendar').click(); app.get('toggle-calendar').click();
  app.document.querySelector('#calendar-panel .refresh-catalog').click();
  app.calendarRequests[2].success({ ...snapshot }); await flush();
  assert.equal(app.document.querySelectorAll('.calendar-silence').length, 1);
  // Rescheduling the silenced event creates a new reminder, without muting future events.
  snapshot.events[1] = { ...snapshot.events[1], start: snapshot.events[1].start + 60000, end: snapshot.events[1].end + 60000 };
  app.document.querySelector('#calendar-panel .refresh-catalog').click();
  app.calendarRequests[3].success({ ...snapshot }); await flush();
  app.setNow(app.getNow() + 120000); app.dom.window.testPortal.calendar.tick();
  const active = app.document.querySelector('.calendar-event.is-approaching');
  assert.match(active.querySelector('.calendar-event-title').textContent, /next/);
  assert.equal(active.querySelector('.calendar-next-badge').textContent, '1分後に開始');
  assert.ok(active.querySelector('.calendar-silence'));
});

test('Calendar choice errors stay beside Load calendars and remain separate from save results', async t => {
  const app = fixture(t);
  app.calendarRequests[0].success({ ok: true, settings: app.settings }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  const load = app.document.querySelector('.calendar-choices-heading button');
  const submit = () => app.document.querySelector('.calendar-settings form').dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  load.click();
  app.calendarRequests.at(-1).success({ ok: false, error: 'AUTHORIZATION_REQUIRED' }); await flush();
  const error = app.get('calendar-choices-error');
  assert.match(error.textContent, /authorizePortal/);
  assert.equal(error.previousElementSibling, load.parentElement);
  assert.equal(error.getAttribute('role'), 'alert');
  assert.ok(error.classList.contains('alert-error'));
  assert.equal(load.getAttribute('aria-describedby'), error.id);
  submit();
  app.calendarRequests.at(-1).success({ ok: true, settings: app.settings }); await flush();
  assert.ok(app.get('calendar-choices-error'), 'Saving settings must not clear a failed choices request');
  assert.equal(app.document.querySelector('.calendar-settings .settings-form-status').textContent, '保存しました');
  assert.equal(app.document.querySelector('.calendar-settings .settings-form-status').classList.contains('alert-error'), false);
  load.click();
  assert.equal(app.get('calendar-choices-error'), null, 'Retry clears the previous choices error');
  app.calendarRequests.at(-1).success({ ok: true, calendars: [{ id: 'primary', name: 'Work' }] }); await flush();
  assert.equal(load.hasAttribute('aria-describedby'), false);
  submit();
  app.calendarRequests.at(-1).failure(new Error('Failed')); await flush();
  const saveError = app.document.querySelector('.calendar-settings > .alert-error');
  assert.equal(saveError.previousElementSibling.tagName, 'FORM');
  assert.equal(app.document.querySelector('.calendar-settings .settings-form-status'), null);
  assert.equal(app.get('calendar-choices-error'), null);
});

test('Calendar names restore without fetching choices, fall back to IDs, and preserve saved selections', async t => {
  const app = fixture(t);
  const labels = () => [...app.document.querySelectorAll('.calendar-choices label')].map(el => el.textContent);
  assert.deepEqual(labels(), [], 'Do not render a default ID while saved settings are loading');
  app.calendarRequests[0].success({ ok: true, settings: { ...app.settings, calendarIds: ['primary', 'saved@example.com'] }, calendarNames: { primary: 'Saved name' } }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  const load = app.document.querySelector('.calendar-choices-heading button');
  load.click();
  app.calendarRequests.at(-1).success({ ok: false, error: 'AUTHORIZATION_REQUIRED' }); await flush();
  assert.deepEqual(labels(), ['Saved name', 'saved@example.com']);
  load.click();
  app.calendarRequests.at(-1).success({ ok: true, calendars: [{ id: 'primary', name: 'My work calendar' }] }); await flush();
  assert.deepEqual(labels(), ['My work calendar', 'saved@example.com']);
  assert.equal(app.document.querySelectorAll('.calendar-choices input:checked').length, 2);
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.deepEqual(labels(), ['My work calendar', 'saved@example.com']);
  app.document.querySelector('.calendar-settings form').dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  assert.deepEqual(plain(app.calendarRequests.at(-1).names), { primary: 'My work calendar' });
});

test('Restored calendar choices survive deselection, saving and incomplete discovery without losing focus', async t => {
  const app = fixture(t);
  const settings = { ...app.settings, calendarIds: ['primary', 'holidays'] };
  app.calendarRequests[0].success({ ok: true, settings, calendarNames: { primary: 'Work', holidays: 'Holidays' } }); await flush();
  app.calendarRequests[1].success(app.snapshot()); await flush();
  app.get('tab-settings').click(); app.get('settings-tab-calendar').click();
  const holidays = app.document.querySelectorAll('.calendar-choices input')[1];
  holidays.focus(); holidays.click();
  assert.equal(holidays.isConnected, true);
  assert.equal(holidays.checked, false);
  assert.equal(app.document.activeElement, holidays);
  assert.equal(app.document.querySelectorAll('.calendar-choices input').length, 2);
  app.document.querySelector('.calendar-settings form').dispatchEvent(new app.dom.window.Event('submit', { cancelable: true }));
  assert.deepEqual(plain(app.calendarRequests.at(-1).input.calendarIds), ['primary']);
  app.calendarRequests.at(-1).success({ ok: true, settings: { ...settings, calendarIds: ['primary'] }, calendarNames: { primary: 'Work' } }); await flush();
  assert.equal(holidays.isConnected, true);
  holidays.click();
  assert.equal(holidays.checked, true);
  app.document.querySelector('.calendar-choices-heading button').click();
  app.calendarRequests.at(-1).success({ ok: true, calendars: [{ id: 'primary', name: 'New work name' }] }); await flush();
  assert.equal(app.document.querySelectorAll('.calendar-choices input:checked').length, 2);
  assert.match(app.document.querySelector('.calendar-choices').textContent, /Holidays/);
});
