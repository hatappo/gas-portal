import { ServiceLogo } from './service-logo';
import { For, Show, createMemo, createSignal, createEffect, onCleanup, type Accessor, type JSX } from 'solid-js';
import { Hint } from './ui';
import { SegmentedControl } from '@kobalte/core/segmented-control';

export interface CalendarViewState {
  settings: CalendarSettings; initialized: boolean; busy: boolean; saving: boolean;
  error: string; settingsError: string; choicesError: string; saved: boolean; snapshot?: CalendarSnapshot;
  calendarNames: Record<string, string>; calendars: CalendarChoice[]; choicesBusy: boolean; open: boolean; now: number; language: string;
}
export interface CalendarCommands {
  toggle(open: boolean): void; refresh(): void; loadChoices(): void;
  save(settings: CalendarSettings): void;
}
const HOVER_OPEN_DELAY = 180;
const tr = (key: string, language: string, values = {}) => PortalI18n.t(key, language, values);
export function calendarErrorText(code: string, language: string) {
  const key = code === 'AUTHORIZATION_REQUIRED' ? 'Calendar authorization is required. Run authorizePortal in the GAS editor and grant access.'
    : code === 'FORBIDDEN' ? 'Calendar access was denied. Check calendar permissions and enable the Calendar API in your Cloud project if needed.'
    : code === 'INVALID_INPUT' ? 'Select between one and five calendars.'
    : code === 'RATE_LIMITED' ? 'Calendar rate limit reached. Try again later.' : 'Could not load the calendar. Try again.';
  return tr(key, language);
}
export function CalendarIcon() { return document.querySelector<HTMLTemplateElement>('#calendar-icon')!.content.cloneNode(true); }
function PinIcon(props: { off?: boolean }) { return document.querySelector<HTMLTemplateElement>(props.off ? '#calendar-pin-off-icon' : '#calendar-pin-icon')!.content.cloneNode(true); }
function RefreshIcon() { return document.querySelector<HTMLTemplateElement>('#calendar-refresh-icon')!.content.cloneNode(true); }
function SilenceIcon() { return document.querySelector<HTMLTemplateElement>('#calendar-silence-icon')!.content.cloneNode(true); }
function CloseIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>; }
function ChangingTime(props: { text: string }) {
  let element!: HTMLSpanElement;
  let previous: string | undefined, animation: Animation | undefined;
  createEffect(() => {
    const value = props.text;
    if (previous !== undefined && previous !== value) {
      animation?.cancel();
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && element.animate) animation = element.animate([
        { transform: 'translateX(0)', opacity: 1 },
        { transform: 'translateX(-2px) skewX(-9deg)', opacity: .65, textShadow: '2px 0 currentColor', offset: .15 },
        { transform: 'translateX(2px) skewX(7deg)', opacity: 1, textShadow: '-2px 0 currentColor', offset: .35 },
        { transform: 'translateX(-1px)', opacity: .8, offset: .55 },
        { transform: 'none', opacity: 1, textShadow: 'none' },
      ], { duration: 320, easing: 'steps(1, end)' });
    }
    previous = value;
  });
  onCleanup(() => animation?.cancel());
  return <span ref={node => { element = node; }} class="calendar-changing-time">{props.text}</span>;
}
function EventRow(props: { slot: CalendarSlot; state: string; expanded: boolean; approaching: boolean; silenced: boolean; silence(): void; showEnd: boolean; now: number; language: string; zone: string; enter(immediate?: boolean): void; leave(): void; toggle(expanded?: boolean): void }) {
  const activeReminder = () => props.approaching && !props.silenced;
  const current = () => props.state === 'current' && !props.slot.gap;
  const remaining = () => Math.max(1, Math.ceil(((props.slot.event?.end ?? props.slot.end) - props.now) / 60000));
  const remainingText = () => tr('{minutes} min remaining', props.language, { minutes: remaining() });
  const remainingMinutes = () => Math.max(1, Math.ceil((props.slot.start - props.now) / 60000));
  const title = () => props.slot.gap ? tr('Free time', props.language) : props.slot.event?.title || tr('Busy', props.language);
  const start = () => new Intl.DateTimeFormat(props.language, { timeZone: props.zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(props.slot.start);
  const end = () => {
    const value = props.slot.event?.end ?? props.slot.end;
    const anotherDay = PortalCalendar.dateKey(value, props.zone) !== PortalCalendar.dateKey(props.slot.start, props.zone);
    return new Intl.DateTimeFormat(props.language, { timeZone: props.zone, ...(anotherDay ? { month: 'numeric', day: 'numeric' } as const : {}), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
  };
  const minutes = () => Math.round((props.slot.end - props.slot.start) / 60000);
  const timeText = (duration: string) => start() + ' \u00b7 ' + duration + (props.showEnd ? ' ~ ' + end() : '');
  const time = () => timeText(minutes() + '′');
  const label = () => timeText(tr('{minutes} min', props.language, { minutes: minutes() })) + ' \u00b7 ' + title() + (current() ? ' · ' + remainingText() : '');
  const progress = () => {
    const event = props.slot.event;
    return event ? Math.max(0, Math.min(100, (props.now - event.start) / (event.end - event.start) * 100)).toFixed(2) + '%' : '0%';
  };
  let row!: HTMLLIElement;
  let pointerExpanded = false;
  return <li ref={element => { row = element; }} class="calendar-event" classList={{ 'is-gap': props.slot.gap, 'is-approaching': activeReminder() }} data-reminder-active={activeReminder()} data-state={props.state} data-expanded={props.expanded} data-last={props.showEnd}
    style={{ '--event-color': props.slot.event?.color || 'var(--color-base-content)', '--event-progress': progress() }}
    onPointerEnter={event => { if (event.pointerType !== 'touch') props.enter(); }} onPointerLeave={props.leave}
    onFocusIn={() => props.enter(true)} onFocusOut={event => { if (!row.contains(event.relatedTarget as Node)) props.leave(); }}>
    <Show when={current() && props.expanded}><span class="calendar-remaining-label" lang={props.language} aria-hidden="true"><ChangingTime text={tr("{minutes}′ left", props.language, { minutes: remaining() })}/></span></Show>
    <button type="button" class="calendar-event-trigger" aria-label={label()} aria-expanded={props.expanded} onPointerDown={() => { pointerExpanded = props.expanded; }} onClick={event => props.toggle(event.detail > 0 ? !pointerExpanded : undefined)} title={current() ? title() + ' · ' + remainingText() : title()}>
      <span class="calendar-event-copy"><span class="calendar-event-time">{time()}</span><span class="calendar-event-title"> · {title()}</span></span>
    </button>
    <div class="calendar-event-detail" aria-hidden={!props.expanded} inert={!props.expanded ? true : undefined}>
      <div><Show when={props.slot.event} fallback={<span>{tr('No scheduled events.', props.language)}</span>}>{event => <>
        <span class="calendar-source">{event().calendarName}</span>
        <Show when={event().url}><a class="link" href={event().url} target="_blank" rel="noopener noreferrer" tabindex={props.expanded ? 0 : -1}>{tr('Open event', props.language)}</a></Show>
        <Show when={event().meetingUrl}><a class="link" href={event().meetingUrl} target="_blank" rel="noopener noreferrer" tabindex={props.expanded ? 0 : -1}>{tr('Join meeting', props.language)}</a></Show>
      </>}</Show></div>
    </div>
    <Show when={props.state === 'next' && !props.slot.gap}><span class="calendar-next-badge" classList={{ 'is-approaching': props.approaching }} lang={props.language} aria-label={props.approaching ? tr("Starts in {minutes} min", props.language, { minutes: remainingMinutes() }) : tr("Next", props.language)}><ChangingTime text={props.approaching ? tr("In {minutes}′", props.language, { minutes: remainingMinutes() }) : tr("Next", props.language)}/></span></Show>
    <Show when={activeReminder()}><button type="button" class="calendar-silence btn btn-ghost btn-square" title={tr('Silence this reminder', props.language)} aria-label={tr('Silence this reminder', props.language)} onClick={() => {
      props.silence();
      row.querySelector<HTMLButtonElement>('.calendar-event-trigger')?.focus({ preventScroll: true });
    }}><SilenceIcon/></button></Show>
  </li>;
}
function AllDayGroup(props: { events: CalendarEvent[]; language: string; browsing: boolean; expandAll: boolean }) {
  const [pinned, setPinned] = createSignal(false);
  const [inspected, setInspected] = createSignal(false);
  createEffect(() => { if (!props.browsing) setInspected(false); });
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal(false);
  const expanded = () => props.expandAll || pinned() || !collapsed() && (hovered() || focused() || props.browsing && inspected());
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(hoverTimer));
  const toggle = () => { clearTimeout(hoverTimer); const wasPinned = pinned(); setPinned(!wasPinned); if (wasPinned) { card.querySelector<HTMLButtonElement>('.calendar-all-day-trigger')?.focus(); setFocused(false); } setCollapsed(wasPinned); };
  const t = (key: string) => tr(key, props.language);
  let card!: HTMLDivElement;
  return <div ref={element => { card = element; }} class="calendar-all-day" data-expanded={expanded()}
    onPointerEnter={event => { if (event.pointerType !== 'touch') { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => { setHovered(true); setInspected(true); setCollapsed(false); }, HOVER_OPEN_DELAY); } }} onPointerLeave={() => { clearTimeout(hoverTimer); setHovered(false); }}
    onFocusIn={event => { if (!card.contains(event.relatedTarget as Node)) { clearTimeout(hoverTimer); setFocused(true); setCollapsed(false); } }}
    onFocusOut={event => { if (!card.contains(event.relatedTarget as Node)) setFocused(false); }}>
    <div class="calendar-all-day-heading">
      <button type="button" class="calendar-all-day-trigger" disabled={props.expandAll} aria-expanded={expanded()} aria-controls="calendar-all-day-content" onClick={toggle}><span lang="en">All-day events</span> &#183; {props.events.length}</button>
      <button type="button" class="calendar-all-day-pin" hidden={!expanded() || props.expandAll} aria-pressed={pinned()} aria-label={t('Keep all-day events expanded')} title={t(pinned() ? 'Collapse all-day events' : 'Keep all-day events expanded')} onClick={toggle}><Show when={pinned()} fallback={<PinIcon/>}><PinIcon off/></Show></button>
    </div>
    <div id="calendar-all-day-content" class="calendar-all-day-body" aria-hidden={!expanded()} inert={!expanded() ? true : undefined}>
      <div><For each={props.events}>{event => <a class="calendar-all-day-item link link-hover" href={event.url || undefined} target={event.url ? '_blank' : undefined} rel="noopener noreferrer" tabindex={expanded() ? undefined : -1} style={{ '--event-color': event.color }} title={event.title || t('Busy')}>{event.title || t('Busy')}</a>}</For></div>
    </div>
  </div>;
}
export function CalendarPanel(props: { state: CalendarViewState; commands: CalendarCommands }) {
  const [expanded, setExpanded] = createSignal('');
  const [silenced, setSilenced] = createSignal<Set<string>>(new Set());
  const reminderKey = (slot: CalendarSlot) => JSON.stringify([slot.id, slot.event?.start ?? slot.start]);
  const date = createMemo(() => props.state.snapshot?.date);
  let reminderDate: string | undefined;
  createEffect(() => {
    const value = date();
    if (value && value !== reminderDate) { reminderDate = value; setSilenced(new Set<string>()); }
  });
  const [browsingPast, setBrowsingPast] = createSignal(false);
  const [inspectedPast, setInspectedPast] = createSignal<Set<string>>(new Set());
  let inspectionTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelInspectionTimer = () => { clearTimeout(inspectionTimer); inspectionTimer = undefined; };
  onCleanup(cancelInspectionTimer);
  const finishInspection = () => { cancelInspectionTimer(); setBrowsingPast(false); setInspectedPast(new Set<string>()); };
  let schedule!: HTMLDivElement;
  const inspectPast = (target: EventTarget | null, immediate = false) => {
    if (!(target instanceof Element)) return;
    const row = target.closest('.calendar-all-day, .calendar-event');
    if (!row) { cancelInspectionTimer(); return; }
    if (row.matches('.calendar-all-day, [data-state="past"]')) {
      if (immediate) { cancelInspectionTimer(); setBrowsingPast(true); }
      else if (!browsingPast() && inspectionTimer === undefined) inspectionTimer = setTimeout(() => { inspectionTimer = undefined; setBrowsingPast(true); }, HOVER_OPEN_DELAY);
    } else finishInspection();
  };
  const [filter, setFilter] = createSignal<'nearby' | 'free' | 'all'>('nearby');
  const filters = [{ id: 'nearby', label: 'Nearby' }, { id: 'free', label: 'Free' }, { id: 'all', label: 'All' }] as const;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  const select = (id: string, delay = HOVER_OPEN_DELAY) => {
    clearTimeout(hoverTimer);
    const apply = () => { setExpanded(id); if (slots().some(slot => slot.id === id && slot.end <= props.state.now)) setInspectedPast(previous => new Set([...previous, id])); };
    if (delay === 0) apply(); else hoverTimer = setTimeout(apply, delay);
  };
  onCleanup(() => clearTimeout(hoverTimer));
  const slots = createMemo(() => {
    const data = props.state.snapshot;
    return data ? PortalCalendar.slots(data.events, data.dayStart, data.dayEnd, !data.notices.length) : [];
  });
  const lastEvent = createMemo(() => slots().filter(slot => !slot.gap).reduce<CalendarSlot | undefined>((last, slot) => !last || (slot.event?.end ?? slot.end) >= (last.event?.end ?? last.end) ? slot : last, undefined));
  const allDay = () => props.state.snapshot?.events.filter(event => event.allDay) || [];
  const zone = () => props.state.snapshot?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const t = (key: string, values = {}) => tr(key, props.state.language, values);
  return <>

    <div class="calendar-panel-controls">
      <SegmentedControl class="calendar-display-filters segmented-control join" name="calendar-display" orientation="horizontal" aria-label={t('Schedule display')} value={filter()}
        onChange={value => { if (value === 'nearby' || value === 'free' || value === 'all') { clearTimeout(hoverTimer); finishInspection(); setExpanded(''); setFilter(value); } }}>
        <For each={filters}>{option => <SegmentedControl.Item as="label" value={option.id} class="btn btn-sm join-item"><SegmentedControl.ItemInput aria-label={t(option.label)}/>{t(option.label)}</SegmentedControl.Item>}</For>
      </SegmentedControl>
      <Hint text={t('Fetch latest')}>{attributes => <button {...attributes as JSX.ButtonHTMLAttributes<HTMLButtonElement>} type="button" class="refresh-catalog btn btn-ghost" disabled={props.state.busy} aria-busy={props.state.busy} aria-label={t('Fetch latest')} onClick={props.commands.refresh}>
        <RefreshIcon/><Show when={props.state.snapshot}><span class="catalog-freshness">{t('Retrieved {time}', { time: new Intl.DateTimeFormat(props.state.language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(props.state.snapshot!.fetchedAt) })}</span></Show>
      </button>}</Hint>
      <button type="button" class="calendar-panel-close btn btn-ghost btn-square btn-sm" aria-label={t('Close calendar')} onClick={() => props.commands.toggle(false)}><CloseIcon/></button>
    </div>

    <Show when={props.state.error}><p class="calendar-notice alert alert-error alert-soft" role="alert">{props.state.error}</p></Show>
    <Show when={props.state.snapshot}>
      <Show when={props.state.snapshot!.notices.length}><p class="calendar-notice alert alert-warning alert-soft" role="status">{t('Some calendars could not be loaded. Free-time blocks are hidden.')}<br/>{[...new Set(props.state.snapshot!.notices.map(notice => calendarErrorText(notice.split(': ').pop() || '', props.state.language)))].join(' ')}</p></Show>
      <div ref={element => { schedule = element; }} class="calendar-schedule" data-filter={filter()} data-browsing-past={browsingPast()}
        onPointerOver={event => { if (event.pointerType !== 'touch') inspectPast(event.target); }}
        onPointerLeave={() => { if (!schedule.contains(document.activeElement) || !document.activeElement?.matches(':focus-visible')) finishInspection(); }}
        onFocusIn={event => inspectPast(event.target, true)} onFocusOut={event => { if (!schedule.contains(event.relatedTarget as Node)) finishInspection(); }}>
      <Show when={allDay().length}><AllDayGroup events={allDay()} language={props.state.language} browsing={browsingPast()} expandAll={filter() === 'all'}/></Show>
      <ol class="calendar-timeline"><For each={slots()}>{slot => {
        const status = () => PortalCalendar.state(slot, slots(), props.state.now);
        const permanent = () => filter() === 'all' || (filter() === 'free' ? slot.gap : !slot.gap && ['current', 'next'].includes(status()));
        return <EventRow silenced={silenced().has(reminderKey(slot))} silence={() => setSilenced(previous => new Set([...previous, reminderKey(slot)]))} slot={slot} now={props.state.now} state={status()} showEnd={slot.id === lastEvent()?.id} approaching={status() === 'next' && props.state.settings.alertMinutes > 0 && slot.start - props.state.now <= props.state.settings.alertMinutes * 60000} expanded={permanent() || expanded() === slot.id || browsingPast() && inspectedPast().has(slot.id)} language={props.state.language} zone={zone()}
          enter={immediate => select(slot.id, immediate ? 0 : HOVER_OPEN_DELAY)} leave={() => select('', 180)} toggle={open => { clearTimeout(hoverTimer); setExpanded((open ?? expanded() !== slot.id) ? slot.id : ''); }}/>;
      }}</For></ol>
      </div>
      <Show when={!slots().length && !allDay().length && !props.state.snapshot!.notices.length}><p class="settings-help">{t('No events today.')}</p></Show>
    </Show>
  </>;
}
export function CalendarSettingsForm(props: { state: CalendarViewState; draft: Accessor<CalendarSettings>; change: (settings: CalendarSettings) => void; commands: CalendarCommands }) {
  const t = (key: string) => tr(key, props.state.language);
  const [showSample, setShowSample] = createSignal(false);
  const [sampleSilenced, setSampleSilenced] = createSignal(false);
  const sampleMinutes = () => props.draft().alertMinutes || 3;
  const sampleSlot = (): CalendarSlot => {
    const start = props.state.now + sampleMinutes() * 60000;
    return { id: 'sample', start, end: start + 1800000, gap: false, event: { id: 'sample', calendarId: 'sample', calendarName: t('Sample'), title: t('Sample event'), start, end: start + 1800000, allDay: false, busy: true, color: '#38a1db', url: '', meetingUrl: '' } };
  };
  const change = (patch: Partial<CalendarSettings>) => props.change({ ...props.draft(), ...patch });
  return <section class="calendar-settings"><h2><ServiceLogo service="calendar" label="Google Calendar" decorative/>Google Calendar</h2><p class="settings-help">{t('Show today’s schedule in a side panel using the Google account running this app. Calendar access is read-only.')}</p>
    <Show when={!props.state.initialized && props.state.settingsError}><p class="calendar-notice alert alert-error alert-soft" role="alert">{props.state.settingsError}</p><button type="button" class="btn btn-ghost btn-sm" disabled={props.state.busy} onClick={props.commands.refresh}>{t('Fetch latest')}</button></Show>
    <form onSubmit={event => { event.preventDefault(); props.commands.save(props.draft()); }}>
      <fieldset disabled={props.state.saving || !props.state.initialized}>
        <div class="calendar-choices-heading"><span>{t('Calendars (up to 5)')}</span><button type="button" class="btn btn-ghost btn-sm" disabled={props.state.choicesBusy} aria-describedby={props.state.choicesError ? "calendar-choices-error" : undefined} onClick={props.commands.loadChoices}>{t('Load calendars')}</button></div>
        <Show when={props.state.choicesError}><p id="calendar-choices-error" class="calendar-notice alert alert-error alert-soft" role="alert">{props.state.choicesError}</p></Show>
        <div class="calendar-choices" aria-busy={!props.state.initialized && props.state.busy || props.state.choicesBusy}><For each={props.state.calendars}>{calendar => <label><input type="checkbox" class="checkbox checkbox-sm" checked={props.draft().calendarIds.includes(calendar.id)} onChange={event => change({ calendarIds: event.currentTarget.checked ? [...props.draft().calendarIds, calendar.id] : props.draft().calendarIds.filter(id => id !== calendar.id) })}/><span>{calendar.name || calendar.id}</span></label>}</For></div>
        <label class="settings-field"><span id="calendar-cache-label">{t('Calendar cache duration')}</span><select class="select" aria-labelledby="calendar-cache-label" value={props.draft().cacheSeconds} onChange={event => change({ cacheSeconds: Number(event.currentTarget.value) })}><For each={PortalCacheDurations.actions.choices}>{seconds => <option value={seconds}>{t(PortalCacheDurations.label('actions', seconds))}</option>}</For></select></label>
        <div class="calendar-notice-setting">
          <div class="calendar-notice-heading"><label id="calendar-alert-label" for="calendar-alert-select">{t('Upcoming-event notice')}</label><button type="button" class="btn btn-ghost btn-sm" aria-expanded={showSample()} aria-controls="calendar-notice-sample" onClick={() => { setSampleSilenced(false); setShowSample(!showSample()); }}>{t('Preview notice')}</button></div>
          <select id="calendar-alert-select" class="select" aria-labelledby="calendar-alert-label" value={props.draft().alertMinutes} onChange={event => change({ alertMinutes: Number(event.currentTarget.value) })}><For each={[0, 1, 2, 3, 5, 10, 15]}>{minutes => <option value={minutes}>{minutes ? tr('{minutes} minutes before', props.state.language, { minutes }) : t('Disabled')}</option>}</For></select>
          <Show when={showSample()}><div id="calendar-notice-sample" class="calendar-notice-sample">
            <ol class="calendar-timeline"><EventRow silenced={sampleSilenced()} silence={() => setSampleSilenced(true)} slot={sampleSlot()} state="next" expanded approaching showEnd={false} now={props.state.now} language={props.state.language} zone={Intl.DateTimeFormat().resolvedOptions().timeZone} enter={() => {}} leave={() => {}} toggle={() => {}}/></ol>
          </div></Show>
        </div>
        <p class="settings-help">{t('Notices appear inside the portal while it is open. Browser-local time is used. Hidden tabs and sleeping devices may delay notices.')}</p>
        <button type="submit" class="btn btn-primary">{t('Save changes')}</button>
      </fieldset>
    </form>
    <Show when={props.state.initialized && props.state.settingsError}><p class="calendar-notice alert alert-error alert-soft" role="alert">{props.state.settingsError}</p></Show>
    <Show when={props.state.saved}><p class="settings-form-status" role="status">{t('Saved')}</p></Show>
  </section>;
}
