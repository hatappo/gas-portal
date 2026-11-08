/** Offline-only Calendar fixtures. No Google requests or credentials. */
export function createCalendarPreview(scenario) {
  let settings = { ...PortalCalendar.defaults(), alertMinutes: scenario === 'pulse' ? 3 : 0 };
  try { const saved = JSON.parse(localStorage.getItem('portal-preview-calendar') || 'null'); if (saved) settings = PortalCalendar.restoreSettings(saved); } catch { /* Optional preview settings. */ }
  const choices = [{ id: 'primary', name: 'Work calendar', primary: true, color: '#3b82f6' }, { id: 'personal', name: 'Personal', primary: false, color: '#14b8a6' }];
  let calendarNames = {};
  try { calendarNames = PortalCalendar.names(JSON.parse(localStorage.getItem('portal-preview-calendar-names') || '{}'), settings.calendarIds); } catch { /* Optional display names. */ }
  const saveNames = names => {
    calendarNames = PortalCalendar.names({ ...calendarNames, ...names }, settings.calendarIds);
    try { localStorage.setItem('portal-preview-calendar-names', JSON.stringify(calendarNames)); } catch { /* Optional storage. */ }
  };
  let snapshot;
  return {
    getCalendarSettings() { setTimeout(() => this.success({ ok: true, settings, calendarNames }), 120); },
    saveCalendarSettings(value, names) {
      if (!PortalCalendar.validSettings(value)) return setTimeout(() => this.success({ ok: false, error: 'INVALID_INPUT' }), 150);
      settings = { ...value, calendarIds: [...value.calendarIds] }; snapshot = undefined;
      saveNames(PortalCalendar.names(names, settings.calendarIds));
      try { localStorage.setItem('portal-preview-calendar', JSON.stringify(settings)); } catch { /* Optional storage. */ }
      setTimeout(() => this.success({ ok: true, settings, calendarNames }), 150);
    },
    getCalendarChoices() {
      setTimeout(() => {
        if (scenario === 'unauthorized') return this.success({ ok: false, error: 'AUTHORIZATION_REQUIRED' });
        saveNames(Object.fromEntries(choices.map(c => [c.id, c.name])));
        this.success({ ok: true, calendars: choices });
      }, 180);
    },
    getCalendarEvents(force, timeZone) {
      setTimeout(() => {
        if (scenario === 'error' || scenario === 'unauthorized') return this.success({ ok: false, error: scenario === 'error' ? 'REQUEST_FAILED' : 'AUTHORIZATION_REQUIRED' });
        const now = Date.now(), day = PortalCalendar.day(now, timeZone);
        if (!force && settings.cacheSeconds && snapshot?.timeZone === timeZone && snapshot.date === day.date && now - snapshot.fetchedAt < settings.cacheSeconds * 1000) return this.success({ ok: true, ...snapshot, cached: true });
        const minute = 60000, anchor = Math.floor(now / minute) * minute;
        const event = (id, offset, duration, title, color, calendarId = 'primary') => ({ id, calendarId, calendarName: calendarId === 'primary' ? 'Work calendar' : 'Personal', title, start: anchor + offset * minute, end: anchor + (offset + duration) * minute, allDay: false, busy: true, color, url: 'https://calendar.google.com/calendar/u/0/r/day', meetingUrl: 'https://meet.google.com/abc-defg-hij' });
        const events = [
          event('morning', -160, 30, 'Morning planning and checking project milestones', '#a855f7'),
          event('review', -110, 45, 'Design review: onboarding and the next release', '#e8793c'),
          event('current', -20, 45, 'Team discussion: planning the next iteration and reviewing open questions', '#3b82f6'),
          event('next', scenario === 'pulse' ? 2 : scenario === 'alert' ? 4 : 40, 30, 'Project check-in with the design team', '#14b8a6'),
          event('later-1', 100, 45, 'Focus time: write the implementation proposal', '#a855f7'),
          event('later-2', 165, 25, 'Catch up with the support team', '#e8793c'),
          event('personal', 210, 30, 'Personal appointment', '#14b8a6', 'personal'),
          { ...event('all-day', 0, 1, 'Release week', '#64748b'), start: day.start, end: day.end, allDay: true, busy: scenario === 'all-day', meetingUrl: '' },
        ];
        for (const [index, title] of ['Project milestone', 'Team focus day', 'Planning week'].entries()) events.push({ ...events[events.length - 1], id: 'all-day-' + index, title });
        if (scenario === 'overlap') events.push(event('overlap', -5, 50, 'Overlapping appointment', '#ec4899'));
        snapshot = { enabled: true, date: day.date, timeZone, dayStart: day.start, dayEnd: day.end, events: scenario !== 'empty' ? events.filter(e => settings.calendarIds.includes(e.calendarId) && e.end > day.start && e.start < day.end) : [], notices: scenario === 'partial' ? ['personal: FORBIDDEN'] : [], fetchedAt: now, cached: false };
        this.success({ ok: true, ...snapshot });
      }, 300);
    },
  };
}
