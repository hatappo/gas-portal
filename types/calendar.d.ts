interface CalendarSettings { calendarIds: string[]; cacheSeconds: number; alertMinutes: number }
interface CalendarChoice { id: string; name: string; color: string; primary: boolean }
interface CalendarEvent { id: string; calendarId: string; calendarName: string; title: string; start: number; end: number; allDay: boolean; busy: boolean; color: string; url: string; meetingUrl: string }
interface CalendarSnapshot { enabled: boolean; date: string; timeZone: string; dayStart: number; dayEnd: number; events: CalendarEvent[]; notices: string[]; fetchedAt: number; cached: boolean }
interface CalendarSlot { id: string; start: number; end: number; gap: boolean; event?: CalendarEvent }
declare var PortalCalendar: {
  names(value: unknown, ids: string[]): Record<string, string>;
  defaults(): CalendarSettings;
  restoreSettings(value: unknown): CalendarSettings;
  validSettings(value: unknown): value is CalendarSettings;
  dateKey(now: number, timeZone: string): string;
  midnight(date: string, timeZone: string): number;
  day(now: number, timeZone: string): {date: string; start: number; end: number};
  slots(events: CalendarEvent[], dayStart: number, dayEnd: number, complete: boolean): CalendarSlot[];
  state(slot: CalendarSlot, slots: CalendarSlot[], now: number): 'past' | 'current' | 'next' | 'future';
};
