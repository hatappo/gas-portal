import { createCell, mountView } from './view';
import CalendarHost from './CalendarHost.svelte';
import { createCalendarPanelMotion } from './calendar-panel-motion';
import { calendarErrorText, type CalendarViewState, type CalendarCommands } from './calendar-types';
/** Bounded RPCs, without logging upstream responses or exposing authorization tokens. */
function rpc<T>(send: (runner: GasRunner) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('REQUEST_FAILED')), 30000);
    try {
      send(
        google.script.run
          .withSuccessHandler((response: T) => {
            clearTimeout(timer);
            resolve(response);
          })
          .withFailureHandler(() => {
            clearTimeout(timer);
            reject(new Error('REQUEST_FAILED'));
          }),
      );
    } catch {
      clearTimeout(timer);
      reject(new Error('REQUEST_FAILED'));
    }
  });
}
function validSnapshot(value: unknown): value is CalendarSnapshot & { ok: true } {
  const v = value as CalendarSnapshot & { ok: boolean };
  return Boolean(
    v?.ok &&
    typeof v.date === 'string' &&
    typeof v.timeZone === 'string' &&
    Number.isFinite(v.dayStart) &&
    Number.isFinite(v.dayEnd) &&
    v.dayEnd > v.dayStart &&
    Number.isFinite(v.fetchedAt) &&
    Array.isArray(v.notices) &&
    v.notices.every((s) => typeof s === 'string') &&
    Array.isArray(v.events) &&
    v.events.length <= 5000 &&
    v.events.every(
      (e) =>
        e &&
        ['id', 'calendarId', 'calendarName', 'title', 'url', 'meetingUrl', 'color'].every(
          (key) => typeof e[key as keyof CalendarEvent] === 'string',
        ) &&
        Number.isFinite(e.start) &&
        Number.isFinite(e.end) &&
        e.end > e.start &&
        /^#[a-f0-9]{6}$/i.test(e.color) &&
        typeof e.allDay === 'boolean' &&
        typeof e.busy === 'boolean' &&
        (!e.url ||
          /^https:\/\/(?:calendar\.google\.com\/|(?:www\.)?google\.com\/calendar[/?])/.test(
            e.url,
          )) &&
        (!e.meetingUrl || /^https:\/\/meet\.google\.com\/[a-z0-9-]+(?:[?#]|$)/.test(e.meetingUrl)),
    ),
  );
}
export function initializeCalendar() {
  const panel = document.getElementById('calendar-panel')!;
  const panelMotion = createCalendarPanelMotion(panel);
  const [model, publish] = createCell<CalendarViewState>({
    settings: PortalCalendar.defaults(),
    initialized: false,
    busy: false,
    saving: false,
    error: '',
    settingsError: '',
    choicesError: '',
    saved: false,
    calendarNames: {},
    calendars: [],
    choicesBusy: false,
    open: false,
    now: Date.now(),
    language: document.documentElement.lang,
  });
  let state = model();
  function setState(patch: Partial<CalendarViewState>): void;
  function setState<K extends keyof CalendarViewState>(key: K, value: CalendarViewState[K], animatePanel?: boolean): void;
  function setState(
    key: Partial<CalendarViewState> | keyof CalendarViewState,
    value?: CalendarViewState[keyof CalendarViewState],
    animatePanel = false,
  ) {
    const wasOpen = state.open;
    state = { ...state, ...(typeof key === 'string' ? { [key]: value } : key) };
    publish(state);
    if (state.open !== wasOpen) panelMotion.setOpen(state.open, animatePanel);
  }
  const [draft, setDraft] = createCell<CalendarSettings>(PortalCalendar.defaults());
  let generation = 0,
    retryAt = 0,
    initializing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const errorText = (code: string) => calendarErrorText(code, state.language);
  const rememberedOpen = () => {
    try {
      const saved = localStorage.getItem('portal-calendar-open');
      return saved !== 'false';
    } catch {
      return true;
    }
  };
  async function load(force = false) {
    if (state.busy || !state.initialized || document.hidden) return;
    const request = ++generation;
    setState({ busy: true, error: '' });
    try {
      const response = await rpc<CalendarSnapshot & { ok: boolean; error?: string }>((runner) =>
        runner.getCalendarEvents(force, zone()),
      );
      if (request !== generation) return;
      if (!validSnapshot(response)) throw new Error(response?.error || 'REQUEST_FAILED');
      if (
        response.date !== PortalCalendar.dateKey(Date.now(), zone()) ||
        response.timeZone !== zone()
      ) {
        setState('snapshot', undefined);
        retryAt = Date.now();
        return;
      }
      setState('snapshot', response);
      retryAt = Date.now() + (response.notices.length ? 60000 : 0);
    } catch (error) {
      if (request !== generation) return;
      setState({
        snapshot: undefined,
        error: errorText(error instanceof Error ? error.message : ''),
      });
      retryAt = Date.now() + 60000;
    } finally {
      if (request === generation) {
        setState('busy', false);
        schedule();
      }
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;
    const now = Date.now();
    let next = now + 60000;
    let nextStart = Infinity;
    for (const event of state.snapshot?.events || []) {
      for (const boundary of [
        event.start,
        event.end,
        event.start - state.settings.alertMinutes * 60000,
      ])
        if (boundary > now) next = Math.min(next, boundary);
      if (!event.allDay && event.start > now) nextStart = Math.min(nextStart, event.start);
    }
    if (nextStart - now <= state.settings.alertMinutes * 60000) {
      // Reuse this timer for each countdown minute; no separate polling or RPC.
      const minutes = Math.ceil((nextStart - now) / 60000);
      next = Math.min(next, nextStart - (minutes - 1) * 60000);
    }
    timer = setTimeout(tick, Math.max(100, next - now));
  }
  function tick() {
    setState('now', Date.now());
    const snapshot = state.snapshot;
    if (
      snapshot &&
      (snapshot.date !== PortalCalendar.dateKey(state.now, zone()) || snapshot.timeZone !== zone())
    )
      setState('snapshot', undefined);
    if (
      state.open &&
      state.initialized &&
      !state.busy &&
      state.now >= retryAt &&
      (!state.snapshot ||
        state.snapshot.notices.length > 0 ||
        state.now - state.snapshot.fetchedAt >= (state.settings.cacheSeconds || 300) * 1000)
    )
      void load();
    schedule();
  }
  async function initialize() {
    if (initializing) return;
    initializing = true;
    setState({ busy: true, settingsError: '', error: '' });
    try {
      const response = await rpc<{
        ok: boolean;
        settings: CalendarSettings;
        calendarNames?: Record<string, string>;
      }>((runner) => runner.getCalendarSettings());
      if (!response?.ok || !PortalCalendar.validSettings(response.settings)) throw new Error();
      const calendarNames = PortalCalendar.names(
        response.calendarNames,
        response.settings.calendarIds,
      );
      const calendars = response.settings.calendarIds.map((id) => ({
        id,
        name: Object.prototype.hasOwnProperty.call(calendarNames, id) ? calendarNames[id] : '',
        color: '#64748b',
        primary: id === 'primary',
      }));
      setState({
        calendarNames,
        calendars,
        settings: response.settings,
        initialized: true,
        settingsError: '',
        error: '',
        open: state.open || rememberedOpen(),
      });
      setDraft({ ...response.settings, calendarIds: [...response.settings.calendarIds] });
    } catch {
      setState({ error: errorText(''), settingsError: errorText('') });
    } finally {
      initializing = false;
      setState('busy', false);
      if (state.initialized) tick();
    }
  }
  const commands: CalendarCommands = {
    toggle(open) {
      setState('open', open, true);
      try {
        localStorage.setItem('portal-calendar-open', String(open));
      } catch {
        /* Optional UI preference. */
      }
      if (open) {
        if (!state.initialized) void initialize();
        else tick();
      } else document.getElementById('toggle-calendar')?.focus();
    },
    refresh() {
      if (!state.initialized) void initialize();
      else void load(true);
    },
    async loadChoices() {
      if (state.choicesBusy) return;
      setState({ choicesBusy: true, choicesError: '' });
      try {
        const response = await rpc<{ ok: boolean; calendars: CalendarChoice[]; error?: string }>(
          (runner) => runner.getCalendarChoices(),
        );
        if (
          !response?.ok ||
          !Array.isArray(response.calendars) ||
          !response.calendars.every((c) => typeof c.id === 'string' && typeof c.name === 'string')
        )
          throw new Error(response?.error);
        // Choices outlive checkbox selection and saves during this page session.
        const calendars = new Map(state.calendars.map((calendar) => [calendar.id, calendar]));
        for (const calendar of response.calendars) calendars.set(calendar.id, calendar);
        setState('calendars', [...calendars.values()]);
      } catch (error) {
        setState('choicesError', errorText(error instanceof Error ? error.message : ''));
      } finally {
        setState('choicesBusy', false);
      }
    },
    async save(settings) {
      if (state.saving) return;
      setState('saved', false);
      if (!PortalCalendar.validSettings(settings)) {
        setState('settingsError', errorText('INVALID_INPUT'));
        return;
      }
      setState({ saving: true, settingsError: '' });
      try {
        const response = await rpc<{
          ok: boolean;
          settings: CalendarSettings;
          calendarNames?: Record<string, string>;
          error?: string;
        }>((runner) =>
          runner.saveCalendarSettings(
            settings,
            PortalCalendar.names(
              {
                ...state.calendarNames,
                ...Object.fromEntries(state.calendars.map((c) => [c.id, c.name])),
              },
              settings.calendarIds,
            ),
          ),
        );
        if (!response?.ok || !PortalCalendar.validSettings(response.settings))
          throw new Error(response?.error);
        generation++;
        retryAt = 0;
        setState({
          calendarNames: PortalCalendar.names(
            response.calendarNames,
            response.settings.calendarIds,
          ),
          settings: response.settings,
          snapshot: undefined,
          busy: false,
          error: '',
          settingsError: '',
          saved: true,
          open: rememberedOpen(),
        });
        setDraft({ ...response.settings, calendarIds: [...response.settings.calendarIds] });
        tick();
      } catch (error) {
        setState('settingsError', errorText(error instanceof Error ? error.message : ''));
      } finally {
        setState('saving', false);
      }
    },
  };
  mountView(CalendarHost, document.getElementById('calendar-toggle-host')!, {
    model,
    draft,
    setDraft,
    commands,
    part: 'toggle',
  });
  mountView(CalendarHost, panel, { model, draft, setDraft, commands, part: 'panel' });
  mountView(CalendarHost, document.getElementById('calendar-settings-host')!, {
    model,
    draft,
    setDraft,
    commands,
    part: 'settings',
  });
  document.addEventListener('portal:languagechange', () =>
    setState('language', document.documentElement.lang),
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else tick();
  });
  window.addEventListener('focus', tick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.open && panel.contains(document.activeElement))
      commands.toggle(false);
  });
  void initialize();
  return { tick };
}
